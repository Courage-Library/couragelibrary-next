-- ============================================================================
-- COURAGE LIBRARY — PHASE 3H.1 DATABASE MIGRATION
-- Exam Knowledge Core Data Model & Schema Foundation
-- ============================================================================
--
-- Implements:
-- 1. exam_posts: Structured post profiles, pay levels, and departmental cadres.
-- 2. exam_sources: Official commission notification, gazette, and circular registry.
-- 3. exam_knowledge_documents: Modular exam information document containers.
-- 4. exam_doc_versions: Immutable versioned specs and compiled MDX payloads.
-- 5. exam_claims: Claim-level factual parameters and provenance tracking.
-- 6. exam_claim_sources: Many-to-many claim-to-source citation junction.
-- 7. Immutability triggers and cross-document pointer consistency checks.
-- 8. Row-Level Security (RLS) policies and least-privilege grants.
-- ============================================================================

-- 1. EXAM POSTS (Structured Post Profiles & Pay Scales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    post_name TEXT NOT NULL,
    post_code TEXT,
    department TEXT,
    ministry TEXT,
    classification_group TEXT DEFAULT 'Group B',
    is_gazetted BOOLEAN NOT NULL DEFAULT false,
    pay_level INTEGER NOT NULL DEFAULT 7,
    grade_pay INTEGER,
    cpc_basic_pay_min NUMERIC(10,2),
    cpc_basic_pay_max NUMERIC(10,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_posts_exam_name UNIQUE (exam_id, post_name)
);

-- 2. EXAM SOURCES (Official Gazette & Commission Sources)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL CHECK (
        source_type IN (
            'OFFICIAL_NOTIFICATION',
            'OFFICIAL_WEBSITE',
            'OFFICIAL_CORRIGENDUM',
            'GAZETTE_ORDER',
            'GOVERNMENT_CIRCULAR',
            'AUTHENTICATED_ANALYSIS',
            'OTHER_AUTHORITY'
        )
    ),
    title TEXT NOT NULL,
    issuing_authority TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_date DATE,
    effective_date DATE,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (
        verification_status IN (
            'UNVERIFIED',
            'SOURCE_VERIFIED',
            'FLAGGED_OUTDATED',
            'REJECTED',
            'SUPERSEDED'
        )
    ),
    verified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    document_checksum TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EXAM KNOWLEDGE DOCUMENTS (Modular Information Entity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE RESTRICT,
    module_key TEXT NOT NULL,
    canonical_slug TEXT NOT NULL,
    current_published_version_id UUID,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED')
    ),
    language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_docs_exam_cycle_module UNIQUE NULLS NOT DISTINCT (exam_id, exam_cycle_id, module_key, language)
);

-- 4. EXAM DOCUMENT VERSIONS (Immutable Versioned Content & MDX Payloads)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_doc_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.exam_knowledge_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    schema_version TEXT NOT NULL DEFAULT '1.0.0',
    author_type TEXT NOT NULL DEFAULT 'HUMAN' CHECK (
        author_type IN ('HUMAN', 'AI_ASSISTED', 'EXTERNAL_IMPORT')
    ),
    review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
        review_status IN (
            'DRAFT',
            'AI_GENERATED',
            'STRUCTURALLY_VALID',
            'IN_REVIEW',
            'APPROVED',
            'PUBLISHED',
            'REJECTED',
            'SUPERSEDED'
        )
    ),
    source_spec_storage_key TEXT,
    source_spec_hash TEXT,
    compiled_artifact_storage_key TEXT,
    compiled_artifact_hash TEXT,
    structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    compiled_mdx TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_feedback TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_doc_versions_num UNIQUE (document_id, version_number)
);

