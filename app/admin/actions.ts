"use server";

import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AdminService, getIstTomorrowDateStr } from "@/services/admin.service";
import { BulkImportEngine, BulkImportPayload, BulkImportResult } from "@/lib/admin/bulk-importer";
import { QuestionCsvImporterService } from "@/services/question-factory/question-csv-importer.service";
import { AdminQuestionFactoryService } from "@/services/question-factory/admin-question-factory.service";
import type { QuestionAuthoringItem, QuestionOptionKey } from "@/types/question-factory";
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
  const supabase = createAdminServerSupabaseClient() as any;
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
 * Server Action: Import bulk question rows through the Question Factory (QF-1).
 * Every row passes the same five gates as external-AI input and lands as a DRAFT
 * version; nothing is published and no taxonomy/exam entities are ever created.
 * Unresolved subject/topic/exam references reject the row with an explicit message.
 */
export async function importBulkQuestionsAction(
  rows: BulkImportQuestionRecord[],
  mode: "dry-run" | "commit" = "commit"
): Promise<{ success: boolean; inserted: number; failed: number; errors: string[]; warnings?: string[] }> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin || !authCheck.userId) {
    return { success: false, inserted: 0, failed: rows.length, errors: ["Unauthorized access."] };
  }

  const summary = await QuestionCsvImporterService.run({
    rows: rows as unknown as Record<string, unknown>[],
    mode: mode === "dry-run" ? "dry-run" : "commit",
    actorId: authCheck.userId,
    supabase: createAdminServerSupabaseClient(),
  });

  const errors = summary.rows
    .filter((r) => r.status === "REJECTED")
    .map((r) => `Row ${r.row}: ${r.errors.join(" ") || "Rejected."}`);
  const warnings = summary.rows
    .filter((r) => r.warnings.length > 0)
    .map((r) => `Row ${r.row}: ${r.warnings.join(" ")}`);

  if (mode === "commit") {
    revalidatePath("/admin/questions");
    revalidatePath("/admin/questions/factory");
  }

  return {
    success: summary.rejected === 0,
    inserted: mode === "commit" ? summary.imported : summary.accepted,
    failed: summary.rejected,
    errors,
    warnings,
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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
  const supabaseRaw = createAdminServerSupabaseClient();
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
  const launchDate = (formData.get("launchDate") as string) || getIstTomorrowDateStr();
  const launchTime = (formData.get("launchTime") as string) || "09:00";
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
    launchTime,
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
 * Server Action: Launch full 7-day Daily Mock Program
 */
export async function saveDailyMockProgramAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const launchDate = (formData.get("launchDate") as string) || getIstTomorrowDateStr();
  const launchTime = (formData.get("launchTime") as string) || "09:00";
  const defaultLanguage = ((formData.get("defaultLanguage") as string) || "both") as "both" | "english" | "hindi";
  const daysJson = formData.get("daysJson") as string;

  if (!categoryId) return { error: "Category is required." };
  if (!daysJson) return { error: "Days configuration data is missing." };

  try {
    const days = JSON.parse(daysJson);
    const result = await AdminService.saveAdminDailyMockProgram(
      categoryId,
      launchDate,
      launchTime,
      defaultLanguage,
      days
    );

    if (!result.success) {
      return { error: result.errors.join(". ") };
    }

    revalidatePath("/admin/schedules");
    revalidatePath("/mock-tests");
    return { success: true, message: `7-Day Daily Mock Program launched successfully (${result.updatedCount} days configured).` };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Invalid configuration data: ${errorMsg}` };
  }
}

export const launchDailyMockProgramAction = saveDailyMockProgramAction;

/**
 * Server Action: Update full 7-day Daily Mock Program (Live Program Safe Update)
 */
export async function updateDailyMockProgramAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const launchDate = (formData.get("launchDate") as string) || getIstTomorrowDateStr();
  const launchTime = (formData.get("launchTime") as string) || "09:00";
  const defaultLanguage = ((formData.get("defaultLanguage") as string) || "both") as "both" | "english" | "hindi";
  const daysJson = formData.get("daysJson") as string;

  if (!categoryId) return { error: "Category is required." };
  if (!daysJson) return { error: "Days configuration data is missing." };

  try {
    const days = JSON.parse(daysJson);
    const result = await AdminService.updateAdminDailyMockProgram(
      categoryId,
      launchDate,
      launchTime,
      defaultLanguage,
      days
    );

    if (!result.success) {
      return { error: result.errors.join(". ") };
    }

    revalidatePath("/admin/schedules");
    revalidatePath("/mock-tests");
    return { success: true, message: `Weekly Mock Program schedule updated successfully (${result.updatedCount} days configured).` };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: `Invalid configuration data: ${errorMsg}` };
  }
}

/**
 * Server Action: Deactivate Entire Daily Mock Program (Destructive Operation with Typed Confirmation)
 */
export async function deactivateDailyMockProgramAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  const categoryId = formData.get("categoryId") as string;
  const confirmationText = formData.get("confirmationText") as string;

  if (!categoryId) return { error: "Category is required." };
  if (confirmationText !== "DEACTIVATE") {
    return { error: 'You must type "DEACTIVATE" exactly to confirm deactivation.' };
  }

  const result = await AdminService.deactivateAdminDailyMockProgram(categoryId, confirmationText);
  if (!result.success) {
    return { error: result.error || "Failed to deactivate weekly program." };
  }

  revalidatePath("/admin/schedules");
  revalidatePath("/mock-tests");
  return {
    success: true,
    message: `Weekly Daily Mock Program has been deactivated (${result.deactivatedCount} scheduled days stopped). Student attempts and history remain preserved.`,
  };
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

/**
 * QF-1: builds a QuestionAuthoringItem from the question manager form.
 * Image fields are passed through so Gate 1 rejects them (images arrive in QF-3).
 */
function questionFormToItem(formData: FormData): QuestionAuthoringItem {
  const text = (k: string) => ((formData.get(k) as string) || "").trim();
  const language = text("language").toLowerCase();
  const pyqYear = text("pyqYear");
  const pyqSource = text("pyqSource");
  const item: Record<string, unknown> = {
    clientRef: "manual-1",
    stem: text("statement"),
    language: language === "hindi" || language === "hi" ? "hi" : "en",
    difficulty: (text("difficulty") || "medium").toLowerCase(),
    options: (["A", "B", "C", "D"] as QuestionOptionKey[]).map((key) => ({ key, text: text(`opt${key}Text`) })),
    correctKey: (text("correctOptionKey") || "A").toUpperCase(),
    explanationMd: text("explanation"),
    sourceType: pyqYear || pyqSource ? "PYQ" : "ORIGINAL",
  };
  if (pyqYear || pyqSource) {
    item.pyq = { examSlug: pyqSource, year: Number(pyqYear), reference: `${pyqSource} ${pyqYear}`.trim() };
  }
  const imageFields = ["questionImageUrl", "optAImg", "optBImg", "optCImg", "optDImg"].filter((k) => text(k));
  if (imageFields.length > 0 || text("optionsType").toLowerCase() === "image") {
    item.question_image_url = imageFields.join(",") || "image-options";
  }
  return item as unknown as QuestionAuthoringItem;
}

/**
 * QF-1: manual creation goes through the five gates and lands as a DRAFT version.
 * Publication happens only via review + atomic publish in the Question Factory.
 */
export async function createQuestionHierarchyAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const topicId = ((formData.get("topicId") as string) || "").trim();
  if (!((formData.get("statement") as string) || "").trim()) {
    return { error: "Question statement is required." };
  }
  if (!topicId) {
    return { error: "Topic is required." };
  }

  const res = await AdminQuestionFactoryService.createManualDraft({ topicId }, questionFormToItem(formData));
  if (!res.success) {
    return { error: res.error || "Question failed the Question Factory gates." };
  }

  revalidatePath("/admin/questions");
  revalidatePath("/admin/questions/factory");
  return {
    success: true,
    message: "Question saved as DRAFT. Submit it for review and publish it from the Question Factory.",
  };
}

/**
 * QF-1: published versions are immutable. Editing either updates the open
 * DRAFT/CHANGES_REQUESTED version or creates a new DRAFT revision for review.
 */
export async function updateQuestionHierarchyAction(
  prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const questionId = ((formData.get("questionId") as string) || "").trim();
  const topicId = ((formData.get("topicId") as string) || "").trim();
  if (!questionId || !((formData.get("statement") as string) || "").trim()) {
    return { error: "Question ID and statement are required." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminServerSupabaseClient() as any;
  const { data: question, error: qErr } = await supabase
    .from("questions")
    .select("id, canonical_topic_id, question_versions(id, lifecycle_status)")
    .eq("id", questionId)
    .maybeSingle();
  if (qErr) return { error: `Failed to load question: ${qErr.message}` };
  if (!question) return { error: "Question not found." };

  if (topicId && topicId !== question.canonical_topic_id) {
    return { error: "Changing a question's topic is not supported in QF-1. Create a new question under the correct topic instead." };
  }

  const versions = (question.question_versions || []) as Array<{ id: string; lifecycle_status: string }>;
  const editable = versions.find((v) => v.lifecycle_status === "DRAFT" || v.lifecycle_status === "CHANGES_REQUESTED");
  const inReview = versions.find((v) => v.lifecycle_status === "IN_REVIEW" || v.lifecycle_status === "APPROVED");
  if (!editable && inReview) {
    return { error: `This question has a version in ${inReview.lifecycle_status}. Finish its review in the Question Factory first.` };
  }

  const item = questionFormToItem(formData);
  const res = editable
    ? await AdminQuestionFactoryService.editDraft(editable.id, item)
    : await AdminQuestionFactoryService.createRevision(questionId, item);
  if (!res.success) return { error: res.error || "Edit failed the Question Factory gates." };

  revalidatePath("/admin/questions");
  revalidatePath("/admin/questions/factory");
  return {
    success: true,
    message: editable
      ? "Draft updated. Submit it for review in the Question Factory."
      : "A new DRAFT revision was created. The published version stays live until the revision is approved and published.",
  };
}

export async function toggleQuestionStatusAction(questionId: string, currentStatus: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized access." };

  if (currentStatus !== "published" && currentStatus !== "archived") {
    return { error: "Draft questions are published only through review in the Question Factory." };
  }

  const newStatus = currentStatus === "published" ? "archived" : "published";
  const supabaseRaw = createAdminServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Restoring an archived question is allowed by the DB only when its current version is PUBLISHED.
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

  const supabaseRaw = createAdminServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // Check if question has student responses
  const { data: responses } = await supabase
    .from("test_responses")
    .select("id")
    .eq("question_id", questionId)
    .limit(1);

  // QF-1: versions that were ever submitted, approved or published are immutable history.
  const { data: versions, error: vErr } = await supabase
    .from("question_versions")
    .select("id, lifecycle_status")
    .eq("question_id", questionId);
  const frozen = (versions || []).some((v: { lifecycle_status: string }) =>
    ["IN_REVIEW", "APPROVED", "PUBLISHED", "SUPERSEDED"].includes(v.lifecycle_status)
  );

  if ((responses && responses.length > 0) || frozen || vErr) {
    const { error } = await supabase.from("questions").update({ status: "archived" }).eq("id", questionId);
    if (error) return { error: error.message };
    revalidatePath("/admin/questions");
    return { success: true, message: "Question has published or attempt history; safely archived instead of deleting." };
  }

  // Only never-reviewed drafts reach this point.
  const versionIds = (versions || []).map((v: { id: string }) => v.id);

  if (versionIds.length > 0) {
    await supabase.from("question_version_authoring").delete().in("version_id", versionIds);
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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
  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
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

  const supabaseRaw = createAdminServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  const { error } = await supabase.from("community_moderation_flags").update({ status: status.toLowerCase() }).eq("id", flagId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  return { success: true, message: "Flag resolved successfully." };
}

// ============================================================================
// ADAPTIVE TESTING ADMIN ACTIONS (PHASE 4D.1)
// ============================================================================

export async function updateAdaptiveGlobalStatusAction(
  updates: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.updateGlobalStatus(updates, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Adaptive global status updated.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update adaptive status.";
    return { error: msg };
  }
}

export async function toggleAdaptiveEmergencyAction(
  disabled: boolean,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.toggleEmergencyDisable(disabled, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: disabled ? "Emergency disable enabled." : "Emergency disable cleared.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to toggle emergency disable.";
    return { error: msg };
  }
}

export async function updateAdaptiveSafetyLimitsAction(
  limits: any,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.updateSafetyLimits(limits, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Adaptive safety limits updated.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update safety limits.";
    return { error: msg };
  }
}

export async function createAdaptiveAlgorithmVersionAction(
  params: any,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.createAlgorithmVersion(params, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Algorithm version created successfully.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create algorithm version.";
    return { error: msg };
  }
}

export async function activateAdaptiveAlgorithmVersionAction(
  versionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.activateAlgorithmVersion(versionId, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: `Activated algorithm version: ${result.version_code}`, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to activate algorithm version.";
    return { error: msg };
  }
}

export async function saveAdaptiveConfigAction(
  config: any,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const result = await AdminAdaptiveService.saveAdaptiveConfig(config, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
      reason,
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Adaptive test configuration saved.", data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save adaptive config.";
    return { error: msg };
  }
}

// ============================================================================
// ADAPTIVE CALIBRATION ADMIN ACTIONS (PHASE 4D.2)
// ============================================================================

export async function recalibrateItemAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    const result = await AdaptiveCalibrationService.recalibrateQuestionVersion(
      questionVersionId,
      { reason },
      { actorId: authCheck.userId || null, actorEmail: authCheck.userEmail || "admin@system.local" }
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: `Item recalibrated (${result.sample_size} responses).`, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to recalibrate item.";
    return { error: msg };
  }
}

export async function recalibrateBatchAction(
  questionVersionIds: string[],
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    const result = await AdaptiveCalibrationService.recalibrateBatch(
      questionVersionIds,
      { reason },
      { actorId: authCheck.userId || null, actorEmail: authCheck.userEmail || "admin@system.local" }
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: `Batch recalibrated ${result.processedCount} items.`, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to recalibrate batch.";
    return { error: msg };
  }
}

export async function flagQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.flagQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item flagged for review." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to flag item.";
    return { error: msg };
  }
}

export async function unflagQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.unflagQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item unflagged successfully." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to unflag item.";
    return { error: msg };
  }
}

export async function deprecateQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.deprecateQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item deprecated and excluded from adaptive tests." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to deprecate item.";
    return { error: msg };
  }
}

export async function restoreQuestionVersionAction(
  questionVersionId: string,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    await AdaptiveCalibrationService.restoreQuestionVersion(questionVersionId, reason, {
      actorId: authCheck.userId || null,
      actorEmail: authCheck.userEmail || "admin@system.local",
    });
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Item restored to active pool." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to restore item.";
    return { error: msg };
  }
}

export async function getItemCalibrationDetailAction(
  questionVersionId: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdaptiveCalibrationService } = await import("@/services/adaptive/adaptive-calibration.service");
    const detail = await AdaptiveCalibrationService.getItemCalibrationDetail(questionVersionId);
    return { success: true, data: detail };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch item detail.";
    return { error: msg };
  }
}

export async function updateEstimatorConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updateEstimatorConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Estimator configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update estimator configuration.";
    return { error: msg };
  }
}

export async function getAttemptAbilityDetailAction(
  attemptId: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const detail = await AdminAdaptiveService.getAttemptAbilityDetail(attemptId);
    return { success: true, data: detail };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch attempt ability detail.";
    return { error: msg };
  }
}





export async function getCATConfigAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const config = await AdminAdaptiveService.getCATConfig();
    return { success: true, data: config };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch CAT configuration.";
    return { error: msg };
  }
}

export async function updateCATConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updateCATConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "CAT selection configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update CAT selection configuration.";
    return { error: msg };
  }
}

export async function getCATHealthAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const health = await AdminAdaptiveService.getCATHealth();
    return { success: true, data: health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch CAT health telemetry.";
    return { error: msg };
  }
}

export async function getItemInformationExplorerAction(
  targetTheta: number = 0.0,
  limit: number = 50
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const items = await AdminAdaptiveService.getItemInformationExplorer(targetTheta, limit);
    return { success: true, data: items };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to explore item information.";
    return { error: msg };
  }
}


export async function getStoppingConfigAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const config = await AdminAdaptiveService.getStoppingConfig();
    return { success: true, data: config };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch stopping configuration.";
    return { error: msg };
  }
}

export async function updateStoppingConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updateStoppingConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Stopping configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update stopping configuration.";
    return { error: msg };
  }
}

export async function getStoppingHealthAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const health = await AdminAdaptiveService.getStoppingHealth();
    return { success: true, data: health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch stopping health.";
    return { error: msg };
  }
}

export async function getPersonalizationConfigAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const config = await AdminAdaptiveService.getPersonalizationConfig();
    return { success: true, data: config };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch personalization configuration.";
    return { error: msg };
  }
}

export async function updatePersonalizationConfigAction(
  config: Record<string, unknown>,
  reason: string
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const updated = await AdminAdaptiveService.updatePersonalizationConfig(
      config,
      reason,
      authCheck.userEmail || "admin@system.local"
    );
    revalidatePath("/admin/adaptive");
    return { success: true, message: "Personalization configuration updated successfully.", data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update personalization configuration.";
    return { error: msg };
  }
}

export async function getPersonalizationHealthAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const health = await AdminAdaptiveService.getPersonalizationHealth();
    return { success: true, data: health };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch personalization health.";
    return { error: msg };
  }
}

// ============================================================================
// PHASE 4D.6: ADAPTIVE ANALYTICS & ADMIN INTELLIGENCE ACTIONS
// ============================================================================

export async function getAdaptiveOverviewAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAdaptiveOverview(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch adaptive overview.";
    return { error: msg };
  }
}

export async function getCandidateIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getCandidateIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch candidate intelligence.";
    return { error: msg };
  }
}

export async function getCandidateAdaptiveDetailAction(userId: string, examId?: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getCandidateAdaptiveDetail(userId, examId);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch candidate detail.";
    return { error: msg };
  }
}

export async function getItemIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getItemIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch item intelligence.";
    return { error: msg };
  }
}

export async function getCATIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getCATIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch CAT intelligence.";
    return { error: msg };
  }
}

export async function getAbilityIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAbilityIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch ability intelligence.";
    return { error: msg };
  }
}

export async function getStoppingIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getStoppingIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch stopping intelligence.";
    return { error: msg };
  }
}

export async function getPersonalizationIntelligenceAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getPersonalizationIntelligence(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch personalization intelligence.";
    return { error: msg };
  }
}

export async function getAlgorithmComparisonAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAlgorithmComparison(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch algorithm comparison.";
    return { error: msg };
  }
}

export async function getAdaptiveHealthAction(filters?: Record<string, unknown>): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAdaptiveHealth(filters);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch adaptive health.";
    return { error: msg };
  }
}

export async function getDataQualityDiagnosticsAction(): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getDataQualityDiagnostics();
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch data quality diagnostics.";
    return { error: msg };
  }
}

export async function getAttemptDiagnosticsAction(attemptId: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) return { error: "Unauthorized: Admin privileges required." };

  try {
    const { AdminAdaptiveService } = await import("@/services/admin-adaptive.service");
    const data = await AdminAdaptiveService.getAttemptDiagnostics(attemptId);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch attempt diagnostics.";
    return { error: msg };
  }
}

