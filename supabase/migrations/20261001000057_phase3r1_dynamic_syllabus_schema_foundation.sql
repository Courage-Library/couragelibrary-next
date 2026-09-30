-- ============================================================================
-- COURAGE LIBRARY — PHASE 3R.1 DATABASE MIGRATION
-- Dynamic Exam Syllabus Reconciliation — Additive Recursive Schema Foundation
-- ============================================================================
--
-- Implements:
-- 1. canonical_taxonomy_nodes: True recursive canonical academic taxonomy.
-- 2. taxonomy_aliases: Canonical synonym & alias lookup registry.
-- 3. exam_syllabus_versions: Versioned syllabus order containers.
-- 4. exam_syllabus_nodes: Recursive imported syllabus requirement tree.
-- 5. exam_syllabus_canonical_mappings: 1:1 syllabus-to-canonical projections.
-- 6. Cycle prevention and structural integrity triggers.
-- 7. Query-justified indices and Row-Level Security (RLS) policies.
--
-- NON-DESTRUCTIVE INVARIANTS:
-- - All operations are purely ADDITIVE.
-- - Legacy tables (subjects, topics, subtopics, learning_units, exam_syllabi,
--   exam_topics, exam_unit_mappings) are 100% UNTOUCHED and PRESERVED.
-- - Existing production data and row counts remain unchanged.
-- ============================================================================

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CANONICAL TAXONOMY NODES (Recursive Academic Taxonomy)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.canonical_taxonomy_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.canonical_taxonomy_nodes(id) ON DELETE RESTRICT,
    root_subject_id UUID REFERENCES public.canonical_taxonomy_nodes(id) ON DELETE RESTRICT,
    
    -- Node Identity & Nomenclature
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    node_type TEXT NOT NULL DEFAULT 'CONCEPT' CHECK (
        node_type IN ('SUBJECT', 'DOMAIN', 'TOPIC', 'SUBTOPIC', 'CONCEPT', 'METHOD')
    ),
    
    -- Hierarchy Geometry & Pathing
    node_depth INTEGER NOT NULL CHECK (node_depth >= 1),
    hierarchy_path TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    
    -- Status & Structured Attributes
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Legacy Taxonomy Backward-Compatibility References
    legacy_subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    legacy_topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    legacy_subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Integrity Constraints
    CONSTRAINT chk_canonical_no_self_parent CHECK (
        parent_id IS NULL OR parent_id <> id
    ),
    CONSTRAINT chk_canonical_root_depth CHECK (
        (parent_id IS NULL AND node_depth = 1 AND node_type = 'SUBJECT') OR
        (parent_id IS NOT NULL AND node_depth > 1)
    )
);

-- Sibling uniqueness: No duplicate slugs under the same parent node
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_sibling_slug 
ON public.canonical_taxonomy_nodes (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), slug);

-- ============================================================================
-- 2. CANONICAL TAXONOMY CYCLE DETECTION TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_canonical_taxonomy_cycles()
RETURNS TRIGGER AS $$
DECLARE
    curr_parent UUID;
    depth_count INTEGER := 0;
BEGIN
    IF NEW.parent_id IS NULL THEN
        -- Root node: ensure root_subject_id points to itself
        IF NEW.root_subject_id IS NULL THEN
            NEW.root_subject_id := NEW.id;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'Self-parenting is prohibited: node % cannot be its own parent', NEW.id;
    END IF;

    curr_parent := NEW.parent_id;
    WHILE curr_parent IS NOT NULL LOOP
        IF curr_parent = NEW.id THEN
            RAISE EXCEPTION 'Circular parent relationship detected: node % is an ancestor of its proposed parent %', NEW.id, NEW.parent_id;
        END IF;

        depth_count := depth_count + 1;
        IF depth_count > 100 THEN
            RAISE EXCEPTION 'Hierarchy depth exceeds cycle detection threshold (100) for node %', NEW.id;
        END IF;

        SELECT parent_id INTO curr_parent FROM public.canonical_taxonomy_nodes WHERE id = curr_parent;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_canonical_taxonomy_cycles ON public.canonical_taxonomy_nodes;
CREATE TRIGGER trg_guard_canonical_taxonomy_cycles
    BEFORE INSERT OR UPDATE OF parent_id ON public.canonical_taxonomy_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_canonical_taxonomy_cycles();

