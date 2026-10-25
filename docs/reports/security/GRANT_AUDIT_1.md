# GRANT-AUDIT-1: table-level client write grants

This is an inspection and report only. The proposed fix is migration 100, which is held: it has a dry-run and a rolled-back smoke but is **not applied** without the architect's go.

- **Date:** 2026-10-25.
- **Source:** read-only queries on the dev database (`information_schema`, `pg_policies`, `pg_trigger`, `pg_proc`) and a search of the app code.

**Why this matters.** A table-level `INSERT` / `UPDATE` grant to `authenticated` lets a signed-in client write **every** column that its RLS row check allows. Column-level revokes do nothing while the table grant exists. This is the gap migration 099 closed on `test_attempts` and `attempt_answers`.

## Summary

| Priority | Table | Client can write (authenticated) | Integrity-sensitive columns | Exploit | App writes via | Proposed fix (100) |
|---|---|---|---|---|---|---|
| 1 | `learning_activity_events` | INSERT, all columns | `event_type`, `time_spent_seconds`, `occurred_at` (activity analytics) | **Yes, low impact.** A student can insert back-dated or fake activity for themselves. Today only their own dashboard "recent activity" reads it; no streak, leaderboard or database function uses it. | nothing on the client; SECDEF RPCs (community) insert as owner | REVOKE INSERT |
| 2 | `custom_practice_sessions` | INSERT / UPDATE / DELETE, all columns | `score`, `accuracy_pct`, `status`, `completed_at`, `test_attempt_id` | **Yes, no consumer today.** A student can set their own score or accuracy, or link any attempt id. The lifecycle trigger blocks only illegal status transitions and snapshot edits; it does not block a score change. No app code or database function uses the table. | not used | REVOKE INSERT, UPDATE, DELETE |
| 3 | `discussion_threads` | INSERT / UPDATE (UPDATE needs the staff policy) | `is_pinned`, `has_faculty_answer`, `accepted_answer_id`, `status`, `upvote_count`, `message_count`, `view_count`, `last_activity_at` | **Yes.** The INSERT policy checks only `author_id = auth.uid()`, so a student can create a thread that is already pinned, marked "faculty answered", or carries fake counts. This skips the RPC's title and content checks. | `fn_create_discussion_thread`, `fn_mark_accepted_answer` (SECDEF) | REVOKE INSERT, UPDATE |
| 3 | `discussion_messages` | INSERT / UPDATE (UPDATE needs the staff policy) | `is_faculty_verified`, `verified_by_user_id`, `verified_at`, `upvote_count`, `is_deleted` | **Yes. Proven in the 100 smoke (B-1, rolled back).** A student can insert a message marked **faculty-verified**, attributed to any verifier, with any upvote count. It can go into a LOCKED or ARCHIVED thread and skips the length checks. | `fn_post_discussion_message` (SECDEF) | REVOKE INSERT, UPDATE |
| 3 | `discussion_votes` | INSERT, DELETE (own rows) | none in the row; the RPC derives `upvote_count` from the votes | **Yes, low impact.** Direct inserts and deletes skip the RPC, so `upvote_count` drifts from the votes until the next RPC call recounts it. Coins are only granted inside the RPC, and this fix does not touch coins. | `fn_vote_discussion_message` (SECDEF) | REVOKE INSERT, DELETE |
| 3 | `discussion_moderation_flags` | INSERT, all columns | `status`, `resolution_action`, `moderated_by_user_id`, `moderation_note`, `moderated_at` | **Yes. Proven (B-1).** A student can file a flag that is already "moderated", attributed to any moderator. | `fn_flag_discussion_content` (SECDEF); staff only read flags | REVOKE INSERT |
| 4 | `study_plan_items` | INSERT / UPDATE / DELETE, all columns | `status`, `completed_at`, `priority_score`, `is_user_modified` | Own data only; no consumer today (the feature isn't built) | not used | REVOKE INSERT, UPDATE, DELETE (least privilege, #54) |
| 4 | `user_study_plans` | INSERT / UPDATE / DELETE, all columns | `completed_minutes`, `status` | Own data only; no consumer today | not used | REVOKE INSERT, UPDATE, DELETE |
| 5 | `user_question_bookmarks` | INSERT / UPDATE / DELETE, all columns | none (a trigger checks folder ownership; `source_attempt_id` is only a reference) | No | user client (`bookmark.service`) | keep |
| 5 | `user_bookmark_folders` | INSERT / UPDATE / DELETE, all columns | none | No | user client | keep |
| 5 | `user_exam_goals` | INSERT / UPDATE / DELETE, all columns | `is_active` (guard trigger: an open exam, the right cycle, at most 3 active goals) | No: the trigger enforces the rules | user client (`app/mock-tests/actions.ts`) | keep |
| 5 | `user_lesson_notes` | INSERT / UPDATE / DELETE, all columns | none | No | not used | keep (own notes) |
| 5 | `user_notification_preferences` | INSERT / UPDATE / DELETE, all columns | `marketing_enabled` (the student's own consent) | No | not used | keep (own preferences) |

`user_id` cannot be moved to another user on any of these tables: every write policy's `WITH CHECK` requires `auth.uid() = user_id` (or `author_id` / `reported_by_user_id`). `anon` has no write grant on any of them.

## Migration 100 (held)

- **File:** `supabase/migrations/20261025000100_grant_audit_client_writes.sql`.
- **Rollback:** `docs/database/rollback/100_rollback.sql`.
- **What it does:** changes grants only. It revokes the writes listed above from `anon` and `authenticated`. SELECT and every SECDEF RPC keep working. The dead client-write policies stay, and no grant reaches them.
- **Runner dry-run:** OK.
- **Smoke:** one transaction, rolled back, 13/13. B-1 and B-2 prove the gaps exist before 100. After 100:
  - all direct discussion writes are denied;
  - privileges are removed;
  - the kept tables are unchanged;
  - the RPCs `fn_create_discussion_thread`, `fn_vote_discussion_message` (ADD + REMOVE) and `fn_flag_discussion_content` work;
  - reads work;
  - the student's own bookmark insert works.
- **Live data affected:** none. All the revoked tables except `discussion_*` have 0 rows. `discussion_*` also has 0 rows today.

## Found on the way: COMMUNITY-REPLY-1 (pre-existing, not caused by 100)

`fn_post_discussion_message` fails for everyone with `23502`. Its "Phase 3C activity logging" inserts into `learning_activity_events` without `topic_id`, which is `NOT NULL`. So **no reply can be posted in the community today**. It fails identically before and after 100; smoke A-4 checks that 100 doesn't change this outcome. The proposed fix belongs in a separate change, either:

- skip the activity insert when there is no topic; or
- make the insert use the thread's topic, or no row when there is none.
