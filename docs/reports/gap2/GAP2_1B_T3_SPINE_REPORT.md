# GAP2-1b — T3 identity-unified taxonomy spine (steps 1–2) + D1 security fix

Date: 2026-10-12/13 · Target: couragelibrary-next (ref guard DB = API, verified TLS) · Workflow: backup → dry-run → runner → ledger.
No secrets, refs or user data below.

## 1. Summary

`canonical_taxonomy_nodes` is now **the** taxonomy.
- Every SUBJECT and TOPIC node carries the same UUID as its `subjects` / `topics` row (4 + 36). SUBTOPIC follows the same rule; there are 0 today.
- Nodes are the write-master. `subjects`, `topics` and `subtopics` are a trigger-maintained projection.
- Writing those three tables directly is rejected by the database.
- Every one of the 211 existing values across the 32 subject/topic/subtopic FK columns is now also a valid node id. That is the precondition for the GAP2-3 FK flips, which were not done here.

Code changes:
- A single server-side writer, `TaxonomyService`, backs a new `/admin/taxonomy` page.
- The sections manager no longer creates subjects or "General Topics" from free text.
- The orphaned projection service is deleted.

D1: `fn_resolve_learn_more` is no longer executable by anon or authenticated users; it is service_role only.

Verification:
- **Suites:** new GAP2-1b suite 38/38 (offline + DB, rolled back) plus smoke 3/3; QF-1 73/73 and 15/15; DRIFT-1c 39/39; SEC-1A 20/20.
- **Static checks:** tsc 0 errors; lint 0 errors; build OK.
- **Baseline:** only the intended changes.

## 2. Preconditions

| Check | Result |
|---|---|
| DRIFT-1c/1d commit on origin/main | `f4e258e` ✔ |
| GAP2-1a report + drift1d screens committed separately | `8c23e3f` "docs: GAP2-1a canonical spine report + drift1d screens" |
| Re-key window, re-verified read-only right before migrating | taxonomy_aliases 0 · exam_syllabus_canonical_mappings 0 · current_affairs_taxonomy_mappings 0 · nodes 40 (4 SUBJECT + 36 TOPIC) with 1:1 legacy links ✔ (069 re-checks inside the migration and aborts with `T3_REKEY_WINDOW_CLOSED` otherwise) |
| Old/new id overlap | 0 (asserted in 069) |
| Backup | `pre-gap2-1b-069-2026-10-12T18-06-29` (public 136 tables / 136 data entries + auth data), outside the repo, used for 069/070/071 (all within 60 min) |

## 3. Migrations

| File | sha256 (prefix) | Dry-run | Applied |
|---|---|---|---|
| `20261012000069_t3_identity_rekey_canonical_nodes.sql` | `77ae4b0ead411dea` | OK | APPLIED (657 ms) |
| `20261012000070_t3_nodes_write_master_projection.sql` | `aba28f1721783b15` | OK | APPLIED (1330 ms) |
| `20261012000071_revoke_learn_more_public_execute.sql` | `efcf1b1932253b09` | OK | APPLIED (1380 ms) |

Ledger: 69 → 72 rows, all three APPLIED. No `EXCEPTION WHEN OTHERS` anywhere.

### 069: re-key (T3 step 1)
1. **Window guard.** The migration aborts unless aliases, syllabus mappings and CA taxonomy mappings are all empty, and every node has exactly the legacy link its type requires. It also asserts that every subjects/topics/subtopics row has exactly one node.
2. **Snapshot.** A temp table captures every node plus its `new_id` (`legacy_subject_id` / `legacy_topic_id` / `legacy_subtopic_id`, or the unchanged id for DOMAIN/CONCEPT/METHOD).
3. **Re-key in one `UPDATE`.**
   - It maps `id`, `parent_id` and `root_subject_id` through the snapshot.
   - The three node triggers (`trg_derive_canonical_taxonomy_fields`, `trg_guard_canonical_taxonomy_cycles`, `trg_cascade_canonical_descendants`) are disabled for that one statement only. They look parents up by id, which mid-statement would be half-translated.
   - The self-FKs are `ON UPDATE NO ACTION`, so they are checked at end of statement. Old and new ids are disjoint, so no transient PK or sibling-slug collision is possible.
4. **Proof inside the migration.** Any failure aborts the migration.
   - Every node equals its snapshot, with ids translated: name, slug, type, parent relationship, root, depth, `hierarchy_path`, display_order, is_active, metadata, legacy columns, `created_at` and `updated_at`.
   - Derived fields recomputed from the re-keyed tree (recursive CTE: depth, root, path) equal the stored values.
