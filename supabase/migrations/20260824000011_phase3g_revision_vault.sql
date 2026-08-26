-- ============================================================================
-- COURAGE LIBRARY — PHASE 3G: REVISION VAULT, BOOKMARKS, PRACTICE & ERRATA
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. USER BOOKMARK FOLDERS (COLLECTIONS & TAGS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_bookmark_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
    slug TEXT NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#3B82F6' CHECK (color_hex ~* '^#[0-9A-F]{6}$'),
    icon_name TEXT DEFAULT 'folder',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_folder_name UNIQUE (user_id, name)
);

-- ============================================================================
-- 2. USER QUESTION BOOKMARKS (DUAL-KEY QUESTION ANCHOR)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_question_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    folder_id UUID REFERENCES public.user_bookmark_folders(id) ON DELETE SET NULL,
    tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    personal_note TEXT CHECK (length(personal_note) <= 2000),
    source_attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_question_bookmark UNIQUE (user_id, question_id)
);

-- ============================================================================
-- 3. CUSTOM PRACTICE SESSIONS (FROZEN PRACTICE SNAPSHOT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.custom_practice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    session_mode TEXT NOT NULL CHECK (session_mode IN ('BOOKMARKED', 'WRONG_QUESTIONS', 'WEAK_TOPICS', 'FORGOTTEN_TOPICS', 'PYQ', 'MIXED', 'MANUAL_SELECTION')),
    target_topic_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_questions INTEGER NOT NULL CHECK (total_questions > 0 AND total_questions <= 100),
    question_version_ids_json JSONB NOT NULL,
    test_attempt_id UUID UNIQUE REFERENCES public.test_attempts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'READY', 'ACTIVE', 'SUBMITTED', 'ABANDONED')),
    score NUMERIC(6,2),
    accuracy_pct NUMERIC(5,2) CHECK (accuracy_pct >= 0.00 AND accuracy_pct <= 100.00),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- 4. QUESTION ERRATA REPORTS (FEEDBACK & BOUNTY TICKETS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.question_errata_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    issue_type TEXT NOT NULL CHECK (issue_type IN ('INCORRECT_ANSWER', 'QUESTION_TEXT_ERROR', 'TYPO', 'AMBIGUOUS', 'OUTDATED_INFORMATION', 'DUPLICATE', 'INCORRECT_EXPLANATION', 'FORMATTING', 'OTHER')),
    description TEXT NOT NULL CHECK (length(description) >= 10 AND length(description) <= 3000),
    suggested_fix TEXT CHECK (length(suggested_fix) <= 3000),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'VERIFIED', 'RESOLVED', 'REJECTED')),
    reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    reward_coins_granted INTEGER NOT NULL DEFAULT 0 CHECK (reward_coins_granted >= 0),
    gamification_event_id UUID REFERENCES public.gamification_events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_errata_active_report 
ON public.question_errata_reports(reporter_user_id, question_id, issue_type) 
WHERE status IN ('OPEN', 'UNDER_REVIEW');

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ubf_user ON public.user_bookmark_folders(user_id, display_order);
CREATE INDEX IF NOT EXISTS idx_uqb_user_folder ON public.user_question_bookmarks(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_uqb_question_version ON public.user_question_bookmarks(question_version_id);

CREATE INDEX IF NOT EXISTS idx_cps_user_status ON public.custom_practice_sessions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qer_question ON public.question_errata_reports(question_id, status);
CREATE INDEX IF NOT EXISTS idx_qer_reporter ON public.question_errata_reports(reporter_user_id, status);
CREATE INDEX IF NOT EXISTS idx_qer_staff_queue ON public.question_errata_reports(status, created_at) WHERE status IN ('OPEN', 'UNDER_REVIEW');

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.user_bookmark_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_question_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_errata_reports ENABLE ROW LEVEL SECURITY;

-- 1. Bookmark Folders
CREATE POLICY "Users can CRUD own bookmark folders" ON public.user_bookmark_folders
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Question Bookmarks
CREATE POLICY "Users can CRUD own bookmarks" ON public.user_question_bookmarks
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Custom Practice Sessions
CREATE POLICY "Users can CRUD own practice sessions" ON public.custom_practice_sessions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Errata Reports (Students read/insert own; Staff updates)
CREATE POLICY "Users can read own errata reports" ON public.question_errata_reports
    FOR SELECT USING (auth.uid() = reporter_user_id);

CREATE POLICY "Users can create errata reports" ON public.question_errata_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

-- Role Grants
GRANT ALL ON public.user_bookmark_folders TO authenticated;
GRANT ALL ON public.user_question_bookmarks TO authenticated;
GRANT ALL ON public.custom_practice_sessions TO authenticated;
GRANT SELECT, INSERT ON public.question_errata_reports TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
