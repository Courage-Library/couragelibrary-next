-- Rollback for 20261027000116_ca2_syllabus_intake.sql. Run as ONE transaction by the operator.
-- Safe only while: every syllabus mapping targets a TOPIC (no SUBTOPIC / CONCEPT mapping exists), at most one
-- PUBLISHED version per (exam, cycle) — i.e. no second tier was published — and the intake staging may be dropped
-- (export syllabus_intake_sessions / _items first if any exist). DRAFTs created by intake / merge stay (DRAFT rows).
-- The function bodies below are the exact pre-116 definitions (captured from the live database before the apply, and
-- migration 115 for the taxonomy RPCs).
BEGIN;

DROP FUNCTION IF EXISTS public.fn_syllabus_intake_discard(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_intake_import(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_intake_create(uuid, uuid, text, text, date, jsonb, jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_intake_audit(uuid, text, text, text, uuid, jsonb);
DROP TABLE IF EXISTS public.syllabus_intake_items;
DROP TABLE IF EXISTS public.syllabus_intake_sessions;

REVOKE EXECUTE ON FUNCTION public.fn_syllabus__create_version(uuid, uuid, text, text, uuid, text, jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.fn_syllabus__insert_node(uuid, uuid, text, text, text, integer, text, text, integer, integer, boolean) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.fn_syllabus__slugify(text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.fn_syllabus__import_is_plain(text) FROM service_role;

-- taxonomy RPCs as in 115

CREATE OR REPLACE FUNCTION public.fn_taxonomy_move_node(
    p_node_id uuid, p_new_parent_id uuid, p_actor_id uuid, p_actor_email text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_node    public.canonical_taxonomy_nodes%ROWTYPE;
    v_old     public.canonical_taxonomy_nodes%ROWTYPE;
    v_new     public.canonical_taxonomy_nodes%ROWTYPE;
    v_subtree uuid[];
    v_ref     record;
    v_n       bigint;
    v_order   integer;
    v_path    text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'TAXONOMY_RULE: an actor is required'; END IF;
    SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = p_node_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: node % does not exist', p_node_id; END IF;
    IF v_node.parent_id IS NULL THEN RAISE EXCEPTION 'TAXONOMY_RULE: a subject cannot be moved'; END IF;
    IF p_new_parent_id IS NULL OR p_new_parent_id = v_node.parent_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: choose a different parent';
    END IF;
    SELECT * INTO v_old FROM public.canonical_taxonomy_nodes WHERE id = v_node.parent_id;
    SELECT * INTO v_new FROM public.canonical_taxonomy_nodes WHERE id = p_new_parent_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: parent % does not exist', p_new_parent_id; END IF;
    IF v_new.node_type <> v_old.node_type THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: a node moves only to a parent at the same level (% → %)', v_old.node_type, v_new.node_type;
    END IF;
    IF NOT v_new.is_active THEN RAISE EXCEPTION 'TAXONOMY_RULE: the new parent is inactive'; END IF;
    v_subtree := public.fn_taxonomy_subtree_ids(p_node_id);
    IF p_new_parent_id = ANY (v_subtree) THEN RAISE EXCEPTION 'TAXONOMY_RULE: a node cannot move under itself'; END IF;
    IF EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes WHERE parent_id = p_new_parent_id AND slug = v_node.slug) THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: the new parent already has a child with the slug "%"', v_node.slug;
    END IF;

    IF v_new.root_subject_id IS DISTINCT FROM v_node.root_subject_id THEN
        FOR v_ref IN
            SELECT c1.conrelid::regclass AS tbl, a1.attname AS col
              FROM pg_constraint c1
              JOIN pg_attribute a1 ON a1.attrelid = c1.conrelid AND a1.attnum = c1.conkey[1]
             WHERE c1.contype = 'f' AND c1.confrelid = 'public.canonical_taxonomy_nodes'::regclass
               AND c1.conrelid <> 'public.canonical_taxonomy_nodes'::regclass
               AND EXISTS (SELECT 1 FROM pg_class k WHERE k.oid = c1.conrelid AND k.relnamespace = 'public'::regnamespace)
               AND a1.attname <> 'subject_id'
               AND EXISTS (SELECT 1 FROM pg_constraint c2
                             JOIN pg_attribute a2 ON a2.attrelid = c2.conrelid AND a2.attnum = c2.conkey[1]
                            WHERE c2.contype = 'f' AND c2.confrelid = c1.confrelid AND c2.conrelid = c1.conrelid
                              AND a2.attname = 'subject_id')
             ORDER BY 1, 2
        LOOP
            EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY ($1)', v_ref.tbl, v_ref.col) INTO v_n USING v_subtree;
            IF v_n > 0 THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: moving to another subject is blocked: % rows of %.% also store the old subject', v_n, v_ref.tbl, v_ref.col;
            END IF;
        END LOOP;
    END IF;

    SELECT coalesce(max(display_order) + 1, 0) INTO v_order FROM public.canonical_taxonomy_nodes WHERE parent_id = p_new_parent_id;
    UPDATE public.canonical_taxonomy_nodes SET parent_id = p_new_parent_id, display_order = v_order WHERE id = p_node_id
    RETURNING hierarchy_path INTO v_path;

    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_MOVE', p_node_id,
        jsonb_build_object('parent_id', v_node.parent_id, 'path', v_node.hierarchy_path, 'display_order', v_node.display_order),
        jsonb_build_object('parent_id', p_new_parent_id, 'path', v_path, 'display_order', v_order,
                           'subtree_size', cardinality(v_subtree)),
        p_reason);
    RETURN jsonb_build_object('node_id', p_node_id, 'from_parent_id', v_node.parent_id, 'to_parent_id', p_new_parent_id,
                              'path', v_path, 'subtree_size', cardinality(v_subtree));
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_taxonomy_merge_nodes(
    p_source_id uuid, p_target_id uuid, p_actor_id uuid, p_actor_email text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_src      public.canonical_taxonomy_nodes%ROWTYPE;
    v_tgt      public.canonical_taxonomy_nodes%ROWTYPE;
    v_ref      record;
    v_n        bigint;
    v_counts   jsonb := '{}'::jsonb;
    v_children integer;
    v_moved_aliases integer;
    v_dropped_aliases integer;
    v_added    jsonb := '[]'::jsonb;
    v_value    text;
    v_lang     text;
    v_target_names text[];
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'TAXONOMY_RULE: an actor is required'; END IF;
    IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: a merge needs a reason (at least 5 characters)';
    END IF;
    IF p_source_id IS NULL OR p_target_id IS NULL OR p_source_id = p_target_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: choose two different nodes';
    END IF;
    -- lock both in a stable order
    PERFORM 1 FROM public.canonical_taxonomy_nodes WHERE id IN (p_source_id, p_target_id) ORDER BY id FOR UPDATE;
    SELECT * INTO v_src FROM public.canonical_taxonomy_nodes WHERE id = p_source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: source node % does not exist', p_source_id; END IF;
    SELECT * INTO v_tgt FROM public.canonical_taxonomy_nodes WHERE id = p_target_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: target node % does not exist', p_target_id; END IF;
    IF v_src.node_type <> v_tgt.node_type THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: only nodes of the same level can merge (% → %)', v_src.node_type, v_tgt.node_type;
    END IF;
    IF NOT v_src.is_active OR NOT v_tgt.is_active THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: both nodes must be active';
    END IF;
    IF v_src.node_type <> 'SUBJECT' AND v_src.root_subject_id IS DISTINCT FROM v_tgt.root_subject_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: merge within one subject only (move the node first)';
    END IF;
    IF p_target_id = ANY (public.fn_taxonomy_subtree_ids(p_source_id)) THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: the target lies inside the source';
    END IF;
    SELECT string_agg(c.slug, ', ' ORDER BY c.slug) INTO v_value
      FROM public.canonical_taxonomy_nodes c
     WHERE c.parent_id = p_source_id
       AND EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes t WHERE t.parent_id = p_target_id AND t.slug = c.slug);
    IF v_value IS NOT NULL THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: both nodes have children with the slug(s) %; merge those children first', v_value;
    END IF;

    -- 1. retire the source (frees its name in the scope)
    UPDATE public.canonical_taxonomy_nodes
       SET is_active = false,
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('merged_into', p_target_id, 'merged_at', now())
     WHERE id = p_source_id;

    -- 2. children move under the target (each row re-checked by the tree triggers)
    UPDATE public.canonical_taxonomy_nodes SET parent_id = p_target_id WHERE parent_id = p_source_id;
    GET DIAGNOSTICS v_children = ROW_COUNT;

    -- 3. aliases: drop the ones the target already has (or that equal its names), move the rest
    v_target_names := ARRAY[public.fn_taxonomy_normalize(v_tgt.name), public.fn_taxonomy_normalize(v_tgt.name_hi)];
    DELETE FROM public.taxonomy_node_aliases a
     WHERE a.node_id = p_source_id
       AND (a.normalized_alias = ANY (v_target_names)
            OR EXISTS (SELECT 1 FROM public.taxonomy_node_aliases b
                        WHERE b.node_id = p_target_id AND b.normalized_alias = a.normalized_alias));
    GET DIAGNOSTICS v_dropped_aliases = ROW_COUNT;
    UPDATE public.taxonomy_node_aliases SET node_id = p_target_id WHERE node_id = p_source_id;
    GET DIAGNOSTICS v_moved_aliases = ROW_COUNT;

    -- 4. the source names become aliases of the target
    FOREACH v_lang IN ARRAY ARRAY['en', 'hi'] LOOP
        v_value := CASE v_lang WHEN 'en' THEN v_src.name ELSE v_src.name_hi END;
        CONTINUE WHEN v_value IS NULL;
        CONTINUE WHEN public.fn_taxonomy_normalize(v_value) = ANY (v_target_names);
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.taxonomy_node_aliases
                               WHERE node_id = p_target_id AND normalized_alias = public.fn_taxonomy_normalize(v_value));
        INSERT INTO public.taxonomy_node_aliases (node_id, alias, normalized_alias, language, source, created_by)
        VALUES (p_target_id, v_value, '-', v_lang, 'OWNER', p_actor_id);
        v_added := v_added || jsonb_build_array(jsonb_build_object('alias', v_value, 'language', v_lang));
    END LOOP;

    -- 5. every other app reference (catalogue-driven; the tree's own columns, the projection and aliases are handled
    --    above). The frozen archive (schema retired, no service_role access) keeps pointing at the source, which is
    --    deactivated and never deleted, so its foreign keys stay valid.
    FOR v_ref IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND c.confrelid = 'public.canonical_taxonomy_nodes'::regclass
           AND cl.relnamespace = 'public'::regnamespace
           AND c.conrelid NOT IN ('public.canonical_taxonomy_nodes'::regclass, 'public.topics'::regclass,
                                  'public.subtopics'::regclass, 'public.taxonomy_node_aliases'::regclass)
         ORDER BY 1, 2
    LOOP
        BEGIN
            EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_ref.tbl, v_ref.col, v_ref.col) USING p_target_id, p_source_id;
            GET DIAGNOSTICS v_n = ROW_COUNT;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: merge blocked: %.% holds rows for both nodes (unique key)', v_ref.tbl, v_ref.col;
        END;
        IF v_n > 0 THEN
            v_counts := v_counts || jsonb_build_object(v_ref.tbl::text || '.' || v_ref.col, v_n);
        END IF;
    END LOOP;

    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_MERGE', p_source_id,
        jsonb_build_object('source_id', p_source_id, 'name', v_src.name, 'name_hi', v_src.name_hi,
                           'parent_id', v_src.parent_id, 'path', v_src.hierarchy_path, 'node_type', v_src.node_type),
        jsonb_build_object('target_id', p_target_id, 'target_path', v_tgt.hierarchy_path, 'children_moved', v_children,
                           'aliases_moved', v_moved_aliases, 'aliases_dropped', v_dropped_aliases,
                           'aliases_added', v_added, 'repointed', v_counts),
        p_reason);
    RETURN jsonb_build_object('source_id', p_source_id, 'target_id', p_target_id, 'children_moved', v_children,
                              'aliases_moved', v_moved_aliases, 'aliases_added', v_added, 'repointed', v_counts);
END
$fn$;

DROP FUNCTION IF EXISTS public.fn_syllabus__repointed_draft(uuid, uuid, uuid, uuid);

-- syllabus functions as before 116
CREATE OR REPLACE FUNCTION public.fn_exam_syllabus_read_model(p_exam_id uuid, p_exam_cycle_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v public.exam_syllabus_versions;
  v_nodes jsonb;
  v_totals jsonb;
BEGIN
  -- the cycle's own published version, else the exam-wide one (no cycle), else the latest published version
  SELECT * INTO v FROM public.exam_syllabus_versions
   WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active
   ORDER BY (exam_cycle_id IS NOT DISTINCT FROM p_exam_cycle_id) DESC, (exam_cycle_id IS NULL) DESC, published_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'NO_SYLLABUS', 'exam_id', p_exam_id, 'version', NULL, 'nodes', '[]'::jsonb, 'totals', NULL);
  END IF;

  WITH RECURSIVE
  n AS (SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = v.id),
  m AS (SELECT mp.syllabus_node_id, mp.canonical_node_id AS topic_id, mp.mapping_weight
          FROM public.exam_syllabus_canonical_mappings mp JOIN n ON n.id = mp.syllabus_node_id
         WHERE mp.canonical_node_id IS NOT NULL),
  t AS (SELECT DISTINCT topic_id FROM m),
  -- derived from live rows only (no defaults, no estimates)
  tq AS (SELECT q.canonical_topic_id AS topic_id, count(*)::int AS c FROM public.questions q
          WHERE q.status = 'published' AND q.canonical_topic_id IN (SELECT topic_id FROM t) GROUP BY 1),
  -- servable = LearningResolverService.isServableDocumentRow: document PUBLISHED, its current published version
  -- is_published and review_status PUBLISHED, unit active
  td AS (SELECT u.topic_id, count(*)::int AS c FROM public.learning_documents d
           JOIN public.learning_units u ON u.id = d.learning_unit_id
           JOIN public.document_versions dv ON dv.id = d.current_published_version_id
          WHERE d.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED' AND u.is_active
            AND u.topic_id IN (SELECT topic_id FROM t) GROUP BY 1),
  closure(anc, des) AS (
    SELECT id, id FROM n
    UNION ALL
    SELECT c.anc, n.id FROM closure c JOIN n ON n.parent_node_id = c.des),
  sub AS (
    SELECT x.anc, count(*)::int AS topics, COALESCE(sum(tq.c), 0)::int AS published_questions,
           COALESCE(sum(td.c), 0)::int AS servable_documents,
           count(*) FILTER (WHERE tq.c > 0)::int AS topics_with_questions,
           count(*) FILTER (WHERE td.c > 0)::int AS topics_with_documents
      FROM (SELECT DISTINCT c.anc, m.topic_id FROM closure c JOIN m ON m.syllabus_node_id = c.des) x
      LEFT JOIN tq ON tq.topic_id = x.topic_id
      LEFT JOIN td ON td.topic_id = x.topic_id
     GROUP BY x.anc),
  topics_json AS (
    SELECT m.syllabus_node_id,
           jsonb_agg(jsonb_build_object('topic_id', c.id, 'name', c.name, 'slug', c.slug, 'subject_id', c.root_subject_id,
                                        'weight', m.mapping_weight, 'published_questions', COALESCE(tq.c, 0),
                                        'servable_documents', COALESCE(td.c, 0)) ORDER BY c.name) AS topics
      FROM m JOIN public.canonical_taxonomy_nodes c ON c.id = m.topic_id
      LEFT JOIN tq ON tq.topic_id = m.topic_id
      LEFT JOIN td ON td.topic_id = m.topic_id
     GROUP BY m.syllabus_node_id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', n.id, 'parent_id', n.parent_node_id, 'kind', n.node_kind, 'title', n.raw_title, 'slug', n.raw_slug,
           'description', n.description, 'order', n.display_order, 'depth', n.node_depth,
           'weightage_tier', n.weightage_tier, 'expected_questions_min', n.expected_questions_min,
           'expected_questions_max', n.expected_questions_max, 'is_mandatory', n.is_mandatory,
           'topics', COALESCE(tj.topics, '[]'::jsonb),
           'counts', jsonb_build_object(
             'topics', COALESCE(s.topics, 0), 'published_questions', COALESCE(s.published_questions, 0),
             'servable_documents', COALESCE(s.servable_documents, 0),
             'topics_with_questions', COALESCE(s.topics_with_questions, 0),
             'topics_with_documents', COALESCE(s.topics_with_documents, 0)))
         ORDER BY n.node_depth, n.display_order, n.raw_title), '[]'::jsonb)
    INTO v_nodes
    FROM n LEFT JOIN sub s ON s.anc = n.id LEFT JOIN topics_json tj ON tj.syllabus_node_id = n.id;

  SELECT jsonb_build_object(
           'nodes', (SELECT count(*) FROM public.exam_syllabus_nodes WHERE syllabus_version_id = v.id),
           'topics', count(*),
           'published_questions', COALESCE(sum((SELECT count(*) FROM public.questions q WHERE q.canonical_topic_id = x.topic_id AND q.status = 'published')), 0),
           'servable_documents', COALESCE(sum((SELECT count(*) FROM public.learning_documents d
                                                 JOIN public.learning_units u ON u.id = d.learning_unit_id
                                                 JOIN public.document_versions dv ON dv.id = d.current_published_version_id
                                                WHERE u.topic_id = x.topic_id AND d.status = 'PUBLISHED' AND dv.is_published
                                                  AND dv.review_status = 'PUBLISHED' AND u.is_active)), 0))
    INTO v_totals
    FROM (SELECT DISTINCT mp.canonical_node_id AS topic_id
            FROM public.exam_syllabus_canonical_mappings mp
            JOIN public.exam_syllabus_nodes x ON x.id = mp.syllabus_node_id
           WHERE x.syllabus_version_id = v.id AND mp.canonical_node_id IS NOT NULL) x;

  RETURN jsonb_build_object(
    'state', 'AVAILABLE', 'exam_id', p_exam_id,
    'version', jsonb_build_object('id', v.id, 'version_number', v.version_number, 'version_tag', v.version_tag,
                                  'exam_cycle_id', v.exam_cycle_id, 'published_at', v.published_at),
    'nodes', v_nodes, 'totals', v_totals);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_syllabus__validate(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_status text;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_counts jsonb;
BEGIN
  SELECT status INTO v_status FROM public.exam_syllabus_versions WHERE id = p_version_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'SYLLABUS_VERSION_NOT_FOUND: %', p_version_id USING ERRCODE = 'P0002';
  END IF;

  WITH RECURSIVE
  n AS (SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = p_version_id),
  m AS (SELECT mp.* FROM public.exam_syllabus_canonical_mappings mp JOIN n ON n.id = mp.syllabus_node_id),
  closure(anc, des) AS (
    SELECT id, id FROM n
    UNION ALL
    SELECT c.anc, n.id FROM closure c JOIN n ON n.parent_node_id = c.des),
  -- nearest SECTION ancestor (or self) of each UNIT
  unit_section AS (
    SELECT DISTINCT ON (u.id) u.id AS unit_id, s.id AS section_id
      FROM n u JOIN closure c ON c.des = u.id JOIN n s ON s.id = c.anc AND s.node_kind = 'SECTION'
     WHERE u.node_kind = 'UNIT'
     ORDER BY u.id, s.node_depth DESC),
  issues AS (
    SELECT 'NO_NODES' AS code, NULL::uuid AS node_id, NULL::uuid AS topic_id, 'The syllabus has no nodes.' AS message, 'error' AS sev
     WHERE NOT EXISTS (SELECT 1 FROM n)
    UNION ALL
    SELECT 'PAPER_NOT_ROOT', n.id, NULL, format('PAPER "%s" must be a top-level node.', n.raw_title), 'error'
      FROM n WHERE n.node_kind = 'PAPER' AND n.parent_node_id IS NOT NULL
    UNION ALL
    SELECT 'UNIT_HAS_CHILDREN', n.id, NULL, format('UNIT "%s" must be a leaf (it has child nodes).', n.raw_title), 'error'
      FROM n WHERE n.node_kind = 'UNIT' AND EXISTS (SELECT 1 FROM n c WHERE c.parent_node_id = n.id)
    UNION ALL
    SELECT 'UNIT_UNMAPPED', n.id, NULL, format('UNIT "%s" is not mapped to any topic.', n.raw_title), 'error'
      FROM n WHERE n.node_kind = 'UNIT' AND NOT EXISTS (SELECT 1 FROM m WHERE m.syllabus_node_id = n.id AND m.canonical_node_id IS NOT NULL)
    UNION ALL
    SELECT 'MAPPING_ON_NON_UNIT', n.id, NULL, format('%s "%s" has topic mappings; only UNIT nodes may be mapped.', n.node_kind, n.raw_title), 'error'
      FROM n WHERE n.node_kind <> 'UNIT' AND EXISTS (SELECT 1 FROM m WHERE m.syllabus_node_id = n.id)
    UNION ALL
    SELECT 'MAPPING_WITHOUT_TOPIC', m.syllabus_node_id, NULL, 'A mapping has no canonical topic.', 'error'
      FROM m WHERE m.canonical_node_id IS NULL
    UNION ALL
    SELECT 'EMPTY_SECTION', s.id, NULL, format('%s "%s" contains no UNIT.', s.node_kind, s.raw_title), 'error'
      FROM n s WHERE s.node_kind IN ('SECTION', 'PAPER')
       AND NOT EXISTS (SELECT 1 FROM closure c JOIN n u ON u.id = c.des WHERE c.anc = s.id AND u.node_kind = 'UNIT')
    UNION ALL
    SELECT 'TOPIC_INACTIVE', m.syllabus_node_id, m.canonical_node_id, format('Topic "%s" is inactive.', t.name), 'error'
      FROM m JOIN public.canonical_taxonomy_nodes t ON t.id = m.canonical_node_id WHERE NOT t.is_active
    UNION ALL
    SELECT 'WEIGHTS_INVALID', w.node_id, NULL,
           format('Mapping weights must be set for all or none of the topics and add up to 1 (sum %s).', w.total), 'error'
      FROM (SELECT m.syllabus_node_id AS node_id, count(*) AS n_all, count(m.mapping_weight) AS n_w, COALESCE(sum(m.mapping_weight), 0) AS total
              FROM m GROUP BY 1) w
     WHERE w.n_w > 0 AND (w.n_w <> w.n_all OR abs(w.total - 1) > 0.0001)
    UNION ALL
    SELECT 'DUPLICATE_TOPIC_IN_SECTION', d.section_id, d.topic_id,
           format('Topic "%s" is mapped %s times in one section.', t.name, d.c), 'error'
      FROM (SELECT us.section_id, m.canonical_node_id AS topic_id, count(*) AS c
              FROM m JOIN unit_section us ON us.unit_id = m.syllabus_node_id
             WHERE m.canonical_node_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) d
      JOIN public.canonical_taxonomy_nodes t ON t.id = d.topic_id
    UNION ALL
    SELECT 'TOPIC_IN_MULTIPLE_SECTIONS', NULL, x.topic_id, format('Topic "%s" appears in %s sections.', t.name, x.c), 'warning'
      FROM (SELECT m.canonical_node_id AS topic_id, count(DISTINCT us.section_id) AS c
              FROM m JOIN unit_section us ON us.unit_id = m.syllabus_node_id
             WHERE m.canonical_node_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT us.section_id) > 1) x
      JOIN public.canonical_taxonomy_nodes t ON t.id = x.topic_id
    UNION ALL
    SELECT 'TOPIC_NO_PUBLISHED_QUESTIONS', NULL, t.id, format('Topic "%s" has no published questions yet.', t.name), 'warning'
      FROM (SELECT DISTINCT canonical_node_id AS id FROM m WHERE canonical_node_id IS NOT NULL) tt
      JOIN public.canonical_taxonomy_nodes t ON t.id = tt.id
     WHERE NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.canonical_topic_id = t.id AND q.status = 'published')
    UNION ALL
    SELECT 'TOPIC_NO_SERVABLE_DOCUMENTS', NULL, t.id, format('Topic "%s" has no published learning documents yet.', t.name), 'warning'
      FROM (SELECT DISTINCT canonical_node_id AS id FROM m WHERE canonical_node_id IS NOT NULL) tt
      JOIN public.canonical_taxonomy_nodes t ON t.id = tt.id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.learning_documents d
         JOIN public.learning_units u ON u.id = d.learning_unit_id
         JOIN public.document_versions dv ON dv.id = d.current_published_version_id
        WHERE u.topic_id = t.id AND u.is_active AND d.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED')
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('code', code, 'node_id', node_id, 'topic_id', topic_id, 'message', message)
             ORDER BY code, message) FILTER (WHERE sev = 'error'), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('code', code, 'node_id', node_id, 'topic_id', topic_id, 'message', message)
             ORDER BY code, message) FILTER (WHERE sev = 'warning'), '[]'::jsonb)
    INTO v_errors, v_warnings
    FROM issues;

  SELECT jsonb_build_object(
           'nodes', count(*),
           'papers', count(*) FILTER (WHERE node_kind = 'PAPER'),
           'sections', count(*) FILTER (WHERE node_kind = 'SECTION'),
           'units', count(*) FILTER (WHERE node_kind = 'UNIT'),
           'mappings', (SELECT count(*) FROM public.exam_syllabus_canonical_mappings mp
                          JOIN public.exam_syllabus_nodes x ON x.id = mp.syllabus_node_id WHERE x.syllabus_version_id = p_version_id),
           'topics', (SELECT count(DISTINCT mp.canonical_node_id) FROM public.exam_syllabus_canonical_mappings mp
                        JOIN public.exam_syllabus_nodes x ON x.id = mp.syllabus_node_id WHERE x.syllabus_version_id = p_version_id))
    INTO v_counts
    FROM public.exam_syllabus_nodes WHERE syllabus_version_id = p_version_id;

  RETURN jsonb_build_object(
    'version_id', p_version_id, 'status', v_status,
    'ok', jsonb_array_length(v_errors) = 0,
    'error_count', jsonb_array_length(v_errors), 'warning_count', jsonb_array_length(v_warnings),
    'errors', v_errors, 'warnings', v_warnings, 'counts', v_counts);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_create_draft(p_exam_id uuid, p_exam_cycle_id uuid DEFAULT NULL::uuid, p_from_version_id uuid DEFAULT NULL::uuid, p_version_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_from public.exam_syllabus_versions;
  v_new public.exam_syllabus_versions;
  v_map jsonb := '{}'::jsonb;
  r record;
  v_new_id uuid;
  v_nodes integer := 0;
  v_maps integer := 0;
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);
  IF p_from_version_id IS NOT NULL THEN
    SELECT * INTO v_from FROM public.exam_syllabus_versions WHERE id = p_from_version_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SYLLABUS_VERSION_NOT_FOUND: %', p_from_version_id USING ERRCODE = 'P0002';
    END IF;
    IF v_from.exam_id <> p_exam_id THEN
      RAISE EXCEPTION 'SYLLABUS_SOURCE_OTHER_EXAM: version % belongs to another exam', p_from_version_id USING ERRCODE = 'P0001';
    END IF;
    IF v_from.status <> 'PUBLISHED' THEN
      RAISE EXCEPTION 'SYLLABUS_SOURCE_NOT_PUBLISHED: a new draft can only copy a PUBLISHED version' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_new := public.fn_syllabus__create_version(
    p_exam_id, COALESCE(p_exam_cycle_id, v_from.exam_cycle_id), p_version_tag, 'MANUAL', p_from_version_id, NULL,
    CASE WHEN p_from_version_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('copied_from_version_id', p_from_version_id) END);

  IF p_from_version_id IS NOT NULL THEN
    FOR r IN SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = p_from_version_id
              ORDER BY node_depth, display_order, raw_title LOOP
      v_new_id := public.fn_syllabus__insert_node(
        v_new.id, CASE WHEN r.parent_node_id IS NULL THEN NULL ELSE (v_map ->> r.parent_node_id::text)::uuid END,
        r.node_kind, r.raw_title, r.raw_slug, r.display_order, r.description, r.weightage_tier,
        r.expected_questions_min, r.expected_questions_max, r.is_mandatory);
      UPDATE public.exam_syllabus_nodes SET required_cognitive_depth = r.required_cognitive_depth WHERE id = v_new_id;
      v_map := v_map || jsonb_build_object(r.id::text, v_new_id);
      v_nodes := v_nodes + 1;
    END LOOP;
    INSERT INTO public.exam_syllabus_canonical_mappings
      (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, mapping_weight, reviewed_by, reviewed_at)
    SELECT (v_map ->> mp.syllabus_node_id::text)::uuid, mp.canonical_node_id, mp.match_status, mp.match_confidence,
           mp.match_method, mp.mapping_weight, mp.reviewed_by, mp.reviewed_at
      FROM public.exam_syllabus_canonical_mappings mp
      JOIN public.exam_syllabus_nodes n ON n.id = mp.syllabus_node_id
     WHERE n.syllabus_version_id = p_from_version_id;
    GET DIAGNOSTICS v_maps = ROW_COUNT;
  END IF;

  PERFORM public.fn_syllabus__audit('SYLLABUS_DRAFT_CREATE', 'exam_syllabus_version', v_new.id, NULL,
    jsonb_build_object('exam_id', v_new.exam_id, 'exam_cycle_id', v_new.exam_cycle_id, 'version_number', v_new.version_number,
                       'version_tag', v_new.version_tag, 'from_version_id', p_from_version_id,
                       'nodes_copied', v_nodes, 'mappings_copied', v_maps));
  RETURN jsonb_build_object('success', true, 'version_id', v_new.id, 'version_number', v_new.version_number,
                            'version_tag', v_new.version_tag, 'nodes_copied', v_nodes, 'mappings_copied', v_maps);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_set_unit_mappings(p_node_id uuid, p_topic_ids uuid[], p_weights numeric[] DEFAULT NULL::numeric[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_node public.exam_syllabus_nodes;
  v_topics uuid[] := COALESCE(p_topic_ids, '{}'::uuid[]);
  v_bad jsonb;
  v_old jsonb;
  v_n integer := COALESCE(array_length(COALESCE(p_topic_ids, '{}'::uuid[]), 1), 0);
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);
  SELECT * INTO v_node FROM public.exam_syllabus_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYLLABUS_NODE_NOT_FOUND: %', p_node_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.fn_syllabus__require_draft(v_node.syllabus_version_id);
  IF v_node.node_kind <> 'UNIT' THEN
    RAISE EXCEPTION 'SYLLABUS_MAPPING_NOT_UNIT: only UNIT nodes carry topic mappings (node is %)', v_node.node_kind USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT t) FROM unnest(v_topics) t) <> v_n OR array_position(v_topics, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'SYLLABUS_TOPICS_INVALID: topic ids must be distinct and not null' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(t) INTO v_bad FROM unnest(v_topics) t
   WHERE NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes c WHERE c.id = t AND c.node_type = 'TOPIC' AND c.is_active);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'SYLLABUS_TOPICS_INVALID: not active TOPIC nodes: %', v_bad USING ERRCODE = '23503';
  END IF;
  IF p_weights IS NOT NULL THEN
    IF COALESCE(array_length(p_weights, 1), 0) <> v_n
       OR EXISTS (SELECT 1 FROM unnest(p_weights) w WHERE w IS NULL OR w <= 0 OR w > 1)
       OR (v_n > 0 AND abs((SELECT sum(w) FROM unnest(p_weights) w) - 1) > 0.0001) THEN
      RAISE EXCEPTION 'SYLLABUS_WEIGHTS_INVALID: one weight per topic, each in (0, 1], summing to 1' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic_id', canonical_node_id, 'weight', mapping_weight) ORDER BY canonical_node_id), '[]'::jsonb)
    INTO v_old FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = p_node_id;
  DELETE FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = p_node_id;
  INSERT INTO public.exam_syllabus_canonical_mappings
    (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, mapping_weight, reviewed_by, reviewed_at)
  SELECT p_node_id, t.id, 'MANUALLY_MAPPED', 1.00, 'MANUAL', p_weights[t.ord::integer], auth.uid(), now()
    FROM unnest(v_topics) WITH ORDINALITY AS t(id, ord);
  PERFORM public.fn_syllabus__audit('SYLLABUS_MAPPINGS_SET', 'exam_syllabus_node', p_node_id, v_old,
    jsonb_build_object('topic_ids', to_jsonb(v_topics), 'weights', to_jsonb(p_weights), 'version_id', v_node.syllabus_version_id));
  RETURN jsonb_build_object('success', true, 'node_id', p_node_id, 'mappings', v_n);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_publish(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v public.exam_syllabus_versions;
  v_report jsonb;
  v_prev uuid;
BEGIN
  PERFORM public.fn_syllabus__assert_role(true);
  v := public.fn_syllabus__require_draft(p_version_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || v.exam_id::text, 0));
  v_report := public.fn_syllabus__validate(p_version_id);
  IF (v_report ->> 'ok')::boolean IS NOT TRUE THEN -- 105: a missing / NULL ok fails closed
    -- fail closed: nothing written, nothing audited
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_FAILED', 'version_id', p_version_id, 'report', v_report);
  END IF;
  SELECT id INTO v_prev FROM public.exam_syllabus_versions
   WHERE exam_id = v.exam_id AND exam_cycle_id IS NOT DISTINCT FROM v.exam_cycle_id
     AND status = 'PUBLISHED' AND is_active AND id <> p_version_id
   FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE public.exam_syllabus_versions SET status = 'ARCHIVED', is_active = false, archived_at = now(), updated_at = now()
     WHERE id = v_prev;
  END IF;
  UPDATE public.exam_syllabus_versions
     SET status = 'PUBLISHED', is_active = true, published_at = now(), published_by = auth.uid(), updated_at = now()
   WHERE id = p_version_id;
  PERFORM public.fn_syllabus__audit('SYLLABUS_PUBLISH', 'exam_syllabus_version', p_version_id,
    CASE WHEN v_prev IS NULL THEN NULL ELSE jsonb_build_object('archived_version_id', v_prev) END,
    jsonb_build_object('exam_id', v.exam_id, 'exam_cycle_id', v.exam_cycle_id, 'version_number', v.version_number,
                       'previous_version_id', v_prev, 'counts', v_report -> 'counts', 'warning_count', v_report -> 'warning_count'));
  RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'archived_previous_version_id', v_prev,
                            'counts', v_report -> 'counts', 'warnings', v_report -> 'warnings');
