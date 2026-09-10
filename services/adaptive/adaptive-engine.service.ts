import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  AdaptiveAttemptStateRow,
  AdaptiveEngineError,
  AdaptiveTestConfigRow,
  DifficultyPolicyConfig,
  DifficultyTier,
  SafeAdaptiveOption,
  SafeAdaptiveQuestionPayload,
  SelectionPolicyConfig,
  SequenceStepRecord,
  StoppingReason,
  TopicPolicyConfig,
} from "./adaptive-types";
import { AdaptivePerformanceService } from "./adaptive-performance.service";
import { AdaptivePolicyService } from "./adaptive-policy.service";
import { AdaptiveSelectionService } from "./adaptive-selection.service";
import { AdaptiveStateService } from "./adaptive-state.service";
import { AdaptiveStoppingService } from "./adaptive-stopping.service";
import { AdaptivePersonalizationService } from "./adaptive-personalization.service";

export class AdaptiveEngineService {
  /**
   * Helper to acquire Supabase client (passed in or fallback to admin)
   */
  private static async getClient(client?: SupabaseClient<Database>): Promise<SupabaseClient<Database>> {
    if (client) return client;
    return await createAdminServerSupabaseClient();
  }

  /**
   * 1. INITIALIZE ADAPTIVE ATTEMPT
   */
  public static async initializeAdaptiveAttempt(
    userId: string,
    configId: string,
    attemptId: string,
    client?: SupabaseClient<Database>
  ): Promise<AdaptiveAttemptStateRow> {
    const supabase = await this.getClient(client);

    // 1. Fetch and validate adaptive config
    const { data: config, error: configError } = await supabase
      .from("adaptive_test_configs")
      .select("*")
      .eq("id", configId)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      throw new AdaptiveEngineError(
        "CONFIG_NOT_FOUND",
        `Active adaptive configuration ${configId} not found.`
      );
    }

    // 2. Check if state already exists for this attempt (idempotency)
    const { data: existingState } = await supabase
      .from("adaptive_attempt_states")
      .select("*")
      .eq("attempt_id", attemptId)
      .maybeSingle();

    if (existingState) {
      return existingState as unknown as AdaptiveAttemptStateRow;
    }

    // 3. Fetch candidate prior signals (if any)
    const candidateSignals = await AdaptivePerformanceService.getCandidateSignals(
      supabase,
      userId,
      config.exam_id
    );

    const diffPolicy = (config.difficulty_policy || {}) as unknown as DifficultyPolicyConfig;
    const initialDifficulty = diffPolicy.initial_difficulty || "medium";
    const initialTheta = candidateSignals.is_cold_start
      ? 0.0
      : candidateSignals.overall_theta;

    // 4. Create initial adaptive attempt state record
    const { data: newState, error: insertError } = await (supabase as any)
      .from("adaptive_attempt_states")
      .insert({
        attempt_id: attemptId,
        config_id: configId,
        user_id: userId,
        status: "in_progress",
        current_theta: initialTheta,
        standard_error: 1.0,
        current_difficulty_tier: initialDifficulty,
        questions_served_count: 0,
        correct_answers_count: 0,
        incorrect_answers_count: 0,
        topic_breakdown: {},
        section_breakdown: {},
        sequence_history: [],
        stopping_policy_version: "stopping_v1_deterministic",
        personalization_policy_version: "personalization_v1_balanced",
        stopping_metadata: {},
      } as any)
      .select()
      .single();

    if (insertError || !newState) {
      throw new AdaptiveEngineError(
        "INTERNAL_ADAPTIVE_ERROR",
        `Failed to initialize adaptive attempt state: ${insertError?.message || "Unknown error"}`
      );
    }

