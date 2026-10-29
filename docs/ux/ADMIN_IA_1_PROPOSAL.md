# ADMIN-IA-1: admin information architecture (PHASE A: inventory + proposal)

Status: **PROPOSAL**. It is read only: nothing in code, nav or data has changed. Phase B (implementation) starts only after the owner approves.
Evidence was gathered on 2026-10-29 from:
- `lib/admin/nav.ts`, every `app/admin/**/page.tsx`, and their components, services and actions;
- read-only database counts. "Last write" = the newest `created_at`/`updated_at` in the page's own tables; "real-admin audit" = `admin_audit_logs` rows excluding test identities.

**Why the nav confuses:** it grew one phase at a time. That gives:
- legacy and current tools side by side (Content Studio (legacy) beside Lessons);
- actions listed as places (Lesson generator, Syllabus intake, Bulk import);
- the same table edited from two pages (Categories and Exams both edit `exams`; Schedules and the exam wizard both edit `exam_cycles`);
- one orphan hub page;
- three redirect aliases.

---

## 1. Inventory: every admin route

Roles: **S** = staff + admin (`allowStaff: true`), **A** = admin only (`ADMIN_ONLY_ROUTES`). Nav: ● linked, ○ not linked.

### Today and review
| Route | Title | Purpose | System | Tables (R / W) | Evidence | Roles | Nav |
|---|---|---|---|---|---|---|---|
| `/admin` | Today | daily counts and deep links to every queue | dashboard | R: question_versions, errata, current affairs, flags, tickets, audit, entitlements · W: none | n/a | S | ● |
| `/admin/review/focus` | Focus review | one question at a time from the IN_REVIEW queue (approve / reject / edit) | Question Factory | R: question_versions · W: via fn_transition / fn_update / fn_publish question RPCs | 795 question versions, last write 10-27 | S | ● (badge) |

### Questions
| Route | Title | Purpose | System | Tables | Evidence | Roles | Nav |
|---|---|---|---|---|---|---|---|
| `/admin/questions` | Question bank | browse, create, edit, publish questions with exam / pattern / section / topic | Questions | questions, question_versions/options/answers, exams, patterns, sections, mock_tests | 795 questions, last 10-27; QUESTION_ARCHIVE ×8 (10-17) | S | ● |
| `/admin/questions/factory` | Question drafts | the draft → review → publish workflow | Question Factory | question_versions, import batches, exam_question_mappings, audit | 45 import batches, last 10-27; QF_IMPORT_DRAFTS ×1 | S | ● |
| `/admin/bulk-import` | Bulk import | CSV / JSON question import + image upload; can also create exams, cycles, patterns, templates, mocks | Questions (+ mocks) | question drafts, storage `question-images`, exams…mock_tests | last batch 10-27 | S | ● |
| `/admin/question-reports` | Question reports | triage student errata reports | Questions (care) | question_errata_reports | 6 reports, last 10-26 | A | ● |
| `/admin/reports` | (alias) | redirect → /admin/question-reports | none | none | none | A | ○ |

