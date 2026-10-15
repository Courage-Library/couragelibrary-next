# Courage Library: Sitemap and Information Architecture (UX-0)

> Status: proposal for owner and architect review. This document covers documents only; no routes change in UX-0.
> Locked inputs: decisions #26–#30, plus security decisions #15, #19 and #20.
> Evidence: [UX0 discovery report](../reports/ux/UX0_DISCOVERY_REPORT.md), section 1.

## 0. Principles

1. **Pages are views over systems (#26).** Every exam-scoped page is generated from one of these:
   - `exams` and Exam Knowledge (`exam_knowledge_documents`, `exam_cycles`, `exam_patterns`)
   - the canonical syllabus (`exam_syllabus_*` mapped to `canonical_taxonomy_nodes`, GAP2-4)
   - `learning_documents` through `LearningResolverService`
   - the question bank
   - mock tests and the exam engine
   - the mistake vault
   - the candidate profile

   No URL, nav item or template names a specific exam. **Adding an exam row with `is_active = true` makes its hub, course, test series and sitemap entries appear.**
2. **One canonical URL per piece of content.** Shared content is not duplicated per exam: a learning document has a single URL. Exam-scoped pages only link to it, and pass exam context through a query parameter that is excluded from the canonical (see §3.4).
3. **Exam-scoped, human-readable, stable slugs.** URLs use `exams.slug` and taxonomy `slug`, never UUIDs, wherever a page is public and indexable.
4. **Keep working URLs.** Every URL that works today keeps working, or gets a permanent (308) redirect, listed in §3.6.
5. **Two shells.**
   - **Public** pages are indexable and server-rendered.
   - **App** pages are logged-in, `noindex`, and protected with the canonical guards. Redirects to login always go through `/auth/login?next=<sanitized>` (#19/#20).

## 1. Sitemap

### 1.1 Public (indexable)

| Area | Page | Proposed URL | Today |
|---|---|---|---|
| Home | Landing | `/` | PLACEHOLDER ("Phase 1B" + DB health card) |
| Exams | Exams directory | `/exams` (`?category=` filter) | WORKING; filter ignored |
| | Exam hub (detail) | `/exams/[examSlug]` | WORKING |
| | Exam knowledge module (eligibility, pattern, syllabus, dates, cut-offs, salary…) | `/exams/[examSlug]/[moduleSlug]` | WORKING (24 modules for SSC CGL) |
| | Exam cycle view | `/exams/[examSlug]/cycle/[year]` (+`/[moduleSlug]`) | WORKING; becomes canonical → current cycle (§3.5) |
| Courses (#27) | Courses catalogue | `/courses` | DORMANT (old model) → **replaced** by the catalogue of exam courses |
| | Course overview (syllabus path) | `/exams/[examSlug]/course` | MISSING (needs GAP2-4) |
| | Subject in a course | `/exams/[examSlug]/course/[subjectSlug]` | MISSING |
| | Topic page (docs + practice + quiz) | `/exams/[examSlug]/course/[subjectSlug]/[topicSlug]` | MISSING |
| Learn | Learning document | `/articles/[docSlug]` (kept canonical) | WORKING (0 published docs) |
| | Library index | `/articles` | WORKING (empty) |
| Test series (#28) | Test series catalogue | `/test-series` | MISSING |
| | Exam's series list | `/exams/[examSlug]/test-series` | MISSING |
| | Series detail | `/exams/[examSlug]/test-series/[seriesSlug]` | MISSING (`test_series` table exists, 0 rows) |
| | Test instructions | `/mock-tests/[mockId]` | WORKING |
| Current affairs | Hub | `/current-affairs` | WORKING (0 articles) |
| | Article | `/current-affairs/[slug]` | WORKING |
| | Day | `/current-affairs/date/[yyyy-mm-dd]` | WORKING |
| | Daily quiz | `/current-affairs/date/[yyyy-mm-dd]/quiz` | MISSING (quiz card exists on the day page) |
| | Month | `/current-affairs/month/[yyyy-mm]` | WORKING (404 when empty) |
| Commerce | Pricing | `/pricing` | WORKING (status always FREE; payments off) |
| Brand | About + Courage Library Kanpur (physical library) | `/about` | MISSING |
| | Contact | `/contact` | MISSING |
| | CNTS / partner schools | `/cnts` (programme) and `/partners/schools` | MISSING (separate CNTS app exists) |
| Legal | Privacy, Terms, Refund | `/legal/privacy`, `/legal/terms`, `/legal/refund` | MISSING (required before payments) |
| Auth | Login, sign-up, forgot / update password | `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/update-password` | WORKING; add `/login` → `/auth/login` (fixes 4 dead redirects) |
| Community | Threads (existing) | `/community`, `/community/[id]` | WORKING (out of UX-0 scope; keep) |

### 1.2 Onboarding (logged in, noindex) — writes the candidate profile (#29)

`/onboarding` → `/onboarding/exams` → `/onboarding/stage` → `/onboarding/language` → `/onboarding/time` → `/onboarding/target` → `/onboarding/diagnostic` (optional) → `/dashboard`.

Each step is resumable. "Skip for now" is allowed on every step after exams.

### 1.3 Logged-in app (noindex)

| Area | Page | URL | Today |
|---|---|---|---|
| Home | Dashboard | `/dashboard` | BROKEN (partial): mastery and recommendation panels read legacy columns |
| | My exam home | `/my/[examSlug]` | MISSING |
| Learn | Course path with progress | `/exams/[examSlug]/course?…` (same public URL, progress overlay when signed in) | MISSING |
| | Document player in course context | `/articles/[docSlug]?exam=[examSlug]&topic=[topicSlug]` | WORKING page; context MISSING |
| Practice | Practice hub (topic practice, custom sets) | `/practice` (`?exam=&topic=`) | PLACEHOLDER (buttons do nothing) |
| | Topic quiz | `/practice/[examSlug]/[topicSlug]` | MISSING |
| Tests | Test console | `/mock-tests/[mockId]/take` | WORKING |
| | Result | `/mock-tests/attempts/[attemptId]` | WORKING at `/mock-tests/[attemptId]/result` → redirect (§3.6) |
| | Solutions | `/mock-tests/attempts/[attemptId]/solutions` | in result page today → split |
| | Leaderboard | `/mock-tests/[mockId]/leaderboard` | WORKING |
| Revision | Mistake vault | `/mistakes` | WORKING |
| | Mistake detail | `/mistakes/[id]` | WORKING (B1 fixes options and answer) |
| | Drill | `/mistakes/drill` | WORKING (B1 fixes compile) |
| | Revision queue (due today) | `/mistakes?view=due` | partial (revision health exists) |
| Insight | Analytics | `/analytics` | DORMANT as `/performance` (PSYCHOMETRICS) → new page over the exam engine |
| Personal | Bookmarks | `/bookmarks` | MISSING page (`user_question_bookmarks` exists) |
| | Notes | `/notes` | MISSING (`user_lesson_notes` is tied to the old course model) |
| | Notifications | `/notifications` | PLACEHOLDER (`user_notifications` unused) |
| | Profile and settings | `/settings/profile`, `/settings/exams`, `/settings/preferences`, `/settings/notifications`, `/settings/account` | MISSING |
| | Subscription | `/settings/subscription` (absorbs `/billing`) | BROKEN (partial) |
| | Wallet and coins | `/wallet` | WORKING (keep; secondary nav) |

Out of scope for UX-0 but kept as is: descriptive answers, flashcards, institutes, store, community. Dormant modules (live tests, battles, psychometrics, old courses) stay behind their flags and receive no nav entries.

## 2. URL scheme rationale

| Decision | Why |
|---|---|
| `/exams/[examSlug]/…` is the root of all exam-scoped public pages (course, test series, modules) | Matches search intent ("ssc cgl syllabus", "ssc cgl mock test"). Builds topical authority per exam. Generated from `exams.slug`, so adding an exam adds the subtree (#26). |
| Course lives at `/exams/[examSlug]/course`, not `/courses/[slug]` | A course is the exam's syllabus path (#27), one per exam, so the slug would duplicate the exam slug. `/courses` stays as a catalogue that links into the exam subtrees, and the old `/courses/[slug]` remains dormant behind `FEATURE_COURSES`. |
| Topic URL is `…/course/[subjectSlug]/[topicSlug]` using canonical taxonomy slugs | The same canonical topic under two exams gives two exam-scoped topic pages. These are legitimately different (different syllabus position, weightage and practice filter), and both link to the single canonical document URL. |
| Learning documents stay at `/articles/[docSlug]` | It already works, is in the sitemap, and documents are shared across exams. Exam-scoped document URLs would create duplicates. Renaming to `/learn/[docSlug]` is optional (open question 4). |
| Test series under the exam: `/exams/[examSlug]/test-series/[seriesSlug]` | Series are per exam (`test_series.exam_id`, #28). `/test-series` is the cross-exam catalogue. |
| Attempts get their own segment: `/mock-tests/attempts/[attemptId]` | Today `/mock-tests/[id]` means a mock id and `/mock-tests/[id]/result` means an attempt id, which is ambiguous. Attempt pages are private and noindex. |
| App pages are short, top-level paths (`/dashboard`, `/practice`, `/mistakes`, `/analytics`, `/settings/*`) | Mobile bottom nav and deep links stay short. These paths are never indexed. |
| `/my/[examSlug]` is my exam home | It is personal (progress, next action), so it is distinct from the public `/exams/[examSlug]` and is noindex. |

## 3. Canonical, SEO and redirect rules

1. `robots`: `noindex` on every app page, onboarding and auth. The current `Disallow: /dashboard/` with a trailing slash misses `/dashboard`, so add page-level `noindex`.
2. **Sitemap generation from systems:**
   - active exams
   - their modules
   - their course, subject and topic pages, only when a topic has at least one published document or at least 10 published questions (thin-content rule)
   - their test series, published only
   - published documents
   - current affairs

   Remove the dead entries `/learn`, `/blog`, `/courses/[slug]` and the placeholder `/practice`.
3. Each public page declares `alternates.canonical`.
4. **Exam context on shared documents:** `/articles/[docSlug]?exam=ssc-cgl&topic=…` sets its canonical to `/articles/[docSlug]`. The query parameters only drive breadcrumbs and next/previous.
5. **Cycle pages:** `/exams/[slug]/cycle/[currentYear]` has its canonical set to `/exams/[slug]`. Past cycles keep their own canonical (historical value).
6. **Redirects (308, permanent):**

   | From | To |
   |---|---|
   | `/login` | `/auth/login` (also fixes `/achievements`, `/certificates`, `/performance`, live-test result) |
   | `/register` | `/auth/signup` |
   | `/mock-tests/[attemptId]/result` | `/mock-tests/attempts/[attemptId]` |
   | `/performance` | `/analytics` (when analytics ships) |
   | `/billing` | `/settings/subscription` |
   | `/premium` | `/pricing` (if the premium hub is retired; open question 6) |

   Login `next` keeps one name. Normalize `redirect` / `redirectTo` to `next` (#19).
7. **Hindi (later):** use `/hi/...` mirrors with `hreflang`. Only content that is actually translated gets a Hindi URL. No machine-translated thin pages.

## 4. Navigation model

### 4.1 Public header (desktop ≥1024px)

- **Left:** logo (to `/`).
- **Centre:**
  - **Exams** (mega-menu listing categories → active exams; generated)
  - **Courses**
  - **Test Series**
  - **Current Affairs**
  - **Pricing**
- **Right:**
  - **Sign in** (text)
  - **Start free** (primary button)
  - **Signed in:** avatar menu, with a "Go to dashboard" primary button.
- **Mobile (<1024px):** logo, a "Start free" button and a menu button. The menu opens a full-height sheet with the same groups as accordions.
- **Removed from the public header:** Practice, Store, Community mega-menus, coins and streak. These move into the app shell, which reduces today's 5 dropdown groups and 20+ links.

### 4.2 Public footer (4 columns, collapses on mobile)

1. **Exams** (generated top 8 plus "All exams")
2. **Prepare:** Courses, Test series, Current affairs, Articles
3. **Courage Library:** About / Kanpur library, CNTS, Partner schools, Contact
4. **Legal:** Privacy, Terms, Refund

The bottom row has © and a language switch (later).

### 4.3 App shell (signed in)

- **Desktop (≥1024px):** a left sidebar (240px, collapsible to a 72px icon rail) with:
  - Home (`/dashboard`)
  - My exam (switcher for the profile's target exams → `/my/[examSlug]`)
  - Learn (course)
  - Practice
  - Tests
  - Revision (mistakes)
  - Analytics
  - Below a divider: Bookmarks, Notes, Wallet
- **Top bar:** page title or breadcrumb, a search (later), notifications bell, avatar menu (Profile, Subscription, Settings, Sign out). The app shell has no public mega-menu.
- **Mobile (<1024px):** a bottom navigation with 5 items (all needed by the daily loop): **Home · Learn · Practice · Tests · Revision**.
  - Analytics, Bookmarks, Notes, Wallet and Settings sit in the avatar menu (top-right).
  - Touch targets are ≥48px and the nav respects safe-area insets.
  - It is hidden inside the test console, which is full-screen.
- **Exam context:** the active exam (from the profile, switchable) is persistent app state. Learn, Practice and Tests open on that exam.

### 4.4 Breadcrumbs

These are shown on every public page at depth ≥2 and on course pages, and are emitted as `BreadcrumbList` JSON-LD.
- Example: `Exams › SSC CGL › Course › Quantitative Aptitude › Percentage`.
- On mobile, only the parent link is shown (`‹ Quantitative Aptitude`).

## 5. Key journeys

### 5.1 First-time visitor → first mock → result → mistake → learn → practice
1. The visitor lands on `/` (from search, an ad, or a library QR code) or directly on `/exams/ssc-cgl` from SEO.
2. The exam hub shows what the exam is, the next date, the syllabus, a free mock, and the course. The primary CTA is **"Take a free mock"**, with "Start the course" as secondary.
3. Choosing the CTA, they reach `/mock-tests/[mockId]` (instructions; public). **Start** requires sign-in, so it goes to `/auth/signup?next=/mock-tests/[mockId]`.
4. After sign-up, a short onboarding (exam preselected from `next` context; steps: stage, language, daily time, target year; diagnostic skipped because the mock *is* the diagnostic) returns to the instructions.
5. In the console (`/take`) they submit.
6. On the result page they see the score, sections and "You got 9 wrong. They are saved in your Revision list."
7. **Review mistakes:** the solutions page offers per-question "Learn this topic" (resolver document) and "Practise 10 like this".
8. **Learn:** the topic page or document (Free documents open; Pro documents show a lock panel).
9. **Practise:** a topic quiz feeds the mistake vault and mastery.
10. **Dashboard:** "Next best action" now reflects the attempt.

### 5.2 Returning student, daily loop (target ≤ 3 taps to start)
1. `/dashboard` greets them with streak, today's plan and exam countdown.
2. **Today's plan** (from profile daily time + LOOP-1 recommendations) usually contains 3 items:
   - due revision ("12 mistakes due")
   - a topic to learn or practise (weakest syllabus node)
   - today's mock or current-affairs quiz
3. They complete each item and get an inline completion state; the streak updates.
4. Optionally they check Analytics for weekly trend and section accuracy.

### 5.3 Free → Pro upgrade moments (touchpoints only; payments not built)

| Moment | Where | Pattern |
|---|---|---|
| Pro document | Course topic / `/articles/[slug]` | Pro lock panel showing title, outline, "Included in Pro" and a CTA to `/pricing?from=doc` |
| Pro mock in a series | Series detail | Lock badge on the test card; tapping it opens a sheet with what Pro adds and a CTA to `/pricing?from=series` |
| Result solutions depth | Result → solutions | Free gets answers; Pro gets detailed explanations (decision needed: open question 3) |
| Analytics depth | `/analytics` | Basic charts free; percentile, topic heatmap and predicted score Pro |
| Limit reached | Practice | Free daily practice cap (if adopted) shows an inline panel, never a blocking modal mid-question |

**Rules:**
- **Never interrupt a running test.**
- **Never show a fake price.** While payments are off, the CTA reads "Notify me when Pro opens" and records interest. This needs an event, not a payment.
