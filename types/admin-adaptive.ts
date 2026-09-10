import type { Json } from "@/types/database";

// ============================================================================
// ADAPTIVE ADMIN TYPES & INTERFACES
// ============================================================================

export type AdaptiveAlgorithmStatus = "draft" | "testing" | "active" | "deprecated" | "archived";
export type AdaptiveModelType = "heuristic_v1" | "rasch_1pl" | "2pl" | "3pl" | "multidimensional";
export type AdaptiveEstimationMethod = "proxy_heuristic" | "mle" | "eap" | "map";
export type AdaptiveCalibrationStatus = "uncalibrated" | "provisional" | "calibrated" | "flagged" | "deprecated";

export interface AdaptiveAlgorithmVersion {
  id: string;
  version_code: string;
  name: string;
  description: string | null;
  status: AdaptiveAlgorithmStatus;
  model_type: AdaptiveModelType;
  estimation_method: AdaptiveEstimationMethod;
  hyperparameters: Record<string, unknown>;
  exposure_control_config: Record<string, unknown>;
  stopping_rule_defaults: {
    min_questions: number;
    max_questions: number;
    target_se: number;
    [key: string]: unknown;
  };
  is_active: boolean;
  activated_at: string | null;
  release_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdaptiveGlobalStatus {
  is_adaptive_enabled: boolean;
  is_advanced_adaptive_enabled: boolean;
  active_algorithm_version: string;
  emergency_disabled: boolean;
  emergency_disable_reason: string | null;
  fallback_mode: "v1_heuristic" | "fixed_blueprint" | "terminate";
  maintenance_mode: boolean;
  maintenance_message: string;
}

export interface AdaptiveSafetyLimits {
  absolute_min_questions: number;
  absolute_max_questions: number;
  max_item_exposure_ceiling: number;
  max_theta_drift_per_step: number;
  enforce_blueprint_coverage: boolean;
  allow_emergency_fallback: boolean;
}

export interface AdaptiveItemCalibration {
  id: string;
  question_version_id: string;
  algorithm_version_id: string | null;
  difficulty_b: number | null;
  discrimination_a: number | null;
  guessing_c: number | null;
  sample_size: number;
  reliability_score: number | null;
  calibration_status: AdaptiveCalibrationStatus;
  calibration_method: string | null;
  calibration_version: number;
  calibrated_at: string | null;
  calibration_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  question_text?: string;
  topic_name?: string;
}

export interface AdaptiveTestConfigItem {
  id: string;
  exam_id: string;
  pattern_id: string | null;
  test_type: string;
  title: string;
  slug: string;
  version: number;
  is_active: boolean;
  min_questions: number;
  max_questions: number;
  target_duration_minutes: number;
  difficulty_policy: Record<string, unknown>;
  topic_policy: Record<string, unknown>;
  stopping_policy: Record<string, unknown>;
  selection_policy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  exam_title?: string;
}

export interface AdaptiveAuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string;
  action_type: string;
  target_entity: string;
  target_id: string | null;
  old_value: Json | null;
  new_value: Json | null;
  reason: string | null;
  created_at: string;
}

export interface AdaptiveEstimatorConfig {
  active_estimator: string;
  regularization_lambda: number;
  min_theta: number;
  max_theta: number;
  min_se: number;
  max_se: number;
  convergence_tolerance: number;
  max_iterations: number;
  initial_theta: number;
  initial_se: number;
  warm_start_enabled: boolean;
  warm_start_min: number;
  warm_start_max: number;
}

export interface AdaptiveEstimatorHealth {
  active_estimator: string;
  total_estimations_count: number;
  converged_count: number;
  convergence_rate: number;
  average_iterations: number;
  average_theta: number;
  average_se: number;
  failed_estimations_count: number;
}

export interface AbilityExplorerAttemptItem {
  id: string;
  attempt_id: string;
  user_id: string;
  exam_title?: string;
  current_theta: number;
  standard_error: number;
  questions_served_count: number;
  correct_answers_count: number;
  status: string;
  stopping_reason?: string | null;
  updated_at: string;
}

