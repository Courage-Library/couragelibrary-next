-- Rollback for 20261028000123_launch_mode_1.sql. Run as ONE transaction by the operator.
-- Restores the exact 122 fn_exam_course_launch_set (without an access mode) and drops what 123 added. Refuses while a
-- course is LIVE in FREE_N (pause it or switch it to FREE_ALL first: 122 has no FREE_N, every LIVE course would gate).
BEGIN;

DO $chk$ BEGIN
  IF EXISTS (SELECT 1 FROM public.exam_course_launches WHERE status = 'LIVE' AND access_mode = 'FREE_N') THEN
    RAISE EXCEPTION 'ROLLBACK 123: a LIVE course is in FREE_N; pause it or switch it to FREE_ALL first';
  END IF;
END $chk$;

DROP FUNCTION public.fn_gated_course_document_ids();
DROP FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_exam_course_launch_set(
    p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_coverage jsonb, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.exam_course_launches%ROWTYPE;
    v_new public.exam_course_launches%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LAUNCH: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('LIVE', 'PAUSED') THEN RAISE EXCEPTION 'LAUNCH: status must be LIVE or PAUSED' USING ERRCODE = '22023'; END IF;
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
    ELSIF v_old.id IS NULL OR v_old.status <> 'LIVE' THEN
        RAISE EXCEPTION 'LAUNCH: only a LIVE course can be paused' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NOT NULL AND v_old.status = p_status THEN
        RAISE EXCEPTION 'LAUNCH: the course is already %', p_status USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NULL THEN
        INSERT INTO public.exam_course_launches (exam_id, exam_cycle_id, status, coverage, launched_by, launched_by_email, changed_by_email)
        VALUES (p_exam_id, p_exam_cycle_id, p_status, p_coverage, p_actor_id, p_actor_email, p_actor_email)
        RETURNING * INTO v_new;
    ELSE
        UPDATE public.exam_course_launches
           SET status = p_status,
               coverage = CASE WHEN p_status = 'LIVE' THEN p_coverage ELSE coverage END,
               launched_by = CASE WHEN p_status = 'LIVE' THEN p_actor_id ELSE launched_by END,
               launched_by_email = CASE WHEN p_status = 'LIVE' THEN p_actor_email ELSE launched_by_email END,
               launched_at = CASE WHEN p_status = 'LIVE' THEN now() ELSE launched_at END,
               changed_by_email = p_actor_email, changed_at = now()
         WHERE id = v_old.id
        RETURNING * INTO v_new;
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, CASE WHEN p_status = 'LIVE' THEN 'EXAM_COURSE_LAUNCH' ELSE 'EXAM_COURSE_PAUSE' END, 'exam_course_launch',
            v_new.id::text, CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('status', v_old.status) END,
            jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'status', p_status, 'coverage', v_new.coverage), NULL);
    RETURN jsonb_build_object('id', v_new.id, 'status', v_new.status);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) TO service_role;

REVOKE SELECT (access_mode) ON public.exam_course_launches FROM anon, authenticated;
ALTER TABLE public.exam_course_launches DROP COLUMN access_mode;

COMMIT;
