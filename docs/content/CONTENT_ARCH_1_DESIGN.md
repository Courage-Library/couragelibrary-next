# CONTENT-ARCH-1 — the Master Library (design only)

**Status: DESIGN — no code, no migrations.** Written 2026-10-27. Owner vision:
- a MASTER LIBRARY;
- exam courses generated from syllabi;
- AI-prompt-driven content and syllabus intake;
- SEO for every exam × topic;
- launch per exam.

The facts in Part 1 come from a read-only inspection of the repo and of the dev DB (counts / catalogue only). Migration numbers are written as "078" etc.

---

## PART 1 — Inspection: what exists today

### 1.1 Canonical taxonomy (the master tree)

**Table:** `canonical_taxonomy_nodes` (057; write-master since 070; FK target since 075).
- Columns: `id, parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active, metadata, legacy_*`.

**Levels:** `node_type ∈ SUBJECT, DOMAIN, TOPIC, SUBTOPIC, CONCEPT, METHOD`. Parent rules (070, `taxonomy.rules.ts`):
- SUBJECT is the root;
- DOMAIN goes under SUBJECT;
- TOPIC goes under SUBJECT or DOMAIN;
- SUBTOPIC goes under TOPIC;
- CONCEPT / METHOD can go under anything, recursively.
- **Max depth:** unbounded apart from a cycle-guard cap of 100.
- `node_depth`, `root_subject_id` and `hierarchy_path` (slugs joined with ".") are derived by trigger.

**Today's data:** 4 SUBJECT + 36 TOPIC nodes, depth ≤ 2. There are no SUBTOPIC or CONCEPT nodes yet.

**Slugs:**
- Unique only among siblings (`uq_canonical_sibling_slug`).
- **But** the projection tables (`subjects`, `topics`, `subtopics`) keep their own rules: globally unique `topics.slug` / `subtopics.slug`. Today they therefore force globally unique slugs at the topic and subtopic levels.

**Names:**
- **EN only.** There is no Hindi-name column.
- A description exists only in `metadata.description`; `metadata` currently holds only `source`.

**Writes:**
- `services/taxonomy/taxonomy.service.ts` (service role, admin guard, audit): create / rename / reorder / activate.
- **There is no move, no delete and no merge.**
- Direct writes to the projection tables are refused (`TAXONOMY_PROJECTION_ONLY`).
- Admin UI: `/admin/taxonomy`.

**Aliases:**
- `taxonomy_aliases` existed (057). It was **retired** to schema `retired` by 084, with 0 rows.
- **No alias is used anywhere today.** `ALIAS_MATCH` survives only as a mapping status value.

### 1.2 Syllabus system

**`exam_syllabus_versions`** (057 → 078):
- `exam_id`, nullable `exam_cycle_id` (null = exam-wide), `version_tag`, `version_number`, `supersedes_version_id`, `source_kind` (MANUAL / EXAM_KNOWLEDGE_DRAFT / LEGACY_MIGRATION / IMPORT), `raw_payload_hash`, publish / archive stamps.
- Status DRAFT / PUBLISHED / ARCHIVED; **one PUBLISHED per (exam, cycle)**.
- PUBLISHED / ARCHIVED versions are immutable (trigger).
- **Today:** 31 versions (1 PUBLISHED: SSC CGL Tier 1 · 1 DRAFT · 29 ARCHIVED).

**`exam_syllabus_nodes`:**
- `node_kind ∈ PAPER, SECTION, UNIT`, `raw_title`, `raw_slug`, `weightage_tier` (HIGH_YIELD … OPTIONAL), `expected_questions_min/max`, `required_cognitive_depth`, `is_mandatory`, `description`.
- **There is no tier column**: a tier is modelled as a PAPER node.
- **Today:** 106 nodes (1 PAPER, 35 SECTION, 70 UNIT).

**`exam_syllabus_canonical_mappings`:**
- UNIT → canonical node, with `match_status` (EXACT / ALIAS / PROPOSED / MANUALLY_MAPPED / NEW_SUBJECT_GAP / NEW_NODE_GAP / IGNORED), `match_method`, `candidate_matches`, `match_confidence`, `mapping_weight`.
- **Restricted to TOPIC nodes** (078 generated column + composite FK).
- **Today:** 61 mappings.

