# GAP2-4c: retire the legacy syllabus tables and the reconciliation workbench

> **Timeline.**
> - **Started after GAP2-4b** was accepted (`24c431b`, `daf8441`).
> - **Paused once:** the first dry-run of the retirement migration (then numbered 082) stopped at its own precondition. A public function still referenced a legacy table, and checking it exposed **INC-3**: `fn_delete_exam_controlled` could be executed by anon.
> - **Architect ruling:** security hotfixes first.
>   - SEC-HOTFIX-6 (`d91e0d3`, migration 082);
>   - SEC-HOTFIX-7 (`0cfae8d`, migration 083).
> - **The 4c work waited in `git stash`.** It resumed as **migration 084**, keeping every 082 / 083 lockdown and RLS-suite P-9.
> - **Logged and owned elsewhere:** DRILL-WRITES (pre-existing, ruled: server-authoritative RPCs, phase DRILL-1 after 4c) is not part of 4c.

## 1. Forensics (read-only)

### 1.1 Phase-3R reconciliation workbench (code)

| Kind | Objects |
|---|---|
| Admin page | `app/admin/syllabus-reconciliation/page.tsx`, `syllabus-reconciliation-client.tsx` |
| API routes | `app/api/admin/syllabus-reconciliation/{resolve, versions, versions/[versionId], work-item/[nodeId], work-queue}/route.ts` |
| Components | `components/admin/syllabus-reconciliation/{readiness-summary-cards, resolution-dialogs, syllabus-tree-view, work-item-detail-drawer, work-queue-table, workbench-header}.tsx` |
| Services | `exam-syllabus-readiness`, `exam-syllabus-reconciliation`, `exam-syllabus-resolution`, `exam-syllabus-tree-importer`, `operational-syllabus-reconciliation` (`.service.ts`), `reconciliation-normalizer.ts` |
| Types / helpers | `types/dynamic-syllabus-reconciliation.ts`, `lib/syllabus/reconciliation-rows.ts` |
| Navigation | admin sidebar link "Syllabus Reconciliation" |
| Tests (TEST-LEGACY-SYLLABUS) | `test_dynamic_syllabus_{schema, projection, readiness, reconciliation, resolution}.cjs`, `test_phase3r_step6_operational_api.cjs`, `test_phase3r_step7_workbench_ui.cjs` |
| Gate references | `test_no_runtime_db` R-4 (HOTFIX-3 fail-closed path), `test_gap2_4a_syllabus` G-12, `test_gap2_4b_readers` R-02, signed-in smoke `admin-pages`, SEC-1C inventory (37 pages) |

### 1.2 Database

| Table | Rows | Used by | FKs (all kept, they move with the table) | Policies | Grants (before) |
|---|---|---|---|---|---|
| `exam_syllabi` | 1 (SSC GD) | no runtime code | → `exam_cycles` (RESTRICT) | `Public read exam_syllabi` (SELECT, public) | anon / authenticated SELECT; service_role all |
| `exam_topics` | 18 (SSC GD) | no runtime code | → `exam_syllabi` (CASCADE); → `canonical_taxonomy_nodes` (composite TOPIC, RESTRICT) | `Public read exam_topics` | anon / authenticated SELECT; service_role all |
| `exam_unit_mappings` | 0 | no runtime code | → `exam_topics` (CASCADE); → `learning_units` (CASCADE) | public read + service-role ALL | anon / authenticated SELECT; service_role all |
| `taxonomy_aliases` | 0 | the workbench only (ADD_ALIAS, alias matching) | → `canonical_taxonomy_nodes` (CASCADE) | public read + 4 admin / staff policies (076) | anon / authenticated SELECT; service_role all |
| `exam_topic_mappings` | does not exist | — | — | — | — |

**No dependents of the kinds that would block the move:**
- no view, trigger, sequence or public-table FK references any of the four tables;
- no other workbench-only table exists. The phase-3R syllabus tables `exam_syllabus_versions / nodes / canonical_mappings` are the canonical syllabus (078–081) and stay.

**Two functions referenced the tables.** My first forensics pass missed them (the source regex was escaped wrongly). The 082-era dry-run precondition caught them:
- `public.fn_syllabus_seed_legacy_gd_draft()` (080; owner-only, `search_path ''`) reads `exam_syllabi` / `exam_topics`.
- `public.fn_delete_exam_controlled(…)` (062) deleted legacy syllabi / topics. This is where INC-3 was found: SEC-HOTFIX-6 locked it.

**Runtime readers:** none. `test_gap2_4b_readers` R-01 is extended to `taxonomy_aliases` and to every workbench module import (§5).

## 2. "Suggest topics" (the only part kept from the workbench)

