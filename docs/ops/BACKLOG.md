# Backlog — logged items awaiting a phase

Each item has an owner condition. It is not started until the architect schedules it.

## RETIRE-SRS-1: retire `spaced_repetition_schedules`

**Status:** logged by architect ruling (b), 2026-10-25.

**Why:** the table is a dormant SM-2 schedule store with 0 rows and no app reader or writer. Memory Lock (F5, migration 095) schedules on the canonical `user_mistake_vault` instead, so the old table is a parallel store that nothing uses.

**When:** only after Memory Lock has been stable in production for 2 weeks.

**How:**
1. Write a migration with a rollback, and dry-run it.
2. Take a resilient backup.
3. Confirm the table still has 0 rows.
4. Drop the table and `fn_update_spaced_repetition_review`.
5. Lower the SECDEF allow-list max in the same change.

## LANG-VERSIONS-1: language versions for learning documents

`document_versions` has no language column, so articles are single-language. Following the student's content-language preference (R9) for articles needs a schema change.

## PLAYER-RESUME-SERVER: resume position on any device — DONE 2026-10-25

Done by migration 099 + Q6 part B: `test_attempts.last_question_order` / `visited_orders` hold the position; the player restores it from the server and keeps localStorage as a cache only.

## MFA-DB-2: admin MFA in every staff policy and function — DONE 2026-10-25 (migration 102, with the NULL-BYPASS-1 fix)

Logged by the architect (2026-10-25). 098 makes `fn_jwt_is_admin_or_staff()` require AAL2 when the flag is on, but 43 inline RLS policies and 15 functions check the staff / admin role without it. Each must use the AAL2-aware helper (or an equivalent check) before launch.

## GRANT-AUDIT-1: table-level client write grants (inspect + report; fixes held as 100)

Found with ATTEMPT-INTEGRITY-1 (099): a table-level INSERT / UPDATE grant to `authenticated` overrides column revokes. Thirteen more tables have table-level client write grants plus client write policies: learning_activity_events, custom_practice_sessions, discussion_threads / discussion_messages / discussion_votes / discussion_moderation_flags, study_plan_items, user_study_plans, user_bookmark_folders, user_question_bookmarks, user_exam_goals, user_lesson_notes, user_notification_preferences. Report: docs/reports/security/GRANT_AUDIT_1.md. Fix: migration 100 (held, dry-run + smoke 13/13 rolled back), applied only on the architect's go.

## COMMUNITY-REPLY-1: community replies always fail — DONE 2026-10-25 (migration 101)

`fn_post_discussion_message` now takes the activity row's topic from the thread (no topic → no row), uses an allowed event type with `metadata.kind = COMMUNITY_DOUBT_ANSWERED`, and can never fail a reply because of analytics.

## FLASHCARD-REVIEW-1: every flashcard review fails (pre-existing)

Found by the 102 smoke (2026-10-25). Once its access checks pass, `fn_submit_flashcard_review` inserts into `learning_activity_events` without `topic_id` (NOT NULL), so every review fails with 23502. This is the same defect class as COMMUNITY-REPLY-1. Fix the same way (function-only): take the topic from the deck, skip the activity row when there is none, and never fail the review because of analytics.

## TOPIC-CONTEXT-1: CLOSED — not a bug (2026-10-25)

Logged in error while testing 101. `public.topics` is a live table that mirrors the 36 canonical `TOPIC` nodes (same ids), so `fn_create_discussion_thread('TOPIC', …)` already works. The 104 smoke proved it, B-1. Migration 104 (validate against `canonical_taxonomy_nodes` directly) is on branch `held-104` and NOT applied. Apply it only if `public.topics` is retired later.

## NULL-BYPASS-2: deny branches a NULL can skip (fixes held as 105)

Report: `docs/reports/security/NULL_BYPASS_2.md`. Migration 105 is on branch `held-105`: chunked smoke 10/10, dry-run OK, NOT applied, needs the architect's go.
- `fn_submit_battle_round_answer`: an answer is accepted before the round has a start time, with latency 0. Proven, rolled back.
- `fn_submit_flashcard_review`: an author-less private deck can be reviewed by anyone. Proven, rolled back.

Payment functions with the same pattern (`fn_process_payment_webhook`, `fn_verify_and_fulfill_payment`) are listed for a separate payments ruling.

## DOMAIN-CUTOVER-1: couragelibrary.in still serves the legacy site

Logged by the architect (2026-10-25). `couragelibrary.in` / `www.couragelibrary.in` still serve the legacy site; the new app is only on `couragelibrary-next.vercel.app` (the email images are at `/email/*.png` there). After the cutover: optionally point the email image base to `couragelibrary.in/email/`, and update the Supabase Site URL / redirect URLs. Do not touch DNS or the legacy project from this repo.

## F5-DRILLS-MANUAL: manual Memory Lock items in drills

Once 095 is live, `fn_generate_mistake_drill` may pick manual Memory Lock items, which have 0 mistakes. The app-side lists already filter `total_mistakes_count >= 1`; the SQL generator needs the same filter.

## CRLF-1 — line-ending normalisation (`.gitattributes`)
Logged by the architect (2026-10-25). The repository is LF in git but this Windows checkout uses `core.autocrlf=true`,
so working copies are CRLF and several offline gates that read files with `
` fail locally only (C-10, F2 T-09) and
branch switches abort on EOL-only "changes". Fix: add `.gitattributes` (`* text=auto eol=lf`, binary types marked),
renormalise in ONE separate commit, re-run every offline gate. Not now — a separate change later.

## Also open

- **STAFF-REPORTS-1:** staff view of question reports.
- **ADMIN-CYCLE-1:** admin creation of exam cycles.
- **Pre-exam screen:** 11 px copy (F3 P2).
