/**
 * COURAGE LIBRARY — QUESTION FACTORY TYPES
 * Phase QF-1: Question Factory Core
 *
 * Contract: CL-QUESTION-AUTHOR-v1.0 · Spec: QuestionAuthoringSpec v1.0.0
 *
 * Pipeline:
 *   Context Builder → Versioned Prompt Contract → External AI (copy-paste, UNTRUSTED)
 *   → Importer → 5 Gates → DRAFT → Human Review → Atomic Publish (immutable version)
 *   → Candidate-visible only when PUBLISHED.
 */

export const QUESTION_CONTRACT_VERSION = 'CL-QUESTION-AUTHOR-v1.0' as const;
export const QUESTION_SPEC_VERSION = '1.0.0' as const;

export const QF_MAX_ITEMS_PER_BATCH = 25;
export const QF_MAX_PAYLOAD_BYTES = 200 * 1024;
export const QF_MAX_STEM_CHARS = 2000;
export const QF_MAX_OPTION_CHARS = 500;
export const QF_MIN_EXPLANATION_CHARS = 40;
export const QF_MAX_EXPLANATION_CHARS = 6000;
export const QF_MAX_RATIONALE_CHARS = 600;
export const QF_MAX_COGNITIVE_TRAP_CHARS = 64;
export const QF_MAX_CLIENT_REF_CHARS = 64;
export const QF_MAX_PYQ_REFERENCE_CHARS = 300;
export const QF_MAX_CONTEXT_CHARS = 32000;
export const QF_MAX_EXISTING_STEMS = 60;
export const QF_STEM_PREVIEW_CHARS = 160;
export const QF_NEAR_DUP_REJECT_THRESHOLD = 0.85;
export const QF_NEAR_DUP_WARN_THRESHOLD = 0.7;

export const QF_OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type QuestionOptionKey = (typeof QF_OPTION_KEYS)[number];

export const QF_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type QuestionDifficulty = (typeof QF_DIFFICULTIES)[number];

export const QF_LANGUAGES = ['en', 'hi'] as const;
export type QuestionLanguage = (typeof QF_LANGUAGES)[number];

export const QF_SOURCE_TYPES = ['ORIGINAL', 'PYQ', 'ADAPTED'] as const;
export type QuestionSourceType = (typeof QF_SOURCE_TYPES)[number];

export const QF_LIFECYCLE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'SUPERSEDED',
] as const;
export type QuestionLifecycleStatus = (typeof QF_LIFECYCLE_STATUSES)[number];

export const QF_ORIGINS = ['MANUAL', 'CSV_IMPORT', 'AI_EXTERNAL', 'ERRATA', 'LEGACY_UNKNOWN'] as const;
export type QuestionOrigin = (typeof QF_ORIGINS)[number];

/** Transitions the review workflow may request (publish is a separate atomic call). */
export const QF_REVIEW_TRANSITIONS: Record<QuestionLifecycleStatus, QuestionLifecycleStatus[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED', 'REJECTED'],
  CHANGES_REQUESTED: ['DRAFT'],
  APPROVED: [],
  PUBLISHED: [],
  REJECTED: [],
  SUPERSEDED: [],
};

/** Reviewer checklist (D10): every item must be confirmed before APPROVED. */
export const QF_REVIEW_CHECKLIST_ITEMS = [
  { id: 'correct_key_verified', label: 'Correct answer key independently verified' },
  { id: 'explanation_correct', label: 'Explanation is correct and explains why the trap is wrong' },
  { id: 'no_ambiguity', label: 'Stem and options are unambiguous (exactly one defensible answer)' },
  { id: 'topic_correct', label: 'Mapped topic / subtopic is correct' },
  { id: 'difficulty_sensible', label: 'Difficulty level is sensible for the target exam' },
  { id: 'provenance_verified', label: 'Provenance verified (PYQ exam/year real, or original work)' },
] as const;
export type QuestionReviewChecklistId = (typeof QF_REVIEW_CHECKLIST_ITEMS)[number]['id'];
export type QuestionReviewChecklist = Record<QuestionReviewChecklistId, boolean>;

// ---------------------------------------------------------------------------
// QuestionAuthoringSpec v1.0.0
// ---------------------------------------------------------------------------

export interface QuestionAuthoringTarget {
  topicId: string;
  subtopicId?: string | null;
  examId?: string | null;
}

export interface QuestionAuthoringOption {
  key: QuestionOptionKey;
  text: string;
}

export interface QuestionPyqProvenance {
  examSlug: string;
  year: number;
  tier?: string | null;
  shift?: string | null;
  reference: string;
}

