import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { LearningResolverService, type ResolvedLearningDocument, type LearningDocumentType } from "@/services/learning/learning-resolver.service";
import { toPublicDrillQuestions } from "@/services/mistakes/drill-payload";
import { rpcJsonObject } from "@/lib/supabase/rpc";
import { validAnswerKey } from "@/lib/questions/answer-key";

export interface ResolvedLearningResource {
  id: string;
  documentType: LearningDocumentType;
  title: string;
  slug: string;
  accessLevel: "FREE" | "PRO";
  isLocked: boolean;
  readingTimeMinutes: number;
  canonicalUrl: string;
  topicId: string;
  topicName?: string | null;
}

export interface MistakeLearningContentResolution {
  hasLearningContent: boolean;
  topicId: string | null;
  topicName: string | null;
  primaryResource: ResolvedLearningResource | null;
  allResources: ResolvedLearningResource[];
  reasonIfUnavailable?: "NO_TOPIC" | "NO_CONTENT_FOR_TOPIC" | "UNPUBLISHED_ONLY" | "UNAUTHENTICATED";
}

export interface MistakeVaultSummary {
  totalMistakes: number;
  activeMistakesCount: number;
  unresolvedCount: number;
  revisitingCount: number;
  masteredCount: number;
  repeatedCount: number;
  cognitiveBreakdown: Array<{
    id: string;
    name: string;
    count: number;
    description: string;
  }>;
  weakTopics: Array<{
    topicId: string;
    topicName: string;
    mistakeCount: number;
  }>;
}

export interface MistakeListItem {
  vaultId: string;
  questionId: string;
  questionText: string;
  topicId?: string | null;
  topicName: string | null;
  subjectId?: string | null;
  subjectName: string | null;
  totalMistakesCount: number;
  consecutiveCorrect: number;
  lifecycleStatus: "UNRESOLVED" | "REVISITING" | "MASTERED";
  primaryCognitiveTypeId: string;
  primaryCognitiveName: string;
  userOverrideCognitiveTypeId: string | null;
  userCustomNotes?: string | null;
  hasNote: boolean;
  lastMistakeAt: string;
  masteredAt: string | null;
  mpi?: number;
  revisionPriority?: number;
  dueState?: RevisionDueState;
  dueLabel?: string;
  decayState?: DecayPresentationState;
  retentionScore?: number;
  retentionRisk?: number;
  effectiveStabilityDays?: number;
  hasRepeatedForgetting?: boolean;
  decayExplanation?: string;
  recommendedReviewDate?: string;
}

