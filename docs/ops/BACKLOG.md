# Backlog — logged items awaiting a phase

Each item has an owner condition. It is not started until the architect schedules it.

## DEPLOY-GATE-1 (TOP PRIORITY): production must not update until CI passes

**Status:** logged in FOOTER-1, 2026-11-23 (owner). Report only — no change in that phase.

**Why:** today every push to `main` deploys to production on Vercel at once, in parallel with the CI push run. In
FOOTER-1 the push runs 45076387392 and 45078679939 failed (server-checks: BRAND2 P-01, AUTH1 R-6) while commits
`0529197` and `3db0ace` were already live. A red CI run must never mean a changed production site.

**Options to investigate (pick one, then gate it):**
1. **Vercel Deployment Checks** (project setting): mark the GitHub `ci-gates` checks (offline, server-checks, …) as
   required, so a production deployment is built but **not promoted** until they pass. Confirm the plan supports it and
   that prod-smoke (which today runs against production) is moved to the preview / or runs after promotion.
2. **Promote after CI:** turn off auto-assignment of the production domain for `main` (deploy to a preview URL), and
   let a final CI job promote that exact deployment (`vercel promote <deployment>` with a scoped token as a repo secret)
   only when every required job is green; prod-smoke then runs on the promoted site.
3. **Branch protection + merge queue:** work lands on `main` only through a PR whose required checks passed (the local-
   first flow pushes `HEAD:main` today — it would push to a branch and merge after green).

**Done when:** a deliberately red push leaves production on the previous deployment (proved once, with a gate or a
documented dry run), and RELEASE_RUNBOOK.md describes the new order: push → CI green → promote → prod-smoke.

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
2026-11-19: FL-2 failed again in live dispatch 44473227775 (main d54da39, PAY-1 B7; the only failing gate of the run).
Two local runs of the gate alone, against a production build of d54da39, passed 5/5. B7 released under SPEED-RULES-1.
Note: FL-2 writes `user_profiles` of the QA student, the same row the live-journeys job's pricing / payment gates touch
(adult confirmation), which supports the row-lock hypothesis.

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

## SEO-CANONICAL-1: /practice and /mock-tests canonicalise to the homepage

**Found 2026-11-15 (PAY-1 B2b part 2, read anonymously on production):** both pages are listed in the sitemap but their
`<link rel="canonical">` points to `/` (the site default), so search engines are told to index the homepage instead.
`/current-affairs` is self-canonical. Pre-existing; not changed by PAY-1 (owner rule: canonicals unchanged). The
anonymous smoke pins the current values (`scripts/smoke/anonymous-smoke.cjs`, PAY-1 block).

**How:** give both pages self-canonical metadata (`alternates.canonical`), then update the pinned values in the smoke.
Owner decision.

**Status: DONE 2026-11-15** (owner decision: self-canonical, kept in the sitemap). `constructMetadata({ canonicalUrl })` on
both pages; titles / descriptions unchanged; the anonymous smoke pins the self-canonicals.

## DESCRIPTIVE-LAUNCH-REVIEW: descriptive answers / guidelines exposure before the descriptive launch

**Owner, 2026-11-15 (PAY-1 B2b):** must be reviewed before descriptive writing launches. Today there is no exposure:
`descriptive_questions.model_answer_md` and `evaluation_guidelines_md` have no column grant for anon / authenticated,
and the table has 0 rows (read-only check on production, rolled back; PAY_1_DESIGN.md §9).

**Risk:** `services/descriptive.service.ts` selects `*` through the session client and always returns
`evaluation_guidelines_md` (`:205-206`). With the current grants that read fails. If a grant were ever added, the
guidelines (and any model answer) would reach students.

**How:** select explicit columns only; serve model answers / guidelines from the server after submission, behind
`canAccess` (Pro descriptive per the access policy); a gate that anon / the free student cannot read either column.

## ADMIN-KPI-COUNTS-1: two admin overview counts fail for staff (descriptive questions, institutes)

