# GATE-HYGIENE-1: no vacuous passes, G-11 amended, a real project-ref scan

Phase brief: architect, 2026-10-18. New rule: **a check that passes having scanned 0 items is a defect, not a pass.** It is recorded in `docs/testing/PERMANENT_GATES.md` under "Rules".

The changes are test-only and docs-only. There is no app change and no DB change.

## 1. G-11 (`scripts/test_gap2_4a_syllabus.cjs`), the §2b proposal applied

| | Old | New |
|---|---|---|
| Version statuses | real exams hold **only DRAFTs**; the QA exam is never PUBLISHED | real exams may hold PUBLISHED / ARCHIVED history, but **≤ 1 PUBLISHED per exam + cycle** (new, stronger); the QA exam is never PUBLISHED (kept) |
| GD seed | DRAFT `legacy-official-2026`, 4 SECTION / 18 UNIT / 18 mappings, LEGACY_MIGRATION, 18 legacy topics mapped, valid | unchanged, plus the GD version must still be a DRAFT |
| CGL skeleton | `pattern-skeleton-2026` must exist as a DRAFT with 4 SECTIONs equal to the active pattern sections | must exist (any status). Its **shape is asserted only while it is a DRAFT**, and then the pattern-section list must be non-empty (new) |
| Idempotence / determinism | GD and CGL seed re-run is a no-op; GD delete + re-seed is identical (tree + hash) | unchanged. The CGL seed matches its tag in any status, so it stays a no-op while ARCHIVED |

Live result: **PASS**, "CGL skeleton ARCHIVED: shape not asserted (only while DRAFT); re-run no-op; re-seed identical; PUBLISHED scopes ≤ 1 each". GAP2-4a is 12/12.

## 2. Anonymous smoke, a real project-ref check

**Old:** it sha-compared every 20-character `[a-z0-9]` window of the `/` HTML with the ref. On production the HTML has no such run, so it reported "0 candidate tokens checked", which was a vacuous PASS.

**New:** `scripts/smoke/_ref-scan.cjs`, used by `scripts/smoke/anonymous-smoke.cjs`.
- **What it scans:** the HTML **and every same-origin JS chunk the page loads**. Chunks come from `<script src>` / `href` and from the inline RSC payload (`/_next/static/chunks/…`).
- **Minimum coverage:** it FAILs unless ≥ 1 chunk was scanned, ≥ 1 candidate token was found, and every listed chunk was fetched. It reports what it covered.
- **Safety:** the ref is still never printed (hash comparison).
- **Offline proof:** `node scripts/smoke/anonymous-smoke.cjs --self-test` checks four things:
  - a ref planted in a chunk is caught;
  - clean sources pass with tokens counted;
  - empty input reports 0 / 0;
  - chunk paths are found in both `<script src>` and the RSC payload.

  All 4 PASS.

Live: local 11/11 chunks, 24 candidate tokens, no ref. Production: §5.

Context: the browser Supabase client is not bundled into any client chunk today (0 chunks mention the Supabase URL), so this check passes by fact, not by luck. A future client-side Supabase client would inline the URL, which contains the ref, and this check would then fail. That needs an architect decision at the time.

## 3. Vacuous-pass audit: every change

A read-only sweep of the 23 permanent suites found the pattern.
- **min:** a minimum-coverage assertion added, because the set should never be empty.
- **WARN:** prints `WARN  VACUOUS (0 items)`, because the set can legitimately be empty.

