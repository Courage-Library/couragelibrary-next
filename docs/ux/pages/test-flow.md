# Test flow: instructions → console → result → solutions (existing; polish only)

**Purpose.** Run a mock exactly like the real exam, then turn the result into next actions. The engine already exists and works: autosave, resume, server-authoritative timer, single active attempt, server evaluation, mistake-vault hand-off, coins, and an E2E journey of 13 steps. **UX-3 restyles and restructures it; it does not re-engineer it** (#28: no second engine).

**User and job-to-be-done.** A student taking a timed mock. Their job: "Take it without friction or fear of losing answers, then know exactly what to fix."

## 1. Instructions: `/mock-tests/[mockId]`
**Today.** A card with duration, questions and marks; a section blueprint with +2 / −0.5 marking; 4 rules; "I Agree & Start Test". It works. A screenshot is in `docs/ux/ux0/screens/anon/`.

**Polish:**
- Breadcrumb: Exam › Test series / Mock tests › Test.
- Stat tiles move onto tokens. Remove the coloured tints (green "Total Marks" implies "success").
- Add a **language selector** (English / हिन्दी), shown only when the test has both versions. Today all 113 question versions are `en`.
- Add a **"Before you start" checklist**: stable internet, about 60 minutes uninterrupted, and fullscreen recommended.
- **Rules acceptance checkbox.** This is a legacy pattern worth keeping. It is required before Start and is announced to screen readers.
- Signed out: the CTA reads "Sign in to start". It goes to `/auth/login?next=/mock-tests/[mockId]`, returns here, and keeps the selection.
- Attempted before: show the last score and choose between "View last result" and "Retake".

## 2. Console: `/mock-tests/[mockId]/take`
**Keep:**
- server-start timer
- autosave per answer ("Saved" status)
- resume after reload (E2E-08/09)
- palette
- report-question dialog
- watermark
- single-attempt rule

**Polish:**
- **Layout.** A full-screen app layer with no site header, footer or bottom nav. The top bar carries:
  - the test title (truncated)
  - the **timer** (tabular numerals, never animated; at 5 minutes left it turns to warning colour with a text "5 min left" announced politely)
  - a language toggle per question
  - "Submit"
- **Section tabs** (APG tabs) showing a count per section.
- **Question area:** the Question renderer in test mode, with options of at least 48px, A–D letters, and a "Clear response" control.
- **Bottom bar:** Previous · Mark for review & next · Save & next (primary).
- **Palette.** A right panel on desktop; a bottom sheet on mobile, opened by an "Questions 12/100" button. The legend uses **shape and colour**:

  | State | Shape / colour |
  |---|---|
  | answered | filled primary |
  | marked | ring with ★ |
  | answered + marked | filled with ★ |
  | not visited | outline |
  | visited not answered | warning outline |

  The palette also shows counters (answered / marked / not visited), a legacy pattern worth keeping.
- **Submit dialog:** a summary per section (answered / marked / unanswered) with the confirm "Submit test". Esc does not confirm.
- **Connectivity:** an offline banner ("You're offline. Answers are saved on this device and will sync"). The legacy localStorage queue concept is worth keeping; today's autosave is online-only, which is a gap to confirm in UX-3.
- **Accessibility:**
  - every action works by keyboard (shortcuts 1–4 / A–D select, N next, M mark, shown in a help dialog)
  - focus moves to the question heading on navigation
  - the timer has an `aria-live="off"` region with polite announcements only at 10 / 5 / 1 minute left

## 3. Result: `/mock-tests/attempts/[attemptId]`
This currently lives at `/mock-tests/[attemptId]/result`; a 308 redirect will move it.

**Sections:**
1. Result summary hero:
   - score / max, accuracy ring, percentile and rank (when there are enough attempts; otherwise hidden rather than "Rank 1 of 1")
   - attempted / correct / wrong / skipped, time taken
   - retake delta vs best
2. **"What to do next"** (the key polish). Up to 3 actions:
   - "Revise 9 mistakes" (to the vault, filtered by attempt)
   - "Learn {weakest topic}" (course topic, or a resolver document)
   - "Practise {weakest topic}"
3. Section table: score, accuracy, time per section, with a bar chart and a table alternative.
4. Topic strengths and weaknesses (from `attempt_answers` → question → canonical topic).
5. Leaderboard link and a share card (an image without PII; WhatsApp share was a legacy pattern).
6. "View solutions" (to §4).

**States:** evaluation pending (polling with a skeleton), the first attempt vs a retake, the attempt not found (a 404 card, which replaces today's custom card).

## 4. Solutions: `/mock-tests/attempts/[attemptId]/solutions`
- Filter tabs: All / Wrong / Skipped / Marked / Correct (legacy pattern), plus a section filter.
- Per question, the Question renderer in review mode:
  - the student's answer (answer-wrong state with ✗) and the correct answer (answer-right with ✓)
  - the explanation (`question_answers.explanation_md`)
  - time spent vs the average
  - "Learn this topic"
  - "Save to bookmarks"
  - "Report an issue"
- Pro touchpoint, if the owner adopts tiered solutions (open question 3): the explanation is replaced by the Pro lock panel. The correct answer is always visible.

**Components.** Question renderer (test / review), Tabs, Sheet (palette), Modal (submit), Result summary, Stat tile, Progress, Toast ("Saved"), Pro lock panel, Breadcrumb.

## Data
`AssessmentService`:
- `getMockTestInstructions`
- `startOrResumeAttempt`
- `saveAnswer` (via `/api/assessment/save-answer`)
- `submitTestAttempt` (also `MistakeService.recordExamMistakes`, `GamificationService.awardMockCompletionReward`)
- `getTestResult`
- `getTestLeaderboard`

Errata go to `/api/assessment/report-question`.

**TYPES-1 B1 fixed these flow defects (uncommitted, pending B1):**
- the resume "answered" count was always 0 (one-to-one `test_results`)
- the today-mock title was not selected

**Known gap.** `recordExamMistakes` swallows insert errors. In the B1 E2E run, 1 of 3 wrong answers produced no vault row during network errors. A retry or outbox is recommended (LOOP-1).

**Access tier.**
- Instructions are public.
- The console, result and solutions are signed-in and the attempt owner's only (RLS).
- Pro tests require Pro.

**SEO.**
- Instructions: indexable, title "{Test}: Free {Exam} Mock Test".
- Everything else: noindex.

**Analytics events.**
- Instructions: `test_instructions_viewed`, `test_started`
- Console: `test_resumed`, `answer_saved` (sampled), `question_marked`, `test_language_switched`, `test_submit_opened`, `test_submitted`, `test_autosubmitted`, `test_offline_detected`
- After the test: `result_viewed`, `result_next_action_clicked`, `solutions_viewed`, `question_reported`

**Mobile behaviour.** The console must work at 390px:
- palette in a bottom sheet
- the bottom bar holds 3 buttons with icons and labels
- the stem scrolls independently, so the options stay reachable
- landscape is supported

**Dependencies.**
- No hard dependencies; the polish ships in UX-3.
- Percentile needs enough attempts.
- Tiered solutions need an owner decision and Commerce.
- Hindi needs Hindi question versions (Content ops).
