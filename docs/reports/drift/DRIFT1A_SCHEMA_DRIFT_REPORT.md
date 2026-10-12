# DRIFT-1a — Schema Drift Forensics: repo migrations vs couragelibrary-next

- **Date:** 2026-10-12
- **Phase:** READ-ONLY. No database writes and no repo changes except this report.
- **Target:** couragelibrary-next.
  - The project ref in `POSTGRES_URL_NON_POOLING` equals the ref in `NEXT_PUBLIC_SUPABASE_URL` (compared in memory).
  - TLS was verified with the CA from `PROD_CA_PATH`.
  - Every session ran `SET default_transaction_read_only = on; BEGIN READ ONLY … ROLLBACK`.
  - The old "couragelibrary" project was never contacted.
- **Method:**
  - **Repo side:** all 64 migration files (two share the number 054) were split with a quote- and dollar-quote-aware parser. That gave 1,617 statements and **0 unclassified**, from which I built the expected end state, last definition winning.
  - **Live side:** captured from `pg_catalog` / `information_schema`: 133 tables, 1,574 columns, 869 constraints, 494 indexes, 101 functions (bodies hashed locally), 29 triggers, 211 policies, plus grants and exact row counts.
  - All analysis scripts ran from the session scratchpad, outside the repo. No existing repo script was run.

---

## 1. Executive summary

- **17 of 64 migrations are NOT applied** on couragelibrary-next. Of those, **15 are a contiguous block, 037–051**, adding up to **28 missing tables, 25 missing functions, ≈60 missing indexes and policies, and 20 missing columns**. Outside the block, **033** (mock-attempt uniqueness guard) and **052** (mistake-vault occurrence lineage / errata) are also missing. 053–063 are applied.
- **Features with no database backing:**
  - premium admin config and `admin_audit_logs`
  - the whole adaptive/CAT engine
  - live all-India tests (registration, runner, results, rewards, certificates, achievements)
  - psychometrics snapshots
  - mistake-occurrence lineage and errata revocation
  - the one-active-daily-attempt invariant
- **46 migrations are fully applied, 1 has no schema objects.** Most function-body "differences" are comment/whitespace stripping only. There are **4 genuine out-of-band hotfixes** that were never committed back to the repo:
  - `fn_universal_search`
  - `fn_log_user_search`
  - two discussion RPCs, `fn_post_discussion_message` and `fn_mark_accepted_answer`
  - `fn_find_or_create_battle_room`: a different 2-argument signature is live, and the repo's 3-argument version is absent
- **Replaying the originals verbatim is unsafe:**
  - 12 policies in 044–050 open **full write access to anon/authenticated** (`FOR ALL USING (true) WITH CHECK (true)` with no `TO`).
  - 14 SECURITY DEFINER live-test RPCs have no `REVOKE`/`GRANT` and no admin check. That includes `fn_distribute_live_test_rewards` and `fn_revoke_live_test_certificate`, so anon could call them.
  - 038's admin policies reference a non-existent `public.users`, so 038 would fail.
  - 033 would fail on existing data: 1 duplicate active-daily attempt group.
  - 050 swallows all errors in its DO blocks.
- **Provenance:** no repo script or history ever pointed anywhere other than couragelibrary-next. **No apply script exists for 033, 037–047 or 052.** The 048–051 apply scripts run each file in one implicit transaction, and every one of them depends on 044's tables, so they would have failed and rolled back entirely. The earlier "verified" claims for 037–051 are **not supported by any evidence in the repo or this DB** (§8).
- **Risk level:**
  - **HIGH for feature correctness.** Adaptive tests, live tests and audit logging silently degrade to empty states or errors.
  - **CRITICAL if someone "fixes" it by replaying the originals.** That would open anonymous write access and reward minting.
  - **LOW for current data integrity.** None of these tables exist, so there is no partial data (§9).

---

## 2. Per-migration status (001–063)

Status after correcting for (a) function bodies equal after stripping comments/whitespace and (b) policy names truncated by PostgreSQL to 63 characters. **Present** and **Missing** are object counts; "superseded" objects were redefined or dropped by a later migration and are judged there.

