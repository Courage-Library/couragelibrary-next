-- =============================================================================
-- COURAGE LIBRARY — GAP2-4c: RETIRE THE LEGACY SYLLABUS TABLES + RECONCILIATION WORKBENCH TABLE (decision #21)
-- Migration: 20261016000084_gap2_4c_retire_legacy_syllabus.sql
--
-- The canonical syllabus (exam_syllabus_versions / nodes / canonical_mappings, migrations 078–081) is the only
-- syllabus store; no runtime code reads the legacy tables since GAP2-4b (scripts/test_gap2_4b_readers.cjs R-01).
-- The phase-3R reconciliation workbench (pages, API routes, services) is deleted in the same commit.
-- Nothing is dropped: the tables move to schema `retired` with their rows (no anon / authenticated / PUBLIC
-- privileges, no USAGE, not a PostgREST schema). A later RETIRED-CLEANUP phase drops them with owner approval.
--
-- Moved (rows at forensics, GAP2_4C_REPORT §1):
--   exam_syllabi        1   legacy SSC GD syllabus header
--   exam_topics        18   legacy SSC GD topics (already copied into the GD DRAFT by 080)
--   exam_unit_mappings  0   legacy exam ↔ learning-unit mapping
--   taxonomy_aliases    0   workbench-only alias registry (ADD_ALIAS action)
--
-- Dependents (forensics; the first pass missed the two functions, the 082-era dry-run precondition caught them):
--   public.fn_syllabus_seed_legacy_gd_draft()  (080, owner-only, search_path '') reads exam_syllabi / exam_topics
--       → RE-POINTED to retired.exam_syllabi / retired.exam_topics (body otherwise identical; GAP2-4a G-11 re-seeds)
--   public.fn_delete_exam_controlled(…)        (062; locked by SEC-HOTFIX-6 082: service_role only, search_path '')
--       deleted legacy syllabi / topics of the exam's cycles → that cleanup is REMOVED (body otherwise identical)
--   CREATE OR REPLACE keeps each function's ACL; both definitions restate SET search_path = ''. The proof asserts
--   ACL + config of both are byte-identical to before, and that no SECURITY DEFINER exposure (P-9) appeared.
--   No view, trigger, sequence or public FK references any of the four tables.
-- Their own FKs move with them and are KEPT (history stays consistent):
--   exam_syllabi_exam_cycle_id_fkey            → public.exam_cycles               (RESTRICT)
--   exam_topics_syllabus_id_fkey               → retired.exam_syllabi             (CASCADE)
--   exam_topics_topic_id_node_fkey             → public.canonical_taxonomy_nodes  (RESTRICT, composite TOPIC)
--   exam_unit_mappings_exam_topic_id_fkey      → retired.exam_topics              (CASCADE)
--   exam_unit_mappings_learning_unit_id_fkey   → public.learning_units            (CASCADE)
--   taxonomy_aliases_canonical_node_id_fkey    → public.canonical_taxonomy_nodes  (CASCADE)
-- Their RLS policies move with them and are inert (no privileges, no schema USAGE); the rollback restores grants.
--
-- 0. Expected counts + ACL / config snapshot of the two re-pointed functions.
-- 1. Re-point the two dependent functions.
-- 2. Preconditions (no remaining public dependent).
-- 3. Move the four tables to schema retired; revoke every privilege from PUBLIC, anon, authenticated.
-- 4. Proof block; NOTIFY pgrst to reload the schema cache.
-- Rollback: docs/database/rollback/084_rollback.sql (run BEFORE 083 → 082 → 081 → 080 → 079 → 078 → 075 rollbacks).
-- =============================================================================

-- 0. Expected counts + function snapshot ---------------------------------------------------------
CREATE TEMP TABLE gap2_4c_expect ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM public.exam_syllabi)       AS syl,
    (SELECT count(*) FROM public.exam_topics)        AS top,
    (SELECT count(*) FROM public.exam_unit_mappings) AS eum,
    (SELECT count(*) FROM public.taxonomy_aliases)   AS ali;

