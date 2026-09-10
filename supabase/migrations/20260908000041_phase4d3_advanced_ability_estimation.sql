-- ============================================================================
-- Courage Library — Phase 4D.3: Advanced Ability Estimation Engine
-- Migration: 20260908000041_phase4d3_advanced_ability_estimation.sql
--
-- Safety & Invariant Guarantees:
-- 1. 100% Additive & Idempotent (IF NOT EXISTS)
-- 2. Zero mutation / deletion / truncation of existing rows
-- 3. Immutable ability estimation audit history
-- 4. Server-authoritative regularized 1PL Rasch ability estimation
-- 5. Preserves production baseline row counts across all 10 core tables
-- ============================================================================

-- ============================================================================
-- 1. ADAPTIVE ABILITY ESTIMATION HISTORY (IMMUTABLE AUDIT OF ABILITY TRANSITIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adaptive_ability_estimation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    attempt_state_id UUID REFERENCES public.adaptive_attempt_states(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    step_number INTEGER NOT NULL,
    theta_before DOUBLE PRECISION NOT NULL,
    theta_after DOUBLE PRECISION NOT NULL,
    se_before DOUBLE PRECISION NOT NULL,
    se_after DOUBLE PRECISION NOT NULL,
    estimator_version VARCHAR(50) NOT NULL DEFAULT 'estimator_v1_regularized_1pl',
    difficulty_source VARCHAR(50) NOT NULL DEFAULT 'STATIC_FALLBACK',
    difficulty_b DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    is_correct BOOLEAN NOT NULL,
    converged BOOLEAN NOT NULL DEFAULT true,
    iterations INTEGER NOT NULL DEFAULT 1,
    effective_information DOUBLE PRECISION,
    regularization_lambda DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ability_estimation_history_step UNIQUE (attempt_id, step_number),
    CONSTRAINT chk_ability_estimation_history_step CHECK (step_number > 0)
);

-- ============================================================================
-- 2. IMMUTABILITY TRIGGER: Strictly prevent UPDATE / DELETE on estimation history
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_prevent_ability_estimation_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'adaptive_ability_estimation_history records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_ability_estimation_history_mutation ON public.adaptive_ability_estimation_history;
CREATE TRIGGER trg_prevent_ability_estimation_history_mutation
BEFORE UPDATE OR DELETE ON public.adaptive_ability_estimation_history
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_ability_estimation_history_mutation();

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE & AUDITING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ability_history_attempt_step
ON public.adaptive_ability_estimation_history (attempt_id, step_number);

CREATE INDEX IF NOT EXISTS idx_ability_history_user_time
ON public.adaptive_ability_estimation_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ability_history_qv
ON public.adaptive_ability_estimation_history (question_version_id);

CREATE INDEX IF NOT EXISTS idx_ability_history_estimator
ON public.adaptive_ability_estimation_history (estimator_version);

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.adaptive_ability_estimation_history ENABLE ROW LEVEL SECURITY;

-- Candidates have NO direct read or write access (server-authoritative execution)
-- Service role & Admin have full control
DROP POLICY IF EXISTS "Allow service role full access ability estimation history" ON public.adaptive_ability_estimation_history;
CREATE POLICY "Allow service role full access ability estimation history"
ON public.adaptive_ability_estimation_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 5. SEED ALGORITHM VERSION: estimator_v1_regularized_1pl
-- ============================================================================

INSERT INTO public.adaptive_algorithm_versions (
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
) VALUES (
    'estimator_v1_regularized_1pl',
    'Regularized 1PL / Rasch Ability Estimator',
    'Production-grade bounded Newton-Raphson regularized logistic ability estimator with Fisher information standard error precision.',
    'active',
    'rasch_1pl',
    'map',
    '{
        "regularization_lambda": 0.2,
        "solver": "bounded_newton_raphson",
        "max_iterations": 25,
        "convergence_tolerance": 0.0001,
        "min_theta": -3.0,
        "max_theta": 3.0,
        "min_se": 0.10,
        "max_se": 1.0,
        "initial_theta": 0.0,
        "initial_se": 1.0,
        "warm_start_enabled": false,
        "warm_start_min": -2.0,
        "warm_start_max": 2.0
    }'::jsonb,
    '{"max_exposure_rate": 0.25, "decay_rate": 0.95}'::jsonb,
    '{"min_questions": 20, "max_questions": 50, "target_se": 0.35}'::jsonb,
    false,
    NULL,
    'Phase 4D.3: Introduces regularized 1PL logistic ability estimation, replacing the heuristic stepper.'
)
ON CONFLICT (version_code) DO NOTHING;

-- ============================================================================
-- 6. SEED SYSTEM CONFIG: ESTIMATOR_CONFIG
-- ============================================================================

INSERT INTO public.adaptive_system_configs (
    config_key,
    config_value,
    description,
    is_active
) VALUES (
    'ESTIMATOR_CONFIG',
    '{
        "active_estimator": "estimator_v1_regularized_1pl",
        "regularization_lambda": 0.2,
        "min_theta": -3.0,
        "max_theta": 3.0,
        "min_se": 0.10,
        "max_se": 1.0,
        "convergence_tolerance": 0.0001,
        "max_iterations": 25,
        "initial_theta": 0.0,
        "initial_se": 1.0,
        "warm_start_enabled": false,
        "warm_start_min": -2.0,
        "warm_start_max": 2.0
    }'::jsonb,
    'Global configuration for the adaptive ability estimation engine and numerical solver.',
    true
)
ON CONFLICT (config_key) DO NOTHING;
