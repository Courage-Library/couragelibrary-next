# SEC-HOTFIX-7: lock the remaining public SECURITY DEFINER functions (rulings on SEC-HOTFIX-6 §2.3)

> **Context.**
> - SEC-HOTFIX-6 (`d91e0d3`) was accepted.
> - Migration **083** applies the architect's rulings on the 14 functions left pending there.
> - Function **bodies are unchanged**: only EXECUTE grants and `search_path` change.
> - After 083 the RLS-suite P-9 pending-ruling list is **empty**, and the test fails if it is not.

## 1. Rulings applied (migration 083)

| Ruling | Functions | Change |
|---|---|---|
| 1 — service_role only | `fn_award_gamification_reward`, `fn_claim_reward_item`, `fn_reverse_reward_claim`, `fn_check_premium_access_and_quota` | REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT TO service_role. `search_path = ''` for the first three: every table and function reference in their bodies is `public.`-qualified (verified), and they use only built-in types. `fn_check_premium_access_and_quota` keeps its existing pinned `public, pg_temp`. |
| 2 — no anon / PUBLIC | `fn_create_batch_assignment`, `fn_enroll_batch_student`, `fn_evaluate_descriptive_submission`, `fn_submit_descriptive_answer`, `fn_get_batch_assignment_progress` | REVOKE FROM PUBLIC, anon; authenticated + service_role keep EXECUTE (the internal `auth.uid()` / JWT checks are unchanged) |
| 3 — RLS predicates | `fn_can_evaluate_submission` (1 policy), `fn_has_batch_faculty_access` (5), `fn_is_batch_member` (3), `fn_is_institute_member` (3) | **Every policy that uses them is `TO authenticated`**: none applies to anon / PUBLIC, and no view uses them. Their other callers are SECURITY DEFINER functions, which run as the owner. → REVOKE FROM PUBLIC, anon; authenticated + service_role keep EXECUTE. **Nothing was added to `SECDEF_PUBLIC_OK`.** |
| 4 — trigger | `fn_sanitize_attempt_answer()` | `search_path = ''` (body fully qualified) |

**ACL before (restored by `docs/database/rollback/083_rollback.sql`):**

| Function | ACL before | search_path before |
|---|---|---|
| fn_award_gamification_reward | `=X, postgres=X, service_role=X, authenticated=X` | none |
| fn_claim_reward_item | `=X, postgres=X, service_role=X, authenticated=X` | none |
| fn_reverse_reward_claim | `=X, postgres=X, service_role=X, authenticated=X` | none |
| fn_check_premium_access_and_quota | `=X, postgres=X, anon=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_create_batch_assignment | `=X, postgres=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_enroll_batch_student | `=X, postgres=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_evaluate_descriptive_submission | NULL (PUBLIC) | `public, pg_temp` |
| fn_submit_descriptive_answer | NULL (PUBLIC) | `public, pg_temp` |
| fn_get_batch_assignment_progress | `=X, postgres=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_can_evaluate_submission | NULL (PUBLIC) | `public, pg_temp` |
| fn_has_batch_faculty_access | `=X, postgres=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_is_batch_member | `=X, postgres=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_is_institute_member | `=X, postgres=X, authenticated=X, service_role=X` | `public, pg_temp` |
| fn_sanitize_attempt_answer (trigger) | `=X, postgres=X, service_role=X, authenticated=X` | none |

## 2. Migration discipline

| Step | Result |
|---|---|
| Backup | `pre-083-sec-hotfix7-2026-10-16T08-38-47` (public + auth data, verified). The first attempt (08-30-17) failed on a dropped TLS connection; its partial dump was renamed `*.dump.failed`, so the runner can never select it. |
| Baseline (before) | 138 tables, 246 policies, 292 grants, 159 function hashes |
| Dry-run | OK (rolled back), 483 ms |
| Migration + rollback dry-run (one rolled-back transaction) | (a) anon and qa-student reads of the six tables governed by the predicate policies (`batch_curriculum_assignments`, `batch_memberships`, `institute_batches`, `user_descriptive_submissions`, `submission_evaluations`, `institutes`) are **identical before and after 083**: all `42501`, because these tables have no direct grants for anon / authenticated. (b) The rollback restores every SECURITY DEFINER function's PUBLIC / anon / authenticated / service_role privileges and config **exactly**. |
| Apply | `APPLIED + ledger row written` |
| Baseline (after) | diff = ledger 83 → 84 + the 13 changed ACL hashes (the trigger changed only `search_path`); 14 bodies byte-identical; no table, policy or grant change |
| `db:types` | regenerated, no change |

## 3. Behaviour proofs

**RLS suite P-9** (permanent; run inside a rolled-back transaction):
- **Service-role-only set (8 functions: 082 + 083 ruling 1):**
  - anon → `42501` and student session → `42501` for every one;
  - the **service role still reaches every one** (any outcome but a privilege error);
  - `fn_delete_exam_controlled` deletes a throwaway exam created inside the transaction.
- **Authenticated-only set (9 functions: rulings 2 + 3):**
  - anon → `42501`;
  - a **student session still reaches every one**, and the function's own checks decide.
- **`SECDEF_PENDING_RULING` is empty**, and the test fails if it is not. **`SECDEF_PUBLIC_OK`** still holds only the syllabus read model.

