# DRIFT-1c — Feature quarantine, privilege hardening (066), end-to-end student journey

- **Date:** 2026-10-12
- **Target DB:** couragelibrary-next only. The ref guard passed and TLS was verified on every connection; the old "couragelibrary" project was never contacted.
- **Git:** nothing committed or pushed. Nothing deployed.

**Precondition**
- DRIFT-1b commit `300a4cdd4da3d508c26e7ed4f5aff2678d8d515d` is on `origin/main`.
- The tree was clean at start.

---

## 1. Summary

| Part | Result |
|---|---|
| **A** Feature quarantine (code) | ✅ `config/features.ts` (4 server-only flags, default OFF). Gated: 11 candidate pages (+2 `generateMetadata`), 7 API routes, 107 server actions, 4 admin pages + 1 admin layout, nav (main-nav, header-controls, mobile-nav, dashboard card, admin sidebar ×2), 2 mixed services. No feature code, migrations or components deleted. |
| **B** Migration 066 (TRUNCATE/REFERENCES/TRIGGER) | ✅ Backup → dry-run → applied via runner. **253** grants revoked for each of the 3 privileges; CRUD matrix **identical** (0 differences); none remaining. |
| **C1–C2** E2E student journey (local app + Playwright, dev DB) | ✅ **15/15** steps after fix 067 (see §4). Before 067, /mistakes showed nothing. |
| **C3** DB assertions | ⚠ **PARTIAL.** Attempt, answers, `test_results`, `section_results` and vault/occurrence rows are all correct, but **`question_version_id` is NULL** on the new occurrences. Root cause is a code bug at `services/assessment.service.ts:1975` (not a grant or policy), so it was **not fixed**, per C3 rules. The /mistakes visibility failure **was** a grant issue and was fixed by **067** (SELECT only, authenticated only). |
| **C4** Battles | ❌ Not end-to-end for one participant: room creation and round fetch work, but `user_battle_stats` and `quiz_battle_participants` are `permission denied` for students. **FEATURE_BATTLES default = OFF.** |
| **C5** Cleanup | ✅ 25 rows across 16 tables + the auth user deleted in one transaction. Baseline identical except the ledger row for 067 (§7). |
| Verification | ✅ New offline suite **39/39**; QF-1 offline **73/73**; SEC-1A **20/20**; QF-1 DB **15/15** (after 066/067); tsc **0**; lint **0 errors**; build **OK** |

**Status driver:** the C3 lineage assertion (`question_version_id` populated) fails and needs a one-word code fix outside this phase's allowed fix scope. See §9 and §11.

---

## 2. Flags and every gated surface

**`config/features.ts`**
- Flags: `FEATURE_ADAPTIVE`, `FEATURE_LIVE_TESTS`, `FEATURE_PSYCHOMETRICS`, `FEATURE_BATTLES`.
- Parsing: unset or empty uses the default (**all OFF**); otherwise enabled **only** when exactly `"true"`.
- Server-only: no `NEXT_PUBLIC_`, and no client module imports it (test FLAG-3). Client nav components get server-evaluated booleans as props.
- Helpers in `lib/features/gates.ts`: `requireFeatureOrNotFound` (pages), `featureDisabledApiResponse` (404 `{code:'FEATURE_DISABLED'}`), `featureDisabledActionResult` (actions).
- Admin panel: `components/admin/feature-disabled-panel.tsx`.

