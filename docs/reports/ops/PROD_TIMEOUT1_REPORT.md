# PROD-TIMEOUT-1: production smoke timeouts after `8203df0`

Phase brief: architect, 2026-10-18. Owner production smokes after `8203df0`:
- student-pages passed;
- **student-mistake** passed its 6 mistake checks, then `page.goto /mock-tests` timed out (120 s, `networkidle`);
- **admin-pages** passed `/admin`, then `page.goto /admin/questions` timed out (180 s, `networkidle`).

Rule followed: the smoke's wait strategy was **not changed** before diagnosis, and is not changed by this phase.

## 1. Reproduction on HEAD (local production build, `with-server.cjs`, port 3100)

Tool: `scripts/diag/page-timing.cjs`, new and diagnostics only. It signs in as the permanent QA identity, then navigates with `waitUntil: 'load'` and records every request: load, networkidle (bounded at 60 s), requests after load, in flight at the end, repeats (≥ 3× the same path), and slow requests (> 30 s).

| Page (identity) | HTTP | load | networkidle | Requests (after load) | In flight at end | Repeating | Slow > 30 s |
|---|---|---|---|---|---|---|---|
| `/admin/questions` (qa-admin) | 200 | 1.5 s | **5.5 s** | 43 (25) | 0 | none | 0 |
| `/mock-tests` (qa-student) | 200 | 2.1 s | **3.1 s** | 25 (6) | 0 | none | 0 |

After load the only traffic is the logo, plus **Next.js `<Link>` prefetches** of the navigation, each aborted when the page settles (`net::ERR_ABORTED`):
- admin: 23 sidebar routes;
- student: `/dashboard`, `/mistakes`, `/exams`, `/current-affairs`.

There is no fetch loop, no repeat and no never-ending request.

The unchanged smokes on HEAD, locally: **student-mistake all passed (17 s), admin-pages all passed (68 s)**.

## 2. The same on `97452f7` (worktree on E:, own build, port 3101)

| Page | load | networkidle | Requests (after load) | In flight | Repeating | Slow |
|---|---|---|---|---|---|---|
| `/admin/questions` | 1.4 s | 3.5 s | 43 (25) | 0 | none | 0 |
| `/mock-tests` | 3.4 s | 4.5 s | 23 (6) | 0 | none | 0 |

The shape is the same: the same request count on the admin page, two fewer static requests on `/mock-tests`, and timings within normal variance.

**`8203df0` introduced no client loop, no extra request and no slow request on either page.** The worktree's node_modules junction was removed before the worktree, and the main node_modules is intact.

## 3. Production, anonymous only (no sign-in)

| Run | Page | load | networkidle | Slow > 30 s |
|---|---|---|---|---|
| 1 | `/mock-tests` | 7.2 s | **62.8 s** | **6**: `/images/logo.png` and the 5 header-link prefetches (`/`, `/exams`, `/current-affairs`, `/pricing`, `/auth/login`). All started at ~7.2 s and **all completed together at ~61.9 s** (200) |
| 2–4 | `/mock-tests` ×3 | 3.6–4.4 s | 5.2–6.0 s | 0 |
| — | `/exams` ×2 | 3.4–3.6 s | 5.8 s | 0 |
| — | `/admin/questions` (anon → login redirect page) | 3.3 s | 5.1 s | 0 |

In run 1 a **static image** stalled for 55 s together with every other in-flight request, and they were released at the same instant. That is a connection-level stall (one shared HTTP/2 connection or the network path), not application work. It happened in 1 of 7 runs from this machine, whose network is known to be bursty (DEV-NET-1).

## 4. Classification

**(d) Not reproducible** on HEAD locally, with evidence: §1 and §2, the timings, and both smokes passing unchanged. Plus **(c) production-path slowness**: §3 shows an all-requests stall of about 55 s.

