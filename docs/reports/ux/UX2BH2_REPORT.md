# UX-2b.H2: Remaining "Official" / "Verified" claims and plain mock-size labels

**Phase brief:** architect, 2026-10-19.
**Scope:** copy, labels and display only. No data, service, query or flag changes.

Everything runs on a local production build (`scripts/live/with-server.cjs`) on `couragelibrary-next`, browsing read-only as the QA student (password from `.env.local`, never printed; screenshots masked).

> **Status: OPEN.** All work is done and verified, but **not committed**. One permanent gate fails deterministically because of an owner-mandated copy change (§7, §9). The fix is one test line in a file outside every approved list, and the owner's last ruling forbids asking for further extensions in this phase. So this stops at the hard stop.

## 1. Baseline (HEAD `ec580b1`)

| Check | Result |
|---|---|
| Design ratchet | 8/8. rawColor 1 · paletteClass 4721 · darkClass 0 · smallText 398 · legacyImport 211 (stored baseline 4785 / 411 / 211) |
| typecheck / lint | 0 errors / 0 errors, 230 warnings |
| `test_ux2bh_honesty` | 36/36 + 4 VACUOUS (payments OFF) · 3/3 (`--payments-on`) |
| Offline suites (identical outputs, UX-2b.H final run on this code) | sec1a 19/20 (S1-7 pre-existing) · drift1c 46/46 · phase5d 100% · hotfix1 3/4 (H-04 pre-existing) · ux2b3 `--offline` 6/6 |
| Live suites (UX-2b.H final run on this code) | ux2b3 28/28 · UX-1a 25/25 · UX-1b shell 7/7 · shell a11y 75/75 · UX-2a 18/18 · CA routes 6/6 · student-mistake 17/17 · student-pages 38/38 (3 VACUOUS) · anonymous 29/29 |
| DB row counts | 22 tables / scopes (§8) |

**Skipped:** `test_ca5_forensic_suite` and `test_phase5b_live_test_registration`. Both disable TLS verification, and CA5 writes CA rows.

## 2. Hit-by-hit

**Rule key:**
- **O:** "Official" only for a third party's own material we show or link.
- **V:** "Verified" only when a field or process backs it, worded exactly.
- **S:** superlatives removed.
- **CA:** canonical tier names, real process only.

