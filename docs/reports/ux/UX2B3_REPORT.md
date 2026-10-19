# UX-2b.3: Mistakes + Practice

**Phase brief:** architect, 2026-10-19.
**Scope:** P0 fixes F-01 and F-02, the honesty fix F-09, and F-14 / F-15 / F-20 on these two routes, plus migrating `/mistakes` and `/practice` onto the design system.
**Unchanged:** Mistake Vault data, services, server actions, drill logic and RPCs, auth, the shell, the console, current affairs, and tokens.

Everything runs on a local production build (`next start` via `scripts/live/with-server.cjs`) on `couragelibrary-next`, browsing read-only as the QA student. The password comes from `.env.local` and is never printed. Screenshots mask the display name and any email address.

## 1. Files read and baseline

**Read:**
- `docs/reports/ux/UXT0_DESIGN_AUDIT_REPORT.md` (F-01, F-02, F-09, F-14, F-15, F-20; §5; the UX-2b.3 row)
- `DESIGN.md` (calibration table) and `PRODUCT.md`
- `docs/ux/DESIGN_SYSTEM.md`, `app/globals.css`
- `components/ui/{button,field,select,input,stat-tile,empty-state,accordion,card,badge,layout,pagination,alert,tabs,tag,spinner}.tsx` and `contrast-pairs.json`
- `docs/ux/pages/mistake-vault.md`, `docs/ux/pages/practice.md`
- `app/mistakes/{page,loading}.tsx`, `app/mistakes/actions.ts` (exports), `app/mistakes/drill/{page,drill-client}.tsx`, `components/mistakes/*` (the 11 files on the `/mistakes` route plus the drill customizer), `app/practice/page.tsx`
- `services/mistake.service.ts` (revision health, due labels, drill ranking: read only), `services/mistake-longitudinal-intelligence.service.ts` (cognitive type names: read only), `services/bookmark.service.ts` usage
- Every regression gate listed in §6, `docs/testing/PERMANENT_GATES.md` (student-data gate order), and the Impeccable (Operate, craft-floor, harden, clarify, audit) and Emil (design-eng, review-animations) skills

**Baseline** (taken before any edit, on HEAD `bf2672b`):

| Check | Result |
|---|---|
| Design ratchet | 8/8. rawColor 1 · paletteClass 5208 · darkClass 0 · smallText 463 · legacyImport 230 (stored baseline 5232 / 467 / 236) |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 232 warnings |
| `test_drill1 --offline` | 2/2 |
| `test_phase2_mistake_vault_lineage` | 47/47 |
| `test_phase3d_mistake_drill` | 35 passed / 1 failed (T36, a stale "14 protected tables" count): **pre-existing** |
| `test_phase4_mistake_intelligence` | 40 passed / 2 failed (T28, T40, learning-resource tables): **pre-existing** |
| `verify_phase3d_mistake_drill_runtime_gate` | 8 passed / 9 failed (stale expected row counts): **pre-existing** |
| UX suites | UX-1a 25/25 · UX-1b shell 7/7 · UX-1b shell a11y 75/75 · UX-2a 18/18 · CA routes 6/6 (UX-T0 runs, same app code) |
| Signed-in smoke | student-mistake 17/17 · student-pages 38 distinct checks, 0 failed (40 PASS lines, because one sign-in was retried) |
| No-personal-data | OK, 1374 files |
| DB row counts | see §7 |
| Signed-out behaviour | `/mistakes` 200 (empty state, no redirect) · `?bookmarked=true` 200 · `/mistakes/drill` 200 · `/practice` 200 |

The four legacy mistake suites are static or REST GET only; none writes data.

**Live `test_drill1` (D1–D10) was not run.** The documented student-data gate order starts with `cleanup-student`, which deletes qa-student's existing drill row and the smoke fixture. That would change row counts (a hard stop). Its offline part ran before and after (2/2).

## 2. `/practice` card decisions (F-01)

