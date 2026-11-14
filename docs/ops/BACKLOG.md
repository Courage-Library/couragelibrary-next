# Backlog — logged items awaiting a phase

Each item has an owner condition. It is not started until the architect schedules it.

## MAP-EXAM-1: explicit exam links for the 12 unlinked published CGL questions

**Status:** logged by the architect, 2026-10-27 (content-health ruling).

**Why:** content health counts a question for an exam only via an exam mapping, its past-paper source, or membership in the exam's mock tests. 12 of the 112 published SSC CGL questions have none of these. The DB has 0 `exam_question_mappings`.

**How (a separate data step, later):**
1. List the 12 questions.
2. The owner confirms each question's exam.
3. A reviewed, audited insert into `exam_question_mappings` (backup → dry-run → apply), then content health shows them.

## LEGACY-60: the 60 answered legacy practice questions (CONTENT-SOURCE-1 S2)

**Status:** logged by the architect, 2026-10-27 (skipped by CONTENT-IMPORT-1).

**Why held:** they have answers but no explanations. `fn_import_question_drafts` (and gate 1) require an explanation of at least 40 characters, so they cannot enter as "empty + flagged". They also live inline in legacy HTML pages and need a parser.

**Options:**
- **(a)** we write the explanations, then use the normal import path;
- **(b)** a migration that allows an empty explanation for DRAFT only (publish would still require one).

## TAXONOMY-HINDI-1: a Hindi subject for SSC GD (240 rows)

**Status:** logged by the architect, 2026-10-27.

**Why:** `Hindi.csv` (the SSC GD Hindi-language paper) cannot map. The canonical taxonomy has no Hindi subject, and its grammar topics are not the English ones.

**How:**
1. The owner / syllabus work creates the subject and its topics (taxonomy service; never by the importer).
2. Add exact names to `scripts/content/content-import-1.topic-map.json`.
3. Re-run CONTENT-IMPORT-1: it is idempotent, so only the new rows are imported.

## MAP-REVIEW-1: owner confirms topics for 158 unmapped rows

**Status:** logged by the architect, 2026-10-27.