| Feature | Surface | Gate (file:line) |
|---|---|---|
| ADAPTIVE | Mock take page: adaptive detection (reads `adaptive_*`) skipped | `app/mock-tests/[id]/take/page.tsx:36` |
| ADAPTIVE | `POST /api/assessment/adaptive-step` → 404 JSON before auth | `app/api/assessment/adaptive-step/route.ts:8` |
| ADAPTIVE | Admin page `/admin/adaptive` → panel | `app/admin/adaptive/page.tsx:17` |
| ADAPTIVE | 37 admin actions | `app/admin/adaptive/actions.ts` (first at :30) |
| ADAPTIVE | 37 dead duplicate actions (still callable) | `app/admin/actions.ts` (first at :1369) |
| ADAPTIVE | Sidebar entry hidden | `components/admin/admin-sidebar.tsx:394`, flag from `app/admin/layout.tsx:43` |
| ADAPTIVE | Exam-deletion blocker count on `adaptive_test_configs` skipped | `services/exam-onboarding/exam-onboarding.service.ts:832` |
| LIVE_TESTS | `/live-tests` | `app/live-tests/page.tsx:17` |
| LIVE_TESTS | `/live-tests/[slug]` (+ metadata) | `app/live-tests/[slug]/page.tsx:13, :25` |
| LIVE_TESTS | `/live-tests/[slug]/take` · `/result` · `/submitted` | `…/take/page.tsx:15`, `…/result/page.tsx:13`, `…/submitted/page.tsx:12` |
| LIVE_TESTS | `/certificates` | `app/certificates/page.tsx:17` |
| LIVE_TESTS | `/verify/c/[code]` (+ metadata) | `app/verify/c/[code]/page.tsx:15, :24` |
| LIVE_TESTS | `/achievements` (live-test achievements; general badges remain on `/wallet`) | `app/achievements/page.tsx:28` |
| LIVE_TESTS | 7 candidate actions | `app/live-tests/actions.ts` (first at :12) |
| LIVE_TESTS | Admin `/admin/live-tests`, `/admin/live-tests/[id]/results` → panel | `app/admin/live-tests/page.tsx:12`, `…/[id]/results/page.tsx:18` |
| LIVE_TESTS | Admin layout for `/admin/live-tests/**` (covers client-rendered intelligence pages) | `app/admin/live-tests/layout.tsx:7` (new) |
| LIVE_TESTS | Admin `/admin/achievements` → panel | `app/admin/achievements/page.tsx:15` |
| LIVE_TESTS | 17 admin actions + 4 intelligence actions | `app/admin/live-tests/actions.ts` (:33), `app/admin/live-tests/intelligence/actions.ts` (:33) |
| LIVE_TESTS | Sidebar entry hidden | `components/admin/admin-sidebar.tsx:407`, flag from `app/admin/layout.tsx:44` |
| LIVE_TESTS | 7 `live_test_*` reads in candidate intelligence → inert empty result | `services/candidate-intelligence.service.ts:29` (`liveTestsQuery`) |
| LIVE_TESTS | Exam-deletion blocker count skipped | `services/exam-onboarding/exam-onboarding.service.ts:829` |
| PSYCHOMETRICS | `/performance` (candidate intelligence view) | `app/performance/page.tsx:43` |
| PSYCHOMETRICS | 5 actions | `app/performance/actions.ts` (first at :10) |
| PSYCHOMETRICS | `services/psychometrics.service.ts` | Never imported anywhere; nothing to gate |
| BATTLES | `/battles`, `/battles/[id]` | `app/battles/page.tsx:13`, `app/battles/[id]/page.tsx:12` |
| BATTLES | 6 API routes (create, join, room-details, active-round, submit-answer, finalize) | `app/api/battles/*/route.ts:6` |
| BATTLES | Nav: main-nav, header-controls, mobile-nav (not currently rendered) | `components/layout/main-nav.tsx:207`, `header-controls.tsx:361`, `mobile-nav.tsx:160`; flags passed at `components/layout/header.tsx:50, :55` |
| BATTLES | Dashboard "1v1 Quiz Battle" card | `app/dashboard/page.tsx:111` |

**Local verification (dev server, flags off)**
- Battles and adaptive API routes returned **404** `{"code":"FEATURE_DISABLED"}`.
- Gated pages render the not-found UI with `noindex` and no feature data.
- **Finding:** because the root `app/loading.tsx` streams the response, Next.js sends these not-found pages with **HTTP 200** (a "soft 404"), not 404. See §9.

---

## 3. Migration 066 — privilege matrix before / after

Process: `scripts/db/backup.cjs pre-drift1c-066` → dry-run OK → applied via runner (ledger row written).

