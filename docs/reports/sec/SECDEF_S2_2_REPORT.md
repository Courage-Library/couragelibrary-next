# SECDEF-S2-2: revoke unused client access to SECURITY DEFINER functions

**Phase brief:** architect, 2026-10-20. It implements the SECDEF-AUDIT Stage 1 rulings. Functions and grants only: no DROP, no function body change, no table or policy change. Deferred to later phases: F-3 (predicate helpers) and F-5 (DEFINER → INVOKER conversions).

**Migration:** `supabase/migrations/20261020000090_secdef_s2_2_revoke_unused_client_execute.sql`, APPLIED through the ledger.
**Rollback:** `docs/database/rollback/090_rollback.sql`.

This report is public-safe: function names and ACLs before and after only. The findings it addresses are **fixed** by this phase.

## 1. Forensics (read-only, before any change)

### 1.1 Exact list

Re-derived from the live catalogue and `scripts/secdef/allowlist.json`. Every live ACL matched the audited state: **0 drift**.

| Group | Count | Functions |
|---|---|---|
| C-class: granted to `authenticated`, no app caller. Includes the 2 practice RPCs (ruling 1) | 14 | `fn_generate_custom_practice_session`, `fn_start_custom_practice_session`, `fn_clear_user_search_history`, `fn_complete_diagnostic_assessment`, `fn_create_custom_flashcard_deck`, `fn_edit_discussion_message`, `fn_generate_daily_recommendations`, `fn_get_due_flashcards`, `fn_mark_notification_as_read`, `fn_moderate_flagged_content`, `fn_override_mistake_cognitive_type`, `fn_reconcile_search_indexes`, `fn_update_daily_recommendation_status`, `fn_verify_faculty_answer` |
| No-caller service functions (ruling 2) | 12 | `fn_claim_reward_item`, `fn_log_user_search`, `fn_process_payment_webhook`, `fn_publish_exam_announcement`, `fn_record_mistake_occurrence`, `fn_resolve_errata_report`, `fn_reverse_reward_claim`, `fn_revoke_mistakes_by_errata`, `fn_universal_search`, `fn_update_spaced_repetition_review`, `fn_verify_and_fulfill_payment`, `rls_auto_enable` |
| Trigger functions carrying PUBLIC EXECUTE (ruling 3) | 7 | `fn_enforce_errata_state_machine`, `fn_enforce_practice_session_lifecycle`, `fn_protect_user_notification_fields`, `fn_sanitize_attempt_answer`, `fn_validate_bookmark_folder_ownership`, `fn_validate_exam_announcement_cycle`, `fn_validate_payment_order_transition` |

### 1.2 "No caller" proof for every one of the 33

| Where | Result |
|---|---|
| `app/`, `lib/`, `services/`, `components/`, `config/`, `hooks/`, `middleware.ts` | **0 references** (`types/database.ts` is generated type declarations, not a caller) |
| `supabase/functions/` (edge functions) | none exist |
| RLS policies (`pg_policies` qual / with check) | 0 |
| Views and materialised views | 0 |
| Other functions' bodies (all schemas) | 0 |
| Column defaults, check constraints | 0 |
| Cron jobs | `pg_cron` not installed |
| Triggers | each of the 7 trigger functions drives exactly 1 trigger (expected) |
| Event triggers | `rls_auto_enable` drives `ensure_rls`. It has no client grant, so it is unchanged |
| Grants to Supabase internal roles | none explicit. The 7 trigger functions reached them only through PUBLIC |
| Gate scripts | see §3.2 |

**Excluded for having a runtime caller: none.**

### 1.3 ACLs before 090

| Group | ACL |
|---|---|
| C (14) | `{postgres=X, authenticated=X, service_role=X}` |
| No-caller (12) | `{postgres=X, service_role=X}`: already no client EXECUTE |
| Triggers (6) | NULL, the implicit default: PUBLIC (hence anon / authenticated / internal roles) and the owner |
| Trigger (1): `fn_sanitize_attempt_answer` | `{=X (PUBLIC), postgres=X, service_role=X, authenticated=X}` |

### 1.4 Why the triggers lose anon / authenticated too

Ruling 3 says "revoke PUBLIC". On the explicit-ACL trigger, `authenticated` also held a direct grant, and the brief's postcondition requires "no anon / authenticated / PUBLIC EXECUTE". So all three are revoked.
- **Safe:** Postgres does not check EXECUTE when a trigger fires. S-5 proves this on all 7 tables.
- **`service_role` kept:** on the 6 NULL-ACL triggers it held EXECUTE only through PUBLIC, so 090 grants it explicitly. Its effective access is unchanged; nothing is widened.

### 1.5 Incident during the build (dev DB, no data lost)

**What happened.** The first pre-migration run of the new gate made **real PostgREST calls as qa-student** to the 14 C-class functions with NULL arguments. Before 090 they were still callable, and a PostgREST call is committed.