| Migration | Status | Present | Missing | Evidence |
|---|---|---|---|---|
| 20260824000001_phase3a_core_foundation | **FULLY_APPLIED** | 41 | 0 | 3 obj superseded later |
| 20260824000002_phase3b_testing_runtime | **FULLY_APPLIED** | 44 | 0 | 4 obj superseded later |
| 20260824000003_phase3b_security_patch | **FULLY_APPLIED** | 9 | 0 | 1 fn body equal after comment/whitespace strip |
| 20260824000004_phase3c_intelligence_schema | **FULLY_APPLIED** | 30 | 0 | 1 obj superseded later |
| 20260824000005_phase3c_algorithm_configs_hardening | **NO_SCHEMA_OBJECTS** | 0 | 0 | — |
| 20260824000006_phase3d_gamification_foundation | **FULLY_APPLIED** | 37 | 0 | 4 fn body equal after comment/whitespace strip |
| 20260824000007_phase3e_content_management | **FULLY_APPLIED** | 38 | 0 | 2 obj superseded later |
| 20260824000008_phase3e_security_hardening | **FULLY_APPLIED** | 2 | 0 | — |
| 20260824000009_phase3f_course_runtime | **FULLY_APPLIED** | 14 | 0 | — |
| 20260824000010_phase3f_runtime_functions | **FULLY_APPLIED** | 2 | 0 | 2 fn body equal after comment/whitespace strip |
| 20260824000011_phase3g_revision_vault | **FULLY_APPLIED** | 17 | 0 | — |
| 20260824000012_phase3g_runtime_functions | **FULLY_APPLIED** | 1 | 0 | 1 fn body equal after comment/whitespace strip · 1 obj superseded later |
| 20260824000013_phase3g_closure_hardening | **FULLY_APPLIED** | 11 | 0 | 3 fn body equal after comment/whitespace strip · 1 obj superseded later |
| 20260824000014_phase3h_notifications | **FULLY_APPLIED** | 16 | 0 | — |
| 20260824000015_phase3h_runtime_functions | **FULLY_APPLIED** | 3 | 0 | 2 fn body equal after comment/whitespace strip |
| 20260824000016_phase3h_closure_hardening | **FULLY_APPLIED** | 5 | 0 | 1 fn body equal after comment/whitespace strip |
| 20260824000017_phase3i_monetization | **FULLY_APPLIED** | 20 | 0 | — |
| 20260824000018_phase3i_runtime_functions | **FULLY_APPLIED** | 1 | 0 | 2 obj superseded later |
| 20260824000019_phase3i_closure_hardening | **FULLY_APPLIED (+out-of-band edits)** | 3 | 0 | 2 fn body equal after comment/whitespace strip · fn_verify_and_fulfill_payment differs only by ₹ encoding mojibake in a notification string |
| 20260824000020_phase3j_intelligence_engine | **FULLY_APPLIED** | 21 | 0 | 4 obj superseded later |
| 20260824000021_phase3j_closure_hardening | **FULLY_APPLIED** | 1 | 0 | 4 obj superseded later |
| 20260824000022_phase3j_final_closure_hardening | **FULLY_APPLIED** | 4 | 0 | 4 fn body equal after comment/whitespace strip |
| 20260825000023_phase3k_discovery_engine | **FULLY_APPLIED** | 14 | 0 | 7 obj superseded later |
| 20260825000024_phase3k_closure_hardening | **FULLY_APPLIED (+out-of-band edits)** | 7 | 0 | out-of-band edit: fn_universal_search, fn_log_user_search · 1 obj superseded later |
| 20260825000025_phase3l_community_discussions | **FULLY_APPLIED** | 34 | 0 | 8 obj superseded later |
| 20260825000026_phase3l_closure_remediation | **FULLY_APPLIED (+out-of-band edits)** | 7 | 0 | out-of-band edit: fn_post_discussion_message, fn_mark_accepted_answer, fn_vote_discussion_message |
| 20260825000027_phase3m_flashcards | **FULLY_APPLIED** | 34 | 0 | — |
| 20260825000028_phase3n_quiz_battles | **FULLY_APPLIED** | 21 | 0 | 5 obj superseded later |
| 20260825000029_phase3n_security_remediation | **FULLY_APPLIED** | 6 | 0 | — |
| 20260825000030_phase3o_mistake_vault | **FULLY_APPLIED** | 22 | 0 | 1 obj superseded later |
| 20260825000031_phase3p_institutional_batches | **FULLY_APPLIED** | 27 | 0 | fn_get_batch_assignment_progress differs only by redundant parentheses |
| 20260825000032_phase3q_descriptive_evaluations | **FULLY_APPLIED** | 27 | 0 | — |
| 20260907000033_phase3r_mock_attempt_uniqueness | **NOT_APPLIED** | 0 | 3 | missing: 3 (index uq_test_attempts_single_active_daily; function trg_enforce_mock_attempt_lifecycle; trigger test_attempts:trg_test_attempts_lifecycle_check) |
| 20260908000034_phase3s_premium_mock_foundation | **FULLY_APPLIED** | 14 | 0 | — |
| 20260908000035_phase3t_premium_entitlement_and_quota | **FULLY_APPLIED** | 7 | 0 | — |
| 20260908000036_phase3u_premium_generator_atomic | **FULLY_APPLIED** | 1 | 0 | — |
| 20260908000037_phase3v_premium_admin_and_audit | **NOT_APPLIED** | 0 | 12 | missing: 12 (table premium_system_configs; index idx_premium_system_configs_domain_enabled; index idx_premium_system_configs_key; …) |
| 20260908000038_phase4a_adaptive_foundation | **NOT_APPLIED** | 0 | 21 | missing: 21 (table adaptive_test_configs; table adaptive_attempt_states; table adaptive_question_decisions; …) |
| 20260908000039_phase4d1_advanced_adaptive_foundation | **NOT_APPLIED** | 0 | 15 | missing: 15 (table adaptive_algorithm_versions; table adaptive_item_calibrations; table adaptive_system_configs; …) |
| 20260908000040_phase4d2_item_calibration_and_evidence | **NOT_APPLIED** | 0 | 12 | missing: 12 (table adaptive_item_response_evidence; table adaptive_item_calibration_history; function fn_prevent_response_evidence_mutation; …) |
| 20260908000041_phase4d3_advanced_ability_estimation | **NOT_APPLIED** | 0 | 8 | missing: 8 (table adaptive_ability_estimation_history; function fn_prevent_ability_estimation_history_mutation; trigger adaptive_ability_estimation_history:trg_prevent_ability_estimation_history_mutation; …) |
| 20260908000042_phase4d4_cat_item_selection | **NOT_APPLIED** | 0 | 3 | missing: 3 (index idx_aqd_qv_created; index idx_aqd_attempt_step; index idx_aic_status_diff) |
| 20260908000043_phase4d5_stopping_personalization | **NOT_APPLIED** | 0 | 4 | missing: 4 (column adaptive_attempt_states.stopping_metadata; column adaptive_attempt_states.stopping_policy_version; column adaptive_attempt_states.personalization_policy_version; …) |
| 20260908000044_phase5a_live_test_foundation | **NOT_APPLIED** | 0 | 16 | missing: 16 (table live_test_events; table live_test_registrations; table live_test_instances; …) |
| 20260909000045_phase5b_live_test_registration_rpc | **NOT_APPLIED** | 0 | 2 | missing: 2 (function fn_register_live_test; function fn_cancel_live_test_registration) |
| 20260909000046_phase5c_live_test_runner_rpc | **NOT_APPLIED** | 0 | 3 | missing: 3 (function fn_start_or_resume_live_test_attempt; function fn_save_live_test_answer; function fn_submit_live_test_attempt) |
| 20260909000047_phase5d_result_engine_and_ranking_rpc | **NOT_APPLIED** | 0 | 13 | missing: 13 (column live_test_events.active_snapshot_version; table live_test_ranking_snapshots; table live_test_leaderboard_entries; …) |
| 20260909000048_phase5e1_rewards_and_settlement_rpc | **NOT_APPLIED** | 0 | 11 | missing: 11 (table live_test_reward_policies; index idx_live_reward_policies_event_active; table live_test_reward_settlements; …) |
| 20260909000049_phase5e2_certificates_and_verification_rpc | **NOT_APPLIED** | 0 | 16 | missing: 16 (table live_test_certificate_policies; index idx_live_cert_policies_event_active; table live_test_certificates; …) |
| 20260909000050_phase5e3_achievements_and_badges_rpc | **NOT_APPLIED** | 0 | 14 | live badges_category_check / badges_tier_check are the ORIGINAL definitions (050 versions absent) · missing: 12 (table live_test_achievement_definitions; index idx_live_ach_def_code_active; table live_test_achievement_awards; …) |
| 20260910000051_phase5e6_psychometrics_foundation | **NOT_APPLIED** | 0 | 31 | missing: 31 (column adaptive_item_calibrations.population; column adaptive_item_calibrations.facility_p; column adaptive_item_calibrations.empirical_difficulty_d; …) |
| 20260911000052_phase2_mistake_vault_lineage_and_errata | **NOT_APPLIED** | 0 | 12 | missing: 12 (column user_mistake_occurrences.question_version_id; column user_mistake_occurrences.attempt_answer_id; column user_mistake_occurrences.occurrence_status; …) |
| 20260915000053_phase3a_learning_taxonomy_foundation | **FULLY_APPLIED** | 18 | 0 | policy names truncated to 63 chars (present) |
| 20260915000054_phase3b_content_artifact_and_asset_foundation | **FULLY_APPLIED** | 16 | 0 | — |
| 20260915000055_phase3c_content_compilation_and_versions | **FULLY_APPLIED** | 14 | 0 | — |
| 20260915000056_phase3d_immutability_and_deletion_guards | **FULLY_APPLIED** | 8 | 0 | — |
| 20260919000054_phase3h1_exam_knowledge_foundation | **FULLY_APPLIED** | 39 | 0 | 2 obj superseded later |
| 20261001000057_phase3r1_dynamic_syllabus_schema_foundation | **FULLY_APPLIED** | 30 | 0 | policy names truncated to 63 chars (present) |
| 20261001000058_phase3r2_derived_fields_and_integrity | **FULLY_APPLIED** | 11 | 0 | — |
| 20261001000059_phase3r3_reconciliation_match_status_and_evidence | **FULLY_APPLIED** | 3 | 0 | 1 obj superseded later |
| 20261001000060_phase3r4_resolution_workbench_foundation | **FULLY_APPLIED** | 4 | 0 | — |
| 20261001000061_phase4a_current_affairs_canonical_schema | **FULLY_APPLIED** | 37 | 0 | — |
| 20261002000062_controlled_exam_deletion_cascade | **FULLY_APPLIED** | 3 | 0 | — |
| 20261012000063_qf1_question_factory_core | **FULLY_APPLIED** | 36 | 0 | — |
**Tally:** FULLY_APPLIED 46, of which 3 carry out-of-band function edits (019 is encoding-only, 024 and 026 are functional) · NOT_APPLIED **17** (033, 037–052) · NO_SCHEMA_OBJECTS 1 (005) · PARTIALLY_APPLIED 0.