export interface AbilityHistoryRecord {
  id: string;
  step_number: number;
  question_version_id: string;
  theta_before: number;
  theta_after: number;
  se_before: number;
  se_after: number;
  difficulty_b: number;
  difficulty_source: string;
  is_correct: boolean;
  converged: boolean;
  iterations: number;
  effective_information: number | null;
  created_at: string;
}

export interface AttemptAbilityDetail {
  attempt_id: string;
  user_id: string;
  current_theta: number;
  standard_error: number;
  status: string;
  questions_served: number;
  correct_count: number;
  history: AbilityHistoryRecord[];
}

export interface CATSelectionConfig {
  selection_strategy: string;
  weights: {
    fisher_information: number;
    content_balancing: number;
    exploration_value: number;
    mistake_bonus: number;
    exposure_control: number;
  };
  topic_constraints: {
    max_consecutive_streak: number;
    max_per_topic: number;
    enforce_blueprint: boolean;
  };
  exposure_control: {
    enabled: boolean;
    max_exposure_ceiling: number;
    penalty_rate: number;
  };
  tie_breaking: string;
}

export interface CATHealthTelemetry {
  active_strategy: string;
  total_decisions_count: number;
  strategy_distribution: Record<string, number>;
  average_candidates_evaluated: number;
  max_exposure_recorded: number;
  average_item_exposure: number;
  unique_items_served: number;
  streak_violations_mitigated: number;
}

export interface ItemInformationExplorerItem {
  question_version_id: string;
  question_text: string;
  topic_name: string;
  difficulty_tier: string;
  difficulty_b: number;
  calibration_status: string;
  fisher_information: number;
  normalized_information: number;
  exposure_count: number;
}

export interface AdminStoppingConfig {
  min_questions: number;
  max_questions: number;
  target_se: number;
  diminishing_info_threshold: number;
  diminishing_info_window: number;
  enforce_blueprint: boolean;
  enforce_topic_coverage: boolean;
  allow_early_stopping: boolean;
}

export interface AdminStoppingHealth {
  total_completed_attempts: number;
  stopped_by_max_questions: number;
  stopped_by_target_se: number;
  stopped_by_blueprint: number;
  stopped_by_no_eligible_items: number;
  stopped_by_expiry: number;
  stopped_by_diminishing_info: number;
  average_questions_served: number;
  average_final_se: number;
}

export interface AdminPersonalizationConfig {
  enabled: boolean;
  max_influence: number;
  weights: {
    weak_area: number;
    mistake_vault: number;
    exploration: number;
    subject_balance: number;
  };
  recency_window_attempts: number;
  cold_start_threshold_questions: number;
  warm_start_enabled: boolean;
}

export interface AdminPersonalizationHealth {
  total_personalized_attempts: number;
  weak_area_boosted_decisions: number;
  mistake_reinforced_decisions: number;
  exploration_decisions: number;
  cold_starts_count: number;
  warm_starts_count: number;
}

export interface AdaptiveAdminOverview {
  globalStatus: AdaptiveGlobalStatus;
  safetyLimits: AdaptiveSafetyLimits;
  activeAlgorithmVersion: AdaptiveAlgorithmVersion | null;
  allAlgorithmVersions: AdaptiveAlgorithmVersion[];
  totalConfigsCount: number;
  activeConfigsCount: number;
  totalAdaptiveAttempts: number;
  completedAdaptiveAttempts: number;
  inProgressAdaptiveAttempts: number;
  calibratedItemsCount: number;
  uncalibratedItemsCount: number;
  recentAuditLogs: AdaptiveAuditLogItem[];
  estimatorConfig?: AdaptiveEstimatorConfig;
  estimatorHealth?: AdaptiveEstimatorHealth;
}