**What:** `docs/content/MAP_REVIEW_1.csv` (from `scripts/content/map-review-1.cjs`) lists, per row ref:
- up to 3 suggested canonical topics (under the row's subject);
- the reason;
- an empty `owner_decision` column.

**Rule:** nothing is auto-mapped. Confirmed decisions become topic-map entries, then a re-run. A decision to "reject" (for example the stale 2025 Current Affairs rows) is also allowed.

## BILINGUAL-1: one current published version per language (design only)

**Status:** design in `docs/content/BILINGUAL_1_DESIGN.md`, 2026-10-27. No migration until the architect's go.

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

## GRANT-AUDIT-1: table-level client write grants — DONE 2026-10-25 (migration 100)

**Done:** the architect gave the GO on 2026-10-25; migration 100 is on main and the ledger says APPLIED 2026-10-25 (checked 2026-11-11).

Original entry:

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

## PAY-FULFIL-1 → F9 — SUPERSEDED by F9-B (migrations 113 + 114, APPLIED 2026-10-26)

**Now:** `fn_fulfil_pro_order` (114) is the one fulfil path for the client verify and the webhook. It is idempotent on the payment id, rejects a payment id used for another order, and is service-role only. The two checks skipped in 106 (replay → no double fulfil; same payment id on another order → rejected) are the F9-B gates `scripts/test_f9b_payments.cjs` and `scripts/live/test_f9_pricing.cjs`. **Still open:** the legacy `fn_verify_and_fulfill_payment` and `fn_process_payment_webhook` still exist in the DB (service-role only, fail closed, no app caller). Retiring them needs a migration and a GO.

Original entry:

Architect ruling, 2026-10-25. `fn_verify_and_fulfill_payment` is rebuilt in F9 (Pricing + Razorpay) on the canonical `user_entitlements` schema (`starts_at`, `expires_at`, `is_active`), for one-time 3, 6 or 12-month plans with no auto-renew. Until then it stays service-role-only, unused and fail-closed (106 applied).

Two 106 checks were SKIPPED and move into F9: "valid → PAID once, replay → no double fulfil" and "the same payment id on another order → rejected".

## CUSTOM-PRACTICE-1: redesign custom practice on the practice engine

Architect ruling, 2026-10-25. Custom practice must use the practice engine and never exam attempts. `fn_start_custom_practice_session` inserts `test_attempts` without `mock_test_id`, so it always fails today. Nothing calls it: no app code and no database function. Client EXECUTE has been revoked since 090 (SECDEF-S2-2): only `service_role` and the owner can run it. So the planned migration 110 would have been a no-op and was not created.

## TOPIC-CONTEXT-1: CLOSED — not a bug (2026-10-25)

**Note (2026-11-11):** the `held-104` branch no longer exists, locally or on origin. 104 is not on main and not in the ledger. If `public.topics` is retired, write the validation again as a new migration.

Original entry:

Logged in error while testing 101. `public.topics` is a live table that mirrors the 36 canonical `TOPIC` nodes (same ids), so `fn_create_discussion_thread('TOPIC', …)` already works. The 104 smoke proved it, B-1. Migration 104 (validate against `canonical_taxonomy_nodes` directly) is on branch `held-104` and NOT applied. Apply it only if `public.topics` is retired later.

## NULL-BYPASS-2: deny branches a NULL can skip — DONE 2026-10-25 (migration 105)

**Done:** the architect gave the GO; migration 105 is on main and the ledger says APPLIED 2026-10-25 (checked 2026-11-11). The payment functions named below were handled by 106 (fail closed) and F9-B (see PAY-FULFIL-1).

Original entry:

Report: `docs/reports/security/NULL_BYPASS_2.md`. Migration 105 is on branch `held-105`: chunked smoke 10/10, dry-run OK, NOT applied, needs the architect's go.
- `fn_submit_battle_round_answer`: an answer is accepted before the round has a start time, with latency 0. Proven, rolled back.
- `fn_submit_flashcard_review`: an author-less private deck can be reviewed by anyone. Proven, rolled back.

Payment functions with the same pattern (`fn_process_payment_webhook`, `fn_verify_and_fulfill_payment`) are listed for a separate payments ruling.

## DOMAIN-CUTOVER-1: couragelibrary.in still serves the legacy site

Logged by the architect (2026-10-25). `couragelibrary.in` / `www.couragelibrary.in` still serve the legacy site; the new app is only on `couragelibrary-next.vercel.app` (the email images are at `/email/*.png` there). After the cutover: optionally point the email image base to `couragelibrary.in/email/`, and update the Supabase Site URL / redirect URLs. Do not touch DNS or the legacy project from this repo.

**After-cutover check (architect, 2026-10-26):** the live auth emails load `https://couragelibrary.in/email/{banner,strip-main,strip-cnts}.png`. Verify that each returns **200 `image/png`** and matches `public/email/*.png` (sha256). On 2026-10-26 all three returned 307 → `www.couragelibrary.in` → **404** (`text/plain`), so the emails currently show alt text instead of images. The same files ARE served by `couragelibrary-next.vercel.app/email/` (sha256 equal, the cyan v3 CNTS tile).

## STUDENT-DASH-1: new-student dashboard

Logged by the architect (2026-10-26). A brand-new student sees empty cards on `/dashboard`. Replace them with first-step guidance (pick an exam → take the first free mock → see the Mistake Vault fill up). It must use real state only (R12), with one primary per screen (R4).

## F5-DRILLS-MANUAL: manual Memory Lock items in drills

Once 095 is live, `fn_generate_mistake_drill` may pick manual Memory Lock items, which have 0 mistakes. The app-side lists already filter `total_mistakes_count >= 1`; the SQL generator needs the same filter.

## BUILD-FONT-1: `next build` intermittently crashes in next/font/google — DONE (HOME-1, 15d7773)

**Done:** fonts are self-hosted in `app/fonts/` (woff2 subsets, OFL, `NOTICE.md`) and loaded with `next/font/local` in `app/layout.tsx`. No file under `app/`, `components/` or `lib/` imports `next/font/google`, so the build makes no font network call. Verified 2026-11-11.

Original entry:

**Status:** logged 2026-11-01. Seen twice in about 12 CI builds: dispatch 41220647346 (live-journeys BUILD) and push 41233958370 (server-checks SC-BUILD). The same commits built fine in the other jobs.

**Evidence** (the sanitized build-log artifact): `app/layout.tsx — An error occurred in next/font: TypeError: Cannot read properties of null (reading '1') at next/dist/compiled/@next/font/dist/google/loader.js:122`, while loading `Noto_Sans_Devanagari`. At build time Next fetches the Google Fonts CSS. When Google answers with something unexpected (rate limit, a different CSS shape), the loader's regex finds no match and the build crashes. This is a network dependency in every build since BRAND-2, unrelated to the change being built.

**Proposal (needs a GO; it touches the BRAND-2 font setup):** self-host the fonts with `next/font/local`. The woff2 subsets go in the repo (Noto fonts are OFL), with the same CSS variables and `display: swap`. The build then makes no network call for fonts. BRAND2-PROBE budgets and LCP must be re-measured.

## ACTION-CATCH-1: admin screens await Server Actions in transitions without a catch

**Status:** logged 2026-10-31 (LOGO-P0b audit, docs/ops/LOGO_P0.md). Upload forms are fixed; the rest are not.

**Why:** an action call that throws (network, 413, server error) inside `startTransition` reaches the admin error boundary and the whole page shows "This page could not be loaded" — the LOGO-P0 failure mode.

**How (later):** a shared `safeAction()` client helper (the `guarded()` pattern of `components/admin/logos/logo-drawer.tsx`), adopted screen by screen, plus an offline gate that flags an unwrapped `await …Action(` inside `start(`.

## STORAGE-SVG-1: the store-rewards bucket accepts SVG

**Status:** logged by the architect, 2026-10-30 (EXAM-LOGO-1 ruling 6). Do not touch until scheduled.

**Why:** `storage.buckets.store-rewards` is public and its `allowed_mime_types` include `image/svg+xml`. An SVG served from a public bucket can carry script. The new `org-logos` bucket allows only `image/webp`, and every logo is re-encoded on upload (`lib/logos/logo-image.ts`).

**How (later):**
1. List the SVG objects in the bucket.
2. Re-encode them to PNG / WebP (or replace them).
3. A migration drops `image/svg+xml` from the bucket's allowed types.
4. Reuse the EXAM-LOGO-1 sniff-and-re-encode path for reward-image uploads (`app/admin/rewards/actions.ts`).

## CRLF-1 — line-ending normalisation (`.gitattributes`) — DONE 2026-10-26
**Done (architect GO 2026-10-26).**
- `.gitattributes`: `* text=auto eol=lf`, binary rules, `*.cmd` / `*.bat` / `*.ps1` CRLF; DRILL-1 SQL rules kept.
- `git add --renormalize .`: no index change (the index was already LF).
- 289 working-copy files rewritten CRLF → LF by script (blob hashes = index; content diff with `--ignore-all-space --ignore-cr-at-eol` empty); no checkout / reset / stash.
- The full offline list is now green locally, F2 T-09 and CI-SUPPORT C-10 / C-15 included. The "known local-only CRLF failure" exception is retired: a local failure of those gates is now a real failure.

## Also open

- **STAFF-REPORTS-1:** staff view of question reports.
- **ADMIN-CYCLE-1:** admin creation of exam cycles.
- **Pre-exam screen:** 11 px copy (F3 P2).

## PAY-LEGACY-RETIRE-1: retire the old payment functions (PAY-FULFIL-1 remnants) — REQUIRED before F9 (payments)

Logged 2026-11-11 (owner). `fn_verify_and_fulfill_payment` and `fn_process_payment_webhook` still exist in the DB.
F9-B (113 / 114) replaced them with `fn_fulfil_pro_order`, the one fulfil path. They are service-role only, fail closed
(106) and have no app caller. **Owner condition:** before payments go live (F9), drop them in a migration (backup →
dry-run → apply, with a rollback), after a grep shows no caller in the app, the scripts or other database functions.
Lower the SECDEF allow-list in the same change. Gate: the functions are absent, and the F9-B payment gates still pass.

## PRO-LOCK-SQL-1: the Pro lock inside the lesson evidence RPCs — REQUIRED before F9 (payments)

The COURSE-UX-1 RPCs `fn_lesson_quick_check_answer` and `fn_lesson_complete` (136 / 137) do not re-check the Pro
lock. The paywall switch is the app env `PAYMENTS_ENABLED`, which SQL cannot see. While payments are off nothing is
gated, so this is harmless. **Owner condition:** before payments go live (F9), add a database-side paywall switch and
refuse a locked lesson's quick checks and completion (and so its coins) for a student without Pro. Gate: real-role
negative controls. Source: architect audit of COURSE-UX-1 phase B, 2026-11-03.

## FLAGS-LIVE-FLAKE-1: FLAGS-LIVE fails intermittently in CI (FL-1 / FL-2)

**Status:** logged by the owner, 2026-11-14 (SPEED-RULES-1: a flaky non-security gate does not block; fix separately).
Does not block a release.

**Evidence:** FL-2 (profile) failed in scheduled run 43538726425 (main 3352fbd); FL-1 (Memory Lock) failed in live
dispatch 43585885477 (main 4cae8d1). The push and dispatch runs on 3352fbd passed, and every local run (3, gate alone)
passed 5/5. `run-quiet` prints only the failing check id, so CI shows no reason.

**Hypothesis (not proven):** FL-1 and FL-2 write rows of the SHARED QA student (`user_mistake_vault`, `user_profiles`)
inside `safeBegin` (lock_timeout 3 s). In CI, the live-journeys job (and other gates) run at the same time with the same
QA student, so a held row lock times FLAGS-LIVE out. Locally nothing runs alongside.

**Fix (owner):** a separate QA user per CI job, or serialize FLAGS-LIVE after the journeys. First make every FL-* assert
report the returned / error code, so a CI failure shows why.

## P06-STABILITY: the BRAND2 P-06 front-end budget runs at its LCP limit

**Status:** logged by the owner, 2026-11-14.

**Why:** P-06 (`scripts/test_brand2.cjs`: "/" cold, Moto-G-class emulation, LCP ≤ 2.5 s, CLS ≤ 0.1, transfer ≤ 500 KB;
also on one lesson route via PERF-LESSON-1) has little margin. In local measurements main was about 2.37 s, and the
font experiments of the L-13 work came in at 2.51–2.77 s (2026-11-12/13). Small changes or a noisy runner can push
it over the limit.

**How:** measure the median and spread over several cold runs on CI and locally; then either win back margin on "/"
(LCP element, fonts, transfer) or make the measurement more robust (more runs, median / percentile). Do not just raise
the limit. Details to confirm with the owner.

## D-FULL: prevent (not only detect) a leftover schema-dump session

**Status:** logged by the owner, 2026-11-14 (possible future phase of BACKUP-RESILIENCE-1; not planned).

**Why:** `pg_dump` resets its own statement / lock / idle-in-transaction / transaction timeouts to 0, so its session
cannot be limited. Since D-detect (d519d1e), the backup FAILS when a session of the backup role is still in a
transaction started during the schema dump (xact_start window), and prints a pid-specific terminate statement for the
owner. Nothing ends such a session automatically.

**How (options):** a schema dump that does not run through `pg_dump`'s own session settings (e.g. a catalog-based dump
in short, limited transactions), or a server-side guard for the backup role. See `docs/database/MIGRATION_RUNBOOK.md`
§1.