The boundary is sharp. 034–036 and 037–038 were committed together (`20b0135`, 2026-09-08), yet 034–036 are fully live while 037 onwards is entirely absent. 052 (added 2026-09-15) is absent while 053–063 are present.

---

## 3. Missing objects by feature

| Feature | Migrations | Missing tables | Missing functions | Other missing |
|---|---|---|---|---|
| Mock-attempt uniqueness | 033 | — | `trg_enforce_mock_attempt_lifecycle` | unique index `uq_test_attempts_single_active_daily`; trigger `trg_test_attempts_lifecycle_check` on `test_attempts` |
| Premium admin + audit | 037 | `premium_system_configs`, **`admin_audit_logs`** | `fn_prevent_admin_audit_log_mutation` | 5 indexes, 3 policies, append-only trigger, seed configs |
| Adaptive / CAT engine | 038–043 | `adaptive_test_configs`, `adaptive_attempt_states`, `adaptive_question_decisions`, `user_adaptive_profiles`, `adaptive_algorithm_versions`, `adaptive_item_calibrations`, `adaptive_system_configs`, `adaptive_item_response_evidence`, `adaptive_item_calibration_history`, `adaptive_ability_estimation_history` | 4 immutability trigger functions | ≈26 indexes, ≈17 policies, 3 stopping/personalization columns, seeds (algorithm versions, system configs) |
| Live all-India tests | 044–050 | `live_test_events`, `live_test_registrations`, `live_test_instances`, `live_test_audit_logs`, `live_test_ranking_snapshots`, `live_test_leaderboard_entries`, `live_test_reward_policies`, `live_test_reward_settlements`, `live_test_certificate_policies`, `live_test_certificates`, `live_test_certificate_verifications`, `live_test_achievement_definitions`, `live_test_achievement_awards` | `fn_register_live_test`, `fn_cancel_live_test_registration`, `fn_start_or_resume_live_test_attempt`, `fn_save_live_test_answer`, `fn_submit_live_test_attempt`, `fn_evaluate_live_test_event`, `fn_publish_live_test_results`, `fn_void_live_test_attempt`, `fn_distribute_live_test_rewards`, `fn_generate_live_test_certificates`, `fn_verify_live_test_certificate_public`, `fn_revoke_live_test_certificate`, `fn_evaluate_live_test_achievements`, `fn_revoke_live_test_achievement_award` | ≈25 indexes, ≈26 policies, `live_test_events.active_snapshot_version`, extended `badges` category/tier CHECKs, live-test badge seeds |
| Psychometrics | 051 | `item_psychometric_snapshots`, `test_psychometric_snapshots`, `psychometric_review_queue` | 2 immutability trigger functions | 16 columns on `adaptive_item_calibrations` (itself missing), 5 indexes, 3 policies |
| Mistake-vault lineage / errata | 052 | — | `fn_record_mistake_occurrence`, `fn_recompute_mistake_profile`, `fn_revoke_mistakes_by_errata` | 5 columns on **existing** `user_mistake_occurrences` (`question_version_id`, `attempt_answer_id`, `occurrence_status`, `revoked_at`, `revocation_reason`), 4 indexes incl. unique `uq_umo_attempt_answer` |