**Effect on the dev DB** (checked read-only against the pre-089 backup, 2026-10-18):

| Function | Effect |
|---|---|
| `fn_reconcile_search_indexes` | re-indexed the 1 published learning document. Only `indexed_at` changed; the content is identical. It is the same deterministic reconcile maintenance performs. |
| `fn_clear_user_search_history` | `user_search_history` was empty in both backups; nothing deleted |
| All others | returned early on NULL guards or errored; no rows written (13 write-target tables checked: no new or updated rows) |
| Side effects outside the transaction | none: no HTTP / NOTIFY / dblink in any body, no such extension installed |

**Fix (permanent).** The gate's PostgREST probes now run **only when the catalogue shows no client EXECUTE** (S-1). Otherwise they refuse with "not probed". Every other execution in the gate is inside a rolled-back transaction.

## 2. Migration 090

**Preconditions (abort on drift):**
- every target's ACL equals the audited value above;
- an md5 over the ACLs of all **other** `public` functions (137) equals the captured snapshot.

**Body:**
- 33 × `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`;
- 7 × `GRANT EXECUTE … TO service_role` on the triggers.

**Postconditions:**
- no anon / authenticated EXECUTE (directly or through PUBLIC) on any target;
- the ACL is exactly `{postgres, service_role}`;
- the non-target ACL hash is unchanged.

**ACLs after 090:**

| Group | Before | After |
|---|---|---|
| C (14) | postgres, authenticated, service_role | postgres, service_role |
| No-caller (12) | postgres, service_role | unchanged |
| Triggers (6) | NULL (PUBLIC + owner) | postgres, service_role |
| `fn_sanitize_attempt_answer` | PUBLIC, postgres, service_role, authenticated | postgres, service_role |

**Discipline:**
- resilient backup `pre-090-secdef-s2-2-…-resilient` (156 tables, manifest verified 100%);
- round-trip dry run in one rolled-back transaction: 090 → 25 callable targets × anon / authenticated → 42501 → rollback 090 → every one of the 170 `public` function ACLs restored;
- runner `--dry-run` OK;
- applied with the ledger row;
- `db:types:check`: unchanged.

**Rollback 090:**
- generated from the live ACLs; it re-grants each original ACL item in the original order, so restore is byte-exact text;
- the 6 NULL ACLs cannot be recreated by GRANT / REVOKE, so they come back as the identical explicit default (same text as `acldefault`, same privileges);
- the rollback self-checks every restored ACL and the non-target hash.

## 3. Tests

### 3.1 New gate: `scripts/test_secdef_s2_2.cjs`, 8/8

| Check | Result |
|---|---|
| S-0 coverage | 33 targets, 25 callable, 7 trigger, 1 event trigger |
| S-1 catalogue | all 33 are exactly owner + `service_role`; no anon / authenticated / PUBLIC |
| S-2b SQL probes (rolled back) | all 25 callable targets × anon and authenticated (qa-student claims) → 42501 |
| S-2 PostgREST as anon | 24 × 401 / 42501 |
| S-3 PostgREST as authenticated (qa-student) | 24 × 403 / 42501 |
| S-4 `service_role` (rolled back) | all 25 still pass the permission check (bodies rolled back) |
| S-5 triggers | on each of the 7 tables, one rolled-back DML with EXECUTE revoked **even from the owner** (postgres is not a superuser) hits that trigger's own exception: triggers still fire with no EXECUTE grant at all |
| S-6 allow-list | records `client: []` for all 33 |

S-2 and S-3 pass only 24 via PostgREST because PostgREST never resolves `fn_get_due_flashcards` (404 PGRST202 for both roles). It is accepted only because S-2b proves it denied at SQL level, and the gate names it.

**Non-vacuity:** run before 090, S-1, S-2b, S-2, S-3 and S-6 FAILED (with S-2 / S-3 refusing to probe), while S-4 and S-5 passed.

### 3.2 Gate updates: they encoded the grant this phase removes

All updates are narrowed, never widened.

| Suite | Check | Change |
|---|---|---|
| `test_qb_key1` | K-7 | the pinned ACL of `fn_generate_custom_practice_session` is now `{postgres, service_role}` |
| `test_qb_key1` | K-10, K-14 | assert **qa-student → 42501** on the practice RPC; the unchanged selection checks (only valid-key questions, fixtures never served, pre-existing 42703 modes) now run as `service_role` with qa-student's claims (`auth.uid()` from the claims, so the same code path), rolled back |
| `test_qf1_db` | SEL-1 | asserts **authenticated → 42501**; the draft-exclusion checks run as `service_role` with the same claims |
| `test_gap2_2b_retirement` | D-06 | pinned ACLs of `fn_reconcile_search_indexes` and `fn_generate_daily_recommendations` are now `{postgres, service_role}` |

