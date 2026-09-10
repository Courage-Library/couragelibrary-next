-- ============================================================================
-- Courage Library — Phase 5E.6.2: Exam & Question Quality Psychometrics
-- Migration: 20260910000051_phase5e6_psychometrics_foundation.sql
--
-- Safety & Invariant Guarantees:
-- 1. 100% Additive & Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- 2. Zero mutation / deletion / truncation of existing rows
-- 3. Strict population isolation (Fixed Mock vs Live vs PYQ vs Adaptive CAT)
-- 4. Immutable psychometric snapshot ledgers with prevention triggers
-- 5. Preserves production baseline row counts across all 14 core tables
-- ============================================================================

-- ============================================================================
-- 1. EXTEND ADAPTIVE ITEM CALIBRATIONS (ADDITIVE PSYCHOMETRIC COLUMNS)
-- ============================================================================

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS population VARCHAR(50) NOT NULL DEFAULT 'POP_AGGREGATE_ALL';

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS facility_p DOUBLE PRECISION;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS empirical_difficulty_d DOUBLE PRECISION;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS discrimination_pbis DOUBLE PRECISION;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS omission_rate DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER DEFAULT 0;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS distractor_metrics JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS standard_error_b DOUBLE PRECISION;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS confidence_interval_95 JSONB;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS policy_version VARCHAR(50) NOT NULL DEFAULT 'PSYCHOMETRIC_POLICY_V1';

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS model_version VARCHAR(50) NOT NULL DEFAULT '1PL_RASCH_V1';

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS evidence_watermark VARCHAR(100);

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS evidence_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS iterations_count INTEGER DEFAULT 0;

ALTER TABLE public.adaptive_item_calibrations
ADD COLUMN IF NOT EXISTS is_converged BOOLEAN DEFAULT true;

-- Add index on question_version_id and population
CREATE INDEX IF NOT EXISTS idx_adaptive_item_calibrations_qv_pop
ON public.adaptive_item_calibrations (question_version_id, population);

-- ============================================================================
-- 2. ITEM PSYCHOMETRIC SNAPSHOTS (IMMUTABLE HISTORICAL CALIBRATION LEDGER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.item_psychometric_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    population VARCHAR(50) NOT NULL DEFAULT 'POP_AGGREGATE_ALL',
    state VARCHAR(30) NOT NULL DEFAULT 'CALIBRATED',
    facility_p DOUBLE PRECISION,
    difficulty_b DOUBLE PRECISION,
    discrimination_pbis DOUBLE PRECISION,
    distractor_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
    quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    sample_size INTEGER NOT NULL DEFAULT 0,
    uncertainty JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_version VARCHAR(50) NOT NULL DEFAULT '1PL_RASCH_V1',
    policy_version VARCHAR(50) NOT NULL DEFAULT 'PSYCHOMETRIC_POLICY_V1',
    evidence_watermark VARCHAR(100),
    evidence_range JSONB,
    scoring_semantics JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_item_snapshot_population CHECK (
        population IN ('POP_FIXED_MOCK', 'POP_LIVE_COMPETITION', 'POP_OFFICIAL_PYQ', 'POP_ADAPTIVE_CAT', 'POP_AGGREGATE_ALL')
    ),
    CONSTRAINT chk_item_snapshot_state CHECK (
        state IN ('UNCALIBRATED', 'INSUFFICIENT_DATA', 'PROVISIONAL', 'CALIBRATED', 'UNSTABLE', 'DEPRECATED')
    ),
    CONSTRAINT chk_item_snapshot_sample_size CHECK (sample_size >= 0)
);

-- Immutability trigger on item_psychometric_snapshots
CREATE OR REPLACE FUNCTION public.fn_prevent_item_psychometric_snapshots_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'item_psychometric_snapshots records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_item_psychometric_snapshots_mutation ON public.item_psychometric_snapshots;
CREATE TRIGGER trg_prevent_item_psychometric_snapshots_mutation
BEFORE UPDATE OR DELETE ON public.item_psychometric_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_item_psychometric_snapshots_mutation();

CREATE INDEX IF NOT EXISTS idx_item_psychometric_snapshots_qv_pop
ON public.item_psychometric_snapshots (question_version_id, population, snapshot_at DESC);

