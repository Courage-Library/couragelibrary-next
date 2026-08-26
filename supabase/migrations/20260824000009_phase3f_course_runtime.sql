-- ============================================================================
-- COURAGE LIBRARY — PHASE 3F: COURSE RUNTIME, LESSON PLAYER & ENTITLEMENT ENGINE
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. USER COURSE PROGRESS (DERIVED / AGGREGATED COURSE STATE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_course_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    total_lessons INTEGER NOT NULL DEFAULT 0 CHECK (total_lessons >= 0),
    completed_lessons INTEGER NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),
    progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (progress_pct >= 0.00 AND progress_pct <= 100.00),
    last_lesson_id UUID REFERENCES public.course_lessons(id) ON DELETE SET NULL,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_course_progress UNIQUE (user_id, course_id)
);

-- ============================================================================
-- 2. USER LESSON COMPLETIONS (LESSON RUNTIME SOURCE OF TRUTH)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_lesson_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
    playback_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (playback_position_seconds >= 0),
    max_watched_seconds INTEGER NOT NULL DEFAULT 0 CHECK (max_watched_seconds >= 0),
    verified_seconds_spent INTEGER NOT NULL DEFAULT 0 CHECK (verified_seconds_spent >= 0),
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    session_attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (session_attempt_count > 0),
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_lesson_completion UNIQUE (user_id, lesson_id)
);

-- ============================================================================
-- 3. USER LESSON NOTES (STUDENT PERSONAL ANNOTATIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_lesson_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
    note_md TEXT NOT NULL CHECK (length(note_md) <= 10000),
    timestamp_seconds INTEGER CHECK (timestamp_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ucp_user_course ON public.user_course_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_ucp_last_accessed ON public.user_course_progress(user_id, last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ulc_user_lesson ON public.user_lesson_completions(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_ulc_user_course ON public.user_lesson_completions(user_id, course_id, is_completed);

CREATE INDEX IF NOT EXISTS idx_uln_user_lesson ON public.user_lesson_notes(user_id, lesson_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.user_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lesson_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lesson_notes ENABLE ROW LEVEL SECURITY;

-- 1. Read-Only Policies for Progress & Completion
CREATE POLICY "Users can read own course progress" ON public.user_course_progress
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own lesson completions" ON public.user_lesson_completions
    FOR SELECT USING (auth.uid() = user_id);

-- 2. CRUD Policies for Personal Notes
CREATE POLICY "Users can read own notes" ON public.user_lesson_notes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notes" ON public.user_lesson_notes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes" ON public.user_lesson_notes
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes" ON public.user_lesson_notes
    FOR DELETE USING (auth.uid() = user_id);

-- Grants
GRANT SELECT ON public.user_course_progress TO authenticated;
GRANT SELECT ON public.user_lesson_completions TO authenticated;
GRANT ALL ON public.user_lesson_notes TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