**HTTP:** as anon, `POST /rest/v1/rpc/fn_award_gamification_reward` (zero uuids) and `POST /rest/v1/rpc/fn_delete_exam_controlled` (zero uuid) both return **401 / 42501**. Checked locally before the push and in production after the deploy (§6).

### 3.1 Drill reward (ruling 1): finding — the drill flow was already broken for students

**What I ran:** the new live check `scripts/e2e/student-drill.cjs` (permanent QA student, local build only):
1. sign in;
2. `/mistakes/drill` → Start;
3. submit;
4. check the drill row, the coin ledger and the gamification events.

**What happened:** the drill **cannot be generated**. The UI shows "permission denied for table user_mistake_drills".

**Root cause (pre-existing, not caused by 083):**
- Since migration 067 (`grant_mistake_vault_read`, 2026-10-12), `authenticated` holds only **SELECT** on `user_mistake_drills` (ACL `authenticated=r`).
- `MistakeService.generateMistakeDrill` inserts the drill row and `submitMistakeDrill` updates it, both with the **session** client.
- The `submitMistakeDrill` completion update does not check its error, so even a submitted drill could never record `COMPLETED` / `coins_awarded`.

**Proof that this is independent of 083** (one rolled-back transaction, as qa-student):

| Probe | With 083 | With the 083 rollback applied |
|---|---|---|
| `INSERT INTO user_mistake_drills` | `42501 permission denied for table` | `42501 permission denied for table` |
| `UPDATE user_mistake_drills` | `42501 permission denied for table` | `42501 permission denied for table` |
| `fn_award_gamification_reward(…)` (correct argument names) | `42501 permission denied for function` | **OK** |

- **The drill failure is identical with and without 083.** The application code is unchanged since `d91e0d3` (one comment in `mistake.service.ts`), so the previous commit behaves the same. Under the process rule this is a **pre-existing** failure.
- **The last row confirms the HIGH rating of SEC-HOTFIX-6 §2.3:** before 083, any signed-in student could call the reward RPC directly, with correct argument names, and credit coins to any user id. 083 closes this.
- **The app's own drill reward call** passes the wrong argument names (`TYPES-1:B-DRILL-REWARD-ARGS`) and failed before. It now gets 42501. The code keeps `coins_awarded = 0` on any reward error (static test TYPES-1 B1-6, 5/5).
- **The register entry now says:** "must go via the service-role GamificationService".

**Not fixed here** (security-only migration; a behaviour change needs a ruling) → backlog **DRILL-WRITES**, high: students cannot generate or complete mistake drills. Options for the architect:
- move the drill writes to the existing `fn_generate_mistake_drill` / `fn_submit_mistake_drill` RPCs (authenticated, `auth.uid()` checked);
- or grant INSERT / UPDATE with own-row RLS.

The drill check script is ready to become a gate once that is fixed.

## 4. Gates (local production build)

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| RLS suite (P-1 … P-9) | **9/9** (P-9: 93 functions; service-role only 8; authenticated-only 9; pending 0) |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 · 3/3 · 4/4 |
| SEC-1B / 1C / 1D (offline) | 26/26 · 22/22 · 14/14 |
| E2E journey (qa-student) | **13/13** |
| Lineage (mistake vault) | 100% PASS |
| Drill check `student-drill.cjs` | fails at generation, pre-existing (§3.1) |
| Signed-in smokes | student-pages 12/12 (incl. `/exams/ssc-cgl`), admin-pages 16/16 |
| Anonymous smoke (local), incl. both RPC probes | all passed |
| Cleanup | `cleanup-student` with `E2E_KEEP_USER=1` (it now also clears `user_mistake_drills`): data removed, identity kept |

**Network:** intermittent DNS / TLS failures during this phase hit the first backup attempt, one debug sign-in and two connection attempts. Each time I waited for 3 consecutive TLS connects and retried.
- **One final RLS run lost its connection in P-9.** It left one orphaned backend of this suite: same DB user, "idle in transaction" about 99 s, last statement `ROLLBACK TO SAVEPOINT p9`, holding only its own virtualxid lock (no table locks). It **ended on its own; nothing was terminated.** The re-run passed 9/9.

## 5. Files

| Area | Files |
|---|---|
| Migration + rollback | `supabase/migrations/20261016000083_sec_hotfix7_lock_remaining_security_definer.sql`, `docs/database/rollback/083_rollback.sql` |
| Tests | `scripts/test_sec_hotfix4_rls.cjs` (P-9: empty pending list, service-role-only 8, authenticated-only 9, behaviour); `scripts/e2e/student-drill.cjs` (new); `scripts/e2e/cleanup-student.cjs` (+ drills) |
| Docs | `docs/reports/types/TYPES1_ESCAPES.json` (B-DRILL-REWARD-ARGS precondition), `services/mistake.service.ts` (comment only), `docs/reports/BACKLOG.md` (DRILL-WRITES; OBS-FN-STATS owner Platform ops), `docs/testing/PERMANENT_GATES.md` (P-9 wording) |

## 6. Production

After the push:
- `wait-for-deploy <sha>`;
- the anonymous smoke, including anon `POST /rest/v1/rpc/fn_award_gamification_reward` → 42501.

The database change is live since the apply. The result goes to the owner with the hand-off.
