-- =============================================================================
-- ROLLBACK for 20261016000082_sec_hotfix6_lock_security_definer.sql
--
-- Restores the pre-082 EXECUTE grants and search_path settings exactly (see the migration header).
-- WARNING: this re-opens INC-3 (anon / authenticated can call fn_delete_exam_controlled and the three other
-- unchecked writing functions). Only for an emergency revert; record it as an incident.
-- Order: the newest migration first (082 before 081 → 080 → …).
-- =============================================================================

ALTER FUNCTION public.fn_delete_exam_controlled(uuid, text, uuid, text, text) RESET search_path;
ALTER FUNCTION public.fn_record_qualifying_streak_activity(uuid, text, uuid, integer, text) RESET search_path;

-- fn_delete_exam_controlled had a NULL ACL (default PUBLIC EXECUTE)
GRANT EXECUTE ON FUNCTION public.fn_delete_exam_controlled(uuid, text, uuid, text, text) TO PUBLIC;
-- the other three: =X (PUBLIC), authenticated=X, service_role=X (service_role kept by the migration)
GRANT EXECUTE ON FUNCTION public.fn_authorize_and_start_test_attempt(uuid, uuid) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_qualifying_streak_activity(uuid, text, uuid, integer, text) TO PUBLIC, authenticated;

DO $$
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_delete_exam_controlled(uuid,text,uuid,text,text)'::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.fn_record_qualifying_streak_activity(uuid,text,uuid,integer,text)'::regprocedure, 'EXECUTE') THEN
        RAISE EXCEPTION 'ROLLBACK_082_PROOF: grants not restored';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
