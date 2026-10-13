# SEC-1B — Admin server action authorization: fail-closed

Date: 2026-10-13 · Target: couragelibrary-next (dev DB; ref guard + verified TLS for all DB access) · **No schema/RLS/grant changes.** · **Not committed** (awaiting architect audit).

## 0. Summary

Every admin server action and admin API route (**257**: 230 actions in 14 files + 27 handlers in 24 route files) now authorizes through **one canonical guard**, `lib/auth/require-admin.ts`:
- It reads the session user only and authorizes only on `app_metadata.role` (ADMIN_EMAILS fallback unchanged).
- It runs before any DB, storage or service call.
- It denies with a uniform result.

Findings fixed along the way:
- **Hole 1, caller-supplied identity bypass:** `AdminContentStudioService.requireAdminAuth(action, adminUserId)` skipped the admin check whenever an id was passed. `reviewVersionAction(params)` forwarded client-supplied `params` (including `adminUserId`), so **any caller could approve Content Studio versions**. Fixed: the id is ignored, and the actor comes from the session.
- **Hole 2, ignored or missing checks:** 15 Content Studio actions called `checkIsAdminOrStaff()` and ignored the result (`mapUnitToExamAction` writes data). 55 admin actions had no action-level check at all.
- **Bug, staff restriction never applied:** candidate drill-down's admin-only check could never trigger, because the helper hard-coded `role: "admin"`.
- **Silent successes:** in-memory fallbacks and fabricated successes in admin write paths now surface as `DB_ERROR`:
  - Content Studio review/compile/publish and the version cache;
  - `mapUnitToExam` (`mock-mapping-1`);
  - `saveExamPost` (`simulated-post-id`);
  - swallowed `deleteExamPost`;
  - exam-import rows dropped silently;
  - CA audit insert to non-existent columns.
- **Raw DB text:** no admin action or route returns raw database text any more.

Verification:
- **New suite:** `scripts/test_sec1b_admin_authz.cjs` **26/26** (offline 21 + live 5). The authz matrix passes **258/258** entries in **each** of the 6 scenarios.
- **Regressions:**
  - QF-1 73/73 + 15/15; SEC-1A 20/20; DRIFT-1c 39/39; GAP2-2a 11/11 + DB 18/18; GAP2-1b offline 13/13.
  - **GAP2-1b `--db/--smoke` could not complete: Supabase connectivity** (§6).
  - E2E journey 13/13.
- **Static checks:** tsc 0 errors · lint 0 errors · build OK.
- **Baseline:** only QA-identity rows (§7).

**Status: OPEN.** One required regression (GAP2-1b DB + smoke) is unverified because of network failures. Everything else passes.

## 1. Inventory (before)

Machine inventory (TypeScript AST) of every exported admin action / route handler. The full per-entry table (file:line, action, auth call, result used, tables written, services, fallback) is in `scripts/test_sec1b_admin_authz.cjs`'s data sources and reproduced in aggregate here.

| File | Exports | No action-level auth | Result ignored | Legacy `checkIsAdminOrStaff` (used) | Notes |
|---|---|---|---|---|---|
| `app/admin/actions.ts` | 73 | 4 (`executeBulkImportAction`, `createQuestionHierarchyAction`, `createQuestionAction`, `toggleQuestionPublishAction`; rely on service checks) | 0 | 69 | incl. 37 dead duplicate Adaptive actions (feature-gated) |
| `app/admin/adaptive/actions.ts` | 37 | 0 | 0 | 37 | feature-gated (quarantined) |
| `app/admin/content/actions.ts` | 33 | 18 (rely on `requireAdminAuth`) | **15** | 0 | `mapUnitToExamAction` (writes), AI/import/queue actions |
| `app/admin/exams/actions.ts` | 15 | 0 | 0 | 15 | |
| `app/admin/gamification/actions.ts` | 1 | 0 | 0 | 1 | |
| `app/admin/live-tests/actions.ts` | 17 | 17 (helper only) | 0 | 1 (helper) | feature-gated |
| `app/admin/live-tests/intelligence/actions.ts` | 4 | 0 (`verifyAdminPrivileges`) | 0 | 1 (helper) | drill-down role hard-coded |
| `app/admin/premium/actions.ts` | 10 | 0 | 0 | 10 | |
| `app/admin/rewards/actions.ts` | 5 | 0 | 0 | 5 | |
| `app/admin/taxonomy/actions.ts` | 4 | 4 (rely on TaxonomyService) | 0 | 0 | |
| `actions/admin-exam-knowledge.actions.ts` | 17 | 0 | 0 | 17 | |
| `actions/exam-knowledge-import.actions.ts`, `…-prompt.actions.ts` | 1 + 1 | 0 | 0 | 2 | |
| `actions/question-factory.actions.ts` | 12 | 12 (rely on QF service guard) | 0 | 0 | |
| `app/api/admin/**/route.ts` (24 files) | 27 handlers | 0 | 0 | 27 | 27 handlers echoed `error.message` |
| **Total admin** | **257** | **55** | **15** | **198** (decision duplicated in 1 helper) | |

