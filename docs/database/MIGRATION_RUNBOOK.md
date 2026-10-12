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

- **Never edit an applied or baselined migration.** Every change is a new, forward-only file `supabase/migrations/YYYYMMDDNNNNNN_name.sql`.
- **Checksums:** sha256 of the file with CRLF normalized to LF.
- **Secrets:** no tool prints connection strings, hosts with project refs, keys or passwords.
- **Read-only investigation sessions:** use transaction-scoped `BEGIN READ ONLY … ROLLBACK`. Do **not** run session-level `SET default_transaction_read_only = on` through the Supavisor transaction pooler (port 6543). The setting persists on the pooled backend and later clients inherit read-only sessions. (Observed in DRIFT-1b and reset with `RESET default_transaction_read_only`.)

## 1. Backup (mandatory)

```bash
node scripts/db/backup.cjs pre-<change-name>
```

- **What it does:** `pg_dump` of `public` (schema + data) and `auth` (data only), custom format, verify-full TLS, written to `BACKUP_DIR` (default `E:\CourageLibrary-Backups`, must be outside the repo).
- **Verification:** `pg_restore --list` must succeed and contain table data.
- **Requirements:** PostgreSQL client tools whose major version is at least the server's (server is 17). Default `PG_BIN` is `C:\Program Files\PostgreSQL\17\bin`.
- **Freshness:** the runner refuses to apply unless a verified `*-public.dump` is **less than 60 minutes old**.

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

## Restore

See `docs/reports/qf1/QF1B_DEV_DB_VERIFICATION_REPORT.md` §10 for the `pg_restore` command template. Pass the connection only through `PG*` environment variables, with `PGSSLMODE=verify-full` and `PGSSLROOTCERT=<CA path>`.