### Learning
| Route | Title | Purpose | System | Tables | Evidence | Roles | Nav |
|---|---|---|---|---|---|---|---|
| `/admin/lessons` | Lessons | list of DB-block lessons (node lessons + legacy unit lessons) | Lessons (CA-3/4) | learning_documents, document_versions | 1 NODE_LESSON published; LESSON_PUBLISH ×2 (10-27) | A | ● |
| `/admin/lessons/[id]` | Lesson editor | block editor, preview, publish | Lessons | fn_lesson_save_draft / publish | as above | A | ○ (from list) |
| `/admin/lessons/[id]/translate` | Hindi translation | Hindi version of a lesson | Lessons | fn_lesson_save_draft | none | A | ○ (from lesson) |
| `/admin/lessons/generate` | Lesson generator | pick a node → LESSON prompt → paste → draft | Lessons | taxonomy, syllabus, prompt_templates · W: fn_lesson_create_node_document / save_draft | LESSON_DRAFT_SAVE ×2 (10-27) | A | ● |
| `/admin/lessons/coverage` | Coverage and launch | per-exam coverage matrix + course launch / mode | Courses (CA-5/7) | fn_exam_course_outline, servable lessons · W: exam_course_launches | none launched | A | ● |
| `/admin/lessons/notes` | Exam notes | per exam × node notes | Exam notes (CA-7) | exam_node_notes | 0 notes | A | ● |
| `/admin/prompts` | Prompt templates | edit / activate the LESSON, SYLLABUS, TRANSLATE_HI templates | Prompts (CA-4) | prompt_templates (audited RPCs) | 6 versions, last 10-28 | A | ● |
| `/admin/content` | Content Studio (legacy) | the old "learning unit" model: units, documents, access level, archive, AI modal, coverage tab; MDX compile / publish **retired** (throws) | legacy learning units | learning_units, learning_documents, document_versions, learning_assets | **1 unit; its 2 documents are ARCHIVED; 0 legacy documents published** | S (some actions A) | ● |
| `/admin/content/topics` | Topic links | attach legacy learning units to master topics | legacy learning units | learning_units (W topic_id, audited) | 1 unit | S | ● |
| `/admin/descriptive` | Descriptive | "Mains descriptive questions" CMS; **create is broken** (writes a table that does not exist) | Descriptive (unbuilt) | descriptive_questions (0 rows) | 0 rows; student `/descriptive` is noindex, not linked | S | ● |

### Exams and syllabus
| Route | Title | Purpose | System | Tables | Evidence | Roles | Nav |
|---|---|---|---|---|---|---|---|
| `/admin/exams` | Exams | exam list: publish / archive / controlled delete; links to Knowledge + Onboarding | Exams | exams, cycles, posts, orgs | 5 exams, last 10-15 | S | ● |
| `/admin/exams/onboarding` | Exam onboarding | step wizard: identity, cycle, posts, readiness, AI import | Exams | exams, exam_cycles, exam_posts | as above | S | ○ (from Exams) |
| `/admin/exams/[id]` | (alias) | redirect → onboarding?examId= | none | none | none | S | ○ |
| `/admin/exams/ai-onboarding` | (alias) | redirect → /admin/exams (its old component is orphaned code) | none | none | none | S | ○ |
| `/admin/exam-knowledge` | Exam Knowledge | versioned, reviewed exam pages (eligibility, pattern, …) with sources and claims | Exam Knowledge (EK) | exam_knowledge_documents, exam_doc_versions, sources, claims | **70 documents, 80 versions, 13 sources (last 10-12); the only source of the public exam module pages** | S | ● |
| `/admin/syllabus` | Syllabus | versions per exam: drafts, publish, archive, legacy JSON import | Syllabus (GAP2-4) | exam_syllabus_* via fn_syllabus_* | 32 versions; v4 PUBLISHED 10-29 | S | ● |
| `/admin/syllabus/[id]` | Syllabus editor | tree editor, validation, publish dialog | Syllabus | as above | as above | S | ○ (from list) |
| `/admin/syllabus/intake` | Syllabus intake | prompt → paste AI syllabus → review | Syllabus intake (CA-2) | syllabus_intake_* | 1 session, 10-28/29 | A | ● |
| `/admin/syllabus/intake/[id]` | Intake review | guided review of one intake | Syllabus intake | as above | as above | A | ○ |
| `/admin/taxonomy` | Taxonomy | the master tree: create, rename, move, merge, aliases, internal, content source | Master tree (CA-1) | canonical_taxonomy_nodes, aliases | 214 nodes; TAXONOMY_* 187 rows (10-27…29) | A | ● |
| `/admin/categories` | Categories | **rows of `exams`** (title, active): the same table as Exams | Exams (duplicate) | exams | last 10-15 | S | ● |
| `/admin/schedules` | Schedules | **rows of `exam_cycles`**: the same as the onboarding cycle step | Exams (duplicate) | exam_cycles | 4 cycles, last 10-01 | S | ● |

