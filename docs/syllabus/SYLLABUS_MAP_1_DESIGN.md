# SYLLABUS-MAP-1: shared master tree + per-exam mapping (Phase A: inspection and design)

- **Date:** 2026-11-12.
- **Status:** design only. No code, no migrations and no DB writes. The DB was read once, in a read-only transaction that was rolled back, with masked output.
- **Owner decision (locked):** lessons and outlines live **once** on the master tree (subject → topic → subtopic, exam-neutral). An exam intake declares only:
  - the pattern;
  - the master nodes it uses;
  - per-exam weightage;
  - truly new nodes, which go to a review queue.

  Non-written stages (PET, PST, Medical, DV) are **not** syllabus: they become a structured "Selection process" section on the exam info page. The design must scale to 50+ exams.
- **Trigger:** the SSC GD 2026 intake failed:
  - about 3,500 items against the 1,000 cap, because outline lines count as items;
  - 2 outlines were over 30 lines;
  - PET, PST, Medical and DV were entered as papers;
  - the English OR Hindi section cannot add up to the paper total.

---

## 1. Inspection findings

### 1.1 Intake today (SYLLABUS_INTAKE v3)

| Piece | Where | Facts |
|---|---|---|
| Contract and validator | `lib/syllabus/intake-contract.ts` | v3 / v3.1 / v3.2. Strict JSON: PAPER → SUBJECT → TOPIC → SUBTOPIC → CONCEPT; v2 still accepted.<br>Caps: `INTAKE_MAX_ITEMS = 1000`, `INTAKE_MAX_BYTES = 256 KB`, `INTAKE_OUTLINE_MAX = 30` lines per subtopic, 10 aliases, 50 headings.<br>**The cap counts every item at every level, and each outline line becomes one EXPANDED CONCEPT item** (v3.2, lines 366–371). That is why GD reached ~3,500.<br>Sum checks between subjects and the paper are **warnings** only (v3.1), and there is no notion of alternative sections. |
| Prompt | `lib/syllabus/intake-prompt.ts`, `lib/syllabus/syllabus-template-v3.ts` | One prompt asks the AI for the whole exam tree **including outlines**, so every exam re-sends the master content. |
| Matcher | `lib/syllabus/tree-matcher.ts` | Pure and deterministic, level by level under the matched parent. One normalization (`lib/taxonomy/normalize.ts` = `fn_taxonomy_normalize`). |
| Staging | migration 116 (`syllabus_intake_sessions`, `syllabus_intake_items`, `fn_syllabus_intake_create`); 124 INTAKE-ASSIST-1 | Each item gets a `match_status` (EXACT / ALIAS / CLOSE / NEW / NOT_APPLICABLE) and ≤ 3 candidates. The owner decides each item: LINK / ALIAS / APPROVE_NEW / IGNORE / **OUTLINE** (124), with bulk steps and undo (`fn_syllabus_intake_bulk`, `_bulk_undo`). Every decision is audited; the DB refuses EXACT / ALIAS claims that are not under the matched parent. |
| Import | `fn_syllabus_intake_import` (116, extended in 124) | Writes **one DRAFT** `exam_syllabus_versions` row: PAPER and SECTION nodes, a UNIT per topic, and mappings to master nodes. **OUTLINE items are written into the unit's `metadata.outlines[<subtopic node id>].items`** (per exam). |
| Review and publish | `app/(site)/admin/syllabus/intake/[id]`, `app/(site)/admin/syllabus/[id]`, `lib/syllabus/publish-impact.ts`, migration 125 PUBLISH-CONFIRM-SERVER | The existing editor publishes after a server-side confirmation that shows the impact. PUBLISHED versions are immutable (078 `SYLLABUS_IMMUTABLE`): they can only be archived. Only one PUBLISHED version per exam and cycle (`uq_exam_syllabus_one_published`). |
| Older map importer | `lib/syllabus/import-contract.ts` + `fn_syllabus_import_draft` (086, `docs/syllabus/IMPORT_CONTRACT.md`, contract v1) | Already imports **PAPER → SECTION → UNIT + unit → master topic mappings** and **never creates nodes**. It is the closest thing to the requested EXAM_MAP. |

