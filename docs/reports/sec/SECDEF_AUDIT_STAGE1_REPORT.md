# SECDEF-AUDIT Stage 1: SECURITY DEFINER inventory against decision #54

Phase brief: architect, 2026-10-18 ("GATE-HYGIENE-1 + SECDEF-AUDIT Stage 1"). Stage 1 is **read-only**: no migrations and no DB or app changes. Only this report is committed.

**Decision #54 (least privilege):**
- SECURITY DEFINER only for client-callable entrypoints, or functions that genuinely need elevated rights.
- Internal helpers, predicates and trigger functions with no client EXECUTE use SECURITY INVOKER.
- search_path is pinned (`''` or `public, pg_temp`).
- No anon / PUBLIC EXECUTE unless allow-listed (P-9).

## 1. Method

- **Catalogue:** couragelibrary-next, verified TLS, one `BEGIN READ ONLY` transaction per run.
  - From `pg_proc`: every `prosecdef` function in `public`, with name, identity arguments, language, owner, `proconfig` search_path, and `has_function_privilege` for anon / authenticated / service_role / PUBLIC.
  - From the bodies: whether each function checks `auth.uid()`, the JWT role, a role helper, or `fn_syllabus__assert_role`, and whether it writes.
- **Callers:**
  - other functions: body references in `pg_proc`;
  - triggers: `pg_trigger`;
  - RLS policies: `pg_policy` expressions;
  - views: `pg_views`;
  - **app code**: a quoted-name match over 566 runtime files in app / services / lib / components / actions / hooks / config / middleware.
- **Table references:** the tables each body references and writes, cross-checked against the service_role / authenticated table grants and RLS. This shows whether an INVOKER version would have the rights it needs.
- **Limits:**
  - The app-caller match is by name: overloads are not told apart, and a dynamically built RPC name would be missed (none was found).
  - "Own caller check" is a body heuristic, confirmed by hand for every entry marked unchecked.
  - Nothing was executed against any function.

## 2. Summary

**95** SECURITY DEFINER functions in `public`. **D = 0**: every function pins search_path, and no callable function is EXECUTE-able by anon / PUBLIC except the allow-listed `fn_exam_syllabus_read_model`. P-9 holds.

| Class | Count | Meaning |
|---|---|---|
| **A** client entrypoint (EXECUTE to authenticated / anon; app caller or RLS predicate) | 37 | DEFINER justified as an entrypoint; each must check the caller itself |
| **B** internal (no client EXECUTE) | 44 | 15 triggers · 13 service-role RPCs with an app caller · 16 service-role / owner-only with no app caller. #54: INVOKER unless elevated rights are genuinely needed |
| **C** granted to a client role, no app caller (dead surface) | 14 | candidates to revoke |
| **D** unpinned search_path / anon or PUBLIC EXECUTE outside the allow-list | 0 | — |

**Findings:**

**F-1 (priority): `fn_finalize_battle_room(p_room_id)` has no caller check.**
- It is granted to `authenticated`, and called by `services/battle.service.ts` (user client; `FEATURE_BATTLES` off by default) and by `fn_submit_battle_round_answer`.
- Its body has no `auth.uid()`, participant or role check. The only guard is the room state, and CANCELLED / EXPIRED rooms skip the "final round complete" check.
- It writes `quiz_battle_rooms` (status, winner), `quiz_battle_participants`, `user_battle_stats` (ELO) and `learning_activity_events`.
- So **any signed-in user can finalize any finished, cancelled or expired room over PostgREST** and trigger the ELO / stats writes. That is reachable today even with the flag off.
- **Not probed** (read-only stage). Proposed fix: Stage 2 batch S2-1.

**F-2: 14 functions are granted to `authenticated` with no app caller** (class C).
- They come from the phase-3 feature migrations: flashcards, discussions, recommendations, search, diagnostics, practice.
- All write except `fn_get_due_flashcards` and `fn_generate_daily_recommendations`, and all check the caller themselves (13 with `auth.uid()`; `fn_reconcile_search_indexes` with a service_role / staff role check).
- They are live attack surface with no product use.

