-- =====================================================================================================================
-- 116 CA-2 SYLLABUS INTAKE (CONTENT-ARCH-1 §B / M2)
-- Architect GO (CA-2) as a CONDITIONAL GO: backup → dry-run (alone) → chunked rolled-back smoke AS THE REAL ROLES →
-- apply → live verify → counts + types diff 0 + taxonomy link snapshot (counts AND hashes) unchanged.
-- Rollback: docs/database/rollback/116_rollback.sql. No BEGIN / COMMIT: the runner owns the transaction.
--
--   exam_syllabus_versions — + tier (NULL = the exam's only / all tiers); ONE PUBLISHED per (exam, cycle, tier);
--     fn_syllabus_publish archives only the same tier; drafts copy the tier.
--   exam_syllabus_nodes — + metadata (uncertain flags, intake provenance).
--   exam_syllabus_canonical_mappings — may target TOPIC, SUBTOPIC or CONCEPT (canonical_node_type becomes a plain
--     column set by trigger from the node; the composite FK stays); + rollup_topic_id (set by trigger for SUBTOPIC /
--     CONCEPT) and topic_id = COALESCE(rollup_topic_id, canonical_node_id) (generated): every "topic" reader uses
--     topic_id, so the 61 existing TOPIC rows read exactly as before (no existing row is updated).
--   Readers: fn_exam_syllabus_read_model (+ version tier; topics via topic_id + the mapped node), fn_syllabus__validate
--     (topic checks via topic_id; NODE_INACTIVE on the mapped node), fn_syllabus_set_unit_mappings (TOPIC / SUBTOPIC /
--     CONCEPT).
--   fn_taxonomy_move_node — refuses moving a node whose subtree holds a SUBTOPIC / CONCEPT syllabus mapping (its topic
--     roll-up would change silently).
--   fn_taxonomy_merge_nodes — syllabus mappings: DRAFT rows are re-pointed; each PUBLISHED version that maps the source
--     gets a new re-pointed DRAFT copy (the owner checks and publishes it); ARCHIVED rows keep their history. A DRAFT
--     already open for that exam / cycle / tier → fail-closed.
--   syllabus_intake_sessions / syllabus_intake_items — staging for the AI intake (nothing touches the master tree or
--     a syllabus version until the owner decides every item). Staff read; writes via the RPCs only.
--   fn_syllabus_intake_create / _decide / _import / _discard — SECURITY INVOKER, EXECUTE service_role only, audited
--     (SYLLABUS_INTAKE_*). Nothing is created silently: APPROVE_NEW and ALIAS are explicit owner decisions.
-- =====================================================================================================================

-- ------------------------------------------------------------------ preflight
DO $pre$
DECLARE
    v_n integer;
BEGIN
    SELECT count(*) INTO v_n FROM public.exam_syllabus_canonical_mappings m
      JOIN public.canonical_taxonomy_nodes n ON n.id = m.canonical_node_id WHERE n.node_type <> 'TOPIC';
    IF v_n > 0 THEN RAISE EXCEPTION 'CA2_PREFLIGHT: % mappings already target a non-TOPIC node', v_n; END IF;
    SELECT count(*) INTO v_n FROM pg_attribute
     WHERE attrelid = 'public.exam_syllabus_canonical_mappings'::regclass AND attname = 'canonical_node_type' AND attgenerated = 's';
    IF v_n <> 1 THEN RAISE EXCEPTION 'CA2_PREFLIGHT: canonical_node_type is not the generated TOPIC column'; END IF;
END
$pre$;

-- ------------------------------------------------------------------ versions: tier
ALTER TABLE public.exam_syllabus_versions
    ADD COLUMN IF NOT EXISTS tier text
    CONSTRAINT chk_syllabus_version_tier CHECK (tier IS NULL OR (tier ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(tier) <= 40));
COMMENT ON COLUMN public.exam_syllabus_versions.tier IS 'CA-2: exam tier / stage (e.g. tier-1); NULL = the exam''s only or all tiers. One PUBLISHED per (exam, cycle, tier).';

DROP INDEX public.uq_exam_syllabus_one_published;
CREATE UNIQUE INDEX uq_exam_syllabus_one_published
    ON public.exam_syllabus_versions (exam_id, COALESCE(exam_cycle_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(tier, ''))
    WHERE status = 'PUBLISHED' AND is_active;

-- ------------------------------------------------------------------ nodes: metadata
ALTER TABLE public.exam_syllabus_nodes ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.exam_syllabus_nodes.metadata IS 'CA-2: intake provenance (uncertain flag + reason, marks, headings deeper than L4).';

-- ------------------------------------------------------------------ mappings: TOPIC / SUBTOPIC / CONCEPT + topic roll-up
ALTER TABLE public.exam_syllabus_canonical_mappings ALTER COLUMN canonical_node_type DROP EXPRESSION;
ALTER TABLE public.exam_syllabus_canonical_mappings
    ADD CONSTRAINT chk_syllabus_mapping_node_type CHECK (canonical_node_type IN ('TOPIC', 'SUBTOPIC', 'CONCEPT')),
    ADD COLUMN rollup_topic_id uuid,
    ADD COLUMN topic_id uuid GENERATED ALWAYS AS (COALESCE(rollup_topic_id, canonical_node_id)) STORED;
CREATE INDEX IF NOT EXISTS idx_syllabus_mappings_topic ON public.exam_syllabus_canonical_mappings (topic_id);
COMMENT ON COLUMN public.exam_syllabus_canonical_mappings.topic_id IS
    'CA-2: the TOPIC this mapping counts for (the node itself, or the TOPIC ancestor of a SUBTOPIC / CONCEPT). Readers that mean "topic" use this column.';

-- The TOPIC ancestor of a TOPIC / SUBTOPIC / CONCEPT node (NULL for anything else).
CREATE OR REPLACE FUNCTION public.fn_taxonomy_topic_of(p_node_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
    WITH RECURSIVE up AS (
        SELECT id, parent_id, node_type, 1 AS hop FROM public.canonical_taxonomy_nodes WHERE id = p_node_id
        UNION ALL
        SELECT p.id, p.parent_id, p.node_type, up.hop + 1 FROM public.canonical_taxonomy_nodes p JOIN up ON p.id = up.parent_id
         WHERE up.node_type <> 'TOPIC' AND up.hop < 6)
    SELECT id FROM up WHERE node_type = 'TOPIC' LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_mapping_node_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_type text;
BEGIN
    IF NEW.canonical_node_id IS NULL THEN
        NEW.canonical_node_type := 'TOPIC';
        NEW.rollup_topic_id := NULL;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.canonical_node_id IS NOT DISTINCT FROM OLD.canonical_node_id THEN
        NEW.canonical_node_type := OLD.canonical_node_type;
        NEW.rollup_topic_id := OLD.rollup_topic_id;
        RETURN NEW;
    END IF;
    SELECT node_type INTO v_type FROM public.canonical_taxonomy_nodes WHERE id = NEW.canonical_node_id;
    IF v_type IS NULL OR v_type NOT IN ('TOPIC', 'SUBTOPIC', 'CONCEPT') THEN
        RAISE EXCEPTION 'SYLLABUS_MAPPING_NODE_TYPE: a syllabus unit maps to a TOPIC, SUBTOPIC or CONCEPT (got %)', coalesce(v_type, 'nothing')
            USING ERRCODE = '23514';
    END IF;
    NEW.canonical_node_type := v_type;
    NEW.rollup_topic_id := CASE WHEN v_type = 'TOPIC' THEN NULL ELSE public.fn_taxonomy_topic_of(NEW.canonical_node_id) END;
    RETURN NEW;
END
$fn$;

-- fires BEFORE the draft-only guard (alphabetical: "trg_a…" < "trg_guard…")
DROP TRIGGER IF EXISTS trg_a_syllabus_mapping_node_fields ON public.exam_syllabus_canonical_mappings;
CREATE TRIGGER trg_a_syllabus_mapping_node_fields
    BEFORE INSERT OR UPDATE OF canonical_node_id, canonical_node_type, rollup_topic_id ON public.exam_syllabus_canonical_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_syllabus_mapping_node_fields();

-- ------------------------------------------------------------------ syllabus readers / writers (bodies as before + CA-2)
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

-- publish: one PUBLISHED per (exam, cycle, TIER) — archive only the same tier
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
   WHERE exam_id = v.exam_id AND exam_cycle_id IS NOT DISTINCT FROM v.exam_cycle_id AND tier IS NOT DISTINCT FROM v.tier
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
    jsonb_build_object('exam_id', v.exam_id, 'exam_cycle_id', v.exam_cycle_id, 'tier', v.tier, 'version_number', v.version_number,
                       'previous_version_id', v_prev, 'counts', v_report -> 'counts', 'warning_count', v_report -> 'warning_count'));
  RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'archived_previous_version_id', v_prev,
                            'counts', v_report -> 'counts', 'warnings', v_report -> 'warnings');
END;
$function$;

-- create_draft: a copy keeps the source's tier
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
  IF v_from.tier IS NOT NULL THEN
    UPDATE public.exam_syllabus_versions SET tier = v_from.tier WHERE id = v_new.id;
  END IF;

  IF p_from_version_id IS NOT NULL THEN
    FOR r IN SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = p_from_version_id
              ORDER BY node_depth, display_order, raw_title LOOP
      v_new_id := public.fn_syllabus__insert_node(
        v_new.id, CASE WHEN r.parent_node_id IS NULL THEN NULL ELSE (v_map ->> r.parent_node_id::text)::uuid END,
        r.node_kind, r.raw_title, r.raw_slug, r.display_order, r.description, r.weightage_tier,
        r.expected_questions_min, r.expected_questions_max, r.is_mandatory);
      UPDATE public.exam_syllabus_nodes SET required_cognitive_depth = r.required_cognitive_depth, metadata = r.metadata WHERE id = v_new_id;
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
    jsonb_build_object('exam_id', v_new.exam_id, 'exam_cycle_id', v_new.exam_cycle_id, 'tier', v_from.tier, 'version_number', v_new.version_number,
                       'version_tag', v_new.version_tag, 'from_version_id', p_from_version_id,
                       'nodes_copied', v_nodes, 'mappings_copied', v_maps));
  RETURN jsonb_build_object('success', true, 'version_id', v_new.id, 'version_number', v_new.version_number,
                            'version_tag', v_new.version_tag, 'nodes_copied', v_nodes, 'mappings_copied', v_maps);