**Out of scope (student actions, no admin data):** `app/auth`, `app/live-tests`, `app/mistakes`, `app/mock-tests`, `app/performance`, `app/premium` (31 actions).

Further findings:
- **Auth bypass:** `requireAdminAuth(actionName, adminUserId)` returned `{ userId: adminUserId }` with **no check** when an id was passed. It was reachable from `reviewVersionAction(params)` (client-controlled `params.adminUserId`).
- **Write-path fallbacks:** `AdminContentStudioService` review/compile/publish/getVersionSpec fell back to `LearningDocumentService.versionCache` and returned success. Also `CurriculumCoverageService.mapUnitToExam` → `mock-mapping-1`; `ExamOnboardingService.saveExamPost` → `simulated-post-id`; `deleteExamPost` → `catch (_) {}`; `ExamOnboardingImporter` → rows skipped silently; `AdminCurrentAffairsService.writeAuditLog` → wrong columns + `catch {}`.
- **Intended roles:** staff = admin everywhere (`checkIsAdminOrStaff` treats both alike) **except** candidate drill-down (admin only, broken by the hard-coded role).

## 2. Guard design — `lib/auth/require-admin.ts` (`import "server-only"`)

| Export | Behaviour |
|---|---|
| `requireAdmin(opts?: { allowStaff?: boolean })` | Session via `createServerSupabaseClient().auth.getUser()`; role via `resolveRole`; returns `{ userId, role, userEmail }` or throws `AuthorizationError('UNAUTHORIZED' \| 'FORBIDDEN')`. Never accepts a user id. Session errors deny (`UNAUTHORIZED`). |
| `resolveRole(user)` | `app_metadata.role === 'admin'` → admin; email ∈ `ADMIN_EMAILS` → admin (unchanged, removal is SEC-1); `app_metadata.role === 'staff'` → staff; otherwise null. `user_metadata` is never read. **Single decision point**: `AdminService.checkIsAdminOrStaff` now delegates to it. |
| `guardAdminAction(opts)` | Non-throwing wrapper for server actions: success context or `{ ok: false, success: false, error: code, code, message }`. |
| `guardAdminRoute(opts)` | Same for API routes; a denial carries a ready `401`/`403` `NextResponse`. |
| `toActionFailure(ctx, err)` | DB/infra error (SQLSTATE/PostgREST code or DB-like text) → `DB_ERROR` with a generic message (logged server-side with code only); app-thrown message → `VALIDATION`; `AuthorizationError` → its code. |
| `dbFailure(ctx, err)` | Returned PostgREST error → `DB_ERROR`. |
| `toRouteErrorResponse(ctx, err)` | 400 VALIDATION / 401 / 403 / 500 DB_ERROR. |
| `sanitizeActionResult(ctx, res)` / `safeMessage(msg)` | Boundary scrub for results passed through from services: shape preserved, DB-like `error`/`message` text replaced. |

Client-safe UI helper `lib/actions/action-result.ts → actionErrorMessage(res, fallback)` displays `message` for uniform failures (legacy `{ error: "text" }` still works).

**Uniform failure** (server actions): `{ ok: false, success: false, error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DB_ERROR' | 'VALIDATION', code: <same>, message }`. `success: false` keeps every legacy caller fail-closed; `code` matches existing `{ success, code, error }` result types.

**Order in quarantined modules** (Adaptive, Live Tests; 95 actions): DRIFT-1c feature gate **first** (zero calls while disabled, unchanged), canonical guard immediately after. This keeps the quarantine invariant and guarantees the guard applies the moment a flag is enabled.

## 3. Per-file changes

