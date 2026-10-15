# UX-0: Student Experience Discovery Report

> **STATUS: OPEN.** All documents are complete. One evidence item is outstanding: the qa-student (signed-in) screenshots. They cannot be taken because the permanent qa-student identity was deleted during TYPES-1 B1 (§1a). After the owner runs `node scripts/qa/ensure-qa-identities.cjs`, the signed-in pass is a single script run, and UX-0 can close.
>
> - **Scope:** documents and screenshots only. No production code, no DB writes, no packages.
> - **Date:** 2026-10-15.
> - **Build under test:** local production build (`next build` + `next start`, port 3100) of `main@8ef9bf7` **plus the uncommitted TYPES-1 B1 working tree** (student-core typing and Class B fixes). Visual output is unaffected except for the mistake detail and drill pages, which only render for signed-in users.
> - **Data:** read-only queries against couragelibrary-next (`BEGIN READ ONLY`, verified TLS, ref-locked). Counts only; no PII.

**Deliverables:**

| Document | Content |
|---|---|
| [`docs/ux/SITEMAP_IA.md`](../../ux/SITEMAP_IA.md) | Sitemap, URL scheme, navigation, journeys |
| [`docs/ux/DESIGN_SYSTEM.md`](../../ux/DESIGN_SYSTEM.md) | Tokens with contrast proof, typography, implementation plan, 28 component specs, content style, CWV budgets |
| [`docs/ux/pages/`](../../ux/pages/README.md) | 16 page specs plus an index |
| `docs/ux/ux0/screens/anon/` | 64 screenshots: 31 reachable routes × desktop 1440 / mobile 390, plus 2 example 404 captures (achievements, courses) |

---

## §1 Inventory

### 1a. Routes (70 non-admin pages)

States are judged from code and confirmed by the anonymous production crawl.

| Count | State | Pages |
|---|---|---|
| **44** | WORKING (5 uncertain) | |
| **3** | BROKEN (partial) | dashboard, billing, pricing: legacy columns, tracked as TYPES-1 B1 Class B |
| **6** | PLACEHOLDER | `/` (dev "Phase 1B" page with a public Supabase health card showing the project name), `/practice` (buttons with no action), `/notifications` (hard-coded empty), `/checkout/success`, `/checkout/cancel`, `/checkout/[orderId]` |
| **17** | DORMANT | LIVE_TESTS 9, COURSES 3, BATTLES 2, PSYCHOMETRICS 1, payments 2 |

These pages are **MISSING**:
- course path
- test series
- onboarding
- my exam home
- analytics (`/performance` is dormant)
- bookmarks and notes pages
- settings
- about, contact, legal (privacy / terms / refund)
- CNTS / partners

