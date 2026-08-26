"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdminService } from "@/services/admin.service";
import { BulkImportEngine, BulkImportPayload, BulkImportResult } from "@/lib/admin/bulk-importer";
import { revalidatePath } from "next/cache";

export interface AdminActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  data?: unknown;
}

// Helper: Ensure conducting organization exists
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDefaultOrgId(supabase: any): Promise<string> {
  const { data: org } = await supabase.from("conducting_orgs").select("id").limit(1).maybeSingle();
  if (org) return org.id;
  const { data: newOrg } = await supabase
    .from("conducting_orgs")
    .insert({
      name: "Courage Library Examination Board",
      slug: "courage-library-exam-board",
      is_active: true,
    })
    .select("id")
    .single();
  return newOrg?.id;
}

/**
 * Server Action: Execute Bulk Content Ingestion (Preview or Commit)
 */
export async function executeBulkImportAction(payload: BulkImportPayload): Promise<BulkImportResult> {
  const result = await BulkImportEngine.processImport(payload);
  if (payload.mode === "commit") {
    revalidatePath("/admin");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/patterns");
    revalidatePath("/admin/sections");
    revalidatePath("/admin/questions");
    revalidatePath("/admin/schedules");
    revalidatePath("/admin/mock-tests");
  }
  return result;
}

/**
 * Server Action: Upload Question or Option Image to Supabase Storage
 */
