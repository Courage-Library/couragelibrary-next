-- =====================================================================================================================
-- 120 CA-5 EXAM COURSES (generated) + NODE-LESSON COUNTS + MASTER-CHAPTER ACCESS + LESSON PROGRESS
-- Architect GO (CA-5, 2026-10-28) as a CONDITIONAL GO: backup → dry-run (alone) → chunked rolled-back smoke AS THE REAL
-- ROLES → apply → live verify → counts + types diff 0 + link-set proof + MIGRATION-LIVE-SET. Rollback:
-- docs/database/rollback/120_rollback.sql. No BEGIN / COMMIT: the runner owns the transaction.
--
--   fn_servable_node_lessons() — every servable node lesson (document PUBLISHED, current version published BLOCKS,
--     node active) with its MASTER CHAPTER (the TOPIC it is, or rolls up to) and its POSITION in master order inside
--     that chapter (pre-order by display_order, name, id). The one source for counts, the course outline and access
--     (first N per chapter free — the same for every exam, design decision 2). SECURITY INVOKER: anon reads only what
--     RLS already shows (published documents, active nodes, the non-body version columns).
--   fn_exam_syllabus_read_model / fn_syllabus__validate — redefined (same signatures, grants and security): servable
--     documents per topic now include node lessons (CA-4 open item 4).
--   fn_exam_course_outline(exam, cycle, language) — the exam COURSE, generated, never copied: the published syllabus
--     versions of the chosen cycle (every tier) → their mapped TOPIC / SUBTOPIC / CONCEPT nodes + all active descendants
--     ∩ nodes with a servable lesson → chapters (= master TOPICs) in master order, lessons in master order with their
--     chapter position. SECURITY INVOKER, anon + authenticated.
--   user_lesson_progress — (user, document, language) NOT_STARTED / READING / COMPLETED, last block, timestamps. Clients
--     read their OWN rows (RLS); NO client table writes: fn_lesson_progress_save (SECURITY DEFINER, search_path '',
--     the user from auth.uid(), authenticated only — the DRILL-1 pattern; SECDEF allow-list +1, reviewed entry).
-- Settings (no migration; premium_system_configs GLOBAL, a missing row = the default): LESSON_FREE_PER_CHAPTER {value: 2},
-- LESSON_GATING_ENABLED {value: false} — every lesson stays free until gating is switched on (per-exam launch = CA-6).
-- =====================================================================================================================

-- ------------------------------------------------------------------ preflight
DO $pre$
BEGIN
    IF to_regclass('public.user_lesson_progress') IS NOT NULL THEN RAISE EXCEPTION 'CA5_PREFLIGHT: user_lesson_progress already exists'; END IF;
    IF to_regprocedure('public.fn_exam_course_outline(uuid, uuid, text)') IS NOT NULL THEN RAISE EXCEPTION 'CA5_PREFLIGHT: the course outline already exists'; END IF;
    IF to_regclass('public.prompt_templates') IS NULL THEN RAISE EXCEPTION 'CA5_PREFLIGHT: 119 is not applied'; END IF;
END
$pre$;

