# HOTFIX-3 (TLS-1): remove the runtime direct DB connection with disabled TLS

> **Decision #38:** NO direct database connections from runtime code (`app/`, `services/`, `lib/`, `actions/`, `components/`, `config/`, `middleware.ts`).
> - Runtime code uses only Supabase clients from the canonical factories, plus RPCs.
> - Direct `pg` is allowed only in `scripts/`, with verified TLS and the ref guard.
>
> **Not included:** no DB changes, no packages.

## a) Atomic subtree creation fails closed

**Before.**
- `ExamSyllabusResolutionService.createSubtree` (action `CREATE_NEW_SUBTREE`) opened its own `pg` connection when called from runtime.
- The connection string came from `DATABASE_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL`, with **`ssl: { rejectUnauthorized: false }`**, plus ipv4-first DNS and 3 retries.
- It was reachable from `POST /api/admin/syllabus-reconciliation/resolve` (staff/admin, the syllabus-reconciliation workbench).

**After:**
- `ExamSyllabusResolutionService.createSubtree`: when no transactional client is supplied (the runtime case), it **throws `SyllabusReconciliationUnavailableError` before any read or write**. The `require('pg')`, the connection-string read and the connection lifecycle are deleted. The duck-typed path for a caller-supplied client (scripts only) is unchanged.
- `OperationalSyllabusReconciliationService.resolveWorkItem` **rejects `CREATE_NEW_SUBTREE` before delegation**. It returns `SERVICE_UNAVAILABLE` (HTTP 503) with the message **"Syllabus reconciliation is unavailable until the syllabus rebuild (GAP2-4)"**. Nothing before that point writes, so there are no partial writes and no fabricated success.
- **Admin page** `/admin/syllabus-reconciliation`:
  - A persistent notice shows the message.
  - The work-item drawer shows the API error message if the action is attempted.
  - The other review actions are unchanged. They use the Supabase client, and GAP2-4 Stage 1 decides whether to replace or retire them.
- **Production effect.** There are 0 `exam_syllabus_nodes` rows today, so no work items exist and the action was not reachable with real data.

## b) Runtime `pg` imports

- After the change, **no runtime file imports `pg`, `postgres` or `pg-pool`**.
- `pg` was **already a devDependency only**, so nothing needed moving.
- `npm run build` passes, so nothing at runtime needs it. Its remaining users are the 32 files under `scripts/`.

## c) Permanent guard: `scripts/test_no_runtime_db.cjs` (4/4)

| Rule | What it enforces |
|---|---|
| R-1 | No import, require or dynamic import of `pg`, `postgres` or `pg-pool` (incl. sub-paths) in runtime code (511 files) |
| R-2 | No `rejectUnauthorized` or `NODE_TLS_REJECT_UNAUTHORIZED` in runtime code |
| R-3 | Direct-connection env vars (`DATABASE_URL`, `POSTGRES_*`, `SUPABASE_DB_URL`) only in allow-listed **parse-only** files, each with an owner. An allow-listed file that opens a connection fails. |
| R-4 | The HOTFIX-3 fail-closed path and the page notice stay in place |

- **Negative check:** R-1, R-2 and R-3 all flag the previous version of `exam-syllabus-resolution.service.ts`.
- The guard is added to the permanent gate list, `docs/testing/PERMANENT_GATES.md`.

## d) Direct DB connection strings in the runtime environment (code references only; no values read)

**Runtime code referencing them:**

| File | Variables | Use | Status |
|---|---|---|---|
| `services/exam-syllabus-resolution.service.ts` | `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL` | **Opened a connection** (TLS unverified) | **Removed** (HOTFIX-3) |
| `services/current-affairs-production-sync.service.ts` | `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL` | **Parse-only:** derives provider / database name / ssl hint for the admin `GET /api/admin/current-affairs/sync-status` health view, and a presence check for an "ingestion gateway" | Remains (B3 / TEST-CA). Without these variables it falls back to the Supabase REST endpoint label, and the presence check is still satisfied by `SUPABASE_SERVICE_ROLE_KEY`. **Not a connection.** |

**Conclusion.**
- The **only runtime consumer that connected** was the removed service. No runtime code needs a direct DB connection string any more.
- Whether Vercel actually holds such variables cannot be seen from code. The Supabase ↔ Vercel integration typically injects `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_DATABASE`, and sometimes `DATABASE_URL`.

**Recommended owner actions.** These are not done by me. Do them in order:
1. **Vercel → Project → Settings → Environment Variables.** For Production, Preview and Development, delete every direct-connection variable present:
   - `DATABASE_URL`
   - `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL`
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_DATABASE`
   - `SUPABASE_DB_URL`

   Keep `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `…ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
2. **If the Supabase Vercel integration is installed** (Vercel → Integrations), stop it re-syncing these variables. Disable its environment-variable sync, or remove the integration and keep the Supabase keys as plain project variables.
3. **Redeploy** production (Vercel → Deployments → Redeploy), then check that `/api/health` → 200 and that `version` is the expected commit.
4. **Rotate the database password:** Supabase dashboard → project **couragelibrary-next** → Project Settings → Database → **Reset database password**.
   - Only the **couragelibrary-next** project; never the old "couragelibrary" project.
   - Store the new password only in your password manager.
5. **Update local script configuration.** Replace the password inside `POSTGRES_URL_NON_POOLING` in `.env.local`. It is used only by `scripts/` (migration runner, snapshots, DB suites) with verified TLS. Then verify read-only:

   ```
   node scripts/test_types1.cjs
   ```

   That runs `db:types:check` (T-01), and a DB suite such as `node scripts/test_qf1_db.cjs` should pass.
6. **Never** put the new password into Vercel.

## e) Gates

Run on a local production build.

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| test_types1 (incl. `db:types:check`) | 8/8 |
| test_types1_close | 3/3 |
| **test_no_runtime_db** | **4/4** |
| SEC-1B offline | 26/26 |
| SEC-1C offline | 22/22 |
| SEC-1D offline | 14/14 |
| HOTFIX-2 coverage | 5/5 |
| QA identity guard | 8/8 |
| Signed-in smoke `admin-pages` | **all passed** (12 pages, incl. `/admin/syllabus-reconciliation`) |

Production: see the commit message and the session report.

## Owner verification of the production environment (2026-10-15)

The owner checked Vercel. It holds only:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**There is no direct DB connection string, so TLS-1 had no production exposure.** The removed code path could not have connected in production. In `services/exam-syllabus-resolution.service.ts` it would have thrown "Atomic subtree creation requires transactional PostgreSQL client connection.".

**Database password rotation is deferred to pre-launch** (owner decision). Steps 1–3 of §d are unnecessary; steps 4–6 remain for pre-launch.