| Privilege (anon / authenticated) on 136 public tables | Before | After |
|---|---|---|
| TRUNCATE | 125 / 128 | **0 / 0** |
| REFERENCES | 125 / 128 | **0 / 0** |
| TRIGGER | 125 / 128 | **0 / 0** |
| SELECT | 60 / 100 | 60 / 100 (identical) |
| INSERT | 0 / 17 | 0 / 17 (identical) |
| UPDATE | 0 / 13 | 0 / 13 (identical) |
| DELETE | 0 / 9 | 0 / 9 (identical) |

- **Revoked:** 253 TRUNCATE, 253 REFERENCES, 253 TRIGGER.
- **SELECT/INSERT/UPDATE/DELETE:** per-table, per-role comparison gives **0 differences**. No RLS policy touched.
- **Default privileges (postgres owner, tables):** before `anon=Dxtm, authenticated=Dxtm`; after `anon=m, authenticated=m`, so TRUNCATE (D), REFERENCES (x) and TRIGGER (t) are removed for future tables. `supabase_admin` default ACLs are not alterable by the migration role and were left unchanged.
- **Finding (out of B1 scope):** PostgreSQL 17 **MAINTAIN** (`m`) is still held by anon/authenticated on 125/128 tables. It allows VACUUM, ANALYZE, REINDEX, CLUSTER, REFRESH and LOCK, though not through PostgREST. Candidate for a follow-up revoke.

**Migration 067 (C3 fix)** `20261012000067_grant_mistake_vault_read.sql`
- `GRANT SELECT … TO authenticated` on `user_mistake_vault`, `user_mistake_occurrences`, `user_mistake_drills`, `mistake_cognitive_types`.
- Backed up (`pre-drift1c-067-…`), dry-run, applied via runner.
- RLS (already enabled with own-row / staff policies) limits students to their own rows. After applying, the test student saw exactly **3** vault rows out of 15.

---

## 4. E2E journey

The local app ran on `:3100` against couragelibrary-next, driven by Playwright 1.63 (installed Chrome). Mock: `ssc-cgl-daily-monday-mock` (daily, 25 questions, all PUBLISHED; today is Monday). Screenshots are in `docs/reports/drift/drift1c-screens/` and show only the synthetic test student.

| # | Step | Result | Evidence / screenshot |
|---|---|---|---|
| C1 | Create test student via Admin API (no `app_metadata.role`, password in memory only) | PASS | id prefix `a6f332de` |
| 1 | Login through the real form | PASS | → `/dashboard` · `01-dashboard.png` |
| 2 | `/mock-tests` renders | PASS | `02-mock-tests.png` |
| 3 | Start published mock ("I Agree & Start Test" → "Enter Fullscreen & Begin Test") | PASS | `03-mock-detail.png`, `04-player-started.png` |
| 4 | In-progress attempt created | PASS | attempt `3b56048d` |
| 5 | Answer 6 questions, 3 deliberately wrong and 3 right; autosaved | PASS | 6 `attempt_answers` rows · `05-answered.png` |
| 6 | Second concurrent attempt on the same daily mock rejected | PASS | `23505 ACTIVE_ATTEMPT_EXISTS` (065 guard) |
| 7 | Student cannot read `question_answers` | PASS | `42501` permission denied |
| 8 | Reload mid-test restores answers | PASS | Q1 selection restored |
| 9 | Reload restores timer from `started_at` | PASS | 13:02 → 12:43 (continued counting down, not reset) · `06-after-reload.png` |
| 10 | Submit → result page renders score | PASS | `/mock-tests/:id/result` · `07-result.png` |
| 11 | `/mistakes` shows the wrong answers | **FAIL → PASS after 067** | before: 0/3 (42501 on mistake tables); after 067: **3/3** · `08-mistakes.png` |
| 12 | Open one mistake | PASS | `/mistakes/:vaultId` HTTP 200 · `09-mistake-detail.png`, `09b-mistake-detail-full.png` |
| 13 | "Learn More" (report only) | REPORTED | No Learn More link. The page shows "Learning material is not available for this question yet" and offers "Launch Remediation Drill" (`/mistakes/drill?singleVaultId=…`). |
| 14 | Student cannot open `/admin` | PASS | "Access Restricted" · `11-admin-restricted.png` |

