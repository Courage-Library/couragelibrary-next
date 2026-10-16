"use server";


import { guardAdminAction, toActionFailure } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";
import { ExamReadinessService, ExamReadinessReport } from "@/services/exam-onboarding/exam-readiness.service";
import { ExamOnboardingContextBuilder } from "@/services/exam-onboarding/exam-onboarding-context-builder.service";
import { ExamOnboardingPromptService } from "@/services/exam-onboarding/exam-onboarding-prompt.service";
import { ExamOnboardingValidatorService } from "@/services/exam-onboarding/exam-onboarding-validator.service";
import { ExamOnboardingImporterService } from "@/services/exam-onboarding/exam-onboarding-importer.service";
import { ExamOnboardingSpec } from "@/types/exam-onboarding";

export interface ExamActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  data?: any;
}

/**
 * Server Action: Create Draft Exam
 */
export async function createExamDraftAction(
  prevState: ExamActionResult | null,
  formData: FormData
): Promise<ExamActionResult> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  const title = (formData.get("title") as string || "").trim();
  const slug = (formData.get("slug") as string || "").trim();
  const orgId = (formData.get("orgId") as string || "").trim();
  const newOrgName = (formData.get("newOrgName") as string || "").trim();
  const newOrgWebsite = (formData.get("newOrgWebsite") as string || "").trim();
  const category = (formData.get("category") as string || "National Recruitment").trim();
  const description = (formData.get("description") as string || "").trim();
  const cycleYearStr = (formData.get("cycleYear") as string || "").trim();
  const cycleYear = cycleYearStr ? parseInt(cycleYearStr, 10) : undefined;

  if (!title) return { error: "Exam Title is required." };

  try {
    const result = await ExamOnboardingService.createExamDraft({
      title,
      slug: slug || undefined,
      orgId: orgId || undefined,
      newOrgName: newOrgName || undefined,
      newOrgWebsite: newOrgWebsite || undefined,
      category,
      description,
      cycleYear: cycleYear && !isNaN(cycleYear) ? cycleYear : undefined,
    });

    revalidatePath("/admin/exams");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/exam-knowledge");
    return {
      success: true,
      message: `Exam "${result.title}" registered successfully.`,
      data: result,
    };
  } catch (err: any) {
    return toActionFailure("createExamDraftAction", err);
  }
}

/**
 * Server Action: Update Exam Identity
 */
export async function updateExamIdentityAction(
  prevState: ExamActionResult | null,
  formData: FormData
): Promise<ExamActionResult> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  const examId = formData.get("examId") as string;
  const title = (formData.get("title") as string || "").trim();
  const slug = (formData.get("slug") as string || "").trim();
  const orgId = (formData.get("orgId") as string || "").trim();
  const category = (formData.get("category") as string || "").trim();
  const description = (formData.get("description") as string || "").trim();

  if (!examId || !title) return { error: "Exam ID and Title are required." };

  try {
    await ExamOnboardingService.updateExamIdentity(examId, {
      title,
      slug: slug || undefined,
      orgId: orgId || undefined,
      category: category || undefined,
      description,
    });

    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/onboarding?examId=${examId}`);
    return { success: true, message: "Exam identity updated successfully." };
  } catch (err: any) {
    return toActionFailure("updateExamIdentityAction", err);
  }
}

/**
 * Server Action: Create or Update Exam Cycle
 */
export async function createOrUpdateExamCycleAction(
  prevState: ExamActionResult | null,
  formData: FormData
): Promise<ExamActionResult> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  const examId = formData.get("examId") as string;
  const cycleId = (formData.get("cycleId") as string || "").trim();
  const cycleYearStr = formData.get("cycleYear") as string;
  const cycleName = (formData.get("cycleName") as string || "").trim();
  const notificationDate = (formData.get("notificationDate") as string || "").trim();
  const applicationStartDate = (formData.get("applicationStartDate") as string || "").trim();
  const applicationEndDate = (formData.get("applicationEndDate") as string || "").trim();

  if (!examId) return { error: "Exam ID is required." };
  const cycleYear = parseInt(cycleYearStr, 10) || new Date().getFullYear();

  try {
    const cycle = await ExamOnboardingService.createOrUpdateCycle(examId, {
      cycleId: cycleId || undefined,
      cycleYear,
      cycleName: cycleName || undefined,
      notificationDate: notificationDate || null,
      applicationStartDate: applicationStartDate || null,
      applicationEndDate: applicationEndDate || null,
    });

    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/onboarding?examId=${examId}`);
    return {
      success: true,
      message: `Recruitment cycle ${cycle.cycleYear} configured successfully.`,
      data: cycle,
    };
  } catch (err: any) {
    return toActionFailure("createOrUpdateExamCycleAction", err);
  }
}