### Mock tests
| Route | Title | Purpose | System | Tables | Evidence | Roles | Nav |
|---|---|---|---|---|---|---|---|
| `/admin/mock-tests` | Mock tests | list / create / publish mock papers | Mocks | mock_tests (+ may create cycles, patterns, templates) | 8 mocks, last 08-28 | S | ● |
| `/admin/patterns` | Patterns | exam patterns (+ their templates) | Mocks | exam_patterns, mock_templates | 1 pattern, last 08-27 | S | ● |
| `/admin/sections` | Sections | pattern sections mapped to subjects | Mocks | pattern_sections | 4, last 08-27 | S | ● |
| `/admin/mock-tests-management` | Mock test setup (orphan) | read-only counts + links; **not linked anywhere** | none | none | none | S | ○ |

### Students, care, payments, system, dormant
| Route | Title | Purpose | System | Tables | Evidence | Roles | Nav |
|---|---|---|---|---|---|---|---|
| `/admin/users` | Users | read-only student directory | Students | user_profiles, auth users | none (read-only) | A | ● |
| `/admin/pro-library` | Library Pro | grant / revoke free Pro to library members | Entitlements | user_entitlements (LIBRARY) via RPCs | 0 entitlements | A | ● |
| `/admin/institutes` | Institutes | public institute directory entries | Institutes | institutes | 0 rows | S | ● |
| `/admin/support` | Tickets | support queue (flag SUPPORT) | Support | support_tickets | 0 tickets | S | ● (flag) |
| `/admin/community` | Community flags | moderate discussion flags | Community | discussion_moderation_flags | 0 flags | S | ● |
| `/admin/billing` | Billing | plans + orders (flag PAYMENTS, nav only) | Payments | subscription_plans, payment_orders | 1 plan (08-26), 0 orders | A | ● (flag) |
| `/admin/premium` | Premium | Pro access configuration, promo passes, curated mocks | Payments / access | premium_system_configs, user_entitlements, mock_tests, test_series | 2 configs, last 10-12 | A | ● (flag) |
| `/admin/mfa` | Security (MFA) | the admin's own MFA enrolment | Account | Supabase Auth MFA | n/a | S (aal1) | ● |
| `/admin/settings` | Settings | read-only Studio settings | System | premium_system_configs, exams | n/a | A | ● |
| `/admin/design-system` | Design system | component preview, no data | Dev tool | none | n/a | S | ● |
| `/admin/rewards` | Rewards store | reward catalogue + redemptions | Gamification (dormant) | reward_catalog, reward_claims | 6 items, 08-29 | A | ● (collapsed) |
| `/admin/gamification` | Coins | coin stats + reward policies | Gamification (dormant) | reward_policies | 5, 08-29 | A | ● (collapsed) |
| `/admin/achievements` | Achievements | live-test achievements (flag LIVE_TESTS) | Live tests (dormant) | achievement definitions, badges | n/a | S | ● (flag) |
| `/admin/live-tests` (+ `[id]/results`, `[id]/intelligence`, `intelligence`) | Live tests | events, results, intelligence (flag LIVE_TESTS) | Live tests (dormant) | live_test_* | n/a | S / A | ● (flag) / ○ |
| `/admin/adaptive` | Adaptive Testing | adaptive engine config (flag ADAPTIVE) | Adaptive (dormant) | adaptive_* | n/a | A | ● (flag) |

## 2. Classification