5. **Constraints.**
   - Unique `legacy_subject_id`, `legacy_topic_id` and `legacy_subtopic_id`; the indexes already existed from 058 and are kept idempotent.
   - New `chk_canonical_legacy_identity`: SUBJECT ⇒ `id = legacy_subject_id`; TOPIC ⇒ `id = legacy_topic_id`; SUBTOPIC ⇒ `id = legacy_subtopic_id`, with the other legacy columns NULL; DOMAIN/CONCEPT/METHOD ⇒ all legacy columns NULL.
   - Final assertion: every legacy row has a node with the same id and matching type.
6. **No other table's data changed** (see §8).

### 070: nodes are the write-master (T3 step 2)
- **Legacy back-reference FKs** are re-created as `DEFERRABLE INITIALLY DEFERRED` with `ON DELETE NO ACTION`. A new node can then reference the projection row its own AFTER trigger creates, and a legacy row can never be deleted from under its node. The earlier `ON DELETE SET NULL` would have conflicted with the identity CHECK.
- **`fn_enforce_canonical_taxonomy_rules`** (BEFORE INSERT/UPDATE):
  - **INSERT:** for SUBJECT/TOPIC/SUBTOPIC, sets `legacy_<type>_id := id` (id defaults to `gen_random_uuid()`). Any other legacy column, or a different legacy id, is rejected. DOMAIN/CONCEPT/METHOD may not carry legacy columns.
  - **Parent types:** SUBJECT is a root; DOMAIN goes under SUBJECT; TOPIC under SUBJECT or DOMAIN; SUBTOPIC under TOPIC; CONCEPT/METHOD under any node. These are checked on insert and on any parent change.
  - **UPDATE:** id is immutable; the legacy columns are immutable; `node_type` cannot change from or to SUBJECT/TOPIC/SUBTOPIC.
- **`fn_project_canonical_taxonomy_node`** (AFTER INSERT/UPDATE/DELETE, SECURITY DEFINER, `search_path` pinned, EXECUTE revoked from PUBLIC/anon/authenticated):
  - Upserts the same-id row: `subjects(name, slug, display_order, is_active)`; `topics(subject_id = root_subject_id, name, slug, description ← metadata.description if given, display_order, is_active)`; `subtopics(topic_id = parent_id, …)`.
  - On DELETE it deletes the projection row. Dependants' RESTRICT FKs keep blocking deletion of a used topic.
  - It is idempotent: `ON CONFLICT … DO UPDATE … WHERE (…) IS DISTINCT FROM (…)`, so a no-op node update does not touch the legacy row.
  - It sets the transaction-local flag `app.taxonomy_projection_write` (the same pattern as QF-1 `app.qf_lifecycle_write`) and restores the previous value afterwards.
- **`fn_guard_taxonomy_projection_write`:** BEFORE INSERT/UPDATE/DELETE row triggers plus BEFORE TRUNCATE statement triggers on subjects, topics and subtopics. It raises `TAXONOMY_PROJECTION_ONLY` unless the flag is on.
- **Proof inside the migration:** every SUBJECT/TOPIC/SUBTOPIC node is mirrored field-for-field, and the projection row counts equal the node counts.

### 071: D1
`REVOKE EXECUTE ON FUNCTION public.fn_resolve_learn_more(uuid, uuid) FROM PUBLIC, anon, authenticated; GRANT … TO service_role;` with an in-migration assertion.

## 4. Re-key proof (independent of the migration's own checks)

| Measure | Before | After |
|---|---|---|
| Nodes | 40 (SUBJECT 4, TOPIC 36; depth 1:4, 2:36) | 40, same |
| Node tree fingerprint (id-free: path, name, slug, type, depth, order, active, metadata, parent path, root path, timestamps) | `node_tree_shape` md5 | **identical** |
| SUBJECT nodes with id = legacy_subject_id | 0 / 4 | **4 / 4** |
| TOPIC nodes with id = legacy_topic_id | 0 / 36 | **36 / 36** |
| subjects / topics / subtopics content fingerprints (all columns, incl. ids and timestamps) | — | **identical** |
| FK values (32 FK columns into subjects/topics/subtopics) that are invalid | 0 | **0** |
| …that are **not** a node id | **211** | **0** |

The 211 values break down as: questions.canonical_topic_id 113, topics.subject_id 36, exam_topics.topic_id 18, mock_sections.subject_id 14, user_mistake_vault.topic_id 12, user_mistake_vault.subject_id 12, pattern_sections.subject_id 4, question_import_batches.target_topic_id 2. The other 24 FK columns are empty.

## 5. Projection test matrix

