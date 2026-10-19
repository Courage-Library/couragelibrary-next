# UX-2b.H: Honesty copy fixes

**Phase brief:** architect, 2026-10-19.
**Scope:** copy changes plus display-only conditions for H-1 … H-11, from UX-T0 §7 and F-03 / F-04 / F-05 / F-07 / F-08 / F-12.
**Principle** (PRODUCT.md): trust and accuracy over hype.
**Not changed:** features, data, services, queries, pricing logic, flags, the test console, the shell, the landing page, current-affairs data paths.

Everything runs on a local production build (`next start` via `scripts/live/with-server.cjs`) on `couragelibrary-next`, browsing read-only as the QA student. The password comes from `.env.local` and is never printed. Screenshots mask the display name and any email address.

## 1. Baseline (HEAD `165c605`, before any edit)

| Check | Result |
|---|---|
| Design ratchet | 8/8. rawColor 1 · paletteClass 4785 · darkClass 0 · smallText 411 · legacyImport 211 |
| `npm run typecheck` / `npm run lint` | 0 errors / 0 errors, 230 warnings |
| `test_sec1a_containment` (fully offline, mocked billing) | 19/20 (S1-7 fails: **pre-existing**) |
| `test_drift1c_features` | 46/46 |
| `test_phase5d_result_engine` | all passed (100%) |
| `test_hotfix1` | 3/4 (H-04 fails, home-page copy since UX-2a: **pre-existing**) |
| `test_ux2b3_mistakes_practice --offline` | 6/6 |
| `anonymous-smoke` (local) | 29/29 |
| UX / CA / signed-in suites | from the UX-2b.3 final run on the same app code: UX-2b.3 28/28 · UX-1a 25/25 · UX-1b shell 7/7 · shell a11y 75/75 · UX-2a 18/18 · CA routes 6/6 · student-mistake 17/17 · student-pages 38/38 (3 VACUOUS) |
| no-personal-data | OK, 1379 files |
| DB row counts | §8 |
| Payments-ON `/pricing` snapshot | captured from the pre-change build with `PAYMENTS_ENABLED=true` for the local process only: `docs/reports/ux/ux2bh/before/pricing_payments_on_snapshot.json` (`<main>` markup, 7,269 characters at 360 and 1280) |

**Billing / pricing / assessment suites found and run:** `test_sec1a_containment` (payments kill switch), `test_drift1c_features`, `test_phase5d_result_engine`, `test_hotfix1`.

**Found but not run**, because both disable TLS verification (standing rule):
- `test_ca5_forensic_suite.cjs`: `rejectUnauthorized: false`, and it inserts and deletes CA rows;
- `test_phase5b_live_test_registration.cjs`.

Their static assertions on the touched CA quiz card ("10 Questions", "10 Minutes", "20 Marks", "Mistake Vault", `/mock-tests/`) were kept true.

## 2. Copy: before → after

