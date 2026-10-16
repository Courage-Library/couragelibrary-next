# GAP2-4a: canonical syllabus schema, role-checked RPCs, published read model, legacy → DRAFT

> **Status:** delivered.
> - **No student-visible change.** No syllabus is published, and nothing in the app calls the read model yet; that is GAP2-4b.
>
> **Implements:** the approved design, `GAP2_4_STAGE1_DESIGN.md` §10 + DDL points 1–10.
>
> **Migrations:**

| Migration | Ledger sha | Content |
|---|---|---|
| 078 `20261016000078_gap2_4a_syllabus_schema.sql` | `e7958c97f717` | schema + guards |
| 079 `20261016000079_gap2_4a_syllabus_rpcs.sql` | `236c95e491ff` | RPCs + read model |
| 080 `20261016000080_gap2_4a_syllabus_seed_drafts.sql` | `bff8a23ee0f9` | two DRAFTs |

> **Rollbacks:** `docs/database/rollback/078_rollback.sql`, `079_…`, `080_…`.
> **Test:** `scripts/test_gap2_4a_syllabus.cjs` (permanent gate) + RLS suite P-8.

## Architect rulings recorded in this phase

| # | Ruling | Status |
|---|---|---|
| 1 | The mistake-lineage suite always prints each assertion | **Done:** `scripts/e2e/assert-mistake-lineage.cjs` ends every run, including aborted ones, with a per-id summary (`DB-1 … DB-6: PASS / FAIL / NOT RUN` + detail). The gate scripts now print the full lineage output (no `tail`). If a 5/6 recurs, investigate it (likely the LOOP-1 swallowed-insert item). |
| 2 | Admin-wide English-only cleanup | Scheduled inside GAP2-4b (hide Hindi options and labels in admin UI; no schema change) |
| 3 | 1200 vs 1280 container | Decided in UX-2 |
| 4 | `user_battle_stats` read grant | Deferred to the battles feature |

## 1. Schema (078)

### Versions (`exam_syllabus_versions`)

- **`status`:** `DRAFT / PUBLISHED / ARCHIVED`. RECONCILED is dropped; the table had 0 rows.
- **New columns:**
  - `version_number` (NOT NULL, UNIQUE per exam)
  - `supersedes_version_id`
  - `source_kind`: `MANUAL / EXAM_KNOWLEDGE_DRAFT / LEGACY_MIGRATION / IMPORT`
  - `created_by`, `published_at`, `published_by`, `archived_at`
- **Changed:** `raw_payload_hash` is now nullable.
- **CHECKs:**
  - PUBLISHED requires `published_at`;
  - ARCHIVED requires `archived_at`.
- **Partial unique index `uq_exam_syllabus_one_published`:** at most one `PUBLISHED AND is_active` version per exam + cycle (a missing cycle counts as one value).

### Nodes (`exam_syllabus_nodes`)

- **`node_kind`:** `PAPER / SECTION / UNIT`, plus a `description` column.
- **Expected-question range:** the old `0` defaults are dropped, so unknown means NULL rather than a fabricated 0. It is range-checked (≥ 0, min ≤ max).
- **`weightage_tier` and the range already existed.**
- **New trigger `trg_guard_exam_syllabus_node_same_version`:** the parent must belong to the same version, and a node can never move to another version.
- **Kept:** the existing depth, cycle and descendant triggers. Their functions get a pinned `search_path`.

### Mappings (`exam_syllabus_canonical_mappings`)

- `UNIQUE(syllabus_node_id)` becomes **`UNIQUE(syllabus_node_id, canonical_node_id)`**, so mappings are many-to-many.
- **TOPIC-only** uses the GAP2-3 pattern: a generated `canonical_node_type = 'TOPIC'` plus a composite FK to `canonical_taxonomy_nodes(id, node_type)`. The old single-column FK is dropped.
- **`mapping_weight`:** numeric(5,4) in (0, 1].

### Immutability (every role, including the service role and owner paths)

