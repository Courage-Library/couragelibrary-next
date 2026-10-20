-- SECDEF-S2-2 (SECDEF-AUDIT Stage 1 rulings, architect 2026-10-20): revoke unused client EXECUTE on SECURITY DEFINER
-- functions. Functions / grants only: no DROP, no body change, no table / policy change.
--   1+2. 14 C-class functions (incl. the 2 practice RPCs): EXECUTE granted to authenticated, no app caller
--        → revoked from authenticated (and anon / PUBLIC); service_role + owner keep EXECUTE.
--   2.   12 no-caller service functions: already service_role + owner only → REVOKE asserted (no-op, ACL unchanged).
--   3.   7 trigger functions carrying PUBLIC EXECUTE → revoked from PUBLIC / anon / authenticated; service_role keeps
--        EXECUTE (explicit grant where it only had it through PUBLIC). Firing a trigger does not check EXECUTE.
-- Forensics (no runtime caller in app / lib / services / components / edge functions / policies / views / function
-- bodies / defaults / checks / cron): docs/reports/sec/SECDEF_S2_2_REPORT.md §1. Rollback: docs/database/rollback/090_rollback.sql

DO $pre$
DECLARE
  r record;
  v_acl text;
BEGIN
  -- precondition 1: every target's ACL equals the audited live state (abort on drift)
  FOR r IN SELECT * FROM (VALUES
    ('fn_clear_user_search_history()', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_complete_diagnostic_assessment(uuid)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_create_custom_flashcard_deck(text,text,uuid,jsonb)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_edit_discussion_message(uuid,text)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[])', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_generate_daily_recommendations(uuid,date,text)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_get_due_flashcards(uuid,integer)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_mark_notification_as_read(uuid)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_moderate_flagged_content(uuid,text,text)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_override_mistake_cognitive_type(uuid,text)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_reconcile_search_indexes()', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_start_custom_practice_session(uuid)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_update_daily_recommendation_status(uuid,text)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_verify_faculty_answer(uuid,boolean)', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_log_user_search(text,integer,integer,boolean,text,uuid)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_process_payment_webhook(text,text,text,jsonb,boolean)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_publish_exam_announcement(uuid,uuid,text,text,text,text,text)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_record_mistake_occurrence(uuid,uuid,text,uuid,uuid,integer,text,integer,uuid,uuid)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_resolve_errata_report(uuid,text,text,integer)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_reverse_reward_claim(uuid,uuid,text)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_revoke_mistakes_by_errata(uuid,uuid,text,uuid)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_universal_search(text,text[],uuid,uuid,text,integer,integer)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_update_spaced_repetition_review(uuid,uuid,uuid,integer)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text)', '{postgres=X/postgres,service_role=X/postgres}'),
    ('rls_auto_enable()', '{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_enforce_errata_state_machine()', NULL),
    ('fn_enforce_practice_session_lifecycle()', NULL),
    ('fn_protect_user_notification_fields()', NULL),
    ('fn_sanitize_attempt_answer()', '{=X/postgres,postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('fn_validate_bookmark_folder_ownership()', NULL),
    ('fn_validate_exam_announcement_cycle()', NULL),
    ('fn_validate_payment_order_transition()', NULL)
  ) AS t(rp, acl) LOOP
    SELECT p.proacl::text INTO v_acl FROM pg_proc p WHERE p.oid = r.rp::regprocedure;
    IF v_acl IS DISTINCT FROM r.acl THEN
      RAISE EXCEPTION 'SECDEF-S2-2 090 precondition: ACL of % drifted from the audited state', r.rp;
    END IF;
  END LOOP;
  -- precondition 2: the ACLs of every OTHER public function match the audited snapshot
  IF (SELECT md5(string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '(default)'), ';' ORDER BY p.oid::regprocedure::text))
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.oid::regprocedure::text NOT IN ('fn_clear_user_search_history()',
            'fn_complete_diagnostic_assessment(uuid)',
            'fn_create_custom_flashcard_deck(text,text,uuid,jsonb)',
            'fn_edit_discussion_message(uuid,text)',
            'fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[])',
            'fn_generate_daily_recommendations(uuid,date,text)',
            'fn_get_due_flashcards(uuid,integer)',
            'fn_mark_notification_as_read(uuid)',
            'fn_moderate_flagged_content(uuid,text,text)',
            'fn_override_mistake_cognitive_type(uuid,text)',
            'fn_reconcile_search_indexes()',
            'fn_start_custom_practice_session(uuid)',
            'fn_update_daily_recommendation_status(uuid,text)',
            'fn_verify_faculty_answer(uuid,boolean)',
            'fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text)',
            'fn_log_user_search(text,integer,integer,boolean,text,uuid)',
            'fn_process_payment_webhook(text,text,text,jsonb,boolean)',
            'fn_publish_exam_announcement(uuid,uuid,text,text,text,text,text)',
            'fn_record_mistake_occurrence(uuid,uuid,text,uuid,uuid,integer,text,integer,uuid,uuid)',
            'fn_resolve_errata_report(uuid,text,text,integer)',
            'fn_reverse_reward_claim(uuid,uuid,text)',
            'fn_revoke_mistakes_by_errata(uuid,uuid,text,uuid)',
            'fn_universal_search(text,text[],uuid,uuid,text,integer,integer)',
            'fn_update_spaced_repetition_review(uuid,uuid,uuid,integer)',
            'fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text)',
            'rls_auto_enable()',
            'fn_enforce_errata_state_machine()',
            'fn_enforce_practice_session_lifecycle()',
            'fn_protect_user_notification_fields()',
            'fn_sanitize_attempt_answer()',
            'fn_validate_bookmark_folder_ownership()',
            'fn_validate_exam_announcement_cycle()',
            'fn_validate_payment_order_transition()')) IS DISTINCT FROM '13e68a6401e057dea7c230534fa22b6c' THEN
    RAISE EXCEPTION 'SECDEF-S2-2 090 precondition: ACLs of non-target functions drifted';
  END IF;
