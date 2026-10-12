# QF-1b — Part A fixes, backup, apply 063 to couragelibrary-next, DB verification

- **Date:** 2026-10-12
- **Target:** Supabase project **couragelibrary-next** (pre-launch development DB).
- **Target check:** the project ref in `POSTGRES_URL_NON_POOLING` equals the ref in `NEXT_PUBLIC_SUPABASE_URL`. This was compared in memory and is enforced again by every DB script. The old "couragelibrary" project was never contacted.
- **Env var names used:** `POSTGRES_URL_NON_POOLING`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (smoke only), `PROD_CA_PATH`. No values were printed.
- **TLS:** verified on every connection (`rejectUnauthorized: true` with the CA from `PROD_CA_PATH`; `pg_dump` with `sslmode=verify-full`). No TLS bypass anywhere.
- **Git:** nothing committed or pushed. Nothing deployed.

---

## 1. Summary

| Step | Result |
|---|---|
| Preconditions (CA file, ref match, verified TLS; server PostgreSQL 17.6) | ✅ |
| Part A: A1 authoring table, A2 mappings policy | ✅ Implemented. Offline suite 73/73, SEC-1A 20/20, tsc 0 errors, lint 0 errors, build OK. |
| Part B: backup (`pg_dump` 17.11, verify-full) | ✅ Verified with `pg_restore --list`. All `question_*` tables present. |
| C1 pre-check | ✅ 0 / 0 |
| C2 apply 063 (single transaction) | ✅ Committed |
| C3 idempotency (re-run inside a rolled-back transaction) | ✅ No duplicated rows or policies |
| C4 DB suite `scripts/test_qf1_db.cjs` | ✅ **15 / 15** |
| C5 baseline before/after | ✅ All 15 tables identical. `question_version_authoring` = 111 = `question_versions`. |
| C6 end-to-end smoke through the real services | ⚠ **17 / 18**. Every functional step passed. Audit-log persistence failed because **`admin_audit_logs` does not exist in this DB** (see §8). |

**New finding (pre-existing, not caused by QF-1):** couragelibrary-next is missing **28 tables from migrations 037–051**:
- the premium audit tables (including `admin_audit_logs`)
- the adaptive engine tables
- the live tests tables
- the psychometrics tables

The DB also has no `supabase_migrations` tracking table, so the repo migrations and this DB have drifted apart.

**⚠ The deployed build is still the old code.** The deployed Vercel app runs on this same DB with the pre-QF-1 build. Its admin question create, edit, delete and bulk-import paths now **fail closed**, because the triggers block direct publishing and in-place edits of published questions. Candidate reads and tests keep working. Deploy the QF-1 build to restore admin authoring through the factory.

---

## 2. Part A changes

**Files changed in this phase:**
- `supabase/migrations/20261012000063_qf1_question_factory_core.sql` (edited in place; it had never been applied)
- `services/question-factory/admin-question-factory.service.ts`
- `app/admin/actions.ts`, which now deletes authoring rows before draft versions in the draft-only hard-delete path
- `types/database.ts`
- `scripts/test_qf1_question_factory.cjs`
- `scripts/test_qf1_db.cjs`, which replaces `scripts/test_qf1_staging_db.cjs` (removed)

Overall tracked diff vs HEAD (all QF-1 work):
```
 11 files changed, 313 insertions(+), 818 deletions(-)
```
New untracked files are listed in §11.