---

## 4. Function version drift

72 live functions are byte-identical (after CRLF normalisation) to their final repo definition. The other 29:

| Live function | Classification | Detail |
|---|---|---|
| `fn_sanitize_attempt_answer`, `fn_award_gamification_reward`, `fn_claim_reward_item`, `fn_reverse_reward_claim`, `fn_record_qualifying_streak_activity`, `fn_enforce_practice_session_lifecycle`, `fn_create_payment_order`, `fn_update_lesson_playback_position`, `fn_complete_course_lesson`, `fn_start_custom_practice_session`, `fn_resolve_errata_report`, `fn_publish_exam_announcement`, `fn_validate_payment_order_transition`, `fn_update_daily_recommendation_status`, `fn_complete_diagnostic_assessment`, `fn_generate_daily_recommendations`, `fn_update_spaced_repetition_review`, `fn_send_user_notification/10` | **CURRENT (equivalent)** | Equal to the final repo body once `--` comments and whitespace are stripped. The applying tool removed comments (pattern seen in 003–022). |
| `fn_get_batch_assignment_progress` | CURRENT (equivalent) | Differs only by redundant parentheses |
| `fn_verify_and_fulfill_payment` | CURRENT (encoding drift) | One line: `₹` stored as mojibake (applied with a non-UTF-8 client encoding). Cosmetic, but appears in user notifications. |
| `fn_generate_custom_practice_session(4 args)` | **OLDER overload (stale)** | The 012 version is still live next to the current 5-arg version (013 → 063). Callable, and **not** hardened by QF-1. |
| `fn_send_user_notification(9 args)` | OLDER overload (stale) | The 015 version is still live next to the current 10-arg version from 016 |
| `fn_universal_search` | **OUT-OF-BAND EDIT** | Live uses `status = 'ACTIVE'` and `valid_until`; repo (024) uses `is_active` and `expires_at`. A live hotfix matching the real `user_entitlements` columns. **The repo is wrong.** |
| `fn_log_user_search` | OUT-OF-BAND EDIT | Language detection regex changed from `[ऀ-ॿ]` (repo) to `[^\x00-\x7F]` (live) |
| `fn_post_discussion_message`, `fn_mark_accepted_answer` | OUT-OF-BAND EDIT | Notification category `ACADEMIC` (live) vs `COMMUNITY` (repo); `ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL` (live, matches a partial unique index) |
| `fn_vote_discussion_message`, `fn_mark_accepted_answer` | OUT-OF-BAND EDIT | Reward event status `REWARDED` (live) vs `PROCESSED` (repo) |
| `fn_find_or_create_battle_room(p_topic_id, p_is_private)` | **NOT IN REPO** | The live 2-arg version has a fallback question pool and no PRO entitlement check. The repo's 3-arg version (028, `p_access_tier`) is **absent live**. |
| `rls_auto_enable()` | NOT IN REPO | Event-trigger helper (auto-enables RLS on new tables), created out of band |

