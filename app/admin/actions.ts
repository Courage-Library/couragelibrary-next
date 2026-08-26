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
 * Server Action: Create Question in Question Bank
 */
export async function createQuestionAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access. Administrative privileges required." };
  }

  const questionText = formData.get("questionText") as string;
  const difficulty = formData.get("difficulty") as string;
  const marks = Number(formData.get("marks") || 1);

  if (!questionText) {
    return { error: "Question text is required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("questions").insert({
    question_text: questionText,
    difficulty: difficulty || "MEDIUM",
    marks,
    is_published: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/questions");
  return { success: true, message: "Question created successfully." };
}

/**
 * Server Action: Toggle Question Publish State
 */
export async function toggleQuestionPublishAction(questionId: string, currentStatus: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("questions").update({ is_published: !currentStatus }).eq("id", questionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/questions");
  return { success: true, message: "Question status updated." };
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
    is_published: true,
    is_free: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/mock-tests");
  return { success: true, message: "Mock Test created successfully." };
}

/**
 * Server Action: Toggle Mock Test Publish State
 */
export async function toggleMockTestPublishAction(testId: string, currentStatus: boolean): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("mock_tests").update({ is_published: !currentStatus }).eq("id", testId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/mock-tests");
  return { success: true, message: "Mock Test status updated." };
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

  if (!title || !slug || !contentMarkdown) {
    return { error: "Title, slug, and content markdown are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { data: art, error: aErr } = await supabase
    .from("articles")
    .insert({
      title,
      slug,
      status: "PUBLISHED",
      reading_time_minutes: 5,
      access_level: "FREE",
      current_version: 1,
    })
    .select("id")
    .single();

  if (aErr) {
    return { error: aErr.message };
  }

  if (art) {
    await supabase.from("article_versions").insert({
      article_id: art.id,
      version_number: 1,
      content_markdown: contentMarkdown,
      changelog: "Initial CMS Creation",
    });
  }

  revalidatePath("/admin/content");
  return { success: true, message: "Article created and published." };
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
    return { error: "Course title and slug are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("courses").insert({
    title,
    slug,
    description: title,
    access_tier: "FREE",
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
 * Server Action: Create Descriptive Question
 */
export async function createDescriptiveAction(prevState: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const title = formData.get("title") as string;
  const questionText = formData.get("questionText") as string;
  const totalMarks = Number(formData.get("totalMarks") || 15);
  const maxWords = Number(formData.get("maxWords") || 250);

  if (!title || !questionText) {
    return { error: "Title and question text are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("descriptive_questions").insert({
    title,
    question_text: questionText,
    min_words: 100,
    max_words: maxWords,
    total_marks: totalMarks,
    is_active: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/descriptive");
  return { success: true, message: "Descriptive question created." };
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

  if (!name || !slug) {
    return { error: "Institute name and slug are required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("institutes").insert({
    name,
    slug,
    verification_status: "VERIFIED",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/institutes");
  return { success: true, message: "Coaching institute verified & created." };
}

/**
 * Server Action: Moderate Community Flag
 */
export async function resolveCommunityFlagAction(flagId: string, actionStatus: "RESOLVED" | "DISMISSED"): Promise<AdminActionResult> {
  const authCheck = await AdminService.checkIsAdminOrStaff();
  if (!authCheck.isAdmin) {
    return { error: "Unauthorized access." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("discussion_moderation_flags").update({ status: actionStatus }).eq("id", flagId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/community");
  return { success: true, message: `Moderation item set to ${actionStatus}.` };
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
  const durationDays = Number(formData.get("durationDays") || 30);
  const basePriceInr = Number(formData.get("basePriceInr") || 499);

  if (!name) {
    return { error: "Plan name is required." };
  }

  const supabaseRaw = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseRaw as any;
  const { error } = await supabase.from("subscription_plans").insert({
    name,
    duration_days: durationDays,
    base_price_inr: basePriceInr,
    is_active: true,
    features_json: ["Unlimited Mock Tests", "AI Mistake Vault", "24/7 Community Access"],
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true, message: "Subscription plan created." };
}
