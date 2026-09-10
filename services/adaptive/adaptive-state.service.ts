import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  AdaptiveAttemptStateRow,
  AdaptiveEngineError,
  AdaptiveTestConfigRow,
  DifficultyTier,
  SequenceStepRecord,
  StoppingPolicyConfig,
  StoppingReason,
} from "./adaptive-types";
import { AdaptivePolicyService } from "./adaptive-policy.service";

import {
  AdaptiveAbilityService,
  EstimationResult,
  ResponseItemRecord,
} from "./adaptive-ability.service";

export interface AbilityUpdateResult {
  updatedTheta: number;
  updatedSe: number;
  probabilityCorrect: number;
  effectiveInformation?: number;
  converged?: boolean;
  iterations?: number;
}

export interface StoppingEvaluationResult {
  shouldStop: boolean;
  reason?: StoppingReason;
  rationale: string;
}

export class AdaptiveStateService {
  /**
   * Update latent ability estimate (theta) and precision (standard error)
   * using regularized 1PL Rasch estimation
   */
  public static calculateUpdatedAbility(
    currentTheta: number,
    itemDifficulty: DifficultyTier | number,
    isCorrect: boolean,
    stepNumber: number,
    minTheta: number = -3.0,
    maxTheta: number = 3.0,
    historyResponses?: ResponseItemRecord[]
  ): AbilityUpdateResult {
    let b: number;
    if (typeof itemDifficulty === "number") {
      b = itemDifficulty;
    } else {
      b = AdaptivePolicyService.getDifficultyLocationParameter(itemDifficulty);
    }

    const pCorrect = AdaptiveAbilityService.computeLogisticProbability(currentTheta, b);

    // If full historical responses are provided, solve via regularized Newton-Raphson MAP
    if (historyResponses && historyResponses.length > 0) {
      const estimation = AdaptiveAbilityService.estimateAbility(
        historyResponses,
        currentTheta,
        {
          min_theta: minTheta,
          max_theta: maxTheta,
          regularization_lambda: AdaptiveAbilityService.DEFAULT_LAMBDA,
        }
      );

      return {
        updatedTheta: estimation.theta,
        updatedSe: estimation.standard_error,
        probabilityCorrect: Number(pCorrect.toFixed(4)),
        effectiveInformation: estimation.effective_information,
        converged: estimation.converged,
        iterations: estimation.iterations,
      };
    }

    // Single-step regularized update
    const lambda = AdaptiveAbilityService.DEFAULT_LAMBDA;
    const singleResponse: ResponseItemRecord = {
      question_version_id: "current_step",
      is_correct: isCorrect,
      difficulty_b: b,
      difficulty_source: typeof itemDifficulty === "number" ? "CALIBRATED" : "STATIC_FALLBACK",
    };

    const estimation = AdaptiveAbilityService.estimateAbility(
      [singleResponse],
      currentTheta,
      {
        min_theta: minTheta,
        max_theta: maxTheta,
        regularization_lambda: lambda,
      }
    );

    // Dynamic SE based on cumulative steps
    const cumulativeInfo = Math.max(1, stepNumber) * pCorrect * (1.0 - pCorrect) + lambda;
    const computedSe = AdaptiveAbilityService.computeStandardError(cumulativeInfo, 0.10, 1.0);

    return {
      updatedTheta: estimation.theta,
      updatedSe: computedSe,
      probabilityCorrect: Number(pCorrect.toFixed(4)),
      effectiveInformation: Number(cumulativeInfo.toFixed(4)),
      converged: estimation.converged,
      iterations: estimation.iterations,
    };
  }

  /**
   * Runs regularized 1PL ability estimation over candidate response history
   */
  public static calculateRegularizedAbility(
    responses: ResponseItemRecord[],
    initialTheta: number = 0.0,
    minTheta: number = -3.0,
    maxTheta: number = 3.0
  ): EstimationResult {
    return AdaptiveAbilityService.estimateAbility(responses, initialTheta, {
      min_theta: minTheta,
      max_theta: maxTheta,
    });
  }

