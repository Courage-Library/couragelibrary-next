-- =====================================================================================================================
-- 148 PAY-1 cleanup (owner GO 2026-11-18; PAY_1_DESIGN.md §11 "148 (after the B3 app is live)"). Drops what nothing calls
-- any more, now that every Free / Pro decision goes through the central check (fn_access_allowed / _many, 141–147).
-- Rollback: docs/database/rollback/148_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
--   1. The legacy premium functions (no caller on main since B3; their app callers are deleted in the same release):
--      fn_authorize_and_start_test_attempt, fn_check_premium_access_and_quota, fn_create_dynamic_mock_instance_atomic
--      (service-role only, B-service), fn_get_due_flashcards, fn_create_custom_flashcard_deck (no client EXECUTE since
--      SECDEF-S2-2 / 090, class C). SECURITY DEFINER count 134 → 129 (B-service 40 → 37).
--   2. FREE_N (LAUNCH-MODE-1, retired by PAY-1 B3 owner decision 2): exam_course_launches.access_mode is dropped (with
--      its column grant), fn_gated_course_document_ids is dropped (no reader), and fn_exam_course_launch_set loses
--      p_access_mode: the live 126 body without the mode — a launch makes a course visible, a pause hides it; the logo /
--      syllabus / coverage rules are unchanged. A LIVE course can no longer be "re-launched" with another mode
--      (EXAM_COURSE_MODE is gone): LIVE → LIVE is "already LIVE". INVOKER, EXECUTE service_role only, as before.
-- Refused (nothing changed) while any launch row is not FREE_ALL: such a course would silently lose its gating.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261116000147_pay1_b3_central_checks.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'PAY1_148_PREFLIGHT: 147 is not applied';
    END IF;
    IF EXISTS (SELECT 1 FROM public.exam_course_launches WHERE access_mode <> 'FREE_ALL') THEN
        RAISE EXCEPTION 'PAY1_148_PREFLIGHT: a course launch is not FREE_ALL; move it to FREE_ALL (and set its lessons in Free & Pro) first';
    END IF;
END
$pre$;

-- 1. the legacy premium functions
DROP FUNCTION public.fn_authorize_and_start_test_attempt(uuid, uuid);
DROP FUNCTION public.fn_check_premium_access_and_quota(uuid, uuid, text);
DROP FUNCTION public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer);
DROP FUNCTION public.fn_get_due_flashcards(uuid, integer);
DROP FUNCTION public.fn_create_custom_flashcard_deck(text, text, uuid, jsonb);

-- 2. FREE_N
DROP FUNCTION public.fn_gated_course_document_ids();
DROP FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text);
ALTER TABLE public.exam_course_launches DROP COLUMN access_mode;

CREATE FUNCTION public.fn_exam_course_launch_set(p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_coverage jsonb, p_actor_id uuid, p_actor_email text)
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
    ELSIF v_old.id IS NULL OR v_old.status <> 'LIVE' THEN
        RAISE EXCEPTION 'LAUNCH: only a LIVE course can be paused' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NOT NULL AND v_old.status = p_status THEN
        RAISE EXCEPTION 'LAUNCH: the course is already %', p_status USING ERRCODE = 'P0001';
    END IF;
    v_action := CASE WHEN p_status = 'PAUSED' THEN 'EXAM_COURSE_PAUSE' ELSE 'EXAM_COURSE_LAUNCH' END;
    IF v_old.id IS NULL THEN
        INSERT INTO public.exam_course_launches (exam_id, exam_cycle_id, status, coverage, launched_by, launched_by_email, changed_by_email)
        VALUES (p_exam_id, p_exam_cycle_id, p_status, p_coverage, p_actor_id, p_actor_email, p_actor_email)
        RETURNING * INTO v_new;
    ELSE
        UPDATE public.exam_course_launches
           SET status = p_status,
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
            CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('status', v_old.status) END,
            jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'status', v_new.status, 'coverage', v_new.coverage), NULL);
    RETURN jsonb_build_object('id', v_new.id, 'status', v_new.status);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) TO service_role;

DO $proof$
BEGIN
    IF to_regprocedure('public.fn_authorize_and_start_test_attempt(uuid, uuid)') IS NOT NULL
       OR to_regprocedure('public.fn_check_premium_access_and_quota(uuid, uuid, text)') IS NOT NULL
       OR to_regprocedure('public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer)') IS NOT NULL
       OR to_regprocedure('public.fn_get_due_flashcards(uuid, integer)') IS NOT NULL
       OR to_regprocedure('public.fn_create_custom_flashcard_deck(text, text, uuid, jsonb)') IS NOT NULL
       OR to_regprocedure('public.fn_gated_course_document_ids()') IS NOT NULL
       OR to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)') IS NOT NULL THEN
        RAISE EXCEPTION 'PAY1_148_PROOF: a dropped function is still there';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exam_course_launches' AND column_name = 'access_mode') THEN
        RAISE EXCEPTION 'PAY1_148_PROOF: exam_course_launches.access_mode is still there';
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)'::regprocedure)
       OR has_function_privilege('authenticated', 'public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PAY1_148_PROOF: fn_exam_course_launch_set must be INVOKER, service_role only';
    END IF;
END
$proof$;
