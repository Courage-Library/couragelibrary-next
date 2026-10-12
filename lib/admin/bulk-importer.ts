import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AdminService } from "@/services/admin.service";
import { QuestionCsvImporterService } from "@/services/question-factory/question-csv-importer.service";

export interface BulkImportRecord {
  [key: string]: unknown;
}

export interface BulkImportPayload {
  entity: string;
  data: BulkImportRecord[];
  mode?: "preview" | "commit";
}

export interface BulkImportResult {
  success: boolean;
  entity: string;
  totalRecords: number;
  created: number;
  updated: number;
  skipped: number;
  brokenReferencesCount: number;
  errors: string[];
  warnings: string[];
  previewData?: BulkImportRecord[];
}

export class BulkImportEngine {
  /**
   * Main entry point for hierarchical bulk content importation.
   */
  static async processImport(payload: BulkImportPayload): Promise<BulkImportResult> {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin) {
      return {
        success: false,
        entity: payload.entity || "unknown",
        totalRecords: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        brokenReferencesCount: 0,
        errors: ["Unauthorized: Administrative or staff privileges required."],
        warnings: [],
      };
    }

    const { entity, data = [], mode = "preview" } = payload;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        entity,
        totalRecords: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        brokenReferencesCount: 0,
        errors: ["Invalid or empty import dataset provided."],
        warnings: [],
      };
    }

    const supabaseRaw = createAdminServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseRaw as any;

    let created = 0;
    let updated = 0;
    const skipped = 0;
    let brokenReferencesCount = 0;
    const previewData: BulkImportRecord[] = [];

    // Pre-fetch reference maps (read-only) for mock test resolution.
    const [examsRes, patternsRes] = await Promise.all([
      supabase.from("exams").select("id, title, slug"),
      supabase.from("exam_patterns").select("id, name"),
    ]);

    const examMap = new Map<string, string>(); // slug/title -> id
    (examsRes.data || []).forEach((e: { id: string; title: string; slug: string }) => {
      examMap.set(e.slug.toLowerCase(), e.id);
      examMap.set(e.title.toLowerCase(), e.id);
      examMap.set(e.id, e.id);
    });

    const patternMap = new Map<string, string>(); // name/id -> id
    (patternsRes.data || []).forEach((p: { id: string; name: string }) => {
      patternMap.set(p.name.toLowerCase(), p.id);
      patternMap.set(p.id, p.id);
    });

    switch (entity) {
      case "categories":
      case "taxonomy":
      case "exams":
      case "patterns":
      case "sections":
      case "subjects":
      case "topics": {
        // QF-1 (D8): exam structure and taxonomy are owned by Exam Onboarding /
        // curriculum management. Bulk import never creates them.
        errors.push(
          `Bulk import of "${entity}" is disabled. Create exams, cycles, patterns, sections, subjects and topics via Exam Onboarding (/admin/exam-onboarding) or curriculum management.`
        );
        break;
      }

      case "questions": {
        // QF-1 (D8): every row passes the five Question Factory gates and lands as a
        // DRAFT version. Unresolved subject/topic/exam rejects the row; nothing is created.
        if (!authCheck.userId) {
          errors.push("Unauthorized: an authenticated admin actor is required.");
          break;
        }
        const summary = await QuestionCsvImporterService.run({
          rows: data as Record<string, unknown>[],
          mode: mode === "commit" ? "commit" : "dry-run",
          actorId: authCheck.userId,
          supabase,
        });
        created = mode === "commit" ? summary.imported : summary.accepted;
        summary.rows.forEach((r) => {
          if (r.status === "REJECTED") {
            brokenReferencesCount++;
            errors.push(`Row ${r.row}: ${r.errors.join(" ") || "Rejected."}`);
          }
          r.warnings.forEach((w) => warnings.push(`Row ${r.row}: ${w}`));
          if (mode !== "commit") {
            previewData.push({
              row: r.row,
              statement: r.stemPreview,
              status: r.status === "REJECTED" ? "Rejected" : "Accept as DRAFT",
            });
          }
        });
        if (mode === "commit" && summary.imported > 0) {
          warnings.push(`${summary.imported} question(s) saved as DRAFT. Review and publish them in the Question Factory (/admin/questions/factory).`);
        }
        break;
      }

      case "mock_tests": {
        for (const item of data) {
          const title = String(item.title || "");
          const slug = String(item.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
          const durationMinutes = Number(item.duration_minutes || item.duration || 60);
          const totalMarks = Number(item.total_marks || 200);
          const totalQuestions = Number(item.total_questions || 100);
          const categoryRef = String(item.category || item.exam || "");
          const patternRef = String(item.pattern || "");

          if (!title) {
            errors.push("Mock test missing title.");
            continue;
          }

          const categoryId = examMap.get(categoryRef.toLowerCase());
          const patternId = patternMap.get(patternRef.toLowerCase());

          if (mode === "commit") {
            // Find or create template
            let templateId: string | null = null;
            if (categoryId) {
              const { data: tData } = await supabase
                .from("mock_templates")
                .select("id")
                .eq("exam_id", categoryId)
                .maybeSingle();

              if (tData) {
                templateId = tData.id;
              } else {
                const { data: newT } = await supabase
                  .from("mock_templates")
                  .insert({
                    exam_id: categoryId,
                    pattern_id: patternId || null,
                    title: `${title} Template`,
                    slug: `${slug}-template`,
                    test_type: "full_length",
                    is_free: true,
                    is_active: true,
                  })
                  .select("id")
                  .single();
                templateId = newT?.id || null;
              }
            }

            const { data: existingMock } = await supabase.from("mock_tests").select("id").eq("slug", slug).maybeSingle();

            if (existingMock) {
              await supabase.from("mock_tests").update({
                title,
                duration_minutes: durationMinutes,
                total_marks: totalMarks,
                total_questions: totalQuestions,
                status: "published",
              }).eq("id", existingMock.id);
              updated++;
            } else {
              const { error: insErr } = await supabase.from("mock_tests").insert({
                template_id: templateId,
                title,
                slug,
                duration_minutes: durationMinutes,
                total_marks: totalMarks,
                total_questions: totalQuestions,
                status: "published",
              });

              if (insErr) {
                errors.push(`Error inserting mock test ${title}: ${insErr.message}`);
              } else {
                created++;
              }
            }
          } else {
            const isUpdate = Boolean(examMap.get(slug.toLowerCase()));
            if (isUpdate) updated++; else created++;
            previewData.push({ type: "mock_test", title, slug, durationMinutes, totalQuestions, totalMarks, category: categoryRef, pattern: patternRef });
          }
        }
        break;
      }

      default: {
        errors.push(`Unsupported hierarchical import entity type: "${entity}". Supported entities: questions (as DRAFT), mock_tests.`);
        break;
      }
    }

    return {
      success: errors.length === 0,
      entity,
      totalRecords: data.length,
      created,
      updated,
      skipped,
      brokenReferencesCount,
      errors,
      warnings,
      previewData,
    };
  }
}
