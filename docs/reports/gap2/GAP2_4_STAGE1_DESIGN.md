# GAP2-4 Stage 1: canonical exam syllabus, forensics and design

> **Status: DESIGN for architect review.** Documents only: no code, no migrations, no DB writes.
> - **Evidence:** read-only catalog queries on couragelibrary-next (`BEGIN READ ONLY`, verified TLS, ref-locked; counts and structure only) and a code inventory of every reader and writer.
> - **Locked target (decision #13):** `exam → exam_syllabus_versions` (DRAFT → PUBLISHED; published versions immutable; a change means a new version) `→ exam_syllabus_nodes` (tree: paper → section → topic) `→ exam_syllabus_canonical_mappings` (syllabus node ↔ canonical TOPIC nodes, many-to-many, optional weightage).
> - **Coverage and courses are DERIVED.** There is no separate mapping store.
> - **Legacy objects** (`exam_syllabi`, `exam_topics`, `exam_unit_mappings`) are retired via #21.
> - **Exam Knowledge** is a source for drafting, never the store.
> - **Decision #38 applies:** no direct DB connections from runtime code.

---

## 1. Forensics

### 1.1 Tables (live schema, row counts as of 2026-10-15)

| Table | Rows | Role today |
|---|---|---|
| `exam_syllabus_versions` | **0** | Target versions |
| `exam_syllabus_nodes` | **0** | Target tree |
| `exam_syllabus_canonical_mappings` | **0** | Target mappings |
| `exam_syllabi` | **1** | **Legacy** syllabus header |
| `exam_topics` | **18** | **Legacy** flat topic list |
| `exam_unit_mappings` | **0** | **Legacy** exam-topic ↔ learning unit link |
| `exam_topic_mappings` | — | **Does not exist** (still embedded by 4 broken queries) |
| `exam_sections` | — | **Does not exist** (embedded by the student hub query) |
| `exam_patterns` / `pattern_sections` | 1 / 4 | Exam blueprint (marks, sections). Not the syllabus. |
| `exam_question_mappings` | 0 | Exam ↔ question relevance (QF-1) |
| `exam_knowledge_documents` | 70 | Exam Knowledge modules. SSC CGL / CHSL / MTS each have a published SYLLABUS, SYLLABUS_OVERVIEW and EXAM_PATTERN. |
| `canonical_taxonomy_nodes` | 40 | 4 SUBJECT + 36 TOPIC, all active |
| `taxonomy_aliases` / `topic_relationships` | 0 / 0 | Taxonomy helpers |
| `learning_units` | 1 | 1 unit on a TOPIC node, inactive |
| `questions` (published) | 111 | All have `canonical_topic_id` (32 distinct topics) |

**`exam_syllabus_versions`.**
- **Columns:** `id`, `exam_id` NOT NULL → exams (RESTRICT), `exam_cycle_id` → exam_cycles (SET NULL), `version_tag` NOT NULL, `source_document_id` → exam_knowledge_documents (SET NULL), `raw_payload_hash` NOT NULL, `status` NOT NULL DEFAULT 'DRAFT', `is_active` NOT NULL DEFAULT true, `metadata` jsonb, timestamps.
- **CHECK** `status ∈ (DRAFT, RECONCILED, PUBLISHED, ARCHIVED)`; **UNIQUE** `(exam_id, version_tag)`.
- **No** publish metadata, **no** immutability trigger, **no** "one published per exam" rule.

**`exam_syllabus_nodes`.**
- **Columns:** `id`, `syllabus_version_id` NOT NULL → versions (CASCADE), `parent_node_id` → self (CASCADE), `raw_title`, `raw_slug`, `node_depth` NOT NULL (CHECK ≥ 1), `display_order` (DEFAULT 0), `weightage_tier` (CHECK `HIGH_YIELD | CORE | MODERATE | LOW | OPTIONAL`), `expected_questions_min` / `_max`, `required_cognitive_depth` (CHECK), `is_mandatory`, timestamps.
- **UNIQUE** `(syllabus_version_id, coalesce(parent_node_id, 0-uuid), raw_slug)`. CHECK no self-parent.
- **Triggers:**
  - `trg_derive_exam_syllabus_node_depth` (depth from parent)
  - `trg_guard_exam_syllabus_node_cycles` (walks parents; rejects cycles)
  - `trg_cascade_exam_syllabus_node_descendants` (re-derives descendant depth on re-parent)
- **No** node kind, **no** check that the parent belongs to the **same version**, and **no** immutability.

**`exam_syllabus_canonical_mappings`.**
- **Columns:** `syllabus_node_id` NOT NULL → nodes (CASCADE), `canonical_node_id` → canonical_taxonomy_nodes (RESTRICT; **nullable**, **no node-type enforcement**), `match_status` NOT NULL (CHECK `EXACT_MATCH | ALIAS_MATCH | PROPOSED_MATCH | AMBIGUOUS | MANUALLY_MAPPED | NEW_SUBJECT_GAP | …`), `match_confidence` 0..1, `match_method`, `candidate_matches` jsonb, `reconciliation_metadata` jsonb, `reviewed_by` → auth.users, `reviewed_at`.
- **UNIQUE `(syllabus_node_id)`, so one mapping per node.** That contradicts the many-to-many target.

**Legacy objects:**
- **`exam_syllabi`:** `id`, `exam_cycle_id` NOT NULL → exam_cycles, `version_tag` DEFAULT 'official', `description`, `is_active`. UNIQUE `(exam_cycle_id, version_tag)`. **No `exam_id` and no `subject_id` columns.**
- **`exam_topics`:** `syllabus_id` → exam_syllabi (CASCADE), `topic_id` + `topic_id_node_type` → canonical nodes (GAP2-3 composite FK, RESTRICT), `weightage_level` (high / medium / low), `expected_questions`, `priority`, `required_depth`, `is_mandatory`, `weightage_override`, `notes`. UNIQUE `(syllabus_id, topic_id)`.
- **`exam_unit_mappings`:** `exam_topic_id` → exam_topics (CASCADE), `learning_unit_id` → learning_units (CASCADE), `sequence_order`, `is_exam_core`, `is_active`. UNIQUE `(exam_topic_id, learning_unit_id)`.

**RLS** is enabled on every table above.
- Public read policies:
  - target tables: only PUBLISHED versions and their nodes / mappings
  - `exam_syllabi`: active rows
  - `exam_topics`: all rows
- **Hardening finding (not an open hole):** 11 tables carry a policy named "Staff / Admin staff full management of …" granting **`FOR ALL TO authenticated USING (true) WITH CHECK (true)`**:
  - `canonical_taxonomy_nodes`, `taxonomy_aliases`
  - the three target syllabus tables
  - `exam_knowledge_documents`, `exam_doc_versions`, `exam_posts`, `exam_sources`, `exam_claims`, `exam_claim_sources`

  A read-only privilege check shows the `authenticated` role holds **no INSERT / UPDATE / DELETE privilege** on any of them, so writes are blocked today **only by grants**. These policies should be replaced with role-checked ones (§2.3).

  > **Correction (SEC-HOTFIX-4, 2026-10-15):** `authenticated` *does* hold SELECT, and a `FOR ALL … USING (true)` policy also grants reads. Any signed-in user could therefore read rows hidden from the public (11 unverified `exam_sources` rows were readable). SEC-HOTFIX-4 (migration 076) replaced all 11 policies with admin/staff-only policies (`docs/reports/sec/SEC_HOTFIX4_REPORT.md`). §2.3 is done.

**Functions and RPCs:**
- Only the three node triggers above (plus unrelated `fn_reconcile_search_indexes`).
- **No runtime code calls any syllabus RPC.**
- `fn_delete_exam_controlled` (exam deletion) and its service fallback delete `exam_topics` / `exam_syllabi`.

### 1.2 The 18 legacy `exam_topics` rows (structure only)

- **All 18 belong to SSC GD**, via the single `exam_syllabi` row (`version_tag = 'official'`, active) → SSC GD 2026 cycle. **None belong to SSC CGL.**
- Every row references a canonical **TOPIC** node:

  | Subject | Topics in the GD syllabus | Canonical topics in the subject |
  |---|---|---|
  | English Comprehension | 2 | 10 |
  | General Awareness | 5 | 7 |
  | General Intelligence and Reasoning | 6 | 8 |
  | Quantitative Aptitude | 5 | 11 |

- `weightage_level`: high 8 / medium 10. `required_depth`: all `INTERMEDIATE_APPLICATION`. `is_mandatory`: all true. `expected_questions`: all 1 (a default, not data). `priority`: 10 distinct values. No overrides and no notes.
- **There is no tree.** The topics are flat; the subject comes only from each canonical topic's `root_subject_id`.
- **SSC CGL has no topic-level syllabus anywhere.** It has an exam pattern (1 `exam_patterns` row, "Tier 1 (CBE)", 100 questions) with 4 `pattern_sections` mapped to the 4 canonical SUBJECT nodes, plus a published Exam Knowledge `SYLLABUS` document.

### 1.3 Readers and writers (runtime)

S = student page, A = admin / staff page. DEAD = no runtime caller. **BROKEN** = queries non-existent columns or relations.

| Area | file : function | Objects | Served by | State |
|---|---|---|---|---|
| **Student exam hub** | `services/exam-knowledge/exam-knowledge-candidate.service.ts` `getExamKnowledgeCandidateView` (:138 patterns, :154 syllabi, :160 topics, :166 unit mappings, :176 questions) | `exam_patterns` (`.eq exam_id` + embed `exam_sections`), `exam_syllabi` (`subject:subjects`, `.eq exam_id`), `exam_topics` (`.eq exam_id`, `is_active`), `exam_unit_mappings`, `questions.topic_id` | **S** `/exams/[slug]`, `/[moduleSlug]`, `/cycle/[year]`, `/cycle/[year]/[moduleSlug]` | **BROKEN:** EKC-155; an untagged `questions.topic_id`. Errors are swallowed, so the **syllabus / pattern sections render empty and PYQ count is always 0** |
| Legacy syllabus service | `services/exam-syllabus.service.ts` (`getExamSyllabus`, `getExamTopics`, `getExamTopicLearningUnits`) | `exam_syllabi` (ES-33), `exam_topics`, `exam_unit_mappings` | — | **DEAD + BROKEN** |
| Exam onboarding | `services/exam-onboarding/exam-onboarding.service.ts` `saveSyllabusProjection` (:604 / :611 / :627), `evaluateExamDeletionEligibility` (:769 / :774), `deleteExam` (:1006–:1010) | **writes** `exam_syllabi`, `exam_topics` (upsert); deletes | **A** `/admin/exams/onboarding` | Working (legacy store) |
| Onboarding page | `app/admin/exams/onboarding/page.tsx` :105 / :112 | reads `exam_syllabi`, `exam_topics` (pre-selects topics) | **A** | Working (legacy) |
| Onboarding readiness | `services/exam-onboarding/exam-readiness.service.ts` :158 / :166 | `exam_syllabi`, `exam_topics` | **A** `/admin/exams`, `/admin/exams/onboarding` | Working (legacy) |
| Onboarding AI context | `services/exam-onboarding/exam-onboarding-context-builder.service.ts` :41 (`exam_cycles.cycle_name`), :51 (`exam_topics.exam_id`) | reads | **A** onboarding wizard prompts | **BROKEN** |
| Exam Knowledge AI context | `services/exam-knowledge/exam-knowledge-context-builder.service.ts` :146 (`exam_patterns.category_id`), :219–222 (`questions.topic_id`, `year`, `tier`) | reads | **A** `/admin/exam-knowledge` | **BROKEN** (EKX-221) |
| Question factory | `services/question-factory/question-context-builder.service.ts` :242 / :250 | `exam_syllabi`, `exam_topics` | **A** `/admin/questions/factory` | Working (legacy) |
| Curriculum coverage | `services/curriculum-coverage.service.ts` `getCurriculumCoverageMatrix` (:200), `getCurriculumQualityMetrics` (:516), **`mapUnitToExam`** (:702 / :712 / :727) | `exam_unit_mappings` (+ `exam_topic_mappings` embed), `learning_units.is_published` | **A** `/admin/content` (matrix shows UNAVAILABLE since HOTFIX-2); `mapUnitToExam` has no UI | **BROKEN** (B-CURRICULUM-MAPPING) |
| Content studio | `services/admin-content-studio.service.ts` `getAcademicHierarchy` (:203), `getLearningUnitDetail` (:271) | `exam_unit_mappings` + `exam_topic_mappings` embed | **A** `/admin/content` | **BROKEN** (exam badges always empty) |
| AI curriculum context | `services/ai/curriculum-context-builder.service.ts` :185 / :186 | `exam_unit_mappings` → `exam_topics` → `exams` | **A** `/admin/content` AI generation | **BROKEN** |
| Reconciliation workbench | `services/operational-syllabus-reconciliation.service.ts`, `exam-syllabus-readiness.service.ts`, `exam-syllabus-resolution.service.ts` | reads versions / nodes / mappings; **writes** mappings, `canonical_taxonomy_nodes`, `taxonomy_aliases` | **A** `/admin/syllabus-reconciliation` + 5 API routes | Works on **0 rows**. `CREATE_NEW_SUBTREE` disabled (HOTFIX-3) |
| Auto-matcher / importer | `services/exam-syllabus-reconciliation.service.ts`, `services/exam-syllabus-tree-importer.service.ts` | the only code that creates versions / nodes / mappings | — | **DEAD** (scripts only) |
| Blueprint (not syllabus) | `app/admin/actions.ts` pattern/section CRUD; `admin.service.ts`; `assessment.service.ts`; `premium-generator.service.ts`; `lib/admin/bulk-importer.ts` | `exam_patterns`, `pattern_sections` | A `/admin/patterns`, `/admin/sections`, …; **S** `/mock-tests`, `/premium` | Working. **Out of GAP2-4 scope** except the optional link in §2 |

**Tags and escapes:**
- **B5** (62 TYPES-1 query escapes, owner GAP2-4):

  | Escapes | File |
  |---|---|
  | 17 | `admin-exam-knowledge.service.ts` |
  | 14 | `exam-syllabus-resolution.service.ts` |
  | 7 | `academic-taxonomy.service.ts` |
  | 5 | operational reconciliation |
  | 3 | onboarding page |
  | 3 | readiness |
  | 3 | auto-reconciliation |
  | 3 | tree importer |
  | 3 | `exam-syllabus.service.ts` |
  | 1 each | candidate service, EK context builder, the two EK actions |

- **B-CURRICULUM-MAPPING** (5 `@ts-expect-error`, coverage service; owner GAP2-4).
- **EKX-221** (`questions.topic_id`, EK context builder).
- **EKC-155** and **ES-33** (`exam_syllabi.subject_id`, the candidate service and the dead `exam-syllabus.service.ts`).

---

## 2. Gap analysis: does the canonical schema support the target?

**Partly.** The three tables exist, with tree integrity (depth and cycle triggers), slug uniqueness and RLS for published reads. These are missing:

| Requirement | Today | Gap |
|---|---|---|
| Lifecycle DRAFT → PUBLISHED → ARCHIVED | `status` CHECK includes `RECONCILED`; no transitions enforced | Drop `RECONCILED`. Add a transition guard (DRAFT→PUBLISHED, PUBLISHED→ARCHIVED only). |
| Published versions immutable | Nothing prevents updates or deletes | Triggers on versions, nodes and mappings reject writes when the version is PUBLISHED or ARCHIVED (except PUBLISHED→ARCHIVED) |
| One live syllabus per exam (and cycle) | None | Partial unique index on `PUBLISHED`, `is_active` |
| Version lineage / audit | None | `version_number`, `supersedes_version_id`, `published_at`, `published_by`, `created_by`, `source_kind`; audit via `admin_audit_logs` |
| Manual authoring | `raw_payload_hash` NOT NULL | Make it nullable (it is set by imports only) |
| Node kinds (paper → section → topic) | None | `node_kind` CHECK `PAPER \| SECTION \| UNIT` (UNIT = leaf topic group) |
| Parent in the same version | Not enforced | Trigger: the parent's `syllabus_version_id` must equal the child's |
| Ordering | `display_order` default 0 | Keep; deterministic tie-break `(display_order, raw_title)` |
| Mapping many-to-many | `UNIQUE(syllabus_node_id)` | Replace with `UNIQUE(syllabus_node_id, canonical_node_id)` |
| Mapping only to TOPIC nodes | Plain FK | GAP2-3 pattern: composite FK `(canonical_node_id, canonical_node_type)` → `canonical_taxonomy_nodes(id, node_type)` + CHECK `canonical_node_type = 'TOPIC'` |
| Optional weightage | Node `weightage_tier` and expected-question range exist | Add an optional `mapping_weight numeric(5,4)` per mapping (share of a node across its topics). Keep the node-level tier. |
| Workflow fields on mappings | `match_status`, `candidate_matches`, `match_confidence`, … (reconciliation) | Keep `match_method` (MANUAL / SUGGESTED_ACCEPTED / LEGACY_MIGRATION); drop proposal-workflow fields at retirement (§6) |
| Write authority | Permissive "full management" policies; grants revoked | Writes **only through SECURITY DEFINER RPCs** that check admin / staff; policies rewritten (§2.3) |

### 2.1 Proposed DDL (not applied; GAP2-4a migration draft)

```sql
-- versions
ALTER TABLE public.exam_syllabus_versions
  ALTER COLUMN raw_payload_hash DROP NOT NULL,
  ADD COLUMN version_number integer,
  ADD COLUMN supersedes_version_id uuid REFERENCES public.exam_syllabus_versions(id) ON DELETE RESTRICT,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'MANUAL'
    CHECK (source_kind IN ('MANUAL','EXAM_KNOWLEDGE_DRAFT','LEGACY_MIGRATION','IMPORT')),
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.exam_syllabus_versions DROP CONSTRAINT exam_syllabus_versions_status_check;
ALTER TABLE public.exam_syllabus_versions ADD CONSTRAINT exam_syllabus_versions_status_check
  CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED'));
ALTER TABLE public.exam_syllabus_versions ADD CONSTRAINT chk_published_has_audit
  CHECK (status <> 'PUBLISHED' OR (published_at IS NOT NULL AND published_by IS NOT NULL));
CREATE UNIQUE INDEX uq_exam_syllabus_one_published
  ON public.exam_syllabus_versions (exam_id, coalesce(exam_cycle_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'PUBLISHED' AND is_active;
CREATE UNIQUE INDEX uq_exam_syllabus_version_number ON public.exam_syllabus_versions (exam_id, version_number);

-- nodes
ALTER TABLE public.exam_syllabus_nodes
  ADD COLUMN node_kind text NOT NULL DEFAULT 'UNIT' CHECK (node_kind IN ('PAPER','SECTION','UNIT')),
  ADD COLUMN description text;
-- trigger fn_guard_exam_syllabus_node_same_version(): parent.syllabus_version_id = NEW.syllabus_version_id

-- mappings
ALTER TABLE public.exam_syllabus_canonical_mappings DROP CONSTRAINT uq_exam_syllabus_canonical_mapping_node;
ALTER TABLE public.exam_syllabus_canonical_mappings
  ADD COLUMN canonical_node_type text,
  ADD COLUMN mapping_weight numeric(5,4) CHECK (mapping_weight IS NULL OR (mapping_weight > 0 AND mapping_weight <= 1));
ALTER TABLE public.exam_syllabus_canonical_mappings ADD CONSTRAINT chk_mapping_topic_only
  CHECK (canonical_node_id IS NULL OR canonical_node_type = 'TOPIC');
ALTER TABLE public.exam_syllabus_canonical_mappings ADD CONSTRAINT exam_syllabus_canonical_mappings_node_fkey
  FOREIGN KEY (canonical_node_id, canonical_node_type) REFERENCES public.canonical_taxonomy_nodes(id, node_type) ON DELETE RESTRICT;
CREATE UNIQUE INDEX uq_syllabus_node_topic ON public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id)
  WHERE canonical_node_id IS NOT NULL;

-- immutability (one guard function per table): reject INSERT/UPDATE/DELETE when the owning version is
-- PUBLISHED/ARCHIVED, except the single transition PUBLISHED → ARCHIVED (is_active false) on the version row.
```

### 2.2 Write path (RPCs, SECURITY DEFINER, `search_path = ''`, each checks `fn_jwt_is_admin_or_staff()` (existing); publish and archive additionally require the JWT admin role; every call audits)

| RPC | Purpose |
|---|---|
| `fn_syllabus_create_draft(p_exam_id, p_exam_cycle_id, p_from_version_id default null)` | New DRAFT. It is empty, or a deep copy of a published version's nodes and mappings. |
| `fn_syllabus_upsert_node(p_version_id, p_node jsonb)` / `fn_syllabus_move_node` / `fn_syllabus_delete_node` | DRAFT only |
| `fn_syllabus_set_mappings(p_node_id, p_topic_ids uuid[], p_weights numeric[] default null)` | Replace a node's mappings atomically; TOPIC-only (FK); DRAFT only |
| `fn_syllabus_validate(p_version_id) returns jsonb` | Validation report (§5.3); read-only |
| `fn_syllabus_publish(p_version_id) returns jsonb` | **Admin only.** Validate → archive the current published version for the same exam/cycle → set PUBLISHED with `published_at` / `published_by` → audit. One transaction; it fails closed on any validation error. |

### 2.3 RLS hardening (in GAP2-4a)
- On the 11 tables listed in §1.1, replace the permissive "full management" policies.
- **Reads:** keep the published-only public read policies; add a staff read policy using `fn_jwt_is_admin_or_staff()` (existing).
- **Writes:** no write policies at all. Writes go only through the RPCs above. Grants stay revoked.
- A test asserts that every write policy on these tables is role-checked (or absent).

---

## 3. Data plan: legacy `exam_topics` → DRAFT version

**The premise needs a ruling (Q1).** The 18 legacy rows are **SSC GD**, not SSC CGL. SSC CGL has no topic-level syllabus to migrate.

**Recommended plan:**
1. **SSC GD (deterministic, idempotent, reviewable).** A one-off migration-runner script creates **one DRAFT** version with:
   - `exam_id` = SSC GD, `exam_cycle_id` = its 2026 cycle
   - `version_tag = 'legacy-official-2026'`, `source_kind = 'LEGACY_MIGRATION'`
   - `raw_payload_hash` = sha256 of the ordered legacy rows

   It builds:
   - **4 SECTION nodes**, one per canonical subject referenced. Title = subject name, slug = subject slug, order = canonical `display_order`.
   - **18 UNIT nodes**, one per `exam_topics` row, under its subject's section. Title/slug from the canonical topic; order = legacy `priority`, then title. `weightage_tier`: high → `HIGH_YIELD`, medium → `CORE`, low → `MODERATE`. `is_mandatory` copied.
   - **18 mappings**, UNIT → its canonical topic, `match_method = 'LEGACY_MIGRATION'`.

   **Idempotent:** it is keyed on `(exam_id, version_tag)` and stops if the version already exists. **Never auto-published:** an admin reviews it and publishes in the UI. A dry-run prints the planned tree (counts and titles of canonical nodes only) for review before the commit.
2. **SSC CGL.** Create **no** draft from legacy data, because none exists. Two options:
   - **(a)** an admin builds a DRAFT in the new editor (4 SECTIONs can be pre-seeded from `pattern_sections`, which are already mapped to the 4 canonical subjects; the topic leaves are authored); or
   - **(b)** a draft-from-Exam-Knowledge assist (§5.5) reads the published CGL `SYLLABUS` document.

   Either way the result stays DRAFT until reviewed.

**Cannot be migrated:**

| Field | Reason |
|---|---|
| `expected_questions` | All 1; a default, not data. Leave `expected_questions_min/max` null. |
| `required_depth` | Constant `INTERMEDIATE_APPLICATION`; it doesn't match the node CHECK vocabulary. Leave null. |
| `priority` | Becomes order only |
| `weightage_override`, `notes` | Empty |
| Paper / tier structure | Absent in the legacy data. GD is single-paper, so no PAPER node. |
| `exam_unit_mappings` | 0 rows; and the target derives unit links, so there is nothing to migrate |

---

## 4. Derived coverage and course read model

**Principle (#15, HOTFIX-2):** values come only from live rows. If a source is missing, the explicit states below apply. Nothing is synthesised.

### 4.1 Read RPC: `fn_exam_syllabus_read_model(p_exam_id uuid, p_exam_cycle_id uuid default null) returns jsonb`
- STABLE, SECURITY INVOKER, so RLS applies: anonymous and students see only PUBLISHED data. A staff variant `fn_exam_syllabus_read_model_staff(p_version_id)` lets the editor preview DRAFTs (admin / staff check).
- **Output:**
  - `{ state, version: {id, tag, number, published_at}, nodes: [...] }`
  - `state` is one of:
    - `NO_SYLLABUS`: no published version for the exam
    - `OK`
    - `UNAVAILABLE`: a read failed, so no figures are returned
  - Each node: `{id, parent_id, kind, title, slug, order, weightage_tier, expected_min, expected_max, topics: [...], counts}`.
  - Each topic: `{topic_id, name, slug, subject_id, weight}`.
  - `counts`: `{ topics, learning_units, published_documents, published_questions, topics_with_documents, topics_with_questions }`, aggregated over the node's subtree.
- **Derivation:**

  | Count | Source |
  |---|---|
  | Topics | mappings (`canonical_node_id`) |
  | Units | `learning_units WHERE topic_id = ANY(topics) AND is_active` |
  | Documents | `learning_documents JOIN document_versions` where servable (same predicate as `LearningResolverService`: `status = PUBLISHED`, current version `is_published` and `review_status = PUBLISHED`, unit active) |
  | Questions | `questions WHERE canonical_topic_id = ANY(topics) AND status = 'published'` |

  PYQ counts come from `question_sources` (`exam_name`, `year`), not from `questions.topic_id` (fixes EKX-221 and the untagged candidate read).
- **Course read model (UX-4):** the same RPC with per-topic document lists comes from `LearningResolverService.resolveForTopics(topicIds)` in one batch query. Course = the published syllabus tree, and topic pages = mapped topics. `courses` / `course_modules` stay dormant.
- **Performance:**
  - Data is small: a syllabus is ~10²–10³ nodes; 36 topics today.
  - One recursive CTE over the version's nodes, plus 3 grouped aggregates keyed by topic id. Verified indexes: `questions(canonical_topic_id)` (`idx_questions_topic`), `learning_units(topic_id, display_order) WHERE is_active`, `learning_documents(learning_unit_id)`. Add `exam_syllabus_canonical_mappings(syllabus_node_id)`, which is implicit in the new unique index.
  - Cache at the page level (ISR / `revalidate`, about 1 h) for public exam hubs.
  - No N+1: services call the RPC once per page.
- **Consumers:**
  - the student exam hub syllabus section
  - the course path (UX-4)
  - `/admin/content` coverage (replaces `getCurriculumCoverageMatrix` and removes B-CURRICULUM-MAPPING)
  - the authoring queue (gaps = mapped topics without documents / questions)
  - exam readiness
  - the question-factory prompt context
  - the AI curriculum context

---

## 5. Admin workflow design

### 5.1 Pages (admin / staff; SEC-1C guards)

| Page | Contents |
|---|---|
| `/admin/exams/[id]/syllabus` | Version list (DRAFT / PUBLISHED / ARCHIVED, number, tag, published by and at) and actions: **New draft (empty)**, **New draft from published**, **Open**, **Archive** (admin) |
| `/admin/exams/[id]/syllabus/[versionId]` | **Editor.** Tree on the left (add / rename / move / reorder / delete within DRAFT; kinds PAPER / SECTION / UNIT). Detail on the right: weightage tier, expected range, mandatory flag, and the **topic picker**. Validation panel; **Publish** (admin only) |
| Topic picker | Search canonical TOPIC nodes (name, slug, aliases via `taxonomy_aliases`); filter by subject; multi-select; optional weights. Shows each topic's live counts (documents / questions) from the read model. Creating new canonical topics is **not** done here; it belongs to `/admin/taxonomy` (GAP2-1b). |

Published versions open **read-only**.

### 5.2 Edit model
- Every edit is an RPC (§2.2). Optimistic UI with server confirmation.
- Concurrency: the version row's `updated_at` is used as a precondition (409 on conflict).

### 5.3 Validation (`fn_syllabus_validate`), required for publish

| Rule | Kind |
|---|---|
| At least one node | Error |
| Every **leaf** (UNIT) node maps to at least 1 TOPIC | Error |
| Non-leaf nodes have no direct mappings, or they are explicitly allowed (Q3) | Error |
| No cycles, and parents in the same version | Guaranteed by triggers |
| No duplicate topic within the same SECTION | Error; the same topic in two SECTIONs is a warning |
| Mapping weights per node sum to 1 when any weight is set | Error |
| Canonical topics active | Error |
| `expected_min ≤ expected_max` | Error |
| Report: unmapped canonical topics of the subjects in use ("orphan topics") and topics with 0 documents / questions | **Warning**, not a block |

### 5.4 Publish and new version
- Publish is atomic and immutable afterwards (§2.2): an `admin_audit_logs` row records the version id, the previous published version and a counts snapshot.
- "New version from published" deep-copies to a DRAFT with `supersedes_version_id`.
- Students keep seeing the previous published version until the new one is published.

### 5.5 Optional draft-from-Exam-Knowledge assist (design only)
- This is the content-factory pattern already used by QF-1 and Exam Knowledge.
- **Steps:**
  1. Build a prompt from the published `SYLLABUS` / `EXAM_PATTERN` documents plus the canonical topic list.
  2. An external AI returns a JSON tree of `{kind, title, topic_slugs[]}`.
  3. **The importer validates it:** schema check; unknown slugs are rejected, never created; size limits.
  4. A DRAFT version is created with `source_kind = 'EXAM_KNOWLEDGE_DRAFT'` and `source_document_id`.
  5. A human reviews it in the editor and publishes.
- The AI never writes canonical topics and never publishes.

---

## 6. Reconciliation workbench: retire it (recommended)

**What exists.** The Phase 3R workbench (`/admin/syllabus-reconciliation`, operational / readiness / resolution services, 5 API routes):
- matches raw imported syllabus nodes to canonical nodes
- lets reviewers create canonical nodes, subjects, subtrees and aliases from syllabus work

**Recommendation: retire, not replace.**
1. **Superseded.** The target workflow (§5) authors the tree directly against canonical TOPIC nodes with a picker. Nothing raw needs reconciling.
2. **Dead upstream.** The only creators of versions and nodes (the tree importer and the auto-matcher) have no runtime callers, and the tables are empty.
3. **Wrong authority.** It creates canonical taxonomy nodes from syllabus work. Canonical edits belong to the taxonomy admin (GAP2-1b) with its rules. Its atomic subtree path needed a direct DB connection (HOTFIX-3, #38).
4. **Cost.** 62 B5 escapes sit mostly in these files.

**What to keep.** The `reconciliation-normalizer` matching logic, as a pure **"suggest topics"** helper behind the picker (read-only, no writes).

**Retirement:** remove the page, the API routes, and the operational / readiness / resolution / auto-reconciliation / tree-importer services and their tests (GAP2-4c). `match_status` / `candidate_matches` / `reconciliation_metadata` are dropped in the contract step.

---

## 7. Re-pointing and retirement plan

Order: **expand → deploy → contract** (post-launch rule; #21 retirement mechanics as in GAP2-2b).

| Reader / writer | Action | Phase |
|---|---|---|
| Student exam hub (`getExamKnowledgeCandidateView`) | Syllabus and curriculum from `fn_exam_syllabus_read_model`. Patterns via `exam_cycle_id` (drop the `exam_sections` embed). PYQ counts from `question_sources`. Explicit `NO_SYLLABUS` state. Fixes EKC-155 and the untagged `questions.topic_id`. | 4b |
| `services/exam-syllabus.service.ts` (DEAD, ES-33) | Delete | 4c |
| Onboarding `saveSyllabusProjection` / onboarding page | Replace with "create DRAFT syllabus" (`fn_syllabus_create_draft` + set mappings), linking to the editor | 4b |
| `exam-readiness.service.ts` | "Has a PUBLISHED syllabus version" + read-model counts | 4b |
| Onboarding context builder (`cycle_name`, `exam_topics.exam_id`) | Read model | 4b |
| EK context builder (EKX-221, `exam_patterns.category_id`) | `questions.canonical_topic_id` + `question_sources`; patterns by cycle | 4b |
| Question factory context (`exam_syllabi` / `exam_topics`) | Read model (published topics) | 4b |
| Curriculum coverage matrix / quality metrics | Rebuild on the read model; remove the HOTFIX-2 UNAVAILABLE path for exams with a published syllabus; **remove B-CURRICULUM-MAPPING** | 4b |
| **`mapUnitToExam`** + `mapUnitToExamAction` | **Delete.** Unit ↔ exam is derived (unit.topic_id ∈ the exam's mapped topics), and no mapping store exists by design. | 4b |
| Content studio `getAcademicHierarchy` / `getLearningUnitDetail` exam badges | Derived from the read model | 4b |
| AI curriculum context builder | Read model | 4b |
| `exam-onboarding.service` deletion paths + `fn_delete_exam_controlled` | Delete the exam's syllabus versions (DRAFT only; PUBLISHED blocks deletion) instead of `exam_syllabi` / `exam_topics` | 4b (RPC change) |
| Reconciliation workbench (§6) | Remove | 4c |
| `academic-taxonomy.service.ts` (DEAD at runtime, 7 escapes) | Delete, or move to `scripts/` if still used by suites | 4c |

**#21 retirement of `exam_syllabi`, `exam_topics`, `exam_unit_mappings`** (GAP2-4c), following the GAP2-2b pattern:
1. Confirm zero runtime readers (a static test plus the select audit).
2. Backup.
3. Migration `ALTER TABLE … SET SCHEMA retired`, including dependent FKs and policies; the `exam_unit_mappings` → `exam_topics` → `exam_syllabi` chain moves together.
4. Rollback script.
5. Regenerate types.
6. `test_types1_close` and the select audit must show no `exam_syllabi` / `exam_topics` / `exam_unit_mappings` / `exam_topic_mappings` references.
7. The architect confirms.

Drop the reconciliation columns from mappings in the same contract migration.

---

## 8. Proposed Stage-2 phases

| Phase | Scope | Tests | Hard stops | Removes |
|---|---|---|---|---|
| **GAP2-4a: schema, RPCs, read model, migration** | DDL (§2.1), immutability and same-version triggers, write RPCs (§2.2), read-model RPC (§4.1), RLS hardening on 11 tables (§2.3), SSC GD legacy → DRAFT migration script (§3) with dry-run, regenerated types | DB suite in `BEGIN … ROLLBACK`: lifecycle transitions; publish atomicity (forced failure → no change); immutability (each write on PUBLISHED rejected); one-published rule; TOPIC-only FK; many-to-many; same-version parent; validation rules; read-model states and counts vs hand-computed fixtures; **no fabricated values** (failure → `UNAVAILABLE`); RLS (anon / student see only PUBLISHED; student writes rejected); migration idempotent and never PUBLISHED; `test_no_runtime_db` | Any existing published data affected (there is none); RLS hardening breaks an admin page (smoke); migration not idempotent | Permissive policies; `RECONCILED` |
| **GAP2-4b: authoring UI and re-pointing** | Syllabus pages and editor (§5), topic picker (with suggest helper), onboarding re-point, student hub re-point, readiness / QF / EK / AI / content-studio / coverage re-point, `mapUnitToExam` deletion, exam deletion RPC update | Editor E2E as qa-admin / qa-staff on a local build (create → map → validate → publish → new version); student hub shows the published syllabus or `NO_SYLLABUS`; coverage equals the read model; select audit clean for the re-pointed files; signed-in smokes; SEC-1B/1C/1D | > 15 Class B surfaced; any student page regresses; publish not atomic | **B-CURRICULUM-MAPPING (5 directives)**, EKC-155, EKX-221, the untagged `questions.topic_id`, most B5 escapes in re-pointed files |
| **GAP2-4c: retirement** | Remove the reconciliation workbench, dead services and their tests; #21 move of the legacy tables to `retired`; drop reconciliation columns | Static: no legacy references; select audit; ratchet (B5 → 0 or documented remainder); `test_types1_close`; rollback rehearsal on backup | Any runtime reader left; rollback fails | Remaining B5 escapes (target: B5 removed from the ratchet), ES-33 |

**Dependencies:**
- UX-4 (courses) needs 4a + 4b.
- UX-2 can link the exam hub syllabus after 4b.
- SSC CGL content needs an authored and published CGL syllabus (an owner / content task after 4b).

---

## 9. Open questions for the architect (8, each with a recommendation)

1. **Legacy data is SSC GD, not SSC CGL.** Migrate the 18 rows into an **SSC GD** DRAFT, and create CGL's draft by authoring (or the EK assist)?
   *Recommended: yes.* Migrating GD topics into CGL would invent a syllabus for the wrong exam (#15). For CGL, pre-seed the 4 SECTION nodes from `pattern_sections` and author the topics.
2. **Node kinds and depth:** a fixed PAPER → SECTION → UNIT model, or free depth?
   *Recommended:* three kinds, any depth ≥ 1. PAPER optional (single-paper exams start at SECTION). Only UNIT leaves carry mappings.
3. **Mappings on non-leaf nodes:** allowed?
   *Recommended: no.* Mappings only on leaves; coverage rolls up. This keeps "every leaf mapped" meaningful.
4. **Version scope:** per exam, or per exam + cycle?
   *Recommended:* per exam with an optional `exam_cycle_id`; at most one PUBLISHED active per (exam, cycle-or-none). A new cycle usually reuses the published syllabus until a change is needed.
5. **Weightage:** node-level tier, mapping weight, or both?
   *Recommended:* the node-level `weightage_tier` + expected-question range for students; an optional `mapping_weight` only for analytics (sums to 1 when used).
6. **Who publishes?**
   *Recommended:* staff create and edit DRAFTs; **only admins publish or archive** (SEC-1D pattern).
7. **Reconciliation workbench:** retire (§6)?
   *Recommended: retire in GAP2-4c.* Keep the normalizer as a read-only "suggest topics" helper.
8. **RLS hardening of the 11 permissive policies:** in GAP2-4a, or a separate SEC phase sooner?
   *Recommended:* a small SEC hotfix **before** GAP2-4a for the 11 tables (policies only; grants already block writes). GAP2-4a then builds on the hardened baseline.

## 10. Architect approval (2026-10-16)

**Stage 1 is APPROVED.**
- **Q1:** approved earlier.
  - The 18 legacy rows become an **SSC GD** DRAFT version, never auto-published.
  - SSC CGL is built fresh: SECTION nodes come from its exam pattern, and topics are drafted with Exam Knowledge assistance (content-factory pattern), then human-reviewed, then published.
- **Q2–Q8:** the recommendations are accepted as written. Q8 is done by SEC-HOTFIX-4 (076).
- **The 10-point DDL (§2.1) is accepted, with these additions:**
  1. **Write RPCs:** every one is `SECURITY DEFINER`, with an explicit role check, a fixed `search_path`, and an **audit row written in the same transaction**.
  2. **Roles:** staff edit DRAFTs; **only admins publish or archive**.
  3. **Publish validation:**
     - every UNIT is mapped;
     - mapped topics are active TOPIC nodes;
     - no SECTION is empty;
     - weights are valid (in (0, 1], and summing to 1 per node when used).
  4. **Student read model:** PUBLISHED versions only, with explicit empty and unavailable states (never fabricated).
- **Sequencing:** GAP2-4a is built **after UX-1**.
