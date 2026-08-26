-- ============================================================================
-- COURAGE LIBRARY — PHASE 3E: CONTENT MANAGEMENT, ARTICLES, COURSES & PYQ SCHEMA
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. EXTEND EXISTING TABLE: question_sources
-- ============================================================================

ALTER TABLE public.question_sources
    ADD COLUMN IF NOT EXISTS tier_stage TEXT,
    ADD COLUMN IF NOT EXISTS question_number INTEGER,
    ADD COLUMN IF NOT EXISTS exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_url TEXT;

-- ============================================================================
-- 2. UNIVERSAL LEARNING RESOURCES (CENTRAL CONTENT CATALOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learning_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type TEXT NOT NULL CHECK (resource_type IN ('ARTICLE','COURSE_LESSON','REVISION_NOTE','FORMULA_SHEET','VIDEO','PDF_BRIEF','CURRENT_AFFAIRS')),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    access_level TEXT NOT NULL DEFAULT 'FREE' CHECK (access_level IN ('FREE','PRO','PAID_COURSE')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
    estimated_study_seconds INTEGER NOT NULL DEFAULT 300 CHECK (estimated_study_seconds >= 0),
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. LEARNING RESOURCE TOPICS (MANY-TO-MANY WITH PRIMARY INVARIANT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learning_resource_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_resource_id UUID NOT NULL REFERENCES public.learning_resources(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE SET NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    relevance_score NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (relevance_score >= 0.00 AND relevance_score <= 1.00),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lrt_resource_topic UNIQUE (learning_resource_id, topic_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lrt_primary_per_resource 
ON public.learning_resource_topics(learning_resource_id) WHERE is_primary = true;

-- ============================================================================
-- 4. ARTICLES (EDITORIAL CONTAINER & SEO ANCHOR)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_resource_id UUID NOT NULL UNIQUE REFERENCES public.learning_resources(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    meta_title TEXT,
    meta_description TEXT,
    canonical_url TEXT,
    og_image_url TEXT,
    excerpt TEXT,
    featured_image_url TEXT,
    reading_time_minutes INTEGER NOT NULL DEFAULT 5 CHECK (reading_time_minutes > 0),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. ARTICLE VERSIONS (IMMUTABLE CONTENT HISTORY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
    content_format TEXT NOT NULL DEFAULT 'MARKDOWN' CHECK (content_format IN ('MARKDOWN','HTML')),
    content_body TEXT NOT NULL,
    changelog TEXT,
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_article_versions_num UNIQUE (article_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_versions_current 
ON public.article_versions(article_id) WHERE is_current = true;

-- ============================================================================
-- 6. COURSES (STRUCTURED SELF-PACED LEARNING CONTAINER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    thumbnail_url TEXT,
    access_tier TEXT NOT NULL DEFAULT 'PRO' CHECK (access_tier IN ('FREE','PRO','PAID')),
    price_inr NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (price_inr >= 0.00),
    is_published BOOLEAN NOT NULL DEFAULT false,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. COURSE MODULES (CHAPTERS / UNITS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. COURSE LESSONS (INDIVIDUAL UNITS LINKED TO LEARNING RESOURCES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
    learning_resource_id UUID UNIQUE REFERENCES public.learning_resources(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    lesson_type TEXT NOT NULL DEFAULT 'VIDEO' CHECK (lesson_type IN ('VIDEO','TEXT','QUIZ')),
    video_url TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    is_free_preview BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_module_lesson_order UNIQUE (module_id, display_order)
);

-- ============================================================================
-- 9. CURRENT AFFAIRS ARTICLES (DATED NEWS BRIEFS WITH TAKEAWAYS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_resource_id UUID UNIQUE REFERENCES public.learning_resources(id) ON DELETE SET NULL,
    news_date DATE NOT NULL,
    headline TEXT NOT NULL,
    summary_md TEXT NOT NULL,
    key_takeaways_json JSONB DEFAULT '[]'::jsonb,
    category TEXT NOT NULL DEFAULT 'NATIONAL' CHECK (category IN ('NATIONAL','INTERNATIONAL','ECONOMY','DEFENCE','SCIENCE','SPORTS','AWARDS','OBITUARY','STATE')),
    source_name TEXT,
    source_url TEXT,
    daily_quiz_mock_id UUID REFERENCES public.mock_tests(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. USER ENTITLEMENTS (CENTRAL ACCESS CONTROL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entitlement_type TEXT NOT NULL CHECK (entitlement_type IN ('PRO_SUBSCRIPTION','COURSE_PURCHASE','PROMOTIONAL_PASS')),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_entitlement_dates CHECK (expires_at IS NULL OR expires_at > starts_at),
    CONSTRAINT chk_entitlement_scope CHECK (
        (entitlement_type = 'COURSE_PURCHASE' AND course_id IS NOT NULL AND exam_id IS NULL) OR
        (entitlement_type = 'PRO_SUBSCRIPTION' AND course_id IS NULL) OR
        (entitlement_type = 'PROMOTIONAL_PASS' AND course_id IS NULL)
    )
);

-- ============================================================================
-- 11. REDIRECT ROUTES (SEO 301 PERMANENT REDIRECTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.redirect_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_path TEXT NOT NULL UNIQUE,
    destination_path TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308)),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_redirect_no_self_reference CHECK (source_path != destination_path)
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_learning_resources_type ON public.learning_resources(resource_type, status);
CREATE INDEX IF NOT EXISTS idx_learning_resources_author ON public.learning_resources(author_id);

CREATE INDEX IF NOT EXISTS idx_lrt_topic_lookup ON public.learning_resource_topics(topic_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_lrt_resource_lookup ON public.learning_resource_topics(learning_resource_id);

CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_versions_article ON public.article_versions(article_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_courses_published ON public.courses(is_published, access_tier);
CREATE INDEX IF NOT EXISTS idx_course_modules_course ON public.course_modules(course_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON public.course_lessons(module_id, display_order);

CREATE INDEX IF NOT EXISTS idx_ca_articles_date ON public.current_affairs_articles(news_date DESC, category);
CREATE INDEX IF NOT EXISTS idx_ca_articles_quiz ON public.current_affairs_articles(daily_quiz_mock_id);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_lookup ON public.user_entitlements(user_id, entitlement_type, is_active);
CREATE INDEX IF NOT EXISTS idx_redirect_routes_source ON public.redirect_routes(source_path) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_question_sources_exam_year ON public.question_sources(exam_name, year, shift);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_resource_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redirect_routes ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policies for Published Educational Content
CREATE POLICY "Public read published learning resources" ON public.learning_resources
    FOR SELECT USING (status = 'PUBLISHED');

CREATE POLICY "Public read learning resource topics" ON public.learning_resource_topics
    FOR SELECT USING (true);

CREATE POLICY "Public read published articles" ON public.articles
    FOR SELECT USING (status = 'PUBLISHED');

CREATE POLICY "Public read current article versions" ON public.article_versions
    FOR SELECT USING (is_current = true);

CREATE POLICY "Public read published courses" ON public.courses
    FOR SELECT USING (is_published = true);

CREATE POLICY "Public read published course modules" ON public.course_modules
    FOR SELECT USING (is_published = true);

CREATE POLICY "Public read published course lessons" ON public.course_lessons
    FOR SELECT USING (is_published = true);

CREATE POLICY "Public read published current affairs" ON public.current_affairs_articles
    FOR SELECT USING (is_published = true);

CREATE POLICY "Public read active redirect routes" ON public.redirect_routes
    FOR SELECT USING (is_active = true);

-- 2. User Entitlements (Own Rows Only)
CREATE POLICY "Users can read own entitlements" ON public.user_entitlements
    FOR SELECT USING (auth.uid() = user_id);