**F-3: the 5 RLS predicates take an arbitrary `p_user_id`** (`fn_is_batch_member`, `fn_is_institute_member`, `fn_is_battle_participant`, `fn_has_batch_faculty_access`, `fn_can_evaluate_submission`).
- The policies pass `auth.uid()`, but a direct PostgREST call can ask about any user, which is a membership oracle.
- Low risk: it needs UUIDs and returns a boolean.

**F-4: 7 trigger functions carry anon / authenticated / PUBLIC EXECUTE** (the default ACL).
- They are not callable: Postgres refuses a direct call of a trigger function, and P-9 rightly ignores them.
- Under #54 this is hygiene. Revoking changes nothing at fire time, because trigger firing does not check EXECUTE.

**F-5: 29 service-role / owner-only RPCs and helpers are DEFINER without needing it.**
- service_role holds every table grant they reference (0 missing) and none touches a non-public schema, so INVOKER is feasible for all 29.
- Each still needs a behaviour proof, since `current_user` changes from the owner to service_role.

**F-6: of the 15 triggers, 5 are read-only with no RLS reads** (INVOKER candidates).
- 8 read RLS-protected tables to validate integrity (plus `fn_qf_version_publishable_trg`, kept DEFINER by ruling). Under INVOKER, the writer's RLS could hide the rows they must see (false accept / false reject), so they keep DEFINER under the elevated-rights clause unless a proof shows otherwise.
- 1 (`fn_project_canonical_taxonomy_node`) writes projection tables the writer has no grants on, so it genuinely needs DEFINER.

## 3. Inventory and classification

Grants: anon / auth = authenticated / svc = service_role / PUBLIC. search_path: `''` or `public, pg_temp`. "Own caller check": uid = `auth.uid()`, jwt = JWT role, role = role helper, assert_role = `fn_syllabus__assert_role`.

### A. Client entrypoints (37)

