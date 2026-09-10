import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  AdaptiveEngineError,
  DifficultyTier,
  ExplainableDecisionPayload,
  PersonalizationSignals,
  RankedQuestionCandidate,
  SelectionPolicyConfig,
  TopicPolicyConfig,
} from "./adaptive-types";
import { AdaptivePolicyService } from "./adaptive-policy.service";
import { CandidatePerformanceSignals } from "./adaptive-performance.service";

export interface SelectionContext {
  examId: string;
  patternId?: string | null;
  targetDifficulty: DifficultyTier;
  targetTheta: number;
  currentStandardError: number;
  stepNumber: number;
  servedQuestionVersionIds: Set<string>;
  topicServedCounts: Record<string, number>;
  lastServedTopicId?: string | null;
  consecutiveTopicStreak?: number;
  selectionPolicy?: SelectionPolicyConfig;
  topicPolicy?: TopicPolicyConfig;
  candidateSignals: CandidatePerformanceSignals;
  personalizationSignals?: PersonalizationSignals;
}

export interface EligibleQuestionItem {
  question_version_id: string;
  question_id: string;
  topic_id: string | null;
  subject_id: string | null;
  difficulty: string | null;
  calibration_status?: string | null;
  difficulty_b?: number | null;
  exposure_count?: number;
}

export class AdaptiveSelectionService {
  /**
   * 1PL / Rasch Model Fisher Information Function:
   * P(theta) = 1 / (1 + exp(-(theta - b)))
   * I(theta) = P(theta) * (1 - P(theta))
   * Theoretical max value is 0.25 (at theta = b)
   */
  public static calculate1PLFisherInformation(theta: number, b: number): number {
    const diff = theta - b;
    // Bounded sigmoid to avoid overflow
    const clampedDiff = Math.max(-15, Math.min(15, diff));
    const p = 1 / (1 + Math.exp(-clampedDiff));
    const info = p * (1 - p);
    return Math.max(0.0001, info);
  }

  /**
   * Normalized 1PL Fisher Information Metric in range [0.0, 1.0]
   * I_norm = I(theta) / 0.25 = 4 * P * (1 - P)
   */
  public static calculateNormalizedInformation(theta: number, b: number): number {
    const info = this.calculate1PLFisherInformation(theta, b);
    const normalized = info / 0.25;
    return Math.min(1.0, Math.max(0.0, Number(normalized.toFixed(4))));
  }

  /**
   * Convert static difficulty string into continuous proxy difficulty parameter b
   */
  public static mapStaticDifficultyToB(difficulty: string | null | undefined): number {
    const norm = AdaptivePolicyService.normalizeDifficulty(difficulty);
    switch (norm) {
      case "easy":
        return -1.0;
      case "hard":
        return 1.0;
      case "medium":
      default:
        return 0.0;
    }
  }

  /**
   * Fetches candidate questions from the question bank for the given exam
   */
  public static async fetchEligibleQuestions(
    supabase: SupabaseClient<Database>,
    examId: string,
    excludedVersionIds: Set<string>
  ): Promise<EligibleQuestionItem[]> {
    // 1. Fetch current question versions with questions joined
    const { data: questions, error } = await supabase
      .from("question_versions")
      .select(`
        id,
        question_id,
        difficulty,
        is_current,
        questions!inner(
          id,
          canonical_topic_id,
          status
        )
      `)
      .eq("is_current", true)
      .limit(300);

    if (error || !questions) {
      throw new AdaptiveEngineError(
        "INTERNAL_ADAPTIVE_ERROR",
        `Failed to fetch question pool: ${error?.message || "Unknown error"}`
      );
    }

    const questionVersionIds = (questions as any[]).map((q) => q.id);
    let calibrationMap: Record<string, { status: string; difficulty_b: number | null }> = {};
    let exposureMap: Record<string, number> = {};

    if (questionVersionIds.length > 0) {
      // 2. Fetch active calibrations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: calibs } = await (supabase as any)
        .from("adaptive_item_calibrations")
        .select("question_version_id, calibration_status, difficulty_b")
        .in("question_version_id", questionVersionIds);

      if (calibs && Array.isArray(calibs)) {
        for (const c of calibs) {
          calibrationMap[c.question_version_id] = {
            status: c.calibration_status,
            difficulty_b: c.difficulty_b,
          };
        }
      }

      // 3. Fetch exposure counts from adaptive_question_decisions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: decisions } = await (supabase as any)
        .from("adaptive_question_decisions")
        .select("question_version_id");

      if (decisions && Array.isArray(decisions)) {
        for (const d of decisions) {
          exposureMap[d.question_version_id] = (exposureMap[d.question_version_id] || 0) + 1;
        }
      }
    }

    const filtered: EligibleQuestionItem[] = [];

    for (const qv of questions as any[]) {
      if (excludedVersionIds.has(qv.id)) {
        continue;
      }

      const calibInfo = calibrationMap[qv.id];
      // Exclude deprecated items from adaptive generation
      if (calibInfo && calibInfo.status === "deprecated") {
        continue;
      }

      filtered.push({
        question_version_id: qv.id,
        question_id: qv.question_id,
        topic_id: qv.questions?.canonical_topic_id ?? null,
        subject_id: null,
        difficulty: qv.difficulty ?? null,
        calibration_status: calibInfo?.status ?? "uncalibrated",
        difficulty_b: calibInfo?.difficulty_b ?? null,
        exposure_count: exposureMap[qv.id] || 0,
      });
    }

    return filtered;
  }