**SYL-IMPORT-1:**
- Contract: `docs/syllabus/IMPORT_CONTRACT.md`, `lib/syllabus/import-contract.ts` v1. Structure: papers → sections → units; each unit lists its topics by `hierarchy_path` + weight.
- DB authority: `fn_syllabus_import_draft` (086).
  - It resolves topics by **exact `hierarchy_path` only**.
  - An unknown path is a hard error (MISSING_TOPIC).
  - It never creates topics and never fuzzy-matches.
  - It writes MANUALLY_MAPPED mappings and one `SYLLABUS_DRAFT_IMPORT` audit row.
- Editor: `/admin/syllabus`. "Suggest topics" (`lib/syllabus/topic-suggest.ts`) gives deterministic trigram hints over TOPIC names; it is never auto-applied.
- **Read model:** `fn_exam_syllabus_read_model(exam, cycle)` and `lib/syllabus/published-topic-exams.ts` (topic → exams with weightage / depth / mandatory).

**Exams:**
- `exams`;
- `exam_cycles` (year);
- `exam_patterns` (per cycle, `tier_name`);
- `pattern_sections` (per pattern → SUBJECT, num_questions, marks).
- Syllabus sections are not linked to `pattern_sections`.

### 1.3 Lessons, study units, LessonDocumentSpec

**Tables:**
- `learning_units`: topic_id (→ node, TOPIC), subtopic_id (→ SUBTOPIC), unit_type × 6, `UNIQUE(topic_id, slug)`.
- `learning_documents`: unit, `canonical_slug` (globally unique), document_type, status, `access_level` FREE / PRO.
- `document_versions`: version_number, schema / compiler / contract versions, review_status DRAFT … PUBLISHED, immutable once published.
- **Today:** 2 learning documents.

**Content storage — CONFIRMED DIFFERENT FROM THE OWNER DECISION:**
- Lesson content is **not** in the DB.
- `document_versions` holds only `source_spec_storage_key/hash` and `compiled_artifact_storage_key/hash`.
- The JSON spec and the compiled **MDX** are files in the private Storage bucket `learning-artifacts` (service role only).
- The reader (`components/learning/controlled-content-renderer.tsx`) regex-parses an allow-list of JSX components out of that MDX.

**`LessonDocumentSpec` v1.0.0** (`types/learning-compiler.ts`):
- It has `language` (en / hi / bn / te / ta) but **no generic block array**. Instead it has fixed sections:
  - THEORY / VISUAL / DERIVATION / APPLICATION with `contentMarkdown` and callouts (TIP / WARNING / INFO / MEMORY_HOOK);
  - formulaBlocks, workedExamples, cognitiveTraps, authenticPyqReferences, quickChecks, revisionSummary, seo.
- **Validation:**
  - hand-written schema validator;
  - referential checks (fail-closed);
  - deterministic MDX assembly;
  - `MdxSecurityScanner`;
  - SHA-256 hash.

**Content Studio (`/admin/content`, `services/admin-content-studio.service.ts`):**
- The full lifecycle exists: draft → review → compile → publish, plus revisions.
- An external-AI prompt / validate / import path exists (`external-ai-prompt-builder`, `structured-content-importer`): drafts land as AI_GENERATED, never published.
- There is also an authoring queue, a Gemini provider and a curriculum-coverage view.

**"Learn more":**
- `LearningResolverService`: topic → units → published documents, always `/articles/{canonical_slug}`, with PRO lock via entitlements.
- Used by practice, mistakes, Memory Lock, results, courses, `/learn/topics/[id]` (noindex redirect) and current-affairs mappings.

**Student routes:**
- `/articles/[slug]` (the reader: canonical + Article JSON-LD).
- `/courses/*` (flag **FEATURE_COURSES off**; `course_lessons` has `is_free_preview`; there is no exam or node link).
- `/exams/[slug]/[moduleSlug]` exam guides (`exam_knowledge_documents`, the **only per-language model**: UNIQUE(exam, cycle, module, language)).

**Access:** `hasPro()` (`lib/payments/pro-server.ts`, `fn_has_pro`); `LearningResolverService.getViewerAccess`.

**Progress:**
- `user_course_progress` / `user_lesson_completions` (tied to course lessons);
- `learning_activity_events` (topic_id, ARTICLE_* events; no idempotency key);
- `user_topic_mastery`.
- **Nothing records reading of standalone articles.**

### 1.4 Questions and prompt generators