- **`trg_guard_exam_syllabus_version_lifecycle`:**
  - versions are inserted as DRAFT only;
  - PUBLISHED and ARCHIVED versions can't be deleted;
  - ARCHIVED never changes;
  - PUBLISHED may only become ARCHIVED (only `status`, `is_active`, `archived_at` and `updated_at` may change).
- **`trg_guard_exam_syllabus_{nodes,mappings}_draft_only`:** nodes and mappings change only while their version is DRAFT.

## 2. Write RPCs (079)

**Shared properties:**
- Every write RPC is `SECURITY DEFINER` with `SET search_path = ''` and an explicit role check from the JWT `app_metadata.role` (`fn_jwt_is_admin_or_staff()`, plus the new `fn_jwt_is_admin()`).
- A denied call raises **42501** before any read.
- Every successful write inserts **one `admin_audit_logs` row in the same transaction** (actor = JWT subject).
- The app never writes these tables directly.

| RPC | Role | Behaviour |
|---|---|---|
| `fn_syllabus_create_draft(exam, cycle?, from_version?, tag?)` | staff / admin | New DRAFT (next `version_number`, serialized per exam by an advisory lock). Optionally a **deep copy of a PUBLISHED version** (tree and mappings, `supersedes_version_id` set; a DRAFT source is refused). |
| `fn_syllabus_upsert_node(version, node jsonb)` | staff / admin | Insert or partial update within a DRAFT. A parent change is refused here (use move); title is 1–200 characters; the slug is derived. |
| `fn_syllabus_move_node(node, new_parent, order?)` | staff / admin | Re-parent and / or reorder within a DRAFT. Same version, cycles and depth are enforced by the triggers. |
| `fn_syllabus_delete_node(node)` | staff / admin | Deletes the node, its subtree and its mappings in a DRAFT |
| `fn_syllabus_set_unit_mappings(node, topics[], weights[]?)` | staff / admin | Atomic replace. **UNIT nodes only.** Topics must be distinct, active TOPIC nodes. Weights: one per topic, each in (0, 1], summing to 1. |
| `fn_syllabus_validate(version)` | staff / admin | Read-only structured report: `{ok, error_count, warning_count, errors[], warnings[], counts}`. Each issue is `{code, node_id, topic_id, message}`. |
| `fn_syllabus_publish(version)` | **admin** | Validate; on errors return `{success:false, code:'VALIDATION_FAILED', report}` with **no write and no audit**. Otherwise archive the current PUBLISHED version for the same exam + cycle, then PUBLISH (`published_at`, `published_by`) and audit with the previous id and a counts snapshot. One transaction; any failure rolls back everything. |
| `fn_syllabus_archive_version(version)` | **admin** | DRAFT / PUBLISHED → ARCHIVED |

**Validation codes:**

| Errors (block publish) | Warnings (never block) |
|---|---|
| `NO_NODES` | `TOPIC_IN_MULTIPLE_SECTIONS` |
| `PAPER_NOT_ROOT` | `TOPIC_NO_PUBLISHED_QUESTIONS` |
| `UNIT_HAS_CHILDREN` | `TOPIC_NO_SERVABLE_DOCUMENTS` |
| `UNIT_UNMAPPED` (every UNIT must be mapped) | |
| `MAPPING_ON_NON_UNIT` | |
| `MAPPING_WITHOUT_TOPIC` | |
| `EMPTY_SECTION` (no empty SECTION / PAPER) | |
| `TOPIC_INACTIVE` (mapped topics are active TOPIC nodes) | |
| `WEIGHTS_INVALID` (all-or-none, sum 1) | |
| `DUPLICATE_TOPIC_IN_SECTION` | |

**Grants:**

| Functions | anon | authenticated |
|---|---|---|
| The 8 write RPCs | no EXECUTE | EXECUTE (role-checked inside) |
| Core helpers `fn_syllabus__*` and the two seed functions | no EXECUTE | no EXECUTE (owner only; revoked explicitly despite Supabase default privileges) |
| Read model | EXECUTE | EXECUTE |

