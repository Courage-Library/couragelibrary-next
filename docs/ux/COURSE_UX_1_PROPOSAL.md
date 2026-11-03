# COURSE-UX-1 — the student course experience (Phase A: design + data audit)

2026-11-03 · owner priority · **Phase A only: no code, no DB change.** STOP for owner review.
Sources: read-only code audit (file:line below) and read-only DB counts (rolled-back read-only transactions).

---

## 1. Data audit — what exists today

### 1.1 The course is built on demand (no course rows)
- **`fn_exam_course_outline(p_exam_id, p_exam_cycle_id, p_language)`** (SECURITY INVOKER, anon + authenticated;
  `supabase/migrations/20261028000120_ca5_courses_progress.sql:309-391`) builds the course from the cycle's PUBLISHED
  syllabus → `exam_syllabus_canonical_mappings` → master nodes (`canonical_taxonomy_nodes`, active descendants ≤ depth
  3) → **only nodes that have a servable lesson**. Chapters = master TOPICs (subject + weightage tier); lessons carry
  `document_id, slug, node_id, node_type, position, hi_available, available_in_language`.
- **Servable lesson** (`fn_servable_node_lessons`, 120 → 122): `learning_documents` NODE_LESSON, PUBLISHED, current
  `document_versions` published + BLOCKS; one lesson per master node; **exam-neutral (shared master lessons)** — as the
  owner wants.
- The legacy `courses / course_modules / course_lessons / user_course_progress / user_lesson_completions` tables
  (1 / 1 / 1 / 0 / 0 rows) are switched off behind `FEATURE_COURSES` and unrelated — **not reused**.

**SSC CGL today (read-only counts):** syllabus 59 units in 4 sections · **11 units with a published lesson (17 lessons:
16 English Comprehension, 1 General Awareness; 10 chapters, all HIGH_YIELD)** · 32 units with published questions
(103 questions) · 0 Hindi lessons. A partial-launch course would show 11 topics open, Practice on 32, 48 "Coming soon".

### 1.2 Launch gating (LAUNCH-MODE-1 / CA-7)
- `exam_course_launches` (0 rows — **no course is launched**): status LIVE | PAUSED; access_mode FREE_ALL | FREE_N.
- `fn_exam_course_launch_set` (service_role; latest body `20261030000126_exam_logo_1.sql:125+`) refuses LIVE without a
  coverage snapshot, a published active syllabus, a logo; FREE_N without an active Pro plan. App side
  (`services/learning/coverage.service.ts:118-142`) also refuses FREE_N while payments are off.
- **Nothing blocks a launch with missing lessons** — there is no coverage threshold. FREE_N locks positions above
  `LESSON_FREE_PER_CHAPTER` (default 2) per chapter (`lib/learning/chapter-access.ts`); payments off → nothing gated;
  a failed settings read → everything gated (fail closed).

### 1.3 Routes today
- `/exams/<exam>/course` (`app/(site)/exams/[slug]/course/page.tsx`, force-dynamic → `ExamCourseService.getCourse`):
  404 unless LIVE; one progress bar, one Continue, a **flat chapter list** (no subject level), JSON-LD, empty state.
- Reader `/learn/[...path]` and `/hi/learn/[...path]` (`components/learning/master-lesson-page.tsx`): breadcrumbs,
  `LessonBlocksRenderer`, `LessonQuickCheck`, "Mark as complete", "Practice this topic", "Go deeper", lock teaser.
- **Missing:** subject page; previous / next; the reader does not know its course; no "On this page" (headings have no
  ids — `lesson-blocks-renderer.tsx:66`); no on-page EN / HI toggle.

### 1.4 Lesson progress
- `user_lesson_progress` (user × document × language; NOT_STARTED | READING | COMPLETED; last_block_id; started_at,
  completed_at) — 0 rows. Written only by **`fn_lesson_progress_save`** (SECURITY DEFINER, `auth.uid()`, authenticated).
- Opening a lesson records READING; **COMPLETED = one click on "Mark as complete"** — no time, scroll, end-reached or
  quick-check evidence; `p_last_block_id` is never passed (always NULL).
- **Bug found:** the course page reads progress in the user's preferred language
  (`services/learning/course.service.ts:50`) while course links open `/learn` (English) and save under `en` → a
  Hindi-preference student never sees progress. Fixed in phase B (one progress per lesson, language-independent).

### 1.5 Quick checks
- Block `quick_check` (`lib/lessons/blocks.ts:72`): prompt + 4 options, one correct, feedback per option; the publish
  checklist requires ≥ 5 per lesson (`lib/lessons/completeness.ts`). Rendered client-side ("Nothing is recorded");
  **the correct flags are sent to the browser**. No table / RPC for answers.

