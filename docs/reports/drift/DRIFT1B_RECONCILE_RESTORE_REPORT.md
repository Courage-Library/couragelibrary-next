# DRIFT-1b — Migration ledger, repo↔DB reconciliation, stale-overload closure, foundation restore

- **Date:** 2026-10-12
- **Target:** couragelibrary-next (pre-launch dev DB).
- **Guards:** every DB step passed the ref guard (`POSTGRES_URL_NON_POOLING` ref == `NEXT_PUBLIC_SUPABASE_URL` ref, compared in memory) and verified TLS (`PROD_CA_PATH`). The old "couragelibrary" project was never contacted.
- **Git:** nothing committed or pushed.

**Preconditions**
- QF-1 commit `19f4f1eb7c1f28b320a2d8624e781701af42b77f` is on `origin/main`.
- The working tree was clean except `docs/reports/drift/` (the DRIFT-1a report).

---

## 1. Summary

| Item | Result |
|---|---|
| Ledger + runner (A1–A3) | ✅ `schema_migration_ledger` created and seeded. `scripts/db/apply-migration.cjs`, `scripts/db/backup.cjs` and `docs/database/MIGRATION_RUNBOOK.md` added. |
| Reconcile (B1) | ✅ 8 out-of-band objects captured into 064 (live wins ×6, repo wins ×1, encoding fix ×1). The 6 live-wins function bodies are **hash-identical** before and after. |
| Stale overloads (B2/D3) | ✅ Both dropped (no callers). This also **fixed a live defect**: payment-fulfilment and exam-announcement notification calls failed with `42725 function … is not unique`. |
| Grants (B3) | ✅ Every SECURITY DEFINER function touched has a pinned `search_path`, no PUBLIC/anon EXECUTE, and only documented role grants |
| Foundation restore (065) | ✅ `admin_audit_logs` (append-only), `premium_system_configs`, mistake-vault lineage and errata, active-daily-attempt guard. All hardened, with no replay of 033/037/052. |
| D6 data change | ✅ 3 older duplicate in-progress attempts set to `abandoned`; newest kept |
| Backup | ✅ verified (`pre-drift1b-2026-10-12T11-20-55-*`) |
| Dry-apply → apply | ✅ 064 and 065 dry-run OK, then applied by the runner with ledger rows in the same transaction. Re-apply and original-037 apply both **refused** by the runner. |
| Verification | ✅ SQL verification **14/14**; audit smoke **6/6**; QF-1 DB suite **15/15**; offline **73/73**; SEC-1A **20/20**; tsc 0 errors; lint 0 errors; build OK; deployed site GETs all 200 |
| Baseline | ✅ every difference explained (§10) |

**Corrections to DRIFT-1a**
1. **Battles are not broken.** The 3-arg `fn_find_or_create_battle_room` (with `p_access_tier`) **is live** next to the out-of-band 2-arg overload. The app calls the 3-arg one. DRIFT-1a §7 was wrong on this row.
2. The D6 duplicate group has **4** in-progress attempts, not 2.

