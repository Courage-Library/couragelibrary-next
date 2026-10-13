# GAP2-2a — L2 re-point: learning resolver on learning_documents, access levels, CA learning mapping

Date: 2026-10-12/13 · Target: couragelibrary-next (ref guard DB = API, verified TLS) · Workflow: backup → dry-run → runner → ledger.
No secrets, refs or user data below. Nothing from the old stack was dropped (that is GAP2-2b).

## 1. Summary

Every candidate learning reader now resolves through **one** server-only service, `LearningResolverService`, over `learning_documents`:
- mistake learning section (`/mistakes`, `/mistakes/[id]`, revision health);
- mock result "Learn Concept";
- `/articles` and `/articles/[slug]`;
- the sitemap;
- Current Affairs learning links.

Other changes:
- **Access level:** documents carry FREE or PRO. A PRO document for a non-PRO viewer is locked, and its body is never loaded or sent.
- **CA mapping:** `current_affairs_learning_mappings` now points to `learning_documents`, and the validation gate requires the target to be PUBLISHED.
- **Course lessons:** `course_lessons.learning_document_id` was added.
- **Learn-more function:** `fn_resolve_learn_more` is dropped.

**Loop proven with real content and a real student.** Two QA documents went through the real Content Studio path (draft → review → approve → compile → publish). A temp student then took a published mock and answered the QA topic's question wrong, which led to:
1. "Learn Concept" on the result page;
2. "Learn this topic" on the mistake page;
3. the article rendering.

The PRO document is locked with no body in the HTML. Both documents were then archived and disappear everywhere.

Making the loop real required fixing three pre-existing defects in the publish pipeline (§3.3). Without them, no document could ever have been published to the database or read back by another server instance.

Verification:
- **New suite:** `scripts/test_gap2_2a_learning.cjs` 18/18.
- **Regression suites:** GAP2-1b 38/38 + smoke 3/3; QF-1 73/73 + 15/15; DRIFT-1c 39/39; SEC-1A 20/20.
- **Static checks:** tsc 0 errors; lint 0 errors; build OK.

**Status: OPEN, one item.** The QA reviewer identity used as approver cannot be deleted, because the immutable audit log references it (§6.2). It is banned and has no role, but it is outside the baseline exceptions the phase allows, so nothing was committed (§9).

## 2. Migration 072 — `20261012000072_l2_learning_repoint.sql`

| Item | Detail |
|---|---|
| Backup | `pre-gap2-2a-072-2026-10-12T19-24-34` (public + auth data, outside the repo) |
| Dry-run / apply | DRY-RUN OK → APPLIED via runner; sha256 `7ced151ae68fca58…`; ledger 72 → 73 |
| 1. `learning_documents.access_level` | `TEXT NOT NULL DEFAULT 'FREE'`, `CHECK (access_level IN ('FREE','PRO'))` |
| 2. CA learning mappings | Aborts (`L2_CA_MAPPINGS_NOT_EMPTY`) unless the table is empty; it was empty (0). `learning_resource_id` dropped; `learning_document_id UUID NOT NULL REFERENCES learning_documents ON DELETE RESTRICT`; `UNIQUE (article_id, learning_document_id)`; index. Existing RLS (parent CA article PUBLISHED) unchanged |
| 3. `course_lessons.learning_document_id` | `UUID NULL REFERENCES learning_documents ON DELETE RESTRICT` (+ index). `learning_resource_id` untouched |
| 4. `fn_resolve_learn_more` | Dropped (no dependants, no callers) |
| 5. **Private bucket `learning-artifacts`** | `storage.buckets` row, `public = false`, no storage policies, so only the service role can read or write. **Added beyond the locked list.** The Content Studio has always written specs and bodies to this bucket name, but it did not exist (see §3.3) |
| In-migration proof | function gone; bucket private; old column gone |

## 3. Code

### 3.1 Resolver contract — `services/learning/learning-resolver.service.ts` (server-only)

| Method | Returns |
|---|---|
| `resolveForTopics(topicIds[])` | `Map<topicId, ResolvedLearningDocument[]>`. **One** `learning_documents` query for any number of topics; non-UUID keys are ignored |
| `resolveForTopic(topicId)` | ordered documents for one topic |
| `resolveForQuestion(questionId)` | via `questions.canonical_topic_id` |
| `listPublished({topicId?})` | `/articles` index (no bodies) |
| `getArticle(slug)` | one document; `body` loaded from private storage **only if not locked** |
| `getViewerAccess()` | `{isAuthenticated, hasPro}` from the **session user only** |