**Why `networkidle` turns a stall into a timeout on exactly these two pages:**
- `networkidle` needs 500 ms with no connections. Both pages fire `<Link>` prefetch bursts right after load: 23 on the admin sidebar, 4–5 on the student header.
- On production every prefetch is a serverless RSC render.
- admin-pages walks 11 admin pages, each re-firing the 23-route prefetch burst. One stall like run 1 (about 55 s), or a few cold-started prefetches, pushes a single `goto` past its budget. The timeout then reports at the next `goto`, which is exactly where the owner saw it: the page after a passing one.
- student-mistake's `/mock-tests` is its first header-prefetching page after the mistake pages.

**Not a code regression:** no app file changed since `8203df0` on these paths behaves differently, and nothing to fix was found. **No code was changed in this phase.**

**Exact manual check for the owner** (production, signed in; owner only, hence `--owner`; prints paths and timings only):

```bash
node scripts/diag/page-timing.cjs https://couragelibrary-next.vercel.app admin /admin/questions 180 --owner
node scripts/diag/page-timing.cjs https://couragelibrary-next.vercel.app student /mock-tests 120 --owner
```

How to read the result:
- `networkidle` NEVER and `INFLIGHT` lines that do not end: a real never-ending request, with its path.
- `REPEAT n×`: a loop.
- `SLOW` on several requests that all end together: a connection stall, as in §3.
- Then re-run the two smokes once. If they pass, the earlier failure was transient.

## 5. Report only: is `networkidle` the right wait for these pages?

**No.** It measures "the browser stopped prefetching", not "the page is ready". It is flaky on any page with many `<Link>`s on serverless hosting, and it cannot tell a stall from a loop.

**Proposed equally strict alternative (not applied):**
1. `page.goto(url, { waitUntil: 'load' })` with a status check, as now.
2. **Required element** per page, for example:
   - `/admin/questions`: the question-manager heading and either a table row or the empty state;
   - `/mock-tests`: the mock list and, for qa-student, the completed-attempt result link;
   - each admin page: its `h1`.

   Wait up to the current budget, then FAIL with the locator.
3. **No-loop assertion:** observe a 5 s window after the element appears. FAIL if any same-origin, non-prefetch request path repeats ≥ 3×, or if any request stays open > 30 s (prefetches are identified by the `Next-Router-Prefetch` / `RSC` request headers). Report counts, never a silent pass (GATE-HYGIENE-1).
4. Keep the error-boundary / not-found checks.

It asserts more than today (content, plus loop and stall detection), does not depend on prefetch quiet, and fails with a precise reason.

## 6. Files

- `scripts/diag/page-timing.cjs`: new diagnostic, not a gate. Signed-in mode is localhost-only unless `--owner`.
- This report.

No app code, smoke or gate was changed.

## 7. Ruling round (2026-10-18): wait-strategy change (item 1)

**Approved:** replace `networkidle` in `scripts/smoke/signed-in-smoke.cjs` (the only smoke that used it) with `load` + a page-specific required element + a no-loop assertion.

The other `networkidle` users are gates or E2E scripts, not smokes, and are unchanged:
- `ensure-student-fixture`, `student-journey`, `student-drill`;
- the GAP2-4b editor, SEC-1C / 1D live, UX-1a / UX-1b a11y and UX-2a.

They are candidates for the same treatment later.

**New navigation (`go()`):**
1. `page.goto(…, { waitUntil: 'load' })`.
2. The required element must become visible (same budget as before: 120 s, 180 s for admin).
3. Observe for 3 s.
4. FAIL if any **loop-revealing** request (document, fetch / XHR / RSC, script, other) to the same path repeats **> 3×**, if any **static** resource (image, font, media, stylesheet, manifest, or an image / font / CSS path) repeats **> 10×**, or if any request stays open **> 30 s**.

Counts are recorded on every page. A failure records the final URL and the visible headings.