`scripts/test_gap2_1b_taxonomy.cjs --db`: every scenario runs in `BEGIN READ WRITE … ROLLBACK`, and DB-25 proves nothing persisted.

| # | Scenario | Result |
|---|---|---|
| DB-01 | Identity holds for every node | PASS |
| DB-02 | Live mirror exact (fields + counts) | PASS |
| DB-03 | Every value in every subject/topic/subtopic FK column is a node id | PASS |
| DB-04 | Create TOPIC under SUBJECT → `topics` row, same id, subject_id = subject; deferred FKs checked (`SET CONSTRAINTS ALL IMMEDIATE`) | PASS |
| DB-05 | Rename name + slug → projected; `hierarchy_path` updated | PASS |
| DB-06 | Deactivate / reactivate → projected | PASS |
| DB-07 | Create SUBTOPIC → `subtopics` row, topic_id = parent | PASS |
| DB-08 | Create CONCEPT / METHOD → no legacy row | PASS |
| DB-09 | TOPIC under DOMAIN under SUBJECT → `topics.subject_id` = SUBJECT; DOMAIN has no legacy row | PASS |
| DB-10 | Create SUBJECT → `subjects` row | PASS |
| DB-11 / 12 / 13 / 15 | Direct INSERT topics, UPDATE topics, DELETE subjects, INSERT subtopics → `TAXONOMY_PROJECTION_ONLY` | PASS |
| DB-14 | TRUNCATE subtopics → rejected | PASS. Rejected first by Postgres (`0A000`, table referenced by FKs). The guard's BEFORE TRUNCATE trigger is defence-in-depth for `TRUNCATE … CASCADE`, which was deliberately not exercised. |
| DB-16 | node_type change TOPIC→CONCEPT and CONCEPT→SUBTOPIC → rejected | PASS |
| DB-17 | Invalid parents (TOPIC↓TOPIC, SUBTOPIC↓SUBJECT, DOMAIN↓TOPIC, CONCEPT as root, SUBJECT↓SUBJECT, re-parent TOPIC under TOPIC) → rejected | PASS |
| DB-18 | id change, legacy column change, foreign legacy id on insert, legacy id on CONCEPT → rejected | PASS |
| DB-19 | Idempotency: no-op and metadata-only node updates leave the legacy row (incl. `updated_at`) untouched | PASS |
| DB-20 | Delete node of a topic with questions → rejected (FK); delete a fresh leaf topic node → legacy row removed | PASS |
| DB-21 | Move TOPIC to another SUBJECT → `topics.subject_id` follows | PASS |
| DB-22 | Reconciliation-workbench style insert (no legacy columns) auto-projects | PASS |
| DB-23 | Projection surfaces legacy global slug uniqueness (`topics_slug_key`) → rejected | PASS |
| DB-24 | D1 (see §7) | PASS |
| DB-25 | Row counts identical before/after all scenarios; mirror exact | PASS |

**Smoke** (`--smoke`): TaxonomyService against the real DB with a mocked admin session.

| # | Scenario | Result |
|---|---|---|
| S-01 | Create SUBJECT + 2 TOPICs; nested TOPIC rejected; rename; deactivate; reactivate; reorder; `listTree` reflects the order; projection rows verified via SQL | PASS |
| S-02 | Audit rows written for CREATE, RENAME, DEACTIVATE, REACTIVATE and REORDER with `target_entity = canonical_taxonomy_node` | PASS |
| S-03 | Cleanup deleted the QA nodes (children first). The projection removed their subjects/topics rows, leaving 0 nodes, 0 subjects and 0 topics. Intended residue: 7 `admin_audit_logs` rows | PASS |

## 6. Code changes

