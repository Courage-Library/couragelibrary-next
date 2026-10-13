# GAP2-3: Taxonomy FK flips to canonical_taxonomy_nodes (decision #23)

**Status:** see §9. Migration 075 is applied to couragelibrary-next with a ledger row; backup `E:\CourageLibrary-Backups\pre_075_gap2_3-*`.

## 1. Forensics (read-only, before any change)

### 1a. FKs into the projection tables

There are **35 FKs** in total: **33 in `public`**, all flipped, and **2 in `retired`** (`retired.learning_resource_topics.topic_id` / `subtopic_id`), which were listed and **not flipped**. PG 17.6.

| Table.column → target | ON DELETE (before) | NOT NULL | rows / non-null | index before |
|---|---|---|---|---|
| canonical_taxonomy_nodes.legacy_subject_id → subjects | NO ACTION, DEFERRABLE | – | 40 / 4 | ✓ |
| canonical_taxonomy_nodes.legacy_topic_id → topics | NO ACTION, DEFERRABLE | – | 40 / 36 | ✓ |
| canonical_taxonomy_nodes.legacy_subtopic_id → subtopics | NO ACTION, DEFERRABLE | – | 40 / 0 | ✓ |
| topics.subject_id → subjects (projection-internal) | RESTRICT | ✓ | 36 / 36 | ✓ |
| subtopics.topic_id → topics (projection-internal) | RESTRICT | ✓ | 0 / 0 | ✓ |
| questions.canonical_topic_id → topics | RESTRICT | ✓ | 113 / 113 | ✓ |
| questions.subtopic_id → subtopics | SET NULL | – | 113 / 0 | **✗** |
| exam_topics.topic_id → topics | RESTRICT | ✓ | 18 / 18 | ✓ |
| mock_sections.subject_id → subjects | RESTRICT | ✓ | 14 / 14 | **✗** |
| pattern_sections.subject_id → subjects | RESTRICT | ✓ | 4 / 4 | ✓ |
| question_import_batches.target_topic_id → topics | RESTRICT | ✓ | 2 / 2 | ✓ |
| learning_units.topic_id → topics / subtopic_id → subtopics | CASCADE / SET NULL | ✓ / – | 1 / 1 · 1 / 0 | ✓ ✓ |
| user_mistake_vault.subject_id / topic_id | SET NULL / SET NULL | – | 12 / 12 · 12 / 12 | **✗ ✗** |
| user_topic_mastery.canonical_topic_id | RESTRICT | ✓ | 0 | ✓ |
| user_mastery_history.canonical_topic_id | RESTRICT | ✓ | 0 | **✗** |
| learning_activity_events.topic_id | RESTRICT | ✓ | 0 | ✓ |
| topic_relationships.from_topic_id / to_topic_id | CASCADE | ✓ | 0 | ✓ ✓ |
| batch_curriculum_assignments.topic_id | CASCADE | – | 0 | **✗** |
| daily_study_recommendations.topic_id | SET NULL | – | 0 | **✗** |
| descriptive_questions.subject_id / topic_id | SET NULL | – | 0 | **✗ ✗** |
| discussion_threads.topic_id | SET NULL | – | 0 | ✓ |
| flashcard_decks.subject_id / topic_id | SET NULL | – | 0 | ✓ ✓ |
| quiz_battle_rooms.topic_id | SET NULL | – | 0 | **✗** |
| search_indexes.subject_id / topic_id | SET NULL | – | 1 / 0 | **✗ ✗** |
| spaced_repetition_schedules.topic_id | CASCADE | – | 0 | **✗** |
| study_plan_items.topic_id | RESTRICT | – | 0 | ✓ |
| user_mistake_drills.topic_id | SET NULL | – | 0 | **✗** |

ON UPDATE was NO ACTION everywhere. 14 columns had no index; 075 creates them.

### 1b. Implicit taxonomy columns (no FK)

Only one: `exam_unit_mappings.exam_topic_id`. It has an FK to `exam_topics`, so it is **not a taxonomy id**. There are **0 ambiguous columns**.

### 1c. Orphan / node-type checks

For all 33 columns: **0 orphans and 0 node-type mismatches**, so there is no hard stop. Nodes: 4 SUBJECT and 36 TOPIC, all active; subtopics 0.

### 1d. Projection consumers (inventory only; they keep working because the projection stays)

