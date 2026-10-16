-- =============================================================================
-- ROLLBACK for 20261016000083_sec_hotfix7_lock_remaining_security_definer.sql
--
-- Restores the pre-083 EXECUTE privileges and search_path settings (report §2 lists the exact ACLs).
-- The three functions whose ACL was NULL (fn_can_evaluate_submission, fn_evaluate_descriptive_submission,
-- fn_submit_descriptive_answer) get the equivalent explicit grants (PUBLIC EXECUTE); effective privileges are
-- identical (dry-run proven with has_function_privilege for PUBLIC / anon / authenticated / service_role).
-- WARNING: re-opens the exposures fixed by SEC-HOTFIX-7. Emergency use only; record it as an incident.
-- Order: newest first (083 before 082 → 081 → …).
-- =============================================================================

ALTER FUNCTION public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb) RESET search_path;
ALTER FUNCTION public.fn_claim_reward_item(uuid, uuid, text, text, text, text, text, text, text) RESET search_path;
ALTER FUNCTION public.fn_reverse_reward_claim(uuid, uuid, text) RESET search_path;
ALTER FUNCTION public.fn_sanitize_attempt_answer() RESET search_path;

-- ruling 1 functions: =X, authenticated=X, service_role=X (+ anon=X on fn_check_premium_access_and_quota)
GRANT EXECUTE ON FUNCTION public.fn_award_gamification_reward(uuid, text, text, uuid, text, integer, text, jsonb) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_reward_item(uuid, uuid, text, text, text, text, text, text, text) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reverse_reward_claim(uuid, uuid, text) TO PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_premium_access_and_quota(uuid, uuid, text) TO PUBLIC, anon, authenticated;

-- rulings 2 + 3: PUBLIC EXECUTE back (authenticated / service_role were kept by the migration)
GRANT EXECUTE ON FUNCTION public.fn_create_batch_assignment(uuid, text, text, uuid, timestamptz, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enroll_batch_student(uuid, uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_evaluate_descriptive_submission(uuid, jsonb, numeric, text, text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_submit_descriptive_answer(uuid, text, text, text, uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_batch_assignment_progress(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_evaluate_submission(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_batch_faculty_access(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_batch_member(uuid, uuid, text[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_institute_member(uuid, uuid, text[]) TO PUBLIC;

DO $$
BEGIN
    IF NOT has_function_privilege('anon', 'public.fn_award_gamification_reward(uuid,text,text,uuid,text,integer,text,jsonb)'::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('anon', 'public.fn_is_batch_member(uuid,uuid,text[])'::regprocedure, 'EXECUTE') THEN
        RAISE EXCEPTION 'ROLLBACK_083_PROOF: grants not restored';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