    return newState as unknown as AdaptiveAttemptStateRow;
  }

  /**
   * 2. GET NEXT ADAPTIVE QUESTION (SAFE SERVER-SIDE SELECTION)
   */
  public static async getNextAdaptiveQuestion(
    attemptId: string,
    requestedStepNumber: number,
    client?: SupabaseClient<Database>
  ): Promise<SafeAdaptiveQuestionPayload> {
    const supabase = await this.getClient(client);

    // 1. Fetch current attempt state and joined config
    const { data: state, error: stateError } = await supabase
      .from("adaptive_attempt_states")
      .select(`
        *,
        adaptive_test_configs!inner(*)
      `)
      .eq("attempt_id", attemptId)
      .single();

    if (stateError || !state) {
      throw new AdaptiveEngineError(
        "ATTEMPT_NOT_FOUND",
        `Adaptive attempt state for ${attemptId} not found.`
      );
    }

    const typedState = state as unknown as AdaptiveAttemptStateRow;
    const config = (state as any).adaptive_test_configs as AdaptiveTestConfigRow;

    if (typedState.status === "completed" || typedState.status === "terminated") {
      throw new AdaptiveEngineError(
        "ATTEMPT_ALREADY_COMPLETED",
        `This adaptive test attempt has already been finalized.`
      );
    }

    const sequenceHistory = (typedState.sequence_history as unknown as SequenceStepRecord[]) || [];
    const currentStep = typedState.questions_served_count;

    // Step verification: candidate can only ask for the current unanswered step or the immediate next step
    if (requestedStepNumber < 1 || requestedStepNumber > currentStep + 1) {
      throw new AdaptiveEngineError(
        "INVALID_STEP_NUMBER",
        `Invalid step number ${requestedStepNumber}. Current step count is ${currentStep}.`
      );
    }

    // 2. Idempotency check: if decision for this step already exists
    const existingDecision = await AdaptiveStateService.getExistingStepDecision(
      supabase,
      attemptId,
      requestedStepNumber
    );

    if (existingDecision) {
      // Fetch question version and return safe payload
      return await this.buildSafeQuestionPayload(
        supabase,
        existingDecision.question_version_id,
        requestedStepNumber,
        typedState.questions_served_count,
        config.min_questions,
        config.max_questions,
        existingDecision.target_difficulty as DifficultyTier
      );
    }

    // 3. Stopping rule verification before serving a new step
    const stoppingEvaluation = AdaptiveStoppingService.evaluateStopping({
      questionsServed: currentStep,
      currentSe: typedState.standard_error,
      config,
      recentInformationContributions: sequenceHistory.map((s) =>
        s.standard_error_after ? 1 / Math.max(0.01, s.standard_error_after) : 0.2
      ),
    });

    if (stoppingEvaluation.shouldStop) {
      // Update state to stopping_rule_met
      await (supabase as any)
        .from("adaptive_attempt_states")
        .update({
          status: "stopping_rule_met",
          stopping_reason: stoppingEvaluation.reasonCode,
          stopping_metadata: stoppingEvaluation as any,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", typedState.id);

      throw new AdaptiveEngineError(
        "STOPPING_RULE_VIOLATION",
        `Stopping rule satisfied: ${stoppingEvaluation.rationale}`,
        { reason: stoppingEvaluation.reasonCode, metadata: stoppingEvaluation }
      );
    }

    // 4. Calculate target difficulty for this new step
    const diffPolicy = (config.difficulty_policy || {}) as unknown as DifficultyPolicyConfig;
    const targetDifficulty = AdaptivePolicyService.determineNextTargetDifficulty(
      typedState.current_theta,
      requestedStepNumber,
      diffPolicy
    );

    // 5. Gather candidate signals and question history
    const candidateSignals = await AdaptivePerformanceService.getCandidateSignals(
      supabase,
      typedState.user_id,
      config.exam_id
    );

    const servedVersionIds = new Set<string>(sequenceHistory.map((s) => s.question_version_id));
    const topicServedCounts: Record<string, number> = {};
    for (const s of sequenceHistory) {
      if (s.topic_id) {
        topicServedCounts[s.topic_id] = (topicServedCounts[s.topic_id] || 0) + 1;
      }
    }

    let lastServedTopicId: string | null = null;
    let consecutiveTopicStreak = 0;
    if (sequenceHistory.length > 0) {
      lastServedTopicId = sequenceHistory[sequenceHistory.length - 1].topic_id || null;
      if (lastServedTopicId) {
        for (let i = sequenceHistory.length - 1; i >= 0; i--) {
          if (sequenceHistory[i].topic_id === lastServedTopicId) {
            consecutiveTopicStreak++;
          } else {
            break;
          }
        }
      }
    }

    // 6. Compute bounded personalization signals
    const personalizationSignals = AdaptivePersonalizationService.computePersonalizationSignals({
      candidateSignals,
      topicServedCounts,
      subjectServedCounts: {},
      policy: (config.metadata as any)?.personalization_policy || undefined,
    });

    // 7. Fetch eligible questions from question bank
    const eligibleQuestions = await AdaptiveSelectionService.fetchEligibleQuestions(
      supabase,
      config.exam_id,
      servedVersionIds
    );

    // 8. Rank and select best candidate question
    const selectionContext = {
      examId: config.exam_id,
      patternId: config.pattern_id,
      targetDifficulty,
      targetTheta: typedState.current_theta,
      currentStandardError: typedState.standard_error,
      stepNumber: requestedStepNumber,
      servedQuestionVersionIds: servedVersionIds,
      topicServedCounts,
      lastServedTopicId,
      consecutiveTopicStreak,
      selectionPolicy: (config.selection_policy || {}) as unknown as SelectionPolicyConfig,
      topicPolicy: (config.topic_policy || {}) as unknown as TopicPolicyConfig,
      candidateSignals,
      personalizationSignals,
    };

    const { bestCandidate, explainablePayload } = AdaptiveSelectionService.rankCandidateQuestions(
      eligibleQuestions,
      selectionContext
    );

    if (!bestCandidate) {
      throw new AdaptiveEngineError(
        "QUESTION_POOL_EXHAUSTED",
        "No eligible question could be selected."
      );
    }

    // 8. Record immutable decision in adaptive_question_decisions
    const { error: decisionError } = await supabase
      .from("adaptive_question_decisions")
      .insert({
        attempt_state_id: typedState.id,
        attempt_id: attemptId,
        user_id: typedState.user_id,
        step_number: requestedStepNumber,
        question_version_id: bestCandidate.question_version_id,
        target_topic_id: bestCandidate.topic_id,
        target_difficulty: targetDifficulty,
        selection_strategy: config.selection_policy
          ? ((config.selection_policy as any).strategy || "max_fisher_information")
          : "max_fisher_information",
        decision_metadata: explainablePayload as any,
      });

    if (decisionError) {
      throw new AdaptiveEngineError(
        "INTERNAL_ADAPTIVE_ERROR",
        `Failed to record adaptive question decision: ${decisionError.message}`
      );
    }

    // 9. Append pending step record to sequence_history & update served count
    const pendingStepRecord: SequenceStepRecord = {
      step_number: requestedStepNumber,
      question_version_id: bestCandidate.question_version_id,
      question_id: bestCandidate.question_id,
      topic_id: bestCandidate.topic_id,
      subject_id: bestCandidate.subject_id,
      difficulty: bestCandidate.difficulty_tier,
      estimated_theta_before: typedState.current_theta,
      standard_error_before: typedState.standard_error,
    };

    const updatedHistory = [...sequenceHistory, pendingStepRecord];

    await supabase
      .from("adaptive_attempt_states")
      .update({
        questions_served_count: requestedStepNumber,
        current_difficulty_tier: targetDifficulty,
        sequence_history: updatedHistory as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", typedState.id);

    // 10. Return safe payload (without answer key)
    return await this.buildSafeQuestionPayload(
      supabase,
      bestCandidate.question_version_id,
      requestedStepNumber,
      requestedStepNumber,
      config.min_questions,
      config.max_questions,
      targetDifficulty
    );
  }

  /**
   * 3. SUBMIT ADAPTIVE ANSWER
   */
  public static async submitAdaptiveAnswer(
    attemptId: string,
    stepNumber: number,
    questionVersionId: string,
    selectedOptionId: string | null,
    timeSpentSeconds: number = 0,
    client?: SupabaseClient<Database>
  ): Promise<{
    stepNumber: number;
    isProcessed: boolean;
    estimatedTheta: number;
    standardError: number;
    stoppingRuleMet: boolean;
    stoppingReason?: StoppingReason;
  }> {
    const supabase = await this.getClient(client);

    // 1. Fetch attempt state
    const { data: state, error: stateError } = await supabase
      .from("adaptive_attempt_states")
      .select(`
        *,
        adaptive_test_configs!inner(*)
      `)
      .eq("attempt_id", attemptId)
      .single();

    if (stateError || !state) {
      throw new AdaptiveEngineError(
        "ATTEMPT_NOT_FOUND",
        `Adaptive attempt state for ${attemptId} not found.`
      );
    }

    const typedState = state as unknown as AdaptiveAttemptStateRow;
    const config = (state as any).adaptive_test_configs as AdaptiveTestConfigRow;

    if (typedState.status === "completed" || typedState.status === "terminated") {
      throw new AdaptiveEngineError(
        "ATTEMPT_ALREADY_COMPLETED",
        `This adaptive test attempt has already been finalized.`
      );
    }

    const sequenceHistory = (typedState.sequence_history as unknown as SequenceStepRecord[]) || [];
    const stepIndex = sequenceHistory.findIndex((s) => s.step_number === stepNumber);

    if (stepIndex === -1) {
      throw new AdaptiveEngineError(
        "INVALID_STEP_NUMBER",
        `Step ${stepNumber} was not found in sequence history.`
      );
    }

    const existingStep = sequenceHistory[stepIndex];
    if (existingStep.question_version_id !== questionVersionId) {
      throw new AdaptiveEngineError(
        "INVALID_ANSWER_PAYLOAD",
        `Question version mismatch for step ${stepNumber}.`
      );
    }

    // If already answered, return current state (idempotent)
    if (existingStep.answered_at) {
      return {
        stepNumber,
        isProcessed: true,
        estimatedTheta: typedState.current_theta,
        standardError: typedState.standard_error,
        stoppingRuleMet: typedState.status === "stopping_rule_met",
        stoppingReason: typedState.stopping_reason as StoppingReason | undefined,
      };
    }

    // 2. Grade submission securely
    const gradeResult = await AdaptiveStateService.gradeQuestionSubmission(
      supabase,
      questionVersionId,
      selectedOptionId
    );

    // 3. Update latent ability and standard error
    const diffPolicy = (config.difficulty_policy || {}) as unknown as DifficultyPolicyConfig;
    const minTheta = diffPolicy.min_theta ?? -3.0;
    const maxTheta = diffPolicy.max_theta ?? 3.0;

    const abilityUpdate = AdaptiveStateService.calculateUpdatedAbility(
      typedState.current_theta,
      existingStep.difficulty,
      gradeResult.isCorrect,
      stepNumber,
      minTheta,
      maxTheta
    );

    // 4. Update topic breakdown
    const topicBreakdown = ((typedState.topic_breakdown as Record<string, any>) || {});
    if (gradeResult.topicId) {
      const topicStats = topicBreakdown[gradeResult.topicId] || {
        served: 0,
        correct: 0,
        incorrect: 0,
      };
      topicStats.served += 1;
      if (gradeResult.isCorrect) {
        topicStats.correct += 1;
      } else {
        topicStats.incorrect += 1;
      }
      topicBreakdown[gradeResult.topicId] = topicStats;
    }

    // 5. Update step in sequence history
    existingStep.selected_option_id = selectedOptionId;
    existingStep.is_correct = gradeResult.isCorrect;
    existingStep.time_spent_seconds = timeSpentSeconds;
    existingStep.answered_at = new Date().toISOString();
    existingStep.estimated_theta_after = abilityUpdate.updatedTheta;
    existingStep.standard_error_after = abilityUpdate.updatedSe;

    sequenceHistory[stepIndex] = existingStep;

    const newCorrectCount = typedState.correct_answers_count + (gradeResult.isCorrect ? 1 : 0);
    const newIncorrectCount = typedState.incorrect_answers_count + (gradeResult.isCorrect ? 0 : 1);

    // 6. Check stopping rules after answer
    const stoppingEvaluation = AdaptiveStoppingService.evaluateStopping({
      questionsServed: sequenceHistory.length,
      currentSe: abilityUpdate.updatedSe,
      config,
      recentInformationContributions: sequenceHistory.map((s) =>
        s.standard_error_after ? 1 / Math.max(0.01, s.standard_error_after) : 0.2
      ),
    });

    let newStatus = typedState.status;
    let newStoppingReason = typedState.stopping_reason;

    if (stoppingEvaluation.shouldStop) {
      newStatus = "stopping_rule_met";
      newStoppingReason = stoppingEvaluation.reasonCode || null;
    }

    // 7. Save state to database
    await (supabase as any)
      .from("adaptive_attempt_states")
      .update({
        current_theta: abilityUpdate.updatedTheta,
        standard_error: abilityUpdate.updatedSe,
        correct_answers_count: newCorrectCount,
        incorrect_answers_count: newIncorrectCount,
        sequence_history: sequenceHistory as any,
        topic_breakdown: topicBreakdown as any,
        status: newStatus,
        stopping_reason: newStoppingReason,
        stopping_metadata: stoppingEvaluation as any,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", typedState.id);

    return {
      stepNumber,
      isProcessed: true,
      estimatedTheta: abilityUpdate.updatedTheta,
      standardError: abilityUpdate.updatedSe,
      stoppingRuleMet: stoppingEvaluation.shouldStop,
      stoppingReason: stoppingEvaluation.reasonCode as any,
    };
  }

  /**
   * 4. FINALIZE ADAPTIVE ATTEMPT
   */
  public static async finalizeAdaptiveAttempt(
    attemptId: string,
    reason: StoppingReason = "USER_SUBMITTED",
    client?: SupabaseClient<Database>
  ): Promise<{
    attemptId: string;
    status: string;
    stoppingReason: string;
    totalServed: number;
    totalCorrect: number;
    finalTheta: number;
    finalStandardError: number;
    topicBreakdown: Record<string, any>;
  }> {
    const supabase = await this.getClient(client);

    // 1. Fetch attempt state
    const { data: state, error: stateError } = await supabase
      .from("adaptive_attempt_states")
      .select(`
        *,
        adaptive_test_configs!inner(*)
      `)
      .eq("attempt_id", attemptId)
      .single();

    if (stateError || !state) {
      throw new AdaptiveEngineError(
        "ATTEMPT_NOT_FOUND",
        `Adaptive attempt state for ${attemptId} not found.`
      );
    }

    const typedState = state as unknown as AdaptiveAttemptStateRow;
    const config = (state as any).adaptive_test_configs as AdaptiveTestConfigRow;

    // Idempotency check: if attempt is already completed, return existing state without duplicate side-effects
    if (typedState.status === "completed") {
      return {
        attemptId,
        status: "completed",
        stoppingReason: typedState.stopping_reason || reason,
        totalServed: typedState.questions_served_count,
        totalCorrect: typedState.correct_answers_count,
        finalTheta: typedState.current_theta,
        finalStandardError: typedState.standard_error,
        topicBreakdown: (typedState.topic_breakdown as Record<string, any>) || {},
      };
    }

    // 2. Mark state as completed
    await supabase
      .from("adaptive_attempt_states")
      .update({
        status: "completed",
        stopping_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", typedState.id);

    // 3. Aggregate difficulty breakdown
    const sequenceHistory = (typedState.sequence_history as unknown as SequenceStepRecord[]) || [];
    const difficultyStats: Record<DifficultyTier, { correct: number; total: number }> = {
      easy: { correct: 0, total: 0 },
      medium: { correct: 0, total: 0 },
      hard: { correct: 0, total: 0 },
    };

    for (const step of sequenceHistory) {
      const tier = step.difficulty || "medium";
      difficultyStats[tier].total += 1;
      if (step.is_correct) {
        difficultyStats[tier].correct += 1;
      }
    }

    const topicBreakdown = (typedState.topic_breakdown as Record<string, { served: number; correct: number; incorrect: number }>) || {};

    // 4. Update long-term user profile
    await AdaptivePerformanceService.recordAttemptCompletion(
      supabase,
      typedState.user_id,
      config.exam_id,
      typedState.current_theta,
      typedState.standard_error,
      typedState.questions_served_count,
      typedState.correct_answers_count,
      difficultyStats,
      topicBreakdown
    );

    return {
      attemptId,
      status: "completed",
      stoppingReason: reason,
      totalServed: typedState.questions_served_count,
      totalCorrect: typedState.correct_answers_count,
      finalTheta: typedState.current_theta,
      finalStandardError: typedState.standard_error,
      topicBreakdown,
    };
  }

  /**
   * 5. GET ADAPTIVE ATTEMPT STATE
   */
  public static async getAdaptiveAttemptState(
    attemptId: string,
    client?: SupabaseClient<Database>
  ): Promise<AdaptiveAttemptStateRow> {
    const supabase = await this.getClient(client);

    const { data: state, error } = await supabase
      .from("adaptive_attempt_states")
      .select("*")
      .eq("attempt_id", attemptId)
      .single();

    if (error || !state) {
      throw new AdaptiveEngineError(
        "ATTEMPT_NOT_FOUND",
        `Adaptive attempt state for ${attemptId} not found.`
      );
    }

    return state as unknown as AdaptiveAttemptStateRow;
  }

  /**
   * Helper: Build Safe Question Payload without answer leakage
   */
  private static async buildSafeQuestionPayload(
    supabase: SupabaseClient<Database>,
    questionVersionId: string,
    stepNumber: number,
    totalServed: number,
    minQuestions: number,
    maxQuestions: number,
    difficultyTier: DifficultyTier
  ): Promise<SafeAdaptiveQuestionPayload> {
    const { data: qv, error: qvError } = await supabase
      .from("question_versions")
      .select(`
        id,
        question_id,
        question_text,
        question_image_url,
        difficulty,
        language,
        options_type,
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
        `Question version ${questionVersionId} could not be loaded.`
      );
    }

    const { data: options } = await supabase
      .from("question_options")
      .select("id, option_key, option_text, option_image_url, order_index")
      .eq("question_version_id", questionVersionId)
      .order("order_index", { ascending: true });

    // STRICT SECURITY: Strip answer keys, explanations, is_correct
    const safeOptions: SafeAdaptiveOption[] = (options || []).map((opt) => ({
      id: opt.id,
      option_key: opt.option_key,
      option_text: opt.option_text,
      option_image_url: opt.option_image_url,
      order_index: opt.order_index,
    }));

    const questionsData = qv.questions as unknown as {
      id: string;
      canonical_topic_id: string | null;
    };

    return {
      step_number: stepNumber,
      total_questions_served: totalServed,
      min_questions: minQuestions,
      max_questions: maxQuestions,
      question_version_id: qv.id,
      question_id: qv.question_id,
      question_text: qv.question_text,
      question_image_url: qv.question_image_url,
      options_type: qv.options_type,
      language: qv.language,
      options: safeOptions,
      topic_id: questionsData?.canonical_topic_id ?? null,
      subject_id: null,
      difficulty_tier: difficultyTier,
      is_last_step: stepNumber >= maxQuestions,
    };
  }
}
