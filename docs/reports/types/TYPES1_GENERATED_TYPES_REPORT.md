# TYPES-1: Generated database types + typed Supabase clients (decision #24)

> **STATUS: CLOSED** (2026-10-15).
> - Order executed: B0 → C → B1 → B2 → B6 → B4 → CLOSE.
> - B5 moved to GAP2-4; B3 deferred until after TEST-CA.
> - Final state: §9. Tracked items by owner: §10. Owner production smokes: §11.

## 1. Forensics

### 1a. Previous `types/database.ts`

Hand-maintained (no generator or script; edited by hand in GAP2-2a, GAP2-2b and GAP2-3). Compared with the live public schema:

| Object | Hand file | Live | Missing | Extra |
|---|---|---|---|---|
| Tables | 116 | 133 | 21 (canonical_taxonomy_nodes, learning_documents, learning_units, document_versions, exam_* ×9, learning_assets, learning_content_artifacts, learning_unit_asset_bindings, schema_migration_ledger, taxonomy_aliases, taxonomy_fk_flip_log, topic_relationships) | 4 (adaptive_attempt_states, adaptive_question_decisions, adaptive_test_configs, user_adaptive_profiles — **never deployed**) |
| Functions | 53 | 104 | 53 | 2 (`show_limit`, `show_trgm`) |
| Views / enums | 0 | 0 | – | – |
| Stale columns | – | – | exam_topics (3), subscription_plans (1) | – |

### 1b. Client factories

| File:line | Client | Typed with `Database` |
|---|---|---|
| `lib/supabase/server.ts:21` | server session | ✓ |
| `lib/supabase/server.ts:51` | public server | ✓ |
| `lib/supabase/server.ts:72` | admin / service role | ✓ |
| `lib/supabase/client.ts:22` | browser | ✓ |
| `lib/supabase/middleware.ts:27` | middleware | ✓ |
| `app/sitemap.ts:71` | ad-hoc `createClient` | **✗** (to type in batch B6) |

### 1c. Escape baseline (app, services, lib, actions, components): T-03 ceilings

`as any` **639** · `: any` **930** · `unknown as` **109** · `@ts-ignore` **0** · `@ts-expect-error` **0**.

### 1d. Query escapes (architect rule 2)

Scanner: `scripts/types1-query-escapes.cjs`. It counts escapes on the client (`(supabase as any)`, `sb = supabase as any`, `supabase.rpc as any`, `supabaseClient?: any`), inside `.from()`/`.rpc()` arguments, and on the immediate result (`data as any[]`, `{ data }: any = await …`). A sample review found true positives only.

| Category | Count |
|---|---|
| CLIENT | 421 |
| RESULT | 116 |
| **Total** | **537** (75 files, all untracked) |

**537 > 150 → HARD STOP**: no escapes were removed (no piecemeal fixing).

## 2. Generator

- **Supabase CLI `supabase@2.118.0`** (exact pin, devDependency; the newest release at least 14 days old). It adds 15 packages to the lockfile, CLI platform binaries plus `@noble/*` / `@ecies/ciphers`. **None appear in `npm audit`**; the 11 existing findings predate this change.
- **Route:** Management API, `gen types typescript --project-id <ref> --schema public`. Docker is not available, so the `--db-url` route is impossible.

**`scripts/db/gen-types.cjs`, project-ref lock (architect rule 1):**
- the ref comes **only** from `.env.local`, derived exactly as `_db-env.cjs` does (API host ref == DB ref, else exit 1);
- **sha256(ref) must equal the committed couragelibrary-next fingerprint**, else `REF_LOCK` exit 1. The ref itself is not committed;
- `argv` selects the mode only (`--check`); a ref is never read from arguments;
- the CLI runs with `process.execPath` and **no shell**; the token reaches it **only through the child environment**; stderr is scrubbed (token, ref and any `sbp_…`); there is no debug output;
- `--schema public` only (`retired` is never generated; verified);
- a second check asks the Management API for the project name (`couragelibrary-next`). The owner's token is scoped and lacks `project_admin_read` (HTTP 403 with that permission named), so this check is **skipped, not failed**, and the sha256 lock remains mandatory. If a token with that permission is used, a wrong name fails.

**Scripts:**
- `npm run db:types` writes `types/database.ts` with the header `// GENERATED — DO NOT EDIT — regenerate with \`npm run db:types\``, LF line endings and a trailing newline;
- `npm run db:types:check` generates to a temp file, compares, and exits 1 on drift.

**Run:** `db:types` OK, 8,218 lines; `db:types:check` OK (deterministic).

## 3. Typed clients

All `lib/supabase` factories were already typed. With the generated types, `tsc` reports **136 errors**:

| Class | Count | Where |
|---|---|---|
| **C** (quarantined) | **135** | `services/adaptive/*`: adaptive-session 49, adaptive-engine 44, adaptive-performance 28, adaptive-ability 6, adaptive-state 4, adaptive-types 4. Queries the 4 **never-deployed** adaptive tables plus `test_attempts.overall_theta`, which does not exist. Rule 3: tracked escapes mapped to the Adaptive re-enable precondition. |
| **A** | **1** | `services/current-affairs.service.ts:483`, `string \| null` → `string` (nullability) |
| **B** | **0 visible** | Real drift elsewhere is hidden behind the 537 query escapes; it appears only once they are removed. |

The low visible count is the point of rule 2: most queries are not type-checked today.

## 4–5. Error inventory / escape register

Not started (hard stop). The known drift to verify in batches:

| Drift | Sites | Batch |
|---|---|---|
| `user_topic_mastery.topic_id` | DSH-88, CI-539 | B1 / C |
| `questions.topic_id` | EKX-221 | B5 |
| `exam_syllabi.subject_id` | EKC-155, ES-33 | B5 |
| `questions.question_text` | ADP-1225 | C |
| ambiguous `discussion_messages` embed | COM-100 | B2 |
| `daily_study_recommendations` columns | `dashboard.service` | B1 |
| `exam_topic_mapping_id` | `mapUnitToExam` | B4 / B5 |

## 6. Proposed batch plan

Each batch:
- removes its query escapes;
- fixes Class A properly;
- fixes Class B only when unambiguous (otherwise tracked `@ts-expect-error TYPES-1:<ID>` mapped to the owning phase);
- updates `docs/reports/types/TYPES1_ESCAPES.json`;
- runs its domain suites plus tsc, lint and build;
- commits separately.

