-- =============================================================================
-- COURAGE LIBRARY — GAP2-4a (3/3): SSC GD legacy → DRAFT, SSC CGL pattern skeleton DRAFT
-- Migration: 20261016000080_gap2_4a_syllabus_seed_drafts.sql
--
-- Architect ruling Q1 (approved): the 18 legacy exam_topics rows belong to SSC GD and become an SSC GD DRAFT;
-- SSC CGL gets a DRAFT skeleton of SECTION nodes from its exam pattern (topics are authored later).
-- Both are built by owner-only seed functions on the same core helpers as the RPCs (fn_syllabus__*), and both
-- stay DRAFT: nothing here publishes (only an admin can, through fn_syllabus_publish after review).
-- Deterministic + idempotent: keyed on (exam_id, version_tag); a re-run returns created = false and writes nothing.
--
-- GD  (version_tag 'legacy-official-<cycle year>', source_kind LEGACY_MIGRATION, cycle = the legacy syllabus cycle)
--   one SECTION per canonical subject referenced (ordered by subject display_order, name)
--   one UNIT per exam_topics row under its subject (ordered by legacy priority, topic name);
--     weightage high → HIGH_YIELD, medium → CORE, low → MODERATE; is_mandatory copied; expected range left NULL
--   one mapping UNIT → its canonical TOPIC (match_method LEGACY_MIGRATION)
--   raw_payload_hash = sha256 of the ordered legacy rows
-- CGL (version_tag 'pattern-skeleton-<cycle year>', source_kind MANUAL, cycle = the active pattern's cycle)
--   one SECTION per pattern_sections row (title = section name, slug = canonical subject slug, order = section_order)
-- Legacy tables (exam_syllabi, exam_topics, exam_unit_mappings) are read only and stay untouched (re-pointing is
-- GAP2-4b, retirement GAP2-4c).
-- Rollback: docs/database/rollback/080_rollback.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_syllabus_seed_legacy_gd_draft()
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_exam uuid;
  v_syl record;
  v_tag text;
  v_existing uuid;
  v_hash text;
  v_rows integer;
  v_ver public.exam_syllabus_versions;
  s record;
  u record;
  v_section uuid;
  v_unit uuid;
  v_sections integer := 0;
  v_units integer := 0;
BEGIN
  SELECT id INTO v_exam FROM public.exams WHERE slug = 'ssc-gd';
  IF v_exam IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'EXAM_NOT_FOUND');
  END IF;
  SELECT es.id, es.exam_cycle_id, cy.cycle_year INTO v_syl
    FROM public.exam_syllabi es JOIN public.exam_cycles cy ON cy.id = es.exam_cycle_id
   WHERE cy.exam_id = v_exam AND es.version_tag = 'official' AND es.is_active
   ORDER BY cy.cycle_year DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'LEGACY_SYLLABUS_NOT_FOUND');
  END IF;
  v_tag := 'legacy-official-' || v_syl.cycle_year;
  SELECT id INTO v_existing FROM public.exam_syllabus_versions WHERE exam_id = v_exam AND version_tag = v_tag;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'ALREADY_EXISTS', 'version_id', v_existing);
  END IF;
  IF EXISTS (SELECT 1 FROM public.exam_topics t JOIN public.canonical_taxonomy_nodes c ON c.id = t.topic_id
              WHERE t.syllabus_id = v_syl.id AND c.root_subject_id IS NULL) THEN
    RAISE EXCEPTION 'SYLLABUS_SEED_TOPIC_WITHOUT_SUBJECT: a legacy topic has no canonical subject' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), encode(sha256(convert_to(string_agg(
           t.topic_id::text || '|' || t.weightage_level || '|' || t.priority || '|' || t.is_mandatory, ';' ORDER BY t.topic_id), 'UTF8')), 'hex')
    INTO v_rows, v_hash
    FROM public.exam_topics t WHERE t.syllabus_id = v_syl.id;

  v_ver := public.fn_syllabus__create_version(v_exam, v_syl.exam_cycle_id, v_tag, 'LEGACY_MIGRATION', NULL, v_hash,
             jsonb_build_object('legacy_exam_syllabus_id', v_syl.id, 'legacy_rows', v_rows, 'seeded_by', 'migration 080'));

  FOR s IN
    SELECT subj.id, subj.name, subj.slug, row_number() OVER (ORDER BY subj.display_order, subj.name)::integer AS ord
      FROM (SELECT DISTINCT c.root_subject_id AS id FROM public.exam_topics t
              JOIN public.canonical_taxonomy_nodes c ON c.id = t.topic_id WHERE t.syllabus_id = v_syl.id) x
      JOIN public.canonical_taxonomy_nodes subj ON subj.id = x.id
  LOOP
    v_section := public.fn_syllabus__insert_node(v_ver.id, NULL, 'SECTION', s.name, s.slug, s.ord, NULL, NULL, NULL, NULL, true);
    v_sections := v_sections + 1;
    FOR u IN
      SELECT c.id AS topic_id, c.name, c.slug, t.weightage_level, t.is_mandatory,
             row_number() OVER (ORDER BY t.priority, c.name)::integer AS ord
        FROM public.exam_topics t JOIN public.canonical_taxonomy_nodes c ON c.id = t.topic_id
       WHERE t.syllabus_id = v_syl.id AND c.root_subject_id = s.id
    LOOP
      v_unit := public.fn_syllabus__insert_node(v_ver.id, v_section, 'UNIT', u.name, u.slug, u.ord, NULL,
        CASE lower(u.weightage_level) WHEN 'high' THEN 'HIGH_YIELD' WHEN 'medium' THEN 'CORE' WHEN 'low' THEN 'MODERATE' END,
        NULL, NULL, u.is_mandatory);
      INSERT INTO public.exam_syllabus_canonical_mappings
        (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method)
      VALUES (v_unit, u.topic_id, 'MANUALLY_MAPPED', 1.00, 'LEGACY_MIGRATION');
      v_units := v_units + 1;
    END LOOP;
  END LOOP;

  PERFORM public.fn_syllabus__audit('SYLLABUS_DRAFT_CREATE', 'exam_syllabus_version', v_ver.id, NULL,
    jsonb_build_object('exam_id', v_exam, 'exam_cycle_id', v_syl.exam_cycle_id, 'version_number', v_ver.version_number,
                       'version_tag', v_tag, 'source_kind', 'LEGACY_MIGRATION', 'sections', v_sections, 'units', v_units,
                       'mappings', v_units, 'legacy_rows', v_rows));
  RETURN jsonb_build_object('created', true, 'version_id', v_ver.id, 'version_tag', v_tag,
                            'sections', v_sections, 'units', v_units, 'mappings', v_units, 'legacy_rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_seed_cgl_pattern_skeleton()
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_exam uuid;
  v_pat record;
  v_tag text;
  v_existing uuid;
  v_ver public.exam_syllabus_versions;
  s record;
  v_sections integer := 0;
BEGIN
  SELECT id INTO v_exam FROM public.exams WHERE slug = 'ssc-cgl';
  IF v_exam IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'EXAM_NOT_FOUND');
  END IF;
  SELECT p.id, p.tier_name, p.exam_cycle_id, cy.cycle_year INTO v_pat
    FROM public.exam_patterns p JOIN public.exam_cycles cy ON cy.id = p.exam_cycle_id
   WHERE cy.exam_id = v_exam AND p.is_active
   ORDER BY cy.cycle_year DESC, p.created_at, p.id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'PATTERN_NOT_FOUND');
  END IF;
  v_tag := 'pattern-skeleton-' || v_pat.cycle_year;
  SELECT id INTO v_existing FROM public.exam_syllabus_versions WHERE exam_id = v_exam AND version_tag = v_tag;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'ALREADY_EXISTS', 'version_id', v_existing);
  END IF;

  v_ver := public.fn_syllabus__create_version(v_exam, v_pat.exam_cycle_id, v_tag, 'MANUAL', NULL, NULL,
             jsonb_build_object('exam_pattern_id', v_pat.id, 'pattern_tier', v_pat.tier_name, 'seeded_by', 'migration 080'));
  FOR s IN
    SELECT ps.section_name, COALESCE(c.slug, ps.section_name) AS slug, ps.section_order
      FROM public.pattern_sections ps LEFT JOIN public.canonical_taxonomy_nodes c ON c.id = ps.subject_id
     WHERE ps.pattern_id = v_pat.id ORDER BY ps.section_order, ps.section_name
  LOOP
    PERFORM public.fn_syllabus__insert_node(v_ver.id, NULL, 'SECTION', s.section_name, s.slug, s.section_order, NULL, NULL, NULL, NULL, true);
    v_sections := v_sections + 1;
  END LOOP;

  PERFORM public.fn_syllabus__audit('SYLLABUS_DRAFT_CREATE', 'exam_syllabus_version', v_ver.id, NULL,
    jsonb_build_object('exam_id', v_exam, 'exam_cycle_id', v_pat.exam_cycle_id, 'version_number', v_ver.version_number,
                       'version_tag', v_tag, 'source_kind', 'MANUAL', 'sections', v_sections, 'exam_pattern_id', v_pat.id));
  RETURN jsonb_build_object('created', true, 'version_id', v_ver.id, 'version_tag', v_tag, 'sections', v_sections);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_syllabus_seed_legacy_gd_draft() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_seed_cgl_pattern_skeleton() FROM PUBLIC, anon, authenticated;

SELECT public.fn_syllabus_seed_legacy_gd_draft();
SELECT public.fn_syllabus_seed_cgl_pattern_skeleton();
