-- Rollback for 20261028000120_ca5_courses_progress.sql. Run as ONE transaction by the operator.
-- Drops the student progress rows (user_lesson_progress) — export them first if they must be kept. The read model and
-- validate bodies below are the exact 116 definitions (servable documents = unit documents only again).
BEGIN;

-- the read model + validate as before 120 (same signatures; grants unchanged by CREATE OR REPLACE)
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
  -- the cycle's own published version, else the exam-wide one (no cycle), else the latest published version;
  -- CA-2: with several tiers, the all-tiers version (tier NULL) first, then the lowest tier
  SELECT * INTO v FROM public.exam_syllabus_versions
   WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active
   ORDER BY (exam_cycle_id IS NOT DISTINCT FROM p_exam_cycle_id) DESC, (exam_cycle_id IS NULL) DESC, (tier IS NULL) DESC, tier, published_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'NO_SYLLABUS', 'exam_id', p_exam_id, 'version', NULL, 'nodes', '[]'::jsonb, 'totals', NULL);
  END IF;

  WITH RECURSIVE
  n AS (SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = v.id),
  m AS (SELECT mp.syllabus_node_id, mp.topic_id, mp.canonical_node_id AS node_id, mp.canonical_node_type AS node_type, mp.mapping_weight
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
                                        'node_id', m.node_id, 'node_type', m.node_type, 'node_name', nd.name,
                                        'weight', m.mapping_weight, 'published_questions', COALESCE(tq.c, 0),
                                        'servable_documents', COALESCE(td.c, 0)) ORDER BY c.name, nd.name) AS topics
      FROM m JOIN public.canonical_taxonomy_nodes c ON c.id = m.topic_id
      JOIN public.canonical_taxonomy_nodes nd ON nd.id = m.node_id
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
    FROM (SELECT DISTINCT mp.topic_id
            FROM public.exam_syllabus_canonical_mappings mp
            JOIN public.exam_syllabus_nodes x ON x.id = mp.syllabus_node_id
           WHERE x.syllabus_version_id = v.id AND mp.canonical_node_id IS NOT NULL) x;

  RETURN jsonb_build_object(
    'state', 'AVAILABLE', 'exam_id', p_exam_id,
    'version', jsonb_build_object('id', v.id, 'version_number', v.version_number, 'version_tag', v.version_tag,
                                  'exam_cycle_id', v.exam_cycle_id, 'tier', v.tier, 'published_at', v.published_at),
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
    -- CA-2: the mapped node itself (TOPIC / SUBTOPIC / CONCEPT) must be active; the code is kept for readers
    SELECT 'TOPIC_INACTIVE', m.syllabus_node_id, m.topic_id, format('%s "%s" is inactive.', initcap(t.node_type), t.name), 'error'
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
      FROM (SELECT m.topic_id, count(DISTINCT us.section_id) AS c
              FROM m JOIN unit_section us ON us.unit_id = m.syllabus_node_id
             WHERE m.canonical_node_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT us.section_id) > 1) x
      JOIN public.canonical_taxonomy_nodes t ON t.id = x.topic_id
    UNION ALL
    SELECT 'TOPIC_NO_PUBLISHED_QUESTIONS', NULL, t.id, format('Topic "%s" has no published questions yet.', t.name), 'warning'
      FROM (SELECT DISTINCT topic_id AS id FROM m WHERE canonical_node_id IS NOT NULL) tt
      JOIN public.canonical_taxonomy_nodes t ON t.id = tt.id
     WHERE NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.canonical_topic_id = t.id AND q.status = 'published')
    UNION ALL
    SELECT 'TOPIC_NO_SERVABLE_DOCUMENTS', NULL, t.id, format('Topic "%s" has no published learning documents yet.', t.name), 'warning'
      FROM (SELECT DISTINCT topic_id AS id FROM m WHERE canonical_node_id IS NOT NULL) tt
      JOIN public.canonical_taxonomy_nodes t ON t.id = tt.id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.learning_documents d
         JOIN public.learning_units u ON u.id = d.learning_unit_id
         JOIN public.document_versions dv ON dv.id = d.current_published_version_id
        WHERE u.topic_id = t.id AND u.is_active AND d.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED')
    UNION ALL
    -- CA-2: an intake item flagged uncertain stays visible until the owner has checked the draft
    SELECT 'UNCERTAIN_ITEM', n.id, NULL, format('"%s" was flagged uncertain: %s', n.raw_title, COALESCE(n.metadata ->> 'uncertain_reason', 'no reason given')), 'warning'
      FROM n WHERE (n.metadata ->> 'uncertain')::boolean IS TRUE
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
           'topics', (SELECT count(DISTINCT mp.topic_id) FROM public.exam_syllabus_canonical_mappings mp
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

DROP FUNCTION IF EXISTS public.fn_lesson_progress_save(uuid, text, text, text);
DROP TABLE IF EXISTS public.user_lesson_progress;
DROP FUNCTION IF EXISTS public.fn_exam_course_outline(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_servable_node_lessons();

-- scripts/secdef/allowlist.json: remove the fn_lesson_progress_save entry and lower total / client_executable_callable / A
-- by 1 in the same change (SECDEF ratchet SR-5)
COMMIT;
