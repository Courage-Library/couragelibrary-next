-- ============================================================================
-- Courage Library — Phase 4A: Adaptive Mock Testing Engine Foundation
-- Migration: 20260908000038_phase4a_adaptive_foundation.sql
--
-- Core Architecture:
-- 1. public.adaptive_test_configs (Versioned blueprints & policies)
-- 2. public.adaptive_attempt_states (Runtime ability & precision tracking)
-- 3. public.adaptive_question_decisions (Immutable explainable selection log)
-- 4. public.user_adaptive_profiles (Long-term ability & calibration signals)
--
-- Safety Guarantees:
-- - 100% Additive & Idempotent (IF NOT EXISTS)
-- - Zero deletion, zero truncation, zero mutation of production rows
-- - Daily Mock & existing Premium Mock systems untouched
-- ============================================================================

-- 1. ADAPTIVE TEST CONFIGURATIONS
CREATE TABLE IF NOT EXISTS public.adaptive_test_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    pattern_id UUID REFERENCES public.exam_patterns(id) ON DELETE SET NULL,
    test_type VARCHAR(50) NOT NULL DEFAULT 'ADAPTIVE_FULL_LENGTH',
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_questions INTEGER NOT NULL DEFAULT 20,
    max_questions INTEGER NOT NULL DEFAULT 50,
    target_duration_minutes INTEGER NOT NULL DEFAULT 60,
    difficulty_policy JSONB NOT NULL DEFAULT '{"initial_difficulty": "medium", "step_size": 0.3, "min_theta": -3.0, "max_theta": 3.0}'::jsonb,
    topic_policy JSONB NOT NULL DEFAULT '{"coverage_mode": "balanced", "max_per_topic": 5}'::jsonb,
    stopping_policy JSONB NOT NULL DEFAULT '{"type": "standard_error_or_length", "target_se": 0.35, "min_questions": 20, "max_questions": 50}'::jsonb,
    selection_policy JSONB NOT NULL DEFAULT '{"strategy": "max_fisher_information", "exploration_rate": 0.1, "exposure_control": true}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_adaptive_test_configs_exam_slug_version UNIQUE (exam_id, slug, version),
    CONSTRAINT chk_adaptive_test_configs_questions CHECK (min_questions > 0 AND max_questions >= min_questions),
    CONSTRAINT chk_adaptive_test_configs_duration CHECK (target_duration_minutes > 0)
);

-- 2. ADAPTIVE ATTEMPT STATES
CREATE TABLE IF NOT EXISTS public.adaptive_attempt_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL UNIQUE REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    config_id UUID NOT NULL REFERENCES public.adaptive_test_configs(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    current_theta DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    standard_error DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    current_difficulty_tier VARCHAR(20) NOT NULL DEFAULT 'medium',
    questions_served_count INTEGER NOT NULL DEFAULT 0,
    correct_answers_count INTEGER NOT NULL DEFAULT 0,
    incorrect_answers_count INTEGER NOT NULL DEFAULT 0,
    topic_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    section_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    sequence_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    stopping_reason VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_adaptive_attempt_counts CHECK (
        questions_served_count >= 0 AND 
        correct_answers_count >= 0 AND 
        incorrect_answers_count >= 0 AND
        (correct_answers_count + incorrect_answers_count) <= questions_served_count
    ),
    CONSTRAINT chk_adaptive_attempt_status CHECK (
        status IN ('in_progress', 'stopping_rule_met', 'completed', 'terminated')
    )
);

-- 3. ADAPTIVE QUESTION SELECTION DECISIONS (EXPLAINABLE AUDIT LOG)
CREATE TABLE IF NOT EXISTS public.adaptive_question_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_state_id UUID NOT NULL REFERENCES public.adaptive_attempt_states(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    target_topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    target_difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
    selection_strategy VARCHAR(50) NOT NULL DEFAULT 'max_fisher_information',
    decision_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_adaptive_question_decisions_step UNIQUE (attempt_id, step_number),
    CONSTRAINT chk_adaptive_question_decisions_step CHECK (step_number > 0)
);

