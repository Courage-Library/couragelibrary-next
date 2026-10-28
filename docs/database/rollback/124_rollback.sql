-- Rollback for 20261028000124_intake_assist_1.sql. Run as ONE transaction by the operator.
-- Restores the exact 116/119 fn_syllabus_intake_decide and 4-argument fn_syllabus_intake_import (pg_get_functiondef of the
-- live functions before 124), the original decision CHECKs, and drops what 124 added. Refuses while an item is kept as an
-- OUTLINE (the 123 CHECK has no OUTLINE: decide those concepts again first, or discard the intake). Bulk-created nodes
-- stay (they are ordinary audited master-tree nodes); the batches table and its history are dropped.
BEGIN;

DO $chk$ BEGIN
  IF EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE decision = 'OUTLINE') THEN
    RAISE EXCEPTION 'ROLLBACK 124: % item(s) are kept as a lesson outline; decide them again or discard their intake first',
      (SELECT count(*) FROM public.syllabus_intake_items WHERE decision = 'OUTLINE');
  END IF;
END $chk$;

DROP FUNCTION public.fn_syllabus_intake_bulk_undo(uuid, uuid, text);
DROP FUNCTION public.fn_syllabus_intake_bulk(uuid, text, uuid[], uuid, text);
DROP FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_decide(p_item_id uuid, p_decision text, p_node_id uuid, p_actor_id uuid, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_item     public.syllabus_intake_items%ROWTYPE;
    v_parent   public.syllabus_intake_items%ROWTYPE;
    v_status   text;
    v_scope    uuid;   -- the master-tree parent of this item's node (NULL for a SUBJECT)
    v_node     public.canonical_taxonomy_nodes%ROWTYPE;
    v_result   uuid;
    v_slug     text;
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
    IF p_decision NOT IN ('LINK', 'ALIAS', 'APPROVE_NEW', 'IGNORE') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: unknown decision %', p_decision USING ERRCODE = '22023';
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
        -- the item and its whole subtree
        WITH RECURSIVE sub AS (
            SELECT id FROM public.syllabus_intake_items WHERE id = p_item_id
            UNION ALL
            SELECT c.id FROM public.syllabus_intake_items c JOIN sub ON c.parent_item_id = sub.id)
        UPDATE public.syllabus_intake_items i
           SET decision = 'IGNORE', decision_node_id = NULL, decided_by = p_actor_id, decided_by_email = p_actor_email, decided_at = now()
          FROM sub WHERE i.id = sub.id AND (i.decision IS DISTINCT FROM 'IGNORE')
                     AND (i.id = p_item_id OR i.decision IS NULL OR i.decision = 'LINK');
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
    ELSE -- APPROVE_NEW
        IF v_item.level <> 'SUBJECT' AND v_scope IS NULL THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: the parent of "%" has no node yet', v_item.raw_name USING ERRCODE = 'P0001';
        END IF;
        v_slug := public.fn_syllabus__slugify(v_item.raw_name);
        IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: "%" gives no usable slug; rename it first', v_item.raw_name USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.canonical_taxonomy_nodes (parent_id, node_type, name, name_hi, slug, display_order, is_active, metadata)
        VALUES (v_scope, v_item.level, btrim(v_item.raw_name), v_item.raw_name_hi, v_slug,
                coalesce((SELECT max(display_order) + 1 FROM public.canonical_taxonomy_nodes WHERE parent_id IS NOT DISTINCT FROM v_scope), 0),
                true, jsonb_build_object('source', 'SYLLABUS_INTAKE', 'intake_item_id', v_item.id))
        RETURNING id INTO v_result;
        PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_CREATE', v_result, NULL,
            jsonb_build_object('name', v_item.raw_name, 'name_hi', v_item.raw_name_hi, 'node_type', v_item.level,
                               'parent_id', v_scope, 'slug', v_slug, 'intake_item_id', v_item.id), 'syllabus intake: approved as new');
        -- the item's own aliases come with the new node
        FOREACH v_value IN ARRAY v_item.aliases LOOP
            CONTINUE WHEN public.fn_taxonomy_normalize(v_value) = public.fn_taxonomy_normalize(v_item.raw_name);
            PERFORM public.fn_taxonomy_add_alias(v_result, v_value, 'en', 'INTAKE', p_actor_id, p_actor_email);
            v_aliases := v_aliases || jsonb_build_array(v_value);
        END LOOP;
    END IF;

    IF p_decision <> 'IGNORE' THEN
        UPDATE public.syllabus_intake_items
           SET decision = p_decision, decision_node_id = v_result, decided_by = p_actor_id, decided_by_email = p_actor_email, decided_at = now()
         WHERE id = p_item_id;
    END IF;
    UPDATE public.syllabus_intake_sessions SET updated_at = now() WHERE id = v_item.session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_DECISION', 'syllabus_intake_item', p_item_id,
        jsonb_build_object('session_id', v_item.session_id, 'item', v_item.raw_name, 'level', v_item.level, 'decision', p_decision,
                           'node_id', v_result, 'aliases_added', v_aliases, 'ignored', v_ignored,
                           'previous_decision', v_item.decision));
    RETURN jsonb_build_object('item_id', p_item_id, 'decision', p_decision, 'node_id', v_result, 'aliases_added', v_aliases, 'ignored', v_ignored);
