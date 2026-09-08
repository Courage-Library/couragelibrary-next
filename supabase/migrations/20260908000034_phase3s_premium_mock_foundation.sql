-- ============================================================================
-- COURAGE LIBRARY — PHASE 3S: PREMIUM MOCK TEST ECOSYSTEM DATABASE FOUNDATION
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLE: test_series (LIGHTWEIGHT ORGANIZATIONAL GROUPING CONTAINER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.test_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(title) <= 200),
    series_type TEXT NOT NULL DEFAULT 'FULL_LENGTH' CHECK (
        series_type IN ('FULL_LENGTH', 'PYQ', 'SECTIONAL', 'TOPIC', 'CHALLENGE')
    ),
    is_premium BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes on test_series
CREATE INDEX IF NOT EXISTS idx_test_series_exam_type 
    ON public.test_series (exam_id, series_type, is_active);

CREATE INDEX IF NOT EXISTS idx_test_series_display_order 
    ON public.test_series (display_order);

-- Enable RLS on test_series
ALTER TABLE public.test_series ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public read for active test series
DROP POLICY IF EXISTS "Public read active test series" ON public.test_series;
CREATE POLICY "Public read active test series"
    ON public.test_series FOR SELECT
    USING (is_active = true);

-- Role Grants on test_series
GRANT SELECT ON public.test_series TO anon, authenticated;
GRANT ALL ON public.test_series TO service_role;

-- ============================================================================
-- 2. EXTEND EXISTING TABLE: mock_tests (ADDITIVE PREMIUM & DYNAMIC COLUMNS)
-- ============================================================================

ALTER TABLE public.mock_tests
    ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.test_series(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_dynamic BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_for_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (
        lifecycle_status IN ('GENERATED', 'NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'ARCHIVED', 'PUBLISHED')
    ),
    ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Performance Indexes on mock_tests
CREATE INDEX IF NOT EXISTS idx_mock_tests_series_id 
    ON public.mock_tests (series_id) 
    WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mock_tests_user_dynamic 
    ON public.mock_tests (created_for_user_id, is_dynamic) 
    WHERE is_dynamic = true;

CREATE INDEX IF NOT EXISTS idx_mock_tests_dynamic_cleanup 
    ON public.mock_tests (lifecycle_status, expires_at) 
    WHERE is_dynamic = true AND lifecycle_status = 'GENERATED';

-- Hardened RLS Policies for mock_tests
-- Preserves existing shared published tests while granting candidates access to their own dynamic tests
DROP POLICY IF EXISTS "Public read published or own dynamic mock tests" ON public.mock_tests;
CREATE POLICY "Public read published or own dynamic mock tests"
    ON public.mock_tests FOR SELECT
    USING (
        (is_dynamic = false AND status = 'published') 
        OR 
        (is_dynamic = true AND created_for_user_id = auth.uid())
    );

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
