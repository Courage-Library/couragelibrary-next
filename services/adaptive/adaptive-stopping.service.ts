import {
  AdaptiveTestConfigRow,
  StoppingDecision,
  StoppingPolicyConfig,
  StoppingReasonCode,
} from "./adaptive-types";

export interface StoppingEvaluationContext {
  questionsServed: number;
  currentSe: number;
  config: AdaptiveTestConfigRow;
  subjectCoverage?: Record<string, { served: number; target: number }>;
  topicCoverage?: Record<string, { served: number; minRequired: number }>;
  recentInformationContributions?: number[];
  isExpired?: boolean;
  isEmergencyDisabled?: boolean;
  noEligibleItemsRemaining?: boolean;
}

export class AdaptiveStoppingService {
  public static readonly DEFAULT_TARGET_SE = 0.35;
  public static readonly DEFAULT_MIN_QUESTIONS = 20;
  public static readonly DEFAULT_MAX_QUESTIONS = 50;
  public static readonly DEFAULT_DIMINISHING_THRESHOLD = 0.05;
  public static readonly DEFAULT_DIMINISHING_WINDOW = 5;

  /**
   * Calculates whether recent questions exhibit diminishing Fisher information contribution
   */
  public static calculateDiminishingInformation(
    contributions?: number[],
    windowSize: number = AdaptiveStoppingService.DEFAULT_DIMINISHING_WINDOW,
    threshold: number = AdaptiveStoppingService.DEFAULT_DIMINISHING_THRESHOLD
  ): boolean {
    if (!contributions || contributions.length < windowSize) {
      return false;
    }

    const recent = contributions.slice(-windowSize);
    const avgInfo = recent.reduce((sum, val) => sum + val, 0) / windowSize;
    return avgInfo < threshold;
  }