### 1.6 Coins
- Canonical store exists: `coin_ledger` (10 rows; UNIQUE idempotency_key, balance_after ≥ 0, reversal links),
  `coin_wallets` (5), `gamification_events` (9; UNIQUE idempotency_key), `reward_policies` (5 active: CA quiz 10,
  mock 30, study task 15, streak 7 / 30 days; **`daily_limit_count`, `cooldown_seconds`, `min_duration_seconds`**
  columns exist), `reward_catalog` / `reward_claims` (store).
- `fn_award_gamification_reward` (SECURITY DEFINER, service_role) is **frozen since 112** (returns `frozen:true` before
  any write); app flag `COINS_ENABLED` off by default; `/wallet` and `/store` show "paused"; wallet links hidden.
- Note: `fn_distribute_live_test_rewards` writes the ledger directly and is blocked only in the app (live tests are
  quarantined) — to close in the coins migration.
- No lesson reward type, no enforced daily cap today (the policy columns exist; enforcement to be verified in phase B).

### 1.7 Revalidation / caching
- Course page and `/learn` are force-dynamic; lesson data is cached under the `learn` tag (1800 s) and
  `publishLessonAction` revalidates `learn`, `/learn`, `/hi/learn`, the sitemap and the public pages → **a newly
  published lesson already appears in a LIVE course at once.**

### 1.8 Legal
- `content/public-pages.ts` (drafts "under legal review"): privacy mentions "reward coins" once (:138); **terms say
  nothing about coins.**

---

## 2. Requirement 1 — partial launch: the smallest change

Launching with missing lessons is **already allowed** (no threshold). What is missing is the student view:

1. **Show the whole syllabus, not only covered topics.** The course view merges the outline (lessons) with the
   syllabus read model (`fn_exam_syllabus_read_model`, already public): every unit is listed; a unit with a lesson →
   open; without → **"Coming soon"** (text, not a link); a unit with published questions → **Practice** shown either
   way.
2. **Counts = available lessons only:** "17 lessons ready" / per subject "x of y ready", where y = units in the
   syllabus with a lesson planned (= all units) — never a fabricated total.
3. **No change to FREE_ALL / FREE_N** or to `fn_exam_course_launch_set` (no migration for launch). The admin launch
   confirm keeps showing coverage %, adding the "x topics will show Coming soon" line.
4. **New lessons appear automatically** — already true (dynamic page + `learn` tag). Phase B caches the merged view
   under `learn` for speed; publish already revalidates it.

---

## 3. Screens (wireframes)

Rules for all screens: R4 one solid blue-700 primary; R9 English UI (content EN/HI by preference); R10 48 px targets,
AA contrast; R13 light reading surfaces, saturated colour only small, no yellow; honesty — **no fake counts, no quotes,
no year labels, no "Reference: Lucent / NCERT" lines**; legacy structure + mind-map diagrams kept (diagrams render as
lesson blocks).

### 3A. Course home `/exams/<exam>/course`

Desktop (1280):
```
┌ Breadcrumb: Home › Exams › SSC CGL › Course ─────────────────────────────────────────────┐
│ [logo] SSC CGL course                                         17 lessons ready · 59 topics │
│ ┌ Continue where you left off ──────────────────────────────────────────────┐              │
│ │ English · Antonyms › Opposite Word Meaning      3 of 6 sections read      │ [Continue →] │  ← the ONE primary
│ └───────────────────────────────────────────────────────────────────────────┘              │
│ Overall: ███████░░░░░░░░ 4 of 17 lessons completed                                         │
│                                                                                            │
│ Subjects                                                                                   │
│ ┌ (ring 25%) English Comprehension ┐ ┌ (ring 0%) General Awareness ┐ ┌ Quantitative ...  ┐ │
│ │ 16 of 21 topics ready            │ │ 1 of 18 topics ready         │ │ Coming soon        │ │
│ │ 4 completed · 9 HIGH-YIELD       │ │ HIGH-YIELD: 6               │ │ Practice: 12 topics│ │
│ │ [Open subject]                   │ │ [Open subject]               │ │ [Practice]         │ │
│ └──────────────────────────────────┘ └──────────────────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```
Phone (390): header (logo + title + "17 lessons ready") → Continue card (full-width primary) → overall bar → subject
cards stacked (ring left, counts right, whole card is the link, ≥ 48 px).

