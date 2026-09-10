import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import {
  ActiveAdaptiveSession,
  AdaptiveAttemptStateRow,
  AdaptiveAttemptStatus,
  AdaptiveDetectionResult,
  AdaptiveEngineError,
  AdaptiveStepSubmitRequest,
  AdaptiveStepSubmitResponse,
  AdaptiveTestConfigRow,
  DifficultyPolicyConfig,
  DifficultyTier,
  SafeAdaptiveQuestionPayload,
  SequenceStepRecord,
  StartAdaptiveAttemptParams,
  StoppingReason,
} from "./adaptive-types";
import { AdaptiveEngineService } from "./adaptive-engine.service";
import { AdaptiveStateService } from "./adaptive-state.service";
import { PremiumEntitlementService } from "@/services/premium-entitlement.service";
import { AssessmentService } from "@/services/assessment.service";
import { calculateExamDuration } from "@/lib/assessment/timing";

export class AdaptiveSessionService {
  // In-memory concurrency mutex to prevent double-click / rapid simultaneous attempt creation
  private static attemptCreationLocks: Map<string, Promise<void>> = new Map();
  // In-memory concurrency mutex to serialize step submissions for the same attempt
  private static stepSubmissionLocks: Map<string, Promise<void>> = new Map();

  /**
   * Helper to acquire Supabase client (passed in or fallback to admin)
   */
  private static async getClient(client?: SupabaseClient<any> | any): Promise<SupabaseClient<Database>> {
    if (client) return client as SupabaseClient<Database>;
    return await createAdminServerSupabaseClient();
  }

  /**
   * 1. SERVER-AUTHORITATIVE ADAPTIVE TEST DETECTION
   * Determines whether an identifier represents an Adaptive test without trusting client flags.
   */
  public static async detectAdaptiveTest(
    identifier: string,
    userId?: string,
    client?: SupabaseClient<any> | any
  ): Promise<AdaptiveDetectionResult> {
    const supabase = await this.getClient(client);

    // Case A: Identifier is directly an active attempt_id in adaptive_attempt_states
    const { data: directState } = await supabase
      .from("adaptive_attempt_states")
      .select(`
        *,
        adaptive_test_configs!inner(*)
      `)
      .eq("attempt_id", identifier)
      .maybeSingle();

    if (directState) {
      const config = (directState as any).adaptive_test_configs as AdaptiveTestConfigRow;
      return {
        isAdaptive: true,
        attemptId: identifier,
        configId: config.id,
        config,
        existingState: directState as unknown as AdaptiveAttemptStateRow,
      };
    }

    // Case B: Identifier is directly an adaptive_test_configs ID or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    let configQuery = supabase.from("adaptive_test_configs").select("*");
    if (isUuid) {
      configQuery = configQuery.eq("id", identifier);
    } else {
      configQuery = configQuery.eq("slug", identifier);
    }

    const { data: directConfig } = await configQuery.maybeSingle();
    if (directConfig) {
      // Check if user already has an in-progress attempt for this config
      let existingState: AdaptiveAttemptStateRow | undefined;
      if (userId) {
        const { data: userActiveState } = await supabase
          .from("adaptive_attempt_states")
          .select("*")
          .eq("user_id", userId)
          .eq("config_id", directConfig.id)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (userActiveState) {
          existingState = userActiveState as unknown as AdaptiveAttemptStateRow;
        }
      }

      return {
        isAdaptive: true,
        configId: directConfig.id,
        config: directConfig as unknown as AdaptiveTestConfigRow,
        attemptId: existingState?.attempt_id,
        existingState,
      };
    }

    // Case C: Identifier is a mock_test_id that is linked to an adaptive_test_config
    if (isUuid) {
      const { data: mockTest } = await supabase
        .from("mock_tests")
        .select("id, slug, template_id, title")
        .eq("id", identifier)
        .maybeSingle();

      if (mockTest) {
        // Check if there is an adaptive test config with matching slug
        const { data: linkedConfig } = await supabase
          .from("adaptive_test_configs")
          .select("*")
          .eq("slug", mockTest.slug)
          .eq("is_active", true)
          .maybeSingle();

        if (linkedConfig) {
          return {
            isAdaptive: true,
            configId: linkedConfig.id,
            config: linkedConfig as unknown as AdaptiveTestConfigRow,
            mockTestId: mockTest.id,
          };
        }
      }
    }

    return { isAdaptive: false };
  }