END
$pre$;

-- 1+2. C-class (14): client grant removed
REVOKE EXECUTE ON FUNCTION public.fn_clear_user_search_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_edit_discussion_message(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(uuid,date,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_due_flashcards(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_mark_notification_as_read(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_moderate_flagged_content(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_start_custom_practice_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_verify_faculty_answer(uuid,boolean) FROM PUBLIC, anon, authenticated;

-- 2. no-caller service functions (12): no client grant today; asserted, ACL unchanged
REVOKE EXECUTE ON FUNCTION public.fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_log_user_search(text,integer,integer,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_process_payment_webhook(text,text,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_publish_exam_announcement(uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_record_mistake_occurrence(uuid,uuid,text,uuid,uuid,integer,text,integer,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_resolve_errata_report(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reverse_reward_claim(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_revoke_mistakes_by_errata(uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_universal_search(text,text[],uuid,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_spaced_repetition_review(uuid,uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 3. trigger functions (7): PUBLIC / anon / authenticated removed; service_role kept (explicit)
REVOKE EXECUTE ON FUNCTION public.fn_enforce_errata_state_machine() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enforce_errata_state_machine() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_practice_session_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enforce_practice_session_lifecycle() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_protect_user_notification_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_protect_user_notification_fields() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_validate_bookmark_folder_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_bookmark_folder_ownership() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_validate_exam_announcement_cycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_exam_announcement_cycle() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_validate_payment_order_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_payment_order_transition() TO service_role;

DO $post$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT p.oid, p.oid::regprocedure::text rp FROM pg_proc p WHERE p.oid::regprocedure::text IN (
      'fn_clear_user_search_history()',
      'fn_complete_diagnostic_assessment(uuid)',
      'fn_create_custom_flashcard_deck(text,text,uuid,jsonb)',
      'fn_edit_discussion_message(uuid,text)',
      'fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[])',
      'fn_generate_daily_recommendations(uuid,date,text)',
      'fn_get_due_flashcards(uuid,integer)',
      'fn_mark_notification_as_read(uuid)',
      'fn_moderate_flagged_content(uuid,text,text)',
      'fn_override_mistake_cognitive_type(uuid,text)',
      'fn_reconcile_search_indexes()',
      'fn_start_custom_practice_session(uuid)',
      'fn_update_daily_recommendation_status(uuid,text)',
      'fn_verify_faculty_answer(uuid,boolean)',
      'fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text)',
      'fn_log_user_search(text,integer,integer,boolean,text,uuid)',
      'fn_process_payment_webhook(text,text,text,jsonb,boolean)',
      'fn_publish_exam_announcement(uuid,uuid,text,text,text,text,text)',
      'fn_record_mistake_occurrence(uuid,uuid,text,uuid,uuid,integer,text,integer,uuid,uuid)',
      'fn_resolve_errata_report(uuid,text,text,integer)',
      'fn_reverse_reward_claim(uuid,uuid,text)',
      'fn_revoke_mistakes_by_errata(uuid,uuid,text,uuid)',
      'fn_universal_search(text,text[],uuid,uuid,text,integer,integer)',
      'fn_update_spaced_repetition_review(uuid,uuid,uuid,integer)',
      'fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text)',
      'rls_auto_enable()',
      'fn_enforce_errata_state_machine()',
      'fn_enforce_practice_session_lifecycle()',
      'fn_protect_user_notification_fields()',
      'fn_sanitize_attempt_answer()',
      'fn_validate_bookmark_folder_ownership()',
      'fn_validate_exam_announcement_cycle()',
      'fn_validate_payment_order_transition()') LOOP
    -- no client EXECUTE (anon / authenticated directly or through PUBLIC)
    IF has_function_privilege('anon', r.oid, 'EXECUTE') OR has_function_privilege('authenticated', r.oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p2, aclexplode(coalesce(p2.proacl, acldefault('f', p2.proowner))) a WHERE p2.oid = r.oid AND a.grantee = 0) THEN
      RAISE EXCEPTION 'SECDEF-S2-2 090 postcondition: % still client-executable', r.rp;
    END IF;
    -- service_role and the owner keep EXECUTE; nothing else holds it
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') OR NOT has_function_privilege('postgres', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'SECDEF-S2-2 090 postcondition: % lost service_role / owner EXECUTE', r.rp;
    END IF;
    IF (SELECT array_agg(pg_get_userbyid(a.grantee)::text ORDER BY 1) FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = r.oid)) a WHERE a.privilege_type = 'EXECUTE')
       IS DISTINCT FROM ARRAY['postgres', 'service_role'] THEN
      RAISE EXCEPTION 'SECDEF-S2-2 090 postcondition: % ACL is not exactly owner + service_role', r.rp;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p WHERE p.oid::regprocedure::text IN (
      'fn_clear_user_search_history()',
      'fn_complete_diagnostic_assessment(uuid)',
      'fn_create_custom_flashcard_deck(text,text,uuid,jsonb)',
      'fn_edit_discussion_message(uuid,text)',
      'fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[])',
      'fn_generate_daily_recommendations(uuid,date,text)',
      'fn_get_due_flashcards(uuid,integer)',
      'fn_mark_notification_as_read(uuid)',
      'fn_moderate_flagged_content(uuid,text,text)',
      'fn_override_mistake_cognitive_type(uuid,text)',
      'fn_reconcile_search_indexes()',
      'fn_start_custom_practice_session(uuid)',
      'fn_update_daily_recommendation_status(uuid,text)',
      'fn_verify_faculty_answer(uuid,boolean)',
      'fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text)',
      'fn_log_user_search(text,integer,integer,boolean,text,uuid)',
      'fn_process_payment_webhook(text,text,text,jsonb,boolean)',
      'fn_publish_exam_announcement(uuid,uuid,text,text,text,text,text)',
      'fn_record_mistake_occurrence(uuid,uuid,text,uuid,uuid,integer,text,integer,uuid,uuid)',
      'fn_resolve_errata_report(uuid,text,text,integer)',
      'fn_reverse_reward_claim(uuid,uuid,text)',
      'fn_revoke_mistakes_by_errata(uuid,uuid,text,uuid)',
      'fn_universal_search(text,text[],uuid,uuid,text,integer,integer)',
      'fn_update_spaced_repetition_review(uuid,uuid,uuid,integer)',
      'fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text)',
      'rls_auto_enable()',
      'fn_enforce_errata_state_machine()',
      'fn_enforce_practice_session_lifecycle()',
      'fn_protect_user_notification_fields()',
      'fn_sanitize_attempt_answer()',
      'fn_validate_bookmark_folder_ownership()',
      'fn_validate_exam_announcement_cycle()',
      'fn_validate_payment_order_transition()')) <> 33 THEN
    RAISE EXCEPTION 'SECDEF-S2-2 090 postcondition: expected 33 target functions';
  END IF;
  -- every other public function's ACL is unchanged
  IF (SELECT md5(string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '(default)'), ';' ORDER BY p.oid::regprocedure::text))
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.oid::regprocedure::text NOT IN ('fn_clear_user_search_history()',
            'fn_complete_diagnostic_assessment(uuid)',
            'fn_create_custom_flashcard_deck(text,text,uuid,jsonb)',
            'fn_edit_discussion_message(uuid,text)',
            'fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[])',
            'fn_generate_daily_recommendations(uuid,date,text)',
            'fn_get_due_flashcards(uuid,integer)',
            'fn_mark_notification_as_read(uuid)',
            'fn_moderate_flagged_content(uuid,text,text)',
            'fn_override_mistake_cognitive_type(uuid,text)',
            'fn_reconcile_search_indexes()',
            'fn_start_custom_practice_session(uuid)',
            'fn_update_daily_recommendation_status(uuid,text)',
            'fn_verify_faculty_answer(uuid,boolean)',
            'fn_claim_reward_item(uuid,uuid,text,text,text,text,text,text,text)',
            'fn_log_user_search(text,integer,integer,boolean,text,uuid)',
            'fn_process_payment_webhook(text,text,text,jsonb,boolean)',
            'fn_publish_exam_announcement(uuid,uuid,text,text,text,text,text)',
            'fn_record_mistake_occurrence(uuid,uuid,text,uuid,uuid,integer,text,integer,uuid,uuid)',
            'fn_resolve_errata_report(uuid,text,text,integer)',
            'fn_reverse_reward_claim(uuid,uuid,text)',
            'fn_revoke_mistakes_by_errata(uuid,uuid,text,uuid)',
            'fn_universal_search(text,text[],uuid,uuid,text,integer,integer)',
            'fn_update_spaced_repetition_review(uuid,uuid,uuid,integer)',
            'fn_verify_and_fulfill_payment(uuid,text,text,text,numeric,text,text,text)',
            'rls_auto_enable()',
            'fn_enforce_errata_state_machine()',
            'fn_enforce_practice_session_lifecycle()',
            'fn_protect_user_notification_fields()',
            'fn_sanitize_attempt_answer()',
            'fn_validate_bookmark_folder_ownership()',
            'fn_validate_exam_announcement_cycle()',
            'fn_validate_payment_order_transition()')) IS DISTINCT FROM '13e68a6401e057dea7c230534fa22b6c' THEN
    RAISE EXCEPTION 'SECDEF-S2-2 090 postcondition: a non-target function ACL changed';
  END IF;
END
$post$;