| Card (before) | Decision | Evidence the destination works |
|---|---|---|
| "Weak Area Remediation" / **Start Weak Topic Drill** (a `<Button>` with no action) | **Wired** as "Drill your mistakes" → `ButtonLink` to **`/mistakes/drill`** | `/mistakes/drill` is the drill builder (`app/mistakes/drill/page.tsx` → `MistakeDrillCustomizer`). It answers 200 for the student (L-1) and signed out (L-8). With 0 mistakes the builder reports "No eligible mistake questions found" when generating; nothing is created. The ranking ("highest priority first") is real: `generateMistakeDrill` ranks by MPI, due state and revision priority (`services/mistake.service.ts` ~L1493). 5–20 questions matches the builder's choices |
| "Bookmarked Questions" / **Practice Bookmarks** (a `<Button>` with no action) | **Wired** as "Bookmarked mistakes" → **`/mistakes?bookmarked=true`** | `app/mistakes/page.tsx` reads `bookmarked === "true"` → `bookmarkedOnly` in `getPaginatedMistakesList`. 200 for the student (L-1). With 0 bookmarks it shows the new "No bookmarked mistakes" empty state (L-6b). The copy is narrowed to *mistakes* you bookmarked, which is what the filter returns |
| Heading "Adaptive Practice Arena"; "previous years' questions (PYQ)" | **Removed.** h1 "Practice"; the lead promises only what exists | No PYQ route and no practice-session service exist (`docs/ux/pages/practice.md`: MISSING) |
| (new) "No mistakes yet? … Mock tests" | Added: a link to `/mock-tests` (200) | Gives a first-time student a next step |

## 3. Change log

