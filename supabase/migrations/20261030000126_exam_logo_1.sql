-- =====================================================================================================================
-- 126 EXAM-LOGO-1 (architect CONDITIONAL GO, 2026-10-30) — every exam shows its conducting body's official logo.
-- Rollback: docs/database/rollback/126_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
--   conducting_orgs (existing; exams.org_id already references it): the logo = a content-hash path
--     orgs/<org id>/<sha256>.webp (GENERATED from logo_sha256, so it cannot point anywhere else) + required alt text
--   exams: an optional override exams/<exam id>/<sha256>.webp; override alt text REQUIRED whenever a path is set (CHECK)
--   storage bucket org-logos: public READ, 1 MB, image/webp only (the server re-encodes every upload); NO write policy —
--     only the server (service role, after guardAdminAction) writes
--   fn_logo_set / fn_logo_remove: INVOKER, EXECUTE service_role only; set / replace / remove + one audit row
--     (ORG_LOGO_UPLOAD / ORG_LOGO_REPLACE / ORG_LOGO_REMOVE / EXAM_LOGO_OVERRIDE_*); return the old path so the
--     server deletes the old file only after the row changed. Removing the logo a LIVE course relies on is refused.
--   fn_exam_course_launch_set: the live 123 body + "LIVE needs a logo (org or override)"
--   the test org verification-authority-1790245768945 (0 exams) is DEACTIVATED (not deleted), audited (ruling 1)
-- SECURITY DEFINER count unchanged (no new SECDEF function).
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261029000125_publish_confirm_server.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'LOGO_PREFLIGHT: 125 is not applied';
    END IF;
END
$pre$;

ALTER TABLE public.conducting_orgs
    ADD COLUMN logo_sha256 text,
    ADD COLUMN logo_alt text,
    ADD COLUMN logo_updated_at timestamptz,
    ADD COLUMN logo_path text GENERATED ALWAYS AS (CASE WHEN logo_sha256 IS NULL THEN NULL ELSE 'orgs/' || id::text || '/' || logo_sha256 || '.webp' END) STORED;
ALTER TABLE public.conducting_orgs ADD CONSTRAINT conducting_orgs_logo_complete CHECK (
    (logo_sha256 IS NULL AND logo_alt IS NULL AND logo_updated_at IS NULL)
    OR (logo_sha256 ~ '^[0-9a-f]{64}$' AND logo_alt IS NOT NULL AND length(btrim(logo_alt)) BETWEEN 3 AND 160 AND logo_updated_at IS NOT NULL));

ALTER TABLE public.exams
    ADD COLUMN logo_override_sha256 text,
    ADD COLUMN logo_override_alt text,
    ADD COLUMN logo_override_path text GENERATED ALWAYS AS (CASE WHEN logo_override_sha256 IS NULL THEN NULL ELSE 'exams/' || id::text || '/' || logo_override_sha256 || '.webp' END) STORED;
ALTER TABLE public.exams ADD CONSTRAINT exams_logo_override_complete CHECK (
    (logo_override_sha256 IS NULL AND logo_override_alt IS NULL)
    OR (logo_override_sha256 ~ '^[0-9a-f]{64}$' AND logo_override_alt IS NOT NULL AND length(btrim(logo_override_alt)) BETWEEN 3 AND 160));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-logos', 'org-logos', true, 1048576, ARRAY['image/webp']);

CREATE FUNCTION public.fn_logo_set(p_kind text, p_id uuid, p_sha256 text, p_alt text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_old_sha text;
    v_new_path text;
    v_old_path text;
    v_action text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LOGO: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('ORG', 'EXAM') THEN RAISE EXCEPTION 'LOGO: kind must be ORG or EXAM' USING ERRCODE = '22023'; END IF;
    IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'LOGO: a sha256 content hash is required' USING ERRCODE = '22023'; END IF;
    IF p_alt IS NULL OR length(btrim(p_alt)) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'LOGO: alt text is required (3 to 160 characters)' USING ERRCODE = '22023'; END IF;
    IF p_kind = 'ORG' THEN
        SELECT logo_sha256, logo_path INTO v_old_sha, v_old_path FROM public.conducting_orgs WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'LOGO: conducting body not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.conducting_orgs SET logo_sha256 = p_sha256, logo_alt = btrim(p_alt), logo_updated_at = now(), updated_at = now()
         WHERE id = p_id RETURNING logo_path INTO v_new_path;
        v_action := CASE WHEN v_old_sha IS NULL THEN 'ORG_LOGO_UPLOAD' ELSE 'ORG_LOGO_REPLACE' END;
    ELSE
        SELECT logo_override_sha256, logo_override_path INTO v_old_sha, v_old_path FROM public.exams WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'LOGO: exam not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE public.exams SET logo_override_sha256 = p_sha256, logo_override_alt = btrim(p_alt), updated_at = now()
         WHERE id = p_id RETURNING logo_override_path INTO v_new_path;
        v_action := CASE WHEN v_old_sha IS NULL THEN 'EXAM_LOGO_OVERRIDE_SET' ELSE 'EXAM_LOGO_OVERRIDE_REPLACE' END;
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, v_action, CASE WHEN p_kind = 'ORG' THEN 'conducting_org' ELSE 'exam' END, p_id::text,
            CASE WHEN v_old_path IS NULL THEN NULL ELSE jsonb_build_object('path', v_old_path) END,
            jsonb_build_object('path', v_new_path, 'alt', btrim(p_alt)), NULL);
    RETURN jsonb_build_object('path', v_new_path, 'old_path', CASE WHEN v_old_path IS DISTINCT FROM v_new_path THEN v_old_path END, 'action', v_action);