END;
$function$;

-- unit mappings: TOPIC / SUBTOPIC / CONCEPT (CA-2); everything else as before
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
   WHERE NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes c
                      WHERE c.id = t AND c.node_type IN ('TOPIC', 'SUBTOPIC', 'CONCEPT') AND c.is_active);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'SYLLABUS_TOPICS_INVALID: not active TOPIC / SUBTOPIC / CONCEPT nodes: %', v_bad USING ERRCODE = '23503';
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

-- ------------------------------------------------------------------ taxonomy move: keep syllabus roll-ups true
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
    -- CA-2: a SUBTOPIC / CONCEPT mapped in a syllabus counts for its topic; moving it would change that silently
    SELECT count(*) INTO v_n FROM public.exam_syllabus_canonical_mappings
     WHERE canonical_node_id = ANY (v_subtree) AND canonical_node_type <> 'TOPIC';
    IF v_n > 0 THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: % syllabus mappings point into this branch below topic level; re-map them first', v_n;
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

-- ------------------------------------------------------------------ taxonomy merge: syllabus-aware (CA-2)
-- Copies a PUBLISHED syllabus version into a new DRAFT with p_source re-pointed to p_target (service-role path; no JWT
-- role check: callers are fn_taxonomy_merge_nodes only). Returns the new version id.
CREATE OR REPLACE FUNCTION public.fn_syllabus__repointed_draft(p_version_id uuid, p_source uuid, p_target uuid, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_from public.exam_syllabus_versions%ROWTYPE;
    v_new  public.exam_syllabus_versions;
    v_map  jsonb := '{}'::jsonb;
    r      record;
    v_id   uuid;
BEGIN
    SELECT * INTO v_from FROM public.exam_syllabus_versions WHERE id = p_version_id;
    IF EXISTS (SELECT 1 FROM public.exam_syllabus_versions
                WHERE exam_id = v_from.exam_id AND exam_cycle_id IS NOT DISTINCT FROM v_from.exam_cycle_id
                  AND tier IS NOT DISTINCT FROM v_from.tier AND status = 'DRAFT') THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: merge blocked: a DRAFT syllabus is already open for this exam / cycle / tier (version %); publish or delete it first', v_from.version_number;
    END IF;
    v_new := public.fn_syllabus__create_version(v_from.exam_id, v_from.exam_cycle_id, NULL, 'MANUAL', p_version_id, NULL,
        jsonb_build_object('copied_from_version_id', p_version_id, 'taxonomy_merge', jsonb_build_object('source_id', p_source, 'target_id', p_target)));
    UPDATE public.exam_syllabus_versions SET tier = v_from.tier, created_by = p_actor_id WHERE id = v_new.id;
    FOR r IN SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = p_version_id
              ORDER BY node_depth, display_order, raw_title LOOP
        v_id := public.fn_syllabus__insert_node(
            v_new.id, CASE WHEN r.parent_node_id IS NULL THEN NULL ELSE (v_map ->> r.parent_node_id::text)::uuid END,
            r.node_kind, r.raw_title, r.raw_slug, r.display_order, r.description, r.weightage_tier,
            r.expected_questions_min, r.expected_questions_max, r.is_mandatory);
        UPDATE public.exam_syllabus_nodes SET required_cognitive_depth = r.required_cognitive_depth, metadata = r.metadata WHERE id = v_id;
        v_map := v_map || jsonb_build_object(r.id::text, v_id);
    END LOOP;
    -- a unit that mapped both nodes keeps one row (its weights then need the owner's fix: validation reports it)
    INSERT INTO public.exam_syllabus_canonical_mappings
        (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, mapping_weight, reviewed_by, reviewed_at)
    SELECT (v_map ->> mp.syllabus_node_id::text)::uuid,
           CASE WHEN mp.canonical_node_id = p_source THEN p_target ELSE mp.canonical_node_id END,
           mp.match_status, mp.match_confidence, mp.match_method, mp.mapping_weight, mp.reviewed_by, mp.reviewed_at
      FROM public.exam_syllabus_canonical_mappings mp
      JOIN public.exam_syllabus_nodes n ON n.id = mp.syllabus_node_id
     WHERE n.syllabus_version_id = p_version_id
    ON CONFLICT (syllabus_node_id, canonical_node_id) WHERE canonical_node_id IS NOT NULL DO NOTHING;
    RETURN v_new.id;
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
    v_drafts   jsonb := '[]'::jsonb;
    v_ver      record;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'TAXONOMY_RULE: an actor is required'; END IF;
    IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: a merge needs a reason (at least 5 characters)';
    END IF;
    IF p_source_id IS NULL OR p_target_id IS NULL OR p_source_id = p_target_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: choose two different nodes';
    END IF;
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
    -- CA-2: the children move under the target, so a SUBTOPIC / CONCEPT below the source that a syllabus maps would
    -- change its topic roll-up silently
    SELECT count(*) INTO v_n FROM public.exam_syllabus_canonical_mappings
     WHERE canonical_node_id = ANY (public.fn_taxonomy_subtree_ids(p_source_id)) AND canonical_node_id <> p_source_id
       AND canonical_node_type <> 'TOPIC';
    IF v_n > 0 THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: merge blocked: % syllabus mappings point below the source at subtopic / concept level; re-map them first', v_n;
    END IF;

    -- 0. syllabi (CA-2): every PUBLISHED version that maps the source gets a re-pointed DRAFT copy (the owner checks and
    --    publishes it); DRAFT rows are re-pointed in step 5; ARCHIVED rows keep their history.
    FOR v_ver IN
        SELECT DISTINCT v.id, v.version_number, v.exam_id FROM public.exam_syllabus_canonical_mappings mp
          JOIN public.exam_syllabus_nodes n ON n.id = mp.syllabus_node_id
          JOIN public.exam_syllabus_versions v ON v.id = n.syllabus_version_id
         WHERE mp.canonical_node_id = p_source_id AND v.status = 'PUBLISHED'
         ORDER BY v.exam_id, v.version_number
    LOOP
        v_drafts := v_drafts || jsonb_build_array(jsonb_build_object(
            'from_version_id', v_ver.id, 'draft_version_id', public.fn_syllabus__repointed_draft(v_ver.id, p_source_id, p_target_id, p_actor_id)));
    END LOOP;

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
    --    deactivated and never deleted, so its foreign keys stay valid. Syllabus mappings: DRAFT versions only.
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
            IF v_ref.tbl = 'public.exam_syllabus_canonical_mappings'::regclass THEN
                UPDATE public.exam_syllabus_canonical_mappings mp SET canonical_node_id = p_target_id
                  FROM public.exam_syllabus_nodes n JOIN public.exam_syllabus_versions v ON v.id = n.syllabus_version_id
                 WHERE mp.syllabus_node_id = n.id AND v.status = 'DRAFT' AND mp.canonical_node_id = p_source_id;
            ELSE
                EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_ref.tbl, v_ref.col, v_ref.col) USING p_target_id, p_source_id;
            END IF;
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
                           'aliases_added', v_added, 'repointed', v_counts, 'syllabus_drafts', v_drafts),
        p_reason);
    RETURN jsonb_build_object('source_id', p_source_id, 'target_id', p_target_id, 'children_moved', v_children,
                              'aliases_moved', v_moved_aliases, 'aliases_added', v_added, 'repointed', v_counts,
                              'syllabus_drafts', v_drafts);