  /**
   * Deterministically rank candidate questions and select the best item
   * using 1PL Rasch Fisher Information, content balancing, streak dampening,
   * mistake reinforcement, and exposure control.
   */
  public static rankCandidateQuestions(
    eligibleQuestions: EligibleQuestionItem[],
    context: SelectionContext
  ): {
    bestCandidate: RankedQuestionCandidate | null;
    rankedCandidates: RankedQuestionCandidate[];
    explainablePayload: ExplainableDecisionPayload;
  } {
    if (eligibleQuestions.length === 0) {
      throw new AdaptiveEngineError(
        "QUESTION_POOL_EXHAUSTED",
        "No eligible questions remain in the question bank for this adaptive attempt."
      );
    }

    // Default Multi-Objective CAT Weights
    const weights = {
      fisher_information: context.selectionPolicy?.weights?.difficulty_match ?? 0.40,
      content_balancing: context.selectionPolicy?.weights?.topic_priority ?? 0.25,
      exploration_value: context.selectionPolicy?.weights?.exploration_value ?? 0.15,
      mistake_bonus: context.selectionPolicy?.weights?.mistake_bonus ?? 0.10,
      exposure_control: 0.10,
    };

    const maxPerTopic = context.topicPolicy?.max_per_topic ?? 5;
    const maxConsecutiveStreak = 3;
    const maxExposureCeiling = 50;

    // Helper evaluation function for candidate scoring
    const evaluateCandidates = (
      candidates: EligibleQuestionItem[],
      options: {
        enforceStreak: boolean;
        enforceTopicCap: boolean;
      }
    ): RankedQuestionCandidate[] => {
      const results: RankedQuestionCandidate[] = [];

      for (const q of candidates) {
        const topicTimesServed = q.topic_id ? (context.topicServedCounts[q.topic_id] || 0) : 0;
        
        // Topic Cap Check
        if (options.enforceTopicCap && q.topic_id && topicTimesServed >= maxPerTopic) {
          continue;
        }

        // Topic Consecutive Streak Check
        const isCurrentStreakTopic =
          Boolean(q.topic_id && context.lastServedTopicId && q.topic_id === context.lastServedTopicId);
        const streakViolated =
          isCurrentStreakTopic && (context.consecutiveTopicStreak || 0) >= maxConsecutiveStreak;

        if (options.enforceStreak && streakViolated) {
          continue;
        }

        // 1. Effective Difficulty Parameter (b)
        let effectiveB: number;
        let normalizedDifficulty: DifficultyTier;

        if (
          (q.calibration_status === "calibrated" || q.calibration_status === "provisional") &&
          typeof q.difficulty_b === "number"
        ) {
          effectiveB = q.difficulty_b;
          if (effectiveB < -0.8) {
            normalizedDifficulty = "easy";
          } else if (effectiveB > 0.8) {
            normalizedDifficulty = "hard";
          } else {
            normalizedDifficulty = "medium";
          }
        } else {
          effectiveB = this.mapStaticDifficultyToB(q.difficulty);
          normalizedDifficulty = AdaptivePolicyService.normalizeDifficulty(q.difficulty);
        }

        // 2. Normalized Fisher Information Metric [0.0, 1.0]
        const normFisherInfo = this.calculateNormalizedInformation(context.targetTheta, effectiveB);

        // 3. Content Balancing Score [0.0, 1.0]
        const topicMastery = q.topic_id && context.candidateSignals.topic_mastery[q.topic_id]
          ? context.candidateSignals.topic_mastery[q.topic_id].mastery_score
          : 0.5;

        const topicAssessment = AdaptivePolicyService.computeTopicPriority(
          q.topic_id,
          topicMastery,
          topicTimesServed,
          maxPerTopic,
          context.topicPolicy
        );
        let contentBalanceScore = topicAssessment.priorityScore;
        if (
          context.personalizationSignals &&
          q.topic_id &&
          context.personalizationSignals.weak_area_priorities[q.topic_id] !== undefined
        ) {
          const weakPriority = context.personalizationSignals.weak_area_priorities[q.topic_id];
          contentBalanceScore = Number((0.6 * contentBalanceScore + 0.4 * weakPriority).toFixed(4));
        }

        // 4. Topic Exploration Score [0.0, 1.0]
        let explorationScore = topicTimesServed === 0 ? 1.0 : 0.2;
        if (
          context.personalizationSignals &&
          q.topic_id &&
          context.personalizationSignals.exploration_priorities[q.topic_id] !== undefined
        ) {
          explorationScore = context.personalizationSignals.exploration_priorities[q.topic_id];
        }

        // 5. Mistake Vault Reinforcement Bonus [0.0, 1.0]
        const isMistake = context.personalizationSignals
          ? context.personalizationSignals.mistake_question_ids.has(q.question_id)
          : context.candidateSignals.mistake_question_ids.has(q.question_id);
        const mistakeBonus = isMistake ? 1.0 : 0.0;

        // 6. Exposure Control Penalty [0.0, 1.0]
        const exposureCount = q.exposure_count || 0;
        const exposureFactor = Math.max(0.0, 1.0 - Math.min(1.0, exposureCount / maxExposureCeiling));

        // 7. Topic Streak Dampening
        let streakDampener = 1.0;
        if (streakViolated) {
          streakDampener = 0.70;
        }

        // 8. Multi-Objective Additive Composite Score
        const rawScore =
          normFisherInfo * weights.fisher_information +
          contentBalanceScore * weights.content_balancing +
          explorationScore * weights.exploration_value +
          mistakeBonus * weights.mistake_bonus +
          exposureFactor * weights.exposure_control;

        const totalScore = Number((rawScore * streakDampener).toFixed(4));

        results.push({
          question_version_id: q.question_version_id,
          question_id: q.question_id,
          topic_id: q.topic_id,
          subject_id: q.subject_id,
          difficulty_tier: normalizedDifficulty,
          raw_difficulty: q.difficulty,
          is_in_mistake_vault: isMistake,
          total_score: totalScore,
          score_breakdown: {
            difficulty_match_score: normFisherInfo,
            topic_priority_score: contentBalanceScore,
            exploration_score: explorationScore,
            mistake_bonus: mistakeBonus,
            repetition_penalty: streakViolated ? 0.30 : 0.0,
          },
          explanation: `Theta: ${context.targetTheta.toFixed(2)}, Diff b: ${effectiveB.toFixed(2)}, I_norm: ${normFisherInfo.toFixed(2)}, Content: ${contentBalanceScore.toFixed(2)}, Expl: ${explorationScore}, Mistake: ${mistakeBonus}, Exp: ${exposureFactor.toFixed(2)}. Total: ${totalScore}`,
        });
      }

      return results;
    };

    // 4-Level Fallback Relaxation Hierarchy
    let rankedCandidates = evaluateCandidates(eligibleQuestions, {
      enforceStreak: true,
      enforceTopicCap: true,
    });
    let selectionReason = "CAT_INFORMATION_MAXIMIZED";

    if (rankedCandidates.length === 0) {
      // Level 2: Relax topic streak
      rankedCandidates = evaluateCandidates(eligibleQuestions, {
        enforceStreak: false,
        enforceTopicCap: true,
      });
      selectionReason = "CAT_FALLBACK_STREAK_RELAXED";
    }

    if (rankedCandidates.length === 0) {
      // Level 3: Relax topic capacity cap
      rankedCandidates = evaluateCandidates(eligibleQuestions, {
        enforceStreak: false,
        enforceTopicCap: false,
      });
      selectionReason = "CAT_FALLBACK_POOL_RELAXED";
    }

    if (rankedCandidates.length === 0) {
      throw new AdaptiveEngineError(
        "QUESTION_POOL_EXHAUSTED",
        "All available questions have been exhausted or restricted by adaptive policies."
      );
    }

    // Deterministic Sort:
    // 1. Total Score descending
    // 2. Deterministic Tie-Breaker: question_version_id ascending
    rankedCandidates.sort((a, b) => {
      if (b.total_score !== a.total_score) {
        return b.total_score - a.total_score;
      }
      return a.question_version_id.localeCompare(b.question_version_id);
    });

    const best = rankedCandidates[0];

    const explainablePayload: ExplainableDecisionPayload = {
      step_number: context.stepNumber,
      selected_question_version_id: best.question_version_id,
      selected_difficulty: best.difficulty_tier,
      target_difficulty: context.targetDifficulty,
      target_theta: context.targetTheta,
      current_standard_error: context.currentStandardError,
      strategy_applied: selectionReason,
      total_candidates_evaluated: rankedCandidates.length,
      top_score: best.total_score,
      score_breakdown: best.score_breakdown,
      decision_rationale: best.explanation,
      alternative_candidates: rankedCandidates.slice(1, 4).map((c) => ({
        question_version_id: c.question_version_id,
        total_score: c.total_score,
        difficulty_tier: c.difficulty_tier,
      })),
      evaluated_at: new Date().toISOString(),
    };

    return {
      bestCandidate: best,
      rankedCandidates,
      explainablePayload,
    };
  }
}
