-- ============================================================================
-- COURAGE LIBRARY — PHASE 3R.2 DATABASE MIGRATION
-- Derived Field Integrity, Subtree Propagation & Projection Idempotency
-- ============================================================================
--
-- Implements:
-- 1. Unique indices on legacy back-references (guaranteeing projection idempotency).
-- 2. Automatic derived field synchronization trigger for canonical_taxonomy_nodes:
--    - node_depth, root_subject_id, hierarchy_path derived automatically from parent_id & slug.
-- 3. Recursive descendant cascade trigger for subtree moves in canonical_taxonomy_nodes:
--    - Moving any branch updates all descendants' depth, root subject, and path automatically.
-- 4. Automatic depth synchronization and descendant cascade for exam_syllabus_nodes.
--
-- NON-DESTRUCTIVE INVARIANTS:
-- - All operations are purely ADDITIVE.
-- - Existing legacy tables and rows remain 100% untouched.
-- ============================================================================

-- 1. Idempotency Indices on Legacy Back-References
-- ============================================================================
DROP INDEX IF EXISTS public.uq_canonical_legacy_subject;
DROP INDEX IF EXISTS public.uq_canonical_legacy_topic;
DROP INDEX IF EXISTS public.uq_canonical_legacy_subtopic;

CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_legacy_subject 
ON public.canonical_taxonomy_nodes (legacy_subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_legacy_topic 
ON public.canonical_taxonomy_nodes (legacy_topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_legacy_subtopic 
ON public.canonical_taxonomy_nodes (legacy_subtopic_id);

-- 2. Canonical Derived Fields Trigger Function (BEFORE INSERT OR UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_derive_canonical_taxonomy_fields()
RETURNS TRIGGER AS $$
DECLARE
    p_depth INTEGER;
    p_root UUID;
    p_path TEXT;
BEGIN
    -- Ensure UUID is generated if null
    IF NEW.id IS NULL THEN
        NEW.id := gen_random_uuid();
    END IF;

    IF NEW.parent_id IS NULL THEN
        -- Root Subject Node
        NEW.node_depth := 1;
        NEW.root_subject_id := NEW.id;
        NEW.hierarchy_path := NEW.slug;
    ELSE
        -- Child Node: query parent derived properties
        SELECT node_depth, root_subject_id, hierarchy_path
        INTO p_depth, p_root, p_path
        FROM public.canonical_taxonomy_nodes
        WHERE id = NEW.parent_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent canonical node % does not exist', NEW.parent_id;
        END IF;

        NEW.node_depth := p_depth + 1;
        NEW.root_subject_id := p_root;
        NEW.hierarchy_path := p_path || '.' || NEW.slug;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_derive_canonical_taxonomy_fields ON public.canonical_taxonomy_nodes;
CREATE TRIGGER trg_derive_canonical_taxonomy_fields
    BEFORE INSERT OR UPDATE OF parent_id, slug ON public.canonical_taxonomy_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_derive_canonical_taxonomy_fields();

-- 3. Canonical Subtree Move Descendant Cascade (AFTER UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_cascade_canonical_descendants()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if parent_id, slug, or hierarchy_path changed
    IF (OLD.parent_id IS DISTINCT FROM NEW.parent_id) OR
       (OLD.slug IS DISTINCT FROM NEW.slug) OR
       (OLD.hierarchy_path IS DISTINCT FROM NEW.hierarchy_path) THEN

        WITH RECURSIVE descendant_tree AS (
            SELECT 
                c.id, 
                c.parent_id, 
                c.slug, 
                NEW.node_depth + 1 AS new_depth, 
                NEW.root_subject_id AS new_root, 
                NEW.hierarchy_path || '.' || c.slug AS new_path
            FROM public.canonical_taxonomy_nodes c
            WHERE c.parent_id = NEW.id

            UNION ALL

            SELECT 
                c.id, 
                c.parent_id, 
                c.slug, 
                d.new_depth + 1, 
                d.new_root, 
                d.new_path || '.' || c.slug
            FROM public.canonical_taxonomy_nodes c
            JOIN descendant_tree d ON c.parent_id = d.id
        )
        UPDATE public.canonical_taxonomy_nodes t
        SET node_depth = d.new_depth,
            root_subject_id = d.new_root,
            hierarchy_path = d.new_path,
            updated_at = now()
        FROM descendant_tree d
        WHERE t.id = d.id;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_canonical_descendants ON public.canonical_taxonomy_nodes;
CREATE TRIGGER trg_cascade_canonical_descendants
    AFTER UPDATE OF parent_id, slug, hierarchy_path ON public.canonical_taxonomy_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_cascade_canonical_descendants();

-- 4. Syllabus Node Derived Depth Trigger Function (BEFORE INSERT OR UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_derive_exam_syllabus_node_depth()
RETURNS TRIGGER AS $$
DECLARE
    p_depth INTEGER;
BEGIN
    IF NEW.id IS NULL THEN
        NEW.id := gen_random_uuid();
    END IF;

    IF NEW.parent_node_id IS NULL THEN
        NEW.node_depth := 1;
    ELSE
        SELECT node_depth INTO p_depth
        FROM public.exam_syllabus_nodes
        WHERE id = NEW.parent_node_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent syllabus node % does not exist', NEW.parent_node_id;
        END IF;

        NEW.node_depth := p_depth + 1;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_derive_exam_syllabus_node_depth ON public.exam_syllabus_nodes;
CREATE TRIGGER trg_derive_exam_syllabus_node_depth
    BEFORE INSERT OR UPDATE OF parent_node_id ON public.exam_syllabus_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_derive_exam_syllabus_node_depth();

-- 5. Syllabus Node Subtree Move Cascade (AFTER UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_cascade_exam_syllabus_node_descendants()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.parent_node_id IS DISTINCT FROM NEW.parent_node_id) THEN
        WITH RECURSIVE descendant_tree AS (
            SELECT 
                c.id, 
                c.parent_node_id, 
                NEW.node_depth + 1 AS new_depth
            FROM public.exam_syllabus_nodes c
            WHERE c.parent_node_id = NEW.id

            UNION ALL

            SELECT 
                c.id, 
                c.parent_node_id, 
                d.new_depth + 1
            FROM public.exam_syllabus_nodes c
            JOIN descendant_tree d ON c.parent_node_id = d.id
        )
        UPDATE public.exam_syllabus_nodes t
        SET node_depth = d.new_depth,
            updated_at = now()
        FROM descendant_tree d
        WHERE t.id = d.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_exam_syllabus_node_descendants ON public.exam_syllabus_nodes;
CREATE TRIGGER trg_cascade_exam_syllabus_node_descendants
    AFTER UPDATE OF parent_node_id ON public.exam_syllabus_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_cascade_exam_syllabus_node_descendants();