| Route | Class | Becomes |
|---|---|---|
| Today | KEEP | Today |
| Focus review | MERGE INTO Questions | the "Review" tab of Questions; badge kept on Questions; a Today tile |
| Question bank / Question drafts | MERGE INTO Questions | tabs "Bank", "Drafts" |
| Bulk import | MERGE INTO Questions (action) | "Import questions" button on Questions |
| Question reports | MERGE INTO Reports & support | tab "Question reports" |
| `/admin/reports` | RETIRE (alias) | keep the redirect |
| Lessons, Lesson editor, Translate | KEEP | Lessons (list, editor, translate) |
| Lesson generator | MERGE INTO Lessons (action) | "New lesson" button opens the generator |
| Coverage and launch | KEEP (move) | EXAMS › Coverage & launch |
| Exam notes | MERGE INTO Exams | tab "Notes" in the exam (admin-only tab) |
| Prompt templates | KEEP (move) | SETTINGS › Prompt templates |
| **Content Studio (legacy)** | **RETIRE** → read-only | Lessons › tab "Legacy (read only)" (see §3) |
| **Topic links** | **RETIRE** → read-only | shown inside the legacy tab (see §3) |
| **Descriptive** | **UNKNOWN** (owner) | hide from nav now; keep or drop the feature (§3) |
| Exams + Onboarding | KEEP | Exams (list → exam with tabs) |
| Exam Knowledge | MERGE INTO Exams | tab "Knowledge" (the live source of exam pages: KEEP the tool) |
| Categories | MERGE INTO Exams | same table; "active" toggle already on Exams (owner Q) |
| Schedules | MERGE INTO Exams | tab "Cycles" (the same `exam_cycles`) |
| Syllabus + editor | KEEP | Syllabus (versions, editor) |
| Syllabus intake (+ review) | MERGE INTO Syllabus (action + tab) | "Start intake" button; tab "Intakes" |
| Taxonomy | KEEP (rename) | CONTENT › Master tree (tabs: Tree, Aliases) |
| Mock tests, Patterns, Sections | MERGE INTO Mock tests | tabs "Tests", "Patterns", "Sections" |
| Mock test setup (orphan) | RETIRE | redirect → Mock tests |
| `/admin/exams/[id]`, `/admin/exams/ai-onboarding` | RETIRE (alias) | keep the redirects; delete the orphaned component code |
| Users, Library Pro | KEEP / MERGE | Students (tabs "Students", "Library Pro") |
| Tickets, Community flags | MERGE INTO Reports & support | tabs |
| Institutes | KEEP (move) | CONTENT › Institutes (a public directory) |
| Billing, Premium | MERGE INTO Plans & payments | tabs (group hidden while PAYMENTS is off, as today) |
| MFA, Settings, Design system | MERGE INTO System | tabs "Settings", "Security (MFA)", "Design system" |
| Rewards, Coins, Achievements, Live tests, Adaptive | KEEP (dormant) | the collapsed "Not live yet" group, unchanged, behind flags |

## 3. RETIRE: dependencies and plan (no data is deleted)

