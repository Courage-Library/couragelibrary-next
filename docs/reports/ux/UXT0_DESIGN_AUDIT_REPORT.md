# UX-T0: design tooling calibration and design audit

**Phase brief:** architect, 2026-10-19. **Mode:** read-only for product UI.

**Changed in this phase** (allowed list only):
- `PRODUCT.md`
- `DESIGN.md`
- this report
- `docs/reports/ux/uxt0/`
- the skill folders `.claude/skills/` and `.agent/skills/`, committed as installed

No product code, scripts, config or database changed. The Impeccable hooks were **not** enabled.

**Environment:**
- A local production build (`next start` via `scripts/live/with-server.cjs`, port 3100) on HEAD `ccd6465`.
- Database: development project `couragelibrary-next`, accessed read-only through the app.
- Signed out, and signed in as the QA student. The password came from `.env.local`; it was never printed and never appears in a screenshot.
- Widths: 360, 768 and 1280px.

## 0. Tooling status

| Tool | Result |
|---|---|
| Impeccable v4.6.0 launcher (`.claude/skills/impeccable/scripts/impeccable context`) | **Failed closed.** "cannot verify …/engine-v0.1.15/impeccable-windows-x64.exe against …" (exit 127). No binary was kept; only an empty `~/.impeccable/bin/0.1.15` directory remains, outside the repo. No `.impeccable/` project config was created. As SKILL.md and the brief say, I sent "Context loading did not run; I'll read the existing project context directly." and continued without any workaround |
| Impeccable `critique` / `audit` | Run **manually** from `reference/critique.md` and `reference/audit.md` (heuristics, the 5 audit dimensions, P0–P3) on rendered screenshots, axe-core, computed-style probes and source. The audit's *Implementation Integrity* dimension needs the bundled detector (the engine), so the design ratchet and the static metrics in §5 stand in for it |
| Emil `review-animations` | Run manually from its checklist over every motion use (§6) |
| Hooks | Not installed, not enabled (`/impeccable hooks on` was not run) |
| Harness | Playwright plus axe-core already in `node_modules` (no new dependency). The scripts live in the session scratchpad, not the repo. Raw output is in `docs/reports/ux/uxt0/*.json` |

## 1. Files read and locked decisions

**Canonical system:**
- `docs/ux/DESIGN_SYSTEM.md` (278 lines; it wins over any skill);
- `app/globals.css` (179 lines; `@theme static` tokens);
- `components/ui/*` (30 primitives plus `domain/` and `legacy/`) and `components/ui/contrast-pairs.json` (49 pairs, minimum 4.55:1);
- `scripts/test_design_ratchet.cjs` and `docs/reports/ux/UX1_DESIGN_RATCHET.json`.

**Reports:**
- `UX0_DISCOVERY_REPORT.md`
- `UX1A_REPORT.md`
- `UX1B_REPORT.md`
- `UX2A_REPORT.md`
- `UX2A1_REPORT.md` (§2 copy items)

**IA and specs:**
- `docs/ux/SITEMAP_IA.md`;
- the 16 page specs in `docs/ux/pages/`: README, analytics, course-path-player, courses-catalogue, dashboard, exam-detail, exams-directory, landing, mistake-vault, my-exam-home, onboarding, practice, pricing, profile-settings, test-flow, test-series-catalogue, test-series-detail.

**Product docs** (`docs/product/`): candidate-learning-loop, exam-knowledge-product-spec, feature-map, learning-product-spec, platform-overview.

**Skills:**
- Impeccable: `SKILL.md`, `reference/craft-floor.md`, `critique.md`, `audit.md`, `operate.md`.
- Emil: `emil-design-eng/SKILL.md`, `review-animations/SKILL.md`. `animate` and `animation-performance` were skimmed for token values.

**Locked decisions found** (number → meaning as stated in the sources):

| # | Decision | Source |
|---|---|---|
| #15 | security/auth hygiene rules (meaning given only as "SEC rules") | UX0 L350, SITEMAP_IA L4 |
| #19 | login return parameter is `next`, sanitised; session check display-only | SITEMAP_IA, UX2A L41 |
| #20 | canonical guards; redirect via `/auth/login?next=` | SITEMAP_IA, profile-settings |
| #26 | pages are views over systems | SITEMAP_IA L9 |
| #27 | course = the exam's syllabus path | SITEMAP_IA |
| #28 | test series package mocks over one engine | SITEMAP_IA, test-flow |
| #29 | onboarding writes the candidate profile | SITEMAP_IA, onboarding |
| #30 | one design system for every student page | DESIGN_SYSTEM L3 |
| #31 | visual language: light, violet primary, decorative cyan | UX2A L44 |
| #35 | English-only admin bulk import | UX1B |
| #38 | no runtime DB driver (`pg`/`postgres`) in the app (not in the UX docs) | `docs/testing/PERMANENT_GATES.md` L14 |
| #40 | design ratchet: counts may only fall | UX1A, UX1B |
| #44 | no new dependency (no Lighthouse) | UX2A |
| #46 | 1200px content width | UX2A |
| #47 | honest site description; no "N+ / thousands" claims | UX2A1 |
| #48 | no root `loading.tsx`; segment skeletons | UX2A1 |
| #49 | sitemap lists only existing, published routes | UX2A1 |

System decisions from later phases that also bind this work:
- #52–#56 (security / CI / gate rulings; #54 least privilege; #56 smoke wait strategy);
- #57 (the repository is public);
- #58 (history rewrite).

**Owner decisions in UX-0 §7:**
- violet `#5000F0` primary;
- cyan accent only;
- Free/Pro, with the correct answer never paywalled;
- **English-only UI for now** (see §10);
- test series before courses.

## 2. Skill Calibration Table