### 1.2 Tables: the per-exam mapping already exists (reuse it, never build a parallel tree)

| Need | Existing table / column |
|---|---|
| Master nodes | `canonical_taxonomy_nodes`: SUBJECT / TOPIC / SUBTOPIC / CONCEPT. It has `name`, `name_hi`, `slug`, `hierarchy_path`, `display_order`, `is_active`, `is_internal` (122) and `metadata`, which holds `lesson_at_topic` (SEO-TOPIC-CANON-1), `content_source`, `merged_into` and `source`. The trigger `trg_guard_master_tree` (115) limits depth to 4 and refuses a name or alias that clashes with a sibling. |
| Aliases | `taxonomy_node_aliases` (115): `alias`, `normalized_alias`, `language` en/hi, `source` OWNER/INTAKE/IMPORT. Unique per node and normalized alias. |
| Lessons | `learning_documents.node_id` (119, NODE_LESSON) on master nodes; versions in `document_versions` (BLOCKS). |
| Exam map version | `exam_syllabus_versions`: `exam_id`, `exam_cycle_id`, `tier` (116), `version_number`, `status` DRAFT/PUBLISHED/ARCHIVED, `source_kind`, `metadata`, publish audit columns. |
| Exam pattern and weightage | `exam_syllabus_nodes`: `node_kind` PAPER / SECTION / UNIT (078); `raw_title`; `weightage_tier`; `expected_questions_min/max`; `required_cognitive_depth`; `metadata` (116), which holds `marks`, `questions`, `avg_questions`, `duration_minutes`, `negative_marking`, `uncertain` and `outlines`; plus `origin`, `avg_questions`, `duration_minutes` and `negative_marking` columns from 119. |
| Exam node → master | `exam_syllabus_canonical_mappings`: `canonical_node_id` + `canonical_node_type` TOPIC / SUBTOPIC / CONCEPT (116), `rollup_topic_id` / `topic_id`, `match_status`, `match_method`, `mapping_weight`, `candidate_matches`, `reviewed_by/at`. |
| Public read | `fn_exam_syllabus_read_model` (079 and later), `fn_exam_course_outline`: **PUBLISHED versions only**. Drafts are never visible to candidates. |
| SEO | Master URLs `/learn/<path>`, `/exams/<exam>/<path>` (`lib/learn/paths.ts`); `lesson_at_topic` 308 rules (`lib/learn/topic-canon.ts`). |

**Conclusion:** the model the owner chose is already the model in the database. The master tree holds the content, and `exam_syllabus_*` is each exam's map with its weightage. What is wrong is the **intake**: one contract mixes master content (outlines) with the exam map. And outlines are stored **per exam** (in unit metadata), not on the master.

### 1.3 How SSC CGL is stored (live read, 2026-11-12)

- **Master:** 4 subjects, 63 topics (4 of them internal catch-alls) and 147 subtopics, all active. **No duplicates:** no two active siblings share a normalized name, and no topic or subtopic name repeats across parents. There are 8 aliases (en, source INTAKE).
- **CGL map:** version 4, `tier-1`, PUBLISHED, from IMPORT. It has 1 PAPER, 4 SECTION and 59 UNIT nodes. Each unit has `weightage_tier`, `avg_questions` and `outlines`. There are **147 mappings, all to SUBTOPIC nodes (MANUALLY_MAPPED)**. Versions 1–3 are ARCHIVED.
- **Outlines:** **512 outline lines** are stored in CGL's unit metadata, keyed by master subtopic id. They are the only master content held per exam. The lesson generator reads them with `mustCoverFor()` (`services/lessons/lesson-authoring.service.ts:160`): PUBLISHED versions first, then DRAFTs.
- **Intake history:** one IMPORTED session (v3, 723 items).
- **SSC GD** (`ssc-gd-constable`, inactive) has one DRAFT version 1 (LEGACY_MIGRATION, 22 nodes).
- The 20 exams in `exams` are all inactive except `ssc-cgl`.