-- ============================================================================
-- 3. TAXONOMY ALIAS REGISTRY (Synonym & External Nomenclature Mapping)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.taxonomy_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_node_id UUID NOT NULL REFERENCES public.canonical_taxonomy_nodes(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    alias_context TEXT NOT NULL DEFAULT 'GENERAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_taxonomy_alias_node_context UNIQUE (canonical_node_id, normalized_alias, alias_context)
);

-- ============================================================================
-- 4. EXAM SYLLABUS VERSIONS (Syllabus Order Containers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_syllabus_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE SET NULL,
    version_tag TEXT NOT NULL,
    source_document_id UUID REFERENCES public.exam_knowledge_documents(id) ON DELETE SET NULL,
    raw_payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'RECONCILED', 'PUBLISHED', 'ARCHIVED')
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_exam_syllabus_version_tag UNIQUE (exam_id, version_tag)
);

-- ============================================================================
-- 5. RECURSIVE EXAM SYLLABUS NODES (The Imported Syllabus Requirement Tree)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_syllabus_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_version_id UUID NOT NULL REFERENCES public.exam_syllabus_versions(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES public.exam_syllabus_nodes(id) ON DELETE CASCADE,
    
    -- Raw imported attributes
    raw_title TEXT NOT NULL,
    raw_slug TEXT NOT NULL,
    node_depth INTEGER NOT NULL CHECK (node_depth >= 1),
    display_order INTEGER NOT NULL DEFAULT 0,
    
    -- Exam-specific weightage and cognitive requirements
    weightage_tier TEXT CHECK (
        weightage_tier IN ('HIGH_YIELD', 'CORE', 'MODERATE', 'LOW', 'OPTIONAL')
    ),
    expected_questions_min INTEGER DEFAULT 0,
    expected_questions_max INTEGER DEFAULT 0,
    required_cognitive_depth TEXT CHECK (
        required_cognitive_depth IN ('RECALL', 'UNDERSTANDING', 'APPLICATION', 'ANALYSIS', 'COMPLEX_PROBLEM_SOLVING')
    ),
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_syllabus_node_no_self_parent CHECK (
        parent_node_id IS NULL OR parent_node_id <> id
    )
);

-- Sibling uniqueness for syllabus requirements within same parent & version
CREATE UNIQUE INDEX IF NOT EXISTS uq_syllabus_node_sibling_slug
ON public.exam_syllabus_nodes (syllabus_version_id, COALESCE(parent_node_id, '00000000-0000-0000-0000-000000000000'), raw_slug);

-- ============================================================================
-- 6. EXAM SYLLABUS NODE CYCLE DETECTION TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_exam_syllabus_node_cycles()
RETURNS TRIGGER AS $$
DECLARE
    curr_parent UUID;
    depth_count INTEGER := 0;
BEGIN
    IF NEW.parent_node_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_node_id = NEW.id THEN
        RAISE EXCEPTION 'Self-parenting is prohibited: syllabus node % cannot be its own parent', NEW.id;
    END IF;

    curr_parent := NEW.parent_node_id;
    WHILE curr_parent IS NOT NULL LOOP
        IF curr_parent = NEW.id THEN
            RAISE EXCEPTION 'Circular parent relationship detected: syllabus node % is an ancestor of its proposed parent %', NEW.id, NEW.parent_node_id;
        END IF;

        depth_count := depth_count + 1;
        IF depth_count > 100 THEN
            RAISE EXCEPTION 'Hierarchy depth exceeds cycle detection threshold (100) for syllabus node %', NEW.id;
        END IF;

        SELECT parent_node_id INTO curr_parent FROM public.exam_syllabus_nodes WHERE id = curr_parent;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_exam_syllabus_node_cycles ON public.exam_syllabus_nodes;
CREATE TRIGGER trg_guard_exam_syllabus_node_cycles
    BEFORE INSERT OR UPDATE OF parent_node_id ON public.exam_syllabus_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_exam_syllabus_node_cycles();

-- ============================================================================
-- 7. EXAM SYLLABUS TO CANONICAL MAPPINGS (Projections)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_syllabus_canonical_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_node_id UUID NOT NULL REFERENCES public.exam_syllabus_nodes(id) ON DELETE CASCADE,
    canonical_node_id UUID REFERENCES public.canonical_taxonomy_nodes(id) ON DELETE RESTRICT,
    
    -- Match State & Provenance
    match_status TEXT NOT NULL CHECK (
        match_status IN (
            'EXACT_MATCH',
            'ALIAS_MATCH',
            'PROPOSED_MATCH',
            'MANUALLY_MAPPED',
            'NEW_SUBJECT_GAP',
            'NEW_NODE_GAP',
            'IGNORED'
        )
    ),
    match_confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (
        match_confidence BETWEEN 0.00 AND 1.00
    ),
    match_notes TEXT,
    
    -- Review & Governance
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Strict 1:1 Mapping Invariant: A syllabus node maps to at most one canonical node
    CONSTRAINT uq_exam_syllabus_canonical_mapping_node UNIQUE (syllabus_node_id)
);

