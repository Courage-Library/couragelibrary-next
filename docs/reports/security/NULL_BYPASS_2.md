# NULL-BYPASS-2: deny branches that a NULL value can skip

This is a read-only sweep with a report. The fixes are in migration 105, which is held: dry-run OK, chunked rolled-back smoke 10/10, **not applied** without the architect's go.

- **Date:** 2026-10-25.
- **Scope:** all 105 SECURITY DEFINER functions and all 235 RLS policies on the dev database.

## Why NULL matters

In PL/pgSQL, `IF <deny condition> THEN RETURN/RAISE … END IF` does **not** take the deny branch when the condition is NULL. So a deny condition that can evaluate to NULL fails open.

RLS policies are the opposite: they fail closed, because a USING or WITH CHECK result that isn't TRUE denies. None of the 4 policies that contain `NOT` can fail open.

NULL-BYPASS-1 (the `app_metadata` role checks) was fixed by migration 102.

## Method

1. Extract every `IF … THEN` whose branch raises or returns a denial and whose condition uses `NOT`, `!=` or `<>`: 118 branches in 68 functions.
2. Review each operand for nullability against the source and `information_schema.columns`:
   - variables set from `SELECT … INTO`;
   - parameters;
   - nullable columns;
   - JWT claims.

## Findings

| Function | Client can run it | Expression | Can be NULL? | Exploitable | Fix (105) |
|---|---|---|---|---|---|
| `fn_submit_battle_round_answer` | yes | `v_received_at < v_round_started_at` ("round not started") | yes: `quiz_battle_rooms.round_started_at` is nullable (COUNTDOWN) | **yes (proven, rolled back):** an answer is accepted during COUNTDOWN and the latency becomes `GREATEST(0, NULL) = 0`, the best speed score | `v_round_started_at IS NULL OR …` |
| `fn_submit_battle_round_answer` | yes | `p_round_number != v_current_round` | yes (parameter) | no: the later insert hits `round_number NOT NULL` and fails (23502) | `IS DISTINCT FROM` |
| `fn_submit_flashcard_review` | yes | `NOT v_is_curated AND v_author_id != v_user_id AND NOT (staff)` (private deck) | yes: `flashcard_decks.author_id` is nullable | **yes (proven, rolled back):** any student passes the private-deck check of an author-less deck. 0 decks exist today. | `v_author_id IS DISTINCT FROM v_user_id` |
| `fn_submit_flashcard_review` | yes | `p_rating NOT BETWEEN 1 AND 4` | yes (parameter) | low: a NULL rating passes validation | `p_rating IS NULL OR …` |
| `fn_syllabus_publish` | yes (staff only; the role is checked first) | `NOT (v_report->>'ok')::boolean` | only if the validator stops setting `ok` (today it always does) | no (defence in depth) | `IS NOT TRUE` |
| `fn_process_payment_webhook` | no (service role) | `NOT p_signature_verified` | yes, if the caller passes NULL | **not assessed for change: payments hard limit.** A NULL would skip the signature check. | none in 105; needs a separate payments ruling |
| `fn_verify_and_fulfill_payment` | no (service role) | `p_amount IS NOT NULL AND p_amount != v_order.total_payable_amount` | yes, if `total_payable_amount` is NULL | same: payments hard limit | none in 105; needs a separate payments ruling |
| `fn_mark_accepted_answer`, `fn_edit_discussion_message`, `fn_moderate_flagged_content`, `fn_verify_faculty_answer`, batch / evaluation RPCs, `fn_reconcile_search_indexes` | — | role checks | were NULL-prone | fixed by 102 (NULL-BYPASS-1) | — |
| `fn_complete_course_lesson`, `fn_update_lesson_playback_position` | yes | `NOT v_is_entitled` | no (default `false`; set only from `EXISTS`) | no | — |
| `fn_sanitize_attempt_answer` (trigger) | — | `v_attempt_status != 'in_progress'` | no (FK + `status NOT NULL`) | no | — |
| `fn_protect_user_notification_fields` (trigger) | — | `NEW.x != OLD.x` | no (the columns are NOT NULL; `template_id` uses `IS DISTINCT FROM`) | no | — |
| QF triggers (`v_qf_write`) | — | `NOT v_qf_write …` | no (`COALESCE(current_setting(...), '') = 'on'`) | no | — |
| All `NOT FOUND`, `NOT EXISTS`, `IS NOT TRUE` and enum `NOT IN` checks after a FOUND check on NOT NULL columns (about 90 branches) | — | — | no | no | — |

## Migration 105 (held)

- **File:** `supabase/migrations/20261025000105_null_bypass_2.sql`.
- **Rollback:** `docs/database/rollback/105_rollback.sql`.
- **What it changes:** three functions, generated from the live definitions with exact substitutions. Same signatures, SECURITY DEFINER, search_path and grants.
- **Smoke:** chunked, one rolled-back transaction per function.
  - B-1 and B-2 prove the two exploits before the fix.
  - After the fix:
    - author-less private deck: denied;
    - NULL rating: rejected;
    - own deck: still works;
    - answer before the round start: rejected;
    - NULL round: rejected;
    - normal answer in an active round: works;
    - publish: fails closed.
  - Metadata is unchanged.
- **Dry-run:** OK, run alone.
