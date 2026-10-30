-- =====================================================================================================================
-- Rollback for 20261030000126_exam_logo_1.sql (EXAM-LOGO-1). Run through the migration runner (it owns the transaction).
-- Restores fn_exam_course_launch_set EXACTLY as it was before 126 (pg_get_functiondef of the live 123 body), drops the
-- logo functions / columns / constraints, empties and drops the org-logos bucket (the owner's uploaded files are lost:
-- export them first if they must be kept), reactivates the test org deactivated by 126 (audited).
-- =====================================================================================================================

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

DROP FUNCTION IF EXISTS public.fn_logo_set(text, uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_logo_remove(text, uuid, uuid, text);

ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_logo_override_complete;
ALTER TABLE public.exams DROP COLUMN IF EXISTS logo_override_path, DROP COLUMN IF EXISTS logo_override_sha256, DROP COLUMN IF EXISTS logo_override_alt;
ALTER TABLE public.conducting_orgs DROP CONSTRAINT IF EXISTS conducting_orgs_logo_complete;
ALTER TABLE public.conducting_orgs DROP COLUMN IF EXISTS logo_path, DROP COLUMN IF EXISTS logo_sha256, DROP COLUMN IF EXISTS logo_alt, DROP COLUMN IF EXISTS logo_updated_at;

DELETE FROM storage.objects WHERE bucket_id = 'org-logos';
DELETE FROM storage.buckets WHERE id = 'org-logos';

WITH r AS (
    UPDATE public.conducting_orgs SET is_active = true, updated_at = now()
     WHERE slug = 'verification-authority-1790245768945' AND NOT is_active
    RETURNING id)
INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
SELECT NULL, 'rollback-126@courage-library.test', 'CONDUCTING_ORG_REACTIVATE', 'conducting_org', r.id::text,
       jsonb_build_object('is_active', false), jsonb_build_object('is_active', true), 'rollback of 126'
  FROM r;