| Area | Files | Change |
|---|---|---|
| Guard + helpers | `lib/auth/require-admin.ts` (new), `lib/actions/action-result.ts` (new) | §2 |
| Admin actions | `app/admin/{actions,adaptive/actions,content/actions,exams/actions,gamification/actions,live-tests/actions,live-tests/intelligence/actions,premium/actions,rewards/actions,taxonomy/actions}.ts`, `actions/{admin-exam-knowledge,exam-knowledge-import,exam-knowledge-prompt,question-factory}.actions.ts` | Every exported action: `guardAdminAction({ allowStaff: true })` as the first statement (after the feature gate where present); drill-down: `guardAdminAction()` (admin only). Raw-error returns → `toActionFailure` / `dbFailure` (113). Pass-through returns → `sanitizeActionResult` (69). Live-test and intelligence helpers use `requireAdmin` (real role). Bulk-import denials shaped to their result types. |
| Admin routes | 24 `app/api/admin/**/route.ts` | `guardAdminRoute({ allowStaff: true })` (401/403); catch blocks → `toRouteErrorResponse` (27); service-error bodies → `sanitizeActionResult` (11). `current-affairs/import`: bearer-token ingestion (constant-time) kept as the only non-session credential; otherwise the canonical guard. |
| Services | `admin.service.ts` | `checkIsAdminOrStaff` decides via `resolveRole` |
| | `admin-content-studio.service.ts` | `requireAdminAuth` → `requireAdmin` (caller id ignored, bypass removed); review/compile/publish rewritten without cache fallbacks (errors propagate); `getVersionSpec` cache fallback removed; unused `adminUserId` params dropped from compile/publish |
| | `learning-document.service.ts`, `ai/structured-content-importer.service.ts` | in-memory `versionCache` and its writers removed |
| | `curriculum-coverage.service.ts` | `mapUnitToExam` rethrows (no `mock-mapping-1`) |
| | `exam-onboarding/exam-onboarding.service.ts` | `saveExamPost` rethrows (no `simulated-post-id`); `deleteExamPost` surfaces errors |
| | `exam-onboarding/exam-onboarding-importer.service.ts`, `types/exam-onboarding.ts` | `persistErrors`; `success: false` if any row failed to persist |
| | `admin-current-affairs.service.ts` | 14 internal checks → canonical guard; audit insert uses the real `admin_audit_logs` columns (previously never written) and logs failures |
| | `current-affairs-daily-quiz.service.ts`, `lib/admin/bulk-importer.ts`, `question-factory/admin-question-factory.service.ts`, `taxonomy/taxonomy.service.ts` | internal checks → canonical guard; QF `fail()` scrubs DB text (keeps `QF_*` workflow messages) |
| UI (display only) | 26 components under `components/admin/**` | 87 display sites → `actionErrorMessage(res, fallback)`; conditions unchanged |
| QA identities | `scripts/qa/ensure-qa-identities.cjs` (new), `docs/testing/QA_IDENTITIES.md` (new) | permanent qa-admin / qa-staff / qa-student; passwords only in `.env.local` |
| E2E harness | `scripts/e2e/_e2e-env.cjs`, `scripts/e2e/cleanup-student.cjs` | `E2E_STUDENT_PASSWORD_KEY` (permanent identity, password read from `.env.local`, never reset); `E2E_KEEP_USER=1` (delete journey data, keep the identity) |
| Tests | `scripts/test_sec1b_admin_authz.cjs` (new); harness updates in `test_qf1_question_factory`, `test_sec1a_containment`, `test_drift1c_features`, `test_gap2_1b_taxonomy`, `test_gap2_2a_learning` | Stub `server-only`; session mock exposes `auth.getUser()` from each suite's existing `authState`; GAP2-1b smoke now signs in as qa-admin. **No assertion changed.** |

## 4. Fallbacks

**Removed (write paths):**

| Location | Before | After |
|---|---|---|
| `AdminContentStudioService.reviewVersion / compileVersion / publishVersion` | DB read/update errors swallowed; success returned from `LearningDocumentService.versionCache` | errors propagate → action `DB_ERROR` |
| `AdminContentStudioService.getVersionSpec` | cached fake version when the row is missing | `success: false` |
| `LearningDocumentService.versionCache` + `cacheVersion/getCachedVersion/updateCachedVersion` | in-memory store | deleted |
| `CurriculumCoverageService.mapUnitToExam` | any error → success with `mock-mapping-1` | rethrows |
| `ExamOnboardingService.saveExamPost` | any error → `simulated-post-id` | rethrows |
| `ExamOnboardingService.deleteExamPost` | `catch (_) {}` | error surfaces |
| `ExamOnboardingImporter` (knowledge docs, sources, claims) | failed inserts skipped silently, `success: true` | `persistErrors`, `success: false` |
| `AdminCurrentAffairsService.writeAuditLog` | wrong columns + `catch {}` → no CA audit row ever written | real columns; failure logged |

