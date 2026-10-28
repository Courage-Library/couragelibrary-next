-- =====================================================================================================================
-- 124 INTAKE-ASSIST-1 + INTAKE-CONCEPTS-AS-OUTLINE (architect CONDITIONAL GO, 2026-10-28; conditions C1–C6)
-- CONDITIONAL GO rules + MIGRATION-LIVE-SET. Rollback: docs/database/rollback/124_rollback.sql. No BEGIN / COMMIT.
--   syllabus_intake_items.decision + OUTLINE ("Keep as lesson outline"): CONCEPT items only, no master-tree node; not
--     final (the owner can still promote the concept: decide it again as APPROVE_NEW / LINK)
--   syllabus_intake_batches + syllabus_intake_items.decided_in_batch: one row per bulk action (undo, newest first)
--   fn_syllabus_intake__approve_node — the APPROVE_NEW node creation, shared by the single decision and the bulk
--     approve, so both write the same node + the same TAXONOMY_NODE_CREATE / alias audit rows (C2)
--   fn_syllabus_intake_decide — + OUTLINE; IGNORE also covers OUTLINE items below; a single decision clears
--     decided_in_batch (so a bulk action whose item changed afterwards can no longer be undone)
--   fn_syllabus_intake_bulk — LINK_EXACT (EXACT items only) | APPROVE_CHILDREN (NEW subtopics only; never topics, C4)
--     | KEEP_OUTLINE (concepts only); ≤ 1000 undecided items; parents first; ONE transaction, the session row locked
--     FOR UPDATE (C3), ONE SYLLABUS_INTAKE_BULK audit row listing the item ids
--   fn_syllabus_intake_bulk_undo — the newest not-undone batch of the session only (C3); refused if an item changed
--     afterwards, if anything below it was decided afterwards, or if any node the batch created is referenced from
--     ANY table (checked inside the same transaction; nothing is undone partially, C5)
--   fn_syllabus_intake_import — OUTLINE items are not mapped (their subtopic is the unit's mapping target); each topic
--     unit gets metadata.outlines {subtopic node id: {subtopic, items[]}}; + p_source_check (VERIFIED | UNVERIFIABLE,
--     recorded; UNVERIFIABLE marks the paper uncertain). The new last parameter has a default, so 4-argument calls work.
-- C1: every function is SECURITY INVOKER with EXECUTE for service_role only (the existing intake functions' model):
--   the actor is the server's auth context (guardAdminAction), never a client argument; anon / authenticated revoked.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261028000123_launch_mode_1.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'IA1_PREFLIGHT: 123 is not applied';
    END IF;
END
$pre$;

-- ------------------------------------------------------------------ OUTLINE + batches
ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT syllabus_intake_items_decision_check;
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT syllabus_intake_items_decision_check
    CHECK (decision IS NULL OR decision IN ('LINK', 'ALIAS', 'APPROVE_NEW', 'IGNORE', 'OUTLINE'));
ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT chk_intake_decision_node;
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT chk_intake_decision_node CHECK (
    decision IS NULL
    OR (decision IN ('IGNORE', 'OUTLINE') AND decision_node_id IS NULL)
    OR (decision NOT IN ('IGNORE', 'OUTLINE') AND decision_node_id IS NOT NULL));
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT chk_intake_outline_concept CHECK (decision IS DISTINCT FROM 'OUTLINE' OR level = 'CONCEPT');

CREATE TABLE public.syllabus_intake_batches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- the order of bulk actions ("newest" for undo); created_at is the transaction time, equal within one transaction
    seq               bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    session_id        uuid NOT NULL REFERENCES public.syllabus_intake_sessions(id) ON DELETE CASCADE,
    action            text NOT NULL CHECK (action IN ('LINK_EXACT', 'APPROVE_CHILDREN', 'KEEP_OUTLINE')),
    item_ids          uuid[] NOT NULL CHECK (cardinality(item_ids) BETWEEN 1 AND 1000),
    created_node_ids  uuid[] NOT NULL DEFAULT '{}',
    created_by        uuid,
    created_by_email  text NOT NULL CHECK (btrim(created_by_email) <> ''),
    created_at        timestamptz NOT NULL DEFAULT now(),
    undone_at         timestamptz,
    undone_by         uuid,
    undone_by_email   text,
    CONSTRAINT chk_intake_batch_undone CHECK ((undone_at IS NULL) = (undone_by_email IS NULL))
);
CREATE INDEX idx_syllabus_intake_batches_session ON public.syllabus_intake_batches (session_id, seq DESC);
COMMENT ON TABLE public.syllabus_intake_batches IS 'INTAKE-ASSIST-1: one owner bulk action on an intake (item ids, nodes it created); the newest not-undone one can be undone until the draft is created.';
ALTER TABLE public.syllabus_intake_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.syllabus_intake_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.syllabus_intake_batches TO service_role;

ALTER TABLE public.syllabus_intake_items ADD COLUMN decided_in_batch uuid REFERENCES public.syllabus_intake_batches(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.syllabus_intake_items.decided_in_batch IS 'INTAKE-ASSIST-1: the bulk action that made the current decision (NULL after any single decision).';

-- ------------------------------------------------------------------ the shared APPROVE_NEW (C2: one code path)
CREATE FUNCTION public.fn_syllabus_intake__approve_node(
    p_item public.syllabus_intake_items, p_scope uuid, p_actor_id uuid, p_actor_email text, OUT node_id uuid, OUT aliases jsonb)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_slug  text;
    v_value text;
BEGIN
    aliases := '[]'::jsonb;
    IF p_item.level <> 'SUBJECT' AND p_scope IS NULL THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the parent of "%" has no node yet', p_item.raw_name USING ERRCODE = 'P0001';
    END IF;
    v_slug := public.fn_syllabus__slugify(p_item.raw_name);
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: "%" gives no usable slug; rename it first', p_item.raw_name USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.canonical_taxonomy_nodes (parent_id, node_type, name, name_hi, slug, display_order, is_active, metadata)
    VALUES (p_scope, p_item.level, btrim(p_item.raw_name), p_item.raw_name_hi, v_slug,
            coalesce((SELECT max(display_order) + 1 FROM public.canonical_taxonomy_nodes WHERE parent_id IS NOT DISTINCT FROM p_scope), 0),
            true, jsonb_build_object('source', 'SYLLABUS_INTAKE', 'intake_item_id', p_item.id))
    RETURNING id INTO node_id;
    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_CREATE', node_id, NULL,
        jsonb_build_object('name', p_item.raw_name, 'name_hi', p_item.raw_name_hi, 'node_type', p_item.level,
                           'parent_id', p_scope, 'slug', v_slug, 'intake_item_id', p_item.id), 'syllabus intake: approved as new');
    -- the item's own aliases come with the new node
    FOREACH v_value IN ARRAY p_item.aliases LOOP
        CONTINUE WHEN public.fn_taxonomy_normalize(v_value) = public.fn_taxonomy_normalize(p_item.raw_name);
        PERFORM public.fn_taxonomy_add_alias(node_id, v_value, 'en', 'INTAKE', p_actor_id, p_actor_email);
        aliases := aliases || jsonb_build_array(v_value);
    END LOOP;
END
$fn$;

-- ------------------------------------------------------------------ the single decision (+ OUTLINE)
CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_decide(
    p_item_id uuid, p_decision text, p_node_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_item     public.syllabus_intake_items%ROWTYPE;
    v_parent   public.syllabus_intake_items%ROWTYPE;
    v_status   text;
    v_scope    uuid;   -- the master-tree parent of this item's node (NULL for a SUBJECT)
    v_node     public.canonical_taxonomy_nodes%ROWTYPE;
    v_result   uuid;
    v_value    text;
    v_lang     text;
    v_aliases  jsonb := '[]'::jsonb;
    v_ignored  integer := 0;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_item FROM public.syllabus_intake_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: item % does not exist', p_item_id USING ERRCODE = 'P0002'; END IF;
    SELECT status INTO v_status FROM public.syllabus_intake_sessions WHERE id = v_item.session_id FOR UPDATE;
    IF v_status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: the intake is % and can no longer change', v_status USING ERRCODE = 'P0001'; END IF;
    IF v_item.level = 'PAPER' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: papers are not master-tree nodes; nothing to decide' USING ERRCODE = '22023'; END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('LINK', 'ALIAS', 'APPROVE_NEW', 'IGNORE', 'OUTLINE') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: unknown decision %', p_decision USING ERRCODE = '22023';
    END IF;
    IF p_decision = 'OUTLINE' AND v_item.level <> 'CONCEPT' THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: only a concept can be kept as a lesson outline ("%" is a %)', v_item.raw_name, lower(v_item.level) USING ERRCODE = '22023';
    END IF;
    IF v_item.decision IN ('ALIAS', 'APPROVE_NEW') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: "%" already changed the master tree (%); it cannot be re-decided', v_item.raw_name, v_item.decision USING ERRCODE = 'P0001';
    END IF;
    IF v_item.decision IS NOT NULL AND EXISTS (SELECT 1 FROM public.syllabus_intake_items
                                               WHERE parent_item_id = p_item_id AND decision IS NOT NULL AND decision <> 'IGNORE') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: items below "%" are already decided; it cannot be re-decided', v_item.raw_name USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_parent FROM public.syllabus_intake_items WHERE id = v_item.parent_item_id;
    IF v_item.level <> 'SUBJECT' THEN
        IF v_parent.decision IS NULL OR v_parent.decision = 'IGNORE' THEN
            IF p_decision <> 'IGNORE' THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: decide the parent "%" first (it is %)', v_parent.raw_name, coalesce(v_parent.decision, 'undecided')
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
        v_scope := v_parent.decision_node_id;
    END IF;

    IF p_decision = 'IGNORE' THEN
        -- the item and its whole subtree (items kept as an outline below it are ignored with it)
        WITH RECURSIVE sub AS (
            SELECT id FROM public.syllabus_intake_items WHERE id = p_item_id
            UNION ALL
            SELECT c.id FROM public.syllabus_intake_items c JOIN sub ON c.parent_item_id = sub.id)
        UPDATE public.syllabus_intake_items i
           SET decision = 'IGNORE', decision_node_id = NULL, decided_by = p_actor_id, decided_by_email = p_actor_email, decided_at = now(),
               decided_in_batch = NULL
          FROM sub WHERE i.id = sub.id AND (i.decision IS DISTINCT FROM 'IGNORE')
                     AND (i.id = p_item_id OR i.decision IS NULL OR i.decision IN ('LINK', 'OUTLINE'));
        GET DIAGNOSTICS v_ignored = ROW_COUNT;
    ELSIF p_decision IN ('LINK', 'ALIAS') THEN
        SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = p_node_id;
        IF NOT FOUND OR NOT v_node.is_active OR v_node.node_type <> v_item.level OR v_node.parent_id IS DISTINCT FROM v_scope THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: link "%" to an active % under %', v_item.raw_name, lower(v_item.level),
                CASE WHEN v_scope IS NULL THEN 'the root' ELSE 'the parent''s node' END USING ERRCODE = '22023';
        END IF;
        IF p_decision = 'ALIAS' THEN
            FOREACH v_lang IN ARRAY ARRAY['en', 'hi'] LOOP
                v_value := CASE v_lang WHEN 'en' THEN v_item.raw_name ELSE v_item.raw_name_hi END;
                CONTINUE WHEN v_value IS NULL;
                CONTINUE WHEN public.fn_taxonomy_normalize(v_value) IN (public.fn_taxonomy_normalize(v_node.name), public.fn_taxonomy_normalize(v_node.name_hi));
                CONTINUE WHEN EXISTS (SELECT 1 FROM public.taxonomy_node_aliases WHERE node_id = v_node.id AND normalized_alias = public.fn_taxonomy_normalize(v_value));
                PERFORM public.fn_taxonomy_add_alias(v_node.id, v_value, v_lang, 'INTAKE', p_actor_id, p_actor_email);
                v_aliases := v_aliases || jsonb_build_array(v_value);
            END LOOP;
        END IF;
        v_result := v_node.id;
    ELSIF p_decision = 'APPROVE_NEW' THEN
        SELECT a.node_id, a.aliases INTO v_result, v_aliases FROM public.fn_syllabus_intake__approve_node(v_item, v_scope, p_actor_id, p_actor_email) a;
    ELSE -- OUTLINE: no node; the concept becomes a line of its subtopic's lesson outline
        v_result := NULL;
    END IF;

    IF p_decision <> 'IGNORE' THEN
        UPDATE public.syllabus_intake_items
           SET decision = p_decision, decision_node_id = v_result, decided_by = p_actor_id, decided_by_email = p_actor_email, decided_at = now(),
               decided_in_batch = NULL
         WHERE id = p_item_id;
    END IF;
    UPDATE public.syllabus_intake_sessions SET updated_at = now() WHERE id = v_item.session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_DECISION', 'syllabus_intake_item', p_item_id,
        jsonb_build_object('session_id', v_item.session_id, 'item', v_item.raw_name, 'level', v_item.level, 'decision', p_decision,
                           'node_id', v_result, 'aliases_added', v_aliases, 'ignored', v_ignored,
                           'previous_decision', v_item.decision));
    RETURN jsonb_build_object('item_id', p_item_id, 'decision', p_decision, 'node_id', v_result, 'aliases_added', v_aliases, 'ignored', v_ignored);
END
$fn$;

-- ------------------------------------------------------------------ bulk (one transaction, one audit row)
CREATE FUNCTION public.fn_syllabus_intake_bulk(p_session_id uuid, p_action text, p_item_ids uuid[], p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_status   text;
    v_ids      uuid[];
    v_n        integer;
    v_batch    uuid;
    r          public.syllabus_intake_items%ROWTYPE;
    v_parent   public.syllabus_intake_items%ROWTYPE;
    v_scope    uuid;
    v_node     public.canonical_taxonomy_nodes%ROWTYPE;
    v_result   uuid;
    v_decision text;
    v_created  uuid[] := '{}';
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_action IS NULL OR p_action NOT IN ('LINK_EXACT', 'APPROVE_CHILDREN', 'KEEP_OUTLINE') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: unknown bulk action %', p_action USING ERRCODE = '22023';
    END IF;
    v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_item_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
    IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: choose at least one item' USING ERRCODE = '22023'; END IF;
    IF cardinality(v_ids) > 1000 THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: at most 1000 items per bulk action (got %)', cardinality(v_ids) USING ERRCODE = '22023'; END IF;
    -- C3: the session row serialises every decision on this intake (single, bulk, undo, import)
    SELECT status INTO v_status FROM public.syllabus_intake_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: intake % does not exist', p_session_id USING ERRCODE = 'P0002'; END IF;
    IF v_status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: the intake is % and can no longer change', v_status USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO v_n FROM public.syllabus_intake_items WHERE id = ANY(v_ids) AND session_id = p_session_id;
    IF v_n <> cardinality(v_ids) THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: % item(s) are not part of this intake', cardinality(v_ids) - v_n USING ERRCODE = '22023'; END IF;
    SELECT count(*) INTO v_n FROM public.syllabus_intake_items WHERE id = ANY(v_ids) AND decision IS NOT NULL;
    IF v_n > 0 THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: % item(s) are already decided; reload the page', v_n USING ERRCODE = 'P0001'; END IF;

    INSERT INTO public.syllabus_intake_batches (session_id, action, item_ids, created_by, created_by_email)
    VALUES (p_session_id, p_action, v_ids, p_actor_id, p_actor_email) RETURNING id INTO v_batch;

    -- parents first: a subject before its topics, a topic before its subtopics (the same rule as a single decision)
    FOR r IN SELECT * FROM public.syllabus_intake_items WHERE id = ANY(v_ids)
              ORDER BY array_position(ARRAY['SUBJECT', 'TOPIC', 'SUBTOPIC', 'CONCEPT', 'PAPER'], level), item_key LOOP
        IF r.level = 'PAPER' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: papers are not master-tree nodes; nothing to decide' USING ERRCODE = '22023'; END IF;
        IF p_action = 'LINK_EXACT' AND (r.match_status <> 'EXACT' OR r.matched_node_id IS NULL) THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: only exact matches can be linked in bulk ("%" is %)', r.raw_name, lower(r.match_status) USING ERRCODE = '22023';
        END IF;
        IF p_action = 'APPROVE_CHILDREN' AND r.level <> 'SUBTOPIC' THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: bulk approve is for subtopics only ("%" is a %); decide it on its own', r.raw_name, lower(r.level) USING ERRCODE = '22023';
        END IF;
        IF p_action = 'APPROVE_CHILDREN' AND r.match_status <> 'NEW' THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: "%" may already exist (%); decide it on its own', r.raw_name, lower(r.match_status) USING ERRCODE = '22023';
        END IF;
        IF p_action = 'KEEP_OUTLINE' AND r.level <> 'CONCEPT' THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: only a concept can be kept as a lesson outline ("%" is a %)', r.raw_name, lower(r.level) USING ERRCODE = '22023';
        END IF;
        v_scope := NULL;
        IF r.level <> 'SUBJECT' THEN
            SELECT * INTO v_parent FROM public.syllabus_intake_items WHERE id = r.parent_item_id;
            IF v_parent.decision IS NULL OR v_parent.decision IN ('IGNORE', 'OUTLINE') THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: decide the parent "%" first (it is %)', v_parent.raw_name, coalesce(lower(v_parent.decision), 'undecided')
                    USING ERRCODE = 'P0001';
            END IF;
            v_scope := v_parent.decision_node_id;
        END IF;
        IF p_action = 'LINK_EXACT' THEN
            SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = r.matched_node_id;
            IF NOT FOUND OR NOT v_node.is_active OR v_node.node_type <> r.level OR v_node.parent_id IS DISTINCT FROM v_scope THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: link "%" to an active % under %', r.raw_name, lower(r.level),
                    CASE WHEN v_scope IS NULL THEN 'the root' ELSE 'the parent''s node' END USING ERRCODE = '22023';
            END IF;
            v_result := v_node.id;
            v_decision := 'LINK';
        ELSIF p_action = 'APPROVE_CHILDREN' THEN
            BEGIN
                SELECT a.node_id INTO v_result FROM public.fn_syllabus_intake__approve_node(r, v_scope, p_actor_id, p_actor_email) a;
            EXCEPTION WHEN unique_violation THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: "%" already exists under its parent; link it on its own instead', r.raw_name USING ERRCODE = 'P0001';
            END;
            v_created := v_created || v_result;
            v_decision := 'APPROVE_NEW';
        ELSE
            v_result := NULL;
            v_decision := 'OUTLINE';
        END IF;
        UPDATE public.syllabus_intake_items
           SET decision = v_decision, decision_node_id = v_result, decided_by = p_actor_id, decided_by_email = p_actor_email, decided_at = now(),
               decided_in_batch = v_batch
         WHERE id = r.id;
    END LOOP;

    UPDATE public.syllabus_intake_batches SET created_node_ids = v_created WHERE id = v_batch;
    UPDATE public.syllabus_intake_sessions SET updated_at = now() WHERE id = p_session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_BULK', 'syllabus_intake_session', p_session_id,
        jsonb_build_object('batch_id', v_batch, 'action', p_action, 'count', cardinality(v_ids), 'item_ids', to_jsonb(v_ids),
                           'created_node_ids', to_jsonb(v_created)));
    RETURN jsonb_build_object('batch_id', v_batch, 'action', p_action, 'count', cardinality(v_ids), 'created', cardinality(v_created));
END
$fn$;

-- ------------------------------------------------------------------ undo the newest bulk action (all or nothing)
CREATE FUNCTION public.fn_syllabus_intake_bulk_undo(p_session_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_status text;
    b        public.syllabus_intake_batches%ROWTYPE;
    v_n      bigint;
    fk       record;
    v_alias  record;
    v_node   public.canonical_taxonomy_nodes%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT status INTO v_status FROM public.syllabus_intake_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: intake % does not exist', p_session_id USING ERRCODE = 'P0002'; END IF;
    IF v_status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: the intake is % and can no longer change', v_status USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO b FROM public.syllabus_intake_batches WHERE session_id = p_session_id AND undone_at IS NULL
     ORDER BY seq DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: there is no bulk action to undo' USING ERRCODE = 'P0002'; END IF;

    SELECT count(*) INTO v_n FROM public.syllabus_intake_items WHERE id = ANY(b.item_ids) AND decided_in_batch IS DISTINCT FROM b.id;
    IF v_n > 0 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: % item(s) of the last bulk action were changed afterwards; it can no longer be undone', v_n USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO v_n FROM public.syllabus_intake_items c
     WHERE c.parent_item_id = ANY(b.item_ids) AND c.decision IS NOT NULL AND NOT (c.id = ANY(b.item_ids));
    IF v_n > 0 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: % item(s) below the last bulk action were decided afterwards; undo or change those first', v_n USING ERRCODE = 'P0001';
    END IF;

    -- the batch's own items first (they point at the nodes it created)
    UPDATE public.syllabus_intake_items
       SET decision = NULL, decision_node_id = NULL, decided_by = NULL, decided_by_email = NULL, decided_at = NULL, decided_in_batch = NULL
     WHERE id = ANY(b.item_ids);

    IF cardinality(b.created_node_ids) > 0 THEN
        -- C5: any reference to a node it created, from ANY table (every foreign key to the master tree, including the
        -- cascading ones), refuses the whole undo; the batch's own aliases (source INTAKE, same transaction) excepted.
        -- Schema retired (GAP2-4c, 084) is frozen legacy data — nothing can reference a node created after it — and is
        -- not readable by service_role, so its foreign keys are not scanned.
        FOR fk IN SELECT c.conrelid::regclass AS tbl, a.attname AS col
                    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                   WHERE c.contype = 'f' AND c.confrelid = 'public.canonical_taxonomy_nodes'::regclass
                     AND c.connamespace <> 'retired'::regnamespace
                   ORDER BY 1, 2 LOOP
            IF fk.tbl = 'public.canonical_taxonomy_nodes'::regclass THEN
                -- a created node's own derived columns point at itself; any OTHER node (e.g. a child added since) counts
                EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1) AND NOT (id = ANY($1))', fk.tbl, fk.col) INTO v_n USING b.created_node_ids;
            ELSIF fk.tbl = 'public.taxonomy_node_aliases'::regclass THEN
                EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1) AND NOT (source = %L AND created_at = $2)', fk.tbl, fk.col, 'INTAKE')
                   INTO v_n USING b.created_node_ids, b.created_at;
            ELSE
                EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1)', fk.tbl, fk.col) INTO v_n USING b.created_node_ids;
            END IF;
            IF v_n > 0 THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: a node created by the last bulk action is now in use (% in %); it can no longer be undone', v_n, fk.tbl
                    USING ERRCODE = 'P0001';
            END IF;
        END LOOP;
        FOR v_alias IN SELECT id FROM public.taxonomy_node_aliases WHERE node_id = ANY(b.created_node_ids) ORDER BY created_at, id LOOP
            PERFORM public.fn_taxonomy_remove_alias(v_alias.id, p_actor_id, p_actor_email);
        END LOOP;
        FOR v_node IN SELECT * FROM public.canonical_taxonomy_nodes WHERE id = ANY(b.created_node_ids) ORDER BY id LOOP
            DELETE FROM public.canonical_taxonomy_nodes WHERE id = v_node.id;
            PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_DELETE', v_node.id,
                jsonb_build_object('name', v_node.name, 'node_type', v_node.node_type, 'parent_id', v_node.parent_id, 'slug', v_node.slug,
                                   'intake_batch_id', b.id),
                NULL, 'syllabus intake: bulk approve undone');
        END LOOP;
    END IF;

    UPDATE public.syllabus_intake_batches SET undone_at = now(), undone_by = p_actor_id, undone_by_email = p_actor_email WHERE id = b.id;
    UPDATE public.syllabus_intake_sessions SET updated_at = now() WHERE id = p_session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_BULK_UNDO', 'syllabus_intake_session', p_session_id,
        jsonb_build_object('batch_id', b.id, 'action', b.action, 'count', cardinality(b.item_ids), 'item_ids', to_jsonb(b.item_ids),
                           'deleted_node_ids', to_jsonb(b.created_node_ids)));
    RETURN jsonb_build_object('batch_id', b.id, 'action', b.action, 'count', cardinality(b.item_ids), 'deleted', cardinality(b.created_node_ids));
