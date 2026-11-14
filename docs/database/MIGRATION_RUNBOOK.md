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
- **DEPLOY-BEFORE-ACTIVATE (permanent rule, architect 2026-10-30):** never activate a database-side template version, feature flag or config value before production runs the code that reads it.
  - **Order:** code to main → production deploy verified (push CI prod-smoke green, `/api/health` version = HEAD) → only then activate (`fn_prompt_template_activate`, a settings row, a flag).
  - A dry-run of the install script before the deploy is fine; the real run waits.
  - Code that lives on a branch (`mig/<nnn>`) waits for the merge to main and the production check.
  - (Observed 2026-10-30, LESSON-NODE-ID-1: LESSON template v3 was activated while production still ran code that neither appended the "ALLOWED NODE IDS" block nor accepted `THIS_TOPIC`. It was contained by cherry-picking the fix to main, e5851a8.)
- **Read-only investigation sessions:** use transaction-scoped `BEGIN READ ONLY … ROLLBACK`. Do **not** run session-level `SET default_transaction_read_only = on` through the Supavisor transaction pooler (port 6543). The setting persists on the pooled backend and later clients inherit read-only sessions. (Observed in DRIFT-1b and reset with `RESET default_transaction_read_only`.)

## 1. Backup (mandatory) — standard procedure: BACKUP-RESILIENT-1

```bash
node scripts/db/backup.cjs pre-<change-name> --resilient
```

Backup before a migration is **mandatory** (architect ruling, 2026-10-17). It is made **resilient** rather than retried as one big dump. One dropped connection kills a monolithic `pg_dump`, and it leaves an orphaned session "idle in transaction" holding every table lock (QB-KEY-1: 4 failed dumps, 2 orphans terminated).

**How it works** (`scripts/db/backup-resilient.cjs`):

1. **Schema.** A `pg_dump --schema-only` of `public` and `auth` (custom format, about 1 MB) → `schema.dump`, checked with `pg_restore --list`.
   - **pg_dump resets its own timeouts — so the schema dump is DETECTED, not prevented (D-detect, 2026-11-15).** `pg_dump` sends `SET statement_timeout = 0`, `lock_timeout = 0`, `idle_in_transaction_session_timeout = 0` and `transaction_timeout = 0` itself before it reads (seen in its binary and in a local server log). Startup options (`PGOPTIONS`) were also not honoured through the production connection. The dump session therefore cannot be limited; only `--lock-wait-timeout=10s` applies. On 2026-11-14 an orphaned dump session stayed for 23 min with 283 locks.
   - **Detection.** Each schema attempt runs under its own `application_name` `backup-schema-<run id>-a<attempt>`. After every attempt, whether it succeeded or failed, the script looks for that name in `pg_stat_activity` (polling up to 5 s):
     - none left → the manifest records `schema.sessionCheck: "clear (…)"`;
     - one left → **the backup FAILS** before any data. The log shows `SESSION LEFT OPEN` with the pid, state, age, lock count and a ready-to-run, pid-specific statement for the owner:
       ```sql
       SELECT pg_terminate_backend(<pid>) FROM pg_stat_activity WHERE pid = <pid> AND application_name = 'backup-schema-<run id>-a<n>';
       ```
       The tool **never terminates** a session itself. The owner ends it, then the backup is run again;
     - the check itself cannot run → the backup also FAILS.
   - **Probe (read-only).** Before relying on the tool on a connection, run it once:
     ```bash
     node scripts/db/backup-resilient.cjs --probe-session-limits
     ```
     It `SHOW`s `lock_timeout`, `statement_timeout` and `idle_in_transaction_session_timeout` **inside a batch transaction** (the same `safeBegin` as the data batches; expected 3s / 1min / 30s). It also checks that a session's `application_name` is visible in `pg_stat_activity` (the detection depends on it). It must print `→ HONOURED`; otherwise report it and do not rely on the backup.
   - **D-full (possible future phase, not built).** Preventing the leftover rather than detecting it would need a schema dump that does not go through `pg_dump`'s own session settings, e.g. a catalog-based dump in short limited transactions, or a server-side guard. Not planned until the owner asks for it.
