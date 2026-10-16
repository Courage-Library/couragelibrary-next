# SEC-HOTFIX-6: lock down unchecked writing SECURITY DEFINER functions (INC-3)

> **Context.**
> - **Found during GAP2-4c.** Migration 082 (legacy-syllabus retirement) had to rewrite `public.fn_delete_exam_controlled`, and checking it showed it could be called by anyone.
> - **Architect ruling:** a separate security hotfix first. It takes migration **082**, function bodies unchanged. GAP2-4c resumes as migration **083** after the rulings in §2.3.
> - **The GAP2-4c work in progress was parked in `git stash`,** so this commit carries only the security change.

## 1. INC-3

**What:** `public.fn_delete_exam_controlled(uuid,text,uuid,text,text)` (migration 062).
- It is `SECURITY DEFINER` (owner `postgres`).
- It has **no caller check** and **no fixed `search_path`**.
- Its ACL was **NULL**, so PUBLIC had the default EXECUTE grant.
- Through PostgREST, `anon` or any signed-in user could call `rpc/fn_delete_exam_controlled` with an exam id and its slug. That permanently deleted the exam and its cycles, knowledge documents, sources, claims, posts and announcements, whenever the exam had no attempts, goals or mock templates.

**Severity:** high.
- **Mitigating:** pre-launch, development data only.
- **Not confirmed by calling it:** it was never invoked during the investigation.
- **Identified:** 2026-10-16. **Fixed:** migration 082, the same day.

### 1.1 Exposure check (read-only)

**Method:**
- Every id of `exams` and seven dependent tables was compared between each of the 15 available backups (2026-10-12 → 2026-10-16) and the live database, using `pg_restore --data-only` of each table and set comparison.
- `admin_audit_logs` was checked for `EXAMINATION_PERMANENTLY_DELETED`. The function writes that row on every successful call, in an exception-swallowing block.
- Function call statistics were checked.

| Backup | exams | exam_cycles | exam_patterns | pattern_sections | exam_knowledge_documents | exam_posts | exam_sources | exam_claims |
|---|---|---|---|---|---|---|---|---|
| pre-qf1-063-2026-10-12T09-37-14 | 4 | 4 | 1 | 4 | 66 | 0 | 9 | 0 |
| pre-drift1b-2026-10-12T11-20-55 | 4 | 4 | 1 | 4 | 66 | 0 | 9 | 0 |
| pre-drift1c-066-2026-10-12T12-02-50 | 4 | 4 | 1 | 4 | 66 | 0 | 9 | 0 |
| pre-drift1c-067-2026-10-12T12-25-06 | 4 | 4 | 1 | 4 | 66 | 0 | 9 | 0 |
| pre-drift1d-068-2026-10-12T13-08-11 | 4 | 4 | 1 | 4 | 66 | 0 | 9 | 0 |
| pre-gap2-1b-069-2026-10-12T18-06-29 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre-gap2-2a-072-2026-10-12T19-24-34 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre_073_gap2_2b-2026-10-13T12-26-04 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre_074_gap2_2b-2026-10-13T12-55-56 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre_075_gap2_3-2026-10-13T14-37-53 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre-076-sec-hotfix4-2026-10-15T18-23-31 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre-077-sec-hotfix5-2026-10-15T20-48-08 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre-078-gap2-4a-2026-10-15T22-11-33 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre-081-gap2-4b-2026-10-15T23-38-50 | 4 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| pre-082-gap2-4c-2026-10-16T07-06-32 | 5 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |
| **live (before 082)** | 5 | 4 | 1 | 4 | 70 | 0 | 13 | 0 |

**Results:**
- **No id present in any backup is missing from the live database**, in any of the eight tables.
- **Every change is an expected addition:**
  - exams +1 is the QA test exam (081);
  - knowledge documents +4 and sources +4 appear between the pre-068 and pre-069 backups (2026-10-12, content work of that day).
- **`admin_audit_logs` has 0 `EXAMINATION_PERMANENTLY_DELETED` rows** (and no exam DELETE rows at all).
- **`track_functions = none`**, so no call counts exist. This was not used as evidence.
- **Limitation:** there are no backups from before 2026-10-12, while the function exists since 062 (2026-10-02). The audit-row check covers the full lifetime, provided the audit insert did not fail silently.
- **Conclusion:** no deletion through this function is evidenced, and every exam row seen since 2026-10-12 is intact.

## 2. SECURITY DEFINER inventory (public, 93 functions)