export interface MistakeListResult {
  items: MistakeListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MistakeFilterOptions {
  status?: string;
  cognitiveType?: string;
  repeatedOnly?: boolean;
  bookmarkedOnly?: boolean;
  dueOnly?: boolean;
  highPriorityOnly?: boolean;
  focus?: string;
  subjectId?: string;
  topicId?: string;
  searchQuery?: string;
  sortBy?: "recent" | "repeated" | "oldest" | "topic" | "priority";
  page?: number;
  pageSize?: number;
}

export interface MistakeDetail {
  vaultId: string;
  questionId: string;
  questionVersionId?: string | null;
  questionText: string;
  options: Array<{
    id: string;
    key: string;
    text: string;
    isCorrect?: boolean;
  }>;
  /** null = no valid answer key (QB-KEY-1) */
  correctOptionKey: string | null;
  explanation: string | null;
  topicId?: string | null;
  topicName: string | null;
  topicSlug: string | null;
  subjectId?: string | null;
  subjectName: string | null;
  totalMistakesCount: number;
  consecutiveCorrect: number;
  lifecycleStatus: "UNRESOLVED" | "REVISITING" | "MASTERED";
  primaryCognitiveTypeId: string;
  primaryCognitiveName: string;
  cognitiveDescription: string;
  remediationGuidance: string;
  userOverrideCognitiveTypeId: string | null;
  userCustomNotes: string | null;
  firstMistakeAt: string;
  lastMistakeAt: string;
  occurrences: Array<{
    id: string;
    sourceContext: string;
    responseTimeSeconds: number | null;
    inferredCognitiveTypeId: string;
    heuristicConfidencePct: number;
    occurredAt: string;
    questionVersionId?: string | null;
    attemptAnswerId?: string | null;
    occurrenceStatus?: "ACTIVE" | "REVOKED_ERRATA" | "REVOKED_VOID" | "SUPERSEDED" | string;
    revokedAt?: string | null;
    revocationReason?: string | null;
  }>;
  learningContent?: MistakeLearningContentResolution | null;
  mpi?: number;
  revisionPriority?: number;
  dueState?: RevisionDueState;
  dueLabel?: string;
  decayState?: DecayPresentationState;
  retentionScore?: number;
  retentionRisk?: number;
  effectiveStabilityDays?: number;
  hasRepeatedForgetting?: boolean;
  decayExplanation?: string;
  recommendedReviewDate?: string;
}

// Type aliases (not interfaces) so drill payloads are assignable to the jsonb column (questions_data: Json).
export type DrillQuestionOption = {
  id: string;
  option_key: string;
  content_text: string;
  option_text?: string;
  option_order: number;
};

export type DrillQuestionContext = {
  cognitive_type_name?: string;
  total_mistakes_count?: number;
  consecutive_correct?: number;
  last_mistake_at?: string;
  user_custom_notes?: string | null;
};

export type DrillQuestion = {
  vault_id: string;
  question_id: string;
  question_version_id?: string | null;
  question_text: string;
  primary_cognitive_type_id: string;
  consecutive_correct: number;
  options: DrillQuestionOption[];
  context?: DrillQuestionContext;
};

export type DrillQuestionPayload = DrillQuestion;

export type DrillFocusMode =
  | "ALL"
  | "UNRESOLVED"
  | "REPEATED"
  | "BOOKMARKED"
  | "DUE_REVISION"
  | "HIGH_PRIORITY"
  | "REVISITING"
  | "MASTERED_REFRESH";

export interface DrillConfigOptions {
  limit?: number; // 5, 10, 15, 20
  focus?: DrillFocusMode;
  subjectId?: string;
  topicId?: string;
  cognitiveTypeId?: string;
  mode?: "PRACTICE" | "TIMED";
  singleVaultId?: string;
}

export interface DrillSessionPayload {
  success: boolean;
  drill_id?: string;
  total_questions?: number;
  questions_count?: number;
  questions?: DrillQuestion[];
  mode?: "PRACTICE" | "TIMED";
  error?: string;
}

export interface DrillEvaluationItem {
  question_id: string;
  question_text: string;
  options: DrillQuestionOption[];
  selected_option_key: string | null;
  /** null only for an ungradable item (no answer key for the compiled version; never drilled since DRILL-1) */
  correct_option_key: string | null;
  is_correct: boolean;
  ungradable?: boolean;
  explanation: string | null;
  previous_consecutive: number;
  new_consecutive: number;
  new_status: "UNRESOLVED" | "REVISITING" | "MASTERED";
}

export interface DrillSubmissionResult {
  success: boolean;
  drill_id?: string;
  summary?: {
    total_questions: number;
    correct_count: number;
    accuracy_pct: number;
    mastered_count: number;
    revisiting_count: number;
    unresolved_count: number;
    coins_awarded: number;
  };
  evaluations?: DrillEvaluationItem[];
  error?: string;
}

export type RevisionDueState =
  | "DUE_NOW"
  | "HIGH_PRIORITY"
  | "NEEDS_ATTENTION"
  | "IMPROVING"
  | "MASTERED"
  | "DUE_REFRESH";

export interface RevisionDueStateResult {
  dueState: RevisionDueState;
  dueUrgency: number; // 0.0 to 1.0
  daysSinceSlip: number;
  daysOverdue: number;
  label: string;
  recommendationReason: string;
}

export interface NextBestRevisionItem {
  vaultId: string;
  questionId: string;
  questionText: string;
  topicId: string | null;
  topicName: string | null;
  subjectName: string | null;
  totalMistakesCount: number;
  consecutiveCorrect: number;
  lifecycleStatus: string;
  primaryCognitiveName: string;
  mpi: number;
  revisionPriority: number;
  dueState: RevisionDueState;
  dueLabel: string;
  reason: string;
  hasLearningContent: boolean;
  learningResourceUrl?: string | null;
  drillUrl: string;
}

export interface RevisionHealthSummary {
  totalMistakes: number;
  activeMistakesCount: number;
  highPriorityCount: number;
  dueForRevisionCount: number;
  improvingCount: number;
  masteredCount: number;
  healthScorePct: number;
  retentionRatePct: number;
  drillCompletionRatePct: number;
  totalDrillsCompleted: number;
  nextBestRevisions: NextBestRevisionItem[];
  patterns: {
    subjectConcentration?: { name: string; count: number; sharePct: number } | null;
    weakestTopic?: { name: string; mistakeCount: number } | null;
    primaryCognitiveMode?: { name: string; count: number; sharePct: number; hasConfidence: boolean } | null;
    fatigueBacklogCount: number;
  };
}

/**
 * Deterministic Mistake Priority Index (MPI) Formula (Certified Baseline):
 * MPI = (0.35 * Recurrence) + (0.30 * Unresolved) + (0.20 * Recency) + (0.15 * Mastery Gap)
 */
export function calculateMistakePriorityIndex(record: {
  total_mistakes_count: number;
  lifecycle_status: string;
  consecutive_correct_in_remediation: number;
  last_mistake_at: string;
}): number {
  const recurrenceScore = Math.min(record.total_mistakes_count / 5.0, 1.0);
  const unresolvedScore = record.lifecycle_status === "UNRESOLVED" ? 1.0 : record.lifecycle_status === "REVISITING" ? 0.5 : 0.0;
  const daysSinceSlip = Math.max(0, (Date.now() - new Date(record.last_mistake_at).getTime()) / (1000 * 60 * 60 * 24));
  const recencyScore = Math.max(0, 1.0 - daysSinceSlip / 30.0);
  const masteryGapScore = Math.max(0, (2 - (record.consecutive_correct_in_remediation || 0)) / 2.0);

  const mpi = (0.35 * recurrenceScore) + (0.30 * unresolvedScore) + (0.20 * recencyScore) + (0.15 * masteryGapScore);
  return Number(mpi.toFixed(4));
}

/**
 * Deterministic Revision Due-State Evaluator (Phase 4):
 * Maps candidate mistake timestamps, recurrence, and streaks to actionable revision intervals.
 */
export function calculateRevisionDueState(record: {
  lifecycle_status: string;
  total_mistakes_count: number;
  consecutive_correct_in_remediation: number;
  last_mistake_at: string;
  mastered_at?: string | null;
}): RevisionDueStateResult {
  const lastTime = new Date(record.last_mistake_at).getTime();
  const daysSinceSlip = Math.max(0, (Date.now() - lastTime) / (1000 * 60 * 60 * 24));

  if (record.lifecycle_status === "UNRESOLVED") {
    if (record.total_mistakes_count >= 2 || daysSinceSlip >= 1.0) {
      const urgency = Math.min(1.0, 0.70 + Math.min(daysSinceSlip / 7.0, 0.30));
      return {
        dueState: "DUE_NOW",
        dueUrgency: Number(urgency.toFixed(3)),
        daysSinceSlip: Math.round(daysSinceSlip),
        daysOverdue: Math.max(0, Math.round(daysSinceSlip - 1)),
        label: "Due for Revision",
        recommendationReason: record.total_mistakes_count >= 2
          ? `Repeated slip (${record.total_mistakes_count}x) needs immediate practice`
          : "Unresolved concept requiring first successful review",
      };
    }
    return {
      dueState: "NEEDS_ATTENTION",
      dueUrgency: 0.65,
      daysSinceSlip: Math.round(daysSinceSlip),
      daysOverdue: 0,
      label: "Needs Attention",
      recommendationReason: "Recent error awaiting remediation review",
    };
  }

  if (record.lifecycle_status === "REVISITING") {
    // Review window for 1st streak is 3 days
    if (daysSinceSlip >= 3.0) {
      const urgency = Math.min(1.0, 0.60 + Math.min((daysSinceSlip - 3.0) / 7.0, 0.40));
      return {
        dueState: "DUE_NOW",
        dueUrgency: Number(urgency.toFixed(3)),
        daysSinceSlip: Math.round(daysSinceSlip),
        daysOverdue: Math.round(daysSinceSlip - 3),
        label: "Due for 2nd Verification",
        recommendationReason: "1/2 streak achieved; final practice needed to reach Mastered",
      };
    }
    return {
      dueState: "IMPROVING",
      dueUrgency: 0.40,
      daysSinceSlip: Math.round(daysSinceSlip),
      daysOverdue: 0,
      label: "Improving (Streak 1/2)",
      recommendationReason: "In active revision cycle; retain momentum",
    };
  }

  // MASTERED items
  const masteredTime = record.mastered_at ? new Date(record.mastered_at).getTime() : lastTime;
  const daysSinceMastered = Math.max(0, (Date.now() - masteredTime) / (1000 * 60 * 60 * 24));

  if (daysSinceMastered >= 14.0) {
    return {
      dueState: "DUE_REFRESH",
      dueUrgency: 0.30,
      daysSinceSlip: Math.round(daysSinceMastered),
      daysOverdue: Math.round(daysSinceMastered - 14),
      label: "Retention Refresher",
      recommendationReason: "Mastered >14 days ago; refresher recommended for retention",
    };
  }

  return {
    dueState: "MASTERED",
    dueUrgency: 0.05,
    daysSinceSlip: Math.round(daysSinceMastered),
    daysOverdue: 0,
    label: "Mastered",
    recommendationReason: "Concept verified with 2 consecutive correct solutions",
  };
}

/**
 * Deterministic Revision Priority (Phase 4):
 * Extends raw MPI with due urgency, learning content bonus, and fatigue control.
 */
export function calculateRevisionPriority(params: {
  mpi: number;
  dueUrgency: number;
  hasLearningContent?: boolean;
  isRecentlyDrilled?: boolean;
}): number {
  let score = (0.70 * params.mpi) + (0.15 * params.dueUrgency);
  if (params.hasLearningContent) {
    score += 0.10;
  }
  if (params.isRecentlyDrilled) {
    score -= 0.15; // Fatigue penalty
  }
  return Number(Math.max(0.0, Math.min(1.0, score)).toFixed(4));
}

// ============================================================================
// PHASE 6 TASK 2: DEEP ERROR DECAY & LONGITUDINAL REVISION MEMORY ENGINE
// ============================================================================

export type DecayPresentationState =
  | "NOT_DUE"
  | "DUE_SOON"
  | "DUE_NOW"
  | "OVERDUE"
  | "REFRESH_DUE";

export interface ErrorDecayEvaluation {
  retentionScore: number; // R(t) in [0.0000, 1.0000]: Deterministic revision-retention heuristic
  retentionRisk: number; // 1 - R(t) in [0.0000, 1.0000]: Deterministic retention-risk / revision-urgency signal
  effectiveStabilityDays: number;
  decayState: DecayPresentationState;
  daysSinceLastRevision: number;
  daysUntilDue: number;
  recommendedReviewDate: string; // ISO String
  isRefreshDue: boolean;
  explanation: string;
}

export interface RepeatedForgettingSignal {
  hasRepeatedForgetting: boolean;
  relapseCount: number;
  explanation: string;
}

export interface LongitudinalMistakeMetrics {
  mistakesLast7Days: number;
  mistakesLast30Days: number;
  mistakesPrior30Days: number;
  velocityTrend: "ACCELERATING" | "DECELERATING" | "STABLE" | "INSUFFICIENT_DATA";
  totalRecoveries: number;
  totalRelapses: number;
  recoveryRatePct: number;
}

/**
 * Deterministic Revision-Retention / Error-Decay Heuristic (Phase 6 Task 2):
 * R(t) = exp( -t / (S * (1 + mu * C_effective)) )
 *
 * NOTE: This is a deterministic revision-prioritization heuristic, NOT a scientifically
 * validated psychological memory probability or guaranteed Ebbinghaus prediction.
 *
 * Parameters:
 * - t: Elapsed time since authoritative lifecycle anchor (days)
 * - S: Base stability constant (UNRESOLVED = 2.0d, REVISITING = 4.0d, MASTERED = 14.0d)
 * - mu: Spacing multiplier (0.50)
 * - C_effective: Bounded consecutive correct remediation count = min(C, 5)
 */
export function calculateErrorDecayHeuristic(params: {
  lifecycle_status: string;
  consecutive_correct_in_remediation?: number;
  last_event_at?: string | null;
  mastered_at?: string | null;
  referenceNow?: number;
}): number {
  const now = params.referenceNow !== undefined ? params.referenceNow : Date.now();
  const rawEventTime = params.last_event_at ? new Date(params.last_event_at).getTime() : NaN;
  const eventTime = isNaN(rawEventTime) ? now : rawEventTime;

  // Gracefully handle negative, null, or future elapsed time
  const elapsedMs = Math.max(0, now - eventTime);
  const t = elapsedMs / (1000 * 60 * 60 * 24);

  // Base stability S (days) by lifecycle status
  let baseS = 2.0;
  if (params.lifecycle_status === "MASTERED") {
    baseS = 14.0;
  } else if (params.lifecycle_status === "REVISITING") {
    baseS = 4.0;
  } else {
    baseS = 2.0;
  }

  const mu = 0.50; // Spacing bonus multiplier
  const rawC = params.consecutive_correct_in_remediation || 0;
  const cEffective = Math.min(Math.max(0, rawC), 5); // Bounded streak C_MAX = 5

  const effectiveStability = Math.max(0.5, baseS * (1 + mu * cEffective));
  const exponent = Math.max(-20, Math.min(0, -t / effectiveStability));

  const r = Math.exp(exponent);
  if (isNaN(r) || !isFinite(r)) {
    return 1.0000;
  }

  return Number(Math.max(0.0, Math.min(1.0, r)).toFixed(4));
}

/**
 * Deterministic Decay Presentation & Scheduling Evaluator (Phase 6 Task 2):
 * Computes derived scheduling state, revision-urgency signal, and human-explainable rationale.
 *
 * Exact Precedence for UNRESOLVED / REVISITING:
 * 1. OVERDUE   : R(t) < 0.35 OR daysSinceLastRevision > 2 * effectiveStabilityDays
 * 2. DUE_NOW   : R(t) < 0.60 OR total_mistakes_count >= 2 OR daysSinceLastRevision >= effectiveStabilityDays
 * 3. DUE_SOON  : R(t) < 0.85
 * 4. NOT_DUE   : R(t) >= 0.85
 *
 * Exact Precedence for MASTERED:
 * 1. REFRESH_DUE : daysSinceMastered >= 14.0 OR R(t) < 0.50
 * 2. DUE_SOON    : R(t) < 0.75
 * 3. NOT_DUE     : R(t) >= 0.75
 */
export function calculateDecayScheduleState(params: {
  lifecycle_status: string;
  total_mistakes_count: number;
  consecutive_correct_in_remediation?: number;
  last_mistake_at: string;
  mastered_at?: string | null;
  last_drill_at?: string | null;
  last_remediated_at?: string | null;
  referenceNow?: number;
}): ErrorDecayEvaluation {
  const now = params.referenceNow !== undefined ? params.referenceNow : Date.now();
  
  // Authoritative timestamp anchor selection by lifecycle:
  // - MASTERED: anchored to mastered_at (or last_drill_at if refreshed)
  // - REVISITING: anchored to last successful remediation (last_remediated_at / last_drill_at)
  // - UNRESOLVED: anchored to last_remediated_at if partial attempt, otherwise last_drill_at or last_mistake_at
  let anchorTimestamp: string | null = params.last_mistake_at;
  if (params.lifecycle_status === "MASTERED") {
    anchorTimestamp = params.mastered_at || params.last_drill_at || params.last_mistake_at;
  } else if (params.lifecycle_status === "REVISITING") {
    anchorTimestamp = params.last_remediated_at || params.last_drill_at || params.last_mistake_at;
  } else {
    anchorTimestamp = params.last_drill_at || params.last_mistake_at;
  }

  const retentionScore = calculateErrorDecayHeuristic({
    lifecycle_status: params.lifecycle_status,
    consecutive_correct_in_remediation: params.consecutive_correct_in_remediation,
    last_event_at: anchorTimestamp,
    mastered_at: params.mastered_at,
    referenceNow: now,
  });

  const rawLastTime = anchorTimestamp ? new Date(anchorTimestamp).getTime() : now;
  const lastTime = isNaN(rawLastTime) ? now : rawLastTime;
  const daysSinceLastRevision = Math.max(0, Math.round((now - lastTime) / (1000 * 60 * 60 * 24)));

  let baseS = 2.0;
  if (params.lifecycle_status === "MASTERED") baseS = 14.0;
  else if (params.lifecycle_status === "REVISITING") baseS = 4.0;

  const mu = 0.50;
  const cEffective = Math.min(Math.max(0, params.consecutive_correct_in_remediation || 0), 5);
  const effectiveStabilityDays = Number((baseS * (1 + mu * cEffective)).toFixed(2));

  let decayState: DecayPresentationState = "NOT_DUE";
  let explanation = "";
  let isRefreshDue = false;

  if (params.lifecycle_status === "MASTERED") {
    const rawMasteredTime = params.mastered_at ? new Date(params.mastered_at).getTime() : lastTime;
    const daysSinceMastered = Math.max(0, Math.round((now - rawMasteredTime) / (1000 * 60 * 60 * 24)));

    // 1. REFRESH_DUE evaluated first
    if (daysSinceMastered >= 14 || retentionScore < 0.50) {
      decayState = "REFRESH_DUE";
      isRefreshDue = true;
      explanation = `Refresh recommended — mastered ${daysSinceMastered} days ago.`;
    } else if (retentionScore < 0.75) {
      // 2. DUE_SOON
      decayState = "DUE_SOON";
      explanation = `Retention stable; refresh review approaching in upcoming days.`;
    } else {
      // 3. NOT_DUE
      decayState = "NOT_DUE";
      explanation = `Mastered concept with strong retention stability.`;
    }
  } else {
    // UNRESOLVED or REVISITING
    // 1. OVERDUE evaluated FIRST to ensure unreachable bug is impossible
    if (retentionScore < 0.35 || daysSinceLastRevision > 2 * effectiveStabilityDays) {
      decayState = "OVERDUE";
      explanation = `Overdue — last revised ${daysSinceLastRevision} days ago with ${params.consecutive_correct_in_remediation || 0} successful remediations.`;
    } else if (retentionScore < 0.60 || params.total_mistakes_count >= 2 || daysSinceLastRevision >= effectiveStabilityDays) {
      // 2. DUE_NOW evaluated SECOND
      decayState = "DUE_NOW";
      explanation = params.total_mistakes_count >= 2
        ? `Due today — repeated slip (${params.total_mistakes_count}x) needs reinforcement.`
        : `Due today — last revised ${daysSinceLastRevision} days ago.`;
    } else if (retentionScore < 0.85) {
      // 3. DUE_SOON evaluated THIRD
      decayState = "DUE_SOON";
      explanation = `Due soon — approaching scheduled spaced practice window.`;
    } else {
      // 4. NOT_DUE evaluated LAST (retentionScore >= 0.85)
      decayState = "NOT_DUE";
      explanation = `Recently practiced; retaining active revision momentum.`;
    }
  }

  const daysUntilDue = Math.max(0, Math.round(effectiveStabilityDays - daysSinceLastRevision));
  const reviewDateMs = now + (daysUntilDue * 24 * 60 * 60 * 1000);
  const recommendedReviewDate = new Date(reviewDateMs).toISOString();

  return {
    retentionScore,
    retentionRisk: Number((1.0 - retentionScore).toFixed(4)),
    effectiveStabilityDays,
    decayState,
    daysSinceLastRevision,
    daysUntilDue,
    recommendedReviewDate,
    isRefreshDue,
    explanation,
  };
}

/**
 * Repeated-Forgetting Detection (Phase 6 Task 2):
 * Chronologically identifies slips that occurred after prior successful remediation or mastery.
 *
 * Distinct cases:
 * - Mistake -> successful remediation/drill -> later mistake = DETECTED (relapse)
 * - Mastered -> later mistake = DETECTED (relapse)
 * - Repeated mistakes with NO successful remediation = NOT a relapse (persistent unresolved error)
 * - Single mistake with no prior mastery = NOT a relapse
 * - Revoked/void occurrences = strictly excluded
 */
export function detectRepeatedForgetting(
  paramsOrOccurrences?:
    | Array<{ occurred_at: string; occurrence_status?: string; is_correct?: boolean }>
    | {
        occurrences?: Array<{ occurred_at: string; occurrence_status?: string; is_correct?: boolean }>;
        totalMistakesCount?: number;
        consecutiveCorrect?: number;
        lifecycleStatus?: string;
        masteredAt?: string | null;
        hadPriorSuccess?: boolean;
      },
  totalMistakesCountArg?: number,
  consecutiveCorrectArg?: number
): RepeatedForgettingSignal {
  let occurrencesList: Array<{ occurred_at: string; occurrence_status?: string; is_correct?: boolean }> = [];
  let totalMistakes = 1;
  let consecutiveCorrect = 0;
  let masteredAt: string | null = null;
  let hadPriorSuccess = false;

  if (Array.isArray(paramsOrOccurrences)) {
    occurrencesList = paramsOrOccurrences;
    totalMistakes = totalMistakesCountArg !== undefined ? totalMistakesCountArg : Math.max(1, occurrencesList.length);
    consecutiveCorrect = consecutiveCorrectArg || 0;
  } else if (paramsOrOccurrences && typeof paramsOrOccurrences === "object") {
    occurrencesList = paramsOrOccurrences.occurrences || [];
    totalMistakes = paramsOrOccurrences.totalMistakesCount !== undefined ? paramsOrOccurrences.totalMistakesCount : Math.max(1, occurrencesList.length);
    consecutiveCorrect = paramsOrOccurrences.consecutiveCorrect || 0;
    masteredAt = paramsOrOccurrences.masteredAt || null;
    hadPriorSuccess = Boolean(paramsOrOccurrences.hadPriorSuccess);
  }

  // Filter out revoked/void occurrences
  const activeOccurrences = occurrencesList.filter(
    (o) => o.occurrence_status !== "REVOKED_ERRATA" && o.occurrence_status !== "REVOKED_VOID"
  );

  const activeCount = activeOccurrences.length > 0 ? activeOccurrences.length : totalMistakes;

  // Case 1: Was previously mastered and an active mistake exists -> relapse signal
  if (masteredAt && activeCount >= 1) {
    return {
      hasRepeatedForgetting: true,
      relapseCount: activeCount,
      explanation: "Repeatedly missed after previous revision",
    };
  }

  // Case 2: Evidence of prior remediation success (hadPriorSuccess = true or streak progress occurred before slip)
  if ((hadPriorSuccess || consecutiveCorrect > 0) && activeCount >= 2) {
    return {
      hasRepeatedForgetting: true,
      relapseCount: Math.max(1, activeCount - 1),
      explanation: "Repeatedly missed after previous revision",
    };
  }

  // Case 3: Repeated mistakes with NO prior remediation or mastery = persistent unresolved error (NOT relapse)
  if (activeCount >= 2) {
    return {
      hasRepeatedForgetting: false,
      relapseCount: 0,
      explanation: "Persistent unresolved error",
    };
  }

  // Case 4: Single initial mistake
  return {
    hasRepeatedForgetting: false,
    relapseCount: 0,
    explanation: "Single initial error",
  };
}

/**
 * Longitudinal Error Velocity & Recovery Curve Aggregations (Phase 6 Task 2):
 * Deterministic temporal window metrics with explicit minimum evidence thresholds.
 */
export function calculateLongitudinalMistakeMetrics(
  occurrences: Array<{ occurred_at: string; occurrence_status?: string }>,
  referenceNow?: number
): LongitudinalMistakeMetrics {
  const now = referenceNow !== undefined ? referenceNow : Date.now();
  const activeOccurrences = (occurrences || []).filter(
    (o) => o.occurrence_status !== "REVOKED_ERRATA" && o.occurrence_status !== "REVOKED_VOID"
  );

  let mistakesLast7Days = 0;
  let mistakesLast30Days = 0;
  let mistakesPrior30Days = 0;

  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const ms60d = 60 * 24 * 60 * 60 * 1000;

  for (const o of activeOccurrences) {
    const t = new Date(o.occurred_at).getTime();
    if (isNaN(t)) continue;
    const delta = now - t;
    if (delta < 0) continue; // skip invalid future events

    if (delta <= ms7d) {
      mistakesLast7Days++;
    }
    if (delta <= ms30d) {
      mistakesLast30Days++;
    } else if (delta <= ms60d) {
      mistakesPrior30Days++;
    }
  }

  // Velocity trend requiring >= 3 total evidence items
  let velocityTrend: "ACCELERATING" | "DECELERATING" | "STABLE" | "INSUFFICIENT_DATA" = "INSUFFICIENT_DATA";
  if (activeOccurrences.length >= 3) {
    if (mistakesLast30Days > mistakesPrior30Days * 1.3) {
      velocityTrend = "ACCELERATING";
    } else if (mistakesLast30Days < mistakesPrior30Days * 0.7) {
      velocityTrend = "DECELERATING";
    } else {
      velocityTrend = "STABLE";
    }
  }

  return {
    mistakesLast7Days,
    mistakesLast30Days,
    mistakesPrior30Days,
    velocityTrend,
    totalRecoveries: 0,
    totalRelapses: 0,
    recoveryRatePct: 0,
  };
}

export class MistakeService {
  /**
   * Records exam mistakes with full lineage provenance from test submission.
   */
  static async recordExamMistakes(params: {
    userId: string;
    attemptId: string;
    mistakes: Array<{
      questionId: string;
      questionVersionId?: string | null;
      attemptAnswerId?: string | null;
      selectedOptionId?: string | null;
      responseTimeSeconds?: number;
      cognitiveTypeId?: string;
    }>;
  }): Promise<{ success: boolean; recordedCount: number }> {
    const adminSb = createAdminServerSupabaseClient();
    let recordedCount = 0;

    // Resolve taxonomy server-side from the canonical question (never from client input).
    const questionIds = Array.from(new Set(params.mistakes.map((m) => m.questionId).filter(Boolean)));
    const taxonomyByQuestion = new Map<string, { topicId: string | null; subjectId: string | null }>();
    if (questionIds.length > 0) {
      const { data: questionRows } = await adminSb
        .from("questions")
        .select("id, canonical_topic_id, topics:canonical_taxonomy_nodes!questions_canonical_topic_id_node_fkey(subject_id:root_subject_id)")
        .in("id", questionIds);
      (questionRows || []).forEach((q: any) => {
        const topic = Array.isArray(q.topics) ? q.topics[0] : q.topics;
        taxonomyByQuestion.set(q.id, { topicId: q.canonical_topic_id ?? null, subjectId: topic?.subject_id ?? null });
      });
    }

    for (const m of params.mistakes) {
      if (!m.questionId) continue;

      const sb = adminSb;

      // 1. Get or create vault record
      let { data: vaultRecord } = await sb
        .from("user_mistake_vault")
        .select("id, total_mistakes_count")
        .eq("user_id", params.userId)
        .eq("question_id", m.questionId)
        .maybeSingle();

      if (!vaultRecord) {
        const { data: newRecord } = await sb
          .from("user_mistake_vault")
          .insert({
            user_id: params.userId,
            question_id: m.questionId,
            topic_id: taxonomyByQuestion.get(m.questionId)?.topicId ?? null,
            subject_id: taxonomyByQuestion.get(m.questionId)?.subjectId ?? null,
            total_mistakes_count: 1,
            lifecycle_status: "UNRESOLVED",
            primary_cognitive_type_id: m.cognitiveTypeId || "UNCLASSIFIED",
          })
          .select("id, total_mistakes_count")
          .single();
        vaultRecord = newRecord;
      } else {
        await sb
          .from("user_mistake_vault")
          .update({
            total_mistakes_count: (vaultRecord.total_mistakes_count || 1) + 1,
            lifecycle_status: "UNRESOLVED",
            consecutive_correct_in_remediation: 0,
            last_mistake_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", vaultRecord.id);
      }

      if (vaultRecord?.id) {
        // 2. Insert mistake occurrence with lineage
        await sb.from("user_mistake_occurrences").insert({
          vault_id: vaultRecord.id,
          user_id: params.userId,
          question_id: m.questionId,
          source_context: "MOCK_TEST",
          source_reference_id: params.attemptId,
          selected_option_id: m.selectedOptionId || null,
          response_time_seconds: m.responseTimeSeconds || null,
          inferred_cognitive_type_id: m.cognitiveTypeId || "UNCLASSIFIED",
          question_version_id: m.questionVersionId || null,
          attempt_answer_id: m.attemptAnswerId || null,
          occurrence_status: "ACTIVE",
        });
        recordedCount++;
      }
    }

    return { success: true, recordedCount };
  }

  /**
   * Fetches high-level executive metrics for candidate's Mistake Vault Cockpit.
   */
  static async getMistakeVaultSummary(userId?: string): Promise<MistakeVaultSummary> {
    const supabase = await createServerSupabaseClient();
    let currentUserId = userId;

    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          totalMistakes: 0,
          activeMistakesCount: 0,
          unresolvedCount: 0,
          revisitingCount: 0,
          masteredCount: 0,
          repeatedCount: 0,
          cognitiveBreakdown: [],
          weakTopics: [],
        };
      }
      currentUserId = user.id;
    }

