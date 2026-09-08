import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  AdaptiveEngineError,
  DifficultyTier,
  ExplainableDecisionPayload,
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
  selectionPolicy?: SelectionPolicyConfig;
  topicPolicy?: TopicPolicyConfig;
  candidateSignals: CandidatePerformanceSignals;
}

export class AdaptiveSelectionService {
  /**
   * Fetches candidate questions from the question bank for the given exam
   */
  public static async fetchEligibleQuestions(
    supabase: SupabaseClient<Database>,
    examId: string,
    excludedVersionIds: Set<string>
  ): Promise<
    Array<{
      question_version_id: string;
      question_id: string;
      topic_id: string | null;
      subject_id: string | null;
      difficulty: string | null;
    }>
  > {
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

    const filtered: Array<{
      question_version_id: string;
      question_id: string;
      topic_id: string | null;
      subject_id: string | null;
      difficulty: string | null;
    }> = [];

    for (const qv of questions as any[]) {
      if (excludedVersionIds.has(qv.id)) {
        continue;
      }
      filtered.push({
        question_version_id: qv.id,
        question_id: qv.question_id,
        topic_id: qv.questions?.canonical_topic_id ?? null,
        subject_id: null,
        difficulty: qv.difficulty ?? null,
      });
    }

    return filtered;
  }

  /**
   * Calculate distance between two difficulty tiers
   * Returns match score from 0.1 to 1.0
   */
  public static calculateDifficultyMatch(
    target: DifficultyTier,
    actual: DifficultyTier
  ): number {
    if (target === actual) return 1.0;
    const tierMap: Record<DifficultyTier, number> = { easy: 1, medium: 2, hard: 3 };
    const diff = Math.abs(tierMap[target] - tierMap[actual]);
    if (diff === 1) return 0.5;
    return 0.1;
  }

  /**
   * Deterministically rank candidate questions and select the best item
   */
  public static rankCandidateQuestions(
    eligibleQuestions: Array<{
      question_version_id: string;
      question_id: string;
      topic_id: string | null;
      subject_id: string | null;
      difficulty: string | null;
    }>,
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

    const weights = context.selectionPolicy?.weights ?? {
      difficulty_match: 0.35,
      topic_priority: 0.30,
      exploration_value: 0.20,
      mistake_bonus: 0.15,
    };

    const maxPerTopic = context.topicPolicy?.max_per_topic ?? 5;
    const rankedCandidates: RankedQuestionCandidate[] = [];

    for (const q of eligibleQuestions) {
      const normalizedDifficulty = AdaptivePolicyService.normalizeDifficulty(q.difficulty);
      const diffMatchScore = this.calculateDifficultyMatch(
        context.targetDifficulty,
        normalizedDifficulty
      );

      const topicTimesServed = q.topic_id ? (context.topicServedCounts[q.topic_id] || 0) : 0;
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

      // If topic limit exceeded, skip this candidate
      if (!topicAssessment.isEligible) {
        continue;
      }

      // Exploration bonus: higher if topic hasn't been served yet in this attempt
      const explorationScore = topicTimesServed === 0 ? 1.0 : 0.2;

      // Mistake reinforcement bonus
      const isMistake = context.candidateSignals.mistake_question_ids.has(q.question_id);
      const mistakeBonus = isMistake ? 1.0 : 0.0;

      // Calculate composite score
      const totalScore = Number(
        (
          diffMatchScore * (weights.difficulty_match ?? 0.35) +
          topicAssessment.priorityScore * (weights.topic_priority ?? 0.30) +
          explorationScore * (weights.exploration_value ?? 0.20) +
          mistakeBonus * (weights.mistake_bonus ?? 0.15)
        ).toFixed(4)
      );

      rankedCandidates.push({
        question_version_id: q.question_version_id,
        question_id: q.question_id,
        topic_id: q.topic_id,
        subject_id: q.subject_id,
        difficulty_tier: normalizedDifficulty,
        raw_difficulty: q.difficulty,
        is_in_mistake_vault: isMistake,
        total_score: totalScore,
        score_breakdown: {
          difficulty_match_score: diffMatchScore,
          topic_priority_score: topicAssessment.priorityScore,
          exploration_score: explorationScore,
          mistake_bonus: mistakeBonus,
          repetition_penalty: 0.0,
        },
        explanation: `Target Diff: ${context.targetDifficulty}, Actual: ${normalizedDifficulty} (Match: ${diffMatchScore}). Topic Priority: ${topicAssessment.priorityScore}. Exploration: ${explorationScore}. Mistake: ${mistakeBonus}. Total: ${totalScore}`,
      });
    }

    if (rankedCandidates.length === 0) {
      throw new AdaptiveEngineError(
        "QUESTION_POOL_EXHAUSTED",
        "All available questions have exceeded topic limits or policy constraints."
      );
    }

    // Deterministic Sort:
    // 1. Score descending
    // 2. Tie-breaker: question_version_id ascending (deterministic string sort)
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
      strategy_applied: context.selectionPolicy?.strategy || "max_fisher_information",
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
