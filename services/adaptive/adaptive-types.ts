import { Database } from "@/types/database";

export type AdaptiveTestConfigRow = Database["public"]["Tables"]["adaptive_test_configs"]["Row"];
export type AdaptiveAttemptStateRow = Database["public"]["Tables"]["adaptive_attempt_states"]["Row"];
export type AdaptiveQuestionDecisionRow = Database["public"]["Tables"]["adaptive_question_decisions"]["Row"];
export type UserAdaptiveProfileRow = Database["public"]["Tables"]["user_adaptive_profiles"]["Row"];

export type DifficultyTier = "easy" | "medium" | "hard";

export type AdaptiveAttemptStatus = "in_progress" | "stopping_rule_met" | "completed" | "terminated";

export type StoppingReason =
  | "MAX_QUESTIONS_REACHED"
  | "TARGET_PRECISION_ACHIEVED"
  | "USER_SUBMITTED"
  | "TIME_EXPIRED"
  | "POOL_EXHAUSTED"
  | "TERMINATED_BY_ADMIN";

// ============================================================================
// CONFIGURATION POLICIES
// ============================================================================

export interface DifficultyPolicyConfig {
  initial_difficulty?: DifficultyTier;
  step_size?: number;
  min_theta?: number;
  max_theta?: number;
  tier_thresholds?: {
    easy_max?: number;
    medium_max?: number;
  };
}

export interface TopicPolicyConfig {
  coverage_mode?: "balanced" | "blueprint_weighted" | "weakness_focused";
  max_per_topic?: number;
  topic_weights?: Record<string, number>;
  exploration_rate?: number;
}

export interface StoppingPolicyConfig {
  type: "standard_error_or_length" | "fixed_length" | "precision_only";
  target_se?: number;
  min_questions: number;
  max_questions: number;
}

export interface SelectionPolicyConfig {
  strategy: "max_fisher_information" | "difficulty_match" | "topic_balanced" | "weakness_reinforcement";
  exploration_rate?: number;
  exposure_control?: boolean;
  weights?: {
    difficulty_match?: number;
    topic_priority?: number;
    exploration_value?: number;
    mistake_bonus?: number;
  };
}

// ============================================================================
// RUNTIME STATE & PERFORMANCE TYPES
// ============================================================================

export interface SequenceStepRecord {
  step_number: number;
  question_version_id: string;
  question_id: string;
  topic_id: string | null;
  subject_id: string | null;
  difficulty: DifficultyTier;
  estimated_theta_before: number;
  standard_error_before: number;
  selected_option_id?: string | null;
  selected_option_key?: string | null;
  is_correct?: boolean;
  time_spent_seconds?: number;
  answered_at?: string;
  estimated_theta_after?: number;
  standard_error_after?: number;
}

export interface TopicPerformanceStat {
  topic_id: string;
  topic_name?: string;
  served_count: number;
  correct_count: number;
  incorrect_count: number;
  mastery_score: number; // 0.0 to 1.0 (Laplace smoothed)
  last_served_step?: number;
}

export interface CandidateQuestionCandidate {
  question_version_id: string;
  question_id: string;
  topic_id: string | null;
  subject_id: string | null;
  difficulty_tier: DifficultyTier;
  raw_difficulty?: string | null;
  is_in_mistake_vault?: boolean;
}

export interface RankedQuestionCandidate extends CandidateQuestionCandidate {
  total_score: number;
  score_breakdown: {
    difficulty_match_score: number;
    topic_priority_score: number;
    exploration_score: number;
    mistake_bonus: number;
    repetition_penalty: number;
  };
  explanation: string;
}

export interface ExplainableDecisionPayload {
  step_number: number;
  selected_question_version_id: string;
  selected_difficulty: DifficultyTier;
  target_difficulty: DifficultyTier;
  target_theta: number;
  current_standard_error: number;
  strategy_applied: string;
  total_candidates_evaluated: number;
  top_score: number;
  score_breakdown: {
    difficulty_match_score: number;
    topic_priority_score: number;
    exploration_score: number;
    mistake_bonus: number;
    repetition_penalty: number;
  };
  decision_rationale: string;
  alternative_candidates?: Array<{
    question_version_id: string;
    total_score: number;
    difficulty_tier: DifficultyTier;
  }>;
  evaluated_at: string;
}

