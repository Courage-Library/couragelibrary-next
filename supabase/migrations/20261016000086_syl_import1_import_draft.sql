-- =============================================================================
-- COURAGE LIBRARY — SYL-IMPORT-1: atomic, role-checked "import draft from JSON" for the canonical syllabus
-- Migration: 20261016000086_syl_import1_import_draft.sql
--
-- Functions + grants only (no table, column, policy or trigger change).
--   fn_syllabus_import_draft(p_exam_id uuid, p_payload jsonb)   staff / admin (fn_syllabus__assert_role(false), the
--     same check as fn_syllabus_create_draft). Re-validates the whole payload (contract_version 1,
--     docs/syllabus/IMPORT_CONTRACT.md) — the TypeScript validator (lib/syllabus/import-contract.ts) is for UX, this
--     function is the authority — then creates ONE DRAFT version (source_kind IMPORT, raw_payload_hash = sha256 of the
--     payload's jsonb text) + its PAPER / SECTION / UNIT nodes + UNIT topic mappings + one SYLLABUS_DRAFT_IMPORT audit
--     row, all in the caller's single transaction. Any error raises and nothing is written.
--     Never creates taxonomy topics (unknown → MISSING_TOPIC), never publishes / archives, never touches a PUBLISHED or
--     ARCHIVED version; refuses while the exam already has a DRAFT for the same cycle. The existing node / version
--     triggers stay authoritative (inserts go through fn_syllabus__create_version / fn_syllabus__insert_node).
--   Errors: 'SYLLABUS_IMPORT_INVALID: <CODE> at <JSON path>: <message>' (SQLSTATE 22023; DRAFT_EXISTS P0001).
--   Owner-only helpers fn_syllabus__import_* (no EXECUTE for PUBLIC / anon / authenticated).
-- EXECUTE: authenticated (+ service_role via default privileges); revoked from PUBLIC and anon.
-- Rollback: docs/database/rollback/086_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------- helpers (owner only)
CREATE FUNCTION public.fn_syllabus__import_fail(p_code text, p_path text, p_message text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'SYLLABUS_IMPORT_INVALID: % at %: %', p_code, p_path, p_message
    USING ERRCODE = CASE WHEN p_code = 'DRAFT_EXISTS' THEN 'P0001' ELSE '22023' END;
END;
$$;

-- plain text only (same rule as isPlainText in lib/syllabus/import-contract.ts)
CREATE FUNCTION public.fn_syllabus__import_is_plain(p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT NOT (
       p_text ~ '[<>`]'
    OR strpos(p_text, '](') > 0
    OR p_text ~ '\*\*|__'
    OR p_text ~ '(^|\n)[ \t]*[#>]'
    OR p_text ~* 'javascript:'
    OR p_text ~ '[\x01-\x09\x0b-\x1f\x7f]');
$$;

-- optional / required plain-text field; returns the trimmed value or NULL
CREATE FUNCTION public.fn_syllabus__import_text(p_obj jsonb, p_key text, p_path text, p_max integer, p_required boolean)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v jsonb := p_obj -> p_key;
  t text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    IF p_required THEN PERFORM public.fn_syllabus__import_fail('REQUIRED', p_path || '.' || p_key, format('"%s" is required.', p_key)); END IF;
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'string' THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', p_path || '.' || p_key, format('"%s" must be a string.', p_key));
  END IF;
  t := btrim(v #>> '{}', E' \t\r\n');
  IF t = '' THEN
    IF p_required THEN PERFORM public.fn_syllabus__import_fail('REQUIRED', p_path || '.' || p_key, format('"%s" must not be empty.', p_key)); END IF;
    RETURN NULL;
  END IF;
  IF char_length(t) > p_max THEN
    PERFORM public.fn_syllabus__import_fail('TOO_LONG', p_path || '.' || p_key, format('"%s" is longer than %s characters.', p_key, p_max));
  END IF;
  IF NOT public.fn_syllabus__import_is_plain(t) THEN
    PERFORM public.fn_syllabus__import_fail('NOT_PLAIN_TEXT', p_path || '.' || p_key, format('"%s" must be plain text.', p_key));
  END IF;
  RETURN t;
END;
$$;

-- optional whole number in [0, 1000]
CREATE FUNCTION public.fn_syllabus__import_count(p_obj jsonb, p_key text, p_path text)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v jsonb := p_obj -> p_key;
  n numeric;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) = 'number' THEN
    n := (v #>> '{}')::numeric;
    IF n = trunc(n) AND n BETWEEN 0 AND 1000 THEN RETURN n::integer; END IF;
  END IF;
  PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', p_path || '.' || p_key, format('"%s" must be a whole number between 0 and 1000, or null.', p_key));
  RETURN NULL;
END;
$$;

-- validates one PAPER / SECTION / UNIT object (everything except children and topics); returns its code
CREATE FUNCTION public.fn_syllabus__import_check_node(p_obj jsonb, p_path text, p_index integer, p_level text)
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  k text;
  v_allowed text[];
  v_code text;
  v_min integer;
  v_max integer;
BEGIN
  IF jsonb_typeof(p_obj) IS DISTINCT FROM 'object' THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', p_path, format('A %s must be an object.', lower(p_level)));
  END IF;
  v_allowed := CASE p_level
    WHEN 'PAPER' THEN ARRAY['code', 'title', 'order', 'description', 'is_mandatory', 'expected_questions_min', 'expected_questions_max', 'sections']
    WHEN 'SECTION' THEN ARRAY['code', 'title', 'order', 'description', 'is_mandatory', 'weightage_tier', 'expected_questions_min', 'expected_questions_max', 'units']
    ELSE ARRAY['code', 'title', 'order', 'description', 'is_mandatory', 'weightage_tier', 'expected_questions_min', 'expected_questions_max', 'required_cognitive_depth', 'topics'] END;
  FOR k IN SELECT jsonb_object_keys(p_obj) LOOP
    CONTINUE WHEN k = ANY (v_allowed);
    IF k = 'topics' THEN
      PERFORM public.fn_syllabus__import_fail('MAPPING_NOT_UNIT', p_path || '.topics', 'Topic mappings are allowed on UNIT nodes only.');
    ELSIF k IN ('papers', 'sections', 'units') THEN
      PERFORM public.fn_syllabus__import_fail('BAD_DEPTH', p_path || '.' || k, format('"%s" is not allowed under a %s: the tree is papers, sections, units.', k, lower(p_level)));
    ELSE
      PERFORM public.fn_syllabus__import_fail('UNKNOWN_KEY', p_path || '.' || k, format('Unknown key "%s".', k));
    END IF;
  END LOOP;

  IF p_obj -> 'code' IS NULL OR jsonb_typeof(p_obj -> 'code') = 'null' THEN
    PERFORM public.fn_syllabus__import_fail('REQUIRED', p_path || '.code', '"code" is required.');
  ELSIF jsonb_typeof(p_obj -> 'code') <> 'string' THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', p_path || '.code', '"code" must be a string.');
  END IF;
  v_code := p_obj ->> 'code';
  IF v_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_code) > 80 THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_CODE', p_path || '.code', '"code" must be lower-case letters, digits and single hyphens (max 80).');
  END IF;

  IF p_obj -> 'order' IS NOT NULL AND jsonb_typeof(p_obj -> 'order') <> 'null'
     AND (CASE WHEN jsonb_typeof(p_obj -> 'order') = 'number' THEN (p_obj ->> 'order')::numeric <> p_index + 1 ELSE true END) THEN
    PERFORM public.fn_syllabus__import_fail('ORDER_NOT_CONTIGUOUS', p_path || '.order', format('"order" must be %s (its position in the list), or be omitted.', p_index + 1));
  END IF;
  IF p_obj -> 'is_mandatory' IS NOT NULL AND jsonb_typeof(p_obj -> 'is_mandatory') NOT IN ('null', 'boolean') THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', p_path || '.is_mandatory', '"is_mandatory" must be true or false.');
  END IF;
  PERFORM public.fn_syllabus__import_text(p_obj, 'title', p_path, 200, true);
  PERFORM public.fn_syllabus__import_text(p_obj, 'description', p_path, 2000, false);
  v_min := public.fn_syllabus__import_count(p_obj, 'expected_questions_min', p_path);
  v_max := public.fn_syllabus__import_count(p_obj, 'expected_questions_max', p_path);
  IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
    PERFORM public.fn_syllabus__import_fail('RANGE_INVALID', p_path || '.expected_questions_min', 'expected_questions_min must not exceed expected_questions_max.');
  END IF;
  IF p_level <> 'PAPER' AND p_obj -> 'weightage_tier' IS NOT NULL AND jsonb_typeof(p_obj -> 'weightage_tier') <> 'null'
     AND COALESCE(p_obj ->> 'weightage_tier', '') NOT IN ('HIGH_YIELD', 'CORE', 'MODERATE', 'LOW', 'OPTIONAL') THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', p_path || '.weightage_tier', '"weightage_tier" must be HIGH_YIELD, CORE, MODERATE, LOW, OPTIONAL or null.');
  END IF;
  IF p_level = 'UNIT' AND p_obj -> 'required_cognitive_depth' IS NOT NULL AND jsonb_typeof(p_obj -> 'required_cognitive_depth') <> 'null'
     AND COALESCE(p_obj ->> 'required_cognitive_depth', '') NOT IN ('RECALL', 'UNDERSTANDING', 'APPLICATION', 'ANALYSIS', 'COMPLEX_PROBLEM_SOLVING') THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', p_path || '.required_cognitive_depth', '"required_cognitive_depth" must be RECALL, UNDERSTANDING, APPLICATION, ANALYSIS, COMPLEX_PROBLEM_SOLVING or null.');
  END IF;
  RETURN v_code;
END;
$$;

-- a required, non-empty list of child objects
CREATE FUNCTION public.fn_syllabus__import_list(p_obj jsonb, p_key text, p_path text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_obj -> p_key IS NULL OR jsonb_typeof(p_obj -> p_key) = 'null' THEN
    PERFORM public.fn_syllabus__import_fail('REQUIRED', p_path || '.' || p_key, format('"%s" is required.', p_key));
  ELSIF jsonb_typeof(p_obj -> p_key) <> 'array' THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', p_path || '.' || p_key, format('"%s" must be a list.', p_key));
  ELSIF jsonb_array_length(p_obj -> p_key) = 0 THEN
    PERFORM public.fn_syllabus__import_fail('EMPTY_LIST', p_path || '.' || p_key, format('"%s" must not be empty.', p_key));
  END IF;
  RETURN p_obj -> p_key;
END;
$$;

-- ---------------------------------------------------------------- the import RPC
CREATE FUNCTION public.fn_syllabus_import_draft(p_exam_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam_slug text;
  v_cycle_id uuid;
  v_cycle_year integer;
  v_tag text;
  v_note text;
  v_codes text[] := '{}';
  v_topic_ids jsonb := '{}'::jsonb;
  v_section_topics text[];
  v_unit_topics text[];
  v_count integer;
  v_papers integer := 0;
  v_sections integer := 0;
  v_units integer := 0;
  v_maps integer := 0;
  v_sha text;
  v_ver public.exam_syllabus_versions;
  v_pid uuid;
  v_sid uuid;
  v_uid uuid;
  v_topic_id uuid;
  v_topic_active boolean;
  v_code text;
  v_weighted integer;
  v_sum numeric;
  v_bad_weight boolean;
  k text;
  rp record;
  rs record;
  ru record;
  rt record;
BEGIN
  PERFORM public.fn_syllabus__assert_role(false);

  SELECT slug INTO v_exam_slug FROM public.exams WHERE id = p_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYLLABUS_EXAM_NOT_FOUND: %', p_exam_id USING ERRCODE = 'P0002';
  END IF;

  -- ------------------------------------------------ cheap checks before the deep pass
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', '$', 'The payload must be a JSON object.');
  END IF;
  IF octet_length(p_payload::text) > 262144 THEN
    PERFORM public.fn_syllabus__import_fail('PAYLOAD_TOO_LARGE', '$', 'The payload is larger than 256 KB.');
  END IF;
  IF p_payload -> 'contract_version' IS DISTINCT FROM '1'::jsonb THEN
    PERFORM public.fn_syllabus__import_fail('UNSUPPORTED_CONTRACT_VERSION', '$.contract_version', '"contract_version" must be 1.');
  END IF;
  IF jsonb_typeof(p_payload -> 'papers') = 'array' THEN
    SELECT COALESCE(sum(1 + COALESCE((
             SELECT sum(1 + CASE WHEN jsonb_typeof(sx -> 'units') = 'array' THEN jsonb_array_length(sx -> 'units') ELSE 0 END)
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(px -> 'sections') = 'array' THEN px -> 'sections' ELSE '[]'::jsonb END) sx), 0)), 0)
      INTO v_count
      FROM jsonb_array_elements(p_payload -> 'papers') px;
    IF v_count > 500 THEN
      PERFORM public.fn_syllabus__import_fail('TOO_MANY_NODES', '$.papers', 'More than 500 nodes (papers + sections + units).');
    END IF;
  END IF;

  -- ------------------------------------------------ root
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT k = ANY (ARRAY['contract_version', 'exam', 'cycle_year', 'version_tag', 'source_note', 'papers']) THEN
      PERFORM public.fn_syllabus__import_fail('UNKNOWN_KEY', '$.' || k, format('Unknown key "%s".', k));
    END IF;
  END LOOP;
  IF jsonb_typeof(p_payload -> 'exam') IS DISTINCT FROM 'string' THEN
    PERFORM public.fn_syllabus__import_fail('REQUIRED', '$.exam', '"exam" must be the exam slug.');
  END IF;
  IF p_payload ->> 'exam' <> v_exam_slug THEN
    PERFORM public.fn_syllabus__import_fail('EXAM_MISMATCH', '$.exam', 'The payload is for a different exam than the one selected.');
  END IF;
  IF p_payload -> 'cycle_year' IS NOT NULL AND jsonb_typeof(p_payload -> 'cycle_year') <> 'null' THEN
    IF (CASE WHEN jsonb_typeof(p_payload -> 'cycle_year') = 'number'
            THEN (p_payload ->> 'cycle_year')::numeric <> trunc((p_payload ->> 'cycle_year')::numeric)
                 OR (p_payload ->> 'cycle_year')::numeric NOT BETWEEN 2000 AND 2100
            ELSE true END) THEN
      PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', '$.cycle_year', '"cycle_year" must be a year (2000-2100) or null.');
    END IF;
    v_cycle_year := (p_payload ->> 'cycle_year')::numeric::integer;
    SELECT id INTO v_cycle_id FROM public.exam_cycles WHERE exam_id = p_exam_id AND cycle_year = v_cycle_year;
    IF NOT FOUND THEN
      PERFORM public.fn_syllabus__import_fail('CYCLE_NOT_FOUND', '$.cycle_year', format('The exam has no %s cycle.', v_cycle_year));
    END IF;
  END IF;
  IF p_payload -> 'version_tag' IS NOT NULL AND jsonb_typeof(p_payload -> 'version_tag') <> 'null' THEN
    IF jsonb_typeof(p_payload -> 'version_tag') <> 'string' OR p_payload ->> 'version_tag' !~ '^[a-z0-9]+([-.][a-z0-9]+)*$'
       OR char_length(p_payload ->> 'version_tag') > 80 THEN
      PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', '$.version_tag', '"version_tag" must be lower-case letters, digits, "-" or "." (max 80).');
    END IF;
    v_tag := p_payload ->> 'version_tag';
  END IF;
  v_note := public.fn_syllabus__import_text(p_payload, 'source_note', '$', 500, false);

  -- ------------------------------------------------ validation pass (nothing is written yet)
  FOR rp IN SELECT e.value AS v, (e.ord - 1)::integer AS i FROM jsonb_array_elements(public.fn_syllabus__import_list(p_payload, 'papers', '$')) WITH ORDINALITY e(value, ord) LOOP
    v_code := public.fn_syllabus__import_check_node(rp.v, format('$.papers[%s]', rp.i), rp.i, 'PAPER');
    IF v_code = ANY (v_codes) THEN
      PERFORM public.fn_syllabus__import_fail('DUPLICATE_CODE', format('$.papers[%s].code', rp.i), format('Code "%s" is used more than once.', v_code));
    END IF;
    v_codes := v_codes || v_code;
    v_papers := v_papers + 1;
    FOR rs IN SELECT e.value AS v, (e.ord - 1)::integer AS i FROM jsonb_array_elements(public.fn_syllabus__import_list(rp.v, 'sections', format('$.papers[%s]', rp.i))) WITH ORDINALITY e(value, ord) LOOP
      v_code := public.fn_syllabus__import_check_node(rs.v, format('$.papers[%s].sections[%s]', rp.i, rs.i), rs.i, 'SECTION');
      IF v_code = ANY (v_codes) THEN
        PERFORM public.fn_syllabus__import_fail('DUPLICATE_CODE', format('$.papers[%s].sections[%s].code', rp.i, rs.i), format('Code "%s" is used more than once.', v_code));
      END IF;
      v_codes := v_codes || v_code;
      v_sections := v_sections + 1;
      v_section_topics := '{}';
      FOR ru IN SELECT e.value AS v, (e.ord - 1)::integer AS i FROM jsonb_array_elements(public.fn_syllabus__import_list(rs.v, 'units', format('$.papers[%s].sections[%s]', rp.i, rs.i))) WITH ORDINALITY e(value, ord) LOOP
        v_code := public.fn_syllabus__import_check_node(ru.v, format('$.papers[%s].sections[%s].units[%s]', rp.i, rs.i, ru.i), ru.i, 'UNIT');
        IF v_code = ANY (v_codes) THEN
          PERFORM public.fn_syllabus__import_fail('DUPLICATE_CODE', format('$.papers[%s].sections[%s].units[%s].code', rp.i, rs.i, ru.i), format('Code "%s" is used more than once.', v_code));
        END IF;
        v_codes := v_codes || v_code;
        v_units := v_units + 1;
        CONTINUE WHEN ru.v -> 'topics' IS NULL OR jsonb_typeof(ru.v -> 'topics') = 'null';
        IF jsonb_typeof(ru.v -> 'topics') <> 'array' THEN
          PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', format('$.papers[%s].sections[%s].units[%s].topics', rp.i, rs.i, ru.i), '"topics" must be a list.');
        END IF;
        IF jsonb_array_length(ru.v -> 'topics') > 20 THEN
          PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', format('$.papers[%s].sections[%s].units[%s].topics', rp.i, rs.i, ru.i), 'At most 20 topics per unit.');
        END IF;
        v_unit_topics := '{}';
        v_weighted := 0;
        v_sum := 0;
        v_bad_weight := false;
        FOR rt IN SELECT e.value AS v, (e.ord - 1)::integer AS i FROM jsonb_array_elements(ru.v -> 'topics') WITH ORDINALITY e(value, ord) LOOP
          IF jsonb_typeof(rt.v) <> 'object' THEN
            PERFORM public.fn_syllabus__import_fail('INVALID_TYPE', format('$.papers[%s].sections[%s].units[%s].topics[%s]', rp.i, rs.i, ru.i, rt.i), 'A topic reference must be an object.');
          END IF;
          FOR k IN SELECT jsonb_object_keys(rt.v) LOOP
            IF k NOT IN ('topic', 'weight') THEN
              PERFORM public.fn_syllabus__import_fail('UNKNOWN_KEY', format('$.papers[%s].sections[%s].units[%s].topics[%s].%s', rp.i, rs.i, ru.i, rt.i, k), format('Unknown key "%s".', k));
            END IF;
          END LOOP;
          IF jsonb_typeof(rt.v -> 'topic') IS DISTINCT FROM 'string'
             OR rt.v ->> 'topic' !~ '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$' THEN
            PERFORM public.fn_syllabus__import_fail('INVALID_VALUE', format('$.papers[%s].sections[%s].units[%s].topics[%s].topic', rp.i, rs.i, ru.i, rt.i), '"topic" must be a taxonomy path such as "quantitative-aptitude.percentage".');
          END IF;
          IF rt.v ->> 'topic' = ANY (v_unit_topics) THEN
            PERFORM public.fn_syllabus__import_fail('DUPLICATE_TOPIC', format('$.papers[%s].sections[%s].units[%s].topics[%s].topic', rp.i, rs.i, ru.i, rt.i), format('Topic "%s" is listed twice in this unit.', rt.v ->> 'topic'));
          END IF;
          IF rt.v ->> 'topic' = ANY (v_section_topics) THEN
            PERFORM public.fn_syllabus__import_fail('DUPLICATE_TOPIC_IN_SECTION', format('$.papers[%s].sections[%s].units[%s].topics[%s].topic', rp.i, rs.i, ru.i, rt.i), format('Topic "%s" is already mapped in this section.', rt.v ->> 'topic'));
          END IF;
          v_unit_topics := v_unit_topics || (rt.v ->> 'topic');
          v_section_topics := v_section_topics || (rt.v ->> 'topic');
          IF rt.v -> 'weight' IS NOT NULL AND jsonb_typeof(rt.v -> 'weight') <> 'null' THEN
            IF jsonb_typeof(rt.v -> 'weight') <> 'number' THEN
              v_bad_weight := true;
            ELSE
              v_weighted := v_weighted + 1;
              v_sum := v_sum + round((rt.v ->> 'weight')::numeric, 4);
              IF round((rt.v ->> 'weight')::numeric, 4) <= 0 OR round((rt.v ->> 'weight')::numeric, 4) > 1 THEN v_bad_weight := true; END IF;
            END IF;
          END IF;
          -- resolve: an existing TOPIC by its hierarchy path — never created, never guessed
          SELECT id, is_active INTO v_topic_id, v_topic_active FROM public.canonical_taxonomy_nodes
           WHERE hierarchy_path = rt.v ->> 'topic' AND node_type = 'TOPIC';
          IF NOT FOUND THEN
            PERFORM public.fn_syllabus__import_fail('MISSING_TOPIC', format('$.papers[%s].sections[%s].units[%s].topics[%s].topic', rp.i, rs.i, ru.i, rt.i), format('Topic "%s" does not exist in the taxonomy.', rt.v ->> 'topic'));
          END IF;
          IF NOT v_topic_active THEN
            PERFORM public.fn_syllabus__import_fail('TOPIC_INACTIVE', format('$.papers[%s].sections[%s].units[%s].topics[%s].topic', rp.i, rs.i, ru.i, rt.i), format('Topic "%s" is inactive.', rt.v ->> 'topic'));
          END IF;
          v_topic_ids := v_topic_ids || jsonb_build_object(rt.v ->> 'topic', v_topic_id);
          v_maps := v_maps + 1;
        END LOOP;
        IF v_bad_weight OR (v_weighted > 0 AND (v_weighted <> cardinality(v_unit_topics) OR abs(v_sum - 1) > 0.0001)) THEN
          PERFORM public.fn_syllabus__import_fail('WEIGHTS_INVALID', format('$.papers[%s].sections[%s].units[%s].topics', rp.i, rs.i, ru.i), 'Weights must be set for all or none of the topics, each in (0, 1], summing to 1.');
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- ------------------------------------------------ one DRAFT per exam + cycle (serialised with version numbering)
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || p_exam_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.exam_syllabus_versions
              WHERE exam_id = p_exam_id AND exam_cycle_id IS NOT DISTINCT FROM v_cycle_id AND status = 'DRAFT') THEN
    PERFORM public.fn_syllabus__import_fail('DRAFT_EXISTS', '$.cycle_year', 'This exam already has a DRAFT for this cycle. Publish, archive or delete it first.');
  END IF;

  -- ------------------------------------------------ write pass (same transaction; any error rolls everything back)
  v_sha := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_ver := public.fn_syllabus__create_version(
    p_exam_id, v_cycle_id, v_tag, 'IMPORT', NULL, v_sha,
    jsonb_build_object('import', jsonb_build_object('contract_version', 1, 'payload_sha256', v_sha, 'source_note', v_note,
                       'nodes', v_papers + v_sections + v_units, 'mappings', v_maps)));
  FOR rp IN SELECT e.value AS v, e.ord::integer AS o FROM jsonb_array_elements(p_payload -> 'papers') WITH ORDINALITY e(value, ord) LOOP
    v_pid := public.fn_syllabus__insert_node(
      v_ver.id, NULL, 'PAPER', btrim(rp.v ->> 'title', E' \t\r\n'), rp.v ->> 'code', rp.o, btrim(rp.v ->> 'description', E' \t\r\n'), NULL,
      (rp.v ->> 'expected_questions_min')::numeric::integer, (rp.v ->> 'expected_questions_max')::numeric::integer,
      COALESCE((rp.v ->> 'is_mandatory')::boolean, true));
    FOR rs IN SELECT e.value AS v, e.ord::integer AS o FROM jsonb_array_elements(rp.v -> 'sections') WITH ORDINALITY e(value, ord) LOOP
      v_sid := public.fn_syllabus__insert_node(
        v_ver.id, v_pid, 'SECTION', btrim(rs.v ->> 'title', E' \t\r\n'), rs.v ->> 'code', rs.o, btrim(rs.v ->> 'description', E' \t\r\n'),
        rs.v ->> 'weightage_tier',
        (rs.v ->> 'expected_questions_min')::numeric::integer, (rs.v ->> 'expected_questions_max')::numeric::integer,
        COALESCE((rs.v ->> 'is_mandatory')::boolean, true));
      FOR ru IN SELECT e.value AS v, e.ord::integer AS o FROM jsonb_array_elements(rs.v -> 'units') WITH ORDINALITY e(value, ord) LOOP
        v_uid := public.fn_syllabus__insert_node(
          v_ver.id, v_sid, 'UNIT', btrim(ru.v ->> 'title', E' \t\r\n'), ru.v ->> 'code', ru.o, btrim(ru.v ->> 'description', E' \t\r\n'),
          ru.v ->> 'weightage_tier',
          (ru.v ->> 'expected_questions_min')::numeric::integer, (ru.v ->> 'expected_questions_max')::numeric::integer,
          COALESCE((ru.v ->> 'is_mandatory')::boolean, true));
        IF ru.v ->> 'required_cognitive_depth' IS NOT NULL THEN
          UPDATE public.exam_syllabus_nodes SET required_cognitive_depth = ru.v ->> 'required_cognitive_depth' WHERE id = v_uid;
        END IF;
        IF jsonb_typeof(ru.v -> 'topics') = 'array' THEN
          INSERT INTO public.exam_syllabus_canonical_mappings
            (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, mapping_weight, reviewed_by, reviewed_at)
          SELECT v_uid, (v_topic_ids ->> (t.value ->> 'topic'))::uuid, 'MANUALLY_MAPPED', 1.00, 'MANUAL',
                 round((t.value ->> 'weight')::numeric, 4), auth.uid(), now()
            FROM jsonb_array_elements(ru.v -> 'topics') t;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  PERFORM public.fn_syllabus__audit('SYLLABUS_DRAFT_IMPORT', 'exam_syllabus_version', v_ver.id, NULL,
    jsonb_build_object('exam_id', v_ver.exam_id, 'exam_cycle_id', v_ver.exam_cycle_id, 'version_number', v_ver.version_number,
                       'version_tag', v_ver.version_tag, 'contract_version', 1, 'payload_sha256', v_sha,
                       'papers', v_papers, 'sections', v_sections, 'units', v_units,
                       'nodes', v_papers + v_sections + v_units, 'mappings', v_maps));
  RETURN jsonb_build_object('success', true, 'version_id', v_ver.id, 'version_number', v_ver.version_number,
                            'version_tag', v_ver.version_tag, 'nodes', v_papers + v_sections + v_units, 'mappings', v_maps,
                            'payload_sha256', v_sha);
END;
$$;

-- ---------------------------------------------------------------- grants
REVOKE ALL ON FUNCTION public.fn_syllabus__import_fail(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__import_is_plain(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__import_text(jsonb, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__import_count(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__import_check_node(jsonb, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus__import_list(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_import_draft(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_import_draft(uuid, jsonb) TO authenticated;