-- ------------------------------------------------------------------ servable node lessons + master-chapter position
CREATE OR REPLACE FUNCTION public.fn_servable_node_lessons()
RETURNS TABLE (document_id uuid, canonical_slug text, node_id uuid, node_type text, topic_id uuid, chapter_position integer,
               published_at timestamptz, hi_current boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    WITH RECURSIVE
    docs AS (
        SELECT d.id, d.canonical_slug::text AS slug, d.node_id, dv.published_at
          FROM public.learning_documents d
          JOIN public.document_versions dv ON dv.id = d.current_published_version_id
         WHERE d.document_type = 'NODE_LESSON' AND d.status = 'PUBLISHED' AND d.node_id IS NOT NULL
           AND dv.is_published AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS'),
    -- every active TOPIC and its active descendants, with a master-order key (pre-order: display order, name, id)
    tree AS (
        SELECT n.id, n.id AS topic_id, n.node_type,
               lpad(n.display_order::text, 6, '0') || '~' || regexp_replace(lower(n.name), '[^a-z0-9 ]', '', 'g') || '~' || n.id::text AS k,
               0 AS depth
          FROM public.canonical_taxonomy_nodes n
         WHERE n.node_type = 'TOPIC' AND n.is_active
        UNION ALL
        SELECT c.id, t.topic_id, c.node_type,
               t.k || '/' || lpad(c.display_order::text, 6, '0') || '~' || regexp_replace(lower(c.name), '[^a-z0-9 ]', '', 'g') || '~' || c.id::text,
               t.depth + 1
          FROM public.canonical_taxonomy_nodes c
          JOIN tree t ON c.parent_id = t.id
         WHERE c.is_active AND t.depth < 3)
    SELECT d.id, d.slug, d.node_id, tr.node_type, tr.topic_id,
           (row_number() OVER (PARTITION BY tr.topic_id ORDER BY tr.k COLLATE "C"))::integer,
           d.published_at,
           EXISTS (SELECT 1 FROM public.document_versions h
                    WHERE h.document_id = d.id AND h.language = 'hi' AND h.is_current AND h.is_published)
      FROM docs d
      JOIN tree tr ON tr.id = d.node_id
$fn$;
COMMENT ON FUNCTION public.fn_servable_node_lessons() IS 'CA-5: servable node lessons with their master chapter (TOPIC) and position in master order; the one source for counts, courses and access.';

-- ------------------------------------------------------------------ read model + validate: node lessons count (same signatures)
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
  -- is_published and review_status PUBLISHED, unit active; CA-5: + node lessons (fn_servable_node_lessons), each
  -- counted under its master chapter (its TOPIC)
  td AS (SELECT x.topic_id, count(*)::int AS c FROM (
           SELECT u.topic_id FROM public.learning_documents d
             JOIN public.learning_units u ON u.id = d.learning_unit_id
             JOIN public.document_versions dv ON dv.id = d.current_published_version_id
            WHERE d.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED' AND u.is_active
           UNION ALL
           SELECT s.topic_id FROM public.fn_servable_node_lessons() s) x
          WHERE x.topic_id IN (SELECT topic_id FROM t) GROUP BY 1),
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
                                                  AND dv.review_status = 'PUBLISHED' AND u.is_active)
                                              + (SELECT count(*) FROM public.fn_servable_node_lessons() s WHERE s.topic_id = x.topic_id)), 0))
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
       -- CA-5: a published node lesson in the topic's master chapter counts too
       AND NOT EXISTS (SELECT 1 FROM public.fn_servable_node_lessons() s WHERE s.topic_id = t.id)
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

-- ------------------------------------------------------------------ the exam course (generated)
CREATE OR REPLACE FUNCTION public.fn_exam_course_outline(p_exam_id uuid, p_exam_cycle_id uuid DEFAULT NULL, p_language text DEFAULT 'en')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_cycle   uuid;
    v_found   boolean;
    v_out     jsonb;
