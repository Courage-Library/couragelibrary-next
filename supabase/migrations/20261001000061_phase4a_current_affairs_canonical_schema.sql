-- ============================================================================
-- COURAGE LIBRARY — PHASE 4A: CURRENT AFFAIRS CANONICAL SCHEMA & FOUNDATION
-- Target Database: couragelibrary-next
-- Architecture Contract: Frozen v1.1.0 (Option B Categories, Option C Hybrid Exams)
-- ============================================================================

-- ============================================================================
-- 1. EVOLVE MASTER IDENTITY TABLE: current_affairs_articles
-- ============================================================================

-- Drop legacy RLS policy before dropping dependent column (is_published)
DROP POLICY IF EXISTS "Public read published current affairs" ON public.current_affairs_articles;

-- Drop legacy constraints from Phase 3E initial placeholder
ALTER TABLE public.current_affairs_articles
    DROP CONSTRAINT IF EXISTS current_affairs_articles_category_check,
    DROP CONSTRAINT IF EXISTS current_affairs_articles_learning_resource_id_fkey,
    DROP CONSTRAINT IF EXISTS current_affairs_articles_learning_resource_id_key;

-- Drop legacy placeholder columns safely (0 production rows confirmed)
ALTER TABLE public.current_affairs_articles
    DROP COLUMN IF EXISTS headline,
    DROP COLUMN IF EXISTS summary_md,
    DROP COLUMN IF EXISTS key_takeaways_json,
    DROP COLUMN IF EXISTS source_name,
    DROP COLUMN IF EXISTS source_url,
    DROP COLUMN IF EXISTS is_published,
    DROP COLUMN IF EXISTS learning_resource_id;

-- Add canonical master identity columns
ALTER TABLE public.current_affairs_articles
    ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS importance_tier TEXT NOT NULL DEFAULT 'HIGH',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS published_version_id UUID,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Apply 12 Canonical Categories CHECK constraint
ALTER TABLE public.current_affairs_articles
    DROP CONSTRAINT IF EXISTS chk_ca_articles_category;

ALTER TABLE public.current_affairs_articles
    ADD CONSTRAINT chk_ca_articles_category CHECK (
        category IN (
            'NATIONAL', 'INTERNATIONAL', 'ECONOMY', 'DEFENCE',
            'SCIENCE_TECH', 'ENVIRONMENT', 'GOVT_SCHEMES', 'SPORTS',
            'AWARDS_HONOURS', 'PERSONS_IN_NEWS', 'IMPORTANT_DAYS', 'STATE_SPECIFIC'
        )
    );

-- Apply Importance Tier CHECK constraint
ALTER TABLE public.current_affairs_articles
    DROP CONSTRAINT IF EXISTS chk_ca_articles_importance_tier;

ALTER TABLE public.current_affairs_articles
    ADD CONSTRAINT chk_ca_articles_importance_tier CHECK (
        importance_tier IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
    );

-- Apply Lifecycle Status CHECK constraint
ALTER TABLE public.current_affairs_articles
    DROP CONSTRAINT IF EXISTS chk_ca_articles_status;

ALTER TABLE public.current_affairs_articles
    ADD CONSTRAINT chk_ca_articles_status CHECK (
        status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'COMPILED', 'PUBLISHED', 'ARCHIVED')
    );

-- ============================================================================
-- 2. IMMUTABLE VERSION SNAPSHOTS: current_affairs_article_versions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_article_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.current_affairs_articles(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    headline TEXT NOT NULL,
    summary_md TEXT NOT NULL,
    key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
    important_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    exam_relevance_notes JSONB DEFAULT '{}'::jsonb,
    provenance_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    compiled_ast_json JSONB,
    checksum_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'COMPILED', 'PUBLISHED', 'ARCHIVED')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ca_article_version UNIQUE (article_id, version_number)
);

-- Establish Publication Pointer Foreign Key on Master Table
ALTER TABLE public.current_affairs_articles
    DROP CONSTRAINT IF EXISTS fk_ca_articles_published_version;

ALTER TABLE public.current_affairs_articles
    ADD CONSTRAINT fk_ca_articles_published_version
    FOREIGN KEY (published_version_id)
    REFERENCES public.current_affairs_article_versions(id)
    ON DELETE SET NULL;

-- ============================================================================
-- 3. STRUCTURED PROVENANCE SOURCES: current_affairs_sources
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.current_affairs_article_versions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    publisher TEXT NOT NULL,
    url TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4')),
    citation_context TEXT,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. TAXONOMY JUNCTION: current_affairs_taxonomy_mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_taxonomy_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.current_affairs_articles(id) ON DELETE CASCADE,
    taxonomy_node_id UUID NOT NULL REFERENCES public.canonical_taxonomy_nodes(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    relevance_score NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (relevance_score >= 0.00 AND relevance_score <= 1.00),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ca_taxonomy_mapping UNIQUE (article_id, taxonomy_node_id)
);

-- ============================================================================
-- 5. QUESTION BANK JUNCTION: current_affairs_question_mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_question_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.current_affairs_articles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ca_question_mapping UNIQUE (article_id, question_id)
);

-- ============================================================================
-- 6. LEARNING THEORY JUNCTION: current_affairs_learning_mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_learning_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.current_affairs_articles(id) ON DELETE CASCADE,
    learning_resource_id UUID NOT NULL REFERENCES public.learning_resources(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ca_learning_mapping UNIQUE (article_id, learning_resource_id)
);