  /**
   * 2. START OR RESUME ADAPTIVE ATTEMPT
   * Central entrypoint that ensures atomic authorization, duplicate prevention, and Step 1 initialization.
   */
  public static async startOrResumeAdaptiveAttempt(
    params: StartAdaptiveAttemptParams,
    client?: SupabaseClient<any> | any
  ): Promise<ActiveAdaptiveSession | null> {
    const supabase = await this.getClient(client);
    const { userId, identifier, overrideConfigId } = params;

    // 1. Authoritative adaptive detection
    const detection = await this.detectAdaptiveTest(identifier, userId, supabase);
    let targetConfig = detection.config;

    if (!targetConfig && overrideConfigId) {
      const { data: cfg } = await supabase
        .from("adaptive_test_configs")
        .select("*")
        .eq("id", overrideConfigId)
        .eq("is_active", true)
        .single();
      if (cfg) {
        targetConfig = cfg as unknown as AdaptiveTestConfigRow;
      }
    }

    if (!targetConfig || !targetConfig.is_active) {
      throw new AdaptiveEngineError(
        "CONFIG_NOT_FOUND",
        `Adaptive test configuration for '${identifier}' is not found or inactive.`
      );
    }

    // Concurrency Lock: serialize simultaneous start requests for the same user and config
    const lockKey = `${userId}__adaptive__${targetConfig.id}`;
    while (this.attemptCreationLocks.has(lockKey)) {
      try {
        await this.attemptCreationLocks.get(lockKey);
      } catch {}
    }

    let releaseLock: (() => void) | null = null;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.attemptCreationLocks.set(lockKey, lockPromise);

    try {
      // 2. CHECK FOR EXISTING IN-PROGRESS ATTEMPT (RESUME)
      let attemptId = detection.attemptId;
      let activeState: AdaptiveAttemptStateRow | null = null;

      if (attemptId) {
        const { data: st } = await supabase
          .from("adaptive_attempt_states")
          .select("*")
          .eq("attempt_id", attemptId)
          .maybeSingle();

        if (st) {
          activeState = st as unknown as AdaptiveAttemptStateRow;
        }
      } else {
        const { data: st } = await supabase
          .from("adaptive_attempt_states")
          .select("*")
          .eq("user_id", userId)
          .eq("config_id", targetConfig.id)
          .in("status", ["in_progress", "stopping_rule_met"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (st) {
          activeState = st as unknown as AdaptiveAttemptStateRow;
          attemptId = st.attempt_id;
        } else {
          // Check if user already has a completed attempt for this config
          const { data: completedSt } = await supabase
            .from("adaptive_attempt_states")
            .select("attempt_id, status")
            .eq("user_id", userId)
            .eq("config_id", targetConfig.id)
            .in("status", ["completed", "terminated"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (completedSt) {
            return null; // Route to result
          }
        }
      }

      // If active state found, verify attempt in test_attempts
      if (attemptId && activeState) {
        const { data: existingAttempt } = await supabase
          .from("test_attempts")
          .select("id, user_id, started_at, submitted_at, status")
          .eq("id", attemptId)
          .single();

        if (existingAttempt) {
          if (existingAttempt.user_id !== userId) {
            throw new AdaptiveEngineError("UNAUTHORIZED_ATTEMPT_ACCESS", "Access to this attempt is unauthorized.");
          }

          if (existingAttempt.submitted_at !== null || existingAttempt.status === "completed" || existingAttempt.status === "submitted") {
            return null; // Route to result
          }

          // Build and return resumed session
          return await this.buildAdaptiveSession(
            supabase,
            existingAttempt.id,
            targetConfig,
            activeState,
            existingAttempt.started_at
          );
        }
      }

      // 3. CREATE NEW ADAPTIVE ATTEMPT (ATOMIC & AUTHORIZED)
      // A. Verify Premium Entitlement & Quota
      const accessCheck = await PremiumEntitlementService.checkPremiumAccess(
        userId,
        targetConfig.exam_id,
        "FULL_LENGTH"
      );

      if (!accessCheck.hasAccess) {
        throw new AdaptiveEngineError(
          "PREMIUM_ACCESS_DENIED",
          "Active Premium subscription required to access Adaptive Mock tests."
        );
      }

      if (accessCheck.status === "QUOTA_EXHAUSTED") {
        throw new AdaptiveEngineError(
          "QUOTA_EXHAUSTED",
          "You have reached your Adaptive Mock test quota for this cycle."
        );
      }

      // B. Resolve container mock_tests row for database foreign key compatibility
      let containerMockTestId = detection.mockTestId;
      if (!containerMockTestId) {
        const { data: existingMock } = await supabase
          .from("mock_tests")
          .select("id")
          .eq("slug", targetConfig.slug)
          .maybeSingle();

        if (existingMock) {
          containerMockTestId = existingMock.id;
        } else {
          // Find fallback mock test for container
          const { data: fallbackMock } = await supabase
            .from("mock_tests")
            .select("id")
            .limit(1)
            .maybeSingle();

          containerMockTestId = fallbackMock?.id;
        }
      }

      if (!containerMockTestId) {
        throw new AdaptiveEngineError("INTERNAL_ADAPTIVE_ERROR", "Could not associate adaptive attempt with test container.");
      }

      // C. Insert new test_attempts row
      const startedAtIso = new Date().toISOString();
      const { data: newAttempt, error: attemptErr } = await supabase
        .from("test_attempts")
        .insert({
          mock_test_id: containerMockTestId,
          user_id: userId,
          status: "in_progress",
          started_at: startedAtIso,
        } as any)
        .select("id, started_at")
        .single();

      if (attemptErr || !newAttempt) {
        throw new AdaptiveEngineError(
          "INTERNAL_ADAPTIVE_ERROR",
          `Failed to create test attempt: ${attemptErr?.message || "Unknown error"}`
        );
      }

      // D. Initialize adaptive_attempt_states row via AdaptiveEngineService
      const initState = await AdaptiveEngineService.initializeAdaptiveAttempt(
        userId,
        targetConfig.id,
        newAttempt.id,
        supabase
      );

      // E. Initialize Step 1 and return safe session
      return await this.buildAdaptiveSession(
        supabase,
        newAttempt.id,
        targetConfig,
        initState,
        newAttempt.started_at
      );
    } finally {
      this.attemptCreationLocks.delete(lockKey);
      if (releaseLock) (releaseLock as () => void)();
    }
  }

  /**
   * 3. GET ADAPTIVE SESSION
   * Fetches an active adaptive session cleanly for candidate or reload
   */
  public static async getAdaptiveSession(
    attemptId: string,
    userId: string,
    client?: SupabaseClient<any> | any
  ): Promise<ActiveAdaptiveSession | null> {
    const supabase = await this.getClient(client);

    const { data: attempt } = await supabase
      .from("test_attempts")
      .select("id, user_id, started_at, submitted_at, status")
      .eq("id", attemptId)
      .maybeSingle();

    if (!attempt || attempt.user_id !== userId) {
      throw new AdaptiveEngineError("UNAUTHORIZED_ATTEMPT_ACCESS", "Unauthorized attempt session.");
    }

    if (attempt.submitted_at !== null || attempt.status === "completed" || attempt.status === "submitted") {
      return null;
    }

    const { data: stateData } = await supabase
      .from("adaptive_attempt_states")
      .select(`
        *,
        adaptive_test_configs!inner(*)
      `)
      .eq("attempt_id", attemptId)
      .single();

    if (!stateData) {
      throw new AdaptiveEngineError("ATTEMPT_NOT_FOUND", "Adaptive state not found for attempt.");
    }

    const state = stateData as unknown as AdaptiveAttemptStateRow;
    const config = (stateData as any).adaptive_test_configs as AdaptiveTestConfigRow;

    return await this.buildAdaptiveSession(
      supabase,
      attemptId,
      config,
      state,
      attempt.started_at
    );
  }

  /**
   * Helper: Build Safe ActiveAdaptiveSession object
   */
  private static async buildAdaptiveSession(
    supabase: SupabaseClient<Database>,
    attemptId: string,
    config: AdaptiveTestConfigRow,
    state: AdaptiveAttemptStateRow,
    startedAt: string
  ): Promise<ActiveAdaptiveSession | null> {
    // 1. Calculate server-authoritative remaining time
    const durationMinutes = config.target_duration_minutes || 60;
    const totalAllowedSeconds = durationMinutes * 60;
    const elapsedSeconds = calculateExamDuration(startedAt, new Date().toISOString());
    const remainingSeconds = Math.max(0, totalAllowedSeconds - elapsedSeconds);

    // If time has expired in the background, auto-finalize attempt
    if (remainingSeconds <= 0 && state.status === "in_progress") {
      await AdaptiveEngineService.finalizeAdaptiveAttempt(attemptId, "TIME_EXPIRED", supabase);
      await supabase
        .from("test_attempts")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          time_taken_seconds: totalAllowedSeconds,
        } as any)
        .eq("id", attemptId);

      try {
        await AssessmentService.submitTestAttempt(attemptId, state.user_id);
      } catch {}
      return null;
    }

    // 2. Fetch or load the current active question
    const sequenceHistory = (state.sequence_history as unknown as SequenceStepRecord[]) || [];
    const currentStep = state.questions_served_count === 0 ? 1 : state.questions_served_count;

    let currentQuestion: SafeAdaptiveQuestionPayload | null = null;

    if (state.status === "in_progress") {
      try {
        // If state has questions_served_count === 0, get Step 1
        currentQuestion = await AdaptiveEngineService.getNextAdaptiveQuestion(
          attemptId,
          currentStep,
          supabase
        );
      } catch (err) {
        if (err instanceof AdaptiveEngineError && err.code === "STOPPING_RULE_VIOLATION") {
          currentQuestion = null;
        } else {
          throw err;
        }
      }
    }

    // 3. Reconstruct all previously generated questions for instant refresh/resume
    const generatedSteps: SafeAdaptiveQuestionPayload[] = [];
    const totalServed = state.questions_served_count;
    if (totalServed > 0) {
      for (let s = 1; s <= totalServed; s++) {
        try {
          const stepQ = await AdaptiveEngineService.getNextAdaptiveQuestion(attemptId, s, supabase);
          if (stepQ) {
            generatedSteps.push(stepQ);
          }
        } catch {}
      }
    } else if (currentQuestion) {
      generatedSteps.push(currentQuestion);
    }

    return {
      isAdaptive: true,
      attemptId,
      testId: config.id,
      testTitle: config.title,
      examId: config.exam_id,
      startedAt,
      durationMinutes,
      remainingSeconds,
      adaptive: {
        stateId: state.id,
        configId: config.id,
        configSlug: config.slug,
        configVersion: config.version,
        testType: config.test_type,
        status: state.status as any,
        stoppingReason: state.stopping_reason as any,
        currentStep,
        minQuestions: config.min_questions,
        maxQuestions: config.max_questions,
        currentTheta: state.current_theta,
        standardError: state.standard_error,
        currentDifficultyTier: state.current_difficulty_tier as any,
        currentQuestion,
        generatedSteps: generatedSteps.length > 0 ? generatedSteps : (currentQuestion ? [currentQuestion] : []),
        sequenceHistory,
      },
    };
  }

  /**
   * 4. AUTHORITATIVE ADAPTIVE STEP SUBMISSION & NEXT QUESTION DELIVERY
   * Validates ownership, checks timer expiration, validates selected option,
   * performs authoritative server grading, updates latent ability, evaluates stopping rules,
   * and delivers next question with zero answer key leakage.
   */
  public static async processAdaptiveStepSubmission(
    userId: string,
    request: AdaptiveStepSubmitRequest,
    client?: SupabaseClient<any> | any
  ): Promise<AdaptiveStepSubmitResponse> {
    const { attemptId, stepNumber, selectedOptionKey, timeSpentSeconds = 0, isMarkedForReview = false } = request;

    if (!attemptId || typeof attemptId !== "string") {
      throw new AdaptiveEngineError("ATTEMPT_NOT_FOUND", "A valid attemptId is required.");
    }

    if (!stepNumber || typeof stepNumber !== "number" || stepNumber < 1) {
      throw new AdaptiveEngineError("INVALID_STEP_NUMBER", "A valid stepNumber >= 1 is required.");
    }

    // Mutex lock to serialize concurrent submissions for this attempt
    const lockKey = `${attemptId}__step_lock`;
    while (this.stepSubmissionLocks.has(lockKey)) {
      try {
        await this.stepSubmissionLocks.get(lockKey);
      } catch {}
    }

    let releaseLock: (() => void) | null = null;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.stepSubmissionLocks.set(lockKey, lockPromise);

    try {
      const supabase = await this.getClient(client);

      // 1. Authoritative Attempt Ownership and Status Check
      const { data: attempt, error: attemptError } = await supabase
        .from("test_attempts")
        .select("id, user_id, started_at, submitted_at, status, mock_test_id")
        .eq("id", attemptId)
        .maybeSingle();

      if (attemptError || !attempt) {
        throw new AdaptiveEngineError("ATTEMPT_NOT_FOUND", `Test attempt ${attemptId} was not found.`);
      }

      if (attempt.user_id !== userId) {
        throw new AdaptiveEngineError("UNAUTHORIZED_ATTEMPT_ACCESS", "Access to this test attempt is unauthorized.");
      }

      if (attempt.submitted_at !== null || attempt.status === "completed" || attempt.status === "submitted" || attempt.status === "terminated") {
        throw new AdaptiveEngineError("ATTEMPT_ALREADY_COMPLETED", "This test attempt has already been finalized.");
      }

      // 2. Fetch Adaptive Attempt State and Config
      const { data: stateData, error: stateError } = await supabase
        .from("adaptive_attempt_states")
        .select(`
          *,
          adaptive_test_configs!inner(*)
        `)
        .eq("attempt_id", attemptId)
        .maybeSingle();

      if (stateError || !stateData) {
        throw new AdaptiveEngineError("ATTEMPT_NOT_FOUND", `Adaptive state for attempt ${attemptId} was not found.`);
      }

      const state = stateData as unknown as AdaptiveAttemptStateRow;
      const config = (stateData as any).adaptive_test_configs as AdaptiveTestConfigRow;

      if (state.status === "completed" || state.status === "terminated") {
        throw new AdaptiveEngineError("ATTEMPT_ALREADY_COMPLETED", "This adaptive attempt has already been finalized.");
      }

      // 3. Wall-Clock Timer Expiry Check
      const durationMinutes = config.target_duration_minutes || 60;
      const totalAllowedSeconds = durationMinutes * 60;
      const elapsedSeconds = calculateExamDuration(attempt.started_at, new Date().toISOString());
      const remainingSeconds = Math.max(0, totalAllowedSeconds - elapsedSeconds);

      if (remainingSeconds <= 0) {
        await AdaptiveEngineService.finalizeAdaptiveAttempt(attemptId, "TIME_EXPIRED", supabase);
        await supabase
          .from("test_attempts")
          .update({
            status: "submitted",
            submitted_at: new Date().toISOString(),
            time_taken_seconds: totalAllowedSeconds,
          } as any)
          .eq("id", attemptId);

        try {
          await AssessmentService.submitTestAttempt(attemptId, userId);
        } catch (subErr) {
          console.warn("[processAdaptiveStepSubmission] Notice on auto-submit:", subErr);
        }

        return {
          success: true,
          attemptId,
          stepNumber,
          isProcessed: true,
          stoppingRuleMet: true,
          stoppingReason: "TIME_EXPIRED",
          currentTheta: state.current_theta,
          standardError: state.standard_error,
          currentDifficultyTier: state.current_difficulty_tier as any,
          nextQuestion: null,
        };
      }

      // 4. Step Decision and History Verification
      const sequenceHistory = (state.sequence_history as unknown as SequenceStepRecord[]) || [];
      const stepIndex = sequenceHistory.findIndex((s) => s.step_number === stepNumber);

      if (stepIndex === -1 || stepNumber > state.questions_served_count) {
        throw new AdaptiveEngineError(
          "INVALID_STEP_NUMBER",
          `Step ${stepNumber} is invalid or has not been served yet.`
        );
      }

      const existingStep = sequenceHistory[stepIndex];
      const questionVersionId = existingStep.question_version_id;

      // 5. Idempotency & Stale Step Check: if step is already answered
      if (existingStep.answered_at) {
        const recordedOption = existingStep.selected_option_key || null;
        const incomingOption = (selectedOptionKey !== undefined && selectedOptionKey !== null && selectedOptionKey !== "")
          ? selectedOptionKey.toUpperCase()
          : null;
        
        const isSameAnswer = (recordedOption === null && incomingOption === null) ||
          (recordedOption !== null && incomingOption !== null && recordedOption.toUpperCase() === incomingOption);

        if (!isSameAnswer) {
          throw new AdaptiveEngineError(
            "STEP_STATE_STALE",
            `Step ${stepNumber} has already been evaluated with an authoritative answer and cannot be overwritten.`
          );
        }

        if (state.status === "stopping_rule_met" || state.status === "completed") {
          return {
            success: true,
            attemptId,
            stepNumber,
            isProcessed: true,
            isIdempotentRetry: true,
            stoppingRuleMet: true,
            stoppingReason: state.stopping_reason as any,
            currentTheta: state.current_theta,
            standardError: state.standard_error,
            currentDifficultyTier: state.current_difficulty_tier as any,
            nextQuestion: null,
          };
        }

        const nextStepNumber = stepNumber + 1;
        let nextQuestion: SafeAdaptiveQuestionPayload | null = null;
        try {
          nextQuestion = await AdaptiveEngineService.getNextAdaptiveQuestion(attemptId, nextStepNumber, supabase);
        } catch (e) {
          if (e instanceof AdaptiveEngineError && e.code === "STOPPING_RULE_VIOLATION") {
            nextQuestion = null;
          } else {
            throw e;
          }
        }

        return {
          success: true,
          attemptId,
          stepNumber,
          isProcessed: true,
          isIdempotentRetry: true,
          stoppingRuleMet: !nextQuestion,
          stoppingReason: (!nextQuestion ? state.stopping_reason : undefined) as any,
          currentTheta: state.current_theta,
          standardError: state.standard_error,
          currentDifficultyTier: nextQuestion?.difficulty_tier ?? (state.current_difficulty_tier as any),
          nextStepNumber: nextQuestion ? nextStepNumber : undefined,
          nextQuestion,
        };
      }

      // 6. Selected Option Validation
      const { data: options } = await supabase
        .from("question_options")
        .select("id, option_key")
        .eq("question_version_id", questionVersionId);

      let normalizedOptionKey: string | null = null;
      let matchedOptionId: string | null = null;

      if (selectedOptionKey !== undefined && selectedOptionKey !== null && selectedOptionKey !== "") {
        const matchedOption = (options || []).find(
          (opt) =>
            opt.option_key.toUpperCase() === selectedOptionKey.toUpperCase() ||
            opt.id === selectedOptionKey
        );

        if (!matchedOption) {
          throw new AdaptiveEngineError(
            "INVALID_OPTION_SELECTION",
            `Option '${selectedOptionKey}' is not a valid option for step ${stepNumber}.`
          );
        }

        normalizedOptionKey = matchedOption.option_key;
        matchedOptionId = matchedOption.id;
      }

      // 7. Authoritative Server-Side Grading
      const { data: answerData } = await supabase
        .from("question_answers")
        .select("correct_option_key")
        .eq("question_version_id", questionVersionId)
        .maybeSingle();

      const correctOptionKey = answerData?.correct_option_key ?? null;
      const isCorrect = Boolean(
        normalizedOptionKey &&
          correctOptionKey &&
          normalizedOptionKey.toUpperCase() === correctOptionKey.toUpperCase()
      );

      // 8. Persist Answer to attempt_answers
      try {
        let resolvedMockQuestionId: string | null = null;
        const { data: existingMq } = await supabase
          .from("mock_questions")
          .select("id")
          .eq("mock_test_id", attempt.mock_test_id)
          .eq("question_version_id", questionVersionId)
          .maybeSingle();

        if (existingMq) {
          resolvedMockQuestionId = existingMq.id;
        } else {
          const { data: section } = await supabase
            .from("mock_sections")
            .select("id")
            .eq("mock_test_id", attempt.mock_test_id)
            .limit(1)
            .maybeSingle();

          let mockSectionId = section?.id;
          if (!mockSectionId) {
            const { data: newSec } = await supabase
              .from("mock_sections")
              .insert({
                mock_test_id: attempt.mock_test_id,
                section_name: "Adaptive Section",
                section_order: 1,
                total_questions: config.max_questions,
                duration_minutes: durationMinutes,
              } as any)
              .select("id")
              .single();
            mockSectionId = newSec?.id;
          }

          if (mockSectionId) {
            const { data: newMq } = await supabase
              .from("mock_questions")
              .insert({
                mock_test_id: attempt.mock_test_id,
                mock_section_id: mockSectionId,
                question_version_id: questionVersionId,
                question_order: stepNumber,
                marks: 1,
                negative_mark: 0,
              } as any)
              .select("id")
              .single();
            resolvedMockQuestionId = newMq?.id || null;
          }
        }

        if (resolvedMockQuestionId) {
          await supabase
            .from("attempt_answers")
            .upsert(
              {
                attempt_id: attemptId,
                mock_question_id: resolvedMockQuestionId,
                question_version_id: questionVersionId,
                selected_option_key: normalizedOptionKey,
                is_marked_for_review: isMarkedForReview,
                time_spent_seconds: timeSpentSeconds,
                is_correct: isCorrect,
                updated_at: new Date().toISOString(),
              } as any,
              {
                onConflict: "attempt_id,mock_question_id",
              }
            );
        }
      } catch (err) {
        console.warn("[processAdaptiveStepSubmission] Non-fatal attempt_answers upsert error:", err);
      }

      // 9. Update Latent Ability and Standard Error via Regularized 1PL Estimator
      const diffPolicy = (config.difficulty_policy || {}) as unknown as DifficultyPolicyConfig;
      const minTheta = diffPolicy.min_theta ?? -3.0;
      const maxTheta = diffPolicy.max_theta ?? 3.0;
      const itemDifficulty = (existingStep.difficulty || "medium") as DifficultyTier;

      const { AdaptiveAbilityService } = await import("./adaptive-ability.service");
      const resolvedDiff = await AdaptiveAbilityService.resolveItemDifficulty(
        supabase,
        questionVersionId,
        existingStep.difficulty
      );

      const abilityUpdate = AdaptiveStateService.calculateUpdatedAbility(
        state.current_theta,
        resolvedDiff.difficulty_b,
        isCorrect,
        stepNumber,
        minTheta,
        maxTheta
      );

      // Record Immutable Ability Estimation History
      try {
        await AdaptiveAbilityService.recordEstimationHistory(supabase, {
          attempt_id: attemptId,
          attempt_state_id: state.id,
          user_id: userId,
          question_version_id: questionVersionId,
          step_number: stepNumber,
          theta_before: state.current_theta,
          theta_after: abilityUpdate.updatedTheta,
          se_before: state.standard_error,
          se_after: abilityUpdate.updatedSe,
          estimator_version: AdaptiveAbilityService.ESTIMATOR_VERSION,
          difficulty_source: resolvedDiff.difficulty_source,
          difficulty_b: resolvedDiff.difficulty_b,
          is_correct: isCorrect,
          converged: abilityUpdate.converged ?? true,
          iterations: abilityUpdate.iterations ?? 1,
          effective_information: abilityUpdate.effectiveInformation,
          regularization_lambda: AdaptiveAbilityService.DEFAULT_LAMBDA,
          subject_id: existingStep.subject_id || null,
          topic_id: existingStep.topic_id || null,
        });
      } catch (histErr) {
        console.warn("[processAdaptiveStepSubmission] Notice on ability estimation history recording:", histErr);
      }

      // 10. Record Immutable Response Evidence for Calibration
      try {
        const { AdaptiveCalibrationService } = await import("./adaptive-calibration.service");
        await AdaptiveCalibrationService.recordResponseEvidence({
          question_version_id: questionVersionId,
          attempt_id: attemptId,
          user_id: userId,
          is_correct: isCorrect,
          response_source: "adaptive_step",
          difficulty_context: existingStep.difficulty || "medium",
          adaptive_step_number: stepNumber,
          ability_estimate_before: state.current_theta,
          ability_estimate_after: abilityUpdate.updatedTheta,
          metadata: {
            selected_option_key: normalizedOptionKey,
            time_spent_seconds: timeSpentSeconds,
            difficulty_b: resolvedDiff.difficulty_b,
            difficulty_source: resolvedDiff.difficulty_source,
          },
        });
      } catch (evErr) {
        console.warn("[processAdaptiveStepSubmission] Notice on evidence recording:", evErr);
      }

      // 10. Update Topic Breakdown
      const topicBreakdown = ((state.topic_breakdown as Record<string, any>) || {});
      const topicId = existingStep.topic_id;
      if (topicId) {
        const topicStats = topicBreakdown[topicId] || {
          served: 0,
          correct: 0,
          incorrect: 0,
        };
        topicStats.served += 1;
        if (isCorrect) {
          topicStats.correct += 1;
        } else {
          topicStats.incorrect += 1;
        }
        topicBreakdown[topicId] = topicStats;
      }

      // 11. Update Step in sequence_history
      existingStep.selected_option_key = normalizedOptionKey;
      existingStep.selected_option_id = matchedOptionId;
      existingStep.is_correct = isCorrect;
      existingStep.time_spent_seconds = timeSpentSeconds;
      existingStep.answered_at = new Date().toISOString();
      existingStep.estimated_theta_after = abilityUpdate.updatedTheta;
      existingStep.standard_error_after = abilityUpdate.updatedSe;

      sequenceHistory[stepIndex] = existingStep;

      const newCorrectCount = state.correct_answers_count + (isCorrect ? 1 : 0);
      const newIncorrectCount = state.incorrect_answers_count + (isCorrect ? 0 : 1);

      // 12. Evaluate Stopping Rules After Step Completion
      const stoppingEvaluation = AdaptiveStateService.evaluateStoppingRules(
        sequenceHistory.length,
        abilityUpdate.updatedSe,
        config
      );

      let newStatus: AdaptiveAttemptStatus = state.status as AdaptiveAttemptStatus;
      let newStoppingReason: StoppingReason | null = state.stopping_reason as StoppingReason | null;

      if (stoppingEvaluation.shouldStop) {
        newStatus = "stopping_rule_met";
        newStoppingReason = stoppingEvaluation.reason || "MAX_QUESTIONS_REACHED";
      }

      // Update State in Database
      await supabase
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.id);

      // 13. Deliver Next Question or Terminate
      if (stoppingEvaluation.shouldStop) {
        return {
          success: true,
          attemptId,
          stepNumber,
          isProcessed: true,
          stoppingRuleMet: true,
          stoppingReason: newStoppingReason,
          currentTheta: abilityUpdate.updatedTheta,
          standardError: abilityUpdate.updatedSe,
          currentDifficultyTier: state.current_difficulty_tier as any,
          nextQuestion: null,
        };
      }

      const nextStepNumber = stepNumber + 1;
      const nextQuestion = await AdaptiveEngineService.getNextAdaptiveQuestion(
        attemptId,
        nextStepNumber,
        supabase
      );

      return {
        success: true,
        attemptId,
        stepNumber,
        isProcessed: true,
        stoppingRuleMet: false,
        currentTheta: abilityUpdate.updatedTheta,
        standardError: abilityUpdate.updatedSe,
        currentDifficultyTier: nextQuestion.difficulty_tier,
        nextStepNumber,
        nextQuestion,
      };
    } finally {
      this.stepSubmissionLocks.delete(lockKey);
      if (releaseLock) (releaseLock as () => void)();
    }
  }
}
