"use server";


import { guardAdminAction, toActionFailure, sanitizeActionResult } from "@/lib/auth/require-admin";
import { AdminContentStudioService, type LearningAccessLevel } from "@/services/admin-content-studio.service";
import {
  LessonDocumentSpec,
  DocumentType,
  AuthorType,
} from "@/types/learning-compiler";
import { revalidatePath } from "next/cache";

export async function getStudioDashboardStatsAction() {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const stats = await AdminContentStudioService.getDashboardStats();
    return { success: true, stats };
  } catch (err: any) {
    return toActionFailure("getStudioDashboardStatsAction", err);
  }
}

export async function getAcademicHierarchyAction(examId?: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const tree = await AdminContentStudioService.getAcademicHierarchy(examId);
    return { success: true, tree };
  } catch (err: any) {
    return toActionFailure("getAcademicHierarchyAction", err);
  }
}

export async function getLearningUnitDetailAction(unitId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const detail = await AdminContentStudioService.getLearningUnitDetail(unitId);
    return { success: true, detail };
  } catch (err: any) {
    return toActionFailure("getLearningUnitDetailAction", err);
  }
}

export async function createLearningDocumentAction(params: {
  learningUnitId: string;
  canonicalSlug: string;
  documentType: DocumentType;
  accessLevel?: LearningAccessLevel;
}) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const doc = await AdminContentStudioService.createDocument(params);
    revalidatePath("/admin/content");
    return { success: true, doc };
  } catch (err: any) {
    return toActionFailure("createLearningDocumentAction", err);
  }
}

/* GAP2-2a: access level (admin only — enforced in the service), unit creation, archive. */
export async function setDocumentAccessLevelAction(documentId: string, accessLevel: LearningAccessLevel) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const doc = await AdminContentStudioService.setDocumentAccessLevel(documentId, accessLevel);
    revalidatePath("/admin/content");
    revalidatePath("/articles");
    return { success: true, doc };
  } catch (err: any) {
    return toActionFailure("setDocumentAccessLevelAction", err);
  }
}

export async function createLearningUnitAction(params: {
  topicId: string;
  title: string;
  slug: string;
  unitType: DocumentType;
  estimatedMinutes?: number;
}) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const unit = await AdminContentStudioService.createLearningUnit(params);
    revalidatePath("/admin/content");
    return { success: true, unit };
  } catch (err: any) {
    return toActionFailure("createLearningUnitAction", err);
  }
}

export async function archiveLearningDocumentAction(documentId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const doc = await AdminContentStudioService.archiveDocument(documentId);
    revalidatePath("/admin/content");
    revalidatePath("/articles");
    return { success: true, doc };
  } catch (err: any) {
    return toActionFailure("archiveLearningDocumentAction", err);
  }
}

export async function createDraftVersionAction(params: {
  documentId: string;
  spec: LessonDocumentSpec;
  authorType?: AuthorType;
}) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const version = await AdminContentStudioService.createDraftVersion(params);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return toActionFailure("createDraftVersionAction", err);
  }
}

export async function getVersionSpecAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const res = await AdminContentStudioService.getVersionSpec(versionId);
    return sanitizeActionResult("getVersionSpecAction", await (res));
  } catch (err: any) {
    return { ...toActionFailure("getVersionSpecAction", err), spec: null, compiledMdx: null, version: null };
  }
}

export async function createRevisionAction(params: {
  documentId: string;
  baseVersionId?: string;
  authorType?: AuthorType;
}) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const version = await AdminContentStudioService.createRevision(params);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return toActionFailure("createRevisionAction", err);
  }
}

export async function saveDraftSpecAction(params: {
  versionId: string;
  spec: LessonDocumentSpec;
}) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const res = await AdminContentStudioService.saveDraftSpec(params);
    revalidatePath("/admin/content");
    return { success: true, validation: res.validation };
  } catch (err: any) {
    return toActionFailure("saveDraftSpecAction", err);
  }
}

export async function submitForReviewAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const version = await AdminContentStudioService.submitForReview(versionId);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return toActionFailure("submitForReviewAction", err);
  }
}

export async function reviewVersionAction(params: {
  versionId: string;
  decision: "APPROVED" | "REJECTED";
  feedback?: string;
}) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const version = await AdminContentStudioService.reviewVersion(params);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return toActionFailure("reviewVersionAction", err);
  }
}

export async function compileVersionAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const res = await AdminContentStudioService.compileVersion(versionId);
    revalidatePath("/admin/content");
    return { success: true, result: res.result };
  } catch (err: any) {
    return toActionFailure("compileVersionAction", err);
  }
}

export async function publishVersionAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const res = await AdminContentStudioService.publishVersion(versionId);
    revalidatePath("/admin/content");
    return { success: true, document: res.document, version: res.version };
  } catch (err: any) {
    return toActionFailure("publishVersionAction", err);
  }
}

export async function searchQuestionBankAction(query: string, filters?: { subjectId?: string; topicId?: string }) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const questions = await AdminContentStudioService.searchQuestionBank(query, filters);
    return { success: true, questions };
  } catch (err: any) {
    return toActionFailure("searchQuestionBankAction", err);
  }
}

