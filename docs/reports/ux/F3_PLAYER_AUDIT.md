# F3 scope: mock player, submit dialog and result page audited against R4–R8 and R10

The rules are in [`docs/ux/DESIGN_RULES.md`](../../ux/DESIGN_RULES.md). This was a read-only code-level audit on 2026-10-25, at the architect's request, in place of owner screenshots. No code was changed.

**Verified by hand:**
- P0 #1: `app/api/assessment/save-answer/route.ts:14` returns HTTP 200 with `{ success }`, and `player-client.tsx:389` checks only `res.ok`.
- The amber = accent token mapping (`app/globals.css`).

The other line references come from the audit pass. Each is re-checked when its item is fixed. Uncertain items are marked.

Token facts used in this audit:
- Every `amber-*` class counts as amber for R4: `amber-*` points to `--color-accent-*` (`app/globals.css:337-344`).
- `text-slate-400` (#9ca3af) is about 2.5:1 on white and fails AA. `text-slate-500` passes.
- Legacy Button sizes: `sm` is `h-8` (32 px) and `md` is `h-10` (40 px). Only `lg` (`h-12`) meets 48 px (`components/ui/legacy/button.tsx:20-25`).

## Verdicts

| Rule | Verdict | Main findings |
|---|---|---|
| R4 One primary action, one amber | **FAIL** | Two primary actions on mobile and desktop: filled Next with filled Submit (`player-client.tsx:1625-1644`, `:1187`); several ambers (offline banner `:1075`, palette "not answered" `question-palette.tsx:53`, timer); two section switchers (`:1285-1313`, `:1456-1493`); the result page leads with "View Full Leaderboard" (`result-view-client.tsx:699-717`). The submit dialog itself passes. |
| R5 Status and progress always visible | **PARTIAL** | Timer and save chip pass (`:1161`, `:1136`/`:1233`). "of N" is `text-slate-400` (`question-renderer.tsx:38`). Answered/marked counts are hidden below 1024 px (`question-palette.tsx:116-133`, palette `lg` only `:1456`). Section tabs have no `aria-selected` (`:1292`). In adaptive mode "of N" is misleading (`:1319`). |
| R6 Matches the real SSC/TCS CBT | **PARTIAL** | Palette states are told apart by colour only, with non-TCS colours (`question-palette.tsx:41-57`). No "Save & Next" (`:1441`). No "Mark for Review & Next" (`:1343`). Re-clicking deselects an option (`:501`). Clear Response asks for confirmation and then shows undo (`:1719`). Visited state is lost on resume (`:142-152`). The `c` key clashes with option C (`:745` vs `:750`). |
| R7 Autosave, visible confirmation, exact resume | **FAIL** | **Save failures show as "Saved"** (route returns 200 on a DB failure; client checks `res.ok`; `offline-queue.ts:126` likewise). **Submit and auto-submit errors are invisible** (`:803`, `:826-837`, `:1830`). The timer interval restarts on every render and refires at 0 (`:1163`, `assessment-timer.tsx:24-57`). The player resumes at Q1 instead of the last question (`:82`). Pending offline answers are not replayed on load (`:249`). A shared debounce can drop saves (`:375`). |
| R8 No surprise alerts, flashing or sounds | **FAIL** | Beeps at 5 and 1 minutes, on by default (`assessment-timer.tsx:43,49`, `lib/assessment/audio-alerts.ts`). `animate-pulse` timer (`:88`). Pulsing adaptive badge (`adaptive-progress-badge.tsx:39`). Blocking red tab-switch and fullscreen modals (`:1770-1827`). Slide-in error banner (`:1083`). No `alert` / `confirm` / `<audio>` (pass). |
| R10 Light-first, contrast, reflow, 48 px targets, keyboard | **FAIL** | Options are `<div onClick>` with no radio semantics or focus (`question-options.tsx:45-56`). Many targets are under 48 px (palette `h-9`, legacy `sm` `h-8`, mobile bar `h-9`, `p-1` / `p-0.5` icon buttons). Text is `text-slate-400` or 9–11 px. Dialogs lack `role="dialog"`, focus trap and Escape. Custom buttons have no `focus-visible`. Possible header overflow at 320 px (not measured). Dark result hero (`result-view-client.tsx:139`). |

## F3 backlog

**P0, correctness and safety:**
1. Make the save route return 4xx/5xx when `success` is false, and have the client and offline queue check `json.success` (`save-answer/route.ts:14`, `player-client.tsx:389`, `offline-queue.ts:126`).
2. Show a visible error/retry panel for a failed submit or auto-submit (`player-client.tsx:803`, `:826-837`, `:1830`).
3. Make the timer stable: callback held in a ref, countdown from the server start time, fires once (`player-client.tsx:1163`, `assessment-timer.tsx:24-57`).
4. No timer sound by default and no pulse (`assessment-timer.tsx:43,49,88`).
5. Make options real radios: `role="radiogroup"` / `radio`, `aria-checked`, focusable (`question-options.tsx:45`).
6. Replay and merge pending offline answers on load (`player-client.tsx:118-139`, `:249`).

**P1, R6 / R4 / R10:**
7. Resume at the last question and restore visited state (`:82`, `:142-152`).
8. TCS controls: "Save & Next", "Mark for Review & Next", no deselect on re-click, one-click Clear Response with quiet undo (`:1441`, `:1343`, `:501`, `:1719`).
9. Palette shapes/icons per state, and matching legends (`question-palette.tsx:41-57`, `:229`, `instructions-modal.tsx:46-60`).
10. One primary action: Submit becomes quiet on mobile and desktop (`:1625-1644`, `:1187`).
11. Tab-switch and fullscreen events become quiet inline notices, still logged (`:1770-1827`).
12. 48 px targets across player, palette and dialogs (`question-palette.tsx:42`, `:1516-1649`).
13. One accessible Dialog for submit, instructions, clear and drawer (`submit-dialog.tsx:40`, `:1654`).
14. A distinct "Not saved — retrying" state; per-question save debounce (`:375`, `:392-397`, `:1145`).

**P2, polish:**
15. Contrast: drop `text-slate-400` and 9–11 px text (`question-renderer.tsx:38`, `:1128`, `:1485`, `result-view-client.tsx:312`).
16. Answered/marked counts in the mobile strip (`:1213`); adaptive progress label (`:1319`).
17. Result page: one primary action ("Review mistakes"), a quiet leaderboard link, fewer ambers, light hero (`result-view-client.tsx:139,273,499,699`).
18. One section switcher, with `aria-selected` (`:1457-1493`, `:1292`).
19. Fix the `c` key clash; remove remaining `animate-pulse` (`:745`, `adaptive-progress-badge.tsx:39`, `result/page.tsx:29`).
20. Hide the wordmark under 360 px; check overflow at 320 px (`:1106`).

## Unverified

- 320 px overflow is estimated, not measured.
- Whether a global `:focus-visible` style exists in `globals.css` is not checked.
- Adaptive-mode resume of marks is not traced server-side (the client seeds `isMarkedForReview:false`).

All `player-client.tsx` references are to `app/mock-tests/[id]/take/player-client.tsx`.

## F3 status (2026-10-25)

Every P0 and P1 finding was re-checked against the code before fixing. **None was false; none was dropped.** Refinements found on re-check:
- P0-3 is worse than reported: the timer effect also depended on `seconds`, so it restarted every tick.
- The double submit at 0 was already blocked by `isSubmittingRef`. The drift and the repeated expiry calls were real.

Gate: `scripts/test_f3_player.cjs` (CI `F3-PLAYER`), 10/10. Against the pre-F3 code, 8 of 10 fail.

| # | Item | Status |
|---|---|---|
| P0-1 | Save failures shown as "Saved" | **Fixed.** The route returns 200 `{success:true}`, 409 `ATTEMPT_CLOSED` (RLS 42501) or 503 `SAVE_FAILED`, and never error text. The engine (`lib/assessment/answer-sync.ts`) shows "Saved" only on confirmation. The offline queue dequeues only confirmed saves. |
| P0-2 | Submit / auto-submit errors invisible | **Fixed.** A failed manual submit reopens the summary with the error and "Try submitting again". A failed auto-submit keeps a non-dismissible dialog with a retry. |
| P0-3 | Timer restarts, refires, drifts | **Fixed.** The deadline is anchored once from the server value, every tick recomputes from the clock, and it fires once (`lib/assessment/timer.ts`). |
| P0-4 | Beeps on by default, pulse | **Fixed.** No sound (the audio module is removed) and no pulse. One quiet final-minutes state: amber surface, "5 min left" text, and one polite announcement. |
| P0-5 | Options not keyboard / screen-reader operable | **Fixed.** A real radio group: `role=radio`, `aria-checked`, roving tab stop, ↑/↓, 48 px. The zoom button is now a sibling. Shared component; props unchanged. |
| P0-6 | Pending local answers not replayed | **Fixed.** On load, unconfirmed answers on the device are merged (they win) and sent again. |
| P1-07 | Resume at last question + visited | **Fixed on this device** (`localStorage`, no schema change). Resuming on another device starts at Q1. |
| P1-08 | CBT buttons | **Fixed.** Save & Next (clears the review mark, as in the CBT), Mark for Review & Next, no deselect on re-click, one-click Clear Response with a 5 s undo. `C` now selects option C. |
| P1-09 | Palette shapes / icons | **Fixed.** Answered: green square + ✓. Not answered: red square + –. Not visited: grey square. Marked: purple circle. Answered & marked: purple circle + ✓. The palette, legend and instructions share `PALETTE_STATES`. |
| P1-10 | One primary action | **Fixed.** "Save & Next" is the only filled action. Submit is an outline button in the header and in the mobile palette sheet. |
| P1-11 | Blocking tab / fullscreen modals | **Fixed.** A quiet, non-blocking inline notice; events are counted in the browser only (see PROCTOR-LOG-1 below). |
| P1-12 | 48 px targets | **Fixed** across the player, palette, dialogs and mobile bars. |
| P1-13 | Accessible dialogs | **Fixed.** Submit, instructions, palette sheet, option zoom and the time-over/submitting status all use `components/ui/dialog`. The custom clear-confirm and security modals are removed. |
| P1-14 | "Not saved — retrying" | **Fixed.** Distinct states: Saved, Saving…, Not saved — retrying, Offline — kept on this device, Time is over — saving stopped. Debounce is per question; backoff runs 1 → 30 s. |
| P2 | Trivial ones done | Contrast of "of N"; no total shown for adaptive tests; one section switcher, now a tablist with `aria-selected`; pulse removed (adaptive badge, result page); wordmark hidden below `sm`; offline banner neutral. |
| P2 | Not done (not trivial) | The pre-exam screen's 11 px copy. |
| P2 #17 | Result page | **Done in F4** (`scripts/test_f4_result.cjs`): light score card, one primary action (the top takeaway), one amber, leaderboard link only beside a real standing. |

**Follow-up check (2026-10-25): tab-switch / fullscreen-exit / devtools events were never recorded server-side**, before or after F3.
- `player-client.tsx` keeps `tabSwitchCount` / `fullscreenExitCount` in React state only; neither the pre-F3 player (15829db) nor the current one sends them anywhere.
- No devtools detection exists in the code.
- The database has no place for them: no proctoring table, and no such column on `test_attempts`.
- The F3 notice said "This is recorded with your attempt". That was false and is corrected to neutral copy.

**Proposal (schema change, not made): PROCTOR-LOG-1.** An append-only `attempt_integrity_events` table:
- columns: attempt_id, user_id, kind (TAB_HIDDEN / FULLSCREEN_EXIT), occurred_at, server received_at;
- RLS: no client grants;
- writes through a SECDEF RPC that takes `auth.uid()`, checks the attempt is the caller's and in progress, and rate-limits;
- the player sends events fire-and-forget, so the UI stays quiet;
- no devtools detection (unreliable and a false-positive risk);
- staff read only.

**Proposal (schema change, not made): PLAYER-RESUME-SERVER.** Add `last_question_order` and a visited set on `test_attempts`, so a resume restores the exact position on any device.

**E2E selectors updated with intent:** `scripts/e2e/student-journey.cjs` and `ensure-student-fixture.cjs`:
- options are `button[role=radio]`;
- the palette cell name is "Question n: state";
- the selected option is `[aria-checked=true]`.

BRAND-1 B-06 now asserts the one-state timer, still never red, with a non-colour cue.