-- ============================================================================
-- 7. NORMALIZED EXAM JUNCTION: current_affairs_exam_mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.current_affairs_exam_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES public.current_affairs_articles(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    relevance_weight TEXT NOT NULL DEFAULT 'HIGH' CHECK (relevance_weight IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    is_high_yield BOOLEAN NOT NULL DEFAULT false,
    display_priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ca_exam_mapping UNIQUE (article_id, exam_id)
);

-- ============================================================================
-- 8. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ca_articles_date_cat ON public.current_affairs_articles(news_date DESC, category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_articles_slug ON public.current_affairs_articles(slug);
CREATE INDEX IF NOT EXISTS idx_ca_articles_status ON public.current_affairs_articles(status) WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS idx_ca_versions_lookup ON public.current_affairs_article_versions(article_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_ca_versions_checksum ON public.current_affairs_article_versions(checksum_sha256);

CREATE INDEX IF NOT EXISTS idx_ca_sources_version_tier ON public.current_affairs_sources(version_id, tier);
CREATE INDEX IF NOT EXISTS idx_ca_tax_lookup ON public.current_affairs_taxonomy_mappings(taxonomy_node_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_ca_q_lookup ON public.current_affairs_question_mappings(question_id);
CREATE INDEX IF NOT EXISTS idx_ca_learn_lookup ON public.current_affairs_learning_mappings(learning_resource_id);
CREATE INDEX IF NOT EXISTS idx_ca_exam_feed ON public.current_affairs_exam_mappings(exam_id, relevance_weight, is_high_yield);

-- ============================================================================
-- 9. DATABASE-LEVEL INTEGRITY GUARDS & TRIGGERS
-- ============================================================================

-- A. Published Version Immutability Guard
CREATE OR REPLACE FUNCTION public.guard_ca_published_version_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'PUBLISHED' THEN
        -- Allow state change to ARCHIVED, but disallow mutation of educational content & identity
        IF NEW.id != OLD.id OR
           NEW.article_id != OLD.article_id OR
           NEW.version_number != OLD.version_number OR
           NEW.headline != OLD.headline OR
           NEW.summary_md != OLD.summary_md OR
           NEW.checksum_sha256 != OLD.checksum_sha256 OR
           NEW.key_takeaways::text != OLD.key_takeaways::text OR
           NEW.important_facts::text != OLD.important_facts::text OR
           NEW.compiled_ast_json::text != OLD.compiled_ast_json::text THEN
            RAISE EXCEPTION 'ERR_IMMUTABLE_PUBLISHED_VERSION: Published Current Affairs version (%) cannot be mutated in place.', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_ca_version_immutability ON public.current_affairs_article_versions;
CREATE TRIGGER trg_guard_ca_version_immutability
    BEFORE UPDATE ON public.current_affairs_article_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_ca_published_version_immutability();

-- B. Publication Pointer Cross-Article & Status Integrity Guard
CREATE OR REPLACE FUNCTION public.guard_ca_publication_pointer_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_version RECORD;
BEGIN
    IF NEW.published_version_id IS NOT NULL THEN
        SELECT id, article_id, status INTO v_version
        FROM public.current_affairs_article_versions
        WHERE id = NEW.published_version_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ERR_INVALID_PUBLICATION_POINTER: Target version (%) does not exist.', NEW.published_version_id;
        END IF;

        IF v_version.article_id != NEW.id THEN
            RAISE EXCEPTION 'ERR_POINTER_CROSS_ARTICLE: Target version (%) belongs to article (%) not (%).',
                NEW.published_version_id, v_version.article_id, NEW.id;
        END IF;

        IF v_version.status != 'PUBLISHED' THEN
            RAISE EXCEPTION 'ERR_POINTER_UNPUBLISHED: Target version (%) status is (%), must be PUBLISHED.',
                NEW.published_version_id, v_version.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_ca_pointer_integrity ON public.current_affairs_articles;
CREATE TRIGGER trg_guard_ca_pointer_integrity
    BEFORE INSERT OR UPDATE OF published_version_id ON public.current_affairs_articles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_ca_publication_pointer_integrity();

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.current_affairs_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_taxonomy_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_question_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_learning_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_affairs_exam_mappings ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policies (Published Content Only)
DROP POLICY IF EXISTS "Public read published current affairs" ON public.current_affairs_articles;
CREATE POLICY "Public read published current affairs" ON public.current_affairs_articles
    FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS "Public read published current affairs versions" ON public.current_affairs_article_versions;
CREATE POLICY "Public read published current affairs versions" ON public.current_affairs_article_versions
    FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS "Public read published current affairs sources" ON public.current_affairs_sources;
CREATE POLICY "Public read published current affairs sources" ON public.current_affairs_sources
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.current_affairs_article_versions v
            WHERE v.id = version_id AND v.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS "Public read published current affairs taxonomy" ON public.current_affairs_taxonomy_mappings;
CREATE POLICY "Public read published current affairs taxonomy" ON public.current_affairs_taxonomy_mappings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.current_affairs_articles a
            WHERE a.id = article_id AND a.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS "Public read published current affairs questions" ON public.current_affairs_question_mappings;
CREATE POLICY "Public read published current affairs questions" ON public.current_affairs_question_mappings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.current_affairs_articles a
            WHERE a.id = article_id AND a.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS "Public read published current affairs learning" ON public.current_affairs_learning_mappings;
CREATE POLICY "Public read published current affairs learning" ON public.current_affairs_learning_mappings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.current_affairs_articles a
            WHERE a.id = article_id AND a.status = 'PUBLISHED'
        )
    );

DROP POLICY IF EXISTS "Public read published current affairs exams" ON public.current_affairs_exam_mappings;
CREATE POLICY "Public read published current affairs exams" ON public.current_affairs_exam_mappings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.current_affairs_articles a
            WHERE a.id = article_id AND a.status = 'PUBLISHED'
        )
    );
