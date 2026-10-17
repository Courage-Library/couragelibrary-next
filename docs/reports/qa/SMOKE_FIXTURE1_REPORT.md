# SMOKE-FIXTURE-1 — self-sufficient student-mistake smoke

Phase brief (architect, 2026-10-17). The owner's production smokes gave:
- admin-pages 15/15;
- staff-content 3/3;
- **student-mistake FAILED**: "/mistakes lists at least one mistake — 0 links" and "mock result link present on /mock-tests — none found".

Hypothesis to prove or disprove: not a regression. qa-student has no completed attempt or mistakes because cleanup-student removed the journey rows.

Baseline commit: `078ce6f`. Scripts and docs only; no app code, no migration.

## 1. Hypothesis — proven

Read-only (verified TLS, counts only), qa-student before this phase:

| Item | Count |
|---|---|
| test_attempts (any status) | **0** |
| test_results | **0** |
| wrong attempt_answers | **0** |
| user_mistake_vault (all / open) | **0 / 0** |
| user_mistake_drills | **0** |

**Cause:** the regression batches of DRILL-1 / UX-2a ran `cleanup-student` with `E2E_KEEP_USER=1`. That correctly keeps the identity but deletes all of its journey data, so no attempt, result or vault row remained. A production smoke run after that has nothing to list.

**Not a regression:** with the fixture present, the same smoke passes 7/7 on the local build (§4).

## 2. `scripts/e2e/ensure-student-fixture.cjs` (new)

- **Idempotent.** It checks (read-only) whether qa-student has a COMPLETED attempt with at least one wrong answer **and** at least one open vault row. If so it prints `FIXTURE PRESENT — nothing to do` and exits 0.
- **Otherwise it completes one mock through the normal app.** A real browser on the **local production build** (run through `scripts/live/with-server.cjs`) signs in as qa-student, opens the mock, clicks "I Agree & Start Test" / "Begin Test", answers **Q1–Q2 wrong and Q3–Q5 right** (deterministic), and submits.
  - It makes **no direct table writes** (decision #42).
  - The answer key is read server-side (read-only) only to choose which option to click, as in `student-journey.cjs`.
- **Mock selection:**
  - published, free, non-dynamic, SSC CGL;
  - contains **none of the 8 CA-4 fixture questions** (QB-KEY-1);
  - every version has a valid key (4 options A–D, key among them);
  - default `ssc-cgl-daily-monday-mock`; `--mock-slug=` overrides.
- **Safety:**
  - only `qa-student@courage-library.test`, signed in with its stored password. It never uses `ensureStudent()`, which would create users or reset passwords for non-permanent e-mails.
  - It refuses a missing identity, a non-localhost base, and an existing in-progress attempt (it never edits rows to clear one).
  - Every wait is bounded, and sign-in has at most 3 attempts.
  - It prints no secrets or hosts.
- **Postcondition** (bounded poll): a completed attempt with at least one wrong answer and at least one open vault row, else exit 1.

## 3. `scripts/e2e/cleanup-student.cjs` — keep-fixture flag

- **New `E2E_KEEP_FIXTURE=1`** (requires `E2E_KEEP_USER=1`, otherwise refused). It keeps the fixture: the student's **latest completed attempt with at least one wrong answer**, its `attempt_answers`, its `test_results` + `section_results`, the `user_mistake_occurrences` of those answers, and the `user_mistake_vault` rows they point to. Everything else is deleted as before.
- **The "nothing left" check** then allows **exactly** those fixture counts per table (any other remaining row → rollback).
- **Default behaviour is unchanged:** without the flag, everything is deleted as before.
- `docs/testing/PERMANENT_GATES.md` (signed-in smoke row): "**Run `ensure-student-fixture` before the student-mistake smoke**", with the runner command and the keep-fixture cleanup command.
- The header of `scripts/smoke/signed-in-smoke.cjs` now points to `ensure-student-fixture` instead of the manual journey.

## 4. Runs (local production build, all through `scripts/live/with-server.cjs`)

| Step | Result |
|---|---|
| `ensure-student-fixture` (fixture missing) | mock `ssc-cgl-daily-monday-mock` (25 questions, CA-4 fixtures 0, invalid keys 0) → signed in → player started → answered 5 (2 wrong, 3 right) → result page → **completed attempt with a wrong answer 1, open vault rows 2** → `FIXTURE CREATED` |
| `signed-in-smoke student-mistake` | **7/7**: signed in; /mistakes 4 links; detail 200; prompt shown (46 chars); options A–D; correct answer marked; mock result renders a score |
| `ensure-student-fixture` again | `FIXTURE PRESENT — nothing to do` (idempotent) |
| `cleanup-student` with `E2E_KEEP_USER=1 E2E_KEEP_FIXTURE=1` | kept attempt 1, answers 5, results 1, occurrences 2, vault 2; deleted coin_ledger 1, coin_wallets 1, gamification_events 1, streak_activity_logs 1, user_streaks 1; check passed |
| `ensure-student-fixture` after that cleanup | `FIXTURE PRESENT` |
| `cleanup-student` with `E2E_KEEP_FIXTURE=1` but no keep-user | **refused** |
| `signed-in-smoke student-mistake` with only the kept fixture | **7/7** |

**The fixture is left in place** for the owner's production smoke.

The server log showed network errors (DEV-NET) during the first run. Both gates still passed and no retry was needed.

## 5. Baselines (only qa-student rows may change)

Read-only before / after: per table the total, qa-student's rows, and an md5 of every row **not** owned by qa-student; content tables in full.

| Table | Total before → after | qa-student before → after | Non-qa-student rows |
|---|---|---|---|
| test_attempts | 32 → 33 | 0 → 1 | identical (md5) |
| test_results | 11 → 12 | 0 → 1 | identical |
| attempt_answers | 219 → 224 | 0 → 5 | identical |
| user_mistake_vault | 20 → 22 | 0 → 2 | identical |
| user_mistake_occurrences | 21 → 23 | 0 → 2 | identical |
| user_mistake_drills | 0 → 0 | 0 → 0 | identical |
| coin_ledger / coin_wallets / gamification_events / user_streaks / streak_activity_logs | +1 each | 0 → 1 each | identical |
| questions / question_versions / question_options / question_answers / mock_tests / mock_questions / mock_templates | unchanged | — | byte-identical (md5) |

**Note:** the keep-fixture cleanup removed qa-student's coin / streak / gamification rows, and the second smoke run recreated one of each. Viewing the dashboard / result writes them lazily through the app. They are qa-student rows only and not part of the fixture.

The totals of other users had grown since earlier phases (normal activity); they are identical before / after this phase.

## 6. Owner to run

1. Re-run the production student-mistake smoke; the fixture now exists in the shared DB:
   ```bash
   node scripts/smoke/signed-in-smoke.cjs student-mistake https://couragelibrary-next.vercel.app
   ```
2. If a later regression batch cleans qa-student, use `E2E_KEEP_FIXTURE=1`, or re-run `ensure-student-fixture` (local, through the runner) before the next production smoke.

## 7. Deviations / notes

- The owner's second failing check, "mock result link present on /mock-tests", is the smoke's result-page step when no attempt exists. Locally the same step passes ("mock result renders a score") with the fixture present.
- `ensure-student-fixture` deliberately does not reuse `student-journey.cjs`. The journey also runs negative probes (a direct insert of a second attempt, an answer-key read as the student) and a reload test, which a fixture step does not need. The fixture script reuses the journey's exact UI interactions (start / answer / submit selectors) and adds none of its own.

SMOKE-FIXTURE-1 status: CLOSED
