# GAP2-4b: admin syllabus editor, admin English-only, canonical syllabus readers

> **Two batches.** Each has its own full gates and pre-authorised commit (hard-stop rule).
> - **Batch 1:** admin syllabus editor + admin English-only cleanup.
> - **Batch 2:** re-point the syllabus readers to the canonical read model.
>
> **Architect notes recorded at 4a acceptance:**
> - terminating a DB session is allowed only for the suite's own orphan, and must be recorded;
> - backlog TEST-HARNESS-TXN;
> - SSC GD stays DRAFT.

## Batch 1: admin syllabus editor + English-only

### 1.1 Pages (admin and staff; SEC-1C guards; design system; zero on the ratchet)

| Route | Content |
|---|---|
| `/admin/syllabus` | Exam picker (all exams, including inactive ones; read-only lookup with the service role after the page guard, because the session client sees only active exams). Version list per exam: version, status (Draft / Published (live) / Archived), source, cycle, published date and publisher (from the `SYLLABUS_PUBLISH` audit row). Actions: **New empty draft**, **New draft from published** (enabled only when a published version exists for the chosen cycle), **Open editor / View**, **Archive** (admin only, confirm dialog). |
| `/admin/syllabus/[id]` | Editor for a DRAFT; read-only view for PUBLISHED / ARCHIVED |