-- 4. USER ADAPTIVE PERFORMANCE PROFILES
CREATE TABLE IF NOT EXISTS public.user_adaptive_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    overall_theta DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    overall_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    subject_abilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    difficulty_accuracies JSONB NOT NULL DEFAULT '{"easy": 0.0, "medium": 0.0, "hard": 0.0}'::jsonb,
    total_adaptive_tests_completed INTEGER NOT NULL DEFAULT 0,
    total_adaptive_questions_answered INTEGER NOT NULL DEFAULT 0,
    last_calibrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_adaptive_profiles_user_exam UNIQUE (user_id, exam_id),
    CONSTRAINT chk_user_adaptive_profiles_confidence CHECK (overall_confidence >= 0.0 AND overall_confidence <= 1.0)
);

-- ============================================================================
-- IMMUTABILITY TRIGGER: Prevent modification or deletion of question decisions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_prevent_adaptive_decision_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Adaptive question selection decisions are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_adaptive_decision_mutation ON public.adaptive_question_decisions;
CREATE TRIGGER trg_prevent_adaptive_decision_mutation
BEFORE UPDATE OR DELETE ON public.adaptive_question_decisions
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_adaptive_decision_mutation();

-- ============================================================================
-- INDEXES FOR HIGH-CONCURRENCY ADAPTIVE DECISION ENGINE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_adaptive_configs_exam_active
ON public.adaptive_test_configs (exam_id, is_active);

CREATE INDEX IF NOT EXISTS idx_adaptive_configs_test_type
ON public.adaptive_test_configs (test_type, is_active);

CREATE INDEX IF NOT EXISTS idx_adaptive_attempt_states_user
ON public.adaptive_attempt_states (user_id, status);

CREATE INDEX IF NOT EXISTS idx_adaptive_attempt_states_attempt
ON public.adaptive_attempt_states (attempt_id);

CREATE INDEX IF NOT EXISTS idx_adaptive_decisions_attempt_step
ON public.adaptive_question_decisions (attempt_id, step_number);

CREATE INDEX IF NOT EXISTS idx_adaptive_decisions_user
ON public.adaptive_question_decisions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_adaptive_profiles_user
ON public.user_adaptive_profiles (user_id, exam_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.adaptive_test_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_attempt_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_question_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_adaptive_profiles ENABLE ROW LEVEL SECURITY;

-- 1. adaptive_test_configs policies
DROP POLICY IF EXISTS "Anyone can view active adaptive configs" ON public.adaptive_test_configs;
CREATE POLICY "Anyone can view active adaptive configs"
ON public.adaptive_test_configs
FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins have full access to adaptive configs" ON public.adaptive_test_configs;
CREATE POLICY "Admins have full access to adaptive configs"
ON public.adaptive_test_configs
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin', 'staff')
    )
);

-- 2. adaptive_attempt_states policies
DROP POLICY IF EXISTS "Users can view own adaptive attempt states" ON public.adaptive_attempt_states;
CREATE POLICY "Users can view own adaptive attempt states"
ON public.adaptive_attempt_states
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins have full access to adaptive attempt states" ON public.adaptive_attempt_states;
CREATE POLICY "Admins have full access to adaptive attempt states"
ON public.adaptive_attempt_states
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin', 'staff')
    )
);

-- 3. adaptive_question_decisions policies
DROP POLICY IF EXISTS "Users can view own adaptive question decisions" ON public.adaptive_question_decisions;
CREATE POLICY "Users can view own adaptive question decisions"
ON public.adaptive_question_decisions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins have read access to adaptive question decisions" ON public.adaptive_question_decisions;
CREATE POLICY "Admins have read access to adaptive question decisions"
ON public.adaptive_question_decisions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin', 'staff')
    )
);

-- 4. user_adaptive_profiles policies
DROP POLICY IF EXISTS "Users can view own adaptive profile" ON public.user_adaptive_profiles;
CREATE POLICY "Users can view own adaptive profile"
ON public.user_adaptive_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins have full access to user adaptive profiles" ON public.user_adaptive_profiles;
CREATE POLICY "Admins have full access to user adaptive profiles"
ON public.user_adaptive_profiles
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin', 'staff')
    )
);
