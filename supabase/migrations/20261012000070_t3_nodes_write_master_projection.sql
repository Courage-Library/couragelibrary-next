-- =============================================================================
-- COURAGE LIBRARY — GAP2-1b: T3 IDENTITY-UNIFIED TAXONOMY SPINE, STEP 2
-- Migration: 20261012000070_t3_nodes_write_master_projection.sql
--
-- canonical_taxonomy_nodes is the write-master. subjects / topics / subtopics are a
-- trigger-maintained compatibility projection with the SAME ids.
--
-- 1. Legacy back-reference FKs become DEFERRABLE INITIALLY DEFERRED, ON DELETE NO
--    ACTION, so a new node can reference the projection row its own AFTER trigger
--    creates, and a legacy row can never be deleted out from under its node.
-- 2. BEFORE INSERT/UPDATE rules (fn_enforce_canonical_taxonomy_rules):
--    - SUBJECT/TOPIC/SUBTOPIC: legacy_<type>_id is set to the node id automatically;
--      any other legacy column, or a legacy id different from the node id, is rejected.
--    - DOMAIN/CONCEPT/METHOD: no legacy columns.
--    - Parent types: SUBJECT is a root; DOMAIN under SUBJECT; TOPIC under SUBJECT or
--      DOMAIN; SUBTOPIC under TOPIC; CONCEPT/METHOD under any node.
--    - Node ids, legacy columns, and node_type of SUBJECT/TOPIC/SUBTOPIC are immutable.
-- 3. AFTER INSERT/UPDATE/DELETE projection (fn_project_canonical_taxonomy_node):
--    upserts or deletes the projection row with the same id; idempotent (no-op when
--    nothing differs). Deleting a node whose projection row has dependants fails
--    (RESTRICT on the dependants' FKs).
-- 4. Guard (fn_guard_taxonomy_projection_write) on subjects/topics/subtopics: rejects
--    INSERT/UPDATE/DELETE/TRUNCATE unless the transaction-local flag
--    app.taxonomy_projection_write = 'on', which only the projection function sets.
-- 5. Proof: the projection mirrors the nodes exactly.
-- =============================================================================

-- 1. Legacy back-reference FKs ------------------------------------------------------
ALTER TABLE public.canonical_taxonomy_nodes
    DROP CONSTRAINT canonical_taxonomy_nodes_legacy_subject_id_fkey,
    DROP CONSTRAINT canonical_taxonomy_nodes_legacy_topic_id_fkey,
    DROP CONSTRAINT canonical_taxonomy_nodes_legacy_subtopic_id_fkey;

ALTER TABLE public.canonical_taxonomy_nodes
    ADD CONSTRAINT canonical_taxonomy_nodes_legacy_subject_id_fkey
        FOREIGN KEY (legacy_subject_id) REFERENCES public.subjects(id) DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT canonical_taxonomy_nodes_legacy_topic_id_fkey
        FOREIGN KEY (legacy_topic_id) REFERENCES public.topics(id) DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT canonical_taxonomy_nodes_legacy_subtopic_id_fkey
        FOREIGN KEY (legacy_subtopic_id) REFERENCES public.subtopics(id) DEFERRABLE INITIALLY DEFERRED;

-- 2. Identity + type rules (BEFORE) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_canonical_taxonomy_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_type TEXT;
    v_check_parent BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: node ids are immutable';
        END IF;
        IF NEW.node_type IS DISTINCT FROM OLD.node_type
           AND (OLD.node_type IN ('SUBJECT', 'TOPIC', 'SUBTOPIC') OR NEW.node_type IN ('SUBJECT', 'TOPIC', 'SUBTOPIC')) THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: node_type of a SUBJECT/TOPIC/SUBTOPIC node cannot change (% -> %)', OLD.node_type, NEW.node_type;
        END IF;
        IF NEW.legacy_subject_id IS DISTINCT FROM OLD.legacy_subject_id
           OR NEW.legacy_topic_id IS DISTINCT FROM OLD.legacy_topic_id
           OR NEW.legacy_subtopic_id IS DISTINCT FROM OLD.legacy_subtopic_id THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: legacy back-references are immutable';
        END IF;
    ELSE
        IF NEW.id IS NULL THEN
            NEW.id := gen_random_uuid();
        END IF;
        IF NEW.node_type = 'SUBJECT' THEN
            IF NEW.legacy_topic_id IS NOT NULL OR NEW.legacy_subtopic_id IS NOT NULL
               OR (NEW.legacy_subject_id IS NOT NULL AND NEW.legacy_subject_id <> NEW.id) THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: a SUBJECT node carries only legacy_subject_id = its own id';
            END IF;
            NEW.legacy_subject_id := NEW.id;
        ELSIF NEW.node_type = 'TOPIC' THEN
            IF NEW.legacy_subject_id IS NOT NULL OR NEW.legacy_subtopic_id IS NOT NULL
               OR (NEW.legacy_topic_id IS NOT NULL AND NEW.legacy_topic_id <> NEW.id) THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: a TOPIC node carries only legacy_topic_id = its own id';
            END IF;
            NEW.legacy_topic_id := NEW.id;
        ELSIF NEW.node_type = 'SUBTOPIC' THEN
            IF NEW.legacy_subject_id IS NOT NULL OR NEW.legacy_topic_id IS NOT NULL
               OR (NEW.legacy_subtopic_id IS NOT NULL AND NEW.legacy_subtopic_id <> NEW.id) THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: a SUBTOPIC node carries only legacy_subtopic_id = its own id';
            END IF;
            NEW.legacy_subtopic_id := NEW.id;
        ELSIF NEW.legacy_subject_id IS NOT NULL OR NEW.legacy_topic_id IS NOT NULL OR NEW.legacy_subtopic_id IS NOT NULL THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: % nodes have no legacy projection', NEW.node_type;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_check_parent := true;
    ELSE
        v_check_parent := NEW.parent_id IS DISTINCT FROM OLD.parent_id;
    END IF;

    IF v_check_parent THEN
        IF NEW.parent_id IS NULL THEN
            IF NEW.node_type <> 'SUBJECT' THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: only SUBJECT nodes can be roots';
            END IF;
        ELSE
            SELECT node_type INTO v_parent_type FROM public.canonical_taxonomy_nodes WHERE id = NEW.parent_id;
            IF v_parent_type IS NULL THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: parent node % does not exist', NEW.parent_id;
            END IF;
            IF (NEW.node_type = 'SUBJECT')
               OR (NEW.node_type = 'DOMAIN' AND v_parent_type <> 'SUBJECT')
               OR (NEW.node_type = 'TOPIC' AND v_parent_type NOT IN ('SUBJECT', 'DOMAIN'))
               OR (NEW.node_type = 'SUBTOPIC' AND v_parent_type <> 'TOPIC') THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: a % node cannot be placed under a % node', NEW.node_type, v_parent_type;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_canonical_taxonomy_rules ON public.canonical_taxonomy_nodes;
CREATE TRIGGER trg_enforce_canonical_taxonomy_rules
    BEFORE INSERT OR UPDATE ON public.canonical_taxonomy_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_canonical_taxonomy_rules();

-- 3. Projection (AFTER) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_project_canonical_taxonomy_node()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prev TEXT := COALESCE(current_setting('app.taxonomy_projection_write', true), '');
BEGIN
    PERFORM set_config('app.taxonomy_projection_write', 'on', true);

    IF TG_OP = 'DELETE' THEN
        IF OLD.node_type = 'SUBJECT' THEN
            DELETE FROM public.subjects WHERE id = OLD.id;
        ELSIF OLD.node_type = 'TOPIC' THEN
            DELETE FROM public.topics WHERE id = OLD.id;
        ELSIF OLD.node_type = 'SUBTOPIC' THEN
            DELETE FROM public.subtopics WHERE id = OLD.id;
        END IF;
        PERFORM set_config('app.taxonomy_projection_write', v_prev, true);
        RETURN OLD;
    END IF;

    IF NEW.node_type = 'SUBJECT' THEN
        INSERT INTO public.subjects AS s (id, name, slug, display_order, is_active)
        VALUES (NEW.id, NEW.name, NEW.slug, NEW.display_order, NEW.is_active)
        ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name, slug = EXCLUDED.slug, display_order = EXCLUDED.display_order,
                is_active = EXCLUDED.is_active, updated_at = now()
            WHERE (s.name, s.slug, s.display_order, s.is_active)
                  IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.slug, EXCLUDED.display_order, EXCLUDED.is_active);
    ELSIF NEW.node_type = 'TOPIC' THEN
        INSERT INTO public.topics AS t (id, subject_id, name, slug, description, display_order, is_active)
        VALUES (NEW.id, NEW.root_subject_id, NEW.name, NEW.slug, NEW.metadata->>'description', NEW.display_order, NEW.is_active)
        ON CONFLICT (id) DO UPDATE
            SET subject_id = EXCLUDED.subject_id, name = EXCLUDED.name, slug = EXCLUDED.slug,
                description = COALESCE(EXCLUDED.description, t.description),
                display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active, updated_at = now()
            WHERE (t.subject_id, t.name, t.slug, t.display_order, t.is_active)
                  IS DISTINCT FROM (EXCLUDED.subject_id, EXCLUDED.name, EXCLUDED.slug, EXCLUDED.display_order, EXCLUDED.is_active)
               OR (EXCLUDED.description IS NOT NULL AND EXCLUDED.description IS DISTINCT FROM t.description);
    ELSIF NEW.node_type = 'SUBTOPIC' THEN
        INSERT INTO public.subtopics AS st (id, topic_id, name, slug, description, display_order, is_active)
        VALUES (NEW.id, NEW.parent_id, NEW.name, NEW.slug, NEW.metadata->>'description', NEW.display_order, NEW.is_active)
        ON CONFLICT (id) DO UPDATE
            SET topic_id = EXCLUDED.topic_id, name = EXCLUDED.name, slug = EXCLUDED.slug,
                description = COALESCE(EXCLUDED.description, st.description),
                display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active, updated_at = now()
            WHERE (st.topic_id, st.name, st.slug, st.display_order, st.is_active)
                  IS DISTINCT FROM (EXCLUDED.topic_id, EXCLUDED.name, EXCLUDED.slug, EXCLUDED.display_order, EXCLUDED.is_active)
               OR (EXCLUDED.description IS NOT NULL AND EXCLUDED.description IS DISTINCT FROM st.description);
    END IF;

    PERFORM set_config('app.taxonomy_projection_write', v_prev, true);
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_project_canonical_taxonomy_node() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_canonical_taxonomy_node ON public.canonical_taxonomy_nodes;
CREATE TRIGGER trg_project_canonical_taxonomy_node
    AFTER INSERT OR UPDATE OR DELETE ON public.canonical_taxonomy_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_project_canonical_taxonomy_node();