/**
 * Server Action: Save Generic Post Profile
 */
export async function saveExamPostAction(
  prevState: ExamActionResult | null,
  formData: FormData
): Promise<ExamActionResult> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  const examId = formData.get("examId") as string;
  const postId = (formData.get("postId") as string || "").trim();
  const postName = (formData.get("postName") as string || "").trim();
  const postCode = (formData.get("postCode") as string || "").trim();
  const department = (formData.get("department") as string || "").trim();
  const ministry = (formData.get("ministry") as string || "").trim();
  const classificationGroup = (formData.get("classificationGroup") as string || "Group B").trim();
  const isGazetted = formData.get("isGazetted") === "true" || formData.get("isGazetted") === "on";
  const payLevelStr = formData.get("payLevel") as string;
  const payLevel = payLevelStr ? parseInt(payLevelStr, 10) : 7;

  if (!examId || !postName) return { error: "Exam ID and Post Name are required." };

  try {
    const result = await ExamOnboardingService.saveExamPost({
      id: postId || undefined,
      examId,
      postName,
      postCode: postCode || null,
      department: department || null,
      ministry: ministry || null,
      classificationGroup: classificationGroup || null,
      isGazetted,
      payLevel,
    });

    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/onboarding?examId=${examId}`);
    return { success: true, message: `Post "${postName}" saved successfully.`, data: result };
  } catch (err: any) {
    return toActionFailure("saveExamPostAction", err);
  }
}

/**
 * Server Action: Delete Exam Post
 */
export async function deleteExamPostAction(postId: string, examId: string): Promise<ExamActionResult> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  try {
    await ExamOnboardingService.deleteExamPost(postId, examId);
    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/onboarding?examId=${examId}`);
    return { success: true, message: "Post removed successfully." };
  } catch (err: any) {
    return toActionFailure("deleteExamPostAction", err);
  }
}


/**
 * Server Action: Evaluate Server-Authoritative Readiness
 */
export async function evaluateExamReadinessAction(
  examId: string,
  cycleId?: string | null
): Promise<{ success: boolean; report?: ExamReadinessReport; error?: string }> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  try {
    const report = await ExamReadinessService.evaluateReadiness(examId, cycleId);
    return { success: true, report };
  } catch (err: any) {
    return toActionFailure("evaluateExamReadinessAction", err);
  }
}

/**
 * Server Action: Publish Exam (Server-Authoritative Gate)
 */
export async function publishExamAction(
  examId: string,
  cycleId?: string | null
): Promise<ExamActionResult> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  try {
    const result = await ExamOnboardingService.publishExam(examId, cycleId);
    revalidatePath("/admin/exams");
    revalidatePath("/exams");
    revalidatePath(`/exams/${result.readinessReport.examSlug}`);
    return {
      success: true,
      message: `Exam "${result.readinessReport.examTitle}" is now live and published to the Candidate Knowledge Hub!`,
      data: result,
    };
  } catch (err: any) {
    return toActionFailure("publishExamAction", err);
  }
}

/**
 * Server Action: Archive / Unpublish Exam
 */
export async function archiveExamAction(examId: string): Promise<ExamActionResult> {
  const auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!auth.ok) return auth;

  try {
    await ExamOnboardingService.archiveExam(examId);
    revalidatePath("/admin/exams");
    revalidatePath("/exams");
    return { success: true, message: "Exam archived to draft status." };
  } catch (err: any) {
    return toActionFailure("archiveExamAction", err);
  }
}

/**
 * Server Action: Evaluate Exam Deletion Eligibility
 */
export async function evaluateExamDeletionEligibilityAction(
  examId: string
): Promise<{ success: boolean; report?: import("@/services/exam-onboarding/exam-onboarding.service").ExamDeletionEligibilityReport; error?: string }> {
  const auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!auth.ok) return auth;

  try {
    const report = await ExamOnboardingService.evaluateExamDeletionEligibility(examId);
    return { success: true, report };
  } catch (err: any) {
    return toActionFailure("evaluateExamDeletionEligibilityAction", err);
  }
}

