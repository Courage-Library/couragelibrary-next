-- =====================================================================================================================
-- 100 GRANT-AUDIT-1 — remove table-level client writes the app never uses (same class of gap as 099)
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/100_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- A table-level INSERT / UPDATE grant lets a client write EVERY column its RLS row check allows. Findings
-- (docs/reports/security/GRANT_AUDIT_1.md):
--   discussion_threads / discussion_messages — a student can INSERT directly (bypassing the SECDEF RPCs) with
--     is_pinned, has_faculty_answer, accepted_answer_id, upvote_count / message_count, status, and on messages
--     is_faculty_verified + verified_by_user_id (fake faculty verification), into LOCKED / ARCHIVED threads, without the
--     length checks. All app writes go through fn_create_discussion_thread / fn_post_discussion_message /
--     fn_mark_accepted_answer (SECURITY DEFINER) or the service role.
--   discussion_votes — direct INSERT / DELETE bypasses fn_vote_discussion_message, so upvote_count drifts from the votes.
--   discussion_moderation_flags — direct INSERT can set status / resolution_action / moderated_by_user_id /
--     moderation_note (a flag that arrives already "resolved", attributed to a moderator). The app uses
--     fn_flag_discussion_content (SECDEF).
--   learning_activity_events — any event type, time_spent_seconds and occurred_at (back-dated activity) can be
--     inserted; the app only reads it (dashboard, own rows); nothing writes it today.
--   custom_practice_sessions, study_plan_items, user_study_plans — score / accuracy_pct / completed_at /
--     completed_minutes / status are self-writable; no app code or database function uses these tables today.
-- Kept (own data, no integrity-sensitive column, written by the app with the user's client): user_bookmark_folders,
-- user_question_bookmarks, user_exam_goals (guard trigger), user_lesson_notes, user_notification_preferences.
--
-- Only grants change: SELECT and every RPC keep working; the dead client-write policies stay (no grant reaches them).
-- =====================================================================================================================

REVOKE INSERT, UPDATE ON public.discussion_threads FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.discussion_messages FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.discussion_votes FROM anon, authenticated;
REVOKE INSERT ON public.discussion_moderation_flags FROM anon, authenticated;

REVOKE INSERT ON public.learning_activity_events FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.custom_practice_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.study_plan_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_study_plans FROM anon, authenticated;