- **Functions:** `fn_create_discussion_thread`, `fn_delete_exam_controlled`, `fn_import_question_drafts`, `fn_project_canonical_taxonomy_node` (the projection writer), `fn_reconcile_search_indexes`, `fn_record_mistake_occurrence`.
- **Views / policies:** none.
- **Projection triggers:** guard (`fn_guard_taxonomy_projection_write`) on subjects, topics and subtopics.

### 1e. Code reading the projection directly

`.from('subjects' | 'topics' | 'subtopics')` reads, for example in canonical-curriculum-blueprint, exam-knowledge-context-builder, curriculum-context-builder, academic-taxonomy and question-taxonomy-resolver. These are unaffected because the projection stays; they are open item §8.

### 1f. Generated column as the referencing side of a composite FK

Probed in `BEGIN … ROLLBACK` on PG 17.6:

| Step | Result |
|---|---|
| `UNIQUE (id, node_type)` | OK |
| Stored generated `topic_id_node_type text GENERATED ALWAYS AS ('TOPIC') STORED` | OK |
| `FOREIGN KEY (topic_id, topic_id_node_type) REFERENCES canonical_taxonomy_nodes(id, node_type) ON DELETE RESTRICT NOT VALID` → VALIDATE | OK |
| Insert TOPIC id / NULL | OK |
| Insert SUBJECT id / non-existent id | **23503** |

So the **preferred declarative design is possible**.

### 1g. Embed inventory and pre-flip capture

- **The risk:** PostgREST finds embeds through FKs, so every embed reaching the projection breaks once its FK points to nodes. **41 embed sites in 24 services** were found; the registry is `scripts/fixtures/gap2_3_embeds.cjs`.
- **Capture method:** each site's original select was executed through PostgREST, **before the flip**, as qa-student (student paths), qa-admin, and the **service role** (what most of these code paths use, and it bypasses RLS for real data coverage). qa-student had 3 Mistake Vault rows from an E2E run, cleaned up afterwards.
- **Capture contents:** 96 executions stored as status, row count, key shape and sha256 of canonical data in `scripts/fixtures/gap2_3_embed_baseline.json`. **No data values, ids or emails are stored.**
- **Results:** 200 ×64 · 403 ×15 (authenticated has no grants on `question_answers`, `quiz_battle_rooms`, `descriptive_questions`, `flashcard_decks`, `question_version_authoring`; the service role covers those) · 400 ×14 · 300 ×3. The 300/400 results are **pre-existing breakage**, unrelated to the flip:

| Site | Pre-existing error |
|---|---|
| ADP-1225 (adaptive) | `questions.question_text` does not exist |
| ACI-896 (competition intelligence) | no `mock_questions`↔`questions` relationship |
| DSH-88 (dashboard), CI-539 (candidate intelligence) | `user_topic_mastery.topic_id` does not exist |
| EKX-221 | `questions.topic_id` does not exist |
| COM-100 (thread detail) | ambiguous `discussion_messages` embed (PGRST201) |
| EKC-155, ES-33 | `exam_syllabi` has **no subject_id column**; the relationship never existed. Left untouched. |

## 2. Enforcement design (declarative, per 1f)

- **Target key:** `canonical_taxonomy_nodes_id_node_type_key UNIQUE (id, node_type)`.
- **Per column:** `<col>_node_type text GENERATED ALWAYS AS ('SUBJECT'|'TOPIC'|'SUBTOPIC') STORED` plus `<table>_<col>_node_fkey FOREIGN KEY (<col>, <col>_node_type) REFERENCES canonical_taxonomy_nodes (id, node_type) ON DELETE RESTRICT ON UPDATE NO ACTION`. It is MATCH SIMPLE, so NULL stays allowed where the column is nullable; NOT NULL columns keep NOT NULL. One pattern for all 33; no triggers.
- **ON DELETE:** RESTRICT everywhere, replacing the former CASCADE / SET NULL. Nodes are deactivated, never deleted.
- **Inactive nodes** stay valid targets (proven in D-04).
- **Two special groups, flipped by the same rule:**
  - projection-internal `topics.subject_id` / `subtopics.topic_id`. The projection writer is unchanged; a projected topic now references its SUBJECT node.
  - `canonical_taxonomy_nodes.legacy_*_id` (identity bridge, `legacy_*_id = id`). These become **self-references**; the old projection FKs were DEFERRABLE INITIALLY DEFERRED because of trigger ordering. The new ones are immediate. Node creation was proven by the GAP2-1b DB + smoke suite (create / rename / deactivate / reactivate / reorder).