**Question links:**
- `questions.canonical_topic_id` (TOPIC, NOT NULL) and `subtopic_id` (SUBTOPIC, nullable). **No CONCEPT link.**
- `exam_question_mappings` (exam, question; no cycle; **0 rows**).
- `question_sources` (PYQ provenance: exam_name text, year, shift, tier, cycle).
- Mock membership links questions to an exam via `mock_templates.exam_id`.

**Bulk Importer prompt (`admin-bulk-import-studio.tsx`):**
- A hard-coded, unversioned client string (CSV, free-text topic names).
- On import, the resolver matches topics by exact id / slug / case-insensitive name; otherwise the row is rejected.

**Question Factory prompt:**
- XML-sectioned and versioned in **code** (`CL-QUESTION-AUTHOR-v1.0`).
- Context builder: SHA-256 context hash, weightage / depth from the published syllabus, a do-not-duplicate list.
- The other prompt families (`CL-EXAM-AUTHOR`, `CL-EXAM-ONBOARDING`, `CL-AUTHOR`) are also code constants.
- **The app itself makes no AI calls on these paths** (paste-in / paste-out).

**Flashcards:** `flashcard_decks` / `flashcards` (topic node, EN / HI fields, FREE / PRO) are the natural home for lesson "Memory Lock points". Memory Lock itself works per question.

**SEO plumbing:**
- `app/sitemap.ts` (exams, exam modules, `/articles`, CA; courses only with the flag);
- `lib/seo/metadata.ts` (canonical, noindex);
- `lib/seo/jsonld.ts` (Organization, BreadcrumbList, Article, FAQPage);
- `app/robots.ts`.
- **No hreflang anywhere; no Course / LearningResource JSON-LD.**

### 1.5 Reused vs missing

| Need | Reuse | Missing |
|---|---|---|
| 4-level master tree, EN + HI, aliases | `canonical_taxonomy_nodes` (types, derived paths, cycle guard, audit), TaxonomyService, `/admin/taxonomy` | HI name; a live alias table; move / merge; a 4-level cap; subject types; projection slug rule blocks repeated sub-names |
| Syllabus intake by AI prompt + match | Import contract, validator, atomic `fn_syllabus_import_draft`, mapping status / candidates columns, `topic-suggest.ts`, QF context-hash pattern | Intake prompt; free-text → tree matcher; mapping below TOPIC; owner review of proposed nodes / aliases; a tier on versions |
| Lessons as DB JSON blocks, EN + HI | units / documents / versions lifecycle, immutability guards, AST-style security scanner, `language` in the spec | **Content in the DB** (today Storage + MDX); a generic block model; a language on versions; one lesson per node; per-node (any level) binding |
| Lesson prompt → validate → draft → publish | External prompt builder, importer, review states, authoring queue | Node-centric multi-exam prompt; completeness checklist; DB prompt templates; EN→HI translation draft |
| Generated exam courses + free-first-N | courses tables (dormant), `exam_unit_mappings`, `hasPro()` | Course = generated view; per-exam topic notes; a first-N-free rule; launch state |
| SEO | `/articles` reader, metadata + JSON-LD helpers, sitemap | `/learn/...` master pages; exam-topic pages; hreflang; Course / LearningResource JSON-LD |
| Progress per node | `learning_activity_events`, `user_topic_mastery` | Per-node lesson progress; article read events; "continue" |

---

## PART 2 — Design

### A. Master tree (4 levels)

**Levels:**

| Level | node_type | Example |
|---|---|---|
| L1 | SUBJECT | Quantitative Aptitude |
| L2 | TOPIC | Percentage |
| L3 | SUBTOPIC | Successive percentage change |
| L4 | CONCEPT (sub-subtopic) | Net change of two changes |

- **DOMAIN and METHOD are not used in the master tree** (they stay valid for legacy rows).
- One node per item.

**New columns (M1):**
- `name_hi` (nullable);
- `subject_type` on SUBJECT only (`APTITUDE, LANGUAGE, GK_GA, TECHNICAL, PEDAGOGY, STATE_SPECIFIC`);
- `state_code` (STATE_SPECIFIC only; state GK lives under "State GK → <State>").
- The **depth cap** is enforced by trigger for master nodes: `node_depth ≤ 4`.
- Deeper source trees become **sections inside the L4 lesson** (L.1).