**The editor (`components/admin/syllabus/syllabus-editor.tsx`):**
- **Tree:**
  - WAI-ARIA tree view: `role="tree"` / `treeitem` / `group`, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`, `aria-selected`, roving tabindex.
  - Keyboard: ↑ ↓ move, → opens or enters, ← closes or goes to the parent, Home / End, Enter / Space select.
  - Each item shows its kind badge, title, the topic count on UNIT nodes, and a "Fix" badge on nodes with validation errors.
- **Structure actions:**
  - add section / paper (top level);
  - add unit / sub-section inside;
  - move up / down (swaps order);
  - move under another node (PAPER / SECTION parents only, never the node's own subtree);
  - delete with a confirm dialog that states how many nested nodes go with it.
- **Details:**
  - title, kind, weightage tier ("Not set" allowed), expected questions min / max, description, mandatory switch;
  - **empty expected range = unknown (NULL), never 0**;
  - range validated in the form and again in the RPC.
- **Topic picker (UNIT only):**
  - searches active TOPIC nodes by name or subject, with a subject filter;
  - multi-select checkboxes;
  - optional weights with a **live sum check**: each weight above 0 and at most 1, and they must add up to 1.
- **Validation panel:** the `fn_syllabus_validate` report.
  - Errors block publishing, each with **Go to node**, which expands the ancestors and focuses the node.
  - Warnings are shown in a disclosure and never block.
  - **Validate now** re-runs the check.
- **Publish:**
  - **Admin only.** The button is disabled while errors exist.
  - The confirm dialog states what will be archived ("Students will see this version instead of version N, which will be archived", or that nothing is published yet).
  - The result message states the archived version and that an audit record was written.
  - **Staff see the button disabled** with "Only an admin can publish. Ask an admin to review this draft."
  - No admin audit page exists, so the publisher and time appear in the version list instead of an audit link.
- **Read-only** PUBLISHED / ARCHIVED views show the tree and details without edit controls.

### 1.2 Server actions (`app/admin/syllabus/actions.ts`)

| Action | Guard | RPC |
|---|---|---|
| `createSyllabusDraftAction` | staff / admin | `fn_syllabus_create_draft` |
| `upsertSyllabusNodeAction` | staff / admin | `fn_syllabus_upsert_node` |
| `moveSyllabusNodeAction` | staff / admin | `fn_syllabus_move_node` |
| `deleteSyllabusNodeAction` | staff / admin | `fn_syllabus_delete_node` |
| `setUnitMappingsAction` | staff / admin | `fn_syllabus_set_unit_mappings` |
| `validateSyllabusVersionAction` | staff / admin | `fn_syllabus_validate` |
| `publishSyllabusVersionAction` | **admin** | `fn_syllabus_publish` |
| `archiveSyllabusVersionAction` | **admin** | `fn_syllabus_archive_version` |

- **Order of work:** `guardAdminAction` comes first; then input checks (uuids, kinds, tiers, integer ranges, weights length); then the **RPC on the caller's session client**, so the database re-checks the JWT role and audits in the same transaction.
- **Never used:** no table writes, no service role.
- **Errors** go through `lib/syllabus/syllabus-errors.ts`:
  - 42501 → FORBIDDEN;
  - `SYLLABUS_*` codes, cycle and duplicate-slug conditions → curated VALIDATION text;
  - everything else → generic DB_ERROR.
  - **No database text or ids reach the UI.**
- **Publish validation failure** returns the report, and nothing is written.
- **SEC-1B:** the actions are auto-included, with publish and archive in the admin-only set.

### 1.3 QA test exam (migration 081)

- **What:** `qa-syllabus-test`, "QA Syllabus Test (internal)", **inactive**, idempotent. It is a permanent fixture like the QA identities.
- **Why:** the editor's end-to-end test publishes and archives through the real UI, which must never touch a real exam. Published rows are student-visible, and published / archived versions are immutable, so they can't be cleaned up.
- **Students never see it:** the exam hub, `/exams` and the sitemap skip inactive exams.
- **Test history:** archived TEST versions remain on this exam only; drafts left over by an aborted run are archived by the test.
- **Migration discipline:** backup `pre-081-gap2-4b-…`, dry-run → apply → ledger.

### 1.4 Admin English-only (decision #35; no schema change)

| Location | Change |
|---|---|
| Question manager | Hindi removed from the two form selects and the language filter; the conditional "Hindi" badge removed; "bilingual support" copy removed |
| Schedules manager | Medium is **English only** in the program form, the day form and the summary card (Bilingual / Hindi options and the "Students can switch language" copy removed) |
| Bulk Import Studio | Shows "English", or "Not English (English only)" for a pasted non-English row (the generation option was already removed in UX-1b) |

**Permanent static test E-04:** no admin UI file offers a Hindi or bilingual `<option>`, label or Devanagari text.

### 1.5 Found during the batch-1 build

- **Bug, fixed:** the editor reset unsaved form edits and the topic selection on *every* `router.refresh()`, because the reset was keyed on object identity. It is now keyed on a signature of the node's saved data. E-05 has a regression check: a late refresh must not clear a ticked topic.
- **Bug, fixed (robustness):** every edit used to wait for `router.refresh()` inside the transition, so one failed refresh left the editor pending forever.
  - Editing actions now return the fresh editor state (nodes + validation report, read with the caller's session through the shared `lib/syllabus/editor-state.ts`), and the editor applies it immediately.
  - The page refresh is a background sync outside the transition.
  - A successful publish switches the view to read-only at once.
- **Fixed:** the tree's mouse-only expand chevron is now a decorative span, not a nameless button (keyboard users use the arrow keys).
- **Environment:**
  - **The problem.** Intermittent DNS failures for the Supabase pooler / auth hosts made some `router.refresh()` calls fail in the middleware's `auth.getUser()` ("fetch failed", visible in the server log) while the RPC itself had succeeded (audit rows present).
  - **The handling.** The live test waits for stable DNS before running. Each attempt restarts the server, and a failing attempt is reported with its server-log "fetch failed" count.

### 1.6 Batch 1 gates

Run on a local production build.

| Gate | Result |
|---|---|
| tsc / lint / build / `db:types:check` | 0 / 0 / OK / OK |
| **GAP2-4b editor** offline (E-01 … E-04) | **4/4** |
| **GAP2-4b editor live** (E-05 staff draft → section → unit → topic → validate, staff publish disabled, keyboard tree, labelled controls; E-06 admin publish → read model AVAILABLE → archive → NO_SYLLABUS; E-07 seeded drafts untouched, no QA draft left) | **7/7** (server log: 0 fetch failures) |
| GAP2-4a syllabus | 12/12 (see the G-11 note) |
| RLS suite | 8/8 |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 · 3/3 · 4/4 |
| SEC-1B / 1C / 1D | 26/26 (publish / archive in the admin-only set) · 22/22 (inventory 37) · 14/14 |
| Design ratchet / UX-1b shell / QA guard | 7/7 (the admin syllabus editor is held to zero) · 6/6 · 8/8 |
| Signed-in smokes `admin-pages` (incl. `/admin/syllabus`), `staff-content` (`/admin/content` + `/admin/syllabus`) | all passed |

**Notes:**
- **GAP2-4a G-11** checked that *no* version anywhere was non-DRAFT. The QA test exam now (correctly) holds ARCHIVED TEST versions, so the check is scoped: real exams hold only DRAFTs, and the QA exam must never stay PUBLISHED. Re-run: 12/12.
- **Earlier live attempts** failed only on network: DNS outages / "fetch failed", or a run my own overlapping retry loop interrupted. The design changes in 1.5 removed the editor's dependence on page refreshes. The recorded run passed on its first attempt.

## Batch 2: re-point readers to the canonical read model

### 2.1 Student exam hub (d)

- **Single source.** `/exams/[slug]` and `/exams/[slug]/cycle/[cycleYear]` render the syllabus from `fn_exam_syllabus_read_model` only. The candidate service makes one RPC for the exam + active cycle; there is no table-derived fallback.
- **`components/exams/exam-syllabus-section.tsx`** (new; `components/ui` only; replaces the deleted `exam-syllabus-navigator.tsx`):

| State | Rendering |
|---|---|
| `NO_SYLLABUS` | `EmptyState` **"Syllabus coming soon"** — no topics, counts or tiers |
| `UNAVAILABLE` (RPC failed) | warning `Alert` "The syllabus could not be loaded right now." |
| `AVAILABLE` | PAPER / SECTION groups as disclosures (`<details>`), UNIT cards; weightage tier badge; expected range **only when known** (an unset range is never shown as 0); per topic "N practice questions" / "Questions coming soon" and "N lessons" / "Lessons coming soon"; totals and the published date |

- The section is always present (`<section id="syllabus" aria-labelledby="syllabus-title">`).
- **Pattern drift fixed** (live schema). Patterns are read through `exam_cycles!inner(exam_id)` (`exam_patterns` has no `exam_id`). Sections come from `pattern_sections(section_name, section_order, num_questions, marks_per_question, negative_mark)` (the old `exam_sections` relation does not exist). Numbers are nullable and never defaulted.

### 2.2 Re-pointed readers (e)

| Reader | Before | After |
|---|---|---|
| Exam hub / cycle hub (`exam-knowledge-candidate.service.ts`) | `exam_syllabi` / `exam_topics` / `exam_unit_mappings` + `questions` (EKC-155) | read model RPC |
| Curriculum coverage (`curriculum-coverage.service.ts`) | `exam_unit_mappings` → `exam_topic_mappings` (B-CURRICULUM-MAPPING ×5) | `exam_syllabus_canonical_mappings` → UNIT node of a PUBLISHED + active version. **Nothing published → UNAVAILABLE** ("no published syllabus yet (publish one in /admin/syllabus)"). `mapUnitToExam` and `mapUnitToExamAction` are deleted (no writes to `exam_unit_mappings`). |
| Exam onboarding (wizard step 4, importer, service, page) | wrote a legacy "syllabus projection" | **Handoff panel**: published version / draft count, plus "Open the syllabus editor" (`/admin/syllabus?exam=`). `saveSyllabusProjection*` deleted. Exam deletion is blocked while syllabus versions exist ("archive or deactivate the exam instead"). |
| Readiness (`exam-readiness.service.ts`) | legacy projection counts | read model: "Published syllabus", "Units mapped to canonical topics" |
| Question-factory context (`question-context-builder.service.ts`) | `exam_topics` | UNIT nodes of PUBLISHED versions mapped to the topic (tier, cognitive depth) |
| Exam-knowledge context (`exam-knowledge-context-builder.service.ts`) | `questions.topic:topics`, `year` / `tier` (EKX-221), patterns by `exam_id` | `canonical_topic_id` → node embed, `question_sources`, patterns via cycles; real subject distribution; no defaults |
| Onboarding context (`exam-onboarding-context-builder.service.ts`) | `exam_topics` by a non-existent `exam_id` (unused result); cycle columns that do not exist | read removed; cycles by `status = 'active'` |
| Content Studio unit detail (`admin-content-studio.service.ts`) | `exam_unit_mappings` ×2 | `lib/syllabus/published-topic-exams.ts`: one query for the topic's PUBLISHED syllabus exams; the unused hierarchy read is removed |
| AI curriculum context (`services/ai/curriculum-context-builder.service.ts`) | `exam_unit_mappings` → `exam_topics` | same helper; node depth / tier mapped to the AI vocabulary; nothing published → no exam context |
| `services/exam-syllabus.service.ts` (ES-33 / ES-45) | dead legacy service | **deleted** (its legacy test track retired) |

- **Static guarantee:** no file in `app` / `components` / `services` / `lib` / `actions` / `hooks` / `middleware.ts` names `exam_syllabi`, `exam_topics`, `exam_unit_mappings` or `exam_topic_mappings` in code (R-01). The tables themselves stay until 4c.
- **GAP2-3 registry:** EKC-161, EKX-221 and ES-45 are marked `retired: 'GAP2-4b'`. S-02 now asserts the old embed never comes back. `UNTOUCHED` (EKC-155, ES-33) is empty. 15/15.

### 2.3 TYPES-1: B5 and the GAP2-4 tags (f)

| | Before | After |
|---|---|---|
| Query escapes (ratchet) | 121 | **59** (−62 = B5) |
| `@ts-expect-error` | 17 | **12** (B-CURRICULUM-MAPPING ×5 removed; exception recorded `GAP2-4b 17 → 12`) |
| `as any` / `: any` | 256 / 887 | 250 / 806 |
| Remaining batches | B3 (TEST-CA), B5 (GAP2-4) | **B3 only** |
| Register | … + `TYPES-1:B-CURRICULUM-MAPPING` | entry removed (34 registered) |

- **How B5 was removed.** Every exam-knowledge / syllabus client is typed `AppSupabaseClient`. The phase-3R workbench's typed rows are narrowed in one place, `lib/syllabus/reconciliation-rows.ts`. `exam-syllabus-resolution` takes `AppSupabaseClient | PgQueryClient` with explicit narrowing helpers. The two EK actions dropped `createAdminServerSupabaseClient() as any`.
- **`test_types1_close`:** no GAP2-4-owned file or tracked tag remains. X-2 now requires B3 only and no register entry owned by GAP2-4. 3/3: every failing live select is quarantine / B3 / TEST-CA / tracked.

### 2.4 Found and fixed while typing (real defects, not just types)

| Where | Defect | Fix |
|---|---|---|
| EK context builder + EK studio version view | `exam_claims.module_key` does not exist → the claims read always failed (42703), so prompts / the studio had **no claims** | filter through the claim's document: `exam_doc_versions!inner → exam_knowledge_documents!exam_doc_versions_document_id_fkey!inner(module_key)` (the FK hint resolves PGRST201, caught by the live select audit) |
| EK studio workspace | `exam.name`, `org.title`, `exam.conducting_body`, `org.official_portal_url` do not exist → the exam name was always empty; `compiled_mdx` was read but never selected → **COMPILED** status unreachable | real columns (`title`, `name`, `official_website`); `compiled_mdx` selected |
| EK claim verification | `updateClaimVerification` wrote `verified_by_user_id` / `verified_at`, which `exam_claims` lacks → **every claim verification failed** | only real columns are written; follow-up **EK-CLAIM-VERIFY** (backlog) if the audit trail is wanted |
| Candidate service, prefetched mode | (introduced in this batch, caught by 3H.5.2) an offline caller without a syllabus reached `client.rpc` on an undefined client | prefetched mode never touches the network: no syllabus → `UNAVAILABLE` |
| Phase-3R tree importer | inserts lacked `version_number` / `node_depth` / `node_kind` and wrote around the role-checked, audited RPCs | **fail-closed** ("author the syllabus in /admin/syllabus"); typed read kept; deleted with the workbench in 4c |
| Signed-in smoke | `/Application error/` matched published exam content on `/exams/ssc-cgl` | detection narrowed to `app/error.tsx` and Next's real error page text |

### 2.5 Tests (g)

**`scripts/test_gap2_4b_readers.cjs`** (new permanent gate; DB parts inside `BEGIN … ROLLBACK`, `lock_timeout` 5 s, `ROLLBACK` in `finally`):

| ID | Assertion |
|---|---|
| R-01 | no runtime reader of the four legacy tables (555 files, comments ignored) |
| R-02 | hub and cycle pages render `ExamSyllabusSection`; the candidate service calls only `fn_exam_syllabus_read_model`; navigator, `exam-syllabus.service.ts`, `mapUnitToExam`, the onboarding projection and all `B-CURRICULUM-MAPPING` tags are gone; the tree importer fails closed |
| R-03 | the section imports only `components/ui` (+ format, types, icons); NO_SYLLABUS / UNAVAILABLE render only their notices |
| R-04 | **SSC CGL today:** read model (anon) `NO_SYLLABUS` → "Syllabus coming soon"; no tiers, counts or legacy SSC GD topic names |
| R-05 | a TEST version on the **inactive QA exam** (staff builds, admin publishes, all rolled back) → `AVAILABLE`, rendered with section + units, "High yield" / "Core", "3–5 questions expected" only on the unit that has a range, the exact published-question count, disclosure groups |
| R-06 | coverage with today's data → **UNAVAILABLE** (0 published mappings); with the TEST version published (same PostgREST rules) → **AVAILABLE**, the mapped unit carries the derived exam, no other unit does |
| R-07 | `--base` (local build): `GET /exams/ssc-cgl` shows "Syllabus coming soon" and no legacy topics |

**Also:**
- `/exams/ssc-cgl` was added to the `student-pages` smoke and to the anonymous production smoke.
- The read-model fixture `scripts/fixtures/syllabus_read_model.cjs` is shared by the EK suites.
- **EK suites (not permanent gates; baseline run in a worktree at `24c431b`):**
  - 3H.1, 3H.2, 3H.3, 3H.4, 3H.4.1, 3H.4.2 and 3H.5.1 have **identical failure sets** before and after (the TEST-EK items).
  - 3H.5.2 and 3H.5.3 had asserted the removed legacy curriculum / navigator and the non-existent `exam_sections` mock. They were re-pointed to the read model and the live `pattern_sections` shape without loosening any assertion (exact counts, unknown range stays `null`, missing syllabus → UNAVAILABLE). Result: **21/21 and 15/15**, as before.

### 2.6 Batch 2 gates

Run on a local production build (`next start -p 3100`).

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| **GAP2-4b readers** (with `--base`) | **7/7** |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 (T-01 `db:types:check` OK) · **3/3** · 4/4 |
| GAP2-4a syllabus / RLS (SEC-HOTFIX-4) | 12/12 · 8/8 |
| GAP2-4b editor offline / **live** (QA exam only) | 4/4 · 7/7 |
| GAP2-1b / 2a / 2b / 3 (`--db`) | 13/13 · 11/11 · 18/18 · 15/15 |
| HOTFIX-2 coverage / QF-1 offline | 6/6 · 73/73 |
| SEC-1B / 1C / 1D (offline) · SEC-1B / 1C **live** | 26/26 · 22/22 · 14/14 · 32/32 · 29/29 |
| Design ratchet / UX-1b shell / QA guard | 7/7 · 6/6 · 8/8 |
| E2E journey (qa-student) + lineage + cleanup (`E2E_KEEP_USER=1`) | 13/13 · 100% · data removed, identity kept |
| Signed-in smokes | student-mistake 7/7; student-pages incl. `/exams/ssc-cgl` "Syllabus coming soon"; admin-pages 16/16; staff-content 3/3 |

**Network events (recorded):**
- Intermittent DNS / TLS resets interrupted one DB batch (RLS, readers R-05, GAP2-3 `D-00 ETIMEDOUT`) and one E2E run (server log: 11 × "fetch failed" at submit).
- After each event:
  - I waited for 3 consecutive TLS connects.
  - `pg_stat_activity` showed **no non-idle session and no advisory locks** (no orphan; nothing terminated).
  - The QA student data was cleaned with `E2E_KEEP_USER=1`.
  - The server was restarted and the suites re-run: all passed.
- The final gate re-run lost its connection in GAP2-4a G-10. This left **one orphaned backend of this suite**: same DB user, "idle in transaction" about 2 min, last statement the G-10 `INSERT INTO public.learning_documents` fixture, holding one advisory lock.
  - It **ended on its own** (connection teardown) before any action. **Nothing was terminated.**
  - Afterwards there were no non-idle sessions and no advisory locks.
  - A read-only check found no persisted fixtures (`gap2-4%` units / documents 0; no open QA versions; 0 PUBLISHED versions).
  - GAP2-4a re-run: 12/12.
- The first student-pages failure on `/exams/ssc-cgl` was the smoke false positive in §2.4.

### 2.7 Production

Production verification runs after this commit is pushed:
1. `node scripts/smoke/wait-for-deploy.cjs https://couragelibrary-next.vercel.app <sha>`.
2. The anonymous smoke, including `GET /exams/ssc-cgl` → 200 with the syllabus section showing "Syllabus coming soon".

