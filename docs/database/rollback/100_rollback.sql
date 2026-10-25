-- Rollback for 20261025000100_grant_audit_client_writes.sql.
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- WARNING: restores the pre-100 table-level client writes (the gaps 100 closes). Only for an emergency.
BEGIN;

GRANT INSERT, UPDATE ON public.discussion_threads TO authenticated;
GRANT INSERT, UPDATE ON public.discussion_messages TO authenticated;
GRANT INSERT, DELETE ON public.discussion_votes TO authenticated;
GRANT INSERT ON public.discussion_moderation_flags TO authenticated;

GRANT INSERT ON public.learning_activity_events TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.custom_practice_sessions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.study_plan_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_study_plans TO authenticated;

COMMIT;
