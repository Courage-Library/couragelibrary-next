import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { PremiumEntitlementService } from "@/services/premium-entitlement.service";

export interface ResolvedLearningResource {
  id: string;
  resourceType: "ARTICLE" | "COURSE_LESSON" | "REVISION_NOTE" | "FORMULA_SHEET" | "VIDEO" | "PDF_BRIEF" | "CURRENT_AFFAIRS";
  title: string;
  slug: string;
  description: string | null;
  accessLevel: "FREE" | "PRO" | "PAID_COURSE";
  isLocked: boolean;
  estimatedStudySeconds: number;
  readingTimeMinutes?: number;
  canonicalUrl: string;
  topicId: string;
  topicName?: string | null;
  isPrimary: boolean;
  relevanceScore: number;
  displayOrder: number;
  sourceType: "EXPLICIT" | "CANONICAL_TOPIC" | "COURSE_LESSON";
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
  correctOptionKey: string;
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

export interface DrillQuestionOption {
  id: string;
  option_key: string;
  content_text: string;
  option_text?: string;
  option_order: number;
}

export interface DrillQuestionContext {
  cognitive_type_name?: string;
  total_mistakes_count?: number;
  consecutive_correct?: number;
  last_mistake_at?: string;
  user_custom_notes?: string | null;
}

export interface DrillQuestion {
  vault_id: string;
  question_id: string;
  question_version_id?: string | null;
  question_text: string;
  primary_cognitive_type_id: string;
  consecutive_correct: number;
  options: DrillQuestionOption[];
  context?: DrillQuestionContext;
}

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
  correct_option_key: string;
  is_correct: boolean;
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