**A1: `question_version_authoring`**
- Columns: `version_id` UUID PK, FK to `question_versions` ON DELETE RESTRICT; `origin` (CHECK); `contract_version`; `context_hash`; `authoring_metadata`; `import_batch_id` (FK to `question_import_batches`); `created_by`; `reviewed_by`; `reviewed_at`; `review_notes`; `created_at`; `updated_at`.
- RLS on, **no** anon/authenticated policies, `REVOKE ALL FROM anon, authenticated`.
- `question_versions` now gains only `lifecycle_status` and `content_checksum`.
- **Backfill:** one authoring row per existing version (`origin = LEGACY_UNKNOWN`). The lifecycle and checksum backfill touches only versions without an authoring row, so it is idempotent.
- **Functions:** import and revision insert the authoring row; edit-draft updates its metadata; the transition function writes `reviewed_by`, `reviewed_at`, `review_notes` and the checklist there.
- **New trigger `trg_qf_question_version_authoring_integrity`:**
  - The row is fully frozen once the version is PUBLISHED or SUPERSEDED.
  - Review fields can change only through the QF functions.
  - Provenance fields are immutable.
  - It cannot be deleted for IN_REVIEW, APPROVED, PUBLISHED or SUPERSEDED versions.
  - **FK-cascade nulling of `created_by`, `reviewed_by` and `import_batch_id` is explicitly allowed**, so deleting an auth user is never blocked. This is a latent issue I fixed during A1: the QF-1 draft trigger would have blocked that cascade.
- **TS:** the review queue, filters and detail read `origin`, batch, metadata and review fields via `question_version_authoring`.

**A2:** the `exam_question_mappings` policy `USING (true)` is replaced by "parent `questions.status = 'published'`". Service-role paths are unaffected.

**RLS (live on couragelibrary-next after 063)**

| Table | anon / authenticated can read |
|---|---|
| `question_versions` | `lifecycle_status IN ('PUBLISHED','SUPERSEDED')`; no authoring or review columns exist on the table |
| `question_options` | only options of PUBLISHED or SUPERSEDED versions |
| `question_answers` | **nothing**: no policies and no table privilege (permission denied) |
| `question_version_authoring` | **nothing**: privileges revoked (permission denied) |
| `question_import_batches` | **nothing**: privileges revoked |
| `exam_question_mappings` | only mappings whose parent question is `published` |
| `questions` | `status = 'published'` (unchanged) |

**Offline gates (Part A, before touching the DB):**
- QF-1 offline suite **73/73**, which adds A1-1/2/3 and A2-1
- SEC-1A suite **20/20**
- `tsc` **0 errors**
- `lint` **0 errors** (244 pre-existing warnings, none from the new QF files)
- `build` **success**

---

## 3. Backup

- **Tool:** PostgreSQL 17.11 client tools, installed on this machine via `winget install PostgreSQL.PostgreSQL.17` with only the command-line tools (server, pgAdmin and StackBuilder disabled; no service registered). The installer hash was verified by winget. It is not a repo dependency.
- **Connection:** credentials passed through `PG*` env vars only; `PGSSLMODE=verify-full`, `PGSSLROOTCERT=<PROD_CA_PATH>`.

| File (outside repo) | Size | Content |
|---|---|---|
| `E:\CourageLibrary-Backups\pre-qf1-063-2026-10-12T09-37-14-public.dump` | 1,682,705 bytes | custom format, schema `public`, schema + data |
| `E:\CourageLibrary-Backups\pre-qf1-063-2026-10-12T09-37-14-auth-data.dump` | 27,357 bytes | custom format, schema `auth`, data only |

**Verification (`pg_restore --list`):**
- public dump: 1,697 TOC entries, **131 tables, 131 table-data entries**
- `questions`, `question_versions`, `question_options`, `question_answers`, `question_sources`, `exam_question_mappings`, `mock_tests` and `mock_questions` each have both a TABLE and a TABLE DATA entry ✅
- auth dump: 27 table-data entries ✅

---

## 4. Pre-check (C1, read-only, before apply)

| Check | Count |
|---|---|
| Questions with more than one `is_current = true` version | **0** |
| `mock_questions` referencing a version that was neither published nor under a published question | **0** |
| (Info) Versions that backfill as PUBLISHED / total | 111 / 111 |

Data-quality note (pre-existing): 111 versions have only 110 `question_answers` rows and 440 options (444 expected). One version has no answer and some have fewer than 4 options. These are legacy rows and were not modified.

---