States: **first visit** → "Start with <first HIGH-YIELD lesson>"; **signed out** → Continue replaced by "Sign in to save
your progress" (secondary) + Start; **all completed** → "Course complete — keep practising" + Practice; **no lessons
yet** → honest empty state with Practice if questions exist; **PAUSED** → 404 (as today).

### 3B. Subject page `/exams/<exam>/course/<subject>`

```
English Comprehension                                   16 of 21 topics ready · 4 completed
[Section filter: All · Ready · Not started]                       (chips, ≥ 48 px)

▼ Antonyms                                     HIGH-YIELD            [Learn] [Practice]
   ✓ Opposite Word Meaning           8 min     done
   ◐ Contextual Antonyms             6 min     in progress
   ○ Antonym Pairs                   5 min     new
▶ Idioms & Phrases                             HIGH-YIELD            Coming soon · [Practice]
▶ Cloze Test                                   CORE                  Coming soon
```
Rows: state icon + text (never colour only), minutes (from the lesson's reading estimate — phase B computes it from
block word counts; no invented values), weightage badge from the published syllabus tier, Learn = first unfinished
lesson, Practice = topic practice when published questions exist. Coming-soon rows are text, not links. Phone: same
list, topic rows expand in place (disclosure), Learn / Practice as two 48 px buttons under the title.

### 3C. Lesson reader (inside the course)

Desktop:
```
┌ Course outline (sticky) ─┐ ┌ Lesson ───────────────────────────────┐ ┌ On this page ───┐
│ SSC CGL · English  25%   │ │ ▓▓▓▓▓░░░░░ reading progress (top bar) │ │ • Meaning        │
│ ▼ Antonyms               │ │ Opposite Word Meaning   [EN | हिंदी]  │ │ • Examples       │
│   ✓ Opposite Word Mean.  │ │ 8 min · HIGH-YIELD                     │ │ • Quick check 1  │
│   ◐ Contextual Antonyms  │ │ … blocks (text, mind-map diagram) …    │ │ • Summary        │
│ ▶ Synonyms (coming soon) │ │ ┌ Quick check ┐ answers checked on the │ └──────────────────┘
│                          │ │ │ 4 options   │ server, feedback shown │
│                          │ │ └─────────────┘                        │
│                          │ │ End: [Mark complete] → +10 coins toast │
│                          │ │      [Practice 10 questions] [Next →]  │
└──────────────────────────┘ └────────────────────────────────────────┘
```
Phone: clean single column; top reading-progress bar; "Outline" button opens the outline in a bottom sheet; bottom bar
`[← Previous] [Outline] [Next →]` (48 px, safe-area); "On this page" as a collapsible list under the title.

Behaviour: **resume position** (last block id, server-saved, scrolled to on return); **focus mode** (R13: hides outline +
right rail, max 70 ch line, comfortable size; remembered per device); **EN / HI toggle** only when a published Hindi
version exists (progress is per lesson, not per language); **Free / Pro lock** follows the launch mode (FREE_ALL →
everything free; FREE_N → positions above the per-chapter limit locked; **payments off → free**); **end of lesson**:
Mark complete (enabled when the end is reached) → coins toast (only if coins earn is on) → "Practice 10 questions"
(when ≥ 10 published questions; else the real number) → Next lesson.

---

## 4. Requirement 3 — coins for lessons (STRICT)

**Conflict to flag:** the owner's direction references *decision #78 — coins after F9*; the repo says coins return in
"F10" (`lib/coins/flag.ts`, BACKLOG) and coins have been **frozen since migration 112**. "#78" itself is not in the
repo. **Proposal: EARN now (lesson completion only), SPEND later** (store / wallet spending stays paused) — owner to
confirm this exception to the freeze.