**Kept, with justification (none is a write-success fabrication):**

| Location | Why kept |
|---|---|
| `admin-adaptive.service.ts` config getters (4× `catch {}` → defaults) | Read-only defaults inside the **quarantined** Adaptive module (phase rule: no changes beyond guards). |
| `live-test-reward.service.ts:63` (RPC-missing fallback) | Quarantined Live Tests module. |
| `exam-onboarding.service.ts` readiness / deletion-dependency counts (`catch (_) {}`) | Read-only counts; no write, no success claim. |
| `exam-onboarding.service.ts` delete: RPC first, then manual cleanup | A real alternative code path, not a silent success. |
| `current-affairs-production-sync.service.ts:209` | Read-only idempotency probe; unique constraints backstop it. |
| `admin-exam-knowledge.actions.ts` `revalidatePath` catches; CA `revalidatePath` catches | Cache revalidation only, not DB. |
| `asset-reference.service.ts` / `question-reference.service.ts` (mock reference when no catalog client) | Compile-time **validation** read path, not a write; listed as an open item §8-Q5. |
| Audit-log inserts in QF / Taxonomy / Content Studio / CA services | Non-blocking but **logged** (the main change is already committed). Policy question §8-Q2. |

None of the kept read paths is dev-only. They are read/validation paths, not in-memory fallback stores.

## 5. Test matrix — `scripts/test_sec1b_admin_authz.cjs` (26/26)

| Part | Tests | Result |
|---|---|---|
| Guard unit | U-01 role resolution (user_metadata never grants; ADMIN_EMAILS → admin) · U-02 anon/student/user_metadata/staff/admin outcomes, no user-id parameter · U-03 session errors fail closed · U-04 failure mapping and route statuses, no raw text · U-05 `requireAdminAuth` ignores a passed id; `reviewVersion` with a passed `adminUserId` → FORBIDDEN, 0 writes · U-06 single decision point | 6/6 |
| Quarantine | Q-01 flags **off**: 95 gated actions × 5 session types → FEATURE_DISABLED with **0** DB/session calls | 1/1 |
| Authz matrix (flags on, 258 entries) | M-00 all 14 action files + 24 route files load | 1/1 |
| | (a) anonymous → denied before any DB call | **258/258** |
| | (b) authenticated student, no role → denied before any DB call | **258/258** |
| | (c) `user_metadata.role='admin'`, no app role → denied before any DB call | **258/258** |
| | (d) student passing an admin's id as `adminUserId` (every positional/param) → denied | **258/258** |
| | (e) staff → allowed, except candidate drill-down (FORBIDDEN) | **258/258** |
| | (f) admin → allowed (guard passed) | **258/258** |
| Static | S-01 canonical guard before the first DB/storage/service call (257 exported handlers; the CA import route verified as bearer-or-guard) · S-02 no legacy/ignored checks, bypass gone · S-03 write fallbacks removed · S-04 routes never echo raw error text | 4/4 |
| Failure | F-01 every entry with a DB failing every call, **production flags** (quarantined actions disabled): **no success after an attempted write, no raw DB text** (43 entries attempted writes); with flags forced on, 13 quarantined actions fail this (see Q7) · F-02 Content Studio publish/review/compile propagate the DB error; action → `DB_ERROR` · F-03 `mapUnitToExam` throws | 3/3 |
| Live (`--live`, permanent QA identities, no writes) | L-01 qa-admin → admin · L-02 qa-staff → FORBIDDEN admin-only, allowed with `allowStaff` · L-03 qa-student → FORBIDDEN, anonymous → UNAUTHORIZED · L-04 student self-sets `user_metadata.role='admin'` → still FORBIDDEN (reverted) · L-05 real staff session → drill-down FORBIDDEN | 5/5 |

Isolation: offline parts block `fetch` and `pg`, and mock the Supabase clients. Live parts use only the QA identities' sessions. No secret is printed.

## 6. Regression

