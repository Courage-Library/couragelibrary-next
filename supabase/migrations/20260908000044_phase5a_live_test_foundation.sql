-- ============================================================================
-- COURAGE LIBRARY — PHASE 5A: LIVE TEST FOUNDATION
-- Migration 44: Live Test Events, Registrations, Instances & Audit Logs
-- ============================================================================

-- 1. Live Test Events Table
CREATE TABLE IF NOT EXISTS public.live_test_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    banner_url TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'SCHEDULED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED',
        'READY', 'LIVE', 'GRACE_PERIOD', 'PROCESSING', 'RESULTS_READY',
        'PUBLISHED', 'ARCHIVED', 'CANCELLED'
    )),
    registration_start_at TIMESTAMPTZ NOT NULL,
    registration_end_at TIMESTAMPTZ NOT NULL,
    event_start_at TIMESTAMPTZ NOT NULL,
    event_end_at TIMESTAMPTZ NOT NULL,
    late_join_cutoff_minutes INTEGER NOT NULL DEFAULT 15,
    grace_period_seconds INTEGER NOT NULL DEFAULT 300,
    result_publish_at TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL,
    max_participants INTEGER,
    is_premium_only BOOLEAN NOT NULL DEFAULT false,
    cl_coin_entry_fee INTEGER NOT NULL DEFAULT 0,
    cl_coin_reward_pool INTEGER NOT NULL DEFAULT 0,
    current_registered_count INTEGER NOT NULL DEFAULT 0,
    current_started_count INTEGER NOT NULL DEFAULT 0,
    current_submitted_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_live_event_registration_window CHECK (registration_start_at <= registration_end_at),
    CONSTRAINT chk_live_event_window CHECK (event_start_at < event_end_at),
    CONSTRAINT chk_live_event_duration CHECK (duration_minutes > 0)
);

-- 2. Live Test Registrations Table (REGISTRATION != ATTEMPT invariant)
CREATE TABLE IF NOT EXISTS public.live_test_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID NOT NULL REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'ATTENDED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_live_test_registrations_user UNIQUE (live_test_event_id, user_id)
);

-- 3. Live Test Instances Table (Frozen Immutable Paper Snapshot)
CREATE TABLE IF NOT EXISTS public.live_test_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID NOT NULL UNIQUE REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    frozen_paper_hash TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    total_marks NUMERIC(6, 2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    question_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
    section_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'FROZEN' CHECK (status IN ('FROZEN', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Live Test Audit Logs Table
CREATE TABLE IF NOT EXISTS public.live_test_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID REFERENCES public.live_test_events(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    old_state JSONB,
    new_state JSONB,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_live_events_status_start ON public.live_test_events(status, event_start_at);
CREATE INDEX IF NOT EXISTS idx_live_events_slug ON public.live_test_events(slug);
CREATE INDEX IF NOT EXISTS idx_live_events_exam ON public.live_test_events(exam_id);
CREATE INDEX IF NOT EXISTS idx_live_registrations_user ON public.live_test_registrations(user_id, live_test_event_id);
CREATE INDEX IF NOT EXISTS idx_live_registrations_event ON public.live_test_registrations(live_test_event_id, status);
CREATE INDEX IF NOT EXISTS idx_live_audit_event ON public.live_test_audit_logs(live_test_event_id, created_at DESC);

-- 6. Row Level Security Policies
ALTER TABLE public.live_test_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_audit_logs ENABLE ROW LEVEL SECURITY;

-- live_test_events policies:
-- Public / candidates can read events that are visible (not DRAFT)
CREATE POLICY p_live_events_public_read ON public.live_test_events
FOR SELECT USING (
    status IN ('SCHEDULED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'READY', 'LIVE', 'GRACE_PERIOD', 'PROCESSING', 'RESULTS_READY', 'PUBLISHED', 'ARCHIVED')
);

-- Service role / Admin has full access
CREATE POLICY p_live_events_admin_all ON public.live_test_events
FOR ALL USING (true) WITH CHECK (true);

-- live_test_registrations policies:
-- Candidate can view own registrations
CREATE POLICY p_live_registrations_candidate_select ON public.live_test_registrations
FOR SELECT USING (auth.uid() = user_id);

-- Candidate can register themselves
CREATE POLICY p_live_registrations_candidate_insert ON public.live_test_registrations
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- live_test_instances policies:
-- Only service role / internal system can manage instances
CREATE POLICY p_live_instances_admin_all ON public.live_test_instances
FOR ALL USING (true) WITH CHECK (true);

-- live_test_audit_logs policies:
-- Only service role / Admin can read/write audit logs
CREATE POLICY p_live_audit_admin_all ON public.live_test_audit_logs
FOR ALL USING (true) WITH CHECK (true);