### 1.4 Exam info and hub data (for "Selection process")

- `exam_knowledge_documents` / `exam_doc_versions` (054) are the exam info modules. `services/exam-knowledge/exam-module-registry.ts` already defines the modules **"Selection Process & Recruitment Stages"** and **"Physical Standards & Medical Requirements"** (PET/PST). They are **prose** (MDX / blocks), not structured data.
- `exam_node_notes` (122, EXAM_NOTE template 127): per exam, per master node notes.
- `exam_categories` (128): hub tiles.
- `exam_cycles` (`cycle_year`, `status`): **has no metadata column**.
- There is no structured selection-stage data anywhere today.

### 1.5 Matching today

1. **Exact:** the normalized name or Hindi name under the matched parent.
2. **Alias:** a node alias, or an item alias equal to a node name.
3. **CLOSE:** bigram Dice ≥ 0.55, or every word of the shorter name in the longer; at most 3 **suggestions**.
4. **NEW:** no match.

Children of a non-matched item only get suggestions. **Nothing is ever auto-created:** an APPROVE_NEW is an explicit owner decision. There is no matching by slug or path.

---

## 2. Design

### A. Data model: the smallest change to existing tables

No new tree and no new exam tables. `exam_syllabus_versions`, `exam_syllabus_nodes` and `exam_syllabus_canonical_mappings` stay the per-exam map.

| # | Change | Why |
|---|---|---|
| A1 | **New table `taxonomy_node_outlines`**: `node_id` (PK, FK `canonical_taxonomy_nodes`, TOPIC / SUBTOPIC only), `items text[]` (1–30 lines, each 1–200 characters), `source` (MASTER_INTAKE / MIGRATED_FROM_EXAM / OWNER), `updated_at`, `updated_by`; RLS admin-only; written only by an audited `fn_` | Outlines live once on the master. JSON in `metadata` could not enforce the 30-line and line-length limits, and history goes to `admin_audit_logs`. *Alternative: `canonical_taxonomy_nodes.metadata.outline` (no table) — see Q2.* |
| A2 | **`exam_syllabus_nodes.choice_group text NULL`** (SECTION only; format `^[a-z0-9-]{1,40}$`) and `exam_syllabus_versions.metadata.choice_groups = { "<group>": { "pick": 1, "label": "Language" } }` | Alternatives such as "English OR Hindi". The validator sums the sections **outside** groups, plus **one** member per group (every member must have equal questions, marks and time). |
| A3 | **New table `exam_selection_stages`**: `exam_id`, `exam_cycle_id NULL`, `position`, `stage_kind` (CBT / WRITTEN / TYPING / SKILL / PET / PST / MEDICAL / DV / INTERVIEW / OTHER), `name`, `nature` (QUALIFYING / MERIT), `paper_node_ref NULL` (links the written stage to its PAPER), `details jsonb` (e.g. PET distances and times per gender, plain values), `status` DRAFT/PUBLISHED, published audit columns | A structured "Selection process" for the exam info page. It is cycle-specific but spans tiers, which is why it is not on the syllabus version. *Alternatives: Q4.* |
| A4 | `exam_syllabus_canonical_mappings`: **no change** | Already TOPIC / SUBTOPIC / CONCEPT, with `match_status`, `match_method` and `mapping_weight`. |
| A5 | `canonical_taxonomy_nodes`: **no change** | Slug, path, `name_hi`, aliases and `metadata` already exist. |

