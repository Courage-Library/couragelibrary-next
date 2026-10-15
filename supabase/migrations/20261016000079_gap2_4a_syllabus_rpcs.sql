-- =============================================================================
-- COURAGE LIBRARY — GAP2-4a (2/3): role-checked syllabus write RPCs + published read model
-- Migration: 20261016000079_gap2_4a_syllabus_rpcs.sql
--
-- Approved design §2.2 / §4.1 / §5.3 + §10 additions. The app never writes the syllabus tables directly.
--   Write RPCs (SECURITY DEFINER, SET search_path = '', explicit role check, audit row in the same transaction):
--     fn_syllabus_create_draft        staff / admin   new DRAFT, empty or a deep copy of a PUBLISHED version
--     fn_syllabus_upsert_node         staff / admin   add or edit a node of a DRAFT
--     fn_syllabus_move_node           staff / admin   re-parent and / or reorder within a DRAFT
--     fn_syllabus_delete_node         staff / admin   delete a node (and its subtree) of a DRAFT
--     fn_syllabus_set_unit_mappings   staff / admin   replace a UNIT's topic mappings atomically (TOPIC only, weights)
--     fn_syllabus_validate            staff / admin   read-only structured issue list
--     fn_syllabus_publish             ADMIN only      validate → archive previous PUBLISHED (same exam + cycle) → publish
--     fn_syllabus_archive_version     ADMIN only      DRAFT / PUBLISHED → ARCHIVED
--   Read model (SECURITY DEFINER, reads PUBLISHED versions only; anon + authenticated):
--     fn_exam_syllabus_read_model(exam, cycle)  state NO_SYLLABUS | AVAILABLE; tree + DERIVED live counts
--   Core helpers fn_syllabus__* are owner-only (no EXECUTE for PUBLIC / anon / authenticated); the GAP2-4a seed
--   migration (080) uses the same core functions, so seeds follow the same rules.
-- Role source: JWT app_metadata.role (fn_jwt_is_admin_or_staff, new fn_jwt_is_admin). Denied → SQLSTATE 42501.
-- Rollback: docs/database/rollback/079_rollback.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;
REVOKE ALL ON FUNCTION public.fn_jwt_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jwt_is_admin() TO authenticated;

-- ---------------------------------------------------------------- core helpers (owner only)
CREATE OR REPLACE FUNCTION public.fn_syllabus__assert_role(p_admin_only boolean)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_admin_only THEN
    IF NOT public.fn_jwt_is_admin() THEN
      RAISE EXCEPTION 'SYLLABUS_FORBIDDEN: admin role required' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.fn_jwt_is_admin_or_staff() THEN
    RAISE EXCEPTION 'SYLLABUS_FORBIDDEN: admin or staff role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus__audit(p_action text, p_entity text, p_target uuid, p_old jsonb, p_new jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
  VALUES (
    auth.uid(),
    COALESCE(NULLIF(auth.jwt() ->> 'email', ''), CASE WHEN auth.uid() IS NULL THEN 'system:migration' ELSE 'unknown' END),
    p_action, p_entity, p_target::text, p_old, p_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus__slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT NULLIF(trim(BOTH '-' FROM regexp_replace(lower(COALESCE(p_text, '')), '[^a-z0-9]+', '-', 'g')), '');
$$;

-- locks the version row; returns its status; raises when missing
CREATE OR REPLACE FUNCTION public.fn_syllabus__lock_version(p_version_id uuid)
RETURNS public.exam_syllabus_versions LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v public.exam_syllabus_versions;
BEGIN
  SELECT * INTO v FROM public.exam_syllabus_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYLLABUS_VERSION_NOT_FOUND: %', p_version_id USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus__require_draft(p_version_id uuid)
RETURNS public.exam_syllabus_versions LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v public.exam_syllabus_versions;
BEGIN
  v := public.fn_syllabus__lock_version(p_version_id);
  IF v.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'SYLLABUS_NOT_DRAFT: version % is %', p_version_id, v.status USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus__create_version(
  p_exam_id uuid, p_exam_cycle_id uuid, p_version_tag text, p_source_kind text,
  p_supersedes uuid, p_payload_hash text, p_metadata jsonb)
RETURNS public.exam_syllabus_versions LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_number integer;
  v public.exam_syllabus_versions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN
    RAISE EXCEPTION 'SYLLABUS_EXAM_NOT_FOUND: %', p_exam_id USING ERRCODE = 'P0002';
  END IF;
  IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
    RAISE EXCEPTION 'SYLLABUS_CYCLE_NOT_OF_EXAM: cycle % does not belong to exam %', p_exam_cycle_id, p_exam_id USING ERRCODE = 'P0001';
  END IF;
  -- serialise version numbering per exam
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || p_exam_id::text, 0));
  SELECT COALESCE(max(version_number), 0) + 1 INTO v_number FROM public.exam_syllabus_versions WHERE exam_id = p_exam_id;
  INSERT INTO public.exam_syllabus_versions
    (exam_id, exam_cycle_id, version_tag, version_number, status, is_active, source_kind, supersedes_version_id,
     raw_payload_hash, metadata, created_by)
  VALUES
    (p_exam_id, p_exam_cycle_id, COALESCE(NULLIF(trim(p_version_tag), ''), 'v' || v_number), v_number, 'DRAFT', true,
     p_source_kind, p_supersedes, p_payload_hash, COALESCE(p_metadata, '{}'::jsonb), auth.uid())
  RETURNING * INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus__insert_node(
  p_version_id uuid, p_parent uuid, p_kind text, p_title text, p_slug text, p_order integer,
  p_description text, p_tier text, p_min integer, p_max integer, p_mandatory boolean)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_title text := NULLIF(trim(COALESCE(p_title, '')), '');
  v_order integer := p_order;
