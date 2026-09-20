/**
 * COURAGE LIBRARY — AUTHORING QUEUE & BATCH OPERATIONS SERVICE
 * Phase 3F.4: Controlled Authoring Queue & Batch Prompt Operations
 * 
 * Core Capabilities:
 * 1. Controlled, human-operated Authoring Queue derived dynamically from Curriculum Coverage & Blueprint
 * 2. Deterministic Task Identity: task-${learningUnitId}-${documentType}
 * 3. Batch Prompt Generation & Clean Bundled Export (Zero auto-API calls)
 * 4. Stale Prompt Protection (Context Hash Staleness Check)
 * 5. Target Identity Matching & Mismatch Rejection (Rejects wrong-unit output)
 * 6. Question Bank & Asset Staleness Verification
 * 7. Human Review Gate Enforcement (AI output never auto-approved or auto-published)
 * 8. Revisions Workflow (New draft version created, published versions immutable)
 */

import { createServerSupabaseClient, createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { DocumentType, ReviewStatus } from '@/types/learning-compiler';
import { CANONICAL_DOCUMENT_TYPES } from '@/types/curriculum-coverage';
import {
  AuthoringTask,
  AuthoringTaskStatus,
  AuthoringTaskPriority,
  AuthoringQueueSummary,
  AuthoringQueueFilters,
  BatchPromptBundleResult,
} from '@/types/authoring-queue';
import { CurriculumCoverageService } from '@/services/curriculum-coverage.service';
import { CanonicalCurriculumBlueprintService, AuthoringReadinessState } from '@/services/canonical-curriculum-blueprint.service';
import { CurriculumContextBuilder } from '@/services/ai/curriculum-context-builder.service';
import { ExternalAIContentPromptBuilder } from '@/services/ai/external-ai-prompt-builder.service';
import { StructuredContentImporter } from '@/services/ai/structured-content-importer.service';

export class AuthoringQueueService {
  /**
   * Deterministic Task ID generator
   */
  static getTaskId(learningUnitId: string, documentType: DocumentType): string {
    return `task-${learningUnitId}-${documentType}`;
  }

  /**
   * Parse task ID into components
   */
  static parseTaskId(taskId: string): { learningUnitId: string; documentType: DocumentType } | null {
    if (!taskId.startsWith('task-')) return null;
    const parts = taskId.slice(5).split('-');
    const docType = parts.pop() as DocumentType;
    const learningUnitId = parts.join('-');
    if (!CANONICAL_DOCUMENT_TYPES.includes(docType)) return null;
    return { learningUnitId, documentType: docType };
  }

  /**
   * Derive operational priority deterministically from curriculum metadata
   */
  static derivePriority(
    importanceTier?: string,
    isMandatory?: boolean,
    questionCount: number = 0
  ): AuthoringTaskPriority {
    if (isMandatory && (importanceTier === 'HIGH_YIELD' || questionCount >= 5)) {
      return 'CRITICAL';
    }
    if (isMandatory || importanceTier === 'HIGH_YIELD' || questionCount >= 3) {
      return 'HIGH';
    }
    if (importanceTier === 'OPTIONAL' || questionCount === 0) {
      return 'LOW';
    }
    return 'NORMAL';
  }

  /**
   * Map slot status to authoring queue task status
   */
  static mapSlotStatusToTaskStatus(slotStatus: string, hasDraft: boolean): AuthoringTaskStatus {
    switch (slotStatus) {
      case 'PUBLISHED':
        return 'PUBLISHED';
      case 'COMPILED':
        return 'COMPILED';
      case 'APPROVED':
        return 'APPROVED';
      case 'IN_REVIEW':
        return 'IN_REVIEW';
      case 'AI_GENERATED':
        return 'AWAITING_EXTERNAL_AI';
      case 'DRAFT':
        return 'IN_REVIEW';
      case 'NOT_CREATED':
      default:
        return 'PENDING';
    }
  }

  /**
   * 1. Get Dynamic Authoring Queue Tasks
   */
  static async getQueueTasks(
    supabaseClient?: any,
    filters?: AuthoringQueueFilters
  ): Promise<AuthoringTask[]> {
    const matrix = await CurriculumCoverageService.getCurriculumCoverageMatrix(supabaseClient, {
      examId: filters?.examId,
      subjectId: filters?.subjectId,
      topicId: filters?.topicId,
      search: filters?.search,
      documentType: filters?.documentType,
    });

    const tasks: AuthoringTask[] = [];

    for (const subject of matrix.subjects) {
      if (filters?.subjectId && subject.subjectId !== filters.subjectId) {
        continue;
      }

      for (const topic of subject.topics) {
        if (filters?.topicId && topic.topicId !== filters.topicId) {
          continue;
        }

        for (const unit of topic.units) {
          if (filters?.learningUnitId && unit.unitId !== filters.learningUnitId) {
            continue;
          }

          for (const docType of CANONICAL_DOCUMENT_TYPES) {
            if (filters?.documentType && docType !== filters.documentType) {
              continue;
            }

            const slot = unit.documentTypes[docType];
            const taskId = this.getTaskId(unit.unitId, docType);
            const firstExam = unit.mappedExams?.[0];
            const priority = this.derivePriority(
              firstExam?.importanceTier,
              firstExam?.isMandatory,
              unit.linkedQuestionCount
            );

            if (filters?.priority && priority !== filters.priority) {
              continue;
            }

            if (filters?.hasQuestionsOnly && unit.linkedQuestionCount === 0) {
              continue;
            }

            const taskStatus = this.mapSlotStatusToTaskStatus(
              slot.status,
              slot.authorType === 'AI_GENERATED'
            );

            if (filters?.status && taskStatus !== filters.status) {
              continue;
            }

            const isRevision = slot.status === 'PUBLISHED' || (slot.versionNumber !== null && slot.versionNumber > 1);
            let readiness: AuthoringReadinessState = 'READY_FOR_AUTHORING';
            if (slot.status === 'PUBLISHED') {
              readiness = 'ALREADY_PUBLISHED';
            } else if (slot.status === 'DRAFT' || slot.status === 'AI_GENERATED' || slot.status === 'IN_REVIEW') {
              readiness = 'DRAFT_IN_PROGRESS';
            } else if (!unit.mappedExams || unit.mappedExams.length === 0) {
              readiness = 'MISSING_EXAM_MAPPING';
            } else if (unit.linkedQuestionCount === 0) {
              readiness = 'MISSING_QUESTION_CONTEXT';
            }

            const task: AuthoringTask = {
              id: taskId,
              learningUnitId: unit.unitId,
              learningUnitTitle: unit.unitTitle,
              learningUnitSlug: unit.unitSlug,
              unitTitle: unit.unitTitle,
              unitSlug: unit.unitSlug,
              topicId: unit.topicId,
              topicName: unit.topicName,
              subjectId: unit.subjectId,
              subjectName: unit.subjectName,
              documentType: docType,
              examId: firstExam?.examId || null,
              examTitle: firstExam?.examTitle || null,
              targetExamId: firstExam?.examId || undefined,
              priority,
              status: taskStatus,
              workflowStatus: taskStatus,
              readiness,
              promptText: null,
              contextHash: null,
              promptContractVersion: 'CL-AUTHOR-v1.0',
              assignedTo: null,
              assignedEmail: null,
              createdAt: slot.updatedAt || new Date().toISOString(),
              updatedAt: slot.updatedAt || new Date().toISOString(),
              completedAt: slot.isPublished ? (slot.updatedAt || new Date().toISOString()) : null,
              notes: null,
              failureReason: null,
              latestDocumentId: slot.documentId,
              latestVersionId: slot.versionId,
              latestVersionNumber: slot.versionNumber,
              isRevision: !!isRevision,
              questionCount: unit.linkedQuestionCount,
              pyqCount: 0,
            };

            tasks.push(task);
          }
        }
      }
    }

    return tasks;
  }

  /**
   * Alias for getQueueTasks
   */
  static async getAuthoringQueue(
    supabaseClient?: any,
    filters?: AuthoringQueueFilters
  ): Promise<AuthoringTask[]> {
    return this.getQueueTasks(supabaseClient, filters);
  }

  /**
   * 2. Generate Deterministic Prompt for a Task
   * Supports calling with taskId or (learningUnitId, documentType)
   */
  static async generateTaskPrompt(
    learningUnitIdOrTaskId: string,
    docTypeOrOptions?: any,
    targetExamIdOrClient?: any,
    supabaseClient?: any
  ): Promise<{
    taskId: string;
    learningUnitId: string;
    documentType: DocumentType;
    promptText: string;
    promptMarkdown: string;
    contextHash: string;
    promptContractVersion: string;
    context: any;
  }> {
    let unitId: string;
    let docType: DocumentType;
    let targetExamId: string | undefined;
    let client: any;

    if (learningUnitIdOrTaskId.startsWith('task-')) {
      const parsed = this.parseTaskId(learningUnitIdOrTaskId);
      if (!parsed) {
        throw new Error(`Invalid task ID "${learningUnitIdOrTaskId}". Format must be task-{unitId}-{docType}.`);
      }
      unitId = parsed.learningUnitId;
      docType = parsed.documentType;

      if (typeof docTypeOrOptions === 'string') {
        targetExamId = docTypeOrOptions;
        client = typeof targetExamIdOrClient === 'object' ? targetExamIdOrClient : supabaseClient;
      } else if (docTypeOrOptions && typeof docTypeOrOptions === 'object' && !docTypeOrOptions.from) {
        targetExamId = docTypeOrOptions.targetExamId;
        client = supabaseClient || targetExamIdOrClient;
      } else {
        client = docTypeOrOptions || targetExamIdOrClient || supabaseClient;
      }
    } else {
      unitId = learningUnitIdOrTaskId;
      docType = docTypeOrOptions as DocumentType;
      targetExamId = typeof targetExamIdOrClient === 'string' ? targetExamIdOrClient : undefined;
      client = typeof targetExamIdOrClient === 'object' ? targetExamIdOrClient : supabaseClient;
    }

    const taskId = this.getTaskId(unitId, docType);

    const readiness = await CanonicalCurriculumBlueprintService.evaluateAuthoringReadiness(unitId, client);
    if (readiness.readinessState === 'NEEDS_CURRICULUM_REVIEW') {
      throw new Error(`Cannot generate prompt: Topic requires curriculum review before AI authoring.`);
    }

    const context = await CurriculumContextBuilder.buildContext({
      learningUnitId: unitId,
      targetExamId,
      requestedDocumentType: docType,
      supabaseClient: client,
    });

    const promptResult = ExternalAIContentPromptBuilder.buildPrompt(context, docType);

    return {
      taskId,
      learningUnitId: unitId,
      documentType: docType,
      promptText: promptResult.promptText,
      promptMarkdown: promptResult.promptText,
      contextHash: context.contextHash,
      promptContractVersion: promptResult.promptContractVersion,
      context,
    };
  }

  /**
   * 3. Batch Prompt Generation & Bundle Formulation
   * Invariant: Generates independent prompts separated by distinct task headers.
   * Zero auto-API calls, zero auto-imports.
   */
  static async generateBatchPromptBundle(
    taskIds: string[],
    optionsOrClient?: any,
    supabaseClient?: any
  ): Promise<BatchPromptBundleResult> {
    if (!taskIds || taskIds.length === 0) {
      throw new Error('At least one task ID must be selected for batch prompt generation.');
    }

    const targetExamId = typeof optionsOrClient === 'object' && !optionsOrClient.from ? optionsOrClient?.targetExamId : undefined;
    const client = (optionsOrClient && optionsOrClient.from) ? optionsOrClient : (supabaseClient || optionsOrClient);

    const generatedPrompts: any[] = [];
    const bundleSections: string[] = [];

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      const res = await this.generateTaskPrompt(taskId, undefined, targetExamId, client);

      const headerNum = String(i + 1).padStart(3, '0');
      const examTitle = res.context.selectedExamProjection?.examName || 'Universal Syllabus';
      const header = [
        `============================================================`,
        `AUTHORING TASK ${headerNum}: ${res.taskId}`,
        `UNIT: ${res.context.learningUnit.title} (${res.context.learningUnit.slug})`,
        `DOCUMENT TYPE: ${res.documentType}`,
        `EXAM CONTEXT: ${examTitle}`,
        `CONTEXT HASH: ${res.contextHash}`,
        `PROMPT CONTRACT: v${res.promptContractVersion}`,
        `============================================================`,
      ].join('\n');

      bundleSections.push(`${header}\n\n${res.promptText}`);

      generatedPrompts.push({
        taskId: res.taskId,
        learningUnitId: res.learningUnitId,
        unitTitle: res.context.learningUnit.title,
        documentType: res.documentType,
        contextHash: res.contextHash,
        promptLength: res.promptText.length,
      });
    }

    const bundleText = bundleSections.join('\n\n\n' + '-'.repeat(60) + '\n\n\n');

    return {
      bundleText,
      bundleMarkdown: bundleText,
      taskCount: generatedPrompts.length,
      tasks: generatedPrompts,
    };
  }

  /**
   * 4. Structured Output Matching, Stale Context Guard & 4-Gate Import
   */
  static async importTaskOutput(
    params: {
      taskId?: string;
      learningUnitId?: string;
      documentType?: DocumentType;
      rawInput?: string;
      rawJsonInput?: string;
      expectedContextHash?: string;
      aiToolUsed?: string;
      aiModelVersion?: string;
      targetExamId?: string;
      adminUserId: string;
      adminEmail?: string;
    },
    supabaseClient?: any
  ): Promise<{
    success: boolean;
    taskId: string;
    documentVersion?: any;
    spec?: any;
    validation?: any;
    error?: string;
    message?: string;
  }> {
    let unitId = params.learningUnitId;
    let docType = params.documentType;
    let taskId = params.taskId;

    if (taskId && (!unitId || !docType)) {
      const parsed = this.parseTaskId(taskId);
      if (!parsed) {
        throw new Error(`Invalid task ID "${taskId}".`);
      }
      unitId = parsed.learningUnitId;
      docType = parsed.documentType;
    } else if (unitId && docType && !taskId) {
      taskId = this.getTaskId(unitId, docType);
    }

    if (!unitId || !docType || !taskId) {
      throw new Error('Must provide either taskId or (learningUnitId, documentType).');
    }

    const rawInput = (params.rawInput || params.rawJsonInput || '').trim();
    if (!rawInput) {
      throw new Error('rawInput or rawJsonInput is required.');
    }

    // 1. Build current curriculum context to check staleness and allowed questions
    const currentContext = await CurriculumContextBuilder.buildContext({
      learningUnitId: unitId,
      requestedDocumentType: docType,
      targetExamId: params.targetExamId,
      supabaseClient,
    });

    // 2. Stale Prompt Check
    if (params.expectedContextHash && params.expectedContextHash !== currentContext.contextHash) {
      return {
        success: false,
        taskId,
        error: 'STALE_CURRICULUM_CONTEXT',
        message: `Curriculum context has changed since prompt generation (Prompt Hash: ${params.expectedContextHash.slice(0, 8)} vs Current Hash: ${currentContext.contextHash.slice(0, 8)}). Please regenerate the prompt.`,
      };
    }

    // 3. Extract JSON and validate target matching
    let cleanJson = rawInput;
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedSpec: any;
    try {
      parsedSpec = JSON.parse(cleanJson);
    } catch (err: any) {
      return {
        success: false,
        taskId,
        error: 'INVALID_JSON',
        message: `Failed to parse AI JSON output: ${err.message}`,
      };
    }

    // 4. Target Identity Matching Guard
    const targetUnitSlug = currentContext.learningUnit.slug;
    if (parsedSpec.unitSlug && parsedSpec.unitSlug !== targetUnitSlug && !parsedSpec.unitSlug.includes(targetUnitSlug)) {
      return {
        success: false,
        taskId,
        error: 'TARGET_MISMATCH',
        message: `Output unitSlug "${parsedSpec.unitSlug}" does not match target unit slug "${targetUnitSlug}". Import blocked to prevent curriculum corruption.`,
      };
    }

    // 5. Allowed Question References Guard
    const allowedQuestionIds = currentContext.questionReferences?.map((q) => q.questionVersionId) || [];

    // 6. Execute 4-Gate Validation and Draft Version Creation
    try {
      const importResult = await StructuredContentImporter.importAndCreateDraft(
        {
          rawInput: cleanJson,
          learningUnitId: unitId,
          documentType: docType,
          targetExamId: params.targetExamId || currentContext.selectedExamProjection?.examId,
          aiToolUsed: params.aiToolUsed || 'External AI Studio',
          aiModelVersion: params.aiModelVersion,
          contextHash: currentContext.contextHash,
          adminUserId: params.adminUserId,
          adminEmail: params.adminEmail,
          supabaseClient,
        },
        allowedQuestionIds
      );

      const versionNum = importResult.documentVersion?.version_number ?? 1;

      return {
        success: true,
        taskId,
        documentVersion: importResult.documentVersion,
        spec: importResult.spec,
        validation: importResult.validation,
        message: `Structured output successfully validated and imported as AI_GENERATED draft (v${versionNum}). Ready for human review.`,
      };
    } catch (err: any) {
      return {
        success: false,
        taskId,
        error: 'VALIDATION_FAILED',
        message: err.message || 'Validation failed during content import.',
      };
    }
  }

  /**
   * 5. Queue Summary KPIs
   */
  static async getQueueSummary(
    supabaseClient?: any,
    filters?: AuthoringQueueFilters
  ): Promise<AuthoringQueueSummary> {
    const tasks = await this.getQueueTasks(supabaseClient, filters);

    const summary: AuthoringQueueSummary = {
      totalTasks: tasks.length,
      pendingCount: 0,
      promptReadyCount: 0,
      awaitingAiCount: 0,
      inReviewCount: 0,
      approvedCount: 0,
      publishedCount: 0,
      validationFailedCount: 0,
      byPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0 },
      byDocumentType: {
        CONCEPT_LESSON: 0,
        WORKED_EXAMPLES: 0,
        FORMULA_SHORTCUT_SHEET: 0,
        COMMON_TRAPS_AND_MISTAKES: 0,
        PYQ_DEEP_DIVE: 0,
        TOPIC_SUMMARY_REVISION: 0,
      },
    };

    for (const t of tasks) {
      if (t.status === 'PENDING') summary.pendingCount++;
      else if (t.status === 'PROMPT_READY') summary.promptReadyCount++;
      else if (t.status === 'AWAITING_EXTERNAL_AI') summary.awaitingAiCount++;
      else if (t.status === 'IN_REVIEW') summary.inReviewCount++;
      else if (t.status === 'APPROVED') summary.approvedCount++;
      else if (t.status === 'PUBLISHED') summary.publishedCount++;
      else if (t.status === 'VALIDATION_FAILED') summary.validationFailedCount++;

      if (summary.byPriority[t.priority] !== undefined) {
        summary.byPriority[t.priority]++;
      }
      if (summary.byDocumentType[t.documentType] !== undefined) {
        summary.byDocumentType[t.documentType]++;
      }
    }

    return summary;
  }
}