END
$fn$;

-- ------------------------------------------------------------------ intake staging
CREATE TABLE IF NOT EXISTS public.syllabus_intake_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id             uuid NOT NULL REFERENCES public.exams (id) ON DELETE RESTRICT,
    exam_cycle_id       uuid REFERENCES public.exam_cycles (id) ON DELETE RESTRICT,
    tier                text CHECK (tier IS NULL OR (tier ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(tier) <= 40)),
    source_url          text NOT NULL CHECK (source_url ~ '^https://[^\s<>"]+$' AND char_length(source_url) <= 500),
    as_of_date          date NOT NULL,
    contract_version    integer NOT NULL DEFAULT 2 CHECK (contract_version = 2),
    payload             jsonb NOT NULL CHECK (octet_length(payload::text) <= 262144),
    payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    status              text NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW', 'IMPORTED', 'DISCARDED')),
    imported_version_id uuid REFERENCES public.exam_syllabus_versions (id) ON DELETE SET NULL,
    created_by          uuid,
    created_by_email    text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_intake_imported CHECK ((status = 'IMPORTED') = (imported_version_id IS NOT NULL) OR status = 'IMPORTED')
);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_exam ON public.syllabus_intake_sessions (exam_id, status);

CREATE TABLE IF NOT EXISTS public.syllabus_intake_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       uuid NOT NULL REFERENCES public.syllabus_intake_sessions (id) ON DELETE CASCADE,
    parent_item_id   uuid REFERENCES public.syllabus_intake_items (id) ON DELETE CASCADE,
    item_key         text NOT NULL CHECK (item_key ~ '^[a-z0-9.]+$' AND char_length(item_key) <= 64),
    level            text NOT NULL CHECK (level IN ('PAPER', 'SUBJECT', 'TOPIC', 'SUBTOPIC', 'CONCEPT')),
    position         integer NOT NULL CHECK (position >= 0),
    raw_name         text NOT NULL CHECK (char_length(btrim(raw_name)) BETWEEN 1 AND 200),
    raw_name_hi      text CHECK (raw_name_hi IS NULL OR char_length(btrim(raw_name_hi)) BETWEEN 1 AND 200),
    aliases          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(aliases) <= 10),
    marks            numeric CHECK (marks IS NULL OR (marks >= 0 AND marks <= 10000)),
    questions        integer CHECK (questions IS NULL OR (questions >= 0 AND questions <= 1000)),
    weightage_tier   text CHECK (weightage_tier IS NULL OR weightage_tier IN ('HIGH_YIELD', 'CORE', 'MODERATE', 'LOW', 'OPTIONAL')),
    uncertain        boolean NOT NULL DEFAULT false,
    uncertain_reason text CHECK (uncertain_reason IS NULL OR char_length(uncertain_reason) <= 500),
    extra_headings   text[] NOT NULL DEFAULT '{}' CHECK (cardinality(extra_headings) <= 50),
    match_status     text NOT NULL CHECK (match_status IN ('EXACT', 'ALIAS', 'CLOSE', 'NEW', 'NOT_APPLICABLE')),
    matched_node_id  uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    candidates       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) <= 3),
    decision         text CHECK (decision IS NULL OR decision IN ('LINK', 'ALIAS', 'APPROVE_NEW', 'IGNORE')),
    decision_node_id uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    decided_by       uuid,
    decided_by_email text,
    decided_at       timestamptz,
    CONSTRAINT uq_intake_item_key UNIQUE (session_id, item_key),
    CONSTRAINT chk_intake_paper_level CHECK ((level = 'PAPER') = (match_status = 'NOT_APPLICABLE')),
    CONSTRAINT chk_intake_decision_node CHECK (
        decision IS NULL OR (decision = 'IGNORE' AND decision_node_id IS NULL) OR (decision <> 'IGNORE' AND decision_node_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_intake_items_session ON public.syllabus_intake_items (session_id, parent_item_id);
CREATE INDEX IF NOT EXISTS idx_intake_items_matched ON public.syllabus_intake_items (matched_node_id);
CREATE INDEX IF NOT EXISTS idx_intake_items_decision_node ON public.syllabus_intake_items (decision_node_id);

COMMENT ON TABLE public.syllabus_intake_sessions IS 'CA-2: one pasted AI syllabus (contract SYLLABUS_INTAKE v2) under review; nothing touches the master tree or a syllabus version until every item is decided.';
COMMENT ON TABLE public.syllabus_intake_items IS 'CA-2: one item of an intake (paper / subject / topic / subtopic / concept) with its match and the owner''s decision.';

ALTER TABLE public.syllabus_intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_intake_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.syllabus_intake_sessions, public.syllabus_intake_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.syllabus_intake_sessions, public.syllabus_intake_items TO authenticated;
GRANT ALL ON TABLE public.syllabus_intake_sessions, public.syllabus_intake_items TO service_role;
CREATE POLICY "syllabus_intake_sessions: admin/staff read" ON public.syllabus_intake_sessions
    FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());
CREATE POLICY "syllabus_intake_items: admin/staff read" ON public.syllabus_intake_items
    FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- ------------------------------------------------------------------ intake RPCs (service_role only, audited)
CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_audit(
    p_actor_id uuid, p_actor_email text, p_action text, p_entity text, p_target_id uuid, p_new jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, p_action, p_entity, p_target_id::text, NULL, p_new, NULL);
END
$fn$;

-- Stores a validated + matched intake (the matching runs in lib/syllabus/tree-matcher.ts; the database re-checks every
-- structural claim: levels, parents, matched nodes of the right level under the matched parent, plain text).
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

-- The owner's decision on one item: LINK (an existing node of the item's level under the parent's resolved node),
-- ALIAS (the same + the item's names become aliases of that node), APPROVE_NEW (creates the node there, audited),
-- IGNORE (the item and everything below it). Nothing is created without this explicit call.
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
$fn$;

-- Every non-paper item decided → one DRAFT syllabus version (exam, cycle, tier): PAPER → PAPER, SUBJECT → SECTION,
-- TOPIC → UNIT mapped to its decided SUBTOPIC / CONCEPT nodes (the deepest listed level, ≤ 20) or the topic itself.
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

CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_discard(p_session_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status FROM public.syllabus_intake_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: intake % does not exist', p_session_id USING ERRCODE = 'P0002'; END IF;
    IF v_status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: the intake is %', v_status USING ERRCODE = 'P0001'; END IF;
    UPDATE public.syllabus_intake_sessions SET status = 'DISCARDED', updated_at = now() WHERE id = p_session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_DISCARD', 'syllabus_intake_session', p_session_id,
        jsonb_build_object('status', 'DISCARDED'));
END
$fn$;

-- ------------------------------------------------------------------ grants
-- The existing syllabus helpers are SECURITY INVOKER and only write tables service_role can already write; the intake /
-- merge paths (service_role) call them, so service_role gets EXECUTE (no added privilege; clients stay revoked).
GRANT EXECUTE ON FUNCTION public.fn_syllabus__create_version(uuid, uuid, text, text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus__insert_node(uuid, uuid, text, text, text, integer, text, text, integer, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus__slugify(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus__import_is_plain(text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_taxonomy_topic_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_mapping_node_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__repointed_draft(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_audit(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_create(uuid, uuid, text, text, date, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_discard(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_topic_of(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus__repointed_draft(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_audit(uuid, text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_create(uuid, uuid, text, text, date, jsonb, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_decide(uuid, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_discard(uuid, uuid, text) TO service_role;