### 3.3 #54 ratchet (`scripts/test_secdef_ratchet.cjs`): counts went DOWN

| Count | Before | After |
|---|---|---|
| total DEFINER | 95 | 95 |
| client-executable callable | 51 | **37** |
| anon-or-PUBLIC | 8 | **1** (the reviewed `public_ok` read model) |
| A | 37 | 37 |
| C (with client EXECUTE) | 14 | **0** |
| B-trigger | 15 | 15 |
| B-service | 29 | 29 |

`allowlist.json` max values were lowered to match (6/6 pass).

## 4. Gates

**DB and offline**

| Gate | Result |
|---|---|
| SECDEF-S2-2 (new) | 8/8 |
| #54 SECDEF ratchet | 6/6 (counts down, §3.3) |
| RLS P-1…P-9 (`test_sec_hotfix4_rls`) | 9/9 |
| QF-1 DB | 15/15 (attempt 2; attempt 1 IMP-3 AggregateError on its second connection, the known network flake) |
| QB-KEY-1 (K suite) | 13/13 (K-14 practice-mode VACUOUS warnings as before: qa-student data) |
| `test_auth1` offline | 32/32 |
| SEC-1A | 19/20 (S1-7 pre-existing) |
| SEC-1B | 26/26 |
| SEC-1C | 22/22 |
| SEC-1D | 14/14 |
| TYPES-1 | 9/9 |
| TYPES-1 close | 3/3 (attempt 2; attempt 1 select audit killed by its timeout while the build ran) |
| No runtime DB | 5/5 |
| QA identity guard | 8/8 |
| Design ratchet | 8/8 |
| UX-1b shell | 7/7 |
| no-personal-data | OK, 1402 files |
| `db:types:check` | unchanged |
| tsc | 0 |
| lint | 0 errors, 230 warnings (= baseline) |
| build | OK |

**Live (`with-server`, port 3300, §4.1)**

| Gate | Attempt 1 | Attempt 2 | Attempt 3 |
|---|---|---|---|
| `test_auth1 --resilience=refuse` / `hang` | **8/8 / 8/8** | — | — |
| cleanup → **E2E journey** → **lineage** | cleanup: network (connect timeout); journey and lineage cascaded | journey: sign-in `AuthRetryableFetchError` (auth timeout); lineage cascaded | same as attempt 2 |
| DRILL-1 / `student-drill` | **11/11 / 4/4** | cascaded (no vault) | cascaded |
| fixture → student-mistake smoke | **PASS / PASS** | **PASS / PASS** | fixture PASS; smoke: mistake detail did not render (auth aborts in the server log) |
| Smokes: student-pages, admin-pages, staff-content | **PASS ×3** | — | — |

Every failing attempt's server log shows `fetch failed` / connect timeout / `AuthRetryableFetchError` aborts, so all are network-caused. **The E2E journey and lineage have no pass in 3 attempts.** Under the live-gates rule that was BLOCKED; it is now superseded by exception E-1 (§7): CLOSED-PENDING-CI, with these three gates required on the first CI run.

### 4.1 Environment findings during the live runs

- **Port collision.** Another project on this machine (`D:\Project\Oryza`, a separate session) runs its own `next start -p 3100` plus Lighthouse / CLS scripts against `localhost:3100`.
  - While it ran, our server on 3100 never passed readiness and was terminated from outside JavaScript: exit code 4294967295, and the new forensics preload recorded no exit stack.
  - This is very likely the cause of the unexplained server exits recorded in AUTH-1 Stage 2a.
  - The live gates were moved to **port 3300** (`--port=3300`, explicit base URLs).
  - The other project's processes were not touched.
- **Resource pressure and network.** Free memory fell to about 0.8–1.3 GB with that project's 14 node processes running. `net-probe` was 90–100%. Under these conditions the 5 s auth timeout (#61) aborts slow sign-ins as designed, and the journey's sign-in failed that way in attempts 2 and 3.

## 5. Not changed / follow-ups

- **PRACTICE-RPC-DRIFT** stays in the backlog (fix or retire). Both practice RPCs remain for `service_role` only.
- **F-3** (RLS predicate helpers taking an arbitrary user id) and **F-5** (29 INVOKER-feasible service functions): later phases, as ruled.
- **`test_gap2_2b_retirement` D-06 / D-12:** pre-existing failures, proven identical on `02bc441` (worktree run).
  - D-06 pins a PUBLIC grant on `fn_create_batch_assignment` that SEC-HOTFIX-7 (083) revoked.
  - D-12: `073_rollback` cannot drop schema `retired` (later objects depend on it).
  - Both are stale assertions for a test-hygiene follow-up. Not changed here.

## 6. Runner and process changes (architect ruling, 2026-10-20)