CREATE TEMP TABLE gap2_4c_fn_before ON COMMIT DROP AS
SELECT p.oid::regprocedure::text AS sig, coalesce(array_to_string(p.proacl, ','), 'NULL') AS acl,
       coalesce(array_to_string(p.proconfig, ','), 'NULL') AS cfg, p.prosecdef AS secdef, p.proowner AS owner
  FROM pg_proc p
 WHERE p.oid IN ('public.fn_syllabus_seed_legacy_gd_draft()'::regprocedure,
                 'public.fn_delete_exam_controlled(uuid,text,uuid,text,text)'::regprocedure);

DO $$
BEGIN
    IF to_regnamespace('retired') IS NULL THEN
        RAISE EXCEPTION 'GAP2_4C_PRECONDITION: schema retired missing (created by 073)';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'retired'::regnamespace
               AND relname IN ('exam_syllabi','exam_topics','exam_unit_mappings','taxonomy_aliases')) THEN
        RAISE EXCEPTION 'GAP2_4C_PRECONDITION: a legacy syllabus table is already present in schema retired';
    END IF;
    IF (SELECT count(*) FROM pg_temp.gap2_4c_fn_before) <> 2 THEN
        RAISE EXCEPTION 'GAP2_4C_PRECONDITION: a dependent function is missing';
    END IF;
END $$;

-- 1. Re-point the dependent functions ------------------------------------------------------------
-- 1a. seed (080): read the legacy rows from schema retired
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
    FROM retired.exam_syllabi es JOIN public.exam_cycles cy ON cy.id = es.exam_cycle_id
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
  IF EXISTS (SELECT 1 FROM retired.exam_topics t JOIN public.canonical_taxonomy_nodes c ON c.id = t.topic_id
              WHERE t.syllabus_id = v_syl.id AND c.root_subject_id IS NULL) THEN
    RAISE EXCEPTION 'SYLLABUS_SEED_TOPIC_WITHOUT_SUBJECT: a legacy topic has no canonical subject' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), encode(sha256(convert_to(string_agg(
           t.topic_id::text || '|' || t.weightage_level || '|' || t.priority || '|' || t.is_mandatory, ';' ORDER BY t.topic_id), 'UTF8')), 'hex')
    INTO v_rows, v_hash
    FROM retired.exam_topics t WHERE t.syllabus_id = v_syl.id;

  v_ver := public.fn_syllabus__create_version(v_exam, v_syl.exam_cycle_id, v_tag, 'LEGACY_MIGRATION', NULL, v_hash,
             jsonb_build_object('legacy_exam_syllabus_id', v_syl.id, 'legacy_rows', v_rows, 'seeded_by', 'migration 080'));

  FOR s IN
    SELECT subj.id, subj.name, subj.slug, row_number() OVER (ORDER BY subj.display_order, subj.name)::integer AS ord
      FROM (SELECT DISTINCT c.root_subject_id AS id FROM retired.exam_topics t
              JOIN public.canonical_taxonomy_nodes c ON c.id = t.topic_id WHERE t.syllabus_id = v_syl.id) x
      JOIN public.canonical_taxonomy_nodes subj ON subj.id = x.id
  LOOP
    v_section := public.fn_syllabus__insert_node(v_ver.id, NULL, 'SECTION', s.name, s.slug, s.ord, NULL, NULL, NULL, NULL, true);
    v_sections := v_sections + 1;
    FOR u IN
      SELECT c.id AS topic_id, c.name, c.slug, t.weightage_level, t.is_mandatory,
             row_number() OVER (ORDER BY t.priority, c.name)::integer AS ord
        FROM retired.exam_topics t JOIN public.canonical_taxonomy_nodes c ON c.id = t.topic_id
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

-- 1b. controlled exam deletion (062, locked by 082): no legacy syllabus cleanup any more
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

    -- 6. (GAP2-4c, 084) the legacy syllabus tables are retired: no cleanup here. Their history stays in
    --    schema retired; its RESTRICT FK to exam_cycles keeps an exam that still has a legacy syllabus undeletable.

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

