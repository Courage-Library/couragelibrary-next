# HOTFIX-2: no fabricated curriculum coverage; TLS-safe rewards test; TLS-disabling inventory

> **Scope:** decision #15 (honest data) for `/admin/content` coverage, the TLS rule for scripts, and an inventory.
> - **Not included:** no DB changes, no packages.
> - **Tracked items unchanged:** the `TYPES-1:B-CURRICULUM-MAPPING` tags stay (owner GAP2-4).

## a) Curriculum coverage never fabricates values

**Before.** `CurriculumCoverageService.getCurriculumCoverageMatrix` read `learning_units.is_published` and `exam_unit_mappings → exam_topic_mappings`. Both reads always fail against the live schema (TYPES-1 B4). The function then **synthesised** coverage:
- a `unit-<topicId>` learning unit per topic, with Percentage marked published
- a **"PUBLISHED" pilot Percentage document** plus a pilot version
- **default exam mappings** for every unit (first active exam, or a hard-coded SSC CGL id)

Staff on `/admin/content` saw these as real coverage figures.

**After:**
- **Any failed source read** returns an explicit **`status: 'UNAVAILABLE'`** matrix via `unavailableMatrix(reason)`. It has zero counts and no subjects or exams, and `unavailableReason` lists the failed reads. This applies to exams, subjects, topics, learning_units, learning_documents, document_versions, questions and exam_unit_mappings.
- **All three synthesis blocks are removed.** An empty table is reported as empty (`status: 'AVAILABLE'`, zeros); nothing is invented.
- `CurriculumCoverageMatrix.status` and `CurriculumQualityMetrics.status` are new fields. Quality metrics inherit `UNAVAILABLE`.
- **`/admin/content` coverage view:** when the matrix is `UNAVAILABLE` it renders only the notice **"Coverage unavailable — pending syllabus rebuild (GAP2-4)"** (`COVERAGE_UNAVAILABLE_MESSAGE`), with no figures.
- The authoring queue builds from the empty matrix, so it shows no invented tasks.
- **Production today:** the matrix is `UNAVAILABLE` (learning_units, exam_unit_mappings) until GAP2-4 rebuilds the mapping model.

**Test:** `scripts/test_hotfix2_coverage.cjs` (5/5, unit, no network). It runs the **real** service against an injected failing client:

| Check | What it verifies |
|---|---|
| H2-1 | Today's failure leads to `UNAVAILABLE`, all zeros, and **none** of the former fabricated values: pilot document / version ids, default exam id, synthesised unit ids and titles |
| H2-2 | Each other failing read leads to `UNAVAILABLE` |
| H2-3 | Successful empty reads lead to `AVAILABLE` with honest zeros and no synthesised units |
| H2-4 | Metrics inherit `UNAVAILABLE` |
| H2-5 | Static: the fabrication code is gone; the view branch shows only the notice; the 5 `B-CURRICULUM-MAPPING` directives remain |

The B4 test (B4-4) and the register entry were updated to record the HOTFIX-2 state.

## b) `scripts/test_phase5e1_rewards.cjs`: deleted

**Justification:** the suite tested **its own local copy** of the reward-tier matcher (`matchRewardTier` defined inside the script). It imported no product code and made no DB or network calls, yet it set `NODE_TLS_REJECT_UNAUTHORIZED='0'` process-wide. Its checks were not meaningful. The real logic, `services/live-test-reward.service.ts`, is quarantined behind LIVE_TESTS. That logic belongs to the LIVE_TESTS re-enable phase, with a test against the real service.

**References updated:**
- `scripts/run_full_regression_track.cjs`: entry removed, with a comment.
- `docs/architecture/phase5e1_rewards_cl_settlement.md`: marked removed.

## Inventory: every remaining file that disables TLS verification (list only; no changes)

**Search:** `NODE_TLS_REJECT_UNAUTHORIZED` or `rejectUnauthorized: false`, over all `.cjs/.js/.mjs/.ts/.tsx` files outside `node_modules` and `.next`. **116 files.**

**Owners:** Platform ops; the current-affairs files are TEST-CA.

> **⚠ One hit is production runtime code:** `services/exam-syllabus-resolution.service.ts:481`.
> - `resolveWorkItem`'s atomic subtree creation opens a direct `pg` connection with `ssl: { rejectUnauthorized: false }`.
> - It is reachable from `services/operational-syllabus-reconciliation.service.ts` (admin syllabus reconciliation).
> - **Recommendation:** fix before GAP2-4 relies on it. Use `scripts/db/_db-env.cjs`-style verified TLS (CA from `PROD_CA_PATH`), or move the atomic operation into a SQL function and call it via RPC. The latter removes the direct connection altogether.