## 5. Migration apply + idempotency

- **C2:** `BEGIN; <063>; COMMIT;` → **COMMITTED** with no error. State after apply: `question_versions` 111, `question_version_authoring` 111, `lifecycle_status = PUBLISHED` 111, NULL checksums 0, candidate policies on the 5 QF-relevant tables: 3.
- **C3:** the full 063 script ran again inside `BEGIN … ROLLBACK`. The snapshot was identical (111 / 111 / 0 batches / 111 published / 0 NULL checksums / 3 policies) → **idempotent**, with no duplicated data or policies.

---

## 6. DB test results: `node scripts/test_qf1_db.cjs` → **15 / 15 passed**

**Guards:**
- refuses to run unless the DB ref matches `NEXT_PUBLIC_SUPABASE_URL`
- verified TLS
- never applies migrations
- every scenario runs inside `BEGIN … ROLLBACK`

| Test | Result |
|---|---|
| BF-1 no NULL checksum; one authoring row per version | PASS |
| BF-2 legacy lifecycle rule holds row by row | PASS |
| BF-3 `mock_questions` reference only PUBLISHED/SUPERSEDED versions | PASS |
| IMP-1 import of 3 → 3 DRAFT, `is_current = false`, `questions.status = draft`, authoring origin/batch/actor set | PASS |
| IMP-2 same batch again → `QF_DUPLICATE`, 0 new rows | PASS |
| IMP-3 two connections import the same stem in parallel → exactly one succeeds (second gets `QF_DUPLICATE`) | PASS |
| PUB-1 publish v1 → revision v2 → publish: v1 SUPERSEDED, v2 PUBLISHED and current, question published, review record written | PASS |
| PUB-2 publish from DRAFT, approve without checklist, approve from DRAFT, reject without notes → all errors | PASS |
| IMM-1 published text, option, answer, option delete, authoring update/delete and `is_current` flip are blocked; direct `questions.status = published` and forged lifecycle are blocked; FK-style `created_by = NULL` is allowed | PASS |
| SEL-1 `mock_questions` guard rejects a DRAFT; `fn_generate_custom_practice_session` (as authenticated) never returns DRAFT or non-current versions | PASS |
| RLS-SQL anon/authenticated (`SET ROLE`, real draft rows): no DRAFT version, options or mapping; answers and authoring denied; after publish, version, 4 options and mapping readable, answer still denied | PASS |
| A1-DB `question_versions` has no authoring/review columns | PASS |
| SEC-DB all QF functions SECURITY DEFINER, `search_path = public, pg_temp`, not executable by anon/authenticated | PASS |
| RLS-API anon client (publishable key over HTTP): non-published versions 0; published readable; `select('*')` has no review/authoring keys; options readable; answers, authoring and batches unreadable | PASS |
| BASE-1 baseline counts identical before/after the suite | PASS |

IMP-3 must commit one import, because the race guard is only observable against a committed row. Its rows are deleted immediately afterwards: `INFO … removed probe question 885df72b / version 7d2d6efa / batch 74ff6c50`, and the same for the earlier run. A leftover check afterwards found **0** probe versions and **0** import batches.

---

## 7. Baseline before / after (C5; read-only, `transaction_read_only = on`)

| Table | Before (pre-063) | After (063 + DB suite) |
|---|---|---|
| questions | 111 | 111 |
| question_versions | 111 | 111 |
| question_options | 440 | 440 |
| question_answers | 110 | 110 |
| question_sources | 0 | 0 |
| exam_question_mappings | 0 | 0 |
| mock_tests | 8 | 8 |
| mock_questions | 350 | 350 |
| test_attempts | 31 | 31 |
| attempt_answers | 200 | 200 |
| test_results | 10 | 10 |
| user_mistake_vault | 12 | 12 |
| topics | 36 | 36 |
| subjects | 4 | 4 |
| exams | 4 | 4 |
| question_version_authoring (new) | n/a | **111 (= question_versions)** |