| Item | file:line (new) | Before | After | Why it is true now |
|---|---|---|---|---|
| H-1 | `app/auth/signup/page.tsx:23-26` | "Create an account" (legacy h3) / "Join thousands of aspirants preparing for competitive exams" | **h1** "Create your free account" / "Free during early access: mock tests with full answer review and a Mistake Vault for your wrong answers." | Matches the approved landing line ("Free during early access", `content/landing.ts`); mocks with answer review and the vault are live (UX-2b.3, smokes) |
| H-2 | `app/live-tests/page.tsx:42` | "Experience authentic national examination conditions. Compete simultaneously with thousands of candidates … real-time All-India Rank." | "Take a timed mock at a fixed start time, together with every other student registered for it. Results and your rank among those students are published after the test closes." | Registration exists, and the leaderboard / results are served only once an event is `PUBLISHED` (`services/live-test-result.service.ts:289, 551`). The route stays flag-off (404) |
| H-3 | `app/current-affairs/page.tsx:136-156` | "Today's Events Being Processed — Articles for {date} are undergoing 5-gate fact verification." | "No current affairs published for {date} yet." plus "Read the latest published day: {date}" (a link) when a published day exists, else "Nothing has been published yet. Check back later." | The latest day comes from `recentArticles`, which `getHubData` already reads from `status = 'PUBLISHED'`, ordered by `news_date DESC` (no new query). The dev DB has 0 published, so it shows "Nothing has been published yet" |
| H-4 | `app/current-affairs/page.tsx:22-24, 66-70` | title "Exam-Oriented Daily Intelligence & Daily 10Q Quiz"; description and lead "Curated, fact-checked … verified provenance"; pill "EXAM-ORIENTED EVENT INTELLIGENCE" | title "Current Affairs for Government Exams"; "Daily current affairs for government exams: each event with its key facts, sources and the exams it matters for. Practise with the daily quiz when one is published."; pill removed | Each feed item carries `keyTakeaways`, `sourcesCount` and exam mappings; no verification claim is made |
| H-5 | `components/current-affairs/current-affairs-daily-quiz-card.tsx:33-37`; `app/current-affairs/page.tsx:73-79` | card always rendered; the "Start" link shown for `READY` or any `mockTestId`; otherwise "Quiz Curation In Progress … being curated by editorial staff" | card and section render **only** for `status === 'ALREADY_PUBLISHED'` with an id; the "being curated" branch was deleted; "today's verified events" → "today's current affairs"; the section's `aria-labelledby` now points to a real `id` | **Two latent bugs.** `READY` means no mock exists, so the link was dead. `DRAFT_EXISTS` still returns the draft mock's id, so the card linked to a draft mock. Both are closed by the display condition alone |
| H-6 | `config/site.ts:41` | tagline "The One-Stop Government Exam Preparation Platform" | "Learn Smarter. Prepare Independently." | It is only used as the default `<title>` suffix (`lib/seo/metadata.ts:18`). The JSON-LD and manifest use `siteConfig.description` (unchanged, #47). There are no other "N+" / "thousands" / "one-stop" claims in UI or metadata (repository grep) |
| H-7 | `app/pricing/pricing-client.tsx:60-61, 266-330` | with payments off: "Unlock Full Courage Library PRO", a coupon box, "MOST POPULAR", "₹499 + 18% GST", ticks for "Open Articles & Courses" / "1v1 Quiz Battle" / "Descriptive … Evaluation" | **payments OFF** → `PaymentsOffView`: h1 "Plans and pricing", "free during early access … nothing to pay today"; Free card (`PricingCard`, ₹0) ticking only 3 live features, CTA "Take a free mock test"; Pro card: "Opening soon" badge, "Pricing announced soon", disabled "Opening soon". **Payments ON**: the existing markup, untouched | §3. Live features verified: mocks with answer review, Mistake Vault + drills, exam guides (24 published). Dormant ones are not listed (courses, battles, live tests, descriptive evaluation; flags default off) |
| H-8 | `components/assessment/result-view-client.tsx:116`; `app/mock-tests/[id]/page.tsx:100`; `components/assessment/leaderboard-view-client.tsx:45, 58` | "Official Assessment", "Completed this official test", "Official Examination Simulation", "Official Ranked Leaderboard", "(Best attempt per verified candidate)" | "Exam-pattern mock" ×2, "Leaderboard", "Ranked by score, then accuracy, then time taken (best attempt per student)" | Courage Library is not affiliated with SSC / IBPS / RRB; mocks follow the exam pattern. The ranking order is unchanged from the old copy |
| H-9 | `components/assessment/result-view-client.tsx:208-246, 405, 700-704` | "#3 / 3 · Across all verified candidate submissions", "Better than N% of candidates", "Live Competition Leaderboard", "Top 3 Podium", "Topper Score" | rank and percentile only when `canShowRank(totalParticipants)` (≥ 30); below that, "Your rank appears once more students take this mock."; "Students: N have completed this mock"; banner "Leaderboard / See how your score compares / … with the N students who completed this mock"; "Highest Score" | §4. The cohort count is already on the page (`standing.totalParticipants`): no service change. "Topper" was hype on a 3-student cohort |
| H-10 | `components/assessment/mock-test-dashboard-view.tsx:442, 655, 662-663, 682, 725`; `app/dashboard/page.tsx:78` | "Full-Length Mock Tests" (listing 15-minute / 25-question dailies), "Full-Length Mocks Scheduled Soon", "Explore full-length simulations below", "Start Full Mock", "Timed full-length exam" | "More Mock Tests"; each card is labelled by `mockLengthLabel(test)` ("Full-length mock" / "Shorter mock"); "No other mock tests yet"; "Explore more mock tests below"; "Start Mock"; "Timed mock tests" | §5. Rendered: 2 full-length, 6 shorter, each matching its shown size (L-6) |
| H-11 | `app/dashboard/page.tsx:139, 147`; `app/current-affairs/page.tsx:119, 131, 165` | "Curated by your spaced repetition and readiness engine", "No pending recommendations for today. Great job!", "Today's Published Intelligence", "Recent High-Yield Intelligence", "No today's events matching filter" | "Study tasks suggested for you today", "No study tasks for today.", "Today's current affairs", "Recently published", "No events today match this filter" | `dailyRecommendations` come from `daily_study_recommendations`, a list that is **always empty** today (tracked TYPES-1:B-DSH-RECOMMENDATIONS), so "Great job!" congratulated a broken query. No other U-1 word is left in the touched files (only a code comment) |

**Accessibility touches** (tokens only; required by "axe 0 on every touched route"):
- slate-300/400/500 text → `fg-secondary` (CA "Daily Feeds", mock-list streak milestones and badges, "25 Qs • 15m", dashboard empty texts, result "/ 50", masked id, leaderboard "/ 50", "/ 3");
- `text-rose-600` → `danger-700`; orange-600 → `warning-700`; emerald-600 → `success-700` (leaderboard accuracy; the pre-test result button background);
- `text-[10px]` / `[11px]` → `text-caption` where touched;
- the leaderboard scroll region is now focusable (`tabIndex=0`, `role="region"`, `aria-label`);
- the pre-test "Back to Mock Tests" link is ≥ 44px; the footer link is `inline-flex`, and its label "Back to Dashboard" (it went to `/mock-tests`) is now "Back to mock tests";
- pre-test title `CardTitle` (h3) → **h1**;
- the result "View Full Leaderboard" `<Link><Button>` → `ButtonLink` "View leaderboard" (no nested interactive).

### Scope extensions (owner-approved)

1. **`components/assessment/question-review-card.tsx:59`** (result route axe: 5 contrast nodes at 2.63:1). Exactly one line changed:
   ```diff
   -            <span className="text-[11px] text-slate-400 font-mono">
   +            <span className="text-caption text-fg-secondary font-mono">
   ```
   After the change: result route axe **0** at 360 and 1280 (L-7); the ratchet fell further (§7).

2. **`scripts/test_ca_routes.cjs:84-86`** (test only; C-1's regex was written for the old copy). Exactly 3 lines changed; C-2 … C-6, status, error digest, link counts and DRAFT checks are byte-identical:
   ```diff
   -      assert(/Events Being Processed|No [^<]{0,40}events/i.test(hub.body), 'no empty-state block');
   -      // wording honesty is a human review item: the current block claims articles are "undergoing 5-gate fact verification"
   -      if (/undergoing 5-gate fact verification/.test(hub.body)) console.log('  WARN  C-1 empty-state wording implies articles exist ("undergoing 5-gate fact verification") while 0 exist — UX-2b copy item');
   +      assert(/No current affairs published for[\s\S]{0,120}?yet\./i.test(hub.body), 'no empty-state block'); // UX-2b.H heading; the date may sit in its own tag / comment
   +      // UX-2b.H: the old copy claimed articles exist while 0 do; it must never return
   +      assert(!/undergoing 5-gate fact verification|Events Being Processed/i.test(hub.body), 'old empty-state wording is back ("5-gate fact verification" / "Events Being Processed")');
   ```
   **Non-vacuity proof:** the tracked changes were stashed, HEAD was built, and the updated C-1 was run (as a temporary copy, deleted afterwards) against the old page: **FAIL** ("no empty-state block"; CA routes 5/6). After restoring and rebuilding: **PASS**, CA routes **6/6**. The HEAD page source contains both banned old strings (2 matches), so the new hard-FAIL assertion would also catch a regression.

## 3. Pricing: payments OFF and ON

- **OFF** (configured: `PAYMENTS_ENABLED` unset):
  - screenshots: `after/shots/{out,in}_pricing_{360,1280}.jpg` (before: `before/shots/…`);
  - L-3 ×4 PASS: no `₹1–9`, no GST, no "most popular", no coupon; "Opening soon" and "Pricing announced soon" present;
  - L-3b PASS: 0 inputs, 0 enabled buttons in `<main>`; ticked are exactly the 3 live features.
- **ON** (`PAYMENTS_ENABLED=true` set for the local test process only; no flag value or config changed; the page was viewed, never checked out, 0 non-GET):
  - **P-1 PASS at 360 and 1280:** the `<main>` markup equals the pre-change snapshot (7,269 / 7,269 characters, string-equal);
  - screenshots: `before/shots/out_pricing_payments_on_{360,1280}.jpg` and `after/shots/out_pricing_payments_on_{360,1280}.jpg`;
  - source proof: `git diff --numstat app/pricing/pricing-client.tsx` = **66 added, 0 removed**. The ON JSX is untouched, and the OFF view returns before it.
- **For the owner before payments are switched on:** the ON markup still shows "MOST POPULAR", "1v1 Quiz Battle Arena Access", "Open Articles & Courses" and "Descriptive Mains Writing & Evaluation" (all dormant), the coupon box, and "Unlimited Full Mock Tests". The brief required ON to stay exactly as today, so it must be reviewed before enabling payments.

## 4. Rank threshold

`RANK_MIN_COHORT = 30` (`lib/assessment/display-rules.ts`). **It is a placeholder for owner confirmation.**
- `docs/ux/pages/analytics.md:26` and `test-flow.md:61, 127` require rank and percentile to show only "above an attempt threshold", but give no number.
- The QA result (cohort 3) shows "Your rank appears once more students take this mock." with no rank or percentile (L-5 at 360 and 1280).
- At or above the threshold: unit test U-2 (29 → hidden, 30 → shown) plus static S-3, which checks that every `standing.rank` / `standing.percentile` use sits inside the `canShowRank` branch.
- No fixture or production data was written to stage a 30-student cohort.

## 5. Full-length rule

`isFullLengthMock = totalQuestions ≥ 100 AND durationMinutes ≥ 60` (`lib/assessment/display-rules.ts`).
- **Source:** the full first-stage papers on the roadmap (SSC CGL / CHSL Tier 1: 100 questions, 60 min; IBPS / SBI prelims: 100 questions, 60 min; RRB NTPC CBT-1: 100 questions, 90 min).
- **Why the mock's own size:** the page receives no exam-pattern totals, so using them would need a service change (a hard stop).
- **Owner to confirm** when an exam with a smaller full paper is added.
- **Unit cases (U-1, 8/8):**

| Questions / minutes | Result |
|---|---|
| 100 / 60 | full |
| 99 / 60 | shorter |
| 100 / 59 | shorter |
| 25 / 15 | shorter |
| 100 / 90 | full |
| 150 / 120 | full |
| 25 / 60 | shorter |
| NaN / 60 | shorter |

## 6. Screenshots

- Before: `docs/reports/ux/ux2bh/before/shots/` (38)
- After: `docs/reports/ux/ux2bh/after/shots/` (38)
- Names are `{out|in}_{route}_{360,768,1280}.jpg` for `/auth/signup`, `/current-affairs`, `/pricing`, `/mock-tests`, `/mock-tests/[id]`, `/mock-tests/[id]/result`, `/mock-tests/[id]/leaderboard` and `/dashboard`, plus the payments-ON pricing pairs.
- Raw data: `before/runtime_before.json`, `after/runtime_after.json`.

| Route | Before (axe serious/critical @360) | After |
|---|---|---|
| `/mock-tests` signed out / in | color-contrast ×14 / ×15 | 0 / 0 |
| `/mock-tests/[id]/result` | color-contrast ×8, target-size ×1 | 0 |
| `/mock-tests/[id]/leaderboard` | color-contrast ×6, scrollable-region-focusable ×1 | 0 |
| `/mock-tests/[id]` | target-size ×1, h1 = 0 | 0, h1 = 1 |
| `/dashboard` | color-contrast ×4 | 0 |
| `/pricing` | color-contrast ×3 | 0 |
| `/current-affairs` @1280 | color-contrast ×1 | 0 |
| `/auth/signup` | 0, **h1 = 0** | 0, h1 = 1 |

## 7. Test results

**New gate:** `scripts/test_ux2bh_honesty.cjs`.
- Payments OFF: **36/36 passed, 4 VACUOUS** (L-4b: no published CA article exists, so the latest-published link cannot render; reported, not counted as a pass).
- Payments ON: **3/3**.

| ID | Result |
|---|---|
| U-1 full-length rule (8 cases) · U-2 rank gate | PASS |
| S-1 banned phrases gone from source | PASS (the same patterns hit **30 / 30** in the HEAD versions) |
| S-2 OFF view first; no price / GST / coupon / fetch | PASS |
| S-3 rank / percentile only inside the gate | PASS |
| S-4 CA hub calls only `getHubData`; quiz only for `ALREADY_PUBLISHED` | PASS |
| S-5 mock labels from the helper | PASS |
| L-1 H-1, H-3 … H-11 banned phrases absent (2–8 views each, signed out + in, 360 + 1280) | PASS ×10 |
| L-2 global guard, 24 views (thousands of, official, most popular, fact verification, being curated, one-stop, verified candidate); allow-list empty | PASS |
| L-3 ×4, L-3b pricing payments OFF | PASS |
| L-4 ×4 CA honest empty state, no quiz card | PASS (+ 4 VACUOUS L-4b) |
| L-5 ×2 rank gate, cohort 3 | PASS |
| L-6 ×4 mock labels match the rule (2 full, 6 shorter) | PASS |
| L-7 axe 0 + one h1 + 200 on 24 views | PASS |
| L-8 `/live-tests` still 404 (flag off) | PASS |
| L-9 read-only (1 non-GET: the sign-in) | PASS |
| P-1 ×2 payments ON = snapshot · L-9 | PASS |

**Regression** (final code and build):

| Gate | Before | After |
|---|---|---|
| CA routes | 6/6 | **6/6** (after the approved C-1 regex update) |
| `test_ux1a_a11y` | 25/25 | **25/25** |
| `test_ux1b_shell` | 7/7 | **7/7** |
| `test_ux1b_shell_a11y` | 75/75 | **75/75** |
| `test_ux2a_landing` | 18/18 | **18/18** |
| `test_ux2b3_mistakes_practice` live / offline | 28/28 / 6/6 | **28/28 / 6/6** |
| signed-in smoke student-mistake / student-pages | 17/17 / 38 (3 VACUOUS) | **17/17 / 38 (3 VACUOUS)** |
| `anonymous-smoke` | 29/29 | **29/29** |
| `test_sec1a_containment` | 19/20 (S1-7 pre-existing) | **19/20**, identical output |
| `test_drift1c_features` | 46/46 | **46/46** |
| `test_phase5d_result_engine` | 100% | **100%**, identical |
| `test_hotfix1` | 3/4 (H-04 pre-existing) | **3/4**, identical output |
| design ratchet | 8/8 (4785 / 411 / 211) | **8/8**, rawColor 1 · **paletteClass 4721** · darkClass 0 · **smallText 398** · legacyImport 211. Stored baseline not rewritten: the JSON is not in this phase's allowed list |
| no-personal-data | OK, 1379 | OK (re-run after the commit) |
| `npm run typecheck` | 0 errors | **0 errors** |
| `npm run lint` | 0 errors, 230 warnings | **0 errors, 230 warnings** |
| `npm run build` | — | **exit 0** |

## 8. DB counts and changed files

**DB counts:** `BEGIN READ ONLY`, 22 tables / scopes (the same set as UX-2b.3). Before and after: **all identical**.

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

qa-student scoped: vault 2 · bookmarks 0 · attempts 1 · drills 1. Every browser harness logged non-GET requests; the only one was the sign-in POST.

**`git diff --stat`:**
```
 app/auth/signup/page.tsx                           | 11 ++-
 app/current-affairs/page.tsx                       | 62 +++++++++------
 app/dashboard/page.tsx                             | 14 ++--
 app/live-tests/page.tsx                            |  2 +-
 app/mock-tests/[id]/page.tsx                       | 16 ++--
 app/pricing/pricing-client.tsx                     | 66 ++++++++++++++++
 components/assessment/leaderboard-view-client.tsx  | 14 ++--
 components/assessment/mock-test-dashboard-view.tsx | 24 +++---
 components/assessment/question-review-card.tsx     |  2 +-      (owner-approved scope extension)
 components/assessment/result-view-client.tsx       | 92 +++++++++++-----------
 .../current-affairs-daily-quiz-card.tsx            | 49 +++++-------
 config/site.ts                                     |  2 +-
 scripts/test_ca_routes.cjs                         |  6 +-      (owner-approved scope extension)
 13 files changed, 209 insertions(+), 151 deletions(-)
```

**New files:**
- `lib/assessment/display-rules.ts` (the H-10 helper, plus the H-9 threshold as a named constant)
- `scripts/test_ux2bh_honesty.cjs`
- this report
- `docs/reports/ux/ux2bh/` (screenshots, JSON, payments-ON snapshot)

The local-only `docs/reports/ops/PUBLIC_REPO1_REPORT.md` stays uncommitted.

## 9. Claims removed, and data-level copy for a content phase

**Removed with no replacement:**
- the "EXAM-ORIENTED EVENT INTELLIGENCE" pill;
- the coupon box and "MOST POPULAR" (payments OFF);
- the quiz card "being curated" state;
- "Great job!";
- the percentile "%ile" figure below the cohort threshold.

**Found but out of this phase's file list** (not edited; ask before extending):

| Where | What | Problem |
|---|---|---|
| `app/exams/page.tsx:79, 85` | "Official Knowledge Repository", "Verified, commission-accurate exam blueprints" | implies an official status |
| `components/exams/exam-hero.tsx:37` | "Official Verified" badge | implies an official status |
| `components/current-affairs/current-affairs-sources-card.tsx:58` | "Every event point is checked against official government, statutory, or verified sources" | a verification claim on article pages |
| `app/certificates/*`, `app/verify/c/[code]`, `components/live-test/*` | "Official Certificate", "Official All-India Scorecard" | dormant surfaces (live tests flag-off) |
| `components/premium/premium-hub-view.tsx:548, 802, 1146` | "official question papers", "Official Papers" | unverified |
| `content/landing.ts:16` | "free full-length mock tests" | true today (2 full-length mocks), but UX-2a is pending owner review |

**DATA, not code** (content phase):
- the stored summaries of the 24 published exam guide modules on `/exams/ssc-cgl` ("Comprehensive authoritative guide …"; UX-T0 F-17);
- `mistake_cognitive_types` descriptions ("deterministically inferred from telemetry");
- service due labels ("Due for 2nd Verification"; phase-4 T13 asserts them);
- live-test `statusMessage` "Official All-India Results Published" (`services/live-test-result.service.ts:301`, a service, dormant).

## 10. Deferred to the console phase

- `components/assessment/instructions-modal.tsx:28`: "Official Examination Instructions" (console-adjacent, excluded by the brief).
- `components/assessment/question-palette.tsx:228`: an "Official Exam Legend" code comment (not rendered).
- From UX-T0 F-06 / F-21: "Start Mock" routes straight to `/take`, skipping the pre-test page; the timer pulse; console motion.

## 11. FINAL STATUS

**UX-2b.H status: CLOSED.**

- Every in-scope claim H-1 … H-11 is fixed and tested on its route (signed out and signed in, 360 and 1280).
- Payments-ON pricing is proven identical to the pre-change snapshot.
- axe is 0 serious/critical with one h1 on all 24 touched views.
- Every regression gate equals its baseline (CA routes after the approved test-only update).
- The ratchet fell (palette 4785 → 4721, small text 411 → 398).
- DB counts are identical.
- Two owner-approved scope extensions are documented above.
- **Owner decisions pending:**
  - confirm `RANK_MIN_COHORT = 30`;
  - confirm the full-length thresholds (100 questions / 60 min);
  - review the payments-ON pricing copy before enabling payments.
- **Commit:** one local commit, not pushed or deployed.

**Proposed next phase (not started): UX-2b.H2, "Official / verified" claims on the exam surfaces.** Fix `app/exams/page.tsx`, `components/exams/exam-hero.tsx` and `components/current-affairs/current-affairs-sources-card.tsx` (§9), with the same gate pattern, extending `test_ux2bh_honesty.cjs` to `/exams` and `/exams/[slug]`. After that, the roadmap continues with UX-2b.1 (dashboard + results + pre-test).