| Batch | Scope | Query escapes | Files | Covering suites |
|---|---|---|---|---|
| **B0 (foundation, first)** | CLI pin, ref-locked generator, generated `types/database.ts`, runbook step, guardrail test `scripts/test_types1.cjs` (T-01…T-07, T-06 ref-lock unit test), the 135 adaptive tsc errors registered as tracked Class C, the 1 Class A fix, the escape register. **Main is green after B0**: tsc 0, all existing suites. | 0 removed (baseline recorded) | – | all |
| B1 | student core: assessment, mistake, mistake-longitudinal, content, learning-resolver, dashboard, user-profile, bookmark, billing, `app/mistakes`, `app/mock-tests`, `app/wallet` | 81 | 12 | QF-1, GAP2-2a, GAP2-3, E2E |
| B2 | student extras: community, flashcard, descriptive, institute, premium-hub / generator / entitlement, gamification, rewards action | 45 | 7 | SEC-1D (roles), DRIFT-1c |
| B3 | current affairs: admin service, routes, quiz | 57 | 4 | SEC-1B (routes), CA-safe checks |
| B4 | content studio / learning authoring: studio, authoring queue, artifacts, assets, coverage, blueprint, reference catalog, AI | 52 | 9 | GAP2-2a, GAP2-2b |
| B5 | exam knowledge / syllabus / taxonomy | 62 | 13 | GAP2-1b, GAP2-3 |
| B6 | admin core (`app/admin/actions.ts`, admin.service, admin-premium) + infra (storage provider, taxonomy service, bulk importer, header, exam management view, `app/sitemap.ts` client) | 54 | 9 | SEC-1B, SEC-1C, GAP2-1b |
| **C** | quarantined: adaptive, live tests, battles, psychometrics, competition / candidate intelligence. **Tag only** (`TYPES-1:C-…`), mapped to re-enable preconditions; no fixes. | 186 | 21 | DRIFT-1c |
| | **Total** | **537** | 75 | |

The batches stay at ≤ 81 escapes each. The architect may merge B1+B2 or split B5. Recommended order: B0 → C → B1 → B2 → B6 → B4 → B5 → B3.

## 7. Architect ruling (batch plan)

**APPROVED with changes.**

- **Order:** B0 → C → B1 → B2 → B6 → B4 → TYPES-1 CLOSE.
- **B5** (exam knowledge / syllabus, 62) **moved into GAP2-4 as its step 0**, because that code is rewritten there.
- **B3** (current affairs, 57) is **deferred until after TEST-CA**: the CA suites cannot run yet (waiver W3).
- **B3 and B5 stay in the ratchet** as known remaining escapes, with the owner phase recorded in `TYPES1_RATCHET.json` (`remaining[]`).

**Rules for every batch:**

| Rule | Content |
|---|---|
| Ratchet | `docs/reports/types/TYPES1_RATCHET.json` holds {queryEscapes, asAny, colonAny, unknownAs, tsExpectError, tsIgnore}. T-03 / T-07 fail if any value rises. Each batch lowers queryEscapes by its size and commits the new ratchet. New code may never add query escapes. |
| Quarantine pattern | `lib/supabase/quarantine.ts` `quarantinedClient(client, "TYPES-1:C-…")`: an explicitly untyped client; each quarantined file obtains it once; one register entry per file; imports allowed only from quarantined modules (T-08). |
| Class B limit | More than 15 per batch → stop after the inventory. Unambiguous fixes need before/after evidence and a covering test. Ambiguous ones → tracked `@ts-expect-error TYPES-1:<ID>` mapped to the owner phase. |
| Gates | tsc 0, lint 0, build OK, db:types:check OK, test_types1 green, covering suites + SEC-1B/1C offline, no DB changes, baseline no diff |
| Commit | pre-authorised per batch (`chore(types-1/<batch>): …`) → push → production smoke (/, /api/health, anon /admin, plus one domain page). Any failure stops the sequence. |

### 7b. Architect rulings: B1 resume (2026-10-15)

- **B1 approved to resume.** The B1 work is re-applied unchanged on `a17f6e0` (after HOTFIX-1 and UX-0).
- **tsExpectError 0 → 6 exception approved.**
  - It applies only to registered `TYPES-1:B-<ID>` tags.
  - It is recorded in the ratchet's `exceptions[]`.
  - `--update-ratchet` allows the increase only when every directive carries a registered Class B id.
- **Owners:**

  | Tag | Owner |
  |---|---|
  | `B-DSH-VAULT-STATUS`, `B-DSH-MASTERY`, `B-DSH-RECOMMENDATIONS` | **LOOP-1** |
  | `B-BILLING-SUB-STATUS` (×2) | **Commerce** |
  | `B-DRILL-REWARD-ARGS` | **Commerce** |