2. **Data, per table, in keyset batches** (BACKUP-RESILIENCE-1). At most 4 tables run at a time. Each table is read in **primary-key order in batches**:
   - **One transaction per batch.** Each batch is its **own short read-only transaction**:
     ```sql
     -- safeBegin: BEGIN READ ONLY + lock 3 s, statement 60 s, idle-in-transaction 30 s (transaction-local, LIVE-LOCK-SAFETY)
     SELECT to_jsonb(t)::text, <key columns>::text FROM <schema>.<table> t
      WHERE (<key>) > (<last committed key>) ORDER BY <key> LIMIT <n>;
     COMMIT;   -- only now is the batch appended to <schema>.<table>.ndjson
     ```
   - **Batch size.** About 512 KB of rows, measured from the rows already read; the first batch is 50 rows; between 10 and 5,000 rows. Every transaction stays far below the 30 s idle limit, even on a slow link. On the hotspot, a whole-table read of `admin_audit_logs` / `exam_doc_versions` hit that limit (25P03, 2026-11-14).
   - **Resume.** A failed batch (dropped connection, timeout) is retried on a **new connection from the last committed key**, never from zero. A pass allows up to 5 failed batches; a table gets at most 3 full passes. A table **without a primary key** is read in one transaction (logged).
   - **Timeouts.** They are transaction-local (`SET LOCAL`); nothing changes at server level. If the client dies mid-read, the server ends the backend within 30 s. Each session is also capped by a 300 s client-side limit, after which the table resumes from its last key.
3. **Orphans.** After **any** failed attempt, the script **reports** its own orphaned sessions (pids) and **never terminates** them; they end themselves.
4. **Manifest and verification.** `manifest.json` records, per table: rows, sha256, bytes, batches, resumes, passes and duration. Then the script checks:
   - every `public` and `auth` table is present;
   - every file's sha256 and line count match the manifest;
   - every table's **row count AND content hash** equal the live ones taken at the end. The content hash is the md5 of the rows in the same order, computed by the server, so a duplicated or missing row fails even when the count happens to match.
   - A table that changed in the meantime is re-dumped **from zero** (within its 3 passes).

   **The backup is valid only if the manifest verifies 100%** (`"verified": true`).
5. **If a table cannot be completed in 3 passes → BLOCKED: do not migrate.** The output names the table.

Local proof: `node scripts/db/test-backup-resilience.cjs --port=<local port> --out=<dir>` (docs/database/LOCAL_PG_TEST.md). It covers a slow link, forced drops mid-table, a restore into a second database (identical), and broken-resume negative controls.

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
- **MIGRATION-LIVE-SET (permanent rule, architect 2026-10-28):** before pushing ANY migration, run locally (every DB access under LIVE-LOCK-SAFETY — `safeBegin` / `withLiveTransaction`) every live gate that touches the changed tables or functions, and ALWAYS these four, whatever the migration touches:
  1. `RLS` — `node scripts/test_sec_hotfix4_rls.cjs`
  2. `READERS` — `node scripts/test_gap2_4b_readers.cjs` (with the local server, see below)
  3. `SECDEF-RATCHET` — `node scripts/test_secdef_ratchet.cjs`
  4. the admin / student page smokes — `node scripts/live/with-server.cjs --port=3100 -- "node scripts/smoke/signed-in-smoke.cjs admin-pages http://localhost:3100" "node scripts/smoke/signed-in-smoke.cjs student-pages http://localhost:3100" "node scripts/test_gap2_4b_readers.cjs --base=http://localhost:3100"` (a local production build first: `npm run build`)

  Find the touching gates by grepping `scripts/` and `scripts/live/` for every changed table and function name; list them (and the four) with their results in the phase report. Why: CA-2's 116 passed its own smoke but broke RLS P-2 (a trigger calling a service-role-only helper turned an RLS denial into a "permission denied for function"), found only by the next CI dispatch because RLS was not in the local set.

  **Network exception (architect, 2026-10-28; first used for 121 / d707064).** A gate of the set that still fails after its 3 attempts may be waived for the push ONLY when ALL of these hold:
  - (a) the failure is proven network by the server log: `fetch failed`, or the page landed on `/auth/unavailable` ("We couldn't check your sign-in");
  - (b) every page and gate touched by the change passed locally;
  - (c) after the push, ONE manual CI dispatch (live=true, architect-approved) runs the full live suite.

  The report names the waived gate, the log evidence and the dispatch run, with its result per job. If any of the three does not hold, nothing is pushed.