- **Module:** `lib/syllabus/topic-suggest.ts`. A pure, read-only, deterministic helper: no imports, no network, no database.
- **How it scores:**
  - text is normalized: NFKC, lower case, `&` → and, `+` → plus, separators removed, punctuation stripped;
  - topics are compared to the title by trigram Dice–Sørensen similarity, with a containment bonus;
  - a topic whose name consists of title words gets a floor score;
  - results are ranked, with at most 8 and a minimum score of 0.45.
- **Where it's used:** the `/admin/syllabus` topic picker (UNIT nodes). **Suggest topics** ranks the active TOPIC nodes the picker already holds against the unit title.
- **No auto-mapping:**
  - suggestions appear as **unticked** checkboxes that toggle the same pending selection as the list;
  - nothing is written until staff press **Save topics** (role-checked `fn_syllabus_set_unit_mappings`).
- **Tests:**
  - **E-08 (offline):** purity; exact / "&" ≡ "and" / near / title-word / contained-phrase matches; an unrelated topic is not suggested; empty title; limit; determinism; the UI block only toggles `picked` and calls no action or RPC.
  - **E-05 (live):** the unit is titled after a real active topic. **Suggest topics** lists it first and unticked, "Save topics (1)" is absent, the database has **0 mappings** for the draft, and only tick + Save maps it.

## 3. Workbench removal

- **Deleted:** the page, the 5 API routes, the 6 components, the 6 services, the types and `lib/syllabus/reconciliation-rows.ts`. The sidebar link is removed.
- **Legacy tests:** moved to `scripts/archive/legacy-syllabus/` with a README ("never run; excluded from every gate").
- **Gate and inventory updates:**

| Gate | Change |
|---|---|
| `test_no_runtime_db` R-4 | was "HOTFIX-3 fail-closed subtree path exists" → now "the direct-pg subtree path and the workbench are gone; no runtime file references `createSubtree` / `CREATE_NEW_SUBTREE` / `PgQueryClient`" |
| `test_gap2_4a_syllabus` G-12 | legacy rows counted in schema `retired`; none in `public`; workbench files gone |
| `test_gap2_4b_readers` R-02 | workbench pages, routes and services are gone; the sidebar does not link it |
| SEC-1C S-01 | 37 → **36** admin pages |
| Signed-in smoke `admin-pages` | `/admin/syllabus-reconciliation` removed (15 pages) |
| UX-1b **U-2b** (new) | every admin-sidebar href resolves to an app route (25 links) |
| SEC-1B | auto-discovers routes; the 5 deleted routes are simply absent |
| TYPES-1 | no register entry referenced the workbench; ratchet lowered by the removal (`as any` 250 → 247, `: any` 806 → 779); B5 note updated |

## 4. Migration 084 (`20261016000084_gap2_4c_retire_legacy_syllabus.sql`)

**Order of steps:**
1. Expected counts and an ACL / config snapshot of the two dependent functions.
2. **Re-point the dependents** with `CREATE OR REPLACE`, which keeps the ACL. Both definitions restate `SET search_path TO ''`.
   - `fn_syllabus_seed_legacy_gd_draft()` now reads `retired.exam_syllabi` / `retired.exam_topics`; the body is otherwise identical.
   - `fn_delete_exam_controlled(…)`: the legacy syllabi / topics cleanup (step 6) is removed; the body is otherwise identical. An exam whose cycle still has a legacy syllabus (SSC GD) stays undeletable through the retired RESTRICT FK, and it is blocked earlier anyway by "syllabus versions exist".
3. Preconditions: no public FK, no view and no function source references a legacy table outside `retired.`.
4. `SET SCHEMA retired` for the four tables; `REVOKE ALL` on the tables and the schema from PUBLIC, anon, authenticated.
5. **Proof:**
   - rows identical;
   - none left in `public`;
   - no USAGE and no privileges for anon / authenticated;
   - **both re-pointed functions have byte-identical ACL, config, SECURITY DEFINER flag and owner**, and `fn_delete_exam_controlled` keeps `search_path ''`;
   - **the P-9 invariants still hold**: no exposed SECURITY DEFINER function except the read model, all pinned, and `fn_delete_exam_controlled` not executable by authenticated;
   - no function references a legacy table outside `retired.`;
   - the canonical syllabus tables are present.
6. `NOTIFY pgrst`.

**Rollback:** `docs/database/rollback/084_rollback.sql`.
- It moves the tables back, restores the anon / authenticated SELECT grants, and restores the pre-084 bodies of both functions (ACLs and the 082 `search_path ''` kept).
- **Rollback order:** 084 → 083 → 082 → 081 → 080 → 079 → 078 → 075. 082 and 083 only change function grants, so the GAP2-3 suite's 075 dry-run chain is 084 → 080 → 079 → 078 → 075.

**Discipline:**