    for (const m of params.mistakes) {
      if (!m.questionId) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = adminSb as any;

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
      .select("id, question_id, topic_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, topics(name), mistake_cognitive_types!primary_cognitive_type_id(id, name, description)")
      .eq("user_id", currentUserId);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
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
      .select("id, question_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, user_custom_notes, last_mistake_at, mastered_at, topic_id, subject_id, topics(id, name), subjects(id, name), mistake_cognitive_types!primary_cognitive_type_id(name), questions(question_versions(question_text))", { count: "exact" })
      .eq("user_id", user.id);

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

    let items: MistakeListItem[] = (data as any[]).map((r) => {
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
        lifecycleStatus: r.lifecycle_status,
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
      .select("*, topics(name, slug), subjects(name), mistake_cognitive_types!primary_cognitive_type_id(name, description, remediation_guidance)")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!vaultRow) return null;
    const v = vaultRow as any;

    const [occurrencesRes, questionRes] = await Promise.all([
      supabase.from("user_mistake_occurrences").select("id, source_context, response_time_seconds, inferred_cognitive_type_id, heuristic_confidence_pct, occurred_at, question_version_id, attempt_answer_id, occurrence_status, revoked_at, revocation_reason").eq("vault_id", vaultId).order("occurred_at", { ascending: false }),
      supabase.from("questions").select("id, question_versions(id, question_text, question_options(id, option_key, content_text, option_order), question_answers(correct_option_key, solution_explanation_md))").eq("id", v.question_id).single(),
    ]);

    const qData = questionRes.data as any;
    const qv = qData?.question_versions?.[0];

    const options = (qv?.question_options || [])
      .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
      .map((opt: any) => ({
        id: opt.id,
        key: opt.option_key,
        text: opt.content_text,
        isCorrect: opt.option_key === (qv?.question_answers?.[0]?.correct_option_key || "A"),
      }));

    const learningContent = await this.resolveLearningContentForMistake({
      questionId: v.question_id,
      topicId: v.topic_id || v.topics?.id,
      userId: user.id,
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
      occurrencesRes.data as any[],
      v.total_mistakes_count || 1,
      v.consecutive_correct_in_remediation || 0
    );

    return {
      vaultId: v.id,
      questionId: v.question_id,
      questionVersionId: qv?.id || v.occurrences?.[0]?.question_version_id || null,
      questionText: qv?.question_text || "",
      options,
      correctOptionKey: qv?.question_answers?.[0]?.correct_option_key || "A",
      explanation: qv?.question_answers?.[0]?.solution_explanation_md || null,
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
      occurrences: ((occurrencesRes.data as any[]) || []).map((o: any) => ({
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

    return (data as any)?.user_custom_notes || null;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: bookmarks } = await sb
        .from("user_question_bookmarks")
        .select("question_id")
        .eq("user_id", user.id);

      if (!bookmarks || bookmarks.length === 0) {
        return { success: false, error: "No bookmarked mistakes found in your vault." };
      }
      bookmarkedQuestionIds = bookmarks.map((b: { question_id: string }) => b.question_id);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let query = sb
      .from("user_mistake_vault")
      .select("id, question_id, topic_id, subject_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, user_override_cognitive_type_id, user_custom_notes, last_mistake_at, mastered_at, mistake_cognitive_types!primary_cognitive_type_id(name)")
      .eq("user_id", user.id);

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
    const selectedQIds = selectedMistakes.map((m) => m.question_id);

    // Fetch questions and options (SCRUBBED of correct_option_key and solution_explanation_md)
    const { data: questionsData, error: qError } = await sb
      .from("questions")
      .select("id, question_versions(id, question_text, is_current, question_options(id, option_key, content_text, option_order))")
      .in("id", selectedQIds);

    if (qError || !questionsData) {
      return { success: false, error: "Failed to load question details for drill." };
    }

    const qMap: Record<string, any> = {};
    (questionsData as any[]).forEach((q) => {
      const qv = q.question_versions?.find((v: any) => v.is_current) || q.question_versions?.[0];
      if (qv) {
        const sortedOptions: DrillQuestionOption[] = (qv.question_options || [])
          .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
          .map((opt: any) => ({
            id: opt.id,
            option_key: opt.option_key,
            content_text: opt.content_text,
            option_text: opt.content_text,
            option_order: opt.option_order || 0,
          }));

        qMap[q.id] = {
          question_version_id: qv.id,
          question_text: qv.question_text || "",
          options: sortedOptions,
        };
      }
    });

    const drillQuestions: DrillQuestion[] = [];
    for (const m of selectedMistakes) {
      const qDetails = qMap[m.question_id];
      if (qDetails) {
        drillQuestions.push({
          vault_id: m.id,
          question_id: m.question_id,
          question_version_id: qDetails.question_version_id,
          question_text: qDetails.question_text,
          primary_cognitive_type_id: m.primary_cognitive_type_id,
          consecutive_correct: m.consecutive_correct_in_remediation || 0,
          options: qDetails.options,
          context: {
            cognitive_type_name: m.mistake_cognitive_types?.name || m.primary_cognitive_type_id,
            total_mistakes_count: m.total_mistakes_count || 1,
            consecutive_correct: m.consecutive_correct_in_remediation || 0,
            last_mistake_at: m.last_mistake_at,
            user_custom_notes: m.user_custom_notes || null,
          },
        });
      }
    }

    if (drillQuestions.length === 0) {
      return { success: false, error: "Could not compile drill questions." };
    }

    // Insert active drill session
    const { data: newDrill, error: drillInsertError } = await sb
      .from("user_mistake_drills")
      .insert({
        user_id: user.id,
        topic_id: parsedConfig.topicId && parsedConfig.topicId !== "ALL" ? parsedConfig.topicId : null,
        cognitive_type_id: parsedConfig.cognitiveTypeId && parsedConfig.cognitiveTypeId !== "ALL" ? parsedConfig.cognitiveTypeId : null,
        total_questions: drillQuestions.length,
        questions_data: drillQuestions,
        status: "IN_PROGRESS",
      })
      .select("id")
      .single();

    if (drillInsertError || !newDrill) {
      return { success: false, error: drillInsertError?.message || "Failed to create drill record." };
    }

    return {
      success: true,
      drill_id: newDrill.id,
      total_questions: drillQuestions.length,
      questions_count: drillQuestions.length,
      questions: drillQuestions,
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
      questions: d.questions_data as DrillQuestion[],
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 1. Fetch and verify drill session
    const { data: drill, error: drillErr } = await sb
      .from("user_mistake_drills")
      .select("*")
      .eq("id", drillId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (drillErr || !drill) {
      return { success: false, error: "Drill session not found or unauthorized." };
    }

    if (drill.status !== "IN_PROGRESS") {
      return { success: false, error: "Drill session is already completed or expired." };
    }

    const questionsData: DrillQuestion[] = (drill.questions_data as DrillQuestion[]) || [];
    const questionIds = questionsData.map((q) => q.question_id);

    // 2. Load authoritative question answers and explanations
    const { data: answersData } = await sb
      .from("question_versions")
      .select("question_id, question_text, question_answers(correct_option_key, solution_explanation_md)")
      .in("question_id", questionIds);

    const answerMap: Record<string, { correctKey: string; explanation: string | null; text: string }> = {};
    (answersData || []).forEach((row: any) => {
      answerMap[row.question_id] = {
        correctKey: row.question_answers?.[0]?.correct_option_key || "A",
        explanation: row.question_answers?.[0]?.solution_explanation_md || null,
        text: row.question_text || "",
      };
    });

    // 3. Load candidate's vault records for streak calculation
    const { data: vaultRecords } = await sb
      .from("user_mistake_vault")
      .select("id, question_id, consecutive_correct_in_remediation, total_mistakes_count, lifecycle_status")
      .eq("user_id", user.id)
      .in("question_id", questionIds);

    const vaultMap: Record<string, any> = {};
    (vaultRecords || []).forEach((v: any) => {
      vaultMap[v.question_id] = v;
    });

    let correctCount = 0;
    let masteredCount = 0;
    let revisitingCount = 0;
    let unresolvedCount = 0;
    const evaluations: DrillEvaluationItem[] = [];

    // 4. Evaluate each response and update vault records
    for (const q of questionsData) {
      const authAnswer = answerMap[q.question_id];
      const correctKey = authAnswer?.correctKey || "A";
      const resp = responses.find((r) => r.question_id === q.question_id);
      const selectedKey = resp?.selected_option_key || null;
      const isCorrect = selectedKey !== null && selectedKey === correctKey;

      const vRecord = vaultMap[q.question_id];
      const prevConsecutive = vRecord?.consecutive_correct_in_remediation || 0;
      let newConsecutive = prevConsecutive;
      let newStatus: "UNRESOLVED" | "REVISITING" | "MASTERED" = vRecord?.lifecycle_status || "UNRESOLVED";

      if (isCorrect) {
        correctCount++;
        newConsecutive = prevConsecutive + 1;
        if (newConsecutive >= 2) {
          newStatus = "MASTERED";
          masteredCount++;
        } else {
          newStatus = "REVISITING";
          revisitingCount++;
        }

        if (vRecord?.id) {
          await sb
            .from("user_mistake_vault")
            .update({
              consecutive_correct_in_remediation: newConsecutive,
              lifecycle_status: newStatus,
              last_practiced_at: new Date().toISOString(),
              mastered_at: newStatus === "MASTERED" ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", vRecord.id);
        }
      } else {
        unresolvedCount++;
        newConsecutive = 0;
        newStatus = "UNRESOLVED";

        if (vRecord?.id) {
          await sb
            .from("user_mistake_vault")
            .update({
              consecutive_correct_in_remediation: 0,
              lifecycle_status: "UNRESOLVED",
              total_mistakes_count: (vRecord.total_mistakes_count || 1) + 1,
              last_mistake_at: new Date().toISOString(),
              last_practiced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", vRecord.id);

          // Log failure occurrence
          await sb.from("user_mistake_occurrences").insert({
            vault_id: vRecord.id,
            user_id: user.id,
            question_id: q.question_id,
            source_context: "MISTAKE_DRILL",
            source_reference_id: drillId,
            selected_option_id: resp?.selected_option_id || null,
            response_time_seconds: resp?.response_time_seconds || 30,
            occurrence_status: "ACTIVE",
          });
        }
      }

      evaluations.push({
        question_id: q.question_id,
        question_text: q.question_text || authAnswer?.text || "",
        options: q.options,
        selected_option_key: selectedKey,
        correct_option_key: correctKey,
        is_correct: isCorrect,
        explanation: authAnswer?.explanation || null,
        previous_consecutive: prevConsecutive,
        new_consecutive: newConsecutive,
        new_status: newStatus,
      });
    }

    // 5. Coin Rewards (Gamification: 5 coins if total_questions >= 5, max 3/day)
    let coinsAwarded = 0;
    const totalQuestions = questionsData.length;
    if (totalQuestions >= 5) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count: dailyCompletedCount } = await sb
        .from("user_mistake_drills")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "COMPLETED")
        .gte("completed_at", todayStart.toISOString())
        .gt("coins_awarded", 0);

      if ((dailyCompletedCount || 0) < 3) {
        coinsAwarded = 5;
        // Award coins via RPC or coin ledger if available
        const rpcCall = supabase.rpc as any;
        await rpcCall("fn_award_gamification_reward", {
          p_user_id: user.id,
          p_event_type: "MISTAKE_DRILL_COMPLETED",
          p_source_type: "MISTAKE_DRILL",
          p_source_id: drillId,
          p_idempotency_key: `mistake_drill_${drillId}_${user.id}`,
          p_coins: 5,
          p_reason: "MISTAKE_DRILL_COMPLETION",
          p_metadata: { drill_id: drillId, correct_count: correctCount, resolved_count: masteredCount },
        }).catch(() => null);
      }
    }

    // 6. Complete Drill Record
    await sb
      .from("user_mistake_drills")
      .update({
        status: "COMPLETED",
        correct_count: correctCount,
        mistakes_resolved_count: masteredCount,
        coins_awarded: coinsAwarded,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", drillId);

    const accuracyPct = totalQuestions > 0 ? Number(((correctCount / totalQuestions) * 100).toFixed(1)) : 0;

    return {
      success: true,
      drill_id: drillId,
      summary: {
        total_questions: totalQuestions,
        correct_count: correctCount,
        accuracy_pct: accuracyPct,
        mastered_count: masteredCount,
        revisiting_count: revisitingCount,
        unresolved_count: unresolvedCount,
        coins_awarded: coinsAwarded,
      },
      evaluations,
    };
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

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
          topics(id, name, slug),
          subjects(id, name),
          mistake_cognitive_types!primary_cognitive_type_id(name),
          questions(question_versions(question_text))
        `)
        .eq("user_id", currentUserId),
      sb
        .from("user_mistake_drills")
        .select("id, status, coins_awarded, questions_data, created_at, completed_at")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false }),
    ]);

    const vaultRows = (vaultRes.data as any[]) || [];
    const drillRows = (drillsRes.data as any[]) || [];

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
    const batchContentMap = await this.getBatchLearningContentForTopics(topTopicIds, currentUserId);

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
   * Deterministically resolves learning content for a given topic or question with strict authorization and no N+1 query.
   */
  static async resolveLearningContentForMistake(params: {
    questionId?: string;
    topicId?: string;
    userId?: string;
    language?: string;
  }): Promise<MistakeLearningContentResolution> {
    const supabase = await createServerSupabaseClient();
    let currentUserId = params.userId;
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      currentUserId = user?.id;
    }

    let targetTopicId = params.topicId;
    let targetTopicName: string | null = null;

    // If topicId not provided, look up canonical_topic_id from question
    if (!targetTopicId && params.questionId) {
      const { data: qData } = await supabase
        .from("questions")
        .select("canonical_topic_id, topics(name)")
        .eq("id", params.questionId)
        .maybeSingle();

      if (qData) {
        targetTopicId = (qData as any).canonical_topic_id;
        targetTopicName = (qData as any).topics?.name || null;
      }
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

    // Check user premium access if authenticated
    let isUserPremium = false;
    if (currentUserId) {
      try {
        const premRes = await PremiumEntitlementService.checkPremiumAccess(currentUserId);
        isUserPremium = premRes.hasAccess;
      } catch {
        isUserPremium = false;
      }
    }

    // Query learning_resource_topics joined with published learning_resources, articles, and course lessons
    const { data: lrtRows, error } = await supabase
      .from("learning_resource_topics")
      .select(`
        id,
        topic_id,
        subtopic_id,
        is_primary,
        relevance_score,
        display_order,
        topics(name),
        learning_resources!inner(
          id,
          resource_type,
          title,
          slug,
          description,
          access_level,
          status,
          estimated_study_seconds,
          published_at,
          articles(slug, reading_time_minutes, status),
          course_lessons(id, slug, title, is_published, course_modules(course_id, courses(slug, is_published)))
        )
      `)
      .eq("topic_id", targetTopicId)
      .eq("learning_resources.status", "PUBLISHED");

    if (error || !lrtRows || lrtRows.length === 0) {
      return {
        hasLearningContent: false,
        topicId: targetTopicId,
        topicName: targetTopicName,
        primaryResource: null,
        allResources: [],
        reasonIfUnavailable: "NO_CONTENT_FOR_TOPIC",
      };
    }

    const resolvedList: ResolvedLearningResource[] = [];

    for (const row of lrtRows as any[]) {
      const lr = row.learning_resources;
      if (!lr || lr.status !== "PUBLISHED") continue;

      if (!targetTopicName && row.topics?.name) {
        targetTopicName = row.topics.name;
      }

      let canonicalUrl = `/articles/${lr.slug}`;
      let readingTimeMinutes: number | undefined = Math.ceil((lr.estimated_study_seconds || 300) / 60);

      const article = Array.isArray(lr.articles) ? lr.articles[0] : lr.articles;
      if (article && article.slug) {
        canonicalUrl = `/articles/${article.slug}`;
        if (article.reading_time_minutes) {
          readingTimeMinutes = article.reading_time_minutes;
        }
      }

      const lesson = Array.isArray(lr.course_lessons) ? lr.course_lessons[0] : lr.course_lessons;
      if (lesson && lesson.is_published) {
        const courseSlug = lesson.course_modules?.courses?.slug;
        if (courseSlug) {
          canonicalUrl = `/courses/${courseSlug}/learn?lesson=${lesson.id}`;
        }
      }

      const accessLevel = lr.access_level || "FREE";
      const isLocked = (accessLevel === "PRO" || accessLevel === "PAID_COURSE") && !isUserPremium;

      resolvedList.push({
        id: lr.id,
        resourceType: lr.resource_type || "ARTICLE",
        title: lr.title,
        slug: lr.slug,
        description: lr.description || null,
        accessLevel,
        isLocked,
        estimatedStudySeconds: lr.estimated_study_seconds || 300,
        readingTimeMinutes,
        canonicalUrl,
        topicId: row.topic_id,
        topicName: targetTopicName,
        isPrimary: Boolean(row.is_primary),
        relevanceScore: Number(row.relevance_score || 1.0),
        displayOrder: Number(row.display_order || 0),
        sourceType: "CANONICAL_TOPIC",
      });
    }

    // Deterministic sorting: isPrimary DESC, relevanceScore DESC, displayOrder ASC, id ASC
    resolvedList.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.id.localeCompare(b.id);
    });

    if (resolvedList.length === 0) {
      return {
        hasLearningContent: false,
        topicId: targetTopicId,
        topicName: targetTopicName,
        primaryResource: null,
        allResources: [],
        reasonIfUnavailable: "NO_CONTENT_FOR_TOPIC",
      };
    }

    return {
      hasLearningContent: true,
      topicId: targetTopicId,
      topicName: targetTopicName,
      primaryResource: resolvedList[0],
      allResources: resolvedList,
    };
  }

  /**
   * Batch resolves learning resources for an array of distinct topic IDs in a single query (0 N+1).
   */
  static async getBatchLearningContentForTopics(
    topicIds: string[],
    userId?: string
  ): Promise<Record<string, MistakeLearningContentResolution>> {
    const resultMap: Record<string, MistakeLearningContentResolution> = {};
    const validTopicIds = Array.from(new Set(topicIds.filter(Boolean)));

    if (validTopicIds.length === 0) {
      return resultMap;
    }

    for (const tId of validTopicIds) {
      resultMap[tId] = {
        hasLearningContent: false,
        topicId: tId,
        topicName: null,
        primaryResource: null,
        allResources: [],
        reasonIfUnavailable: "NO_CONTENT_FOR_TOPIC",
      };
    }

    const supabase = await createServerSupabaseClient();
    let isUserPremium = false;
    if (userId) {
      try {
        const premRes = await PremiumEntitlementService.checkPremiumAccess(userId);
        isUserPremium = premRes.hasAccess;
      } catch {
        isUserPremium = false;
      }
    }

    const { data: lrtRows, error } = await supabase
      .from("learning_resource_topics")
      .select(`
        id,
        topic_id,
        subtopic_id,
        is_primary,
        relevance_score,
        display_order,
        topics(name),
        learning_resources!inner(
          id,
          resource_type,
          title,
          slug,
          description,
          access_level,
          status,
          estimated_study_seconds,
          published_at,
          articles(slug, reading_time_minutes, status),
          course_lessons(id, slug, title, is_published, course_modules(course_id, courses(slug, is_published)))
        )
      `)
      .in("topic_id", validTopicIds)
      .eq("learning_resources.status", "PUBLISHED");

    if (error || !lrtRows) {
      return resultMap;
    }

    const groupedByTopic: Record<string, ResolvedLearningResource[]> = {};
    const topicNameMap: Record<string, string> = {};

    for (const row of lrtRows as any[]) {
      const lr = row.learning_resources;
      if (!lr || lr.status !== "PUBLISHED") continue;

      const tId = row.topic_id;
      if (row.topics?.name) {
        topicNameMap[tId] = row.topics.name;
      }

      let canonicalUrl = `/articles/${lr.slug}`;
      let readingTimeMinutes: number | undefined = Math.ceil((lr.estimated_study_seconds || 300) / 60);

      const article = Array.isArray(lr.articles) ? lr.articles[0] : lr.articles;
      if (article && article.slug) {
        canonicalUrl = `/articles/${article.slug}`;
        if (article.reading_time_minutes) {
          readingTimeMinutes = article.reading_time_minutes;
        }
      }

      const lesson = Array.isArray(lr.course_lessons) ? lr.course_lessons[0] : lr.course_lessons;
      if (lesson && lesson.is_published) {
        const courseSlug = lesson.course_modules?.courses?.slug;
        if (courseSlug) {
          canonicalUrl = `/courses/${courseSlug}/learn?lesson=${lesson.id}`;
        }
      }

      const accessLevel = lr.access_level || "FREE";
      const isLocked = (accessLevel === "PRO" || accessLevel === "PAID_COURSE") && !isUserPremium;

      if (!groupedByTopic[tId]) {
        groupedByTopic[tId] = [];
      }

      groupedByTopic[tId].push({
        id: lr.id,
        resourceType: lr.resource_type || "ARTICLE",
        title: lr.title,
        slug: lr.slug,
        description: lr.description || null,
        accessLevel,
        isLocked,
        estimatedStudySeconds: lr.estimated_study_seconds || 300,
        readingTimeMinutes,
        canonicalUrl,
        topicId: tId,
        topicName: topicNameMap[tId] || null,
        isPrimary: Boolean(row.is_primary),
        relevanceScore: Number(row.relevance_score || 1.0),
        displayOrder: Number(row.display_order || 0),
        sourceType: "CANONICAL_TOPIC",
      });
    }

    for (const [tId, resources] of Object.entries(groupedByTopic)) {
      resources.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.id.localeCompare(b.id);
      });

      if (resources.length > 0) {
        resultMap[tId] = {
          hasLearningContent: true,
          topicId: tId,
          topicName: topicNameMap[tId] || null,
          primaryResource: resources[0],
          allResources: resources,
        };
      }
    }

    return resultMap;
  }
}
