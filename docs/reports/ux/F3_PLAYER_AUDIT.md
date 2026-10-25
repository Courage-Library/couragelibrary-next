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
