# SEC-HOTFIX-4: admin/staff-only RLS on 11 content tables

> **Migration:** `supabase/migrations/20261015000076_sec_hotfix4_staff_only_rls.sql`
> **Rollback:** `docs/database/rollback/076_rollback.sql`
> **Test:** `scripts/test_sec_hotfix4_rls.cjs` (permanent gate)

## Scope

These 11 tables each had one permissive policy, `FOR ALL TO authenticated USING (true) WITH CHECK (true)`:

| Group | Tables |
|---|---|
| Taxonomy | `canonical_taxonomy_nodes`, `taxonomy_aliases` |
| Syllabus | `exam_syllabus_versions`, `exam_syllabus_nodes`, `exam_syllabus_canonical_mappings` |
| Exam Knowledge | `exam_knowledge_documents`, `exam_doc_versions`, `exam_posts`, `exam_sources`, `exam_claims`, `exam_claim_sources` |

Policy names were "Staff full management of …" and "Admin staff full management of …". The names suggested a role check, but none existed.

**Not changed:**
- the public read policies (anon + authenticated, status-gated);
- table grants;
- RLS enablement;
- functions.

## Correction to earlier analysis

The GAP2-4 Stage 1 design (§1) said these policies were not an open hole, because grants block writes. **That was wrong for reads.**
- `authenticated` holds SELECT on all 11 tables, and a `FOR ALL … USING (true)` policy grants reads too.
- So **any signed-in user (including students) could read every row**, including rows the public policies hide.
- Measured before the migration: a student read **13/13 `exam_sources` rows**, while anon could see 2.
- Writes were blocked only by missing INSERT / UPDATE / DELETE grants. One mistaken GRANT would have opened them to every user.

## Change

On each table, the FOR ALL policy is dropped and replaced by four policies, all `TO authenticated`:

| Policy | Clause |
|---|---|
| `<t>: admin/staff read` | `FOR SELECT … USING (fn_jwt_is_admin_or_staff())` |
| `<t>: admin/staff insert` | `FOR INSERT … WITH CHECK (fn_jwt_is_admin_or_staff())` |
| `<t>: admin/staff update` | `FOR UPDATE … USING (…) WITH CHECK (…)` |
| `<t>: admin/staff delete` | `FOR DELETE … USING (…)` |

`fn_jwt_is_admin_or_staff()` reads `app_metadata.role` from the JWT, which users cannot set themselves. The student read path is now exactly the public policies.

## Migration discipline

| Step | Result |
|---|---|
| Backup | `pre-076-sec-hotfix4-2026-10-15T18-23-31` (E:\CourageLibrary-Backups) |
| Dry-run | OK (rolled back) |
| Apply | OK; ledger `APPLIED`, sha `b6989cd7f22a` |
| `db:types` / `db:types:check` | Types unchanged (policies only) |
| Baseline snapshot diff (pre vs post) | Only the ledger row for 076 (row counts and data otherwise identical) |

## Test: `scripts/test_sec_hotfix4_rls.cjs`

Each table is tested inside `BEGIN READ WRITE … ROLLBACK`. The suite temporarily grants INSERT / UPDATE / DELETE to `authenticated`, so it tests the **policy** rather than the grant. It then probes as anon, as a student (claims with no role) and as staff.

| Check | Before 076 | After 076 |
|---|---|---|
| P-1: no FOR ALL policy; every authenticated read/write policy gated; public read policies unchanged | FAIL | PASS |
| P-2: student reads = anon reads; student UPDATE / DELETE affect 0 rows; INSERT denied | FAIL (student read 13/13 `exam_sources`; update/delete reached rows) | PASS (11 non-public rows hidden; insert denied by RLS on 9 tables; a BEFORE trigger rejects first on `canonical_taxonomy_nodes` and `exam_knowledge_documents`) |
| P-3: staff reads all rows; staff update reaches every row | PASS | PASS |
| P-4: `authenticated` holds SELECT only | PASS | PASS |
| P-5: the function is false for students, true for staff/admin; anon cannot execute it | PASS | PASS |

## Gates

Run on a local production build.

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 / test_types1_close / test_no_runtime_db | 8/8 · 3/3 · 4/4 |
| **test_sec_hotfix4_rls** | **5/5** |
| SEC-1A / 1B / 1C / 1D offline | 20/20 · 26/26 · 22/22 · 14/14 |
| QF-1 offline + DB | 73/73 · 15/15 |
| GAP2-1b / 2a / 3 `--db` | 38/38 · 18/18 · 15/15 |
| Exam Knowledge suites | 3H.1 40/40. 3H.3 45/46, 3H.4.1 8/10, 3H.4 42/48: **pre-existing, not caused by 076** (see below) |
| QA guard / HOTFIX-2 | 8/8 · 5/5 |
| Signed-in smoke `admin-pages` (now incl. `/admin/exam-knowledge`), `staff-content`, `student-pages` | all passed (3/3) |

**Exam Knowledge suite failures (pre-existing).**
- The failing checks are **static source assertions written before SEC-1B**: I43, H03, H07, S04, S05, S34, S42 and S44 grep for `checkIsAdminOrStaff()` call shapes, the layout guard, UI copy and the author_type literal, all of which have since been refactored.
- S09 assumes the DB has 0 EK documents, but published documents now exist.
- These suites use the **service-role client, which bypasses RLS**, and this phase changes no application source. **076 therefore cannot affect them.**
- The staff/admin RLS path is covered instead by P-3 (staff reads and updates every row through the policies) and by the signed-in `staff-content` and `admin-pages` smokes (`/admin/exam-knowledge` included). All pass.
- Updating the stale assertions is a follow-up (TEST-EK). It is out of scope here.

**Production:** see the commit message and the session report. Signed-in production smokes are run by the owner.

## Rollback

Run `docs/database/rollback/076_rollback.sql`. It restores the 11 original FOR ALL policies, and with them the read exposure. Do not use it except to recover from an outage.
