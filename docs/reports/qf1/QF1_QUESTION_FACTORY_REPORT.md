# QF-1 — Question Factory Core (Gap 1) — Implementation Report

- **Date:** 2026-10-12
- **Base:** `0372db5` (SEC-1A committed; `checkIsAdminOrStaff` no longer trusts `user_metadata`). Precondition met.
- **Changes:** uncommitted in the working tree. **Nothing was applied to any database; production was not touched.**
- **Staging DB:** `SUPABASE_STAGING_DB_URL` is not set, so all DB tests are **PENDING_STAGING**.

---

## 1. Summary & pipeline

Questions now have the same governed factory as the other content types. Every path that creates or edits question content goes through the five gates and lands as a **DRAFT** version:
- the AI paste import
- the CSV bulk-import studio
- the `BulkImportEngine`
- the admin manager's create action
- the admin manager's edit action

A version becomes candidate-visible only through human review followed by **one atomic publish call**. The database enforces this independently of the app: lifecycle and publication can change only through the QF SQL functions, published content is frozen by triggers, candidate RLS is published-only, and no unpublished version can enter a test.

```
 Generate tab ──► QuestionContextBuilder (read-only, ≤32k chars, SHA-256 contextHash)
                         │  (taxonomy only via QuestionTaxonomyResolver — never creates)
                         ▼
                 QuestionPromptBuilder  ── CL-QUESTION-AUTHOR-v1.0 / QuestionAuthoringSpec v1.0.0
                         │  copy-paste (NO AI API calls)
                         ▼
              External AI  (UNTRUSTED)                 CSV rows / manager form (UNTRUSTED)
                         │                                        │
                         ▼                                        ▼
        QuestionFactoryImporterService  ◄────────  QuestionCsvImporterService / createManualDraft
           │ parse ≤200 KB, one ```json block
           ▼
   ┌──────────── FIVE GATES (fail-closed) ────────────┐
   │ G1 Schema  G2 Security  G3 Taxonomy+Stale hash   │
   │ G4 Provenance  G5 Anti-duplicate (DB checksum +  │
   │ trigram Jaccard)                                 │
   └──────────────────────────────────────────────────┘
           │ dry-run: report only (zero writes)
           ▼ commit: accepted items only
   fn_import_question_drafts  (ONE SQL call, all-or-nothing, advisory-locked dup re-check)
           ▼
   DRAFT ─► IN_REVIEW ─► APPROVED (6-item checklist, reviewed_by/at) ─► fn_publish_question_version
     ▲          │  └─► REJECTED                                        (ONE SQL call)
     └─ CHANGES_REQUESTED ◄┘                                                 ▼
                                                     PUBLISHED (is_current) ; previous → SUPERSEDED
                                                                             ▼
                                         Candidate RLS: PUBLISHED/SUPERSEDED only; answers server-only
                                         Selectors + mock_questions guard: current PUBLISHED only
```

---

## 2. Files changed / added

`git diff --stat` (tracked files):
```
 app/admin/actions.ts                              | 572 +++++-----------------
 components/admin/admin-bulk-import-studio.tsx     |  16 +-
 components/admin/admin-sidebar.tsx                |   6 +
 lib/admin/bulk-importer.ts                        | 402 ++-------------
 services/adaptive/adaptive-remediation.service.ts |   5 +
 services/adaptive/adaptive-selection.service.ts   |   3 +
 services/assessment.service.ts                    |   6 +-
 services/current-affairs-daily-quiz.service.ts    |   3 +
 services/mistake.service.ts                       |  10 +-
 services/premium-generator.service.ts             |   3 +
 types/database.ts                                 |  33 ++
 11 files changed, 241 insertions(+), 818 deletions(-)
