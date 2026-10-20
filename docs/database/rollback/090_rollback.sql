-- Rollback of 20261020000090_secdef_s2_2_revoke_unused_client_execute.sql (generated from the live ACLs before 090).
-- Restores every changed ACL item by item in the original order. The 12 no-caller functions were not changed.
-- 6 trigger functions had a NULL (implicit default) ACL; GRANT / REVOKE cannot recreate NULL, so they get the
-- identical explicit default (same text as acldefault, same privileges).

-- fn_clear_user_search_history: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_clear_user_search_history() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_clear_user_search_history() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_clear_user_search_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_clear_user_search_history() TO service_role;

-- fn_complete_diagnostic_assessment: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(uuid) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(uuid) TO service_role;

-- fn_create_custom_flashcard_deck: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(text,text,uuid,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(text,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(text,text,uuid,jsonb) TO service_role;

-- fn_edit_discussion_message: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_edit_discussion_message(uuid,text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_edit_discussion_message(uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_edit_discussion_message(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_edit_discussion_message(uuid,text) TO service_role;

-- fn_generate_custom_practice_session: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[]) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[]) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(text,text,uuid[],integer,uuid[]) TO service_role;

-- fn_generate_daily_recommendations: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(uuid,date,text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(uuid,date,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(uuid,date,text) TO service_role;

-- fn_get_due_flashcards: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_get_due_flashcards(uuid,integer) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_get_due_flashcards(uuid,integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_get_due_flashcards(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_due_flashcards(uuid,integer) TO service_role;

-- fn_mark_notification_as_read: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_mark_notification_as_read(uuid) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_mark_notification_as_read(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_mark_notification_as_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_notification_as_read(uuid) TO service_role;

-- fn_moderate_flagged_content: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_moderate_flagged_content(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_moderate_flagged_content(uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_moderate_flagged_content(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_moderate_flagged_content(uuid,text,text) TO service_role;

-- fn_override_mistake_cognitive_type: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(uuid,text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(uuid,text) TO service_role;

-- fn_reconcile_search_indexes: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() TO service_role;

-- fn_start_custom_practice_session: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_start_custom_practice_session(uuid) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_start_custom_practice_session(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_start_custom_practice_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_start_custom_practice_session(uuid) TO service_role;

-- fn_update_daily_recommendation_status: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(uuid,text) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(uuid,text) TO service_role;

-- fn_verify_faculty_answer: before {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_verify_faculty_answer(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_verify_faculty_answer(uuid,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_verify_faculty_answer(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_faculty_answer(uuid,boolean) TO service_role;

-- fn_enforce_errata_state_machine: before NULL (implicit default {=X/postgres,postgres=X/postgres})
REVOKE EXECUTE ON FUNCTION public.fn_enforce_errata_state_machine() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_enforce_errata_state_machine() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enforce_errata_state_machine() TO postgres;

-- fn_enforce_practice_session_lifecycle: before NULL (implicit default {=X/postgres,postgres=X/postgres})
REVOKE EXECUTE ON FUNCTION public.fn_enforce_practice_session_lifecycle() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_enforce_practice_session_lifecycle() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enforce_practice_session_lifecycle() TO postgres;

-- fn_protect_user_notification_fields: before NULL (implicit default {=X/postgres,postgres=X/postgres})
REVOKE EXECUTE ON FUNCTION public.fn_protect_user_notification_fields() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_protect_user_notification_fields() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_protect_user_notification_fields() TO postgres;

-- fn_sanitize_attempt_answer: before {=X/postgres,postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
REVOKE EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_sanitize_attempt_answer() TO authenticated;

-- fn_validate_bookmark_folder_ownership: before NULL (implicit default {=X/postgres,postgres=X/postgres})
REVOKE EXECUTE ON FUNCTION public.fn_validate_bookmark_folder_ownership() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_validate_bookmark_folder_ownership() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_validate_bookmark_folder_ownership() TO postgres;

-- fn_validate_exam_announcement_cycle: before NULL (implicit default {=X/postgres,postgres=X/postgres})
REVOKE EXECUTE ON FUNCTION public.fn_validate_exam_announcement_cycle() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_validate_exam_announcement_cycle() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_validate_exam_announcement_cycle() TO postgres;

-- fn_validate_payment_order_transition: before NULL (implicit default {=X/postgres,postgres=X/postgres})
REVOKE EXECUTE ON FUNCTION public.fn_validate_payment_order_transition() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_validate_payment_order_transition() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_validate_payment_order_transition() TO postgres;

DO $rb$
DECLARE
  r record;
  v_acl text;
BEGIN
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
    ('fn_enforce_errata_state_machine()', '{=X/postgres,postgres=X/postgres}'),
    ('fn_enforce_practice_session_lifecycle()', '{=X/postgres,postgres=X/postgres}'),
    ('fn_protect_user_notification_fields()', '{=X/postgres,postgres=X/postgres}'),
    ('fn_sanitize_attempt_answer()', '{=X/postgres,postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('fn_validate_bookmark_folder_ownership()', '{=X/postgres,postgres=X/postgres}'),
    ('fn_validate_exam_announcement_cycle()', '{=X/postgres,postgres=X/postgres}'),
    ('fn_validate_payment_order_transition()', '{=X/postgres,postgres=X/postgres}')
  ) AS t(rp, acl) LOOP
    SELECT p.proacl::text INTO v_acl FROM pg_proc p WHERE p.oid = r.rp::regprocedure;
    IF v_acl IS DISTINCT FROM r.acl THEN
      RAISE EXCEPTION '090 rollback: ACL of % not restored', r.rp;
    END IF;
  END LOOP;
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
    RAISE EXCEPTION '090 rollback: a non-target function ACL changed';
  END IF;
END
$rb$;