---

## 5. DB assertions after the journey (read-only)

| Assertion | Result |
|---|---|
| `test_attempts` row submitted | ✅ status `submitted`, `submitted_at` set, 166 s |
| `attempt_answers` | ✅ 6 rows (3 correct, 3 wrong) |
| `test_results` | ✅ 1 row, score **4.50** (= 3×2 − 3×0.5), correct 3 / incorrect 3 |
| `section_results` | ✅ 1 row |
| `user_mistake_vault` rows created | ✅ 3 (UNRESOLVED, count 1). `topic_id` NULL (app does not set it) |
| `user_mistake_occurrences` rows | ✅ 3, `source_context = MOCK_TEST`, `occurrence_status = ACTIVE`, **`attempt_answer_id` populated** |
| `user_mistake_occurrences.question_version_id` populated | ❌ **NULL on all 3** |
| Gamification | 1 `coin_wallets`, 1 `coin_ledger`, 1 `gamification_events`, 1 `streak_activity_logs`, 1 `user_streaks` (completion reward) |

**Root cause of the NULL `question_version_id`:**
- `services/assessment.service.ts:1975` loads the paper with `question_versions(question_id, question_answers(…), question_options(…))` and does **not select `id`**.
- So at `:2059`, `questionVersionId: qv?.id || null` is always null.
- **Fix:** add `id` to that embedded select. This is an app code change, not a grant or policy, so C3 says stop and report: **not fixed in this phase**.
- Mistakes **are** recorded, so this is not a hard stop. Errata revocation (`fn_revoke_mistakes_by_errata`) matches on `question_version_id`, so it cannot revoke these occurrences until the fix lands.

**Root cause of the empty /mistakes:**
- `authenticated` had no table SELECT on the four mistake tables (`42501`), even though RLS select policies exist.
- Fixed by 067 (minimal grant, correct role, through the runner), as C3 allows.

---

## 6. Battles decision (C4)

The check ran as the test student over the user session, with the same RPCs and arguments as `BattleService`:

| Call | Result |
|---|---|
| `fn_find_or_create_battle_room(p_topic_id null, p_is_private false, p_access_tier 'FREE')` | ✅ `{action: CREATED, status: WAITING, room_code, success: true}` |
| `fn_get_active_battle_round(p_room_id)` | ✅ `{status: WAITING, current_round: 1, total_rounds: 5}`. No question until a second player joins. |
| `user_battle_stats` select (needed by `/battles` lobby: `BattleService.getUserBattleStats`) | ❌ `42501 permission denied` |
| `quiz_battle_participants` select (arena/room details) | ❌ `42501 permission denied` |

**Decision: `FEATURE_BATTLES` default stays OFF.**
- The single-participant path cannot reach a question round, and the lobby and arena reads fail for students on missing table grants.
- Enabling battles needs (a) SELECT grants with own-row policies on the battle tables, verified in a separate phase, and (b) a two-player functional test.

---

## 7. Cleanup (C5) and baseline proof

One service-role transaction that deleted only student-scoped rows, then a final check that **no row references the student**, then the auth user deleted via the Admin API:

| Table | Rows deleted |
|---|---|
| quiz_battle_participants / quiz_battle_round_answers / quiz_battle_rooms | 1 / 0 / 1 |
| user_battle_stats | 1 |
| user_mistake_occurrences / user_mistake_vault | 3 / 3 |
| attempt_answers / section_results / test_results / test_attempts | 6 / 1 / 1 / 1 |
| coin_ledger / coin_wallets / gamification_events | 1 / 1 / 1 |
| streak_activity_logs / user_streaks / user_profiles | 1 / 1 / 1 |
| auth.users | 1 |

**Baseline:** the pre-journey snapshot (taken after 066) compared with the post-cleanup snapshot: 40 tracked counts and fingerprints, including `test_attempts`, `attempt_answers`, `test_results`, `section_results`, mistake tables, coin/gamification, `user_profiles`, `user_streaks`, `auth.users` = 24, and the vault/occurrence fingerprints.
- **Only difference:** `schema_migration_ledger` 67 → 68, the ledger row for **067**. 066's row was already in the pre-journey baseline.
- Function bodies: **0** hash differences.

