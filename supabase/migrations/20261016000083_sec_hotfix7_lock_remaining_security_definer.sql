-- =============================================================================
-- COURAGE LIBRARY — SEC-HOTFIX-7: LOCK THE REMAINING PUBLIC SECURITY DEFINER FUNCTIONS (rulings on SEC-HOTFIX-6 §2.3)
-- Migration: 20261016000083_sec_hotfix7_lock_remaining_security_definer.sql
--
-- Bodies unchanged; only EXECUTE grants and search_path. After this migration RLS-suite P-9 has an EMPTY
-- pending-ruling list (docs/reports/sec/SEC_HOTFIX7_REPORT.md).
--
-- Ruling 1 — service_role only (REVOKE PUBLIC, anon, authenticated; GRANT service_role):
--   fn_award_gamification_reward(uuid,text,text,uuid,text,integer,text,jsonb)  search_path '' (body fully qualified)
--   fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text)          search_path '' (body fully qualified)
--   fn_reverse_reward_claim(uuid,uuid,text)                                     search_path '' (body fully qualified)
--   fn_check_premium_access_and_quota(uuid,uuid,text)                           search_path kept ('public, pg_temp')
--   The session-client drill reward call (services/mistake.service.ts:1865) now gets 42501 instead of its argument
--   error; the drill still completes with coins_awarded = 0 (TYPES-1:B-DRILL-REWARD-ARGS, owner Commerce: the reward
--   must go through the service-role GamificationService).
-- Ruling 2 — REVOKE PUBLIC, anon; authenticated + service_role keep EXECUTE (internal auth.uid() / JWT checks):
--   fn_create_batch_assignment, fn_enroll_batch_student, fn_evaluate_descriptive_submission,
--   fn_submit_descriptive_answer, fn_get_batch_assignment_progress
-- Ruling 3 — RLS predicate helpers: every policy using them is TO authenticated (none applies to anon / PUBLIC):
--   fn_can_evaluate_submission (1 policy), fn_has_batch_faculty_access (5), fn_is_batch_member (3),
--   fn_is_institute_member (3) → REVOKE PUBLIC, anon; authenticated + service_role keep EXECUTE.
-- Ruling 4 — fn_sanitize_attempt_answer() (trigger): search_path '' (body fully qualified).
--
-- ACL before (restored by docs/database/rollback/083_rollback.sql): every function above had PUBLIC EXECUTE
-- (NULL ACL or an explicit =X entry); the exact entries are listed in the report §2.
-- =============================================================================

-- Ruling 1 + 4: search_path for the functions that had none -----------------------------------------
ALTER FUNCTION public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb) SET search_path = '';
ALTER FUNCTION public.fn_claim_reward_item(uuid, uuid, text, text, text, text, text, text, text) SET search_path = '';
ALTER FUNCTION public.fn_reverse_reward_claim(uuid, uuid, text) SET search_path = '';
ALTER FUNCTION public.fn_sanitize_attempt_answer() SET search_path = '';

-- Ruling 1: service_role only ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_claim_reward_item(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reverse_reward_claim(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_premium_access_and_quota(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_claim_reward_item(uuid, uuid, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reverse_reward_claim(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_check_premium_access_and_quota(uuid, uuid, text) TO service_role;

-- Ruling 2 + 3: authenticated + service_role ----------------------------------------------------------
DO $$
DECLARE
    f regprocedure;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.fn_create_batch_assignment(uuid,text,text,uuid,timestamptz,text)'::regprocedure,
        'public.fn_enroll_batch_student(uuid,uuid,text)'::regprocedure,
        'public.fn_evaluate_descriptive_submission(uuid,jsonb,numeric,text,text,text,text,text)'::regprocedure,
        'public.fn_submit_descriptive_answer(uuid,text,text,text,uuid,uuid)'::regprocedure,
        'public.fn_get_batch_assignment_progress(uuid)'::regprocedure,
        'public.fn_can_evaluate_submission(uuid,uuid)'::regprocedure,
        'public.fn_has_batch_faculty_access(uuid,uuid)'::regprocedure,
        'public.fn_is_batch_member(uuid,uuid,text[])'::regprocedure,
        'public.fn_is_institute_member(uuid,uuid,text[])'::regprocedure]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- Proof -------------------------------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_bad text := '';
BEGIN
    -- no SECURITY DEFINER function in public is executable by PUBLIC / anon except the reviewed read model,
    -- and every one pins search_path (trigger functions: search_path only)
    FOR r IN
        SELECT p.oid, p.oid::regprocedure::text sig, p.proname, pg_get_function_result(p.oid) ret,
               has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
               EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') public_x,
               EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%') sp
          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    LOOP
        IF r.ret <> 'trigger' AND (r.anon_x OR r.public_x) AND r.proname <> 'fn_exam_syllabus_read_model' THEN
            v_bad := v_bad || r.sig || ':exposed ';
        END IF;
        IF NOT r.sp THEN v_bad := v_bad || r.sig || ':no-search_path '; END IF;
    END LOOP;
    -- ruling 1: authenticated must not execute; service_role must
    FOR r IN SELECT p.oid, p.oid::regprocedure::text sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('fn_award_gamification_reward','fn_claim_reward_item','fn_reverse_reward_claim','fn_check_premium_access_and_quota',
                                 'fn_delete_exam_controlled','fn_authorize_and_start_test_attempt','fn_create_dynamic_mock_instance_atomic','fn_record_qualifying_streak_activity')
    LOOP
        IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN v_bad := v_bad || r.sig || ':authenticated '; END IF;
        IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN v_bad := v_bad || r.sig || ':service_role-missing '; END IF;
    END LOOP;
    -- rulings 2 + 3: authenticated and service_role keep EXECUTE
    FOR r IN SELECT p.oid, p.oid::regprocedure::text sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('fn_create_batch_assignment','fn_enroll_batch_student','fn_evaluate_descriptive_submission','fn_submit_descriptive_answer',
                                 'fn_get_batch_assignment_progress','fn_can_evaluate_submission','fn_has_batch_faculty_access','fn_is_batch_member','fn_is_institute_member')
    LOOP
        IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
            v_bad := v_bad || r.sig || ':authenticated/service_role-missing ';
        END IF;
    END LOOP;
    IF v_bad <> '' THEN
        RAISE EXCEPTION 'SEC_HOTFIX7_PROOF: %', v_bad;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