**Found 2026-11-15 by the PAY-1 146 statement replay (`scripts/live/test_pay1_revoke.cjs`, R-S):** as the QA admin, the
session reads `descriptive_questions` (`services/admin.service.ts:269`, `:1514`) and `institutes` (`:270`, `:1535`) are
refused (42501), with and without 146 — pre-existing, not caused by PAY-1. The admin overview KPI for those two counts
cannot show a number.

**How:** count them on the server (service role, read-only head count) or grant staff a count-only path; then drop the
two "pre-existing" lines from the replay report. Owner decision.

## CA1-FLAKE-1: CA1-TAXONOMY-LIVE failed once in CI (non-security, SPEED-RULES-1)

**Evidence:** run 43703568734 (main b19d71c, db shard) — CA1-TAXONOMY-LIVE FAIL, 1 fail line [CA1], 175 s. It passed in
run 43695445740 (same database state, 146 applied) and passes locally against production (2026-11-15). Not caused by
PAY-1 (the gate does not read the revoked tables). Does not block (non-security, intermittent).

**How:** reproduce with the failing check's detail (run-quiet withholds it; `--keep-log` on the next dispatch), then fix.

## CI-DB-SHARD-BUDGET: the db shard runs at its 40-minute limit

**Evidence:** run 43695445740 — cancelled at 40 min (PAY1-REVOKE-LIVE then moved to the security shard); run 43703568734
— finished in 39 min 45 s. Any new gate in that shard will cancel it again.

**How:** raise the shard's timeout or split it (a second db shard), keeping the order rules; owner / architect decision.

**Status: DONE 2026-11-15** (owner: move the lock-free gates + raise the cap). A balanced split needs CI-SPEED-1 phase 2
(docs/ops/CI_SPEED_1.md): the group writers share the QA exam's keys. Done instead: a new parallel `dbfree` shard with the 7
gates that write none of the group and never touch the QA exam row (≈ 6.5 min of 10), and the db shard's cap 40 → 52
(≈ 35.4 min, 68%). C-15 / C-19 updated, with a negative control for the QA-exam-row rule. The real split stays CI-SPEED-1
phase 2.

**CA1-FLAKE-1 update 2026-11-15: NOT a flake — root cause found.** CA1 failed in runs 43703568734 and 43711413328, both
after PAY1-REVOKE-LIVE moved to the parallel security shard (it passed in 43695445740, before the move). In verify mode the
revoke replay ran 146's rollback (GRANT / DROP + CREATE POLICY) and the R-V variant inside its transaction; a rolled-back
DDL keeps its lock until the transaction ends, so `attempt_answers` / `mock_sections` and the four content tables stayed
locked for ~3 min while parallel gates ran (CA1 aborted 58 s after the replay started). It would also stall real answer
saves. Fix: the replay runs DDL only with `--pre` / `--local`; verify mode uses the registered pre-existing refusals;
offline P3-15 (`scripts/test_pay1_b2b.cjs`) enforces it with negative controls.

## UX2A-TIMECAP-1: UX2A-LIVE hit its time cap once in the nightly run (non-security, SPEED-RULES-1)

**Evidence:** scheduled run 43781066650 (main d5debc8, 2026-11-16 06:03 IST, pages shard) — UX2A-LIVE exit 124 at its
240 s cap, 15 lines passed, 0 FAIL lines; every other job and shard green. It passed in dispatch 43720683127 (same code).
Time-cap flake: does not block.

**How:** if it recurs, compare its duration across runs (`--keep-log` is already on) and either raise its cap with the
measured time or split its page loop. The script contains the support e-mail, so the privacy hook refuses running or
reading it locally — investigate from CI or let the owner run it.

**Update 2026-11-18: not a flake. The run time has been creeping up.**
- **Run times:** in the last 15 dispatch and nightly runs, UX2A took 184–238 s when it passed, against its 240 s cap. 4 runs hit the cap: 43658756693, 43695445740, 43781066650 and 44168099476.
- **Logs:** the kept logs (CI artifact `gate-logs-*-pages`) have no per-check times. The capped runs stopped at different checks (after L-10, after L-12), so no single check hangs.
- **Local timing of the L-17 loop** (every sitemap URL, one after another, local build against production over the hotspot): 41 of the 73 URLs are exam-topic pages, and they take about 70% of the time (EXAM-TOPIC-PERF).