-- ============================================================================
-- 8. QUERY-JUSTIFIED PERFORMANCE INDICES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_canonical_nodes_parent 
    ON public.canonical_taxonomy_nodes (parent_id);

CREATE INDEX IF NOT EXISTS idx_canonical_nodes_root 
    ON public.canonical_taxonomy_nodes (root_subject_id);

CREATE INDEX IF NOT EXISTS idx_canonical_nodes_path 
    ON public.canonical_taxonomy_nodes (hierarchy_path text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_canonical_nodes_slug 
    ON public.canonical_taxonomy_nodes (slug);

CREATE INDEX IF NOT EXISTS idx_taxonomy_aliases_norm 
    ON public.taxonomy_aliases (normalized_alias);

CREATE INDEX IF NOT EXISTS idx_syllabus_versions_exam 
    ON public.exam_syllabus_versions (exam_id, is_active);

CREATE INDEX IF NOT EXISTS idx_syllabus_nodes_version_parent 
    ON public.exam_syllabus_nodes (syllabus_version_id, parent_node_id);

CREATE INDEX IF NOT EXISTS idx_mappings_canonical_node 
    ON public.exam_syllabus_canonical_mappings (canonical_node_id);

CREATE INDEX IF NOT EXISTS idx_mappings_status 
    ON public.exam_syllabus_canonical_mappings (match_status);

-- ============================================================================
-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.canonical_taxonomy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_syllabus_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_syllabus_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_syllabus_canonical_mappings ENABLE ROW LEVEL SECURITY;

-- 9.1 Public / Candidate Read Access (Published & Active only)
CREATE POLICY "Public candidates can view active canonical taxonomy nodes"
    ON public.canonical_taxonomy_nodes
    FOR SELECT
    USING (is_active = true);

CREATE POLICY "Public candidates can view taxonomy aliases"
    ON public.taxonomy_aliases
    FOR SELECT
    USING (true);

CREATE POLICY "Public candidates can view published exam syllabus versions"
    ON public.exam_syllabus_versions
    FOR SELECT
    USING (status = 'PUBLISHED' AND is_active = true);

CREATE POLICY "Public candidates can view nodes of published syllabus versions"
    ON public.exam_syllabus_nodes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.exam_syllabus_versions v
            WHERE v.id = syllabus_version_id
              AND v.status = 'PUBLISHED'
              AND v.is_active = true
        )
    );

CREATE POLICY "Public candidates can view mappings of published syllabus versions"
    ON public.exam_syllabus_canonical_mappings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.exam_syllabus_nodes n
            JOIN public.exam_syllabus_versions v ON v.id = n.syllabus_version_id
            WHERE n.id = syllabus_node_id
              AND v.status = 'PUBLISHED'
              AND v.is_active = true
        )
    );

-- 9.2 Authenticated Staff Full Management
CREATE POLICY "Staff full management of canonical taxonomy nodes"
    ON public.canonical_taxonomy_nodes
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff full management of taxonomy aliases"
    ON public.taxonomy_aliases
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff full management of exam syllabus versions"
    ON public.exam_syllabus_versions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff full management of exam syllabus nodes"
    ON public.exam_syllabus_nodes
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Staff full management of exam syllabus canonical mappings"
    ON public.exam_syllabus_canonical_mappings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 9.3 Least-Privilege Grants
GRANT SELECT ON public.canonical_taxonomy_nodes TO anon, authenticated;
GRANT SELECT ON public.taxonomy_aliases TO anon, authenticated;
GRANT SELECT ON public.exam_syllabus_versions TO anon, authenticated;
GRANT SELECT ON public.exam_syllabus_nodes TO anon, authenticated;
GRANT SELECT ON public.exam_syllabus_canonical_mappings TO anon, authenticated;

GRANT ALL ON public.canonical_taxonomy_nodes TO service_role;
GRANT ALL ON public.taxonomy_aliases TO service_role;
GRANT ALL ON public.exam_syllabus_versions TO service_role;
GRANT ALL ON public.exam_syllabus_nodes TO service_role;
GRANT ALL ON public.exam_syllabus_canonical_mappings TO service_role;
