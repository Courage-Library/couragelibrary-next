# TYPES-1: Generated database types + typed Supabase clients (decision #24)

> **STATUS: IN PROGRESS.** The batch plan is approved with changes (§7). Order: B0 → C → B1 → B2 → B6 → B4 → CLOSE. B5 moved to GAP2-4; B3 deferred until after TEST-CA. Per-batch results are in §8.

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

TYPES-1 STATUS: IN PROGRESS (B0, C complete; next: B1).