**Fix (ours, no cap raise):**
- L-17 fetches 4 URLs at a time, with the same checks per URL. Warm, locally: 377 s sequential against 97 s.
- Every UX2A result line now shows its own time and the gate's elapsed time, so a capped run shows where it stopped.

## FLASHCARDS-READ-1: the flashcard pages read tables students cannot read; a refused read shows an empty library

**Priority:** before the first deck is published. Today nobody sees it: production has 0 decks (2026-11-18, read-only).

**Evidence (read-only, production, 2026-11-18):**
- `flashcard_decks`, `flashcards`, `user_deck_progress` and `user_flashcard_reviews`: no SELECT grant for `authenticated` or `anon`, so their RLS read policies never apply.
- The library query run as a student or as anon is refused with 42501.
- `FlashcardService.getFlashcardDecks` (session client) treats the refused read as `[]`, so the library says "no decks" instead of failing. The deck page reads `flashcard_decks` the same way.
- B3 did not cause this. Card reviews go through `fn_submit_flashcard_review` (DEFINER, central check) and are unaffected.

**How:**
- Read decks, cards and progress server-side with the service role, gated by `canAccess('FEATURE','FLASHCARDS')`. Published rows only; progress is the viewer's own rows by `auth.uid()`.
- A refused or failed read shows an error state, never an empty list.
- Gate: a student sees a published FREE deck and its cards. With the switch on and FLASHCARDS PRO, a free student is refused beyond card 3. A read failure renders the error, not an empty library.

## LESSON-PERF-B3: B3 added one access round trip to every lesson page (P-06 lesson budget fails)

**Evidence:** dispatch 44168099476, LESSON-PERF (P-06, `/learn/…` QA lesson) failed on the first run with the B3 app.
It passed the night before (44009378598) on the pre-B3 app with 147 already applied.

Local A/B, 2026-11-18: the pre-B3 build (d5debc8) and the B3 build side by side against production, measured alternately on the same lesson, anonymous.

| Run | TTFB pre-B3 (median, n=15) | TTFB B3 (median, n=15) | P-06 LCP pre-B3 (median, n=4) | P-06 LCP B3 (median, n=4) |
|---|---|---|---|---|
| 1 | 140 ms | 517 ms | 1.81 s | 2.16 s (1 FAIL) |
| 2: B3 with `accessMany` in parallel with the page's reads | 57 ms | 463 ms | 1.36 s | 5.41 s (4 FAIL; hotspot noise) |
| 3: B3 with the cached anonymous answer (n=6 for P-06) | 48 ms | 47 ms | 1.25 s | 1.69 s (6/6 PASS; ranges overlap, 0.89–1.94 s against 0.94–1.71 s) |

**Cause:** with the lesson data cached, the pre-B3 page made no network call for an anonymous visitor. Access came from an env switch plus a session check with no I/O. B3 asks the central check (`fn_access_allowed_many`), which is one database round trip on every request. Running it in parallel (committed: the page now starts its session, practice and course reads next to the check) cannot hide it, because the other reads cost almost nothing.

**DONE 2026-11-18: the owner chose to cache the anonymous answer, with these conditions:**
- **What is cached:** only the access decision, only for a request with no `sb-*` cookie. The key is the lesson keys plus the paywall switch. The lesson body is never cached, and nothing is cached for a signed-in reader.
- **Same rule:** the cached answer comes from `fn_access_allowed_many`, called without a user, so it is exactly the live answer an anonymous visitor would get.
- **Invalidation:** every admin policy or switch action calls `revalidateTag(ACCESS_CACHE_TAG)`. Writes outside the app are covered by a 60 s fallback.
- **Fail-closed:** an error is never cached and falls back to the live check.
- **Code:** `lib/access/policy.ts` (`anonLessonAccess`).
- **Offline gate:** PAY1-B3 P4-08, with 8 negative controls.
- **Live gate:** LESSON-PERF-B3-LIVE (dbfree). It proves:
  - an admin flip reaches anonymous visitors on the next request;
  - a write outside the app leaves the anonymous answer cached while the signed-in student sees the change at once;
  - nothing is left behind.

  It runs only while the paywall is off, on the QA test lesson.