END
$fn$;

CREATE FUNCTION public.fn_logo_remove(p_kind text, p_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_old_path text;
    v_action text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LOGO: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('ORG', 'EXAM') THEN RAISE EXCEPTION 'LOGO: kind must be ORG or EXAM' USING ERRCODE = '22023'; END IF;
    IF p_kind = 'ORG' THEN
        SELECT logo_path INTO v_old_path FROM public.conducting_orgs WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'LOGO: conducting body not found' USING ERRCODE = 'P0002'; END IF;
        -- a LIVE course of an exam of this body that has no override of its own relies on this logo
        IF EXISTS (SELECT 1 FROM public.exam_course_launches l JOIN public.exams e ON e.id = l.exam_id
                    WHERE e.org_id = p_id AND l.status = 'LIVE' AND e.logo_override_sha256 IS NULL) THEN
            RAISE EXCEPTION 'LOGO: a live course shows this logo; replace it instead of removing it' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.conducting_orgs SET logo_sha256 = NULL, logo_alt = NULL, logo_updated_at = NULL, updated_at = now() WHERE id = p_id;
        v_action := 'ORG_LOGO_REMOVE';
    ELSE
        SELECT logo_override_path INTO v_old_path FROM public.exams WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'LOGO: exam not found' USING ERRCODE = 'P0002'; END IF;
        IF EXISTS (SELECT 1 FROM public.exam_course_launches l JOIN public.exams e ON e.id = l.exam_id JOIN public.conducting_orgs o ON o.id = e.org_id
                    WHERE l.exam_id = p_id AND l.status = 'LIVE' AND o.logo_sha256 IS NULL) THEN
            RAISE EXCEPTION 'LOGO: a live course shows this logo; replace it instead of removing it' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.exams SET logo_override_sha256 = NULL, logo_override_alt = NULL, updated_at = now() WHERE id = p_id;
        v_action := 'EXAM_LOGO_OVERRIDE_REMOVE';
    END IF;
    IF v_old_path IS NULL THEN RAISE EXCEPTION 'LOGO: there is no logo to remove' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, v_action, CASE WHEN p_kind = 'ORG' THEN 'conducting_org' ELSE 'exam' END, p_id::text,
            jsonb_build_object('path', v_old_path), NULL, NULL);
    RETURN jsonb_build_object('old_path', v_old_path, 'action', v_action);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_logo_set(text, uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_logo_set(text, uuid, text, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_logo_remove(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_logo_remove(text, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_exam_course_launch_set(p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_access_mode text, p_coverage jsonb, p_actor_id uuid, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_old    public.exam_course_launches%ROWTYPE;
    v_new    public.exam_course_launches%ROWTYPE;
    v_action text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LAUNCH: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('LIVE', 'PAUSED') THEN RAISE EXCEPTION 'LAUNCH: status must be LIVE or PAUSED' USING ERRCODE = '22023'; END IF;
    IF p_access_mode IS NULL OR p_access_mode NOT IN ('FREE_ALL', 'FREE_N') THEN RAISE EXCEPTION 'LAUNCH: access mode must be FREE_ALL or FREE_N' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'LAUNCH: exam not found' USING ERRCODE = 'P0002'; END IF;
    IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'LAUNCH: the cycle does not belong to this exam' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_course_launch:' || p_exam_id::text, 0));
    SELECT * INTO v_old FROM public.exam_course_launches WHERE exam_id = p_exam_id AND exam_cycle_id IS NOT DISTINCT FROM p_exam_cycle_id FOR UPDATE;
    IF p_status = 'LIVE' THEN
        IF p_coverage IS NULL OR jsonb_typeof(p_coverage) <> 'object' OR NOT (p_coverage ? 'total' AND p_coverage ? 'en') THEN
            RAISE EXCEPTION 'LAUNCH: a coverage snapshot is required to launch' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active) THEN
            RAISE EXCEPTION 'LAUNCH: the exam has no published syllabus' USING ERRCODE = 'P0001';
        END IF;
        -- EXAM-LOGO-1 (126): a course goes live only with its conducting body's logo (or the exam's own override)
        IF NOT EXISTS (SELECT 1 FROM public.exams e JOIN public.conducting_orgs o ON o.id = e.org_id
                        WHERE e.id = p_exam_id AND (e.logo_override_sha256 IS NOT NULL OR o.logo_sha256 IS NOT NULL)) THEN
            RAISE EXCEPTION 'LAUNCH: the exam needs its conducting body''s logo first (Exams › Conducting bodies)' USING ERRCODE = 'P0001';
        END IF;
        -- LAUNCH-MODE-1: no paywall nobody can pay for
        IF p_access_mode = 'FREE_N' AND NOT EXISTS (SELECT 1 FROM public.pro_plan_versions WHERE active) THEN
            RAISE EXCEPTION 'LAUNCH: FREE_N needs payments: no Pro plan is active, so the Pro lessons could not be bought. Launch with FREE_ALL instead.' USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_old.id IS NULL OR v_old.status <> 'LIVE' THEN
        RAISE EXCEPTION 'LAUNCH: only a LIVE course can be paused' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NOT NULL AND v_old.status = p_status AND (p_status = 'PAUSED' OR v_old.access_mode = p_access_mode) THEN
        RAISE EXCEPTION 'LAUNCH: the course is already %', p_status USING ERRCODE = 'P0001';
    END IF;
    v_action := CASE WHEN p_status = 'PAUSED' THEN 'EXAM_COURSE_PAUSE'
                     WHEN v_old.id IS NOT NULL AND v_old.status = 'LIVE' THEN 'EXAM_COURSE_MODE'
                     ELSE 'EXAM_COURSE_LAUNCH' END;
    IF v_old.id IS NULL THEN
        INSERT INTO public.exam_course_launches (exam_id, exam_cycle_id, status, access_mode, coverage, launched_by, launched_by_email, changed_by_email)
        VALUES (p_exam_id, p_exam_cycle_id, p_status, p_access_mode, p_coverage, p_actor_id, p_actor_email, p_actor_email)
        RETURNING * INTO v_new;
    ELSE
        UPDATE public.exam_course_launches
           SET status = p_status,
               access_mode = CASE WHEN p_status = 'LIVE' THEN p_access_mode ELSE access_mode END,
               coverage = CASE WHEN p_status = 'LIVE' THEN p_coverage ELSE coverage END,
               launched_by = CASE WHEN v_action = 'EXAM_COURSE_LAUNCH' THEN p_actor_id ELSE launched_by END,
               launched_by_email = CASE WHEN v_action = 'EXAM_COURSE_LAUNCH' THEN p_actor_email ELSE launched_by_email END,
               launched_at = CASE WHEN v_action = 'EXAM_COURSE_LAUNCH' THEN now() ELSE launched_at END,
               changed_by_email = p_actor_email, changed_at = now()
         WHERE id = v_old.id
        RETURNING * INTO v_new;
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, v_action, 'exam_course_launch', v_new.id::text,
            CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('status', v_old.status, 'access_mode', v_old.access_mode) END,
            jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'status', v_new.status, 'access_mode', v_new.access_mode, 'coverage', v_new.coverage), NULL);
    RETURN jsonb_build_object('id', v_new.id, 'status', v_new.status, 'access_mode', v_new.access_mode);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text) TO service_role;

