# DRILL-1: mistake drills — server-authoritative generate / submit (no student table writes)

> **Finding DRILL-WRITES** (SEC_HOTFIX7_REPORT §3.1, proven pre-existing): since migration 067 `authenticated` holds only **SELECT** on `user_mistake_drills`, so students could neither generate nor complete a drill.
>
> **Architect ruling:** route every student drill write through SECURITY DEFINER RPCs that derive the user from `auth.uid()`. Never grant table writes to students.

## 1. Forensics and contract diff

### 1.1 Inspected

**Reports:** SEC_HOTFIX7 §3.1, SEC_HOTFIX6 §2 (93-function inventory), PERMANENT_GATES.

**Migrations:**
- `030_phase3o_mistake_vault` created the tables and both RPCs;
- `063_qf1` re-pointed drills to published versions;
- `067_grant_mistake_vault_read` gave `authenticated` SELECT only;
- `075` added the topic FK.

**Live catalog (couragelibrary-next):**

| Object | State before 085 |
|---|---|
| `fn_generate_mistake_drill(p_topic_id uuid, p_cognitive_type_id text, p_limit int)` | SECURITY DEFINER, `search_path public, pg_temp`, EXECUTE authenticated + service_role (anon / PUBLIC no) |
| `fn_submit_mistake_drill(p_drill_id uuid, p_answers jsonb)` | same |
| `user_mistake_drills` | ACL `authenticated=r`; RLS `p_umd_select` (own rows **or JWT role / app_metadata.role admin / staff**); `p_umd_manage_staff` (ALL, staff); 0 rows ever |
| `user_mistake_vault`, `user_mistake_occurrences` | `authenticated=r`; own-row SELECT (+ a vault UPDATE policy that the grant makes inert) |
| Published current versions without an answer key | **1** (the app's grading would have invented `'A'` for it) |

**App code:**
- `MistakeService.generateMistakeDrill` / `submitMistakeDrill` (session client; direct INSERT / UPDATE; grading via the admin client; reward call);
- callers: `app/mistakes/actions.ts`, `app/api/mistakes/submit-drill/route.ts`, `app/mistakes/drill/page.tsx` (resume, read-only);
- a second, **dead** write path: `services/adaptive/adaptive-remediation.service.ts` (quarantined adaptive module, no runtime caller) inserted into `user_mistake_drills`.

### 1.2 Contract diff (app before DRILL-1 vs RPC before 085 vs DRILL-1)

| Behaviour | App (before) | RPC (before 085) | DRILL-1 (085 + app) |
|---|---|---|---|
| Question selection | focus modes (unresolved / revisiting / mastered-refresh / repeated / bookmarked / due / high-priority), subject / topic / cognitive filters, single vault item, MPI + due-state + fatigue ranking | topic / cognitive filter, UNRESOLVED / REVISITING only, newest mistake first | **app ranking kept** (read-only, own rows); the RPC receives the ordered vault ids and **re-checks that every one belongs to `auth.uid()`** (else FORBIDDEN, nothing written) |
| Drill size | 1–20 | 1–20 | ≤ 20 (enforced by the RPC) |
| Ownership | session user (insert denied) | `auth.uid()` | `auth.uid()`; no user parameter |
| Pre-submit projection | whitelist (`toPublicDrillQuestions`), version pinned, context | options only, no context, no version | RPC builds the PublicDrillQuestion shape (version id, options, context); app re-projects through the whitelist; **no key / explanation stored or returned** |
| Ungradable items | grading fell back to `'A'` (fabricated) | marked incorrect | **never drilled** (only versions that have an answer key); defensive: ungradable → not graded, no vault change |
| Grading basis | selected **key** vs key of the **compiled** version (admin client) | selected **option id** vs the **current** version; iterates the **client's list** | the **drill's own questions**; the selected option must belong to the compiled version (id first, else key); compared with that version's `question_answers` |
| Client-sent correctness / score | ignored | ignored | ignored (tested) |
| Extra / duplicate answers | ignored (first response per drill question) | **counted**: an extra question id or a repeated correct answer moved the vault (one drill could reach MASTERED) | ignored (tested) |
| Unanswered questions | incorrect (UI: "counted as incorrect and reset your streak") | skipped | **incorrect** (the UI contract) |
| Vault: correct | streak + 1; ≥ 2 → MASTERED (+ mastered_at) else REVISITING (mastered_at NULL) | same, mastered_at untouched on REVISITING | as the app |
| Vault: incorrect | streak 0, UNRESOLVED, mistakes + 1, last_mistake_at, occurrence (response time default **30**) | same, occurrence (time default 0) | same; occurrence with the real response time or **NULL** (no invented value), `question_version_id` set |
| Coins | 5 via the reward RPC (always failed: wrong arguments) → 0 recorded | **5 via `fn_award_gamification_reward`** | **0, no reward function called** (B-DRILL-REWARD-ARGS → Commerce) |
| Double submit | error "already completed" | error | **idempotent**: the stored result is returned, no mutation |
| Write errors | completion update unchecked (silent) | statement errors raise | every write row-count checked (`DRILL_WRITE_FAILED`), one transaction; the app surfaces RPC errors / failed results |
| Expiry | none (status EXPIRED unused) | none | unchanged: only IN_PROGRESS is open; other states → NOT_OPEN |
| Learning activity | none | `learning_activity_events` for topic-scoped drills | kept as the RPC did (topic-scoped only; time NULL, not invented) |

**Hard-stop check (none applied, so I proceeded):**
- **The RPCs exist.** Functions + grants suffice, with no schema change.
- **No table grant is needed.**
- **No new product decision:** every grading / vault difference has an established rule:
  - the UI's unanswered rule;
  - the app's vault rules;
  - decision #15 for the invented `'A'` / 30 s values;
  - the coin ruling.

## 2. Design decisions

1. **Selection stays in the app, enforcement moves to the RPC.**
   - The product's ranking (focus modes, MPI, fatigue) is read-only on the caller's own rows. Porting it to SQL would have been a large behaviour risk with no security gain.
   - The RPC is the only writer. It validates ownership of every id, compiles the payload server-side and stores it.
2. **Signature replaced** (`(uuid,text,int)` → `(uuid[],uuid,text)`). The old signature was dropped; no other caller existed. ACLs were set explicitly, because a new function would otherwise default to PUBLIC EXECUTE.
3. **Idempotent result storage, no schema change.** The completed drill stores each question's evaluation inside its `questions_data` element (existing jsonb column). A second submit rebuilds the identical result from it. The resume path still re-projects through the whitelist, so the stored keys never reach a pre-submit payload.
4. **Grants: authenticated only.** service_role was removed from both functions, per the brief; the app calls them with the user-scoped session client.
5. **The dead adaptive write path was made write-free.** No runtime caller. Persisting its sessions must use the RPC when the adaptive phase wires it. **Deviation, recorded in §10.**

## 3. Files changed

| File | Change |
|---|---|
| `supabase/migrations/20261016000085_drill1_server_authoritative_drills.sql` | new generate RPC, submit RPC body, grants, proof |
| `docs/database/rollback/085_rollback.sql` | restores both pre-085 functions byte-exactly (generated from the live definitions, LF) + ACLs |
| `types/database.ts` | `db:types` (new generate arguments) |
| `services/mistake.service.ts` | generate: ranking kept, the RPC creates the drill; submit: one RPC call, errors surfaced; no direct drill / vault / occurrence writes, no admin client, no reward call; `DrillEvaluationItem.correct_option_key` nullable + `ungradable` |
| `services/adaptive/adaptive-remediation.service.ts` | direct drill insert removed (dead path) |
| `scripts/test_drill1.cjs` | new suite D1–D10 (+ D10b) |
| `scripts/e2e/student-drill.cjs` | description (now a permanent gate) |
| `docs/testing/PERMANENT_GATES.md` | DRILL-1 gates added |
| `docs/reports/types/TYPES1_ESCAPES.json`, `TYPES1_RATCHET.json` | B-DRILL-REWARD-ARGS is now a tracked comment; ratchet lowered (`as any` 247 → 246, `: any` 779 → 774, `@ts-expect-error` 12 → 11, exception `DRILL-1 12 → 11` recorded) |
| `docs/reports/BACKLOG.md` | DRILL-WRITES done |
| `docs/reports/drill/DRILL1_REPORT.md` | this report |
| `.gitattributes` (new) | `supabase/migrations/*.sql` and `docs/database/rollback/*.sql` keep LF in every checkout |

## 4. Migration 085, rollback and dry-run evidence

**Discipline:**

| Step | Result |
|---|---|
| Backup | `pre-085-drill1-2026-10-16T11-54-40` (public + auth data, verified) |
| Dry-run | OK (rolled back) |
| Migration + rollback in one rolled-back transaction | after 085: generate `(uuid[],uuid,text)` and submit, both SECURITY DEFINER, `search_path ""`, ACL `postgres=X, authenticated=X`. After the rollback, both pre-085 functions are **restored exactly** (signature, body md5, ACL, config, definer flag). |
| Apply | `APPLIED + ledger row written` |
| `db:types` | only the generate arguments changed |

**Proof inside the migration:**
- data counts unchanged;
- the old signature is gone;
- both functions are definer with `search_path ''` and EXECUTE authenticated only (no PUBLIC, anon or service_role);
- no reward call in either body;
- **no INSERT / UPDATE / DELETE for anon / authenticated** on `user_mistake_drills`, `user_mistake_vault`, `user_mistake_occurrences`;
- the P-9 invariants hold.

**Schema baseline diff** (138 tables, policies, grants, function hashes): the ledger row (85 → 86), the dropped old and new generate signatures, and the changed submit hash. Nothing else changed.

**Rollback order:** 085 → 084 → 083 → 082 → 081 → 080 → 079 → 078 → 075.

## 5. Data baselines (before 085 vs after the suites + cleanup)

| Table | Before | After |
|---|---|---|
| questions / question_versions / question_options / question_answers | 113 / 113 / 448 / 112 | identical (count + content md5) |
| mock_tests / test_attempts / test_results / attempt_answers | 8 / 31 / 10 / 200 | identical |
| user_mistake_vault / user_mistake_occurrences / user_mistake_drills | 12 / 13 / 0 | identical |
| coin_wallets / coin_ledger / gamification_events | 5 / 9 / 8 | identical |
| learning_activity_events | 0 | identical |

Only the QA student's journey and drill rows changed during the run. `cleanup-student` (`E2E_KEEP_USER=1`) removed them: 3 drills, 3 vault rows, 10 occurrences and the journey's own rows. The QA identities survive (guard 8/8).

## 6. Test results

**`scripts/test_drill1.cjs`: 11/11** (live, after the E2E journey):

| ID | Result |
|---|---|
| D1 | qa-student generates from its own vault via the RPC: 3 questions, IN_PROGRESS row owned by the student |
| D2 | no `correct_option_key` / `explanation` / `is_correct` / `solution` / `answer*` key in the response **or** the stored row |
| D3 | server grading: correct 1/3 = expected 1 from canonical answers. Client `is_correct` / `score` / `correct_count` fields, a duplicated answer and a non-drill question are ignored (that vault row is unchanged); unanswered = incorrect; explanations only after submit. |
| D4 | second submit → `idempotent: true`, identical summary + evaluations, vault / occurrences / drill row byte-identical |
| D5 | **simulated second student** (JWT claims in a rolled-back transaction; no account created): 0 rows / NOT_FOUND / FORBIDDEN. **Real qa-staff**: submit NOT_FOUND, generate from the student's vault FORBIDDEN, no row created. qa-staff can *read* drills **by design** (support policy `p_umd_select`). |
| D6 | anon → 401 / 42501 for both RPCs |
| D7 | qa-student direct PostgREST INSERT / PATCH / DELETE → 403 / 42501; row unchanged; no table write privilege |
| D8 | coins_awarded 0 (row + result); coin ledger / gamification events unchanged |
| D9 | service level: an RPC error (`P0001 DRILL_WRITE_FAILED`), a failed RPC result and a generate error are all surfaced; static: no direct drill / vault / occurrence write, no admin client, no reward call in the drill path |
| D10 | qa-staff (empty vault): NOTHING_TO_DRILL, no row; D10b (service): no candidates → typed error, RPC not called |

**Also:**
- **`scripts/e2e/student-drill.cjs`: 4/4.** Generate in the UI → submit → result screen; COMPLETED with coins 0; ledger / events unchanged. Previously it failed at generation (SEC-HOTFIX-7 §3.1).
- **E2E journey:** 13/13. **Lineage:** 100%.
- **Signed-in smokes (local build):** student-mistake 7/7, student-pages 12/12, admin-pages 15/15.

## 7. Regression gates (local production build)

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 (one warning that predates DRILL-1, `app/sitemap.ts`) / OK |
| RLS suite (P-1 … P-9) | **9/9** (P-9: pending list empty, SECDEF_PUBLIC_OK unchanged; the two drill RPCs are authenticated-only with `search_path ""`) |
| test_types1 / test_types1_close | 8/8 · 3/3 (ratchet lowered, not raised) |
| test_no_runtime_db | 4/4 |
| SEC-1B / 1C / 1D (offline) | 26/26 · 22/22 · 14/14 |
| Design ratchet / UX-1b shell | 7/7 · 7/7 |
| GAP2-4a / GAP2-4b editor (offline) / GAP2-4b readers (`--base`) / GAP2-3 (`--db`) | 12/12 · 5/5 · 8/8 · 15/15 |
| HOTFIX-2 / QF-1 offline / TYPES-1 B1 / B2 | 6/6 · 73/73 · 8/8 · 6/6 |
| QA identity guard | 8/8 |

**Suites updated to the new architecture** (they asserted the in-app drill code that moved into the RPCs; they passed on `5f6f2c9`, so this is a re-point, not a pre-existing failure):
- **QF-1 STATIC-7:** the published + current filter is now asserted in migration 085.
- **TYPES-1 B1-1:** drill compile / grade columns, in the RPCs.
- **B1-5 / B1-6:** no reward call anywhere in the drill path; coins recorded as 0.
- **B1-7:** answers are read after the ownership-scoped lock, inside the RPC; the app reads no answers and uses no service role.
- **B2-2:** the generate path is projected through the whitelist, and the generate RPC carries no answer data.
- **Each assertion keeps its invariant.**

**Not a gate:** the legacy script `verify_phase3d_mistake_drill_runtime_gate.cjs` still references the old service flow; it is in no gate list.

**Flake recorded:** in the regression batch, GAP2-4b readers first lost its connection. Its automatic retry failed R-05 with "current transaction is aborted" (R-06 depends on it). Run on its own, the suite passed 7/7, and with `--base` 8/8. No orphaned session was found.

## 8. Production probes

The probes run after the push (`wait-for-deploy`, then the anonymous smoke):
- `rpc/fn_generate_mistake_drill` and `rpc/fn_submit_mistake_drill` as anon → 401 / 42501;
- a direct anon `POST /rest/v1/user_mistake_drills` → 42501;
- the 082 / 083 / 084 probes.

**Recorded results:**

| Probe | Result |
|---|---|
| `wait-for-deploy` `64a040b` | deployed (200) |
| anon `POST rpc/fn_generate_mistake_drill` | **401 / 42501** |
| anon `POST rpc/fn_submit_mistake_drill` (zero uuid) | **401 / 42501** |
| anon `POST /rest/v1/user_mistake_drills` (direct write) | **401 / 42501** |
| anon `rpc/fn_delete_exam_controlled` · `rpc/fn_award_gamification_reward` (082 / 083) | 401 / 42501 · 401 / 42501 |
| anon `GET /rest/v1/exam_topics` (084) | 404 PGRST205 |
| home / health / admin redirect / flag-off routes / `/exams/ssc-cgl` | all passed |

## 9. OWNER TO RUN (not run by Claude)

```bash
node scripts/smoke/signed-in-smoke.cjs student-mistake https://couragelibrary-next.vercel.app
```

The owner records the result here. I have **not** run it: I never sign in to production.

## 10. Deviations / unplanned changes

- **Dead adaptive path:** `services/adaptive/adaptive-remediation.service.ts` (quarantined, no runtime caller) also inserted into `user_mistake_drills`. Its insert was removed, so the session id is now undefined. It must use `fn_generate_mistake_drill` when the adaptive phase wires it.
- **D5 split:** D5 uses a simulated second student for the RLS read check. qa-staff is a support role that may read every drill (`p_umd_select`), so it cannot stand in as "student B" for reads. It is used for the RPC refusals.
- **Ungradable versions excluded at generation:** published versions without an answer key are excluded when a drill is generated (1 exists today), instead of being graded with an invented key.
- **`.gitattributes` added (unplanned, protective):**
  - The repo uses `core.autocrlf=true`, so a fresh Windows checkout would give the SQL rollbacks CRLF.
  - Their byte-exact function bodies (md5) would then no longer match (the same failure mode hit the 084 rollback dry-run in GAP2-4c).
  - Migrations and rollbacks are now pinned to LF; the committed blobs were already LF.
- **Network:** intermittent DNS / TLS failures, the same as the previous phases.
  - The UI drill check needed two network retries and a fresh server.
  - The anonymous smoke's `/exams/ssc-cgl` check failed once on a dropped read-model call (the page then shows its honest "could not be loaded" state); the re-run passed.
  - No orphaned session was observed.

## 11. Remaining B-tags

- **`TYPES-1:B-DRILL-REWARD-ARGS` stays open → Commerce:** wire the drill reward through the service-role GamificationService. It is now a tracked comment in `submitMistakeDrill`; no `@ts-expect-error` remains.

DRILL-1 status: CLOSED (owner production smoke §9 still to run)