- **Not proven on production:** the "locks for anonymous" case itself, because it needs the switch on. The lock comes from the same database answer (`allowed`), which B3-M checks against the live rule with the switch on and off.

The budget was not raised.

## EXAM-TOPIC-PERF: exam-topic pages render slowly

**Evidence (local, 2026-11-18, UX2A-TIMECAP-1 analysis):**
- The sitemap has 73 URLs; 41 are `/exams/<exam>/<topic>` pages.
- Those 41 pages took about 70% of a sequential fetch of every sitemap URL: about 10 s each on a cold build, about 8 s each warm (hotspot).
- `/learn/…` pages warm average 1.4 s.

They are the bulk of UX2A L-17's time.

**How:** measure the exam-topic page's reads (`exam-topic.service`) and cache or batch them. The gate side is fixed: L-17 now fetches 4 URLs at a time.

## EMAIL-KYC-1: switch on the PAY-1 B5 transactional e-mail (owner setup)

**Status:** logged by the owner, 2026-11-19. Deferred until after launch. **Deadline: within 4 weeks of launch**, before
the first D7 expiry reminder can be due (the shortest plan is 3 months, so this leaves a safe margin).

**Until then:** Razorpay's own payment confirmation is the customer's receipt. The receipt is also listed in
Account → Billing. B5 code is deployed (migration 150, 2026-11-18) and stays off, so nothing is sent.

**Owner steps, in this order (DEPLOY-BEFORE-ACTIVATE):**
1. **ZeptoMail:** complete the account KYC / verification. Check that DKIM and the bounce record show "Verified" on
   `couragelibrary.in`, and send the DKIM record's name so it can be checked read-only.
2. **ZeptoMail:** create a new "app-mail" mail agent with its own Send Mail token (owner E2; the auth e-mails keep their
   own agent).
3. **Zoho:** create the `qa@couragelibrary.in` alias (owner E1: QA-account and test-mode e-mails go there).
4. **Vercel (production):** set `ZEPTOMAIL_TOKEN` (the app-mail token), then `EMAIL_APP_ENABLED=true`.
5. **GitHub:** the repository **variable** `EMAILS_URL=https://couragelibrary.in/api/cron/emails` exists since
   DOMAIN-CUTOVER-2 (the workflow refuses any other value). `CRON_SECRET` is shared with the reconcile job. Set the
   repository variable `PAYMENTS_EMAILS_ENABLED=true`.

**Check after step 5:** run the `payments-emails` workflow once by hand. It must answer 200 with counts only. A QA
purchase in test mode must deliver one receipt to the QA inbox.

**Related:** EMAIL-DNS-FIX-1 (SPF `+all`, the `0 mx.couragelibrary.in` record) should be done before launch.
See PAY_1_DESIGN.md §13.

## SMOKE-MOCK-LINK-1: the anonymous smoke never checks a mock-test page

**Status:** logged in DOMAIN-CUTOVER-2, 2026-11-22. One of the 3 prod-smoke warnings (same 3 before the cutover:
push runs 44943743707, 44949725266; run 44959814213 on the apex).

**Warning:** `VACUOUS: no mock link on /mock-tests — /mock-tests/[id] not checked`.

**Cause:** a smoke matcher, not the site. For an anonymous visitor `/mock-tests` links each mock as
`/auth/login?next=/mock-tests/<id>/take`; the smoke looks only for a bare `href="/mock-tests/<uuid>"`. The detail page
`/mock-tests/<id>` answers 200 on the apex.

**How:** take the id from either link form (bare or the `next=` target), then check `/mock-tests/<id>` (200, renders,
self-canonical). Add a negative control. Not a release blocker.

## SITEMAP-CA-1: published current-affairs articles and date pages are missing from the sitemap

**Status:** logged in DOMAIN-CUTOVER-2, 2026-11-22. Two of the 3 prod-smoke warnings (pre-existing, see
SMOKE-MOCK-LINK-1).

**Warnings:** `VACUOUS: no current-affairs article in the sitemap` and `… no current-affairs date page in the sitemap`.

