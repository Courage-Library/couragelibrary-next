-- ============================================================================
-- Courage Library — Phase 4D.2: Item Calibration & Difficulty Intelligence
-- Migration: 20260908000040_phase4d2_item_calibration_and_evidence.sql
--
-- Safety & Invariant Guarantees:
-- 1. 100% Additive & Idempotent (IF NOT EXISTS)
-- 2. Zero mutation / deletion / truncation of existing rows
-- 3. Version-aware immutable response evidence tracking
-- 4. Immutable calibration history auditing
-- 5. Preserves production baseline row counts across all 10 core tables
-- ============================================================================

-- ============================================================================
-- 1. ADAPTIVE ITEM RESPONSE EVIDENCE (IMMUTABLE RECORD OF SUBMITTED RESPONSES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adaptive_item_response_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_correct BOOLEAN NOT NULL,
    response_source VARCHAR(50) NOT NULL DEFAULT 'submitted_attempt',
    difficulty_context VARCHAR(20) NOT NULL DEFAULT 'medium',
    adaptive_step_number INTEGER,
    ability_estimate_before DOUBLE PRECISION,
    ability_estimate_after DOUBLE PRECISION,
    response_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_item_response_evidence_attempt_question UNIQUE (attempt_id, question_version_id)
);

-- ============================================================================
-- 2. ADAPTIVE ITEM CALIBRATION HISTORY (IMMUTABLE AUDIT OF CALIBRATION SNAPSHOTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adaptive_item_calibration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    calibration_id UUID REFERENCES public.adaptive_item_calibrations(id) ON DELETE SET NULL,
    algorithm_version_id UUID REFERENCES public.adaptive_algorithm_versions(id) ON DELETE SET NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    previous_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    sample_size INTEGER NOT NULL DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    calculation_version VARCHAR(50) NOT NULL DEFAULT 'calibration_v1_heuristic',
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_calibration_history_status CHECK (
        new_status IN ('uncalibrated', 'provisional', 'calibrated', 'flagged', 'deprecated')
    )
);

-- ============================================================================
-- 3. IMMUTABILITY TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_prevent_response_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'adaptive_item_response_evidence records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_response_evidence_mutation ON public.adaptive_item_response_evidence;
CREATE TRIGGER trg_prevent_response_evidence_mutation
BEFORE UPDATE OR DELETE ON public.adaptive_item_response_evidence
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_response_evidence_mutation();

CREATE OR REPLACE FUNCTION public.fn_prevent_calibration_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'adaptive_item_calibration_history records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_calibration_history_mutation ON public.adaptive_item_calibration_history;
CREATE TRIGGER trg_prevent_calibration_history_mutation
BEFORE UPDATE OR DELETE ON public.adaptive_item_calibration_history
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_calibration_history_mutation();

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE & HIGH-CONCURRENCY AGGREGATIONS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_response_evidence_qv_correct
ON public.adaptive_item_response_evidence (question_version_id, is_correct);

CREATE INDEX IF NOT EXISTS idx_response_evidence_recorded_at
ON public.adaptive_item_response_evidence (response_recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_evidence_user
ON public.adaptive_item_response_evidence (user_id);

CREATE INDEX IF NOT EXISTS idx_calibration_history_qv
ON public.adaptive_item_calibration_history (question_version_id, calculated_at DESC);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.adaptive_item_response_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_item_calibration_history ENABLE ROW LEVEL SECURITY;

-- 1. adaptive_item_response_evidence RLS
-- Candidates have NO read or write access directly (server-side only)
-- Service role & Admin full control
DROP POLICY IF EXISTS "Allow service role full access response evidence" ON public.adaptive_item_response_evidence;
CREATE POLICY "Allow service role full access response evidence"
ON public.adaptive_item_response_evidence
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. adaptive_item_calibration_history RLS
-- Candidates have NO access
-- Service role & Admin full control
DROP POLICY IF EXISTS "Allow service role full access calibration history" ON public.adaptive_item_calibration_history;
CREATE POLICY "Allow service role full access calibration history"
ON public.adaptive_item_calibration_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
