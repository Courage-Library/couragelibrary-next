# SECDEF-S2-1: `fn_finalize_battle_room` caller check (F-1) + #54 ratchet gate

Phase brief: architect, 2026-10-18 ("PROD-TIMEOUT-1 then SECDEF-S2-1"). Stage 2 rulings recorded:
- **S2-1 now.**
- **Approved for later (SEC-1 track):** revoke the practice RPCs, the 14 C-class and the 12 no-caller functions (REVOKE only); revoke PUBLIC on the 7 trigger functions.
- **Deferred:** F-3, F-5.
- **Approved:** the #54 ratchet gate.

**Status: CLOSED (architect ruling "close PROD-TIMEOUT-1 + SECDEF-S2-1", 2026-10-18).**

QF-1 DB had been network-unresolved. It got error handlers on every DB client (a dropped connection now FAILs cleanly instead of crashing the process) and a **fresh 3-attempt budget**: after the precheck (net-probe 3/3 TLS, 100% overall; no open DB sessions), **attempt 1 passed 15/15**.

With every gate green, SECDEF-S2-1 was committed under the pre-authorised commit, then pushed and deployed. The anonymous production smoke result is in §7.

## 1. Ledger and scope

- **Ledger:** no 089 row. The last entries are 088 / 087 / 086 APPLIED. The rejected QB-KEY-1 089 was never applied or committed, so the number is reused.
- **Battle RPCs granted to `authenticated`, reviewed** (live definitions):

| RPC | Room parameter | Caller check | Verdict |
|---|---|---|---|
| `fn_finalize_battle_room(uuid)` | yes | **none** | **F-1 → fixed in 089** |
| `fn_get_active_battle_round(uuid)` | yes | `auth.uid()` + `fn_is_battle_participant(p_room_id, v_user_id)` | OK |
| `fn_submit_battle_round_answer(uuid,int,uuid)` | yes | `auth.uid()` + participant row check before any write | OK |
| `fn_join_battle_by_code(text)` | code | `auth.uid()`; joining is meant for non-participants | OK by design |
| `fn_find_or_create_battle_room(uuid,boolean,text)` | — | `auth.uid()`; acts for the caller only | OK |
| `fn_is_battle_participant(uuid,uuid)` | yes | predicate (F-3, deferred) | unchanged |

**Only `fn_finalize_battle_room` had the flaw**, so 089 contains that one function.

## 2. Migration 089 (`supabase/migrations/20261018000089_secdef_s2_1_finalize_battle_caller_check.sql`)

- **Generated** from the captured live definition. The body is byte-identical except for one guard inserted right after `BEGIN`:
  ```sql
  IF NOT (
      COALESCE(auth.role(), '') = 'service_role'
      OR EXISTS (SELECT 1 FROM public.quiz_battle_participants bp WHERE bp.room_id = p_room_id AND bp.user_id = auth.uid())
  ) THEN
      RAISE EXCEPTION 'BATTLE_FINALIZE_FORBIDDEN: caller is not a participant of room %', p_room_id USING ERRCODE = '42501';
  END IF;
  ```
- **Precondition:** the live `prosrc` md5 equals the audited one (`089cbc7ae511…`).
- **Postcondition:**
  - still SECURITY DEFINER with `search_path=public, pg_temp`;
  - authenticated and service_role EXECUTE kept (`services/battle.service.ts` and `fn_submit_battle_round_answer` call it);
  - no anon / PUBLIC;
  - the guard is present.
- **Rollback:** `docs/database/rollback/089_rollback.sql`, the audited definition verbatim. `CREATE OR REPLACE` keeps the ACL.
- **Legitimate calls are unaffected:** `fn_submit_battle_round_answer` runs with the submitting participant's JWT, so `auth.uid()` passes the guard.
- **Behaviour change, by design:** a non-participant now gets 42501 even for an already-finalized or missing room (before: `ALREADY_COMPLETED` / "Room not found").

**DB safety sequence:**

| Step | Result |
|---|---|
| Resilient backup `pre-089-2026-10-18T07-17-17-resilient` | **verified 100%**: 156 tables, 3,036 rows, 12 retries; 3 tables (`course_modules`, `learning_units`, `popular_search_terms`) needed their 3rd attempt (within the limit); schema attempt 2; orphans terminated 0 |
| Own dry-run (089 + probe + rollback in one rolled-back transaction) | definition changed, ACL / config unchanged; non-participant probe → 42501; **exact restore true** (functiondef md5 + ACL + config). First try hit `42601` because `pg_get_functiondef` output has no terminating `;`; the generator was fixed |
| Runner dry-run | OK (rolled back) |
| Apply via the ledger | APPLIED + ledger row; backup accepted by the runner |
| `db:types` | OK; no change (no signature change) |

## 3. Tests: `scripts/test_secdef_s2_1.cjs` (rolled back, JWT claims, no account creation)

Fixture: an EXPIRED 1v1 room (3 rounds, 3 published questions) with qa-student and qa-admin as participants; qa-staff is the outsider.