| Function | Grants | search_path | Own caller check | Callers | Notes |
|---|---|---|---|---|---|
| `fn_can_evaluate_submission(p_submission_id uuid, p_user_id uuid)` | auth, svc | `public, pg_temp` | jwt | app 1; fn: fn_evaluate_descriptive_submission; policies 1 | RLS predicate (1 policy) + JWT staff check; takes any p_user_id |
| `fn_complete_course_lesson(p_lesson_id uuid)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_complete_deck_review_session(p_deck_id uuid)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_create_batch_assignment(p_batch_id uuid, p_title text, p_assignment_type text, p_content_id uuid, p_due_at timestamp with time zone, p_instructions_md text)` | auth, svc | `public, pg_temp` | uid+jwt | app 1 |  |
| `fn_create_discussion_thread(p_context_type text, p_context_id uuid, p_title text, p_initial_content text)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_create_payment_order(p_order_type text, p_plan_id uuid, p_course_id uuid, p_coupon_code text, p_gateway text, p_idempotency_key text)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_enroll_batch_student(p_batch_id uuid, p_student_user_id uuid, p_role text)` | auth, svc | `public, pg_temp` | uid+jwt | app 1 |  |
| `fn_evaluate_descriptive_submission(p_submission_id uuid, p_rubric_scores jsonb, p_total_score numeric, p_strengths text, p_weaknesses text, p_suggestions text, p_model_comparison text, p_evaluator_type text)` | auth, svc | `public, pg_temp` | uid+jwt | app 1 |  |
| `fn_exam_syllabus_read_model(p_exam_id uuid, p_exam_cycle_id uuid)` | anon, auth | `''` | — | app 3 | public read model (P-9 allow-list): PUBLISHED rows only, read-only |
| `fn_finalize_battle_room(p_room_id uuid)` | auth, svc | `public, pg_temp` | — | app 1; fn: fn_submit_battle_round_answer | **FINDING F-1**: no caller check (no auth.uid / participant / role); any authenticated user can finalize any room whose rounds are over, or any CANCELLED / EXPIRED room (writes winner, ELO, stats) |
| `fn_find_or_create_battle_room(p_topic_id uuid, p_is_private boolean, p_access_tier text)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_flag_discussion_content(p_target_type text, p_target_id uuid, p_reason text, p_details text)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_generate_mistake_drill(p_vault_ids uuid[], p_topic_id uuid, p_cognitive_type_id text)` | auth | `''` | uid | app 1 |  |
| `fn_get_active_battle_round(p_room_id uuid)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_get_batch_assignment_progress(p_assignment_id uuid)` | auth, svc | `public, pg_temp` | uid+jwt | app 1 |  |
| `fn_has_batch_faculty_access(p_batch_id uuid, p_user_id uuid)` | auth, svc | `public, pg_temp` | — | app 1; fn: fn_create_batch_assignment, fn_enroll_batch_student, fn_get_batch_assignment_progress, fn_can_evaluate_submission; policies 5 | RLS predicate (5 policies); takes any p_user_id (membership oracle, low risk) |
| `fn_is_batch_member(p_batch_id uuid, p_user_id uuid, p_roles text[])` | auth, svc | `public, pg_temp` | — | fn: fn_submit_descriptive_answer; policies 3 | RLS predicate (3 policies); takes any p_user_id (membership oracle, low risk) |
| `fn_is_battle_participant(p_room_id uuid, p_user_id uuid)` | auth, svc | `public, pg_temp` | — | fn: fn_get_active_battle_round; policies 3 | RLS predicate (3 policies); takes any p_user_id (membership oracle, low risk) |
| `fn_is_institute_member(p_institute_id uuid, p_user_id uuid, p_roles text[])` | auth, svc | `public, pg_temp` | — | fn: fn_can_evaluate_submission; policies 3 | RLS predicate (3 policies); takes any p_user_id (membership oracle, low risk) |
| `fn_join_battle_by_code(p_room_code text)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_mark_accepted_answer(p_thread_id uuid, p_message_id uuid)` | auth, svc | `public, pg_temp` | uid+jwt | app 1 |  |
| `fn_post_discussion_message(p_thread_id uuid, p_content_markdown text, p_parent_message_id uuid)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_submit_battle_round_answer(p_room_id uuid, p_round_number integer, p_selected_option_id uuid)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_submit_descriptive_answer(p_question_id uuid, p_answer_text text, p_attachment_url text, p_submission_type text, p_batch_id uuid, p_assignment_id uuid)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_submit_flashcard_review(p_card_id uuid, p_rating integer)` | auth, svc | `public, pg_temp` | uid+jwt | app 1 |  |
| `fn_submit_mistake_drill(p_drill_id uuid, p_answers jsonb)` | auth | `''` | uid | app 1 |  |
| `fn_syllabus_archive_version(p_version_id uuid)` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_create_draft(p_exam_id uuid, p_exam_cycle_id uuid, p_from_version_id uuid, p_version_tag text)` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_delete_node(p_node_id uuid)` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_import_draft(p_exam_id uuid, p_payload jsonb)` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_move_node(p_node_id uuid, p_new_parent_id uuid, p_display_order integer)` | auth | `''` | assert_role | app 1; fn: fn_syllabus_upsert_node |  |
| `fn_syllabus_publish(p_version_id uuid)` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_set_unit_mappings(p_node_id uuid, p_topic_ids uuid[], p_weights numeric[])` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_upsert_node(p_version_id uuid, p_node jsonb)` | auth | `''` | assert_role | app 1 |  |
| `fn_syllabus_validate(p_version_id uuid)` | auth | `''` | assert_role | app 2 |  |
| `fn_update_lesson_playback_position(p_lesson_id uuid, p_position_seconds integer, p_elapsed_real_seconds integer)` | auth, svc | `public, pg_temp` | uid | app 1 |  |
| `fn_vote_discussion_message(p_message_id uuid, p_vote_action text)` | auth, svc | `public, pg_temp` | uid | app 1 |  |

### B. Internal: triggers (15)