// ============================================================================
// SAFE CANDIDATE QUESTION PAYLOAD (NO ANSWER LEAKAGE)
// ============================================================================

export interface SafeAdaptiveOption {
  id: string;
  option_key: string;
  option_text: string;
  option_image_url?: string | null;
  order_index: number;
}

export interface SafeAdaptiveQuestionPayload {
  step_number: number;
  total_questions_served: number;
  min_questions: number;
  max_questions: number;
  question_version_id: string;
  question_id: string;
  question_text: string;
  question_image_url?: string | null;
  options_type?: string;
  language?: string;
  options: SafeAdaptiveOption[];
  topic_id: string | null;
  subject_id: string | null;
  difficulty_tier: DifficultyTier;
  is_last_step: boolean;
  time_remaining_seconds?: number;
}

// ============================================================================
// ADAPTIVE SESSION & DETECTION INTERFACES
// ============================================================================

export interface AdaptiveDetectionResult {
  isAdaptive: boolean;
  configId?: string;
  config?: AdaptiveTestConfigRow;
  attemptId?: string;
  existingState?: AdaptiveAttemptStateRow;
  mockTestId?: string;
}

export interface ActiveAdaptiveSession {
  isAdaptive: true;
  attemptId: string;
  testId: string;
  testTitle: string;
  examId: string;
  examTitle?: string;
  startedAt: string;
  durationMinutes: number;
  remainingSeconds: number;
  adaptive: {
    stateId: string;
    configId: string;
    configSlug: string;
    configVersion: number;
    testType: string;
    status: AdaptiveAttemptStatus;
    stoppingReason?: StoppingReason | null;
    currentStep: number;
    minQuestions: number;
    maxQuestions: number;
    currentTheta: number;
    standardError: number;
    currentDifficultyTier: DifficultyTier;
    currentQuestion: SafeAdaptiveQuestionPayload | null;
    generatedSteps?: SafeAdaptiveQuestionPayload[];
    sequenceHistory: SequenceStepRecord[];
  };
}

export interface StartAdaptiveAttemptParams {
  userId: string;
  identifier: string; // attempt_id, adaptive_test_configs.id, or mock_test_id
  overrideConfigId?: string;
}

// ============================================================================
// STEP SUBMISSION CONTRACTS
// ============================================================================

export interface AdaptiveStepSubmitRequest {
  attemptId: string;
  stepNumber: number;
  selectedOptionKey?: string | null;
  timeSpentSeconds?: number;
  isMarkedForReview?: boolean;
}

export interface AdaptiveStepSubmitResponse {
  success: boolean;
  attemptId: string;
  stepNumber: number;
  isProcessed: boolean;
  isIdempotentRetry?: boolean;
  stoppingRuleMet: boolean;
  stoppingReason?: StoppingReason | null;
  currentTheta?: number;
  standardError?: number;
  currentDifficultyTier?: DifficultyTier;
  nextStepNumber?: number;
  nextQuestion?: SafeAdaptiveQuestionPayload | null;
  error?: string;
  errorCode?: AdaptiveErrorCode;
}

// ============================================================================
// ADAPTIVE ENGINE RESPONSES & ERROR TYPES
// ============================================================================

export type AdaptiveErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INACTIVE"
  | "ATTEMPT_NOT_FOUND"
  | "ATTEMPT_ALREADY_COMPLETED"
  | "INVALID_STEP_NUMBER"
  | "STALE_STEP_SUBMISSION"
  | "STEP_STATE_STALE"
  | "STEP_ALREADY_ANSWERED"
  | "INVALID_OPTION_SELECTION"
  | "QUESTION_POOL_EXHAUSTED"
  | "QUESTION_NOT_FOUND"
  | "STOPPING_RULE_VIOLATION"
  | "UNAUTHORIZED_ATTEMPT_ACCESS"
  | "CONCURRENCY_CONFLICT"
  | "INVALID_ANSWER_PAYLOAD"
  | "PREMIUM_ACCESS_DENIED"
  | "QUOTA_EXHAUSTED"
  | "INTERNAL_ADAPTIVE_ERROR";

export class AdaptiveEngineError extends Error {
  code: AdaptiveErrorCode;
  details?: Record<string, unknown>;

  constructor(code: AdaptiveErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AdaptiveEngineError";
    this.code = code;
    this.details = details;
  }
}