**Read path change (B3):** `mustCoverFor(node)` reads `taxonomy_node_outlines` **first**. It falls back to the unit `metadata.outlines` only until B3 has moved them, and the fallback is then removed.

### B. Two contracts (replacing v3 for new work; v3 stays readable for old sessions)

**B1. `MASTER_INTAKE v1`**: adds or extends master nodes. Chunked **per subject**.

```json
{ "contract": "MASTER_INTAKE", "contract_version": 1, "subject": "english-comprehension",
  "based_on": "SSC / Railways / Banking English syllabi 2023–2026",
  "nodes": [
    { "ref": "english-comprehension.antonyms", "name": "Antonyms", "level": "TOPIC" },
    { "ref": "english-comprehension.antonyms.opposite-word-meaning", "level": "SUBTOPIC",
      "outline": ["Direct antonyms", "Prefix antonyms (un-, in-, dis-)", "…"] },
    { "new": true, "parent_ref": "english-comprehension", "level": "TOPIC", "name": "Sentence Rearrangement",
      "name_hi": "वाक्य पुनर्व्यवस्था", "aliases": ["Para jumbles"],
      "subtopics": [{ "name": "PQRS Sequencing", "outline": ["…"] }] } ] }
```

- **Items = nodes** (≤ 1,000 per file). **Outline lines do not count as items.** They have their own caps: ≤ 30 per node, ≤ 200 characters per line, and the file must stay ≤ 256 KB.
- **Idempotent upsert:**
  - Existing nodes are addressed by `ref` (the hierarchy path, i.e. the canonical slug path).
  - New nodes go through the matcher (§C) and become **review items**.
  - Re-running the same file changes nothing (outline equal → no-op; no duplicate node, because the slug is unique under the parent).
- A different outline for an existing node is a **review item** ("replace outline"), never a silent overwrite.

**B2. `EXAM_MAP v1`**: replaces SYLLABUS_INTAKE v3 for new exams. **No outlines, no lesson content.**

```json
{ "contract": "EXAM_MAP", "contract_version": 1, "exam": "ssc-gd-constable", "cycle_year": 2026, "tier": null,
  "based_on": "SSC GD Constable 2026 notice", "source_url": "https://…", "as_of": "2026-11-01",
  "papers": [{ "name": "Computer Based Examination", "questions": 80, "marks": 160, "duration_minutes": 60,
    "negative_marking": "0.25 per wrong answer",
    "choice_groups": [{ "id": "language", "label": "English or Hindi", "pick": 1 }],
    "sections": [
      { "name": "General Intelligence and Reasoning", "questions": 20, "marks": 40,
        "map": [{ "ref": "reasoning.analogy", "weightage_tier": "CORE", "avg_questions": 3 }, "…"] },
      { "name": "Elementary Mathematics", "questions": 20, "marks": 40, "map": ["…"] },
      { "name": "General Knowledge and General Awareness", "questions": 20, "marks": 40, "map": ["…"] },
      { "name": "English Language", "choice_group": "language", "questions": 20, "marks": 40, "map": ["…"] },
      { "name": "Hindi Language", "choice_group": "language", "questions": 20, "marks": 40,
        "map": [{ "new": true, "level": "TOPIC", "parent_ref": "hindi", "name": "संधि", "name_en": "Sandhi" }] } ] }],
  "selection_process": [
    { "stage": "CBT", "name": "Computer Based Examination", "nature": "MERIT", "paper": "Computer Based Examination" },
    { "stage": "PET", "name": "Physical Efficiency Test", "nature": "QUALIFYING",
      "details": { "male": "5 km in 24 minutes", "female": "1.6 km in 8.5 minutes" } },
    { "stage": "PST", "name": "Physical Standard Test", "nature": "QUALIFYING" },
    { "stage": "MEDICAL", "name": "Detailed Medical Examination", "nature": "QUALIFYING" },
    { "stage": "DV", "name": "Document Verification", "nature": "QUALIFYING" } ] }
```