export async function uploadBulkImportImageAction(
  formData: FormData
): Promise<{ success: boolean; url?: string; filename?: string; error?: string }> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { success: false, error: "Unauthorized." };

  const file = formData.get("file") as File;
  const folder = ((formData.get("folder") as string) || "questions").toLowerCase();

  if (!file) return { success: false, error: "No file provided." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerSupabaseClient()) as any;
  const ext = file.name.split(".").pop() || "png";
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `${folder}/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("question-images")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return { success: false, error: uploadErr.message };
  }

  const { data: urlData } = supabase.storage.from("question-images").getPublicUrl(path);
  return {
    success: true,
    url: urlData?.publicUrl,
    filename: file.name,
  };
}

export interface BulkImportQuestionRecord {
  question_text: string;
  options: string | Record<string, unknown>;
  options_type?: string;
  correct_answer: string;
  difficulty?: string;
  topic?: string;
  explanation?: string;
  category_id?: string;
  pattern_section_id?: string;
  section_name?: string;
  question_image?: string;
  pyq_year?: string | number;
  pyq_source?: string;
  is_active?: boolean | string;
  language?: string;
}

/**
 * Server Action: Import Bulk Question Rows directly into the relational Question Architecture
 */
export async function importBulkQuestionsAction(
  rows: BulkImportQuestionRecord[]
): Promise<{ success: boolean; inserted: number; failed: number; errors: string[] }> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { success: false, inserted: 0, failed: rows.length, errors: ["Unauthorized access."] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerSupabaseClient()) as any;
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  // Cache topics map
  const { data: allTopics } = await supabase.from("topics").select("id, name, slug, subject_id");
  const topicMap = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (allTopics || []).forEach((t: any) => {
    topicMap.set(t.name.toLowerCase(), t.id);
    topicMap.set(t.slug.toLowerCase(), t.id);
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const statement = r.question_text?.trim() || "";
      if (!statement) {
        failed++;
        errors.push(`Row ${i + 1}: Missing question statement.`);
        continue;
      }

      // Options parsing
      let optionsObj: Record<string, string | { text?: string; image?: string }> = {};
      if (typeof r.options === "string") {
        try {
          optionsObj = JSON.parse(r.options);
        } catch {
          optionsObj = { A: "Option A", B: "Option B", C: "Option C", D: "Option D" };
        }
      } else if (typeof r.options === "object" && r.options !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        optionsObj = r.options as any;
      }

      const optionsType = (r.options_type || "text").toLowerCase();
      const correctAnswer = (r.correct_answer || "A").trim().toUpperCase();
      const difficulty = ["easy", "medium", "hard"].includes((r.difficulty || "").toLowerCase())
        ? (r.difficulty || "").toLowerCase()
        : "medium";
      const language =
        (r.language || "english").toLowerCase() === "hindi" || (r.language || "").toLowerCase() === "hi"
          ? "hi"
          : "en";
      const explanation = r.explanation?.trim() || "Explanation provided upon evaluation.";
      const qImage = r.question_image?.trim() || null;
      const topicName = r.topic?.trim() || "General";

      // Resolve topic ID
      let topicId = topicMap.get(topicName.toLowerCase());
      if (!topicId) {
        const { data: firstSubject } = await supabase.from("subjects").select("id").limit(1).maybeSingle();
        const subjectId = firstSubject?.id;
        if (subjectId) {
          const { data: newTop } = await supabase
            .from("topics")
            .insert({
              subject_id: subjectId,
              name: topicName,
              slug: topicName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
              is_active: true,
            })
            .select("id")
            .single();
          if (newTop?.id) {
            topicId = newTop.id;
            topicMap.set(topicName.toLowerCase(), newTop.id);
          }
        }
      }

      // 1. Insert Question
      const { data: qData, error: qErr } = await supabase
        .from("questions")
        .insert({
          canonical_topic_id: topicId || null,
          status: "published",
        })
        .select("id")
        .single();

      if (qErr || !qData) {
        failed++;
        errors.push(`Row ${i + 1}: ${qErr?.message || "Question insert failed"}`);
        continue;
      }

      // 2. Insert Question Version
      const { data: qvData, error: qvErr } = await supabase
        .from("question_versions")
        .insert({
          question_id: qData.id,
          version_number: 1,
          question_text: statement,
          difficulty,
          language,
          options_type: optionsType,
          question_image_url: qImage,
          is_current: true,
        })
        .select("id")
        .single();

      if (qvErr || !qvData) {
        failed++;
        errors.push(`Row ${i + 1}: ${qvErr?.message || "Version insert failed"}`);
        continue;
      }

      // 3. Insert Options
      const optionKeys = ["A", "B", "C", "D"];
      const optRows = optionKeys.map((key, idx) => {
        const val = optionsObj[key];
        let optText = "";
        let optImg: string | null = null;
        if (typeof val === "string") {
          if (optionsType === "image" && val.startsWith("http")) {
            optImg = val;
            optText = `Option ${key}`;
          } else {
            optText = val;
          }
        } else if (typeof val === "object" && val !== null) {
          optText = val.text || `Option ${key}`;
          optImg = val.image || null;
        }
        return {
          question_version_id: qvData.id,
          option_key: key,
          option_text: optText || `Option ${key}`,
          option_image_url: optImg,
          order_index: idx + 1,
        };
      });

      await supabase.from("question_options").insert(optRows);

      // 4. Insert Answer Key
      await supabase.from("question_answers").insert({
        question_version_id: qvData.id,
        correct_option_key: correctAnswer,
        explanation_md: explanation,
      });

      // 5. Insert PYQ if present
      const pyqYear = r.pyq_year ? parseInt(String(r.pyq_year), 10) : null;
      const pyqSource = r.pyq_source?.trim() || null;
      if (pyqYear || pyqSource) {
        await supabase.from("question_sources").insert({
          question_id: qData.id,
          exam_name: pyqSource || "Competitive Exam",
          year: pyqYear || 2025,
          source_type: "pyq",
        });
      }

      inserted++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (rowEx: any) {
      failed++;
      errors.push(`Row ${i + 1}: ${rowEx?.message || "Unknown error"}`);
    }
  }

  revalidatePath("/admin/questions");
  revalidatePath("/admin/mock-tests-management");
  return {
    success: failed === 0,
    inserted,
    failed,
    errors,
  };
}

/* ========================================================================= */
/* 1. CATEGORY CRUD ACTIONS                                                  */
/* ========================================================================= */

export async function createCategoryAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access. Administrative privileges required." };

  const title = (formData.get("title") as string || formData.get("name") as string || "").trim();
  const slug = (
    formData.get("slug") as string ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  ).trim();
  const category = (formData.get("category") as string || "Staff Selection Commission (SSC)").trim();
  const description = (formData.get("description") as string || "").trim();

  if (!title) return { error: "Category Name is required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const orgId = await getDefaultOrgId(supabase);

  const { error } = await supabase.from("exams").insert({
    org_id: orgId,
    title,
    slug,
    category,
    description: description || null,
    is_active: true,
  });

  if (error) return { error: `Failed to create category: ${error.message}` };

  revalidatePath("/admin/categories");
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/questions");
  return { success: true, message: `Category "${title}" created successfully.` };
}

export async function updateCategoryAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const id = formData.get("id") as string;
  const title = (formData.get("title") as string || "").trim();
  const slug = (formData.get("slug") as string || "").trim();
  const category = (formData.get("category") as string || "").trim();
  const description = (formData.get("description") as string || "").trim();

  if (!id || !title) return { error: "Category ID and Name are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exams").update({
    title,
    slug: slug || undefined,
    category: category || undefined,
    description: description || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: `Failed to update category: ${error.message}` };

  revalidatePath("/admin/categories");
  revalidatePath("/admin/patterns");
  return { success: true, message: `Category "${title}" updated successfully.` };
}

export async function toggleCategoryStatusAction(categoryId: string, currentActive: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exams").update({ is_active: !currentActive }).eq("id", categoryId);
  if (error) return { error: error.message };

  revalidatePath("/admin/categories");
  return { success: true, message: `Category ${!currentActive ? "activated" : "deactivated"} successfully.` };
}

/* ========================================================================= */
/* 2. PATTERN CRUD ACTIONS                                                   */
/* ========================================================================= */

export async function createPatternAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const name = (formData.get("name") as string || "").trim();
  const tierName = (formData.get("tierName") as string || "Tier 1 (CBE)").trim();
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const totalQuestions = Number(formData.get("totalQuestions") || 100);
  const totalMarks = Number(formData.get("totalMarks") || 200);
  const negativeMarkValue = Number(formData.get("negativeMarkValue") || 0.5);

  if (!categoryId || !name) return { error: "Category and Pattern Name are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Ensure exam cycle exists for category
  let { data: cycle } = await supabase.from("exam_cycles").select("id").eq("exam_id", categoryId).limit(1).maybeSingle();
  if (!cycle) {
    const { data: newCycle, error: cycErr } = await supabase
      .from("exam_cycles")
      .insert({
        exam_id: categoryId,
        cycle_year: 2026,
        status: "active",
      })
      .select("id")
      .single();
    if (cycErr) return { error: `Failed creating exam cycle: ${cycErr.message}` };
    cycle = newCycle;
  }

  const { error } = await supabase.from("exam_patterns").insert({
    exam_cycle_id: cycle.id,
    name,
    tier_name: tierName,
    duration_minutes: durationMinutes,
    total_questions: totalQuestions,
    total_marks: totalMarks,
    negative_mark_value: negativeMarkValue,
    is_active: true,
  });

  if (error) return { error: `Failed to create pattern: ${error.message}` };

  revalidatePath("/admin/patterns");
  revalidatePath("/admin/sections");
  revalidatePath("/admin/questions");
  revalidatePath("/admin/mock-tests");
  return { success: true, message: `Pattern "${name}" created successfully.` };
}

export async function updatePatternAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string || "").trim();
  const tierName = (formData.get("tierName") as string || "").trim();
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const totalQuestions = Number(formData.get("totalQuestions") || 100);
  const totalMarks = Number(formData.get("totalMarks") || 200);
  const negativeMarkValue = Number(formData.get("negativeMarkValue") || 0.5);

  if (!id || !name) return { error: "Pattern ID and Name are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exam_patterns").update({
    name,
    tier_name: tierName || undefined,
    duration_minutes: durationMinutes,
    total_questions: totalQuestions,
    total_marks: totalMarks,
    negative_mark_value: negativeMarkValue,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: `Failed to update pattern: ${error.message}` };

  revalidatePath("/admin/patterns");
  return { success: true, message: `Pattern "${name}" updated successfully.` };
}

export async function togglePatternStatusAction(patternId: string, currentActive: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exam_patterns").update({ is_active: !currentActive }).eq("id", patternId);
  if (error) return { error: error.message };

  revalidatePath("/admin/patterns");
  return { success: true, message: `Pattern ${!currentActive ? "activated" : "deactivated"} successfully.` };
}

/**
 * Server Action: Delete a Pattern safely with dependency verification
 */
export async function deletePatternAction(patternId: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Check dependent mock templates & mock tests
  const { data: templates } = await supabase
    .from("mock_templates")
    .select("id, mock_tests(id)")
    .eq("pattern_id", patternId);

  const mockTestCount = (templates || []).reduce(
    (acc: number, t: { mock_tests?: unknown[] }) => acc + (t.mock_tests?.length || 0),
    0
  );

  if (mockTestCount > 0) {
    return {
      error: `Cannot delete pattern: ${mockTestCount} active mock test paper(s) depend on this blueprint. Deactivate the pattern instead to protect candidate attempt history.`,
    };
  }

  // Delete empty template shells if any
  await supabase.from("mock_templates").delete().eq("pattern_id", patternId);

  const { error: delErr } = await supabase.from("exam_patterns").delete().eq("id", patternId);
  if (delErr) {
    return { error: `Failed to delete pattern: ${delErr.message}` };
  }

  revalidatePath("/admin/patterns");
  revalidatePath("/admin/mock-tests-management");
  return { success: true, message: "Pattern deleted successfully." };
}

/* ========================================================================= */
/* 3. SECTION CRUD ACTIONS                                                   */
/* ========================================================================= */

export async function createSectionAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const patternId = (formData.get("patternId") as string || "").trim();
  const name = (formData.get("name") as string || "").trim();
  const questionCount = Number(formData.get("questionCount") || 25);
  const marksPerQuestion = Number(formData.get("marksPerQuestion") || 2.0);
  const negativeMark = Number(formData.get("negativeMark") || 0.5);

  if (!patternId) return { error: "Please select a pattern." };
  if (!name) return { error: "Section name is required." };
  if (!questionCount || questionCount < 1) return { error: "Question count must be at least 1." };
  if (!marksPerQuestion || marksPerQuestion <= 0) return { error: "Marks per question must be > 0." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Duplicate Check: (pattern_id + section_name)
  const { data: existing } = await supabase
    .from("pattern_sections")
    .select("id")
    .eq("pattern_id", patternId)
    .ilike("section_name", name)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: `"${name}" already exists in this pattern.` };
  }

  // Find or create subject taxonomy
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let { data: subject } = await supabase
    .from("subjects")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (!subject) {
    const { data: newSubj, error: subjErr } = await supabase
      .from("subjects")
      .insert({
        name,
        slug,
        is_active: true,
      })
      .select("id")
      .single();

    if (subjErr) return { error: `Failed creating subject: ${subjErr.message}` };
    subject = newSubj;

    // Create default topic for the new subject
    if (subject?.id) {
      await supabase.from("topics").insert({
        subject_id: subject.id,
        name: `${name} General Topics`,
        slug: `${slug}-general`,
        is_active: true,
      });
    }
  }

  // Get current max section_order for this pattern
  const { data: orderData } = await supabase
    .from("pattern_sections")
    .select("section_order")
    .eq("pattern_id", patternId)
    .order("section_order", { ascending: false })
    .limit(1);

  const nextOrder = (orderData?.[0]?.section_order || 0) + 1;

  const { error: insErr } = await supabase.from("pattern_sections").insert({
    pattern_id: patternId,
    subject_id: subject.id,
    section_name: name,
    num_questions: questionCount,
    marks_per_question: marksPerQuestion,
    negative_mark: negativeMark,
    section_order: nextOrder,
  });

  if (insErr) return { error: `Failed to add section: ${insErr.message}` };

  revalidatePath("/admin/sections");
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/mock-tests-management");
  return { success: true, message: `"${name}" added successfully.` };
}

export async function updateSectionAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string || "").trim();
  const questionCount = Number(formData.get("questionCount") || 25);
  const marksPerQuestion = Number(formData.get("marksPerQuestion") || 2.0);
  const negativeMark = Number(formData.get("negativeMark") || 0.5);

  if (!id || !name) return { error: "Section ID and Name are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("pattern_sections").update({
    section_name: name,
    num_questions: questionCount,
    marks_per_question: marksPerQuestion,
    negative_mark: negativeMark,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: `Failed to update section: ${error.message}` };

  revalidatePath("/admin/sections");
  return { success: true, message: `Section "${name}" updated successfully.` };
}

export async function toggleSectionStatusAction(sectionId: string, currentActive: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("subjects").update({ is_active: !currentActive }).eq("id", sectionId);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return { success: true, message: `Section ${!currentActive ? "activated" : "deactivated"} successfully.` };
}

/**
 * Server Action: Safely Delete Section without deleting questions
 */
export async function deleteSectionAction(sectionId: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("pattern_sections").delete().eq("id", sectionId);
  if (error) return { error: `Failed to delete section: ${error.message}` };

  revalidatePath("/admin/sections");
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/mock-tests-management");
  return { success: true, message: "Section deleted successfully (all questions in bank preserved)." };
}

/* ========================================================================= */
/* 4. SCHEDULE CRUD ACTIONS                                                  */
/* ========================================================================= */

export async function createScheduleAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const cycleYear = Number(formData.get("cycleYear") || 2026);
  const notificationDate = (formData.get("notificationDate") as string || "").trim() || null;
  const applicationStartDate = (formData.get("applicationStartDate") as string || "").trim() || null;
  const applicationEndDate = (formData.get("applicationEndDate") as string || "").trim() || null;
  const examWindowStart = (formData.get("examWindowStart") as string || "").trim() || null;
  const examWindowEnd = (formData.get("examWindowEnd") as string || "").trim() || null;
  const status = (formData.get("status") as string || "active").toLowerCase();

  if (!categoryId) return { error: "Category is required for schedule creation." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exam_cycles").insert({
    exam_id: categoryId,
    cycle_year: cycleYear,
    notification_date: notificationDate,
    application_start_date: applicationStartDate,
    application_end_date: applicationEndDate,
    exam_window_start: examWindowStart,
    exam_window_end: examWindowEnd,
    status,
  });

  if (error) return { error: `Failed to create schedule: ${error.message}` };

  revalidatePath("/admin/schedules");
  return { success: true, message: `Recruitment Schedule for ${cycleYear} created successfully.` };
}

export async function updateScheduleAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const id = formData.get("id") as string;
  const cycleYear = Number(formData.get("cycleYear") || 2026);
  const notificationDate = (formData.get("notificationDate") as string || "").trim() || null;
  const applicationStartDate = (formData.get("applicationStartDate") as string || "").trim() || null;
  const applicationEndDate = (formData.get("applicationEndDate") as string || "").trim() || null;
  const examWindowStart = (formData.get("examWindowStart") as string || "").trim() || null;
  const examWindowEnd = (formData.get("examWindowEnd") as string || "").trim() || null;
  const status = (formData.get("status") as string || "active").toLowerCase();

  if (!id) return { error: "Schedule ID is required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exam_cycles").update({
    cycle_year: cycleYear,
    notification_date: notificationDate,
    application_start_date: applicationStartDate,
    application_end_date: applicationEndDate,
    exam_window_start: examWindowStart,
    exam_window_end: examWindowEnd,
    status,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: `Failed to update schedule: ${error.message}` };

  revalidatePath("/admin/schedules");
  return { success: true, message: "Schedule updated successfully." };
}

export async function toggleScheduleStatusAction(scheduleId: string, currentStatus: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const newStatus = currentStatus === "active" ? "archived" : "active";
  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("exam_cycles").update({ status: newStatus }).eq("id", scheduleId);
  if (error) return { error: error.message };

  revalidatePath("/admin/schedules");
  return { success: true, message: `Schedule marked as ${newStatus}.` };
}

/**
 * Server Action: Save a single day's configuration in the Daily Mock Program
 */
export async function saveDailyMockDayAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const dayOfWeek = (formData.get("dayOfWeek") as "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday") || "monday";
  const dayLabel = (formData.get("dayLabel") as string) || "Monday";
  const testType = (formData.get("testType") as "daily_sectional" | "mixed" | "full_mock") || "daily_sectional";
  const patternId = formData.get("patternId") as string;
  const activeSectionId = (formData.get("activeSectionId") as string) || null;
  const activeSectionName = (formData.get("activeSectionName") as string) || null;
  const questionCount = Number(formData.get("questionCount") || 25);
  const durationMinutes = Number(formData.get("durationMinutes") || 15);
  const totalMarks = Number(formData.get("totalMarks") || 50);
  const negativeMark = Number(formData.get("negativeMark") || 0.5);
  const language = (formData.get("language") as "both" | "english" | "hindi") || "both";
  const isActive = formData.get("isActive") !== "false";
  const launchDate = (formData.get("launchDate") as string) || "2026-03-01";
  const defaultLanguage = (formData.get("defaultLanguage") as string) || "both";

  if (!categoryId || !patternId) {
    return { error: "Category and Pattern are required." };
  }

  const result = await AdminService.saveAdminDailyMockDay(
    categoryId,
    {
      dayOfWeek,
      dayLabel,
      testType,
      patternId,
      patternName: "",
      activeSectionId,
      activeSectionName,
      questionCount,
      durationMinutes,
      totalMarks,
      negativeMark,
      language,
      isActive,
    },
    launchDate,
    defaultLanguage
  );

  if (!result.success) {
    return { error: result.error || "Failed to update daily mock day." };
  }

  revalidatePath("/admin/schedules");
  revalidatePath("/mock-tests");
  return { success: true, message: `${dayLabel} schedule updated successfully.` };
}

/**
 * Server Action: Save full 7-day Daily Mock Program
 */
export async function saveDailyMockProgramAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const launchDate = (formData.get("launchDate") as string) || "2026-03-01";
  const defaultLanguage = ((formData.get("defaultLanguage") as string) || "both") as "both" | "english" | "hindi";
  const daysJson = formData.get("daysJson") as string;

  if (!categoryId) return { error: "Category is required." };
  if (!daysJson) return { error: "Days configuration data is missing." };

  try {
    const days = JSON.parse(daysJson);
    const result = await AdminService.saveAdminDailyMockProgram(categoryId, launchDate, defaultLanguage, days);

    if (!result.success) {
      return { error: `Some days failed to save: ${result.errors.join(", ")}` };
    }

    revalidatePath("/admin/schedules");
    revalidatePath("/mock-tests");
    return { success: true, message: `7-Day Daily Mock Program for category saved successfully (${result.updatedCount} days configured).` };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Invalid configuration data: ${errorMsg}` };
  }
}