| # | file:line | Old | Verdict | Rule | Evidence | New |
|---|---|---|---|---|---|---|
| E-1a | `app/exams/page.tsx:23` (metadata) | "Verified syllabus, exam patterns, eligibility criteria, pay scales, and previous year trends …" | reword | V | no verification process; the pages show guides | "Guides to Indian government exams: exam pattern, syllabus, eligibility, important dates, pay and past cut-offs, with links to the source documents." |
| E-1b | `app/exams/page.tsx:79` | badge "Official Knowledge Repository" | remove | O | describes our own content | (removed) |
| E-1c | `app/exams/page.tsx:85` | "Verified, commission-accurate exam blueprints … official notification timelines, and career pay matrices." | reword | V, S | modules exist for dates, salary, cut-offs and sources (24 published) | "Guides to each exam: pattern, syllabus, eligibility, important dates, pay and past cut-offs, with links to the source documents." |
| E-2 | `components/exams/exam-hero.tsx:34-39` | badge "Official Verified" when `overallFreshnessStatus === 'VERIFIED_CURRENT'` | remove | V | `VERIFIED_CURRENT` = "an active cycle exists" (`services/exam-knowledge/exam-knowledge-candidate.service.ts:384`); nothing verifies the content. The cycle badge next to it already says "Cycle 2026 (active)" | (removed; unused `ShieldCheck` / `metadata` dropped) |
| E-3a | `app/exams/[slug]/page.tsx:52` (metadata) | "Official notification dates, detailed syllabus …" | reword | O | dates come from imported guide content, not taken verbatim from the notification | "Notification dates, syllabus, exam pattern, eligibility rules and posts for {exam}." |
| E-3b | `app/exams/[slug]/cycle/[cycleYear]/page.tsx:45` | "Official notification details, …" | reword | O | same | "Notification details, syllabus, exam pattern, posts and eligibility for {exam} {year}." |
| E-4a | `components/exams/exam-module-card.tsx:48`; `exam-module-reader-view.tsx:64` | "Verified: {lastVerifiedDate}" with a shield icon | reword | V | `lastVerifiedDate` is a date inside the **imported content's metadata** (a field in the AI prompt template, `exam-knowledge-prompt-builder.service.ts:400`; checked only for format, `exam-knowledge-validator.service.ts:141`). It is not the staff approval (`review_status` APPROVED / `approved_by_user_id`) | "Information as of {15 Oct 2026}" with a calendar icon (Indian date via `formatDateShort`; raw text if the date is unparseable) |
| E-4b | `exam-module-card.tsx:42` (fallback) | "Comprehensive guidance and verified parameters for {name}." | reword | V, S | code fallback, no process | "Guide to {name}." |
| E-4c | "Official Sources" (`exam-quick-nav`, hub section, reader fallback "Official sources and citations") | — | **keep** | O | `ExamOfficialSources` renders only stored source records (title, issuing body, optional `sourceUrl`), and the hub renders it only when `officialSources.length > 0` | unchanged |
| E-5a | `current-affairs-sources-card.tsx:54` | "Verified Sources & Fact Provenance" | reword | V | — | "Sources" |
| E-5b | `current-affairs-sources-card.tsx:58` | "Every event point is checked against official government, statutory, or verified national news sources." | reword | CA | real process: 5-gate validation on import, then staff `submitForReview` → `approveDraft` (`reviewed_by`) → compile → publish, staff/admin-guarded (`services/admin-current-affairs.service.ts:612-770`) | "Every published item passes automated checks and a review by our staff before it goes live. Its sources are listed below by tier." |
| E-5c | `current-affairs-sources-card.tsx:25-42` | Tier labels "Official Govt / Statutory", "Institutional / Multilateral", "Verified National Press", "Secondary Reference" | reword | CA | canonical hierarchy (brief; `docs/architecture/ai-authoring-architecture.md:51-54`) | "Tier 1 — Official government / statutory" · "Tier 2 — Intergovernmental / public institution" · "Tier 3 — Reputable national media" · "Tier 4 — Secondary (blogs, social media, coaching)" |
| E-5d | `components/current-affairs/current-affairs-card.tsx:118` | title "{n} Verified Sources", shield icon | reword | V | — | "{n} sources" / "1 source" (plus `sr-only` text), file icon |
| E-5e | `app/current-affairs/date/[date]/page.tsx:41` (metadata) | "Daily 10Q quiz and verified provenance …" | reword | V | — | "Each event lists its key facts and sources, for government exams." |
| E-5f | `app/current-affairs/[slug]/page.tsx:240` | comment only | keep | — | not rendered | unchanged |
| E-6a | `components/assessment/leaderboard-view-client.tsx:168` | "Your Verified Position" | reword | V | — | "Your position" |
| E-6b | `components/assessment/result-view-client.tsx:297` | "First completed submission verified" | reword | V | coins only on the first completed attempt (`assessment.service.ts:2438-2469`) | "Reward for your first completed attempt" |
| E-6c | `result-view-client.tsx:522` | "Verified answer keys and full conceptual explanations" | reword | V | answer keys are checked only for structure (QB-KEY-1: one valid key, publish refuses invalid ones); no review process for key correctness | "Answer keys with explanations" |
| E-7 | `components/assessment/mock-test-dashboard-view.tsx:679, 687-690` | label "Full-length mock" / "Shorter mock" plus "{m}m Duration • {q} Questions" | reword | — | one fixed threshold mislabels real exams (SSC GD 80 / 60, SSC MTS 90 / 90) | "{N} question(s) · {duration}" via `formatMockShape`, e.g. "100 questions · 1 hr • 200 Marks"; label removed |