    const { data: records, error } = await supabase
      .from("user_mistake_vault")
      .select("id, question_id, topic_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, topics:canonical_taxonomy_nodes!user_mistake_vault_topic_id_node_fkey(name), mistake_cognitive_types!primary_cognitive_type_id(id, name, description)")
      .eq("user_id", currentUserId)
      .gte("total_mistakes_count", 1); // F5: manual Memory Lock items (0 mistakes) are not mistakes

    if (error || !records) {
      return {
        totalMistakes: 0,
        activeMistakesCount: 0,
        unresolvedCount: 0,
        revisitingCount: 0,
        masteredCount: 0,
        repeatedCount: 0,
        cognitiveBreakdown: [],
        weakTopics: [],
      };
    }

    let unresolvedCount = 0;
    let revisitingCount = 0;
    let masteredCount = 0;
    let repeatedCount = 0;

    const cogMap: Record<string, { id: string; name: string; description: string; count: number }> = {};
    const topicMap: Record<string, { topicId: string; topicName: string; count: number }> = {};

    for (const r of records as any[]) {
      if (r.lifecycle_status === "UNRESOLVED") unresolvedCount++;
      else if (r.lifecycle_status === "REVISITING") revisitingCount++;
      else if (r.lifecycle_status === "MASTERED") masteredCount++;

      if (r.total_mistakes_count >= 2) repeatedCount++;

      const cogId = r.user_override_cognitive_type_id || r.primary_cognitive_type_id || "UNCLASSIFIED";
      const cogName = r.mistake_cognitive_types?.name || cogId;
      const cogDesc = r.mistake_cognitive_types?.description || "";

      if (!cogMap[cogId]) {
        cogMap[cogId] = { id: cogId, name: cogName, description: cogDesc, count: 0 };
      }
      cogMap[cogId].count++;

      if (r.topic_id) {
        const tId = r.topic_id;
        const tName = r.topics?.name || "General Topic";
        if (!topicMap[tId]) {
          topicMap[tId] = { topicId: tId, topicName: tName, count: 0 };
        }
        topicMap[tId].count += r.total_mistakes_count || 1;
      }
    }

