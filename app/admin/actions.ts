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

/**
 * Server Action: Execute Bulk Content Ingestion (Preview or Commit)
 */
export async function executeBulkImportAction(payload: BulkImportPayload): Promise<BulkImportResult> {
  const result = await BulkImportEngine.processImport(payload);
  if (payload.mode === "commit") {
    revalidatePath("/admin");
    revalidatePath("/admin/questions");
    revalidatePath("/admin/mock-tests");
    revalidatePath("/admin/content");
    revalidatePath("/admin/descriptive");
    revalidatePath("/admin/institutes");
    revalidatePath("/admin/community");
    revalidatePath("/admin/billing");
  }
  return result;
}

/**
 * Server Action: Create Question with Complete Hierarchy, Options, and Answer Key
 */
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

  // 4. Insert Hidden Answer Key & Explanation
  await supabase.from("question_answers").insert({
    question_version_id: qvData.id,
    correct_option_key: correctOptionKey,
    explanation_md: explanation || null,
  });

  // 5. Insert Question Source if PYQ
  if (pyqYear || pyqSource) {
    await supabase.from("question_sources").insert({
      question_id: qData.id,
      exam_name: pyqSource || "Competitive Exam",
      year: pyqYear || new Date().getFullYear(),
      source_type: "pyq",
    });
  }

  revalidatePath("/admin/questions");
  return { success: true, message: "Question created successfully." };
}

/**
 * Server Action: Update Existing Question Hierarchy & Content
 */
export async function updateQuestionHierarchyAction(
  questionId: string,
  formData: FormData
): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
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

  if (!statement) {
    return { error: "Question statement is required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;

  // 1. Update Base Question Topic
  await supabase
    .from("questions")
    .update({ canonical_topic_id: topicId || null, updated_at: new Date().toISOString() })
    .eq("id", questionId);

  // 2. Fetch or create version
  const { data: qv } = await supabase
    .from("question_versions")
    .select("id")
    .eq("question_id", questionId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  let qvId = qv?.id;
  if (qvId) {
    await supabase
      .from("question_versions")
      .update({
        question_text: statement,
        difficulty,
        language: language === "hindi" || language === "hi" ? "hi" : "en",
        options_type: optionsType,
        question_image_url: questionImageUrl,
      })
      .eq("id", qvId);
  } else {
    const { data: newQv } = await supabase
      .from("question_versions")
      .insert({
        question_id: questionId,
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
    qvId = newQv?.id;
  }

  if (qvId) {
    // 3. Update options
    await supabase.from("question_options").delete().eq("question_version_id", qvId);
    const optionsRows = [
      { question_version_id: qvId, option_key: "A", option_text: optAText, option_image_url: optAImg, order_index: 1 },
      { question_version_id: qvId, option_key: "B", option_text: optBText, option_image_url: optBImg, order_index: 2 },
      { question_version_id: qvId, option_key: "C", option_text: optCText, option_image_url: optCImg, order_index: 3 },
      { question_version_id: qvId, option_key: "D", option_text: optDText, option_image_url: optDImg, order_index: 4 },
    ];
    await supabase.from("question_options").insert(optionsRows);

    // 4. Update hidden answer key
    await supabase.from("question_answers").upsert(
      {
        question_version_id: qvId,
        correct_option_key: correctOptionKey,
        explanation_md: explanation || null,
      },
      { onConflict: "question_version_id" }
    );
  }

  revalidatePath("/admin/questions");
  return { success: true, message: "Question updated successfully." };
}

/**
 * Server Action: Legacy Create Question compatibility
 */
export async function createQuestionAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  return createQuestionHierarchyAction(prevState, formData);
}

/**
 * Server Action: Toggle Question Publish State
 */
export async function toggleQuestionPublishAction(questionId: string, currentStatus: boolean): Promise<AdminActionResult> {
  return toggleQuestionStatusAction(questionId, currentStatus ? "published" : "draft");
}

/**
 * Server Action: Toggle Question Status (Deactivate / Activate without deletion)
 */
export async function toggleQuestionStatusAction(questionId: string, currentStatus: string): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const nextStatus = currentStatus === "published" ? "draft" : "published";

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("questions").update({ status: nextStatus }).eq("id", questionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/questions");
  return { success: true, message: `Question status updated to ${nextStatus.toUpperCase()}.` };
}

/**
 * Server Action: Create Mock Test
 */
export async function createMockTestAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const durationMinutes = Number(formData.get("durationMinutes") || 60);
  const totalMarks = Number(formData.get("totalMarks") || 100);

  if (!title || !slug) {
    return { error: "Title and slug are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("mock_tests").insert({
    title,
    slug,
    duration_minutes: durationMinutes,
    total_marks: totalMarks,
    total_questions: 20,
    status: "published",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/mock-tests");
  return { success: true, message: "Mock test created successfully." };
}

/**
 * Server Action: Toggle Mock Test Publish State
 */
export async function toggleMockTestPublishAction(mockTestId: string, currentStatus: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const nextStatus = currentStatus ? "draft" : "published";
  const { error } = await supabase.from("mock_tests").update({ status: nextStatus }).eq("id", mockTestId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/mock-tests");
  return { success: true, message: "Mock test status updated." };
}

/**
 * Server Action: Create Article
 */
export async function createArticleAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const contentMarkdown = formData.get("contentMarkdown") as string;

  if (!title || !slug) {
    return { error: "Title and slug are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("articles").insert({
    title,
    slug,
    content_markdown: contentMarkdown || "",
    status: "published",
    reading_time_minutes: 5,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { success: true, message: "Article created successfully." };
}

/**
 * Server Action: Create Course
 */
export async function createCourseAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const priceInr = Number(formData.get("priceInr") || 0);

  if (!title || !slug) {
    return { error: "Title and slug are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("courses").insert({
    title,
    slug,
    price_inr: priceInr,
    is_published: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { success: true, message: "Course created successfully." };
}

/**
 * Server Action: Create Descriptive Prompt
 */
export async function createDescriptiveAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const title = formData.get("title") as string;
  const promptText = formData.get("promptText") as string;
  const maxWordCount = Number(formData.get("maxWordCount") || 500);

  if (!title || !promptText) {
    return { error: "Title and prompt text are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("descriptive_prompts").insert({
    title,
    prompt_text: promptText,
    max_word_count: maxWordCount,
    is_active: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/descriptive");
  return { success: true, message: "Descriptive prompt created successfully." };
}

/**
 * Server Action: Create Institute
 */
export async function createInstituteAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const city = formData.get("city") as string;

  if (!name || !slug) {
    return { error: "Institute name and slug are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("institutes").insert({
    name,
    slug,
    city: city || null,
    is_verified: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/institutes");
  return { success: true, message: "Institute created successfully." };
}

/**
 * Server Action: Create Subscription Plan
 */
export async function createSubscriptionPlanAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const name = formData.get("name") as string;
  const code = formData.get("code") as string;
  const priceInr = Number(formData.get("priceInr") || 499);
  const durationDays = Number(formData.get("durationDays") || 30);

  if (!name || !code) {
    return { error: "Plan name and code are required." };
  }

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

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true, message: "Subscription plan created successfully." };
}

/**
 * Server Action: Resolve Community Flag
 */
export async function resolveCommunityFlagAction(flagId: string, status: string = "resolved"): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("community_moderation_flags").update({ status: status.toLowerCase() }).eq("id", flagId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/community");
  return { success: true, message: "Flag resolved successfully." };
}
