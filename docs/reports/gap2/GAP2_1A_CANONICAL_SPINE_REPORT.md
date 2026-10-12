# GAP2-1a — Canonical Spine Forensics: topic taxonomy + learning content stores

Date: 2026-10-12 · Target: couragelibrary-next (ref guard DB = API, verified TLS) · Mode: READ-ONLY.
All DB reads ran inside `BEGIN READ ONLY … ROLLBACK` (pooler 6543, no session-level SET). No DB writes, no code changes except this report. No secrets, refs or user data below.

Method: catalog queries (pg_class, pg_constraint, pg_proc bodies, pg_trigger, information_schema, pg_policies), row counts and distributions, plus a code sweep of `app/ services/ lib/ actions/ components/ config/` (scripts/ and docs/ excluded). Code references were spot-verified; findings marked *(code-read)* were established by reading, not by executing.

---

## 1. Executive summary

1. **There are two taxonomy spines, and they never meet in runtime code.**
   - **Operational spine — `subjects → topics → (subtopics)`.** It is the FK target of everything live:
     - `questions.canonical_topic_id` (NOT NULL, RESTRICT);
     - mistake vault and drills, mastery, study plans, learning units and resources, flashcards, battles, discussions, search, import batches.
     - That is 22 inbound FKs into `topics` plus the node link.
   - **Structural spine — `canonical_taxonomy_nodes` (+ `taxonomy_aliases`, `exam_syllabus_*`).** Only the admin syllabus-reconciliation workbench and Current Affairs use it.
   - **The only bridge is `canonical_taxonomy_nodes.legacy_*_id`.** The service that populates it (`canonical-taxonomy-projection.service.ts`) is imported by nothing.
2. **The two spines are currently a perfect 1:1 mirror.**
   - 36/36 topics have exactly one TOPIC node; the 4 SUBJECT nodes map to the 4 subjects.
   - There are no duplicate names and no name, slug or parent conflicts. The hierarchy is two levels deep.
   - All mapping tables that hang off nodes are **empty**: aliases 0, syllabus mappings 0, CA mappings 0.
3. **There are two learning-content stacks, and both are effectively empty.**
   - **New canonical stack — `learning_units → learning_documents → document_versions`** (+ artifacts, assets, bindings).
     - It has versioning, immutability triggers, storage-backed bodies, a Content Studio, an AI authoring queue and an importer.
     - **It holds 0 rows.**
   - **Old stack — `learning_resources (+_topics) → articles/article_versions, courses/modules/lessons`.**
     - **No code writes it.** The two admin "create" actions are schema-broken.
     - It holds 1 resource, 1 article, 1 course, 1 module and 1 lesson. **None is linked to a topic** (`learning_resource_topics` = 0).
4. **"Learn more" is dead on both paths.**
   - `fn_resolve_learn_more` reads only the old stack and has **no callers in code**. With 0 topic links it would return "no resource" for every question.
   - The mistake learning section (`/mistakes`, `/mistakes/[id]`) also reads only the old stack. **Anything published from the Content Studio can never appear there.**
   - The mock-result review card and `/articles` do read the new stack first.
5. **Exam Knowledge is separate.** It holds 70 PUBLISHED documents across 24 module keys (eligibility, dates, salary, cut-offs…), keyed by exam/cycle, with no topic FK. It is exam information, not topic learning.
6. **There are also two syllabus systems.**
   - The legacy `exam_syllabi/exam_topics` projection has 1 syllabus and 18 rows, for SSC GD only, and is written by the onboarding wizard.
   - The canonical `exam_syllabus_versions/nodes/canonical_mappings` system has **0 rows**, and its only writer (the tree importer) is orphaned.
7. **Recommendation (for the owner to decide):**
   - **Taxonomy — T3, "identity-unified spine".** Make each canonical node carry the same UUID as its topic or subject. This is free now: the 40 nodes have no dependants. FKs can then be flipped from `topics` to `canonical_taxonomy_nodes` one at a time as constraint-only changes, with no data rewrite. `topics/subjects` become a synced compatibility projection.
   - **Learning — L2.** `learning_documents` becomes the single content store. Courses stay only as a packaging/runtime layer whose lessons reference documents. `learning_resources`, `learning_resource_topics` and `articles` are retired, and learn-more, the mistake section and the CA mappings are re-pointed.
   - **Timing:** with ~0 content rows and 113 questions, this is the cheapest moment the migration will ever have.