    const cognitiveBreakdown = Object.values(cogMap).sort((a, b) => b.count - a.count);
    const weakTopics = Object.values(topicMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((t) => ({
        topicId: t.topicId,
        topicName: t.topicName,
        mistakeCount: t.count,
      }));

    const activeMistakesCount = unresolvedCount + revisitingCount;

    return {
      totalMistakes: records.length,
      activeMistakesCount,
      unresolvedCount,
      revisitingCount,
      masteredCount,
      repeatedCount,
      cognitiveBreakdown,
      weakTopics,
    };
  }

  /**
   * Fetches paginated mistakes with server-side filters, sorting, search, and exact counts.
   */
  static async getPaginatedMistakesList(filters?: MistakeFilterOptions): Promise<MistakeListResult> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 };
    }

    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.max(1, Math.min(100, filters?.pageSize || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Handle bookmarked filter
    let bookmarkedQuestionIds: string[] | null = null;
    if (filters?.bookmarkedOnly === true) {
      const sb = supabase;
      const { data: bookmarks } = await sb
        .from("user_question_bookmarks")
        .select("question_id")
        .eq("user_id", user.id);

      if (!bookmarks || bookmarks.length === 0) {
        return { items: [], totalCount: 0, page, pageSize, totalPages: 0 };
      }
      bookmarkedQuestionIds = bookmarks.map((b: { question_id: string }) => b.question_id);
    }

    let query = supabase
      .from("user_mistake_vault")
      .select("id, question_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, user_custom_notes, last_mistake_at, mastered_at, topic_id, subject_id, topics:canonical_taxonomy_nodes!user_mistake_vault_topic_id_node_fkey(id, name), subjects:canonical_taxonomy_nodes!user_mistake_vault_subject_id_node_fkey(id, name), mistake_cognitive_types!primary_cognitive_type_id(name), questions(question_versions(question_text))", { count: "exact" })
      .eq("user_id", user.id)
      .gte("total_mistakes_count", 1); // F5: manual Memory Lock items are not mistakes

    if (bookmarkedQuestionIds !== null) {
      query = query.in("question_id", bookmarkedQuestionIds);
    }
    if (filters?.status && filters.status !== "ALL") {
      query = query.eq("lifecycle_status", filters.status);
    }
    if (filters?.cognitiveType && filters.cognitiveType !== "ALL") {
      query = query.eq("primary_cognitive_type_id", filters.cognitiveType);
    }
    if (filters?.repeatedOnly === true) {
      query = query.gte("total_mistakes_count", 2);
    }
    if (filters?.subjectId && filters.subjectId !== "ALL") {
      query = query.eq("subject_id", filters.subjectId);
    }
    if (filters?.topicId && filters.topicId !== "ALL") {
      query = query.eq("topic_id", filters.topicId);
    }

    const sort = filters?.sortBy || "recent";
    if (sort === "repeated") {
      query = query.order("total_mistakes_count", { ascending: false }).order("last_mistake_at", { ascending: false });
    } else if (sort === "oldest") {
      query = query.order("last_mistake_at", { ascending: true });
    } else if (sort === "topic") {
      query = query.order("topic_id", { ascending: true }).order("last_mistake_at", { ascending: false });
    } else {
      query = query.order("last_mistake_at", { ascending: false });
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error || !data) {
      return { items: [], totalCount: 0, page, pageSize, totalPages: 0 };
    }

    let items: MistakeListItem[] = data.map((r) => {
      const qText = r.questions?.question_versions?.[0]?.question_text || "Question prompt unavailable";
      const customNote = r.user_custom_notes || null;
      
      const dueRes = calculateRevisionDueState({
        lifecycle_status: r.lifecycle_status,
        total_mistakes_count: r.total_mistakes_count || 1,
        consecutive_correct_in_remediation: r.consecutive_correct_in_remediation || 0,
        last_mistake_at: r.last_mistake_at,
        mastered_at: r.mastered_at,
      });

      const mpi = calculateMistakePriorityIndex({
        total_mistakes_count: r.total_mistakes_count || 1,
        lifecycle_status: r.lifecycle_status,
        consecutive_correct_in_remediation: r.consecutive_correct_in_remediation || 0,
        last_mistake_at: r.last_mistake_at,
      });

      const revisionPriority = calculateRevisionPriority({
        mpi,
        dueUrgency: dueRes.dueUrgency,
      });

      const decayRes = calculateDecayScheduleState({
        lifecycle_status: r.lifecycle_status,
        total_mistakes_count: r.total_mistakes_count || 1,
        consecutive_correct_in_remediation: r.consecutive_correct_in_remediation || 0,
        last_mistake_at: r.last_mistake_at,
        mastered_at: r.mastered_at,
      });

      const repeatedSignal = detectRepeatedForgetting(
        undefined,
        r.total_mistakes_count || 1,
        r.consecutive_correct_in_remediation || 0
      );

      return {
        vaultId: r.id,
        questionId: r.question_id,
        questionText: qText,
        topicId: r.topic_id || r.topics?.id || null,
        topicName: r.topics?.name || null,
        subjectId: r.subject_id || r.subjects?.id || null,
        subjectName: r.subjects?.name || null,
        totalMistakesCount: r.total_mistakes_count,
        consecutiveCorrect: r.consecutive_correct_in_remediation,
        lifecycleStatus: r.lifecycle_status as MistakeListItem["lifecycleStatus"],
        primaryCognitiveTypeId: r.primary_cognitive_type_id,
        primaryCognitiveName: r.mistake_cognitive_types?.name || r.primary_cognitive_type_id,
        userOverrideCognitiveTypeId: r.user_override_cognitive_type_id,
        userCustomNotes: customNote,
        hasNote: Boolean(customNote && customNote.trim().length > 0),
        lastMistakeAt: r.last_mistake_at,
        masteredAt: r.mastered_at,
        mpi,
        revisionPriority,
        dueState: dueRes.dueState,
        dueLabel: dueRes.label,
        decayState: decayRes.decayState,
        retentionScore: decayRes.retentionScore,
        retentionRisk: decayRes.retentionRisk,
        effectiveStabilityDays: decayRes.effectiveStabilityDays,
        hasRepeatedForgetting: repeatedSignal.hasRepeatedForgetting,
        decayExplanation: decayRes.explanation,
        recommendedReviewDate: decayRes.recommendedReviewDate,
      };
    });

    if (filters?.dueOnly || filters?.focus === "DUE_REVISION") {
      items = items.filter((item) => item.dueState === "DUE_NOW" || item.dueState === "DUE_REFRESH");
    }

    if (filters?.highPriorityOnly || filters?.focus === "HIGH_PRIORITY") {
      items = items.filter((item) => (item.mpi !== undefined && item.mpi >= 0.65) || item.dueState === "DUE_NOW");
    }

    if (filters?.sortBy === "priority") {
      items.sort((a, b) => {
        const pDiff = (b.revisionPriority || 0) - (a.revisionPriority || 0);
        if (pDiff !== 0) return pDiff;
        const mDiff = (b.mpi || 0) - (a.mpi || 0);
        if (mDiff !== 0) return mDiff;
        return new Date(b.lastMistakeAt).getTime() - new Date(a.lastMistakeAt).getTime();
      });
    }

    if (filters?.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim().toLowerCase();
      items = items.filter((item) =>
        item.questionText.toLowerCase().includes(q) ||
        (item.topicName && item.topicName.toLowerCase().includes(q)) ||
        (item.subjectName && item.subjectName.toLowerCase().includes(q))
      );
    }

    const totalCount = count !== null ? count : items.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Fetches user's list of mistakes with filters (backward compatible wrapper).
   */
  static async getMistakesList(filters?: MistakeFilterOptions): Promise<MistakeListItem[]> {
    const result = await this.getPaginatedMistakesList(filters);
    return result.items;
  }

  /**
   * Fetches comprehensive details of an individual mistake.
   */
  static async getMistakeDetail(vaultId: string): Promise<MistakeDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: vaultRow } = await supabase
      .from("user_mistake_vault")
      .select("*, topics:canonical_taxonomy_nodes!user_mistake_vault_topic_id_node_fkey(name, slug), subjects:canonical_taxonomy_nodes!user_mistake_vault_subject_id_node_fkey(name), mistake_cognitive_types!primary_cognitive_type_id(name, description, remediation_guidance)")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!vaultRow) return null;
    const v = vaultRow as any;

    // TYPES-1 B1 (Class B): students cannot read question_answers (RLS; E2E-07), so the question + answer embed
    // failed for the session client. Ownership is proven above (vault row of the session user); the question content
    // is then read server-side with the admin client — the same pattern as AssessmentService.getTestResult.
    const adminSb = createAdminServerSupabaseClient();
    const [occurrencesRes, questionRes] = await Promise.all([
      supabase.from("user_mistake_occurrences").select("id, source_context, response_time_seconds, inferred_cognitive_type_id, heuristic_confidence_pct, occurred_at, question_version_id, attempt_answer_id, occurrence_status, revoked_at, revocation_reason").eq("vault_id", vaultId).order("occurred_at", { ascending: false }),
      adminSb.from("questions").select("id, question_versions(id, question_text, question_options(id, option_key, option_text, order_index), question_answers(correct_option_key, explanation_md))").eq("id", v.question_id).single(),
    ]);

    const qData = questionRes.data;
    const qv = qData?.question_versions?.[0];
    // TYPES-1 B1 (Class B): question_answers is one-to-one with question_versions (object, not array).
    const qAnswer = qv?.question_answers ?? null;
    // QB-KEY-1: the valid key or null — never a default letter
    const validKey = validAnswerKey(qAnswer, qv?.question_options);

    const options = (qv?.question_options || [])
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((opt) => ({
        id: opt.id,
        key: opt.option_key,
        text: opt.option_text,
        isCorrect: validKey !== null && opt.option_key === validKey,
      }));

    const learningContent = await this.resolveLearningContentForMistake({
      questionId: v.question_id,
      topicId: v.topic_id || v.topics?.id,
    });

    const dueRes = calculateRevisionDueState({
      lifecycle_status: v.lifecycle_status,
      total_mistakes_count: v.total_mistakes_count || 1,
      consecutive_correct_in_remediation: v.consecutive_correct_in_remediation || 0,
      last_mistake_at: v.last_mistake_at,
      mastered_at: v.mastered_at,
    });

    const mpi = calculateMistakePriorityIndex({
      total_mistakes_count: v.total_mistakes_count || 1,
      lifecycle_status: v.lifecycle_status,
      consecutive_correct_in_remediation: v.consecutive_correct_in_remediation || 0,
      last_mistake_at: v.last_mistake_at,
    });

    const revisionPriority = calculateRevisionPriority({
      mpi,
      dueUrgency: dueRes.dueUrgency,
      hasLearningContent: Boolean(learningContent?.hasLearningContent),
    });

    const decayRes = calculateDecayScheduleState({
      lifecycle_status: v.lifecycle_status,
      total_mistakes_count: v.total_mistakes_count || 1,
      consecutive_correct_in_remediation: v.consecutive_correct_in_remediation || 0,
      last_mistake_at: v.last_mistake_at,
      mastered_at: v.mastered_at,
    });

    const repeatedSignal = detectRepeatedForgetting(
      occurrencesRes.data ?? [],
      v.total_mistakes_count || 1,
      v.consecutive_correct_in_remediation || 0
    );

    return {
      vaultId: v.id,
      questionId: v.question_id,
      questionVersionId: qv?.id || v.occurrences?.[0]?.question_version_id || null,
      questionText: qv?.question_text || "",
      options,
      correctOptionKey: validKey,
      explanation: qAnswer?.explanation_md || null,
      topicId: v.topic_id || v.topics?.id || null,
      topicName: v.topics?.name || null,
      topicSlug: v.topics?.slug || null,
      subjectId: v.subject_id || v.subjects?.id || null,
      subjectName: v.subjects?.name || null,
      totalMistakesCount: v.total_mistakes_count,
      consecutiveCorrect: v.consecutive_correct_in_remediation,
      lifecycleStatus: v.lifecycle_status,
      primaryCognitiveTypeId: v.primary_cognitive_type_id,
      primaryCognitiveName: v.mistake_cognitive_types?.name || v.primary_cognitive_type_id,
      cognitiveDescription: v.mistake_cognitive_types?.description || "",
      remediationGuidance: v.mistake_cognitive_types?.remediation_guidance || "",
      userOverrideCognitiveTypeId: v.user_override_cognitive_type_id,
      userCustomNotes: v.user_custom_notes,
      firstMistakeAt: v.first_mistake_at,
      lastMistakeAt: v.last_mistake_at,
      occurrences: (occurrencesRes.data || []).map((o) => ({
        id: o.id,
        sourceContext: o.source_context,
        responseTimeSeconds: o.response_time_seconds,
        inferredCognitiveTypeId: o.inferred_cognitive_type_id,
        heuristicConfidencePct: o.heuristic_confidence_pct,
        occurredAt: o.occurred_at,
        questionVersionId: o.question_version_id || null,
        attemptAnswerId: o.attempt_answer_id || null,
        occurrenceStatus: o.occurrence_status || "ACTIVE",
        revokedAt: o.revoked_at || null,
        revocationReason: o.revocation_reason || null,
      })),
      learningContent,
      mpi,
      revisionPriority,
      dueState: dueRes.dueState,
      dueLabel: dueRes.label,
      decayState: decayRes.decayState,
      retentionScore: decayRes.retentionScore,
      retentionRisk: decayRes.retentionRisk,
      effectiveStabilityDays: decayRes.effectiveStabilityDays,
      hasRepeatedForgetting: repeatedSignal.hasRepeatedForgetting,
      decayExplanation: decayRes.explanation,
      recommendedReviewDate: decayRes.recommendedReviewDate,
    };
  }

  /**
   * Updates candidate's personal revision note on a mistake record.
   */
  static async updateMistakeNote(
    vaultId: string,
    customNotes: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required to update notes." };
    }

    if (customNotes && customNotes.length > 2000) {
      return { success: false, error: "Note exceeds 2,000 character limit." };
    }

    const normalizedNote = (customNotes && customNotes.trim().length > 0) ? customNotes.trim() : null;

    const { error } = await (supabase.from("user_mistake_vault") as any).update({
      user_custom_notes: normalizedNote,
      updated_at: new Date().toISOString(),
    }).eq("id", vaultId).eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message || "Failed to update note." };
    }

    return { success: true };
  }

  /**
   * Retrieves candidate's personal revision note for a mistake.
   */
  static async getMistakeNote(vaultId: string): Promise<string | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data } = await supabase
      .from("user_mistake_vault")
      .select("user_custom_notes")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .maybeSingle();

    return data?.user_custom_notes || null;
  }

  /**
   * Updates student's custom notes or classification override.
   */
  static async updateMistakeOverride(
    vaultId: string,
    overrideCognitiveTypeId: string | null,
    customNotes?: string
  ): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    const { error } = await (supabase.from("user_mistake_vault") as any).update({
      user_override_cognitive_type_id: overrideCognitiveTypeId,
      user_custom_notes: customNotes,
      updated_at: new Date().toISOString(),
    }).eq("id", vaultId).eq("user_id", user.id);

    return !error;
  }

  /**
   * Generates a focused mistake remediation drill with customizable criteria and Mistake Priority Index (MPI).
   * Scrubbed of all answers before client delivery (ZERO ANSWER LEAKAGE).
   */
  static async generateMistakeDrill(
    config?: DrillConfigOptions | string,
    legacyCognitiveTypeId?: string,
    legacyLimit: number = 10
  ): Promise<DrillSessionPayload> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required to generate drill." };
    }

    // Support legacy signature (topicId, cognitiveTypeId, limit)
    let parsedConfig: DrillConfigOptions = {};
    if (typeof config === "string") {
      parsedConfig = {
        topicId: config,
        cognitiveTypeId: legacyCognitiveTypeId,
        limit: legacyLimit,
      };
    } else if (config) {
      parsedConfig = config;
    }

    const limit = Math.max(1, Math.min(20, parsedConfig.limit || 10));

    // Handle bookmarked focus
    let bookmarkedQuestionIds: string[] | null = null;
    if (parsedConfig.focus === "BOOKMARKED") {
      const sb = supabase;
      const { data: bookmarks } = await sb
        .from("user_question_bookmarks")
        .select("question_id")
        .eq("user_id", user.id);

      if (!bookmarks || bookmarks.length === 0) {
        return { success: false, error: "No bookmarked mistakes found in your vault." };
      }
      bookmarkedQuestionIds = bookmarks.map((b: { question_id: string }) => b.question_id);
    }

    const sb = supabase;
    let query = sb
      .from("user_mistake_vault")
      .select("id, question_id, topic_id, subject_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, user_custom_notes, last_mistake_at, mastered_at, mistake_cognitive_types!primary_cognitive_type_id(name)")
      .eq("user_id", user.id)
      .gte("total_mistakes_count", 1); // F5: drills use mistakes only

    if (parsedConfig.singleVaultId) {
      query = query.eq("id", parsedConfig.singleVaultId);
    } else {
      if (parsedConfig.focus === "UNRESOLVED") {
        query = query.eq("lifecycle_status", "UNRESOLVED");
      } else if (parsedConfig.focus === "REVISITING") {
        query = query.eq("lifecycle_status", "REVISITING");
      } else if (parsedConfig.focus === "MASTERED_REFRESH") {
        query = query.eq("lifecycle_status", "MASTERED");
      } else {
        query = query.in("lifecycle_status", ["UNRESOLVED", "REVISITING"]);
      }

      if (parsedConfig.focus === "REPEATED") {
        query = query.gte("total_mistakes_count", 2);
      }
      if (bookmarkedQuestionIds !== null) {
        query = query.in("question_id", bookmarkedQuestionIds);
      }
      if (parsedConfig.subjectId && parsedConfig.subjectId !== "ALL") {
        query = query.eq("subject_id", parsedConfig.subjectId);
      }
      if (parsedConfig.topicId && parsedConfig.topicId !== "ALL") {
        query = query.eq("topic_id", parsedConfig.topicId);
      }
      if (parsedConfig.cognitiveTypeId && parsedConfig.cognitiveTypeId !== "ALL") {
        query = query.eq("primary_cognitive_type_id", parsedConfig.cognitiveTypeId);
      }
    }

    const { data: candidateMistakes, error: queryError } = await query;
    if (queryError || !candidateMistakes || candidateMistakes.length === 0) {
      return { success: false, error: "No eligible unmastered mistakes found for the selected criteria." };
    }

    // Retrieve recent drills for fatigue detection
    const { data: recentDrills } = await sb
      .from("user_mistake_drills")
      .select("questions_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    const recentlyDrilledQIds = new Set<string>();
    (recentDrills || []).forEach((d: any) => {
      if (Array.isArray(d.questions_data)) {
        d.questions_data.forEach((q: any) => {
          if (q?.question_id) recentlyDrilledQIds.add(q.question_id);
        });
      }
    });

    // Rank candidates deterministically using MPI, Revision Due State, and Revision Priority
    let scoredMistakes = (candidateMistakes as any[]).map((m) => {
      const mpi = calculateMistakePriorityIndex({
        total_mistakes_count: m.total_mistakes_count || 1,
        lifecycle_status: m.lifecycle_status,
        consecutive_correct_in_remediation: m.consecutive_correct_in_remediation || 0,
        last_mistake_at: m.last_mistake_at,
      });

      const dueRes = calculateRevisionDueState({
        lifecycle_status: m.lifecycle_status,
        total_mistakes_count: m.total_mistakes_count || 1,
        consecutive_correct_in_remediation: m.consecutive_correct_in_remediation || 0,
        last_mistake_at: m.last_mistake_at,
        mastered_at: m.mastered_at,
      });

      const isRecentlyDrilled = recentlyDrilledQIds.has(m.question_id);

      const revisionPriority = calculateRevisionPriority({
        mpi,
        dueUrgency: dueRes.dueUrgency,
        isRecentlyDrilled,
      });

      return {
        ...m,
        mpi,
        dueState: dueRes.dueState,
        revisionPriority,
        isRecentlyDrilled,
      };
    });

    if (parsedConfig.focus === "DUE_REVISION") {
      const dueOnly = scoredMistakes.filter((m) => m.dueState === "DUE_NOW" || m.dueState === "DUE_REFRESH");
      if (dueOnly.length > 0) {
        scoredMistakes = dueOnly;
      }
    } else if (parsedConfig.focus === "HIGH_PRIORITY") {
      const hpOnly = scoredMistakes.filter((m) => m.mpi >= 0.65 || m.dueState === "DUE_NOW");
      if (hpOnly.length > 0) {
        scoredMistakes = hpOnly;
      }
    }

    // Fatigue distribution: partition into fresh and recently drilled
    const freshMistakes = scoredMistakes.filter((m) => !m.isRecentlyDrilled);
    const fatiguedMistakes = scoredMistakes.filter((m) => m.isRecentlyDrilled);

    const sortFn = (a: any, b: any) => {
      if (b.revisionPriority !== a.revisionPriority) return b.revisionPriority - a.revisionPriority;
      if (b.mpi !== a.mpi) return b.mpi - a.mpi;
      const timeDiff = new Date(b.last_mistake_at).getTime() - new Date(a.last_mistake_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.question_id).localeCompare(String(b.question_id));
    };

    freshMistakes.sort(sortFn);
    fatiguedMistakes.sort(sortFn);

    const combined = [...freshMistakes, ...fatiguedMistakes];
    const selectedMistakes = combined.slice(0, limit);
    // DRILL-1: the drill is created server-side. fn_generate_mistake_drill (SECURITY DEFINER, auth.uid()) re-checks that
    // every vault row belongs to the caller, compiles the current PUBLISHED version of each question (only versions
    // that have an answer key) and stores / returns the pre-submit projection — never answers or explanations.
    // Students hold no write grant on user_mistake_drills (decisions #39 / #42).
    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_generate_mistake_drill", {
      p_vault_ids: selectedMistakes.map((m) => m.id),
      p_topic_id: parsedConfig.topicId && parsedConfig.topicId !== "ALL" ? parsedConfig.topicId : undefined,
      p_cognitive_type_id: parsedConfig.cognitiveTypeId && parsedConfig.cognitiveTypeId !== "ALL" ? parsedConfig.cognitiveTypeId : undefined,
    });
    if (rpcError) {
      return { success: false, error: `Could not create the drill (${rpcError.code || "database error"}). Please try again.` };
    }
    const created = rpcJsonObject<{ success: boolean; code?: string; error?: string; drill_id?: string; total_questions?: number; questions?: unknown }>(rpcData);
    if (!created || !created.success || !created.drill_id) {
      return { success: false, error: created?.error || "Could not create the drill." };
    }
    const questions = toPublicDrillQuestions(created.questions);

    return {
      success: true,
      drill_id: created.drill_id,
      total_questions: questions.length,
      questions_count: questions.length,
      // Pre-submit payload: whitelist projection — never answers / keys / explanations (B2, architect ruling).
      questions,
      mode: parsedConfig.mode || "PRACTICE",
    };
  }

  /**
   * Retrieves an active or completed drill session by ID.
   */
  static async getMistakeDrill(drillId: string): Promise<DrillSessionPayload> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const { data: drill, error } = await supabase
      .from("user_mistake_drills")
      .select("*")
      .eq("id", drillId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !drill) {
      return { success: false, error: "Drill session not found or unauthorized." };
    }

    const d = drill as any;
    return {
      success: true,
      drill_id: d.id,
      total_questions: d.total_questions,
      questions_count: d.total_questions,
      // Pre-submit payload (resume): the stored JSON is re-projected through the whitelist, never passed through.
      questions: toPublicDrillQuestions(d.questions_data),
    };
  }

  /**
   * Submits candidate responses for a mistake remediation drill with server-authoritative evaluation and mastery progression.
   */
  static async submitMistakeDrill(
    drillId: string,
    responses: Array<{
      vault_id?: string;
      question_id: string;
      selected_option_key?: string;
      selected_option_id?: string;
      response_time_seconds?: number;
    }>
  ): Promise<DrillSubmissionResult> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required to submit drill." };
    }

    // DRILL-1: grading and every write happen server-side in fn_submit_mistake_drill (SECURITY DEFINER, auth.uid()):
    // ownership + open state are checked, the drill's own questions are graded against the compiled versions' answer
    // keys (client correctness / score fields are ignored, unanswered = incorrect), vault / occurrence / completion
    // writes are row-count checked and roll back together, and a second submit returns the stored result.
    // TYPES-1:B-DRILL-REWARD-ARGS — no coins are awarded (coins_awarded = 0) until Commerce wires the drill reward
    // through the service-role GamificationService; the RPC calls no reward function.
    const { data, error } = await supabase.rpc("fn_submit_mistake_drill", { p_drill_id: drillId, p_answers: responses });
    if (error) {
      return { success: false, error: `Drill submission failed (${error.code || "database error"}). Nothing was saved.` };
    }
    const result = rpcJsonObject<{
      success: boolean;
      code?: string;
      error?: string;
      drill_id?: string;
      idempotent?: boolean;
      summary?: DrillSubmissionResult["summary"];
      evaluations?: DrillEvaluationItem[];
    }>(data);
    if (!result) {
      return { success: false, error: "Drill submission returned no result." };
    }
    if (!result.success) {
      return { success: false, error: result.error || "Drill submission failed." };
    }
    return { success: true, drill_id: result.drill_id, summary: result.summary, evaluations: result.evaluations || [] };
  }

  /**
   * Dynamically loads available subjects and cognitive failure modes for filter dropdowns.
   */
  static async getAvailableFilterOptions(userId?: string): Promise<{
    subjects: Array<{ id: string; name: string }>;
    cognitiveTypes: Array<{ id: string; name: string }>;
  }> {
    const supabase = await createServerSupabaseClient();

    const [subjectsRes, cognitiveRes] = await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("mistake_cognitive_types").select("id, name").eq("is_active", true).order("display_order"),
    ]);

    return {
      subjects: (subjectsRes.data as Array<{ id: string; name: string }>) || [],
      cognitiveTypes: (cognitiveRes.data as Array<{ id: string; name: string }>) || [],
    };
  }

  /**
   * Evaluates comprehensive candidate revision health intelligence deterministically.
   * Calculates health scores, due counts, next best revision items, and cognitive patterns.
   */
  static async getRevisionHealthIntelligence(userId?: string): Promise<RevisionHealthSummary> {
    const supabase = await createServerSupabaseClient();
    let currentUserId = userId;
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      currentUserId = user?.id;
    }

    const defaultResult: RevisionHealthSummary = {
      totalMistakes: 0,
      activeMistakesCount: 0,
      highPriorityCount: 0,
      dueForRevisionCount: 0,
      improvingCount: 0,
      masteredCount: 0,
      healthScorePct: 100,
      retentionRatePct: 100,
      drillCompletionRatePct: 0,
      totalDrillsCompleted: 0,
      nextBestRevisions: [],
      patterns: {
        subjectConcentration: null,
        weakestTopic: null,
        primaryCognitiveMode: null,
        fatigueBacklogCount: 0,
      },
    };

    if (!currentUserId) {
      return defaultResult;
    }

    const sb = supabase;

    const [vaultRes, drillsRes] = await Promise.all([
      sb
        .from("user_mistake_vault")
        .select(`
          id,
          question_id,
          topic_id,
          subject_id,
          total_mistakes_count,
          consecutive_correct_in_remediation,
          lifecycle_status,
          primary_cognitive_type_id,
          user_override_cognitive_type_id,
          user_custom_notes,
          last_mistake_at,
          mastered_at,
          topics:canonical_taxonomy_nodes!user_mistake_vault_topic_id_node_fkey(id, name, slug), subjects:canonical_taxonomy_nodes!user_mistake_vault_subject_id_node_fkey(id, name),
          mistake_cognitive_types!primary_cognitive_type_id(name),
          questions(question_versions(question_text))
        `)
        .eq("user_id", currentUserId)
        .gte("total_mistakes_count", 1), // F5: manual Memory Lock items are not mistakes
      sb
        .from("user_mistake_drills")
        .select("id, status, coins_awarded, questions_data, created_at, completed_at")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false }),
    ]);

    const vaultRows = vaultRes.data || [];
    const drillRows = drillsRes.data || [];

    if (vaultRows.length === 0) {
      const completedDrills = drillRows.filter((d) => d.status === "COMPLETED").length;
      return {
        ...defaultResult,
        totalDrillsCompleted: completedDrills,
        drillCompletionRatePct: drillRows.length > 0 ? Math.round((completedDrills / drillRows.length) * 100) : 0,
      };
    }

    // Identify fatigued question IDs from recent drills (last 5 drills)
    const recentDrills = drillRows.slice(0, 5);
    const recentlyDrilledQIds = new Set<string>();
    recentDrills.forEach((d) => {
      if (Array.isArray(d.questions_data)) {
        d.questions_data.forEach((q: any) => {
          if (q?.question_id) recentlyDrilledQIds.add(q.question_id);
        });
      }
    });

    let masteredCount = 0;
    let revisitingCount = 0;
    let unresolvedCount = 0;
    let dueForRevisionCount = 0;
    let highPriorityCount = 0;
    let improvingCount = 0;

    const subjectCounts: Record<string, { name: string; count: number }> = {};
    const topicCounts: Record<string, { name: string; count: number }> = {};
    const cognitiveCounts: Record<string, { name: string; count: number }> = {};

    interface ScoredItem {
      vaultRow: any;
      mpi: number;
      dueRes: RevisionDueStateResult;
      revisionPriority: number;
      isRecentlyDrilled: boolean;
    }

    const scoredItems: ScoredItem[] = [];

    for (const r of vaultRows) {
      const status = r.lifecycle_status;
      if (status === "MASTERED") masteredCount++;
      else if (status === "REVISITING") revisitingCount++;
      else unresolvedCount++;

      const dueRes = calculateRevisionDueState({
        lifecycle_status: status,
        total_mistakes_count: r.total_mistakes_count || 1,
        consecutive_correct_in_remediation: r.consecutive_correct_in_remediation || 0,
        last_mistake_at: r.last_mistake_at,
        mastered_at: r.mastered_at,
      });

      const mpi = calculateMistakePriorityIndex({
        total_mistakes_count: r.total_mistakes_count || 1,
        lifecycle_status: status,
        consecutive_correct_in_remediation: r.consecutive_correct_in_remediation || 0,
        last_mistake_at: r.last_mistake_at,
      });

      const isRecentlyDrilled = recentlyDrilledQIds.has(r.question_id);

      const revisionPriority = calculateRevisionPriority({
        mpi,
        dueUrgency: dueRes.dueUrgency,
        isRecentlyDrilled,
      });

      if (dueRes.dueState === "DUE_NOW" || dueRes.dueState === "DUE_REFRESH") {
        dueForRevisionCount++;
      }
      if (mpi >= 0.65 || dueRes.dueState === "DUE_NOW") {
        highPriorityCount++;
      }
      if (dueRes.dueState === "IMPROVING" || status === "REVISITING") {
        improvingCount++;
      }

      // Pattern aggregations
      const sName = r.subjects?.name || "General";
      if (!subjectCounts[sName]) subjectCounts[sName] = { name: sName, count: 0 };
      subjectCounts[sName].count++;

      const tName = r.topics?.name || "Uncategorized";
      if (!topicCounts[tName]) topicCounts[tName] = { name: tName, count: 0 };
      topicCounts[tName].count++;

      const cogName = r.mistake_cognitive_types?.name || r.primary_cognitive_type_id || "Conceptual";
      if (!cognitiveCounts[cogName]) cognitiveCounts[cogName] = { name: cogName, count: 0 };
      cognitiveCounts[cogName].count++;

      scoredItems.push({
        vaultRow: r,
        mpi,
        dueRes,
        revisionPriority,
        isRecentlyDrilled,
      });
    }

    const totalMistakes = vaultRows.length;
    const activeMistakesCount = unresolvedCount + revisitingCount;
    const retentionRatePct = Math.round((masteredCount / totalMistakes) * 100);

    const completedDrills = drillRows.filter((d) => d.status === "COMPLETED").length;
    const drillCompletionRatePct = drillRows.length > 0 ? Math.round((completedDrills / drillRows.length) * 100) : 0;

    // Health Score calculation (0 - 100):
    // If no active mistakes remain (all mastered), health score is 100%
    let healthScorePct = 100;
    if (activeMistakesCount > 0) {
      const masteryComponent = (masteredCount / totalMistakes) * 50;
      const progressComponent = (revisitingCount / totalMistakes) * 25;
      const backlogRatio = dueForRevisionCount / activeMistakesCount;
      const backlogComponent = Math.max(0, 1.0 - backlogRatio) * 25;
      healthScorePct = Math.round(Math.min(100, Math.max(0, masteryComponent + progressComponent + backlogComponent)));
    }

    // Rank Next Best Revision items (top 5 unmastered, or highest priority items)
    const unmasteredCandidates = scoredItems.filter((i) => i.vaultRow.lifecycle_status !== "MASTERED");
    const candidatesToRank = unmasteredCandidates.length > 0 ? unmasteredCandidates : scoredItems;

    candidatesToRank.sort((a, b) => {
      if (b.revisionPriority !== a.revisionPriority) return b.revisionPriority - a.revisionPriority;
      if (b.mpi !== a.mpi) return b.mpi - a.mpi;
      const timeDiff = new Date(b.vaultRow.last_mistake_at).getTime() - new Date(a.vaultRow.last_mistake_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(a.vaultRow.question_id).localeCompare(String(b.vaultRow.question_id));
    });

    const top5 = candidatesToRank.slice(0, 5);
    const topTopicIds = Array.from(new Set(top5.map((i) => i.vaultRow.topic_id || i.vaultRow.topics?.id).filter(Boolean)));
    const batchContentMap = await this.getBatchLearningContentForTopics(topTopicIds);

    const nextBestRevisions: NextBestRevisionItem[] = top5.map((item) => {
      const vr = item.vaultRow;
      const tId = vr.topic_id || vr.topics?.id || null;
      const learningRes = tId ? batchContentMap[tId] : null;
      const qText = vr.questions?.question_versions?.[0]?.question_text || "Question prompt unavailable";

      return {
        vaultId: vr.id,
        questionId: vr.question_id,
        questionText: qText,
        topicId: tId,
        topicName: vr.topics?.name || null,
        subjectName: vr.subjects?.name || null,
        totalMistakesCount: vr.total_mistakes_count || 1,
        consecutiveCorrect: vr.consecutive_correct_in_remediation || 0,
        lifecycleStatus: vr.lifecycle_status,
        primaryCognitiveName: vr.mistake_cognitive_types?.name || vr.primary_cognitive_type_id,
        mpi: item.mpi,
        revisionPriority: item.revisionPriority,
        dueState: item.dueRes.dueState,
        dueLabel: item.dueRes.label,
        reason: item.dueRes.recommendationReason,
        hasLearningContent: Boolean(learningRes?.hasLearningContent),
        learningResourceUrl: learningRes?.primaryResource?.canonicalUrl || null,
        drillUrl: `/mistakes/drill?vaultId=${vr.id}`,
      };
    });

    // Patterns computation
    // 1. Subject concentration
    const sortedSubjects = Object.values(subjectCounts).sort((a, b) => b.count - a.count);
    const topSubject = sortedSubjects[0];
    const subjectConcentration = topSubject && topSubject.count > 0 ? {
      name: topSubject.name,
      count: topSubject.count,
      sharePct: Math.round((topSubject.count / totalMistakes) * 100),
    } : null;

    // 2. Weakest topic
    const sortedTopics = Object.values(topicCounts).sort((a, b) => b.count - a.count);
    const topTopic = sortedTopics[0];
    const weakestTopic = topTopic && topTopic.count > 0 ? {
      name: topTopic.name,
      mistakeCount: topTopic.count,
    } : null;

    // 3. Primary cognitive mode (Minimum evidence threshold: >= 3)
    const sortedCognitive = Object.values(cognitiveCounts).sort((a, b) => b.count - a.count);
    const topCognitive = sortedCognitive[0];
    const primaryCognitiveMode = topCognitive && topCognitive.count > 0 ? {
      name: topCognitive.name,
      count: topCognitive.count,
      sharePct: Math.round((topCognitive.count / totalMistakes) * 100),
      hasConfidence: topCognitive.count >= 3,
    } : null;

    // 4. Fatigue backlog count
    const fatigueBacklogCount = scoredItems.filter((i) => i.isRecentlyDrilled && i.vaultRow.lifecycle_status !== "MASTERED").length;

    return {
      totalMistakes,
      activeMistakesCount,
      highPriorityCount,
      dueForRevisionCount,
      improvingCount,
      masteredCount,
      healthScorePct,
      retentionRatePct,
      drillCompletionRatePct,
      totalDrillsCompleted: completedDrills,
      nextBestRevisions,
      patterns: {
        subjectConcentration,
        weakestTopic,
        primaryCognitiveMode,
        fatigueBacklogCount,
      },
    };
  }

  /**
   * GAP2-2a: learning content for a mistake, via LearningResolverService only
   * (learning_documents; entitlement from the session user — no caller-supplied user id).
   */
  static async resolveLearningContentForMistake(params: {
    questionId?: string;
    topicId?: string;
  }): Promise<MistakeLearningContentResolution> {
    let targetTopicId = params.topicId || null;

    if (!targetTopicId && params.questionId) {
      const supabase = await createServerSupabaseClient();
      const { data: qData } = await supabase
        .from("questions")
        .select("canonical_topic_id")
        .eq("id", params.questionId)
        .maybeSingle();
      targetTopicId = (qData as any)?.canonical_topic_id || null;
    }

    if (!targetTopicId) {
      return {
        hasLearningContent: false,
        topicId: null,
        topicName: null,
        primaryResource: null,
        allResources: [],
        reasonIfUnavailable: "NO_TOPIC",
      };
    }

    const docs = await LearningResolverService.resolveForTopic(targetTopicId);
    return toMistakeLearningResolution(targetTopicId, docs);
  }

  /**
   * GAP2-2a: batch learning content for distinct topic ids — one resolver query (0 N+1).
   */
  static async getBatchLearningContentForTopics(
    topicIds: string[]
  ): Promise<Record<string, MistakeLearningContentResolution>> {
    const resultMap: Record<string, MistakeLearningContentResolution> = {};
    const validTopicIds = Array.from(new Set(topicIds.filter(Boolean)));
    if (validTopicIds.length === 0) {
      return resultMap;
    }
    const byTopic = await LearningResolverService.resolveForTopics(validTopicIds);
    for (const tId of validTopicIds) {
      resultMap[tId] = toMistakeLearningResolution(tId, byTopic.get(tId) || []);
    }
    return resultMap;
  }
}

function toMistakeLearningResolution(topicId: string, docs: ResolvedLearningDocument[]): MistakeLearningContentResolution {
  const resources: ResolvedLearningResource[] = docs.map((d) => ({
    id: d.id,
    documentType: d.document_type,
    title: d.title,
    slug: d.canonical_slug,
    accessLevel: d.access_level,
    isLocked: d.is_locked,
    readingTimeMinutes: d.estimated_minutes,
    canonicalUrl: d.href,
    topicId: d.topic_id,
    topicName: d.topic_name,
  }));
  if (resources.length === 0) {
    return {
      hasLearningContent: false,
      topicId,
      topicName: null,
      primaryResource: null,
      allResources: [],
      reasonIfUnavailable: "NO_CONTENT_FOR_TOPIC",
    };
  }
  return {
    hasLearningContent: true,
    topicId,
    topicName: resources[0].topicName || null,
    primaryResource: resources[0],
    allResources: resources,
  };
}
