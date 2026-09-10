-- ============================================================================
-- COURAGE LIBRARY — PHASE 4D.5
-- Migration 43: Advanced Stopping & Personalization Engine
-- ============================================================================

-- 1. Add immutable stopping and personalization audit columns to adaptive_attempt_states
ALTER TABLE public.adaptive_attempt_states 
    ADD COLUMN IF NOT EXISTS stopping_metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS stopping_policy_version VARCHAR(100) DEFAULT 'stopping_v1_deterministic',
    ADD COLUMN IF NOT EXISTS personalization_policy_version VARCHAR(100) DEFAULT 'personalization_v1_balanced';

-- 2. Performance index on status and stopping_reason
CREATE INDEX IF NOT EXISTS idx_adaptive_attempt_states_status_reason
    ON public.adaptive_attempt_states (status, stopping_reason);

-- 3. Register Stopping Algorithm Version in adaptive_algorithm_versions
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
    'stopping_v1_deterministic',
    'Deterministic Multi-Criteria Stopping Engine',
    'Server-authoritative psychometric stopping engine evaluating minimum/maximum questions, target SE precision, blueprint fulfillment, topic coverage, and diminishing information contributions.',
    'active',
    'rasch_1pl',
    'map',
    '{
        "diminishing_info_threshold": 0.05,
        "diminishing_info_window": 5,
        "enforce_blueprint": true,
        "enforce_topic_coverage": true,
        "precedence_order": [
            "SYSTEM_SAFETY_STOP",
            "ATTEMPT_EXPIRED",
            "MAX_QUESTIONS_REACHED",
            "NO_ELIGIBLE_ITEMS",
            "MIN_QUESTIONS_NOT_REACHED",
            "BLUEPRINT_INCOMPLETE",
            "TOPIC_COVERAGE_INCOMPLETE",
            "TARGET_SE_ACHIEVED",
            "DIMINISHING_INFORMATION",
            "CONTINUE"
        ]
    }'::jsonb,
    '{
        "enabled": true,
        "max_exposure_ceiling": 50
    }'::jsonb,
    '{
        "min_questions": 20,
        "max_questions": 50,
        "target_se": 0.35
    }'::jsonb,
    true,
    NOW(),
    'Phase 4D.5: Deterministic stopping engine with explicit continuation gating and diminishing information detection.'
)
ON CONFLICT (version_code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    hyperparameters = EXCLUDED.hyperparameters,
    stopping_rule_defaults = EXCLUDED.stopping_rule_defaults,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 4. Register Personalization Algorithm Version in adaptive_algorithm_versions
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
    'personalization_v1_balanced',
    'Bounded Educational Personalization Engine',
    'Bounded personalization layer modulating candidate topic priority, weakness reinforcement, exploration rate, and Mistake Vault integration without compromising CAT measurement precision.',
    'active',
    'rasch_1pl',
    'map',
    '{
        "max_influence": 0.40,
        "weights": {
            "weak_area": 0.35,
            "mistake_vault": 0.25,
            "exploration": 0.20,
            "subject_balance": 0.20
        },
        "recency_window_attempts": 5,
        "cold_start_threshold_questions": 5,
        "warm_start_enabled": true
    }'::jsonb,
    '{
        "enabled": true,
        "max_exposure_ceiling": 50
    }'::jsonb,
    '{
        "min_questions": 20,
        "max_questions": 50,
        "target_se": 0.35
    }'::jsonb,
    true,
    NOW(),
    'Phase 4D.5: Bounded educational personalization modulating topic priorities while preserving CAT psychometric primacy.'
)
ON CONFLICT (version_code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    hyperparameters = EXCLUDED.hyperparameters,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 5. Register Global Stopping Configuration in adaptive_system_configs
INSERT INTO adaptive_system_configs (
    config_key,
    config_value,
    description
)
VALUES (
    'STOPPING_CONFIG',
    '{
        "min_questions": 20,
        "max_questions": 50,
        "target_se": 0.35,
        "diminishing_info_threshold": 0.05,
        "diminishing_info_window": 5,
        "enforce_blueprint": true,
        "enforce_topic_coverage": true,
        "allow_early_stopping": true
    }'::jsonb,
    'Global configuration for server-authoritative psychometric stopping rules and diminishing information detection.'
)
ON CONFLICT (config_key) DO UPDATE
SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 6. Register Global Personalization Configuration in adaptive_system_configs
INSERT INTO adaptive_system_configs (
    config_key,
    config_value,
    description
)
VALUES (
    'PERSONALIZATION_CONFIG',
    '{
        "enabled": true,
        "max_influence": 0.40,
        "weights": {
            "weak_area": 0.35,
            "mistake_vault": 0.25,
            "exploration": 0.20,
            "subject_balance": 0.20
        },
        "recency_window_attempts": 5,
        "cold_start_threshold_questions": 5,
        "warm_start_enabled": true
    }'::jsonb,
    'Global configuration for bounded educational personalization, topic weakness reinforcement, and exploration balancing.'
)
ON CONFLICT (config_key) DO UPDATE
SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();
