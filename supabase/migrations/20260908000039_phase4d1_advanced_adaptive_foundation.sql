-- ============================================================================
-- Courage Library — Phase 4D.1: Advanced Adaptive Architecture Foundation
-- Migration: 20260908000039_phase4d1_advanced_adaptive_foundation.sql
--
-- Safety & Invariant Guarantees:
-- 1. 100% Additive & Idempotent (IF NOT EXISTS)
-- 2. Zero mutation / deletion / truncation of existing rows
-- 3. Reuses admin_audit_logs for all administrative mutations
-- 4. Reuses adaptive_test_configs for policy blueprints
-- 5. Preserves production baseline row counts across all 10 core tables
-- ============================================================================

-- ============================================================================
-- 1. ADAPTIVE ALGORITHM VERSIONS (REGISTRY ONLY - NO EXECUTABLE CODE STORE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adaptive_algorithm_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    model_type VARCHAR(30) NOT NULL DEFAULT 'heuristic_v1',
    estimation_method VARCHAR(30) NOT NULL DEFAULT 'proxy_heuristic',
    hyperparameters JSONB NOT NULL DEFAULT '{
        "initial_theta": 0.0,
        "step_size": 0.3,
        "min_theta": -3.0,
        "max_theta": 3.0,
        "convergence_threshold": 0.05
    }'::jsonb,
    exposure_control_config JSONB NOT NULL DEFAULT '{
        "strategy": "heuristic_balancing",
        "max_item_exposure_rate": 0.30
    }'::jsonb,
    stopping_rule_defaults JSONB NOT NULL DEFAULT '{
        "min_questions": 20,
        "max_questions": 50,
        "target_se": 0.35
    }'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT false,
    activated_at TIMESTAMPTZ,
    release_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_adaptive_algo_status CHECK (
        status IN ('draft', 'testing', 'active', 'deprecated', 'archived')
    ),
    CONSTRAINT chk_adaptive_algo_model CHECK (
        model_type IN ('heuristic_v1', 'rasch_1pl', '2pl', '3pl', 'multidimensional')
    ),
    CONSTRAINT chk_adaptive_algo_estimation CHECK (
        estimation_method IN ('proxy_heuristic', 'mle', 'eap', 'map')
    )
);

-- ============================================================================
-- 2. ADAPTIVE ITEM CALIBRATIONS (PSYCHOMETRIC PARAMETERS FOUNDATION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adaptive_item_calibrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE CASCADE,
    algorithm_version_id UUID REFERENCES public.adaptive_algorithm_versions(id) ON DELETE SET NULL,
    difficulty_b DOUBLE PRECISION,
    discrimination_a DOUBLE PRECISION,
    guessing_c DOUBLE PRECISION,
    sample_size INTEGER NOT NULL DEFAULT 0,
    reliability_score DOUBLE PRECISION,
    calibration_status VARCHAR(20) NOT NULL DEFAULT 'uncalibrated',
    calibration_method VARCHAR(50) DEFAULT 'uncalibrated_baseline',
    calibration_version INTEGER NOT NULL DEFAULT 1,
    calibrated_at TIMESTAMPTZ,
    calibration_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_item_calibrations_question_version UNIQUE (question_version_id, calibration_version),
    CONSTRAINT chk_item_calibration_status CHECK (
        calibration_status IN ('uncalibrated', 'provisional', 'calibrated', 'flagged', 'deprecated')
    ),
    CONSTRAINT chk_item_calibration_sample_size CHECK (sample_size >= 0)
);

-- ============================================================================
-- 3. ADAPTIVE SYSTEM CONFIGURATIONS (SAFETY & EMERGENCY KILL-SWITCH)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adaptive_system_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_domain VARCHAR(50) NOT NULL DEFAULT 'GLOBAL',
    config_key VARCHAR(100) NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_adaptive_sys_config_domain CHECK (
        config_domain IN ('GLOBAL', 'EXAM', 'SAFETY_LIMITS', 'EMERGENCY_CONTROL')
    )
);

-- ============================================================================
-- 4. SEED INITIAL BASELINE ADAPTIVE ENGINE VERSION & CONFIGS
-- ============================================================================

-- Seed Active Baseline Version 1 (Heuristic Engine)
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
    'v1_heuristic',
    'Adaptive v1.0 — Heuristic Stepper',
    'Production-verified step-by-step heuristic adaptive engine with bounded ability proxy and deterministic difficulty adjustment.',
    'active',
    'heuristic_v1',
    'proxy_heuristic',
    '{
        "initial_theta": 0.0,
        "step_size": 0.3,
        "min_theta": -3.0,
        "max_theta": 3.0,
        "convergence_threshold": 0.05
    }'::jsonb,
    '{
        "strategy": "heuristic_balancing",
        "max_item_exposure_rate": 0.30
    }'::jsonb,
    '{
        "min_questions": 20,
        "max_questions": 50,
        "target_se": 0.35
    }'::jsonb,
    true,
    now(),
    'Baseline production engine for Courage Library Adaptive Mock Testing.'
) ON CONFLICT (version_code) DO NOTHING;