---

## 8. Tests, tsc, lint, build

| Check | Result |
|---|---|
| `node scripts/test_drift1c_features.cjs` (new, offline, all services and Supabase mocked and call-counted) | **39/39** |
| `node scripts/test_qf1_question_factory.cjs` | **73/73** |
| `node scripts/test_sec1a_containment.cjs` | **20/20** |
| `node scripts/test_qf1_db.cjs` (after 066 + 067) | **15/15** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors**, 244 warnings (unchanged) |
| `npm run build` | **success** |

**New suite covers:**
- **FLAG 1–3:** defaults OFF, exact-"true" parsing, server-only.
- **PAGE ×11:** `notFound()` before any service or DB call, incl. `generateMetadata`.
- **API ×7:** 404 `FEATURE_DISABLED` with zero calls.
- **ACTIONS:** every export of 5 action files returns `FEATURE_DISABLED` with zero calls (70); the dead duplicate adaptive block is gated (37).
- **ADMIN ×5:** panel with zero calls.
- **TAKE:** adaptive detection skipped.
- **SERVICE:** live reads wrapped; onboarding counts gated.
- **NAV ×3:** battles links, dashboard card, sidebar entries.
- **ON sanity:** with `FEATURE_BATTLES=true`, the service is reached.

---

## 9. Findings

1. **Mistake lineage bug:** `question_version_id` is never written by submit (`services/assessment.service.ts:1975` selects no `id`). One-word fix pending approval; errata revocation cannot target these occurrences until then.
2. **Mistake detail page renders an empty "QUESTION PROMPT"** (`09-mistake-detail.png`): the question text is not shown on `/mistakes/[id]`. Not investigated (report only).
3. **Learn More:** no link. A graceful fallback "Learning material is not available for this question yet" plus a remediation drill link.
4. **Vault rows created by submit have `topic_id` NULL** (`MistakeService.recordExamMistakes` does not set topic/subject).
5. **Soft 404s:** gated pages return the not-found UI with HTTP 200 because the root `app/loading.tsx` streams the response. Content is gated (no data access, `noindex`), but crawlers and monitoring see 200.
6. **Battles:** students lack SELECT on `user_battle_stats` and `quiz_battle_participants` (42501), so lobby and arena reads fail; one-player flow stops at WAITING.
7. **MAINTAIN privilege** (PostgreSQL 17) still held by anon/authenticated on 125/128 tables.
8. **Dead code:** 37 duplicate adaptive admin actions in `app/admin/actions.ts` (now gated) are still exported as callable server actions.
9. **Unused:** `services/psychometrics.service.ts` is not imported anywhere.
10. **Carried over:** CA admin and daily-quiz services write non-existent audit-log columns; SEC-1 (S3) open RLS; MAINTAIN; mistake count CHECK (backlog).

---

## 10. Commit plan (NOT committed)

**New**
```
config/features.ts
lib/features/gates.ts
components/admin/feature-disabled-panel.tsx
app/admin/live-tests/layout.tsx
supabase/migrations/20261012000066_revoke_unused_table_privileges.sql
supabase/migrations/20261012000067_grant_mistake_vault_read.sql
scripts/test_drift1c_features.cjs
docs/reports/drift/DRIFT1C_QUARANTINE_E2E_REPORT.md
docs/reports/drift/drift1c-screens/*.png   (11 files)
```

