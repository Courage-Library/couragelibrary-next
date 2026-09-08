import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  DifficultyTier,
  TopicPerformanceStat,
  UserAdaptiveProfileRow,
} from "./adaptive-types";

export interface CandidatePerformanceSignals {
  overall_theta: number;
  overall_confidence: number;
  is_cold_start: boolean;
  topic_mastery: Record<string, TopicPerformanceStat>;
  mistake_question_ids: Set<string>;
  weak_topic_ids: string[];
  strong_topic_ids: string[];
}

export class AdaptivePerformanceService {
  /**
   * Calculate Bayesian-smoothed topic mastery
   * Prior = 0.5, alpha = 2, beta = 2 (Laplace smoothing)
   */
  public static calculateSmoothedMastery(
    correctCount: number,
    totalCount: number,
    prior: number = 0.5,
    alpha: number = 2.0,
    beta: number = 2.0
  ): number {
    if (totalCount === 0) return prior;
    const smoothed = (correctCount + alpha * prior) / (totalCount + alpha + beta);
    return Math.max(0.0, Math.min(1.0, Number(smoothed.toFixed(4))));
  }

  /**
   * Load candidate performance profile, mistake vault history, and prior calibration signals
   */
  public static async getCandidateSignals(
    supabase: SupabaseClient<Database>,
    userId: string,
    examId: string
  ): Promise<CandidatePerformanceSignals> {
    // 1. Fetch user adaptive profile if exists
    const { data: profile } = await supabase
      .from("user_adaptive_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("exam_id", examId)
      .maybeSingle();

    // 2. Fetch mistake vault question IDs for this candidate & exam
    let mistakeQuestionIds = new Set<string>();
    try {
      const { data: mistakes } = await supabase
        .from("user_mistake_vault")
        .select("question_id")
        .eq("user_id", userId)
        .neq("lifecycle_status", "MASTERED")
        .limit(100);

      if (mistakes && mistakes.length > 0) {
        mistakeQuestionIds = new Set(
          (mistakes as any[]).map((m) => m.question_id).filter(Boolean)
        );
      }
    } catch {
      // Non-fatal: if mistake vault lookup fails or table has RLS, continue with empty set
      mistakeQuestionIds = new Set();
    }

    if (!profile) {
      return {
        overall_theta: 0.0,
        overall_confidence: 0.5,
        is_cold_start: true,
        topic_mastery: {},
        mistake_question_ids: mistakeQuestionIds,
        weak_topic_ids: [],
        strong_topic_ids: [],
      };
    }

    const typedProfile = profile as unknown as UserAdaptiveProfileRow;
    const subjectAbilities = (typedProfile.subject_abilities as Record<string, unknown>) || {};
    const topicMasteryMap: Record<string, TopicPerformanceStat> = {};
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];

    // Parse topics from subject_abilities if structured
    if (typeof subjectAbilities === "object" && subjectAbilities !== null) {
      for (const [topicId, data] of Object.entries(subjectAbilities)) {
        if (data && typeof data === "object") {
          const typedData = data as {
            served_count?: number;
            correct_count?: number;
            incorrect_count?: number;
            topic_name?: string;
          };
          const served = typedData.served_count || 0;
          const correct = typedData.correct_count || 0;
          const incorrect = typedData.incorrect_count || 0;
          const mastery = this.calculateSmoothedMastery(correct, served);

          topicMasteryMap[topicId] = {
            topic_id: topicId,
            topic_name: typedData.topic_name,
            served_count: served,
            correct_count: correct,
            incorrect_count: incorrect,
            mastery_score: mastery,
          };

          if (mastery < 0.45 && served >= 2) {
            weakTopics.push(topicId);
          } else if (mastery > 0.70 && served >= 3) {
            strongTopics.push(topicId);
          }
        }
      }
    }

    return {
      overall_theta: typedProfile.overall_theta ?? 0.0,
      overall_confidence: typedProfile.overall_confidence ?? 0.5,
      is_cold_start: (typedProfile.total_adaptive_questions_answered || 0) < 5,
      topic_mastery: topicMasteryMap,
      mistake_question_ids: mistakeQuestionIds,
      weak_topic_ids: weakTopics,
      strong_topic_ids: strongTopics,
    };
  }

