import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AdminService } from "@/services/admin.service";

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

    // Pre-fetch reference maps for fast relationship resolution
    const [examsRes, patternsRes, subjectsRes, topicsRes, psecsRes] = await Promise.all([
      supabase.from("exams").select("id, title, slug"),
      supabase.from("exam_patterns").select("id, name, exam_cycle_id, exam_cycles(exam_id)"),
      supabase.from("subjects").select("id, name, slug"),
      supabase.from("topics").select("id, name, slug, subject_id"),
      supabase.from("pattern_sections").select("id, section_name, subject_id, pattern_id"),
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

    const subjectMap = new Map<string, string>(); // slug/name/id -> id
    (subjectsRes.data || []).forEach((s: { id: string; name: string; slug: string }) => {
      subjectMap.set(s.slug.toLowerCase(), s.id);
      subjectMap.set(s.name.toLowerCase(), s.id);
      subjectMap.set(s.id, s.id);
    });

    const psecMap = new Map<string, { id: string; section_name: string; subject_id: string }>();
    (psecsRes.data || []).forEach((ps: { id: string; section_name: string; subject_id: string }) => {
      psecMap.set(ps.id, ps);
    });

    const topicMap = new Map<string, string>(); // scoped (subject_id:name/slug) -> id & global fallback
    (topicsRes.data || []).forEach((t: { id: string; name: string; slug: string; subject_id: string }) => {
      if (t.subject_id) {
        topicMap.set(`${t.subject_id}:${t.slug.toLowerCase()}`, t.id);
        topicMap.set(`${t.subject_id}:${t.name.toLowerCase()}`, t.id);
      }
      topicMap.set(t.slug.toLowerCase(), t.id);
      topicMap.set(t.name.toLowerCase(), t.id);
      topicMap.set(t.id, t.id);
    });

    switch (entity) {
      case "categories":
      case "taxonomy":
      case "exams": {
        for (const item of data) {
          const title = String(item.title || item.name || "");
          const slug = String(item.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
          const category = String(item.category || "Competitive Examination");
          const description = String(item.description || "");

          if (!title || !slug) {
            errors.push(`Category missing title or slug: ${JSON.stringify(item)}`);
            continue;
          }

          const existingId = examMap.get(slug.toLowerCase()) || examMap.get(title.toLowerCase());

          if (mode === "commit") {
            if (existingId) {
              await supabase.from("exams").update({ title, category, description, updated_at: new Date().toISOString() }).eq("id", existingId);
              updated++;
            } else {
              const { data: inserted, error: insErr } = await supabase.from("exams").insert({
                title,
                slug,
                category,
                description,
                is_active: true,
              }).select("id").single();

              if (insErr) {
                errors.push(`Error inserting category ${title}: ${insErr.message}`);
              } else if (inserted) {
                examMap.set(slug.toLowerCase(), inserted.id);
                created++;
              }
            }
          } else {
            if (existingId) updated++; else created++;
            previewData.push({ type: "category", slug, title, category, action: existingId ? "Update" : "Create" });
          }
        }
        break;
      }

      case "patterns": {
        for (const item of data) {
          const name = String(item.name || item.title || "");
          const categoryRef = String(item.category || item.category_slug || item.exam || "");
          const tierName = String(item.tier_name || item.tier || "Tier 1");
          const durationMinutes = Number(item.duration_minutes || item.duration || 60);
          const totalQuestions = Number(item.total_questions || item.questions_count || 100);
          const totalMarks = Number(item.total_marks || 200);
          const negativeMarkValue = Number(item.negative_marking || item.negative_mark_value || 0.5);

          if (!name) {
            errors.push("Pattern missing required name.");
            continue;
          }

          const categoryId = examMap.get(categoryRef.toLowerCase());
          if (!categoryId) {
            brokenReferencesCount++;
            warnings.push(`Pattern "${name}" parent category "${categoryRef}" not found.`);
          }

          const existingId = patternMap.get(name.toLowerCase());

          if (mode === "commit") {
            if (existingId) {
              await supabase.from("exam_patterns").update({
                name,
                tier_name: tierName,
                duration_minutes: durationMinutes,
                total_questions: totalQuestions,
                total_marks: totalMarks,
                negative_mark_value: negativeMarkValue,
              }).eq("id", existingId);
              updated++;
            } else if (categoryId) {
              // Ensure an exam_cycle exists
              let { data: cycle } = await supabase.from("exam_cycles").select("id").eq("exam_id", categoryId).maybeSingle();
              if (!cycle) {
                const { data: newCycle } = await supabase.from("exam_cycles").insert({
                  exam_id: categoryId,
                  cycle_year: 2026,
                  status: "active",
                }).select("id").single();
                cycle = newCycle;
              }

              if (cycle) {
                const { data: ins, error: insErr } = await supabase.from("exam_patterns").insert({
                  exam_cycle_id: cycle.id,
                  name,
                  tier_name: tierName,
                  duration_minutes: durationMinutes,
                  total_questions: totalQuestions,
                  total_marks: totalMarks,
                  negative_mark_value: negativeMarkValue,
                  is_active: true,
                }).select("id").single();

                if (insErr) {
                  errors.push(`Error inserting pattern ${name}: ${insErr.message}`);
                } else if (ins) {
                  patternMap.set(name.toLowerCase(), ins.id);
                  created++;
                }
              }
            }
          } else {
            if (existingId) updated++; else created++;
            previewData.push({ type: "pattern", name, category: categoryRef, totalQuestions, durationMinutes, action: existingId ? "Update" : "Create" });
          }
        }
        break;
      }

      case "sections":
      case "subjects": {
        for (const item of data) {
          const name = String(item.name || item.title || "");
          const slug = String(item.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));

          if (!name) {
            errors.push("Section missing name.");
            continue;
          }

          const existingId = subjectMap.get(slug.toLowerCase()) || subjectMap.get(name.toLowerCase());

          if (mode === "commit") {
            if (existingId) {
              await supabase.from("subjects").update({ name, slug }).eq("id", existingId);
              updated++;
            } else {
              const { data: ins, error: insErr } = await supabase.from("subjects").insert({
                name,
                slug,
                is_active: true,
              }).select("id").single();

              if (insErr) {
                errors.push(`Error inserting section ${name}: ${insErr.message}`);
              } else if (ins) {
                subjectMap.set(slug.toLowerCase(), ins.id);
                created++;
              }
            }
          } else {
            if (existingId) updated++; else created++;
            previewData.push({ type: "section", name, slug, action: existingId ? "Update" : "Create" });
          }
        }
        break;
      }

      case "questions": {
        for (const item of data) {
          const rawPsecId = String(item.pattern_section_id || item.patternSectionId || "").trim();
          const statement = String(item.statement || item.question || item.question_text || item.text || "");
          const categoryRef = String(item.category || item.exam || item.category_id || "");
          const sectionRef = String(item.section || item.subject || item.section_name || "");
          const topicRef = String(item.topic || item.topic_slug || "").trim();
          const difficulty = String(item.difficulty || "medium").toLowerCase();
          const language = String(item.language || "en").toLowerCase() === "hi" ? "hi" : "en";
          const explanation = String(item.explanation || item.solution || "");
          const pyqYear = item.pyq_year ? Number(item.pyq_year) : null;
          const pyqExam = item.pyq_exam ? String(item.pyq_exam) : (categoryRef || null);
          const rawOptions = item.options || item.question_options || [];
          const correctAnswer = String(item.correct_answer || item.correctOption || item.answer || "A").trim().toUpperCase();

          if (!statement) {
            errors.push("Question missing statement text.");
            continue;
          }

          if (!topicRef) {
            errors.push("Question missing topic.");
            continue;
          }

          // Authoritative Subject Resolution
          let targetSubjectId: string | null = null;
          if (rawPsecId) {
            const psec = psecMap.get(rawPsecId);
            if (!psec) {
              errors.push(`pattern_section_id "${rawPsecId}" not found in pattern_sections.`);
              continue;
            }
            targetSubjectId = psec.subject_id;

            if (sectionRef) {
              const psecNorm = (psec.section_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const secNorm = sectionRef.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (psecNorm !== secNorm) {
                errors.push(`Section mapping conflict: pattern_section_id refers to "${psec.section_name}" but section is "${sectionRef}".`);
                continue;
              }
            }
          } else if (sectionRef) {
            const subjId = subjectMap.get(sectionRef.toLowerCase().trim());
            if (subjId) {
              targetSubjectId = subjId;
            } else {
              errors.push(`Section "${sectionRef}" could not be resolved to a valid subject.`);
              continue;
            }
          } else {
            errors.push("Missing section context (pattern_section_id or section_name is required).");
            continue;
          }

          // Scoped Topic Resolution under (targetSubjectId + normalized topic)
          const topicKey = `${targetSubjectId}:${topicRef.toLowerCase()}`;
          let topicId = topicMap.get(topicKey);

          if (!topicId && mode === "commit" && targetSubjectId) {
            const topicSlug = topicRef.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const { data: newTop, error: topErr } = await supabase
              .from("topics")
              .insert({
                subject_id: targetSubjectId,
                name: topicRef,
                slug: topicSlug,
                is_active: true,
              })
              .select("id")
              .single();

            if (!topErr && newTop) {
              topicId = newTop.id;
              topicMap.set(topicKey, newTop.id);
            }
          }

          if (!topicId && mode !== "commit") {
            // In preview mode, topic will be created upon commit
            topicId = "preview-topic-id";
          }

          if (!topicId) {
            brokenReferencesCount++;
            warnings.push(`Question "${statement.slice(0, 30)}..." failed topic assignment under subject.`);
          }

          // Parse Options
          let optionsList: Array<{ key: string; text: string }> = [];
          if (Array.isArray(rawOptions)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            optionsList = rawOptions.map((opt: any, idx: number) => ({
              key: String(opt.key || opt.option_key || String.fromCharCode(65 + idx)),
              text: String(opt.text || opt.option_text || opt || ""),
            }));
          } else if (typeof rawOptions === "object" && rawOptions !== null) {
            optionsList = Object.entries(rawOptions).map(([k, v]) => ({
              key: k.toUpperCase(),
              text: String(v),
            }));
          }

          if (optionsList.length < 2) {
            optionsList = [
              { key: "A", text: "Option A" },
              { key: "B", text: "Option B" },
              { key: "C", text: "Option C" },
              { key: "D", text: "Option D" },
            ];
          }

          if (mode === "commit") {
            // Insert Question
            const { data: qData, error: qErr } = await supabase
              .from("questions")
              .insert({
                canonical_topic_id: topicId || null,
                status: "published",
              })
              .select("id")
              .single();

            if (qErr || !qData) {
              errors.push(`Error inserting question: ${qErr?.message}`);
              continue;
            }

            // Insert Version
            const { data: vData, error: vErr } = await supabase
              .from("question_versions")
              .insert({
                question_id: qData.id,
                version_number: 1,
                question_text: statement,
                difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
                language,
                options_type: "text",
                is_current: true,
              })
              .select("id")
              .single();

            if (vErr || !vData) {
              errors.push(`Error inserting question version: ${vErr?.message}`);
              continue;
            }

            // Insert Options
            for (let i = 0; i < optionsList.length; i++) {
              await supabase.from("question_options").insert({
                question_version_id: vData.id,
                option_key: optionsList[i].key,
                option_text: optionsList[i].text,
                order_index: i + 1,
              });
            }

            // Insert Server Answer Key
            await supabase.from("question_answers").insert({
              question_version_id: vData.id,
              correct_option_key: correctAnswer,
              explanation_md: explanation || "Detailed explanation provided upon evaluation.",
            });

            // Insert PYQ Source if present
            if (pyqYear || pyqExam) {
              await supabase.from("question_sources").insert({
                question_id: qData.id,
                exam_name: pyqExam || "Competitive Exam",
                year: pyqYear || 2025,
                source_type: "pyq",
              });
            }

            created++;
          } else {
            created++;
            previewData.push({
              statement: statement.slice(0, 60) + "...",
              category: categoryRef || "Unassigned",
              section: sectionRef || "Unassigned",
              topic: topicRef || "Unassigned",
              optionsCount: optionsList.length,
              correctAnswer,
              difficulty,
            });
          }
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
        errors.push(`Unsupported hierarchical import entity type: "${entity}". Supported entities: categories, patterns, sections, topics, questions, mock_tests.`);
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