The table below records, for every `SECURITY DEFINER` function in `public`:
- who can EXECUTE it (after 082);
- whether `search_path` is pinned;
- whether the body contains an internal role or ownership check (heuristic: `auth.uid()` / `auth.jwt()` / `auth.role()` / `fn_jwt_is_admin_or_staff` / role assertions / authorization exceptions; manually verified for every function that PUBLIC/anon can execute);
- whether it writes;
- every application call site with its client type.

"passed-in" means the client is a parameter; the caller decides.

| Function | EXECUTE (after 082) | search_path | Internal check | Writes | App call sites (client) |
|---|---|---|---|---|---|
| `fn_authorize_and_start_test_attempt` | service_role (082) | search_path=public, pg_temp | no | yes | services/premium-entitlement.service.ts:130 (service role) |
| `fn_award_gamification_reward` | PUBLIC, anon, authenticated, service_role | none | no | yes | services/gamification.service.ts:564 (service role, `adminSb`)<br>services/mistake.service.ts:1865 (**session**) |
| `fn_can_evaluate_submission` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | yes | no | services/descriptive.service.ts:314 (session) |
| `fn_check_premium_access_and_quota` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | services/premium-entitlement.service.ts:82 (service role) |
| `fn_claim_reward_item` | PUBLIC, anon, authenticated, service_role | none | no | yes | none |
| `fn_clear_user_search_history` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_complete_course_lesson` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/content.service.ts:434 (session) |
| `fn_complete_deck_review_session` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/flashcard.service.ts:287 (session) |
| `fn_complete_diagnostic_assessment` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_create_batch_assignment` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | yes | yes | services/institute.service.ts:313 (session) |
| `fn_create_custom_flashcard_deck` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_create_discussion_thread` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/community.service.ts:179 (session) |
| `fn_create_dynamic_mock_instance_atomic` | service_role (082) | search_path=public, pg_temp | no | yes | services/premium-generator.service.ts:859 (service role) |
| `fn_create_payment_order` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/billing.service.ts:191 (session) |
| `fn_create_question_revision` | service_role | search_path=public, pg_temp | no | yes | services/question-factory/admin-question-factory.service.ts:472 (passed-in) |
| `fn_delete_exam_controlled` | service_role (082) | search_path='' (082) | no | yes | services/exam-onboarding/exam-onboarding.service.ts:928 (service role) |
| `fn_edit_discussion_message` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_enforce_errata_state_machine` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_enforce_practice_session_lifecycle` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_enroll_batch_student` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | yes | yes | services/institute.service.ts:282 (session) |
| `fn_evaluate_descriptive_submission` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | yes | yes | services/descriptive.service.ts:424 (session) |
| `fn_exam_syllabus_read_model` | anon, authenticated | search_path="" | no | no | services/exam-knowledge/exam-knowledge-candidate.service.ts:358 (passed-in)<br>services/exam-onboarding/exam-readiness.service.ts:158 (service role) |
| `fn_finalize_battle_room` | authenticated, service_role | search_path=public, pg_temp | no | yes | services/battle.service.ts:274 (session) |
| `fn_find_or_create_battle_room` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/battle.service.ts:137 (session) |
| `fn_find_or_create_battle_room` | service_role | search_path=public, pg_temp | yes | yes | services/battle.service.ts:137 (session) |
| `fn_flag_discussion_content` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/community.service.ts:277 (session) |
| `fn_generate_custom_practice_session` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_generate_daily_recommendations` | authenticated, service_role | search_path=public, pg_temp | yes | no | none |
| `fn_generate_mistake_drill` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_get_active_battle_round` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/battle.service.ts:232 (session) |
| `fn_get_batch_assignment_progress` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | yes | no | services/institute.service.ts:342 (session) |
| `fn_get_due_flashcards` | authenticated, service_role | search_path=public, pg_temp | yes | no | none |
| `fn_has_batch_faculty_access` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | services/institute.service.ts:201 (session) |
| `fn_import_question_drafts` | service_role | search_path=public, pg_temp | no | yes | services/question-factory/question-factory-importer.service.ts:207 (passed-in) |
| `fn_is_batch_member` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_is_battle_participant` | authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_is_institute_member` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_join_battle_by_code` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/battle.service.ts:163 (session) |
| `fn_log_user_search` | service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_mark_accepted_answer` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/community.service.ts:253 (session) |
| `fn_mark_notification_as_read` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_moderate_flagged_content` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_override_mistake_cognitive_type` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_post_discussion_message` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/community.service.ts:208 (session) |
| `fn_process_payment_webhook` | service_role | search_path=public, pg_temp | no | yes | none |
| `fn_project_canonical_taxonomy_node` | owner only | search_path=public, pg_temp | no | yes | none |
| `fn_protect_user_notification_fields` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_publish_exam_announcement` | service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_publish_question_version` | service_role | search_path=public, pg_temp | no | yes | services/question-factory/admin-question-factory.service.ts:510 (passed-in) |
| `fn_qf_assert_item_shape` | service_role | search_path=public, pg_temp | no | no | none |
| `fn_qf_enforce_authoring_integrity` | owner only | search_path=public, pg_temp | no | no | none |
| `fn_qf_enforce_question_child_integrity` | owner only | search_path=public, pg_temp | no | no | none |
| `fn_qf_enforce_question_version_integrity` | owner only | search_path=public, pg_temp | yes | no | none |
| `fn_qf_find_exact_duplicates` | service_role | search_path=public, pg_temp | no | no | services/question-factory/question-factory-importer.service.ts:70 (passed-in) |
| `fn_qf_guard_mock_question_version` | owner only | search_path=public, pg_temp | no | no | none |
| `fn_qf_guard_question_publication` | owner only | search_path=public, pg_temp | no | no | none |
| `fn_question_stem_checksum` | service_role | search_path=public, pg_temp | no | no | none |
| `fn_recompute_mistake_profile` | service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_reconcile_search_indexes` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_record_mistake_occurrence` | service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_record_qualifying_streak_activity` | service_role (082) | search_path='' (082) | no | yes | services/gamification.service.ts:468 (service role) |
| `fn_resolve_errata_report` | service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_reverse_reward_claim` | PUBLIC, anon, authenticated, service_role | none | no | yes | none |
| `fn_revoke_mistakes_by_errata` | service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_sanitize_attempt_answer` | PUBLIC, anon, authenticated, service_role | none | no | no | none |
| `fn_send_user_notification` | service_role | search_path=public, pg_temp | no | yes | none |
| `fn_start_custom_practice_session` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_submit_battle_round_answer` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/battle.service.ts:254 (session) |
| `fn_submit_descriptive_answer` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | yes | yes | services/descriptive.service.ts:237 (session) |
| `fn_submit_flashcard_review` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/flashcard.service.ts:268 (session) |
| `fn_submit_mistake_drill` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_syllabus_archive_version` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:177 (session) |
| `fn_syllabus_create_draft` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:72 (session) |
| `fn_syllabus_delete_node` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:119 (session) |
| `fn_syllabus_move_node` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:104 (session) |
| `fn_syllabus_publish` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:160 (session) |
| `fn_syllabus_set_unit_mappings` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:132 (session) |
| `fn_syllabus_upsert_node` | authenticated | search_path="" | yes | yes | app/admin/syllabus/actions.ts:90 (session) |
| `fn_syllabus_validate` | authenticated | search_path="" | yes | no | app/admin/syllabus/actions.ts:147 (session)<br>lib/syllabus/editor-state.ts:27 (passed-in) |
| `fn_transition_question_version` | service_role | search_path=public, pg_temp | yes | yes | services/question-factory/admin-question-factory.service.ts:359 (passed-in) |
| `fn_universal_search` | service_role | search_path=public, pg_temp | yes | no | none |
| `fn_update_daily_recommendation_status` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_update_lesson_playback_position` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/content.service.ts:406 (session) |
| `fn_update_question_draft` | service_role | search_path=public, pg_temp | no | yes | services/question-factory/admin-question-factory.service.ts:447 (passed-in) |
| `fn_update_spaced_repetition_review` | service_role | search_path=public, pg_temp | no | yes | none |
| `fn_validate_bookmark_folder_ownership` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_validate_exam_announcement_cycle` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_validate_payment_order_transition` | PUBLIC, anon, authenticated, service_role | search_path=public, pg_temp | no | no | none |
| `fn_verify_and_fulfill_payment` | service_role | search_path=public, pg_temp | no | yes | none |
| `fn_verify_faculty_answer` | authenticated, service_role | search_path=public, pg_temp | yes | yes | none |
| `fn_vote_discussion_message` | authenticated, service_role | search_path=public, pg_temp | yes | yes | services/community.service.ts:231 (session) |
| `rls_auto_enable` | service_role | search_path=pg_catalog | no | yes | none |
| `trg_enforce_mock_attempt_lifecycle` | owner only | search_path=public, pg_temp | no | no | none |

### 2.1 Locked in 082 (rule: writes + no internal check + called by the app only through the service role)

| Function | Why it fits the rule | Change |
|---|---|---|
| `fn_delete_exam_controlled(uuid,text,uuid,text,text)` | deletes an exam and its children; no check; `exam-onboarding.service.ts:928` via `createAdminServerSupabaseClient`, after `guardAdminAction` (admin only) in `app/admin/exams/actions.ts:293` | EXECUTE: service_role only; `search_path = ''` |
| `fn_authorize_and_start_test_attempt(uuid,uuid)` | inserts `test_attempts` for any `p_user_id`; no caller check; `premium-entitlement.service.ts:130` (service role) | EXECUTE: service_role only (search_path already `public, pg_temp`) |
| `fn_create_dynamic_mock_instance_atomic(…)` | inserts mock tests / sections / questions for any `p_user_id`; no check; `premium-generator.service.ts:859` (service role) | EXECUTE: service_role only (search_path already pinned) |
| `fn_record_qualifying_streak_activity(uuid,text,uuid,integer,text)` | writes streaks / logs / wallet freezes for any `p_user_id`; no check; `gamification.service.ts:468` (service role) | EXECUTE: service_role only; `search_path = ''` (every table reference in the body is schema-qualified) |

**What the migration changed:**
- **Bodies are byte-identical before and after** (`prosrc` compared).
- **Baseline diff after the apply:** the ledger row (82 → 83) and the four functions' ACL / config hashes. Nothing else changed: 138 tables, 246 policies, 292 table grants and the other 155 functions are identical.
- **`db:types`:** no change.

**Rollback:**
- File: `docs/database/rollback/082_rollback.sql`. It restores the exact pre-082 ACLs and `search_path`, and **re-opens INC-3**: emergency use only.
- It was dry-run together with the migration in one rolled-back transaction, and the final state equalled the pre-082 state.

### 2.2 Proof

**RLS suite P-9 (permanent):**
- **Rule:** no `SECURITY DEFINER` function in `public` is EXECUTE-able by anon or PUBLIC, and every one pins `search_path`.
- **Allowed exceptions:**
  - the reviewed `SECDEF_PUBLIC_OK` list: only `fn_exam_syllabus_read_model` (student syllabus read model, PUBLISHED rows only, read-only, `search_path ''`);
  - trigger functions, which PostgREST cannot call;
  - `SECDEF_PENDING_RULING` (§2.3), reported loudly. An entry that no longer violates fails the test until it is removed from the list.
- **The INC-3 set must stay service_role only.**
- **Behaviour, inside a rolled-back transaction:**
  - all four locked functions return **42501** for anon and for a student session;
  - the **service role deletes a throwaway exam** created inside the transaction through `fn_delete_exam_controlled`. That is the exam-onboarding deletion path, and nothing persists.
- **Result:** RLS suite **9/9**.

**HTTP:** `POST /rest/v1/rpc/fn_delete_exam_controlled` as anon, with the zero uuid (never a real exam id), returns **401 / 42501**. Checked locally before the push and in production after the deploy (§4).

### 2.3 Awaiting an architect ruling (not changed)

| Function | Finding | App caller | Suggested ruling |
|---|---|---|---|
| `fn_award_gamification_reward` | writes coins / XP for any `p_user_id`; **no check**; no `search_path`; PUBLIC / anon EXECUTE | `gamification.service.ts:564` (service role) **and** `mistake.service.ts:1865` (**session**; currently fails, tracked `TYPES-1:B-DRILL-REWARD-ARGS`) | **high**: move the drill reward to the service role (or add a caller check), then lock like §2.1 |
| `fn_claim_reward_item` | writes reward claims; no check; no `search_path`; PUBLIC / anon | none | **high**: lock (service_role) or drop |
| `fn_reverse_reward_claim` | reverses claims; no check; no `search_path`; PUBLIC / anon | none | **high**: lock (service_role) or drop |
| `fn_check_premium_access_and_quota` | read: any user's entitlement / quota (disclosure); no check; PUBLIC / anon | `premium-entitlement.service.ts:82` (service role) | lock (service_role) |
| `fn_create_batch_assignment`, `fn_enroll_batch_student` | write; internal `auth.uid()` / JWT checks; PUBLIC / anon EXECUTE | `institute.service.ts:313`, `:282` (session) | revoke anon / PUBLIC, keep authenticated |
| `fn_evaluate_descriptive_submission`, `fn_submit_descriptive_answer` | write; internal checks; PUBLIC / anon | `descriptive.service.ts:424`, `:237` (session) | revoke anon / PUBLIC, keep authenticated |
| `fn_get_batch_assignment_progress` | read; internal checks; PUBLIC / anon | `institute.service.ts:342` (session) | revoke anon / PUBLIC |
| `fn_can_evaluate_submission`, `fn_has_batch_faculty_access`, `fn_is_batch_member`, `fn_is_institute_member` | read predicates used inside RLS policies (1 / 5 / 3 / 3 policies); PUBLIC / anon | `descriptive.service.ts:314`, `institute.service.ts:201` (session) | revoke anon / PUBLIC only after checking that no anon-visible policy uses them |
| `fn_sanitize_attempt_answer` | trigger function without a pinned `search_path` | trigger | pin `search_path` |

**Not part of this hotfix, recorded for the architect:**
- `fn_create_question_revision`, `fn_import_question_drafts`, `fn_publish_question_version`, `fn_update_question_draft`, `fn_process_payment_webhook`, `fn_send_user_notification`, `fn_update_spaced_repetition_review` and `fn_verify_and_fulfill_payment` also have no internal check. They are already **service_role only**, so they are compliant.
- `fn_project_canonical_taxonomy_node`, `rls_auto_enable` and the trigger helpers are owner / trigger only.

## 3. Migration discipline and gates

**Migration discipline:**

| Step | Result |
|---|---|
| Backup | `pre-082-sec-hotfix6-2026-10-16T07-28-33` (public + auth data, `pg_restore --list` verified) |
| Baseline (before) | 138 tables (rows + md5), 246 policies, 292 grants, 159 function hashes |
| Dry-run | OK (rolled back), 495 ms |
| Migration + rollback dry-run | in one rolled-back transaction: the rollback restores the pre-082 ACLs / config exactly |
| Apply | `APPLIED + ledger row written` (runner, single transaction) |
| Baseline (after) | diff = ledger 82 → 83 + the 4 function ACL / config hashes; bodies byte-identical |
| `db:types` | regenerated, no change |

**Gates** (local production build, `next start -p 3100`):

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| RLS suite (P-1 … **P-9**) | **9/9** (P-9: 93 functions, 4 locked, 14 pending ruling) |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 · 3/3 · 4/4 |
| SEC-1B / 1C / 1D (offline) | 26/26 · 22/22 · 14/14 |
| GAP2-4a syllabus / GAP2-4b editor (offline) / GAP2-4b readers | 12/12 · 4/4 · 6/6 |
| Design ratchet / QA guard | 7/7 · 8/8 |
| Signed-in smoke admin-pages (local build) | 16/16 |
| Anonymous smoke (local build), including the anon RPC probe | all passed (`401 / 42501`) |

**Network events (recorded):**
- One RLS run lost its connection during P-9. It left **one orphaned backend of this suite**: same DB user, "idle in transaction" about 1m40s, last statement the P-9 `set_config('request.jwt.claims', …)` probe.
- It **ended on its own before any action. Nothing was terminated.**
- Afterwards there were no idle-in-transaction sessions and no advisory locks.
- The re-run passed 9/9.

## 4. Production

After the push:
- `node scripts/smoke/wait-for-deploy.cjs https://couragelibrary-next.vercel.app <sha>`;
- the anonymous smoke, including `POST /rest/v1/rpc/fn_delete_exam_controlled` as anon with the zero uuid → permission denied (42501), and `/exams/ssc-cgl`.

The database change is live since the apply (shared development database). The result goes to the owner with the hand-off and is recorded in the GAP2-4c report.

## 5. Next

1. **Architect ruling on §2.3.**
2. **GAP2-4c resumes as migration 083:**
   - retire the legacy syllabus tables + `taxonomy_aliases`;
   - re-point `fn_syllabus_seed_legacy_gd_draft()` to `retired.*`;
   - drop the legacy-syllabus cleanup inside `fn_delete_exam_controlled`. The new body keeps the 082 lockdown: `CREATE OR REPLACE` keeps the ACL, and `search_path ''` is kept.
3. **Backlog:**
   - consider `track_functions = 'pl'` (pre-launch) so that call statistics exist for future incident analysis;
   - SEC-1E (`/admin/syllabus` exam list via the service role after the guard) is recorded separately.
