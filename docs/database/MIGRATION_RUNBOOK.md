# Migration Runbook (couragelibrary-next)

Every schema change goes through the same five steps. The tools enforce them; do not bypass them.

```
backup  →  pre-check (dry-run)  →  apply via runner  →  verify  →  ledger
```

## Ground rules

- **Target:** only the project whose ref appears in `NEXT_PUBLIC_SUPABASE_URL`. Every tool refuses to connect if the ref in `POSTGRES_URL_NON_POOLING` differs. The old `couragelibrary` project is never touched.
- **TLS:** always verified against the CA in `PROD_CA_PATH` (`rejectUnauthorized: true`, `sslmode=verify-full`). Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` and never use `rejectUnauthorized: false`. If TLS fails, stop.
- **Ledger:** `public.schema_migration_ledger` is the source of truth for what ran. It is service-role only, with RLS on and no anon/authenticated access.

  | Status | Meaning |
  |---|---|
  | `APPLIED` | Applied by `scripts/db/apply-migration.cjs` (row written in the same transaction as the migration) |
  | `BASELINED` | Existed before the ledger and was verified present by DRIFT-1a |
  | `SUPERSEDED_NOT_APPLIED` | Never applied and **must never be replayed** (033, 037–052). `superseded_by` says where its objects were re-created, or that the feature is deferred. |
  | `FAILED` | Last apply attempt rolled back; the error is in `notes` |

- **No transaction control in migration files** (no `BEGIN;` / `COMMIT;` / `ROLLBACK;`): the runner owns the transaction, and a `COMMIT` in the file would end it early, so even `--dry-run` would persist the migration and its ledger row (F1-a incident, 2026-10-25: 092 was live for about 75 s and was reverted with its rollback; ledger row set to `FAILED` with the note). The runner refuses such files (`node scripts/db/apply-migration.cjs --self-test`, CI `MIGRATION-RUNNER-SELFTEST`).
- **Never edit an applied or baselined migration.** Every change is a new, forward-only file `supabase/migrations/YYYYMMDDNNNNNN_name.sql`.
- **Checksums:** sha256 of the file with CRLF normalized to LF.
- **Secrets:** no tool prints connection strings, hosts with project refs, keys or passwords.
- **LIVE-LOCK-SAFETY (permanent rule, 2026-10-25):** these rules cover every live smoke, verify, dry-run and apply session.
  - **Timeouts:** `lock_timeout = '3s'` and `statement_timeout = '60s'`. The runner sets them with `SET LOCAL` right after `BEGIN`; scripts import them from `scripts/db/live-safety.cjs` (`applyLiveSafety(client)`).
  - **One session at a time:** never run two live sessions that touch the same objects at once. No dry-run while a smoke is running. (Observed: a 102 dry-run deadlocked, 40P01, against a running smoke.)
  - **Small transactions:** split long smokes that take DDL locks into small rolled-back transactions, one object group each, so no lock is held for more than a few seconds.
  - **On a lock timeout (55P03):** retry once, then STOP and report. Never raise a timeout to force a run.
  - **Script structure (INC-7):** every script wraps its work in `try/finally`, which runs ROLLBACK and then `client.end()`. On SIGINT / SIGTERM it runs ROLLBACK first. `withLiveTransaction(client, fn)` and `installStopHandler(client)` in `scripts/db/live-safety.cjs` do both.
  - **Session check (INC-7):** before starting any live DB work, and after stopping any, run `node scripts/ci/db-sessions.cjs` (read-only) and report your own leftover sessions.
  - **Never terminate sessions yourself:** report the pid to the owner.
  - **Orphaned sessions:** `idle_in_transaction_session_timeout = '30s'` is also set, so a session whose client died mid-transaction ends itself and releases its locks. (Incident 2026-10-25: a stopped 102 smoke left a pooled backend "idle in transaction (aborted)" holding ACCESS EXCLUSIVE locks on 27 tables; the server default is 0, meaning never. The owner terminated that one backend.)
- **GIT-SAFETY (permanent rule, 2026-10-25):** never run `git stash`, `git reset --hard`, `git checkout -- <path>` or `git clean` on a dirty tree. Commit work in progress to a local branch instead, for example `git switch -c wip/<topic>` and `git commit`. (Observed 2026-10-25: a stray `git stash` hid uncommitted AGE-18 work. It was restored with `git stash pop` and nothing was lost.)
- **Read-only investigation sessions:** use transaction-scoped `BEGIN READ ONLY … ROLLBACK`. Do **not** run session-level `SET default_transaction_read_only = on` through the Supavisor transaction pooler (port 6543). The setting persists on the pooled backend and later clients inherit read-only sessions. (Observed in DRIFT-1b and reset with `RESET default_transaction_read_only`.)

## 1. Backup (mandatory) — standard procedure: BACKUP-RESILIENT-1

```bash
node scripts/db/backup.cjs pre-<change-name> --resilient
```

Backup before a migration is **mandatory** (architect ruling, 2026-10-17). It is made **resilient** rather than retried as one big dump. One dropped connection kills a monolithic `pg_dump`, and it leaves an orphaned session "idle in transaction" holding every table lock (QB-KEY-1: 4 failed dumps, 2 orphans terminated).

**How it works** (`scripts/db/backup-resilient.cjs`):

1. **Schema.** A `pg_dump --schema-only` of `public` and `auth` (custom format, about 1 MB, one short session) → `schema.dump`. It is checked with `pg_restore --list`.
2. **Data, per table.** Every table of `public` and `auth` gets its **own short session**: at most 4 run at a time, and each table has **at most 3 attempts**. Each session runs:
   ```sql
   BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ;
   SET LOCAL statement_timeout = '120s';
   SET LOCAL idle_in_transaction_session_timeout = '30s';
   SELECT to_jsonb(t)::text FROM <schema>.<table> t;   -- → <schema>.<table>.ndjson, one JSON row per line
   COMMIT;
   ```
   - **Timeouts.** They are set **for that transaction only**; nothing changes at server level. The Supavisor transaction pooler (port 6543) ignores startup options such as `PGOPTIONS`, so `SET LOCAL` inside the transaction is the only per-session setting that works.
   - **Why that matters.** If the client dies mid-read, the server ends the backend within 30 s. Observed: a killed run's backend disappeared on its own.
   - **Bounds.** Each session is also capped by a 300 s client-side limit.
3. **Orphans.** After **any** failed attempt, the script terminates only its **own** orphaned sessions before retrying, and records their PIDs in the manifest. An own orphan means: same DB user, idle in transaction for more than 5 s, running this script's or `pg_dump`'s own statement.
4. **Manifest and verification.** `manifest.json` records, per table: rows in the file, sha256, bytes and attempts. Then the script checks:
   - every `public` and `auth` table is present;
   - every file's sha256 and line count match the manifest;
   - every table's row count equals a **live count taken at the end**. A table that changed in the meantime is re-dumped, still within its 3 attempts.

   **The backup is valid only if the manifest verifies 100%** (`"verified": true`).
5. **If any table fails 3 times → BLOCKED: do not migrate.** The output names the table.

**Output:** `BACKUP_DIR/<label>-<stamp>-resilient/` containing `schema.dump`, `<schema>.<table>.ndjson` × N, `manifest.json` and `backup.log`. `BACKUP_DIR` is outside the repo; backup files are **never committed**.

**Runner gate:** `apply-migration.cjs` refuses to apply unless the newest backup is **less than 60 minutes old** and valid. Valid means either:
- a classic `*-public.dump` that passes `pg_restore --list`, or
- a `*-resilient/` directory whose manifest is verified and whose files' sha256 values re-check.

The classic monolithic mode (`node scripts/db/backup.cjs <label>`) still exists for a stable network (e.g. CI).

**Requirements:** PostgreSQL client tools whose major version is at least the server's (17). The default `PG_BIN` is `C:\Program Files\PostgreSQL\17\bin`. Verified TLS only (`PROD_CA_PATH`). The script prints no secrets, hosts or connection strings.

## 2. Pre-check (dry-run)

```bash
node scripts/db/apply-migration.cjs supabase/migrations/<file>.sql --dry-run
```

- **What it does:** runs the whole file plus the ledger insert in `BEGIN READ WRITE … ROLLBACK`.
- **Gate:** fix until it reports `DRY-RUN OK`.
- **Also run** any migration-specific read-only pre-check queries (data that would violate new constraints, duplicate keys, etc.) and record their results in the phase report.

## 3. Apply via the runner

```bash
node scripts/db/apply-migration.cjs supabase/migrations/<file>.sql
```

The runner refuses unless:
1. the ref guard passes;
2. TLS verifies;
3. a fresh, verified backup exists;
4. the file is not already `APPLIED` / `BASELINED` / `SUPERSEDED_NOT_APPLIED` in the ledger.

It then executes the file **and** writes the ledger row (`APPLIED`, checksum, tool, backup name) in **one transaction**. On error everything rolls back and a `FAILED` row is recorded.

## 4. Verify

- **REAL-ROLE VERIFY (permanent rule, 2026-10-26):** every migration smoke and verify must exercise each affected path as the role that calls it in production:
  - `service_role` for server writes;
  - the authenticated QA student (plus QA staff / admin where relevant) for client paths;
  - `anon` for public reads.

  A run as `postgres` / the owner alone **does not count as verified**. Owner rights hide missing grants. Observed in 095: a SECURITY INVOKER trigger called owner-only helpers, so every service-role vault insert failed, and 095's owner-run verify passed anyway. Fixed by 110.
- **Migration checklist, verify step:** for every function, trigger, policy or grant the migration touches, list which roles reach it (service_role / authenticated / anon). Run at least one rolled-back call per role: the allowed path must succeed and the denied path must fail. Report each check per role.
- **SCHEDULED-CHECKS (permanent rule, 2026-10-26):** no local background sleeps for timed checks; a sleeping machine kills them (the 2026-10-25 21:35 job never ran). A recurring or timed verify goes into a GitHub Actions scheduled workflow (read-only, existing secrets), or runs the next time the owner messages.
- Re-run the relevant DB suites. For question-bank changes: `node scripts/test_qf1_db.cjs` (all scenario writes are rolled back).
- Re-run the offline suites:
  ```bash
  node scripts/test_qf1_question_factory.cjs
  ```
  ```bash
  node scripts/test_sec1a_containment.cjs
  ```
- Run `npx tsc --noEmit`, `npm run lint` and `npm run build`.
- Compare read-only baseline row counts before and after. Every difference must be explained in the phase report.

## 5. Ledger check

```sql
BEGIN READ ONLY;
SELECT filename, status, superseded_by, applied_at, applied_by_tool, left(checksum_sha256, 12)
FROM public.schema_migration_ledger ORDER BY filename;
ROLLBACK;
```

## 6. Regenerate database types (TYPES-1, decision #24) — mandatory after every apply

```
npm run db:types        # regenerates types/database.ts from the live public schema
npm run db:types:check  # must print OK
npx tsc --noEmit -p .   # fix every error the new types surface (no new escapes; see docs/reports/types)
```

Commit the regenerated `types/database.ts` **in the same commit as the migration**. Never edit it by hand.

- `scripts/db/gen-types.cjs` is project-ref locked: the ref comes only from `.env.local` and must match
  the couragelibrary-next fingerprint, otherwise it exits 1. It generates `--schema public` only.
- It needs `SUPABASE_ACCESS_TOKEN` (personal access token) in `.env.local`. The token is never printed or committed.
- CI or a pre-commit check can run `npm run db:types:check`. It exits 1 when the committed types drift from the live schema.

## Restore

**Classic dump:** see `docs/reports/qf1/QF1B_DEV_DB_VERIFICATION_REPORT.md` §10 for the `pg_restore` command template. Pass the connection only through `PG*` environment variables, with `PGSSLMODE=verify-full` and `PGSSLROOTCERT=<CA path>`.

**Resilient backup (BACKUP-RESILIENT-1):**

1. **Schema (only if objects are lost).** Use `pg_restore --schema-only` from `schema.dump`, or restore selected objects with `pg_restore -l` / `-L`. After a migration, the normal path is the migration's rollback script; it restores definitions byte-exactly.
2. **Data, per table.** Do it in one transaction. Example for a single table:
   ```sql
   BEGIN;
   SET LOCAL statement_timeout = '120s';
   -- optional: TRUNCATE / DELETE the damaged rows first
   INSERT INTO public.<table> (<non-generated columns>)
   SELECT <non-generated columns>
   FROM jsonb_populate_recordset(NULL::public.<table>, $1::jsonb);  -- $1 = '[' || lines of <table>.ndjson joined by ',' || ']'
   -- verify count(*) against manifest.json, then COMMIT (or ROLLBACK)
   COMMIT;
   ```
   - Load parent tables before children: FK order follows `pg_restore -l schema.dump`.
   - Triggers still fire. For frozen QF-1 rows, restore through the documented rollback path instead.
3. **Dry test (proves the path):**
   ```bash
   node scripts/db/backup-resilient.cjs --restore-test <backup-dir>
   ```
   - It takes the smallest non-empty `public` table (≤ 50 rows) and recreates it in a temporary schema `bk_restore_test` with `CREATE TABLE … (LIKE …)`.
   - It loads the rows from the `.ndjson` file and compares count and row hash with live.
   - **Everything runs in one transaction that is rolled back**, so nothing persists.