| Suite | Result |
|---|---|
| `test_qf1_question_factory` | 73/73 |
| `test_qf1_db` | 15/15 |
| `test_sec1a_containment` | 20/20 |
| `test_drift1c_features` | 39/39 |
| `test_gap2_2a_learning` (+ `--db`) | 11/11 · 18/18 |
| `test_gap2_1b_taxonomy` offline | 13/13 |
| **`test_gap2_1b_taxonomy --db --smoke`** | **NOT VERIFIED.** 4 attempts failed on Supabase connectivity: ETIMEDOUT ×2, `08006 EAUTHTIMEOUT`, DNS `ENOTFOUND` for the pooler. The code paths it exercises are covered offline (13/13) and by the SEC-1B matrix; it must be re-run when the network is stable. |
| E2E `scripts/e2e/student-journey.cjs` (`ssc-cgl-tier-1-full-mock`, permanent qa-student) | 13/13 |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors |
| `npm run build` | OK (`server-only` resolved by Next.js; no client bundle imports the guard) |

## 7. Baseline (row counts + fingerprints, same table set as GAP2-2a)

| Window | Difference | Explanation |
|---|---|---|
| GAP2-2a end → before this phase's tests | `admin_audit_logs` +7 | GAP2-1b smoke run at the end of GAP2-2a (before SEC-1B) |
| | `auth.users` +3 | permanent QA identities created by `scripts/qa/ensure-qa-identities.cjs` (allowed ≤3) |
| Before tests → after (`pre_sec1b` → `post_sec1b`) | `user_profiles` +1 | qa-student profile created on first sign-in (E2E journey) |
| | `admin_audit_logs` +1 | `TAXONOMY_NODE_CREATE` by **qa-admin**, written by an interrupted GAP2-1b smoke attempt; its taxonomy rows were cleaned up (0 `qa-smoke-%` nodes/subjects/topics remain) |
| | everything else | **identical**: all other counts, all content fingerprints, all 137 functions, storage objects |

**E2E journey data:** removed with `E2E_KEEP_USER=1`: 3 occurrences, 3 vault rows, 6 answers, 4 section results, result, attempt, coin ledger/wallet, gamification event, streak log, streak. The identity was kept.

**Live test L-04:** left `user_metadata.role = null` on qa-student (count unchanged).

No schema, RLS or grant change (function and constraint fingerprints identical).

## 8. Open questions for the architect

| # | Question |
|---|---|
| Q1 | **Staff scope.** The current behaviour (staff = admin everywhere except drill-down) is preserved, so there are **no ambiguous cases** (hard stop (c) not triggered). Recommended admin-only candidates, for decision: premium/billing configuration and kill switches (`app/admin/premium/actions.ts`, 10), exam deletion / danger zone (`app/admin/exams/actions.ts`), reward settlement and redemption status (`app/admin/rewards/actions.ts`, 5), bulk import commit (`executeBulkImportAction`, `importBulkQuestionsAction`), user management actions in `app/admin/actions.ts`, Adaptive emergency/algorithm activation (quarantined). Changing these is a one-line `allowStaff` flip each. |
| Q2 | **Audit-log failures** stay non-blocking but are logged (the primary write already committed). Should an audit failure instead fail the action (requires a transactional pattern or RPC)? |
| Q3 | `mapUnitToExamAction` now **fails honestly**. Its insert targets `exam_unit_mappings.exam_topic_mapping_id`, which does not exist (GAP2-1a D2); the fake success had hidden this. Fix in the GAP2 syllabus work. |
| Q4 | The CA import route keeps its machine-to-machine **bearer token** (`CURRENT_AFFAIRS_INGESTION_KEY`, constant-time compare) as the only non-session credential. Confirm it stays. |
| Q5 | Compile-time reference resolvers return placeholder assets/questions when no catalog client is provided (validation weakness, not a write path). Out of SEC-1B scope; GAP2 Content Studio. |
| Q6 | `ADMIN_EMAILS` still grants admin (unchanged by rule; removal is SEC-1). |
| Q7 | **Quarantined modules (phase rule: guards only).** With their feature flags forced **on**, 12 Adaptive actions (6 in `app/admin/adaptive/actions.ts` + their 6 dead duplicates in `app/admin/actions.ts`) would return raw DB error text (`catch { return { error: err.message } }` via a local variable). Also `getCandidateDrillDownAction` returns candidate data even if its mandatory audit insert fails. Both are unreachable today (flags off; Q-01). **Fix before re-enabling ADAPTIVE / LIVE_TESTS.** |

## 9. Commit plan (NOT committed)