**Rules (server-enforced; the client is never trusted):**
- **Genuine completion** = all of: (1) a reading session started on the server (first READING save) at least
  **N seconds** ago (proposed N = max(60 s, 40 % of the lesson's estimated reading time)); (2) the **end reached** (the
  last block id saved); (3) **every quick check attempted** (answers recorded server-side).
- **Once per user per lesson** (idempotency key `lesson:<user>:<document>`; language-independent) — reruns, refreshes
  and multiple tabs cannot pay twice.
- **Daily cap** via the existing `reward_policies.daily_limit_count`.
- **Proposed amounts (owner to confirm):** 10 coins per lesson, +5 when all quick checks were correct on the first
  attempt, cap 100 coins / day (= 10 lesson awards incl. bonuses up to the cap).
- **Anti-abuse:** server timestamps only; quick-check correctness decided on the server (the correct flags stop being
  sent to the browser before an answer); idempotent award; one session row per user × lesson; replay of the RPC → same
  idempotency key → no second credit; quick-skip → refused (time / end / checks); account flag `coin_wallets.is_locked`
  honoured.
- **What students see:** a toast "+10 coins" after Mark complete; the balance in the account menu (header) when the
  coins flag is on; `/wallet` shows the lesson credits; `/store` stays "coming soon".

**DB changes (phase B, all with full migration safety):**
1. `lesson_reading_sessions` (user × document: started_at, last_block_id, end_reached_at, quick checks attempted /
   correct) — RLS own read, writes only via RPC.
2. `fn_lesson_quick_check_answer(document, block_id, option_id)` — SECURITY DEFINER, `auth.uid()`: checks the answer
   against the published version server-side, records the first attempt, returns feedback.
3. `fn_lesson_complete(document)` — SECURITY DEFINER, `auth.uid()`: verifies the three conditions, sets COMPLETED,
   then calls the canonical award with a LESSON policy (no parallel store).
4. `reward_policies`: `LESSON_COMPLETED` (10) and `LESSON_QUICK_CHECKS_PERFECT` (+5), daily caps; the freeze becomes
   per event type (only these two un-frozen); `fn_distribute_live_test_rewards` closed in SQL too.
5. `user_lesson_progress`: one progress per lesson (language-independent) — fixes the Hindi bug.

**Legal (terms + privacy) — to add before coins earn goes live:** coins are loyalty points with **no cash value**, not
transferable, not exchangeable for money; how they are earned (the rules above) and that rules / amounts may change;
spending (store) is not available yet; coins may be withheld or reversed for abuse or errors; they lapse with account
deletion; balances are shown in the account; privacy: coin activity is stored to run the programme.

---

## 5. Migrations (phase B, proposed)

| # | Change | Risk |
|---|---|---|
| 135 | `lesson_reading_sessions` + `fn_lesson_quick_check_answer` + reading-progress save with last block (no coins) | low (new table, own-row RLS) |
| 136 | progress per lesson (language-independent) + backfill (0 rows today) | low |
| 137 | coins: LESSON policies, per-event-type freeze, `fn_lesson_complete` award, live-test writer closed in SQL | **STRICT** — owner sign-off, SECDEF allow-list +2 |

No launch-function change. Each: backup → dry-run → rolled-back real-role smoke → apply → verify (P-6c / P-6d, ratchet).

## 6. Gates plan (phase B)

- **COURSE-UX-1 offline:** course view merge (every syllabus unit listed; coming-soon never a link; counts only
  available lessons; no fake numbers — no digits not from data); subject grouping; reader prev / next order;
  "On this page" ids; EN / HI toggle only when Hindi is published; lock = launch mode (payments off → free); negative
  controls (a fake count, a coming-soon link, a quote / year label string).
- **COURSE-UX-1 live (local build):** home / subject / reader at 390 + 1280 — axe 0, 48 px targets, CLS 0, resume
  position, Hindi-preference progress shown, focus mode.
- **COINS-LESSON live (rolled back, real roles):** no award before N seconds / without end / without checks; one award
  per lesson (replay, two tabs); daily cap; quick-check correctness server-side; anon / other user cannot call; ledger
  only via the canonical function; frozen event types still pay 0.
- Existing: LAUNCH-MODE / CA5 / CA7 / F6 gates, RLS P-6c / P-6d, SECDEF ratchet.

## 7. Budgets

- First Load JS: course home ≤ 110 kB, subject page ≤ 110 kB, reader ≤ the /learn budget (107 / 110 kB) — the outline
  sheet and quick checks are small client islands.
- LCP ≤ 2.5 s (BRAND2 P-06 profile), CLS 0 (reserved space for the outline, the reading bar and the bottom bar), axe 0.
- Server: the merged course view cached under `learn` (one outline + one read-model call per regeneration).

## 8. Open questions for the owner

1. Coins: approve **EARN now / SPEND later** as an exception to the coins freeze (#78 vs "F10")? Amounts 10 / +5 /
   cap 100 per day?
2. Minimum reading time rule: max(60 s, 40 % of the estimated time) — acceptable?
3. "Practice 10 questions" — when a topic has fewer than 10 published questions, show the real number (proposed) or
   hide?
4. Subject cards for subjects with **no** lesson yet — show as "Coming soon" with Practice (proposed) or hide?
5. Reading minutes: computed from block word counts (proposed, honest) — OK?
6. Hindi: progress per lesson regardless of language (proposed) — OK?
7. Legal text for coins: who drafts (owner / counsel); coins earn stays off until the terms are approved?
8. First course to launch: SSC CGL in FREE_ALL (payments off)?