The result goes to the owner with the batch-2 hand-off. Signed-in production checks remain the owner's.

**Recorded results (added in GAP2-4c):**

| Check | Who | Result |
|---|---|---|
| `wait-for-deploy` `daf8441` | Claude | deployed (200) |
| Anonymous smoke, incl. `/exams/ssc-cgl` → "Syllabus coming soon" | Claude | all passed |
| Signed-in production smoke `admin-pages` | owner | **PASSED, 16/16** |
| Signed-in production smoke `staff-content` | owner | **PASSED, 3/3** |
| Signed-in production smoke `student-pages`, incl. `/exams/ssc-cgl` "Syllabus coming soon" | owner | **PASSED** |

### 2.8 Open items

- **GAP2-4c:**
  - retire the phase-3R workbench (the importer and resolve actions are fail-closed) and its legacy tests (**TEST-LEGACY-SYLLABUS**);
  - move `exam_syllabi` / `exam_topics` / `exam_unit_mappings` to `retired`.
- **EK-CLAIM-VERIFY** (backlog): claim verifier and time are not recorded (no columns).
- **SSC CGL syllabus:** to be authored and published by the owner (§3). SSC GD stays DRAFT (architect note 3).

## 3. Owner: authoring and publishing the SSC CGL syllabus

**Who does what:**
- Staff or admin build the draft.
- **Only an admin publishes.**
- Students see nothing until publication, then the hub shows it immediately (no deploy needed).