  /**
   * Evaluates server-authoritative stopping rules with strict deterministic precedence
   */
  public static evaluateStopping(context: StoppingEvaluationContext): StoppingDecision {
    const stoppingPolicy = (context.config.stopping_policy || {}) as unknown as StoppingPolicyConfig;
    const minQuestions = context.config.min_questions ?? AdaptiveStoppingService.DEFAULT_MIN_QUESTIONS;
    const maxQuestions = context.config.max_questions ?? AdaptiveStoppingService.DEFAULT_MAX_QUESTIONS;
    const targetSe = stoppingPolicy.target_se ?? AdaptiveStoppingService.DEFAULT_TARGET_SE;
    const diminishingThreshold =
      stoppingPolicy.diminishing_info_threshold ?? AdaptiveStoppingService.DEFAULT_DIMINISHING_THRESHOLD;
    const diminishingWindow =
      stoppingPolicy.diminishing_info_window ?? AdaptiveStoppingService.DEFAULT_DIMINISHING_WINDOW;
    const enforceBlueprint = stoppingPolicy.enforce_blueprint ?? true;
    const enforceTopicCoverage = stoppingPolicy.enforce_topic_coverage ?? true;

    const served = context.questionsServed;
    const currentSe = context.currentSe;
    const minSatisfied = served >= minQuestions;
    const maxReached = served >= maxQuestions;
    const seSatisfied = currentSe <= targetSe;

    // Check Blueprint (Subject) coverage
    let blueprintSatisfied = true;
    if (enforceBlueprint && context.subjectCoverage) {
      for (const [, req] of Object.entries(context.subjectCoverage)) {
        if (req.served < req.target) {
          blueprintSatisfied = false;
          break;
        }
      }
    }

    // Check Topic coverage minimums
    let topicCoverageSatisfied = true;
    if (enforceTopicCoverage && context.topicCoverage) {
      for (const [, req] of Object.entries(context.topicCoverage)) {
        if (req.served < req.minRequired) {
          topicCoverageSatisfied = false;
          break;
        }
      }
    }

    const diminishingInfo = this.calculateDiminishingInformation(
      context.recentInformationContributions,
      diminishingWindow,
      diminishingThreshold
    );

    const baseDecision = {
      questionsAnswered: served,
      minQuestionsSatisfied: minSatisfied,
      maxQuestionsReached: maxReached,
      targetSESatisfied: seSatisfied,
      blueprintSatisfied,
      topicCoverageSatisfied,
      diminishingInformation: diminishingInfo,
      evaluatedAt: new Date().toISOString(),
    };

    // ========================================================================
    // DETERMINISTIC PRECEDENCE EVALUATION
    // ========================================================================

    // 1. SYSTEM_SAFETY_STOP (Emergency kill switch or fatal error)
    if (context.isEmergencyDisabled) {
      return {
        ...baseDecision,
        shouldStop: true,
        reasonCode: "SYSTEM_SAFETY_STOP",
        rationale: "Adaptive assessment stopped by system safety kill-switch.",
      };
    }

    // 2. ATTEMPT_EXPIRED (Timer expired)
    if (context.isExpired) {
      return {
        ...baseDecision,
        shouldStop: true,
        reasonCode: "ATTEMPT_EXPIRED",
        rationale: "Assessment time limit expired.",
      };
    }

    // 3. MAX_QUESTIONS_REACHED (Hard upper limit ceiling)
    if (maxReached) {
      return {
        ...baseDecision,
        shouldStop: true,
        reasonCode: "MAX_QUESTIONS_REACHED",
        rationale: `Maximum question limit reached (${served}/${maxQuestions}).`,
      };
    }

    // 4. NO_ELIGIBLE_ITEMS (Pool exhausted)
    if (context.noEligibleItemsRemaining) {
      return {
        ...baseDecision,
        shouldStop: true,
        reasonCode: "NO_ELIGIBLE_ITEMS",
        rationale: "No eligible questions remaining in the question bank for this attempt.",
      };
    }

    // 5. MIN_QUESTIONS_NOT_REACHED (Continuation Gate: Cannot stop before min questions)
    if (!minSatisfied) {
      return {
        ...baseDecision,
        shouldStop: false,
        reasonCode: "MIN_QUESTIONS_NOT_REACHED",
        rationale: `Minimum questions requirement not yet met (${served}/${minQuestions}). Assessment must continue.`,
      };
    }

    // 6. BLUEPRINT_INCOMPLETE (Continuation Gate: Subject requirements unmet)
    if (!blueprintSatisfied) {
      return {
        ...baseDecision,
        shouldStop: false,
        reasonCode: "BLUEPRINT_INCOMPLETE",
        rationale: "Blueprint subject quota requirements not yet satisfied. Assessment must continue.",
      };
    }

    // 7. TOPIC_COVERAGE_INCOMPLETE (Continuation Gate: Topic coverage unmet)
    if (!topicCoverageSatisfied) {
      return {
        ...baseDecision,
        shouldStop: false,
        reasonCode: "TOPIC_COVERAGE_INCOMPLETE",
        rationale: "Essential topic coverage requirements not yet satisfied. Assessment must continue.",
      };
    }

    // 8. TARGET_SE_ACHIEVED (Precision stopping: SE <= target_se)
    if (seSatisfied) {
      return {
        ...baseDecision,
        shouldStop: true,
        reasonCode: "TARGET_SE_ACHIEVED",
        rationale: `Target measurement precision achieved (SE: ${currentSe.toFixed(4)} <= ${targetSe.toFixed(4)}).`,
      };
    }

    // 9. DIMINISHING_INFORMATION (Diminishing information contribution stop)
    if (diminishingInfo) {
      return {
        ...baseDecision,
        shouldStop: true,
        reasonCode: "DIMINISHING_INFORMATION",
        rationale: `Diminishing information contribution detected over the last ${diminishingWindow} items (avg contribution < ${diminishingThreshold}).`,
      };
    }

    // 10. CONTINUE (Default assessment progression)
    return {
      ...baseDecision,
      shouldStop: false,
      reasonCode: "CONTINUE",
      rationale: `Assessment in progress (${served}/${maxQuestions} answered, SE: ${currentSe.toFixed(4)}).`,
    };
  }
}
