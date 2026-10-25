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

## FLASHCARD-REVIEW-1: DONE 2026-10-25 (107 + 108, with COINS-OFF-1)

Reviews and deck completions work again: the activity row follows the 101 pattern and the coin-reward inserts were removed (comment: "coin rewards: re-enable in F10 via the coin ledger"). Verified live: zero new REWARDED rows, and the 102 / 105 gates still deny.

## F10-COINS-INVENTORY: everything that awards or moves coins (for F10)

Read-only, 2026-10-25. **Existing data:** 10 REWARDED `gamification_events` rows, all `MOCK_TEST_COMPLETED`, worth 208 coins; `coin_ledger` has 11 rows and `coin_wallets` 6.

**Database functions** (client-callable unless marked service):
- `fn_award_gamification_reward` (service): events, ledger and wallets.
- `fn_claim_reward_item` and `fn_reverse_reward_claim` (service): ledger and wallets.
- `fn_record_qualifying_streak_activity` (service): wallets.
- `fn_resolve_errata_report` (service): awards a bounty through `fn_award_gamification_reward`.
- `fn_evaluate_descriptive_submission` and `fn_finalize_battle_room`: award through `fn_award_gamification_reward`.
- `fn_mark_accepted_answer` and `fn_vote_discussion_message` (5-upvote milestone): REWARDED events.
- `fn_submit_flashcard_review` and `fn_complete_deck_review_session`: rewards **removed by 107 / 108**.

**App code:**
- `services/assessment.service.ts`: the mock-completion gamification event, and the wallet read.
- `services/live-test-reward.service.ts`: ledger and wallet writes.
- `services/gamification.service.ts`.

## PAY-FULFIL-1 → F9 (DO NOT FIX before F9)

Architect ruling, 2026-10-25. `fn_verify_and_fulfill_payment` is rebuilt in F9 (Pricing + Razorpay) on the canonical `user_entitlements` schema (`starts_at`, `expires_at`, `is_active`), for one-time 3, 6 or 12-month plans with no auto-renew. Until then it stays service-role-only, unused and fail-closed (106 applied).

Two 106 checks were SKIPPED and move into F9: "valid → PAID once, replay → no double fulfil" and "the same payment id on another order → rejected".

## CUSTOM-PRACTICE-1: redesign custom practice on the practice engine

Architect ruling, 2026-10-25. Custom practice must use the practice engine and never exam attempts. `fn_start_custom_practice_session` inserts `test_attempts` without `mock_test_id`, so it always fails today. Nothing calls it: no app code and no database function. Client EXECUTE has been revoked since 090 (SECDEF-S2-2): only `service_role` and the owner can run it. So the planned migration 110 would have been a no-op and was not created.

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