/**
 * Server Action: Toggle single day active status in Daily Mock Program
 */
export async function toggleDailyMockDayAction(templateId: string, currentActive: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const result = await AdminService.toggleDailyMockDayStatus(templateId, currentActive);
  if (!result.success) return { error: result.error || "Failed to toggle status." };

  revalidatePath("/admin/schedules");
  revalidatePath("/mock-tests");
  return { success: true, message: `Day status updated to ${!currentActive ? "Active" : "Inactive"}.` };
}

/* ========================================================================= */
/* 5. QUESTION CRUD ACTIONS (HIERARCHY + PYQ + OPTIONS)                      */
/* ========================================================================= */

export async function createQuestionHierarchyAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access. Administrative privileges required." };
  }

  const statement = (formData.get("statement") as string || "").trim();
  const topicId = formData.get("topicId") as string;
  const difficulty = (formData.get("difficulty") as string || "medium").toLowerCase();
  const language = (formData.get("language") as string || "hi").toLowerCase();
  const optionsType = (formData.get("optionsType") as string || "text").toLowerCase();
  const questionImageUrl = (formData.get("questionImageUrl") as string || "").trim() || null;
  const correctOptionKey = (formData.get("correctOptionKey") as string || "A").toUpperCase().trim();
  const explanation = (formData.get("explanation") as string || "").trim();

  // Option texts & images
  const optAText = (formData.get("optAText") as string || "").trim();
  const optAImg = (formData.get("optAImg") as string || "").trim() || null;
  const optBText = (formData.get("optBText") as string || "").trim();
  const optBImg = (formData.get("optBImg") as string || "").trim() || null;
  const optCText = (formData.get("optCText") as string || "").trim();
  const optCImg = (formData.get("optCImg") as string || "").trim() || null;
  const optDText = (formData.get("optDText") as string || "").trim();
  const optDImg = (formData.get("optDImg") as string || "").trim() || null;

  // PYQ metadata
  const pyqYearRaw = formData.get("pyqYear") as string;
  const pyqYear = pyqYearRaw ? parseInt(pyqYearRaw, 10) : null;
  const pyqSource = (formData.get("pyqSource") as string || "").trim() || null;

  if (!statement) {
    return { error: "Question statement is required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // 1. Insert Base Question
  const { data: qData, error: qErr } = await supabase
    .from("questions")
    .insert({
      canonical_topic_id: topicId || null,
      status: "published",
    })
    .select("id")
    .single();

  if (qErr || !qData) {
    return { error: `Failed to create question: ${qErr?.message}` };
  }

  // 2. Insert Question Version
  const { data: qvData, error: qvErr } = await supabase
    .from("question_versions")
    .insert({
      question_id: qData.id,
      version_number: 1,
      question_text: statement,
      difficulty,
      language: language === "hindi" || language === "hi" ? "hi" : "en",
      options_type: optionsType,
      question_image_url: questionImageUrl,
      is_current: true,
    })
    .select("id")
    .single();

  if (qvErr || !qvData) {
    return { error: `Failed to create question version: ${qvErr?.message}` };
  }

  // 3. Insert Options A-D
  const optionsRows = [
    { question_version_id: qvData.id, option_key: "A", option_text: optAText, option_image_url: optAImg, order_index: 1 },
    { question_version_id: qvData.id, option_key: "B", option_text: optBText, option_image_url: optBImg, order_index: 2 },
    { question_version_id: qvData.id, option_key: "C", option_text: optCText, option_image_url: optCImg, order_index: 3 },
    { question_version_id: qvData.id, option_key: "D", option_text: optDText, option_image_url: optDImg, order_index: 4 },
  ];

  await supabase.from("question_options").insert(optionsRows);

  // 4. Insert Server Isolated Answer Key
  await supabase.from("question_answers").insert({
    question_version_id: qvData.id,
    correct_option_key: correctOptionKey,
    explanation_md: explanation || "Detailed explanation provided upon evaluation.",
  });

  // 5. Insert PYQ Metadata if available
  if (pyqYear || pyqSource) {
    await supabase.from("question_sources").insert({
      question_id: qData.id,
      exam_name: pyqSource || "Competitive Exam",
      year: pyqYear || 2025,
      source_type: "pyq",
    });
  }

  revalidatePath("/admin/questions");
  return { success: true, message: "Question created successfully." };
}

export async function updateQuestionHierarchyAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const questionId = formData.get("questionId") as string;
  const versionId = formData.get("versionId") as string;
  const statement = (formData.get("statement") as string || "").trim();
  const topicId = formData.get("topicId") as string;
  const difficulty = (formData.get("difficulty") as string || "medium").toLowerCase();
  const language = (formData.get("language") as string || "hi").toLowerCase();
  const optionsType = (formData.get("optionsType") as string || "text").toLowerCase();
  const questionImageUrl = (formData.get("questionImageUrl") as string || "").trim() || null;
  const correctOptionKey = (formData.get("correctOptionKey") as string || "A").toUpperCase().trim();
  const explanation = (formData.get("explanation") as string || "").trim();

  // Option texts
  const optAText = (formData.get("optAText") as string || "").trim();
  const optAImg = (formData.get("optAImg") as string || "").trim() || null;
  const optBText = (formData.get("optBText") as string || "").trim();
  const optBImg = (formData.get("optBImg") as string || "").trim() || null;
  const optCText = (formData.get("optCText") as string || "").trim();
  const optCImg = (formData.get("optCImg") as string || "").trim() || null;
  const optDText = (formData.get("optDText") as string || "").trim();
  const optDImg = (formData.get("optDImg") as string || "").trim() || null;

  if (!questionId || !versionId || !statement) {
    return { error: "Question ID, Version ID, and statement are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // 1. Update Base Question
  await supabase
    .from("questions")
    .update({
      canonical_topic_id: topicId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", questionId);

  // 2. Update Question Version
  await supabase
    .from("question_versions")
    .update({
      question_text: statement,
      difficulty,
      language: language === "hindi" || language === "hi" ? "hi" : "en",
      options_type: optionsType,
      question_image_url: questionImageUrl,
    })
    .eq("id", versionId);

  // 3. Upsert Options
  const optionsUpdates = [
    { key: "A", text: optAText, img: optAImg },
    { key: "B", text: optBText, img: optBImg },
    { key: "C", text: optCText, img: optCImg },
    { key: "D", text: optDText, img: optDImg },
  ];

  for (const opt of optionsUpdates) {
    await supabase
      .from("question_options")
      .update({
        option_text: opt.text,
        option_image_url: opt.img,
      })
      .eq("question_version_id", versionId)
      .eq("option_key", opt.key);
  }

  // 4. Update Answer Key
  await supabase
    .from("question_answers")
    .update({
      correct_option_key: correctOptionKey,
      explanation_md: explanation || "Detailed explanation provided upon evaluation.",
    })
    .eq("question_version_id", versionId);

  revalidatePath("/admin/questions");
  return { success: true, message: "Question updated successfully." };
}

export async function toggleQuestionStatusAction(questionId: string, currentStatus: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const newStatus = currentStatus === "published" ? "archived" : "published";
  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("questions").update({ status: newStatus }).eq("id", questionId);
  if (error) return { error: error.message };

  revalidatePath("/admin/questions");
  return { success: true, message: `Question status changed to ${newStatus}.` };
}

export async function createQuestionAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  return createQuestionHierarchyAction(prevState, formData);
}

export async function toggleQuestionPublishAction(questionId: string, currentStatus: boolean): Promise<AdminActionResult> {
  return toggleQuestionStatusAction(questionId, currentStatus ? "published" : "archived");
}

export async function deleteQuestionAction(questionId: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Check if question has student responses
  const { data: responses } = await supabase
    .from("test_responses")
    .select("id")
    .eq("question_id", questionId)
    .limit(1);

  if (responses && responses.length > 0) {
    // Archive question if attempt history exists
    await supabase.from("questions").update({ status: "archived" }).eq("id", questionId);
    revalidatePath("/admin/questions");
    return { success: true, message: "Question has student attempt history; safely archived instead of deleting." };
  }

  // Delete associated versions, options, answers, sources
  const { data: versions } = await supabase.from("question_versions").select("id").eq("question_id", questionId);
  const versionIds = (versions || []).map((v: { id: string }) => v.id);

  if (versionIds.length > 0) {
    await supabase.from("question_answers").delete().in("question_version_id", versionIds);
    await supabase.from("question_options").delete().in("question_version_id", versionIds);
    await supabase.from("question_versions").delete().eq("question_id", questionId);
  }

  await supabase.from("question_sources").delete().eq("question_id", questionId);
  await supabase.from("questions").delete().eq("id", questionId);

  revalidatePath("/admin/questions");
  return { success: true, message: "Question deleted successfully." };
}

/* ========================================================================= */
/* 6. MOCK TEST CRUD ACTIONS                                                 */
/* ========================================================================= */

export async function createMockTestAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const patternId = formData.get("patternId") as string;
  const title = (formData.get("title") as string || "").trim();
  const slug = (formData.get("slug") as string || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).trim();
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const totalMarks = Number(formData.get("totalMarks") || 160);
  const totalQuestions = Number(formData.get("totalQuestions") || 80);

  if (!title || !slug) return { error: "Title and Slug are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Find or create template
  let templateId: string | null = null;
  if (categoryId) {
    const { data: tData } = await supabase.from("mock_templates").select("id").eq("exam_id", categoryId).limit(1).maybeSingle();
    if (tData) {
      templateId = tData.id;
    } else {
      // Ensure exam_cycle exists
      let { data: cycle } = await supabase.from("exam_cycles").select("id").eq("exam_id", categoryId).limit(1).maybeSingle();
      if (!cycle) {
        const { data: newCycle } = await supabase.from("exam_cycles").insert({
          exam_id: categoryId,
          cycle_year: 2026,
          status: "active",
        }).select("id").single();
        cycle = newCycle;
      }

      // Ensure pattern exists
      let resolvedPatternId = patternId;
      if (!resolvedPatternId && cycle) {
        const { data: pat } = await supabase.from("exam_patterns").select("id").eq("exam_cycle_id", cycle.id).limit(1).maybeSingle();
        if (pat) {
          resolvedPatternId = pat.id;
        } else {
          const { data: newPat } = await supabase.from("exam_patterns").insert({
            exam_cycle_id: cycle.id,
            name: `${title} Default Pattern`,
            duration_minutes: durationMinutes,
            total_questions: totalQuestions,
            total_marks: totalMarks,
            negative_mark_value: 0.5,
            is_active: true,
          }).select("id").single();
          resolvedPatternId = newPat?.id;
        }
      }

      if (cycle && resolvedPatternId) {
        const { data: newT } = await supabase.from("mock_templates").insert({
          exam_id: categoryId,
          exam_cycle_id: cycle.id,
          pattern_id: resolvedPatternId,
          title: `${title} Template`,
          slug: `${slug}-template-${Date.now().toString(36)}`,
          test_type: "full_length",
          is_free: true,
          is_active: true,
        }).select("id").single();
        templateId = newT?.id || null;
      }
    }
  }

  if (!templateId) {
    return { error: "Failed to resolve or create valid mock template with parent category/pattern." };
  }

  const { error } = await supabase.from("mock_tests").insert({
    template_id: templateId,
    title,
    slug,
    duration_minutes: durationMinutes,
    total_marks: totalMarks,
    total_questions: totalQuestions,
    status: "published",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/mock-tests");
  return { success: true, message: `Mock test "${title}" published successfully.` };
}

export async function updateMockTestAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const id = formData.get("id") as string;
  const title = (formData.get("title") as string || "").trim();
  const slug = (formData.get("slug") as string || "").trim();
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const totalMarks = Number(formData.get("totalMarks") || 160);
  const totalQuestions = Number(formData.get("totalQuestions") || 80);

  if (!id || !title) return { error: "Mock Test ID and Title are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("mock_tests").update({
    title,
    slug: slug || undefined,
    duration_minutes: durationMinutes,
    total_marks: totalMarks,
    total_questions: totalQuestions,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/mock-tests");
  return { success: true, message: `Mock test "${title}" updated successfully.` };
}

export async function toggleMockTestPublishAction(mockTestId: string, currentStatus: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const newStatus = currentStatus ? "draft" : "published";
  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("mock_tests").update({ status: newStatus }).eq("id", mockTestId);
  if (error) return { error: error.message };

  revalidatePath("/admin/mock-tests");
  return { success: true, message: `Mock test marked as ${newStatus}.` };
}

/* ========================================================================= */
/* 7. OTHER CMS ACTIONS                                                      */
/* ========================================================================= */

export async function createArticleAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const content = formData.get("content") as string;

  if (!title || !slug) return { error: "Title and Slug are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("articles").insert({
    title,
    slug,
    body_md: content || "Draft content",
    status: "published",
    reading_time_minutes: 5,
    access_level: "free",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/content");
  return { success: true, message: "Article created successfully." };
}

export async function createCourseAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const priceInr = Number(formData.get("priceInr") || 0);

  if (!title || !slug) return { error: "Title and Slug are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("courses").insert({
    title,
    slug,
    price_inr: priceInr,
    is_published: true,
    access_tier: "free",
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/content");
  return { success: true, message: "Course created successfully." };
}

export async function createDescriptiveAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const title = formData.get("title") as string;
  const promptText = formData.get("promptText") as string;
  const maxWordCount = Number(formData.get("maxWordCount") || 250);

  if (!title || !promptText) return { error: "Title and Prompt are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("descriptive_prompts").insert({
    title,
    prompt_text: promptText,
    max_word_count: maxWordCount,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/descriptive");
  return { success: true, message: "Descriptive prompt created successfully." };
}

export async function createInstituteAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const city = formData.get("city") as string;

  if (!name || !slug) return { error: "Name and Slug are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("institutes").insert({
    name,
    slug,
    city: city || null,
    is_verified: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/institutes");
  return { success: true, message: "Institute created successfully." };
}

export async function createSubscriptionPlanAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const name = formData.get("name") as string;
  const code = formData.get("code") as string;
  const priceInr = Number(formData.get("priceInr") || 499);
  const durationDays = Number(formData.get("durationDays") || 30);

  if (!name || !code) return { error: "Plan name and code are required." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("subscription_plans").insert({
    name,
    code,
    price_inr: priceInr,
    duration_days: durationDays,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/billing");
  return { success: true, message: "Subscription plan created successfully." };
}

export async function resolveCommunityFlagAction(flagId: string, status: string = "resolved"): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("community_moderation_flags").update({ status: status.toLowerCase() }).eq("id", flagId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  return { success: true, message: "Flag resolved successfully." };
}