- **Generated `*_node_type` columns:** visible in `select('*')` on the 24 touched tables, and never writable. `types/database.ts` marks them `Row: string | null`, `Insert/Update: never`.

## 3. Migration 075 + rollback

`supabase/migrations/20261013000075_gap2_3_taxonomy_fk_flips.sql` (generated from §1, planned DDL per column in the header):
1. temp fingerprint table (row count + md5 for each of 24 tables);
2. `public.taxonomy_fk_flip_log` (`table_name`, `column_name`, `old_constraint`, `old_target`, **`old_definition`**, `new_constraint`, `expected_node_type`, `flipped_at`), RLS enabled with no policies and default privileges only (no anon/authenticated grants);
3. `UNIQUE (id, node_type)`;
4. per column: generated column → log row (with the full old definition) → node FK `NOT VALID` → `VALIDATE` → drop old FK → index if missing (14 created);
5. **proof**:
   - zero public FKs into the projection;
   - 33 log rows;
   - every node FK present, validated, RESTRICT / NO ACTION, targeting nodes;
   - **row count + md5 of all 24 tables unchanged** (generated columns excluded);
6. `NOTIFY pgrst`.

Sequence: backup → **dry-run OK** (3.2 s, proof included) → apply OK, ledger row (1.6 s).

**Rollback** (`docs/database/rollback/075_rollback.sql`, not applied):
- re-creates each original FK from `old_definition` (same names, actions and deferrability);
- drops the node FKs, generated columns, the 14 created indexes, the UNIQUE and the log.

Dry-run inside `BEGIN … ROLLBACK` (D-07): 33 projection FKs restored, 0 generated columns, log dropped. The live state is unchanged afterwards (D-08).

## 4. Code changes (embeds)

**41 sites / 24 files / 38 registry fragments + 1 structural change**, all applied by codemod from the registry:

| Pattern | Re-point |
|---|---|
| `topics(…)` / `subjects(…)` under a flipped table | `topics:canonical_taxonomy_nodes!<table>_<col>_node_fkey(…)` (alias keeps the response key) |
| `subject_id` / nested `subjects(…)` inside a topic | `subject_id:root_subject_id`, `subjects:root_subject_id(…)` |
| `*` embeds (11) | explicit node columns with **identical keys**: `description:metadata->>description`, `importance_level:metadata->>importance_level`, `icon:metadata->>icon`, … |
| premium-hub (`subjects` → child `topics`, a projection-to-projection relationship) | `.from('canonical_taxonomy_nodes').eq('node_type','SUBJECT')` with `topics:canonical_taxonomy_nodes!parent_id(id, name)` |