**Product runtime code (CRITICAL)** (1). Owner: Platform ops — fix first.

- `services/exam-syllabus-resolution.service.ts`

**Current-affairs suites (legacy; must not run until TEST-CA)** (13). Owner: TEST-CA.

- `scripts/audit_ca4_baseline.cjs`
- `scripts/test_ca1_forensic_suite.cjs`
- `scripts/test_ca2_forensic_suite.cjs`
- `scripts/test_ca3_forensic_suite.cjs`
- `scripts/test_ca4_forensic_suite.cjs`
- `scripts/test_ca5_forensic_suite.cjs`
- `scripts/test_ca6_forensic_suite.cjs`
- `scripts/test_ca72_feed_adapter.cjs`
- `scripts/test_ca73_real_github_feed_staging.cjs`
- `scripts/test_ca74_controlled_production_sync.cjs`
- `scripts/test_ca75_operational_resilience.cjs`
- `scripts/test_ca76_historical_migration.cjs`
- `scripts/test_ca_public_read_regression.cjs`

**Legacy one-off migration appliers (superseded by the migration runner)** (11). Owner: Platform ops.

- `scripts/apply_learning_migrations_53_56.cjs`
- `scripts/apply_migration48.cjs`
- `scripts/apply_migration49.cjs`
- `scripts/apply_migration50.cjs`
- `scripts/apply_migration51.cjs`
- `scripts/apply_migration57.cjs`
- `scripts/apply_migration58.cjs`
- `scripts/apply_migration59.cjs`
- `scripts/apply_migration60.cjs`
- `scripts/apply_migration61.cjs`
- `scripts/run_migration_62.cjs`

**Production runtime gates (verify_*)** (15). Owner: Platform ops.

- `scripts/verify_phase2_production_runtime_gate.cjs`
- `scripts/verify_phase3b_production_runtime_gate.cjs`
- `scripts/verify_phase3c_notes_bookmarks_runtime_gate.cjs`
- `scripts/verify_phase3d_mistake_drill_runtime_gate.cjs`
- `scripts/verify_phase3j1_production_boundaries.cjs`
- `scripts/verify_phase4d7_production_runtime_gate.cjs`
- `scripts/verify_phase5b_production_runtime_gate.cjs`
- `scripts/verify_phase5c_production_runtime_gate.cjs`
- `scripts/verify_phase5d_production_runtime_gate.cjs`
- `scripts/verify_phase5e1_production_runtime_gate.cjs`
- `scripts/verify_phase5e2_production_runtime_gate.cjs`
- `scripts/verify_phase5e3_production_runtime_gate.cjs`
- `scripts/verify_phase5e4_production_runtime_gate.cjs`
- `scripts/verify_phase5e5_production_runtime_gate.cjs`
- `scripts/verify_phase5e6_6_production_runtime_gate.cjs`

**Phase test suites** (46). Owner: Platform ops.