```

**New files**

| File | Purpose |
|---|---|
| `supabase/migrations/20261012000063_qf1_question_factory_core.sql` | Lifecycle columns, batch table, checksum, backfill, factory functions, triggers, RLS, SQL selector hardening |
| `types/question-factory.ts` | Contract and spec constants, `QuestionAuthoringSpec` v1.0.0, gate report types (CA `ComprehensiveGateReport` shape), checklist, transitions |
| `services/question-factory/question-taxonomy-resolver.ts` | The **only** topic/subtopic/subject/exam resolver (D2). Read-only and fail-closed. |
| `services/question-factory/question-context-builder.service.ts` | Deterministic bounded context and SHA-256 `contextHash` |
| `services/question-factory/question-prompt-builder.service.ts` | Master prompt for CL-QUESTION-AUTHOR-v1.0 |
| `services/question-factory/question-validation.service.ts` | The five gates (fail-closed) |
| `services/question-factory/question-factory-importer.service.ts` | Fenced-JSON parse, dry-run and commit, DB-backed gate lookups |
| `services/question-factory/question-csv-importer.service.ts` | CSV rows → same gates → DRAFT (D8) |
| `services/question-factory/admin-question-factory.service.ts` | Review queue, detail, transitions, edit, revision, publish, coverage, audit logging |
| `actions/question-factory.actions.ts` | `'use server'` boundary for the studio |
| `app/admin/questions/factory/page.tsx` | New route `/admin/questions/factory` |
| `components/admin/question-factory/*` (7 files) | Studio shell plus Generate, Import, Review Queue, Coverage tabs and gate report view (light theme) |
| `scripts/test_qf1_question_factory.cjs` | Offline unit suite (mocks, no DB/network/.env) |
| `scripts/test_qf1_staging_db.cjs` | Staging-only DB suite (guards against production, TLS on) |

**Modified files**

| File | Change |
|---|---|
| `app/admin/actions.ts` | `importBulkQuestionsAction` now uses the CSV importer (DRAFT, no taxonomy creation). Create and edit go through the factory. Edit uses the open draft or a new revision, never an in-place edit. Toggle cannot publish drafts. Delete archives anything with review or publish history. |
| `lib/admin/bulk-importer.ts` | The `questions` entity uses the CSV importer. `categories/taxonomy/exams/patterns/sections/subjects/topics` entities are disabled with a pointer to Exam Onboarding. |
| `components/admin/admin-bulk-import-studio.tsx` | Logs both DRAFT and rejected rows per batch; copy says DRAFT |
| `components/admin/admin-sidebar.tsx` | "Question Factory" link under Questions |
| Six selector services | Published-only filters (§5) |
| `types/database.ts` | New `question_versions` columns |

---

## 3. Migration

`20261012000063_qf1_question_factory_core.sql` (1,246 lines; no old migration edited, which `STATIC-6` asserts with `git diff`).

| § | Content |
|---|---|
| 0 | **Pre-flight guard:** aborts if any question already has more than one `is_current=true` version. Fixing that would modify data, so the migration refuses instead. |
| 1 | `question_versions` gets these columns, with named CHECKs on lifecycle and origin:<br>`lifecycle_status`, `origin`, `contract_version`, `context_hash`, `content_checksum`, `authoring_metadata`, `import_batch_id` (FK), `created_by`, `reviewed_by`, `reviewed_at`, `review_notes`.<br>Two defaults change for **new** rows only: `origin` defaults to MANUAL (existing rows are tagged LEGACY_UNKNOWN), and `is_current` defaults to `false`.<br>`CHECK (NOT is_current OR lifecycle_status='PUBLISHED') NOT VALID` enforces this on every new insert or update without rewriting legacy rows. |
| 2 | `question_import_batches`: RLS enabled, **no** anon/authenticated policies, `REVOKE ALL FROM anon, authenticated`. |
| 3 | `fn_question_stem_checksum(text)`: IMMUTABLE. Applies lower, NFKC, strips punctuation (keeps letters, digits, `+ - * / = < > ^ %` and decimal points), collapses whitespace, trims, then sha256 hex. This is the **only** definition; TS never hashes. |
| 4 | **Backfill:** applies only to rows with `origin='LEGACY_UNKNOWN' AND content_checksum IS NULL`, so it is idempotent. Rows where `published_at IS NOT NULL OR question.status='published'` become PUBLISHED, otherwise DRAFT. The checksum is computed. No other column is touched. |
| 5 | Indexes on `lifecycle_status`, `content_checksum` and `import_batch_id`. **`uq_question_versions_one_current` partial UNIQUE (question_id) WHERE is_current.** |
| 6 | Functions (all SECURITY DEFINER, `search_path = public, pg_temp`, EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role):<br>- `fn_import_question_drafts`<br>- `fn_transition_question_version`<br>- `fn_publish_question_version`<br>- `fn_update_question_draft`<br>- `fn_create_question_revision` (**added** so the existing manager can "edit" published questions without in-place mutation)<br>- `fn_qf_find_exact_duplicates` (read-only Gate 5 lookup)<br>- `fn_qf_assert_item_shape` (defence-in-depth item checks) |
| 7 | Triggers: see §6. |
| 8 | RLS: see §9, with the `mock_questions` pre-check placed before any policy change. |
| 9 | `fn_generate_custom_practice_session` and `fn_generate_mistake_drill` are re-created with published-only filters. Signatures and grants are unchanged. |

**Race safety:** inside the import, revision and edit functions the checksum is computed and `pg_advisory_xact_lock(hashtextextended(topic||checksum))` is taken before the duplicate re-check. Two parallel imports of the same stem therefore serialize, and the second one sees the first's committed row.

**Backfill counts (staging):** PENDING_STAGING. `scripts/test_qf1_staging_db.cjs` (BF-1..3) verifies:
- no NULL checksum or lifecycle
- the PUBLISHED rule holds row for row
- no `mock_questions` row points at a non-published version

**Read-only production pre-check** (owner runs it in the SQL Editor before applying; both counts must be 0):
```sql
BEGIN READ ONLY;
SELECT count(*) AS questions_with_multiple_current FROM (
  SELECT question_id FROM public.question_versions WHERE is_current GROUP BY question_id HAVING count(*) > 1) d;
SELECT count(*) AS mock_questions_on_unpublished FROM public.mock_questions mq
  JOIN public.question_versions qv ON qv.id = mq.question_version_id
  JOIN public.questions q ON q.id = qv.question_id
  WHERE NOT (qv.published_at IS NOT NULL OR q.status = 'published');
ROLLBACK;
```

**Rollback SQL** (not executed; reverts schema objects only, keeps any imported draft data):
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_qf_mock_question_version_guard ON public.mock_questions;
DROP TRIGGER IF EXISTS trg_qf_question_publication_guard ON public.questions;
DROP TRIGGER IF EXISTS trg_qf_question_answers_integrity ON public.question_answers;
DROP TRIGGER IF EXISTS trg_qf_question_options_integrity ON public.question_options;
DROP TRIGGER IF EXISTS trg_qf_question_version_integrity ON public.question_versions;
DROP FUNCTION IF EXISTS public.fn_qf_guard_mock_question_version();
DROP FUNCTION IF EXISTS public.fn_qf_guard_question_publication();
DROP FUNCTION IF EXISTS public.fn_qf_enforce_question_child_integrity();
DROP FUNCTION IF EXISTS public.fn_qf_enforce_question_version_integrity();
DROP FUNCTION IF EXISTS public.fn_publish_question_version(UUID, UUID);
DROP FUNCTION IF EXISTS public.fn_transition_question_version(UUID, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.fn_create_question_revision(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.fn_update_question_draft(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.fn_import_question_drafts(JSONB, UUID);
DROP FUNCTION IF EXISTS public.fn_qf_assert_item_shape(JSONB, TEXT);
DROP FUNCTION IF EXISTS public.fn_qf_find_exact_duplicates(UUID, TEXT[], UUID);
-- Restore original candidate policies
DROP POLICY IF EXISTS "QF1 candidate read published question versions" ON public.question_versions;
CREATE POLICY "Public read published question versions" ON public.question_versions FOR SELECT USING (published_at IS NOT NULL);
DROP POLICY IF EXISTS "QF1 candidate read published question options" ON public.question_options;
CREATE POLICY "Public read question options" ON public.question_options FOR SELECT USING (true);
-- Restore prior selector definitions: re-run the function bodies from
--   20260824000013_phase3g_closure_hardening.sql (fn_generate_custom_practice_session, line 117)
--   20260825000030_phase3o_mistake_vault.sql     (fn_generate_mistake_drill, line 305)
ALTER TABLE public.question_versions ALTER COLUMN is_current SET DEFAULT true;
ALTER TABLE public.question_versions DROP CONSTRAINT IF EXISTS chk_question_versions_current_is_published;
DROP INDEX IF EXISTS public.uq_question_versions_one_current;
DROP INDEX IF EXISTS public.idx_question_versions_lifecycle_status;
DROP INDEX IF EXISTS public.idx_question_versions_content_checksum;
DROP INDEX IF EXISTS public.idx_question_versions_import_batch;
-- Columns / batch table / checksum fn: drop only if no QF data must be retained.
-- ALTER TABLE public.question_versions DROP CONSTRAINT IF EXISTS fk_question_versions_import_batch;
-- DROP TABLE IF EXISTS public.question_import_batches;
-- ALTER TABLE public.question_versions DROP COLUMN IF EXISTS lifecycle_status, DROP COLUMN IF EXISTS origin, ... ;
-- DROP FUNCTION IF EXISTS public.fn_question_stem_checksum(TEXT);
COMMIT;
```
⚠ Rolling back the triggers and policies removes the candidate isolation of drafts. Any drafts imported after QF-1 (`questions.status='draft'`) stay hidden by the questions policy. However, their options would become readable again under `USING (true)`.

---

## 4. Gate specification (as implemented)

All gates live in `services/question-factory/question-validation.service.ts`. The batch envelope (G1 and G3) is checked first, and if it fails every item is rejected without evaluation. Each item must pass all five gates. Report shape: `QuestionBatchGateReport { batchGates, items[ { gates{GATE_1..5}, errors, warnings, nearDuplicates, normalizedItem? } ] }`.

| Gate | Checks |
|---|---|
| **G1 Schema & Structure** | **Envelope:**<br>- payload ≤ 200 KB<br>- JSON object<br>- **unknown top-level / target fields rejected**<br>- `specVersion=1.0.0`, `contractVersion=CL-QUESTION-AUTHOR-v1.0`<br>- `contextHash` is 64-hex (AI only)<br>- target IDs are UUIDs<br>- 1–25 items<br>**Per item:**<br>- unknown fields rejected<br>- **any image-like field rejected** (D9)<br>- `clientRef` ≤ 64 and unique<br>- stem 1–2000 chars<br>- language/difficulty/sourceType enums<br>- **exactly 4 options, keys A–D unique, non-empty, normalized-unique texts**<br>- `correctKey` ∈ keys<br>- explanation 40–6000 chars<br>- rationale keys A–D ≤ 600 chars<br>- `cognitiveTrap` must be a registered `mistake_cognitive_types.id` (codes exist: CONCEPTUAL_GAP, CALCULATION_SLIP, …)<br>- pyq has no unknown fields |
| **G2 Sanitization & Security** | - `sanitizeAiCitationArtifacts` runs on stem, options, explanation, rationale, trap and PYQ reference<br>- **any residual artifact after sanitizing → reject**<br>- `MdxSecurityScanner` runs on stem and explanation<br>- rejects raw HTML tags, `script/iframe/object/embed/svg/math/style`, `on*=` handlers, `javascript:` / `vbscript:` / `data:<mime>` / `file://` / `blob:`, and markdown images<br>- rejects if a field is empty after sanitizing<br>- stripped artifacts produce a warning |
| **G3 Target Identity & Taxonomy** | - Uses `QuestionTaxonomyResolver.resolveTarget` (read-only): topic exists and is active, subtopic exists and is active **and belongs to the topic**, exam exists and is active<br>- AI imports: **`contextHash` must equal a freshly rebuilt hash, otherwise `STALE_CONTEXT`**. The hash covers target, taxonomy text, exam projection, the current published stems, trap codes and contract, but **not** count/mix, so it can be rebuilt from the target alone.<br>- CSV/manual skip the hash check (D8) |
| **G4 Provenance** | - ORIGINAL must have **no** pyq block<br>- PYQ requires pyq with `examSlug` that **resolves to an existing active exam**, an integer year in 1950..current year, and a reference (≤ 300 chars)<br>- ADAPTED without pyq produces a warning<br>- Only genuine PYQ items create `question_sources` rows |
| **G5 Anti-Duplicate** | - **Exact:** DB `fn_qf_find_exact_duplicates` compares checksums against any non-REJECTED version on the topic, and checks for equal DB checksums within the batch. Either match rejects.<br>- **Near:** word-trigram Jaccard (unigrams for stems with fewer than 3 tokens) against existing non-REJECTED stems on the topic and earlier batch items. ≥ 0.85 rejects; 0.70–0.85 is a reviewer warning, recorded in `nearDuplicates` and shown in the drawer. |

**Fail-closed proof (tests):**
- **G3:** a resolver throw rejects with "fail-closed" (G3 fail-closed test).
- **G3:** a rebuild failure gives `STALE_CONTEXT`.
- **G4:** an exam lookup throw rejects.
- **G5:** a checksum RPC error, a stem query error, or a DB returning the wrong row count each reject (three tests).
- **Lookups:** the importer rejects the batch if the cognitive-trap lookup fails.
- **Resolver:** every Supabase error throws; none is treated as "no rows".

---

## 5. Consumer hardening

| Location | Consumer | Filter added |
|---|---|---|
| `services/assessment.service.ts:1477-1481` | `ensureMockTestQuestions` (lazy builder for standard, daily and admin mocks) | `status='published'`, `question_versions!inner`, `is_current=true`, `lifecycle_status='PUBLISHED'`. Previously it had no filter and took any `[0]` version. |
| `services/premium-generator.service.ts:684-687` | `fetchEligibleQuestionsByIds` (topic, weak-area, personalized, mistake-revision, PYQ simulation) | `lifecycle_status='PUBLISHED'`, `questions.status='published'` (`is_current` already present) |
| `services/adaptive/adaptive-selection.service.ts:107-110` | Adaptive/CAT item pool | `lifecycle_status='PUBLISHED'`, `questions.status='published'` |
| `services/adaptive/adaptive-remediation.service.ts:468-470, 499-501` | Remediation pool, topic query and fallback | `question_versions.lifecycle_status='PUBLISHED'`, `status='published'` |
| `services/mistake.service.ts:1541-1554` | `generateMistakeDrill` | `!inner` + `is_current` + PUBLISHED + `status='published'`. The `[0]` fallback is removed. |
| `services/current-affairs-daily-quiz.service.ts:115-117` | CA daily quiz eligibility SQL | `q.status='published' AND qv.is_current AND qv.lifecycle_status='PUBLISHED'`. This is the filter only; no other CA change. |
| Migration §9a | `fn_generate_custom_practice_session` (all modes) | Current PUBLISHED version plus published question. BOOKMARKED and WRONG_QUESTIONS now resolve to the question's **current published** version instead of the historical one. |
| Migration §9b | `fn_generate_mistake_drill` | Current PUBLISHED plus published; the count is taken from the questions actually included |
| Migration §7d | **All mock/test builders** (admin, dynamic/premium/adaptive RPC `fn_create_dynamic_mock_instance_atomic`, live tests, CA quiz writes) | `BEFORE INSERT/UPDATE` guard on `mock_questions`: the version must be the current PUBLISHED one. Existing rows are untouched. |
| `fn_find_or_create_battle_room` / `fn_get_active_battle_round` | Quiz battles | Unchanged. They are covered by `questions.status='published'` (set only by publish) plus the new invariant that the current version of a published question is PUBLISHED: one-current unique index, CHECK on new rows, and drafts never current. |
| `live-test-foundation.service.ts:216` | Live paper freeze | Copies existing `mock_questions`, which the guard above covers |

History reads (results, scorecards, mistake detail, attempt review) are **not** filtered. Candidate RLS keeps SUPERSEDED readable for exactly this reason (§9).

---

## 6. Errata / immutability finding

- **Errata flow does not mutate question rows.**
  - `services/admin.service.ts:1759` `updateQuestionReportStatus` updates only `question_errata_reports`.
  - SQL `fn_resolve_errata_report` (`20260824000013_phase3g_closure_hardening.sql:344`) updates only `question_errata_reports` and awards bounty coins.
  - No migration contains any UPDATE/DELETE on question tables.
  - **No hard stop.** The immutability triggers were added.
- **A different in-place editor was found:** `updateQuestionHierarchyAction` (old `app/admin/actions.ts:1214-1304`) edited `question_versions`, options and answers in place, including on published versions. It was not errata, so it was not a hard stop. It is now routed to `editDraft` when an open DRAFT or CHANGES_REQUESTED version exists, and otherwise to a new **DRAFT revision** (`fn_create_question_revision`). Topic re-mapping through this form is refused.
- **Triggers:**
  - **7a:** on `question_versions`, lifecycle changes require the transaction-local flag `app.qf_lifecycle_write` that only the QF functions set. New rows must start as DRAFT. Content is frozen outside DRAFT/CHANGES_REQUESTED. On PUBLISHED/SUPERSEDED, metadata, review fields and `published_at` are also frozen; `is_current` flips and PUBLISHED→SUPERSEDED are allowed only under the flag; deletes are blocked.
  - **7b:** options and answers are writable only while the version is DRAFT or CHANGES_REQUESTED.
  - **7c:** `questions.status → 'published'` is allowed only via publish, or when restoring an *archived* question whose current version is already PUBLISHED.
  - **7d:** the `mock_questions` guard.
- `deleteQuestionAction` now archives instead of hard-deleting whenever any version was IN_REVIEW, APPROVED, PUBLISHED or SUPERSEDED, or when the lookup fails.

---

## 7. CSV importer: before vs after

| | Before | After |
|---|---|---|
| Status written | `questions.status='published'`, version `is_current=true`, immediately candidate-visible | DRAFT version, `is_current=false`, `questions.status='draft'`. Publication only via review + atomic publish. |
| Taxonomy | **Auto-created topics** (both `lib/admin/bulk-importer.ts` and `importBulkQuestionsAction`). `BulkImportEngine` also created exams, exam_cycles, exam_patterns and subjects. | **Never creates.** An unresolved reference rejects the row, e.g. `Topic 'X' not found — create it via curriculum/onboarding first.` Exam-structure entities in `BulkImportEngine` are disabled with a pointer to Exam Onboarding. |
| Validation | Minimal. Fewer than 2 options were replaced with placeholder "Option A–D". Missing explanation got a filler. Images were accepted. | The same five gates as AI input. Images are rejected (D9); short or missing explanations, duplicates and bad PYQ provenance are rejected. |
| Atomicity | Row-by-row inserts with unchecked errors (orphans possible) | ≤ 25 rows per target per `fn_import_question_drafts` call, all-or-nothing |
| Dry-run | Preview counted rows; topic placeholder `"preview-topic-id"` | Full gate report per row; zero writes |
| `mock_tests` entity | Creates or updates mock tests and templates | **Unchanged** (not question/taxonomy creation). Empty mocks are now lazily filled only with published versions. |

⚠ **Behavioural impact for the owner:** existing CSV templates whose explanations are shorter than 40 characters, whose topics don't already exist, or which carry images will now be rejected row by row, with explicit messages.

---

## 8. Test results

| Suite | Result |
|---|---|
| `node scripts/test_qf1_question_factory.cjs` (offline, mocks) | **69 / 69 passed** |
| `node scripts/test_sec1a_containment.cjs` (existing offline suite, regression) | **20 / 20 passed** |
| `node scripts/test_qf1_staging_db.cjs` | **PENDING_STAGING**: `SUPABASE_STAGING_DB_URL` not set. The script also refuses to run unless `PRODUCTION_DB_HOST_GUARD` is set, and never weakens TLS. |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors**, 244 warnings (was 249 at SEC-1A). The only warnings in touched files are the repo-wide "unused eslint-disable directive" pattern; new QF files are warning-free. |
| `npm run build` | **Success.** `/admin/questions/factory` is a dynamic route (11.5 kB). |

Other existing `scripts/` suites were **not run**: the rules forbid running existing scripts, and most of them connect to the production DB.

**Offline coverage (69 tests):**
- **Context builder (6):** determinism; key and stem order irrelevant; hash invariant to count/mix but sensitive to data; ≤ 32k chars with 500×5 KB stems; `<`/`>` escaped; the DB query filters PUBLISHED + `is_current` + `questions.status`; zero writes.
- **Prompt (1):** contract ID, schema and rules present; no secret-like strings.
- **G1 (13):** missing field, 3 options, 5 options, duplicate keys, duplicate texts, `correctKey` not present, bad enum, item image field, option image field, short explanation, more than 25 items, unknown top-level field, valid item passes.
- **G2 (6):** oaicite, 【†】 and [cite: 1] stripped and accepted with a warning; residual artifact rejected (sanitizer bypass simulated); `<script>`, `onerror=`, `javascript:` and `<iframe>` rejected.
- **G3 (5):** unknown topic, with zero resolver writes; foreign subtopic; inactive exam; stale hash; lookup throw is fail-closed.
- **G4 (6):** PYQ without year or exam; PYQ without block; future year; unknown exam slug; ORIGINAL with pyq; valid PYQ passes.
- **G5 (7):** Jaccard fixtures exactly 0.90 and 0.75; exact duplicate vs bank; in-batch duplicate; 0.90 rejected; 0.75 warning; three fail-closed cases.
- **Importer (5):** dry-run makes zero writes and zero RPCs; commit sends only accepted items; zero accepted means no writes; > 200 KB rejected; multiple blocks or invalid JSON rejected.
- **Admin service (7):** all 14 methods reject non-admins with zero DB access; approve without or with a partial checklist fails; full approve calls the RPC and writes audit columns; publish from any non-APPROVED state fails; illegal transitions fail; notes are required; edit is only allowed in DRAFT/CHANGES_REQUESTED.
- **CSV (5):** unknown topic gets the explicit message; no taxonomy or question table writes; only `fn_import_question_drafts` with CSV_IMPORT and no "published"; image and short-explanation rows rejected; dry-run makes zero writes.
- **Static (7):** bulk-importer has no published/taxonomy inserts; admin actions have no direct question writes and their question paths have no taxonomy inserts; no `use client` file imports QF services; no TLS bypass in QF files; every migration function is SECURITY DEFINER with a pinned path and service_role-only grants; old migrations untouched and the pre-check precedes the RLS change; the six TS selectors are filtered.

**Staging suite contents (to run):**
- MIG-1/2: apply, then apply again for idempotency
- BF-1..3: backfill checks
- IMP-1: 3 items become DRAFT, not current, `status=draft`
- IMP-2: rerun is rejected as duplicate with zero new rows
- IMP-3: two parallel connections importing the same stem: exactly one succeeds
- PUB-1: v1 published, then revision v2 published; v1 SUPERSEDED, `questions.status=published`
- PUB-2: illegal transitions and missing checklist
- IMM-1: tampering with published text, option or answer, or a direct publish, is blocked
- SEL-1: draft is not selectable, and the `mock_questions` guard rejects it
- RLS-1: anon client cannot see drafts, draft options or answers (needs staging URL and anon key)
- BASE-1: baseline counts for the 10 tables are unchanged. All scenario work runs in rolled-back transactions.

---

## 9. Security review

- **Functions:** all 12 new or replaced functions are `SECURITY DEFINER` with `SET search_path = public, pg_temp`.
  - Factory functions: `REVOKE ALL … FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE … TO service_role` only.
  - Trigger functions: revoked from PUBLIC, anon and authenticated.
  - The two re-created selector functions keep their existing grants (`authenticated, service_role`).
  - Asserted by STATIC-5.
- **Lifecycle forgery:** lifecycle and publication changes require a transaction-local flag that only the QF functions set. PostgREST cannot set it, and anon/authenticated have no write policies on question tables.
- **RLS before → after:**

| Table | Before | After |
|---|---|---|
| `question_versions` | `USING (published_at IS NOT NULL)` | `USING (lifecycle_status IN ('PUBLISHED','SUPERSEDED'))` |
| `question_options` | `USING (true)`: **draft options were readable** | `EXISTS version with lifecycle IN ('PUBLISHED','SUPERSEDED')` |
| `question_answers` | RLS on, no policies | Unchanged; the migration **asserts** no anon/authenticated/public policies exist |
| `questions` | `status='published'` | Unchanged (drafts are `status='draft'`) |
| `question_import_batches` | n/a | RLS on, no policies, privileges revoked from anon/authenticated |

**Deliberate deviation from D7:** SUPERSEDED versions remain candidate-readable, alongside PUBLISHED. They were previously published, they are frozen, and they are required for historical attempt review (F). DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED and REJECTED are never readable.

- **Server-only:**
  - The admin client is created only in `admin-question-factory.service.ts`, the server actions and the server page.
  - No `"use client"` file imports `services/question-factory/*` (STATIC-3).
  - Client components import only `@/actions/question-factory.actions` and `@/types/question-factory`.
- **Untrusted input:** 200 KB cap, single fenced block, unknown fields rejected, sanitize then scan, images rejected. SQL re-validates shape, taxonomy, PYQ year and duplicates inside the transaction.
- **Audit:** every mutation inserts `admin_audit_logs` with the verified columns (`actor_id`, `actor_email` NOT NULL, `action_type`, `target_entity`, `target_id`, `old_value`, `new_value`, `reason`). A failed insert logs a non-sensitive warning (action and error code only).
- **Secrets:** no secrets, connection strings or emails appear in code, fixtures or this report. Test fixtures use `@example.test`. The staging script never prints the URL and redacts `postgres://` in errors. No AI API calls. No new dependencies.

---

## 10. Owner actions required

1. **Create a staging Supabase project** (a branch or separate project) restored from a recent production snapshot.
2. Run the staging suite. `SUPABASE_STAGING_CA_PATH` is the CA file from Dashboard → Database → SSL. The anon variables are optional and enable RLS-1.
   ```bash
   SUPABASE_STAGING_DB_URL="<staging direct URL>" PRODUCTION_DB_HOST_GUARD="<prod project ref>" SUPABASE_STAGING_CA_PATH="<ca.crt>" SUPABASE_STAGING_URL="<staging api url>" SUPABASE_STAGING_ANON_KEY="<staging anon key>" node scripts/test_qf1_staging_db.cjs
   ```
3. Run the **read-only production pre-check** in §3. Both counts must be 0.
4. After staging passes and you approve, **deploy in this order:** apply the migration to production, then immediately deploy this app build. The new code reads `lifecycle_status`, so it must not be deployed before the migration. In the short window between the two steps, the old app's question-create and bulk-import paths will fail closed: the trigger blocks direct publishing.
5. Post-deploy checks:
   - `/admin/questions/factory` loads
   - Build a prompt, run a dry-run import, commit, submit, approve (checklist) and publish one question
   - An anon read of a DRAFT version returns nothing
   - `/admin/bulk-import` rows show "saved as DRAFT"
6. Tell content staff that CSV rows now need existing topics, explanations of at least 40 characters and no images, and that publishing happens in the factory.

---

## 11. Deferred items

- **QF-2:** authoring queue and coverage-driven generation tasks; batch-level review actions; diff view between revisions; exam re-mapping UI for existing questions; `exam_question_mappings` for CSV rows without an exam column.
- **QF-3:** images and assets for stems and options (currently rejected); Hindi authoring and bilingual pairs.
- **Gap 2:** taxonomy / learning-store unification. `canonical_taxonomy_nodes` and the new syllabus tables are untouched.
- **Out-of-scope residuals noticed (not changed):**
  - The pattern-sections manager (`app/admin/actions.ts`, sections CRUD ~line 440) still auto-creates subjects and topics. This is exam-structure UI, not question import.
  - `exam_question_mappings` candidate policy is `USING (true)`, so draft question IDs are visible (IDs only).
  - On PUBLISHED versions, `authoring_metadata` and `review_notes` are readable by candidates under RLS.
  - `createAdminServerSupabaseClient` falls back to the anon key when the service role is missing. QF functions are service_role-only, so QF fails closed.
  - `fn_create_dynamic_mock_instance_atomic` is still granted to `authenticated` with a caller-supplied `p_user_id`. The new `mock_questions` guard limits it to published versions.
  - Discovery also noted these pre-existing issues, untouched:
    - `submitMistakeDrill` grading does not pin `is_current`
    - `live-test-foundation` reads non-existent `mock_questions` columns
    - the CA validation default DB adapter returns no rows for the quiz SQL
    - latent SQL bugs in practice-session NULL topic arrays and `user_profiles.role`
- **SEC-1:** S3 RLS on exam knowledge / syllabus tables remains open.

---

QF-1 STATUS: OPEN. All code, migration, offline tests (69/69), tsc, lint and build pass, but the staging DB tests are PENDING_STAGING (no `SUPABASE_STAGING_DB_URL`). Nothing has been applied to any database or committed.