| Retired page | Live, student-facing dependency? | Plan | Old URL → |
|---|---|---|---|
| Content Studio (legacy) `/admin/content` | Its tables are **live** and are the source of `/articles/[slug]`. But today **0 legacy documents are published**: 1 unit, 2 ARCHIVED docs. The only published lesson is a NODE_LESSON, served via `/learn`. | Read-only "Legacy" tab in Lessons, which lists the unit and documents with their status. Creating units / documents and the AI modal are removed (the generator replaces them). Access-level and archive stay as admin actions until the legacy docs are migrated or confirmed unused. Data kept. | `/admin/lessons?tab=legacy` |
| Topic links `/admin/content/topics` | Decides which topic a legacy `/articles` document belongs to. 1 unit; nothing published. | Read-only in the same Legacy tab (the unit's topic shown). The relink stays an admin action there while legacy documents exist. | `/admin/lessons?tab=legacy` |
| Descriptive `/admin/descriptive` | `/descriptive` student pages read `descriptive_questions` (0 rows), noindex, not linked. The admin cannot create (broken). | **Owner decides (Q-D):** (a) drop the feature: hide the admin page, student pages return 404, the empty tables stay; or (b) build it properly later as its own phase. Until then: out of the nav (it cannot work). | `/admin` (or the rebuilt page) |
| Mock test setup `/admin/mock-tests-management` | None (read-only counts). | Remove the page; keep a redirect. | `/admin/mock-tests` |
| Aliases (`/admin/reports`, `/admin/exams/[id]`, `/admin/exams/ai-onboarding`) | None. | Keep the redirects (bookmarks); delete the orphaned `ai-assisted-onboarding-studio.tsx`. | as today |

## 4. Target IA

Rules:
- the nav holds nouns only;
- actions (generate, intake, import) are page buttons;
- ≤ 7 groups and ≤ 6 children per group;
- English labels;
- every item and tab keeps its page's existing guard (`ADMIN_ONLY_ROUTES`). A tab whose page is admin-only is hidden from staff, exactly like a link today.

```
Today                                   S   (tiles link into the queues; Focus review badge moves to Questions)
EXAMS
  Exams                                 S   tabs: Overview (onboarding) · Knowledge · Cycles · Notes (A)
  Syllabus                              S   versions + editor · tab Intakes (A) · [Start intake] (A)
  Coverage & launch                     A
CONTENT
  Lessons                               A   list · editor · translate · tab Legacy (read only) · [New lesson]
  Questions                             S   tabs: Bank · Drafts · Review (badge) · [Import questions]
  Current affairs                       S
  Master tree                           A   tabs: Tree · Aliases
  Institutes                            S
TESTS
  Mock tests                            S   tabs: Tests · Patterns · Sections
STUDENTS
  Students                              A   tabs: Students · Library Pro
  Reports & support                     S   tabs: Question reports (A) · Tickets (flag) · Community flags
SETTINGS
  Prompt templates                      A
  Plans & payments                      A   tabs: Plans · Premium access (group hidden while PAYMENTS is off)
  System                                S   tabs: Settings (A) · Security (MFA) · Design system
Not live yet (collapsed, flags)             Rewards store · Coins · Achievements · Live tests · Adaptive
```

That makes 7 groups (Today, Exams, Content, Tests, Students, Settings, Not live yet). The largest group has 5 children, and there are 15 primary nav items, down from about 40 links today.
The draft listed an "Admin users" page, but **no such page exists**; `/admin/users` is the student directory. It is omitted until the owner wants one (Q-U).
"Schedules" moves from TESTS to EXAMS › Cycles, because the evidence shows a schedule is an exam cycle row.

## 5. Old → new route map, search, breadcrumbs

| Old | New (Phase B) | How |
|---|---|---|
| `/admin/review/focus` | `/admin/questions?tab=review` | 308 redirect |
| `/admin/questions/factory` | `/admin/questions?tab=drafts` | 308 |
| `/admin/bulk-import` | `/admin/questions/import` (opened from the button) | 308 |
| `/admin/question-reports`, `/admin/reports` | `/admin/support?tab=question-reports` | 308 |
| `/admin/community` | `/admin/support?tab=flags` | 308 |
| `/admin/lessons/generate` | `/admin/lessons/new` | 308 |
| `/admin/lessons/notes` | `/admin/exams/<exam>?tab=notes` (no exam selected → `/admin/exams`) | 308 |
| `/admin/lessons/coverage` | `/admin/coverage` | 308 |
| `/admin/content`, `/admin/content/topics` | `/admin/lessons?tab=legacy` | 308 |
| `/admin/descriptive` | per Q-D | 308 |
| `/admin/exam-knowledge` | `/admin/exams/<exam>?tab=knowledge` (no exam → `/admin/exams`) | 308 |
| `/admin/categories` | `/admin/exams` | 308 |
| `/admin/schedules` | `/admin/exams/<exam>?tab=cycles` (no exam → `/admin/exams`) | 308 |
| `/admin/syllabus/intake` | `/admin/syllabus?tab=intakes` (the review page `/admin/syllabus/intake/[id]` stays) | 308 |
| `/admin/taxonomy` | `/admin/master-tree` | 308 |
| `/admin/patterns`, `/admin/sections` | `/admin/mock-tests?tab=patterns` / `sections` | 308 |
| `/admin/mock-tests-management` | `/admin/mock-tests` | 308 |
| `/admin/users`, `/admin/pro-library` | `/admin/students` (+ `?tab=library-pro`) | 308 |
| `/admin/billing`, `/admin/premium` | `/admin/payments` (+ `?tab=premium`) | 308 |
| `/admin/settings`, `/admin/mfa`, `/admin/design-system` | `/admin/system` (+ tabs) | 308; MFA keeps its aal1 exception |

Redirects live in `next.config.ts` (permanent), and every old URL keeps working. `ADMIN_ONLY_ROUTES` gets the new paths, and the old paths stay listed until the redirects are removed, so a staff user is refused before the redirect.

**Ctrl-K:** today it searches records only (questions, users, tickets). Phase B adds:
- "Go to" entries generated from the nav (nouns, role- and flag-aware);
- action entries: "Start syllabus intake", "New lesson", "Import questions", "New mock test".

**Breadcrumbs:** today they are hand-passed on 3 exam pages only. Phase B derives them for every page from the nav tree as Group › Item › Tab (or the record title), e.g. "Exams › SSC CGL › Knowledge".

## 6. Risks, gates, open questions

**Risks:**
- **Mixed access in one page:** e.g. Exams (S) with Notes (A); Reports & support with Question reports (A). Each tab must keep its own guard, both server-side and in visibility. The NAV-IA gate checks that tab access = the guard of the page it renders.
- **Gates that read the nav:** `test_admin_ux1b`, `test_ux1b_shell` U-2, SEC-1B and SEC-1C (the `ADMIN_ONLY_ROUTES` mirror), CA2 S-01 (nav entry for intake), the Today tiles, and `revalidatePath` targets. Phase B updates them **in the same commit**, without weakening them.
- **The legacy tab:** the only "live" risk is a legacy document being re-published. Today 0 are published, so the read-only change is safe. Archive and access-level actions stay admin-only until Q-L is answered.
- **Bookmarks and links in old reports or docs:** covered by permanent redirects.
- **Exam Knowledge** is the sole source of public exam module pages. It moves into a tab; its behaviour must not change.

**Phase B gate (NAV-IA):** it fails on:
- a nav label containing "legacy", or a verb-first item ("Generate", "Import", "Start", "New");
- two items or tabs pointing to the same route;
- a group with > 6 children, or > 7 groups;
- a nav href without a page, or a route in `ADMIN_ONLY_ROUTES` that is linked for staff;
- an old URL without a redirect.

Each rule gets a negative control.

**Questions for the owner:**
- **Q-D Descriptive:** the Mains descriptive answers feature has 0 questions, a broken admin page, and hidden student pages. Drop it, or rebuild it later as its own phase?
- **Q-C Categories:** is a "category" meant to be anything other than an exam (e.g. a mock-test grouping such as "SSC")? The table is `exams`. Is it OK to fold it into Exams?
- **Q-L Legacy lessons:** 1 legacy unit and 2 archived MDX documents remain. Keep them read-only forever, or migrate / archive and remove the legacy tab later?
- **Q-F Focus review:** keep it as a tab inside Questions (proposed), or as its own top item because it is the daily work?
- **Q-K Exam Knowledge:** confirm it stays the tool for exam info pages (eligibility, pattern, …). It is live (70 documents) and becomes the Exams › Knowledge tab.
- **Q-U Admin users:** you named an "Admin users" page in SETTINGS, but none exists. Is one wanted (staff invitations, roles)? That would be a new feature, not part of IA.
- **Q-I Institutes:** 0 rows. Keep it in CONTENT, or move it to "Not live yet" until the directory is used?
- **Q-S System:** should Design system stay visible to staff (a dev tool), or become admin-only / dev-only?
