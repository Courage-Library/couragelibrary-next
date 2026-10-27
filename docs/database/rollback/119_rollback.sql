-- Rollback for 20261028000119_ca4_templates_node_lessons_hindi.sql. Run as ONE transaction by the operator.
-- Safe only while NO node lesson, NO translation provenance and NO v3 intake exists (published lesson rows are
-- immutable: once node lessons or Hindi versions are published, keep 119 instead). The function bodies below are the
-- exact 116 / 117 definitions.
BEGIN;

DO $chk$ BEGIN
  IF EXISTS (SELECT 1 FROM public.learning_documents WHERE document_type = 'NODE_LESSON' OR node_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ROLLBACK 119: node lessons exist; keep 119 (or remove the unpublished node lesson documents first)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.document_versions WHERE translated_from_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ROLLBACK 119: translation provenance exists; keep 119';
  END IF;
  IF EXISTS (SELECT 1 FROM public.syllabus_intake_sessions WHERE contract_version <> 2) THEN
    RAISE EXCEPTION 'ROLLBACK 119: v3 intakes exist; discard and delete them first, or keep 119';
  END IF;
END $chk$;

-- E. intake back to v2 (116)
CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_create(
    p_exam_id uuid, p_exam_cycle_id uuid, p_tier text, p_source_url text, p_as_of date, p_payload jsonb, p_items jsonb,
    p_actor_id uuid, p_actor_email text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_id      uuid;
    v_item    record;
    v_parent  public.syllabus_intake_items%ROWTYPE;
    v_keys    jsonb := '{}'::jsonb;
    v_new_id  uuid;
    v_node    public.canonical_taxonomy_nodes%ROWTYPE;
    v_text    text;
    c_child   constant jsonb := '{"PAPER":"SUBJECT","SUBJECT":"TOPIC","TOPIC":"SUBTOPIC","SUBTOPIC":"CONCEPT"}'::jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: exam % does not exist', p_exam_id USING ERRCODE = 'P0002';
    END IF;
    IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the cycle does not belong to the exam' USING ERRCODE = '22023';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR (p_payload -> 'contract_version') IS DISTINCT FROM '2'::jsonb THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the payload must be a SYLLABUS_INTAKE v2 object' USING ERRCODE = '22023';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 1000 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: 1 to 1000 items are required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.syllabus_intake_sessions (exam_id, exam_cycle_id, tier, source_url, as_of_date, payload, payload_sha256, created_by, created_by_email)
    VALUES (p_exam_id, p_exam_cycle_id, NULLIF(btrim(coalesce(p_tier, '')), ''), btrim(p_source_url), p_as_of, p_payload,
            encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex'), p_actor_id, p_actor_email)
    RETURNING id INTO v_id;

    -- items arrive parents first (the TS builder emits a pre-order walk)
    FOR v_item IN SELECT e.value AS v FROM jsonb_array_elements(p_items) e LOOP
        FOREACH v_text IN ARRAY ARRAY[v_item.v ->> 'name', v_item.v ->> 'name_hi', v_item.v ->> 'uncertain_reason']
                              || coalesce(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_item.v -> 'aliases') = 'array' THEN v_item.v -> 'aliases' ELSE '[]'::jsonb END)), '{}')
                              || coalesce(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_item.v -> 'extra_headings') = 'array' THEN v_item.v -> 'extra_headings' ELSE '[]'::jsonb END)), '{}') LOOP
            IF v_text IS NOT NULL AND NOT public.fn_syllabus__import_is_plain(v_text) THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: item % contains markup or control characters', v_item.v ->> 'key' USING ERRCODE = '22023';
            END IF;
        END LOOP;
        v_parent := NULL;
        IF v_item.v ->> 'parent_key' IS NOT NULL THEN
            IF NOT v_keys ? (v_item.v ->> 'parent_key') THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: item % comes before its parent %', v_item.v ->> 'key', v_item.v ->> 'parent_key' USING ERRCODE = '22023';
            END IF;
            SELECT * INTO v_parent FROM public.syllabus_intake_items WHERE id = (v_keys ->> (v_item.v ->> 'parent_key'))::uuid;
            IF c_child ->> v_parent.level IS DISTINCT FROM v_item.v ->> 'level' THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: a % cannot sit under a %', v_item.v ->> 'level', v_parent.level USING ERRCODE = '22023';
            END IF;
        ELSIF v_item.v ->> 'level' <> 'PAPER' THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: only a PAPER is a root item (%)', v_item.v ->> 'key' USING ERRCODE = '22023';
        END IF;
        -- an EXACT / ALIAS claim is re-checked: a node of the item's level under the parent's matched node (or a root subject)
        IF v_item.v ->> 'match_status' IN ('EXACT', 'ALIAS') THEN
            SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = (v_item.v ->> 'matched_node_id')::uuid;
            IF NOT FOUND OR v_node.node_type <> v_item.v ->> 'level' OR NOT v_node.is_active
               OR (v_item.v ->> 'level' = 'SUBJECT' AND v_node.parent_id IS NOT NULL)
               OR (v_item.v ->> 'level' <> 'SUBJECT' AND v_node.parent_id IS DISTINCT FROM v_parent.matched_node_id) THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: the match of item % is not an active % under its matched parent', v_item.v ->> 'key', v_item.v ->> 'level'
                    USING ERRCODE = '22023';
            END IF;
        ELSIF (v_item.v ->> 'matched_node_id') IS NOT NULL THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: only EXACT / ALIAS items carry a matched node (%)', v_item.v ->> 'key' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.syllabus_intake_items
            (session_id, parent_item_id, item_key, level, position, raw_name, raw_name_hi, aliases, marks, questions, weightage_tier,
             uncertain, uncertain_reason, extra_headings, match_status, matched_node_id, candidates)
        VALUES (v_id, v_parent.id, v_item.v ->> 'key', v_item.v ->> 'level', coalesce((v_item.v ->> 'position')::integer, 0),
                btrim(v_item.v ->> 'name'), NULLIF(btrim(coalesce(v_item.v ->> 'name_hi', '')), ''),
                coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_item.v -> 'aliases', '[]'::jsonb))), '{}'),
                (v_item.v ->> 'marks')::numeric, (v_item.v ->> 'questions')::integer, v_item.v ->> 'weightage_tier',
                coalesce((v_item.v ->> 'uncertain')::boolean, false), v_item.v ->> 'uncertain_reason',
                coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_item.v -> 'extra_headings', '[]'::jsonb))), '{}'),
                v_item.v ->> 'match_status', (v_item.v ->> 'matched_node_id')::uuid, coalesce(v_item.v -> 'candidates', '[]'::jsonb))
        RETURNING id INTO v_new_id;
        v_keys := v_keys || jsonb_build_object(v_item.v ->> 'key', v_new_id);
    END LOOP;

    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_CREATE', 'syllabus_intake_session', v_id,
        jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'tier', p_tier, 'source_url', p_source_url,
                           'as_of', p_as_of, 'items', jsonb_array_length(p_items),
                           'payload_sha256', encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex')));
    RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_import(p_session_id uuid, p_version_tag text, p_actor_id uuid, p_actor_email text)
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
        jsonb_build_object('intake', jsonb_build_object('session_id', s.id, 'contract_version', 2, 'source_url', s.source_url,
                                                        'as_of', s.as_of_date, 'payload_sha256', s.payload_sha256)));
    UPDATE public.exam_syllabus_versions SET tier = s.tier, created_by = p_actor_id WHERE id = v_ver.id;

    FOR rp IN SELECT * FROM public.syllabus_intake_items WHERE session_id = p_session_id AND level = 'PAPER' ORDER BY position, item_key LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE parent_item_id = rp.id AND decision <> 'IGNORE');
        v_pid := public.fn_syllabus__insert_node(v_ver.id, NULL, 'PAPER', rp.raw_name, NULL, rp.position + 1, NULL, NULL, rp.questions, rp.questions, true);
        UPDATE public.exam_syllabus_nodes SET metadata = jsonb_strip_nulls(jsonb_build_object('marks', rp.marks, 'uncertain', CASE WHEN rp.uncertain THEN true END,
                                                                                               'uncertain_reason', rp.uncertain_reason, 'intake_item_id', rp.id))
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
                -- the topic and every non-ignored item below it: uncertain flags + headings deeper than L4 (in order)
                UPDATE public.exam_syllabus_nodes
                   SET metadata = (
                       WITH RECURSIVE sub AS (
                           SELECT i.id, i.item_key, i.uncertain, i.extra_headings FROM public.syllabus_intake_items i WHERE i.id = rt.id
                           UNION ALL
                           SELECT c.id, c.item_key, c.uncertain, c.extra_headings FROM public.syllabus_intake_items c JOIN sub ON c.parent_item_id = sub.id
                            WHERE c.decision <> 'IGNORE')
                       SELECT jsonb_strip_nulls(jsonb_build_object(
                           'marks', rt.marks, 'uncertain', CASE WHEN bool_or(sub.uncertain) THEN true END,
                           'uncertain_reason', rt.uncertain_reason, 'intake_item_id', rt.id,
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
                           'mappings', v_maps, 'source_url', s.source_url, 'payload_sha256', s.payload_sha256));
    RETURN jsonb_build_object('version_id', v_ver.id, 'version_number', v_ver.version_number, 'papers', v_papers,
                              'sections', v_sections, 'units', v_units, 'mappings', v_maps);
END
$fn$;

ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT IF EXISTS chk_intake_item_paper_fields;
ALTER TABLE public.syllabus_intake_items DROP CONSTRAINT IF EXISTS chk_intake_item_origin_level;
ALTER TABLE public.syllabus_intake_items DROP COLUMN IF EXISTS negative_marking, DROP COLUMN IF EXISTS duration_minutes,
    DROP COLUMN IF EXISTS avg_questions, DROP COLUMN IF EXISTS origin;
ALTER TABLE public.syllabus_intake_sessions DROP CONSTRAINT IF EXISTS chk_intake_session_contract;
ALTER TABLE public.syllabus_intake_sessions DROP COLUMN IF EXISTS based_on;
ALTER TABLE public.syllabus_intake_sessions ALTER COLUMN contract_version SET DEFAULT 2,
    ALTER COLUMN source_url SET NOT NULL, ALTER COLUMN as_of_date SET NOT NULL;
ALTER TABLE public.syllabus_intake_sessions ADD CONSTRAINT syllabus_intake_sessions_contract_version_check CHECK (contract_version = 2);

-- D. lesson RPCs back to 117
CREATE OR REPLACE FUNCTION public.fn_lesson_save_draft(
    p_document_id uuid, p_language text, p_meta jsonb, p_blocks jsonb, p_author_type text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_draft uuid;
    v_number integer;
    v_row public.document_versions%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'LESSON: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_author_type NOT IN ('HUMAN', 'AI_ASSISTED', 'LEGACY_CONVERSION') THEN RAISE EXCEPTION 'LESSON: unknown author type' USING ERRCODE = '22023'; END IF;
    PERFORM 1 FROM public.learning_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON: document % does not exist', p_document_id USING ERRCODE = 'P0002'; END IF;
    SELECT id INTO v_draft FROM public.document_versions
     WHERE document_id = p_document_id AND language = p_language AND content_format = 'BLOCKS'
       AND NOT is_published AND review_status = 'DRAFT'
     ORDER BY version_number DESC LIMIT 1;
    IF v_draft IS NOT NULL THEN
        UPDATE public.document_versions SET lesson_meta = p_meta, blocks = p_blocks, author_type = p_author_type, updated_at = now()
         WHERE id = v_draft RETURNING * INTO v_row;
    ELSE
        SELECT coalesce(max(version_number), 0) + 1 INTO v_number FROM public.document_versions WHERE document_id = p_document_id;
        INSERT INTO public.document_versions
            (document_id, version_number, schema_version, compiler_version, component_contract_version, author_type, review_status,
             is_published, content_format, language, lesson_meta, blocks, blocks_hash, blocks_schema_version)
        VALUES (p_document_id, v_number, '2.0.0', 'blocks-2', 'blocks-2', p_author_type, 'DRAFT', false, 'BLOCKS', p_language,
                p_meta, p_blocks, repeat('0', 64), '2.0.0')
        RETURNING * INTO v_row;
    END IF;
    PERFORM public.fn_lesson_audit(p_actor_id, p_actor_email, 'LESSON_DRAFT_SAVE', v_row.id,
        jsonb_build_object('document_id', p_document_id, 'language', p_language, 'version_number', v_row.version_number,
                           'blocks', jsonb_array_length(p_blocks), 'blocks_hash', v_row.blocks_hash, 'author_type', p_author_type));
    RETURN jsonb_build_object('version_id', v_row.id, 'version_number', v_row.version_number, 'blocks_hash', v_row.blocks_hash);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson_publish(p_version_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v public.document_versions%ROWTYPE;
    v_prev uuid;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v FROM public.document_versions WHERE id = p_version_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON: version % does not exist', p_version_id USING ERRCODE = 'P0002'; END IF;
    IF v.content_format <> 'BLOCKS' THEN RAISE EXCEPTION 'LESSON: only BLOCKS versions are published here (the MDX path is retired)' USING ERRCODE = 'P0001'; END IF;
    IF v.is_published OR v.review_status = 'PUBLISHED' THEN RAISE EXCEPTION 'LESSON: version % is already published', v.version_number USING ERRCODE = 'P0001'; END IF;
    PERFORM 1 FROM public.learning_documents WHERE id = v.document_id FOR UPDATE;
    IF v.language = 'hi' AND NOT EXISTS (SELECT 1 FROM public.document_versions WHERE document_id = v.document_id AND language = 'en' AND is_current) THEN
        RAISE EXCEPTION 'LESSON: publish the English version first (Hindi follows the English master)' USING ERRCODE = 'P0001';
    END IF;
    -- re-validate at publish (the rules may have tightened since the draft was saved)
    IF jsonb_array_length(public.fn_lesson_blocks_errors(v.lesson_meta, v.blocks)) > 0 THEN
        RAISE EXCEPTION 'LESSON_BLOCKS_INVALID: fix the draft before publishing' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_prev FROM public.document_versions WHERE document_id = v.document_id AND language = v.language AND is_current;
    IF v_prev IS NOT NULL THEN
        UPDATE public.document_versions SET is_current = false WHERE id = v_prev;
    END IF;
    UPDATE public.document_versions
       SET review_status = 'PUBLISHED', is_published = true, published_at = now(), approved_by_user_id = p_actor_id, is_current = true, updated_at = now()
     WHERE id = p_version_id;
    IF v.language = 'en' THEN
        UPDATE public.learning_documents SET current_published_version_id = p_version_id, updated_at = now() WHERE id = v.document_id;
    END IF;
    PERFORM public.fn_lesson_audit(p_actor_id, p_actor_email, 'LESSON_PUBLISH', p_version_id,
        jsonb_build_object('document_id', v.document_id, 'language', v.language, 'version_number', v.version_number,
                           'previous_current_version_id', v_prev, 'blocks_hash', v.blocks_hash));
    RETURN jsonb_build_object('version_id', p_version_id, 'version_number', v.version_number, 'language', v.language,
                              'previous_current_version_id', v_prev);
END
$fn$;

-- C. translations
DROP FUNCTION IF EXISTS public.fn_lesson_parity_errors(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fn_lesson__answer_key(jsonb);
DROP FUNCTION IF EXISTS public.fn_lesson__len(jsonb);
DROP FUNCTION IF EXISTS public.fn_lesson__numbers(jsonb);
CREATE OR REPLACE FUNCTION public.fn_prevent_published_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If previously published, strictly disallow any modification to content, hashes, versioning, metadata, or flags
  IF OLD.review_status = 'PUBLISHED' OR OLD.is_published = TRUE THEN
    IF NEW.review_status IS DISTINCT FROM OLD.review_status OR
       NEW.source_spec_storage_key IS DISTINCT FROM OLD.source_spec_storage_key OR
       NEW.source_spec_hash IS DISTINCT FROM OLD.source_spec_hash OR
       NEW.compiled_artifact_storage_key IS DISTINCT FROM OLD.compiled_artifact_storage_key OR
       NEW.compiled_artifact_hash IS DISTINCT FROM OLD.compiled_artifact_hash OR
       NEW.compiler_version IS DISTINCT FROM OLD.compiler_version OR
       NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
       NEW.component_contract_version IS DISTINCT FROM OLD.component_contract_version OR
       NEW.version_number IS DISTINCT FROM OLD.version_number OR
       NEW.is_published IS DISTINCT FROM OLD.is_published OR
       NEW.document_id IS DISTINCT FROM OLD.document_id OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       -- CA-3
       NEW.content_format IS DISTINCT FROM OLD.content_format OR
       NEW.language IS DISTINCT FROM OLD.language OR
       NEW.lesson_meta IS DISTINCT FROM OLD.lesson_meta OR
       NEW.blocks IS DISTINCT FROM OLD.blocks OR
       NEW.blocks_hash IS DISTINCT FROM OLD.blocks_hash OR
       NEW.blocks_schema_version IS DISTINCT FROM OLD.blocks_schema_version THEN
      RAISE EXCEPTION 'Cannot mutate published document version % (v%). Published content versions are strictly immutable. Create version % instead.',
        OLD.id, OLD.version_number, (OLD.version_number + 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP INDEX IF EXISTS public.idx_document_versions_translated_from;
ALTER TABLE public.document_versions DROP CONSTRAINT IF EXISTS chk_document_version_translated_from;
ALTER TABLE public.document_versions DROP COLUMN IF EXISTS translated_from_version_id;

-- B. node lessons
DROP FUNCTION IF EXISTS public.fn_lesson_create_node_document(uuid, text, uuid, text);
DROP TRIGGER IF EXISTS trg_learning_document_node_guard ON public.learning_documents;
DROP FUNCTION IF EXISTS public.fn_learning_document_node_guard();
DROP INDEX IF EXISTS public.uq_learning_documents_node_lesson;
ALTER TABLE public.learning_documents DROP CONSTRAINT IF EXISTS chk_learning_documents_owner;
ALTER TABLE public.learning_documents DROP CONSTRAINT IF EXISTS chk_learning_documents_document_type;
ALTER TABLE public.learning_documents ADD CONSTRAINT learning_documents_document_type_check CHECK (document_type IN (
    'CONCEPT_LESSON', 'WORKED_EXAMPLES', 'FORMULA_SHORTCUT_SHEET', 'COMMON_TRAPS_AND_MISTAKES', 'PYQ_DEEP_DIVE', 'TOPIC_SUMMARY_REVISION'));
ALTER TABLE public.learning_documents ALTER COLUMN learning_unit_id SET NOT NULL;
ALTER TABLE public.learning_documents DROP COLUMN IF EXISTS node_id;

-- A. prompt templates (the intake wizard falls back to the code constant)
DROP TABLE IF EXISTS public.prompt_templates;
DROP FUNCTION IF EXISTS public.fn_prompt_template_activate(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_prompt_template_save_draft(text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_prompt_template_audit(uuid, text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fn_prompt_template_guard();
DROP FUNCTION IF EXISTS public.fn_prompt_template_problems(text, text);

-- grants of the restored functions are unchanged by CREATE OR REPLACE (service_role only)
COMMIT;
