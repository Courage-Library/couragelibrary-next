# UX-2a.1 — Site description, root loading boundary, sitemap (rulings #47 / #48 / #49)

Phase brief (architect, 2026-10-17): implement rulings #47 / #48 / #49 without touching landing-page copy or visuals. UX-2a stays CLOSED-PENDING-OWNER-REVIEW.

Baseline commit: `8a31644`.

## 1. Decisions recorded

| # | Decision |
|---|---|
| **#47** | Site default description (`siteConfig.description` and every consumer: the `constructMetadata()` default, the `generateOrganizationSchema()` Organization JSON-LD fallback, `app/manifest.ts`): *"Courage Library helps you prepare for Indian government exams with free mock tests, answer analysis and a Mistake Vault that turns every wrong answer into revision. Learn Smarter. Prepare Independently."* |
| **#48** | Root `app/loading.tsx` removed. Public routes render static content immediately, and data sections stream via Suspense. Signed-in segments that relied on the root loading UI got a segment-level `loading.tsx` built from `components/ui` skeletons. |
| **#49** | Sitemap: only existing public routes + published content; `/learn` and `/blog` removed. A test checks that every sitemap URL returns 200 on the local build. |
| — | "since August 2024" confirmed by owner project context — kept. |
| — | **Standing rule (live gates):** no unbounded waits (health ≤ 120 s, gate ≤ 15 min); health confirmed before gates; cleanup always; free-port check. `scripts/live/with-server.cjs` is **the required way to run any live gate** (`docs/testing/LIVE_GATES.md`, `docs/testing/PERMANENT_GATES.md`). |
| — | **Accepted deviation (architect note):** the `formatEventDate` fix (§10). |

## 2. #47 — site description and exam-count claims

- `config/site.ts`: `description` is now the #47 text exactly; the BOM and CRLF are kept. All three consumers read `siteConfig.description`, so they all changed with it.
- Repo sweep for exam-count / scale claims in public metadata and copy (`app/`, `components/`, `config/`, `content/`; admin and API excluded):