- `scripts/test_controlled_exam_deletion.cjs`
- `scripts/test_draft_exam_module_applicability.cjs`
- `scripts/test_draft_readiness_publish_flow.cjs`
- `scripts/test_dynamic_syllabus_projection.cjs`
- `scripts/test_dynamic_syllabus_readiness.cjs`
- `scripts/test_dynamic_syllabus_reconciliation.cjs`
- `scripts/test_dynamic_syllabus_resolution.cjs`
- `scripts/test_dynamic_syllabus_schema.cjs`
- `scripts/test_exam_cleanup_and_management.cjs`
- `scripts/test_insert_status.cjs`
- `scripts/test_phase3a_academic_taxonomy.cjs`
- `scripts/test_phase3b_artifact_storage.cjs`
- `scripts/test_phase3c_content_compilation.cjs`
- `scripts/test_phase3d_admin_content_studio.cjs`
- `scripts/test_phase3d_mistake_drill.cjs`
- `scripts/test_phase3e1_ai_architecture.cjs`
- `scripts/test_phase3e2_curriculum_ai.cjs`
- `scripts/test_phase3e_learning_content.cjs`
- `scripts/test_phase3f1_curriculum_pilot.cjs`
- `scripts/test_phase3i_multi_exam_onboarding_audit.cjs`
- `scripts/test_phase3j_exam_onboarding.cjs`
- `scripts/test_phase3k_ai_onboarding.cjs`
- `scripts/test_phase3m4_forensic_suite.cjs`
- `scripts/test_phase3m5_candidate_learning.cjs`
- `scripts/test_phase3m6_coverage_operations.cjs`
- `scripts/test_phase3r_step6_operational_api.cjs`
- `scripts/test_phase3r_step7_workbench_ui.cjs`
- `scripts/test_phase4_mistake_intelligence.cjs`
- `scripts/test_phase4d1_advanced_adaptive_foundation.cjs`
- `scripts/test_phase4d2_item_calibration.cjs`
- `scripts/test_phase4d3_advanced_ability_estimation.cjs`
- `scripts/test_phase4d4_cat_information_selection.cjs`
- `scripts/test_phase4d5_stopping_personalization.cjs`
- `scripts/test_phase4d6_adaptive_analytics.cjs`
- `scripts/test_phase4d7_adaptive_production_hardening.cjs`
- `scripts/test_phase5a_live_test_foundation.cjs`
- `scripts/test_phase5b_live_test_registration.cjs`
- `scripts/test_phase5c_live_test_runner.cjs`
- `scripts/test_phase6_task2_error_decay.cjs`
- `scripts/test_phase6_task3_cat_remediation.cjs`
- `scripts/test_phase6_task4_longitudinal_intelligence.cjs`
- `scripts/test_phase6_task5_final_completion.cjs`
- `scripts/test_rpc.cjs`
- `scripts/test_rpc_813023.cjs`
- `scripts/test_rpc_call.cjs`
- `scripts/test_runtime_error.cjs`

**Regression orchestrator** (1). Owner: Platform ops.

- `scripts/run_full_regression.cjs`

**Inspection / debug / one-off scripts** (21). Owner: Platform ops.

- `scripts/audit_immutability.cjs`
- `scripts/check_fk_schema.cjs`
- `scripts/check_rpc_status.cjs`
- `scripts/check_templates.cjs`
- `scripts/count_questions_by_topic.cjs`
- `scripts/debug_fk.cjs`
- `scripts/discover_curriculum.cjs`
- `scripts/dry_run_exam_inventory.cjs`
- `scripts/execute_controlled_test_cleanup.cjs`
- `scripts/forensic_audit_readonly.cjs`
- `scripts/inspect_calibrations.cjs`
- `scripts/inspect_child_rows.cjs`
- `scripts/inspect_cols.cjs`
- `scripts/inspect_cycle_fks.cjs`
- `scripts/inspect_exams.cjs`
- `scripts/inspect_fk.cjs`
- `scripts/inspect_mock_exam.cjs`
- `scripts/inspect_openapi.cjs`
- `scripts/inspect_percentage_questions.cjs`
- `scripts/inspect_schema_details.cjs`
- `scripts/inspect_topics_questions.cjs`

**Local scratch (untracked, not in the repository)** (7). Owner: local only — delete.

- `scratch/test_phase3k13_1_state_integrity.cjs`
- `scratch/test_phase3k13_2_request_changes.cjs`
- `scratch/test_phase3k13_revision_authoring.cjs`
- `scratch/test_phase3k14_version_history_diff.cjs`
- `scratch/test_phase3k15_prompt_hardening.cjs`
- `scratch/test_phase4b_adaptive_decision_engine.cjs`
- `scratch/test_phase4c2_adaptive_attempt_lifecycle.cjs`

**False positive (guard that FORBIDS TLS disabling)** (1). Owner: —.

- `scripts/test_qf1_question_factory.cjs`

**Not counted as TLS violations:**
- `scripts/test_qf1_question_factory.cjs` matches only because it **asserts the absence** of these patterns (STATIC-4).
- The 7 `scratch/` files are untracked local leftovers, not in the repository.

## Gates

Run on a local production build.

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 (incl. `db:types:check`) | 8/8 |
| test_types1_close | 3/3 (live select audit: all failing selects owned) |
| test_hotfix2_coverage | 5/5 |
| test_types1_b4 | 5/5 |
| SEC-1C offline | 22/22 |
| SEC-1D offline | 14/14 |
| QA identity guard | 8/8 |
| HOTFIX-1 | 4/4 |
| Signed-in smoke `staff-content` (`/admin/content` 200, renders) | **passed** |

Production: see the commit and status below.