-- 2. Preconditions: no public dependent left ----------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint con
               WHERE con.contype = 'f'
                 AND con.confrelid IN ('public.exam_syllabi'::regclass, 'public.exam_topics'::regclass,
                                       'public.exam_unit_mappings'::regclass, 'public.taxonomy_aliases'::regclass)
                 AND con.conrelid NOT IN ('public.exam_syllabi'::regclass, 'public.exam_topics'::regclass,
                                          'public.exam_unit_mappings'::regclass, 'public.taxonomy_aliases'::regclass)) THEN
        RAISE EXCEPTION 'GAP2_4C_PRECONDITION: a public table has an FK into a legacy syllabus table';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
               WHERE d.refobjid IN ('public.exam_syllabi'::regclass, 'public.exam_topics'::regclass,
                                    'public.exam_unit_mappings'::regclass, 'public.taxonomy_aliases'::regclass)
                 AND r.ev_class <> d.refobjid) THEN
        RAISE EXCEPTION 'GAP2_4C_PRECONDITION: a view depends on a legacy syllabus table';
    END IF;
    -- any reference not qualified with retired. (the re-pointed seed reads retired.exam_*)
    IF EXISTS (SELECT 1 FROM pg_proc p
               WHERE p.pronamespace = 'public'::regnamespace
                 AND p.prosrc ~ '(?<!retired\.)\m(exam_syllabi|exam_topics|exam_unit_mappings|taxonomy_aliases)\M') THEN
        RAISE EXCEPTION 'GAP2_4C_PRECONDITION: a public function still references a legacy syllabus table outside schema retired';
    END IF;
END $$;

-- 3. Move to schema retired ------------------------------------------------------------------------
ALTER TABLE public.exam_unit_mappings SET SCHEMA retired;
ALTER TABLE public.exam_topics        SET SCHEMA retired;
ALTER TABLE public.exam_syllabi       SET SCHEMA retired;
ALTER TABLE public.taxonomy_aliases   SET SCHEMA retired;

REVOKE ALL ON SCHEMA retired FROM PUBLIC;
REVOKE ALL ON SCHEMA retired FROM anon, authenticated;
REVOKE ALL ON retired.exam_syllabi, retired.exam_topics, retired.exam_unit_mappings, retired.taxonomy_aliases FROM PUBLIC;
REVOKE ALL ON retired.exam_syllabi, retired.exam_topics, retired.exam_unit_mappings, retired.taxonomy_aliases FROM anon, authenticated;

-- 4. Proof ------------------------------------------------------------------------------------------
DO $$
DECLARE
    e record;
    r record;
    v_bad text := '';