export async function searchAssetsAction(query?: string, assetType?: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const assets = await AdminContentStudioService.searchAssets(query, assetType);
    return { success: true, assets };
  } catch (err: any) {
    return toActionFailure("searchAssetsAction", err);
  }
}

export async function getCurriculumCoverageAction(examId?: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  try {
    const report = await AdminContentStudioService.getCurriculumCoverage(examId);
    return { success: true, report };
  } catch (err: any) {
    return toActionFailure("getCurriculumCoverageAction", err);
  }
}

export async function generateLessonWithAIAction(params: {
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
  directives?: any;
  providerId?: 'MOCK' | 'GOOGLE_GEMINI';
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AIGenerationOrchestrator } = await import('@/services/ai/ai-generation-orchestrator.service');
    const user = await guardAdminAction({ allowStaff: true });
    if (!user.ok) return sanitizeActionResult("generateLessonWithAIAction", await (user));
    const result = await AIGenerationOrchestrator.generateFromCurriculum({
      learningUnitId: params.learningUnitId,
      documentType: params.documentType,
      targetExamId: params.targetExamId,
      directives: params.directives,
      adminUserId: user.userId || 'admin',
      adminEmail: user.userEmail,
      providerId: params.providerId,
    });
    revalidatePath("/admin/content");
    return { success: true, result };
  } catch (err: any) {
    return toActionFailure("generateLessonWithAIAction", err);
  }
}

export async function getCurriculumAIContextAction(params: {
  learningUnitId: string;
  targetExamId?: string;
  directives?: any;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumContextBuilder } = await import('@/services/ai/curriculum-context-builder.service');
    const __auth = await guardAdminAction({ allowStaff: true });
    if (!__auth.ok) return __auth;
    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      directives: params.directives,
    });
    return { success: true, context };
  } catch (err: any) {
    return toActionFailure("getCurriculumAIContextAction", err);
  }
}

export async function regenerateSectionAction(params: {
  learningUnitId: string;
  documentType: DocumentType;
  currentSpec: LessonDocumentSpec;
  sectionId: string;
  directives?: any;
  providerId?: 'MOCK' | 'GOOGLE_GEMINI';
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AIGenerationOrchestrator } = await import('@/services/ai/ai-generation-orchestrator.service');
    const user = await guardAdminAction({ allowStaff: true });
    if (!user.ok) return sanitizeActionResult("regenerateSectionAction", await (user));
    const result = await AIGenerationOrchestrator.regenerateSection({
      learningUnitId: params.learningUnitId,
      documentType: params.documentType,
      currentSpec: params.currentSpec,
      sectionId: params.sectionId,
      directives: params.directives,
      adminUserId: user.userId || 'admin',
      adminEmail: user.userEmail,
      providerId: params.providerId,
    });
    revalidatePath("/admin/content");
    return { success: true, result };
  } catch (err: any) {
    return toActionFailure("regenerateSectionAction", err);
  }
}

export async function generateExternalAiPromptAction(params: {
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
  directives?: any;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumContextBuilder } = await import('@/services/ai/curriculum-context-builder.service');
    const { ExternalAIContentPromptBuilder } = await import('@/services/ai/external-ai-prompt-builder.service');

    const __auth1 = await guardAdminAction({ allowStaff: true });
    if (!__auth1.ok) return __auth1;
    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      requestedDocumentType: params.documentType,
      directives: params.directives,
    });

    const promptResult = ExternalAIContentPromptBuilder.buildPrompt(context, params.documentType);
    return { success: true, promptResult, context };
  } catch (err: any) {
    return toActionFailure("generateExternalAiPromptAction", err);
  }
}

export async function validateExternalAiContentAction(params: {
  rawInput: string;
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumContextBuilder } = await import('@/services/ai/curriculum-context-builder.service');
    const { StructuredContentImporter } = await import('@/services/ai/structured-content-importer.service');

    const __auth2 = await guardAdminAction({ allowStaff: true });
    if (!__auth2.ok) return __auth2;
    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      requestedDocumentType: params.documentType,
    });

    const allowedQuestionIds = context.questionReferences?.map((q) => q.questionVersionId);
    const { spec, validation } = StructuredContentImporter.validateContent(
      params.rawInput,
      params.documentType,
      allowedQuestionIds
    );

    return { success: true, spec, validation };
  } catch (err: any) {
    return toActionFailure("validateExternalAiContentAction", err);
  }
}

export async function importExternalAiContentAction(params: {
  rawInput: string;
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
  aiToolUsed?: string;
  aiModelVersion?: string;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumContextBuilder } = await import('@/services/ai/curriculum-context-builder.service');
    const { StructuredContentImporter } = await import('@/services/ai/structured-content-importer.service');

    const user = await guardAdminAction({ allowStaff: true });
    if (!user.ok) return sanitizeActionResult("importExternalAiContentAction", await (user));
    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      requestedDocumentType: params.documentType,
    });

    const allowedQuestionIds = context.questionReferences?.map((q) => q.questionVersionId);
    const result = await StructuredContentImporter.importAndCreateDraft(
      {
        rawInput: params.rawInput,
        learningUnitId: params.learningUnitId,
        documentType: params.documentType,
        targetExamId: params.targetExamId,
        aiToolUsed: params.aiToolUsed || 'Unknown',
        aiModelVersion: params.aiModelVersion,
        contextHash: context.contextHash,
        adminUserId: user.userId || 'admin',
        adminEmail: user.userEmail,
      },
      allowedQuestionIds
    );

    revalidatePath('/admin/content');
    return { success: true, result };
  } catch (err: any) {
    return toActionFailure("importExternalAiContentAction", err);
  }
}