**Modified (38)**
- Pages: `app/live-tests/{page,[slug]/page,[slug]/take/page,[slug]/result/page,[slug]/submitted/page}.tsx`, `app/certificates/page.tsx`, `app/verify/c/[code]/page.tsx`, `app/achievements/page.tsx`, `app/performance/page.tsx`, `app/battles/{page,[id]/page}.tsx`, `app/mock-tests/[id]/take/page.tsx`, `app/dashboard/page.tsx`.
- API routes: `app/api/battles/{create,join,room-details,active-round,submit-answer,finalize}/route.ts`, `app/api/assessment/adaptive-step/route.ts`.
- Admin: `app/admin/{layout,adaptive/page,live-tests/page,live-tests/[id]/results/page,achievements/page}.tsx`.
- Actions: `app/admin/actions.ts`, `app/admin/adaptive/actions.ts`, `app/live-tests/actions.ts`, `app/admin/live-tests/actions.ts`, `app/admin/live-tests/intelligence/actions.ts`, `app/performance/actions.ts`.
- Components: `components/admin/admin-sidebar.tsx`, `components/layout/{header,main-nav,header-controls,mobile-nav}.tsx`.
- Services: `services/candidate-intelligence.service.ts`, `services/exam-onboarding/exam-onboarding.service.ts`.

**Never commit:** backups, `.env*`, CA files, scratch scripts (session scratchpad).

