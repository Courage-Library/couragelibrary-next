"use server";

import { AdminContentStudioService } from "@/services/admin-content-studio.service";
import {
  LessonDocumentSpec,
  DocumentType,
  AuthorType,
} from "@/types/learning-compiler";
import { revalidatePath } from "next/cache";

export async function getStudioDashboardStatsAction() {
  try {
    const stats = await AdminContentStudioService.getDashboardStats();
    return { success: true, stats };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getAcademicHierarchyAction(examId?: string) {
  try {
    const tree = await AdminContentStudioService.getAcademicHierarchy(examId);
    return { success: true, tree };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getLearningUnitDetailAction(unitId: string) {
  try {
    const detail = await AdminContentStudioService.getLearningUnitDetail(unitId);
    return { success: true, detail };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createLearningDocumentAction(params: {
  learningUnitId: string;
  canonicalSlug: string;
  documentType: DocumentType;
}) {
  try {
    const doc = await AdminContentStudioService.createDocument(params);
    revalidatePath("/admin/content");
    return { success: true, doc };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createDraftVersionAction(params: {
  documentId: string;
  spec: LessonDocumentSpec;
  authorType?: AuthorType;
}) {
  try {
    const version = await AdminContentStudioService.createDraftVersion(params);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function saveDraftSpecAction(params: {
  versionId: string;
  spec: LessonDocumentSpec;
}) {
  try {
    const res = await AdminContentStudioService.saveDraftSpec(params);
    revalidatePath("/admin/content");
    return { success: true, validation: res.validation };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitForReviewAction(versionId: string) {
  try {
    const version = await AdminContentStudioService.submitForReview(versionId);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewVersionAction(params: {
  versionId: string;
  decision: "APPROVED" | "REJECTED";
  feedback?: string;
}) {
  try {
    const version = await AdminContentStudioService.reviewVersion(params);
    revalidatePath("/admin/content");
    return { success: true, version };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function compileVersionAction(versionId: string) {
  try {
    const res = await AdminContentStudioService.compileVersion(versionId);
    revalidatePath("/admin/content");
    return { success: true, result: res.result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function publishVersionAction(versionId: string) {
  try {
    const res = await AdminContentStudioService.publishVersion(versionId);
    revalidatePath("/admin/content");
    return { success: true, document: res.document, version: res.version };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuestionBankAction(query: string, filters?: { subjectId?: string; topicId?: string }) {
  try {
    const questions = await AdminContentStudioService.searchQuestionBank(query, filters);
    return { success: true, questions };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchAssetsAction(query?: string, assetType?: string) {
  try {
    const assets = await AdminContentStudioService.searchAssets(query, assetType);
    return { success: true, assets };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getCurriculumCoverageAction(examId?: string) {
  try {
    const report = await AdminContentStudioService.getCurriculumCoverage(examId);
    return { success: true, report };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    const user = await AdminService.checkIsAdminOrStaff();
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
    return { success: false, error: err.message };
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
    await AdminService.checkIsAdminOrStaff();
    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      directives: params.directives,
    });
    return { success: true, context };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    const user = await AdminService.checkIsAdminOrStaff();
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
    return { success: false, error: err.message };
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

    await AdminService.checkIsAdminOrStaff();
    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      requestedDocumentType: params.documentType,
      directives: params.directives,
    });

    const promptResult = ExternalAIContentPromptBuilder.buildPrompt(context, params.documentType);
    return { success: true, promptResult, context };
  } catch (err: any) {
    return { success: false, error: err.message };
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

    await AdminService.checkIsAdminOrStaff();
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
    return { success: false, error: err.message };
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

    const user = await AdminService.checkIsAdminOrStaff();
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
    return { success: false, error: err.message };
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
    await AdminService.checkIsAdminOrStaff();
    const matrix = await CurriculumCoverageService.getCurriculumCoverageMatrix(undefined, filters);
    return { success: true, matrix };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getCurriculumQualityMetricsAction() {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumCoverageService } = await import('@/services/curriculum-coverage.service');
    await AdminService.checkIsAdminOrStaff();
    const metrics = await CurriculumCoverageService.getCurriculumQualityMetrics();
    return { success: true, metrics };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    await AdminService.checkIsAdminOrStaff();
    const res = await CurriculumCoverageService.mapUnitToExam(params);
    revalidatePath('/admin/content');
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkDuplicateLearningUnitAction(topicId: string, titleOrSlug: string) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { CurriculumCoverageService } = await import('@/services/curriculum-coverage.service');
    await AdminService.checkIsAdminOrStaff();
    const res = await CurriculumCoverageService.checkDuplicateLearningUnit(topicId, titleOrSlug);
    return { success: true, ...res };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getAuthoringQueueAction(filters?: any) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    await AdminService.checkIsAdminOrStaff();
    const queue = await AuthoringQueueService.getAuthoringQueue(undefined, filters);
    return { success: true, queue };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    await AdminService.checkIsAdminOrStaff();
    const prompt = await AuthoringQueueService.generateTaskPrompt(
      params.learningUnitId,
      params.documentType,
      params.targetExamId
    );
    return { success: true, prompt };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function generateBatchPromptBundleAction(params: {
  taskIds: string[];
  options?: any;
}) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    await AdminService.checkIsAdminOrStaff();
    const bundle = await AuthoringQueueService.generateBatchPromptBundle(
      params.taskIds,
      params.options
    );
    return { success: true, bundle };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    const user = await AdminService.checkIsAdminOrStaff();
    const result = await AuthoringQueueService.importTaskOutput({
      ...params,
      adminUserId: user.userId || 'admin',
      adminEmail: user.userEmail,
    });
    revalidatePath('/admin/content');
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getQueueSummaryAction(filters?: any) {
  try {
    const { AdminService } = await import('@/services/admin.service');
    const { AuthoringQueueService } = await import('@/services/authoring-queue.service');
    await AdminService.checkIsAdminOrStaff();
    const summary = await AuthoringQueueService.getQueueSummary(undefined, filters);
    return { success: true, summary };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