Repo-final functions **missing** live: 25 (all from 033, 037–052; listed in §3).

---

## 5. Out-of-band live objects (present live, never declared in any migration)

| Object | Notes |
|---|---|
| Function `public.rls_auto_enable()` | Uses `pg_event_trigger_ddl_commands()`; an event trigger installs it. Probably Supabase-recommended hardening added via the dashboard. |
| Function `fn_find_or_create_battle_room(uuid, boolean)` | See §4 |
| Index `uq_leaderboard_weekly_snap` on `leaderboard_weekly_snapshots (week_start_date, leaderboard_type, COALESCE(…))` | Unique index not in the repo |
| Policies | **None genuinely out of band.** The 3 candidates (053 `topic_relationships`, `exam_unit_mappings`; 057 `exam_syllabus_canonical_mappings`) are repo policies whose names PostgreSQL truncated to 63 characters. They are present, but any future `DROP POLICY "<full name>"` in a migration will silently miss them. |
| Tables / columns / triggers | None |

---

## 6. Statement-level safety classification, 037–051

263 statements in total. The automated pass flagged effects on existing objects; a manual security pass then reclassified policies and RPCs.

| Classification | Count | What |
|---|---|---|
| **SAFE_TO_APPLY** | 230 | CREATE TABLE / INDEX / immutability-trigger functions on **missing** tables; seed INSERTs into missing tables (037, 039, 041–043, 048, 049); 41 `DROP POLICY IF EXISTS` on missing tables (no-ops) |
| **CONFLICTS_WITH_LATER** | 0 | No object created in 037–051 is redefined by 052–063. Interaction to check: 063's `mock_questions` published-only guard, which any live-test flow that copies papers must respect. |
| **NEEDS_REWRITE** | 33 | Listed below |

