import {
  DifficultyPolicyConfig,
  DifficultyTier,
  SelectionPolicyConfig,
  TopicPolicyConfig,
} from "./adaptive-types";

export class AdaptivePolicyService {
  /**
   * Normalize any arbitrary raw difficulty string/value into standard DifficultyTier ('easy' | 'medium' | 'hard')
   * Fallback is always 'medium'.
   */
  public static normalizeDifficulty(rawDifficulty?: string | number | null): DifficultyTier {
    if (!rawDifficulty) return "medium";

    if (typeof rawDifficulty === "number") {
      if (rawDifficulty <= 0.33) return "easy";
      if (rawDifficulty <= 0.66) return "medium";
      return "hard";
    }

    const normalized = String(rawDifficulty).trim().toLowerCase();
    if (normalized === "easy" || normalized === "simple" || normalized === "beginner" || normalized === "1") {
      return "easy";
    }
    if (normalized === "hard" || normalized === "difficult" || normalized === "advanced" || normalized === "3") {
      return "hard";
    }
    if (normalized === "medium" || normalized === "moderate" || normalized === "intermediate" || normalized === "2") {
      return "medium";
    }

    return "medium";
  }

  /**
   * Convert difficulty tier to standard difficulty location parameter b_i on standard normal scale
   */
  public static getDifficultyLocationParameter(tier: DifficultyTier): number {
    switch (tier) {
      case "easy":
        return -1.0;
      case "medium":
        return 0.0;
      case "hard":
        return 1.0;
      default:
        return 0.0;
    }
  }

  /**
   * Map continuous latent ability theta to a recommended discrete difficulty tier
   */
  public static mapThetaToDifficultyTier(
    theta: number,
    policyConfig?: DifficultyPolicyConfig
  ): DifficultyTier {
    const easyMax = policyConfig?.tier_thresholds?.easy_max ?? -0.4;
    const mediumMax = policyConfig?.tier_thresholds?.medium_max ?? 0.4;

    if (theta < easyMax) {
      return "easy";
    } else if (theta > mediumMax) {
      return "hard";
    } else {
      return "medium";
    }
  }

  /**
   * Determine target difficulty for the next step, taking into account current theta,
   * step number, and initial config policy.
   */
  public static determineNextTargetDifficulty(
    currentTheta: number,
    stepNumber: number,
    policyConfig?: DifficultyPolicyConfig
  ): DifficultyTier {
    // Step 1: use initial_difficulty from policy if specified, otherwise map initial theta
    if (stepNumber === 1 && policyConfig?.initial_difficulty) {
      return policyConfig.initial_difficulty;
    }

    return this.mapThetaToDifficultyTier(currentTheta, policyConfig);
  }

  /**
   * Calculate dynamic exploration rate for current step
   * Decays smoothly with step count to balance early exploration with late precision
   */
  public static calculateExplorationRate(
    stepNumber: number,
    selectionPolicy?: SelectionPolicyConfig
  ): number {
    const baseRate = selectionPolicy?.exploration_rate ?? 0.15;
    const decayFactor = 0.05;
    const minRate = 0.05;

    // e.g. baseRate * exp(-decayFactor * (step - 1))
    const rate = baseRate * Math.exp(-decayFactor * Math.max(0, stepNumber - 1));
    return Math.max(minRate, Math.min(1.0, Number(rate.toFixed(4))));
  }

  /**
   * Computes topic selection priority score
   * Combines weakness focus (exploitation) and topic novelty (exploration)
   */
  public static computeTopicPriority(
    topicId: string | null,
    topicMastery: number, // 0.0 to 1.0
    timesServedInAttempt: number,
    maxPerTopic: number = 5,
    topicPolicy?: TopicPolicyConfig
  ): { priorityScore: number; isEligible: boolean; rationale: string } {
    if (!topicId) {
      return {
        priorityScore: 0.5,
        isEligible: true,
        rationale: "General topic / unassigned topic",
      };
    }

    // Constraint: max questions per topic
    if (timesServedInAttempt >= maxPerTopic) {
      return {
        priorityScore: 0.0,
        isEligible: false,
        rationale: `Max topic limit reached (${timesServedInAttempt}/${maxPerTopic})`,
      };
    }

    const coverageMode = topicPolicy?.coverage_mode ?? "balanced";
    let priorityScore = 0.5;

    if (coverageMode === "weakness_focused") {
      // Prioritize low mastery
      priorityScore = 1.0 - topicMastery;
    } else if (coverageMode === "balanced") {
      // Balance between low mastery and topics that have not been served yet
      const noveltyBonus = timesServedInAttempt === 0 ? 0.3 : 0.0;
      const weaknessBonus = (1.0 - topicMastery) * 0.4;
      priorityScore = 0.3 + noveltyBonus + weaknessBonus;
    } else {
      // Default / blueprint weighted
      const weight = topicPolicy?.topic_weights?.[topicId] ?? 1.0;
      priorityScore = (1.0 - topicMastery * 0.5) * weight;
    }

    return {
      priorityScore: Math.max(0.0, Math.min(1.0, Number(priorityScore.toFixed(4)))),
      isEligible: true,
      rationale: `Coverage mode: ${coverageMode}, Mastery: ${topicMastery}, Times served: ${timesServedInAttempt}`,
    };
  }
}