- **Self-relationships:** PostgREST does **not** resolve FK-*name* hints for self-relationships on `canonical_taxonomy_nodes` (PGRST200). They use the column form (`root_subject_id(…)`, `!parent_id`), proven by a read-only probe and by E-01 / E-02.
- **Known value difference** in the 11 `*` mappings: `importance_level` (on topics only, not in node metadata) comes back null, and `created_at` / `updated_at` are the node's. **No consumer reads them from these embeds**; the one `importance_level` reader queries `topics` directly.
- **Types:** `types/database.ts` re-points 26 relationships and adds the generated columns. Seven columns live on tables missing from the stale generated types (canonical_taxonomy_nodes, learning_units, topic_relationships, plus one stale relationship); regenerating the types is open item §8.
- **Untouched:** EKC-155 and ES-33 (`exam_syllabi.subject_id` doesn't exist).
- **Filters / ordering on embedded taxonomy resources:** none exist.

## 5. Tests: `scripts/test_gap2_3_fk_flips.cjs` (15/15, offline + DB)

| Group | Tests |
|---|---|
| Static S-01…S-03 | no projection embed left in 500 files (mutation-checked: re-introducing one in dashboard fails S-01 and S-02); every registry re-point present; premium-hub on SUBJECT nodes; migration + rollback present, never drops or moves the projection, no GRANT/REVOKE/POLICY |
| Catalog D-01, D-02 | zero public FKs into the projection (2 retired listed); 33 log rows; each column: exact composite FK definition, VALIDATED, RESTRICT, NO ACTION, generated column with the right constant, index; UNIQUE present |
| Behaviour D-03…D-05 (rolled back) | SUBJECT id into a TOPIC column → 23503; TOPIC into a SUBJECT column → 23503; non-existent → 23503; NULL into nullable OK; NOT NULL still enforced (23502); valid id OK; **delete of a referenced node → 23503 (RESTRICT)**; **deactivate → OK, references valid**; **projection guard still blocks** direct UPDATE/INSERT on the projection |
| Data D-06 | row count + md5 of all 24 tables equal the pre-flip baseline |
| Embeds E-01…E-04 | **93 executions**: pre-flip status, rows and key shape, plus the data hash for every non-`*` embed; premium-hub identical; untouched sites fail exactly as before; pre-broken sites gain **no new relationship error**; `*` embeds are field-identical to the (unchanged) projection rows except `importance_level` / timestamps (20 rows) |
| Rollback D-07, D-08 | rollback executes and restores 33 projection FKs; live state unchanged |

## 6. Regressions

| Suite | Result |
|---|---|
| GAP2-1b offline / `--db --smoke` | 13/13 / **41/41**. DB-03 updated: it now finds the taxonomy FK columns via the node FKs (first key column), as well as the projection before 075. The first smoke run failed S-01 once; two re-runs passed and nothing was left behind (0 smoke nodes, 40 nodes). |
| QF-1 offline / DB | 73/73 / 15/15 |
| GAP2-2a offline / DB | 11/11 / 18/18 |
| GAP2-2b offline / DB | 18/18 / **32/32** |
| E2E student journey (qa-student, local production build of the new code): mock result page, Mistake Vault list + drill | **13/13**; rows cleaned |
| SEC-1B offline / live | 26/26 / 32/32 |
| SEC-1C offline / live | 22/22 / 29/29 |
| SEC-1D offline / live | 14/14 / 19/19 |
| SEC-1A | 20/20 |
| DRIFT-1c | 46/46 |
| tsc / lint / build | 0 / 0 errors / OK |

## 7. Baseline (`pre_gap2_3` → `post_gap2_3`)

| Difference | Allowed by |
|---|---|
| **No data fingerprint changed in any table** (generated columns excluded): questions, question_versions/options/answers, mock_tests, attempts, results, user_mistake_*, learning_units/documents/document_versions, current_affairs_*, canonical_taxonomy_nodes, subjects/topics/subtopics | – |
| `taxonomy_fk_flip_log` 0 → 33; `schema_migration_ledger` 75 → 76 | design |
| projection-FK section empty; node constraints + UNIQUE | design |
| `admin_audit_logs` 29 → 64: **all 35 rows are qa-admin `TAXONOMY_NODE_*`** (create 15, rename / deactivate / reactivate / reorder 5 each) from the mandated GAP2-1b `--db --smoke` runs (5 runs; extra runs from the DB-03 harness fix and one network retry); every smoke node was removed | QA-identity rows (same treatment as SEC-1B) |

## 8. Open items

1. **Projection consumers to migrate (later phase):** 6 SQL functions (§1d) and the direct `.from('subjects'|'topics'|'subtopics')` reads (§1e), then retire the projection tables.
2. **`importance_level`** exists only on `topics`. Move it into node metadata (or a column) before the projection is retired.
3. **Pre-existing broken queries:** ADP-1225, ACI-896, DSH-88, CI-539, EKX-221, COM-100, EKC-155, ES-33 (§1g). Several are student-facing (dashboard topic mastery, thread detail).
4. **Stale `types/database.ts`:** missing canonical_taxonomy_nodes, learning_units, topic_relationships, … Regenerate from the live schema.
5. **The 2 FKs in `retired.learning_resource_topics`** still reference the projection; they go with RETIRED-CLEANUP.
6. **Deployment window:** the flip changes embed resolution, so production ran the previous build against the flipped schema from apply until deploy (§9). Pre-launch dev DB.

## 9. Commit plan

```
feat(gap2-3): re-point taxonomy foreign keys to canonical_taxonomy_nodes with node-type enforcement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Files:
- migration 075 and `docs/database/rollback/075_rollback.sql`;
- 24 service files and `types/database.ts`;
- `scripts/test_gap2_3_fk_flips.cjs`, `scripts/fixtures/gap2_3_embeds.cjs`, `scripts/fixtures/gap2_3_embed_baseline.json` (hashes only);
- `scripts/test_gap2_1b_taxonomy.cjs` (DB-03);
- this report.

Production checks after deploy:
- `GET /` and `/api/health` → 200;
- a mock result page and the Mistake Vault as qa-student → 200 with data;
- `/articles` → 200;
- `/admin/taxonomy` as qa-admin → 200;
- anonymous `/admin` → 307.