- **Port 3300** for live gates, with explicit base URLs (`docs/testing/LIVE_GATES.md`).
- **`scripts/live/with-server.cjs` refuses to start** when the port is bound, or when a foreign `next start` / `next-server`, a Lighthouse / audit script, or a process targeting the chosen port is running outside this repository.
  - It reports kind + pid only and never touches them.
  - Detector: `scripts/live/_foreign.cjs`; tested by CI support C-11 (11/11).
- **New permanent rule** (`PERMANENT_GATES.md`): a new gate's first run must be proven non-writing before any committed client call.
- **Precheck before each attempt:** port 3300 free, no foreign process, no orphan DB sessions, `net-probe --n=3` at 100%, free memory ≥ 2 GB.
  - After the owner's restart, two prechecks were **NO-GO**: free memory 814 / 507 MB with Edge WebView2 / Claude / Chrome running; net-probe 85.7% on the second.
  - No further local attempt was run (ruling: the floor is not lowered).

## 7. Exception E-1 (architect ruling, 2026-10-20): commit pending the first CI run

E-1 applies only if (a)–(d) all hold. Each was verified on 2026-10-20 before the commit:

**(a) Zero runtime app code. TRUE.**
- The diff touches only `docs/`, `scripts/` and `supabase/migrations/`. A path check for `app/`, `lib/`, `services/`, `components/`, `middleware*`, `next.config*` and `package*.json` found 0 files.
- `git diff --stat` (tracked) shows 8 files, 156+ / 132−:

  | File | Lines |
  |---|---|
  | `docs/testing/LIVE_GATES.md` | 19 |
  | `docs/testing/PERMANENT_GATES.md` | 5+ |
  | `scripts/ci/test_ci_scripts.cjs` | 20 |
  | `scripts/live/with-server.cjs` | 10 |
  | `scripts/secdef/allowlist.json` | 172 |
  | `scripts/test_gap2_2b_retirement.cjs` | 5 |
  | `scripts/test_qb_key1.cjs` | 41 |
  | `scripts/test_qf1_db.cjs` | 16 |

- New files: the 090 migration + rollback, `scripts/test_secdef_s2_2.cjs`, `scripts/live/_foreign.cjs`, this report.

**(b) 090 applied and verified. TRUE.**
- Ledger 090: APPLIED.
- `test_secdef_s2_2` **8/8** (re-run on the final state; attempt 1 lost its DB connection mid-run, attempt 2 8/8).
- `test_secdef_ratchet` **6/6** (client-callable 37/37, anon-or-PUBLIC 1/1, C 0/0).

**(c) Every gate exercising the changed objects passed on the final state (090 applied). TRUE.**

| Gate | Result |
|---|---|
| SECDEF-S2-2 | 8/8 |
| #54 ratchet | 6/6 |
| RLS P-1…P-9 | 9/9 |
| QF-1 DB | 15/15 |
| K suite (QB-KEY-1) | 13/13 |
| DRILL-1 | 11/11 |
| `student-drill` | 4/4 |
| Signed-in smokes: student-mistake, student-pages, admin-pages, staff-content | all passed (port 3300, attempt 1) |
| `test_auth1` offline | 32/32 |
| `test_auth1 --resilience` refuse / hang | 8/8 / 8/8 |

No test script changed after these passes. Only the runner's foreign-process precheck changed; it does not touch the changed objects.

**(d) Journey, lineage and the student-mistake smoke failed only with network errors. TRUE.**

| Attempt | Journey | Server log |
|---|---|---|
| 1 | `locator.waitFor: Timeout 240000ms`: the preceding cleanup failed with `fetch failed` / `UND_ERR_CONNECT_TIMEOUT`, so the old fixture stayed and the mock offered no new attempt; lineage then checked the fixture's 2 rows | — |
| 2 | `page.waitForURL: Timeout 180000ms` | `[auth] sign-in failed { code: null, status: 0, name: 'AuthRetryableFetchError' }` ×2, `AbortError` ×6 (auth requests aborted by the 5 s auth timeout); lineage cascaded |
| 3 | same | `AuthRetryableFetchError` ×1, `AbortError` ×6 |

- The student-mistake smoke **passed** in attempts 1 and 2 on the 090 state, and failed in attempt 3 only (mistake detail not rendered during the auth aborts).
- All three server logs were scanned for non-network error lines: **none**.

**(e) Status: CLOSED-PENDING-CI.**
- The commit message records "Exception E-1: journey/lineage/student-mistake pending first CI run".
- `PERMANENT_GATES.md` records: E-1 open — first CI run must pass E2E journey, lineage, student-mistake smoke before any DB-writing phase.

**State:** 090 APPLIED (rollback ready and round-trip proven). The student-mistake fixture is in place.

SECDEF-S2-2 status: CLOSED-PENDING-CI