- **Output per document:** `id, canonical_slug, title (unit title), document_type, access_level, estimated_minutes, href = /articles/{canonical_slug}, is_locked` (+ `topic_id, topic_name`).
- **Servable:** `status = PUBLISHED`, `current_published_version_id` set and equal to the embedded current version, that version `is_published` and `review_status = PUBLISHED`, unit `is_active`.
- **Order:** CONCEPT_LESSON, TOPIC_SUMMARY_REVISION, COMMON_TRAPS_AND_MISTAKES, WORKED_EXAMPLES, FORMULA_SHORTCUT_SHEET, PYQ_DEEP_DIVE; then title, then slug.
- **Entitlement:** `createServerSupabaseClient → auth.getUser()`, then `user_entitlements` read with the session client. RLS ("Users can read own entitlements") restricts the rows to the session user. The PRO rule is the same as the existing SQL: `PRO_SUBSCRIPTION | PROMOTIONAL_PASS`, active, `starts_at ≤ now`, `expires_at` null or in the future. **No method accepts a user id.**
- **Read path:** metadata is read with the session (anon/authenticated) client under the existing published-only RLS. The service role is used only for the private storage body, after the lock check.

### 3.2 Re-pointed readers

| Reader | Where | Change |
|---|---|---|
| Mistake learning (detail + batch + revision health) | `services/mistake.service.ts:2203, 2237, 2253`; callers `:1214`, `:2124`; `app/mistakes/page.tsx:88` | Resolver only; old-stack queries removed; `userId` parameters removed; `PremiumEntitlementService` (caller-supplied id) no longer used here |
| Mistake learning UI | `components/mistakes/mistake-learning-section.tsx:139` | Primary CTA "Learn this topic" → first document; PRO locked → "Upgrade to PRO to unlock this lesson" (`/billing`); empty state only when there are no documents; document-type labels |
| Mock result "Learn Concept" | `services/assessment.service.ts:2305` → `services/content.service.ts:161` | Resolver only; legacy-article fallback and slug keys removed (non-UUID keys would break the batch query) |
| `/articles` | `services/content.service.ts:107`; `app/articles/page.tsx:12` | `learning_documents` only; access badge; `dynamic = "force-dynamic"` |
| `/articles/[slug]` | `services/content.service.ts:128`; `app/articles/[slug]/page.tsx:26, 189` | `learning_documents` only; legacy fallback removed; PRO for non-PRO → locked panel, `contentBody = null` (body never loaded); `dynamic = "force-dynamic"` (was ISR `revalidate = 60`, which could have cached one viewer's unlocked render for others) |
| Sitemap | `app/sitemap.ts:91` | PUBLISHED FREE + PRO `learning_documents` (`/articles/{canonical_slug}`); `articles` removed; courses unchanged |
| CA candidate reads | `services/current-affairs.service.ts:310` (raw SQL), `:470` (PostgREST) | `learning_documents` (PUBLISHED only) + unit title; `learningDocumentId` |
| CA admin editor | `services/admin-current-affairs.service.ts:303, 403, 572` | read/write `learning_document_id` |
| CA importer | `services/current-affairs-import.service.ts:224, 361` | insert `learning_document_id` |
| CA validation gate | `services/current-affairs-validation.service.ts:402` (+ default adapter) | the document must exist **and** be PUBLISHED |
| CA lookup route | `app/api/admin/current-affairs/lookup/route.ts:56` | PUBLISHED `learning_documents` (title from unit) |
| CA CTA + types | `components/current-affairs/current-affairs-learning-cta.tsx`, `types/current-affairs.ts` | `learningDocumentId`; link `/articles/{canonical_slug}` |
| Content Studio | `services/admin-content-studio.service.ts:334, 371, 392`; `app/admin/content/actions.ts`; `components/admin/content-studio/content-studio-view.tsx` | `createDocument({accessLevel})`; `setDocumentAccessLevel`, `createLearningUnit`, `archiveDocument` (admin-checked, audited); access selector on the current document and on "create document" |
| Generated types | `types/database.ts`, `types/learning-compiler.ts` | CA mapping column/FK, `course_lessons.learning_document_id`, `access_level`; `fn_resolve_learn_more` removed |

### 3.3 Pre-existing publish-pipeline defects fixed (required for the proof)

| Defect | Effect before | Fix |
|---|---|---|
| `StorageFactory.getProvider()` defaults to **in-process MEMORY**; used by Content Studio, the AI importer and the article reader | Specs and bodies lived in one server process; lost on restart; invisible to other instances; `/articles/[slug]` could never read a published body in production | `services/storage/learning-artifact-storage.ts`: one server-only accessor on the private Supabase bucket (service role); all 7 call sites switched |
| Bucket `learning-artifacts` did not exist | Every real upload would fail | Created private in 072 |
| `LearningDocumentService` built version ids as `"ver-<doc>-v<n>"` | **Every** `document_versions` insert failed (uuid), and `saveDraftSpec` would rewrite the primary key | `id` no longer set; the DB generates the UUID (`services/learning-document.service.ts:87`) |
| Content Studio selected `learning_units.is_published` (no such column) | Unit tree / coverage queries errored | `is_active` |
| No code could create a `learning_unit` | No path to attach a document to a topic | `createLearningUnit` (admin, audited) |

### 3.4 Harness (`scripts/e2e/student-journey.cjs`)
Changes needed to run on the full 100-question mock and a slow dev server:
- settle 5 s before Begin, then retry Begin until the player shows (with a diagnostic screenshot on failure);
- click answer options inside the option card. A bare text match ("36") hit the question-palette button.

## 4. Proof

### 4.1 C1 / C3 content — real Content Studio service, mocked admin session, real DB and storage

Topic: **Number System** (the topic of question 1 of the mock). DB state was verified after **every** step; the service's in-memory fallbacks were not trusted.

| Step | QA FREE: `qa-number-system-concept-lesson` (CONCEPT_LESSON) | QA PRO: `qa-number-system-summary` (TOPIC_SUMMARY_REVISION) |
|---|---|---|
| Unit "QA – Number System: Divisibility Basics" (`qa-number-system-divisibility`) created on the topic | PASS | (same unit) |
| Draft version stored, STRUCTURALLY_VALID | PASS | PASS |
| Submit → IN_REVIEW | PASS | PASS |
| Approve → APPROVED, approver recorded | PASS | PASS |
| Compile → COMPILED (body contains its marker) | PASS | PASS |
| Publish → doc PUBLISHED, pointer set, version is_published + PUBLISHED | PASS | PASS |
| Compiled body object in private `learning-artifacts` | PASS | PASS |
| Access level | FREE | set to **PRO** via `setDocumentAccessLevel` — PASS |
| Admin preview (`getVersionSpec`) returns the full body | PASS | PASS (admin unaffected by the lock) |
| Audit rows | 4 (unit create, 2 document creates, access change) | |

### 4.2 C2 / C3 student journey — temp student `qa-student-gap22a@example.test`, local dev server against the dev DB

The phase allowed "today's daily mock (or any published mock)". The daily Monday mock's window had closed (attempts expired immediately and the player redirected to `/mock-tests`). The journey therefore used **`ssc-cgl-tier-1-full-mock`** (published, 100 Q, Q1 = Number System).

**Journey (`scripts/e2e/student-journey.cjs`) — 13/13:**

| # | Step | Result |
|---|---|---|
| E2E-01 | login → /dashboard | PASS |
| E2E-02 | /mock-tests renders | PASS |
| E2E-03 | player started | PASS |
| E2E-04 | attempt in_progress created | PASS |
| E2E-05 | 6 answers (Q1–3 wrong incl. the Number System question, Q4–6 right) autosaved | PASS |
| E2E-06 | second concurrent attempt rejected (23505) | PASS |
| E2E-07 | answer key not readable (42501) | PASS |
| E2E-08 | reload restores answers | PASS |
| E2E-09 | reload restores timer | PASS |
| E2E-10 | submit → result | PASS |
| E2E-11 | /mistakes shows 3/3 | PASS |
| E2E-12 | open a mistake | PASS |
| E2E-13 | /admin blocked | PASS |

**Learning proof — 9/9:**

| # | Check | Result |
|---|---|---|
| C2-00 | QA topic question in the student's vault | PASS (3 vault rows) |
| C2-01 | result page "Learn Concept" → `/articles/qa-number-system-concept-lesson` | PASS |
| C2-02 | `/mistakes/[id]` primary CTA "Learn this topic" → same document | PASS |
| C3-03 | `/mistakes/[id]` lists the PRO doc as an additional resource | PASS |
| C2-03 | FREE article renders: HTTP 200, title + body visible | PASS |
| C3-04 | PRO article, non-PRO student: locked panel; **PRO body marker absent from the raw HTML response** | PASS |
| C3-05 | PRO article, anonymous visitor: locked, no body | PASS |
| C2-04 | `/articles` lists both QA docs | PASS |
| C2-05 | sitemap lists both QA docs | PASS |

Screenshots: `docs/reports/gap2/gap2-2a-screens/` (01–10 journey; 12 result "Learn Concept", 13 mistake learning CTA, 14 FREE article, 15 PRO locked, 16 articles index).

### 4.3 C4 — CA mapping (rolled-back transaction; `test_gap2_2a_learning.cjs` DB-03/DB-04)
- **Published doc:** the validation gate accepts a mapping to a PUBLISHED document, and the row inserts.
- **Draft doc:** the gate rejects it with "is not PUBLISHED".
- **Unknown document id:** the insert fails with an FK violation (23503).
- **Duplicate:** a duplicate (article, document) pair is rejected by `uq_ca_learning_mapping`.
- **Deleting a mapped published doc:** refused. The existing published-history guard fires; RESTRICT backs it up.

## 5. Tests

| Suite | Result |
|---|---|
| `test_gap2_2a_learning.cjs` offline (ordering, PUBLISHED-only, lock, no body for locked, no user-id parameter, entitlement via RLS, 25 topics → 1 query, question → topic, old-stack scan, CA gate, access level admin-only + audit, static guards) | 11/11 |
| `test_gap2_2a_learning.cjs --db` (fn dropped, access_level CHECK, CA FK/unique/C4, course_lessons FK, RLS: anon sees only published docs/versions and **0** private storage objects, bucket private) | 18/18 total |
| `test_gap2_1b_taxonomy.cjs --db` / `--smoke` | 38/38 · 16/16 (DB-24 updated: the function is now dropped, and calling it as anon fails) |
| QF-1 offline / DB | 73/73 · 15/15 |
| DRIFT-1c / SEC-1A | 39/39 · 20/20 |
| tsc / lint / build | 0 errors / 0 errors / OK |

## 6. Cleanup and baseline

### 6.1 Cleanup (C5)
1. **Documents:** both QA documents archived through `AdminContentStudioService.archiveDocument` (status ARCHIVED). The published versions are preserved and immutable, and the guards did not block archiving.
2. **Unit:** QA unit deactivated.
3. **Visibility:** anon sees 0 QA documents. `/articles` and the sitemap no longer list them, and `/articles/qa-…` renders the not-found UI with no body.
4. **Temp student:** deleted with all rows (3 occurrences, 3 vault rows, 6 answers, 4 section results, result, attempt, coins, gamification, streaks, profile, auth user).
5. **Storage:** 2 orphaned objects from the first C1 attempt, which failed on the version-id defect, were removed. 4 objects remain, all referenced by the archived versions.

### 6.2 Residue outside the allowed exceptions — the QA reviewer identity
The approval step writes `approved_by_user_id` (FK → auth.users), so the mocked admin session used a temporary identity, `qa-content-reviewer-gap22a@example.test`: no role, random unknown password.

It **cannot be deleted**. `admin_audit_logs` is immutable (the `trg_prevent_admin_audit_log_mutation` trigger blocks UPDATE/DELETE), and its `actor_id` FK is `ON DELETE SET NULL`. Deleting the user would therefore have to update its 6 audit rows, and the trigger rejects that (GoTrue 500).

It has been **banned until 2126** and has no role.

### 6.3 Baseline diff (pre-072 vs final)

| Difference | Explanation |
|---|---|
| `schema_migration_ledger` 72 → 73 | 072 APPLIED |
| `learning_units` 0 → 1, `learning_documents` 0 → 2, `document_versions` 0 → 2 | archived QA unit/docs/versions (allowed) |
| `admin_audit_logs` 8 → 14 | 6 rows: 4 from C1/C3, 2 archives (allowed) |
| storage: `learning-artifacts` bucket, 4 objects | new private bucket; bodies/specs of the archived versions |
| `course_lessons` fingerprint | new nullable column `learning_document_id` (all NULL); no values changed |
| `fn_resolve_learn_more` | dropped |
| **`auth.users` 24 → 25** | **QA reviewer identity (banned) — not in the allowed exception list (§6.2)** |
| Everything else | identical: all other tables' counts and fingerprints (questions, attempts, mistakes, mocks, taxonomy, CA, old learning stack, entitlements); all other functions; FK targets valid; node identity intact |

## 7. Remaining old-stack references (GAP2-2b targets)

**Code:**
- `app/admin/actions.ts:1185` — legacy `createArticleAction` (articles insert; schema-broken, see GAP2-1a D3).
- `services/admin.service.ts:286, 1586` — admin legacy content tab lists `articles` / `courses`.
- `services/content.service.ts:82, 355` — course lessons' `learningResourceId` (course runtime; 2b re-points lessons to `learning_document_id`).

**SQL / FKs:**
- `fn_complete_course_lesson` (reads `learning_resource_topics`), `fn_generate_daily_recommendations` and `fn_reconcile_search_indexes` (`learning_resources`), `fn_publish_article_version`, `fn_create_discussion_thread`.
- `discussion_threads.article_id`, `batch_curriculum_assignments.article_id`, `daily_study_recommendations.resource_id`, `course_lessons.learning_resource_id`.

**Candidate learning paths:** none. The static scan (O-08) covers mistake, result, `/articles`, CA, sitemap and resolver.

## 8. Findings for the owner (not fixed here)
- **Content Studio actions ignore the auth check:** several call `AdminService.checkIsAdminOrStaff()` and **ignore the result**, so any signed-in user who can invoke them gets through. Affected: `getCurriculumAIContextAction`, `generateExternalAiPromptAction`, `validateExternalAiContentAction`, `getCurriculumCoverageMatrixAction`, `getCurriculumQualityMetricsAction`, **`mapUnitToExamAction` (writes `exam_unit_mappings`)**, `checkDuplicateLearningUnitAction`, `getAuthoringQueueAction`, and others in `app/admin/content/actions.ts`.
- **`requireAdminAuth(action, adminUserId)` skips the admin check** whenever an `adminUserId` is passed. Current callers pass server-verified ids, but the pattern is fragile.
- **Silent fallbacks:** Content Studio review/compile/publish fall back to an in-memory cache when DB writes fail and still return success. The proof verified DB state directly for this reason.
- **Test accounts that author audit rows can't be removed:** any test account that writes audit rows becomes permanently undeletable (§6.2). Future smoke tests should use `actor_id = null`, as the GAP2-1b smoke does, or a designated permanent QA identity.

## 9. Status

Every phase check passed except **one**: the baseline has one row outside the allowed exceptions, the banned QA reviewer auth user (§6.2). It exists because the approval FK requires a real user and the audit log is immutable. Per the phase rule ("if any check fails: do not commit"), **nothing was committed or pushed**. The working tree holds the complete change set.

**Commit plan (on approval/waiver):**
- **Migration:** `supabase/migrations/20261012000072_l2_learning_repoint.sql`
- **New services:** `services/learning/learning-resolver.service.ts`, `services/storage/learning-artifact-storage.ts`
- **Modified services:** `services/{admin-content-studio,admin-current-affairs,content,assessment,current-affairs,current-affairs-import,current-affairs-validation,learning-document,mistake}.service.ts`, `services/ai/structured-content-importer.service.ts`
- **App routes:** `app/{admin/content/actions.ts, api/admin/current-affairs/lookup/route.ts, articles/page.tsx, articles/[slug]/page.tsx, sitemap.ts}`
- **Components:** `components/{admin/content-studio/content-studio-view.tsx, current-affairs/current-affairs-learning-cta.tsx, mistakes/mistake-learning-section.tsx}`
- **Types:** `types/{current-affairs,database,learning-compiler}.ts`
- **Scripts:** `scripts/{test_gap2_2a_learning.cjs, test_gap2_1b_taxonomy.cjs, e2e/student-journey.cjs}`
- **Report:** this report + `docs/reports/gap2/gap2-2a-screens/`

Message: `feat(gap2-2a): learning resolver on learning_documents, access levels, CA learning mapping re-point` + Co-Authored-By.

GAP2-2a STATUS: OPEN — awaiting decision on the residual banned QA reviewer identity (§6.2); all other checks pass

---

## 12. Closure

**CLOSED by the architect on 2026-10-13 with waiver W2.**

> **W2:** the banned QA reviewer auth user (`qa-content-reviewer-gap22a@example.test`, no role, banned until 2126) is accepted as dev-DB residue. Do not attempt deletion.

**Rule from this phase:** future smoke tests use one permanent QA identity per role or `actor_id = null`; never create throwaway auth users that write `admin_audit_logs`.

GAP2-2a STATUS: CLOSED (waiver W2)