### Scope extensions (owner-approved)

**Copy** (owner wording):

| file:line | Old | New | Evidence |
|---|---|---|---|
| `components/wallet/wallet-view-client.tsx:157` | "Verified CL Wallet" | "Courage Library Wallet" | nothing verifies the wallet |
| `app/institutes/page.tsx:13-15, 27, 31, 34, 48-50` | "Partner Coaching Institutes & Cohorts", "Coaching Partner Portal", "Join verified institutional coaching batches …", "No Partner Institutes Listed Yet", "… registrations are being verified" | "Coaching Institutes & Batches", "Coaching institutes", "Join a coaching batch run by an institute on Courage Library, complete the work your batch assigns and track your progress.", "No institutes are listed yet.", "In the meantime, you can practise or join the community discussions." | no partnership record exists. **Per-institute "VERIFIED" badges are kept**: they render only when `is_verified` is true (`app/institutes/page.tsx:72`, `[slug]/page.tsx:40`). **Who sets it:** column default `false` (migration `20260825000031`), but `app/admin/actions.ts:1278` inserts every admin-created institute with `is_verified: true`, so "verified" today means "created by an admin". Owner decision recommended. 0 institutes exist |
| `components/premium/premium-hub-view.tsx:548, 802, 805, 1146` | "Practice authentic past year official question papers year-wise and shift-wise …"; "Curated Tests & Official Papers"; "Full-length mocks, previous year questions, and curated series …"; "Pick year & shift to simulate official test" | "No previous years' papers are available yet."; "Curated Tests"; "Full-length mocks and curated series …" ("Full-length" kept, as the brief asked); "Pick a year and shift to practise in the real exam pattern" | read-only count: `question_sources` has **0 rows** (0 `source_type = 'PYQ'` papers), so the PYQ claim was removed |
| `components/store/redeem-modal.tsx:213` | "Official Courage Library study gear" | "Courage Library study gear" | — |

**Accessibility** (tokens / attributes only):

| file:line | Change |
|---|---|
| `components/current-affairs/current-affairs-filters.tsx:77` | `aria-label="Filter by importance"` on the select (critical select-name on `/current-affairs/date/*`). No option / query / data change |
| `components/wallet/wallet-view-client.tsx:157-160, 232, 509` | `<h1 className="sr-only">Courage Library Wallet</h1>` (badge `aria-hidden`); `text-orange-600` → `text-warning-700`; scroll region `tabIndex={0} role="region" aria-label="Recent coin transactions"` |
| `components/premium/premium-hub-view.tsx:322, 593, 945` | `aria-label="Target exam"` on the exam select; button `bg-emerald-600` → `bg-success-700` (hover 800); table header row `text-slate-400` → `text-fg-secondary` |

**In-scope token touches** (on E-files, for "axe 0 on every touched route"):
- `app/exams/[slug]/page.tsx:233, 276-284`: eligibility link `inline-flex` (target-size); "Duration / Questions / Marks" labels `text-slate-400 text-[10px]` → `text-fg-secondary text-caption`.
- The "Information as of" lines use `text-caption text-fg-secondary`.
- `result-view-client.tsx:297` → `text-caption text-fg-secondary`.

## 3. Allow-list (`scripts/test_ux2bh_honesty.cjs`, `ALLOW`)

Each entry is matched within ±80 characters of a hit. The guard checks **every** match, not only the first.

