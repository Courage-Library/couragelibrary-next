# EXAM-UX-1 — Exam Screen Layout Spec v1 (owner-approved 23 Nov 2026)

Visual reference: `docs/design/exam-ux-v1-reference.html` (desktop + phone, numbered changes). Palette/tokens/logo as in LANDING_V1_SPEC (cl-* tokens, public/brand/).

## 0. Non-negotiables (engine untouched)
Server-authoritative timer (resume from server start time), autosave, answer restore, manual Next only (no auto-advance), full screen, tab-switch/devtools detection, watermark (kept, lighter), submit confirmation, auto-submit at expiry, scoring/marking, report-a-question flow, attempt creation/submission APIs. **This phase changes layout and presentation only.** No DB, API, RLS or scoring change.

## 1. Desktop (≥ 1024 px) — whole screen fits the viewport (100dvh), no page scroll
Rows: top bar 60 px · section tabs 52 px · content (fills) · action bar 68 px.
1. **Fixed action bar** (bottom, always visible): left: "Mark for review & next" (outline), "Clear response" (text); right: "‹ Previous" (outline), "Save & Next ›" (primary cl-blue). 44–48 px targets. Same handlers as today.
2. **One scroll area**: only the question panel scrolls (long passages/options). Palette column is fixed (scrolls internally only if a section has > 25 questions). No page-level scrollbar, no nested double scrollbars.
3. **Palette legend = one block with counts** for all 5 states: Answered (green), Not answered (red), Not visited (outline), Marked for review (violet circle), Answered & marked for review (violet circle + green dot). Counts per current section. Remove the separate bottom legend and the old 3-card summary.
4. **Section tabs in one row**: compact tabs with name + "answered/total" (active: white raised tab, count in cl-blue-text). Overflow → horizontal scroll (no wrapping to a second row). Keyboard/arrow accessible.
5. **Filters with counts**: All N · Not answered N · Marked N (segmented). **Remove "Go to question no."** (the grid covers it).
6. **Timer**: label "Time left" + mm:ss (hh:mm:ss if ≥ 1 h); states: normal (cl-blue-tint) → amber at ≤ 5:00 → red at ≤ 1:00; aria-live announcements at 5 min and 1 min only (not every second); tabular numbers; colour never the only signal (label + announcement).
7. **Logo**: logo-suite lockup (mark + "Courage Library" wordmark), not uppercase text. Title centred, truncates with ellipsis.
8. **Watermark**: same content and coverage, lower opacity (≈ 3–4% ink), still under content and non-selectable.
Top bar right: Saved/Saving status chip · timer · Instructions · Full screen · "Submit test" (outline, existing confirmation).
Palette grid: 5 columns, 44 px buttons, current question ring (2 px cl-blue with white gap), state colours as legend.

## 2. Phone/tablet (< 1024 px)
Rows: top bar 54 px · section tabs 44 px (horizontal scroll) · question (scrolls) · action bar 64 px + safe-area.
- Top bar: logo mark · truncated title · timer (same states) · grid icon button (48 px).
- Action bar: Previous (icon) · Mark for review (icon) · Clear (icon) · **Save & Next** (wide primary). Icon buttons have aria-labels + tooltips.
9. **Palette sheet**: grid icon opens a bottom sheet: section title, legend with counts (5 states), filters, grid, **Submit test** button (with existing confirmation). Focus trap, Esc/overlay/drag closes, returns focus.
Instructions and Full screen move into the sheet's top area (or an overflow ⋯ in the sheet). Nothing is lost.

## 3. Accessibility & quality
Keyboard: Tab order top bar → tabs → question/options → action bar → palette; options are radio-group semantics; palette buttons have labels ("Question 7, not answered"). Visible focus ring. Targets ≥ 44 px (48 px where the project rule applies). Reduced motion respected. No layout shift when answering, marking or changing questions (CLS < 0.1). Works at 1280×720, 1366×768, 1920×1080, 768×1024, 390×844, 360×740 without the action bar ever being off-screen.

## 4. Copy (EN; HI only if the exam UI already has Hindi strings)
Time left · Saved / Saving… · Instructions · Full screen · Submit test · Mark for review & next · Clear response · Previous · Save & Next · All · Not answered · Marked · Answered · Not visited · Marked for review · Answered & marked for review · Report this question.

## 5. Out of scope
Question language toggle (EN/हिंदी questions — later, when Hindi questions exist), result page redesign, practice runner redesign (unless it shares the same components — report first), new features.