**NEEDS_REWRITE detail**

| # | Migration | Statements | Why |
|---|---|---|---|
| 1 | 044, 047, 048, 049, 050 | 12 policies `p_live_*_admin_all` / `p_live_*_admin` on `live_test_events`, `live_test_instances`, `live_test_audit_logs`, `live_test_ranking_snapshots`, `live_test_leaderboard_entries`, `live_test_reward_policies`, `live_test_reward_settlements`, `live_test_certificate_policies`, `live_test_certificates`, `live_test_certificate_verifications`, `live_test_achievement_definitions`, `live_test_achievement_awards` | `FOR ALL USING (true) WITH CHECK (true)` with **no `TO` clause**, so it applies to PUBLIC. **anon/authenticated could insert, update or delete events, results, rewards and certificates.** Must be `TO service_role` or an admin predicate. |
| 2 | 045–050 | 14 `CREATE FUNCTION` (SECURITY DEFINER): `fn_register_live_test`, `fn_cancel_live_test_registration`, `fn_start_or_resume_live_test_attempt`, `fn_save_live_test_answer`, `fn_submit_live_test_attempt`, `fn_evaluate_live_test_event`, `fn_publish_live_test_results`, `fn_void_live_test_attempt`, `fn_distribute_live_test_rewards`, `fn_generate_live_test_certificates`, `fn_verify_live_test_certificate_public`, `fn_revoke_live_test_certificate`, `fn_evaluate_live_test_achievements`, `fn_revoke_live_test_achievement_award` | No `REVOKE`/`GRANT` at all, so Supabase default privileges give EXECUTE to anon/authenticated. The admin RPCs (evaluate, publish, void, **distribute rewards**, generate/revoke certificates and achievements) contain **no `auth.uid()` or role check**. No pinned `search_path` review done. Needs explicit grants (service_role for admin RPCs, authenticated for candidate RPCs, anon only for public certificate verification) and caller checks. |
| 3 | 038 | 4 admin policies on `adaptive_test_configs`, `adaptive_attempt_states`, `adaptive_question_decisions`, `user_adaptive_profiles` | Reference **`public.users`**, which does not exist, so 038 would fail at CREATE POLICY. Must be rewritten to the post-SEC-1A admin model (`app_metadata` role or service role). |
| 4 | 050 | 2 `DO $$ … ALTER TABLE badges DROP/ADD CONSTRAINT … EXCEPTION WHEN OTHERS THEN NULL $$` | Alters the **existing** `badges` table (5 rows) and **swallows every error**. A failure would leave `badges` without its CHECK constraint. Needs a guarded rewrite without the blanket exception handler. |
| 5 | 050 | 1 `INSERT INTO public.badges …` | Writes seed rows into an **existing** table. Needs an idempotent upsert keyed on `code`, reviewed against the 5 existing rows. |

**Adjacent (outside 037–051 but missing)**
- **033:** `CREATE UNIQUE INDEX uq_test_attempts_single_active_daily` would **fail on existing data**: 1 duplicate (user, mock test, IST day) group among 20 in-progress attempts. Needs a data decision first.
- **052:** adds 5 columns, a unique index and 3 SECURITY DEFINER functions on the **existing** `user_mistake_occurrences` (13 rows). Its functions are `GRANT`ed to `authenticated` but never `REVOKE`d from PUBLIC. Its policies use only `app_metadata`/JWT role, which is OK post-SEC-1A.

---

## 7. Runtime impact (code that references missing objects)

Missing tables and RPCs reach the app as PostgREST errors (`PGRST205` table not found / function not found). Unauthenticated GETs of every affected public page return **200 with empty states**, not 500s (checked on the deployed site: `/live-tests`, `/live-tests/<slug>`, `/certificates`, `/verify/c/<code>`, `/achievements`, `/performance`, `/mistakes`; admin pages show Access Restricted).

