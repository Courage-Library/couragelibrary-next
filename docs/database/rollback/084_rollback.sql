-- =============================================================================
-- ROLLBACK for 20261016000084_gap2_4c_retire_legacy_syllabus.sql
--
-- Moves exam_syllabi, exam_topics, exam_unit_mappings and taxonomy_aliases back to public, restores the pre-084 bodies of
-- fn_syllabus_seed_legacy_gd_draft / fn_delete_exam_controlled (ACLs and the 082 search_path kept), and restores the grants
-- they had before 084 (forensics, GAP2_4C_REPORT §1): anon SELECT, authenticated SELECT; service_role privileges
-- were never revoked. RLS policies moved with the tables and come back unchanged. Schema retired stays (073 owns it).
--
-- Order: run this BEFORE the 083 → 082 → 081 → 080 → 079 → 078 → 075 rollbacks. The application code of GAP2-4c no longer
-- reads these tables; restoring them does not restore the deleted workbench (revert the commit for that).
-- Dry-run (proof inside BEGIN … ROLLBACK): see GAP2_4C_REPORT §4.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
               AND relname IN ('exam_syllabi','exam_topics','exam_unit_mappings','taxonomy_aliases')) THEN
        RAISE EXCEPTION 'ROLLBACK_084_PRECONDITION: a legacy syllabus table is already in public';
    END IF;
END $$;

ALTER TABLE retired.exam_syllabi       SET SCHEMA public;
ALTER TABLE retired.exam_topics        SET SCHEMA public;
ALTER TABLE retired.exam_unit_mappings SET SCHEMA public;
ALTER TABLE retired.taxonomy_aliases   SET SCHEMA public;

GRANT SELECT ON public.exam_syllabi, public.exam_topics, public.exam_unit_mappings, public.taxonomy_aliases TO anon, authenticated;

-- the two dependent functions back to their pre-084 bodies (seed reads public.*; deletion cleans legacy syllabi).
-- CREATE OR REPLACE keeps the ACLs; fn_delete_exam_controlled keeps the SEC-HOTFIX-6 (082) search_path ''.
CREATE OR REPLACE FUNCTION public.fn_syllabus_seed_legacy_gd_draft()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_delete_exam_controlled(p_exam_id uuid, p_slug text, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT 'admin@couragelibrary.com'::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_exam RECORD;
    v_cycle_ids UUID[];
    v_syl_ids UUID[];
    v_doc_ids UUID[];
    v_attempts_count INTEGER;
    v_goals_count INTEGER;
    v_templates_count INTEGER;
BEGIN
    -- 1. Lock and fetch exam
    SELECT id, title, slug, is_active, category, created_at
    INTO v_exam
    FROM public.exams
    WHERE id = p_exam_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam with ID % not found.', p_exam_id;
    END IF;

    -- 2. Strict slug confirmation
    IF TRIM(v_exam.slug) != TRIM(p_slug) THEN
        RAISE EXCEPTION 'Slug confirmation mismatch. Expected "%", got "%".', v_exam.slug, p_slug;
    END IF;

    -- 3. Strict protected dependencies check
    SELECT COUNT(*) INTO v_attempts_count
    FROM public.test_attempts ta
    JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
    JOIN public.mock_templates tpl ON tpl.id = mt.template_id
    WHERE tpl.exam_id = p_exam_id;

    IF v_attempts_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: candidate test attempts exist (%).', v_attempts_count;
    END IF;

    SELECT COUNT(*) INTO v_goals_count FROM public.user_exam_goals WHERE exam_id = p_exam_id;
    IF v_goals_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: active student goals exist (%).', v_goals_count;
    END IF;

    SELECT COUNT(*) INTO v_templates_count FROM public.mock_templates WHERE exam_id = p_exam_id;
    IF v_templates_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: mock templates exist (%).', v_templates_count;
    END IF;

    -- 4. Enable session flag for controlled cascade
    PERFORM set_config('app.allow_exam_deletion', 'true', true);

    -- 5. Collect cycle IDs
    SELECT ARRAY_AGG(id) INTO v_cycle_ids FROM public.exam_cycles WHERE exam_id = p_exam_id;

    -- 6. Clean syllabi & topics
    IF v_cycle_ids IS NOT NULL AND ARRAY_LENGTH(v_cycle_ids, 1) > 0 THEN
        SELECT ARRAY_AGG(id) INTO v_syl_ids FROM public.exam_syllabi WHERE exam_cycle_id = ANY(v_cycle_ids);
        IF v_syl_ids IS NOT NULL AND ARRAY_LENGTH(v_syl_ids, 1) > 0 THEN
            DELETE FROM public.exam_topics WHERE syllabus_id = ANY(v_syl_ids);
            DELETE FROM public.exam_syllabi WHERE id = ANY(v_syl_ids);
        END IF;
    END IF;

    -- 7. Clean knowledge docs & versions
    SELECT ARRAY_AGG(id) INTO v_doc_ids FROM public.exam_knowledge_documents WHERE exam_id = p_exam_id;
    IF v_doc_ids IS NOT NULL AND ARRAY_LENGTH(v_doc_ids, 1) > 0 THEN
        UPDATE public.exam_knowledge_documents SET current_published_version_id = NULL WHERE id = ANY(v_doc_ids);
        DELETE FROM public.exam_doc_versions WHERE document_id = ANY(v_doc_ids);
        DELETE FROM public.exam_knowledge_documents WHERE id = ANY(v_doc_ids);
    END IF;

    -- 8. Clean child metadata tables
    DELETE FROM public.exam_sources WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_claims WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_posts WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_announcements WHERE exam_id = p_exam_id;

    IF v_cycle_ids IS NOT NULL AND ARRAY_LENGTH(v_cycle_ids, 1) > 0 THEN
        DELETE FROM public.exam_cycles WHERE exam_id = p_exam_id;
    END IF;

    -- 9. Delete the exam record
    DELETE FROM public.exams WHERE id = p_exam_id;

    -- 10. Audit log insertion
    BEGIN
        INSERT INTO public.admin_audit_logs (
            actor_id,
            actor_email,
            action_type,
            target_entity,
            target_id,
            old_value,
            new_value,
            reason,
            created_at
        ) VALUES (
            p_actor_id,
            COALESCE(p_actor_email, 'admin@couragelibrary.com'),
            'EXAMINATION_PERMANENTLY_DELETED',
            'exams',
            p_exam_id,
            jsonb_build_object(
                'exam', jsonb_build_object(
                    'id', v_exam.id,
                    'title', v_exam.title,
                    'slug', v_exam.slug,
                    'isActive', v_exam.is_active
                )
            ),
            NULL,
            COALESCE(p_reason, 'Controlled deletion of draft/test fixture ' || v_exam.title || ' (' || v_exam.slug || ')'),
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_exam', jsonb_build_object(
            'id', v_exam.id,
            'title', v_exam.title,
            'slug', v_exam.slug,
            'isActive', v_exam.is_active
        )
    );
END;
$function$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'retired'::regnamespace
               AND relname IN ('exam_syllabi','exam_topics','exam_unit_mappings','taxonomy_aliases')) THEN
        RAISE EXCEPTION 'ROLLBACK_084_PROOF: a legacy syllabus table is still in retired';
    END IF;
    IF NOT (has_table_privilege('anon', 'public.exam_topics', 'SELECT') AND has_table_privilege('authenticated', 'public.taxonomy_aliases', 'SELECT')) THEN
        RAISE EXCEPTION 'ROLLBACK_084_PROOF: read grants not restored';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
