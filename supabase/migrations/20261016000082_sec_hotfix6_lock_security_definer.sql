-- =============================================================================
-- COURAGE LIBRARY — SEC-HOTFIX-6: LOCK DOWN UNCHECKED WRITING SECURITY DEFINER FUNCTIONS (INC-3)
-- Migration: 20261016000082_sec_hotfix6_lock_security_definer.sql
--
-- INC-3: public.fn_delete_exam_controlled (migration 062) is SECURITY DEFINER, has no caller check, no fixed
-- search_path and a NULL ACL (default EXECUTE for PUBLIC), so anon / any signed-in user could call it through
-- PostgREST and permanently delete an exam. Exposure check: no exam or exam-child row was ever deleted
-- (docs/reports/sec/SEC_HOTFIX6_REPORT.md §1).
--
-- Rule (architect ruling): lock every public SECURITY DEFINER function that (a) writes data, (b) has NO internal
-- role / ownership check and (c) is called by the application ONLY through the service-role client. Bodies are
-- unchanged. Everything else from the inventory awaits a ruling (report §2) and is not touched here.
--
-- Locked (EXECUTE revoked from PUBLIC, anon, authenticated; granted to service_role; search_path pinned):
--   fn_delete_exam_controlled(uuid,text,uuid,text,text)        — services/exam-onboarding/exam-onboarding.service.ts:928
--                                                                 (createAdminServerSupabaseClient, after guardAdminAction)
--   fn_authorize_and_start_test_attempt(uuid,uuid)             — services/premium-entitlement.service.ts:130 (service role)
--   fn_create_dynamic_mock_instance_atomic(uuid,…,integer)     — services/premium-generator.service.ts:859 (service role)
--   fn_record_qualifying_streak_activity(uuid,text,uuid,integer,text) — services/gamification.service.ts:468 (service role)
-- search_path: '' for the two functions that had none (every table reference in their bodies is schema-qualified;
-- only pg_catalog built-ins are unqualified); the other two keep their existing pinned 'public, pg_temp'.
--
-- ACL before (restored by the rollback):
--   fn_delete_exam_controlled               NULL (= PUBLIC EXECUTE, owner postgres)
--   fn_authorize_and_start_test_attempt     =X, postgres=X, authenticated=X, service_role=X
--   fn_create_dynamic_mock_instance_atomic  =X, postgres=X, authenticated=X, service_role=X
--   fn_record_qualifying_streak_activity    =X, postgres=X, service_role=X, authenticated=X
-- Rollback: docs/database/rollback/082_rollback.sql
-- =============================================================================

-- 1. search_path for the two functions that had none ------------------------------------------------
ALTER FUNCTION public.fn_delete_exam_controlled(uuid, text, uuid, text, text) SET search_path = '';
ALTER FUNCTION public.fn_record_qualifying_streak_activity(uuid, text, uuid, integer, text) SET search_path = '';

-- 2. EXECUTE: service_role only ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_delete_exam_controlled(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_authorize_and_start_test_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_record_qualifying_streak_activity(uuid, text, uuid, integer, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_delete_exam_controlled(uuid, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_authorize_and_start_test_attempt(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_record_qualifying_streak_activity(uuid, text, uuid, integer, text) TO service_role;

-- 3. Proof --------------------------------------------------------------------------------------------
DO $$
DECLARE
    f regprocedure;
    v_bad text := '';
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.fn_delete_exam_controlled(uuid,text,uuid,text,text)'::regprocedure,
        'public.fn_authorize_and_start_test_attempt(uuid,uuid)'::regprocedure,
        'public.fn_create_dynamic_mock_instance_atomic(uuid,uuid,uuid,text,text,text,text,integer,numeric,numeric,jsonb,jsonb,integer)'::regprocedure,
        'public.fn_record_qualifying_streak_activity(uuid,text,uuid,integer,text)'::regprocedure]
    LOOP
        IF has_function_privilege('anon', f, 'EXECUTE') THEN v_bad := v_bad || f::text || ':anon '; END IF;
        IF has_function_privilege('authenticated', f, 'EXECUTE') THEN v_bad := v_bad || f::text || ':authenticated '; END IF;
        IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f AND a.grantee = 0) THEN v_bad := v_bad || f::text || ':PUBLIC '; END IF;
        IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN v_bad := v_bad || f::text || ':service_role-missing '; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef
                       AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
            v_bad := v_bad || f::text || ':no-search_path ';
        END IF;
    END LOOP;
    IF v_bad <> '' THEN
        RAISE EXCEPTION 'SEC_HOTFIX6_PROOF: %', v_bad;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