**RLS:** unchanged and compliant with decision #39.
- The 3 tables keep the SEC-HOTFIX-4 policies: admin/staff read, write policies gated by `fn_jwt_is_admin_or_staff()`, and public reads of PUBLISHED rows.
- `authenticated` holds only SELECT, so direct writes are denied by grants. RLS P-8 checks this.

## 3. Student read model (079)

**`fn_exam_syllabus_read_model(exam_id, exam_cycle_id?)`:** `SECURITY DEFINER`, `STABLE`, reads **PUBLISHED, active versions only**. It is granted to anon and authenticated.

**Version choice:** the cycle's own published version, else the exam-wide (no-cycle) one, else the latest published.

**States:**
- `NO_SYLLABUS`: no published version, so `version: null`, `nodes: []`, `totals: null`.
- `AVAILABLE`: `version {id, version_number, version_tag, exam_cycle_id, published_at}`, `nodes[]` and `totals`.

**Each node:**
- **Fields:** `id`, `parent_id`, `kind`, `title`, `slug`, `description`, `order`, `depth`, `weightage_tier`, `expected_questions_min/max` (NULL when unknown), `is_mandatory`.
- **`topics[]`:** each `{topic_id, name, slug, subject_id, weight, published_questions, servable_documents}`.
- **`counts`:** aggregated over the node's subtree, distinct topics: `{topics, published_questions, servable_documents, topics_with_questions, topics_with_documents}`.

**Derived from live rows only:**

| Count | Rule |
|---|---|
| Published questions | `questions.canonical_topic_id = topic AND status = 'published'` |
| Servable documents | The **`LearningResolverService.isServableDocumentRow` rule**: document `PUBLISHED`, its `current_published_version_id` version `is_published` and `review_status = 'PUBLISHED'`, unit active |

Nothing is defaulted or estimated.

## 4. Data (080)

Both drafts are built by owner-only seed functions on the **same core helpers as the RPCs**. Both stay **DRAFT**, and nothing is published.