| Feature / route | Services touching missing objects | Effective behaviour now |
|---|---|---|
| Admin audit trail (QF-1, premium, CA, onboarding, adaptive admin) | `admin-premium`, `admin-adaptive`, `admin-current-affairs`, `current-affairs-daily-quiz`, `exam-onboarding`, QF-1 admin service, `/admin/live-tests/[id]/intelligence` | **Audit inserts fail.** QF-1 logs a warning; other callers mostly ignore the error. **No audit trail exists anywhere.** |
| Premium admin config | `admin-premium.service.ts` (`premium_system_configs`) | Config reads empty; admin premium settings non-functional |
| Adaptive / CAT tests | `adaptive-engine`, `-session`, `-selection`, `-state`, `-ability`, `-analytics`, `-calibration`, `-performance`, `-remediation`, `admin-adaptive` (`/api/assessment/adaptive-step`, `/mock-tests/[id]/take`, `/admin/adaptive`) | No adaptive config is found, so adaptive mode is unavailable. Decision/ability writes would error. Calibration and analytics are empty. |
| Live all-India tests | `live-test-registration`, `-runner`, `-result`, `-reward`, `-certificate`, `-achievement`, `-foundation` (`/live-tests`, `/live-tests/[slug]`, `/take`, `/result`, `/certificates`, `/verify/c/[code]`, `/achievements`, `/admin/live-tests/*`) | Lists empty. **Registration, start, submit, results, rewards, certificates and achievements RPCs error** (function not found). |
| Candidate / competition intelligence | `candidate-intelligence` (`/performance`), `admin-competition-intelligence` | Live-test sections empty |
| Psychometrics | `psychometrics.service.ts` | Snapshot reads and writes fail; item quality views empty |
| Mistake vault lineage | `mistake.service.ts`, `mistake-longitudinal-intelligence.service.ts` (`/mistakes`) | Queries selecting `occurrence_status` / `attempt_answer_id` error. Errata revocation (`fn_revoke_mistakes_by_errata`) is unavailable. |
| Attempt integrity | test start paths | No DB guard against duplicate active daily attempts (033) |
| Quiz battles | `battle.service.ts:131` calls `fn_find_or_create_battle_room` with `p_topic_id, p_is_private, p_access_tier` | **Broken:** only the out-of-band 2-arg function exists live. PostgREST resolves RPCs by parameter names, so the 3-key call finds no matching function and every find/create-room request errors. |

---

## 8. Provenance of earlier verification claims