**C5: PASS.** The smoke test in §8 then intentionally added **one** archived question (1 question, 1 version, 4 options, 1 answer, 1 authoring row, 1 import batch).

---

## 8. Smoke (C6): real server-side services against couragelibrary-next

The real `AdminQuestionFactoryService` ran with a real service-role client. Only the admin session was mocked:
- **actor:** the first auth user, by id
- **`actor_email`:** `system:qf1-smoke`, so the actions are clearly attributable to the test

| # | Step | Result |
|---|---|---|
| 1 | Generate prompt (topic with the most published questions) | PASS: contextHash `4765e7c1…`, 5,324 chars, CL-QUESTION-AUTHOR-v1.0 |
| 2 | Dry-run through 5 gates (incl. stale-hash rebuild, DB checksum, near-dup) | PASS: 1 accepted, 0 warnings |
| 3 | Commit as DRAFT | PASS: question `a03aede9` / version `fe2b3c15` / batch `c3f2b5ab` |
| 3b | anon cannot read the DRAFT | PASS |
| 4 / 4b | Review queue lists it (origin AI_EXTERNAL); detail shows gate report + authoring metadata | PASS |
| 5 | Submit for review | PASS |
| 6a / 6 | Approve with partial checklist → `QF_CHECKLIST_REQUIRED`; full checklist → APPROVED | PASS |
| 7 | Atomic publish | PASS |
| 8–8d | anon reads published version (no review fields) and 4 options; answer and authoring → permission denied | PASS |
| 9 | Audit log entries persisted | **FAIL**: every `admin_audit_logs` insert returned `PGRST205` (table not found) |
| 10 | Smoke question archived | PASS: question `a03aede9` → `status = archived` |

**Root cause of step 9:** `admin_audit_logs` is created by migration `20260908000037`, which was never applied to this DB. The service behaved as specified: it logged a non-sensitive warning per failed insert (`audit log insert failed for action QF_…: PGRST205`) instead of swallowing the error silently.

**Read-only drift check:** 28 of the 161 tables declared in repo migrations are absent:

| Migration | Absent tables |
|---|---|
| 037 | `premium_system_configs`, `admin_audit_logs` |
| 038–041 | adaptive tables (×10) |
| 044, 047–050 | live-test tables (×13) |
| 051 | psychometric snapshot/review tables (×3) |

The smoke question stays in the DB, archived. Its PUBLISHED version stays readable via RLS, as with any archived question, but `questions.status = 'archived'` keeps it out of every selector.

---

## 9. Backlog (untouched findings)

1. **Schema drift:** migrations 037–051 are not applied on couragelibrary-next, and there is no `supabase_migrations` history. This disables audit logging, adaptive, live tests and psychometrics in this DB. It needs its own phase: backup → replay 037–051 → verify.
2. **`fn_create_dynamic_mock_instance_atomic`:** granted to `authenticated` and takes a caller-supplied `p_user_id`. It is now constrained by the `mock_questions` published-version guard.
3. **`submitMistakeDrill` grading:** `mistake.service.ts` ~1700 does not pin `is_current`.
4. **`live-test-foundation.service.ts`:** reads non-existent `mock_questions` columns (`current_version_id`, `sequence_order`, `negative_marks`).
5. **CA validation default DB adapter:** returns no rows for the daily-quiz SQL.
6. **`user_profiles.role`:** read by SQL functions but never created. Separately, `fn_generate_custom_practice_session` inserts a NULL topic array into a NOT NULL column.
7. **Pattern-sections manager:** auto-creates subjects and topics (exam-structure UI).
8. **`createAdminServerSupabaseClient`:** falls back to the anon key.
9. **Legacy data:** 1 version without an answer row; some versions with fewer than 4 options.
10. **`.env.local`:** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is defined twice.

---

## 10. Restore instructions (template, no secrets)