Suggested message:
```
feat(drift-1c): feature quarantine flags, revoke unused table privileges, mistake vault read grant

- config/features.ts: server-only FEATURE_{ADAPTIVE,LIVE_TESTS,PSYCHOMETRICS,BATTLES} (default off);
  gated pages (notFound), API routes (404 FEATURE_DISABLED), 107 server actions, admin panels,
  nav/dashboard/sidebar links; live-test reads in candidate intelligence made inert when off
- 066: revoke TRUNCATE/REFERENCES/TRIGGER from anon/authenticated on all public tables (+ defaults)
- 067: GRANT SELECT on mistake vault tables to authenticated (RLS own-row) — fixes empty /mistakes
- E2E student journey verified locally; scripts/test_drift1c_features.cjs (39 tests)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Deploy order:** 066 and 067 are already applied to couragelibrary-next. Deploying this build switches the four features off in the UI. Set `FEATURE_*` env vars in Vercel only to re-enable deliberately.

---

DRIFT-1c STATUS: OPEN. Quarantine, 066 and the E2E journey are complete and verified (39/39, 73/73, 20/20, 15/15, journey 15/15 after the 067 grant fix; baseline restored except the 067 ledger row). One C3 assertion fails: mistake occurrences are recorded without `question_version_id`. The cause is a one-word code bug (`services/assessment.service.ts:1975` does not select `id`) that C3 does not allow fixing in this phase; it needs owner approval.

---

## 12. DRIFT-1d closure

Date: 2026-10-12. Target: couragelibrary-next (ref guard: DB ref = API ref, verified TLS via PROD_CA_PATH).

### 12.1 Code fixes
- `services/assessment.service.ts`: the submit path's embedded `question_versions(...)` select now includes `id`, so `user_mistake_occurrences.question_version_id` is written with the exact version answered (it was always NULL).
- `services/mistake.service.ts` (`recordExamMistakes`): `user_mistake_vault.topic_id` / `subject_id` are resolved server-side from `questions.canonical_topic_id` → `topics.subject_id` (never from client input).

### 12.2 Migration 068 — `20261012000068_mistake_lineage_backfill_and_maintain_revoke.sql`
- sha256 `a29dc97795b03f8acd18813a569fe6756c2ba166c1214d99a6e92861c19b1414`; backup `pre-drift1d-068-2026-10-12T13-08-11` (outside the repo); dry run, then applied via `scripts/db/apply-migration.cjs`; ledger row 068 APPLIED (ledger 69 rows).
- (a) occurrence backfill: **0 rows** updated. All 13 pre-existing occurrences have no `attempt_answer_id`, so they stay `question_version_id = NULL` by design.
- (b) vault backfill: **0 rows** updated (12 vault rows, none with NULL `topic_id`).
- (c) MAINTAIN on public tables: anon **125 → 0**, authenticated **128 → 0**; default ACL for future tables revokes MAINTAIN too. All other privileges (SELECT/INSERT/UPDATE/DELETE CRUD matrix): **0 differences**.
- (d) nothing else; no exception swallowing; no triggers on the backfilled tables.

### 12.3 E2E journey — run 1 evidence (temp student `qa-student-drift1d@example.test`, local app :3100)
| Step | Result |
|---|---|
| C2-01 login → /dashboard | PASS |
| C2-02 /mock-tests renders | PASS |
| C2-03 player started (daily mock `ssc-cgl-daily-monday-mock`, 25 Q, 15 min) | PASS |
| C2-04 attempt in_progress created | PASS |
| C2-05 6 answers saved (3 wrong, 3 right) | FAIL at sample time (4 rows after a fixed 2.5 s wait) — **disproven**: `attempt_answers.created_at` = 7–22 s after start, submit at 31 s → 6/6 saved before submit, 3 correct |
| C2-06 second concurrent attempt rejected | PASS (23505 ACTIVE_ATTEMPT_EXISTS) |
| C2-07 student cannot read question_answers | PASS (42501) |
| C2-08 reload restores answers | PASS |
| C2-09 reload restores timer | PASS (14:52 → 14:37) |
| C2-10 submit → result page | PASS |
| C2-11 /mistakes shows the wrong answers | PASS (3/3) |
| C2-12 open one mistake | PASS |
| C2-13 Learn More (report only) | no Learn More link rendered |

Runs 2–4 did not reach the product steps: `UND_ERR_CONNECT_TIMEOUT` from this machine to the Supabase API (login server action, then the admin `listUsers` call); one run was cut off by a session restart. A direct probe showed 6/6 HTTP 200 with 0.4–8.3 s latency.

### 12.4 DB assertions on run-1 data (`assert` script; read-only + rolled-back errata)
| Check | Result |
|---|---|
| D-1 attempt submitted | PASS |
| D-2 3 occurrences, ACTIVE | PASS |
| D-3 `question_version_id` NOT NULL and = `attempt_answers.question_version_id` | PASS (3/3) |
| D-4 vault `topic_id` = canonical topic, `subject_id` = topic subject | PASS (3/3) |
| D-5 `fn_revoke_mistakes_by_errata` revokes the matching occurrence | PASS (1 revoked → REVOKED_ERRATA), rolled back |
| D-6 errata check left no change | PASS (ACTIVE) |

### 12.5 Cleanup and baseline
Cleanup per C5 (one transaction, then the auth user): run 1 removed 3 occurrences, 3 vault rows, 6 attempt_answers, 1 section_result, 1 test_result, 1 test_attempt, coin/gamification/streak rows, profile, auth user; partial runs cleaned the same way. Post-cleanup snapshot vs pre-journey snapshot (taken after 068): **0 differences of 177** (row counts, attempt statuses, vault/occurrence fingerprints, 135 function hashes, ledger 69).

### 12.6 Tests, tsc, lint, build
- `scripts/test_drift1c_features.cjs` 39/39 · `test_qf1_question_factory` 73/73 · `test_sec1a_containment` 20/20 · `test_qf1_db` 15/15
- `tsc --noEmit` 0 errors · `next lint` 0 errors · `npm run build` OK (compiled successfully)

### 12.7 Re-runnable harness
`scripts/e2e/` (env-driven via `scripts/db/_db-env.cjs`: same ref guard and verified TLS; no secrets; student password generated per run, memory only; local base URL and `.test` email enforced):
- `student-journey.cjs` — the journey above, with the 30 s autosave poll (fixes the C2-05 sampling race) and race-free start navigation
- `assert-mistake-lineage.cjs` — D-1…D-6
- `cleanup-student.cjs` — C5 cleanup with the "nothing references the student" check

Order: `npm run dev -- --port 3100`, then `node scripts/e2e/student-journey.cjs`, `node scripts/e2e/assert-mistake-lineage.cjs`, `node scripts/e2e/cleanup-student.cjs`.

### 12.8 Waiver
W1 (architect, verbatim): "single fully-clean E2E pass not obtained due to Supabase connectivity timeouts (UND_ERR_CONNECT_TIMEOUT); evidence accepted: run-1 product steps all PASS, C2-05 disproven by attempt_answers timestamps (6/6 saved before submit), DB assertions 6/6 incl. errata revocation, suites 39/73/20/15, tsc/lint 0, baseline restored 0/177 differences."

DRIFT-1c STATUS: CLOSED (waiver W1)