| Change | Where |
|---|---|
| **TaxonomyService**, the only taxonomy writer: `listTree`, `listNodesByType`, `createNode` (SUBJECT/DOMAIN/TOPIC/SUBTOPIC/CONCEPT/METHOD), `renameNode`, `reorder`, `setActive` / `deactivate` / `reactivate`. Each call starts with `AdminService.checkIsAdminOrStaff()`, and each mutation writes `admin_audit_logs` (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason). Server-only (service-role client); the service never sets ids or legacy columns. | `services/taxonomy/taxonomy.service.ts` |
| Shared, dependency-free rules (types, parent matrix, slug/name validation), safe for client components | `services/taxonomy/taxonomy.rules.ts` |
| `/admin/taxonomy`: server page, server actions (TaxonomyService only), light-theme tree manager (expand/collapse, add child with allowed types, rename + slug, deactivate/reactivate, move up/down) | `app/admin/taxonomy/page.tsx`, `actions.ts`, `taxonomy-manager.tsx` |
| Sidebar link "Taxonomy" | `components/admin/admin-sidebar.tsx:299-309` |
| `createSectionAction` requires `subjectId` of an **existing active SUBJECT node**. It returns an error pointing to `/admin/taxonomy` otherwise. The find-or-create of `subjects` and the "<Subject> General Topics" `topics` insert are removed. | `app/admin/actions.ts:415-452` |
| `toggleSectionStatusAction` removed: it wrote `subjects.is_active` directly and had no callers | `app/admin/actions.ts` (formerly ~:532) |
| Sections form: subject picker (existing active subjects) with a link to Taxonomy | `components/admin/admin-sections-manager.tsx:40, 200-225`; `app/admin/sections/page.tsx` |
| Orphaned `services/canonical-taxonomy-projection.service.ts` deleted; triggers replace it. No other orphans touched. | — |
| Reconciliation workbench: unchanged; its node inserts now auto-project (DB-22) | `services/exam-syllabus-resolution.service.ts` |
| QF resolver: unchanged, still on `topics` (ids identical); QF suites green | `services/question-factory/question-taxonomy-resolver.ts` |
| New suite | `scripts/test_gap2_1b_taxonomy.cjs` |

Static guarantee (O-10): a scan of `app/ services/ lib/ actions/ components/ features/` finds **no** `.insert/.upsert/.update/.delete` on subjects/topics/subtopics, and no raw `INSERT/UPDATE/DELETE/TRUNCATE` SQL on them.

## 7. D1 proof

| Role | EXECUTE on `fn_resolve_learn_more(uuid, uuid)` before | after |
|---|---|---|
| anon | true | **false** |
| authenticated | true | **false** |
| service_role | true | true |

DB-24 also calls the function under `SET LOCAL ROLE anon` and under `SET LOCAL ROLE authenticated`. Both fail with 42501 (permission denied). No app code calls the function (GAP2-1a); it will be rewritten in GAP2-2.

## 8. Baseline: before vs after (all 137 public tables + auth.users)

| Difference | Explanation |
|---|---|
| `schema_migration_ledger` 69 → 72 | 069, 070, 071 APPLIED |
| `admin_audit_logs` 1 → 8 | 7 rows from the service smoke (intended) |
| canonical_taxonomy_nodes ids | re-keyed (content and shape fingerprint identical) |
| +3 functions | `fn_enforce_canonical_taxonomy_rules`, `fn_project_canonical_taxonomy_node`, `fn_guard_taxonomy_projection_write` |
| +8 triggers | 2 on canonical_taxonomy_nodes; row + truncate guards on subjects, topics, subtopics |
| Node constraints | +`chk_canonical_legacy_identity`; legacy FKs now deferrable / NO ACTION |
| fn_resolve_learn_more grants | anon/authenticated EXECUTE revoked |
| **Everything else** | **identical**: row counts of every table; fingerprints of subjects, topics, subtopics, questions, question_versions/options/answers, attempts, attempt_answers, mistake vault/occurrences, mock tests/questions/sections, exam_topics/syllabi, import batches, learning resources, articles, courses, aliases, mappings; all 135 pre-existing function bodies |

## 9. Tests and build

| Check | Result |
|---|---|
| `scripts/test_gap2_1b_taxonomy.cjs` offline | 13/13 |
| `… --db` (rolled back) | 25/25 (38/38 with offline) |
| `… --smoke` | 3/3 (16/16 with offline) |
| `test_qf1_question_factory` | 73/73 |
| `test_qf1_db` | 15/15 |
| `test_drift1c_features` | 39/39 |
| `test_sec1a_containment` | 20/20 |
| `tsc --noEmit` | 0 errors |
| `next lint` | 0 errors |
| `npm run build` | OK (`/admin/taxonomy` built) |

## 10. Notes for the next phases
- **GAP2-3 (FK flips):** every value is already a node id (DB-03). Each flip is constraint-only (`NOT VALID` → `VALIDATE`). PostgREST embeds named after the old FKs (`topics(...)`) must move in the same deploy.
- **Legacy uniqueness:** `topics.slug`, `subtopics.slug` and `subjects.slug/name` are globally unique, while node slugs are unique per parent. The projection surfaces such conflicts as errors (DB-23), and TaxonomyService maps them to a clear message. Whether to relax the legacy uniqueness belongs to GAP2-3.
- **Re-parenting is not exposed:** TaxonomyService does not offer re-parenting (moving nodes between parents). The DB supports it under the type rules, and it projects `topics.subject_id` (DB-21).
- **Deactivation is per node:** it does not cascade to descendants.

GAP2-1b STATUS: CLOSED