| Id | Rule (why the use is true) | Hits in the final run |
|---|---|---|
| A-1 | "Official Sources" names the commission's own notices, which we list and link (rule O) | 16 |
| A-2 | "official notification / notice / website": the third party's official notice or website (rule O) | 72 |
| A-3 | "Tier 1 — Official government" is a source-type name (canonical CA tier) | 0 (no published CA article) |
| A-4 | **Stored exam-guide content** (published exam-knowledge module titles, descriptions, articles, FAQs) on `/exams/<slug>/…` only, and only the words official / verified / authoritative. Mostly SSC's own material ("Visit the official SSC portal"); the "Authoritative guide …" descriptions are content claims, listed in §6 for the content phase | 248 |

Our own UI wording on the exam routes is checked **strictly** by L-11, and our UI source by S-6.

## 4. LIVE vs DORMANT

Proof: flag guard plus HTTP, signed out and signed in (`scratchpad classify.cjs`; all flags default off; none set in `.env.local`).

| Route | Guard | Signed out | Signed in | Class |
|---|---|---|---|---|
| `/achievements` | `requireFeatureOrNotFound("LIVE_TESTS")` | 200, 404 card | 200, 404 card | **DORMANT** (soft 404, UX-T0 F-10) |
| `/certificates` | LIVE_TESTS | 200, 404 card | 200, 404 card | **DORMANT** |
| `/performance` | PSYCHOMETRICS | 200, 404 card | 200, 404 card | **DORMANT** |
| `/live-tests/[slug]/submitted` | LIVE_TESTS | 404 | 404 | **DORMANT** |
| `/verify/c/[code]` | LIVE_TESTS | 404 | 404 | **DORMANT** |
| `/wallet` | none | → `/auth/login` | 200, real UI | **LIVE** → owner-approved, fixed |
| `/institutes` (`[slug]`: 0 institutes) | none | 200, real UI | 200, real UI | **LIVE** → approved, fixed |
| `/premium` | none | → login | 200, real UI | **LIVE** → approved, fixed |
| `/store` | none | → login | 200, real UI (claim only in the redeem modal) | **LIVE** → approved, fixed |

**Fix before enabling** (dormant; not edited):

| Where | Claim | Suggested honest wording |
|---|---|---|
| `app/achievements/page.tsx:57, 219` | "Server-verified achievements, national rankings …"; badge "Verified" | "Your badges, streaks and best results"; drop "Verified" unless an awarding record backs it |
| `app/certificates/page.tsx:14, 39, 42, 59` | "official … certificates", "My Official Certificates", "Verified, cryptographically signed credentials from All-India Live Mock Championships", "official certificates of merit" | "Your certificates"; keep "cryptographically signed" only if the signature is checked at `/verify`; drop "All-India Championship" |
| `app/performance/page.tsx:414, 547` | "No verified strengths yet …", "log of verified test submissions" | "No strengths yet …", "log of your submitted tests" |
| `app/live-tests/[slug]/submitted/page.tsx:49` | "Verified & Finalized" | "Submitted" |
| `app/verify/c/[code]/page.tsx:19, 39, 50, 62, 101` | "Official public verification …", "Official Credential Verification Service", "Authentic Credential Verified", "official examination result recalculation", "No official record matches …" | **"Verified" is legitimate there** (our own signature check of our own certificate): "Certificate check", "This certificate is genuine", "No certificate matches this code". Drop "Official" and "All-India" |
| `components/live-test/certificate-modal.tsx:67, 97`; `live-test-result-client.tsx:113, 117, 164`; `live-event-detail-view.tsx:178` | "Official Certificate", "official competition standing … All-India", "Submission Recorded & Verified", "Official All-India Scorecard", "Official Event Schedule" | "Certificate", "Submission recorded", "Your scorecard", "Event schedule (IST)" |
| `app/wallet/page.tsx:58` (fallback) | "Official Courage Library Reward" | "Courage Library reward" (not edited: not in the approved wallet lines) |

## 5. Mock formatter

`formatMockShape` / `formatDurationMinutes` (`lib/assessment/display-rules.ts`).
- `isFullLengthMock`, `mockLengthLabel` and the `FULL_LENGTH_MIN_*` constants were removed.
- `RANK_MIN_COHORT` and `canShowRank` are unchanged.