- **LOCAL-FIRST (owner rule, 2026-11-01, until launch — overrides CI-LIVE-ON-BRANCH below until the owner says "release").** Build and test locally only: offline gates, typecheck, lint, build and local server checks. Commit on a feature branch. NO push to main, NO CI dispatch, NO production checks until the owner says "release". The one exception: any DB migration or data change still takes a backup first, because the DB is shared with production. Reports stay short.
- **CI-LIVE-ON-BRANCH (standing rule, architect 2026-10-28; this machine's network is unreliable).** For a migration `<nnn>`:
  1. **Locally:** backup (always `node scripts/db/backup.cjs pre-<nnn> --resilient`) → dry-run → the rolled-back real-role smoke → apply → **that migration's OWN live gate + the link snapshot compare + `db:types` / `db:types:check` + `tsc`**. These must pass locally.
  2. **The rest of MIGRATION-LIVE-SET runs in CI:** push the commit to a branch `mig/<nnn>`. ONE `workflow_dispatch` of the live jobs on that branch is pre-approved (`gh workflow run ci-gates.yml --ref mig/<nnn> -f live=true`), plus ONE retry if a failure is classified network (by the job log).
  3. **Merge** to `main` by fast-forward only when that run is green.
  4. Local live-set runs become optional.

  `gh` write scope = exactly that dispatch (and its one retry), nothing else.

  **Prerequisite (owner / architect, one-time; not done by the agent):** the `ci-live` environment allows deployments from `main` only. Its custom branch policy is `["main"]`, checked with a read-only `gh api` on 2026-10-28. The live jobs on `mig/<nnn>` get their secrets only after `mig/*` is added to that policy (repository Settings → Environments → ci-live → Deployment branches). Until then, a dispatch on a `mig/` branch fails at the environment gate.
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

## Migration checklist (every migration, in this order)

1. Backup (`backup.cjs`, or `backup-resilient.cjs` on a flaky network); younger than 60 minutes at apply.
2. Write the migration + its rollback (`docs/database/rollback/<n>_rollback.sql`); no BEGIN / COMMIT in the file.
3. Dry-run ALONE (`apply-migration.cjs <file> --dry-run`; no other live session on the same object group).
4. Chunked rolled-back smoke AS THE REAL ROLES (service_role / authenticated QA users / anon), with `--pre` running the
   migration inside each chunk (LIVE-LOCK-SAFETY via `safeBegin` / `withLiveTransaction`).
5. Apply (`apply-migration.cjs <file>`); ledger row APPLIED.
6. Live verify: the phase's live gate; the taxonomy link snapshot (`taxonomy-link-snapshot.cjs --compare`) for any
   change near the master tree; counts before / after explained.
7. **MIGRATION-LIVE-SET** (section 4): every touching live gate + RLS + READERS + SECDEF-RATCHET + the admin / student
   page smokes, run locally, results in the report.
8. Types: `npm run db:types` + `npm run db:types:check` + `npx tsc --noEmit -p .`.
9. The full offline list (new files staged first) → commit → push → CI green → report.

## Script output masking (SAFE-NET)

Owner ruling 2026-11-02: no script may print an IP address, a database / Supabase host, the project ref, a real e-mail,
a JWT or a key — not in a terminal, a CI log or a captured file, and not in an error.

- Every script under `scripts/` that connects (imports `pg`, `@supabase/supabase-js` or `@supabase/ssr`) requires
  `scripts/db/safe-net.cjs` **first**. Requiring it installs masking on stdout / stderr and masked crash handlers for the
  whole process; it also exports `mask()`, `pgClient()` and `supabaseAdmin()`.
- Gate `SAFE-NET` (`scripts/test_safe_net.cjs`, offline list) fails any tracked script that connects without it, or
  requires it only after the connection import; `--self-test` holds the negative controls.
- Fake test domains (`@courage-library.test`, `example.*`, `*.invalid`) stay readable; everything else is `[email]`.
- Ad-hoc scripts (scratch/, scratchpad) follow the same rule: require the wrapper, or pipe output through `mask()`.
- Before any DB write: a TLS check against GitHub, Vercel and Supabase must show the public roots (no
  `SELF_SIGNED_CERT_IN_CHAIN`); if interception appears, stop before the write and report.

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