export interface CalibrationHistoryEntry {
  id: string;
  question_version_id: string;
  calibration_id: string | null;
  previous_status: string | null;
  new_status: string;
  previous_parameters: Record<string, unknown>;
  new_parameters: Record<string, unknown>;
  sample_size: number;
  calculated_at: string;
  calculation_version: string;
  reason: string | null;
}

export interface ItemCalibrationDetailView {
  id?: string;
  question_version_id: string;
  question_id?: string;
  question_text: string;
  static_difficulty: string;
  options_type?: string;
  language?: string;
  sample_size: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_rate: number;
  difficulty_score: number;
  difficulty_b: number | null;
  discrimination_a: null;
  guessing_c: null;
  confidence_score: number;
  reliability_score: number;
  calibration_status: AdaptiveCalibrationStatus;
  calibration_method: string;
  is_unstable?: boolean;
  instability_reason?: string | null;
  calculated_at?: string;
  calibrated_at?: string | null;
  history: CalibrationHistoryEntry[];
  options?: Array<{
    id: string;
    option_key: string;
    content_markup: string;
    is_correct: boolean;
  }>;
}

// ============================================================================
// DEFAULT CONSTANTS (Client and Server Safe)
// ============================================================================

export const DEFAULT_CAT_CONFIG: CATSelectionConfig = {
  selection_strategy: "max_fisher_information",
  weights: {
    fisher_information: 0.40,
    content_balancing: 0.25,
    exploration_value: 0.15,
    mistake_bonus: 0.10,
    exposure_control: 0.10,
  },
  topic_constraints: {
    max_consecutive_streak: 3,
    max_per_topic: 5,
    enforce_blueprint: true,
  },
  exposure_control: {
    enabled: true,
    max_exposure_ceiling: 50,
    penalty_rate: 0.02,
  },
  tie_breaking: "deterministic_hash_or_id",
};

export const DEFAULT_STOPPING_CONFIG: AdminStoppingConfig = {
  min_questions: 20,
  max_questions: 50,
  target_se: 0.35,
  diminishing_info_threshold: 0.05,
  diminishing_info_window: 5,
  enforce_blueprint: true,
  enforce_topic_coverage: true,
  allow_early_stopping: true,
};

export const DEFAULT_PERSONALIZATION_CONFIG: AdminPersonalizationConfig = {
  enabled: true,
  max_influence: 0.40,
  weights: {
    weak_area: 0.35,
    mistake_vault: 0.25,
    exploration: 0.20,
    subject_balance: 0.20,
  },
  recency_window_attempts: 5,
  cold_start_threshold_questions: 5,
  warm_start_enabled: true,
};

export const DEFAULT_ESTIMATOR_CONFIG: AdaptiveEstimatorConfig = {
  active_estimator: "estimator_v1_regularized_1pl",
  regularization_lambda: 0.2,
  min_theta: -3.0,
  max_theta: 3.0,
  min_se: 0.10,
  max_se: 1.0,
  convergence_tolerance: 0.0001,
  max_iterations: 25,
  initial_theta: 0.0,
  initial_se: 1.0,
  warm_start_enabled: false,
  warm_start_min: -2.0,
  warm_start_max: 2.0,
};

export const DEFAULT_ADAPTIVE_GLOBAL_STATUS: AdaptiveGlobalStatus = {
  is_adaptive_enabled: true,
  is_advanced_adaptive_enabled: false,
  active_algorithm_version: "v1_heuristic",
  emergency_disabled: false,
  emergency_disable_reason: null,
  fallback_mode: "v1_heuristic",
  maintenance_mode: false,
  maintenance_message: "Adaptive Mock testing is currently undergoing scheduled maintenance.",
};

export const DEFAULT_ADAPTIVE_SAFETY_LIMITS: AdaptiveSafetyLimits = {
  absolute_min_questions: 5,
  absolute_max_questions: 100,
  max_item_exposure_ceiling: 0.50,
  max_theta_drift_per_step: 1.0,
  enforce_blueprint_coverage: true,
  allow_emergency_fallback: true,
};