BEGIN
    SELECT * INTO e FROM pg_temp.gap2_4c_expect;

    IF (SELECT count(*) FROM retired.exam_syllabi) <> e.syl
       OR (SELECT count(*) FROM retired.exam_topics) <> e.top
       OR (SELECT count(*) FROM retired.exam_unit_mappings) <> e.eum
       OR (SELECT count(*) FROM retired.taxonomy_aliases) <> e.ali THEN
        RAISE EXCEPTION 'GAP2_4C_PROOF: retired row counts differ from pre-migration counts';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
               AND relname IN ('exam_syllabi','exam_topics','exam_unit_mappings','taxonomy_aliases')) THEN
        RAISE EXCEPTION 'GAP2_4C_PROOF: a legacy syllabus table is still in public';
    END IF;

    IF has_schema_privilege('anon', 'retired', 'USAGE') OR has_schema_privilege('authenticated', 'retired', 'USAGE') THEN
        RAISE EXCEPTION 'GAP2_4C_PROOF: anon/authenticated have USAGE on retired';
    END IF;

    FOR r IN SELECT c.relname, x.rolname FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) x(rolname)
              WHERE c.relnamespace = 'retired'::regnamespace AND c.relkind IN ('r', 'p', 'S')
                AND (has_table_privilege(x.rolname, c.oid, 'SELECT') OR has_table_privilege(x.rolname, c.oid, 'INSERT')
                     OR has_table_privilege(x.rolname, c.oid, 'UPDATE') OR has_table_privilege(x.rolname, c.oid, 'DELETE'))
    LOOP
        v_bad := v_bad || r.relname || ':' || r.rolname || ' ';
    END LOOP;
    IF v_bad <> '' THEN RAISE EXCEPTION 'GAP2_4C_PROOF: privileges remain on retired tables: %', v_bad; END IF;

    -- the re-pointed functions keep exactly their ACL, config (search_path ''), SECURITY DEFINER flag and owner
    FOR r IN SELECT b.sig, b.acl AS acl_before, coalesce(array_to_string(p.proacl, ','), 'NULL') AS acl_after,
                    b.cfg AS cfg_before, coalesce(array_to_string(p.proconfig, ','), 'NULL') AS cfg_after,
                    b.secdef AS secdef_before, p.prosecdef AS secdef_after, b.owner AS owner_before, p.proowner AS owner_after
               FROM pg_temp.gap2_4c_fn_before b JOIN pg_proc p ON p.oid = b.sig::regprocedure
    LOOP
        IF r.acl_before <> r.acl_after OR r.cfg_before <> r.cfg_after OR r.secdef_before <> r.secdef_after OR r.owner_before <> r.owner_after THEN
            v_bad := v_bad || r.sig || ' (acl ' || r.acl_before || ' → ' || r.acl_after || '; config ' || r.cfg_before || ' → ' || r.cfg_after || ') ';
        END IF;
    END LOOP;
    IF v_bad <> '' THEN RAISE EXCEPTION 'GAP2_4C_PROOF: a re-pointed function changed ACL / config: %', v_bad; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.fn_delete_exam_controlled(uuid,text,uuid,text,text)'::regprocedure
                   AND proconfig @> ARRAY['search_path=""']) THEN
        RAISE EXCEPTION 'GAP2_4C_PROOF: fn_delete_exam_controlled lost search_path ''''';
    END IF;

    -- P-9 invariants (082 / 083) still hold: no exposed SECURITY DEFINER function except the read model; all pinned
    FOR r IN SELECT p.oid::regprocedure::text sig, p.proname, pg_get_function_result(p.oid) ret,
                    has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
                    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') public_x,
                    EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%') sp
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    LOOP
        IF r.ret <> 'trigger' AND (r.anon_x OR r.public_x) AND r.proname <> 'fn_exam_syllabus_read_model' THEN v_bad := v_bad || r.sig || ':exposed '; END IF;
        IF NOT r.sp THEN v_bad := v_bad || r.sig || ':no-search_path '; END IF;
    END LOOP;
    IF has_function_privilege('authenticated', 'public.fn_delete_exam_controlled(uuid,text,uuid,text,text)'::regprocedure, 'EXECUTE') THEN
        v_bad := v_bad || 'fn_delete_exam_controlled:authenticated ';
    END IF;
    IF v_bad <> '' THEN RAISE EXCEPTION 'GAP2_4C_PROOF: SECURITY DEFINER invariant broken: %', v_bad; END IF;

    -- no public function references a legacy syllabus table outside schema retired
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                 AND p.prosrc ~ '(?<!retired\.)\m(exam_syllabi|exam_topics|exam_unit_mappings|taxonomy_aliases)\M') THEN
        RAISE EXCEPTION 'GAP2_4C_PROOF: a public function references a legacy syllabus table outside schema retired';
    END IF;

    -- the canonical syllabus is untouched
    IF to_regclass('public.exam_syllabus_versions') IS NULL OR to_regclass('public.exam_syllabus_nodes') IS NULL
       OR to_regclass('public.exam_syllabus_canonical_mappings') IS NULL THEN
        RAISE EXCEPTION 'GAP2_4C_PROOF: a canonical syllabus table is missing';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