**CLOSED 2026-11-22 (SITEMAP-CA-1 phase).** The first guess above was wrong. **Root cause:** production holds **no Current
Affairs article in any status** (all 7 CA tables have 0 rows, read-only count, ref-locked). The sitemap read was correct
and simply empty. The `/current-affairs` "Recent days" strip is a fixed calendar (`pastDays`), not content: its date
pages answer 200 with "Nothing published for <date>". CA-7.4's 3 production DRAFTs (plus one mixed-batch test article)
were deleted by that suite's own Group 8 cleanup by design (its report: baseline 0 → peak 4 → restored 0).

**Done anyway (hardening):** CA URLs built by a pure function (`lib/seo/ca-sitemap.ts`) that re-checks the isolation
rule (PUBLISHED + pointer + published version); lastmod from the published version; date and month pages only for days
with such an article; a 40,000-article cap; every sitemap read logs one structured warning on error (source + code
only) and the rest still renders; the swallowed `catch (error)` now logs (LINT-SITEMAP-1 closed). Gate
`scripts/test_sitemap_ca1.cjs` (CI offline list), 20 negative controls.

**The two smoke warnings stay** (`VACUOUS`, correct) until the first Current Affairs article is published. They turn
into passes by themselves then; no smoke change needed.

## SEO-HTML-LANG-1: `/hi` is served with `<html lang="en">`

**Status:** logged in SEO-1, 2026-11-22. Low–medium (Google reads hreflang and the text; Bing and screen readers use
`lang`). `/hi` already has its own canonical, hreflang (en / hi / x-default) and `og:locale hi_IN`.

**Cause:** the one root layout (`app/layout.tsx`) owns `<html lang="en">` for every route. A per-locale `lang` needs a
second root layout (route groups with their own `<html>`) or a request-time locale read, which would make the cached
landing pages dynamic. Not a metadata fix; a small layout restructure.

**How:** give `/hi` (and `/hi/learn/…`) a root layout of their own with `lang="hi"`, keeping PERF-HOME-1 caching; gate
that `/hi` renders `lang="hi"` and `/` keeps `lang="en"`.

## SEO-MOCK-PAGES-1: mock-test detail pages need their own metadata before they are indexed

**Status:** logged in SEO-1, 2026-11-22. `/mock-tests/<id>` answers 200 for a visitor but carries the site's default
title and description (duplicate across every mock), so SEO-1 marks it noindex (`lib/seo/private-routes.ts`).

**How:** a per-mock title / description (name, exam, sections, duration), self canonical, then remove `/mock-tests/:id`
from the noindex list (keep `/mock-tests/:id/:path*` — take, result, leaderboard), list published free mocks in the
sitemap, and update the SEO-1 gate. Pairs with SMOKE-MOCK-LINK-1.

## PERF-EXAM-HUB-TBT-1: `/exams/ssc-cgl` blocks the main thread ~400 ms on a phone (INP risk)

**Status:** logged in SEO-1, 2026-11-22. Lab, phone profile (390 × 844, 4× CPU slowdown), three runs: total blocking
time 363 / 404 / 486 ms; LCP 1.35–3.3 s; CLS 0. Desktop 0 ms. `/`, `/hi`, `/exams`, a lesson: under 270 ms.

**How:** profile the exam hub's client bundle (hydration of the hub sections) and defer or split what is not above the
fold. Field data (CrUX / Search Console Core Web Vitals) once the domain has traffic.

## SEO-DESC-47: the site default description is 202 characters

**Status:** logged in SEO-1, 2026-11-22 — an owner text decision (#47, pinned by UX2A L-16), not changed by SEO-1.
Search results cut near 160, so SEO-1's `seoDescription()` now ends the meta tag at a word with "…" (the source text is
unchanged). The default only shows on pages without their own description (most are now noindex).

**Owner choice:** a ≤ 160-character version of #47 (then update UX2A L-16), or keep it clamped.

## SEO-INDEXNOW-1: IndexNow for Bing (optional)