1. Sign in as an admin or staff user. Open **Admin → Syllabus** (`/admin/syllabus`).
2. In the exam picker, choose **SSC CGL**. The version list shows the seeded **Draft** "pattern-skeleton-2026": four SECTIONs that equal the CGL pattern sections, with no units yet. Click **Open editor**.
   - Alternative: if you prefer a blank start, use **New empty draft**.
3. **Add units under each section.**
   - Select a section in the tree, then **Add unit inside**.
   - Enter the unit **title** (for example "Percentage", "Number system").
   - Optionally set:
     - the **weightage tier** (High yield / Core / Moderate / Low / Optional);
     - **expected questions min / max** (leave both empty if unknown — never enter 0 as a guess);
     - a **description**;
     - **Mandatory**.
   - Click **Save details**.
   - You can add a sub-section inside a section if needed. Use **move up / down / move under** to order units, and **delete** with confirmation.
4. **Map topics.** Select the unit. In **Topics**, search by name or filter by subject, then tick one or more canonical topics.
   - **Weights are optional.** If you use them, each must be above 0 and at most 1, and they must add up to 1 (the live sum check shows this).
   - Click **Save topics**.
5. **Validate.** Click **Validate now**.
   - **Errors block publishing.** Use **Go to node** to fix each one:
     - a unit without topics;
     - a section with no unit;
     - the same topic twice in one section;
     - an inactive topic;
     - invalid weights;
     - a unit with children.
   - **Warnings don't block.** They list, for example, topics with no published questions or lessons yet, and a topic used in several sections.
6. **Publish (admin).**
   - With zero errors, an admin opens the draft and clicks **Publish**.
   - The dialog states what happens. For CGL this is the first published version, so nothing gets archived.
   - Confirm. The version becomes **Published (live)**, and the publisher and time appear in the version list. An audit record is written in the same transaction.
7. **Check.**
   - `/exams/ssc-cgl` → the Syllabus section shows the sections, units, tiers, known ranges and live question / lesson counts instead of "Syllabus coming soon".
   - **Admin → Content** coverage becomes available, measured against the published syllabus.
8. **Later changes.**
   - Published versions are immutable. Use **New draft from published** (a deep copy), edit it, validate and publish.
   - The previous version is archived automatically. Use **Archive** (admin) only to withdraw a syllabus entirely, which returns the hub to "Syllabus coming soon".