| Where | Text | Kind | Action |
|---|---|---|---|
| `config/site.ts` (old `description`) | "… Police and **50+ government exams** …" | metadata (site default) | **fixed** (#47) |
| `app/live-tests/page.tsx` metadata `description` | "… compete with **thousands of aspirants** …" | metadata | **fixed**: "Take scheduled live mock tests under real exam timing and see your score, rank and percentile afterwards." |
| `app/live-tests/page.tsx` body | "Compete simultaneously with **thousands of candidates** …" | page copy | **UX-2b list** (not fixed; live tests are flagged off) |
| `app/auth/signup/page.tsx` body | "Join **thousands of aspirants** preparing for competitive exams" | page copy | **UX-2b list** |
| `app/current-affairs/page.tsx` empty state | "Today's Events Being Processed — Articles for {date} are **undergoing 5-gate fact verification**" shown when **0** articles exist | page copy (implies content that does not exist) | **UX-2b list** (found by the new CA routes suite, §7) |
| `siteConfig.tagline` | "The One-Stop Government Exam Preparation Platform" (default `<title>` suffix) | metadata | no count; noted for UX-2b wording review |

- Guarded by test **L-16**: the description is exact, all consumers use it, and no page metadata description contains "N+", "thousands of", "lakhs of" or "millions of".

## 3. #48 — root loading boundary removed

- `app/loading.tsx` deleted (`git rm`).
  - It painted a legacy skeleton (legacy `Container` / `Skeleton`) and made every page arrive as a streamed segment behind it.
  - "/" already streamed its data sections via Suspense (UX-2a), so its hero is now in the first HTML flush (**L-15b**: hero before any streamed segment).
- New shared skeleton `components/shell/page-loading.tsx`: `components/ui/skeleton` + `Container`, `role="status"` + `aria-busy`, no legacy, design ratchet zero.
- **Routes whose loading behaviour changed:**

| Route (segment) | Before | After |
|---|---|---|
| `/dashboard`, `/mistakes` (+ `/mistakes/[id]`), `/wallet`, `/store`, `/notifications`, `/billing`, `/premium` | root legacy skeleton | **segment `loading.tsx` → `PageLoading`** (signed-in) |
| `/performance`, `/achievements`, `/certificates` (flagged) | root legacy skeleton | segment `loading.tsx` → `PageLoading` |
| `/mock-tests/[id]/result`, `/mock-tests/[id]/take`, `/live-tests/[slug]/result`, `/live-tests/[slug]/take` | root legacy skeleton | segment `loading.tsx` → `PageLoading` |
| `/admin/**` | root legacy skeleton | **no loading UI** (deliberate, see below) |
| `/` | legacy skeleton, then streamed page | static content in the first flush; data sections stream (unchanged UX-2a code) |
| All other public routes (`/exams`, `/exams/[slug]`, `/mock-tests`, `/mock-tests/[id]`, `/current-affairs/**`, `/pricing`, `/practice`, `/articles/**`, `/flashcards`, `/descriptive/**`, `/community/**`, `/institutes/**`, `/auth/**`, `/courses/**`, `/battles`, `/checkout`, `/verify/**`, `/faculty/**`) | root legacy skeleton | no loading UI: the server renders the page directly (UX-2b restructures these pages with static-first + Suspense) |

- **Admin deliberately has no `loading.tsx`.**
  - With the root boundary, a denied `/admin` page answered **HTTP 200 + not-found digest** (SEC-1C ruling A). Without a boundary it answers a **real 404** — stricter.
  - A segment loading UI would recreate the streaming boundary, and with it the 200-shaped denial.
  - The admin layout keeps its sidebar during client navigation. SEC-1C `--live` passes 29/29 under the new behaviour.
- **Latent bug exposed:** the boundary had also masked a server render error on `/current-affairs` as 200. See §10 (accepted deviation).

## 4. #49 — sitemap

- `app/sitemap.ts`:
  - **removed** the static `/learn` and `/blog` entries (no route);
  - `/courses/[slug]` entries are emitted **only while `FEATURE_COURSES` is on** (the course pages 404 while it is off);
  - the remaining static routes are `/`, `/exams`, `/current-affairs`, `/practice`, `/mock-tests`, `/flashcards`;
  - dynamic entries (unchanged rules, published / active only) are exam hubs, exam guides, published learning documents, published current affairs + their date / month pages.
- Test **L-17**: every URL in `sitemap.xml` answers 200 on the local build. It first caught `/current-affairs` 500 (§10) and passed after the fix.

## 5. Lab metrics (same CDP method)

Setup:
- Playwright + Chrome DevTools Protocol, local production build via `with-server.cjs`.
- Mobile 360×640, DPR 2, 4× CPU slowdown, "slow 4G" (150 ms RTT, 1.6 Mbps down / 750 kbps up).
- **Median of 5** runs.
- Signed-in = qa-student (local), signed in unthrottled before measuring.

| Page | Metric | Before (`8a31644`) | After (UX-2a.1) |
|---|---|---|---|
| `/` | FCP | 1720 ms | 2004 ms |
| `/` | **LCP** (hero paragraph) | **3620 ms** | **2004 ms** (= FCP: the hero paints in the first frame) |
| `/` | CLS | 0.000 | 0.000 |
| `/` | **TBT** | **1104 ms** | **298 ms** |
| `/dashboard` (signed in) | FCP | 2456 ms | 2132 ms |
| `/dashboard` (signed in) | LCP | 4304 ms | 2864 ms |
| `/dashboard` (signed in) | CLS | 0.000 | 0.000 |
| `/dashboard` (signed in) | TBT | 905 ms | 319 ms |

- **"/":** LCP −45 % and TBT −73 %. FCP is slightly later because the first frame now contains the real hero instead of the legacy skeleton (LCP = FCP).
- **Dashboard:** no regression (all metrics better). The new segment skeleton keeps CLS at 0.
- Individual runs are in the run log. Variance on this machine is high (DEV-NET), but the before/after gap is far larger than the run-to-run spread.
- **Lighthouse is still not run** (not installed; it would be a new dependency).

## 6. Files (commit 1)

| File | Change |
|---|---|
| `config/site.ts` | #47 description |
| `app/live-tests/page.tsx` | metadata description without "thousands of" |
| `app/loading.tsx` | **deleted** (#48) |
| `components/shell/page-loading.tsx` | new — design-system segment skeleton |
| `app/{dashboard,mistakes,wallet,store,notifications,billing,premium,performance,achievements,certificates}/loading.tsx`, `app/mock-tests/[id]/{result,take}/loading.tsx`, `app/live-tests/[slug]/{result,take}/loading.tsx` | new — 14 segment loading UIs |
| `app/sitemap.ts` | #49 |
| `lib/current-affairs/format-event-date.ts` | new — pure formatter (accepted deviation) |
| `components/current-affairs/current-affairs-card.tsx`, `current-affairs-daily-quiz-card.tsx`, `app/current-affairs/page.tsx`, `app/current-affairs/date/[date]/page.tsx`, `app/current-affairs/[slug]/page.tsx` | import the formatter from `lib/` |
| `scripts/test_ux2a_landing.cjs` | + L-15 / L-15b / L-16 / L-17 |
| `scripts/test_ca_routes.cjs` | new — CA route status / empty state / DRAFT-leak suite |
| `scripts/live/with-server.cjs` | new — required live-gate runner |
| `docs/testing/LIVE_GATES.md` | new — standing rule + required runner |
| `docs/testing/PERMANENT_GATES.md` | runner required; + CA routes row |
| `docs/reports/ux/UX2A1_REPORT.md` | this report |

## 7. Gates (local production build, all live gates through `with-server.cjs`)

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 errors / OK |
| `test_ux2a_landing.cjs` (live) | **18/18** (14 UX-2a + L-15 · L-15b · L-16 · L-17; sitemap: every URL 200) |
| `test_ca_routes.cjs` (new, live) | **6/6** + 1 WARN (see below) |
| UX-1b shell (static) / UX-1b shell a11y (live) | 7/7 · **75/75** |
| Design ratchet | 7/7 |
| TYPES-1 / TYPES-1 close | 8/8 · 3/3 |
| no_runtime_db | 4/4 |
| SEC-1B / SEC-1C (offline + **live**) / SEC-1D | 26/26 · 22/22 + **29/29 live** · 14/14 |
| Signed-in smoke (local) student-pages / admin-pages | all passed / all passed |
| Anonymous production smoke | recorded in §8 |

**Current-affairs suites (architect note):**
- **CA-5 / CA-6 not run.**
  - The existing suites are `scripts/test_ca5_forensic_suite.cjs` (CA-5 candidate routes), `scripts/test_ca6_forensic_suite.cjs` (CA-6 SEO / freshness / isolation) and `scripts/test_ca_public_read_regression.cjs`.
  - All three connect to Postgres with **`ssl: { rejectUnauthorized: false }`**. They are on the HOTFIX-2 inventory of TLS-bypass scripts, and the standing security rule forbids running them (backlog **TEST-CA**).
- **What replaces them for these routes:** the new **`scripts/test_ca_routes.cjs`** (verified TLS, local build, via the runner):
  - C-1 `/current-affairs` 200, no error digest, empty-state block and no article cards with 0 articles;
  - C-2 `/current-affairs/date/<today>` 200 + "No events recorded for …"; 3 malformed dates → 404;
  - C-3 `/current-affairs/month/<this month>` 200 + "No events recorded in …"; `2026-13` / `bad` / `2026-1` → 404;
  - C-4 unknown slug → 404;
  - C-5 no non-PUBLISHED slug / headline on hub / date / month pages, and every non-PUBLISHED article URL → 404;
  - C-6 every published article → 200.
- **Honest scope:** the database currently holds **0 current-affairs articles of any status**. So C-5 and C-6 pass vacuously today: no DRAFT can leak and no article can 404. They will bite as soon as content exists.
- **WARN:** the hub's empty-state wording claims articles are "undergoing 5-gate fact verification" while none exist. It is not honest; it is listed for UX-2b (§2) and not changed here.

**Run discipline:**
- The first attempt at the live gates hung for 2 h and was stopped by the owner. Cause: a `until curl …` wait loop that could never succeed under `MSYS_NO_PATHCONV=1`; the server itself was healthy.
- Diagnosis is in the conversation record and `docs/testing/LIVE_GATES.md` ("Windows / Git Bash pitfalls").
- No gate result from that attempt is counted. Every result above comes from bounded `with-server.cjs` runs. Each run confirmed health first and stopped the server afterwards (port 3100 verified free).

## 8. Production smoke

Recorded after the push.

## 9. Owner notes

- No landing copy or visual changed (`content/landing.ts` and `components/landing/**` are byte-identical to `8a31644`).
- UX-2b copy items from §2:
  - signup "Join thousands of aspirants";
  - live tests "thousands of candidates";
  - the current-affairs empty state "undergoing 5-gate fact verification";
  - the tagline wording.

## 10. Deviations

- **Accepted required deviation (architect note, 2026-10-17): `formatEventDate` moved to `lib/current-affairs/format-event-date.ts`.**
  - **Bug:** `formatEventDate` was defined in the client module `components/current-affairs/current-affairs-card.tsx` ("use client"). The **server** pages `/current-affairs`, `/current-affairs/date/[date]` and `/current-affairs/[slug]` called it, which throws *"Attempted to call formatEventDate() from the server but formatEventDate is on the client"*.
  - **How it was masked:** the root loading boundary meant the response had already started as **HTTP 200**, so visitors got the error UI inside a 200.
  - **Production today** (`8a31644`) **still has this latent bug.** `GET /current-affairs` → 200 with an error digest in the payload. The page is linked from the header nav, the footer and the landing page. This commit fixes it.
  - **Fix:** the pure function lives in `lib/`, and all five importers use it. No behaviour change beyond the pages rendering.
  - **Found by:** L-11 / L-17 (`/current-affairs` 500 once the boundary was gone).
- **`/admin` without a loading UI** (§3). This differs from the literal "add segment loading where relied on": a boundary there would weaken SEC-1C's not-found behaviour back to 200-shaped responses.
- **CA-5 / CA-6 not run** because they disable TLS verification (§7). Replaced for these routes by `test_ca_routes.cjs`.
- **Runner path:** the architect note says `scripts/with-server.cjs`; the file is `scripts/live/with-server.cjs` (recorded in both docs).

UX-2a.1 status: OPEN (production smoke pending)