- **Map entries:** `ref` (path), or `name` / `aliases` resolved by §C; plus per-exam `weightage_tier`, `avg_questions` and optional `origin`.
- **Unit grouping** is implied by the section, so one unit per mapped topic, as CGL does today.
- **`new: true` entries** are never created by the import. They become **master review items** (the same queue as MASTER_INTAKE), and their outlines come later through the master-gap prompt.
- **Hard validation errors** (no longer warnings):
  - (a) the sections outside groups plus one member per group must sum to the paper's questions and marks;
  - (b) every member of a group must have equal questions, marks and time;
  - (c) a `stage` of PET / PST / MEDICAL / DV / INTERVIEW / TYPING / SKILL **must not** appear as a paper;
  - (d) a `paper` must have ≥ 1 section with ≥ 1 map entry;
  - (e) any `outline` key is an error ("outlines belong to MASTER_INTAKE");
  - (f) the Σ `avg_questions` of a section stays within ±20 % of its questions. This one is a warning.
- **Items = sections + map entries** (≤ 1,000). A large exam is far below the cap: GD is about 4 sections × 25 entries.

### C. Matching rules (`lib/syllabus/tree-matcher.ts`, extended, still pure)

1. **`ref` / path:** an exact `hierarchy_path` among active nodes → linked. A `ref` to an inactive or merged node → follow `metadata.merged_into` once, else a review item.
2. **Exact:** the normalized name or `name_hi` under the matched parent → linked.
3. **Alias:** the node alias (en / hi), or an item alias equal to a node name → linked.
4. **Fuzzy:** at most 3 **suggestions** (the existing CLOSE rule, threshold 0.55, plus "words contained"). Never linked automatically and **never created on fuzzy**. The admin confirms in review.
5. **Unknown** (nothing similar, or `new: true`) → a "NEW" **review item**. Never a silent create.

The scope stays "under the matched parent". An EXAM_MAP entry's parent is the master **subject** of its section, which the reviewer confirms once per section.

### D. Review UX in admin (reuse `/admin/syllabus/intake/[id]`)

- **Map preview** per section: counts by state and colour (`matched by ref`, `matched`, `alias-matched`, `suggested`, `new`), then a list. A suggested item shows its ≤ 3 candidates with the path and current lesson state (from `listNodeLessonStatus`).
- **Pattern panel:** papers and sections with their sums; choice groups shown as "English **or** Hindi (pick 1)"; the sum check is green or red and blocks import while red.
- **Per-exam weightage edit:** `weightage_tier` and `avg_questions` per map entry, inline. This is the exam's own data and never touches the master.
- **New nodes:** routed to the **master review queue** (one queue for both contracts). Approving one creates the master node through the existing audited path (`fn_syllabus_intake_decide` APPROVE_NEW); the outline can follow via MASTER_INTAKE.
- **Selection process panel:** the stages in order with qualifying or merit, and a preview of the exam-info section.
- **Import then publish:** "Create draft map" writes a DRAFT version, and publish uses the existing PUBLISH-CONFIRM-SERVER impact screen. **Drafts are never visible to candidates:** public reads use PUBLISHED only (`fn_exam_syllabus_read_model`), and the selection stages are published with the version (status DRAFT → PUBLISHED).

### E. Migrating existing CGL data (no data loss, no duplicates, URLs unchanged)

1. **Nothing in the CGL map changes.** Version 4 stays PUBLISHED (it is immutable anyway), with the same nodes, mappings and weightage.
2. **Copy the outlines to the master:** the 512 lines in the CGL unit `metadata.outlines[<subtopic id>]` are copied to `taxonomy_node_outlines(<subtopic id>)`, de-duplicated and in order, ≤ 30 per node, with source `MIGRATED_FROM_EXAM`. It is one audited `fn_`, idempotent: a second run is a no-op.
   - Before: backup, dry-run and a count check (Σ lines per node equal before and after).
   - The CGL unit metadata is **left as is**: no edit of published content.