**SSC GD: `legacy-official-2026`** (`LEGACY_MIGRATION`, the legacy syllabus's 2026 cycle)
- **4 SECTION nodes**, one per canonical subject used, ordered by subject order then name.
- **18 UNIT nodes**, one per `exam_topics` row, ordered by legacy priority then name.
  - Weightage: high → `HIGH_YIELD`, medium → `CORE`.
  - `is_mandatory` is copied; the expected range is left NULL (the legacy "1" was a default, not data).
- **18 mappings** UNIT → TOPIC (`match_method LEGACY_MIGRATION`).
- `raw_payload_hash` is the sha256 of the ordered legacy rows.
- **It already validates: 0 errors.** 21 warnings: topics with no documents yet. An admin can review it and publish in 4b.

**SSC CGL: `pattern-skeleton-2026`** (`MANUAL`, the active Tier 1 pattern's cycle)
- **4 SECTION nodes** from `pattern_sections`, in section order: Quantitative Aptitude, General Intelligence and Reasoning, English Comprehension, General Awareness.
- No units. It validates with 4 × `EMPTY_SECTION` until topics are authored.

**Idempotent and deterministic.**
- Keyed on (exam, version_tag): a re-run returns `created: false, reason: ALREADY_EXISTS` and writes nothing.
- Deleting the GD draft and seeding again reproduces an identical tree and hash. G-11 checks this.

**Untouched:**
- Legacy tables: `exam_syllabi` 1, `exam_topics` 18, `exam_unit_mappings` 0. Re-pointing is 4b; retirement is 4c.
- **Reconciliation is fail-closed for all actions.** The workbench wrote mappings directly with the service role, and `exam-syllabus-resolution.service.ts` upserted on the dropped `UNIQUE(syllabus_node_id)`. `OperationalSyllabusReconciliationService.resolveWorkItem` therefore now returns 503 `SERVICE_UNAVAILABLE` before any read or write (`RECONCILIATION_WRITES_ENABLED = false`) until 4c retires the workbench.
- The HOTFIX-3 `CREATE_NEW_SUBTREE` guard is kept.

## 5. Migration discipline

| Step | Result |
|---|---|
| Combined dry-run of 078 + 079 + 080 in one rolled-back transaction | OK (seed counts, re-run no-op, validation as expected) |
| Baseline snapshot | `gap24a_pre` |
| Backup | `pre-078-gap2-4a-2026-10-15T22-11-33` (E:\CourageLibrary-Backups) |
| Per migration: dry-run → apply → ledger | 078 / 079 / 080 all APPLIED |
| `db:types` (committed `types/database.ts`, +217 / −11) → `db:types:check` | OK |
| **Baseline diff** (pre → post) | Only the expected changes (below) |

**Baseline diff contents:**
- `exam_syllabus_versions` 0 → 2, `exam_syllabus_nodes` 0 → 26, `exam_syllabus_canonical_mappings` 0 → 18
- `admin_audit_logs` +2 (the two seed audit rows)
- `schema_migration_ledger` +3
- the new functions and triggers
- the 3 existing node-trigger functions, whose only change is the pinned `search_path`

## 6. Tests and gates

**`scripts/test_gap2_4a_syllabus.cjs`: 12/12.** It runs against the dev DB, every scenario rolled back.

| Check | Covers |
|---|---|
| G-01 | Catalog: columns, CHECKs, the partial unique index, the TOPIC composite FK, triggers; every RPC `SECURITY DEFINER` + `search_path=""`; the EXECUTE grant matrix |
| G-02 | **Role matrix on all 8 RPCs:** anon has no EXECUTE (42501); student 42501; staff succeeds on create / upsert / move / delete / set / validate and is denied publish / archive; admin publishes and archives |
| G-03 | Audit: exactly one row per successful write, actor = JWT subject; denied calls write none; the publish audit carries a counts snapshot |
| G-04 | Same-version parent (insert and move), version lock, cycle and self-parent prevention, derived depth |
| G-05 | 10 rejections: SUBJECT via RPC; SUBJECT via direct insert (composite FK); mapping on a SECTION; duplicates; inactive topic; weight sum ≠ 1; length mismatch; > 1; 0; direct weight > 1. A valid weighted set is accepted. |
| G-06 | `validate`: a clean draft is `ok`; an empty draft gives `NO_NODES`; a broken draft yields all 8 targeted error codes plus warnings |
| G-07 | **Publish:** `VALIDATION_FAILED` changes nothing and writes no audit; the second publish archives the first; exactly 1 PUBLISHED; a direct second PUBLISHED raises a 23505 unique violation; a **mid-publish failure** (`published_by` FK error after the archive step) rolls back everything, so the previous version stays PUBLISHED |
| G-08 | **Immutability on the owner path:** 12 write probes on PUBLISHED / ARCHIVED rejected; PUBLISHED → ARCHIVED allowed; an ARCHIVED version and its nodes are frozen |
| G-09 | Deep copy from PUBLISHED gives an identical tree (kinds, order, tiers, ranges, mappings, weights) with `supersedes` and the next number; a DRAFT source is refused |
| G-10 | **Read model:** NO_SYLLABUS for CGL, and for GD with only a DRAFT (anon). On a PUBLISHED test version (with a servable and a non-servable fixture document, rolled back), the per-topic question and document counts, subtree counts and totals equal independent queries (24 questions, 1 servable document). Unset fields stay NULL. |
| G-11 | Seeded drafts as specified (GD 4/18/18, valid; CGL = the pattern sections); nothing PUBLISHED; GD seed re-run is a no-op; delete + re-seed is identical |
| G-12 | Legacy tables untouched; the workbench resolve fails closed |

**RLS suite P-8 (8/8 total):**
- anon and student cannot call the write RPCs;
- students and staff can't write the tables directly;
- staff create and edit DRAFTs but cannot publish or archive;
- admin publishes;
- the PUBLISHED version is immutable on the owner path but archivable.

**Gates** (local production build for the app checks):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| `db:types:check` | OK (types committed) |
| **GAP2-4a syllabus** | **12/12** |
| RLS suite (SEC-HOTFIX-4/5 + **P-8**) | **8/8** (standalone, twice; see note) |
| test_types1 / test_types1_close | 8/8 · 3/3 |
| test_no_runtime_db | 4/4 |
| SEC-1A / 1B / 1C / 1D offline | 20/20 · 26/26 · 22/22 · 14/14 |
| QF-1 offline / DB | 73/73 · 15/15 |
| GAP2-1b / 2a / 3 `--db` | 38/38 · 18/18 · **15/15** (see note) |
| GAP2-2b / design ratchet / UX-1b static / QA guard / HOTFIX-2 | 18/18 · 7/7 · 6/6 · 8/8 · 5/5 |
| Signed-in smokes `student-pages`, `admin-pages` (incl. `/admin/syllabus-reconciliation` with the 2 drafts), `staff-content` | all passed |
| **E2E student journey** (qa-student) | **13/13** |
| `student-mistake` smoke (after the journey) | all passed |
| **Mistake lineage** (new per-id summary) | **6/6**: DB-1 … DB-6 PASS |
| Cleanup | `E2E_KEEP_USER=1`, data only |

**GAP2-3 D-07 (found and fixed in this phase).**
- **The failure.** The first batch failed D-07, which dry-runs `075_rollback.sql`. 075's rollback drops `UNIQUE (id, node_type)` on `canonical_taxonomy_nodes`, and 078's TOPIC FK now depends on it.
- **The fix.** The rollback order is now documented as 080 → 079 → 078 → 075, with a prerequisite note in `075_rollback.sql`. D-07 runs the 080 / 079 / 078 rollbacks first in the same rolled-back transaction, so it now also proves those three rollback files execute.
- **Result:** 15/15.

**RLS suite in the batch (infrastructure, not a test failure).**
- **What happened.** Inside the batch, the suite aborted before printing a summary. Three diagnostic runs showed connection drops: `ETIMEDOUT` to the pooler, "connection error", then a `57014` statement timeout.
- **Root cause.**
  - A network drop left an **orphaned server session "idle in transaction"** from an aborted run. Its last statement was `SAVEPOINT w` from the suite's probe loop.
  - That session still held the locks of its temporary GRANTs, so later runs waited until the 2-minute statement timeout.
  - The pooler sets no idle-in-transaction timeout.
- **Resolution.**
  - After 9 minutes, that one backend was terminated, after checking that it belonged to the same DB user and was running that statement. Its transaction rolled back, as the test intended.
  - The suite then passed **8/8 twice in a row**.
  - `test_gap2_4a_syllabus` re-ran 12/12 afterwards, so the live state was unchanged.
- **Hardening.** The suite's error handler now prints the error code and nested errors (`AggregateError` messages are empty), so a future abort names its cause.

## 6b. Architect notes on acceptance (2026-10-16)

1. **Terminating sessions.** Terminating a DB session is allowed ONLY for the suite's own orphaned session, after verifying the same DB user and its own statement, and it must be recorded (as above).
2. **Backlog:** TEST-HARNESS-TXN, hardening the test harness against orphaned idle-in-transaction sessions (`docs/reports/BACKLOG.md`).
3. **SSC GD stays DRAFT.** It is not a launch exam, unless the owner decides otherwise.

## 7. Next (GAP2-4b)

- Admin syllabus editor UI on these RPCs: version list, tree editor, topic picker, validation panel, admin publish.
- Re-point the student exam hub, coverage, readiness, question-factory and AI contexts to the read model. This removes B-CURRICULUM-MAPPING, EKC-155, EKX-221, ES-33 and the B5 escapes.
- **Admin-wide English-only cleanup** (ruling 2).
- Review and publish the GD draft (admin); author the CGL topics.