GAP2-1a STATUS: CLOSED (see §9).

---

## 2. Taxonomy inventory

Row counts are live. "Live in candidate UI" means a student-facing route renders data from the table.

| Table | Rows | Status | Outbound FKs | Inbound FKs (dependants) | Code writers | Code readers | Live in candidate UI |
|---|---|---|---|---|---|---|---|
| subjects | 4 | 4 active | — | topics, pattern_sections, mock_sections, user_mistake_vault, flashcard_decks, search_indexes, descriptive_questions, canonical_taxonomy_nodes.legacy_subject_id (8) | admin `app/admin/actions.ts:452` (auto-create on section), `:544` | admin services, QF resolver, coverage/blueprint, CA quiz; candidate embeds | yes — /mock-tests, /mistakes filters, /premium, /performance |
| topics | 36 | 36 active | subject_id→subjects | **22 FKs**: questions.canonical_topic_id, subtopics, exam_topics, user_topic_mastery, user_mastery_history, learning_activity_events, study_plan_items, learning_resource_topics, daily_study_recommendations, spaced_repetition_schedules, search_indexes, discussion_threads, flashcard_decks, quiz_battle_rooms, user_mistake_vault, user_mistake_drills, batch_curriculum_assignments, descriptive_questions, topic_relationships ×2, learning_units, question_import_batches.target_topic_id (+ canonical_taxonomy_nodes.legacy_topic_id) | only `app/admin/actions.ts:466` ("<Subject> General Topics") | ~60 references: QF resolver, coverage matrix, blueprint, content studio, curriculum context builder, onboarding; candidate dashboard, performance, mock-tests, mistakes, premium, articles, exams | yes — almost every candidate surface |
| subtopics | 0 | — | topic_id→topics | questions.subtopic_id, learning_resource_topics, learning_units, nodes.legacy_subtopic_id | none | QF resolver, content studio, context builders | no data |
| topic_relationships | 0 | — | from/to→topics | — | none anywhere | `/articles/[slug]` related topics (content.service.ts:442), context builder | renders nothing (0 rows) |
| canonical_taxonomy_nodes | 40 | SUBJECT 4, TOPIC 36; all active; depth 1:4, 2:36 | parent/root→self; legacy_subject/topic/subtopic→legacy | self, taxonomy_aliases, exam_syllabus_canonical_mappings, current_affairs_taxonomy_mappings | workbench `exam-syllabus-resolution.service.ts:259,277,374,390`; orphan projection service | workbench, readiness, CA validation, CA lookup (selects non-existent `code`) | only via /current-affairs/[slug] (0 mappings) |
| taxonomy_aliases | 0 | — | canonical_node_id | — | workbench `exam-syllabus-resolution.service.ts:593,604` | only orphan `exam-syllabus-reconciliation.service.ts` | no |
| exam_syllabi | 1 | active | exam_cycle_id | exam_topics | onboarding `exam-onboarding.service.ts:610` | onboarding, readiness, AI question context | /exams pages *(query broken, see §8)* |
| exam_topics | 18 | — (SSC GD only) | syllabus_id, topic_id→topics | exam_unit_mappings | onboarding `saveSyllabusProjection` (:626 upsert) | onboarding, readiness, AI question context builder (weightage, depth) | /exams pages *(query broken)* |
| exam_syllabus_versions | 0 | — | exam, cycle, source_document→exam_knowledge_documents | exam_syllabus_nodes | only orphan `exam-syllabus-tree-importer.service.ts` | workbench, readiness | no |
| exam_syllabus_nodes | 0 | — | version, parent→self | canonical_mappings | only orphan tree importer | workbench | no |
| exam_syllabus_canonical_mappings | 0 | — | syllabus_node, canonical_node, reviewed_by | — | workbench `exam-syllabus-resolution.service.ts:946,979` | workbench, readiness | no |
| current_affairs_taxonomy_mappings | 0 | — | CA article, **taxonomy_node→canonical_taxonomy_nodes** | — | admin CA editor, CA importer | /current-affairs/[slug] | path exists, 0 rows |
| exam_unit_mappings | 0 | — | exam_topic→exam_topics, learning_unit | — | coverage matrix `mapUnitToExam` | content studio, coverage, exam pages | no |
| user_topic_mastery / user_mastery_history | 0 / 0 | — | canonical_topic_id→topics | — | **no writer anywhere** (code or SQL) | dashboard, performance, premium, practice SQL | renders empty |