/**
 * Server Action: Permanently Delete Exam (Guarded by Dependency Safety & Exact Slug Confirmation)
 */
export async function deleteExamDraftAction(
  examId: string,
  confirmationSlug: string
): Promise<ExamActionResult> {
  const auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!auth.ok) return auth;

  try {
    const result = await ExamOnboardingService.deleteExam(
      examId,
      confirmationSlug,
      auth.userId,
      auth.userEmail
    );

    revalidatePath("/admin/exams");
    revalidatePath("/exams");
    revalidatePath("/admin/exam-knowledge");

    return {
      success: true,
      message: `Examination "${result.deletedExam.title}" (${result.deletedExam.slug}) was permanently deleted.`,
      data: result.deletedExam,
    };
  } catch (err: any) {
    return toActionFailure("deleteExamDraftAction", err);
  }
}

/**
 * Server Action: Generate Master AI Research Prompt
 */
export async function generateMasterExamPromptAction(
  params: {
    examId?: string;
    examName: string;
    cycleYear?: number;
    category?: string;
    conductingOrgName?: string;
    additionalInstructions?: string;
  }
): Promise<{ success: boolean; promptText?: string; promptVersion?: string; contextHash?: string; error?: string }> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  if (!params.examName && !params.examId) {
    return { success: false, error: "Exam name or Exam ID is required." };
  }

  try {
    const context = await ExamOnboardingContextBuilder.buildContext({
      examId: params.examId,
      examName: params.examName,
      cycleYear: params.cycleYear,
      category: params.category,
      conductingOrgName: params.conductingOrgName,
    });

    const result = ExamOnboardingPromptService.generateMasterPrompt(context, params.additionalInstructions);
    return {
      success: true,
      promptText: result.promptText,
      promptVersion: result.promptVersion,
      contextHash: result.contextHash,
    };
  } catch (err: any) {
    return toActionFailure("generateMasterExamPromptAction", err);
  }
}

/**
 * Server Action: Generate Context-Aware Per-Step AI Prompt
 */
export async function generateStepExamPromptAction(
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6,
  params: {
    examId?: string;
    examName: string;
    cycleYear?: number;
    conductingOrgName?: string;
  }
): Promise<{ success: boolean; promptText?: string; promptVersion?: string; contextHash?: string; stepName?: string; error?: string }> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  try {
    const context = await ExamOnboardingContextBuilder.buildContext({
      examId: params.examId,
      examName: params.examName,
      cycleYear: params.cycleYear,
      conductingOrgName: params.conductingOrgName,
    });

    const result = ExamOnboardingPromptService.generateStepPrompt(stepNumber, context);
    return {
      success: true,
      promptText: result.promptText,
      promptVersion: result.promptVersion,
      contextHash: result.contextHash,
      stepName: result.stepName,
    };
  } catch (err: any) {
    return toActionFailure("generateStepExamPromptAction", err);
  }
}

/**
 * Server Action: Validate and Preview AI-Assisted Exam Import
 */
export async function validateAndPreviewAiImportAction(
  rawJson: string,
  options?: {
    targetExamName?: string;
    targetCycleYear?: number;
    expectedContextHash?: string;
  }
): Promise<{ success: boolean; preview?: any; error?: string }> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  try {
    const preview = await ExamOnboardingImporterService.generateImportPreview(rawJson, options);
    return { success: true, preview };
  } catch (err: any) {
    return toActionFailure("validateAndPreviewAiImportAction", err);
  }
}

/**
 * Server Action: Commit AI-Assisted Exam Import to Draft
 */
export async function commitAiExamImportAction(
  spec: ExamOnboardingSpec,
  options?: {
    resolvedConflicts?: Record<string, any>;
  }
): Promise<{ success: boolean; result?: any; error?: string }> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;

  try {
    const commitRes = await ExamOnboardingImporterService.commitImportDraft(spec, {
      resolvedConflicts: options?.resolvedConflicts,
      adminUserId: auth.userId,
    });

    revalidatePath("/admin/exams");
    revalidatePath(`/admin/exams/onboarding?examId=${commitRes.examId}`);

    return {
      success: true,
      result: commitRes,
    };
  } catch (err: any) {
    return toActionFailure("commitAiExamImportAction", err);
  }
}