**Deviation, stated:** static resources have a separate cap of 10.
- Every page has 2 next/image logo elements. The browser fetches `/images/logo.png` 4× (reported by Chromium as type `other`) and `/_next/image` for the srcset variants. That is not a loop, but it would fail a literal "> 3×".
- The cap of 10 still catches an image loop.

**Required element per page (old vs new):**

| Page | Old (`networkidle`) | New (`load` + required element) |
|---|---|---|
| `/auth/login` | network quiet | `input[type=email]` |
| `/mistakes` | network quiet | a mistake detail link (`a[href^="/mistakes/"]`, not `/mistakes/drill`). The list renders client-side after `load` (seen at ~6 s), so the element doubles as the "data loaded" wait |
| mistake detail | network quiet | "Question prompt" heading |
| `/mock-tests` | network quiet | "Mock Tests" heading (then the result link, up to 30 s) |
| mock result | network quiet | "Question Review" heading |
| `/dashboard` · `/community` · `/descriptive` · `/descriptive/submissions` · `/flashcards` · `/institutes` · `/premium` · `/store` | network quiet | their `h1`: "Welcome back…", "Community Knowledge Exchange", "Descriptive Answer Writing Studio", "My Descriptive Submissions", "Flashcard Library…", "Partner Coaching Institutes…", "Candidate Premium Hub", "Turn your consistency…" |
| `/wallet` | network quiet | "How to Earn CL Coins" (the page has no `h1`) |
| community / deck detail | network quiet | an `h1` (VACUOUS WARN when no detail exists, as before) |
| `/exams/ssc-cgl` | network quiet | `section#syllabus` (plus the read-model check, unchanged) |
| 14 admin pages | network quiet (180 s) | each page's `h1`: "Admin Studio Overview", "Question Bank Studio", "Pattern Sections", "Subscription Plans & Payment Orders…", "Community Discussion Moderation", "Mains Descriptive Questions…", "Partner Coaching Institutes CMS", "Mock Test Management", "Bulk Question Importer", "Academic Taxonomy", "Examination Management Hub", "Exam Knowledge Studio", "Design system", "Syllabus" |
| `/admin/content` (staff) | network quiet | "Admin Content Studio" |

**Local results** (with-server, local build):

| Smoke | Result |
|---|---|
| student-mistake | **3 consecutive passes** (38–62 s each) |
| student-pages | pass (2 VACUOUS WARN: no community thread / flashcard deck) |
| staff-content / admin-home | pass |
| **admin-pages** | **not 3 consecutive**: passes in 4 of 8 runs, at most 2 in a row |

Every admin-pages failure was network-caused, with server-log network errors in every such run (19–43):
- **`now at /auth/login`:** the required heading never appeared, typically on the first admin page after sign-in. The middleware's `getUser` hit a connect timeout and sent the request to login.
- **`5× GET /auth/login` on one page:** the RSC prefetches of protected links were redirected to login for the same reason.
- **`/admin/exams` document > 30 s:** this page loads in 4.5–15 s on a quiet network and spiked during bursts.

**The new check is doing its job:** it turns a silent hang into a named cause (session dropped to login, a slow document) within the budget.

**App finding (not fixed; out of scope):** when the Supabase auth call in the middleware fails transiently, the middleware treats the user as signed out and redirects them to `/auth/login`. On production that means a network blip can bounce a signed-in user to the login page. Proposal for a later phase: on a network error (as opposed to "no session"), let the request through to the page, which already re-checks the session itself, or retry once.

**Not committed:** the `signed-in-smoke.cjs` change is held in the working tree, because the ruling's condition (3 consecutive local passes of both smokes) is not met for admin-pages on this network. It is the first thing CI-1 Stage 2 can prove on a stable network.

PROD-TIMEOUT-1 status: OPEN. The wait-strategy change is built and student-mistake passes 3× in a row; admin-pages is blocked locally by network-caused session drops. Owner re-run of the two production smokes is still pending.