-- 4. Guard on the projection tables ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_taxonomy_projection_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('app.taxonomy_projection_write', true), '') <> 'on' THEN
        RAISE EXCEPTION 'TAXONOMY_PROJECTION_ONLY: % on public.% is not allowed; write public.canonical_taxonomy_nodes instead', TG_OP, TG_TABLE_NAME;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_subjects_projection ON public.subjects;
CREATE TRIGGER trg_guard_subjects_projection BEFORE INSERT OR UPDATE OR DELETE ON public.subjects
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_taxonomy_projection_write();
DROP TRIGGER IF EXISTS trg_guard_subjects_projection_truncate ON public.subjects;
CREATE TRIGGER trg_guard_subjects_projection_truncate BEFORE TRUNCATE ON public.subjects
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_guard_taxonomy_projection_write();

DROP TRIGGER IF EXISTS trg_guard_topics_projection ON public.topics;
CREATE TRIGGER trg_guard_topics_projection BEFORE INSERT OR UPDATE OR DELETE ON public.topics
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_taxonomy_projection_write();
DROP TRIGGER IF EXISTS trg_guard_topics_projection_truncate ON public.topics;
CREATE TRIGGER trg_guard_topics_projection_truncate BEFORE TRUNCATE ON public.topics
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_guard_taxonomy_projection_write();