BEGIN
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN
        RAISE EXCEPTION 'COURSE: language must be en or hi' USING ERRCODE = '22023';
    END IF;
    -- the cycle: the requested one when it has a published syllabus, else the exam-wide one, else the latest published
    SELECT exam_cycle_id, true INTO v_cycle, v_found
      FROM public.exam_syllabus_versions
     WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active
     ORDER BY (exam_cycle_id IS NOT DISTINCT FROM p_exam_cycle_id) DESC, (exam_cycle_id IS NULL) DESC, published_at DESC
     LIMIT 1;
    IF NOT coalesce(v_found, false) THEN
        RETURN jsonb_build_object('state', 'NO_SYLLABUS', 'exam_id', p_exam_id, 'exam_cycle_id', NULL, 'language', p_language,
                                  'chapters', '[]'::jsonb, 'totals', NULL);
    END IF;

    WITH RECURSIVE
    vs AS (SELECT id, tier FROM public.exam_syllabus_versions
            WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active AND exam_cycle_id IS NOT DISTINCT FROM v_cycle),
    units AS (SELECT n.id, n.weightage_tier, n.expected_questions_min, n.expected_questions_max
                FROM public.exam_syllabus_nodes n JOIN vs ON vs.id = n.syllabus_version_id),
    mapped AS (SELECT DISTINCT mp.canonical_node_id AS node_id, mp.syllabus_node_id
                 FROM public.exam_syllabus_canonical_mappings mp JOIN units u ON u.id = mp.syllabus_node_id
                WHERE mp.canonical_node_id IS NOT NULL),
    -- the mapped nodes and every active descendant (an L2 mapping covers its L3 / L4)
    covered AS (
        SELECT m.node_id AS id, m.syllabus_node_id, 0 AS depth FROM mapped m
        UNION
        SELECT c.id, cv.syllabus_node_id, cv.depth + 1
          FROM public.canonical_taxonomy_nodes c JOIN covered cv ON c.parent_id = cv.id
         WHERE c.is_active AND cv.depth < 3),
    lessons AS (SELECT s.*, (SELECT array_agg(DISTINCT cv.syllabus_node_id) FROM covered cv WHERE cv.id = s.node_id) AS via
                  FROM public.fn_servable_node_lessons() s
                 WHERE s.node_id IN (SELECT id FROM covered)),
    chapter_weight AS (
        SELECT l.topic_id,
               (array_agg(u.weightage_tier ORDER BY array_position(ARRAY['HIGH_YIELD', 'CORE', 'MODERATE', 'LOW', 'OPTIONAL'], u.weightage_tier)) FILTER (WHERE u.weightage_tier IS NOT NULL))[1] AS weightage_tier,
               max(u.expected_questions_max) AS expected_questions_max
          FROM (SELECT DISTINCT topic_id, unnest(via) AS unit_id FROM lessons) l
          JOIN units u ON u.id = l.unit_id
         GROUP BY l.topic_id),
    chapters AS (
        SELECT t.id AS topic_id, t.name, t.slug, t.display_order AS topic_order, s.id AS subject_id, s.name AS subject_name,
               coalesce(s.display_order, 0) AS subject_order,
               jsonb_agg(jsonb_build_object(
                   'document_id', l.document_id, 'slug', l.canonical_slug, 'node_id', l.node_id, 'node_type', l.node_type,
                   'name', nd.name, 'position', l.chapter_position, 'hi_available', l.hi_current,
                   'available_in_language', (p_language = 'en' OR l.hi_current))
                 ORDER BY l.chapter_position) AS lessons,
               count(*)::int AS n
          FROM lessons l
          JOIN public.canonical_taxonomy_nodes t ON t.id = l.topic_id
          JOIN public.canonical_taxonomy_nodes nd ON nd.id = l.node_id
          LEFT JOIN public.canonical_taxonomy_nodes s ON s.id = t.root_subject_id
         GROUP BY t.id, t.name, t.slug, t.display_order, s.id, s.name, s.display_order)
    SELECT jsonb_build_object(
             'state', 'AVAILABLE', 'exam_id', p_exam_id, 'exam_cycle_id', v_cycle, 'language', p_language,
             'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'tier', tier) ORDER BY tier NULLS FIRST), '[]'::jsonb) FROM vs),
             'chapters', coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'topic_id', c.topic_id, 'name', c.name, 'slug', c.slug, 'subject_id', c.subject_id, 'subject_name', c.subject_name,
                     'weightage_tier', w.weightage_tier, 'expected_questions_max', w.expected_questions_max, 'lessons', c.lessons)
                   ORDER BY c.subject_order, c.subject_name, c.topic_order, c.name, c.topic_id)
                 FROM chapters c LEFT JOIN chapter_weight w ON w.topic_id = c.topic_id), '[]'::jsonb),
             'totals', jsonb_build_object(
                 'mapped_nodes', (SELECT count(DISTINCT node_id) FROM mapped),
                 'covered_nodes', (SELECT count(DISTINCT id) FROM covered),
                 'chapters', (SELECT count(*) FROM chapters),
                 'lessons', (SELECT count(*) FROM lessons),
                 'lessons_in_language', (SELECT count(*) FROM lessons WHERE p_language = 'en' OR hi_current)))
      INTO v_out;
    RETURN v_out;
END
$fn$;
COMMENT ON FUNCTION public.fn_exam_course_outline(uuid, uuid, text) IS 'CA-5: an exam course generated from its published syllabi ∩ servable node lessons; chapters = master topics in master order.';

