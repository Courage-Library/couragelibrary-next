import {
  CandidatePerformanceSignals,
} from "./adaptive-performance.service";
import {
  PersonalizationPolicyConfig,
  PersonalizationSignals,
} from "./adaptive-types";

export interface PersonalizationContext {
  candidateSignals: CandidatePerformanceSignals;
  topicServedCounts: Record<string, number>;
  subjectServedCounts: Record<string, number>;
  blueprintSubjects?: Array<{ id: string; targetQuota: number }>;
  policy?: PersonalizationPolicyConfig;
}

export class AdaptivePersonalizationService {
  public static readonly DEFAULT_MAX_INFLUENCE = 0.40;
  public static readonly DEFAULT_WEAK_AREA_WEIGHT = 0.35;
  public static readonly DEFAULT_MISTAKE_WEIGHT = 0.25;
  public static readonly DEFAULT_EXPLORATION_WEIGHT = 0.20;
  public static readonly DEFAULT_SUBJECT_WEIGHT = 0.20;

  /**
   * Computes bounded personalization signals that modify CAT priorities
   * without displacing 1PL Fisher Information as the primary anchor.
   */
  public static computePersonalizationSignals(
    context: PersonalizationContext
  ): PersonalizationSignals {
    const policy = context.policy || {};
    const enabled = policy.enabled ?? true;
    const maxInfluence = Math.min(0.40, Math.max(0.0, policy.max_influence ?? this.DEFAULT_MAX_INFLUENCE));

    if (!enabled) {
      return {
        is_cold_start: false,
        weak_area_priorities: {},
        mistake_question_ids: new Set<string>(),
        exploration_priorities: {},
        subject_balance_weights: {},
        max_personalization_influence: 0.0,
      };
    }

    const isColdStart = context.candidateSignals.is_cold_start;

    // 1. Weak-Area Priorities [0.0, 1.0]: W_T = max(0, 1 - Mastery_T)
    const weakAreaPriorities: Record<string, number> = {};
    for (const [topicId, stat] of Object.entries(context.candidateSignals.topic_mastery)) {
      if (isColdStart) {
        weakAreaPriorities[topicId] = 0.5; // neutral for cold start
      } else {
        const weakness = Math.max(0.0, Math.min(1.0, 1.0 - (stat.mastery_score ?? 0.5)));
        weakAreaPriorities[topicId] = Number(weakness.toFixed(4));
      }
    }

    // 2. Exploration Priorities [0.0, 1.0]: 1.0 for unserved topics, 0.2 for served
    const explorationPriorities: Record<string, number> = {};
    for (const topicId of Object.keys(context.topicServedCounts)) {
      const served = context.topicServedCounts[topicId] || 0;
      explorationPriorities[topicId] = served === 0 ? 1.0 : 0.2;
    }

    // 3. Subject Balance Weights [0.0, 1.0]: remaining quota need
    const subjectBalanceWeights: Record<string, number> = {};
    if (context.blueprintSubjects && context.blueprintSubjects.length > 0) {
      for (const subj of context.blueprintSubjects) {
        const served = context.subjectServedCounts[subj.id] || 0;
        const remaining = Math.max(0, subj.targetQuota - served);
        const weight = subj.targetQuota > 0 ? remaining / subj.targetQuota : 0.5;
        subjectBalanceWeights[subj.id] = Number(Math.max(0.0, Math.min(1.0, weight)).toFixed(4));
      }
    }

    return {
      is_cold_start: isColdStart,
      weak_area_priorities: weakAreaPriorities,
      mistake_question_ids: isColdStart
        ? new Set<string>()
        : context.candidateSignals.mistake_question_ids,
      exploration_priorities: explorationPriorities,
      subject_balance_weights: subjectBalanceWeights,
      max_personalization_influence: maxInfluence,
    };
  }
}