| Step | Result |
|---|---|
| Backup | `pre-084-gap2-4c-2026-10-16T10-02-57` (public + auth data, verified) |
| Dry-run | OK (rolled back). The first attempt failed on a comment inside the new function body that named a legacy table (the precondition scans function sources); the comment was reworded. |
| Migration + rollback dry-run (one rolled-back transaction) | After 084: four tables in `retired`, no anon / authenticated access, both functions `acl` / `search_path ''` unchanged, and the re-pointed seed runs against `retired.*` (`ALREADY_EXISTS`, idempotent). After the rollback, the **pre-084 state is restored exactly**: table schemas, policies and grants, both function bodies (md5), ACLs and config, and every SECURITY DEFINER function's privileges. |
| Apply | `APPLIED + ledger row written` |
| `db:types` | the four tables removed from `types/database.ts` (−178 lines); tsc 0 |

**Baseline diff** (138 tables, policies, grants, function hashes; before vs after). Nothing else changed:
- the four tables `public` → `retired`, with **row counts and content md5 identical**;
- their 10 policies moved with them;
- the 8 anon / authenticated SELECT grants are gone; service_role privileges moved with the tables (no USAGE on `retired`);
- the two re-pointed function hashes;
- the ledger 84 → 85.

## 5. Tests

**`test_gap2_4b_readers.cjs` (8/8):**
- **R-01 extended:** no runtime reader of `exam_syllabi`, `exam_topics`, `exam_unit_mappings`, `exam_topic_mappings` or `taxonomy_aliases`, and **no import of any retired workbench module**.
- **R-02:** the workbench files and the sidebar link are gone.
- **R-04:** the legacy GD topic names are read from `retired`.
- **R-08 (new):** the four tables exist only in `retired`, with rows 1 / 18 / 0 / 0. anon / authenticated have no USAGE and no privilege. **PostgREST answers "not found" (404 / PGRST205) as anon and as qa-student for each table.**

**Updated suites:**
- **RLS suite:** `taxonomy_aliases` left the 076 table list (now 10 tables) and the P-6 public-reference list (as did `exam_topics`). **P-9 additionally asserts** that the seed function stays owner-only with `search_path ''` and that `fn_delete_exam_controlled` keeps `search_path ''`. 9/9.
- **GAP2-3:** `exam_topics` (a flipped table) is hashed in `retired` for D-06. E-01 / E-04 now assert that PostgREST no longer exposes it (EKC-161 / ES-45 are retired entries). D-02 resolves flipped tables in `public` or `retired`. D-07 runs the 084 rollback first. 15/15.
- **GAP2-4a:** G-11 compares the GD draft with the legacy topics in `retired` (re-seed idempotent and deterministic through the re-pointed function). G-12 checks the retired counts.

## 6. Gates (local production build)

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 · 3/3 · 4/4 |
| RLS suite (P-1 … P-9, P-6 clean) | 9/9 |
| GAP2-4a syllabus | **12/12** (G-11 re-seed through the re-pointed function) |
| GAP2-4b editor offline / live | 5/5 · **8/8** (E-05 includes the live Suggest-topics check) |
| GAP2-4b readers (with `--base`) | **8/8** |
| GAP2-3 (`--db`) / GAP2-2b / HOTFIX-2 / QF-1 offline | 15/15 · 18/18 · 6/6 · 73/73 |
| SEC-1B / 1C / 1D (offline) | 26/26 · 22/22 (36 pages) · 14/14 |
| Design ratchet / UX-1b shell (incl. U-2b) / QA guard | 7/7 · 7/7 · 8/8 |
| Signed-in smokes `admin-pages` / `staff-content` | 15/15 · 3/3 |
| Anonymous smoke (local), incl. anon `/rest/v1/exam_topics` → 404 and the two RPC probes | all passed |

**Network and retries (recorded):**
- The intermittent DNS / TLS failures continued. Every DB suite waited for 3 consecutive TLS connects and retried on a connection error.
- `pg_stat_activity` showed no orphaned session before the retries, and nothing was terminated.
- **The live editor test needed four runs:**
  - runs 1 and 3 failed on `fetch failed` in the server's middleware;
  - run 2 exposed a **stale assertion in my own test**: E-06 still expected the unit title "QA Unit", but E-05 now titles the unit after a real topic for the Suggest check. It was fixed;
  - run 4, on a fresh server, passed 8/8 with 0 fetch failures.
- Run 2 had published a TEST version on the **inactive** QA exam before failing, which students never see. Run 4's publish archived it automatically, and the QA exam ended with no non-archived version.

## 7. Production

PRODUCTION_RESULT

## 8. Open items

- **DRILL-1** (next phase, ruled): move drill writes to `fn_generate_mistake_drill` / `fn_submit_mistake_drill`.
- **RETIRED-CLEANUP** (owner approval): drop the `retired` tables.
- **TEST-EK:** unchanged.