| Route group | Purpose | Data source | Auth | Flag | State |
|---|---|---|---|---|---|
| `/` | Home | `HealthService` + constants | public | – | PLACEHOLDER |
| `/exams`, `/exams/[slug]`, `/exams/[slug]/[module]`, `/exams/[slug]/cycle/[year](/[module])` | Exam directory, hub, 24 EK modules, cycle views | `ExamKnowledgeCandidateService`, `ExamModuleRegistry` | public | – | WORKING (`?category=` ignored; cycle pages duplicate the hub) |
| `/mock-tests`, `/mock-tests/[id]`, `/leaderboard`, `/take`, `/[attemptId]/result` | Mock dashboard, instructions, leaderboard, console, result | `AssessmentService` | public; take redirects to login; result service-level | ADAPTIVE (branch only) | WORKING (`[id]` means a mock in some routes and an attempt in others) |
| `/mistakes`, `/mistakes/[id]`, `/mistakes/drill` | Mistake vault, detail, drill | `MistakeService`, `BookmarkService` | service-level (anonymous sees an empty vault) | – | WORKING (detail and drill were broken before B1) |
| `/articles`, `/articles/[slug]` | Learning documents | `ContentService` → `LearningResolverService` | public, with Pro lock | – | WORKING (0 published documents, so empty) |
| `/current-affairs` (+ `[slug]`, `date/[d]`, `month/[m]`) | Current affairs | `CurrentAffairsService` | public | – | WORKING (0 articles; month returns 404 when empty) |
| `/dashboard` | Student home | `DashboardService` | redirect to `/auth/login` | – | BROKEN (partial) |
| `/pricing`, `/billing`, `/premium`, `/checkout/*` | Plans, status, premium hub, checkout | `BillingService`, `PremiumHubService` | mixed | payments off | BROKEN (partial) / PLACEHOLDER |
| `/practice` | "Adaptive practice arena" | none | public | – | PLACEHOLDER |
| `/notifications` | Notifications | none (`user_notifications` unused) | none | – | PLACEHOLDER |
| `/auth/*`, `/auth/callback` | Auth | `app/auth/actions.ts` | public | – | WORKING (`/login` and `/register` don't exist; 4 pages redirect to `/login`) |
| `/wallet`, `/store` | Coins, rewards | `GamificationService` | redirect (store uses `redirectTo`, which login ignores) | – | WORKING |
| `/community/*`, `/descriptive/*`, `/flashcards/*`, `/institutes/*`, `/faculty/*` | Out of UX-0 scope | various | mixed (forms shown to anonymous users) | – | WORKING |
| `/courses/*` | Old course model | `ContentService` | public | COURSES | DORMANT (404) |
| `/live-tests/*`, `/achievements`, `/certificates`, `/verify/c/*` | Live tests | quarantined services | mixed (`/login` dead) | LIVE_TESTS | DORMANT (404) |
| `/battles/*` | Quiz battles | quarantined | service | BATTLES | DORMANT (404) |
| `/performance` | Candidate intelligence | quarantined | `/login` (dead) | PSYCHOMETRICS | DORMANT (404) |

**Shell.** There is one root layout: `Header` (5 mega-menu groups, coins and streak) and a `Footer` with **no links**. There are no nested layouts. `components/layout/mobile-nav.tsx` and `user-nav.tsx` are unused.

**Middleware** only protects `/admin`. Student pages protect themselves inconsistently: some redirect, some show empty states, and `/community/new` and `/descriptive/[id]/write` show forms to anonymous users.

The return parameter has three names in use (`next`, `redirect`, `redirectTo`), but login only reads `next`.

**SEO findings:**
- 44 of 70 pages have no route metadata, including `/`, `/pricing` and `/mock-tests/[id]`.
- The sitemap emits dead `/learn`, `/blog` and `/courses/[slug]` URLs, plus the `/practice` placeholder.
- robots disallows only `/dashboard/` (with a trailing slash).

**Screenshot index (anonymous; local production build).** "→" means redirected; "404" means the not-found page rendered. Redundant 404 captures were not kept.

| Route | Result | h1 | Screens |
|---|---|---|---|
| `/` | 200 | The One-Stop Government Exam Preparation Platform | [desktop](../../ux/ux0/screens/anon/home-d.jpg) · [mobile](../../ux/ux0/screens/anon/home-m.jpg) |
| `/exams` | 200 | Target Competitive Examinations | [desktop](../../ux/ux0/screens/anon/exams-d.jpg) · [mobile](../../ux/ux0/screens/anon/exams-m.jpg) |
| `/exams/ssc-cgl` | 200 | SSC CGL | [desktop](../../ux/ux0/screens/anon/exams__ssc-cgl-d.jpg) · [mobile](../../ux/ux0/screens/anon/exams__ssc-cgl-m.jpg) |
| `/exams/ssc-cgl/exam-pattern` | 200 | Exam Pattern & Marking Scheme / SSC CGL 2026 | [desktop](../../ux/ux0/screens/anon/exams__ssc-cgl__exam-pattern-d.jpg) · [mobile](../../ux/ux0/screens/anon/exams__ssc-cgl__exam-pattern-m.jpg) |
| `/exams/ssc-cgl/cycle/2026` | 200 | SSC CGL | [desktop](../../ux/ux0/screens/anon/exams__ssc-cgl__cycle__2026-d.jpg) · [mobile](../../ux/ux0/screens/anon/exams__ssc-cgl__cycle__2026-m.jpg) |
| `/exams/ssc-cgl/cycle/2026/exam-pattern` | 200 | Exam Pattern & Marking Scheme / SSC CGL 2026 | [desktop](../../ux/ux0/screens/anon/exams__ssc-cgl__cycle__2026__exam-pattern-d.jpg) · [mobile](../../ux/ux0/screens/anon/exams__ssc-cgl__cycle__2026__exam-pattern-m.jpg) |
| `/mock-tests` | 200 | Mock Tests | [desktop](../../ux/ux0/screens/anon/mock-tests-d.jpg) · [mobile](../../ux/ux0/screens/anon/mock-tests-m.jpg) |
| `/mock-tests/[mockId]` | 200 |  | [desktop](../../ux/ux0/screens/anon/mock-tests__mockId-d.jpg) · [mobile](../../ux/ux0/screens/anon/mock-tests__mockId-m.jpg) |
| `/mock-tests/[mockId]/leaderboard` | 200 | SSC CGL Tier 1 — Full Mock | [desktop](../../ux/ux0/screens/anon/mock-tests__mockId__leaderboard-d.jpg) · [mobile](../../ux/ux0/screens/anon/mock-tests__mockId__leaderboard-m.jpg) |
| `/practice` | 200 | Adaptive Practice Arena | [desktop](../../ux/ux0/screens/anon/practice-d.jpg) · [mobile](../../ux/ux0/screens/anon/practice-m.jpg) |
| `/articles` | 200 | Articles & Exam Study Notes | [desktop](../../ux/ux0/screens/anon/articles-d.jpg) · [mobile](../../ux/ux0/screens/anon/articles-m.jpg) |
| `/articles/qa-number-system-concept-lesson` | 404 (not-found) |  | — |
| `/courses` | 404 (not-found) |  | [desktop](../../ux/ux0/screens/anon/courses-d.jpg) |
| `/courses/free-masterclass` | 404 (not-found) |  | — |
| `/courses/free-masterclass/learn` | 404 (not-found) |  | — |
| `/current-affairs` | 200 |  | [desktop](../../ux/ux0/screens/anon/current-affairs-d.jpg) · [mobile](../../ux/ux0/screens/anon/current-affairs-m.jpg) |
| `/current-affairs/date/2026-10-15` | 200 |  | [desktop](../../ux/ux0/screens/anon/current-affairs__date__2026-10-15-d.jpg) · [mobile](../../ux/ux0/screens/anon/current-affairs__date__2026-10-15-m.jpg) |
| `/current-affairs/month/2026-10` | 404 (not-found) | Current Affairs — October 2026 | — |
| `/pricing` | 200 | Unlock Full Courage Library PRO | [desktop](../../ux/ux0/screens/anon/pricing-d.jpg) · [mobile](../../ux/ux0/screens/anon/pricing-m.jpg) |
| `/premium` | → /auth/login?next=/premium |  | — |
| `/billing` | 200 | Subscriptions & Billing Management | [desktop](../../ux/ux0/screens/anon/billing-d.jpg) · [mobile](../../ux/ux0/screens/anon/billing-m.jpg) |
| `/checkout/success` | 200 | Welcome to Courage Library PRO! | [desktop](../../ux/ux0/screens/anon/checkout__success-d.jpg) · [mobile](../../ux/ux0/screens/anon/checkout__success-m.jpg) |
| `/checkout/cancel` | 200 | Payment Was Not Completed | [desktop](../../ux/ux0/screens/anon/checkout__cancel-d.jpg) · [mobile](../../ux/ux0/screens/anon/checkout__cancel-m.jpg) |
| `/auth/login` | 200 |  | [desktop](../../ux/ux0/screens/anon/auth__login-d.jpg) · [mobile](../../ux/ux0/screens/anon/auth__login-m.jpg) |
| `/auth/signup` | 200 |  | [desktop](../../ux/ux0/screens/anon/auth__signup-d.jpg) · [mobile](../../ux/ux0/screens/anon/auth__signup-m.jpg) |
| `/auth/forgot-password` | 200 |  | [desktop](../../ux/ux0/screens/anon/auth__forgot-password-d.jpg) · [mobile](../../ux/ux0/screens/anon/auth__forgot-password-m.jpg) |
| `/auth/update-password` | 200 |  | [desktop](../../ux/ux0/screens/anon/auth__update-password-d.jpg) · [mobile](../../ux/ux0/screens/anon/auth__update-password-m.jpg) |
| `/dashboard` | → /auth/login |  | — |
| `/mistakes` | 200 | Mistake Vault | [desktop](../../ux/ux0/screens/anon/mistakes-d.jpg) · [mobile](../../ux/ux0/screens/anon/mistakes-m.jpg) |
| `/mistakes/drill` | 200 | Configure Your Remediation Drill | [desktop](../../ux/ux0/screens/anon/mistakes__drill-d.jpg) · [mobile](../../ux/ux0/screens/anon/mistakes__drill-m.jpg) |
| `/notifications` | 200 | Notifications | [desktop](../../ux/ux0/screens/anon/notifications-d.jpg) · [mobile](../../ux/ux0/screens/anon/notifications-m.jpg) |
| `/wallet` | → /auth/login?next=/wallet |  | — |
| `/store` | → /auth/login?redirectTo=/store |  | — |
| `/achievements` | 404 (not-found) |  | [desktop](../../ux/ux0/screens/anon/achievements-d.jpg) |
| `/certificates` | 404 (not-found) |  | — |
| `/community` | 200 | Community Knowledge Exchange | [desktop](../../ux/ux0/screens/anon/community-d.jpg) · [mobile](../../ux/ux0/screens/anon/community-m.jpg) |
| `/community/new` | 200 | Start Discussion / Ask a Doubt | [desktop](../../ux/ux0/screens/anon/community__new-d.jpg) · [mobile](../../ux/ux0/screens/anon/community__new-m.jpg) |
| `/descriptive` | 200 | Descriptive Answer Writing Studio | [desktop](../../ux/ux0/screens/anon/descriptive-d.jpg) · [mobile](../../ux/ux0/screens/anon/descriptive-m.jpg) |
| `/descriptive/submissions` | 200 | My Descriptive Submissions | [desktop](../../ux/ux0/screens/anon/descriptive__submissions-d.jpg) · [mobile](../../ux/ux0/screens/anon/descriptive__submissions-m.jpg) |
| `/flashcards` | 200 | Flashcard Library & Visual Formulas | [desktop](../../ux/ux0/screens/anon/flashcards-d.jpg) · [mobile](../../ux/ux0/screens/anon/flashcards-m.jpg) |
| `/institutes` | 200 | Partner Coaching Institutes & Cohorts | [desktop](../../ux/ux0/screens/anon/institutes-d.jpg) · [mobile](../../ux/ux0/screens/anon/institutes-m.jpg) |
| `/performance` | 404 (not-found) |  | — |
| `/battles` | 404 (not-found) |  | — |
| `/live-tests` | 404 (not-found) |  | — |
| `/faculty/evaluations` | 200 | Faculty Review Queue | [desktop](../../ux/ux0/screens/anon/faculty__evaluations-d.jpg) · [mobile](../../ux/ux0/screens/anon/faculty__evaluations-m.jpg) |
| `/verify/c/SAMPLE` | 404 (not-found) |  | — |

**Signed-in (qa-student) screenshots: NOT CAPTURED (blocked).**
- **Cause.** During TYPES-1 B1, `scripts/e2e/cleanup-student.cjs` was run without `E2E_KEEP_USER=1`, which deleted the qa-student auth user and profile.
- **Remedy.** `node scripts/qa/ensure-qa-identities.cjs` (owner). Then re-run the capture script (kept outside the repo), which signs in through the login form as qa-student. It will capture dashboard, mistakes, wallet, store, premium, a mock result and the console.
- qa-admin and qa-staff are intact.

### 1b. Styling today

| Dimension | Finding |
|---|---|
| Tokens | Tailwind v4 CSS-first; **no `@theme`**. 8 `:root` variables, not mapped. The only CSS file is `app/globals.css`. |
| Fonts | System stack only; `next/font` unused; **no Devanagari font**. `<html lang="en">` is hard-coded. |
| Colour | **16 hue families, 157 distinct shades, 705 distinct colour classes.** Slate dominates (8,112 uses), plus gray (97). Primary candidates compete: blue 1,853 · indigo 633 · purple 330 · sky / violet / cyan. Success uses emerald and teal; error uses rose and red; warning uses amber, orange and yellow. 4 raw hex values. |
| Radius | 8 sizes: xl 1,134 · lg 694 · 2xl 413 · full 223 · bare 179 · md 117 · 3xl 82 · sm 5 |
| Shadow | 9 sizes (xs 483, 2xs 282, …) plus 4 coloured / arbitrary |
| Font size | **17 sizes, including 1,479 uses below 12px** (`text-[10px]` 731, `[11px]` 676, `[9px]` 67, `[8px]` 2, `[7px]` 2) |
| Weight | bold 2,234 · semibold 974 · medium 591 · black 376 · extrabold 148 · normal 38 |
| Dark mode | **417 `dark:` classes with no strategy**, so OS dark mode gives partly-dark pages (current-affairs and learning components) |
| Gradients | 56 classes in 41 files, mixing the v3 `bg-gradient-*` and v4 `bg-linear-*` syntax |
| Primitives | `components/ui` has 7 (Button, Card, Badge, Input, Alert, Skeleton, Container). **570 raw `<button>` vs 403 `<Button>`; 298 raw `<input>`.** No Modal (16 hand-rolled modals), Tabs, Select or Tooltip. |

### 1c. Brand assets

- **The only asset is `public/images/logo.png`** (245×229 RGBA PNG, 7.5 KB). It doubles as favicon, apple icon and **OG image** (the recommended size is 1200×630).
- There is **no SVG logo, favicon set or manifest**.
- **Logo colours** (pixel analysis):
  - cyan **`#5CD8E6`** (main shape, about 82% of coloured pixels; secondary tint `#62E2E7`)
  - violet **`#5000F0`** (offset shape)
- The current theme colour and `--primary` are `#2563EB` (blue-600). The wordmark is a blue-700 → indigo-700 → blue-900 gradient. Neither matches the logo.

### 1d. Data readiness (counts, read-only)

| System | Today | Feeds |
|---|---|---|
| `exams` | 4 (1 active: `ssc-cgl`; CHSL, MTS, GD inactive) | directory, hubs, landing |
| Exam Knowledge `exam_knowledge_documents` | 70 PUBLISHED (CGL 24, CHSL 24, MTS 20, GD 2) | hub modules |
| `exam_cycles` | 4 (1 active, 3 upcoming); **dates mostly null** | dates, countdowns |
| `exam_patterns` | 1 | pattern summary |
| Canonical syllabus: `exam_syllabus_versions` / `nodes` / canonical mappings | **0 / 0 / 0** (`exam_syllabi` has 1 legacy row) | **course (#27): blocked on GAP2-4** |
| `canonical_taxonomy_nodes` | 40 (4 subjects, 36 topics) | course topics, practice |
| `learning_documents` | 2, both ARCHIVED, so **0 servable** | course, articles |
| `questions` / `question_versions` | 111 published (QA 35, Reasoning 25, English 26, GA 25) / 112 PUBLISHED; **all `en`** | practice, quiz |
| `mock_templates` / `mock_tests` | 8 / 8 published, all free, SSC CGL only (6 sectional 25Q, 2 full 100Q) | mocks, test series |
| `test_series` | **0 rows**; lacks slug, status, schedule and per-item fields | test series (#28) |
| `current_affairs_articles` | **0** | current affairs, daily quiz |
| `subscription_plans` | 1 active; `user_entitlements` 0 | pricing |
| `courses` (old model) | 1 (dormant) | — |
| `exam_announcements`, `exam_claims`, `exam_cutoff_benchmarks` | 0 | hub updates, cut-off views |
| Activity | `test_attempts` 31 (17 `in_progress`, 11 submitted, 3 abandoned); `user_mistake_vault` 12 | analytics, dashboard (QA data only) |

**Readiness summary:**

| Ready now | Blocked until |
|---|---|
| Exam hub, exam knowledge, mocks, mistake vault | |
| | Course: GAP2-4 + documents |
| | Test series: series model + publishing |
| | Current affairs: content |
| | Hindi: content |
| | Pro: Commerce |

### 1e. Candidate profile today

- **`user_profiles`** has `full_name`, `phone`, `avatar_url`, `language_preference` (all 24 are `en`) and `is_active`.
- **`user_exam_goals`** has `exam_id`, `exam_cycle_id`, `priority_rank`, `target_score`, `daily_study_minutes` and `is_active`. It has **0 rows**; the only writer is "Add Exam" on `/mock-tests`.
- **`user_notification_preferences`** is complete (channels, categories, quiet hours) but has no UI.
- `user_study_plans` / `study_plan_items` (0 rows) exist.
- `user_exam_readiness` exists; who writes it is a LOOP-1 item.

**Missing for onboarding (#29).** These are a list only; no migration in UX-0.
- `preparation_stage`
- `exam_medium` (exam language, distinct from UI language)
- `target_year` (for when no cycle row exists)
- `onboarding_completed_at`
- `onboarding_version`
- `diagnostic_attempt_id`
- a diagnostic flag on mock templates

Suggested home: a 1:1 `candidate_profiles` table.

### 1f. Legacy platform study (`D:\Courage Library Blog\SSC CGL`, 923 static HTML files; concepts only, no code reused)

**Worth keeping:**
- sibling-topic sidebar with previous / next for linear study
- topic counts on subject cards
- **a sample question answerable without login** plus a sticky enrol CTA on the mock landing
- rules acceptance before start
- palette counters (answered / marked / remaining)
- an **offline answer queue**
- fullscreen integrity with a watermark
- section accuracy and **filtered review** (all / correct / wrong / skipped) on results
- admin-defined patterns and sections

**Anti-patterns to avoid:**
- **Hand-coded pages per exam:** 4 near-identical 80–90 KB mock landings.
- **Content duplicated across exam trees:** 68 basenames repeated, e.g. the Mauryan Empire 4–5 times.
- **Sidebar copied into 722 pages**, so adding a topic means editing every sibling.
- **Stale hard-coded year:** 155 pages say 2025 while the hub says 2026.
- Dead links (`ssc-chsl-courses.html`, `href="#"` Mock Tests).
- A case-mismatched blog link.
- **Three separate dashboards** (site, mock, coaching).
- **10+ font families** and Tailwind CDN on 916 pages.
- Monolithic pages (index 161 KB).
- **No breadcrumbs, `Course`, `FAQPage` or `BreadcrumbList` schema**.
- 5 of 9 sitemaps carry 1 URL, and SSC MTS appears in no sitemap.

**These anti-patterns are exactly what decisions #26–#28 prevent.** The new IA generates every exam page from systems and keeps one canonical URL per document.

---

## §2 Information architecture (summary of [SITEMAP_IA.md](../../ux/SITEMAP_IA.md))

- **Exam-scoped public tree.** Everything hangs off `/exams/[examSlug]`: the hub, 24 knowledge modules, `/course` (subject / topic), and `/test-series/[seriesSlug]`. It is generated from `exams.slug` and the canonical syllabus, so **adding an active exam adds its whole subtree and its sitemap entries** (#26).
- **Shared content has one canonical URL.** Documents stay at `/articles/[docSlug]`; exam context travels in query parameters with a canonical that excludes them. Cycle pages for the current year point their canonical at the hub. A thin-content rule keeps empty topics out of the index.
- **Working URLs are kept.** These get 308 redirects:

  | From | To |
  |---|---|
  | `/login` | `/auth/login` (fixes 4 dead redirects) |
  | `/register` | `/auth/signup` |
  | `/mock-tests/[attemptId]/result` | `/mock-tests/attempts/[attemptId]` (removes the `[id]` ambiguity) |
  | `/performance` | `/analytics` |
  | `/billing` | `/settings/subscription` |

  The return parameter normalises to `next` (#19).
- **Navigation:**
  - The **public header** is slimmed to Exams, Courses, Test Series, Current Affairs and Pricing, with Sign in and Start free. Practice, Store, Community, coins and streak leave the public header.
  - The footer gets 4 link columns.
  - **App shell:** desktop has a sidebar (Home, My exam, Learn, Practice, Tests, Revision, Analytics). Mobile has a **5-item bottom nav** (Home, Learn, Practice, Tests, Revision). The console is full screen.
  - Breadcrumbs appear on every public page at depth 2 or more, with JSON-LD.
- **Journeys:**
  - Visitor → hub → free mock → sign-up → 4-tap onboarding → console → result → "what to do next" → learn → practise.
  - The daily loop starts in 3 taps or fewer.
  - **Upgrade touchpoints** are a Pro lock panel and a "Notify me when Pro opens" interest capture. The site never shows fake prices and never interrupts a running test.

## §3 Design system (summary of [DESIGN_SYSTEM.md](../../ux/DESIGN_SYSTEM.md))

**Primary colour proposal, derived from the logo:**

| Role | Colour | Contrast | Use |
|---|---|---|---|
| **Primary** | **logo violet `#5000F0`** (scale 50–950, brand = 600) | **8.08:1** on white (AAA as text, and white on it for buttons) | text, links, buttons |
| **Accent** | **logo cyan `#5CD8E6`** | 1.69:1 on white | decorative fills, progress tracks, highlights, always paired with ink text (10.56:1) |

This yields exactly one primary plus a restrained accent, and replaces six competing primary hues.

**Option B fallback:** "trust blue" `#1D4ED8` (6.70:1). It continues today's blue but does not match the logo, so it is not recommended.

**Other token decisions:**
- **Neutrals:** cool slate ink scale (keeps 8,000+ existing usages migration-friendly).
- **Semantic roles:** success, error, warning and info, plus answer-right, answer-wrong and answer-selected. Right/wrong always carries an icon and a label, never colour alone.
- **Contrast:** 32 text and UI pairs were computed. Muted text is ink-500 (4.76:1). Control borders are ink-500, because ink-400 is 2.56:1 and fails the non-text 3:1 rule.
- **Type:**
  - **Inter + Noto Sans Devanagari** via `next/font` (no npm package; Devanagari loads only where used).
  - An 8-step scale with a **12px minimum** (Devanagari 14px with +4px line height), replacing 17 sizes and 1,479 sub-12px uses.
  - Weights 400–700.
- **Shape and depth:** 4 radii plus full (replacing 8) and 4 elevation levels (replacing 9).
- **Motion:** 120 / 200 / 300 ms, opacity and transform only, with reduced motion honoured.
- **Layout:** Tailwind default breakpoints (the app shell switches at `lg`), a z-index scale, and a 2px focus ring (6.85:1).
- **Implementation (UX-1):**
  - `@theme` raw scales, plus semantic aliases via `@theme inline`, so dark mode can be added later without touching components.
  - **`@custom-variant dark` scoped to `[data-theme=dark]`**, which immediately stops the accidental partial dark mode.
  - Primitives rebuilt on `clsx` + `tailwind-merge` (already installed), with native `<dialog>` for modals.
  - A **style ratchet script** (TYPES-1 pattern) that bans raw palette classes, arbitrary sizes, raw `<button>` / `<input>` and `dark:` in migrated student pages.
- **Components:** 28 specified with variants, states and accessibility. These include the Question renderer (per-question EN / हिन्दी toggle, `lang` attributes, shape plus colour palette states), the Pro lock panel and the Pricing card.
- **Content style:** an encouraging, exam-focused voice. No system words in the UI; today's home page shows "Supabase" and "Phase 1B". Bilingual rules: never machine-translate exam content. Formats are `en-IN` numbers (1,00,000; ₹) and dates in Asia/Kolkata ("15 Oct 2026").
- **CWV budgets:** LCP ≤ 2.5s public, INP ≤ 200ms, CLS ≤ 0.1, JS ≤ 120 KB public / 180 KB app.

## §4 Page spec index

All specs are in [`docs/ux/pages/`](../../ux/pages/README.md):

| # | Page | URL | Data readiness | Phase |
|---|---|---|---|---|
| 1 | [Landing](../../ux/pages/landing.md) | `/` | ready (needs sample-question flag) | UX-2 |
| 2 | [Exams directory](../../ux/pages/exams-directory.md) | `/exams` | ready | UX-2 |
| 3 | [Exam detail](../../ux/pages/exam-detail.md) | `/exams/[examSlug]` | ready (syllabus snapshot after GAP2-4) | UX-2 |
| 4 | [Courses catalogue](../../ux/pages/courses-catalogue.md) | `/courses` | **blocked: GAP2-4, documents** | UX-4 |
| 5 | [Course path and player](../../ux/pages/course-path-player.md) | `/exams/[examSlug]/course/…` | **blocked: GAP2-4, documents, practice service** | UX-4 |
| 6 | [Test series catalogue](../../ux/pages/test-series-catalogue.md) | `/test-series` | **blocked: series model** | UX-5 |
| 7 | [Test series detail](../../ux/pages/test-series-detail.md) | `/exams/[examSlug]/test-series/[seriesSlug]` | **blocked: series model** | UX-5 |
| 8 | [Test flow (polish)](../../ux/pages/test-flow.md) | `/mock-tests/…` | ready (B1 commit) | UX-3 |
| 9 | [Onboarding](../../ux/pages/onboarding.md) | `/onboarding/*` | needs profile fields | UX-3 |
| 10 | [Dashboard](../../ux/pages/dashboard.md) | `/dashboard` | v1 ready with fallback; v2 needs LOOP-1 | UX-3 / UX-6 |
| 11 | [My exam home](../../ux/pages/my-exam-home.md) | `/my/[examSlug]` | needs GAP2-4, LOOP-1 | UX-6 |
| 12 | [Practice](../../ux/pages/practice.md) | `/practice` | needs practice-session service | UX-6 |
| 13 | [Mistake vault](../../ux/pages/mistake-vault.md) | `/mistakes` | ready (B1 commit) | UX-3 |
| 14 | [Analytics](../../ux/pages/analytics.md) | `/analytics` | needs `AnalyticsService` read model | UX-7 |
| 15 | [Pricing](../../ux/pages/pricing.md) | `/pricing` | touchpoints ready; checkout needs Commerce | UX-2 / UX-7 |
| 16 | [Profile and settings](../../ux/pages/profile-settings.md) | `/settings/*` | needs profile fields | UX-3 |

## §5 Gaps and build order

### 5a. Backend gaps mapped to owner phases

| Gap | Pages affected | Owner phase |
|---|---|---|
| Canonical syllabus not finalised (0 versions / nodes / mappings) | Course catalogue, path, topic, hub syllabus snapshot, My exam, practice ordering | **GAP2-4** |
| 0 servable learning documents; 0 current affairs; no Hindi content; cycle dates null; no sample-question flag; question volume about 3 per topic | Course, articles, current affairs, Hindi, hub dates, landing teaser, practice | **Content ops** |
| Dashboard legacy reads (mastery, recommendations, vault count); recommendations generator; readiness writer; mastery updates; mistake-recording reliability (swallowed insert errors; 1 of 3 lost in the B1 E2E run during network errors); practice-session service | Dashboard, My exam, practice, mistake vault | **LOOP-1** |
| Event contract (document completed, plan tasks, interest capture, every event name in the specs); `learning_activity_events` drift | All pages (analytics events), progress | **ACT-1** |
| Entitlement read (`B-BILLING-SUB-STATUS`), plans and prices, payments, invoices, Pro test-series tier, drill coin reward (`B-DRILL-REWARD-ARGS`) | Pricing, subscription, series, Pro locks | **Commerce** (owner to confirm; currently UNASSIGNED in TYPES-1) |
| `test_series` publish model: slug, status, schedule, items, access tier | Test series | **Commerce / Content ops** (schema phase) |
| Candidate profile fields (6 fields, listed in §1e) and the onboarding redirect | Onboarding, settings, dashboard | **New small schema phase before UX-3** (proposed name PROFILE-1) |
| `AnalyticsService` read model over engine tables | Analytics | UX-7 (service + page) |
| Auth hygiene: `/login` redirect, `next` normalisation, middleware or page guards for student pages, noindex | All app pages | UX-1 (with SEC rules #15 / #19 / #20) |
| Brand: SVG logo, favicon set, OG template, manifest; about / Kanpur content; legal texts | Landing, about, legal, sharing | **Owner** |

### 5b. Proposed build order

**Context.** The UX-0 prompt does not include the architect's UX-1…UX-7 sequence, so this order is proposed for confirmation. It follows two principles:
1. Ship on systems that have data first.
2. Never build a page whose data system is empty.

| Phase | Scope | Depends on | Why this position |
|---|---|---|---|
| **UX-1** | Design tokens, fonts, primitives, public header / footer, app shell (sidebar + bottom nav), style ratchet, dark-mode neutralisation, `/login` redirect, `next` normalisation, noindex fixes, removal of the placeholder home card | nothing | Every later page consumes it. It removes today's public "Supabase" card and partial dark mode. |
| **UX-2** | Landing, exams directory, exam hub restructure, module pages, pricing touchpoints + interest capture, about / contact / legal shells, sitemap clean-up | UX-1; owner content | **Data is ready**: 70 EK documents, 8 mocks. This is acquisition and SEO value at launch. |
| **UX-3** | Onboarding + settings + candidate profile, dashboard v1 (fallback plan), test-flow polish, mistake vault polish | UX-1; **PROFILE-1 schema**; **B1 committed** | The core loop (mock → mistakes → revise) already works end to end. The profile is required by everything personal. |
| **UX-4** | Courses catalogue, course path, topic, document-player context | **GAP2-4**, published documents, practice-session service (or Practise CTA hidden) | Blocked today: 0 syllabus nodes, 0 servable documents |
| **UX-5** | Test series catalogue and detail; `/mock-tests` becomes a series view | Series schema; Commerce for Pro | Today there are only 8 free mocks for 1 exam, so `/mock-tests` (relabelled in UX-3) is enough until more mocks exist |
| **UX-6** | Practice, My exam home, dashboard v2 (LOOP-1 plan, readiness) | **LOOP-1**, GAP2-4 | Needs mastery and recommendations |
| **UX-7** | Analytics, Pricing checkout / subscription, notifications | `AnalyticsService`; **Commerce**; ACT-1 | Analytics needs volume; payments are disabled by design (SEC-1A) |

**Notes on the order:**
- **Moving test series (UX-5) before the course (UX-4) is reasonable** if GAP2-4 slips, because series only package existing mocks.
- **Placing the course early (UX-2 / UX-3) is challenged:** 0 syllabus nodes and 0 servable documents would produce empty pages. This repeats the legacy "page without content" anti-pattern and is an SEO thin-content risk.

### 5c. Risks

1. **Empty content at launch.** 1 active exam, 0 documents, 0 current affairs, about 3 questions per topic, and 8 mocks.
   - *Mitigation:* thin-content and threshold rules in every spec (hide, don't show empty); launch on mocks, knowledge and revision; set content targets per exam before course launch (for example, at least 1 concept document per high-weight topic and at least 30 questions per topic).
2. **Performance.** The mega-menu header is a server component making 4+ queries (coins, streak, admin check) on every public page. Fonts and Devanagari also cost weight.
   - *Mitigation:* the slim public header has no per-user queries (the user state is a small client island). Fonts follow the budget, and Devanagari loads only where used.
3. **SEO duplication.** Cycle pages vs the hub, exam-scoped topic pages vs shared documents, `?category=` and dead sitemap URLs.
   - *Mitigation:* the canonical rules in IA §3, sitemap generated from systems, and the thin-content rule.
4. **Bilingual cost.** Every question, document and EK module needs a human Hindi version. UI strings are cheap; content is expensive. Devanagari also needs larger type (the layout must allow it).
   - *Mitigation:* i18n keys from UX-1; Hindi per item only when it exists; no machine translation; prioritise Hindi for exams whose aspirants are mostly Hindi-medium (owner decision).
5. **Migration churn.** 705 colour classes and 570 raw buttons exist.
   - *Mitigation:* the style ratchet, plus migrating page by page in UX phases rather than a big-bang restyle.
6. **Data trust.** Partially broken panels (dashboard, billing status) undermine the "trustworthy" direction.
   - *Mitigation:* each panel fails independently with an honest empty state; the B1 Class B items need owners.

## §6 Open questions for the owner (8, each with a recommended answer)

1. **Primary colour:** logo violet `#5000F0` (with cyan accent), or continue blue (Option B, `#1D4ED8`)?
   *Recommended: violet.* It is the logo's own colour, passes AAA, and ends the blue / indigo / purple drift. Also commission an SVG logo and a wordmark in ink or violet, replacing the gradient.
2. **Launch exams:** launch with SSC CGL only (the only active exam with mocks), or also activate CHSL / MTS / GD as knowledge-only hubs?
   *Recommended:* SSC CGL fully, plus CHSL and MTS as knowledge hubs marked "Preparation opening soon". They have 24 and 20 published EK documents, which brings SEO value, with no empty practice blocks.
3. **What is Pro?**
   *Recommended:*
   - **Free:** all mocks in free series, the mistake vault and revision, correct answers in solutions, basic analytics, free lessons.
   - **Pro:** detailed explanations, Pro test series, all lessons, advanced analytics (percentile detail, speed vs accuracy).
   - The correct answer is never paywalled.
4. **Document URL:** keep `/articles/[slug]`, or rename it to `/learn/[slug]` (with 308)?
   *Recommended:* rename to `/learn/[slug]` in UX-4, when the first documents publish. Today it has 0 published documents, so the change costs no SEO equity, and "learn" matches the course language.
5. **Hindi scope at launch:**
   *Recommended:* English UI and content at launch, with i18n-ready UI. Hindi content is introduced per exam after launch, starting with the exam whose aspirants are most often Hindi-medium (owner to name it). Hindi is only shown where a human translation exists.
6. **`/premium` hub:** keep it or fold it into `/pricing` + `/settings/subscription`?
   *Recommended:* fold it in, with a 308 to `/pricing`. Three overlapping pages (premium, billing, pricing) confuse the upgrade story.
7. **Library and CNTS presence:** how prominent should Courage Library Kanpur and CNTS be on the student site?
   *Recommended:* a dedicated `/about` (library: address, timings, photos) and a `/cnts` programme page in the footer, plus one "Made in Kanpur" trust section on the landing page. CNTS keeps its own app, which is linked to, not merged.
8. **Profile schema placement:** a new `candidate_profiles` table (1:1) or extra columns on `user_profiles`?
   *Recommended: a `candidate_profiles` table* (stage, exam medium, target year, onboarding completion / version, diagnostic attempt). It keeps account data separate from preparation intent, matches #29, and is a small additive migration in its own phase (PROFILE-1) before UX-3.

---

## FINAL STATUS: **OPEN**

Everything required is delivered: §1–§6, IA, design system, and 16 page specs. **One item is open:** the signed-in (qa-student) screenshots, blocked by the deleted qa-student identity. After `node scripts/qa/ensure-qa-identities.cjs`, they take one capture run and a docs-only follow-up commit. UX-0 then closes.