**Slugs:**
- Unique among siblings (as today).
- `hierarchy_path` becomes the unique public path (add a unique index).
- **Decision needed:** the projection tables force globally unique topic / subtopic slugs. A generic subtopic name such as "Basics" would collide. **Recommendation:** relax `topics.slug` / `subtopics.slug` to unique per parent (the projection is read-compat only). CONCEPT nodes are not projected.

**Aliases (M1):** a new `taxonomy_node_aliases` table, rather than reviving the retired one, whose columns don't fit:
- Columns: `node_id`, `alias`, `normalized_alias`, `language` (en / hi), `source` (OWNER / INTAKE / IMPORT), `created_by`, `created_at`.
- Unique on `(parent scope, normalized_alias)`: an alias may not equal another sibling's name or alias.
- Normalization = NFKC, lower case, punctuation folded, `&` → `and`, whitespace collapsed (one shared pure function used by TS and SQL).

**New audited RPCs:**
- `fn_taxonomy_move_node` (same level only);
- `fn_taxonomy_merge_nodes(source → target)`: re-points every FK (questions, units, mappings, notes), turns the source name into an alias of the target, deactivates the source, writes an audit row. **Owner only; never automatic.**
- Same name with different scope stays separate (two nodes); merging is that explicit action.

### B. Syllabus intake (AI prompt → match → draft → verify → publish)

1. **Owner picks** an exam + cycle + tier (or "all tiers") and enters the official notification URL + as-of date.
2. **Prompt** (template type `SYLLABUS`, D.3). It contains:
   - the exam / cycle / tier;
   - the required structure: stages / tiers → papers → subjects → the 4-level tree;
   - marks / questions / weightage if published;
   - the official URL + as-of date;
   - "flag every uncertain item" (`uncertain: true` + a reason);
   - "no invention";
   - **strict JSON**, contract `SYLLABUS_INTAKE v2`: names, not paths; an optional `aliases[]` per item; optional `marks`, `questions`, `weightage_tier`.
3. **Paste → validate:** TS schema (`lib/syllabus/intake-contract.ts`, mirrored server-side), size limits, the security scan for text fields.
4. **Match to the master tree** (pure `lib/syllabus/tree-matcher.ts`, deterministic, level by level, scoped by the matched parent). Per item:
   - **EXACT** = normalized name or alias equals a node under the matched parent → link.
   - **CLOSE** = trigram / Dice similarity ≥ threshold, or a token-subset match, against names + aliases → up to 3 **suggestions**; the owner confirms.
   - **NEW** = no candidate → a **proposed node**.
   - An unmatched SUBJECT → a **proposed new branch** with all its children (L).
5. **Staging (M2):**
   - `syllabus_intake_sessions` (exam, cycle, tier, source URL, as-of, payload hash, status);
   - `syllabus_intake_items` (tree position, raw name, match status, candidates, owner decision).
   - Nothing touches the master tree or a syllabus version yet.
6. **Owner review screen** (tree diff: matched / alias / proposed). Per node the owner chooses:
   - **link** to the suggested node;
   - **ALIAS** of an existing node (adds an alias, then links);
   - **MAP children** into existing nodes;
   - **APPROVE as new** (creates the master node via TaxonomyService, audited);
   - **IGNORE**.
   - Approvals are explicit and audited (`SYLLABUS_INTAKE_DECISION`). **Nothing is created silently.**
