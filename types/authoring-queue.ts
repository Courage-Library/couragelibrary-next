/**
 * COURAGE LIBRARY — AUTHORING QUEUE TYPES
 * Phase 3F.4: Controlled Authoring Queue & Batch Prompt Operations
 */

import { DocumentType } from '@/types/learning-compiler';
import { AuthoringReadinessState } from '@/services/canonical-curriculum-blueprint.service';

export type AuthoringTaskStatus =
  | 'PENDING'
  | 'PROMPT_READY'
  | 'PROMPT_COPIED'
  | 'AWAITING_EXTERNAL_AI'
  | 'OUTPUT_RECEIVED'
  | 'VALIDATED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'COMPILED'
  | 'PUBLISHED'
  | 'VALIDATION_FAILED'
  | 'REJECTED'
  | 'CANCELLED';

// Alias for UI compatibility
export type AuthoringWorkflowStatus = AuthoringTaskStatus;

export type AuthoringTaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type AuthoringPriority = AuthoringTaskPriority;

export interface AuthoringTask {
  id: string; // Deterministic: task-${learningUnitId}-${documentType}
  learningUnitId: string;
  learningUnitTitle: string;
  learningUnitSlug: string;
  unitTitle: string;
  unitSlug: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  documentType: DocumentType;
  examId: string | null;
  examTitle: string | null;
  targetExamId?: string;
  priority: AuthoringTaskPriority;
  status: AuthoringTaskStatus;
  workflowStatus: AuthoringWorkflowStatus;
  readiness: AuthoringReadinessState;
  promptText: string | null;
  contextHash: string | null;
  promptContractVersion: string;
  assignedTo: string | null;
  assignedEmail: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  notes: string | null;
  failureReason: string | null;
  latestDocumentId: string | null;
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  isRevision: boolean;
  questionCount: number;
  pyqCount: number;
}

// Alias for UI
export type AuthoringQueueTask = AuthoringTask;

export interface AuthoringQueueFilters {
  examId?: string;
  subjectId?: string;
  topicId?: string;
  learningUnitId?: string;
  documentType?: DocumentType;
  priority?: AuthoringTaskPriority;
  status?: AuthoringTaskStatus;
  search?: string;
  hasQuestionsOnly?: boolean;
}

export interface AuthoringQueueSummary {
  totalTasks: number;
  pendingCount: number;
  promptReadyCount: number;
  awaitingAiCount: number;
  inReviewCount: number;
  approvedCount: number;
  publishedCount: number;
  validationFailedCount: number;
  byPriority: Record<AuthoringTaskPriority, number>;
  byDocumentType: Record<DocumentType, number>;
}

export interface BatchPromptBundleResult {
  bundleText: string;
  bundleMarkdown?: string;
  taskCount: number;
  tasks: Array<{
    taskId: string;
    learningUnitId: string;
    unitTitle: string;
    documentType: DocumentType;
    contextHash: string;
    promptLength: number;
  }>;
}