-- ------------------------------------------------------------------ lesson progress (own rows only; RPC writes)
CREATE TABLE public.user_lesson_progress (
    user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    document_id    uuid NOT NULL REFERENCES public.learning_documents (id) ON DELETE CASCADE,
    language       text NOT NULL CHECK (language IN ('en', 'hi')),
    node_id        uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE SET NULL,
    status         text NOT NULL CHECK (status IN ('NOT_STARTED', 'READING', 'COMPLETED')),
    last_block_id  text CHECK (last_block_id IS NULL OR last_block_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
    started_at     timestamptz NOT NULL DEFAULT now(),
    completed_at   timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, document_id, language),
    CONSTRAINT chk_lesson_progress_completed CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX idx_user_lesson_progress_recent ON public.user_lesson_progress (user_id, updated_at DESC);
COMMENT ON TABLE public.user_lesson_progress IS 'CA-5: a student''s progress per lesson and language; own rows readable; written only by fn_lesson_progress_save (auth.uid()).';

ALTER TABLE public.user_lesson_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_lesson_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_lesson_progress TO authenticated;
GRANT ALL ON TABLE public.user_lesson_progress TO service_role;
CREATE POLICY "user_lesson_progress: own rows" ON public.user_lesson_progress
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- The only write path: the caller is auth.uid(); the document must be servable (a published lesson); READING never
-- downgrades a COMPLETED lesson (it only moves the last block); idempotent (one row per user, document, language).
CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user uuid := auth.uid();
    v_node uuid;
    v_row  public.user_lesson_progress%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'PROGRESS: sign in to save progress' USING ERRCODE = '42501'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'PROGRESS: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('READING', 'COMPLETED') THEN RAISE EXCEPTION 'PROGRESS: status must be READING or COMPLETED' USING ERRCODE = '22023'; END IF;
    IF p_last_block_id IS NOT NULL AND p_last_block_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' THEN
        RAISE EXCEPTION 'PROGRESS: invalid block id' USING ERRCODE = '22023';
    END IF;
    SELECT d.node_id INTO v_node
      FROM public.learning_documents d
      JOIN public.document_versions dv ON dv.id = d.current_published_version_id
     WHERE d.id = p_document_id AND d.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS';
    IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS: lesson not found' USING ERRCODE = 'P0002'; END IF;

    INSERT INTO public.user_lesson_progress AS p (user_id, document_id, language, node_id, status, last_block_id, completed_at)
    VALUES (v_user, p_document_id, p_language, v_node, p_status, p_last_block_id, CASE WHEN p_status = 'COMPLETED' THEN now() END)
    ON CONFLICT (user_id, document_id, language) DO UPDATE
       SET status        = CASE WHEN p.status = 'COMPLETED' THEN 'COMPLETED' ELSE EXCLUDED.status END,
           completed_at  = CASE WHEN p.status = 'COMPLETED' THEN p.completed_at ELSE EXCLUDED.completed_at END,
           last_block_id = coalesce(EXCLUDED.last_block_id, p.last_block_id),
           node_id       = EXCLUDED.node_id,
           updated_at    = now()
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('document_id', v_row.document_id, 'language', v_row.language, 'status', v_row.status,
                              'last_block_id', v_row.last_block_id, 'completed_at', v_row.completed_at);
END
$fn$;

-- ------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.fn_servable_node_lessons() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_exam_course_outline(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_lesson_progress_save(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_servable_node_lessons() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_outline(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_progress_save(uuid, text, text, text) TO authenticated;

-- ------------------------------------------------------------------ proof
DO $proof$
BEGIN
    IF has_table_privilege('authenticated', 'public.user_lesson_progress', 'INSERT') OR has_table_privilege('authenticated', 'public.user_lesson_progress', 'UPDATE')
       OR has_table_privilege('anon', 'public.user_lesson_progress', 'SELECT') OR has_function_privilege('anon', 'public.fn_lesson_progress_save(uuid, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'CA5_PROOF: progress is writable by a client or readable by anon';
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_exam_course_outline(uuid, uuid, text)'::regprocedure)
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_servable_node_lessons()'::regprocedure)
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_exam_syllabus_read_model(uuid, uuid)'::regprocedure) THEN
        RAISE EXCEPTION 'CA5_PROOF: security modes';
    END IF;
END
$proof$;