  /**
   * Updates or recalibrates the user adaptive profile upon attempt completion
   */
  public static async recordAttemptCompletion(
    supabase: SupabaseClient<Database>,
    userId: string,
    examId: string,
    finalTheta: number,
    finalSe: number,
    totalAnswered: number,
    correctCount: number,
    difficultyStats: Record<DifficultyTier, { correct: number; total: number }>,
    topicBreakdown: Record<string, { served: number; correct: number; incorrect: number }>
  ): Promise<void> {
    const confidence = Math.max(0.0, Math.min(1.0, 1.0 - finalSe));

    const difficultyAccuracies: Record<DifficultyTier, number> = {
      easy: difficultyStats.easy.total > 0 ? Number((difficultyStats.easy.correct / difficultyStats.easy.total).toFixed(4)) : 0.0,
      medium: difficultyStats.medium.total > 0 ? Number((difficultyStats.medium.correct / difficultyStats.medium.total).toFixed(4)) : 0.0,
      hard: difficultyStats.hard.total > 0 ? Number((difficultyStats.hard.correct / difficultyStats.hard.total).toFixed(4)) : 0.0,
    };

    // Upsert into user_adaptive_profiles
    const { data: existing } = await supabase
      .from("user_adaptive_profiles")
      .select("id, total_adaptive_tests_completed, total_adaptive_questions_answered, subject_abilities")
      .eq("user_id", userId)
      .eq("exam_id", examId)
      .maybeSingle();

    if (existing) {
      const prevTests = (existing as unknown as { total_adaptive_tests_completed: number }).total_adaptive_tests_completed || 0;
      const prevQuestions = (existing as unknown as { total_adaptive_questions_answered: number }).total_adaptive_questions_answered || 0;
      const existingAbilities = ((existing as unknown as { subject_abilities: Record<string, unknown> }).subject_abilities || {}) as Record<string, unknown>;

      // Merge topic breakdowns
      const mergedAbilities: Record<string, unknown> = { ...existingAbilities };
      for (const [topicId, stats] of Object.entries(topicBreakdown)) {
        const prevTopic = (mergedAbilities[topicId] as { served_count?: number; correct_count?: number; incorrect_count?: number }) || {};
        const newServed = (prevTopic.served_count || 0) + stats.served;
        const newCorrect = (prevTopic.correct_count || 0) + stats.correct;
        const newIncorrect = (prevTopic.incorrect_count || 0) + stats.incorrect;
        mergedAbilities[topicId] = {
          served_count: newServed,
          correct_count: newCorrect,
          incorrect_count: newIncorrect,
          mastery_score: this.calculateSmoothedMastery(newCorrect, newServed),
        };
      }

      await supabase
        .from("user_adaptive_profiles")
        .update({
          overall_theta: finalTheta,
          overall_confidence: confidence,
          subject_abilities: mergedAbilities as any,
          difficulty_accuracies: difficultyAccuracies as any,
          total_adaptive_tests_completed: prevTests + 1,
          total_adaptive_questions_answered: prevQuestions + totalAnswered,
          last_calibrated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      const initialAbilities: Record<string, unknown> = {};
      for (const [topicId, stats] of Object.entries(topicBreakdown)) {
        initialAbilities[topicId] = {
          served_count: stats.served,
          correct_count: stats.correct,
          incorrect_count: stats.incorrect,
          mastery_score: this.calculateSmoothedMastery(stats.correct, stats.served),
        };
      }

      await supabase.from("user_adaptive_profiles").insert({
        user_id: userId,
        exam_id: examId,
        overall_theta: finalTheta,
        overall_confidence: confidence,
        subject_abilities: initialAbilities as any,
        difficulty_accuracies: difficultyAccuracies as any,
        total_adaptive_tests_completed: 1,
        total_adaptive_questions_answered: totalAnswered,
        last_calibrated_at: new Date().toISOString(),
      });
    }
  }
}
