# ACTIVITY-INSERT-SWEEP: function INSERTs that cannot succeed (read-only)

- **Date:** 2026-10-25.
- **Scope:** all 62 public functions whose source contains an INSERT.

## Method

Every `INSERT INTO public.<table> (<columns>) VALUES (…) | SELECT …` was checked against the live schema:
- NOT NULL columns without a default (not generated, not identity) that the column list omits;
- generated columns that the list writes;
- columns that don't exist;
- string literals written to a column that has a `CHECK (col = ANY (ARRAY[…]))` list.

## Limits

The sweep does not cover:
- an INSERT without a column list, or one built with dynamic SQL;
- CHECK constraints other than enum lists;
- UPDATE statements.

None of those was found writing `learning_activity_events`.

## Findings

| Function | Client can run it | Table | Violation | Effect today | Fix |
|---|---|---|---|---|---|
| `fn_post_discussion_message` | yes | learning_activity_events | omitted `topic_id` / `resource_slug`; `COMMUNITY_DOUBT_ANSWERED` not in CHECK | every reply failed | **fixed by 101** (applied) |
| `fn_submit_flashcard_review` | yes | learning_activity_events | omits `resource_slug` (NOT NULL); `FLASHCARD_CARD_REVIEWED` not in the `event_type` CHECK; `topic_id` may be NULL | every review failed (23502 / 23514) | **107 applied** (COINS-OFF-1: reward insert removed) |
| `fn_complete_deck_review_session` | yes | learning_activity_events | the same: omits `resource_slug`; `FLASHCARD_DECK_COMPLETED` not in CHECK | every deck completion failed | **108 applied** (COINS-OFF-1: reward insert removed) |
| `fn_start_custom_practice_session` | no (service role) | test_attempts | omits `mock_test_id` (NOT NULL) | starting a custom practice session always fails. No app caller today (the table is unused; 100 revoked client writes). | none: redesign on the practice engine (architect). Client EXECUTE already revoked (090). Backlog CUSTOM-PRACTICE-1. |
| `fn_verify_and_fulfill_payment` | no (service role) | user_entitlements (2 inserts) | writes `status`, `valid_from`, `valid_until`, which don't exist (the table has `starts_at` / `expires_at` / `is_active`); `entitlement_type 'SUBSCRIPTION'` not in CHECK | every fulfil fails (42703) | none: PAY-FULFIL-1 is rebuilt in F9 (architect: do not fix before). Fail-closed via 106. |

All other INSERTs in the 62 functions match the live schema.

## Migrations 107 and 108 (applied 2026-10-25, revised by COINS-OFF-1)

Both are generated from the live definitions. Each fixes the activity insert with the 101 pattern and **removes the coin-reward insert** ("coin rewards: re-enable in F10 via the coin ledger").

**Before applying (chunked smoke, rolled back):**
- 107: 8/8, including zero new REWARDED rows and the 102 / 105 gates still denying.
- 108: 5/5.

**After applying (live verify):**
- 107: 7/7.
- 108: 5/5.
