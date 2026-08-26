-- ============================================================================
-- COURAGE LIBRARY — PHASE 3A: CORE FOUNDATION SCHEMA MIGRATION
-- Target Database: couragelibrary-next
-- Description: Core taxonomy, identity, exam blueprints, syllabi, questions & versioning.
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DOMAIN 1: IDENTITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    language_preference TEXT NOT NULL DEFAULT 'en' CHECK (language_preference IN ('en', 'hi')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 2: CONDUCTING ORGANIZATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conducting_orgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    official_website TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 3: EXAMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.conducting_orgs(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 4: EXAM CYCLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    cycle_year INTEGER NOT NULL,
    notification_date DATE,
    application_start_date DATE,
    application_end_date DATE,
    exam_window_start DATE,
    exam_window_end DATE,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_cycles_year UNIQUE (exam_id, cycle_year)
);

-- ============================================================================
-- DOMAIN 5: KNOWLEDGE TAXONOMY (SUBJECTS -> TOPICS -> SUBTOPICS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    importance_level TEXT NOT NULL DEFAULT 'medium' CHECK (importance_level IN ('high', 'medium', 'low')),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_topics_subject_name UNIQUE (subject_id, name)
);

CREATE TABLE IF NOT EXISTS public.subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_subtopics_topic_name UNIQUE (topic_id, name)
);

-- ============================================================================
-- DOMAIN 6: EXAM SYLLABUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_syllabi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_cycle_id UUID NOT NULL REFERENCES public.exam_cycles(id) ON DELETE RESTRICT,
    version_tag TEXT NOT NULL DEFAULT 'official',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_syllabi_cycle_version UNIQUE (exam_cycle_id, version_tag)
);

CREATE TABLE IF NOT EXISTS public.exam_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_id UUID NOT NULL REFERENCES public.exam_syllabi(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    weightage_level TEXT NOT NULL DEFAULT 'medium' CHECK (weightage_level IN ('high', 'medium', 'low')),
    expected_questions INTEGER DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_topics_syllabus_topic UNIQUE (syllabus_id, topic_id)
);

-- ============================================================================
-- DOMAIN 7 & 8: QUESTIONS & IMMUTABLE QUESTION VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL DEFAULT 1,
    question_text TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
    options_type TEXT NOT NULL DEFAULT 'text' CHECK (options_type IN ('text', 'image')),
    question_image_url TEXT,
    is_current BOOLEAN NOT NULL DEFAULT true,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_question_versions_num UNIQUE (question_id, version_number)
);

-- ============================================================================
-- DOMAIN 9: QUESTION OPTIONS (PUBLIC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    option_key TEXT NOT NULL CHECK (option_key IN ('A', 'B', 'C', 'D')),
    option_text TEXT NOT NULL,
    option_image_url TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_question_options_key UNIQUE (question_version_id, option_key)
);

-- ============================================================================
-- DOMAIN 10: SERVER-ONLY QUESTION ANSWERS (RESTRICTED)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.question_answers (
    question_version_id UUID PRIMARY KEY REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    correct_option_key TEXT NOT NULL CHECK (correct_option_key IN ('A', 'B', 'C', 'D')),
    explanation_md TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 11: EXAM ↔ QUESTION APPLICABILITY (N:M JUNCTION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_question_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    relevance_score NUMERIC(3, 2) DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_question_mappings UNIQUE (exam_id, question_id)
);

-- ============================================================================
-- INDEXES & PERFORMANCE OPTIMIZATION
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_exams_org_id ON public.exams(org_id);
CREATE INDEX IF NOT EXISTS idx_exams_slug ON public.exams(slug);
CREATE INDEX IF NOT EXISTS idx_exam_cycles_exam_id ON public.exam_cycles(exam_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject_id ON public.topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_slug ON public.topics(slug);
CREATE INDEX IF NOT EXISTS idx_subtopics_topic_id ON public.subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_exam_syllabi_cycle ON public.exam_syllabi(exam_cycle_id);
CREATE INDEX IF NOT EXISTS idx_exam_topics_syllabus ON public.exam_topics(syllabus_id);
CREATE INDEX IF NOT EXISTS idx_exam_topics_topic ON public.exam_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON public.questions(canonical_topic_id);
CREATE INDEX IF NOT EXISTS idx_question_versions_qid ON public.question_versions(question_id);
CREATE INDEX IF NOT EXISTS idx_question_versions_current ON public.question_versions(question_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_question_options_version ON public.question_options(question_version_id);
CREATE INDEX IF NOT EXISTS idx_exam_question_mappings_exam ON public.exam_question_mappings(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_question_mappings_question ON public.exam_question_mappings(question_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all Phase 3A tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conducting_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_syllabi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_question_mappings ENABLE ROW LEVEL SECURITY;

-- 1. user_profiles: Users can read and update their own profile
CREATE POLICY "Users can read own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Public Read Policies for Taxonomy & Published Metadata
CREATE POLICY "Public read conducting_orgs" ON public.conducting_orgs
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read exams" ON public.exams
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read exam_cycles" ON public.exam_cycles
    FOR SELECT USING (status != 'archived');

CREATE POLICY "Public read subjects" ON public.subjects
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read topics" ON public.topics
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read subtopics" ON public.subtopics
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read exam_syllabi" ON public.exam_syllabi
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read exam_topics" ON public.exam_topics
    FOR SELECT USING (true);

-- 3. Questions & Options: Read published question content only
CREATE POLICY "Public read published questions" ON public.questions
    FOR SELECT USING (status = 'published');

CREATE POLICY "Public read published question versions" ON public.question_versions
    FOR SELECT USING (published_at IS NOT NULL);

CREATE POLICY "Public read question options" ON public.question_options
    FOR SELECT USING (true);

CREATE POLICY "Public read exam question mappings" ON public.exam_question_mappings
    FOR SELECT USING (true);

-- 4. CRITICAL: question_answers has NO public SELECT policy!
-- Only service_role (trusted server functions) and future administrators can access answer keys.
-- Zero public student queries can read correct answers.