The full table (C-1 to C-20) is in **[DESIGN.md](../../../DESIGN.md#skill-calibration-table)**. It is not repeated here, so it cannot drift. Summary:

| Resolution | Rows |
|---|---|
| **adopt** | C-8 (no `transition: all`, under 300ms, no ease-in), C-10 (no `scale(0)`), C-11 (hover gating; Tailwind v4 already does this), C-13 (skeletons, not spinners), C-15 (no gradient text, emoji icons or thick side borders) |
| **adapt** | C-1 eyebrow (one per section, informative only; the UX-2a hero pill stays), C-2 stat tiles (Operate only, not Persuade vanity), C-3 rings/sparklines (always beside the number and text), C-6 fluid headings kept (body sizes are already fixed), C-7 Emil curves (proposed tokens, §6), C-9 `:active` scale (outside the console only), C-12 reduced motion (zero for non-essential), C-14 numbers only for real sequences, C-16 Persuade ambition via precision rather than imagery, C-20 no entry/stagger motion on Operate lists |
| **reject** | C-4 light/dark by use scene (light-only is locked), C-5 font sourcing (Inter plus Noto Sans Devanagari is locked), C-17 custom scrollbars, C-18 hooks / auto-edit |
| **n/a** | C-19 detector-based integrity score (the engine is unavailable) |

## 3. Surface → mode map

Also in DESIGN.md.

| Mode | Surfaces audited |
|---|---|
| **Operate** | `/dashboard`, `/mock-tests`, `/mock-tests/[id]` (pre-test), `/mock-tests/[id]/result`, `/mistakes`, `/performance`\*, `/practice`, `/flashcards`, `/achievements`\*, `/notifications` |
| **Operate: console (frozen)** | `/mock-tests/[id]/take`, `/live-tests/[slug]/take`: static source review only |
| **Read** | `/current-affairs` (hub; no article exists, see below), `/articles`, `/exams`, `/exams/[slug]`, `/courses`\* |
| **Persuade** | `/pricing`, `/auth/login`, `/auth/signup` (landing excluded: UX-2a is closed pending owner review) |

\* Dormant behind feature flags in this build:
- `/performance` (PSYCHOMETRICS) and `/achievements` (LIVE_TESTS) render a **soft 404** (HTTP 200; F-10);
- `/courses` (COURSES) returns a real 404.

These were audited statically only.

**Two surfaces could not be audited at runtime:**
- **Current affairs article:** the dev database has **0 published** CA articles, so there was no article to open. Only the hub and its empty state were audited; `/current-affairs/[slug]` was reviewed statically. **No DRAFT content appeared on any candidate page.** The hub showed 0 events, and `test_ca_routes.cjs` (which asserts that no DRAFT leaks) passed 6/6 before and after.
- **Test console:** not opened. "Start Mock" (`start-test-action-button.tsx:30`) navigates straight to `/take`, which starts an attempt, so opening it would create a real attempt. It was reviewed **statically only** (F-21, §6). No attempt was created or submitted.

**Impeccable audit scores (manual, 0–4 per dimension):**

| Surface group | A11y | Perf | Responsive | Theming (tokens) | Anti-patterns | Total /20 |
|---|---|---|---|---|---|---|
| Operate (dashboard, mock-tests, result, mistakes) | 2 | 2 | 2 | 1 | 1 | **8** |
| Read (CA hub, exams, exam detail, articles) | 3 | 2 | 3 | 1 | 2 | **11** |
| Persuade (pricing, login, signup) | 2 | 3 | 3 | 1 | 1 | **10** |

**Impeccable critique** (Nielsen heuristics, the weakest first):

| Heuristic | Score | Why |
|---|---|---|
| H2 match with the real world | **1/4** | system words such as "MPI", "Cognitive Failure Breakdown", "readiness engine", "Event Intelligence" |
| H8 aesthetic and minimalist design | **1/4** | the mistakes page has 9 stacked analytic panels before the list; the exam detail page is 50,000px tall at 1280px |
| H1 visibility of system status | **2/4** | false "being processed" / "being curated" states |
| H4 consistency | **2/4** | blue legacy primary next to the violet shell; three different "card" styles on one page |
| H5 error prevention / H9 recovery | **3/4** | generally sound |

**Persona notes:**
- **First-time student on a 360px Android:** reaches the mock-tests list fine. The dashboard does not say what to do today, and `/practice` buttons are dead (F-01).
- **Returning student after a mock:** gets a result page with a strong score hero. Rank and percentile shown for a cohort of 3 erode trust (F-05).

## 4. Findings (P0 → P2)

Screenshots are in `docs/reports/ux/uxt0/shots/` and are named `{out|in}_{route}_{width}.jpg`. In the evidence column, "shots/…" is relative to `docs/reports/ux/uxt0/`.
- 84 JPEGs, about 6 MB.
- Each is a full page clipped at 6,000px.
- In full-page captures at 360px, the fixed bottom nav appears mid-page; this is a capture artefact, not a layout bug.

Raw data:
- `runtime_findings_raw.json`: per page, width and session; axe violations, overflow, tap targets, computed text below 12px, fonts, weights, h1, and every non-GET request;
- `runtime_main_only.json`: the same probes limited to `<main>`, so shell elements (out of scope) do not inflate the counts;
- `runtime_pretest_raw.json`;
- `static_route_metrics.json`;
- `findings.json` (the table below).

**Result: 25 findings — 2 P0, 14 P1, 9 P2.** No horizontal overflow at 360px on any audited page.

| ID | Sev | Route | Breakpoint | Category | Evidence | Recommended fix | Primitive / token | Ratchet impact |
|---|---|---|---|---|---|---|---|---|
| F-01 | **P0** | /practice | all | states | shots/in_practice_360.jpg; app/practice/page.tsx:37,52 (Buttons with no href/onClick; known since UX-0) | Wire 'Start Weak Topic Drill' to /mistakes/drill and 'Practice Bookmarks' to a real route, or remove the cards and show an honest EmptyState with a link to mocks | ButtonLink, EmptyState | legacy −4, palette −13 |
| F-02 | **P0** | /mistakes | all | a11y | axe critical button-name×2, select-name×2, serious link-name×2 (runtime_findings_raw.json); components/mistakes/mistake-revision-health.tsx:226 (icon-only <Link><Button> with no name); components/mistakes/mistake-filter-bar.tsx:220,236 (<select> without label) | Give the icon link an aria-label ('Open mistake'); use one interactive element (ButtonLink) instead of <a><button>; label the selects with Field | ButtonLink, Field + Select | palette ↓, legacy ↓ |
| F-03 | **P1** | /pricing | all | copy honesty | shots/out_pricing_1280.jpg; app/pricing/pricing-client.tsx:148 'MOST POPULAR' with payments off; :159 '₹499 + 18% GST' shown while PAYMENTS_ENABLED is off; :128 'Open Articles & Courses' (courses flag off); :174 '1v1 Quiz Battle Arena Access' (battles dormant); :95-102 coupon box with no purchase possible | Payments-off variant per DESIGN_SYSTEM Pricing card ('Opening soon' / 'Notify me when Pro opens'), no price implying purchase, no 'Most popular', list only live features, hide the coupon box | PricingCard (components/ui/domain/pricing-card.tsx), Alert | palette −52, smallText −3, legacy −4 |
| F-04 | **P1** | /current-affairs | all | copy honesty | shots/out_current-affairs_360.jpg; app/current-affairs/page.tsx:139-142 'Today's Events Being Processed … undergoing 5-gate fact verification' with 0 articles; :71-72 'fact-checked … verified provenance' lead with nothing published; components/current-affairs/current-affairs-daily-quiz-card.tsx:105-108 'Quiz Curation In Progress … being curated by editorial staff' | Honest empty state: 'No current affairs published for {date} yet' + link to the latest published day; lead copy without verification claims; quiz card hidden when no quiz exists (copy/markup only; no data/service change) | EmptyState, Card | palette ↓ (150 in route graph) |
| F-05 | **P1** | /mock-tests/[id]/result | all | copy honesty | shots/in_mock-tests_id_result_360.jpg; components/assessment/result-view-client.tsx:114 'Official Assessment', :246 'Completed this official test', :208-243 rank #3 and 'Better than N% of candidates' shown for a cohort of 3 | Drop 'official' (implies SSC affiliation); show rank/percentile only above a cohort threshold (analytics spec), else 'Ranking appears once more students take this mock' | ResultSummary, StatTile | palette −257, smallText −31, legacy −5 (route graph) |
| F-06 | **P1** | /mock-tests/[id] (pre-test) | all | hierarchy | components/assessment/start-test-action-button.tsx:30 pushes straight to /take; no link to /mock-tests/[id] anywhere (harness found none; id taken from the page payload); shots/in_mock-tests_id__1280.jpg has no h1 (h1=0) | Owner decision: route Start through the instructions page (test-flow spec) — navigation only, no console behaviour change; make the title the h1 | ButtonLink, Card, StatTile | palette −41, legacy −5 |
| F-07 | **P1** | /mock-tests/[id] (pre-test), /mock-tests/[id]/leaderboard | all | copy honesty | app/mock-tests/[id]/page.tsx:102 'Official Examination Simulation'; components/assessment/instructions-modal.tsx:28 'Official Examination Instructions'; components/assessment/leaderboard-view-client.tsx:45 'Official Ranked Leaderboard' | Replace 'Official' with neutral wording ('Exam-pattern mock', 'Instructions', 'Leaderboard'); instructions-modal is console-adjacent — copy change needs owner approval | — | 0 |
| F-08 | **P1** | /mock-tests | all | copy honesty | shots/in_mock-tests_360.jpg; components/assessment/mock-test-dashboard-view.tsx:654,662 'Full-Length Mock Tests' lists 15-min / 25-question daily sectionals (UX-0 L135, still open); app/dashboard/page.tsx:78 'Timed full-length exam' | Label by real shape ('Daily sectional mocks' vs 'Full-length mocks') from the test's duration/question count | TestCard (components/ui/domain) | palette −246, smallText −29, legacy −5 |
| F-09 | **P1** | /mistakes | all | copy honesty | components/mistakes/mistake-longitudinal-card.tsx:244 shows '100% Retention Rate' when masteredCount = 0 (seen with 0 mastered); jargon 'MPI 0.79', 'Cognitive Failure Breakdown', 'Longitudinal Journey & Cross-Exam Intelligence', 'Personal Revision Engine' | Show '—' / 'Master a mistake to see retention' when nothing is mastered; plain labels ('Priority', 'Why you got it wrong') | StatTile (empty '—'), EmptyState | palette −410, smallText −52, legacy −15 |
| F-10 | **P1** | /performance, /achievements | all | states | shots/in_performance_1280.jpg, shots/in_achievements_360.jpg: 404 card with HTTP 200 (soft 404). app/performance/page.tsx:44 requireFeatureOrNotFound('PSYCHOMETRICS'), app/achievements/page.tsx:29 ('LIVE_TESTS') run after the segment loading.tsx has streamed; /courses (no loading.tsx) returns a real 404 | Gate dormant segments before streaming (gate in a layout.tsx, or drop loading.tsx for dormant routes) so they return 404 — architecture decision, not design | — | 0 |
| F-11 | **P1** | /auth/login, /auth/signup, /mock-tests/[id], /performance | all | a11y | h1 count 0 (runtime_findings_raw.json); app/auth/login/page.tsx:27 and app/auth/signup/page.tsx:22 use legacy CardTitle (h3) | One h1 per page (page title); migrate to components/ui Card + Field + Input | Card, Field, Input, Button, Alert | legacy −8, palette −16 |
| F-12 | **P1** | /auth/signup | all | copy honesty | app/auth/signup/page.tsx:26 'Join thousands of aspirants…' (UX2A1 §2; #47 spirit) | 'Create your free account' + one honest line about what is free today | — | 0 |
| F-13 | **P1** | /dashboard | all | hierarchy | shots/in_dashboard_360.jpg; app/dashboard/page.tsx:38 blue→indigo gradient hero with streak/coins as the hero (spec: today's plan is the hero); :41 'Candidate Hub' pill; :139 'Curated by your spaced repetition and readiness engine' (system words, U-1 spirit); 4 empty panels with 12px muted text; orphan 3rd action card at 360 | Today's plan as hero (one primary CTA), stats in a 2×2 StatTile grid, empty panels collapsed into one first-run EmptyState, plain copy | StatTile, EmptyState, ButtonLink, Card | palette −64, smallText −8, legacy −4 |
| F-14 | **P1** | /dashboard, /mock-tests, /result, /mistakes, /exams/[slug], /pricing | 360 + 1280 | colour/contrast | axe color-contrast serious: dashboard×4, mock-tests×15, result×8, mistakes×15, exams/ssc-cgl×27, pricing×3 (text-slate-400 / opacity-75 / text-[10px] on tinted bg) | Use fg-secondary/fg-muted tokens (≥4.55:1 in contrast-pairs.json); no opacity on text | tokens fg-secondary, fg-muted | palette ↓ on every touched file |
| F-15 | **P1** | /mock-tests, /result, /mistakes, /exams/[slug] | all | typography | computed text <12px inside <main>: mock-tests 67 (9-11px), result 60, mistakes 64, exams/ssc-cgl 66 (runtime_main_only.json); DESIGN_SYSTEM L141 minimum 12px | text-caption minimum; reduce weight spread (800/900 in use; DS allows 400-700) | text-caption, text-body-sm | smallText −29/−31/−52/−20 |
| F-21 | **P1** | /mock-tests/[id]/take (console, static only) | n/a | motion | components/assessment/assessment-timer.tsx:86 animate-pulse on the timer under 1 min (DESIGN_SYSTEM: the timer never animates; no reduced-motion guard); components/assessment/question-palette.tsx:43 scale-105 / hover:scale-102 + transition-all; components/live-test/live-test-player-client.tsx:371 animate-ping, :356,399 animate-pulse | Separate owner-gated console phase: static urgency (colour + icon + text), no pulse/ping/scale. NOT in UX-2b; console is frozen in this phase | tokens warning/danger | 0 |
| F-16 | **P2** | all audited Operate routes | 360 | responsive | tap targets <44px inside <main> at 360: mistakes 34/42, mock-tests 17/18, result 17/20, exams/ssc-cgl 61/472 (24 below 24px; axe target-size on 'eligibility' link); buttons are h-8/h-10 (32/40px) | Button size md = 44px on touch; list rows as full-width links | Button/ButtonLink sizes | 0 |
| F-17 | **P2** | /exams/[slug] | all | hierarchy | shots/out_exams_ssc-cgl_360.jpg; document height 50,395px at 1280; 24 module cards with near-identical 'Comprehensive authoritative guide…' summaries (DB content); exam-detail spec asks for 4 groups + sticky tabs | Group modules into 4 sections, collapse with Accordion/TopicNode, sticky in-page tabs on mobile | Tabs, Accordion, ExamCard, TopicNode | palette −135, smallText −20, legacy −14 |
| F-18 | **P2** | /mock-tests, /dashboard, /result, /pre-test, /pricing | all | colour/contrast | Legacy blue (#2563eb family: bg-blue-600) primary CTAs, amber 'Pro' palette, dark navy score hero; violet primary-600 is the only primary (#30/#31) | Button primary (primary-600); semantic colours only for status | Button, Badge, tokens | palette ↓ |
| F-19 | **P2** | app/not-found.tsx (global 404 card) | all | legacy-component usage | shots/in_performance_1280.jpg: 404 card in legacy blue with 'Return to Home' (blue) | Migrate not-found / error cards to EmptyState + ButtonLink (not shell; README global states) | EmptyState, ButtonLink | palette ↓ |
| F-20 | **P2** | /mock-tests, /mistakes, /dashboard, /result | all | motion | transition-all ×172 outside admin; dead classes animate-in / zoom-in-95 / fade-in / animate-pulse-subtle compile to nothing (no plugin; 0 in built CSS); app/dashboard/page.tsx:73-114 group-hover:scale-110 on icons | transition-colors / transition-transform with ease-standard; delete dead animate-in classes; hover scale removed on Operate | --ease-standard | 0 |
| F-22 | **P2** | /current-affairs | 360 | responsive | date chips 30px tall (Today 62×30, Yesterday 84×30); 11px label | 44px chip height, text-caption minimum | Tag/Tabs | smallText −1 |
| F-23 | **P2** | /mock-tests, /result, /pre-test | all | typography | uppercase monospace section labels ('SECTION BLUEPRINT & MARKING SCHEME', 'IMPORTANT TEST RULES') and multiple eyebrows per section; weights 800/900 present on most routes | h2/h3 tokens in sentence case; at most one eyebrow per section (DS L142) | text-h2/h3 | 0 |
| F-24 | **P2** | /live-tests (flag off) | n/a | copy honesty | app/live-tests/page.tsx:42 'Compete simultaneously with thousands of candidates' (UX2A1 §2); dormant route | Rewrite before LIVE_TESTS is enabled | — | 0 |
| F-25 | **P2** | site metadata | n/a | copy honesty | config/site.ts:41 tagline 'The One-Stop Government Exam Preparation Platform' (default <title> suffix on dashboard, result, mistakes, practice, pricing) | Owner wording review; give every Operate page its own title (5 audited pages fall back to the tagline) | — | 0 |

## 5. Per-route metrics

**Static columns:** the route's `page.tsx` plus its transitive `@/app` and `@/components` imports, excluding `components/ui` (which scores 0 under ratchet R-2). Counted with the **ratchet's own regexes** (copied from `scripts/test_design_ratchet.cjs`).
- "prim" counts `<Button>`/`<ButtonLink>` or `<Input>`/`<Select>`/…. On these routes those are mostly the **legacy** primitives, as the legacy column shows.
- A file shared by several routes is counted on each of them.
- `error.tsx` is the root `app/error.tsx` for every route.

**Runtime column:** taken at 360px.
- axe: serious plus critical nodes, against WCAG 2.0/2.1/2.2 A and AA tags.
- Tap targets and text size: measured inside `<main>` only.

| Route | Files | palette | smallText | legacy | raw `<button>` / prim | raw `<input>` / prim | transition-all | loading.tsx | error.tsx | EmptyState | Runtime @360 (status · axe serious+critical nodes · tap<44 in main · text<12 in main · h1) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| /dashboard | 1 | 64 | 8 | 4 | 0 / 1 | 0 / 0 | 5 | yes | yes | no | in: 200 · 4 · 1/4 · 2 · 1 |
| /mock-tests | 4 | 246 | 29 | 5 | 7 / 13 | 0 / 0 | 9 | **no** | yes | no | out: 200 · 14 · 16/17 · 53 · 1<br>in: 200 · 15 · 17/18 · 67 · 1 |
| /mock-tests/[id] | 2 | 41 | 0 | 5 | 0 / 3 | 0 / 0 | 1 | **no** | yes | no | out: 200 · 1 · 3/4 · 0 · 0<br>in: 200 · 1 · 3/5 · 0 · 0 |
| /mock-tests/[id]/result | 5 | 257 | 31 | 5 | 7 / 6 | 0 / 0 | 1 | yes | yes | no | in: 200 · 9 · 17/20 · 60 · 1 |
| /mock-tests/[id]/take (console, static only) | 12 | 465 | 44 | 4 | 25 / 30 | 3 / 0 | 10 | yes | yes | no | not visited (console, observe-only) |
| /live-tests/[slug]/take (console, static only) | 9 | 210 | 14 | 2 | 11 / 8 | 1 / 1 | 6 | yes | yes | no | not visited (console, observe-only) |
| /mistakes | 12 | 410 | 52 | 15 | 7 / 17 | 4 / 0 | 11 | yes | yes | no | in: 200 · 21 · 34/42 · 64 · 1 |
| /performance | 1 | 183 | 14 | 1 | 0 / 4 | 0 / 0 | 0 | yes | yes | no | in: 200 · 0 · 2/2 · 0 · 0 |
| /current-affairs | 5 | 150 | 3 | 1 | 4 / 0 | 2 / 0 | 5 | **no** | yes | no | out: 200 · 0 · 8/8 · 1 · 1<br>in: 200 · 0 · 8/8 · 1 · 1 |
| /current-affairs/[slug] | 6 | 264 | 6 | 1 | 0 / 0 | 0 / 0 | 2 | **no** | yes | no | no published article to open |
| /exams | 1 | 23 | 2 | 4 | 0 / 1 | 0 / 0 | 1 | **no** | yes | no | out: 200 · 0 · 0/1 · 2 · 1<br>in: 200 · 0 · 0/1 · 2 · 1 |
| /exams/[slug] | 9 | 135 | 20 | 14 | 2 / 3 | 0 / 0 | 2 | **no** | yes | yes | no published article to open |
| /practice | 1 | 13 | 0 | 4 | 0 / 2 | 0 / 0 | 2 | **no** | yes | no | out: 200 · 0 · 2/2 · 0 · 1<br>in: 200 · 0 · 2/2 · 0 · 1 |
| /pricing | 2 | 52 | 3 | 4 | 0 / 2 | 1 / 0 | 0 | **no** | yes | no | out: 200 · 3 · 3/3 · 3 · 1<br>in: 200 · 3 · 3/3 · 3 · 1 |
| /auth/login | 3 | 10 | 0 | 4 | 0 / 1 | 1 / 2 | 0 | **no** | yes | no | out: 200 · 0 · 4/5 · 0 · 0 |
| /auth/signup | 3 | 6 | 0 | 4 | 0 / 1 | 0 / 3 | 0 | **no** | yes | no | out: 200 · 0 · 4/5 · 0 · 0 |
| /articles | 1 | 24 | 3 | 4 | 0 / 3 | 0 / 0 | 1 | **no** | yes | no | out: 200 · 0 · 2/2 · 0 · 1<br>in: 200 · 0 · 2/2 · 0 · 1 |
| /flashcards | 2 | 24 | 4 | 7 | 0 / 4 | 0 / 0 | 2 | **no** | yes | no | out: 200 · 0 · 4/4 · 0 · 1<br>in: 200 · 0 · 4/4 · 0 · 1 |
| /courses | 1 | 23 | 1 | 4 | 0 / 1 | 0 / 0 | 2 | **no** | yes | no | out: 404 · 0 · 2/2 · 0 · 0<br>in: 404 · 0 · 2/2 · 0 · 0 |
| /achievements | 1 | 91 | 10 | 1 | 0 / 3 | 0 / 0 | 0 | yes | yes | no | in: 200 · 0 · 2/2 · 0 · 0 |
| /notifications | 1 | 9 | 0 | 3 | 0 / 2 | 0 / 0 | 0 | yes | yes | no | in: 200 · 0 · 4/4 · 0 · 1 |

**Reading the table:**
- **The four learning-loop Operate routes carry the debt:** `/mistakes` (410 palette, 52 small text, 15 legacy imports), `/mock-tests/[id]/result` (257 / 31 / 5), `/mock-tests` (246 / 29 / 5) and `/current-affairs/[slug]` (264 / 6 / 1).
- **The console** (465 / 44 / 4) is frozen.
- **No audited route** uses the `EmptyState` primitive, except `/exams/[slug]` (through the syllabus section).
- **Missing segment `loading.tsx`:** `/mock-tests`, `/mock-tests/[id]`, `/current-affairs`, `/exams`, `/exams/[slug]`, `/practice`, `/pricing`, `/articles`, `/flashcards`, `/courses`. This follows #48 (segment skeletons, no root loading). Adding them needs the soft-404 caveat in F-10.

## 6. Motion audit (static grep; app/ and components/, admin excluded) and proposed tokens

| Pattern | Count | Verdict |
|---|---|---|
| `transition-all` | **172** (premium-hub-view 18, mock-test-dashboard-view 8, flashcard-player 5, question-palette 5, dashboard 5, …) | Block (Emil: name the properties) → `transition-colors` / `transition-transform` |
| `transition*` total | 665 | mostly colour hovers; acceptable once `-all` is gone |
| `animate-in`, `zoom-in-95`, `fade-in`, `slide-in-from-*` | 28 uses in 12 files | **dead code**: no `tailwindcss-animate` / `tw-animate-css`, and 0 occurrences in the built CSS. Delete them (they suggest motion that never happens) |
| `animate-pulse-subtle` | 1 (`components/premium/premium-hub-view.tsx:418`) | dead: no keyframes defined |
| `animate-pulse` | 26 | fine for skeletons only when guarded by `motion-safe:` (`components/ui/skeleton.tsx` is). **Not fine on the timer** (`assessment-timer.tsx:86`, F-21) or on live badges |
| `animate-spin` | 16 | spinners. Fine inside a pending button; otherwise use a skeleton (C-13). Unguarded except in `components/ui/spinner.tsx` |
| `animate-ping` / `animate-bounce` | 1 / 1 (`live-test-player-client.tsx:371`, `app/battles/[id]/arena-client.tsx:188`) | Block: decorative and infinite, with no reduced-motion guard; both on dormant surfaces |
| `duration-*` | 120 ×6, 200 ×14, 300 ×7, **500 ×1** (`components/assessment/result-view-client.tsx:453`, a progress bar) | 500ms is above the 300ms UI ceiling; use 300ms on a transform |
| `ease-in` on UI | 0 | pass |
| `scale-0` / `scale(0)` | 0 | pass |
| hover scale/translate | 17 (dashboard icons `group-hover:scale-110` ×4, `question-palette.tsx:43` `hover:scale-102` in the console, store/wallet images `scale-105`) | Tailwind v4 already gates `hover:` behind `(hover:hover)`. Still remove the scale on Operate surfaces (no purpose); never in the console |
| `active:scale` | 10 | fine outside the console (C-9); add `motion-safe:` |
| `motion-safe` / `motion-reduce` guards | 13, all in design-system / shell / landing files | **0 guards in page-level code**; every legacy animation ignores `prefers-reduced-motion` |
| `@keyframes` | 0 | none |
| **Console** (`/mock-tests/[id]/take`, `/live-tests/[slug]/take`) | timer `animate-pulse` under 1 min; `transition-all` on options and palette; palette `scale-105` current ring plus `hover:scale-102`; live player `animate-ping` / `animate-pulse` badges; `animate-in` dialogs (dead); watermark `transition-opacity duration-300` | **Violates DS "the timer never animates" and "no decorative motion in the console".** Report only; fixing it needs its own owner-gated console phase (F-21) |

**Emil review verdict for student surfaces: Block** on `transition-all`, the infinite decorative animations and the missing reduced-motion guards. Before → after → why:

| Before | After | Why |
|---|---|---|
| `transition-all` | `transition-colors duration-120 ease-standard` | avoids animating layout properties |
| `animate-pulse` on the timer | static danger colour + icon + "Under 1 minute" text | the timer never animates (DS); it is an anxiety trigger |
| `animate-in zoom-in-95` | remove, or (non-console only) `motion-safe:` opacity + `scale(0.95→1)` at 200ms `ease-out` | dead class today |
| `group-hover:scale-110` icons | none | decoration on Operate surfaces |

**Proposed `@theme` additions** (proposal only, **not implemented**; adoption needs owner approval and a ratchet R-6 update):

```css
/* motion: proposal for UX-2b.0, values from Emil's skill, mapped to DESIGN_SYSTEM's 120/200/300 */
--ease-standard: cubic-bezier(0.2, 0, 0, 1);    /* existing: default for state changes */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);     /* enter: dialogs, toasts, popovers */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* on-screen movement: tabs indicator, accordion */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);  /* sheet / bottom drawer (Dialog variant="sheet") */
--duration-micro: 120ms;  /* hover / press / colour */
--duration-enter: 200ms;  /* enter / exit */
--duration-sheet: 300ms;  /* sheets, drawers: the ceiling for UI */
```

Usage rules:
- only opacity and transform;
- every keyframe animation behind `motion-safe:`;
- **nothing in the console**;
- exit motion faster than enter (≈ 0.75×).

## 7. Copy honesty

| # | Copy | Where | Problem | Suggested direction |
|---|---|---|---|---|
| 1 | "Join thousands of aspirants preparing for competitive exams" | `app/auth/signup/page.tsx:26` | unverifiable count (UX2A1 §2, #47 spirit) | "Create your free account" |
| 2 | "Compete simultaneously with thousands of candidates" | `app/live-tests/page.tsx:42` (flag off) | unverifiable count | rewrite before LIVE_TESTS is enabled |
| 3 | "Today's Events Being Processed — … undergoing 5-gate fact verification" | `app/current-affairs/page.tsx:139-142` | claims work in progress when 0 articles exist | "No current affairs published for {date} yet." |
| 4 | "Curated, fact-checked … verified provenance" (lead and metadata) | `app/current-affairs/page.tsx:25,71-72` | verification claim on an empty hub | describe what a reader gets, without the verification claim |
| 5 | "Quiz Curation In Progress — being curated by editorial staff" | `components/current-affairs/current-affairs-daily-quiz-card.tsx:105-108` | implies staff activity that may not be happening | hide the card when no quiz exists |
| 6 | "The One-Stop Government Exam Preparation Platform" | `config/site.ts:41` (title fallback) | superlative; also the `<title>` of 5 audited pages | owner wording review; page-specific titles |
| 7 | "MOST POPULAR", "₹499 + 18% GST", "Have a Discount Coupon?" while payments are off | `app/pricing/pricing-client.tsx:95-102,148,159` | popularity claim with no sales; a price that implies purchase | Pricing card "Opening soon" variant (DS L238; SITEMAP_IA upgrade rules) |
| 8 | "Open Articles & Courses", "1v1 Quiz Battle Arena Access", "Descriptive Mains Writing & Evaluation" | `app/pricing/pricing-client.tsx:128,174` | courses and battles are dormant | list live features only |
| 9 | "Official Assessment", "Completed this official test", "Official Examination Simulation", "Official Examination Instructions", "Official Ranked Leaderboard" | `result-view-client.tsx:114,246`; `app/mock-tests/[id]/page.tsx:102`; `instructions-modal.tsx:28`; `leaderboard-view-client.tsx:45` | implies affiliation with the exam body | "Exam-pattern mock", "Instructions", "Leaderboard" |
| 10 | Rank "#3 across all verified candidate submissions" and "Better than N% of candidates" with 3 participants | `result-view-client.tsx:208-243` | statistically meaningless; rank theatre | show only above a cohort threshold (analytics spec) |
| 11 | "100% Retention Rate" when 0 mistakes are mastered | `components/mistakes/mistake-longitudinal-card.tsx:244` | false number | "—" plus an explanation |
| 12 | "Full-Length Mock Tests" listing 15-minute / 25-question daily mocks; "Timed full-length exam" | `mock-test-dashboard-view.tsx:654,662`; `app/dashboard/page.tsx:78` | mislabel (UX-0 L135, still open) | label by real shape |
| 13 | "Curated by your spaced repetition and readiness engine", "Adaptive Practice Arena", "MPI", "Cognitive Failure Breakdown", "Exam-oriented event intelligence" | `app/dashboard/page.tsx:139`; `app/practice/page.tsx:19`; mistakes components; `app/current-affairs/page.tsx:63` | system words / jargon (UX-1b U-1 spirit). "Adaptive" is unearned on a page whose buttons do nothing | plain student language |
| 14 | "Comprehensive authoritative guide …" ×24 module summaries | DB content on `/exams/ssc-cgl` | repetitive; "authoritative" is on the U-1 banned list for UI copy | content-team edit (data, not code; out of UX scope) |

## 8. UX-2b backlog (phase-ready; not started)

**Rules for every sub-phase:**
- tokens and `components/ui` primitives only;
- the ratchet must fall (`--write` a new baseline at close);
- no shell, header, footer or landing change while UX-2a is pending;
- no console behaviour change;
- CA: markup and copy only, never data, services or APIs;
- gates: the ratchet, typecheck, lint, build, `test_ux1a_a11y`, the UX-1b shell suites, `test_ux2a_landing` and `test_ca_routes`, plus each sub-phase's new gate.

Each new gate is a `test_ux2b_<n>.cjs` with axe (0 serious/critical) at 360 and 1280, h1 = 1, no text below 12px in `<main>`, targets ≥44px in `<main>`, and a banned-claims check.

| Sub-phase | Scope (files) | Primitives / tokens | Expected ratchet change (route graph) | Risk | Tests |
|---|---|---|---|---|---|
| **UX-2b.0 Foundations** (small, first) | **Owner approval:** add motion tokens to `app/globals.css` (§6) and update R-6. Global `app/not-found.tsx` / `app/error.tsx` → `EmptyState` + `ButtonLink` (not shell). A shared copy module for the banned-claims list ("official", "thousands", "most popular", system words) as a permanent gate extending U-1 | `EmptyState`, `ButtonLink`, `--ease-*` | palette ↓ ~30 | low. globals.css is a protected file: owner sign-off | ratchet R-6, new `test_ux2b_claims.cjs` |
| **UX-2b.1 Dashboard + results + pre-test** | `app/dashboard/page.tsx`, `app/mock-tests/[id]/page.tsx`, `app/mock-tests/[id]/result/page.tsx`, `components/assessment/result-view-client.tsx` (and its local imports) | `StatTile`, `ResultSummary`, `Card`, `ButtonLink`, `EmptyState`, `Badge` | palette −362 · smallText −39 · legacy −14 | medium: result page logic-adjacent (rank threshold needs a product rule); F-06 navigation change needs an owner decision | F-05/06/13 assertions; signed-in smoke `student-mistake` (result renders a score); no change in `/take` |
| **UX-2b.2 Mock-test catalogue** | `app/mock-tests/page.tsx`, `components/assessment/mock-test-dashboard-view.tsx`, `start-test-action-button.tsx` (styling only) | `TestCard`, `Tabs`, `StatTile`, `Badge` | palette −246 · smallText −29 · legacy −5 | medium: highest-traffic list; "Full-Length" relabel needs a duration/question rule | label rule unit test; axe; smoke `/mock-tests` |
| **UX-2b.3 Mistakes + practice** | `app/mistakes/page.tsx` + `components/mistakes/*` (12 files), `app/practice/page.tsx` | `Field`, `Select`, `ButtonLink`, `StatTile`, `EmptyState`, `Accordion` (collapse the 9 analytic panels) | palette −423 · smallText −52 · legacy −19 | medium: fixes **both P0s**; must not touch drill RPCs (DRILL-1) | axe 0 critical; smoke `student-mistake`; DRILL-1 gate |
| **UX-2b.4 Current-affairs read surfaces** | `app/current-affairs/page.tsx`, `[slug]/page.tsx`, `date/*`, `month/*`, `components/current-affairs/*` (presentation only) | `EmptyState`, `Card`, `Tag`, `Breadcrumb`, Read-mode type (body-lg, 65–75ch) | palette −264+ · smallText −6 | **high sensitivity:** no data, service or API edits; PUBLISHED-only must hold | `test_ca_routes` (DRAFT leakage) must stay 6/6; copy items 3–5 |
| **UX-2b.5 Exams directory + exam detail** | `app/exams/page.tsx`, `app/exams/[slug]/page.tsx` and its 9-file graph | `Tabs`, `Accordion`, `ExamCard`, `TopicNode`, `WeightageChip` | palette −158 · smallText −22 · legacy −18 | medium: syllabus section gates (QB-KEY-1 read model) | `student-pages` smoke (syllabus section); exam-detail spec |
| **UX-2b.6 Persuade: pricing + auth** | `app/pricing/*`, `app/auth/login`, `app/auth/signup` | `PricingCard` (payments-off variant), `Card`, `Field`, `Input`, `Button`, `Alert` | palette −68 · smallText −3 · legacy −12 | low–medium: auth forms are security-adjacent (SEC-1D redirects); no logic change | SEC-1D 14/14; copy items 1, 7, 8 |
| **UX-2b.7 P2 surfaces** | `/articles`, `/flashcards`, `/notifications`; F-10 soft-404 fix for dormant routes (architecture decision) | `EmptyState`, `Card` | palette −57 · smallText −7 · legacy −14 | low | status-code check for dormant routes |
| **UX-C1 Console calm** (separate, owner-gated, **not UX-2b**) | `assessment-timer.tsx`, `question-palette.tsx`, `question-options.tsx`, player dialogs | tokens only; zero motion | palette −465 potential | **high:** console frozen; visual only, never timer, autosave, palette or submit logic | full console E2E on a QA fixture attempt, run only with explicit approval |

The ratchet figures are upper bounds for a full migration of each route graph. Shared files are counted once in the phase that migrates them first.

## 9. Verification

The baseline was recorded **before** any file was written. The "after" run was taken once all deliverables were written.

| Check | Before | After |
|---|---|---|
| `node scripts/test_design_ratchet.cjs` | 8/8 PASS: rawColor 1 · paletteClass 5208 · darkClass 0 · smallText 463 · legacyImport 230 | **8/8 PASS, identical** (metric lines diffed: no change) |
| `npm run typecheck` | exit 0, 0 errors | **exit 0, 0 errors** |
| `npm run lint` | 0 errors, 232 warnings (pre-existing) | **0 errors, 232 warnings** |
| `npm run build` | n/a | **exit 0** |
| `test_ux1a_a11y` | 25/25 | **25/25** |
| `test_ux1b_shell` | 7/7 | **7/7** |
| `test_ux1b_shell_a11y` | 75/75 | **75/75** |
| `test_ux2a_landing` | 18/18 | **18/18** |
| `test_ca_routes` (DRAFT leakage) | 6/6 | **6/6** |
| no-personal-data scan of every file this phase adds (skills, PRODUCT.md, DESIGN.md, report, JSON) | n/a | **0 findings** (135 text files; 84 JPEGs skipped as binary). The full gate re-runs on the tracked tree after the commit |

**`git status` / `git diff --stat` before the commit:**
- `git diff --stat` is **empty**: no tracked file was modified.
- New, untracked:
  - `.claude/skills/` (64 files)
  - `.agent/skills/` (64 files)
  - `PRODUCT.md`
  - `DESIGN.md`
  - `docs/reports/ux/uxt0/`: 5 JSON files and 84 screenshots
  - this report
  - `docs/reports/ops/PUBLIC_REPO1_REPORT.md` (pre-existing, local only, **not committed**)
- No `.impeccable/` directory was created, and no hook config was written. `.claude/` contains `skills/` only.

**No database mutation.** How this is established:
1. **No DB access of my own:** no script, SQL, migration, seed, RPC or Supabase admin call was run. All access went through the app's own pages over HTTP.
2. **Only one non-GET request:** the audit harness recorded every request that was not a GET or HEAD across all 84 page captures, signed in and signed out. There was exactly **one**: the QA student's sign-in (`POST /auth/login`, a server action), once per signed-in session (3 sessions across the 3 harness runs). Sign-in writes Supabase auth session metadata only, not app tables.
3. **No test-console navigation:** the harness throws if a target contains `/take`, so the attempt-creating route was never opened. No form was submitted except the sign-in.
4. **The gates are read-only browsers.** The UX and CA suites were run unchanged.

## 10. Contradictions and surprises

1. **Bilingual vs English-only.**
   - The UX-T0 brief locks "bilingual-ready (English + Hindi/Devanagari)", and DESIGN_SYSTEM.md specifies Noto Sans Devanagari.
   - But the **UX-0 §7 owner decision is English-only UI**, and **ratchet R-4 asserts no Devanagari font is loaded**.
   - PRODUCT.md reconciles them as "English UI today, bilingual-ready (keyed strings, layouts that survive Hindi, Devanagari minimums)".
   - **The architect should confirm.** Loading the Devanagari font later requires an R-4 amendment.
2. **Legacy `--primary: #2563eb` (blue)** remains in `:root` of `app/globals.css`, and legacy components render it. That is why most student pages still look blue next to the violet shell (F-18).
3. **The pre-test instructions page is orphaned:** "Start Mock" skips it and goes straight to `/take` (F-06). The test-flow spec assumes it is the entry point.
4. **Soft 404s.** Flag-gated routes that have a `loading.tsx` return HTTP 200 with the 404 card (F-10). UX2A1 #48's segment skeletons interact with `notFound()` after streaming.
5. **Animation classes compile to nothing.** `animate-in` and its relatives (28 uses) have no plugin, so dialogs that "animate" do not. This is harmless in the console, but it is dead code.
6. **The console timer pulses** under 1 minute, against the DS rule "the timer never animates". It predates UX-1.
7. **Product docs vs reality.** feature-map and platform-overview list "[IMPLEMENTED]" curriculum, adaptive CAT/IRT, "Live All-India contests" and badges, while those surfaces are dormant or empty. Design work must follow the live state, not those docs.
8. **The 7-step loop** (landing, brief) vs the **6-stage loop** in `candidate-learning-loop.md` (Analyze and Diagnose merged). PRODUCT.md uses the 7-step version from the brief.
9. **Unverifiable "Most popular"** and live prices on `/pricing` while payments are off contradict DS L238 and the SITEMAP_IA upgrade rules (F-03).
10. **The Impeccable engine download failed verification on Windows.** The skill's main differentiator (the detector) is unavailable on this machine. The skills are still useful as checklists.
11. **No DRAFT Current Affairs leakage** was observed. There is also no published CA content in the dev database, so the CA read experience (article page) could not be audited at runtime.

12. **Shell observations, for the UX-2a owner review** (not touched here):
    - at 360px the signed-out header wraps the wordmark onto two lines ("Courage / Library") next to "Get started", as in `shots/out_auth_login_360.jpg`;
    - the global 404 card is still legacy blue (F-19).

## 11. FINAL STATUS

**UX-T0 status: CLOSED.**

All four objectives are delivered:
1. **Skills calibrated:** PRODUCT.md, DESIGN.md (thin pointer, 20-row Skill Calibration Table, mode map).
2. **Evidence-based audit:** 84 screenshots, axe at 360 and 1280px, static and runtime metrics, 25 findings.
3. **Motion audit** with proposed tokens.
4. **Phase-ready UX-2b backlog** (8 sub-phases plus a separate console phase).

No product code changed. Every gate is unchanged from the baseline, and no hook or dependency was added.

**Caveats** (they do not block closing):
- the Impeccable engine failed verification, so the audits were run manually;
- the CA article page and the test console were reviewed statically only (0 published CA articles; the console would create an attempt).

**For the architect / owner:**
- (a) confirm English-only vs bilingual-ready (§10.1);
- (b) decide F-06 (should Start go through the pre-test page?);
- (c) approve the motion tokens before UX-2b.0;
- (d) the two P0s are live on linked pages today.

**Proposed next phase (not started): UX-2b.3, Mistakes + Practice.** It fixes both P0s (F-01 dead `/practice` CTAs; F-02 critical a11y on `/mistakes`) plus F-09. It has no token dependency, so it can run before or alongside UX-2b.0.