export async function getCurriculumCoverageMatrixAction(filters?: {
  examId?: string;
  subjectId?: string;
  topicId?: string;
  search?: string;
  documentType?: DocumentType;
  status?: any;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumCoverageService } = await import('@/services/curriculum-coverage.service');
    const __auth3 = await guardAdminAction({ allowStaff: true });
    if (!__auth3.ok) return __auth3;
    const matrix = await CurriculumCoverageService.getCurriculumCoverageMatrix(undefined, filters);
    return { success: true, matrix };
  } catch (err: any) {
    return toActionFailure("getCurriculumCoverageMatrixAction", err);
  }
}

export async function getCurriculumQualityMetricsAction() {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumCoverageService } = await import('@/services/curriculum-coverage.service');
    const __auth4 = await guardAdminAction({ allowStaff: true });
    if (!__auth4.ok) return __auth4;
    const metrics = await CurriculumCoverageService.getCurriculumQualityMetrics();
    return { success: true, metrics };
  } catch (err: any) {
    return toActionFailure("getCurriculumQualityMetricsAction", err);
  }
}

export async function mapUnitToExamAction(params: {
  learningUnitId: string;
  examTopicMappingId: string;
  requiredDepth?: string;
  importanceTier?: string;
  isMandatory?: boolean;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumCoverageService } = await import('@/services/curriculum-coverage.service');
    const __auth5 = await guardAdminAction({ allowStaff: true });
    if (!__auth5.ok) return __auth5;
    const res = await CurriculumCoverageService.mapUnitToExam(params);
    revalidatePath('/admin/content');
    return sanitizeActionResult("mapUnitToExamAction", await (res));
  } catch (err: any) {
    return toActionFailure("mapUnitToExamAction", err);
  }
}

export async function checkDuplicateLearningUnitAction(topicId: string, titleOrSlug: string) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumCoverageService } = await import('@/services/curriculum-coverage.service');
    const __auth6 = await guardAdminAction({ allowStaff: true });
    if (!__auth6.ok) return __auth6;
    const res = await CurriculumCoverageService.checkDuplicateLearningUnit(topicId, titleOrSlug);
    return { success: true, ...res };
  } catch (err: any) {
    return toActionFailure("checkDuplicateLearningUnitAction", err);
  }
}

export async function getAuthoringQueueAction(filters?: any) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    const __auth7 = await guardAdminAction({ allowStaff: true });
    if (!__auth7.ok) return __auth7;
    const queue = await AuthoringQueueService.getAuthoringQueue(undefined, filters);
    return { success: true, queue };
  } catch (err: any) {
    return toActionFailure("getAuthoringQueueAction", err);
  }
}

export async function generateTaskPromptAction(params: {
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    const __auth8 = await guardAdminAction({ allowStaff: true });
    if (!__auth8.ok) return __auth8;
    const prompt = await AuthoringQueueService.generateTaskPrompt(
      params.learningUnitId,
      params.documentType,
      params.targetExamId
    );
    return { success: true, prompt };
  } catch (err: any) {
    return toActionFailure("generateTaskPromptAction", err);
  }
}

export async function generateBatchPromptBundleAction(params: {
  taskIds: string[];
  options?: any;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    const __auth9 = await guardAdminAction({ allowStaff: true });
    if (!__auth9.ok) return __auth9;
    const bundle = await AuthoringQueueService.generateBatchPromptBundle(
      params.taskIds,
      params.options
    );
    return { success: true, bundle };
  } catch (err: any) {
    return toActionFailure("generateBatchPromptBundleAction", err);
  }
}

export async function importTaskOutputAction(params: {
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
  rawInput: string;
  aiToolUsed?: string;
  aiModelVersion?: string;
  expectedContextHash?: string;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    const user = await guardAdminAction({ allowStaff: true });
    if (!user.ok) return sanitizeActionResult("importTaskOutputAction", await (user));
    const result = await AuthoringQueueService.importTaskOutput({
      ...params,
      adminUserId: user.userId || 'admin',
      adminEmail: user.userEmail,
    });
    revalidatePath('/admin/content');
    return { success: true, result };
  } catch (err: any) {
    return toActionFailure("importTaskOutputAction", err);
  }
}

export async function getQueueSummaryAction(filters?: any) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    const __auth10 = await guardAdminAction({ allowStaff: true });
    if (!__auth10.ok) return __auth10;
    const summary = await AuthoringQueueService.getQueueSummary(undefined, filters);
    return { success: true, summary };
  } catch (err: any) {
    return toActionFailure("getQueueSummaryAction", err);
  }
}