**SQL functions referencing the taxonomy (pg_proc bodies):**
- **topics:** `fn_import_question_drafts`, `fn_record_mistake_occurrence`, `fn_resolve_learn_more`, `fn_generate_daily_recommendations`, `fn_create_discussion_thread`, `fn_delete_exam_controlled`.
- **subtopics:** `fn_import_question_drafts`.
- **canonical_taxonomy_nodes:** only its own triggers (`fn_derive_canonical_taxonomy_fields`, `fn_guard_canonical_taxonomy_cycles`, `fn_cascade_canonical_descendants`).
- **exam_syllabus_nodes:** depth, cycle and cascade triggers.
- **exam_syllabi/exam_topics:** `fn_delete_exam_controlled`.

**RLS:** every spine table has RLS on with 1–2 policies. Both anon and authenticated hold SELECT; read is intended to be public.

## 3. Learning-store inventory

| Table | Rows | Status | Topic link | Writers | Readers | Live candidate route |
|---|---|---|---|---|---|---|
| learning_units | 0 | — | topic_id→topics (CASCADE), subtopic_id | **none in code** | content studio, coverage, blueprint, context builder, `/articles`, `/exams` | /articles, /exams (0 rows) |
| learning_documents | 0 | — (CHECK DRAFT/PUBLISHED/ARCHIVED; 6 document types: CONCEPT_LESSON, WORKED_EXAMPLES, FORMULA_SHORTCUT_SHEET, COMMON_TRAPS_AND_MISTAKES, PYQ_DEEP_DIVE, TOPIC_SUMMARY_REVISION) | via learning_unit | Content Studio (`admin-content-studio.service.ts:299,765`), AI importer (`structured-content-importer.service.ts:361`) | `/articles`, `/articles/[slug]`, mock-result review card, `/exams` "Learn" link, coverage, context builder | yes — /articles, /mock-tests/[id]/result, /exams (0 rows) |
| document_versions | 0 | review DRAFT…PUBLISHED; immutable once published (triggers) | via document | Content Studio, AI importer; body in storage bucket `learning-artifacts` | as above | as above |
| learning_content_artifacts / learning_assets / learning_unit_asset_bindings | 0 / 0 / 0 | — | via unit | only dead services (`content-artifact.service.ts`, `learning-asset.service.ts`) | content studio counts/search | no |
| learning_resources | 1 | PUBLISHED 1 (ARTICLE, FREE) | via learning_resource_topics | **none** (no code, no seed) | mistake section, `/articles` legacy fallback, CA learning CTA, `fn_resolve_learn_more`, `fn_generate_daily_recommendations`, `fn_reconcile_search_indexes` | /mistakes*, /articles, /current-affairs/[slug] |
| learning_resource_topics | 0 | — | topic_id→topics, subtopic_id | **none** | mistake section, `fn_resolve_learn_more`, `fn_complete_course_lesson` | /mistakes* (always empty) |
| articles / article_versions | 1 / 0 | PUBLISHED 1 | via learning_resource | `app/admin/actions.ts:1220` *(schema-broken)*; `fn_publish_article_version` (uncalled) | `/articles`, `/articles/[slug]`, sitemap, admin content list | /articles (legacy fallback) |
| courses / course_modules / course_lessons | 1 / 1 / 1 | published | lessons→learning_resource (nullable) | `app/admin/actions.ts:1249` courses *(access_tier value violates CHECK)*; modules and lessons: none | `/courses`, `/courses/[slug]`, `/courses/[slug]/learn`, sitemap | yes |
| user_course_progress / user_lesson_completions / user_lesson_notes | 0 / 0 / 0 | — | — | `fn_update_lesson_playback_position`, `fn_complete_course_lesson` (via /api/courses/*); notes: none | `/courses*` | yes (runtime) |
| current_affairs_learning_mappings | 0 | — | **learning_resource_id→learning_resources** | admin CA editor, CA importer | `/current-affairs*` (learning CTA → `/articles/{learning_resources.slug}`) | path exists, 0 rows |
| flashcard_decks / flashcards | 0 / 0 | — | deck topic_id/subject_id/exam_id | flashcard RPCs | flashcard pages | renders empty |
| daily_study_recommendations, study_plan_items, spaced_repetition_schedules, learning_activity_events | 0 each | — | topic_id→topics | RPCs (generation uncalled) | dashboard | renders empty |

## 4. Exam Knowledge: confirmed separate

- **Contents:** `exam_knowledge_documents` (70, all PUBLISHED) + `exam_doc_versions`, `exam_posts`, `exam_sources`, `exam_claims`, `exam_claim_sources`.
- **Coverage:** SSC CGL 24 documents, CHSL 24, MTS 20, GD 2. There are 24 `module_key` values, all exam metadata (EXAM_OVERVIEW, IMPORTANT_DATES, ELIGIBILITY, AGE_LIMIT, … CUTOFF_TRENDS, ADMIT_CARD, RESULT, FAQ, NOTIFICATIONS).
- **No link to the taxonomy or learning stores.** There is no FK to topics, nodes, learning_units or learning_documents. Its outbound FKs go only to exams, exam_cycles and its version pointer.
- **Two touch-points, both read-only directions:**
  - `exam_syllabus_versions.source_document_id → exam_knowledge_documents` records where a syllabus was extracted from.
  - The `/exams` syllabus navigator links to `/articles/{learning_documents.canonical_slug}` through `exam_unit_mappings`.
- **Conclusion:** Exam Knowledge is exam information. It must stay outside both spines, and the options below do not touch it.

## 5. Critical-links trace: who uses which spine

| Link | Spine used | Evidence |
|---|---|---|
| `questions.canonical_topic_id` | **topics** (FK NOT NULL RESTRICT; 113/113 set; 111 published, 2 archived) | only writer `fn_import_question_drafts`; `app/admin/actions.ts:954` refuses topic changes |
| Question Factory resolver | **topics / subtopics / subjects** (id → slug → name, errors on ambiguity, never creates). Not nodes, not aliases | `services/question-factory/question-taxonomy-resolver.ts:60-245`; RPC re-checks `public.topics`; `question_import_batches.target_topic_id → topics` |
| `user_mistake_vault.topic_id` | **topics** (SET NULL); 12/12 set (DRIFT-1d server-side fix) | `mistake.service.ts recordExamMistakes`; backfill 068 |
| `fn_resolve_learn_more` | topics → `learning_resource_topics` → learning_resources / articles / course_lessons (old stack only); returns `{success, topic_id, topic_name, learning_resource_id, resource_type, title, slug, access_level, content_slug, excerpt, is_primary, relevance_score, is_entitled, has_pro, is_locked}` | definition `20260824000008…:59`; **0 code callers** (only `types/database.ts`) |
| Mistake detail learning section | topics → **old stack only** | `mistake.service.ts:2209-2353`, `components/mistakes/mistake-learning-section.tsx`; CTA "Read Full Article" or "Open Course Lesson" → `/articles/{slug}` or `/courses/{slug}/learn?lesson=`; empty-state text otherwise |
| Mock result "Learn Concept" | topics → **new stack first**, old-stack fallback | `assessment.service.ts:2313` → `content.service.ts:325` |
| `current_affairs_taxonomy_mappings` | **canonical_taxonomy_nodes** | FK `taxonomy_node_id`; admin editor, importer, `/current-affairs/[slug]` |
| `current_affairs_learning_mappings` | **learning_resources** (old stack) | FK; CTA → `/articles/{learning_resources.slug}` (slug may not resolve, see §8) |
| Curriculum coverage matrix | topics + learning_units/documents + `questions.canonical_topic_id` + exam_unit_mappings | `curriculum-coverage.service.ts:142-148` |
| Authoring queue | topics (via coverage + blueprint) → writes new learning stack | `authoring-queue.service.ts:103,277,467` |
| Content studio | subjects/topics/subtopics + new learning stack | `admin-content-studio.service.ts` |
| Syllabus projection (onboarding) | topics → `exam_syllabi/exam_topics` | `exam-onboarding.service.ts:582-640` |
| Reconciliation workbench | **canonical nodes** + `exam_syllabus_*` + aliases (write); never touches topics | `operational-syllabus-reconciliation`, `exam-syllabus-resolution`, `exam-syllabus-readiness` |
| Practice sessions | topics (`fn_generate_custom_practice_session` filters canonical_topic_id) | RPC **never called**; `/practice` is static UI |
| Premium generator | topics; topic picker ignores examId (all subjects/topics) | `premium-hub.service.ts:466-490`, `premium-generator.service.ts:628-804` |
| Adaptive (dormant, FEATURE_ADAPTIVE off) | topics via canonical_topic_id | adaptive services; analytics selects non-existent `questions.topic_id` |

**Net:** only the reconciliation workbench and Current Affairs use canonical nodes. Everything a candidate touches runs on `topics`.

## 6. Mapping quality and coverage

### 6.1 canonical_taxonomy_nodes ↔ topics
| Metric | Value |
|---|---|
| Topics with a node (`legacy_topic_id`) | **36 / 36** |
| Topics with >1 node | 0 |
| Nodes without a topic | 4 (the SUBJECT nodes; all 4 carry `legacy_subject_id`) |
| Dangling `legacy_topic_id` | 0 |
| Name conflicts node vs topic | 0 · slug conflicts 0 |
| Parent consistency (node parent's legacy subject = topic.subject_id) | 0 mismatches |
| Duplicate node names / topic names | 0 / 0 |
| Depth distribution | depth 1 = 4 (SUBJECT), depth 2 = 36 (TOPIC); no DOMAIN/SUBTOPIC/CONCEPT/METHOD nodes |
| Sync mechanism | **none live**: no trigger on topics; the projection service is orphaned. The mirror is a one-time copy and will drift on the next topic insert (e.g. `app/admin/actions.ts:466`) |

### 6.2 Content per topic
- Topics with at least one PUBLISHED `learning_document`: **0 / 36**.
- Topics with at least one `learning_resource` (via `learning_resource_topics`): **0 / 36**.
- Topics with at least one article: **0 / 36**. The single article is unlinked.

### 6.3 Coverage table (published questions vs learning)
| Subject | Topic | Published Q | Learning docs | Resources |
|---|---|---|---|---|
| English Comprehension | Active Passive | 2 | 0 | 0 |
| | Antonyms | 4 | 0 | 0 |
| | English Comprehension General Topics | 0 | 0 | 0 |
| | Error Spotting | 4 | 0 | 0 |
| | Fill in the Blanks | 4 | 0 | 0 |
| | Idioms & Phrases | 2 | 0 | 0 |
| | One Word Substitution | 2 | 0 | 0 |
| | Sentence Rearrangement | 2 | 0 | 0 |
| | Spelling | 2 | 0 | 0 |
| | Synonyms | 4 | 0 | 0 |
| General Awareness | Economy | 4 | 0 | 0 |
| | General Awareness General Topics | 0 | 0 | 0 |
| | Geography | 5 | 0 | 0 |
| | History | 6 | 0 | 0 |
| | Polity | 5 | 0 | 0 |
| | Science & Technology | 4 | 0 | 0 |
| | Sports | 1 | 0 | 0 |
| General Intelligence & Reasoning | Analogy | 2 | 0 | 0 |
| | Blood Relations | 3 | 0 | 0 |
| | Classification | 8 | 0 | 0 |
| | Coding-Decoding | 4 | 0 | 0 |
| | Direction Sense | 2 | 0 | 0 |
| | GI&R General Topics | 0 | 0 | 0 |
| | Number Series | 4 | 0 | 0 |
| | Syllogism | 2 | 0 | 0 |
| Quantitative Aptitude | Algebra | 10 (+2 archived) | 0 | 0 |
| | Average | 2 | 0 | 0 |
| | Geometry | 3 | 0 | 0 |
| | Number System | 2 | 0 | 0 |
| | Percentage | 5 | 0 | 0 |
| | Profit & Loss | 2 | 0 | 0 |
| | QA General Topics | 0 | 0 | 0 |
| | Ratio & Proportion | 5 | 0 | 0 |
| | Speed Distance Time | 3 | 0 | 0 |
| | Time & Work | 2 | 0 | 0 |
| | Trigonometry | 1 | 0 | 0 |
| **Total** | 36 topics (32 with questions) | **111** | **0** | **0** |

Other observations:
- **Exam mapping:** `exam_question_mappings` = 0. Mock tests reference questions directly; they span 32 topics.
- **Syllabus coverage:** `exam_topics` covers only SSC GD (18 topics). CGL, CHSL and MTS have no projection, and the canonical syllabus tables are empty.

## 7. Options analysis

Facts that drive the choice:
- **(a) Tiny data:** 36 topics, 113 questions, 12 vault rows, 0 learning rows.
- **(b) Wide code surface:** about 60 code references to `topics` and 22 FKs into it.
- **(c) The nodes table is the only structure** that supports deeper levels (SUBTOPIC/CONCEPT/METHOD), aliases, and syllabus→canonical mapping. Those three are exactly what 50+ exams need.
- **(d) Nothing depends on node IDs yet** (all node-mapping tables are empty).

### T1 — canonical_taxonomy_nodes is the single spine; topics/subtopics become a projection and every FK is re-pointed

| | |
|---|---|
| Migrations | Add a node FK column next to each of the 22 topic FKs (e.g. `canonical_node_id`); backfill via `legacy_topic_id`; swap NOT NULL/RESTRICT; drop old columns later; rewrite SQL functions (`fn_import_question_drafts`, `fn_record_mistake_occurrence`, `fn_resolve_learn_more`, recommendations, discussion, delete-exam, practice); projection trigger nodes→topics until removal |
| Code | ~60 call sites: QF resolver and importer, mistake service, assessment, premium, coverage/blueprint/studio, context builders, dashboard/performance, CA, onboarding; regenerate `types/database.ts` |
| Data risk | Low volume, but a two-column period invites divergence; each table needs backfill + validation |
| Effort | **L** |
| Breaks during transition | Every embed `topics(...)` and every join on `canonical_topic_id` until switched; PostgREST embeds need FK names updated |
| 50+ exams | Excellent end state: one tree, aliases, syllabus nodes map to canonical nodes, content keyed per node |

### T2 — topics/subtopics stay the spine; nodes only for syllabus mapping + CA, with a mandatory 1:1 link

| | |
|---|---|
| Migrations | UNIQUE + NOT NULL on `legacy_topic_id` for TOPIC nodes; sync trigger topics→nodes (insert/update/deactivate) and subtopics→SUBTOPIC nodes; guard that mappings and CA target only nodes with a legacy link |
| Code | Minimal: wire the projection service or replace it with triggers; reconciliation resolves node→topic for downstream use |
| Data risk | Low |
| Effort | **S** |
| Breaks during transition | Nothing |
| 50+ exams | Weak. Questions, content and mistakes stay locked at two levels (subject/topic). CONCEPT/METHOD-level tagging, which is needed to share content across exams with different syllabus granularity, would need a parallel subtopic system. Two trees must be kept in sync forever, and deeper syllabus nodes have nothing operational to land on |

### T3 (recommended) — identity-unified spine: node.id = topic.id

Re-key the 40 nodes so each SUBJECT/TOPIC node's `id` equals its `subjects.id`/`topics.id`. Every existing value in every topic FK column is then already a valid node id.

| | |
|---|---|
| Step 1 (S) | One migration re-keys the 40 nodes: `parent_id`/`root_subject_id` follow; no other dependants, since aliases, mappings and CA are all 0. Add `UNIQUE(legacy_topic_id)` and a CHECK that TOPIC nodes have `id = legacy_topic_id`. UUIDs never collide (`gen_random_uuid`) |
| Step 2 (S) | Make nodes the write-master. Admin topic/subject creation goes through node creation; a trigger maintains `topics`/`subjects` rows with the same id (compatibility projection), so existing code keeps working unchanged. SUBTOPIC/CONCEPT nodes have no legacy row |
| Step 3 (M, incremental) | Flip FKs table by table as **constraint-only** changes: `DROP CONSTRAINT … REFERENCES topics` → `ADD CONSTRAINT … REFERENCES canonical_taxonomy_nodes(id) NOT VALID; VALIDATE`. No data rewrite, no column rename. Questions, vault and drills first, then learning_units, then the rest. A trigger or CHECK function enforces the allowed `node_type` per column (e.g. questions → TOPIC or deeper) |
| Step 4 (M, as touched) | Code moves reads from `topics(...)` embeds to node embeds when convenient. IDs are identical, so there's no flag day. SQL functions switch joins to nodes. Finally `topics`/`subjects` become views, or are dropped |
| Data risk | Very low. The re-key is the only data change, and it touches 40 rows with no dependants. **This window closes** as soon as aliases, syllabus mappings or CA mappings get rows |
| Effort | Overall **M**; step 1 is **S** and urgent |
| Breaks during transition | Nothing at steps 1–2. At step 3, PostgREST embeds named after the old FK (`topics(...)`) break per table as each FK flips, so embed names in code must change in the same deploy as each flip. Moving them to explicit FK hints beforehand avoids that |
| 50+ exams | Same end state as T1: one canonical tree, content and questions keyed once per node, every exam's syllabus mapped through `exam_syllabus_nodes → exam_syllabus_canonical_mappings → node`, zero duplication. It costs far less than T1 and is reversible at every step |

**Taxonomy recommendation: T3.**
- Do step 1 (re-key + 1:1 constraints) before any alias, syllabus-mapping or CA-mapping rows are created.
- Retire the legacy `exam_syllabi/exam_topics` projection in favour of the canonical syllabus tables. That needs the orphaned tree importer wired into onboarding, plus a read-model for weightage/depth that the AI context builder can consume.

### L1 — learning_documents/document_versions is the single store; articles, learning_resources and courses are retired

| | |
|---|---|
| Migrations | Re-point `current_affairs_learning_mappings` → learning_documents (or learning_units); rewrite `fn_resolve_learn_more` over units/documents; add an access level to learning_documents (it has none; artifacts have `access_class`); drop the old stack and its FKs (discussion_threads.article_id/lesson_id, batch_curriculum_assignments, daily_study_recommendations, user_entitlements.course_id, payment_orders.course_id) |
| Code | Mistake section + batch content, CA CTA, `/articles` legacy fallback, sitemap (add documents), admin legacy content tab, course pages and APIs |
| Data risk | Negligible (1 row each) |
| Effort | **M** |
| Breaks | `/courses` runtime (progress, completions, playback), course purchase entitlements and payment_orders linkage. These are working features the document store does not replace |
| 50+ exams | Good for content. Loses course packaging and commerce |

### L2 (recommended) — L1 for content, with courses kept as a packaging/runtime layer

- **Content:** `learning_units → learning_documents → document_versions` is the only place learning content lives, one set per canonical topic/node, shared by every exam.
- **Retire:** `learning_resources`, `learning_resource_topics`, `articles`, `article_versions`, plus the dead artifact/asset services (or wire them, owner's choice).
- **Courses stay:** `courses/course_modules/course_lessons` remain as **sequencing + commerce**. `course_lessons.learning_resource_id` is replaced by `learning_document_id` (or `learning_unit_id`); video lessons keep `video_url`.
- **Re-point to the document store:**
  - `fn_resolve_learn_more` (or a server service; the RPC is uncalled);
  - the mistake learning section;
  - `current_affairs_learning_mappings`;
  - `daily_study_recommendations.resource_id`;
  - discussion `article_id` → document.
- **Add an access level to `learning_documents`:** FREE/PRO, with paid-course access derived from course membership.
- **Exam emphasis lives only in `exam_unit_mappings`**, re-keyed to canonical syllabus mappings under T3. Content is never copied per exam.
- **Effort and risk:** **M**. Data risk negligible.
- **Breaks:** nothing live if the order is right:
  1. Mistake section reads documents, with old-stack fallback.
  2. CA mapping re-point.
  3. Course lesson re-point.
  4. Drop the old stack.

**Learning recommendation: L2.** Retiring courses outright (L1) would delete a working runtime and commerce path for no content gain.

### Sequencing proposal (for planning; nothing implemented)
1. **T3 step 1** (re-key nodes, 1:1 constraints).
2. **T3 step 2** (nodes as write-master; topics projection trigger).
3. **L2 content pointers** (learning section and CA → documents; access level on documents).
4. **T3 step 3** FK flips: questions, mistakes, learning_units first.
5. **Retire** the old learning stack and the legacy syllabus projection.

Each step goes through backup + runner + ledger.

## 8. Risks, defects found, and open questions

### 8.1 Defects found in passing (not in scope; report only)
| # | Severity | Finding |
|---|---|---|
| D1 | **Security** | `fn_resolve_learn_more(p_question_id, p_user_id)` is SECURITY DEFINER, EXECUTE is granted to **anon and authenticated**, and it uses a caller-supplied `p_user_id` → anyone can probe any user's PRO / course entitlement (`has_pro`, `is_entitled`). It is uncalled, so REVOKE or drop it, or ignore `p_user_id` unless the caller is service_role |
| D2 | High | Schema drift in candidate pages *(code-read)*: `/exams` service filters `exam_syllabi.exam_id`, `exam_topics.exam_id/is_active/display_order` and embeds `exam_syllabi→subjects` (none exist); dashboard and performance select `user_topic_mastery.topic_id`, `mastery_percentage`, `status` (real column `canonical_topic_id`); CA admin lookup selects `canonical_taxonomy_nodes.code`; adaptive analytics selects `questions.topic_id`; content studio and coverage reference a non-existent `exam_topic_mappings` table |
| D3 | Medium | Admin legacy create actions violate the schema: `articles` insert uses non-existent columns, lowercase status, and omits NOT NULL `learning_resource_id` (`app/admin/actions.ts:1220`); `courses` insert uses `access_tier:"free"` against an upper-case CHECK (`:1249`) |
| D4 | Medium | Mistake learning section does not filter article status (a DRAFT slug can be linked); fallback `/articles/{learning_resources.slug}` and the CA CTA use resource slugs that `/articles/[slug]` never resolves |
| D5 | Medium | `user_topic_mastery` / `user_mastery_history` have **no writer**; dashboard, performance, premium "weak topics" and practice SQL read permanently empty data |
| D6 | Low | Premium topic picker ignores the exam (`getExamTopics(examId)` returns all subjects/topics); `mastery_score < 60` filter vs a 0–1 score *(code-read)* |
| D7 | Low | Uncalled SQL: `fn_generate_custom_practice_session`, `fn_record_mistake_occurrence`, `fn_generate_daily_recommendations`, `fn_reconcile_search_indexes`, `fn_publish_article_version`. Orphaned services: canonical-taxonomy-projection, exam-syllabus-tree-importer, exam-syllabus-reconciliation, exam-syllabus, academic-taxonomy, content-artifact, learning-asset |
| D8 | Low | Sitemap lists `articles` and `courses` but not `learning_documents` |

### 8.2 Risks of the recommended path
- **The T3 re-key window is time-limited.** Once aliases, syllabus mappings or CA taxonomy mappings hold rows, re-keying needs cascading updates. Prefer to do step 1 before any workbench or CA usage.
- **PostgREST embed names change when FKs flip.** Every `topics(...)` embed in code must move with its table's flip, or be converted to explicit FK-hint embeds beforehand.
- **Node-type enforcement.** A plain FK cannot restrict a column to TOPIC (or deeper) nodes; a trigger or CHECK function is needed per column.
- **Content Studio's in-memory fallback** (`learning-document.service.ts versionCache`) can mask failed writes; it should fail loudly before real content is authored.
- **Old-stack retirement** drops FKs used by discussions, batch assignments, recommendations and payments; each needs a re-point decision.

### 8.3 Open questions for the owner
1. Approve **T3** (identity-unified nodes) over T1/T2, and do step 1 now, before any CA or syllabus-mapping data exists?
2. Approve **L2** (documents as the only content store; courses kept as packaging/commerce)? Or are courses themselves out of product scope (which would make it L1)?
3. Should questions eventually be tagged below topic level (SUBTOPIC/CONCEPT nodes)? This decides whether `questions.canonical_topic_id` may point at deeper nodes.
4. Which syllabus system is canonical for onboarding: retire `exam_syllabi/exam_topics` (SSC GD only) in favour of `exam_syllabus_versions/nodes` + mappings?
5. Does access control for learning content live on the document (FREE/PRO) or on the unit/artifact (`access_class`)?
6. Fix D1 (learn-more entitlement oracle) as an immediate security patch, separate from GAP2?
7. Wire or delete the orphaned services (projection, tree importer, artifacts, assets)?

## 9. Final

Investigation complete: both spines are inventoried, the critical links traced, mapping quality and coverage measured, and the options analysed with a recommendation. No DB writes; the only repo change is this report. The decisions in §8.3 are the owner's.

GAP2-1a STATUS: CLOSED