| Suite | Check | Change |
|---|---|---|
| `test_no_runtime_db.cjs` | new **R-0** | min: every runtime dir exists and holds files; ≥ 400 files (566 today) |
| `test_types1.cjs` | new **T-00** | min: every scanned dir exists and holds files; ≥ 400 .ts/.tsx files |
| `test_types1_close.cjs` | X-1 | min: the select audit must have run (no spawn error; summary line parsed; ok + failing ≥ 1; ≥ 300 files). A crashed audit used to give 0 FAIL lines and a PASS |
| `test_design_ratchet.cjs` | new **R-0**; R-3; R-4; R-5; R-6 | min: ≥ 200 in-scope files (282 today); ≥ 300 files in R-3 / R-4; ≥ 40 contrast pairs (49); ≥ 1 `--text-*` / `--radius-*` / `--shadow-*` token |
| `test_ux1b_shell.cjs` | U-1; U-5 | min: ≥ 200 student-facing files (233); ≥ 3 shell files |
| `test_qa_identity_guard.cjs` | G-07 | min: ≥ 300 files scanned (559); count reported |
| `test_gap2_4b_editor.cjs` | E-04 | min: ≥ 30 admin UI files (118) |
| `test_syl_import1.cjs` | S-1 | min: ≥ 300 files scanned (554); count reported |
| `test_sec1c_admin_pages.cjs` | S-07 | min: ≥ 30 components/admin files |
| `test_gap2_4b_readers.cjs` | R-01; R-02; R-03; fixture | min: ≥ 300 files (560); ≥ 300 files; ≥ 1 import parsed; **legacy GD topic names ≥ 1**. The R-04 / R-07 leak checks iterate them, and an empty set used to pass |
| `test_ux2a_landing.cjs` | L-2; L-10; L-11; L-15; L-16 | min: ≥ 15 source hrefs (20); ≥ 1 active exam; ≥ 10 links on "/" (14); ≥ 5 metadata descriptions (31). WARN: L-15 if no segment loading.tsx exists |
| `test_ca_routes.cjs` | C-1; C-5; C-6 | min: C-1 requires ≥ 1 article link whenever ≥ 1 article is published. WARN: C-5 with 0 non-published articles; C-6 with 0 published articles (both are 0 today) |
| `smoke/signed-in-smoke.cjs` | student-pages detail links | WARN: no thread / deck detail link, where it used to print INFO and count as passed; the summary now says "(N VACUOUS WARN)" |
| `test_qf1_db.cjs` | SEL-1; RLS-API | min: SEL-1 adds a non-vacuous probe, a manual selection of the draft's question plus published questions, which must select ≥ 1 version and never the draft. The topic probe WARNs if it selects nothing. RLS-API: owner counts of drafts / answers / authoring / batches first (WARN for 0; answers must be ≥ 1); a missing anon key is now a **FAIL**, not a SKIP |
| `test_qb_key1.cjs` | K-12; K-14 | min: ≥ 300 files in K-12; ≥ 1 servable question to probe; ≥ 1 assembled mock question. WARN: practice modes that select nothing; drill with 0 vault rows |
| `test_drill1.cjs` | D1 | min: the generated drill must have ≥ 1 question; D2 "no answers before submit" was vacuous at 0 |
| `test_sec_hotfix4_rls.cjs` | P-2 / P-3 | WARN: tables with 0 rows, whose row reach is unproven (today `exam_posts`, `exam_claims`, `exam_claim_sources`); min: at least one table has rows |

**No change needed** (minimums already present): see the audit summary. Examples: SEC-1B entries ≥ 250; SEC-1C PAGES = 36; SEC-1D HOSTILE ≥ 25; UX-1b U-2 ≥ 15; DRILL-1 vault > 0; lineage exact counts; syllabus checks fail on an AVAILABLE model with no nodes. Loops over hard-coded constant lists cannot be empty and were left alone.

**VACUOUS WARNs printed today** (legitimately empty data, now visible):
- K-14 BOOKMARKED / PYQ / WRONG_QUESTIONS;
- RLS 3 empty tables;
- CA C-5 / C-6;
- student-pages: no community thread or flashcard deck.

## 4. Gates (local build, all live via `with-server.cjs`)

| Gate | Result |
|---|---|
| GAP2-4a (G-11 amended) | 12/12 |
| readers `--base` | 8/8 |
| QF-1 DB | 15/15 |
| K suite | 13/13 (3 VACUOUS WARN) |
| RLS P-1 … P-9 | 9/9 (1 VACUOUS WARN) |
| TYPES-1 / close | 9/9 · 3/3 |
| DRILL-1 | 11/11 |
| SYL-IMPORT-1 | 45/45 |
| CA routes | 6/6 (2 VACUOUS WARN) |
| UX-2a landing | 18/18 |
| signed-in student-pages | all passed (2 VACUOUS WARN) |
| anonymous smoke (local) | all passed: 1 document + 11 chunks, 24 tokens |
| offline: no_runtime_db / design ratchet / UX-1b / QA identity / editor / SEC-1C / readers / K / SYL-IMPORT-1 | 5/5 · 8/8 · 7/7 · 8/8 · 5/5 · 22/22 · 3/3 · 5/5 · 32/32 |
| `--self-test` (planted ref) | 4/4 |
| tsc / lint | 0 / 0 errors |

## 5. Commit, deploy, production

| Step | Result |
|---|---|
| Commit | `77ed801` (22 files, tests / docs only; secret / host scan clean; the only hit is the self-test's fake ref) |
| Push | attempt 1 OK |
| `wait-for-deploy` `77ed801` | deployed (200) |
| Anonymous production smoke | **all passed**. Project-ref check: **1 document + 11/11 chunks, 24 candidate tokens, no ref** (before: 0 tokens, vacuous). `/exams/ssc-cgl` AVAILABLE, 5 titles |

GATE-HYGIENE-1 status: CLOSED
