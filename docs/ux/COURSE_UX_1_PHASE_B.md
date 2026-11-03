# COURSE-UX-1 — Phase B (build)

2026-11-03 · branch `feat/course-ux-1` (local, not pushed) · built from the owner's answers to the Phase A proposal
(`docs/ux/COURSE_UX_1_PROPOSAL.md`). **No release until the owner says so.**

## What was built

| Area | What students get | Where |
|---|---|---|
| Partial launch | The course lists **every** topic in the published syllabus. Topics with a lesson are open; topics without one say "Coming soon" (text, never a link); Practice shows the real count (owner answer 3). Counts are only what exists ("17 lessons ready · 11 of 59 topics have lessons"). No launch-function change. | `lib/learning/course-structure.ts`, `services/learning/course.service.ts` |
| A. Course home | One primary action (Continue / Start), overall progress, one card per subject (progress ring, "x of y topics ready", high-yield count, practice). | `app/(site)/exams/[slug]/course/page.tsx`, `components/learning/course-ui.tsx` |
| B. Subject page | Every topic in syllabus order: weightage badge, lesson rows (done / in progress / new, minutes from word count), Learn + Practice. | `app/(site)/exams/[slug]/course/[subject]/page.tsx` |
| C. Lesson reader | With `?course=<exam>`: course outline (desktop rail / phone sheet), Previous / Next (desktop row, phone bottom bar above the student nav). Always: reading progress bar, "On this page", minutes, EN / हिंदी toggle (only when Hindi is published), focus mode (R13, remembered on the device), resume at the saved block, server-checked quick checks, server-decided completion, then Practice (real count) and Next lesson. | `components/learning/master-lesson-page.tsx`, `lesson-reader-client.tsx`, `lesson-complete.tsx`, `lesson-quick-check.tsx`, `app/(site)/learn/actions.tsx` |
| Progress language bug | One progress record per lesson, whatever the language (owner answer 6). | migration 135 |
| Secure completion | Completed only when the server has recorded: the last block reached, every quick check attempted, and time since its own recorded start ≥ max(60 s, 40 % of the reading minutes). Quick-check keys never reach the browser before an answer. | migration 136 |
| Lesson coins (STRICT) | Earn only: 10 per lesson, +5 if every quick check was right first time, 100 / day (India day), once per student per lesson, canonical ledger, wallet lock. **Ships OFF.** | migration 137, `lib/coins/flag.ts`, `app/api/coins/balance`, `components/coins/lesson-coins-wallet.tsx` |
| Staff preview | Staff / admin can open a course that is not launched yet (labelled "Preview", noindex) to check it before launch. Students still get 404 until LIVE. | `course.service.ts` |

Legacy items (fake counts like "150+ Topics", quotes, "Reference: Lucent / NCERT", year labels) do not exist in this
codebase; the new pages never render them and the gate (U-1c) fails if one appears.

## Database (applied 2026-11-03, hotspot, TLS clean before each write)

Backup `manual-2026-11-03T07-56-04-resilient` (179 tables, manifest verified) → for each of 135 / 136 / 137: TLS check →
dry-run → apply. Before applying, the rolled-back real-role smoke (`--pre`) caught one bug (`text[] || 'END'` parsed as
an array literal, 22P02) — fixed with `array_append` before anything was applied.

| # | Change | Rollback |
|---|---|---|
| 135 | `user_lesson_progress` key (user, lesson); rows merged (COMPLETED wins); progress RPC on the new key | `docs/database/rollback/135_rollback.sql` |
| 136 | `lesson_reading_sessions`, `lesson_quick_check_attempts` (RLS own rows, no client write); `fn_lesson_quick_check_answer`, `fn_lesson_complete` (SECURITY DEFINER, `auth.uid()`, authenticated only); reading-minutes helper (INVOKER, service_role only); progress RPC records the session and no longer completes on a bare click | `136_rollback.sql` |
| 137 | `LESSON_COMPLETED` policy; `fn_lesson__award_coins` (INVOKER, **no grant to anyone**, called only inside `fn_lesson_complete`); DB switch `COINS_LESSON_EARN` **absent = off**; generic award stays frozen (112) | `137_rollback.sql` |

SECURITY DEFINER allow-list: total 118 → 120 (+2 class A, authenticated). Production code keeps working: an
un-evidenced "Mark as complete" on the current production reader now stays READING (no error).

## Turning lesson coins on — owner steps, in this order (DEPLOY-BEFORE-ACTIVATE)

1. Architect drafts the coins clauses (terms + privacy); owner approves them; they are published.
2. Release this branch; production verified.
3. Set `COINS_LESSON_EARN=true` in Vercel (shows the toast, the header balance, the earn-only wallet).
4. Turn on the database switch (a script, with backup), only after step 3 is live:
   `premium_system_configs` GLOBAL `COINS_LESSON_EARN` = `{"value": true}`, `is_enabled = true`.

Until step 4 nothing is ever awarded, whatever the app flag says (gate C-1).

## Launching SSC CGL (owner answer 8, after release)

Admin → exam → Launch course, mode FREE_ALL (payments are off, so FREE_N is refused anyway). New lessons appear
automatically: every lesson publish revalidates the course data (tag `learn`).

## Gates

- Offline `scripts/test_course_ux1.cjs` (+ `--self-test`, 16 negative controls) — in CI offline.
- Live DB `scripts/live/test_course_ux1.cjs` (real roles, rolled back; `--pre` before apply) — CI db shard.
- UI `scripts/live/test_course_ux1_ui.cjs` (local build only; 390 + 1280; axe, 48 px targets, CLS, no quick-check
  key in the page source, the student completion flow, resume, visitor).
- Updated pins: CA5 (allow-list A +2; locked marker moved to `course-ui.tsx`), CA7 (LIVE check via `isCourseLive` +
  staff preview), COINS-FREEZE CF-06 (the earn-only wallet), route budgets (+ subject page).

## Budgets (First Load JS, `next build`)

Course home 107 kB · subject 107 kB · reader 110 kB (budget 110 — at the limit; the client islands ship no icon
library or class merger) · CLS 0 on every checked page.

## Open items

1. **Pro lock in SQL** — the evidence RPCs do not re-check the Pro lock (the paywall switch lives in the app env).
   Harmless while payments are off; before payments + coins are both on, add a DB-side paywall check.
2. **Reader at its JS budget** (110 / 110 kB) — the next client addition on the lesson page must remove something.
3. Time is measured from the first open (server clock); a student can leave a tab open and come back. The daily cap,
   the quick checks and the end-reached rule limit what that is worth.