-- ============================================================================
-- 3. TEST PSYCHOMETRIC SNAPSHOTS (PAPER & SECTION RELIABILITY LEDGER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.test_psychometric_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
    population VARCHAR(50) NOT NULL DEFAULT 'POP_FIXED_MOCK',
    sample_size INTEGER NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 0,
    cronbach_alpha DOUBLE PRECISION,
    standard_error_of_measurement DOUBLE PRECISION,
    total_score_variance DOUBLE PRECISION,
    sum_item_variances DOUBLE PRECISION,
    section_reliabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    mcdonald_omega_research DOUBLE PRECISION,
    mean_facility_p DOUBLE PRECISION,
    mean_discrimination_pbis DOUBLE PRECISION,
    flagged_items_count INTEGER NOT NULL DEFAULT 0,
    flag_density_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    items_roster JSONB NOT NULL DEFAULT '[]'::jsonb,
    policy_version VARCHAR(50) NOT NULL DEFAULT 'PSYCHOMETRIC_POLICY_V1',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_test_snapshot_population CHECK (
        population IN ('POP_FIXED_MOCK', 'POP_LIVE_COMPETITION', 'POP_OFFICIAL_PYQ', 'POP_ADAPTIVE_CAT', 'POP_AGGREGATE_ALL')
    ),
    CONSTRAINT chk_test_snapshot_sample_size CHECK (sample_size >= 0),
    CONSTRAINT chk_test_snapshot_item_count CHECK (item_count >= 0)
);

-- Immutability trigger on test_psychometric_snapshots
CREATE OR REPLACE FUNCTION public.fn_prevent_test_psychometric_snapshots_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'test_psychometric_snapshots records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_test_psychometric_snapshots_mutation ON public.test_psychometric_snapshots;
CREATE TRIGGER trg_prevent_test_psychometric_snapshots_mutation
BEFORE UPDATE OR DELETE ON public.test_psychometric_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_test_psychometric_snapshots_mutation();

CREATE INDEX IF NOT EXISTS idx_test_psychometric_snapshots_test_calc
ON public.test_psychometric_snapshots (mock_test_id, calculated_at DESC);

-- ============================================================================
-- 4. PSYCHOMETRIC REVIEW QUEUE (ADMIN QUALITY DIAGNOSTIC REGISTRY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.psychometric_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    population VARCHAR(50) NOT NULL DEFAULT 'POP_AGGREGATE_ALL',
    flag_key VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    metric_name VARCHAR(50) NOT NULL,
    observed_value DOUBLE PRECISION NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    evidence_count INTEGER NOT NULL DEFAULT 0,
    uncertainty JSONB NOT NULL DEFAULT '{}'::jsonb,
    flag_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
    resolution_action VARCHAR(50),
    resolution_reason TEXT,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_review_queue_qv_pop_flag UNIQUE (question_version_id, population, flag_key),
    CONSTRAINT chk_review_queue_severity CHECK (
        severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),
    CONSTRAINT chk_review_queue_status CHECK (
        review_status IN ('PENDING_REVIEW', 'IN_REVIEW', 'DISMISSED', 'RESOLVED_DEPRECATED', 'RESOLVED_NEW_VERSION')
    )
);

CREATE INDEX IF NOT EXISTS idx_psychometric_review_queue_status_severity
ON public.psychometric_review_queue (review_status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_psychometric_review_queue_qv
ON public.psychometric_review_queue (question_version_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.item_psychometric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_psychometric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychometric_review_queue ENABLE ROW LEVEL SECURITY;

-- 1. item_psychometric_snapshots RLS (Admin & Service Role only)
DROP POLICY IF EXISTS "Allow service role full access item psychometric snapshots" ON public.item_psychometric_snapshots;
CREATE POLICY "Allow service role full access item psychometric snapshots"
ON public.item_psychometric_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. test_psychometric_snapshots RLS (Admin & Service Role only)
DROP POLICY IF EXISTS "Allow service role full access test psychometric snapshots" ON public.test_psychometric_snapshots;
CREATE POLICY "Allow service role full access test psychometric snapshots"
ON public.test_psychometric_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. psychometric_review_queue RLS (Admin & Service Role only)
DROP POLICY IF EXISTS "Allow service role full access psychometric review queue" ON public.psychometric_review_queue;
CREATE POLICY "Allow service role full access psychometric review queue"
ON public.psychometric_review_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
