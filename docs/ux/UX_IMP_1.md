# UX-IMP-1 — the approved IMPECCABLE-1 improvements

2026-11-02 · LOCAL (branch `feat/ux-imp-1`), not released · source: docs/ux/IMPECCABLE_AUDIT_1.md (owner-approved list).
Before / after screenshots (390 and 1280, local production build): kept OUTSIDE the repo (the admin capture shows a QA
account) — the owner receives them with this report.

## What changed (per approved item)

| # | Item | Change | Proof |
|---|---|---|---|
| 1 | Login a11y | Email / password through `<Field>` (label ↔ input by id), one `<h1>` ("Welcome back"), 48 px inputs and links, errors / notices announced (`<Alert … live>` → role="alert" / "status"), sentence case, no "••••" placeholder; BRAND-2 glass card kept | axe 1 → 0; h1 0 → 1; live L-1 (getByLabel resolves both inputs) |
| 2 | Exam hub targets + order | `orderMocks`: free first → full-length → sectional → other → title (natural) → id — total and stable; breadcrumb links 48 px (phone back link and desktop trail). Mock and guide links: every effective hit area ≥ 48 px (the "25–28 px" in the audit were stretched card links measured by their text box — a measurement artefact; the live gate now measures the card) | offline I-2 (3 permutations → one order); live L-2 at 390 + 1280 |
| 3 | Category intro from live data | `categoryIntro()` names only the listed exams ("Free preparation for SSC CGL … Coming soon: SSC CHSL & SSC MTS."); the admin free text (which promised "GD") is no longer shown, and the page metadata uses the same generated text | offline I-3; live L-3 |
| 4 | Sign-up links follow the setting | Login shows "Create an account" only while sign-up is open, else "New accounts open soon. Explore exams"; the setting is read bounded (1.5 s) and closed on failure (AUTH-1: a sign-in page never hangs). Header, landing and hub CTAs already followed it | offline I-4; live L-1 (closed → 0 sign-up links) |
| 5 | Reveal = progressive enhancement | Nothing is ever hidden: the opacity-0 "pending" state is gone; a section below the fold only rises 12 px → 0 in 200 ms (transform only) when it enters the viewport; off with reduced motion / print | HOME-1 H-19 amended; offline I-5; live L-5 (no-JS and full-page capture: every section visible; negative control) |
| 6 | Admin exam cards | Actions stacked full width (no cut-off), 48 px; plain sentence-case labels (#85): "Exams", "Add exam", "All exams / Live / Drafts", "Live / Draft", "View page", "Guides and sources", "Manage exam", "N published guides"; no text < 12 px on the cards | text < 12 px 65 → 1 (the remaining one is outside the cards); smoke heading + MGMT-01 updated |
| 7 | Exam guides grouped | One panel per group, plain 48 px link rows, ONE "as of" line per group = the OLDEST verified date in it (never a fresher claim than its oldest guide). No content merged — near-duplicates listed below | F1 F-05 amended; page −840 px at 390 |
| 8 | Header current page | Every header action (Sign in, Start free / Explore exams, Go to dashboard — bar and phone menu) carries `aria-current="page"` when it points to the page you are on, with an `aria-[current=page]` style | offline I-8; live L-8 |
| 9 | Readable hero screen | The real mock-player screen as a readable crop: 220 px frame on phones (260 px desktop), top of the screen, the 480 px copy on 2x screens; still lazy + low priority, fixed frame (no shift) | BRAND2 P-06: LCP 1.32 s · CLS 0 · 319 kB (≤ 500 kB); HOME-1 H-13 phone image budget counts the 480 px copy |
| 10 | Exam hub LCP 5.2 s at 390 | **Root cause (measured):** LCP ≈ FCP ≈ TTFB + 150 ms (the LCP element is a text cell) — server time, not the browser. (a) The 5.2 s was the FIRST request after the server started (cold); warm it was 1.2–1.5 s. (b) The candidate view ran TWICE per request (generateMetadata and the page each read the exam, cycles, posts, patterns, sources, claims, guides and the syllabus RPC). (c) ~6 sequential round trips before the first byte. **Fix:** the view is request-cached (shared by metadata and page), the category check and the exam read run in parallel, language + mocks + the course check in one parallel step | Supabase calls per hub render **22 → 14 (−36 %)**, serial round trips ~6 → 4 (server-side fetch count, before = worktree build of 871d371). Wall-clock on the owner's hotspot is too noisy to compare; **next candidate:** the static hub + client CTA pattern (as PERF-HOME-1) |

## Gates

- **UX-IMP-1 offline** `scripts/test_ux_imp1.cjs` (offline list; `--self-test` 7 negative controls — unbound password label,
  two h1, mocks not free-first, category page showing admin text, login always linking to sign-up, reveal CSS that
  hides, a header action without aria-current).
- **UX-IMP-1 live** `scripts/live/test_ux_imp1.cjs` (local build only, read-only): L-1 login, L-2 hub targets (effective
  hit area) + order, L-3 category intro, L-5 no-JS / full-page visibility (+ negative control), L-8 header — 11/11 at
  390 and 1280.
- Amended (same rule, new structure): HOME-1 H-1 / H-13 / H-19, F1 F-05, CA7 LA-01, UX-FIX-1 X-05, BRAND2 C-08, the
  admin smoke heading, MGMT-01 (`test_exam_cleanup_and_management.cjs` — not in CI; it already fails on an unrelated
  `server-only` import, pre-existing).
- Full offline list 89/89; PERF-HOME-1 live, UX2A live, admin-pages smoke, anonymous smoke, BRAND2 probe (P-06 / P-07 /
  P-03), AUTH1 2b1 / 2b2 probes: all PASS. Budgets unchanged: / 109 kB (≤ 110), CLS 0.

## Near-duplicate exam guides (owner review — nothing merged)

SSC CGL, as published (one guide per module of `ExamModuleRegistry`):

1. **Syllabus:** "Detailed Syllabus & Topic Weightage" ↔ "Syllabus Overview & Subject Breakdown"
2. **Cut-offs:** "Cutoff Trends & Qualifying Benchmarks" ↔ "Historical Cutoff Trends & Analysis"
3. **Pay:** "Salary Structure, Pay Levels & In-Hand Pay" ↔ "Post Preference, Pay Levels & Career Perks" (both "Pay Levels")
4. **Posts / jobs:** "Posts, Ministries & Cadre Profiles" ↔ "Job Profiles & Career Progression"
5. **Preparation:** "Preparation Strategy & Study Protocol" ↔ "Subject-Wise Preparation & Study Protocol"
6. **Eligibility:** "Eligibility Criteria (Age, Education & Category)" overlaps "Age Limits & Relaxation Rules" and
   "Educational & Technical Qualifications"
7. **Dates:** "Important Dates & Cycle Timeline" repeats what the page's "Exam cycle" box shows (owner: keep both?)

**STOP for review** — nothing is pushed.
