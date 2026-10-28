-- =====================================================================================================================
-- 123 LAUNCH-MODE-1 (architect ruling 2026-10-28) — a per-exam access mode for a launched course.
-- CONDITIONAL GO rules + MIGRATION-LIVE-SET. Rollback: docs/database/rollback/123_rollback.sql. No BEGIN / COMMIT.
--   exam_course_launches.access_mode — FREE_ALL (default: every lesson of the course free) | FREE_N (the first
--     LESSON_FREE_PER_CHAPTER lessons of each master chapter free, the rest Pro); public reads see it with the status
--   fn_exam_course_launch_set — + p_access_mode (new signature; the 122 one is dropped): a LIVE course in FREE_N is
--     REFUSED while no Pro plan is active (the database's half of "payments are off"; the server also refuses while
--     PAYMENTS_ENABLED is not "true"); the mode of a LIVE course can change (audited EXAM_COURSE_MODE)
--   fn_gated_course_document_ids — the lessons of LIVE FREE_N courses: the ONLY lessons lesson gating applies to
--     (fn_live_course_document_ids stays: every LIVE course, for "continue where you left off")
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261028000122_ca7_launch_notes_internal.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'LM1_PREFLIGHT: 122 is not applied';
    END IF;
END
$pre$;

ALTER TABLE public.exam_course_launches ADD COLUMN access_mode text NOT NULL DEFAULT 'FREE_ALL' CHECK (access_mode IN ('FREE_ALL', 'FREE_N'));
COMMENT ON COLUMN public.exam_course_launches.access_mode IS 'LAUNCH-MODE-1: FREE_ALL = every lesson free; FREE_N = the first N per master chapter free, the rest Pro (refused while no Pro plan is active / payments are off).';
GRANT SELECT (access_mode) ON public.exam_course_launches TO anon, authenticated;

DROP FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text);

CREATE FUNCTION public.fn_exam_course_launch_set(
    p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_access_mode text, p_coverage jsonb, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- the lessons lesson gating applies to: those of LIVE FREE_N courses (INVOKER: anon sees LIVE launch rows only)
CREATE OR REPLACE FUNCTION public.fn_gated_course_document_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT DISTINCT (l ->> 'document_id')::uuid
      FROM public.exam_course_launches x
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(public.fn_exam_course_outline(x.exam_id, x.exam_cycle_id, 'en') -> 'chapters', '[]'::jsonb)) ch
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(ch -> 'lessons', '[]'::jsonb)) l
     WHERE x.status = 'LIVE' AND x.access_mode = 'FREE_N'
$fn$;

REVOKE ALL ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_gated_course_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_gated_course_document_ids() TO anon, authenticated, service_role;

DO $proof$
BEGIN
    IF has_function_privilege('authenticated', 'public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)', 'EXECUTE')
       OR to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)') IS NOT NULL
       OR NOT has_column_privilege('anon', 'public.exam_course_launches', 'access_mode', 'SELECT')
       OR has_column_privilege('anon', 'public.exam_course_launches', 'coverage', 'SELECT')
       OR EXISTS (SELECT 1 FROM public.exam_course_launches WHERE access_mode <> 'FREE_ALL') THEN
        RAISE EXCEPTION 'LM1_PROOF: grants / the old signature / the default mode are not as designed';
    END IF;
END
$proof$;
