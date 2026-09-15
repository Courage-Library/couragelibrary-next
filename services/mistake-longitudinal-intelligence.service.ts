/**
 * COURAGE LIBRARY — MISTAKE VAULT PHASE 6 TASK 4
 * LONGITUDINAL MISTAKE ANALYTICS & CROSS-EXAM INTELLIGENCE SERVICE
 *
 * Provides a strictly read-only, deterministic, and explainable longitudinal
 * mistake analytics layer consuming authoritative Mistake Vault ledgers.
 *
 * SACRED GOVERNANCE CONTRACTS:
 * - Pure read-only analytics consumer (Zero database mutation).
 * - Zero replacement or modification of MPI, RevisionPriority, Error Decay, or CAT.
 * - Zero replacement or modification of Mistake Vault mastery semantics.
 * - Exact 7-type cognitive taxonomy preservation.
 * - Strict denominator scope matching and sample-size safety.
 * - Strict chronological relapse validation (occurred_at > mastered_at).
 * - Deterministic lexicographic weakness ranking.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  LongitudinalWindowType,
  LongitudinalWindowConfig,
  NormalizedMetric,
  TrajectoryState,
  CrossExamPattern,
  TopicTrajectoryDetail,
  CrossExamContextDetail,
  CrossExamIntelligenceSummary,
  CognitiveDistributionSummary,
  RelapseRecoveryDetail,
  LongitudinalWeaknessItem,
  MistakeLongitudinalOverview,
  QueryOptions,
  RawSourceContext,
  ProductAssessmentCategory,
} from "@/types/mistake-longitudinal-intelligence";

export class MistakeLongitudinalIntelligenceService {
  public static readonly CANONICAL_COGNITIVE_TYPES: Record<string, string> = {
    CONCEPTUAL_GAP: "Conceptual Gap",
    CALCULATION_SLIP: "Calculation Slip",
    MISREAD_QUESTION: "Misread Question",
    TIME_PANIC: "Time Pressure / Rush",
    FORMULA_CONFUSION: "Formula Confusion",
    DISTRACTOR_TRAP: "Distractor Trap",
    UNCLASSIFIED: "Unclassified",
  };

  public static readonly CANONICAL_RAW_SOURCE_CONTEXTS: RawSourceContext[] = [
    "MOCK_TEST",
    "CUSTOM_PRACTICE",
    "QUIZ_BATTLE",
    "FLASHCARD_REVIEW",
    "MISTAKE_DRILL",
    "DIAGNOSTIC_ASSESSMENT",
  ];

  public static readonly CANONICAL_SOURCE_CONTEXTS: RawSourceContext[] = [
    "MOCK_TEST",
    "CUSTOM_PRACTICE",
    "QUIZ_BATTLE",
    "FLASHCARD_REVIEW",
    "MISTAKE_DRILL",
    "DIAGNOSTIC_ASSESSMENT",
  ];

  public static readonly MIN_DENOMINATOR_TOPIC = 3;
  public static readonly MIN_DENOMINATOR_SUBJECT = 5;
  public static readonly MIN_DENOMINATOR_CONTEXT = 3;
  public static readonly MIN_DENOMINATOR_TRAJECTORY = 3;

  /**
   * Resolves window boundaries deterministically based on reference time.
   * Public Analytical Windows: 7D, 30D, 90D, ALL_TIME.
   * Internal Fetch Spans: 14D (for 7D), 60D (for 30D), 180D (for 90D), epoch (for ALL_TIME).
   */
  public static resolveWindowConfig(
    windowDays: LongitudinalWindowType | number | string = "30D",
    referenceNow: number = Date.now()
  ): LongitudinalWindowConfig {
    const endMs = referenceNow;
    const endDate = new Date(endMs).toISOString();

    let normalizedWindow: LongitudinalWindowType = "30D";
    if (windowDays === "7D" || windowDays === 7 || windowDays === "7") {
      normalizedWindow = "7D";
    } else if (windowDays === "90D" || windowDays === 90 || windowDays === "90") {
      normalizedWindow = "90D";
    } else if (
      windowDays === "ALL_TIME" ||
      windowDays === "ALL" ||
      windowDays === "all" ||
      windowDays === "all_time"
    ) {
      normalizedWindow = "ALL_TIME";
    } else {
      normalizedWindow = "30D";
    }

    if (normalizedWindow === "ALL_TIME") {
      const startMs = 0; // Epoch origin
      return {
        windowType: "ALL_TIME",
        startDate: new Date(startMs).toISOString(),
        endDate,
        internalFetchStartDate: new Date(startMs).toISOString(),
        internalFetchEndDate: endDate,
        daysDuration: Infinity,
        internalFetchDaysDuration: Infinity,
      };
    }

    const days = normalizedWindow === "7D" ? 7 : normalizedWindow === "90D" ? 90 : 30;
    const durationMs = days * 24 * 60 * 60 * 1000;
    const startMs = endMs - durationMs;
    const priorEndMs = startMs;
    const priorStartMs = priorEndMs - durationMs;
    const internalFetchDays = days * 2;

    return {
      windowType: normalizedWindow,
      startDate: new Date(startMs).toISOString(),
      endDate,
      priorStartDate: new Date(priorStartMs).toISOString(),
      priorEndDate: new Date(priorEndMs).toISOString(),
      internalFetchStartDate: new Date(priorStartMs).toISOString(),
      internalFetchEndDate: endDate,
      daysDuration: days,
      internalFetchDaysDuration: internalFetchDays,
    };
  }

  /**
   * Deterministic mapping from raw source_context + reference metadata to product category.
   * If metadata is absent or unresolvable, strictly falls back to authoritative raw source_context.
   */
  public static classifySourceToProductCategory(
    sourceOrParams:
      | string
      | {
          sourceContext: string;
          sourceReferenceId?: string | null;
          metadata?: {
            testType?: string | null;
            isAdaptive?: boolean | null;
            isPremium?: boolean | null;
            isDailyMock?: boolean | null;
            isLiveTest?: boolean | null;
          } | null;
        },
    explicitMetadata?: {
      testType?: string | null;
      isAdaptive?: boolean | null;
      isPremium?: boolean | null;
      isDailyMock?: boolean | null;
      isLiveTest?: boolean | null;
    } | null
  ): string {
    let raw: string;
    let meta: any = null;

    if (typeof sourceOrParams === "string") {
      raw = sourceOrParams || "MOCK_TEST";
      meta = explicitMetadata || null;
    } else {
      raw = sourceOrParams.sourceContext || "MOCK_TEST";
      meta = sourceOrParams.metadata || explicitMetadata || null;
    }

    if (raw === "MISTAKE_DRILL") return "MISTAKE_DRILL";
    if (raw === "CUSTOM_PRACTICE") return "CUSTOM_PRACTICE";
    if (raw === "QUIZ_BATTLE") return "QUIZ_BATTLE";
    if (raw === "FLASHCARD_REVIEW") return "FLASHCARD_REVIEW";
    if (raw === "DIAGNOSTIC_ASSESSMENT") return "DIAGNOSTIC_ASSESSMENT";

    if (raw === "MOCK_TEST") {
      if (meta?.isDailyMock || meta?.testType === "DAILY") return "DAILY_MOCK";
      if (meta?.isPremium || meta?.testType === "PREMIUM") return "PREMIUM_MOCK";
      if (meta?.isLiveTest || meta?.testType === "LIVE" || meta?.testType === "LIVE_ALL_INDIA") return "LIVE_ALL_INDIA";
      if (meta?.isAdaptive || meta?.testType === "ADAPTIVE") return "ADAPTIVE_CAT";
      return "MOCK_TEST";
    }

    return raw;
  }

  /**
   * Calculates a normalized error rate metric with sample-size safeguards.
   */
  public static calculateNormalizedMetric(
    numerator: number,
    denominator: number | null,
    minimumSample: number = 3
  ): NormalizedMetric<number> {
    if (denominator === null || denominator === undefined || denominator < minimumSample) {
      return {
        numerator,
        denominator,
        minimumSample,
        isSufficient: false,
        rate: null,
      };
    }

    if (denominator === 0) {
      return {
        numerator,
        denominator: 0,
        minimumSample,
        isSufficient: false,
        rate: null,
      };
    }

    const rawRate = numerator / denominator;
    const rate = Number(Math.min(1.0, Math.max(0.0, rawRate)).toFixed(4));

    return {
      numerator,
      denominator,
      minimumSample,
      isSufficient: true,
      rate,
    };
  }

  /**
   * Deterministically classifies topic trajectory based on recent vs prior performance.
   */
  public static classifyTrajectory(params: {
    recentErrorRate?: number | null;
    recentRate?: number | null;
    priorErrorRate?: number | null;
    priorRate?: number | null;
    recentAttempts: number;
    priorAttempts: number;
    hasVerifiedRelapse?: boolean;
    hasRelapse?: boolean;
    isRecovering?: boolean;
  }): TrajectoryState {
    const recentErrorRate = params.recentErrorRate !== undefined ? params.recentErrorRate : params.recentRate ?? null;
    const priorErrorRate = params.priorErrorRate !== undefined ? params.priorErrorRate : params.priorRate ?? null;
    const {
      recentAttempts,
      priorAttempts,
      isRecovering = false,
    } = params;
    const hasVerifiedRelapse = params.hasVerifiedRelapse || params.hasRelapse || false;

    // 1. Relapse has priority if verified post-mastery active failure occurred
    if (hasVerifiedRelapse) {
      return "RELAPSING";
    }

    // 2. Minimum sample-size check
    if (
      recentAttempts < this.MIN_DENOMINATOR_TRAJECTORY ||
      priorAttempts < this.MIN_DENOMINATOR_TRAJECTORY ||
      recentErrorRate === null ||
      priorErrorRate === null
    ) {
      return "INSUFFICIENT_DATA";
    }

    const delta = Number((recentErrorRate - priorErrorRate).toFixed(4));

    // 3. Recovery condition
    if (isRecovering && delta <= -0.10) {
      return "RECOVERING";
    }

    // 4. Significant improvement (error rate reduction >= 15%)
    if (delta <= -0.15) {
      return "IMPROVING";
    }

    // 5. Significant decline (error rate increase >= 15%)
    if (delta >= 0.15) {
      return "DECLINING";
    }

    // 6. Stable performance within variance band
    return "STABLE";
  }

  public static readonly classifyTopicTrajectory = MistakeLongitudinalIntelligenceService.classifyTrajectory;

  /**
   * Deterministically classifies cross-exam consistency pattern.
   */
  public static classifyCrossExamPattern(params: {
    contextsAttempted: number;
    contextsWithErrors: number;
    contextRateDelta: number | null;
    overallErrorRate: number | null;
  }): CrossExamPattern {
    const { contextsAttempted, contextsWithErrors, contextRateDelta, overallErrorRate } = params;

    if (contextsAttempted < 2) {
      return "INSUFFICIENT_DATA";
    }

    if (contextsWithErrors === 0) {
      return "CONSISTENTLY_STRONG";
    }

    const delta = contextRateDelta ?? 0;
    const overallRate = overallErrorRate ?? 0;

    // High error rate across multiple distinct testing modes
    if (contextsWithErrors >= 2 && delta <= 0.20 && overallRate >= 0.35) {
      return "CONSISTENTLY_WEAK";
    }

    // High delta or isolated single error context
    if (delta > 0.25 || (contextsWithErrors === 1 && contextsAttempted >= 2)) {
      return "CONTEXT_SPECIFIC";
    }

    return "CONSISTENTLY_STRONG";
  }

  /**
   * Generates human-readable explanatory description for cross-exam pattern.
   */
  public static describeCrossExamPattern(pattern: CrossExamPattern, dominantContext?: string | null): string {
    switch (pattern) {
      case "CONSISTENTLY_STRONG":
        return "Consistent mastery demonstrated across multiple assessment contexts.";
      case "CONSISTENTLY_WEAK":
        return "Systemic difficulty observed across multiple test contexts.";
      case "CONTEXT_SPECIFIC":
        return dominantContext
          ? `Mistakes appear predominantly concentrated within Mock Test / ${dominantContext.replace(/_/g, " ")} context.`
          : "Mistakes appear context-dependent with notable variance between assessment environments.";
      case "INSUFFICIENT_DATA":
      default:
        return "Insufficient multi-context data to determine cross-exam pattern.";
    }
  }

  /**
   * Evaluates relapse events under the strict 5-condition chronological contract:
   * 1. Prior mastery state recorded on vault.
   * 2. mastered_at timestamp is valid.
   * 3. Subsequent active occurrence exists.
   * 4. occurred_at > mastered_at.
   * 5. Same question/topic scope.
   */
  public static evaluateRelapseAndRecovery(
    vaultRecords: Array<{
      id: string;
      question_id: string;
      topic_id: string | null;
      subject_id: string | null;
      lifecycle_status: string;
      consecutive_correct_in_remediation: number;
      first_mistake_at: string;
      last_mistake_at: string;
      mastered_at: string | null;
      topics?: { id: string; name: string; subject_id: string; subjects?: { id: string; name: string } } | null;
    }>,
    activeOccurrences: Array<{
      id: string;
      vault_id: string;
      question_id: string;
      source_context: string;
      occurred_at: string;
      occurrence_status: string;
    }>
  ): {
    relapseDetails: RelapseRecoveryDetail[];
    totalMasteredCount: number;
    totalRelapseCount: number;
    activeRelapsesCount: number;
    averageDaysToRecovery: number | null;
  } {
    const relapseDetails: RelapseRecoveryDetail[] = [];
    let totalMasteredCount = 0;
    let totalRelapseCount = 0;
    let activeRelapsesCount = 0;
    const recoveryDaysList: number[] = [];

    for (const v of vaultRecords) {
      const isMasteredLifecycle = v.lifecycle_status === "MASTERED";
      const hasMasteredTimestamp = !!v.mastered_at;

      if (isMasteredLifecycle || hasMasteredTimestamp) {
        totalMasteredCount++;
      }

      let daysToInitialRecovery: number | null = null;
      if (v.first_mistake_at && v.mastered_at) {
        const firstMs = new Date(v.first_mistake_at).getTime();
        const masterMs = new Date(v.mastered_at).getTime();
        if (!isNaN(firstMs) && !isNaN(masterMs) && masterMs >= firstMs) {
          daysToInitialRecovery = Number(((masterMs - firstMs) / (1000 * 3600 * 24)).toFixed(1));
          recoveryDaysList.push(daysToInitialRecovery);
        }
      }

      // Check for legacy un-timestamped mastery
      if (isMasteredLifecycle && !hasMasteredTimestamp) {
        relapseDetails.push({
          vaultId: v.id,
          questionId: v.question_id,
          topicId: v.topic_id,
          topicName: v.topics?.name || null,
          subjectId: v.subject_id,
          subjectName: v.topics?.subjects?.name || null,
          masteredAt: null,
          firstMistakeAt: v.first_mistake_at || new Date().toISOString(),
          lastMistakeAt: v.last_mistake_at || new Date().toISOString(),
          relapsedAt: null,
          daysToRelapse: null,
          daysToInitialRecovery: null,
          sourceWhereRelapsed: null,
          status: "INSUFFICIENT_HISTORY",
          consecutiveCorrectInRemediation: v.consecutive_correct_in_remediation || 0,
          currentLifecycleStatus: v.lifecycle_status,
        });
        continue;
      }

      // If mastered_at is available, check for strictly subsequent active occurrences
      if (v.mastered_at) {
        const masterMs = new Date(v.mastered_at).getTime();
        const postMasteryOccurrences = activeOccurrences
          .filter((o) => (o.vault_id === v.id || o.question_id === v.question_id) && o.occurrence_status === "ACTIVE")
          .filter((o) => new Date(o.occurred_at).getTime() > masterMs)
          .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

        if (postMasteryOccurrences.length > 0) {
          const firstRelapse = postMasteryOccurrences[0];
          const relapseMs = new Date(firstRelapse.occurred_at).getTime();
          const daysToRelapse = Number(((relapseMs - masterMs) / (1000 * 3600 * 24)).toFixed(1));

          totalRelapseCount++;
          if (v.lifecycle_status !== "MASTERED") {
            activeRelapsesCount++;
          }

          relapseDetails.push({
            vaultId: v.id,
            questionId: v.question_id,
            topicId: v.topic_id,
            topicName: v.topics?.name || null,
            subjectId: v.subject_id,
            subjectName: v.topics?.subjects?.name || null,
            masteredAt: v.mastered_at,
            firstMistakeAt: v.first_mistake_at || new Date().toISOString(),
            lastMistakeAt: v.last_mistake_at || new Date().toISOString(),
            relapsedAt: firstRelapse.occurred_at,
            daysToRelapse,
            daysToInitialRecovery,
            sourceWhereRelapsed: firstRelapse.source_context,
            status: "VERIFIED_RELAPSE",
            consecutiveCorrectInRemediation: v.consecutive_correct_in_remediation || 0,
            currentLifecycleStatus: v.lifecycle_status,
          });
        } else if (hasMasteredTimestamp) {
          relapseDetails.push({
            vaultId: v.id,
            questionId: v.question_id,
            topicId: v.topic_id,
            topicName: v.topics?.name || null,
            subjectId: v.subject_id,
            subjectName: v.topics?.subjects?.name || null,
            masteredAt: v.mastered_at,
            firstMistakeAt: v.first_mistake_at || new Date().toISOString(),
            lastMistakeAt: v.last_mistake_at || new Date().toISOString(),
            relapsedAt: null,
            daysToRelapse: null,
            daysToInitialRecovery,
            sourceWhereRelapsed: null,
            status: "NO_RELAPSE",
            consecutiveCorrectInRemediation: v.consecutive_correct_in_remediation || 0,
            currentLifecycleStatus: v.lifecycle_status,
          });
        }
      }
    }

    const averageDaysToRecovery =
      recoveryDaysList.length > 0
        ? Number((recoveryDaysList.reduce((a, b) => a + b, 0) / recoveryDaysList.length).toFixed(1))
        : null;

    return {
      relapseDetails,
      totalMasteredCount,
      totalRelapseCount,
      activeRelapsesCount,
      averageDaysToRecovery,
    };
  }

  /**
   * Deterministically sorts weaknesses using strict lexicographical multi-key order:
   * 1. Normalized Error Rate DESC (Nulls placed last)
   * 2. Active Mistake Count DESC
   * 3. Active Duration Days DESC
   * 4. Contexts With Errors Count DESC
   * 5. Topic ID ASC (Stable tie-breaker)
   */
  public static rankLongitudinalWeaknesses(
    items: Array<{
      topicId: string;
      topicName: string;
      subjectId: string;
      subjectName: string;
      errorRate: number | null;
      activeMistakeCount: number;
      activeDurationDays: number;
      contextsWithErrorsCount: number;
      crossExamPattern: CrossExamPattern;
      trajectory: TrajectoryState;
      hasRelapse: boolean;
      isSufficientData: boolean;
    }>
  ): LongitudinalWeaknessItem[] {
    const sorted = [...items].sort((a, b) => {
      // 1. Error Rate DESC (Higher failure rate first; nulls last)
      const rateA = a.errorRate !== null ? a.errorRate : -1;
      const rateB = b.errorRate !== null ? b.errorRate : -1;
      if (rateB !== rateA) {
        return rateB - rateA;
      }

      // 2. Active Mistake Count DESC
      if (b.activeMistakeCount !== a.activeMistakeCount) {
        return b.activeMistakeCount - a.activeMistakeCount;
      }

      // 3. Active Duration Days DESC
      if (b.activeDurationDays !== a.activeDurationDays) {
        return b.activeDurationDays - a.activeDurationDays;
      }

      // 4. Number of contexts with errors DESC
      if (b.contextsWithErrorsCount !== a.contextsWithErrorsCount) {
        return b.contextsWithErrorsCount - a.contextsWithErrorsCount;
      }

      // 5. Lexicographical Topic ID ASC
      return a.topicId.localeCompare(b.topicId);
    });

    return sorted.map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
  }

  /**
   * Evaluates descriptive cognitive failure mode distribution.
   */
  public static evaluateCognitiveDistribution(
    activeOccurrences: Array<{
      inferred_cognitive_type_id: string;
      source_context: string;
      occurred_at: string;
      topics?: { subjects?: { name: string } } | null;
      subject_name?: string | null;
    }>,
    referenceNow: number = Date.now(),
    recentWindowMs: number = 7 * 24 * 3600 * 1000
  ): CognitiveDistributionSummary[] {
    const totalActive = activeOccurrences.length;
    const counts: Record<string, { total: number; recent: number; subjects: Record<string, number>; sources: Record<string, number> }> = {};

    for (const key of Object.keys(this.CANONICAL_COGNITIVE_TYPES)) {
      counts[key] = { total: 0, recent: 0, subjects: {}, sources: {} };
    }

    const recentThreshold = referenceNow - recentWindowMs;

    for (const occ of activeOccurrences) {
      const typeKey = this.CANONICAL_COGNITIVE_TYPES[occ.inferred_cognitive_type_id]
        ? occ.inferred_cognitive_type_id
        : "UNCLASSIFIED";

      const bucket = counts[typeKey] || counts["UNCLASSIFIED"];
      bucket.total++;

      const occMs = new Date(occ.occurred_at).getTime();
      if (!isNaN(occMs) && occMs >= recentThreshold) {
        bucket.recent++;
      }

      const subj = occ.subject_name || occ.topics?.subjects?.name || "General";
      bucket.subjects[subj] = (bucket.subjects[subj] || 0) + 1;

      const src = occ.source_context || "MOCK_TEST";
      bucket.sources[src] = (bucket.sources[src] || 0) + 1;
    }

    const result: CognitiveDistributionSummary[] = [];

    for (const [id, name] of Object.entries(this.CANONICAL_COGNITIVE_TYPES)) {
      const data = counts[id];
      const proportion = totalActive > 0 ? Number((data.total / totalActive).toFixed(4)) : 0.0;

      let topSubject: string | null = null;
      let maxSubjCount = 0;
      for (const [sName, sCount] of Object.entries(data.subjects)) {
        if (sCount > maxSubjCount) {
          maxSubjCount = sCount;
          topSubject = sName;
        }
      }

      result.push({
        cognitiveTypeId: id,
        cognitiveTypeName: name,
        activeMistakeCount: data.total,
        proportionOfActiveMistakes: proportion,
        recentMistakeCount: data.recent,
        topAssociatedSubject: topSubject,
        sourceContextDistribution: data.sources,
      });
    }

    return result.sort((a, b) => b.activeMistakeCount - a.activeMistakeCount || a.cognitiveTypeId.localeCompare(b.cognitiveTypeId));
  }

  /**
   * Retrieves full candidate longitudinal overview with at most 3 bounded parallel queries.
   */
  public static async getLongitudinalOverview(
    supabase: SupabaseClient<Database>,
    userId: string,
    options: QueryOptions = {}
  ): Promise<MistakeLongitudinalOverview> {
    const referenceNow = options.referenceNow || Date.now();
    const window = this.resolveWindowConfig(options.windowDays || "30D", referenceNow);

    // 1. Fetch user mistake vault records (Query 1)
    const { data: vaultData } = await supabase
      .from("user_mistake_vault")
      .select("id, question_id, topic_id, subject_id, total_mistakes_count, consecutive_correct_in_remediation, lifecycle_status, primary_cognitive_type_id, first_mistake_at, last_mistake_at, mastered_at, topics(id, name, subject_id, subjects(id, name))")
      .eq("user_id", userId);

    const vaultRecords = (vaultData || []) as any[];

    // 2. Fetch mistake occurrences (Query 2)
    let occQuery = supabase
      .from("user_mistake_occurrences")
      .select("id, vault_id, user_id, question_id, question_version_id, attempt_answer_id, source_context, source_reference_id, selected_option_id, response_time_seconds, inferred_cognitive_type_id, occurrence_status, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(1000);

    const { data: occData } = await occQuery;
    const allOccurrences = (occData || []) as any[];

    // 3. Fetch attempt answers for denominator volume with candidate isolation (Query 3)
    let attemptsQuery = supabase
      .from("attempt_answers")
      .select("id, attempt_id, mock_question_id, question_version_id, is_correct, selected_option_key, time_spent_seconds, created_at, test_attempts!inner(user_id), mock_questions(mock_test_id, mock_section_id, mock_sections(subject_id), mock_tests(template_id, is_dynamic, mock_templates(test_type)), question_versions(question_id, questions(canonical_topic_id)))")
      .eq("test_attempts.user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2000);

    const { data: answersData } = await attemptsQuery;
    const allAttemptAnswers = (answersData || []) as any[];

    // Filter by active status
    const activeOccurrences = allOccurrences.filter((o) => o.occurrence_status === "ACTIVE");
    const revokedOccurrences = allOccurrences.filter(
      (o) => o.occurrence_status === "REVOKED_ERRATA" || o.occurrence_status === "REVOKED_VOID" || o.occurrence_status === "SUPERSEDED"
    );

    // Filter occurrences in active observation window
    const windowStartMs = new Date(window.startDate).getTime();
    const windowEndMs = new Date(window.endDate).getTime();

    const recentOccurrences = activeOccurrences.filter((o) => {
      const t = new Date(o.occurred_at).getTime();
      return t >= windowStartMs && t <= windowEndMs;
    });

    const priorStartMs = window.priorStartDate ? new Date(window.priorStartDate).getTime() : -Infinity;
    const priorEndMs = window.priorEndDate ? new Date(window.priorEndDate).getTime() : -Infinity;

    const priorOccurrences = activeOccurrences.filter((o) => {
      const t = new Date(o.occurred_at).getTime();
      return t >= priorStartMs && t < priorEndMs;
    });

    // Filter attempted answers (strictly exclude unanswered items from denominator)
    const answeredAttempts = allAttemptAnswers.filter(
      (a) => a.is_correct !== null || a.selected_option_key !== null
    );

    const recentAnswers = answeredAttempts.filter((a) => {
      const t = new Date(a.created_at).getTime();
      return t >= windowStartMs && t <= windowEndMs;
    });

    const priorAnswers = answeredAttempts.filter((a) => {
      const t = new Date(a.created_at).getTime();
      return t >= priorStartMs && t < priorEndMs;
    });

    // Relapse and Recovery Analytics
    const recoveryAnalytics = this.evaluateRelapseAndRecovery(vaultRecords, allOccurrences);
    const relapsedVaultIds = new Set(
      recoveryAnalytics.relapseDetails.filter((r) => r.status === "VERIFIED_RELAPSE").map((r) => r.vaultId)
    );

    // Group topic aggregates
    const topicMap: Record<
      string,
      {
        topicId: string;
        topicName: string;
        subjectId: string;
        subjectName: string;
        recentMistakes: number;
        priorMistakes: number;
        recentAttempts: number;
        priorAttempts: number;
        firstSeenMs: number;
        lastSeenMs: number;
        contextsWithErrors: Set<string>;
        contextsAttempted: Set<string>;
        hasRelapse: boolean;
        consecutiveCorrect: number;
        lifecycleStatus: string;
      }
    > = {};

    // Populate topics from vault records
    for (const v of vaultRecords) {
      const topicId = v.topic_id || "unassigned-topic";
      const topicName = v.topics?.name || "Unassigned Topic";
      const subjectId = v.subject_id || v.topics?.subject_id || "unassigned-subject";
      const subjectName = v.topics?.subjects?.name || "General Studies";

      if (!topicMap[topicId]) {
        topicMap[topicId] = {
          topicId,
          topicName,
          subjectId,
          subjectName,
          recentMistakes: 0,
          priorMistakes: 0,
          recentAttempts: 0,
          priorAttempts: 0,
          firstSeenMs: v.first_mistake_at ? new Date(v.first_mistake_at).getTime() : referenceNow,
          lastSeenMs: v.last_mistake_at ? new Date(v.last_mistake_at).getTime() : referenceNow,
          contextsWithErrors: new Set<string>(),
          contextsAttempted: new Set<string>(),
          hasRelapse: relapsedVaultIds.has(v.id),
          consecutiveCorrect: v.consecutive_correct_in_remediation || 0,
          lifecycleStatus: v.lifecycle_status,
        };
      } else {
        if (relapsedVaultIds.has(v.id)) {
          topicMap[topicId].hasRelapse = true;
        }
        if (v.first_mistake_at) {
          const fMs = new Date(v.first_mistake_at).getTime();
          if (fMs < topicMap[topicId].firstSeenMs) topicMap[topicId].firstSeenMs = fMs;
        }
        if (v.last_mistake_at) {
          const lMs = new Date(v.last_mistake_at).getTime();
          if (lMs > topicMap[topicId].lastSeenMs) topicMap[topicId].lastSeenMs = lMs;
        }
      }
    }

    // Accumulate occurrences into topics
    for (const occ of recentOccurrences) {
      const v = vaultRecords.find((r) => r.id === occ.vault_id || r.question_id === occ.question_id);
      const topicId = v?.topic_id || "unassigned-topic";
      if (topicMap[topicId]) {
        topicMap[topicId].recentMistakes++;
        topicMap[topicId].contextsWithErrors.add(occ.source_context || "MOCK_TEST");
        topicMap[topicId].contextsAttempted.add(occ.source_context || "MOCK_TEST");
      }
    }

    for (const occ of priorOccurrences) {
      const v = vaultRecords.find((r) => r.id === occ.vault_id || r.question_id === occ.question_id);
      const topicId = v?.topic_id || "unassigned-topic";
      if (topicMap[topicId]) {
        topicMap[topicId].priorMistakes++;
      }
    }

    // Accumulate attempt volume into topics
    for (const ans of recentAnswers) {
      const topicId = ans.mock_questions?.question_versions?.questions?.canonical_topic_id || "unassigned-topic";
      if (topicMap[topicId]) {
        topicMap[topicId].recentAttempts++;
        topicMap[topicId].contextsAttempted.add("MOCK_TEST");
      }
    }

    for (const ans of priorAnswers) {
      const topicId = ans.mock_questions?.question_versions?.questions?.canonical_topic_id || "unassigned-topic";
      if (topicMap[topicId]) {
        topicMap[topicId].priorAttempts++;
      }
    }

    // Generate topic trajectory details
    const topicTrajectories: TopicTrajectoryDetail[] = [];
    const weaknessList: Array<{
      topicId: string;
      topicName: string;
      subjectId: string;
      subjectName: string;
      errorRate: number | null;
      activeMistakeCount: number;
      activeDurationDays: number;
      contextsWithErrorsCount: number;
      crossExamPattern: CrossExamPattern;
      trajectory: TrajectoryState;
      hasRelapse: boolean;
      isSufficientData: boolean;
    }> = [];

    for (const tData of Object.values(topicMap)) {
      const recentMetric = this.calculateNormalizedMetric(tData.recentMistakes, tData.recentAttempts, this.MIN_DENOMINATOR_TOPIC);
      const priorMetric = this.calculateNormalizedMetric(tData.priorMistakes, tData.priorAttempts, this.MIN_DENOMINATOR_TOPIC);

      const deltaErrorRate =
        recentMetric.rate !== null && priorMetric.rate !== null
          ? Number((recentMetric.rate - priorMetric.rate).toFixed(4))
          : null;

      const isRecovering = tData.lifecycleStatus === "UNRESOLVED" && tData.consecutiveCorrect >= 1;

      const trajectory = this.classifyTrajectory({
        recentErrorRate: recentMetric.rate,
        priorErrorRate: priorMetric.rate,
        recentAttempts: tData.recentAttempts,
        priorAttempts: tData.priorAttempts,
        hasVerifiedRelapse: tData.hasRelapse,
        isRecovering,
      });

      const activeDays = Number(Math.max(0, (referenceNow - tData.firstSeenMs) / (1000 * 3600 * 24)).toFixed(1));

      const crossExamPattern = this.classifyCrossExamPattern({
        contextsAttempted: tData.contextsAttempted.size,
        contextsWithErrors: tData.contextsWithErrors.size,
        contextRateDelta: null,
        overallErrorRate: recentMetric.rate,
      });

      topicTrajectories.push({
        topicId: tData.topicId,
        topicName: tData.topicName,
        subjectId: tData.subjectId,
        subjectName: tData.subjectName,
        trajectory,
        recentMetric,
        priorMetric,
        deltaErrorRate,
        activeDurationDays: activeDays,
        contextsAttemptedCount: tData.contextsAttempted.size,
        contextsWithErrorsCount: tData.contextsWithErrors.size,
        crossExamPattern,
        relapseCount: tData.hasRelapse ? 1 : 0,
        hasActiveRelapse: tData.hasRelapse,
        activeMistakeCount: tData.recentMistakes,
      });

      weaknessList.push({
        topicId: tData.topicId,
        topicName: tData.topicName,
        subjectId: tData.subjectId,
        subjectName: tData.subjectName,
        errorRate: recentMetric.rate,
        activeMistakeCount: tData.recentMistakes,
        activeDurationDays: activeDays,
        contextsWithErrorsCount: tData.contextsWithErrors.size,
        crossExamPattern,
        trajectory,
        hasRelapse: tData.hasRelapse,
        isSufficientData: recentMetric.isSufficient,
      });
    }

    const rankedWeaknesses = this.rankLongitudinalWeaknesses(weaknessList);

    // Cross-exam intelligence aggregation across sources
    const contextBreakdown: CrossExamContextDetail[] = [];
    let totalAttemptedVolume = recentAnswers.length;
    let totalActiveErrors = recentOccurrences.length;

    const contextMap: Record<string, { mistakes: number; attempts: number | null; questions: Set<string> }> = {};
    for (const ctx of this.CANONICAL_RAW_SOURCE_CONTEXTS) {
      contextMap[ctx] = { mistakes: 0, attempts: ctx === "MOCK_TEST" ? recentAnswers.length : null, questions: new Set() };
    }

    for (const occ of recentOccurrences) {
      const ctx = occ.source_context || "MOCK_TEST";
      if (!contextMap[ctx]) {
        contextMap[ctx] = { mistakes: 0, attempts: null, questions: new Set() };
      }
      contextMap[ctx].mistakes++;
      contextMap[ctx].questions.add(occ.question_id);
    }

    let minRate = Infinity;
    let maxRate = -Infinity;
    let minCtx: string | null = null;
    let maxCtx: string | null = null;
    let contextsAttempted = 0;
    let contextsWithErrors = 0;

    for (const [ctx, cData] of Object.entries(contextMap)) {
      const metric = this.calculateNormalizedMetric(cData.mistakes, cData.attempts, this.MIN_DENOMINATOR_CONTEXT);
      contextBreakdown.push({
        sourceContext: ctx,
        productCategory: this.classifySourceToProductCategory({ sourceContext: ctx }),
        metric,
        mistakeCount: cData.mistakes,
        uniqueQuestionsAffected: cData.questions.size,
        isDenominatorAvailable: cData.attempts !== null,
      });

      if (cData.attempts !== null && cData.attempts >= this.MIN_DENOMINATOR_CONTEXT) {
        contextsAttempted++;
      } else if (cData.mistakes > 0) {
        contextsAttempted++;
      }

      if (cData.mistakes > 0) {
        contextsWithErrors++;
      }

      if (metric.rate !== null) {
        if (metric.rate > maxRate) {
          maxRate = metric.rate;
          maxCtx = ctx;
        }
        if (metric.rate < minRate) {
          minRate = metric.rate;
          minCtx = ctx;
        }
      }
    }

    const contextRateDelta = maxRate !== -Infinity && minRate !== Infinity ? Number((maxRate - minRate).toFixed(4)) : null;

    const overallNormalizedMetric = this.calculateNormalizedMetric(
      totalActiveErrors,
      totalAttemptedVolume > 0 ? totalAttemptedVolume : null,
      this.MIN_DENOMINATOR_TOPIC
    );

    const crossExamPattern = this.classifyCrossExamPattern({
      contextsAttempted,
      contextsWithErrors,
      contextRateDelta,
      overallErrorRate: overallNormalizedMetric.rate,
    });

    const crossExamIntelligence: CrossExamIntelligenceSummary = {
      contextsAttempted,
      contextsWithErrors,
      contextsWithoutErrors: Math.max(0, contextsAttempted - contextsWithErrors),
      totalAttempted: totalAttemptedVolume,
      totalIncorrect: totalActiveErrors,
      overallNormalizedErrorRate: overallNormalizedMetric.rate,
      contextErrorRates: contextBreakdown,
      contexts: contextBreakdown,
      highestErrorContext: maxCtx,
      lowestErrorContext: minCtx,
      contextRateDelta,
      crossExamPattern,
      patternDescription: this.describeCrossExamPattern(crossExamPattern, maxCtx),
    };

    // Cognitive Analytics
    const cognitiveDistribution = this.evaluateCognitiveDistribution(recentOccurrences, referenceNow);

    const relapseRate = recoveryAnalytics.totalMasteredCount > 0
      ? Number((recoveryAnalytics.totalRelapseCount / recoveryAnalytics.totalMasteredCount).toFixed(4))
      : 0;

    const recoverySummary = {
      totalMasteredCount: recoveryAnalytics.totalMasteredCount,
      totalRelapsedCount: recoveryAnalytics.totalRelapseCount,
      totalRelapseCount: recoveryAnalytics.totalRelapseCount,
      activeRelapsesCount: recoveryAnalytics.activeRelapsesCount,
      relapseRate,
      averageDaysToRecovery: recoveryAnalytics.averageDaysToRecovery,
      relapseDetails: recoveryAnalytics.relapseDetails,
    };

    return {
      userId,
      generatedAt: new Date(referenceNow).toISOString(),
      window,
      totalActiveMistakes: activeOccurrences.length,
      totalResolvedMistakes: vaultRecords.filter((v) => v.lifecycle_status === "MASTERED").length,
      totalRevokedMistakes: revokedOccurrences.length,
      overallNormalizedMetric,
      topWeaknesses: rankedWeaknesses,
      topicTrajectories,
      cognitiveDistribution,
      crossExamIntelligence,
      recoverySummary,
      relapseRecovery: recoverySummary,
    };
  }

  /**
   * Retrieves topic trajectories for a candidate.
   */
  public static async getTopicTrajectories(
    supabase: SupabaseClient<Database>,
    userId: string,
    options: QueryOptions = {}
  ): Promise<TopicTrajectoryDetail[]> {
    const overview = await this.getLongitudinalOverview(supabase, userId, options);
    return overview.topicTrajectories;
  }

  /**
   * Retrieves descriptive cross-exam intelligence for a candidate.
   */
  public static async getCrossExamAnalytics(
    supabase: SupabaseClient<Database>,
    userId: string,
    options: QueryOptions = {}
  ): Promise<CrossExamIntelligenceSummary> {
    const overview = await this.getLongitudinalOverview(supabase, userId, options);
    return overview.crossExamIntelligence;
  }

  /**
   * Retrieves cognitive failure pattern analytics for a candidate.
   */
  public static async getCognitiveAnalytics(
    supabase: SupabaseClient<Database>,
    userId: string,
    options: QueryOptions = {}
  ): Promise<CognitiveDistributionSummary[]> {
    const overview = await this.getLongitudinalOverview(supabase, userId, options);
    return overview.cognitiveDistribution;
  }

  /**
   * Retrieves top ranked longitudinal weaknesses for a candidate.
   */
  public static async getTopWeaknesses(
    supabase: SupabaseClient<Database>,
    userId: string,
    options: QueryOptions = {}
  ): Promise<LongitudinalWeaknessItem[]> {
    const overview = await this.getLongitudinalOverview(supabase, userId, options);
    return overview.topWeaknesses;
  }
}