Message:
```
fix(sec-1b): fail-closed admin authorization for server actions and routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Files (89 modified/new; never `.env*`, backups, CA files, scratch):
- **New:** `lib/auth/require-admin.ts`, `lib/actions/action-result.ts`, `scripts/qa/ensure-qa-identities.cjs`, `scripts/test_sec1b_admin_authz.cjs`, `docs/testing/QA_IDENTITIES.md`, `docs/reports/sec/SEC1B_ADMIN_AUTHZ_REPORT.md`
- **Admin actions (14):** `app/admin/actions.ts`, `app/admin/{adaptive,content,exams,gamification,live-tests,premium,rewards,taxonomy}/actions.ts`, `app/admin/live-tests/intelligence/actions.ts`, `actions/{admin-exam-knowledge,exam-knowledge-import,exam-knowledge-prompt,question-factory}.actions.ts`
- **Admin routes (24):** every `app/api/admin/**/route.ts`
- **Services/lib/types (13):** `services/{admin,admin-content-studio,admin-current-affairs,current-affairs-daily-quiz,curriculum-coverage,learning-document}.service.ts`, `services/ai/structured-content-importer.service.ts`, `services/exam-onboarding/{exam-onboarding,exam-onboarding-importer}.service.ts`, `services/question-factory/admin-question-factory.service.ts`, `services/taxonomy/taxonomy.service.ts`, `lib/admin/bulk-importer.ts`, `types/exam-onboarding.ts`
- **UI (26):** the `components/admin/**` files listed in §3
- **Test/E2E harness (7):** `scripts/test_{qf1_question_factory,sec1a_containment,drift1c_features,gap2_1b_taxonomy,gap2_2a_learning}.cjs`, `scripts/e2e/{_e2e-env,cleanup-student}.cjs`

## 10. Status

All authorization, fallback, static, unit, live, E2E, tsc, lint and build checks pass, and the baseline holds. One required regression, **`test_gap2_1b_taxonomy --db --smoke`, could not be executed** within the retry limit because of Supabase connectivity (no code failure observed).

(Superseded by §11 below.)


---

# Architect audit round (2026-10-13)

## 3a. Q1 role flips (applied — admin only)

Staff keeps question / learning / CA authoring, review and publish, plus exam-knowledge editing. Flipped handlers (staff → `FORBIDDEN`; guard `guardAdminAction()` / `guardAdminRoute()`):

| Category | Handlers |
|---|---|
| Premium (all 10) | `app/admin/premium/actions.ts`: `updateGlobalPremiumConfigAction`, `setExamPremiumAvailabilityAction`, `setTestTypeAvailabilityAction`, `updateGeneratorPolicyAction`, `searchCandidateAction`, `grantPromotionalPassAction`, `revokeEntitlementAction`, `updateCustomLimitsAction`, `toggleTestSeriesStatusAction`, `updateMockCuratedStatusAction` |
| Rewards (all 5) | `app/admin/rewards/actions.ts`: `createRewardAction`, `updateRewardAction`, `toggleRewardActiveAction`, `updateRedemptionStatusAction`, `uploadRewardImageAction` |
| Exam deletion / danger zone | `app/admin/exams/actions.ts`: `archiveExamAction`, `evaluateExamDeletionEligibilityAction`, `deleteExamDraftAction` (exactly the three actions used by `components/admin/exam-onboarding/exam-danger-zone.tsx`). `admin-exam-knowledge.actions.ts` has **no** exam-deleting action. |
| Bulk import, commit only | `app/admin/actions.ts`: `executeBulkImportAction` (`payload.mode === "commit"` → admin only; preview stays staff), `importBulkQuestionsAction` (`mode === "commit"` → admin only; dry-run stays staff) |
| Adaptive config / emergency / algorithm (both copies) | `app/admin/adaptive/actions.ts` **and** the duplicate block in `app/admin/actions.ts`: `updateAdaptiveGlobalStatusAction`, `toggleAdaptiveEmergencyAction`, `updateAdaptiveSafetyLimitsAction`, `createAdaptiveAlgorithmVersionAction`, `activateAdaptiveAlgorithmVersionAction`, `saveAdaptiveConfigAction`, `updateEstimatorConfigAction`, `updateCATConfigAction`, `updateStoppingConfigAction`, `updatePersonalizationConfigAction` (10 × 2; guards only, quarantine order kept) |
| Taxonomy structural writes | `app/admin/taxonomy/actions.ts`: `createTaxonomyNodeAction`, `renameTaxonomyNodeAction`, `setTaxonomyNodeActiveAction`, `reorderTaxonomyNodesAction`. `TaxonomyService`: `createNode`, `renameNode`, `reorder`, `setActive` admin only. `listTree` and `listNodesByType` stay staff (needed by the sections subject picker). |
| CA ingestion trigger (session path) | `app/api/admin/current-affairs/import/route.ts#POST` session path → `guardAdminRoute()`; the bearer path is unchanged. CA production sync has **no** action or route trigger (service + scripts only); `sync-status` is a read. |
| User / role management | **None exist.** The `/admin/users` page is a read-only list, and no admin action modifies users or roles. Nothing flipped (§8b). |

**Total:** 45 handlers (42 always-admin + 2 commit-only + 1 route session path) + 4 service mutations.

**Tests:**
- SEC-1B matrix (e) now expects staff `FORBIDDEN` on exactly this set (plus candidate drill-down) and allowed elsewhere: **258/258**.
- B-01 checks the commit-only flips.
- L-06 (live, real qa-staff session): premium `searchCandidateAction` → FORBIDDEN; `createTaxonomyNodeAction` → FORBIDDEN; `qfListReviewQueueAction` → allowed.

## 6b. Audit-round verification

| Item | Result |
|---|---|
| SEC-1B suite (offline + `--live`) | **32/32**: U 6, Q-01 1, M-00 + 6 scenarios (258/258 each), S 4, **B-01**, **C-01…C-04**, F 3, L **6** (incl. L-06) |
| CA boundary tests (added to the SEC-1B suite) | C-01 valid bearer → `importDraft` only (approve/publish/compile never called) · C-02 invalid / missing bearer, no session → 401, no import, no raw text · C-03 student → 403, staff → 403, admin → allowed · C-04 bearer to approve / publish → 401, services never called. All PASS. |
| **Existing CA suites** (CA-1…CA-6, CA-7.2, 7.3, 7.4, 7.5, 7.6, public-read regression; 12 scripts) | **NOT RUN — BLOCKED by standing constraints.** Every script sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` and connects with `ssl: { rejectUnauthorized: false }` and no ref guard. None has an offline / non-mutating mode, CA-7.4 has **no `--dry-run`**, and all contain write paths (INSERT / UPDATE / DELETE, import / publish). Running them would violate "verified TLS only" and "no real import, no publish" (§11). |
| `test_gap2_1b_taxonomy --db --smoke` (as qa-admin) | **41/41** (offline 13 + DB 25 + smoke 3) on attempt 3 of 3. Attempts 1–2 failed on connectivity. One of them wrote a single qa-admin `TAXONOMY_NODE_CREATE` audit row; its node was removed. |
| QF-1 offline / DB | 73/73 · 15/15 |
| SEC-1A | 20/20 |
| DRIFT-1c | 39/39 |
| GAP2-2a offline / DB | 11/11 · 18/18 |
| GAP2-1b offline | 13/13 |
| tsc / lint / build | 0 errors / 0 errors / OK |

### Admin UI smoke (Playwright, installed Chrome, local dev server; read-only)

**Checks:**
- qa-admin loads 10 pages: dashboard, content studio, question factory, taxonomy, exams, exam knowledge, current affairs, premium, rewards, users.
- One deliberate Content Studio validation failure: Authoring Queue → Import → invalid JSON. The importer validates before any write.
- qa-staff loads 4 content pages (content studio, question factory, current affairs, exam knowledge).
- qa-staff premium candidate search.

| Run | Result | Failures |
|---|---|---|
| 1 | 12/16 | profile self-heal `fetch failed` logged on 2 admin pages; a 400 resource on staff CA; premium search input behind a tab (script fixed) |
| 2 | 13/16 | qa-admin "Access Restricted" on question factory; Content Studio queue not found; profile `fetch failed` |
| 3 | **15/16** | qa-staff "Access Restricted" on question factory (passed in runs 1 and 2) |

- **Every failure coincides with logged Supabase network errors** in the dev server: 31 `TypeError: fetch failed` in total, made up of `ECONNRESET` and `UND_ERR_CONNECT_TIMEOUT`.
- The "Access Restricted" results are the admin layout **failing closed** when the session lookup cannot reach Supabase.
- **Every check passed in at least one run:**
  - all 10 admin pages render with HTTP 200, no error boundary and no console error;
  - all 4 staff content pages load;
  - staff premium action → **"You do not have permission to perform this action."**;
  - the Content Studio validation failure shows the safe message, with no DB text.
- No single run was fully clean, because of the network.

**Screenshots** (`docs/reports/sec/sec1b/`): `a01…a10-admin-*.png`, `c01-content-studio-validation-failure.png`, `s01…s04-staff-*.png`, `s05-staff-premium-denied.png`.

## 7b. Closing baseline (`pre_sec1b` → after the audit round)

| Difference | Explanation |
|---|---|
| `admin_audit_logs` 21 → 29 (+8) | all **qa-admin** `TAXONOMY_NODE_*` rows: one full GAP2-1b smoke (7) + one `TAXONOMY_NODE_CREATE` from an interrupted attempt; 0 `qa-smoke-%` taxonomy rows remain |
| `user_profiles` 22 → 25 (+3) | profiles of the 3 permanent QA identities (created on first sign-in) |
| everything else | identical: all other counts, every content fingerprint, all 137 functions, storage; **no schema / RLS / grant change**; `auth.users` unchanged since the 3 QA identities |

## 8b. Architect rulings recorded

| # | Ruling |
|---|---|
| Q1 | **Applied** (§3a). User/role management: **no such actions exist**, so nothing was flipped and no guess was made. |
| Q2 | Audit-log failures stay **non-blocking + logged** for now. **The drill-down audit must become blocking before LIVE_TESTS is re-enabled.** |
| Q3 | `mapUnitToExam` schema drift → **GAP2-4** |
| Q4 | CA bearer-token ingestion **confirmed** (now also covered by C-01…C-04) |
| Q5 | Compile reference resolvers → **GAP2-2b** |
| Q6 | `ADMIN_EMAILS` removal → **SEC-1** |
| Q7 | Fixing the quarantined modules' error paths (Adaptive raw-text returns, drill-down audit) is a **precondition for re-enabling ADAPTIVE / LIVE_TESTS** |
| New | **CA test suites disable TLS verification globally** (`NODE_TLS_REJECT_UNAUTHORIZED = '0'`, `rejectUnauthorized: false`) and connect without the ref guard. Item 2 needs one of: (a) authorize rewriting the 12 suites onto `scripts/db/_db-env.cjs` (verified TLS + ref guard) with read-only / `--dry-run` modes; (b) authorize a runner shim that forces verified TLS, the ref guard and a write firewall around the unmodified suites (results would be partial, because write-dependent gates fail); (c) waive item 2. |

## 11. Closure

| Item | Status |
|---|---|
| 1 Q1 role flips + matrix (e) + L-06 | **PASS** |
| 2 CA regression | **BLOCKED.** The existing CA suites cannot run without violating the verified-TLS and no-mutation constraints. The new CA boundary tests C-01…C-04 PASS. |
| 3 GAP2-1b `--db --smoke` | **PASS** (41/41) |
| 4 Admin UI smoke | **Every check passed in at least one of 3 runs; no fully clean run** (Supabase network failures, layout fails closed) |
| 5 Re-runs + baseline | **PASS** |
| 6 Report | updated (this section) |
| 7 Commit / push / production checks | **NOT DONE**: conditional on all items passing |

**Commit plan delta:** add `docs/reports/sec/sec1b/*.png` (15 screenshots). The SEC-1B suite already includes the new tests.

(Superseded by §12 below.)

## 12. Architect closure

**CLOSED 2026-10-13** by the architect, with waivers W3 and W4.

| Waiver | Ruling |
|---|---|
| **W3** (item 2) | Option (c) **waived**. The legacy CA suites are **not** to be run, because they disable TLS. Mitigation: a new phase **TEST-CA** rewrites the 12 CA suites onto `scripts/db/_db-env.cjs` (verified TLS + ref guard), adds offline / read-only / `--dry-run` modes and uses the permanent QA identities. TEST-CA is **mandatory before CA-7.5**. It has not been started. |
| **W4** (item 4) | **Accepted.** Every check passed in at least one of 3 runs, and every failure was a Supabase network error with the admin layout failing closed. |

**Finding (open until TEST-CA):** 12 CA test scripts set `NODE_TLS_REJECT_UNAUTHORIZED=0` / `rejectUnauthorized:false` with no ref guard. They must not be run until TEST-CA.

**Commit plan delta:** §9 files + `docs/reports/sec/sec1b/*.png`.

SEC-1B STATUS: CLOSED (W3, W4)