**Incident during this phase (found and fixed)**
- **Cause:** my earlier read-only sessions (DRIFT-1a and this phase's first evidence pass) used session-level `SET default_transaction_read_only = on` through the Supavisor transaction pooler (port 6543). That setting **persisted on pooled backends**.
- **Detection:** the first dry-run failed with `25006 read-only transaction`.
- **Fix:** detected on 4 of 320 probes and cleared with `RESET default_transaction_read_only` (no data writes). Re-checks over 240–320 probes showed 0 backends affected.
- **Exposure:** PostgREST/app traffic doesn't use this pooler and was not exposed.
- **Prevention:** the runner now uses explicit `BEGIN READ WRITE`; read-only scripts use transaction-scoped `BEGIN READ ONLY` only; the runbook documents the rule.

---

## 2. Ledger contents (`public.schema_migration_ledger`, 66 rows)

- **BASELINED (47):** every repo migration DRIFT-1a verified as fully applied (001–004, 006–032, 034–036, 053–063), plus 005 (grants-only, noted as not independently verifiable).
- **SUPERSEDED_NOT_APPLIED (17):** 033 and 037–052.
  - `superseded_by = 20261012000065_restore_audit_mistake_lineage_attempt_guard` for 033, 037 and 052.
  - `NOT_RESTORED (feature deferred)` for 038–051.
- **APPLIED (2):** 064 and 065, written by the runner.
- **Checksum:** sha256 of the file with CRLF normalized to LF.
- **Access:** RLS on, no anon/authenticated policies, all privileges revoked from PUBLIC/anon/authenticated (verified: anon and authenticated get `permission denied`).

| Migration | Status | Superseded by | sha256 (prefix) |
|---|---|---|---|
| 20260824000001_phase3a_core_foundation | BASELINED | — | `e8df430ea2c3…` |
| 20260824000002_phase3b_testing_runtime | BASELINED | — | `a8ee62fa762a…` |
| 20260824000003_phase3b_security_patch | BASELINED | — | `3b94f59e9b7e…` |
| 20260824000004_phase3c_intelligence_schema | BASELINED | — | `06986ef2a2d1…` |
| 20260824000005_phase3c_algorithm_configs_hardening | BASELINED | — | `b7c412bd738d…` |
| 20260824000006_phase3d_gamification_foundation | BASELINED | — | `df32ef060bf7…` |
| 20260824000007_phase3e_content_management | BASELINED | — | `7d0eeef9ca5f…` |
| 20260824000008_phase3e_security_hardening | BASELINED | — | `efbba602a673…` |
| 20260824000009_phase3f_course_runtime | BASELINED | — | `5c36f15a5459…` |
| 20260824000010_phase3f_runtime_functions | BASELINED | — | `8727c837a53d…` |
| 20260824000011_phase3g_revision_vault | BASELINED | — | `539c6af5b4fe…` |
| 20260824000012_phase3g_runtime_functions | BASELINED | — | `dacd438a4788…` |
| 20260824000013_phase3g_closure_hardening | BASELINED | — | `5ddc035a7bf4…` |
| 20260824000014_phase3h_notifications | BASELINED | — | `c1dd064fb5d7…` |
| 20260824000015_phase3h_runtime_functions | BASELINED | — | `10d91f06a582…` |
| 20260824000016_phase3h_closure_hardening | BASELINED | — | `1d599d9c1241…` |
| 20260824000017_phase3i_monetization | BASELINED | — | `d5601414493e…` |
| 20260824000018_phase3i_runtime_functions | BASELINED | — | `bd3cb4793dc2…` |
| 20260824000019_phase3i_closure_hardening | BASELINED | — | `22e3be8ff4ee…` |
| 20260824000020_phase3j_intelligence_engine | BASELINED | — | `7a518cdba0ae…` |
| 20260824000021_phase3j_closure_hardening | BASELINED | — | `348649a9dc7d…` |
| 20260824000022_phase3j_final_closure_hardening | BASELINED | — | `112a3176c4b3…` |
| 20260825000023_phase3k_discovery_engine | BASELINED | — | `5fc58db1b832…` |
| 20260825000024_phase3k_closure_hardening | BASELINED | — | `fa0ef1b8dadc…` |
| 20260825000025_phase3l_community_discussions | BASELINED | — | `58efab428d55…` |
| 20260825000026_phase3l_closure_remediation | BASELINED | — | `6f04dbd5a1e7…` |
| 20260825000027_phase3m_flashcards | BASELINED | — | `dec7b523adbb…` |
| 20260825000028_phase3n_quiz_battles | BASELINED | — | `ce3d32975ea7…` |
| 20260825000029_phase3n_security_remediation | BASELINED | — | `7f7c951b2e73…` |
| 20260825000030_phase3o_mistake_vault | BASELINED | — | `50dfdc161aab…` |
| 20260825000031_phase3p_institutional_batches | BASELINED | — | `29d428011fd0…` |
| 20260825000032_phase3q_descriptive_evaluations | BASELINED | — | `b1ecf5ed8f12…` |
| 20260907000033_phase3r_mock_attempt_uniqueness | SUPERSEDED_NOT_APPLIED | 20261012000065_restore_audit_mistake_lineage_attempt_guard | `285531a812b4…` |
| 20260908000034_phase3s_premium_mock_foundation | BASELINED | — | `592c3acc4639…` |
| 20260908000035_phase3t_premium_entitlement_and_quota | BASELINED | — | `af2b65de8971…` |
| 20260908000036_phase3u_premium_generator_atomic | BASELINED | — | `3570a785d9c4…` |
| 20260908000037_phase3v_premium_admin_and_audit | SUPERSEDED_NOT_APPLIED | 20261012000065_restore_audit_mistake_lineage_attempt_guard | `b72e68b5e3b0…` |
| 20260908000038_phase4a_adaptive_foundation | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `5adcc56d8404…` |
| 20260908000039_phase4d1_advanced_adaptive_foundation | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `ec7333233af7…` |
| 20260908000040_phase4d2_item_calibration_and_evidence | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `54eb0068c661…` |
| 20260908000041_phase4d3_advanced_ability_estimation | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `00ac6b8307f7…` |
| 20260908000042_phase4d4_cat_item_selection | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `b76525ed58f5…` |
| 20260908000043_phase4d5_stopping_personalization | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `fc8d65d1a3e8…` |
| 20260908000044_phase5a_live_test_foundation | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `cd1aee5112c3…` |
| 20260909000045_phase5b_live_test_registration_rpc | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `a4408b6fe996…` |
| 20260909000046_phase5c_live_test_runner_rpc | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `064714577ff6…` |
| 20260909000047_phase5d_result_engine_and_ranking_rpc | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `2d693550f118…` |
| 20260909000048_phase5e1_rewards_and_settlement_rpc | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `8d8e4b1e514a…` |
| 20260909000049_phase5e2_certificates_and_verification_rpc | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `a45ea90598f3…` |
| 20260909000050_phase5e3_achievements_and_badges_rpc | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `676290a7c040…` |
| 20260910000051_phase5e6_psychometrics_foundation | SUPERSEDED_NOT_APPLIED | NOT_RESTORED (feature deferred) | `9b89cda8f909…` |
| 20260911000052_phase2_mistake_vault_lineage_and_errata | SUPERSEDED_NOT_APPLIED | 20261012000065_restore_audit_mistake_lineage_attempt_guard | `d91970524dac…` |
| 20260915000053_phase3a_learning_taxonomy_foundation | BASELINED | — | `0a63bd35979a…` |
| 20260915000054_phase3b_content_artifact_and_asset_foundation | BASELINED | — | `94ab4766b9e0…` |
| 20260915000055_phase3c_content_compilation_and_versions | BASELINED | — | `f5a52565c5b3…` |
| 20260915000056_phase3d_immutability_and_deletion_guards | BASELINED | — | `937e9e72b1d8…` |
| 20260919000054_phase3h1_exam_knowledge_foundation | BASELINED | — | `89f4c00f4f33…` |
| 20261001000057_phase3r1_dynamic_syllabus_schema_foundation | BASELINED | — | `696d60019f0b…` |
| 20261001000058_phase3r2_derived_fields_and_integrity | BASELINED | — | `5366d7601f67…` |
| 20261001000059_phase3r3_reconciliation_match_status_and_evidence | BASELINED | — | `73f8e41872a9…` |
| 20261001000060_phase3r4_resolution_workbench_foundation | BASELINED | — | `b20c4d2a6bd6…` |
| 20261001000061_phase4a_current_affairs_canonical_schema | BASELINED | — | `5a8271aa55c6…` |
| 20261002000062_controlled_exam_deletion_cascade | BASELINED | — | `1f47d630e338…` |
| 20261012000063_qf1_question_factory_core | BASELINED | — | `5d904c8e0911…` |
| 20261012000064_schema_ledger_and_reconcile | APPLIED | — | `a7746b4c1d63…` |
| 20261012000065_restore_audit_mistake_lineage_attempt_guard | APPLIED | — | `11441fcfa8c4…` |
---

## 3. Reconcile decisions (064)

| Object | Live vs repo | Chosen | Evidence |
|---|---|---|---|
| `fn_universal_search(text, text[], uuid, uuid, text, integer, integer)` | Live used `user_entitlements.status = 'ACTIVE'` and `valid_until`; repo (024) uses `is_active` and `expires_at` | **REPO (024)** | `user_entitlements` columns live: `is_active`, `expires_at`; **no** `status` / `valid_until`. The live hotfix would error on its PRO branch. No app caller. EXECUTE → service_role only (was anon + authenticated). |
| `fn_log_user_search(…)` | Live regex `[^\x00-\x7F]`; repo `[\u0900-\u097F]` | **LIVE (verbatim)** | Both schema-valid; live is the running behaviour; no app caller. **NEEDS_FOLLOWUP (minor):** the repo's Devanagari-specific regex is more precise for language detection. EXECUTE → service_role only (was anon + authenticated). |
| `fn_post_discussion_message(uuid, text, uuid)` | Live category `ACADEMIC` + `ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL`; repo `COMMUNITY` + plain `ON CONFLICT` | **LIVE (verbatim)** | `user_notifications_category_check` allows ACADEMIC, **not** COMMUNITY. `uq_user_notif_idempotency` is a **partial** unique index, so only live's `ON CONFLICT … WHERE` can infer it. Called by `services/community.service.ts` (user session) → authenticated + service_role. |
| `fn_mark_accepted_answer(uuid, uuid)` | Same as above, plus `REWARDED` vs `PROCESSED` | **LIVE (verbatim)** | Same, plus `gamification_events_reward_status_check` allows REWARDED, **not** PROCESSED. authenticated + service_role. |
| `fn_vote_discussion_message(uuid, text)` | `REWARDED` vs `PROCESSED` | **LIVE (verbatim)** | `gamification_events_reward_status_check`. authenticated + service_role. |
| `fn_find_or_create_battle_room(uuid, boolean)` | Not in repo; live only | **LIVE captured as-is (D5)** | The app calls the 3-arg version (also live, unchanged). This 2-arg overload has no caller. EXECUTE → service_role only (was authenticated). Battles **not** otherwise touched. |
| `rls_auto_enable()` + event trigger `ensure_rls` | Not in repo; live only | **LIVE captured** | Auto-enables RLS on newly created tables. Function captured verbatim; event trigger created only if absent (it exists). EXECUTE revoked from PUBLIC/anon/authenticated (was PUBLIC). |
| Index `uq_leaderboard_weekly_snap` | Not in repo; live only | **LIVE captured** (`CREATE UNIQUE INDEX IF NOT EXISTS`, no-op) | |
| `fn_verify_and_fulfill_payment(…)` | Live body = repo 019 minus comments, **but** `₹` stored as `U+FFFD , U+FFFD` | **LIVE body + ₹ restored** | Only the one character changed. EXECUTE service_role only (unchanged). |
| 18 functions whose live body equals the repo after comment/whitespace stripping (DRIFT-1a §4) | Equivalent | **No action** | Repo files already hold the same logic. |

**Hash proof (V1):** `md5(prosrc)` for the 6 live-wins functions (`fn_log_user_search`, 3 discussion RPCs, battle 2-arg, `rls_auto_enable`) is identical before and after 064. The only changed bodies are `fn_universal_search` (repo version) and `fn_verify_and_fulfill_payment` (₹ fix).

---

## 4. Overload decisions (D3)

| Overload | Callers (rg app/services/lib/actions/components + SQL bodies + pg_depend) | Decision |
|---|---|---|
| `fn_generate_custom_practice_session(text, text, uuid[], integer)` (012 signature) | none / none / none | **DROPPED.** The 5-arg version (QF-1-hardened) remains. |
| `fn_send_user_notification(uuid, text×7, jsonb)` (9-arg, 015) | no TS caller. SQL callers `fn_verify_and_fulfill_payment` and `fn_publish_exam_announcement` use named args that **both** overloads matched (`42725 function … is not unique`, reproduced read-only before the change). It was EXECUTE-able by `authenticated` (notification spoofing). | **DROPPED.** Calls now resolve to the 10-arg version (verified, V2). |
| `fn_record_mistake_occurrence(…8 args)` (030) | none | **REPLACED** by the 10-arg version in 065 (DROP + CREATE), so no ambiguous overload pair exists |

---

## 5. 065 contents & hardening

| Section | Objects | Hardening vs original (037 / 052 / 033) |
|---|---|---|
| Admin helper | `fn_jwt_is_admin_or_staff()`: SQL, STABLE, SECURITY INVOKER, `search_path` pinned | Admin = `auth.jwt()->'app_metadata'->>'role' IN ('admin','staff')`. Never `user_metadata`, never `public.users`. EXECUTE: authenticated, service_role. |
| `premium_system_configs` | 037 columns + domain CHECK, index, 2 seed rows (037 values) | 037 let all authenticated users read enabled configs. Now **admins only** (policy `premium_configs_admin_read`); anon none; writes via service_role. Explicit `REVOKE ALL FROM PUBLIC, anon, authenticated` (Supabase default ACL would grant ALL). |
| `admin_audit_logs` | 037 columns, 3 indexes, append-only triggers | service_role has **SELECT + INSERT only** (no UPDATE/DELETE/TRUNCATE privilege). Row trigger blocks UPDATE/DELETE and a **statement trigger blocks TRUNCATE** (new). Admin read policy via the helper. anon/authenticated otherwise none. Trigger function `search_path` pinned. |
| Mistake lineage | `user_mistake_occurrences` + `question_version_id` (FK → question_versions, RESTRICT), `attempt_answer_id`, `occurrence_status` NOT NULL DEFAULT `'ACTIVE'` + named CHECK, `revoked_at`, `revocation_reason`; 3 indexes + partial unique `uq_umo_attempt_answer` | **Dropped** 052's `GRANT ALL … TO authenticated` on vault/occurrences/drills/cognitive types. Version fallback now picks the current **PUBLISHED** version (QF-1). |
| Mistake RPCs | `fn_record_mistake_occurrence` (10 args), `fn_recompute_mistake_profile`, `fn_revoke_mistakes_by_errata` | All SECURITY DEFINER with pinned `search_path`, **service_role only** (052 granted authenticated; no app caller). Caller checks use the app_metadata helper. **Recompute** now requires admin/service (052 let any user recompute anyone's profile). **Errata** revocation count now accumulates (052 overwrote it each loop). **Recompute with 0 active** sets `total_mistakes_count = 1` + MASTERED, because the live `CHECK (total_mistakes_count >= 1)` made 052's `= 0` fail. |
| Attempt guard | D6 data fix (§6), unique index `uq_test_attempts_single_active_daily`, trigger `trg_test_attempts_lifecycle_check` → `trg_enforce_mock_attempt_lifecycle()` | Same rules as 033 and as `AssessmentService.startOrResumeAttempt`: daily recurring mocks one attempt per IST occurrence, other mocks one attempt ever, at most one active. `search_path` pinned as a function attribute (033 used `SET LOCAL` inside). Submitted statuses aligned with the live CHECK (`submitted`, `auto_submitted`; 033 also listed non-existent `completed`/`evaluated`). Skips rows without `mock_test_id`. EXECUTE revoked from PUBLIC/anon/authenticated (trigger use only). |

**Existing data touched by 065** (explicitly):
- `user_mistake_occurrences`: 13 existing rows received `occurrence_status = 'ACTIVE'` (column default); the other new columns are NULL. The core-column fingerprint is unchanged.
- `user_mistake_vault`: **untouched** (fingerprint identical).
- `test_attempts`: the 3 D6 rows (§6).

---

## 6. D6 data change

`test_attempts_status_check` allows `in_progress | submitted | auto_submitted | abandoned | invalidated`. No app code sets `abandoned`. `abandoned` rows fall outside the partial unique index and are not counted as submissions by the trigger, so the candidate can still take the mock.

| Attempt (id prefix) | started_at (UTC) | answers | Before | After |
|---|---|---|---|---|
| `65051e54` | 2026-09-07 09:58:03 | 2 | in_progress | **abandoned** |
| `43055ccc` | 2026-09-07 09:58:47 | 2 | in_progress | **abandoned** |
| `09383da3` | 2026-09-07 10:08:54 | 1 | in_progress | **abandoned** |
| `fab4b020` | 2026-09-07 10:09:22 | 1 | in_progress | in_progress (newest, kept) |

All four belong to one (user, mock test, IST day) group. The UPDATE is restricted to `row_number() > 1` within duplicate in-progress groups, and guarded to abort if more than 3 rows would change. `updated_at` is set; no other column is changed.

---

## 7. Backup

- **Tool:** `node scripts/db/backup.cjs pre-drift1b` (pg_dump 17.11, `sslmode=verify-full`).
- `E:\CourageLibrary-Backups\pre-drift1b-2026-10-12T11-20-55-public.dump`: 1,745,089 bytes, 133 tables, 133 data entries.
- `E:\CourageLibrary-Backups\pre-drift1b-2026-10-12T11-20-55-auth-data.dump`: 27,357 bytes, 27 data entries.
- `pg_restore --list` verified; required table data present.

---

## 8. Dry-apply + apply

| Step | Result |
|---|---|
| Dry-run 064 (`BEGIN READ WRITE … ROLLBACK`) | OK (2.6 s) |
| Dry-run 065 | OK (ledger not yet present → ledger row skipped in dry-run) |
| Read-only proof of the ambiguity before the change | `42725 function public.fn_send_user_notification(…) is not unique` |
| Apply 064 via runner | **APPLIED** + ledger row (same transaction), backup `pre-drift1b-…` |
| Apply 065 via runner | **APPLIED** + ledger row |
| Re-apply 064 | **REFUSED** (already APPLIED) |
| Apply original 037 | **REFUSED** (SUPERSEDED_NOT_APPLIED) |

---

## 9. Verification

**SQL verification (all scenario writes rolled back): 14 / 14**

| # | Check | Result |
|---|---|---|
| V1 | Live-wins bodies unchanged by 064 | 6/6 identical |
| V1b | Only intended body changes | changed: `fn_universal_search`, `fn_verify_and_fulfill_payment`; added: 3 mistake RPCs, admin helper, audit trigger fn, attempt trigger fn; removed: practice/4, notification/9, record_mistake/8 |
| V2 | Stale overloads gone; notification named-arg call resolves | one overload each; resolves (was 42725) |
| V2b | ₹ restored in the payment notification text | ✓ |
| V3 | anon/authenticated cannot read or write `admin_audit_logs`, `premium_system_configs`, `schema_migration_ledger` | anon: permission denied ×3; authenticated: empty (RLS) ×2, permission denied (ledger); inserts rejected ×6 |
| V3b | Admin via app_metadata reads audit + configs; `user_metadata.role = 'admin'` cannot | admin sees rows + 2 configs; user_metadata "admin" sees 0 |
| V3c | Audit append-only | UPDATE/DELETE/TRUNCATE blocked by trigger (owner); service_role lacks UPDATE privilege |
| V5 | Lineage: record occurrence (attempt answer + version), idempotent replay, the direct-insert shape used by `mistake.service.ts`, errata revoke + recompute | ✓ (revoked 1) |
| V5b | Mistake RPC grants (not executable by anon/authenticated) | ✓ |
| V5c | Existing vault rows unchanged; existing occurrences only gained ACTIVE | fingerprints equal; 13/13 ACTIVE; new columns NULL |
| V6 | D6 rows | 3 abandoned, newest in_progress |
| V6b | Second active attempt for same user/test/day rejected | `23505` |
| V7 | Ledger counts | BASELINED 47, SUPERSEDED_NOT_APPLIED 17, APPLIED 2 |
| V8 | SECURITY DEFINER functions touched: pinned `search_path`, no anon/PUBLIC EXECUTE | ✓. Authenticated EXECUTE only on the 3 discussion RPCs (+ the untouched 3-arg battle RPC). |

**QF audit smoke (real `AdminQuestionFactoryService`, mocked admin session, `actor_email = system:drift1b-audit-smoke`): 6 / 6**
1. generate prompt
2. 5-gate dry-run
3. commit DRAFT (question `b3f3442d` / version `6ecc5c21` / batch `4109c711`)
4. **audit row persisted with correct columns**: `QF_IMPORT_DRAFTS`, `target_entity = question_version`, `new_value.origin = AI_EXTERNAL`; **no PGRST205 warning**
5. audit row persisted (QF_IMPORT_DRAFTS)
6. smoke draft archived

| Regression suite / check | Result |
|---|---|
| `scripts/test_qf1_db.cjs` | **15/15** (IMP-3 probe committed then removed: question `7305354f`) |
| `scripts/test_qf1_question_factory.cjs` | **73/73** |
| `scripts/test_sec1a_containment.cjs` | **20/20** |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors, 244 warnings (unchanged) |
| `npm run build` | success |
| Deployed site GETs, no auth (`/`, `/mistakes`, `/api/health`, `/community`, `/mock-tests`, `/admin/questions/factory`) | all **200** |

---

## 10. Baseline before / after (read-only)

| Table | Before | After | Explanation |
|---|---|---|---|
| questions / question_versions / question_version_authoring | 112 / 112 / 112 | 113 / 113 / 113 | +1 audit-smoke draft (archived) |
| question_options / question_answers | 444 / 111 | 448 / 112 | same smoke draft (4 options, 1 answer) |
| question_import_batches | 1 | 2 | smoke batch `4109c711` (IMP-3 probe batch was removed) |
| admin_audit_logs | (absent) | 1 | smoke `QF_IMPORT_DRAFTS` row |
| premium_system_configs | (absent) | 2 | 037 seed rows |
| schema_migration_ledger | (absent) | 66 | 64 seeded + 064 + 065 |
| test_attempts by status | in_progress 20, submitted 11 | in_progress 17, submitted 11, **abandoned 3** | D6 |
| user_mistake_vault (12), user_mistake_occurrences (13) | fingerprints | identical | — |
| mock_tests 8, mock_questions 350, mock_sections 14, test_attempts 31, attempt_answers 200, test_results 10, user_mistake_drills 0, topics 36, subjects 4, exams 4, coin_wallets 5, coin_ledger 8, user_notifications 0, gamification_events 8, badges 5, question_sources 0, exam_question_mappings 0, auth.users 24 | — | identical | — |

**No unexplained differences.**

---

## 11. Still-broken / deferred (input for DRIFT-1c)

| Feature | State | Notes for DRIFT-1c |
|---|---|---|
| Adaptive / CAT (038–043) | No tables | Rewrite the admin policies (038 used `public.users`), seeds, immutability triggers |
| Live all-India tests (044–050) | No tables or RPCs | Replace the 12 `FOR ALL USING (true)` PUBLIC policies; add grants and caller checks to 14 SECURITY DEFINER RPCs (reward distribution, certificates, achievements); rewrite 050's badge CHECK changes without `EXCEPTION WHEN OTHERS` |
| Psychometrics (051) | No tables | Depends on `adaptive_item_calibrations` (039) |
| Quiz battles | 3-arg RPC live and called by the app; out-of-band 2-arg overload captured, service_role only | Functional test pending (not in scope, D5) |

**Other follow-ups noticed (out of scope, list only)**
1. **Audit-log column mismatch:** `services/admin-current-affairs.service.ts` writes `actor_id, entity_type, entity_id, metadata`; `services/current-affairs-daily-quiz.service.ts` writes `action, metadata`. Neither matches `admin_audit_logs`, so those inserts fail (now with column errors). `admin-premium`, `admin-adaptive`, `exam-onboarding` and QF-1 use the correct columns.
2. **Mistake tables:** `anon` and `authenticated` hold **TRUNCATE**, REFERENCES and TRIGGER on `user_mistake_vault` / `user_mistake_occurrences`. PostgREST does not expose TRUNCATE, but the privilege should be revoked. Their staff policies key on the JWT `role` claim.
3. `fn_log_user_search` regex precision (see §3).
4. **SEC-1 (S3):** open RLS on the exam-knowledge / syllabus tables. Gap 2. Payments (route disabled; ₹ fixed only).
5. **Rule for all future read-only DB tooling:** never use session-level `SET` through the transaction pooler (runbook).

---

## 12. Commit plan (NOT committed)

```
supabase/migrations/20261012000064_schema_ledger_and_reconcile.sql
supabase/migrations/20261012000065_restore_audit_mistake_lineage_attempt_guard.sql
scripts/db/_db-env.cjs
scripts/db/backup.cjs
scripts/db/apply-migration.cjs
docs/database/MIGRATION_RUNBOOK.md
docs/reports/drift/DRIFT1A_SCHEMA_DRIFT_REPORT.md
docs/reports/drift/DRIFT1B_RECONCILE_RESTORE_REPORT.md
```
Never commit backups (outside the repo), `.env*`, CA files, or scratch scripts (session scratchpad).

Message:
```
feat(db): migration ledger + guarded runner, repo↔DB reconcile, foundation restore

- 064: schema_migration_ledger (47 BASELINED, 17 SUPERSEDED_NOT_APPLIED),
  capture out-of-band live objects (discussion RPCs, search log, battle 2-arg,
  rls_auto_enable, leaderboard index), repo fn_universal_search, ₹ fix,
  drop stale overloads (fixes ambiguous fn_send_user_notification calls)
- 065: hardened admin_audit_logs (append-only) + premium_system_configs,
  mistake-vault lineage/errata RPCs (service_role only), active-daily-attempt
  guard with D6 data fix (3 duplicate attempts → abandoned)
- scripts/db: verified backup + guarded apply runner; MIGRATION_RUNBOOK
- DRIFT-1a forensics + DRIFT-1b reports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

DRIFT-1b STATUS: CLOSED. The ledger and runner are in place; 064 and 065 are applied to couragelibrary-next with a verified backup. Reconcile hashes are proven; stale overloads are dropped (fixing ambiguous notification calls); the audit trail, mistake lineage and attempt guard are restored and hardened. The D6 change is limited to 3 rows. Every check passes (SQL 14/14, audit smoke 6/6, QF-1 DB 15/15, offline 73/73 + 20/20, tsc/lint/build) and every baseline difference is explained. The pooled read-only setting I introduced was detected and reset.