Set the connection through environment variables (PowerShell shown; never on the command line):
```powershell
$env:PGHOST="<pooler host>"; $env:PGPORT="6543"; $env:PGUSER="<db user>"; $env:PGPASSWORD="<db password>"; $env:PGDATABASE="postgres"
$env:PGSSLMODE="verify-full"; $env:PGSSLROOTCERT="<path to CA .crt>"
```
Full restore of the public schema (drops and recreates the objects contained in the dump):
```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --clean --if-exists --no-owner --no-privileges --single-transaction --schema=public --dbname="$env:PGDATABASE" "E:\CourageLibrary-Backups\pre-qf1-063-2026-10-12T09-37-14-public.dump"
```
Notes:
- `--clean` drops only objects that exist in the dump. QF-1-only objects (`question_version_authoring`, `question_import_batches`, `fn_*qf*`, triggers) are not in it. To remove them, run the rollback SQL in `QF1_QUESTION_FACTORY_REPORT.md` §3 first (drop the triggers, functions, policies, indexes and tables), then restore.
- Restore a single table's data, e.g. `question_versions`:
  ```powershell
  & "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --data-only --table=question_versions --dbname="$env:PGDATABASE" "<dump>"
  ```
- Do **not** restore the auth data dump unless auth data was lost. It is data-only and requires an empty `auth` schema state.

---

## 11. Commit plan (NOT committed)

Suggested single commit on a feature branch, e.g. `feat/qf1-question-factory`:

```
supabase/migrations/20261012000063_qf1_question_factory_core.sql
types/question-factory.ts
types/database.ts
services/question-factory/*.ts            (7 files)
actions/question-factory.actions.ts
app/admin/questions/factory/page.tsx
components/admin/question-factory/*       (7 files)
components/admin/admin-sidebar.tsx
components/admin/admin-bulk-import-studio.tsx
app/admin/actions.ts
lib/admin/bulk-importer.ts
services/assessment.service.ts
services/premium-generator.service.ts
services/adaptive/adaptive-selection.service.ts
services/adaptive/adaptive-remediation.service.ts
services/mistake.service.ts
services/current-affairs-daily-quiz.service.ts
scripts/test_qf1_question_factory.cjs
scripts/test_qf1_db.cjs
QF1_QUESTION_FACTORY_REPORT.md
QF1B_DEV_DB_VERIFICATION_REPORT.md
```
**Never commit:** `E:\CourageLibrary-Backups\*` (outside the repo anyway), `.env.local`, or the scratch scripts (kept in the session scratchpad, outside the repo).

Message:
```
feat(qf1): governed Question Factory with five-gate import, review and atomic publish

- Migration 063: lifecycle_status/content_checksum on question_versions,
  service-only question_version_authoring and question_import_batches,
  fn_question_stem_checksum, import/edit/revision/transition/publish functions
  (SECURITY DEFINER, service_role only), immutability + publication + mock guards,
  published-only candidate RLS (versions, options, exam mappings)
- Question Factory studio (/admin/questions/factory): generate prompt, import with
  5-gate dry-run/commit, review queue with checklist, coverage
- CSV/manual question paths now create DRAFT via the same gates; no taxonomy creation
- Question selectors filter current PUBLISHED versions
- Tests: offline 73/73, dev DB 15/15

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Deploy:** the migration is already applied to couragelibrary-next. Deploy this build next, so the admin authoring paths work again through the factory, then:
1. `/admin/questions/factory` loads.
2. A dry-run works.
3. Anon cannot read drafts.

---

QF-1 STATUS: OPEN. QF-1 is applied and verified on couragelibrary-next: backup verified, pre-check 0/0, migration committed and idempotent, DB suite 15/15, baseline identical, offline 73/73 + 20/20, tsc/lint/build pass, smoke 17/18. One gap remains: audit-log persistence cannot work because `admin_audit_logs` (migration 037) is missing from this DB due to pre-existing drift of migrations 037–051. Closing QF-1 needs either a separate backed-up phase that replays 037–051, or an explicit owner decision to accept QF-1 without a persisted audit trail until then.