-- Seed Global Adaptive System Status
INSERT INTO public.adaptive_system_configs (
    config_domain,
    config_key,
    is_enabled,
    config_value
) VALUES (
    'GLOBAL',
    'GLOBAL_ADAPTIVE_STATUS',
    true,
    jsonb_build_object(
        'is_adaptive_enabled', true,
        'is_advanced_adaptive_enabled', false,
        'active_algorithm_version', 'v1_heuristic',
        'emergency_disabled', false,
        'emergency_disable_reason', null,
        'fallback_mode', 'v1_heuristic',
        'maintenance_mode', false,
        'maintenance_message', 'Adaptive Mock testing is currently undergoing scheduled maintenance.'
    )
) ON CONFLICT (config_key) DO NOTHING;

-- Seed Safety Limits Baseline
INSERT INTO public.adaptive_system_configs (
    config_domain,
    config_key,
    is_enabled,
    config_value
) VALUES (
    'SAFETY_LIMITS',
    'GLOBAL_SAFETY_LIMITS',
    true,
    jsonb_build_object(
        'absolute_min_questions', 5,
        'absolute_max_questions', 100,
        'max_item_exposure_ceiling', 0.50,
        'max_theta_drift_per_step', 1.0,
        'enforce_blueprint_coverage', true,
        'allow_emergency_fallback', true
    )
) ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_adaptive_algo_status ON public.adaptive_algorithm_versions (status, is_active);
CREATE INDEX IF NOT EXISTS idx_adaptive_algo_code ON public.adaptive_algorithm_versions (version_code);
CREATE INDEX IF NOT EXISTS idx_item_calibrations_question ON public.adaptive_item_calibrations (question_version_id, calibration_status);
CREATE INDEX IF NOT EXISTS idx_item_calibrations_algo ON public.adaptive_item_calibrations (algorithm_version_id);
CREATE INDEX IF NOT EXISTS idx_adaptive_sys_configs_domain ON public.adaptive_system_configs (config_domain, is_enabled);
CREATE INDEX IF NOT EXISTS idx_adaptive_sys_configs_key ON public.adaptive_system_configs (config_key);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.adaptive_algorithm_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_item_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_system_configs ENABLE ROW LEVEL SECURITY;

-- adaptive_algorithm_versions RLS:
-- Authenticated users can view active / testing versions (read-only)
DROP POLICY IF EXISTS "Allow authenticated read active algorithm versions" ON public.adaptive_algorithm_versions;
CREATE POLICY "Allow authenticated read active algorithm versions"
ON public.adaptive_algorithm_versions
FOR SELECT
TO authenticated
USING (is_active = true OR status IN ('active', 'testing'));

-- Service role & admins have full control
DROP POLICY IF EXISTS "Allow service role full access algorithm versions" ON public.adaptive_algorithm_versions;
CREATE POLICY "Allow service role full access algorithm versions"
ON public.adaptive_algorithm_versions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- adaptive_item_calibrations RLS:
-- Read access for authenticated users (runtime test generation requires reading item status)
DROP POLICY IF EXISTS "Allow authenticated read item calibrations" ON public.adaptive_item_calibrations;
CREATE POLICY "Allow authenticated read item calibrations"
ON public.adaptive_item_calibrations
FOR SELECT
TO authenticated
USING (true);

-- Service role & admins full access
DROP POLICY IF EXISTS "Allow service role full access item calibrations" ON public.adaptive_item_calibrations;
CREATE POLICY "Allow service role full access item calibrations"
ON public.adaptive_item_calibrations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- adaptive_system_configs RLS:
-- Read access for authenticated users to active configs (to check maintenance/emergency flags)
DROP POLICY IF EXISTS "Allow authenticated read active adaptive system configs" ON public.adaptive_system_configs;
CREATE POLICY "Allow authenticated read active adaptive system configs"
ON public.adaptive_system_configs
FOR SELECT
TO authenticated
USING (is_enabled = true);

-- Service role & admins full access
DROP POLICY IF EXISTS "Allow service role full access adaptive system configs" ON public.adaptive_system_configs;
CREATE POLICY "Allow service role full access adaptive system configs"
ON public.adaptive_system_configs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
