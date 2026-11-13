# Local PostgreSQL test for a new migration (LOCAL-PG-1)

**Owner rule (2026-11-12):** a migration is written and tested **locally** first. It is applied to the project database only per [MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md), with the owner present.

This page is the reusable local test. It uses a **throwaway** PostgreSQL on this PC, built from the latest resilient backup, and never touches the project database.

Tool: `scripts/db/local-pg.cjs` (commands `up`, `apply`, `counts`, `down`). The gate for each migration (e.g. `scripts/live/test_syllabus_map_b1.cjs`) runs against it with `--local=<port>`.

## Rules (owner conditions, 2026-11-14)

1. **Binaries:**
   - Download only from the official EnterpriseDB site.
   - The local **major version must equal production's**. Check it with a read-only `select version()`; production is 17.x.
   - Record the zip's SHA-256. EDB publishes no checksum for the binaries zip, so this is for the record only.
   - Unzip into a **quarantine** folder and run nothing.
   - **Delete the bundled `pgsql\pgAdmin 4\` folder before any check or use** (owner rule 2026-11-14). It is a GUI tool the test does not need. In the 17.12 zip it holds 63 `.exe`/`.dll` files, 56 of them not signed by EnterpriseDB: 44 unsigned, plus Microsoft- and Python-signed runtime files.
   - **The signature rule covers the PostgreSQL files only:** after pgAdmin 4 is removed, **every remaining `.exe` and `.dll` must carry a Valid Authenticode signature from EnterpriseDB** (17.12: 159 / 159). Any exception means: stop, report, and the owner deletes the quarantine folder.
   - Only then move `pgsql` to `C:\pg17-local\` (outside the repo, never in git). The owner deletes the quarantine folder.
2. **Data:**
   - The backup holds real user data. Only the **schema** (no rows) and the rows of **non-personal** tables are loaded: the migration ledger, exams, exam cycles and categories, the master tree and its aliases, the legacy subject/topic projections, and the syllabus versions, nodes and mappings.
   - Never auth users, profiles, attempts, answers, payments, tickets or audit logs.
   - The server listens on **127.0.0.1 only**.
   - Output is masked (SAFE-NET) and never prints row data; `counts` prints row counts and hashes only.
3. **Supabase objects:**
   - Minimal **stub roles** (NOLOGIN, no passwords): `anon`, `authenticated`, `service_role` (BYPASSRLS), `authenticator` and the platform roles a dump refers to.
   - An `extensions` schema with pgcrypto, uuid-ossp and pg_trgm.
   - **Anything that fails to restore is reported as it is**, grouped by kind; the dump is never edited.
4. **After the test:** `down` deletes the data folder. Only the binaries stay.

## One-time setup: binaries (PowerShell)

```powershell
# 1. production's major version (read-only transaction, rolled back, masked output) — must be 17
node -e "require('./scripts/db/safe-net.cjs'); const {pgClient}=require('./scripts/db/safe-net.cjs'); const {safeBegin}=require('./scripts/db/live-safety.cjs'); (async()=>{const c=pgClient(); await c.connect(); try { await safeBegin(c,{readOnly:true}); console.log((await c.query('select version() v')).rows[0].v.split(' on ')[0]); } finally { await c.query('ROLLBACK').catch(()=>{}); await c.end(); }})()"

# 2. download into an EMPTY quarantine folder (official EDB link: https://www.enterprisedb.com/download-postgresql-binaries)
#    17.12 zip read 2026-11-14: 386,263,884 bytes, SHA-256 A2CD8A774389347B70BE7748AC4A37EF43CB6EE539C5FC3E85AE264B15E4A04C
New-Item -ItemType Directory C:\pg17-quarantine
curl.exe -L -o C:\pg17-quarantine\pg.zip https://get.enterprisedb.com/postgresql/postgresql-17.12-1-windows-x64-binaries.zip
Get-FileHash C:\pg17-quarantine\pg.zip -Algorithm SHA256     # record it