END;
$function$;

-- mappings: back to the generated TOPIC-only column (all rows are TOPIC: asserted)
DO $chk$ BEGIN
  IF EXISTS (SELECT 1 FROM public.exam_syllabus_canonical_mappings WHERE canonical_node_type <> 'TOPIC') THEN
    RAISE EXCEPTION 'ROLLBACK 116: SUBTOPIC / CONCEPT mappings exist; re-map them to topics first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE status = 'PUBLISHED' AND is_active
              GROUP BY exam_id, exam_cycle_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ROLLBACK 116: several tiers are PUBLISHED for one exam / cycle; archive all but one first';
  END IF;
END $chk$;
DROP TRIGGER IF EXISTS trg_a_syllabus_mapping_node_fields ON public.exam_syllabus_canonical_mappings;
DROP FUNCTION IF EXISTS public.fn_syllabus_mapping_node_fields();
DROP FUNCTION IF EXISTS public.fn_taxonomy_topic_of(uuid);
DROP INDEX IF EXISTS public.idx_syllabus_mappings_topic;
ALTER TABLE public.exam_syllabus_canonical_mappings DROP COLUMN IF EXISTS topic_id, DROP COLUMN IF EXISTS rollup_topic_id,
    DROP CONSTRAINT IF EXISTS chk_syllabus_mapping_node_type, DROP CONSTRAINT IF EXISTS exam_syllabus_canonical_mappings_topic_fkey;
ALTER TABLE public.exam_syllabus_canonical_mappings DROP COLUMN canonical_node_type;
ALTER TABLE public.exam_syllabus_canonical_mappings ADD COLUMN canonical_node_type text GENERATED ALWAYS AS ('TOPIC') STORED;
ALTER TABLE public.exam_syllabus_canonical_mappings
  ADD CONSTRAINT exam_syllabus_canonical_mappings_topic_fkey
  FOREIGN KEY (canonical_node_id, canonical_node_type) REFERENCES public.canonical_taxonomy_nodes (id, node_type) ON DELETE RESTRICT;

ALTER TABLE public.exam_syllabus_nodes DROP COLUMN IF EXISTS metadata;
DROP INDEX public.uq_exam_syllabus_one_published;
CREATE UNIQUE INDEX uq_exam_syllabus_one_published
  ON public.exam_syllabus_versions (exam_id, COALESCE(exam_cycle_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'PUBLISHED' AND is_active;
ALTER TABLE public.exam_syllabus_versions DROP COLUMN IF EXISTS tier;

COMMIT;
