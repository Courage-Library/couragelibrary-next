-- ============================================================================
-- COURAGE LIBRARY — PHASE 3B: TESTING RUNTIME, MOCK TEST ENGINE & SCORING
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- DOMAIN 1: EXAM PATTERNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_cycle_id UUID NOT NULL REFERENCES public.exam_cycles(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    tier_name TEXT NOT NULL DEFAULT 'Tier 1',
    duration_minutes INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    total_marks NUMERIC(6, 2) NOT NULL,
    negative_marking_type TEXT NOT NULL DEFAULT 'fixed' CHECK (negative_marking_type IN ('fixed', 'fractional', 'none')),
    negative_mark_value NUMERIC(4, 2) NOT NULL DEFAULT 0.50,
    passing_marks NUMERIC(6, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_patterns_cycle_tier UNIQUE (exam_cycle_id, tier_name)
);

-- ============================================================================
-- DOMAIN 2: PATTERN SECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pattern_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id UUID NOT NULL REFERENCES public.exam_patterns(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    section_name TEXT NOT NULL,
    section_order INTEGER NOT NULL DEFAULT 1,
    num_questions INTEGER NOT NULL,
    marks_per_question NUMERIC(4, 2) NOT NULL DEFAULT 2.00,
    negative_mark NUMERIC(4, 2) NOT NULL DEFAULT 0.50,
    section_duration_minutes INTEGER,
    is_optional BOOLEAN NOT NULL DEFAULT false,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pattern_sections_pattern_order UNIQUE (pattern_id, section_order)
);

-- ============================================================================
-- DOMAIN 12: PYQ QUESTION SOURCES (NORMALIZED PROVENANCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.question_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    source_type TEXT NOT NULL DEFAULT 'PYQ' CHECK (source_type IN ('PYQ', 'Model_Paper', 'Official_Sample', 'Original')),
    exam_name TEXT NOT NULL,
    year INTEGER NOT NULL,
    shift TEXT,
    paper_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 3: MOCK TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mock_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID NOT NULL REFERENCES public.exam_cycles(id) ON DELETE RESTRICT,
    pattern_id UUID NOT NULL REFERENCES public.exam_patterns(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    test_type TEXT NOT NULL DEFAULT 'full_length' CHECK (test_type IN (
        'daily', 'sectional', 'full_length', 'pyq_shift', 'topic_test', 'custom_practice', 'pro_mock'
    )),
    description TEXT,
    is_free BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 4: MOCK TESTS (PUBLISHED TEST INSTANCES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mock_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.mock_templates(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
    duration_minutes INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    total_marks NUMERIC(6, 2) NOT NULL,
    is_free BOOLEAN NOT NULL DEFAULT true,
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 5: MOCK SECTIONS (FROZEN SECTION BLUEPRINTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mock_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    section_name TEXT NOT NULL,
    section_order INTEGER NOT NULL DEFAULT 1,
    num_questions INTEGER NOT NULL,
    marks_per_question NUMERIC(4, 2) NOT NULL DEFAULT 2.00,
    negative_mark NUMERIC(4, 2) NOT NULL DEFAULT 0.50,
    duration_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mock_sections_order UNIQUE (mock_test_id, section_order)
);

-- ============================================================================
-- DOMAIN 6: MOCK QUESTIONS (IMMUTABLE QUESTION VERSION SNAPSHOT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mock_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    mock_section_id UUID NOT NULL REFERENCES public.mock_sections(id) ON DELETE RESTRICT,
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    question_order INTEGER NOT NULL,
    marks NUMERIC(4, 2) NOT NULL DEFAULT 2.00,
    negative_mark NUMERIC(4, 2) NOT NULL DEFAULT 0.50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mock_questions_test_order UNIQUE (mock_test_id, question_order)
);

-- ============================================================================
-- DOMAIN 7: TEST ATTEMPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.test_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    time_taken_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN (
        'in_progress', 'submitted', 'auto_submitted', 'abandoned', 'invalidated'
    )),
    client_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 8: ATTEMPT ANSWERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attempt_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
    mock_question_id UUID NOT NULL REFERENCES public.mock_questions(id) ON DELETE RESTRICT,
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    selected_option_key TEXT CHECK (selected_option_key IN ('A', 'B', 'C', 'D')),
    is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    is_correct BOOLEAN,
    evaluated_marks NUMERIC(4, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_attempt_answers_attempt_question UNIQUE (attempt_id, mock_question_id)
);

-- ============================================================================
-- DOMAIN 10: TEST RESULTS (SERVER-EVALUATED IMMUTABLE RESULTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL UNIQUE REFERENCES public.test_attempts(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
    total_questions INTEGER NOT NULL,
    attempted_count INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    unanswered_count INTEGER NOT NULL,
    total_score NUMERIC(6, 2) NOT NULL,
    max_score NUMERIC(6, 2) NOT NULL,
    accuracy_percentage NUMERIC(5, 2) NOT NULL,
    time_spent_seconds INTEGER NOT NULL,
    rank INTEGER,
    percentile NUMERIC(5, 2),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 11: SECTION RESULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.section_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_result_id UUID NOT NULL REFERENCES public.test_results(id) ON DELETE CASCADE,
    mock_section_id UUID NOT NULL REFERENCES public.mock_sections(id) ON DELETE RESTRICT,
    total_questions INTEGER NOT NULL,
    attempted_count INTEGER NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    unanswered_count INTEGER NOT NULL,
    section_score NUMERIC(6, 2) NOT NULL,
    max_section_score NUMERIC(6, 2) NOT NULL,
    accuracy_percentage NUMERIC(5, 2) NOT NULL,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_section_results_test_section UNIQUE (test_result_id, mock_section_id)
);

-- ============================================================================
-- INDEXES & PERFORMANCE OPTIMIZATIONS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_exam_patterns_cycle ON public.exam_patterns(exam_cycle_id);
CREATE INDEX IF NOT EXISTS idx_pattern_sections_pattern ON public.pattern_sections(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_sections_subject ON public.pattern_sections(subject_id);
CREATE INDEX IF NOT EXISTS idx_question_sources_qid ON public.question_sources(question_id);
CREATE INDEX IF NOT EXISTS idx_question_sources_exam_year ON public.question_sources(exam_name, year);

CREATE INDEX IF NOT EXISTS idx_mock_templates_exam ON public.mock_templates(exam_id);
CREATE INDEX IF NOT EXISTS idx_mock_templates_cycle ON public.mock_templates(exam_cycle_id);
CREATE INDEX IF NOT EXISTS idx_mock_templates_type ON public.mock_templates(test_type);

CREATE INDEX IF NOT EXISTS idx_mock_tests_template ON public.mock_tests(template_id);
CREATE INDEX IF NOT EXISTS idx_mock_tests_status ON public.mock_tests(status);
CREATE INDEX IF NOT EXISTS idx_mock_tests_scheduled ON public.mock_tests(scheduled_for);

CREATE INDEX IF NOT EXISTS idx_mock_sections_test ON public.mock_sections(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_questions_test ON public.mock_questions(mock_test_id);
CREATE INDEX IF NOT EXISTS idx_mock_questions_section ON public.mock_questions(mock_section_id);
CREATE INDEX IF NOT EXISTS idx_mock_questions_qversion ON public.mock_questions(question_version_id);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON public.test_attempts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_attempts_mock ON public.test_attempts(mock_test_id, status);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON public.attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_qversion ON public.attempt_answers(question_version_id);

CREATE INDEX IF NOT EXISTS idx_test_results_user ON public.test_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_mock ON public.test_results(mock_test_id, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_section_results_result ON public.section_results(test_result_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.exam_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_results ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policies for Published Mock Metadata & Blueprints
CREATE POLICY "Public read exam_patterns" ON public.exam_patterns
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read pattern_sections" ON public.pattern_sections
    FOR SELECT USING (true);

CREATE POLICY "Public read question_sources" ON public.question_sources
    FOR SELECT USING (true);

CREATE POLICY "Public read mock_templates" ON public.mock_templates
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read published mock_tests" ON public.mock_tests
    FOR SELECT USING (status = 'published');

CREATE POLICY "Public read mock_sections" ON public.mock_sections
    FOR SELECT USING (true);

CREATE POLICY "Public read mock_questions" ON public.mock_questions
    FOR SELECT USING (true);

-- 2. Student Test Attempts Policies (Own User Only)
CREATE POLICY "Users can create own attempts" ON public.test_attempts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own attempts" ON public.test_attempts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own in-progress attempts" ON public.test_attempts
    FOR UPDATE USING (auth.uid() = user_id AND status = 'in_progress');

-- 3. Student Attempt Answers Policies (Own User Only)
CREATE POLICY "Users can insert own attempt answers" ON public.attempt_answers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.test_attempts
            WHERE id = attempt_id AND user_id = auth.uid() AND status = 'in_progress'
        )
    );

CREATE POLICY "Users can update own attempt answers" ON public.attempt_answers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.test_attempts
            WHERE id = attempt_id AND user_id = auth.uid() AND status = 'in_progress'
        )
    );

CREATE POLICY "Users can read own attempt answers" ON public.attempt_answers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.test_attempts
            WHERE id = attempt_id AND user_id = auth.uid()
        )
    );

-- 4. Test Results Policies (Own User Read + Public Percentiles)
CREATE POLICY "Users can read own test results" ON public.test_results
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own section results" ON public.section_results
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.test_results
            WHERE id = test_result_id AND user_id = auth.uid()
        )
    );

-- Note: Inserting into test_results & section_results is restricted to service_role / trusted server actions.