| File | What | Findings |
|---|---|---|
| `app/practice/page.tsx` | Rewritten on `Container`, `Card`, `ButtonLink`; two working CTAs plus a mock-test link; plain copy; no legacy imports, palette classes or `transition-all` | F-01, F-14, F-20 |
| `app/mistakes/page.tsx` | Same data loading (services, arguments, `Promise.all`, batch queries untouched). New order: header → **Revise today** (one primary action) → counts (StatTile) → list (filters + cards + pagination) → **More about your mistakes** (Accordion: Revision plan · Your progress over time · Why you got it wrong · Topics to focus on). EmptyState-only view when the student has 0 mistakes. New `NO_BOOKMARKED` empty-state type (display only) | F-02, F-09, Operate layout |
| `mistake-hero.tsx` | h1 "Mistakes", a plain lead that states the real mastery rule (2 correct in a row, migration 085), and a count sentence. "Personal Revision Engine" removed | F-09 |
| `mistake-kpi-strip.tsx` | 5 `StatTile`s with hints. Plain counts (0 is honest). The tiles are no longer links; the same filters are links in the filter bar | F-09, F-14 |
| `mistake-revision-health.tsx` | Split into `MistakeRevisionToday` and `MistakeRevisionPlan`. **Revise today**: due / high-priority sentence, one primary "Start a drill", an `<ol>` of the top 3 with `ButtonLink`s ("Learn", "Drill", and an icon link named "Open mistake: {topic}"); this replaces the unnamed icon link inside `<Link><Button>` (the axe button-name / link-name criticals). **Revision plan**: "Mastered n of N" replaces "Retention Rate 0%" (a mastered share mislabelled as retention), "Revision score n / 100" with its meaning, patterns in sentences. MPI is no longer shown. The service's due labels are mapped to plain language **in the UI only** (`plainDueLabel`) | F-02, F-09 |
| `mistake-longitudinal-card.tsx` | "Your progress over time". StatTiles "Error rate" (— until the sample is sufficient), "Test types with mistakes" (— with 0 contexts; was "0"), **"Stayed mastered": — + "Master a mistake to see your retention" when 0 mastered (was "100%")**. Plain trend badges ("No trend yet", not "Not enough data yet", next to a real rate); the period switcher uses `aria-pressed` and 44px buttons. Load errors are announced (`role="alert"`, previously swallowed). The bar uses `primary-600` on `ink-200`; no `transition-all`, no opacity on text | F-09, F-14, F-15, F-20 |
| `mistake-filter-bar.tsx` | **Server component.** Status and bookmark filters are links (`aria-current`, 44px, `prefetch={false}`). Search, Subject, "Why it went wrong" and Sort are a **GET form** with labelled `Field` + `Select` / `Input` and an explicit "Apply filters" button: no navigation on select change (WCAG 3.2.2), works without JS. Hidden inputs keep `status`/`repeated`/`bookmarked`; `page` is dropped. **URL contract unchanged** (L-7). Removed the dead `animate-in fade-in` | F-02 (select-name), F-14, F-15, F-20 |
| `mistake-card.tsx` | `Card` + `Badge` tones; `ButtonLink`s with context ("Review solution: {topic}"), no `<Link><Button>`; "Drill" now opens the builder for **this** mistake (`/mistakes/drill?vaultId=`, the same contract the service's own `drillUrl` uses), where the old "Practice" button opened the generic builder; `formatDateShort` (Indian date) | F-02, F-09, F-14, F-15 |
| `mistake-bookmark-button.tsx` | Same props, action call, optimistic toggle and rollback. Visuals now use `Button` (44px; `iconOnly` with a stable name "Bookmark question" + `aria-pressed`); the error is announced with `role="alert"`. Also used by the detail page and the drill runner / result (visual change only) | F-02, F-14 |
| `mistake-pagination.tsx` | Server component wrapping `ui/Pagination` (real links; filters kept; only `page` changes) | F-14, F-20 |
| `mistake-empty-state.tsx` | `EmptyState` with one action per state; new "No bookmarked mistakes"; honest copy | Empty states |
| `mistake-sidebar.tsx` | Now `MistakeReasons` (filter links, unchanged `?cognitive=&status=` hrefs, `aria-current`; **names only**, because the stored descriptions say "deterministically inferred from telemetry") and `MistakeFocusTopics`. "slips" → "mistakes" | F-09, F-14, F-15 |
| `docs/reports/ux/UX1_DESIGN_RATCHET.json` | Lowered (`--write`; refused if anything rose) | §5 |
| `scripts/test_ux2b3_mistakes_practice.cjs` | New permanent gate (§6) | Tests |

**Not changed:**
- `app/mistakes/[id]/page.tsx` and the drill pages (`app/mistakes/drill/*`, customizer, runner, result).
- `actions.ts`, all services, the DB and auth.
- No `loading.tsx` was added: `/mistakes` already has one, and `/practice` is static (`revalidate = 60`) with no data wait.

## 4. Before and after

Screenshots:
- Before: `docs/reports/ux/ux2b3/before/shots/`
- After: `docs/reports/ux/ux2b3/after/shots/`

Names are `{out|in}_{route}_{360|768|1280}.jpg`, plus `in_mistakes_insights_open_{360,1280}.jpg` (all accordion panels open). Raw data: `before/runtime_before*.json`, `after/runtime_after.json`.

| View | Before | After |
|---|---|---|
| `/mistakes` signed in @360 | `before/shots/in_mistakes_360.jpg`: 9 stacked panels before the list; 64 text elements below 12px; 34 of 42 targets in `<main>` below 44px | `after/shots/in_mistakes_360.jpg`: Revise today → counts → list; 0 below 12px; 0 of 31 below 44px |
| `/mistakes` @768 / @1280 | `before/shots/in_mistakes_{768,1280}.jpg` | `after/shots/in_mistakes_{768,1280}.jpg`; panels open: `after/shots/in_mistakes_insights_open_{360,1280}.jpg` |
| `/mistakes?bookmarked=true` (0 bookmarks) | old "No Matching Mistakes" | `after/shots/in_mistakes_bookmarked_true_*.jpg`: "No bookmarked mistakes" |
| `/mistakes?q=<no match>` | — | `after/shots/in_mistakes_q_zz-no-match-uxt_*.jpg`: "No mistakes match these filters" |
| `/mistakes` signed out (0 mistakes) | old notebook-empty card | `after/shots/out_mistakes_*.jpg`: "No mistakes yet" + "Take a mock test" |
| `/practice` | `before/shots/{in,out}_practice_*.jpg`: dead buttons, "Adaptive Practice Arena" | `after/shots/{in,out}_practice_*.jpg` |

**axe** (WCAG 2.0 / 2.1 / 2.2 A + AA; serious and critical nodes):

| View | Before | After |
|---|---|---|
| `/mistakes` signed in @360 | **button-name (critical) ×2, select-name (critical) ×2, link-name (serious) ×2, color-contrast (serious) ×15** | **0**; also 0 with every accordion panel open, at 360 / 768 / 1280 (L-2) |
| `/mistakes` signed in @1280 | same as @360 | **0** |
| `/mistakes` signed out | not captured | 0 |
| `/practice` signed in / signed out | 0 (the problem was dead controls, not markup) | 0 |

No horizontal overflow on any view, before or after.

## 5. Ratchet

| File | palette | smallText | legacyImport | transition-all |
|---|---|---|---|---|
| `app/practice/page.tsx` | 13 → 0 | 0 → 0 | 4 → 0 | 2 → 0 |
| `app/mistakes/page.tsx` | 1 → 0 | 0 → 0 | 1 → 0 | 0 → 0 |
| `components/mistakes/mistake-hero.tsx` | 10 → 0 | 0 → 0 | 2 → 0 | 0 → 0 |
| `components/mistakes/mistake-kpi-strip.tsx` | 15 → 0 | 0 → 0 | 1 → 0 | 1 → 0 |
| `components/mistakes/mistake-revision-health.tsx` | 91 → 0 | 13 → 0 | 2 → 0 | 1 → 0 |
| `components/mistakes/mistake-longitudinal-card.tsx` | 102 → 0 | 23 → 0 | 1 → 0 | 2 → 0 |
| `components/mistakes/mistake-filter-bar.tsx` | 54 → 0 | 2 → 0 | 1 → 0 | 3 → 0 |
| `components/mistakes/mistake-card.tsx` | 42 → 0 | 12 → 0 | 2 → 0 | 1 → 0 |
| `components/mistakes/mistake-bookmark-button.tsx` | 23 → 0 | 0 → 0 | 1 → 0 | 2 → 0 |
| `components/mistakes/mistake-pagination.tsx` | 10 → 0 | 0 → 0 | 1 → 0 | 1 → 0 |
| `components/mistakes/mistake-empty-state.tsx` | 38 → 0 | 0 → 0 | 2 → 0 | 0 → 0 |
| `components/mistakes/mistake-sidebar.tsx` | 24 → 0 | 2 → 0 | 1 → 0 | 0 → 0 |
| **Total (12 files)** | **423 → 0** | **52 → 0** | **19 → 0** | **13 → 0** |

**Repository totals** (app/ + components/, admin excluded): rawColor 1 → 1 · **paletteClass 5208 → 4785** · darkClass 0 → 0 · **smallText 463 → 411** · **legacyImport 230 → 211**. These are exactly the UX-T0 estimates (−423 / −52 / −19).

**Stored baseline** `UX1_DESIGN_RATCHET.json`: 5232 / 467 / 236 → **4785 / 411 / 211**. The written baseline also records drops from earlier phases that had never been written, e.g. `app/loading.tsx` (removed in UX-2a.1); `--write` refuses any rise.

## 6. Tests

**New gate:** `scripts/test_ux2b3_mistakes_practice.cjs`. Final run: **28/28** (6 static + 22 live).

| ID | Check | Result |
|---|---|---|
| S-1 | the 12 touched files score 0 on the ratchet metrics | PASS |
| S-2 | no `transition-all`, dead `animate-in` / `zoom-in` / `fade-in` / `slide-in` / `animate-pulse-subtle`, hover scale, weights above 700, or `opacity-*` | PASS (32 hits in the HEAD versions; not vacuous) |
| S-3 | no `<Link>` / `<a>` wrapping a `<Button>` / `<button>` | PASS (4 files at HEAD) |
| S-4 | `/practice`: CTAs are links; no "Adaptive" / PYQ | PASS |
| S-5 | no jargon in the `/mistakes` UI source (MPI, Cognitive Failure Breakdown, Longitudinal Journey, Cross-Exam Intelligence, Personal Revision Engine, Remediation, slip) | PASS (14 hits at HEAD) |
| S-6 | retention shows "—" (null) with 0 mastered; no "100%" fallback | PASS |
| L-1 | `/practice` CTAs → `/mistakes/drill` 200, `/mistakes?bookmarked=true` 200, `/mock-tests` 200; 0 `<button>` in `<main>` | PASS |
| L-2 | `/mistakes` signed in, axe 0 critical / serious, panels closed and open | PASS @360 / 768 / 1280 |
| L-3 | 3 selects, all labelled; 0 nested; 0 unnamed of 31 controls | PASS @360 / 768 / 1280 |
| L-4 | 0 of 128 text elements below 12px in `<main>`; @360 0 of 31 targets below 44px | PASS @360 / 768 / 1280 |
| L-5 | 0 mastered → tile "Stayed mastered \| — \| Master a mistake to see your retention"; no %; no jargon (including UX-1b "telemetry" / "deterministic") on the rendered page | PASS |
| L-6a / b / c | EmptyState: 0 mistakes (anonymous visitor), 0 bookmarks (qa-student has 0), filtered to nothing | PASS |
| L-7a–f | filter links carry `status=UNRESOLVED/REVISITING/MASTERED`, `repeated=true`, `bookmarked=true`; status / repeated return only matching cards (2 = 1 + 1 + 0); `q=` narrows; `sort=` / `page=` accepted; Subject + "Apply filters" → `?subject=` with status kept, page dropped, and no navigation on select change; `cognitive=` accepted | PASS |
| L-8 | signed out: the 4 URLs answer 200 with no redirect, as before | PASS |
| L-9 | read-only: the only non-GET request is the sign-in | PASS |

**Regression** (final code and build):

| Gate | Before | After |
|---|---|---|
| `test_drill1 --offline` | 2/2 | **2/2** (identical) |
| `test_phase2_mistake_vault_lineage` | 47/47 | **47/47** (identical) |
| `test_phase3d_mistake_drill` | 35/36 (T36 pre-existing) | **35/36**, identical output |
| `test_phase4_mistake_intelligence` | 40/42 (T28, T40 pre-existing) | **40/42**, identical output |
| `verify_phase3d_mistake_drill_runtime_gate` | 8/17 (pre-existing stale counts) | **8/17**, identical output |
| `test_ux1a_a11y` | 25/25 | **25/25** |
| `test_ux1b_shell` | 7/7 | **7/7** |
| `test_ux1b_shell_a11y` | 75/75 | **75/75** |
| `test_ux2a_landing` | 18/18 | **18/18** |
| `test_ca_routes` | 6/6 | **6/6** |
| signed-in smoke student-mistake | 17/17 | **17/17** |
| signed-in smoke student-pages | 38 distinct, 0 failed | **38/38, 0 failed** (same 2 VACUOUS WARN: no detail link on /community, /flashcards) |
| no-personal-data | OK, 1374 files | **OK, 1374 files**; the new files pre-scanned: 0 findings |
| design ratchet | 8/8 | **8/8** (lowered baseline) |
| `npm run typecheck` | 0 errors | **0 errors** |
| `npm run lint` | 0 errors, 232 warnings | **0 errors, 230 warnings** |
| `npm run build` | — | **exit 0** |

## 7. DB counts

Taken with `BEGIN READ ONLY` on the 6543 pooler with verified TLS; counts only.

**Before == after == final:** all **22 identical**.

| Table | Rows |
|---|---|
| `user_mistake_vault` | 80 |
| `user_mistake_occurrences` | 91 |
| `user_mistake_drills` | 1 |
| `user_question_bookmarks` | 0 |
| `questions` | 113 |
| `question_versions` | 113 |
| `question_options` | 448 |
| `test_attempts` | 34 |
| `attempt_answers` | 324 |
| `test_results` | 13 |
| `section_results` | 24 |
| `coin_ledger` | 10 |
| `coin_wallets` | 6 |
| `gamification_events` | 9 |
| `user_streaks` | 6 |
| `user_badges` | 0 |
| `mock_tests` | 8 |
| `mock_questions` | 350 |

qa-student scoped: vault 2 · bookmarks 0 · attempts 1 · drills 1.

**Why nothing could have changed:**
- Every browser harness logged non-GET requests: the only one was the sign-in POST.
- No bookmark, drill, note or form submit other than the GET filter form was ever triggered.
- No DB script wrote anything.

## 8. `git diff --stat` (before commit)

```
 app/mistakes/page.tsx                             | 211 +++++-----
 app/practice/page.tsx                             | 125 +++---
 components/mistakes/mistake-bookmark-button.tsx   |  78 ++--
 components/mistakes/mistake-card.tsx              | 212 +++-------
 components/mistakes/mistake-empty-state.tsx       | 190 ++++-----
 components/mistakes/mistake-filter-bar.tsx        | 386 +++++++-----------
 components/mistakes/mistake-hero.tsx              |  58 +--
 components/mistakes/mistake-kpi-strip.tsx         | 105 +----
 components/mistakes/mistake-longitudinal-card.tsx | 475 ++++++++--------------
 components/mistakes/mistake-pagination.tsx        | 119 +-----
 components/mistakes/mistake-revision-health.tsx   | 346 ++++++----------
 components/mistakes/mistake-sidebar.tsx           | 165 ++++----
 docs/reports/ux/UX1_DESIGN_RATCHET.json           |  45 +-
 13 files changed, 928 insertions(+), 1587 deletions(-)
```

**New files:**
- `scripts/test_ux2b3_mistakes_practice.cjs`
- this report
- `docs/reports/ux/ux2b3/` (before/after screenshots and JSON)

Everything is inside the allowed list. The local-only `docs/reports/ops/PUBLIC_REPO1_REPORT.md` stays uncommitted.

## 9. Skill rules applied and rejected

| Skill rule | Applied? | How / why |
|---|---|---|
| Impeccable Operate: primary task first, one primary action | applied | "Revise today" with a single primary "Start a drill"; everything else is secondary or ghost |
| Impeccable Operate: every state designed | applied | 6 empty states (including the new 0-bookmarks state), loading (existing segment skeleton), period-switch error announced |
| Impeccable clarify / harden: plain language, no invented metrics | applied | jargon removed; ratios with empty denominators show "—"; the "Retention rate" mislabel corrected |
| Impeccable: stat tiles / hero metrics are a reflex | **adapted** (DESIGN.md C-2) | StatTile on an Operate page where the count is the content; every tile has a text hint |
| Impeccable craft-floor: no eyebrow / kicker | applied | none added; the old "Personal Revision Engine" pill was removed |
| Impeccable: sparklines / bars as content stand-ins | **adapted** (C-3) | the reasons bars sit next to their count and percentage and are `aria-hidden` |
| Emil: no `transition: all`; named properties; UI under 300ms; `ease-standard` | applied | `transition-colors duration-120 ease-standard` only (C-7: no new curves) |
| Emil: remove motion without purpose (hover scale, dead keyframes) | applied | dead `animate-in` / `fade-in` removed; no hover scale; spinner only inside a pending button (`motion-safe`) |
| Emil: `scale(0.97)` on `:active` | **rejected for now** | it would need new classes on primitives (UX-2b.0 motion tokens are not approved); not a defect |
| Emil: reduced motion "gentler, not zero" | **rejected** (C-12) | non-essential motion stays at zero; the only motion is the existing primitives' chevron rotate (`motion-reduce` guarded) |
| Accordion closed "on mobile" | **adapted** | the `Accordion` primitive has no responsive default, so it is closed at every width (no new primitive API in this phase) |

## 10. Follow-ups found (not done)

1. **Drill pages are not migrated** (customizer / runner / result).
   - `/mistakes/drill`, which `/practice` now links to, still says "Adaptive Priority Scoring", "Mistake Priority Index (MPI)" and "Remediation Drill" in legacy blue.
   - This is the next honesty item.
   - It was left alone per the brief, because drill visuals touch the DRILL-1 flow and need the live drill gates.
2. **`/mistakes/[id]` detail page is not migrated** (legacy imports, palette classes). The student-mistake smoke reads its "QUESTION PROMPT" label, so migrate it together with the smoke.
3. **Signed-out `/mistakes` returns 200 with an empty vault.** The spec wants a redirect to `/auth/login?next=/mistakes`. That is an auth change, out of scope; the behaviour was kept exactly as before.
4. **System words in DB content:**
   - `mistake_cognitive_types` descriptions ("deterministically inferred from telemetry") are hidden in the UI rather than edited;
   - the service's due labels / reasons ("Due for 2nd Verification", "remediation") are mapped in the UI. phase-4 T13 asserts the service string, so cleaning it at the source needs a test update.
5. **`router.push` navigations were cancelled** (RSC `ERR_ABORTED`) while many `<Link>` prefetches were in flight on `/mistakes`. Fixed here by making the filters a GET form and turning prefetch off on the filter links. Other client filters built on `router.push` (e.g. the `/mock-tests` category switcher) may hang the same way on slow networks; worth checking in UX-2b.2.
6. **Live `test_drill1` D1–D10 and `student-drill.cjs`** need a planned student-data window: cleanup → journey → drill → cleanup → fixture → smoke, with the owner's OK, because the cleanup deletes qa-student's current drill row.
7. **Pre-existing failing legacy suites:** phase3d T36, phase4 T28 / T40, and `verify_phase3d…` (9 stale row-count expectations). These are candidates for GATE-HYGIENE (re-baseline or retire).
8. **"Revision score n / 100"** is a composite from the service; a product decision is needed on whether to keep showing it.
9. **Intermittent middleware `getUser` "fetch failed"** to Supabase appears in every local server run, including the baseline. Once (in an early capture) it rendered the signed-out shell for a signed-in request. The new gate retries a page until the signed-in view renders.
10. **`/practice` is still only a mistakes hub.** Topic practice needs the practice-session service (UX-6 spec).
11. **Register the new gate.** `docs/testing/PERMANENT_GATES.md` should list `test_ux2b3_mistakes_practice.cjs` (`--offline`, and live via with-server); the file is not in this phase's allowed list.

## 11. FINAL STATUS

**UX-2b.3 status: CLOSED.**

- **Fixed:**
  - F-01: both `/practice` CTAs are wired to working routes.
  - F-02: `/mistakes` axe went from 2 critical button-name + 2 critical select-name + 2 serious link-name + 15 serious contrast nodes to 0, at 360 / 768 / 1280, with panels closed and open.
  - F-09: "100%" with 0 mastered is now "—", "Retention 0%" is now "Mastered 0 of 2", and the jargon is gone.
  - F-14 / F-15 / F-20 on both routes.
- **Ratchet:** −423 palette / −52 small text / −19 legacy imports; baseline lowered.
- **Nothing else moved:** every regression gate and every DB count is unchanged.
- **Commit:** one local commit, not pushed or deployed.

**Proposed next phase (not started): UX-2b.3b, Drill + mistake detail.** Migrate `/mistakes/drill` (customizer / runner / result) and `/mistakes/[id]`:
- remove "MPI" / "Adaptive" / "Remediation";
- remove the legacy blue;
- make "+5 coins" honest per B-DRILL-REWARD-ARGS;
- run it inside an owner-approved student-data window, so the live DRILL-1 gates (`test_drill1` D1–D10, `student-drill.cjs`) run before and after.

If the drill window cannot be scheduled, the next phase is **UX-2b.1, Dashboard + results + pre-test.**