**Status:** logged in SEO-1, 2026-11-22 — reported, not built. IndexNow needs a public key file at the site root and a
POST to the IndexNow endpoint whenever a page is published or removed. The key file is trivial; the ping belongs in
the publish paths (lessons, exam modules, Current Affairs) and is an outbound call from server code, so it is a small
feature of its own, not a config change. Bing imports the sitemap from Search Console anyway, so the gain is faster
recrawl of new pages only. Revisit once publishing is frequent (Current Affairs).

## DRIFT-1C-NAV-1: two failing checks in the DRIFT-1c feature-quarantine suite (gate not in the CI list)

**Status:** logged in NAV-1, 2026-11-22 (owner: investigate later). `node scripts/test_drift1c_features.cjs` fails 2 of 46
checks; the gate is not in the CI offline list, so nothing ran it. Both failures predate NAV-1 (the code they read was not
changed by NAV-1):
- "NAV battles link gated in the UX-1b shell": its regex expects the old `visibleItems` body (`!i.flag || flags[i.flag]`);
  the function also handles `unlessFlag` since F2. NAV-1 Stage B also removed the header "Learn" menu that held Battles.
- "NAV admin sidebar hides /admin/adaptive and /admin/live-tests when off": the admin sidebar moved to `lib/admin/nav.ts`
  (ADMIN-UX-1) and the check still reads the old place.

**How:** re-point both checks to the current sources (rules kept), decide whether DRIFT-1c belongs in the CI list, add it
if so.

## BRAND-LOGO-UPLOAD-NAV-1: the admin logo upload no longer changes the site headers

**Status:** logged in NAV-1, 2026-11-22 (owner note). Since NAV-1 the visitor header and the student shell always show the
final logo suite (`public/brand/courage-library-logo-suite`, spec: never recoloured or redrawn). The admin "header logo"
upload (HOME-1 brand assets, `lib/brand/brand-assets.ts`) still drives the footer lock-up and the `/brand/icon/[size]` route,
but no longer the headers. Decide later: retire the header-logo upload setting, or keep it for the footer only and relabel it.

## NAV-TODAY-MOCK-1: the centre "Today's mock" button should open today's free daily mock directly

**Status:** logged in NAV-1 Stage B, 2026-11-22 (owner decision: spec §2 — link directly to today's free daily mock, the
Mocks list only when there is none). Shipped with the fallback for now: the button opens `/mock-tests`, which shows
today's daily mock first.

**Why not now (no reliable server-side source without a change):**
- There is no schedule record: "today's daily mock" is inferred from a naming convention on `mock_templates` (slug ending
  `-daily-<weekday>` in IST, plus heuristics such as `test_type = daily` / `ssc-cgl-daily*`) inside
  `AssessmentService.getStudentMockDashboardData` (a heavy per-user read) and the admin daily program.
- It depends on the student's exam selection; a student who follows several exams has several daily mocks and no rule
  for which one the button opens. "Free" is a separate access-policy decision (MOCK_TEST tier).
- Resolving it in the shell would add a database read to every page (UX-1b U-5: the shell makes no DB query); a resolver
  route (`/mock-tests/today`) is a new route (out of the NAV-1 spec scope).

**Proposed:** (1) a real schedule — e.g. `daily_mock_schedule(exam_id, date, mock_test_id)` written by the admin daily
program (DB change: full MIGRATION_RUNBOOK cycle), or at least one pure, tested `todaysFreeDailyMock(userId, now)` resolver
shared by the dashboard; (2) an owner rule for several followed exams (the primary exam / the first unattempted); (3) a
small route `/mock-tests/today` that resolves on tap (no shell read) and redirects to that mock, else `/mock-tests`;
(4) point `TODAYS_MOCK_HREF` there and extend NAV-1 N-17 (+ a negative control).

## EXAM-UX-LIVE-1: the live-test player gets the EXAM-UX-1 layout

**Status:** logged in EXAM-UX-1, 2026-11-22 (owner decision: "shared parts now, layout later").
`components/live-test/live-test-player-client.tsx` already uses the shared EXAM-UX-1 parts: the question palette (one
legend with counts, filters with counts, no "Go to question no."), the submit confirmation and the cl-* state colours.
Its own screen still has the old layout. Not in it yet: the 100dvh column (top bar 60 / 54 · tabs 52 / 44 · question ·
action bar 68 / 64 + safe area), the phone action bar with icons, the palette bottom sheet, the amber → red timer and the
lighter watermark.