| Evidence | Finding |
|---|---|
| Connection source of every apply/verify script | **apply scripts** (`apply_migration48–51.cjs`, `apply_learning_migrations_53_56.cjs`, `apply_migration57–61.cjs`, `run_migration_62.cjs`): read `POSTGRES_URL_NON_POOLING` (fallbacks `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL`) from `.env.local` at run time.<br>**verify scripts** (`verify_phase4d7`, `verify_phase5b/5c/5d/5e1–5e6_6_production_runtime_gate.cjs`): read `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (+ anon key).<br>**All of them** set `NODE_TLS_REJECT_UNAUTHORIZED = '0'`. |
| Hard-coded host / project ref in any script | **None** (hard-coded ref equals couragelibrary-next: not applicable, no ref present) |
| Git history (26 commits touching scripts, `.env.example`, Supabase client config) | Only the couragelibrary-next ref ever appears (2 occurrences). **No commit references any other project.** `.env.example` (2 commits) has names only. The Supabase CLI link file (`supabase/.temp/project-ref`) equals couragelibrary-next. `supabase/config.toml` is absent. |
| Apply scripts that exist | Only **048, 049, 050, 051** of the missing range. **None for 033, 037–047 or 052.** Each runs the file as one multi-statement query, i.e. one implicit transaction. 048–051 depend on 044's tables (FKs), so on this DB they **must have failed and rolled back completely**, which matches zero 044–051 objects being present. |
| Commit chronology | 037–038 added in `20b0135` (2026-09-08) together with 034–036, which **are** live. 039–051 plus their apply/verify scripts were added in one bulk commit `b13c4ea` (2026-09-10, "Add live test infrastructure and psychometrics type definitions", 33 files). 052 was added 2026-09-15; 053–063 were applied by dedicated scripts. |
| Phase reports in repo | No phase report for 037–051 exists in the repo. Only system-design docs (`docs/internal/mock-test-system/*`) describe these features; they contain no verification output. |
| Comment-stripped bodies (003–031) | Early migrations were applied with a tool that strips `--` comments, unlike 034–036 and 053–063 (byte-identical). This suggests at least two different application paths over time. |

**Conclusion (confidence: medium–high):**
- 037–052 and 033 were **never successfully applied to couragelibrary-next**.
- No evidence shows they were applied to any other project. The repo has never referenced another ref, but `.env.local` itself is not version-controlled, so its contents during September 2026 cannot be proven (the residual uncertainty).
- The "verified" claims for those phases most likely came from session-level reports that were not backed by a successful DB run. With the migration absent, the verify scripts would have hit `PGRST205` / function-not-found on their first call. Alternatively they were never executed.
- There is **no indication** the old "couragelibrary" project was used.

---

## 9. Data check (read-only)

- **Tables declared in 037–052:** all 28 are absent, so there is **no partial data**.
- **Existing tables touched by the missing migrations:**
  - `badges`: 5 rows, 0 live-test badges
  - `user_mistake_occurrences`: 13 rows
  - `test_attempts`: 31 rows; 20 in progress; **1 duplicate active-daily group** (blocks 033)
- **Tables from 053–063:** `exam_knowledge_documents` 66, `exam_doc_versions` 76, `exam_sources` 9, `canonical_taxonomy_nodes` 40. All other 053–063 tables are 0 rows.

---

## 10. Repair strategy options (NOT implemented)

**A. Forward-only migration `064_drift_repair` (recommended)**
- **What:** one new migration that creates **only** the missing objects, rewritten to current conventions:
  - `IF NOT EXISTS` guards
  - service-role-only admin policies or `app_metadata` admin predicates (no `public.users`)
  - explicit `REVOKE ALL … FROM PUBLIC, anon, authenticated` plus minimal `GRANT`s for every SECURITY DEFINER function
  - pinned `search_path`
  - caller checks in admin RPCs
  - no blanket `EXCEPTION WHEN OTHERS`
  - idempotent seed upserts
  - 052's columns and functions added with the same hardening
  - 033's unique index added only after resolving the duplicate attempt
- **Also:** commit the out-of-band hotfixes back into the repo as `CREATE OR REPLACE` with the **live** bodies, so the repo matches reality. That covers `fn_universal_search`, `fn_log_user_search`, the discussion RPCs, the 2-arg battle room and `rls_auto_enable`. Decide whether to drop the stale overloads (`fn_generate_custom_practice_session/4`, `fn_send_user_notification/9`).
- **Pros:** never rewrites history; fixes the security defects instead of importing them; testable on a clean replay.
- **Risks:**
  - Large rewrite (~230 safe statements to transcribe plus 33 to redesign).
  - Must be validated against the app's expectations (column names/types used by services).
  - The repo's 037–052 files remain non-replayable, so fresh environments need 064 after them. Fix by marking 037–052 as superseded or by making the replay idempotent.
- **Prerequisite:** backup + a clean-database replay test (001→064) before touching couragelibrary-next.

**B. Replay the original 037–052 with exclusions and patches applied at runtime**
- **What:** apply the original files in order, skipping or patching the 33 NEEDS_REWRITE statements, then a hardening migration.
- **Pros:** less writing; the repo files "become true".
- **Risks:**
  - The 12 open-write policies and PUBLIC-executable admin RPCs exist in the window between replay and hardening.
  - 038 fails outright on `public.users`.
  - 050's error-swallowing can leave `badges` unconstrained.
  - Hand-maintained exclusion lists are error-prone and not reproducible.
- **Not recommended.**

**C. Descope / defer**
- **What:** keep the features disabled. Hide the live-test, adaptive and psychometrics entry points behind flags, and ship only the minimum now: a small forward migration for `admin_audit_logs` (+ append-only trigger) and `premium_system_configs`. Repair the rest when those features are scheduled.
- **Pros:** smallest change; restores the audit trail (needed for QF-1 closure parity and SEC follow-ups) quickly.
- **Risks:** the dead features and their silently failing services stay in the codebase. The app still advertises live tests and adaptive mode in the UI unless flagged off.

**Recommended:**
1. **C-first:** audit logs + premium configs in a small hardened 064.
2. Then **A** for adaptive, live tests, psychometrics and 052, split per feature into 065+.
3. Each step goes through backup → clean replay → dev apply → verification, as in QF-1b.

---

## 11. Limitations

- Comparison is object-level (presence of tables, columns, indexes, named constraints, policies, triggers; exact function bodies). Column **types/defaults/nullability** and policy `USING`/`WITH CHECK` **expressions** were not exhaustively diffed for the 46 applied migrations. Spot checks (the `badges` constraints) were done where a name match could hide a definition change.
- Objects created inside `DO` blocks (16) were parsed best-effort.
- Live inventory is the `public` schema only, per scope.

---

DRIFT-1a STATUS: CLOSED. All 64 migrations are classified with catalog evidence; missing objects, function drift, out-of-band objects, statement-level replay safety, runtime impact, provenance and data state are documented. No writes were made. Repair is deferred to a DRIFT-1b decision (options A/B/C, §10).
