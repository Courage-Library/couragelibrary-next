# RESULT-UX-1 — Mock Result Page Spec v1 (owner-approved 23 Nov 2026)

Visual reference: `docs/design/result-ux-v1-reference.html` (desktop + phone, 15 numbered changes; sample numbers only). Palette/tokens/logo as in LANDING_V1_SPEC (cl-* tokens, public/brand/). Student navigation as in NAV_V1_SPEC (sidebar desktop / bottom bar phone).

## 0. Non-negotiables
- **Presentation only.** No DB schema, migration, RLS, API contract, scoring, marking, negative-marking or attempt-submission change. No production data writes.
- Use only data the result page (or existing server services) already has: attempt answers, correct answers, question topic/section, marks, time data, past attempts of the user. If a piece of data does not exist, **hide that element** (no fake values, no placeholders pretending to be data) and report it.
- Server remains authoritative; all calculations from server-loaded data, RLS-scoped to the signed-in user.
- **No emoji anywhere in the UI.** Line icons (SVG, existing icon set) only. Text symbols ▲ ▼ ✓ ✕ › allowed.
- Existing features kept and working: explanation, topic, Learn more link (now the main Learn button), Report question, Memory Lock, Mistake Vault, Re-attempt, history.
- Free/Pro (D1): paywall is off — show everything. Keep the existing feature-access hook so advanced blocks can be gated later; no PRO chips now.

## 1. Order of the page
Jump bar → Summary (score + comparison + trend) → Next 3 steps → Weak topics + Sections → Question review → Past attempts (collapsed).

## 2. Elements (numbers match the reference)
1. **Jump bar**: sticky chips Summary · Next steps · Weak topics · Sections · Question review · Past attempts (anchor links, active chip follows scroll); Re-attempt button at the right (existing route).
2. **Score**: "82.5 / 200" clean (proper minus sign "−", no space after it; tabular numbers). Remove the "% of maximum" line. Delta chip vs the **last attempt of the same mock**: "▲ +11.0 vs your last attempt (71.5)" (green) / "▼ −4.0 …" (coral) / hidden on the first attempt. One-line verdict from a small deterministic rule set (e.g. best/worst section, slow section) — no AI.
3. **Five tiles**: Correct · Wrong (with "−x" marks lost) · "Skipped · 0 marks" · Accuracy (correct / attempted) · Time used.
4. **Trend chart**: score in % for the last 5 attempts of the **same mock type only** (never mix different max marks); toggle Last 5 / All; current attempt highlighted; accessible label/text alternative. Hidden with < 2 attempts ("Take this mock again to see your trend"). Rank/percentile slot shown as a muted note "Rank & percentile appear once enough students take this mock" (no ranking logic in this phase).
5. **Your next 3 steps** (deterministic): (1) Learn the weakest topic → existing canonical learning link for that topic; (2) Practise the slowest or second-weakest topic → existing practice route for that topic (if none, link to practice home); (3) Revise mistakes → Mistake Vault (wording must match real behaviour: "Saved to Mistake Vault" only if mistakes are auto-saved today, else "Add your mistakes to Mistake Vault"). Fewer than 3 valid steps → show only the valid ones.
6. **Weak topics**: up to 4 topics with lowest accuracy (min 2 questions attempted per topic), "x / y correct · Section", coral bar, Learn + Practise buttons (Learn hidden if no learning link). Not enough data → "Answer more questions to see your weak topics".
7. **Sections table**: Score · Accuracy · Time · Pace per question for every section, with text label "on pace" / "too slow" (ideal = mock duration ÷ total questions unless the mock defines section times). Hide Time/Pace columns if per-section time is not recorded.
8. **Review filters**: segmented All / Wrong / Skipped / Correct with counts + section filter. Opens on **Wrong** when there are wrong answers. Filter state in the URL query.
9. **Option labels**: "✕ Your answer" (coral: border #FF6B4A, tint #FFF7F4, text #C2401F) and "✓ Correct answer" (green). Skipped questions show "Not answered" in the header and the correct label only. Labels are text, not colour only.
10. **One "Explanation" label** for every state (remove "Here's why").
11. **Actions per question**: one primary "Learn: <topic>" button (existing Learn more target) + icon buttons Mistake Vault, Memory Lock, Report (aria-label + tooltip, 44 px min). Header shows status chip ("Wrong · −0.5", "Correct · +2", "Skipped · 0") and time spent if recorded. "Next wrong ›" link on desktop. Long lists: collapsed rows (number, status chip, one-line question, chevron), expand on click; render efficiently for 100+ questions (no layout shift).
12. **Past attempts**: moved to the bottom, collapsed by default, same mock only, scores in %.

## 3. Phone (< 1024 px)
13. Jump chips scroll horizontally under the top bar.
14. Fixed bottom bar (above the student bottom nav or replacing it on this page — pick the one that keeps both reachable; report): "Re-attempt" + "Review N mistakes" (opens review mode on Wrong). Safe-area aware; content padded.
15. **Review mode**: one question per screen, filter chips at the top, "1 / 27" counter, Prev / Next wrong buttons in the bottom bar, explanation + Learn button visible, back returns to the summary at the same scroll position.
Tiles become 4 per row (time moves to the meta line). Next steps become compact rows with "Open ›".

## 4. Accessibility & quality
Headings in order (one h1). Charts have text alternatives. Visible focus ring; targets ≥ 44 px (48 where the project rule applies); keyboard reachable filters/expanders (aria-expanded). Reduced motion respected. CLS < 0.1. Works at 1366×768, 1920×1080, 768×1024, 390×844, 360×740. Loading skeletons for async blocks.

## 5. Copy (EN)
Summary · Next steps · Weak topics · Sections · Question review · Past attempts · Re-attempt · vs your last attempt · Your trend · Your next 3 steps · Correct · Wrong · Skipped · 0 marks · Accuracy · Time used · on pace · too slow · All · Wrong · Skipped · Correct · All sections · Your answer · Correct answer · Not answered · Explanation · Learn: <topic> · Practise · Next wrong · Review N mistakes · Answer more questions to see your weak topics · Take this mock again to see your trend.

## 6. Out of scope (backlog)
Rank/percentile calculation, previous-year cut-off line, Pro advanced analysis, answer-key/explanation consistency checker (content QA — separate phase), practice-result page redesign (report if it shares components), Hindi strings, any DB/API change.