| Input (questions / minutes) | Output |
|---|---|
| 1 / 1 | "1 question · 1 min" |
| 25 / 15 | "25 questions · 15 min" |
| 100 / 60 | "100 questions · 1 hr" |
| 90 / 90 | "90 questions · 1 hr 30 min" |
| 80 / 60 | "80 questions · 1 hr" |
| 150 / 125 | "150 questions · 2 hr 5 min" |
| 0 / 0 | "" |
| 25 / 0 | "25 questions" |
| undefined / 15 | "15 min" |
| NaN / NaN | "" |
| null / null | "" |
| `{}` | "" |

Unit test U-1: **12/12**; no "NaN" is possible.

**Screenshots:**
- before: `docs/reports/ux/ux2bh2/before/shots/{out,in}_mock-tests_{360,1280}.jpg` ("Full-length mock" / "Shorter mock" labels plus "60m Duration • 100 Questions");
- after: `docs/reports/ux/ux2bh2/after/shots/…` ("100 questions · 1 hr • 200 Marks").
- Rendered: 8/8 cards shaped, at 360 and 1280, signed out and signed in (L-6).

**Noted, not changed:**
- `components/ui/domain/test-card.tsx` TYPE_LABEL "Full-length" (driven by a stored type field);
- `premium-hub-view.tsx:805` "Full-length mocks";
- `app/admin/*`;
- the wallet earning rule "Full-Length Mock +25 CL / Complete Sunday national full-length simulation" (`wallet-view-client.tsx`, outside the approved wallet lines).

## 6. Data-level copy (content phase; stored, not editable here)

- **Exam-guide module descriptions:** 24 published modules on `/exams/ssc-cgl` read "Comprehensive authoritative guide …" / "Authoritative guide …" / "Authoritative breakdown …" / "Authoritative catalog …" / "Authoritative, policy-backed answers …" / "Verified timeline for SSC CGL 2026 …" (seen on the hub cards and module pages).
- **Exam-guide bodies:**
  - superlatives: "Authoritative Source Discipline", "Authoritative Source for Salary", "Answers Reflect Official Position";
  - an unbacked claim: "Every FAQ answer here is drawn from the … Official Examination Notice or verified official rules";
  - "Coaching websites are not authoritative" is fine as a statement.
- **`mistake_cognitive_types` descriptions:** "… deterministically inferred from telemetry" (UX-2b.3).
- **Service strings:**
  - due labels "Due for 2nd Verification" (asserted by phase-4 T13);
  - `services/live-test-result.service.ts:301` "Official All-India Results Published" (dormant);
  - `services/current-affairs-production-sync.service.ts:863` "100% Tier 3 verified HTTPS …" (an internal audit string).

## 7. Tests

**`scripts/test_ux2bh_honesty.cjs`, extended.** Every existing check is kept. The H-10 checks moved to the new format.
- **Final:** payments OFF **39/39 passed, 4 VACUOUS** (L-4b: no published CA article); `--payments-on` **3/3** (P-1: pricing markup still equals the pre-change snapshot).

| Check | What | Result |
|---|---|---|
| U-1 | formatter (12 cases; full-length helpers absent) | PASS |
| U-2 | rank gate (unchanged) | PASS |
| S-1 … S-4 | UX-2b.H statics (`read()` now normalises CRLF, so a `core.autocrlf` checkout cannot change them) | PASS |
| S-5 | mock size from `formatMockShape`; no "Full-length mock" / "Shorter mock" | PASS |
| **S-6** | H2 claims gone from 15 touched source files | PASS. **Non-vacuous:** the same 28 patterns hit **28 / 28 in HEAD**, 0 now |
| **S-7** | CA sources card: canonical tier names plus the true process sentence | PASS |
| L-1 … L-9 | UX-2b.H live checks | PASS (L-4b VACUOUS ×4) |
| **L-2** | global guard: H + H2 phrases on **54 views** (signed out + in, 360 + 1280), every match | PASS: 0 disallowed; allowed A-1 16, A-2 72, A-4 248 |
| **L-6** | 8/8 cards "{N} question(s) · {duration}" | PASS ×4 |
| **L-7** | axe 0 + one h1 + 200 on 54 views | PASS, with **1 recorded exception** matched exactly: `/wallet @1280` color-contrast ×1 (`wallet-view-client.tsx:545`, the transaction-date cell), outside the approved wallet fixes and recorded for the follow-up a11y phase per the owner ruling |
| **L-11** | exam pages (16 views): no "Official Verified" / "Official Knowledge Repository" / "commission-accurate" / "Verified: {date}" / "verified parameters"; "Information as of" present | PASS |