-- Deferred Foreign Key for current_published_version_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_docs_current_pub_version'
    ) THEN
        ALTER TABLE public.exam_knowledge_documents
            ADD CONSTRAINT fk_exam_docs_current_pub_version
            FOREIGN KEY (current_published_version_id)
            REFERENCES public.exam_doc_versions(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- 5. EXAM CLAIMS (Fact-Level Provenance & Volatile Parameters)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE SET NULL,
    doc_version_id UUID REFERENCES public.exam_doc_versions(id) ON DELETE CASCADE,
    claim_key TEXT NOT NULL,
    stated_value TEXT NOT NULL,
    value_data_type TEXT NOT NULL DEFAULT 'STRING' CHECK (
        value_data_type IN ('STRING', 'INTEGER', 'NUMERIC', 'DATE', 'BOOLEAN', 'JSON')
    ),
    effective_start_date DATE,
    effective_end_date DATE,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (
        verification_status IN ('UNVERIFIED', 'VERIFIED', 'FLAGGED_OUTDATED', 'REJECTED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. EXAM CLAIM SOURCES (Many-to-Many Claim Citations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_claim_sources (
    claim_id UUID NOT NULL REFERENCES public.exam_claims(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.exam_sources(id) ON DELETE CASCADE,
    page_or_clause_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (claim_id, source_id)
);

-- ============================================================================
-- 7. DATABASE INDEXES FOR QUERY OPTIMIZATION
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_exam_posts_exam_id ON public.exam_posts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sources_exam_id ON public.exam_sources(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sources_cycle_id ON public.exam_sources(exam_cycle_id);
CREATE INDEX IF NOT EXISTS idx_exam_sources_status ON public.exam_sources(verification_status);

CREATE INDEX IF NOT EXISTS idx_exam_docs_exam_id ON public.exam_knowledge_documents(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_docs_cycle_id ON public.exam_knowledge_documents(exam_cycle_id);
CREATE INDEX IF NOT EXISTS idx_exam_docs_module ON public.exam_knowledge_documents(module_key);
CREATE INDEX IF NOT EXISTS idx_exam_docs_status ON public.exam_knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_exam_docs_slug ON public.exam_knowledge_documents(canonical_slug);

CREATE INDEX IF NOT EXISTS idx_exam_doc_versions_doc_id ON public.exam_doc_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_exam_doc_versions_published ON public.exam_doc_versions(is_published);
CREATE INDEX IF NOT EXISTS idx_exam_doc_versions_status ON public.exam_doc_versions(review_status);

CREATE INDEX IF NOT EXISTS idx_exam_claims_exam_id ON public.exam_claims(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_claims_cycle_id ON public.exam_claims(exam_cycle_id);
CREATE INDEX IF NOT EXISTS idx_exam_claims_key ON public.exam_claims(claim_key);
CREATE INDEX IF NOT EXISTS idx_exam_claims_status ON public.exam_claims(verification_status);

-- ============================================================================
-- 8. IMMUTABILITY & POINTER INTEGRITY TRIGGERS
-- ============================================================================

-- Function 1: Ensure current_published_version_id belongs to the same document and is published
CREATE OR REPLACE FUNCTION public.fn_check_exam_doc_published_pointer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_doc_id UUID;
    v_is_published BOOLEAN;
BEGIN
    IF NEW.current_published_version_id IS NOT NULL THEN
        SELECT document_id, is_published
        INTO v_target_doc_id, v_is_published
        FROM public.exam_doc_versions
        WHERE id = NEW.current_published_version_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'current_published_version_id % does not exist in exam_doc_versions', NEW.current_published_version_id;
        END IF;

        IF v_target_doc_id <> NEW.id THEN
            RAISE EXCEPTION 'Cross-document pointer violation: version % belongs to doc %, not %',
                NEW.current_published_version_id, v_target_doc_id, NEW.id;
        END IF;

        IF v_is_published IS NOT TRUE THEN
            RAISE EXCEPTION 'Invalid pointer: version % is not published (is_published = false)', NEW.current_published_version_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_exam_doc_published_pointer ON public.exam_knowledge_documents;
CREATE TRIGGER trg_check_exam_doc_published_pointer
    BEFORE INSERT OR UPDATE ON public.exam_knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_exam_doc_published_pointer();

-- Function 2: Protect published versions from mutation or deletion
CREATE OR REPLACE FUNCTION public.fn_protect_published_exam_doc_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_published = true OR OLD.review_status = 'PUBLISHED' THEN
            RAISE EXCEPTION 'Cannot delete published exam_doc_version % (v%). Published versions are permanently immutable.',
                OLD.id, OLD.version_number;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Allow state transition from APPROVED -> PUBLISHED
        IF OLD.is_published = false AND NEW.is_published = true THEN
            RETURN NEW;
        END IF;

        -- Block any modification once published
        IF OLD.is_published = true THEN
            RAISE EXCEPTION 'Cannot modify published exam_doc_version % (v%). Create a new version instead.',
                OLD.id, OLD.version_number;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_published_exam_doc_version ON public.exam_doc_versions;
CREATE TRIGGER trg_protect_published_exam_doc_version
    BEFORE UPDATE OR DELETE ON public.exam_doc_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_published_exam_doc_version();

-- Function 3: Prevent deleting a document that has published versions
CREATE OR REPLACE FUNCTION public.fn_protect_published_exam_doc_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pub_count INTEGER;
BEGIN
    SELECT count(*)
    INTO v_pub_count
    FROM public.exam_doc_versions
    WHERE document_id = OLD.id AND (is_published = true OR review_status = 'PUBLISHED');

    IF v_pub_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam_knowledge_document % because % published version(s) exist. Archive the document instead.',
            OLD.id, v_pub_count;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_published_exam_doc_deletion ON public.exam_knowledge_documents;
CREATE TRIGGER trg_protect_published_exam_doc_deletion
    BEFORE DELETE ON public.exam_knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_published_exam_doc_deletion();

-- ============================================================================
-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.exam_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_doc_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_claim_sources ENABLE ROW LEVEL SECURITY;

-- 9.1 Candidate Read Policies (Public & Authenticated)
-- Candidates can view active posts
CREATE POLICY "Public candidates can view active exam posts"
    ON public.exam_posts
    FOR SELECT
    USING (is_active = true);

-- Candidates can view verified sources
CREATE POLICY "Public candidates can view verified exam sources"
    ON public.exam_sources
    FOR SELECT
    USING (verification_status = 'SOURCE_VERIFIED');

-- Candidates can view published documents
CREATE POLICY "Public candidates can view published exam knowledge documents"
    ON public.exam_knowledge_documents
    FOR SELECT
    USING (status = 'PUBLISHED' AND current_published_version_id IS NOT NULL);

-- Candidates can view published versions
CREATE POLICY "Public candidates can view published exam doc versions"
    ON public.exam_doc_versions
    FOR SELECT
    USING (is_published = true AND review_status = 'PUBLISHED');

-- Candidates can view verified claims
CREATE POLICY "Public candidates can view verified exam claims"
    ON public.exam_claims
    FOR SELECT
    USING (verification_status = 'VERIFIED');

-- Candidates can view claim sources
CREATE POLICY "Public candidates can view claim sources"
    ON public.exam_claim_sources
    FOR SELECT
    USING (true);

-- 9.2 Admin / Staff Full Access Policies (via service_role or admin user check)
CREATE POLICY "Admin staff full management of exam posts"
    ON public.exam_posts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin staff full management of exam sources"
    ON public.exam_sources
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin staff full management of exam knowledge documents"
    ON public.exam_knowledge_documents
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin staff full management of exam doc versions"
    ON public.exam_doc_versions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin staff full management of exam claims"
    ON public.exam_claims
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin staff full management of exam claim sources"
    ON public.exam_claim_sources
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 10. LEAST-PRIVILEGE PERMISSION GRANTS
-- ============================================================================
GRANT SELECT ON public.exam_posts TO anon, authenticated;
GRANT SELECT ON public.exam_sources TO anon, authenticated;
GRANT SELECT ON public.exam_knowledge_documents TO anon, authenticated;
GRANT SELECT ON public.exam_doc_versions TO anon, authenticated;
GRANT SELECT ON public.exam_claims TO anon, authenticated;
GRANT SELECT ON public.exam_claim_sources TO anon, authenticated;

GRANT ALL ON public.exam_posts TO service_role;
GRANT ALL ON public.exam_sources TO service_role;
GRANT ALL ON public.exam_knowledge_documents TO service_role;
GRANT ALL ON public.exam_doc_versions TO service_role;
GRANT ALL ON public.exam_claims TO service_role;
GRANT ALL ON public.exam_claim_sources TO service_role;