END
$function$
;

CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_import(p_session_id uuid, p_version_tag text, p_actor_id uuid, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    v_papers integer := 0;
    v_sections integer := 0;
    v_units  integer := 0;
    v_maps   integer := 0;
    v_tag    text := NULLIF(btrim(coalesce(p_version_tag, '')), '');
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023'; END IF;
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
                                                        'as_of', s.as_of_date, 'payload_sha256', s.payload_sha256))));
    UPDATE public.exam_syllabus_versions SET tier = s.tier, created_by = p_actor_id WHERE id = v_ver.id;

    FOR rp IN SELECT * FROM public.syllabus_intake_items WHERE session_id = p_session_id AND level = 'PAPER' ORDER BY position, item_key LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE parent_item_id = rp.id AND decision <> 'IGNORE');
        v_pid := public.fn_syllabus__insert_node(v_ver.id, NULL, 'PAPER', rp.raw_name, NULL, rp.position + 1, NULL, NULL, rp.questions, rp.questions, true);
        UPDATE public.exam_syllabus_nodes SET metadata = jsonb_strip_nulls(jsonb_build_object('marks', rp.marks, 'uncertain', CASE WHEN rp.uncertain THEN true END,
                                                                                               'uncertain_reason', rp.uncertain_reason, 'intake_item_id', rp.id,
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
                -- the deepest decided level below the topic, else the topic itself
                WITH RECURSIVE below AS (
                    SELECT i.id, i.decision_node_id, i.level FROM public.syllabus_intake_items i WHERE i.parent_item_id = rt.id AND i.decision <> 'IGNORE'
                    UNION ALL
                    SELECT c.id, c.decision_node_id, c.level FROM public.syllabus_intake_items c JOIN below b ON c.parent_item_id = b.id WHERE c.decision <> 'IGNORE')
                SELECT array_agg(DISTINCT b.decision_node_id) INTO v_targets FROM below b
                 WHERE NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items c WHERE c.parent_item_id = b.id AND c.decision <> 'IGNORE');
                IF v_targets IS NULL OR cardinality(v_targets) > 20 THEN
                    v_targets := ARRAY[rt.decision_node_id];
                END IF;
                INSERT INTO public.exam_syllabus_canonical_mappings
                    (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, reviewed_by, reviewed_at)
                SELECT v_uid, t, CASE WHEN rt.decision = 'ALIAS' THEN 'ALIAS_MATCH' ELSE 'MANUALLY_MAPPED' END, 1.00, 'SYLLABUS_INTAKE', p_actor_id, now()
                  FROM unnest(v_targets) t;
                v_maps := v_maps + cardinality(v_targets);
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
                               SELECT s2.item_key k, e.x, e.o FROM sub s2, unnest(s2.extra_headings) WITH ORDINALITY e(x, o)) h)))
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
                           'mappings', v_maps, 'contract_version', s.contract_version, 'based_on', s.based_on,
                           'source_url', s.source_url, 'payload_sha256', s.payload_sha256));
    RETURN jsonb_build_object('version_id', v_ver.id, 'version_number', v_ver.version_number, 'papers', v_papers,
                              'sections', v_sections, 'units', v_units, 'mappings', v_maps);
END
$function$
;

DROP FUNCTION public.fn_syllabus_intake__approve_node(public.syllabus_intake_items, uuid, uuid, text);

ALTER TABLE public.syllabus_intake_items DROP COLUMN decided_in_batch;
DROP TABLE public.syllabus_intake_batches;

ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT chk_intake_outline_concept;
ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT chk_intake_decision_node;
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT chk_intake_decision_node CHECK (
    decision IS NULL OR (decision = 'IGNORE' AND decision_node_id IS NULL) OR (decision <> 'IGNORE' AND decision_node_id IS NOT NULL));
ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT syllabus_intake_items_decision_check;
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT syllabus_intake_items_decision_check
    CHECK (decision IS NULL OR decision IN ('LINK', 'ALIAS', 'APPROVE_NEW', 'IGNORE'));

REVOKE ALL ON FUNCTION public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text) TO service_role;

COMMIT;