| ID | Result |
|---|---|
| S-1 live body = audited definition + only the guard (byte-for-byte, 8,973 chars); ACL, DEFINER and search_path unchanged | PASS |
| S-2 non-participant (qa-staff) → 42501 `BATTLE_FINALIZE_FORBIDDEN`; room / participants / ELO stats / coins / events unchanged | PASS |
| S-3 participant (qa-student) → **same result and same rows as the audited definition**: both definitions run on the same fixture in savepoints; volatile timestamps and ids excluded | PASS |
| S-4 service role → finalizes (room COMPLETED) | PASS |
| S-5 anon → SQL 42501; PostgREST 401 / 42501 | PASS |
| S-6 already-finalized room: participant → `ALREADY_COMPLETED`, identical to before; non-participant → 42501 | PASS |
| S-7 every battle RPC granted to authenticated is reviewed and keeps its check; an unreviewed new one fails | PASS |
| **Total** | **7/7** (attempt 2; attempt 1 failed on my fixture, `total_rounds` must be 3–20) |

## 4. #54 ratchet gate: `scripts/test_secdef_ratchet.cjs` + `scripts/secdef/allowlist.json`

The allow-list is generated from the audited inventory. It lists every one of the 95 SECURITY DEFINER functions with its class (A / C / B-trigger / B-service), its client grants, its search_path and a one-line reason. Fields:
- `max`: total 95, client-executable callable 51, anon-or-PUBLIC 8, A 37, C 14, B-trigger 15, B-service 29.
- `public_ok`: `fn_exam_syllabus_read_model`.

| Check | Rule |
|---|---|
| SR-0 | minimum coverage (GATE-HYGIENE-1): ≥ 1 function scanned; counts reported |
| SR-1 | no new SECURITY DEFINER function outside the allow-list |
| SR-2 | no new anon / authenticated / PUBLIC EXECUTE beyond the listed grants |
| SR-3 | anon / PUBLIC on a callable function only with `public_ok` (P-9 SECDEF_PUBLIC_OK) |
| SR-4 | search_path pinned **and unchanged from the allow-list**; new functions must use `''` or `public, pg_temp` (#54, reviewed under SR-1) |
| SR-5 | counts may only go down; any count above `max` fails |

Reductions (revokes, drops) pass and print a NOTE, so the baseline can be tightened in the same change.

**Result: 6/6.** Attempt 1 hit SR-4 on `rls_auto_enable()`, which is pinned to `search_path=pg_catalog`. That is pinned and strict, but my first version only accepted the two default values. The ruling's rule is "no function loses its pinned search_path", so SR-4 now compares each function with its recorded value, and `rls_auto_enable()` is recorded as `pg_catalog`. Listed in PERMANENT_GATES beside P-9.

## 5. Regression (local build, all live via `with-server.cjs`)

| Gate | Attempt 1 | Attempt 2 | Attempt 3 | Result |
|---|---|---|---|---|
| SECDEF-S2-1 | 3/7 (fixture bug) | **7/7** | — | PASS |
| #54 ratchet | 5/6 (SR-4, see §4) | **6/6** | — | PASS |
| RLS P-1 … P-9 | 8/9: P-9 connection error | crashed after P-1 (connection) | **9/9** (1 VACUOUS WARN) | PASS |
| **QF-1 DB** | crashed: `Connection terminated unexpectedly` | crashed: same | 14/15: IMP-3 `AggregateError` (network) | network-unresolved in the first budget → **fresh budget (ruling): attempt 1 15/15** with the new error handlers |
| K suite | 11/13: connection errors | **13/13** | — | PASS |
| SEC-1B live / offline | **32/32** / 26/26 | — | — | PASS |
| SEC-1C live / offline | 27/29: middleware ConnectTimeout → 307 (20 network errors in the server log) | **29/29** | — | PASS |
| SEC-1D live / offline | **19/19** / 14/14 | — | — | PASS |
| tsc / lint / build | 0 / 0 / OK | — | — | PASS |

Network during the run: net-probe 90.5% overall success, API TLS p95 up to 3.3 s. Before each retry: no non-idle DB sessions, so **no orphan terminations were needed**.

**QF-1 DB is unrelated to 089:** it touches no battle object, and it was 15/15 in GATE-HYGIENE-1 on 2026-10-18. But the gate rule is one green attempt, and combining results across attempts is not a pass.

**Hardening done (ruling item 2, test-only):** `test_qf1_db.cjs` now attaches an `error` handler to every pg client (the main client and IMP-3's second client). A lost connection is recorded and reported as `FAIL CONN`; the queries after it fail their test; the closing baseline count cannot crash the process. It can never pass.

## 6. Files (committed)

- `supabase/migrations/20261018000089_secdef_s2_1_finalize_battle_caller_check.sql`, `docs/database/rollback/089_rollback.sql`
- `scripts/test_secdef_s2_1.cjs`, `scripts/test_secdef_ratchet.cjs`, `scripts/secdef/allowlist.json`
- `scripts/test_qf1_db.cjs` (error handlers)
- `docs/testing/PERMANENT_GATES.md` (two rows), this report

## 7. Commit, deploy, production

| Step | Result |
|---|---|
| Commit | `dc0f190` (8 files: 089 + rollback, S2-1 tests, ratchet + allow-list, QF-1 handlers, gate rows, report); secret / host scan of the staged diff clean |
| Push | attempt 1 OK |
| `wait-for-deploy` `dc0f190` | deployed (200) |
| Anonymous production smoke | all passed (project-ref scan: 1 document + 11/11 chunks, 24 tokens) |

SECDEF-S2-1 status: CLOSED