3. **Read-path switch:** `mustCoverFor` reads the master outline first. A gate proves that the lesson prompt for every CGL subtopic is byte-identical before and after.
4. **URLs and SEO:** untouched. No master node is renamed, moved or created, and the `lesson_at_topic` 308 rules are unchanged. The SEO-TOPIC-CANON-1 gate stays green.
5. The legacy unit-metadata fallback is removed one release after B3 is verified in production.

### F. Generation prompts

**F1. "Master gap" prompt** (input: the subject's current master list = paths + names + aliases + whether it has an outline; output: MASTER_INTAKE v1 only):

> You are given the CURRENT master list for one subject. Output ONLY what is missing: new topics or subtopics that competitive exams such as SSC, Banking and Railways actually ask, and outlines for listed nodes that have none. Never repeat a listed node, never rename one, never output an exam name, pattern, marks or weightage. Each outline ≤ 30 short lines, exam-neutral. If a candidate node is a synonym of a listed one, output it as an alias of that node, not as a new node.

**F2. "Exam map" prompt** (input: the exam notice + the master path list; output: EXAM_MAP v1 only):

> Declare the exam's pattern (papers, sections, questions, marks, time, negative marking), map every section to master nodes by their path, and give per-exam weightage_tier and avg_questions. Do NOT write outlines or lesson content. Use `new: true` only when no listed node covers the item. List physical, medical and document stages under selection_process, never as papers. Sections that a candidate chooses between share one choice_group.

**Negative examples (the GD failure), included in F2:**
- ✗ `{"papers":[{"name":"Physical Efficiency Test (PET)", …}]}` → ✓ a `selection_process` stage `PET`, `QUALIFYING`.
- ✗ `{"name":"English/Hindi","questions":20}` combined, or English 20 **and** Hindi 20 summed to 100 → ✓ two sections in `choice_group: "language"`, which sum to 80.
- ✗ a subtopic with a 45-line `outline` inside the exam map → ✓ no outline in EXAM_MAP; the master-gap prompt writes ≤ 30 lines once.
- ✗ re-sending all of English with outlines for every exam (≈ 3,500 items) → ✓ `ref`s to existing master paths (≈ 100 items).

### G. Phase plan (each phase: branch, offline list, owner "release"; DB writes only with a backup, one TLS check and a dry-run)

| Phase | Scope | Tests (offline + live, negative controls) |
|---|---|---|
| **B1** schema + validators | Migration: `taxonomy_node_outlines` + `fn_taxonomy_outline_set` (audited, admin); `exam_syllabus_nodes.choice_group`; `exam_selection_stages` + `fn_selection_stages_*`; RLS; SECDEF allow-list. Validators: `lib/syllabus/master-intake-contract.ts`, `lib/syllabus/exam-map-contract.ts` (pure). | Valid and invalid fixtures for each rule; choice-group sums (pass; fail when the members differ; fail when summed twice); stage-as-paper refused; outline in EXAM_MAP refused; outline > 30 lines refused; item counting (outline lines are not items); the existing v3 validator unchanged; live RLS (student and staff denied, admin allowed); **unrelated tables unchanged** (taxonomy-link snapshot, CA-1 L-01). |
| **B2** importer + review UI | `fn_master_intake_*` and `fn_exam_map_*` on the existing session/item tables (a new `contract` column) or a sibling session kind; the matcher ref step; map preview, weightage edit, selection panel; publish via 125. | **Idempotency:** the same file twice gives 0 new rows. **Duplicate run** in parallel: one wins, no duplicate node (unique slug). **Alias match** links. **Fuzzy never auto-creates:** a CLOSE item stays undecided and the import is refused until it is decided. `new` creates a node only on APPROVE_NEW. **Drafts isolated:** an anon or student read of a DRAFT map or selection stages returns nothing. Every decision has an audit row. |
| **B3** CGL migration | Outlines → `taxonomy_node_outlines` (§E); `mustCoverFor` switch. | Line counts before = after per node; the lesson prompt byte-identical for all 147 subtopics; CGL v4 rows unchanged (hash of the nodes and mappings); a second run is a no-op; SEO-TOPIC-CANON-1 and the sitemap unchanged; backup + dry-run first. |
| **B4** GD import | F1 for the gaps (Hindi subject: TAXONOMY-HINDI-1), then F2 for GD 2026; review; publish; selection stages on the exam info page. | Pattern sums with the language group (80 Q / 160 marks); PET/PST/Medical/DV only as stages; the GD map refs resolve to CGL's shared nodes (no duplicate English topics); the exam-info section renders the stages; the CGL map and lessons unchanged. |

## 3. Risks

1. **Shared-outline conflicts:** a second exam may want a different outline for the same master node. Owner rule: the master outline is a superset that serves the deepest exam; differences go to EXAM_NOTE. The review shows a "replace outline" diff.
2. **Fuzzy over-matching:** "Analogy" (reasoning) versus "Analogy" (verbal) under the wrong subject. The parent scope (the section's subject) and owner confirmation prevent this; there are no auto-links.
3. **Hindi subject:** GD needs a Hindi master subject (backlog TAXONOMY-HINDI-1) before B4. It is new master content and needs owner review.
4. **Migration read-path:** if the switch shipped before the copy, lesson prompts would lose their MUST COVER lines. Follow DEPLOY-BEFORE-ACTIVATE order: the copy first, then the code switch, with the fallback kept for one release.
5. **Selection-stage details** (PET numbers by gender) are legal-sensitive facts from the notice. Mark them `uncertain` when unsure, and show the source and as-of date on the page.
6. **The v3 contract stays for old sessions only.** New intakes of v3 should be refused in the UI after B2, so no two contracts are used for new work.

## 4. Open questions for the owner (MCQ)

- **Q1. Where does a new exam's first written paper get its units?**
  - (a) One unit per mapped master TOPIC, with its subtopics mapped under it (as CGL). *[recommended]*
  - (b) One unit per mapped SUBTOPIC.
  - (c) The exam decides per section.
- **Q2. Storage for master outlines.**
  - (a) A new table `taxonomy_node_outlines` (enforced limits, audited). *[recommended]*
  - (b) `canonical_taxonomy_nodes.metadata.outline` (no new table, limits in code only).
- **Q3. Choice groups.**
  - (a) A column `exam_syllabus_nodes.choice_group` + version `metadata.choice_groups`. *[recommended]*
  - (b) Metadata only (no migration).
  - (c) A separate table.
- **Q4. Home for the selection process.**
  - (a) A new table `exam_selection_stages` (per exam and cycle, published with review). *[recommended]*
  - (b) `exam_syllabus_versions.metadata.selection_process` (repeated per tier).
  - (c) Keep it as the prose exam-knowledge module only.
- **Q5. Who may approve a NEW master node from an exam map?**
  - (a) Admin only, in the master queue. *[recommended]*
  - (b) Admin or staff.
  - (c) Auto-approve when the confidence is high (not allowed by the locked rule, listed for completeness).
- **Q6. The CGL unit `metadata.outlines` after B3.**
  - (a) Keep it as an archive and stop reading it after one release. *[recommended]*
  - (b) Strip it in a new CGL version (needs a re-publish).
- **Q7. Is SSC GD "English or Hindi" a choice per candidate, as here, or are both compulsory in some cycles?**
  - (a) Choice, pick 1. *[as per the trigger]*
  - (b) Both compulsory.
  - (c) It varies by cycle; store per version.
- **Q8. MASTER_INTAKE chunking.**
  - (a) One file per subject. *[recommended]*
  - (b) One file per topic for large subjects (GK).
  - (c) Free; the cap alone decides.