# 3. unzip, run nothing, remove pgAdmin 4, check every remaining signature
Expand-Archive C:\pg17-quarantine\pg.zip C:\pg17-quarantine\x
Remove-Item -LiteralPath 'C:\pg17-quarantine\x\pgsql\pgAdmin 4' -Recurse -Force
$sig = Get-ChildItem C:\pg17-quarantine\x -Recurse -Include *.exe,*.dll | Get-AuthenticodeSignature
$ok = $sig | Where-Object { $_.Status -eq 'Valid' -and $_.SignerCertificate.Subject -match 'O="?EnterpriseDB' }
"$($ok.Count) / $($sig.Count) Valid + EnterpriseDB"   # must be equal (17.12: 159 / 159) → otherwise STOP and report

# 4. only then (the owner deletes C:\pg17-quarantine afterwards)
New-Item -ItemType Directory C:\pg17-local ; Move-Item C:\pg17-quarantine\x\pgsql C:\pg17-local\pgsql
```

## Each migration test (bash)

```bash
DIR=C:/pg17-data-test                  # outside the repo; deleted by "down"
node scripts/db/local-pg.cjs up --dir=$DIR            # schema + non-personal rows; reports restore errors
node scripts/db/local-pg.cjs counts --out=$TEMP/before.json
node scripts/db/local-pg.cjs apply --file=supabase/migrations/<new>.sql
node scripts/live/test_<gate>.cjs --local=54329        # the migration's DB gate, as the real (stub) roles, rolled back
node scripts/db/local-pg.cjs apply --file=supabase/migrations/<new>.sql   # re-run: must be REFUSED by its preflight
node scripts/db/local-pg.cjs counts --extra=<new tables> --compare=$TEMP/before.json --applied=<new>.sql   # BEFORE columns; its own ledger row left out

# rollback round trip (before every release)
node scripts/db/local-pg.cjs rollback --file=supabase/migrations/<new>.sql   # rollback file; ledger row → FAILED (092 precedent)
node scripts/db/local-pg.cjs counts --extra=<new tables> --compare=$TEMP/before.json --applied=<new>.sql --strict   # nothing of <new> left
node scripts/db/local-pg.cjs apply --file=supabase/migrations/<new>.sql       # must succeed again (FAILED → APPLIED, like the runner)
node scripts/live/test_<gate>.cjs --local=54329

# negative controls: a deliberately broken COPY of the migration (scratch file, never in the repo) must FAIL its check
node scripts/db/local-pg.cjs rollback --file=supabase/migrations/<new>.sql
node scripts/db/local-pg.cjs apply --file=supabase/migrations/<new>.sql --variant=<scratch>/neg_<check>.sql
node scripts/live/test_<gate>.cjs --local=54329        # expect FAIL on exactly that check
node scripts/db/local-pg.cjs down --dir=$DIR
```

**Pass** means all of these hold:
- The gate reports ALL PASS.
- The re-run is refused by the migration's preflight, with nothing changed.
- The rollback round trip works:
  - after the rollback, the `--strict` compare says "existing data unchanged", with no table, column or function of the migration left; the ledger row is `FAILED` with a note;
  - the next apply succeeds;
  - the gate passes again.
- Every negative control fails its target check and no other.
- `--compare` lists only the expected differences:
  - the ledger's own row for the new migration (`applied_by_tool = local-pg`) is left out of the ledger hash by `--applied`, so the ledger must compare unchanged;
  - new tables (empty);
  - new columns.

  A new column does not count as a change: tables are hashed over their columns from before.

The project database is then still untouched. The real apply follows MIGRATION_RUNBOOK.md, with the owner present:
1. backup;
2. one TLS check;
3. `--dry-run`;
4. apply;
5. verify (the same gate without `--local`);
6. ledger.

## Known limits of the local copy

- **Platform objects:** Supabase-only objects (storage, realtime, `pg_graphql`, `vault`, platform event triggers and grants to platform roles that are not stubbed) may fail to restore. They are listed in `<dir>/restore-errors.log` and summarised in the `up` output. A migration that depends on them cannot be proven locally; say so in its report.
- **Roles:** `auth.uid()` and RLS behave as in production for the stub roles. There are no real users, so a gate that needs a signed-in student must create one inside its rolled-back transaction.
- **Version:** the minor version may differ from production (e.g. local 17.12, production 17.6). The major version must match.