END
$fn$;

-- ------------------------------------------------------------------ import (+ outlines, + source check)
DROP FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text);

CREATE FUNCTION public.fn_syllabus_intake_import(p_session_id uuid, p_version_tag text, p_actor_id uuid, p_actor_email text, p_source_check text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    s        public.syllabus_intake_sessions%ROWTYPE;
    v_ver    public.exam_syllabus_versions;
    v_open   integer;
    rp       record;
    rs       record;
    rt       record;
    v_pid    uuid;
    v_sid    uuid;
    v_uid    uuid;
    v_targets uuid[];
    v_outlines jsonb;
    v_papers integer := 0;
    v_sections integer := 0;
    v_units  integer := 0;
    v_maps   integer := 0;
    v_outline_items integer := 0;
    v_n_outline integer;
    v_tag   text := NULLIF(btrim(coalesce(p_version_tag, '')), '');
    v_unverified_reason constant text := 'The notification named in "based on" could not be verified on the official website.';
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_source_check IS NOT NULL AND p_source_check NOT IN ('VERIFIED', 'UNVERIFIABLE') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the source check must be VERIFIED or UNVERIFIABLE' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO s FROM public.syllabus_intake_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: intake % does not exist', p_session_id USING ERRCODE = 'P0002'; END IF;
    IF s.status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: the intake is %', s.status USING ERRCODE = 'P0001'; END IF;
    IF v_tag IS NOT NULL AND (v_tag !~ '^[a-z0-9]+([-.][a-z0-9]+)*$' OR char_length(v_tag) > 80) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the version tag must be lower-case letters, digits, "-" or "."' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_open FROM public.syllabus_intake_items WHERE session_id = p_session_id AND level <> 'PAPER' AND decision IS NULL;
    IF v_open > 0 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: % items are not decided yet', v_open USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || s.exam_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE exam_id = s.exam_id AND exam_cycle_id IS NOT DISTINCT FROM s.exam_cycle_id
                 AND tier IS NOT DISTINCT FROM s.tier AND status = 'DRAFT') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: a DRAFT is already open for this exam / cycle / tier; publish or delete it first' USING ERRCODE = 'P0001';
    END IF;

    v_ver := public.fn_syllabus__create_version(s.exam_id, s.exam_cycle_id, v_tag, 'IMPORT', NULL, s.payload_sha256,
        jsonb_build_object('intake', jsonb_strip_nulls(jsonb_build_object('session_id', s.id, 'contract_version', s.contract_version,
                                                        'based_on', s.based_on, 'source_url', s.source_url,
                                                        'as_of', s.as_of_date, 'payload_sha256', s.payload_sha256,
                                                        'source_check', p_source_check))));
    UPDATE public.exam_syllabus_versions SET tier = s.tier, created_by = p_actor_id WHERE id = v_ver.id;

    FOR rp IN SELECT * FROM public.syllabus_intake_items WHERE session_id = p_session_id AND level = 'PAPER' ORDER BY position, item_key LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE parent_item_id = rp.id AND decision <> 'IGNORE');
        v_pid := public.fn_syllabus__insert_node(v_ver.id, NULL, 'PAPER', rp.raw_name, NULL, rp.position + 1, NULL, NULL, rp.questions, rp.questions, true);
        UPDATE public.exam_syllabus_nodes SET metadata = jsonb_strip_nulls(jsonb_build_object(
                   'marks', rp.marks,
                   'uncertain', CASE WHEN rp.uncertain OR p_source_check = 'UNVERIFIABLE' THEN true END,
                   'uncertain_reason', CASE WHEN p_source_check = 'UNVERIFIABLE' THEN coalesce(rp.uncertain_reason, v_unverified_reason) ELSE rp.uncertain_reason END,
                   'intake_item_id', rp.id,
                   'duration_minutes', rp.duration_minutes,
                   'negative_marking', rp.negative_marking))
         WHERE id = v_pid;
        v_papers := v_papers + 1;
        FOR rs IN SELECT * FROM public.syllabus_intake_items WHERE parent_item_id = rp.id AND decision <> 'IGNORE' ORDER BY position, item_key LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE parent_item_id = rs.id AND decision <> 'IGNORE');
            v_sid := public.fn_syllabus__insert_node(v_ver.id, v_pid, 'SECTION', rs.raw_name, NULL, rs.position + 1, NULL, rs.weightage_tier,
                                                     rs.questions, rs.questions, true);
            UPDATE public.exam_syllabus_nodes SET metadata = jsonb_strip_nulls(jsonb_build_object('marks', rs.marks, 'uncertain', CASE WHEN rs.uncertain THEN true END,
                                                                                                   'uncertain_reason', rs.uncertain_reason, 'subject_id', rs.decision_node_id,
                                                                                                   'intake_item_id', rs.id))
             WHERE id = v_sid;
            v_sections := v_sections + 1;
            FOR rt IN SELECT * FROM public.syllabus_intake_items WHERE parent_item_id = rs.id AND decision <> 'IGNORE' ORDER BY position, item_key LOOP
                v_uid := public.fn_syllabus__insert_node(v_ver.id, v_sid, 'UNIT', rt.raw_name, NULL, rt.position + 1, NULL, rt.weightage_tier,
                                                         rt.questions, rt.questions, true);
                -- the deepest decided NODE level below the topic, else the topic itself (outline items have no node: a
                -- subtopic whose concepts are kept as an outline is itself the deepest level)
                WITH RECURSIVE below AS (
                    SELECT i.id, i.decision_node_id, i.level FROM public.syllabus_intake_items i
                     WHERE i.parent_item_id = rt.id AND i.decision NOT IN ('IGNORE', 'OUTLINE')
                    UNION ALL
                    SELECT c.id, c.decision_node_id, c.level FROM public.syllabus_intake_items c JOIN below b ON c.parent_item_id = b.id
                     WHERE c.decision NOT IN ('IGNORE', 'OUTLINE'))
                SELECT array_agg(DISTINCT b.decision_node_id) INTO v_targets FROM below b
                 WHERE NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items c WHERE c.parent_item_id = b.id AND c.decision NOT IN ('IGNORE', 'OUTLINE'));
                IF v_targets IS NULL OR cardinality(v_targets) > 20 THEN
                    v_targets := ARRAY[rt.decision_node_id];
                END IF;
                INSERT INTO public.exam_syllabus_canonical_mappings
                    (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, reviewed_by, reviewed_at)
                SELECT v_uid, t, CASE WHEN rt.decision = 'ALIAS' THEN 'ALIAS_MATCH' ELSE 'MANUALLY_MAPPED' END, 1.00, 'SYLLABUS_INTAKE', p_actor_id, now()
                  FROM unnest(v_targets) t;
                v_maps := v_maps + cardinality(v_targets);
                -- INTAKE-CONCEPTS-AS-OUTLINE: {subtopic node id: {subtopic, items[] in order}} for every subtopic with
                -- concepts kept as an outline (the LESSON prompt's MUST COVER list for that subtopic)
                SELECT jsonb_object_agg(st.decision_node_id::text, jsonb_build_object('subtopic', st.raw_name, 'items', o.items)),
                       coalesce(sum(jsonb_array_length(o.items)), 0)::integer
                  INTO v_outlines, v_n_outline
                  FROM public.syllabus_intake_items st
                  JOIN LATERAL (SELECT jsonb_agg(c.raw_name ORDER BY c.position, c.item_key) AS items
                                  FROM public.syllabus_intake_items c WHERE c.parent_item_id = st.id AND c.decision = 'OUTLINE') o ON o.items IS NOT NULL
                 WHERE st.parent_item_id = rt.id AND st.decision NOT IN ('IGNORE', 'OUTLINE') AND st.decision_node_id IS NOT NULL;
                v_outline_items := v_outline_items + coalesce(v_n_outline, 0);
                -- the topic and every non-ignored item below it: uncertain flags + headings deeper than L4 (in order),
                -- SYLLABUS-PROMPT-2: the topic's origin + avg_questions and the origin counts of the items below it
                UPDATE public.exam_syllabus_nodes
                   SET metadata = (
                       WITH RECURSIVE sub AS (
                           SELECT i.id, i.item_key, i.uncertain, i.extra_headings, i.origin, 0 AS depth FROM public.syllabus_intake_items i WHERE i.id = rt.id
                           UNION ALL
                           SELECT c.id, c.item_key, c.uncertain, c.extra_headings, c.origin, sub.depth + 1 FROM public.syllabus_intake_items c JOIN sub ON c.parent_item_id = sub.id
                            WHERE c.decision <> 'IGNORE')
                       SELECT jsonb_strip_nulls(jsonb_build_object(
                           'marks', rt.marks, 'uncertain', CASE WHEN bool_or(sub.uncertain) THEN true END,
                           'uncertain_reason', rt.uncertain_reason, 'intake_item_id', rt.id,
                           'origin', rt.origin, 'avg_questions', rt.avg_questions,
                           'origins_below', CASE WHEN count(sub.origin) FILTER (WHERE sub.depth > 0) > 0 THEN jsonb_build_object(
                               'OFFICIAL', count(*) FILTER (WHERE sub.depth > 0 AND sub.origin = 'OFFICIAL'),
                               'PYQ_TREND', count(*) FILTER (WHERE sub.depth > 0 AND sub.origin = 'PYQ_TREND'),
                               'EXPANDED', count(*) FILTER (WHERE sub.depth > 0 AND sub.origin = 'EXPANDED')) END,
                           'headings', (SELECT jsonb_agg(h.x ORDER BY h.k, h.o) FROM (
                               SELECT s2.item_key k, e.x, e.o FROM sub s2, unnest(s2.extra_headings) WITH ORDINALITY e(x, o)) h),
                           'outlines', v_outlines))
                         FROM sub)
                 WHERE id = v_uid;
                v_units := v_units + 1;
            END LOOP;
        END LOOP;
    END LOOP;
    IF v_units = 0 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: every topic is ignored; nothing to import' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.syllabus_intake_sessions SET status = 'IMPORTED', imported_version_id = v_ver.id, updated_at = now() WHERE id = p_session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_IMPORT', 'exam_syllabus_version', v_ver.id,
        jsonb_build_object('session_id', p_session_id, 'exam_id', s.exam_id, 'exam_cycle_id', s.exam_cycle_id, 'tier', s.tier,
                           'version_number', v_ver.version_number, 'papers', v_papers, 'sections', v_sections, 'units', v_units,
                           'mappings', v_maps, 'outline_items', v_outline_items, 'contract_version', s.contract_version, 'based_on', s.based_on,
                           'source_url', s.source_url, 'payload_sha256', s.payload_sha256, 'source_check', p_source_check));
    RETURN jsonb_build_object('version_id', v_ver.id, 'version_number', v_ver.version_number, 'papers', v_papers,
                              'sections', v_sections, 'units', v_units, 'mappings', v_maps, 'outline_items', v_outline_items);
END
$fn$;

-- ------------------------------------------------------------------ grants (C1: service_role only)
REVOKE ALL ON FUNCTION public.fn_syllabus_intake__approve_node(public.syllabus_intake_items, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_bulk(uuid, text, uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_bulk_undo(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake__approve_node(public.syllabus_intake_items, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_bulk(uuid, text, uuid[], uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_bulk_undo(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text, text) TO service_role;
