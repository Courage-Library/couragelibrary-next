-- ============================================================================
-- COURAGE LIBRARY — PHASE 4D.4
-- Migration 42: CAT / Information-Based Adaptive Item Selection
-- ============================================================================

-- 1. Register CAT Algorithm Version in adaptive_algorithm_versions
INSERT INTO adaptive_algorithm_versions (
    version_code,
    name,
    description,
    status,
    model_type,
    estimation_method,
    hyperparameters,
    exposure_control_config,
    stopping_rule_defaults,
    is_active,
    activated_at,
    release_notes
)
VALUES (
    'cat_v1_information_1pl',
    'CAT 1PL Maximum Information Selection Engine',
    'Production CAT selection engine utilizing 1PL Rasch Fisher item information, blueprint balancing, exposure control penalties, and mistake vault reinforcement.',
    'active',
    'rasch_1pl',
    'map',
    '{
        "info_weight": 0.40,
        "content_weight": 0.25,
        "exploration_weight": 0.15,
        "mistake_weight": 0.10,
        "exposure_weight": 0.10,
        "max_topic_streak": 3,
        "topic_streak_penalty": 0.70,
        "min_pool_size": 5
    }'::jsonb,
    '{
        "enabled": true,
        "max_exposure_ceiling": 50,
        "penalty_rate": 0.02,
        "target_max_rate": 0.20
    }'::jsonb,
    '{
        "min_questions": 5,
        "max_questions": 25,
        "target_se": 0.35
    }'::jsonb,
    true,
    NOW(),
    'Phase 4D.4: 1PL Fisher Information CAT selection with content balancing, streak dampening, and exposure regulation.'
)
ON CONFLICT (version_code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    model_type = EXCLUDED.model_type,
    estimation_method = EXCLUDED.estimation_method,
    hyperparameters = EXCLUDED.hyperparameters,
    exposure_control_config = EXCLUDED.exposure_control_config,
    stopping_rule_defaults = EXCLUDED.stopping_rule_defaults,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 2. Register Global CAT Selection Config in adaptive_system_configs
INSERT INTO adaptive_system_configs (
    config_key,
    config_value,
    description
)
VALUES (
    'CAT_SELECTION_CONFIG',
    '{
        "selection_strategy": "max_fisher_information",
        "weights": {
            "fisher_information": 0.40,
            "content_balancing": 0.25,
            "exploration_value": 0.15,
            "mistake_bonus": 0.10,
            "exposure_control": 0.10
        },
        "topic_constraints": {
            "max_consecutive_streak": 3,
            "max_per_topic": 5,
            "enforce_blueprint": true
        },
        "exposure_control": {
            "enabled": true,
            "max_exposure_ceiling": 50,
            "penalty_rate": 0.02
        },
        "tie_breaking": "deterministic_hash_or_id"
    }'::jsonb,
    'Global configuration for CAT 1PL Maximum Information item selection, multi-objective scoring weights, and exposure management.'
)
ON CONFLICT (config_key) DO UPDATE
SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 3. Performance Indexes for CAT Selection & Exposure Lookups
CREATE INDEX IF NOT EXISTS idx_aqd_qv_created
    ON adaptive_question_decisions (question_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aqd_attempt_step
    ON adaptive_question_decisions (attempt_id, step_number);

CREATE INDEX IF NOT EXISTS idx_aic_status_diff
    ON adaptive_item_calibrations (calibration_status, difficulty_b);