DROP TRIGGER IF EXISTS trg_guard_subtopics_projection ON public.subtopics;
CREATE TRIGGER trg_guard_subtopics_projection BEFORE INSERT OR UPDATE OR DELETE ON public.subtopics
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_taxonomy_projection_write();
DROP TRIGGER IF EXISTS trg_guard_subtopics_projection_truncate ON public.subtopics;
CREATE TRIGGER trg_guard_subtopics_projection_truncate BEFORE TRUNCATE ON public.subtopics
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_guard_taxonomy_projection_write();

-- 5. Proof: projection mirrors nodes exactly -------------------------------------------
DO $$
DECLARE
    v_bad INTEGER;
BEGIN
    SELECT count(*) INTO v_bad
    FROM public.canonical_taxonomy_nodes n
    LEFT JOIN public.subjects s ON n.node_type = 'SUBJECT' AND s.id = n.id
    LEFT JOIN public.topics t ON n.node_type = 'TOPIC' AND t.id = n.id
    LEFT JOIN public.subtopics st ON n.node_type = 'SUBTOPIC' AND st.id = n.id
    WHERE (n.node_type = 'SUBJECT' AND (s.id IS NULL OR (s.name, s.slug, s.display_order, s.is_active) IS DISTINCT FROM (n.name, n.slug, n.display_order, n.is_active)))
       OR (n.node_type = 'TOPIC' AND (t.id IS NULL OR (t.subject_id, t.name, t.slug, t.display_order, t.is_active) IS DISTINCT FROM (n.root_subject_id, n.name, n.slug, n.display_order, n.is_active)))
       OR (n.node_type = 'SUBTOPIC' AND (st.id IS NULL OR (st.topic_id, st.name, st.slug, st.display_order, st.is_active) IS DISTINCT FROM (n.parent_id, n.name, n.slug, n.display_order, n.is_active)));
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'T3_PROJECTION_PROOF: % node(s) not mirrored exactly', v_bad;
    END IF;

    IF (SELECT count(*) FROM public.subjects) <> (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE node_type = 'SUBJECT')
       OR (SELECT count(*) FROM public.topics) <> (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE node_type = 'TOPIC')
       OR (SELECT count(*) FROM public.subtopics) <> (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE node_type = 'SUBTOPIC') THEN
        RAISE EXCEPTION 'T3_PROJECTION_PROOF: projection row counts differ from node counts';
    END IF;
END $$;

-- End of 070.