| Trigger function | Grants | search_path | Fired by | Writes | Reads RLS tables | Needs elevated rights? |
|---|---|---|---|---|---|---|
| `fn_enforce_errata_state_machine` | anon, auth, svc, PUBLIC | `public, pg_temp` | trg_enforce_errata_state_machine on question_errata_reports | — | — | read-only, no RLS reads → INVOKER candidate |
| `fn_enforce_practice_session_lifecycle` | anon, auth, svc, PUBLIC | `public, pg_temp` | trg_enforce_practice_session_lifecycle on custom_practice_sessions | — | — | read-only, no RLS reads → INVOKER candidate |
| `fn_project_canonical_taxonomy_node` | owner only | `public, pg_temp` | trg_project_canonical_taxonomy_node on canonical_taxonomy_nodes | subjects, topics, subtopics | subjects, topics, subtopics | writes subjects, topics, subtopics (authenticated lacks grants on subjects, topics, subtopics) → review |
| `fn_protect_user_notification_fields` | anon, auth, svc, PUBLIC | `public, pg_temp` | trg_protect_user_notification_fields on user_notifications | — | — | read-only, no RLS reads → INVOKER candidate |
| `fn_qf_enforce_authoring_integrity` | owner only | `public, pg_temp` | trg_qf_question_version_authoring_integrity on question_version_authoring | — | question_versions | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_qf_enforce_question_child_integrity` | owner only | `public, pg_temp` | trg_qf_question_options_integrity on question_options, trg_qf_question_answers_integrity on question_answers | — | question_versions | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_qf_enforce_question_version_integrity` | owner only | `public, pg_temp` | trg_qf_question_version_integrity on question_versions | — | — | read-only, no RLS reads → INVOKER candidate |
| `fn_qf_guard_mock_question_version` | owner only | `public, pg_temp` | trg_qf_mock_question_version_guard on mock_questions | — | question_versions, questions | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_qf_guard_question_publication` | owner only | `public, pg_temp` | trg_qf_question_publication_guard on questions | — | question_versions, questions | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_qf_version_publishable_trg` | owner only | `''` | trg_qf_version_publishable on question_versions | — | question_versions | kept DEFINER by ruling (#54 elevated-rights clause: must see the true options / answer) |
| `fn_sanitize_attempt_answer` | anon, auth, svc, PUBLIC | `''` | trg_sanitize_attempt_answer on attempt_answers | — | test_attempts, mock_questions | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_validate_bookmark_folder_ownership` | anon, auth, svc, PUBLIC | `public, pg_temp` | trg_validate_bookmark_folder_ownership on user_question_bookmarks | — | user_bookmark_folders | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_validate_exam_announcement_cycle` | anon, auth, svc, PUBLIC | `public, pg_temp` | trg_validate_exam_announcement_cycle on exam_announcements | — | exam_cycles | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |
| `fn_validate_payment_order_transition` | anon, auth, svc, PUBLIC | `public, pg_temp` | trg_validate_payment_order_transition on payment_orders | — | — | read-only, no RLS reads → INVOKER candidate |
| `trg_enforce_mock_attempt_lifecycle` | owner only | `public, pg_temp` | trg_test_attempts_lifecycle_check on test_attempts | — | mock_tests, mock_templates, test_attempts | read-only; reads RLS tables → INVOKER would see the writer's rows only → behaviour proof needed |

### B. Internal: service-role RPCs with an app caller (13)

| Function | Grants | search_path | Callers | Writes | INVOKER feasible? |
|---|---|---|---|---|---|
| `fn_authorize_and_start_test_attempt(p_user_id uuid, p_mock_test_id uuid)` | svc | `public, pg_temp` | app 1 | mock_tests, test_attempts | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_award_gamification_reward(p_user_id uuid, p_event_type text, p_source_type text, p_source_id uuid, p_idempotency_key text, p_calculated_coins integer, p_reason_code text, p_metadata jsonb)` | svc | `''` | app 1; fn: fn_resolve_errata_report, fn_finalize_battle_room, fn_evaluate_descriptive_submission | gamification_events, coin_wallets, coin_ledger | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_check_premium_access_and_quota(p_user_id uuid, p_exam_id uuid, p_test_type text)` | svc | `public, pg_temp` | app 1 | — | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_create_dynamic_mock_instance_atomic(p_user_id uuid, p_exam_id uuid, p_template_id uuid, p_title text, p_slug text, p_test_type text, p_quota_key text, p_duration_minutes integer, p_marks_per_question numeric, p_negative_mark numeric, p_metadata jsonb, p_questions jsonb, p_ttl_hours integer)` | svc | `public, pg_temp` | app 1 | mock_tests, mock_sections, mock_questions | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_create_question_revision(p_question_id uuid, p_actor uuid, p_payload jsonb)` | svc | `public, pg_temp` | app 1 | question_versions, question_version_authoring, question_options, question_answers | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_delete_exam_controlled(p_exam_id uuid, p_slug text, p_actor_id uuid, p_actor_email text, p_reason text)` | svc | `''` | app 1 | exam_knowledge_documents, exam_doc_versions, exam_sources, exam_claims, exam_posts, exam_announcements, exam_cycles, exams, admin_audit_logs | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_find_or_create_battle_room(p_topic_id uuid, p_is_private boolean)` | svc | `public, pg_temp` | app 1 | user_battle_stats, quiz_battle_participants, quiz_battle_rooms | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_import_question_drafts(p_batch jsonb, p_actor uuid)` | svc | `public, pg_temp` | app 1 | question_import_batches, questions, question_versions, question_version_authoring, question_options, question_answers, exam_question_mappings, question_sources | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_publish_question_version(p_version_id uuid, p_actor uuid)` | svc | `public, pg_temp` | app 1; fn: fn_qf_enforce_question_version_integrity, fn_qf_guard_question_publication | question_versions, questions | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_qf_find_exact_duplicates(p_topic_id uuid, p_stems text[], p_exclude_question_id uuid)` | svc | `public, pg_temp` | app 1 | — | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_record_qualifying_streak_activity(p_user_id uuid, p_action_type text, p_source_id uuid, p_duration_seconds integer, p_timezone text)` | svc | `''` | app 1 | streak_activity_logs, user_streaks, coin_wallets | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_transition_question_version(p_version_id uuid, p_to text, p_actor uuid, p_notes text, p_checklist jsonb)` | svc | `public, pg_temp` | app 1 | question_versions, question_version_authoring, questions | yes in principle (service_role holds every needed grant; no non-public schema) |
| `fn_update_question_draft(p_version_id uuid, p_actor uuid, p_payload jsonb)` | svc | `public, pg_temp` | app 1 | question_versions, question_version_authoring, question_options, question_answers | yes in principle (service_role holds every needed grant; no non-public schema) |

### B. Internal: service-role / owner-only, no app caller (16)

| Function | Grants | search_path | Callers | Writes | Note |
|---|---|---|---|---|---|
| `fn_claim_reward_item(p_user_id uuid, p_reward_id uuid, p_idempotency_key text, p_shipping_name text, p_shipping_phone text, p_shipping_address text, p_shipping_city text, p_shipping_state text, p_shipping_pincode text)` | svc | `''` | — | reward_catalog, coin_ledger, coin_wallets, reward_claims | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_log_user_search(p_query text, p_result_count integer, p_latency_ms integer, p_is_zero_result boolean, p_clicked_entity_type text, p_clicked_source_id uuid)` | svc | `public, pg_temp` | — | user_search_history, search_query_logs | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_process_payment_webhook(p_gateway text, p_gateway_event_id text, p_event_type text, p_payload jsonb, p_signature_verified boolean)` | svc | `public, pg_temp` | — | payment_webhook_events | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_publish_exam_announcement(p_exam_id uuid, p_exam_cycle_id uuid, p_announcement_type text, p_title text, p_summary text, p_source_url text, p_priority text)` | svc | `public, pg_temp` | — | exam_announcements | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_qf_assert_item_shape(p_item jsonb, p_label text)` | svc | `public, pg_temp` | fn: fn_import_question_drafts, fn_update_question_draft, fn_create_question_revision | — | helper of DEFINER callers → INVOKER candidate (runs as owner via its callers) |
| `fn_question_stem_checksum(p_stem text)` | svc | `public, pg_temp` | fn: fn_qf_find_exact_duplicates, fn_import_question_drafts, fn_update_question_draft, fn_create_question_revision | — | helper of DEFINER callers → INVOKER candidate (runs as owner via its callers) |
| `fn_recompute_mistake_profile(p_user_id uuid, p_question_id uuid)` | svc | `public, pg_temp` | fn: fn_revoke_mistakes_by_errata | user_mistake_vault | helper of DEFINER callers → INVOKER candidate (runs as owner via its callers) |
| `fn_record_mistake_occurrence(p_user_id uuid, p_question_id uuid, p_source_context text, p_source_reference_id uuid, p_selected_option_id uuid, p_response_time_seconds integer, p_cognitive_type_id text, p_confidence_pct integer, p_question_version_id uuid, p_attempt_answer_id uuid)` | svc | `public, pg_temp` | — | user_mistake_vault, user_mistake_occurrences | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_resolve_errata_report(p_report_id uuid, p_resolution_status text, p_resolution_notes text, p_bounty_coins integer)` | svc | `public, pg_temp` | — | question_errata_reports | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_reverse_reward_claim(p_claim_id uuid, p_admin_id uuid, p_reason text)` | svc | `''` | — | coin_ledger, coin_wallets, reward_catalog, reward_claims | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_revoke_mistakes_by_errata(p_question_version_id uuid, p_corrected_option_id uuid, p_reason text, p_actor_id uuid)` | svc | `public, pg_temp` | — | user_mistake_occurrences | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_send_user_notification(p_user_id uuid, p_template_code text, p_title text, p_body text, p_action_url text, p_category text, p_priority text, p_idempotency_key text, p_metadata jsonb, p_variables jsonb)` | svc | `public, pg_temp` | fn: fn_verify_and_fulfill_payment, fn_publish_exam_announcement | user_notifications | helper of DEFINER callers → INVOKER candidate (runs as owner via its callers) |
| `fn_universal_search(p_query text, p_entity_types text[], p_exam_id uuid, p_topic_id uuid, p_access_tier text, p_limit integer, p_offset integer)` | svc | `public, pg_temp` | — | — | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_update_spaced_repetition_review(p_user_id uuid, p_question_id uuid, p_topic_id uuid, p_quality integer)` | svc | `public, pg_temp` | — | spaced_repetition_schedules | no caller found in app / functions / triggers → dead surface or ops-only |
| `fn_verify_and_fulfill_payment(p_order_id uuid, p_gateway_payment_id text, p_gateway_signature text, p_payment_method text, p_amount numeric, p_billing_name text, p_billing_address text, p_billing_state text)` | svc | `public, pg_temp` | — | payment_transactions, payment_orders, coupon_redemptions, discount_coupons, user_entitlements, billing_invoices | no caller found in app / functions / triggers → dead surface or ops-only |
| `rls_auto_enable()` | svc | `pg_catalog` | — | — | no caller found in app / functions / triggers → dead surface or ops-only |

### C. Granted to a client role, no app caller (14)

| Function | Grants | Own caller check | Writes | Note |
|---|---|---|---|---|
| `fn_clear_user_search_history()` | auth, svc | uid | user_search_history |  |
| `fn_complete_diagnostic_assessment(p_attempt_id uuid)` | auth, svc | uid | user_diagnostic_results |  |
| `fn_create_custom_flashcard_deck(p_title text, p_description text, p_topic_id uuid, p_cards jsonb)` | auth, svc | uid | flashcard_decks, flashcards |  |
| `fn_edit_discussion_message(p_message_id uuid, p_content_markdown text)` | auth, svc | uid+jwt | discussion_messages |  |
| `fn_generate_custom_practice_session(p_title text, p_session_mode text, p_topic_ids uuid[], p_question_count integer, p_manual_question_ids uuid[])` | auth, svc | uid | custom_practice_sessions | PRACTICE-RPC-DRIFT: WEAK_TOPICS / FORGOTTEN_TOPICS 42703; NULL topics → NOT NULL violation |
| `fn_generate_daily_recommendations(p_user_id uuid, p_date date, p_engine_version text)` | auth, svc | uid | — |  |
| `fn_get_due_flashcards(p_deck_id uuid, p_limit integer)` | auth, svc | uid+jwt | — |  |
| `fn_mark_notification_as_read(p_notification_id uuid)` | auth, svc | uid | user_notifications |  |
| `fn_moderate_flagged_content(p_flag_id uuid, p_resolution_action text, p_moderator_note text)` | auth, svc | uid+jwt | discussion_moderation_flags, discussion_messages, discussion_threads |  |
| `fn_override_mistake_cognitive_type(p_vault_id uuid, p_user_override_type_id text)` | auth, svc | uid | user_mistake_vault |  |
| `fn_reconcile_search_indexes()` | auth, svc | jwt | search_indexes | admin maintenance (service_role / staff JWT check); granted to authenticated |
| `fn_start_custom_practice_session(p_session_id uuid)` | auth, svc | uid | test_attempts, custom_practice_sessions | companion of the practice RPC (starts a READY session); no app caller |
| `fn_update_daily_recommendation_status(p_recommendation_id uuid, p_status text)` | auth, svc | uid | daily_study_recommendations |  |
| `fn_verify_faculty_answer(p_message_id uuid, p_is_verified boolean)` | auth, svc | uid+jwt | discussion_messages, discussion_threads |  |

### D. Unpinned search_path or callable with anon / PUBLIC EXECUTE outside the allow-list (0)

None (P-9 holds). Hygiene only: the 7 trigger functions with anon / PUBLIC EXECUTE are listed under B (not callable).

## 4. PRACTICE-RPC-DRIFT: revoke vs fix

**`fn_generate_custom_practice_session`** (granted to authenticated + service_role) and its companion **`fn_start_custom_practice_session`** (same grants).

| Evidence | Finding |
|---|---|
| App callers | **none**: `app/practice/page.tsx` is a static page (no RPC, no form), and no service references either function |
| Scripts | only gates use them: `test_qf1_db` SEL-1 and `test_qb_key1` K-14, as probes of the "drafts / invalid keys never served" predicate |
| Broken modes | WEAK_TOPICS (`confidence_level`) and FORGOTTEN_TOPICS (`last_evaluated_at`) fail with 42703. Identical with 087 rolled back, so the drift dates from schema changes after phase 3g |
| Input bug | `p_topic_ids = NULL` (the default) violates NOT NULL on `custom_practice_sessions.target_topic_ids_json` |
| Working modes | MANUAL_SELECTION, BOOKMARKED, WRONG_QUESTIONS and PYQ run (often "No qualifying questions"); they serve only valid-key published questions (087) |
| Writes | `custom_practice_sessions` rows for the caller (auth.uid()) |

**Recommendation: revoke** EXECUTE from `authenticated` on both functions; keep `service_role` and the functions themselves.
- Nothing in the product calls them, and 2 of 6 modes plus the default argument are broken.
- Fixing them would mean designing practice behaviour, which is a product phase, not a security fix.
- When a practice phase owns the feature, it re-grants after fixing the drift, with its own tests.
- The two gates that use the RPC as a predicate probe (SEL-1, K-14) run as `authenticated`. They would switch to `SET LOCAL ROLE service_role` plus JWT claims, or call the predicate's other consumers. That is part of batch S2-2.

## 5. Stage 2 proposal (not built)

Smallest safe batches, ordered by risk reduction. **Each batch:**
- one migration, plus an exact rollback that restores the definitions / ACLs byte-exactly;
- the resilient backup, then a runner dry-run, then apply via the ledger;
- `db:types` where signatures change (none of these change signatures);
- the named behaviour proofs (rolled back, as qa-student / qa-staff / service_role), P-9, QF-1 SEC-DB and K-14 re-run;
- the amended gates listed per batch.

| Batch | Scope | Change | Behaviour proof required | Rollback |
|---|---|---|---|---|
| **S2-1** (first) | F-1 `fn_finalize_battle_room` | add a caller check: allowed for service_role, or when `auth.uid()` is a participant of the room (participants table); otherwise `42501`. Body otherwise byte-identical | as a non-participant student → 42501 and no row changes (md5 of the 4 written tables); as a participant after the final round → finalizes as before (same winner / ELO deltas as the current definition on the same fixture); via `fn_submit_battle_round_answer` (the participant's own submit) → still finalizes; CANCELLED room by a non-participant → 42501 | restore the current definition (`CREATE OR REPLACE` keeps the ACL) |
| **S2-2** | F-2 the 14 class-C functions (incl. both practice RPCs) | `REVOKE EXECUTE … FROM authenticated` (anon already has none); keep service_role | static gate: no app caller for any of the 14 (a new permanent check, fails if one gains a caller while ungranted); PostgREST as qa-student → 42501 for each; SEL-1 / K-14 adapted to call as service_role; every other suite unchanged | `GRANT EXECUTE … TO authenticated` |
| **S2-3** | F-4 the 7 trigger functions with anon / PUBLIC EXECUTE | `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` | each trigger still fires and still rejects / sanitises: one rolled-back DML per trigger as the role that normally writes (authenticated or service_role), before vs after identical (errors and resulting rows) | re-grant to the previous ACL (captured `proacl`) |
| **S2-4** | F-5a internal helpers called only by DEFINER callers: `fn_qf_assert_item_shape`, `fn_question_stem_checksum`, `fn_send_user_notification`, `fn_recompute_mistake_profile` | `SECURITY INVOKER` (search_path unchanged) | each caller path re-run (QF-1 DB suite, notifications, mistake recompute); results identical; the helper still refuses a client role (42501) | `SECURITY DEFINER` |
| **S2-5** | F-5b service-role RPCs with an app caller (13) | `SECURITY INVOKER`, in sub-batches by domain (QF admin 5, exams / mocks 3, gamification / streaks 2, battles 1, premium 1, duplicates 1) | each RPC as service_role: same result and same row changes as DEFINER on a fixture (before / after md5); QF-1 / K / admin-pages / journey gates; confirm none relies on the owner bypassing a trigger guard (the QF lifecycle flag is a GUC, not an owner check) | `SECURITY DEFINER` |
| **S2-6** | F-5c service-role / owner-only with no caller (12: payment webhook, verify-and-fulfil, reward claim / reverse, search log / universal search, announcements, errata resolve / revoke, spaced repetition, mistake occurrence, `rls_auto_enable`) | **ruling first**: keep as ops / future entrypoints (then INVOKER as S2-5), or revoke service_role too (dead) | per ruling | per ruling |
| **S2-7** | F-6 the 5 read-only triggers with no RLS reads (`fn_enforce_errata_state_machine`, `fn_enforce_practice_session_lifecycle`, `fn_protect_user_notification_fields`, `fn_validate_payment_order_transition`, `fn_qf_enforce_question_version_integrity`) | `SECURITY INVOKER` | each trigger's accept / reject matrix as authenticated and as service_role identical before / after (rolled back) | `SECURITY DEFINER` |
| **S2-8** | F-3 predicates (optional, lowest risk) | add `p_user_id = auth.uid() OR` staff / service_role guard, returning false otherwise | every policy using them (15) behaves identically for owner / other / staff (RLS suite P-*, SEC-HOTFIX-7 probes); DEFINER callers pass `auth.uid()` (verify each call site) | restore the definitions |

**Kept as DEFINER with a recorded reason** (no batch):
- the 8 triggers that read RLS-protected tables to validate integrity;
- `fn_project_canonical_taxonomy_node`, which writes projection tables the writer has no grants on;
- `fn_qf_version_publishable_trg` (ruled).

**A gate to add with S2-1:** a #54 ratchet, extending P-9.
- The number of SECURITY DEFINER functions with no client EXECUTE may only fall.
- A new DEFINER function without client EXECUTE needs an allow-list entry with a one-line justification.
- A client-executable DEFINER function must contain a caller check, or carry an allow-list reason (public read model, RLS predicate).

## 6. Not done (by design)

- No migration, no grant or revoke, no function executed. F-1 was found by reading the body, not by calling it.
- Nothing about the feature flags was changed.

SECDEF-AUDIT Stage 1 status: COMPLETE-AWAITING-DECISION