**Regression** (final code and build):

| Gate | Baseline | Final |
|---|---|---|
| CA routes | 6/6 | **6/6** (no DRAFT; CA data paths untouched) |
| `test_ux1a_a11y` | 25/25 | **25/25** (attempt 2; attempt 1 had 19/25 with 58 `fetch failed` / 7 connect timeouts in the server log: the @1440 page never rendered) |
| `test_ux1b_shell` / shell a11y | 7/7 / 75/75 | **7/7 / 75/75** |
| `test_ux2a_landing` | 18/18 | **18/18** |
| `test_ux2b3_mistakes_practice` live / offline | 28/28 / 6/6 | **28/28 / 6/6** |
| signed-in smoke student-mistake | 17/17 | **17/17** |
| **signed-in smoke student-pages** | 38/38 | **38/38** after the owner-approved test line (§9). Before it: 1 deterministic FAIL, because `signed-in-smoke.cjs:79` required `/Partner Coaching Institutes/` while the owner-mandated heading is "Coaching Institutes & Batches". (One earlier attempt also had a transient `/premium` sign-out redirect from the network) |
| `anonymous-smoke` | 29/29 | **29/29** |
| sec1a / drift1c / phase5d / hotfix1 | 19/20 / 46/46 / 100% / 3/4 | identical outputs |
| no-personal-data | OK | OK, 1385 tracked; changed / new files 0 findings |
| design ratchet | 8/8 (4721 / 398 / 211) | **8/8: 4700 / 392 / 211**. Not every metric fell (legacyImport and rawColor flat), so the stored baseline was **not** rewritten |
| typecheck / lint / build | 0 / 0 + 230 / — | **0 / 0 + 230 / exit 0** |

## 8. DB counts and diff

**DB counts:** 22 tables / scopes, before and after: **all identical**.

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
- The only non-GET request in any harness was the sign-in.
- The PYQ / institutes counts were read in `BEGIN READ ONLY`.

**`git diff --stat`** before the approved smoke line. The final staged stat adds `scripts/smoke/signed-in-smoke.cjs | 2 +-`, giving **20 files changed, 215 insertions(+), 124 deletions(-)**; it equals `git diff --ignore-cr-at-eol --stat` and `git diff --cached --stat` (§10):
```
 app/current-affairs/date/[date]/page.tsx           |   2 +-
 app/exams/[slug]/cycle/[cycleYear]/page.tsx        |   2 +-
 app/exams/[slug]/page.tsx                          |  10 +-
 app/exams/page.tsx                                 |   7 +-
 app/institutes/page.tsx                            |  14 +-     (owner-approved)
 components/assessment/leaderboard-view-client.tsx  |   2 +-
 components/assessment/mock-test-dashboard-view.tsx |   9 +-
 components/assessment/result-view-client.tsx       |   4 +-
 .../current-affairs/current-affairs-card.tsx       |   7 +-
 .../current-affairs/current-affairs-filters.tsx    |   1 +      (owner-approved)
 .../current-affairs-sources-card.tsx               |  20 +--
 components/exams/exam-hero.tsx                     |  12 +-
 components/exams/exam-module-card.tsx              |  12 +-
 components/exams/exam-module-reader-view.tsx       |   9 +-
 components/premium/premium-hub-view.tsx            |  13 +-     (owner-approved)
 components/store/redeem-modal.tsx                  |   2 +-     (owner-approved)
 components/wallet/wallet-view-client.tsx           |   9 +-     (owner-approved)
 lib/assessment/display-rules.ts                    |  33 ++--
 scripts/test_ux2bh_honesty.cjs                     | 169 ++++++++++++++++-----
 19 files changed, 214 insertions(+), 123 deletions(-)
```