export interface QuestionAuthoringItem {
  clientRef: string;
  stem: string;
  language: QuestionLanguage;
  difficulty: QuestionDifficulty;
  options: QuestionAuthoringOption[];
  correctKey: QuestionOptionKey;
  explanationMd: string;
  distractorRationale?: Partial<Record<QuestionOptionKey, string>>;
  cognitiveTrap?: string;
  sourceType: QuestionSourceType;
  pyq?: QuestionPyqProvenance;
}

export interface QuestionAuthoringSpec {
  specVersion: typeof QUESTION_SPEC_VERSION;
  contractVersion: typeof QUESTION_CONTRACT_VERSION;
  contextHash: string;
  target: QuestionAuthoringTarget;
  items: QuestionAuthoringItem[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface QuestionDifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export interface QuestionContextRequest {
  topicId: string;
  subtopicId?: string | null;
  examId?: string | null;
  difficultyMix: QuestionDifficultyMix;
  count: number;
}

export interface QuestionAuthoringContext {
  contractVersion: typeof QUESTION_CONTRACT_VERSION;
  specVersion: typeof QUESTION_SPEC_VERSION;
  target: { topicId: string; subtopicId: string | null; examId: string | null };
  subject: { id: string; name: string; description: string };
  topic: { id: string; name: string; description: string };
  subtopic: { id: string; name: string; description: string } | null;
  exam: { id: string; slug: string; name: string; weightage: string | null; depth: string | null } | null;
  request: { count: number; difficultyMix: QuestionDifficultyMix };
  doNotDuplicateStems: string[];
  allowedCognitiveTraps: string[];
  contextHash: string;
  contextCharacters: number;
}

// ---------------------------------------------------------------------------
// Gate reports (mirrors Current Affairs ComprehensiveGateReport shape)
// ---------------------------------------------------------------------------

export type QuestionGateId =
  | 'GATE_1_SCHEMA'
  | 'GATE_2_SECURITY'
  | 'GATE_3_TAXONOMY'
  | 'GATE_4_PROVENANCE'
  | 'GATE_5_ANTI_DUPLICATE';

export interface QuestionGateReport {
  gateId: QuestionGateId;
  gateName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  details?: Record<string, unknown>;
}

export interface NearDuplicateMatch {
  /** 'EXISTING' = already in the bank on this topic; 'BATCH' = another item in this import. */
  scope: 'EXISTING' | 'BATCH';
  similarity: number;
  versionId?: string;
  clientRef?: string;
  stemPreview: string;
}

export interface QuestionItemGateReport {
  index: number;
  clientRef: string;
  passed: boolean;
  gates: Record<QuestionGateId, QuestionGateReport>;
  errors: string[];
  warnings: string[];
  nearDuplicates: NearDuplicateMatch[];
  /** Sanitized item, present only when the item passed every gate. */
  normalizedItem?: QuestionAuthoringItem;
}

export interface QuestionBatchGateReport {
  /** True when the batch envelope is valid and at least one item was accepted. */
  passed: boolean;
  batchGates: Record<QuestionGateId, QuestionGateReport>;
  items: QuestionItemGateReport[];
  acceptedCount: number;
  rejectedCount: number;
  errors: string[];
  warnings: string[];
  contextHash: string | null;
  origin: QuestionOrigin;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type QuestionImportMode = 'dry-run' | 'commit';

export interface QuestionImportItemResult {
  clientRef: string;
  questionId: string;
  versionId: string;
}

export interface QuestionImportResult {
  mode: QuestionImportMode;
  status: 'DRY_RUN' | 'IMPORTED' | 'REJECTED';
  report: QuestionBatchGateReport;
  batchId?: string;
  imported?: QuestionImportItemResult[];
  errorCode?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export interface QuestionReviewQueueFilters {
  topicId?: string;
  examId?: string;
  lifecycleStatus?: QuestionLifecycleStatus;
  origin?: QuestionOrigin;
  batchId?: string;
  limit?: number;
}

export interface QuestionReviewQueueItem {
  versionId: string;
  questionId: string;
  versionNumber: number;
  stemPreview: string;
  difficulty: string;
  language: string;
  lifecycleStatus: QuestionLifecycleStatus;
  origin: QuestionOrigin;
  topicId: string | null;
  topicName: string | null;
  importBatchId: string | null;
  createdAt: string;
}

export interface QuestionVersionDetail extends QuestionReviewQueueItem {
  stem: string;
  options: Array<{ key: string; text: string }>;
  correctKey: string | null;
  explanationMd: string | null;
  authoringMetadata: Record<string, unknown>;
  contractVersion: string | null;
  contextHash: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  gateReport: QuestionItemGateReport | null;
  publishedAt: string | null;
  isCurrent: boolean;
}

export interface QuestionCoverageRow {
  topicId: string;
  topicName: string;
  counts: Record<QuestionLifecycleStatus, Record<QuestionDifficulty | 'other', number>>;
  total: number;
}

export class QuestionFactoryError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'QuestionFactoryError';
  }
}