  /**
   * Evaluates stopping conditions based on current state and stopping policy
   */
  public static evaluateStoppingRules(
    servedCount: number,
    currentSe: number,
    config: AdaptiveTestConfigRow
  ): StoppingEvaluationResult {
    const stoppingPolicy = (config.stopping_policy || {}) as unknown as StoppingPolicyConfig;
    const minQuestions = config.min_questions || 20;
    const maxQuestions = config.max_questions || 50;
    const targetSe = stoppingPolicy.target_se ?? 0.35;

    // 1. Max questions rule (Hard limit)
    if (servedCount >= maxQuestions) {
      return {
        shouldStop: true,
        reason: "MAX_QUESTIONS_REACHED",
        rationale: `Maximum questions reached (${servedCount}/${maxQuestions})`,
      };
    }

    // 2. Minimum questions requirement (Cannot stop before min questions unless pool exhausted)
    if (servedCount < minQuestions) {
      return {
        shouldStop: false,
        rationale: `Minimum questions requirement not met (${servedCount}/${minQuestions})`,
      };
    }

    // 3. Precision rule (SE <= target_se)
    if (currentSe <= targetSe) {
      return {
        shouldStop: true,
        reason: "TARGET_PRECISION_ACHIEVED",
        rationale: `Target measurement precision reached (SE: ${currentSe} <= ${targetSe})`,
      };
    }

    return {
      shouldStop: false,
      rationale: `Test continues. Served: ${servedCount}, Current SE: ${currentSe}, Target SE: ${targetSe}`,
    };
  }

  /**
   * Verifies if a given step number is already decided (idempotency check)
   */
  public static async getExistingStepDecision(
    supabase: SupabaseClient<Database>,
    attemptId: string,
    stepNumber: number
  ) {
    const { data } = await supabase
      .from("adaptive_question_decisions")
      .select("*")
      .eq("attempt_id", attemptId)
      .eq("step_number", stepNumber)
      .maybeSingle();

    return data;
  }

  /**
   * Grades a candidate option submission securely against the database
   */
  public static async gradeQuestionSubmission(
    supabase: SupabaseClient<Database>,
    questionVersionId: string,
    selectedOptionId: string | null
  ): Promise<{
    isCorrect: boolean;
    correctOptionKey: string | null;
    questionId: string;
    topicId: string | null;
    subjectId: string | null;
  }> {
    // 1. Fetch question version and canonical topic
    const { data: qv, error: qvError } = await supabase
      .from("question_versions")
      .select(`
        id,
        question_id,
        questions!inner(
          id,
          canonical_topic_id
        )
      `)
      .eq("id", questionVersionId)
      .single();

    if (qvError || !qv) {
      throw new AdaptiveEngineError(
        "QUESTION_NOT_FOUND",
        `Question version ${questionVersionId} not found.`
      );
    }

    // 2. Fetch answer key
    const { data: answer } = await supabase
      .from("question_answers")
      .select("correct_option_key")
      .eq("question_version_id", questionVersionId)
      .maybeSingle();

    // 3. Fetch options to map selectedOptionId to option_key if ID is passed
    const { data: options } = await supabase
      .from("question_options")
      .select("id, option_key")
      .eq("question_version_id", questionVersionId);

    const correctKey = answer?.correct_option_key ?? null;

    let isCorrect = false;
    if (selectedOptionId && correctKey) {
      // Check if selectedOptionId matches option_key directly OR matches option row id
      if (selectedOptionId.toUpperCase() === correctKey.toUpperCase()) {
        isCorrect = true;
      } else if (options && options.length > 0) {
        const matchedOpt = options.find((o) => o.id === selectedOptionId);
        if (matchedOpt && matchedOpt.option_key.toUpperCase() === correctKey.toUpperCase()) {
          isCorrect = true;
        }
      }
    }

    const questionsData = qv.questions as unknown as {
      id: string;
      canonical_topic_id: string | null;
    };

    return {
      isCorrect,
      correctOptionKey: correctKey,
      questionId: qv.question_id,
      topicId: questionsData?.canonical_topic_id ?? null,
      subjectId: null,
    };
  }
}