-- ruling 1: the test org (no exams) is deactivated, never deleted; audited
WITH d AS (
    UPDATE public.conducting_orgs SET is_active = false, updated_at = now()
     WHERE slug = 'verification-authority-1790245768945' AND is_active
       AND NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.org_id = conducting_orgs.id)
    RETURNING id)
INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
SELECT NULL, 'migration-126@courage-library.test', 'CONDUCTING_ORG_DEACTIVATE', 'conducting_org', d.id::text,
       jsonb_build_object('is_active', true), jsonb_build_object('is_active', false), 'EXAM-LOGO-1 ruling 1: a test org with no exams'
  FROM d;

DO $proof$
BEGIN
    IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('fn_logo_set', 'fn_logo_remove') AND prosecdef) <> 0 THEN
        RAISE EXCEPTION 'LOGO_PROOF: the logo functions must be SECURITY INVOKER';
    END IF;
    IF has_function_privilege('authenticated', 'public.fn_logo_set(text, uuid, text, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_logo_remove(text, uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'LOGO_PROOF: a client role can execute a logo / launch function';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%org-logos%') THEN
        RAISE EXCEPTION 'LOGO_PROOF: org-logos must have no storage write policy';
    END IF;
    IF NOT (SELECT public FROM storage.buckets WHERE id = 'org-logos') THEN RAISE EXCEPTION 'LOGO_PROOF: org-logos must be public-read'; END IF;
END
$proof$;