- **Required interim fix (honest data, decision #15).**
  - A drill must not record `coins_awarded = 5` (or any value) when no coins were credited.
  - It now records only what the reward RPC actually credited; until Commerce wires the reward this is 0.
  - Covered by the test `test_types1_b1` B1-6.
- **Mistake recording swallows insert errors** (`MistakeService.recordExamMistakes`). This is recorded as **LOOP-1's first item**. It is not fixed in B1.
- **E2E must reach 13/13 on the new base** (up to 3 retries for network errors). No waiver.
- **After B1:** continue B2 → B6 → B4 under the approved batch rules, then close TYPES-1.
  - **B6** also handles the browser and middleware client typing (the `@supabase/ssr` 0.5.2 mismatch).
  - A pinned, reviewed ssr upgrade is allowed if it is the clean fix, and must be reported.

### 7c. Architect rulings: after B1 (2026-10-15)

- **B1 CLOSED** (`dc8e885`). The production signed-in smoke `student-mistake` was run by the owner. **Its result was not filled in** in the ruling text (the placeholder was left), so it is still to be confirmed.
- **Drill pre-submit payload must carry no answers.** Confirmed in code, and hardened and tested in B2 (B2-1, B2-2).
- **Signed-in production policy:**
  - For each batch: signed-in evidence from the local production build of the same commit, plus an anonymous production smoke.
  - At TYPES-1 close, the owner runs all signed-in production smokes (`student-mistake`, `admin-home`, `staff-content`).
- **B6:** add the deployed short SHA to `/api/health` (`version`, from `VERCEL_GIT_COMMIT_SHA`) and use it for deploy detection.


## 8. Batch results

### B0: foundation

**Delivered:**
- `supabase@2.118.0` (exact pin);
- ref-locked `scripts/db/gen-types.cjs` with `db:types` / `db:types:check`;
- **generated `types/database.ts`**;
- runbook §6 (apply → `db:types` → commit with the migration);
- `scripts/types1-query-escapes.cjs` and `scripts/test_types1.cjs` (T-01…T-08);
- `TYPES1_ESCAPES.json`, `TYPES1_RATCHET.json`, `lib/supabase/quarantine.ts`;
- `supabase/.temp/` untracked (`git rm --cached`) and ignored.

**Security of `supabase/.temp`:** shape checks only, no values printed. `project-ref` = couragelibrary-next (sha256 match); `pooler-url` has no password segment; and **no** PAT-, JWT-, password- or credential-URL-shaped value appears anywhere in its git history (0 matches).

**Adaptive quarantine (C, 135 tsc errors resolved honestly):**
- `adaptive-session` and `adaptive-engine` acquire their client once in `getClient()` via `quarantinedClient(…, "TYPES-1:C-ADAPTIVE-SESSION" | "…-ENGINE")`.
- `adaptive-performance`, `-ability` and `-state` take a `QuarantinedClient` parameter.
- Per-line query escapes in these files were removed (client casts, payload casts, result casts; `x as unknown as Row` → `x as Row`).
- `adaptive-types.ts` now declares the 4 **undeployed** row shapes explicitly instead of deriving them from `Database` (`TYPES-1:C-ADAPTIVE-TYPES`).
- 6 register entries, all mapped to the ADAPTIVE re-enable precondition.

**Class A (1, fixed):** `services/current-affairs.service.ts:483` — `slug: data.slug ?? slug`. The row is matched by `.eq('slug', slug)` and the live column is nullable, so no cast is needed.

**Class B:** 0 surfaced (most queries are still behind escapes; they surface batch by batch).

**`app/sitemap.ts` client typed:** `createClient<Database>` was moved from B6 into B0 for T-02; it raised no errors.

**Counts:**
- **Ratchet (occurrence counts):** queryEscapes **532** (537 at inventory; −5 adaptive), asAny **609**, colonAny **960**, unknownAs **93**, tsExpectError **0**, tsIgnore **0**.
- **HEAD → B0 on tracked files:** asAny 640 → 608, colonAny 960 → 960, unknownAs 109 → 93. Nothing rose.
- The §1c baseline (639 / 930 / 109) counted **lines** with grep, which is a different metric.

**Remaining scopes in the ratchet:**

| Batch | Escapes | Owner |
|---|---|---|
| C | 181 | tag only |
| B1 | 81 | |
| B2 | 45 | |
| B3 | 57 | after TEST-CA |
| B4 | 52 | |
| B5 | 62 | GAP2-4 |
| B6 | 54 | |

**Gates:**
- tsc **0**, lint 0 errors, build OK, `db:types:check` OK, **test_types1 8/8**.
- Full regressions: QF 73 + 15, SEC-1A 20, SEC-1B 26 + live 32, SEC-1C 22 + live 29, SEC-1D 14 + live 19, DRIFT-1c 46, GAP2-1b 13 + db/smoke 41, GAP2-2a 11 + 18, GAP2-2b 18 + 32, GAP2-3 3 + 15, **E2E 13/13** (cleaned).

**Test maintenance:** GAP2-3's D-06 / E-01 baseline was captured while qa-student held 3 transient Mistake Vault rows, later cleaned. `user_mistake_vault` is now treated as QA-volatile: relationship and key shape are checked; data hashes are not.

**Baseline:** no data diff except `admin_audit_logs` +7 (qa-admin `TAXONOMY_NODE_*` rows from the mandated GAP2-1b smoke run; the accepted QA-identity treatment).

### C: quarantined modules (tag only)

**19 files** (live tests ×9 incl. 2 admin pages, competition / candidate intelligence, admin-adaptive + 4 adaptive services, battles, psychometrics, the adaptive admin UI component) now obtain their Supabase client through `quarantinedClient(…, QUARANTINE_TAG)`, with one `TYPES-1:C-<NAME>` constant per file. Per-line query escapes were removed. Register: **25 entries** (6 from B0 + 19), each mapped to its re-enable precondition (ADAPTIVE / LIVE_TESTS incl. Q2 + Q7 / BATTLES / PSYCHOMETRICS).

**Helper hardened:**
- **Problem:** `SupabaseClient<any, any, any>` still ran postgrest-js's type-level select parser, which produced embed arrays and bound `.rpc` to the generated function list, so it is not "explicitly untyped".
- **Change:** `QuarantinedClient` is now a minimal interface (`from` / `rpc` / `schema` / `storage` / `auth` returning the single registered untyped alias), plus `QuarantinedRow` for callback parameters over quarantined results.
- **Annotations:** 20 callback parameters annotated `: QuarantinedRow` (named quarantine, not `any`).

**Client component exception:** `components/admin/adaptive/admin-adaptive-manager.tsx` is a client component and cannot import the server helper. Its 2 action-result casts carry tracked `TYPES-1:C-ADAPTIVE-MANAGER` comments (registered).

**Runtime note (quarantined, flags off):**
- `battle.service` previously called an **unbound** `supabase.rpc as any` (`const rpcCall = …; rpcCall(…)`), which loses `this`. It is now `supabase.rpc.bind(supabase)`.
- `candidate-intelligence` iterates `data ?? []` instead of `data as any[]`, which also handles a `null` result.

**Class A/B:** none surfaced. Class C: all tsc errors resolved through the quarantine (tsc 0).

**Ratchet:**

| Count | Before | After |
|---|---|---|
| queryEscapes | 532 | **353** (−179; batch size 181, of which 2 remain as tracked tags) |
| asAny | 609 | 443 |
| colonAny | 960 | 950 |
| unknownAs | 93 | 89 |
| tsExpectError | 0 | 0 |
| tsIgnore | 0 | 0 |

C has been removed from `remaining[]`.

**Gates:**
- tsc 0, lint 0, build OK, `db:types:check` OK, test_types1 **8/8**;
- DRIFT-1c 46/46, SEC-1B 26/26, SEC-1C 22/22, SEC-1A 20/20, QF-1 73/73;
- baseline: **NO DIFF**.

### B1: student core

**Escapes.** All **81 of 81** planned query escapes are removed, across 12 files:
- 8 services: assessment, mistake, learning-resolver, content, dashboard, billing, bookmark, user-profile
- 4 app files: mock-tests and mistakes actions, mistakes page, wallet

The work was re-applied unchanged on `a17f6e0` (after HOTFIX-1 and UX-0) and re-gated there.

**Ratchet:**

| Counter | Before | After |
|---|---|---|
| queryEscapes | 353 | **272** (−81) |
| asAny | 443 | 367 |
| colonAny | 950 | 939 |
| unknownAs | 89 | 85 |
| tsExpectError | 0 | **6** (approved exception, recorded in `exceptions[]`) |
| tsIgnore | 0 | 0 |

B1 has been removed from `remaining[]`.

**Class A: typing only, no runtime change.**
- **`@supabase/ssr` 0.5.2 vs supabase-js 2.109.** The ssr client is declared with the pre-2.5x generic order, so every table on the session client resolved to `never`. This caused 165 of the 197 first-pass errors.
  - **Fix:** `createServerSupabaseClient()` now returns `Promise<SupabaseClient<Database>>`.
  - T-02 asserts this.
  - The browser client (`lib/supabase/client.ts`) and middleware have the same mismatch. They are deferred to B6 per the ruling.
- **Other Class A items:**
  - the mistake lifecycle union
  - drill payloads as JSON-compatible type aliases
  - the course RPC JSON narrowing (`rpcJsonObject`)
  - the `getTestResult` fallback re-query
  - `formatIstDateTime(new Date())`
  - 27 unused `eslint-disable` lines removed

**Class B: real drift, 13 items (≤ 15).** Each fix has a live before/after check: the old select fails with 42703, the fixed one returns data. All are covered by `scripts/test_types1_b1.cjs` (8/8).

| # | Location | Defect | Effect before | Resolution |
|---|---|---|---|---|
| 1 | `mistake.service.ts` `getMistakeDetail` | Non-existent columns `content_text`, `option_order`, `solution_explanation_md`; one-to-one `question_answers` read as an array | **Mistake detail showed an empty question with no options, and the correct answer was always "A"** (screenshot `docs/ux/ux0/screens/student/mistakes__vaultId`) | Fixed: live columns, one-to-one object |
| 2 | Same function | The question plus answer embed ran with the **student session**, but students cannot read `question_answers` (RLS; E2E-07), so the whole embed returned nothing even after fix 1. Found during the B1 re-gate by the new signed-in smoke. | Same as 1 | Fixed: ownership is proven by the session-scoped vault row, then the question and answer are read server-side with the admin client, as `AssessmentService.getTestResult` does |
| 3 | `mistake.service.ts` drill compile | Same non-existent option columns | Building a drill always failed | Fixed |
| 4 | `mistake.service.ts` drill grading | Non-existent `solution_explanation_md`; answer read as an array; read every version of a question; read with the student session (RLS-denied) | Every drill answer graded against "A", with no explanation | Fixed: the compiled version ids, with the answer read server-side after the drill-ownership check |
| 5 | `mistake.service.ts` drill reward | `.catch` called on a PostgREST builder, which is not a Promise | A TypeError aborted drill submission | Fixed: awaited inside try/catch |
| 6 | Same block | `coins_awarded = 5` written although no coins were credited | Dishonest data (#15) | **Interim fix (ruling):** records only coins the RPC actually credited; 0 until Commerce wires the reward (B1-6) |
| 7 | `assessment.service.ts:971, 1365` | `test_results` is one-to-one but was read as an array | The resume "answered" count was always 0 | Fixed (`oneToOne`) |
| 8 | `assessment.service.ts:607` | Today's mock title was read but not selected | A fallback title was shown | Fixed |
| 9 | `assessment.service.ts:530` | `subjects.code` does not exist | `getExamDetail` subjects were always empty (no callers) | Fixed (slug) |
| 10 | `dashboard.service.ts:110` | `user_mistake_vault.status` does not exist | The dashboard mistake count fails | **Tracked** `TYPES-1:B-DSH-VAULT-STATUS` → LOOP-1 |
| 11 | `dashboard.service.ts:121` | `user_topic_mastery` legacy columns (DSH-88) | The mastery panel is always empty | **Tracked** `B-DSH-MASTERY` → LOOP-1 |
| 12 | `dashboard.service.ts:133` | `daily_study_recommendations` legacy columns | The recommendations panel is always empty | **Tracked** `B-DSH-RECOMMENDATIONS` → LOOP-1 |
| 13 | `billing.service.ts:147,157` and `mistake.service.ts:1861` | `user_entitlements.status` / `valid_until` do not exist; reward RPC argument names are wrong | `/billing` and `/pricing` always show FREE; drill coins are never credited | **Tracked** `B-BILLING-SUB-STATUS` (×2), `B-DRILL-REWARD-ARGS` → Commerce |

**Class C:** none in B1.

**Recorded for LOOP-1 (first item; not fixed in B1).** `MistakeService.recordExamMistakes` swallows insert errors. In the first B1 E2E run, during network errors, 1 of 3 wrong answers produced no vault row. The re-gate runs passed 13/13.

**New tooling:**
- `scripts/test_types1_b1.cjs`: static, plus live read-only checks ref-locked to couragelibrary-next.
- `scripts/smoke/signed-in-smoke.cjs`: signed-in smoke for the QA identities, with checks `student-mistake`, `admin-home` and `staff-content`.
- The `--update-ratchet` Class B exception.

**Gates** (local production build of `a17f6e0` + B1, final code):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| `db:types:check` | OK |
| test_types1 | 8/8 |
| test_types1_b1 | 8/8 |
| QF-1 | 73/73 + 15/15 |
| GAP2-2a | 11/11 + 18/18 |
| GAP2-3 | 15/15 |
| SEC-1A | 20/20 |
| SEC-1B | 26/26 + **live 32/32** |
| SEC-1C | 22/22 + **live 29/29** |
| SEC-1D | 14/14 + **live 19/19** |
| DRIFT-1c | 46/46 |
| QA identity guard | 8/8 |
| HOTFIX-1 | 4/4 |
| **E2E** | **13/13** (first try), as qa-student with `E2E_KEEP_USER=1` and a data-only cleanup after |
| **Signed-in smoke `student-mistake`** | **all passed**: question text (80 chars), options A–D, correct answer marked, mock result renders a score |
| Baseline | **NO DIFF** |

### B2: community, descriptive, flashcards, gamification, institutes, premium hub

**Escapes.** All **45 of 45** planned query escapes are removed, across 7 files: admin rewards actions, community, descriptive, flashcard, gamification, institute, premium-hub.

**Ratchet:**

| Counter | Before | After |
|---|---|---|
| queryEscapes | 272 | **227** (−45) |
| asAny | 367 | 324 |
| colonAny | 939 | 939 |
| unknownAs | 85 | 85 |
| tsExpectError | 6 | 6 |
| tsIgnore | 0 | 0 |

B2 has been removed from `remaining[]`.

**Architect item: the drill pre-submit payload.**
- **Confirmed true by construction:**
  - `DrillQuestion` has no answer fields.
  - Drill compile selects only `question_options`.
  - Answers reach the browser only in the post-submit result (`mistake-drill-result.tsx`).
- **Gap:** the resume path (`getMistakeDrill`) passed stored `questions_data` through unfiltered.
- **Hardening:** `services/mistakes/drill-payload.ts` `toPublicDrillQuestions()` rebuilds every pre-submit question (generate and resume) from an explicit whitelist.
- **Tests:**
  - B2-1: injected `correct_option_key`, `answer_key`, `is_correct`, `explanation*`, `solution*` and `question_answers` never survive.
  - B2-2: both paths are projected; compile and the drill runner reference no answer data.

**Class A: typing only.**
- New `lib/supabase/rpc.ts`:
  - `rpcJsonObject<T>()` narrows jsonb RPC results. It replaces B1's private copy in content.service.
  - `sqlNullArg()` is the single documented place where SQL NULL is passed to a function argument that has no default, because the generator never types function arguments as nullable.
- **RPC arguments declared `DEFAULT NULL` are now omitted (`|| undefined`)** instead of being passed as null. This is identical behaviour, verified read-only with `pg_get_function_arguments`:
  - `fn_post_discussion_message`, `fn_flag_discussion_content`
  - `fn_submit_descriptive_answer`, `fn_evaluate_descriptive_submission`
  - `fn_create_batch_assignment`
- **Literal-union narrowing:** `contextType`, `status`, `difficulty`, `submissionType`, `accessTier`.
- **One-to-one embeds** read as objects: submission evaluations, test results.
- **Reward metadata** narrowed to an object.

**New tool: live select audit** (`scripts/types1-select-audit.cjs`).
- It runs every literal `.from().select()` in the given files read-only against couragelibrary-next (ref-locked, `limit 1`).
- It catches runtime drift that tsc cannot see, because those results are cast or never read in a typed way.
- B2 files: 3 failures found and fixed (items 1–2 below). Re-run on the B1 files, it found **3 drifts B1 had missed** (items 3–5).

**Class B: 6 items (≤ 15)**: 5 fixed, 1 tracked; item 6 is one defect family across 4 call sites. Before/after evidence is the select audit (failing → 0 failing, apart from tracked items). Covered by `scripts/test_types1_b2.cjs`.

| # | Location | Defect | Effect before | Resolution |
|---|---|---|---|---|
| 1 | `community.service.ts` thread detail | `discussion_messages(*)` embed is ambiguous: two FKs (`messages.thread_id`, `threads.accepted_answer_id`), PGRST201 | **Every `/community/[id]` rendered not-found** | Fixed: hint `discussion_messages!discussion_messages_thread_id_fkey` |
| 2 | `premium-hub.service.ts` (2 selects) | `test_results(score)` does not exist (42703) | Premium hub: attempt state, recent attempts, completed count and best score always empty | Fixed: `total_score`, one-to-one |
| 3 | `assessment.service.ts:718` (B1 carry-over) | `test_results(score)` (42703) | Today's daily mock card never showed submitted / in-progress state for the student | Fixed |
| 4 | `dashboard.service.ts` streak (B1 carry-over) | `user_streaks.freeze_active` does not exist (42703) | Dashboard streak panel always empty | Fixed: `is_frozen` (UI field unchanged) |
| 5 | `dashboard.service.ts` readiness (B1 carry-over) | `user_exam_readiness.overall_readiness_pct` / `predicted_score` do not exist; the table is per exam with `readiness_index` | Dashboard readiness always empty | **Tracked** `TYPES-1:B-DSH-READINESS` → LOOP-1 (comment tag + register; no new `@ts-expect-error`) |
| 6 | `premium-entitlement.service.ts` ×2, `premium-generator.service.ts`, `billing.service.ts` | **Unbound `supabase.rpc`** (`rpc as unknown as …`) loses `this`, so every call threw *"Cannot read properties of undefined (reading 'rest')"*. Not in any batch: the escape scanner does not count `rpc as unknown as`. Found by the new signed-in page smoke. | **`/premium` crashed (error boundary) for every signed-in user.** Premium attempt start, dynamic mock creation and payment-order creation would also throw (payments are off). | Fixed: `.rpc.bind(client)`, arguments unchanged. B2-6 bans unbound `rpc` repo-wide. |

**Out-of-band finding (not run).** `scripts/test_phase5e1_rewards.cjs`, the only existing suite for these modules, sets `NODE_TLS_REJECT_UNAUTHORIZED = '0'`. That violates the TLS rule, so it was **not run** and is recorded for clean-up. B2 coverage instead comes from:
- `test_types1_b2` (including the live select audit)
- E2E, which exercises the gamification award, streak, coins and wallet
- the new signed-in `student-pages` smoke (dashboard, community, descriptive, submissions, flashcards, institutes, premium, store, wallet, plus a thread / deck detail when data exists)

**Gates** (local production build, final B2 code):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 (incl. `db:types:check`) | 8/8 |
| test_types1_b2 | 6/6 (incl. live select audit: 151 ok, 3 tracked legacy) |
| test_types1_b1 | 8/8 |
| QF-1 | 73/73 + 15/15 |
| GAP2-2a | 11/11 + 18/18 |
| GAP2-3 | 15/15 |
| SEC-1A | 20/20 |
| SEC-1B | 26/26 + **live 32/32** |
| SEC-1C | 22/22 + **live 29/29** |
| SEC-1D | 14/14 + **live 19/19** |
| DRIFT-1c | 46/46 |
| QA identity guard | 8/8 |
| HOTFIX-1 | 4/4 |
| **E2E** | **13/13** (first try) |
| Signed-in `student-mistake` | **all passed** |
| Signed-in `student-pages` | **all passed** |
| Baseline | **NO DIFF** (data-only cleanup after) |

### B6: admin core, layout header, storage, taxonomy service; ssr client typing; `/api/health` version

**Escapes.** All **54 of 54** planned query escapes are removed:
- `app/admin/actions.ts` 27
- `services/admin.service.ts` 17
- admin-premium 3
- storage 3
- taxonomy 1
- bulk-importer 1
- exam-management view 1
- layout header 1

**Ratchet:**

| Counter | Before | After |
|---|---|---|
| queryEscapes | 227 | **173** (−54) |
| asAny | 324 | 276 |
| colonAny | 939 | 919 |
| unknownAs | 85 | 83 |
| tsExpectError | 6 | **12** |
| tsIgnore | 0 | 0 |

- **The tsExpectError 6 → 12 increase is for architect review.** It uses the same registered Class B mechanism approved for B1, and is recorded in `exceptions[]` as batch B6.
- The 6 new directives belong to three admin-module tags, two each (A2, items 9–11).
- B6 has been removed from `remaining[]`.

#### A1. Ruled items
- **`@supabase/ssr` browser and middleware typing.**
  - New `lib/supabase/types.ts`, with `AppSupabaseClient` and `fromSsrClient()`. This is the single documented adapter for ssr 0.5.2's pre-2.5x generic order.
  - The server, browser (`lib/supabase/client.ts`) and middleware factories all use it, so every client-component query is now typed against `Database`. No component errors surfaced.
  - **I chose the adapter over an upgrade:**
    - zero runtime change to cookie and auth handling
    - no install
  - **Upgrade option for later:** a pinned `@supabase/ssr` release built against supabase-js 2.5x+ generics would let `fromSsrClient` be deleted. It needs its own phase with auth and E2E regression.
- **`/api/health` `version`.**
  - `lib/deploy/version.ts` `deployedVersion()` returns the 7-character lowercase hex SHA from `VERCEL_GIT_COMMIT_SHA`: "dev" when unset, "unknown" when not hex. No other environment data is exposed.
  - **Deploy detection** now uses `scripts/smoke/wait-for-deploy.cjs <url> <sha>`.
  - Tested by B6-2.
- **`any` client parameters** became `AppSupabaseClient`: `getDefaultOrgId`, the storage factory and Supabase storage provider, and the taxonomy `AdminContext`.

#### A2. Class B: 11 families (≤ 15). Live select audit: 10 failing → 0 failing.

| # | Location | Defect | Effect before | Resolution |
|---|---|---|---|---|
| 1 | `actions.ts` `deleteQuestionAction` | Checked `test_responses`, which never existed (PGRST205), so the "has student responses" guard always passed | A question with attempt history but no frozen version could be hard-deleted | **Fixed:** checks `attempt_answers` → `mock_questions` → the question's versions |
| 2 | `admin.service.ts` `getAdminSections` | Legacy `subjects` / `topics` embeds broke after the GAP2-3 FK flips (PGRST200) | `/admin/sections` bank and topic counts always 0 | **Fixed:** canonical nodes via `pattern_sections_subject_id_node_fkey` and the `root_subject_id` self-relation (TOPIC filter) |
| 3 | Same function (fallback) | `subjects(topics(questions))` (PGRST200) | Fallback list empty | **Fixed:** canonical SUBJECT nodes |
| 4 | `getAdminQuestionsWithHierarchy` | Legacy `topics(subjects)` embed (PGRST200), plus projection subject/topic filter lists | **`/admin/questions` (question bank) returned no rows** | **Fixed:** `topics:canonical_taxonomy_nodes!questions_canonical_topic_id_node_fkey`; subjects and topics from canonical nodes |
| 5 | Admin dashboard stats | Counted `descriptive_prompts` and `community_moderation_flags`, which never existed | Those counts always 0 | **Fixed:** counts `descriptive_questions` and `discussion_moderation_flags` |
| 6 | `getAdminBilling` + `/admin/billing` | `subscription_plans.code` / `price_inr` do not exist (42703), and the page read `.orders` / `.plans` from an array | **`/admin/billing` crashed** (`plans.length` of undefined) | **Fixed:** `plan_code`, `base_price_inr`, `payment_orders`; returns `{ plans, orders }` |
| 7 | `createSubscriptionPlanAction` | Inserted `code` / `price_inr` | Creating a plan always failed | **Fixed:** `plan_code` / `base_price_inr` |
| 8 | `getAdminCommunityFlags`, `getAdminDescriptive`, `getAdminInstitutes` (reads) | Non-existent tables and columns | The lists were always empty | **Fixed:** read `discussion_moderation_flags` (target → thread / message), `descriptive_questions`, `institutes` without `city` |
| 9 | Admin descriptive create + page | `descriptive_prompts` never existed; `descriptive_questions` needs a slug policy; the manager's item type differs | Creating a prompt fails | **Tracked** `TYPES-1:B-ADM-DESCRIPTIVE` → Community |
| 10 | Admin community resolve + page | Resolve needs a status mapping onto `PENDING` / `RESOLVED_REMOVED` / `RESOLVED_DISMISSED` + `resolution_action`; the item type differs | Resolving a flag fails | **Tracked** `TYPES-1:B-ADM-COMMUNITY` → Community |
| 11 | Admin institutes create + page | `owner_user_id` is required (whose?), there is no `city` column, and the item type differs | Creating an institute fails | **Tracked** `TYPES-1:B-ADM-INSTITUTES` → Community |

Bulk importer (included in 1–11 as a Class A guard):
- `mock_templates.exam_cycle_id` / `pattern_id` and `mock_tests.template_id` are required, so those inserts always failed when missing.
- The template now resolves the exam's latest cycle, and rows without a pattern, cycle or template are reported as row errors instead of DB failures.

**Class A:**
- fail-closed guards instead of casts: org id, exam cycle in `saveAdminDailyMockDay`, pattern id
- `TablesUpdate<"mock_tests">` for the premium curation update
- taxonomy audit payloads as `Json`
- the node insert typed `Omit<TablesInsert<…>, 'hierarchy_path' | 'node_depth'>` (both are trigger-computed)
- `rows.map(r => ({ ...r }))` instead of an `unknown as` cast

**Class C:** none.

**Tests:**
- `scripts/test_types1_b6.cjs` (5/5): ssr factories, version, Class B fixes, register, live select audit.
- New signed-in smoke check `admin-pages` (qa-admin): `/admin`, questions, sections, billing, community, descriptive, institutes, mock-tests-management, bulk-import, taxonomy, exams, with no error boundary.

**Gates** (local production build, final B6 code):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 (incl. `db:types:check`) | 8/8 |
| test_types1_b6 | 5/5 |
| test_types1_b2 | 6/6 |
| test_types1_b1 | 8/8 |
| QF-1 | 73/73 + 15/15 |
| GAP2-2a | 11/11 + 18/18 |
| GAP2-3 | 15/15 |
| SEC-1A | 20/20 |
| SEC-1B | 26/26 + **live 32/32** |
| SEC-1C | 22/22 + **live 29/29** |
| SEC-1D | 14/14 + **live 19/19** |
| DRIFT-1c | 46/46 |
| QA identity guard | 8/8 |
| HOTFIX-1 | 4/4 |
| **E2E** | **13/13** |
| Signed-in smokes | **`student-mistake`, `student-pages`, `admin-pages` all passed** |
| Baseline | **NO DIFF** |

### B4: content studio, authoring queue, curriculum blueprint and coverage, artifacts, assets, AI generation context

**Escapes.** All **52 of 52** planned query escapes are removed:
- content studio 24
- authoring queue 7
- coverage 5
- blueprint 4
- artifacts 3
- assets 3
- reference catalog 3
- AI orchestrator 2
- AI context builder 1

The remaining `supabaseClient?: any` parameters (32) became `AppSupabaseClient`.

**Ratchet:**

| Counter | Before | After |
|---|---|---|
| queryEscapes | 173 | **121** (−52) |
| asAny | 276 | 256 |
| colonAny | 919 | 887 |
| unknownAs | 83 | 83 |
| tsExpectError | 12 | **17** |
| tsIgnore | 0 | 0 |

- The tsExpectError increase is +5 for the registered `B-CURRICULUM-MAPPING` tag (`exceptions[]` B4).
- B4 has been removed from `remaining[]`.

**Class B: 5 families (≤ 15).** Before/after evidence: the select audit went from 10 failing to 6, and those 6 are the tracked legacy mapping reads.

| # | Location | Defect | Effect before | Resolution |
|---|---|---|---|---|
| 1 | `admin-content-studio.service.ts` unit workspace | `document_versions(*)` embed ambiguous: `document_versions.document_id` and `learning_documents.current_published_version_id` (PGRST201) | The unit workspace never loaded its documents | **Fixed:** hint `document_versions!document_versions_document_id_fkey` |
| 2 | `admin-content-studio.service.ts` `searchQuestionBank` | `question_type` / `explanation` never existed on `question_versions` (42703) | **The content-studio question picker always returned nothing** | **Fixed:** live columns; all bank items are single-choice; explanation not loaded (it lives in `question_answers`) |
| 3 | `ai/curriculum-context-builder.service.ts` question references | `pyq_year` / `pyq_exam` / `canonical_topic_id` filtered on `question_versions` (42703) | AI generation context never received real question references; it fell back to placeholder data | **Fixed:** `questions!inner(canonical_topic_id, question_sources(exam_name, year))`, flattened to the existing row shape |
| 4 | `content-artifact` / `learning-asset` returns | DB text columns returned where union-typed domain types are expected | Typing only (Class A) | Centralised `toArtifact` / `toAsset` / `toBinding` narrowing |
| 5 | `curriculum-coverage.service.ts` matrix + `upsertExamUnitMapping`; content-studio and AI exam-mapping reads | `exam_unit_mappings` no longer links `exam_topic_mappings` and has no `required_depth` / `importance_tier` / `is_mandatory`; `learning_units` has no `is_published`; `exam_topics` → `exams` relation missing | The reads always fail and the upsert always fails | **Tracked** `TYPES-1:B-CURRICULUM-MAPPING` → **GAP2-4** (5 directives + tracked comments) |

> **⚠ Fabricated data on `/admin/content` (decision #15).** When the coverage reads fail, which today is always, `getCurriculumCoverageMatrix` **synthesises** coverage: a "PUBLISHED" pilot Percentage document, a pilot version, and default exam mappings. Staff therefore see coverage that does not exist. This is a GAP2-4 rewrite item and is recorded in the register and the code. It is **not** changed in TYPES-1, which makes no behaviour rewrites for tracked items. **Recommendation:** GAP2-4 removes the synthetic fallbacks as its first coverage item, or an earlier hotfix replaces them with honest empty states.

**Class A:**
- audit payloads typed as `Json`
- `compileAndStoreVersion` output asserted to `TablesInsert<'document_versions'>` (it always sets every required column)
- author type narrowed

**Tests:**
- `scripts/test_types1_b4.cjs` 5/5, including a live select audit that allows only the tracked legacy reads.
- The B4 domain page is checked by the signed-in smoke `staff-content` (qa-staff `/admin/content`).

**Gates** (local production build, final B4 code):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 (incl. `db:types:check`) | 8/8 |
| test_types1_b4 | 5/5 |
| test_types1_b6 | 5/5 |
| test_types1_b2 | 6/6 |
| test_types1_b1 | 8/8 |
| QF-1 | 73/73 + 15/15 |
| GAP2-2a | 11/11 + 18/18 |
| GAP2-3 | 15/15 |
| SEC-1A | 20/20 |
| SEC-1B | 26/26 + **live 32/32** |
| SEC-1C | 22/22 + **live 29/29** |
| SEC-1D | 14/14 + **live 19/19** |
| DRIFT-1c | 46/46 |
| QA identity guard | 8/8 |
| HOTFIX-1 | 4/4 |
| **E2E** | **13/13** |
| Signed-in smokes | **`student-mistake`, `student-pages`, `admin-pages`, `staff-content` all passed** |
| Baseline | **NO DIFF** |

### CLOSE: full-codebase drift audit and final regressions

**Close-time audit.**
- The live select audit was run over **all** of `app/`, `services/`, `lib/`, `actions/` and `components/`: 823 literal selects, read-only.
- It found **2 more live student defects**, in files that were in no batch because they had no escapes:

| # | Location | Defect | Effect before | Resolution |
|---|---|---|---|---|
| X1 | `app/mock-tests/[id]/page.tsx` (instructions) | `test_results(score)` does not exist (42703) | The instructions page never recognised a submitted attempt, so it always offered "Start" instead of "View result" | **Fixed** (select `total_score` only) |
| X2 | `app/mock-tests/[id]/take/page.tsx` | Same | A completed daily mock was never redirected to its result | **Fixed** |

**Permanent guard: `scripts/test_types1_close.cjs`.**
- **X-1** re-runs the full audit. Every failing select must belong to an owned bucket, or the test fails as **new drift**:
  - a quarantined module: 170 failing selects, Class C, flags off
  - a remaining batch scope: 10 (B3 / B5)
  - a GAP2-4 / TEST-CA owned file: 2
  - a registered tracked Class B read: 10
- **X-2** checks the ratchet: only B3 and B5 remain, and the `tsExpectError` exceptions account for every directive.
- **X-3** checks that every Class B tag has an owner.
- Result: 631 ok / 192 failing, **all owned**.

**Final regressions** (local production build of the close code):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 (incl. `db:types:check`) | 8/8 |
| test_types1_close | 3/3 |
| test_types1_b4 | 5/5 |
| test_types1_b6 | 5/5 |
| test_types1_b2 | 6/6 |
| test_types1_b1 | 8/8 |
| QF-1 | 73/73 + 15/15 |
| GAP2-2a | 11/11 + 18/18 |
| GAP2-3 | 15/15 |
| SEC-1A | 20/20 |
| SEC-1B | 26/26 + live 32/32 |
| SEC-1C | 22/22 + live 29/29 |
| SEC-1D | 14/14 + live 19/19 |
| DRIFT-1c | 46/46 |
| QA identity guard | 8/8 |
| HOTFIX-1 | 4/4 |
| **E2E** | **13/13** |
| Signed-in smokes | **`student-mistake`, `student-pages`, `admin-pages` (incl. `/admin/questions`), `staff-content` all passed** |
| Baseline | **NO DIFF** |

## 9. Final state

**Ratchet:**

| Counter | Start (B0 inventory) | After C | **Final** |
|---|---|---|---|
| queryEscapes | 532 | 353 | **121** |
| asAny | 609 | 443 | **256** |
| colonAny | 960 | 950 | **887** |
| unknownAs | 93 | 89 | **83** |
| tsExpectError | 0 | 0 | **17** (all registered Class B; `exceptions[]` B1 +6, B6 +6, B4 +5) |
| tsIgnore | 0 | 0 | **0** |

**The 121 remaining query escapes:**

| Count | Where | Owner |
|---|---|---|
| 57 | B3 current affairs | after TEST-CA (waiver W3; legacy CA suites disable TLS) |
| 62 | B5 exam knowledge / syllabus | GAP2-4 step 0 |
| 2 | Tracked `TYPES-1:C-ADAPTIVE-MANAGER` comments (client component) | ADAPTIVE re-enable |

**Batches and commits:**

| Batch | Commit |
|---|---|
| B0 | `ed380ae` |
| C | `8ef9bf7` |
| B1 | `dc8e885` |
| B2 | `e4b3e4c` |
| B6 | `9826eed` |
| B4 | `763459a` |
| CLOSE | this commit |

**Infrastructure added** (all tested):
- `types/database.ts` (ref-locked generator, `db:types:check`)
- `lib/supabase/types.ts` (AppSupabaseClient, `fromSsrClient`)
- `lib/supabase/rpc.ts` (`rpcJsonObject`, `sqlNullArg`)
- `lib/supabase/quarantine.ts`
- `lib/deploy/version.ts` + `/api/health` `version`
- `scripts/types1-select-audit.cjs`
- `scripts/smoke/signed-in-smoke.cjs`
- `scripts/smoke/wait-for-deploy.cjs`

**Class B over TYPES-1:** 36 found (B1 13, B2 6, B6 11, B4 4, CLOSE 2). **27 fixed**, each with live before/after evidence; **9 tracked** (10 register tags). Most of the fixes were user-visible failures:
- mistake detail
- drills
- community threads
- `/premium`
- `/admin/billing`
- the admin question bank
- the content-studio picker
- mock instructions / resume

## 10. Tracked items by owner (register: `docs/reports/types/TYPES1_ESCAPES.json`)

| Owner | Tags | What is broken today |
|---|---|---|
| **LOOP-1** | `B-DSH-MASTERY`, `B-DSH-RECOMMENDATIONS`, `B-DSH-VAULT-STATUS`, `B-DSH-READINESS` | Dashboard mastery, recommendations, mistake count and readiness are always empty (legacy columns). Also LOOP-1's first item: `recordExamMistakes` swallows insert errors. |
| **Commerce** | `B-BILLING-SUB-STATUS` (×2), `B-DRILL-REWARD-ARGS` | `/billing` and `/pricing` always show FREE; drill coins are never credited (coins_awarded now honestly 0) |
| **Community** | `B-ADM-DESCRIPTIVE`, `B-ADM-COMMUNITY`, `B-ADM-INSTITUTES` | Admin create descriptive prompt / resolve flag / create institute fail; the manager components' item types do not match the data (lists now read the real tables) |
| **GAP2-4** | `B-CURRICULUM-MAPPING`; B5 (62 escapes) | Exam ↔ unit mapping on the legacy schema. ⚠ **`/admin/content` coverage shows synthesised (fabricated) coverage** when those reads fail, which is today always. |
| **TEST-CA** | B3 (57 escapes) | Current affairs typing deferred; the legacy CA suites must not run until then |
| **ADAPTIVE / LIVE_TESTS / BATTLES / PSYCHOMETRICS re-enable** | 25 `TYPES-1:C-*` | Quarantined modules (flags off), with 170 failing selects against undeployed schema |

## 11. Follow-ups, production verification, status

**Follow-ups recorded (not done in TYPES-1):**
1. **⚠ Fabricated coverage on `/admin/content`** (decision #15). GAP2-4 should remove it first, or an earlier hotfix should.
2. LOOP-1: dashboard model and mistake-recording reliability.
3. Commerce: entitlement read and drill reward.
4. Community: the three admin modules.
5. **`scripts/test_phase5e1_rewards.cjs` sets `NODE_TLS_REJECT_UNAUTHORIZED='0'`.** It violates the TLS rule, was not run, and should be fixed or removed.
6. A pinned `@supabase/ssr` upgrade would allow deleting `fromSsrClient`; it needs its own phase with auth/E2E regression.
7. `scripts/types1-select-audit.cjs` only checks literal selects. Template or variable selects and RLS behaviour are outside its scope, so the signed-in smokes cover those.

**Production verification:**
- **Anonymous, done by me after every batch.** The deploy is detected by `/api/health` `version` from B6 on.
  - `GET /` and `/api/health` → 200
  - anonymous `/admin` → 307 to `/auth/login?next=%2Fadmin`
  - `/articles` → 200 (B4 / close)
- **Signed-in, by the owner at close (architect policy).** These need QA sign-in on the production site:

  ```
  node scripts/smoke/signed-in-smoke.cjs student-mistake https://couragelibrary-next.vercel.app
  node scripts/smoke/signed-in-smoke.cjs admin-home      https://couragelibrary-next.vercel.app
  node scripts/smoke/signed-in-smoke.cjs admin-pages     https://couragelibrary-next.vercel.app
  node scripts/smoke/signed-in-smoke.cjs staff-content   https://couragelibrary-next.vercel.app
  ```

  - `student-mistake` needs qa-student journey data. It was prepared with a local journey run (`E2E_KEEP_USER=1`).
  - Afterwards, run the data-only cleanup:

  ```
  E2E_STUDENT_EMAIL=qa-student@courage-library.test E2E_KEEP_USER=1 node scripts/e2e/cleanup-student.cjs
  ```

**TYPES-1 STATUS: CLOSED.** All batches B0, C, B1, B2, B6 and B4 are complete; B3 is owned by TEST-CA and B5 by GAP2-4. Every gate and the anonymous production checks passed. Per the architect policy, the owner runs the signed-in production smokes listed in §11.