New: `docs/reports/ux/ux2bh2/` (before / after screenshots and JSON) and this report. No other file changed. `docs/reports/ops/PUBLIC_REPO1_REPORT.md` stays local.

## 9. FINAL STATUS

**UX-2b.H2 status: CLOSED.**

- **Unblocked:** the owner approved exactly one test line (test follows approved copy; no other smoke edits):
  ```diff
  -  '/institutes': ['"Partner Coaching Institutes" heading', H(/Partner Coaching Institutes/)],
  +  '/institutes': ['"Coaching Institutes" heading', H(/^Coaching Institutes/)],
  ```
  (`scripts/smoke/signed-in-smoke.cjs:79`.)
- **Verified before the commit, after the line-ending fix (§10):**
  - typecheck 0 errors;
  - honesty gate **39/39** (+4 VACUOUS) and `--payments-on` **3/3**;
  - signed-in smoke student-pages **38/38**.
- **Also verified:**
  - every E-1 … E-7 claim and the four approved routes are corrected;
  - axe 0 + one h1 on 54 views (1 recorded exception);
  - every regression equals its baseline;
  - the ratchet is down (4700 / 392 / 211);
  - DB counts are identical.
- **Commit:** one local commit, not pushed or deployed.

**Owner decisions recorded (2026-10-20):**
- **Institutes "VERIFIED" badge:** hide it (display only; leave the `is_verified` field alone). It is auto-set when an admin creates an institute, so it verifies nothing. Done in the next phase.
- **Stored "Authoritative guide…" / "Verified timeline…" text:** content phase, as listed in §6.

**Next phase (owner-confirmed, not started): UX-2b.A11Y-1:**
- the wallet transaction-date cell (`wallet-view-client.tsx:545`);
- the remaining legacy-blue / slate contrast debt on live routes;
- the **leaderboard rank gate** (apply `canShowRank` / `RANK_MIN_COHORT` to "Rank #3 of 3");
- **removal of the institutes "VERIFIED" badge** (display only).

## 10. Line endings (EOL)

- **Cause:** the repository uses `core.autocrlf=true` and stores LF (`git ls-files --eol`: `i/lf`). The "before"-screenshot step in this phase (and the non-vacuity proof in UX-2b.H) ran `git stash push` / `git stash pop`. On pop, Git re-checked-out the touched files with **CRLF** in the working tree (16 of the 20 files). Content was unchanged, and the index would still have normalised to LF on `git add`. But the working copy disagreed with HEAD, and node scripts that anchor on `\n` stopped matching (one edit had to be redone with the Edit tool).
- **Fix:** all 20 touched files (plus this report) were rewritten to LF, line endings only. Result: `git ls-files --eol` shows `i/lf w/lf` for every touched file.
- **Proof:**
  - `git diff --stat` = `git diff --ignore-cr-at-eol --stat` = **20 files changed, 215 insertions(+), 124 deletions(-)** (+214 / −123 for the phase plus the approved smoke line);
  - `git diff --cached --stat` showed the same before the commit.
- **Rule:** after any `git stash`, `checkout` or `reset` that rewrites working files, **verify EOL before committing**:
  - `git ls-files --eol <files>` must show `w/lf`;
  - `git diff --stat` must equal `git diff --ignore-cr-at-eol --stat`.