BEGIN
  IF v_title IS NULL OR length(v_title) > 200 THEN
    RAISE EXCEPTION 'SYLLABUS_NODE_TITLE_INVALID: title is required (1–200 characters)' USING ERRCODE = '22023';
  END IF;
  IF v_order IS NULL THEN
    SELECT COALESCE(max(display_order), 0) + 1 INTO v_order FROM public.exam_syllabus_nodes
     WHERE syllabus_version_id = p_version_id AND parent_node_id IS NOT DISTINCT FROM p_parent;
  END IF;
  INSERT INTO public.exam_syllabus_nodes
    (syllabus_version_id, parent_node_id, node_kind, raw_title, raw_slug, display_order, description, weightage_tier,
     expected_questions_min, expected_questions_max, is_mandatory, node_depth)
  VALUES
    (p_version_id, p_parent, p_kind, v_title, COALESCE(public.fn_syllabus__slugify(p_slug), public.fn_syllabus__slugify(v_title)),
     v_order, NULLIF(trim(COALESCE(p_description, '')), ''), p_tier, p_min, p_max, COALESCE(p_mandatory, true), 1)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- structured validation report (read-only)
CREATE OR REPLACE FUNCTION public.fn_syllabus__validate(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
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
$$;

-- ---------------------------------------------------------------- public write RPCs
CREATE OR REPLACE FUNCTION public.fn_syllabus_create_draft(
  p_exam_id uuid, p_exam_cycle_id uuid DEFAULT NULL, p_from_version_id uuid DEFAULT NULL, p_version_tag text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_upsert_node(p_version_id uuid, p_node jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid := NULLIF(p_node ->> 'id', '')::uuid;
  v_old public.exam_syllabus_nodes;
  v_created boolean := false;
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);
  PERFORM public.fn_syllabus__require_draft(p_version_id);
  IF v_id IS NULL THEN
    v_id := public.fn_syllabus__insert_node(
      p_version_id, NULLIF(p_node ->> 'parent_id', '')::uuid, COALESCE(p_node ->> 'kind', 'UNIT'), p_node ->> 'title',
      p_node ->> 'slug', (p_node ->> 'display_order')::integer, p_node ->> 'description', p_node ->> 'weightage_tier',
      (p_node ->> 'expected_questions_min')::integer, (p_node ->> 'expected_questions_max')::integer,
      (p_node ->> 'is_mandatory')::boolean);
    v_created := true;
  ELSE
    SELECT * INTO v_old FROM public.exam_syllabus_nodes WHERE id = v_id AND syllabus_version_id = p_version_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SYLLABUS_NODE_NOT_FOUND: node % is not in version %', v_id, p_version_id USING ERRCODE = 'P0002';
    END IF;
    IF p_node ? 'parent_id' AND NULLIF(p_node ->> 'parent_id', '')::uuid IS DISTINCT FROM v_old.parent_node_id THEN
      RAISE EXCEPTION 'SYLLABUS_USE_MOVE: change the parent with fn_syllabus_move_node' USING ERRCODE = 'P0001';
    END IF;
    IF p_node ? 'title' AND (NULLIF(trim(COALESCE(p_node ->> 'title', '')), '') IS NULL OR length(trim(p_node ->> 'title')) > 200) THEN
      RAISE EXCEPTION 'SYLLABUS_NODE_TITLE_INVALID: title is required (1–200 characters)' USING ERRCODE = '22023';
    END IF;
    UPDATE public.exam_syllabus_nodes SET
      node_kind = CASE WHEN p_node ? 'kind' THEN p_node ->> 'kind' ELSE node_kind END,
      raw_title = CASE WHEN p_node ? 'title' THEN trim(p_node ->> 'title') ELSE raw_title END,
      raw_slug = CASE WHEN p_node ? 'slug' THEN COALESCE(public.fn_syllabus__slugify(p_node ->> 'slug'), raw_slug) ELSE raw_slug END,
      display_order = CASE WHEN p_node ? 'display_order' THEN (p_node ->> 'display_order')::integer ELSE display_order END,
      description = CASE WHEN p_node ? 'description' THEN NULLIF(trim(COALESCE(p_node ->> 'description', '')), '') ELSE description END,
      weightage_tier = CASE WHEN p_node ? 'weightage_tier' THEN p_node ->> 'weightage_tier' ELSE weightage_tier END,
      expected_questions_min = CASE WHEN p_node ? 'expected_questions_min' THEN (p_node ->> 'expected_questions_min')::integer ELSE expected_questions_min END,
      expected_questions_max = CASE WHEN p_node ? 'expected_questions_max' THEN (p_node ->> 'expected_questions_max')::integer ELSE expected_questions_max END,
      is_mandatory = CASE WHEN p_node ? 'is_mandatory' THEN (p_node ->> 'is_mandatory')::boolean ELSE is_mandatory END,
      updated_at = now()
    WHERE id = v_id;
  END IF;
  PERFORM public.fn_syllabus__audit('SYLLABUS_NODE_UPSERT', 'exam_syllabus_node', v_id,
    CASE WHEN v_created THEN NULL ELSE to_jsonb(v_old) END, p_node || jsonb_build_object('version_id', p_version_id));
  RETURN jsonb_build_object('success', true, 'node_id', v_id, 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_move_node(p_node_id uuid, p_new_parent_id uuid, p_display_order integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_node public.exam_syllabus_nodes;
  v_order integer := p_display_order;
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);
  SELECT * INTO v_node FROM public.exam_syllabus_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYLLABUS_NODE_NOT_FOUND: %', p_node_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.fn_syllabus__require_draft(v_node.syllabus_version_id);
  IF v_order IS NULL THEN
    IF p_new_parent_id IS NOT DISTINCT FROM v_node.parent_node_id THEN
      v_order := v_node.display_order;
    ELSE
      SELECT COALESCE(max(display_order), 0) + 1 INTO v_order FROM public.exam_syllabus_nodes
       WHERE syllabus_version_id = v_node.syllabus_version_id AND parent_node_id IS NOT DISTINCT FROM p_new_parent_id;
    END IF;
  END IF;
  -- same-version parent, cycles and depth are enforced by the node triggers
  UPDATE public.exam_syllabus_nodes SET parent_node_id = p_new_parent_id, display_order = v_order, updated_at = now()
   WHERE id = p_node_id;
  PERFORM public.fn_syllabus__audit('SYLLABUS_NODE_MOVE', 'exam_syllabus_node', p_node_id,
    jsonb_build_object('parent_id', v_node.parent_node_id, 'display_order', v_node.display_order),
    jsonb_build_object('parent_id', p_new_parent_id, 'display_order', v_order, 'version_id', v_node.syllabus_version_id));
  RETURN jsonb_build_object('success', true, 'node_id', p_node_id, 'parent_id', p_new_parent_id, 'display_order', v_order);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_delete_node(p_node_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_node public.exam_syllabus_nodes;
  v_count integer;
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);
  SELECT * INTO v_node FROM public.exam_syllabus_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYLLABUS_NODE_NOT_FOUND: %', p_node_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.fn_syllabus__require_draft(v_node.syllabus_version_id);
  WITH RECURSIVE sub AS (
    SELECT id FROM public.exam_syllabus_nodes WHERE id = p_node_id
    UNION ALL
    SELECT n.id FROM public.exam_syllabus_nodes n JOIN sub ON n.parent_node_id = sub.id)
  SELECT count(*) INTO v_count FROM sub;
  DELETE FROM public.exam_syllabus_nodes WHERE id = p_node_id; -- subtree and mappings cascade
  PERFORM public.fn_syllabus__audit('SYLLABUS_NODE_DELETE', 'exam_syllabus_node', p_node_id, to_jsonb(v_node),
    jsonb_build_object('deleted_nodes', v_count, 'version_id', v_node.syllabus_version_id));
  RETURN jsonb_build_object('success', true, 'deleted_nodes', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_set_unit_mappings(p_node_id uuid, p_topic_ids uuid[], p_weights numeric[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_validate(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);
  RETURN public.fn_syllabus__validate(p_version_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_publish(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v public.exam_syllabus_versions;
  v_report jsonb;
  v_prev uuid;
BEGIN
  PERFORM public.fn_syllabus__assert_role(true);
  v := public.fn_syllabus__require_draft(p_version_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || v.exam_id::text, 0));
  v_report := public.fn_syllabus__validate(p_version_id);
  IF NOT (v_report ->> 'ok')::boolean THEN
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
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_archive_version(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v public.exam_syllabus_versions;
BEGIN
  PERFORM public.fn_syllabus__assert_role(true);
  v := public.fn_syllabus__lock_version(p_version_id);
  IF v.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'SYLLABUS_ALREADY_ARCHIVED: %', p_version_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.exam_syllabus_versions SET status = 'ARCHIVED', is_active = false, archived_at = now(), updated_at = now()
   WHERE id = p_version_id;
  PERFORM public.fn_syllabus__audit('SYLLABUS_ARCHIVE', 'exam_syllabus_version', p_version_id,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'ARCHIVED', 'exam_id', v.exam_id));
  RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'previous_status', v.status);
END;
$$;

-- ---------------------------------------------------------------- student read model (published only)
CREATE OR REPLACE FUNCTION public.fn_exam_syllabus_read_model(p_exam_id uuid, p_exam_cycle_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
$$;

-- ---------------------------------------------------------------- grants
-- core helpers: owner only (Supabase default privileges grant EXECUTE on new functions; revoke explicitly)
REVOKE ALL ON FUNCTION public.fn_syllabus__assert_role(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__audit(text, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__slugify(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__lock_version(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__require_draft(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__create_version(uuid, uuid, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__insert_node(uuid, uuid, text, text, text, integer, text, text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__validate(uuid) FROM PUBLIC, anon, authenticated;
-- write RPCs: authenticated only (role-checked inside); never anon
REVOKE ALL ON FUNCTION public.fn_syllabus_create_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_upsert_node(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_move_node(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_delete_node(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_set_unit_mappings(uuid, uuid[], numeric[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_validate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_publish(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_syllabus_archive_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_create_draft(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_upsert_node(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_move_node(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_delete_node(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_set_unit_mappings(uuid, uuid[], numeric[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_validate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_archive_version(uuid) TO authenticated;
-- read model: public (published data only)
REVOKE ALL ON FUNCTION public.fn_exam_syllabus_read_model(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_exam_syllabus_read_model(uuid, uuid) TO anon, authenticated;