**Done when:** the live player uses the same layout as the mock player. Re-point EXAM-UX-1 X-1…X-8
(`scripts/test_exam_ux1.cjs`) to cover both players, add a live fixture to `scripts/live/test_exam_ux1_pages.cjs`, and
keep the live engine gates unchanged.

## EXAM-LANG-1: question language toggle in the exam player (future work from EXAM-UX-1)

**Status:** logged in EXAM-UX-1, 2026-11-22, as future work. The spec's top bar leaves room for an EN | हिंदी question
language switch. It needs one published version per language (BILINGUAL-1 / LANG-VERSIONS-1) and a rule for which
language an answer is recorded against, so it is a separate phase. Nothing ships for it now.

## RESULT-REATTEMPT-1: show "Re-attempt" on the result page only when a new attempt is actually allowed

**Status:** logged in RESULT-UX-1, 2026-11-23 (owner decision: hidden in this phase). `startOrResumeAttempt` refuses a
new attempt once a normal mock has a submitted one; a daily mock allows one attempt per day. A Re-attempt button for a
normal mock would always fail, so the jump bar and the phone bar show none today.

**Done when:** the result loader returns a server-decided `canReattempt` (daily mock not yet taken today, or a future
retake rule), the jump bar shows "Re-attempt" (existing start route) and the phone bar shows it next to "Review N
mistakes", only then. Gate: RESULT-UX-1 R-9 (today: "Re-attempt shown" is a negative control) re-pointed with both states.

## RESULT-UX-FOLLOWUPS-1: small items found in RESULT-UX-1

- **Spelling:** the spec copy says "Practise"; the UXFIX1 X-10 rule keeps ONE spelling ("Practice") in public copy, so
  the page says "Practice". Owner to confirm, or change the rule and the copy together.
- **Section time limits:** `mock_sections.duration_minutes` is now read; where it is empty the ideal pace is the mock
  duration ÷ total questions. Worth filling for mocks with real section timers.
- **Takeaways:** the loader still builds the F4 `takeaways` (no longer shown; "Your next 3 steps" replaced them). Remove
  them with F4-01…F4-03 once nothing else reads them.
- **Rank / percentile:** shown only from the existing real-cohort standing (n ≥ RANK_MIN_COHORT); otherwise the muted
  note. No new ranking logic (spec §6).

## FOOTER-FOLLOWUPS-1: items found in FOOTER-1 (report only, no change made)

**Status:** logged in FOOTER-1, 2026-11-23 (owner decision 10).

- **The account address in other places:** the Organization JSON-LD (`lib/landing/organization-jsonld.ts`), the Pro
  e-mail templates (`lib/email/pro-templates.ts`, `lib/email/pro-email-server.ts`), `content/support.ts` and
  `content/landing.ts` (`SHELL_COPY.supportEmail`) still use the account / owner address. The footer no longer does
  (`lib/site/footer-config.ts` `contactEmail: null` until the owner chooses a public address). Decide one public
  contact address and point all of them at one config value.
- **Pages without a footer:** the root `app/not-found.tsx` and `app/error.tsx` render outside both shells (no header,
  no footer). Decide whether they get THE public footer.
- **Dead code:** `components/landing/landing-enhancements.tsx` (a fixed bottom bar) is imported by no page; UX-IMP-1
  (`scripts/test_ux_imp1.cjs`) and a comment in `app/globals.css` still name it — remove all three together.
- **Owner inputs pending:** a public contact e-mail and the active social account URLs (`config/site.ts`
  `siteConfig.links` — the footer icons and the JSON-LD `sameAs` read the same values). Each stays hidden until set.
- **Admin footer-logo upload:** the footers now show the official logo-suite lockup (like the headers since NAV-1);
  the admin "footer logo" upload no longer changes any page (same as BRAND-LOGO-UPLOAD-NAV-1 for the headers).
- **Links the old footer had that the owner's columns do not:** CNTS, Pricing, Practice / Mistake drills. Add them to
  a column only if the owner wants them back.