7. **Draft version:**
   - When every item is decided, an extended `fn_syllabus_import_draft` (contract v2) writes a **DRAFT** syllabus version for (exam, cycle, tier).
   - Mappings may target **TOPIC, SUBTOPIC or CONCEPT** (M2 widens 078's TOPIC-only FK).
   - Weightage / questions are copied; uncertain flags are kept in node metadata.
8. **Verify → publish:**
   - The owner checks the DRAFT against the notification in the existing editor (side panel: the source URL + the uncertain items).
   - Then the existing publish: one PUBLISHED per (exam, cycle, tier); the previous one is archived.
   - **Versions per exam cycle** (existing); **tier** becomes a version column (M2), with the PAPER node kept for display.
- **Reuse:** the SYL-IMPORT-1 RPC (atomic, audited), the editor, `topic-suggest.ts`, the mapping status / candidate columns.

### C. Lessons (one per node, DB JSON blocks, EN master + HI)

**Model (M3):**
- `learning_documents` gains `node_id` (any master level) with a **unique** "one lesson per node" constraint for `document_type = NODE_LESSON`. The legacy 6 unit types stay as they are.
- `document_versions` gains:
  - `language` (en / hi);
  - `blocks jsonb` (validated) + `blocks_hash` + `blocks_schema_version`;
  - **one current published version per (document, language)**, the same rule as BILINGUAL-1.
- New lessons store **content in the DB**; the Storage keys become optional (legacy only).
- **Published versions are immutable** (the existing guards extend to `blocks`).

**Blocks** (`LessonBlocksSpec v2`, a generic ordered array; each block `{ id, type, ... }`):

| Block | Content |
|---|---|
| `heading` | level 2 or 3, text |
| `paragraph` | rich text |
| `formula` | LaTeX, validated against a KaTeX allow-list + a plain-text reading |
| `solved_example` | difficulty, question, ordered `steps[]`, answer, optional `shortcut` |
| `tip` | text |
| `trap` | text + why it fails |
| `table` | caption, headers, rows (text cells) |
| `image` | `asset_id` in Supabase Storage bucket `lesson-images`, **`alt` required**, caption |
| `practice_link` | node + mode (practice / PYQ / mock); resolved at render, never a raw URL |
| `revision_summary` | bullets |
| `memory_lock_points` | 3–10 points; on publish they become a flashcard deck for the node, EN / HI |

- **Rich text** is a small inline subset (bold, italic, code, inline math, internal node links), parsed into an AST.
- **Security:** a pure scan on the AST — no HTML, no scripts, no external URLs except an allow-listed citation field.
- The existing `MdxSecurityScanner` rules are reused as AST checks. There is no MDX in the new path.

**HI flow:**
1. The EN version is published.
2. "Create Hindi draft": template `TRANSLATE`, paste in / paste out (or the existing provider if the owner enables it).
3. An HI DRAFT with the same block ids.
4. **Side-by-side EN | HI review** (block by block, with a changed-block diff when EN is revised).
5. Publish HI.
- Until then HI users see EN + "Hindi coming soon".
- An EN revision marks HI as *outdated* (still served, labelled) until the HI revision is published.

**Legacy:** the 2 existing documents (spec v1 in Storage) are converted once to blocks; `/articles/<slug>` redirects (G).

### D. Lesson prompt generator + DB prompt templates

**Flow:**
1. Pick a node.
2. The context builder collects:
   - the node path, EN / HI names, aliases;
   - **every exam that maps the node** (published syllabi), with weightage, expected questions, required depth and PYQ counts;
   - sibling / child nodes;
   - existing published lessons (do-not-duplicate);
   - the context hash.
3. The prompt (template `LESSON`) asks for:
   - the concept from the basics, then formulas;
   - **all exam question types** for those exams, at each exam's depth;
   - **10–15 solved examples, easy → hard, with steps**;
   - shortcuts, common traps, PYQ-style practice;
   - a one-page revision summary and Memory Lock points;
   - "**no copying from books**"; "**flag uncertain facts**" (`uncertain_facts[]`, surfaced to the reviewer);
   - output **exactly** `LessonBlocksSpec v2` JSON.
4. Paste → parse.

**Validate:**
- schema;
- AST security;
- references (nodes, assets);
- a **completeness checklist**, with each item pass / warn / fail:
  - examples count and order;
  - a formula block if the node is quantitative;
  - every mapped exam's question types covered;
  - summary present;
  - memory points 3–10;
  - uncertain facts resolved.

**Then:** DRAFT → review (Focus-review style, one lesson at a time, the checklist visible) → publish.

**`prompt_templates` (M4):**
- Columns: `type ∈ SYLLABUS, LESSON, QUESTION, TRANSLATE`, `version`, `body` (with typed placeholders), `status` (DRAFT / ACTIVE / RETIRED), `created_by`, `notes`.
- One ACTIVE per type.
- Editing creates a new version (ACTIVE versions are immutable); the change is audited.
- Admin screen: template list + editor + "preview with a node".
- The code-constant prompts (QF, onboarding) move here gradually; the QF contract hash keeps the version in the hash.

### E. Exam courses = generated, never copied

**A course for (exam, cycle):**
- = its published syllabus nodes (mapped L2–L4 nodes + their L3 / L4 descendants);
- ∩ nodes with a published lesson;
- ordered by the master tree (`hierarchy_path` / `display_order`);
- grouped into chapters by the mapped TOPIC.
- Computed by a read model (`fn_exam_course_outline(exam, cycle, language)`) — **no copies of lessons, no `course_lessons` rows**.
- The dormant `courses` tables stay for any manually curated course.

**Per-exam topic note:** `exam_node_notes` (exam, node, language, blocks, version, status; M3):
- "how it is asked in <exam>";
- weightage words;
- that exam's PYQ pattern;
- a short exam-specific intro.

### F. Access

**The rule:**
- **First N lessons per chapter free**: setting `free_lessons_per_chapter` (`premium_system_configs` GLOBAL, default 2), counted in master order within the chapter.
- The rest are Pro via `hasPro()`.
- Decided **server-side**: the Pro body is never sent to a non-Pro viewer; they get the title, intro, outline and an upgrade card.

**Before an exam's launch** (H): every published lesson is a **free public standalone article** (SEO + "Learn more").

**Decision needed:** after launch, is a lesson that is free in one exam course and Pro in another free? **Recommendation:** gate by the lesson's position in its **master** chapter (the same for every exam), so a lesson has one access level.

### G. SEO

**Master lesson pages** — `/learn/<subject>/<topic>[/<subtopic>[/<concept>]]` (the `hierarchy_path` slugs):
- canonical, full text (EN);
- Hindi at `/hi/learn/...`;
- `hreflang` en / hi / x-default (en);
- `LearningResource` + `BreadcrumbList` JSON-LD.

**Exam-topic pages** — `/exams/<exam>/<subject>/<topic>[/<subtopic>]`, **unique** content:
- the exam note (E);
- how it is asked, weightage / expected questions, that exam's PYQs (question_sources + mock membership);
- practice and mock links;
- a short summary;
- a **link to the master lesson**.
- **Self-canonical**, never the master's full text.
- `Course` JSON-LD on the exam course page; `BreadcrumbList` on every page.

**Pro lessons:** title + intro + outline are indexable; the body is behind the paywall, marked with `isAccessibleForFree: false` + `hasPart` (Google's paywalled-content markup, not cloaking).

**Index only published content:**
- `app/sitemap.ts` splits per exam;
- drafts, unlaunched-only structures and empty nodes are never listed;
- a node page without a published lesson is `noindex`.

**Legacy:** `/articles/<slug>` → 301 to the master URL; `/learn/topics/<id>` → 301.

### H. Launch per exam

**Coverage Matrix** (admin, per exam × cycle) = % of the exam's mapped syllabus nodes with a published EN lesson (and HI %), drill-down to the missing nodes, "Build next" → lesson prompt.

**"Launch course":** an explicit, audited owner action (`exam_course_launches`: exam, cycle, launched_by / at, coverage snapshot, status LIVE / PAUSED; M6).
- Before launch: lessons appear as standalone articles only.
- After launch: the exam course page, path, progress and Pro gating appear.
- Pausing is audited too.

### I. Progress

**`user_lesson_progress` (M5):**
- Columns: user, node, document, language, status NOT_STARTED / READING / COMPLETED, last block id, updated_at.
- Written **only** through RPCs that use `auth.uid()` (the DRILL-1 pattern: no client table writes); idempotent.

**Derived per node:**
- practice accuracy from `practice_answers` / attempt answers;
- questions need a node link at L3 / L4 for fine accuracy (optional `questions.concept_id`, M7).

**Chapter mastery:** lessons completed + accuracy + Memory Lock state; it updates `user_topic_mastery`.

**"Continue where you left off":** the newest progress row in the student's launched exam course.

`learning_activity_events` gains ARTICLE_VIEWED writes (with an idempotency key) for analytics.

### J. Tie-in with BILINGUAL-1 (one design)

**One rule for questions and lessons:** at most one current published version **per language**; EN is the master.
- **Lessons:** HI falls back to EN, labelled; an EN revision marks HI outdated.
- **Questions:** the 2026-10-27 rulings apply.
  - An answer-key change publishes EN + HI together.
  - If HI is not ready, it is withdrawn and EN is served, labelled.
  - A mismatched key is never served.
- Content language comes from the user preference (Hinglish → EN); the UI stays English (R9).
- Exam notes and flashcards follow the same per-language rule.

### K. Migrations, screens, tests, phases, decisions

**Migrations** (listed only; written and applied later with backup → dry-run → apply; held until the go):

| # | Content |
|---|---|
| M1 taxonomy | `name_hi`, `subject_type`, `state_code`, 4-level guard for master nodes, `taxonomy_node_aliases`, `fn_taxonomy_move_node`, `fn_taxonomy_merge_nodes`, unique `hierarchy_path`, projection slug rule per parent |
| M2 syllabus | mappings to TOPIC / SUBTOPIC / CONCEPT; `tier` on versions; `syllabus_intake_sessions` / `_items`; `fn_syllabus_import_draft` contract v2 |
| M3 lessons | `learning_documents.node_id` + NODE_LESSON uniqueness; `document_versions.language` / `blocks` / `blocks_hash` + one-current-per-language; `exam_node_notes`; bucket `lesson-images` (+ policies) |
| M4 | `prompt_templates` |
| M5 | `user_lesson_progress` + RPCs; activity idempotency key |
| M6 | `exam_course_launches`; setting `free_lessons_per_chapter` |
| M7 (optional) | `questions.concept_id` |
| BILINGUAL-1 | the question migration from its design doc |

**Admin screens (Studio template):**
- Master tree: 4 levels, EN / HI names, aliases, move / merge with confirmation.
- **Proposed-branch review**: tree diff matched / alias / proposed.
- Syllabus intake wizard.
- Lesson studio: node picker → prompt → paste → checklist → EN | HI side by side → publish.
- Prompt templates.
- Coverage matrix + Launch.
- Exam notes.

**Student screens:**
- `/learn` master pages;
- the lesson reader (blocks; fallback label; Pro teaser);
- exam course page (path + progress);
- exam-topic pages;
- "continue" on the dashboard.

**Tests:**
- **Pure:** normalizer + matcher (exact / alias / close / new, parent-scoped); intake contract; block schema + AST security + completeness checklist; first-N gating; course outline order; SEO helpers (self-canonical, hreflang, JSON-LD, sitemap = published only).
- **DB (rolled back, real roles):**
  - one-current-per-language;
  - immutability of published blocks;
  - intake never creates nodes without an owner decision;
  - merge re-points every FK;
  - progress RPCs refuse other users.
- **Live:** reader / course / exam-topic pages as anon, student and Pro; axe.

**Phases** (each its own GO):

| Phase | Scope |
|---|---|
| CA-1 | Taxonomy foundation (M1 + master tree screen) |
| CA-2 | Syllabus intake (M2 + wizard + review) |
| CA-3 | Lesson blocks in the DB + reader + legacy conversion (M3) |
| CA-4 | Lesson prompt + templates + HI flow (M4) |
| CA-5 | SEO `/learn` + exam-topic pages |
| CA-6 | Courses + coverage + launch + gating (M6) |
| CA-7 | Progress (M5) |

BILINGUAL-1 lands with CA-3 / CA-4.

**Open decisions (with recommendations):**

| # | Decision | Recommendation |
|---|---|---|
| 1 | Projection slug rule | Unique per parent |
| 2 | Lesson access across exams | One access level from the master chapter |
| 3 | AI execution | Keep paste-in / paste-out for SYLLABUS / LESSON; provider calls optional, behind a flag, for TRANSLATE only |
| 4 | Content storage | **DB JSON blocks** (owner decision) — new path DB-only; Storage only for images |
| 5 | Tier modelling | A `tier` column on versions, keep PAPER for display |
| 6 | Hindi URLs | `/hi/learn/...` prefix |
| 7 | CONCEPT-level questions | Add `questions.concept_id` only when practice accuracy below topic level is needed |

### L. New / unmatched subjects

- An unmatched subject (+ children) = a **proposed new branch**, shown in the review screen and never applied silently.
- **Per node the owner chooses:**
  - **ALIAS** of an existing node;
  - **MAP children** to existing nodes (one topic = one node);
  - **APPROVE as new**.
- **Approved subjects join the MASTER tree** (not exam-scoped). Exam specificity lives only in the syllabus mapping + exam notes, so the next exam maps automatically (alias-aware at every level).
- **Subject types:** APTITUDE, LANGUAGE, GK_GA, TECHNICAL, PEDAGOGY, STATE_SPECIFIC.
  - State GK goes under "State GK → <State>", linked to current affairs STATE_SPECIFIC.
- **Depth:**
  - L.1 Trees deeper than 4 levels → the deepest levels become `heading` sections inside the L4 lesson (kept in the intake item so the lesson prompt includes them).
  - L.2 Same name, different scope → kept separate. Merging is the explicit audited owner action (A).
