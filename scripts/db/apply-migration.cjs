/**
 * COURAGE LIBRARY — GUARDED MIGRATION RUNNER
 *
 * Usage:
 *   node scripts/db/apply-migration.cjs supabase/migrations/<file>.sql            # apply
 *   node scripts/db/apply-migration.cjs supabase/migrations/<file>.sql --dry-run  # BEGIN … ROLLBACK
 *
 * Refuses unless ALL hold:
 *   1. Project-ref guard passes (POSTGRES_URL_NON_POOLING ref == NEXT_PUBLIC_SUPABASE_URL ref).
 *   2. TLS verifies against PROD_CA_PATH (no bypass of any kind).
 *   3. (apply only) The newest backup in BACKUP_DIR is younger than 60 minutes and valid: either a *-public.dump that
 *      passes `pg_restore --list`, or a *-resilient/ directory whose manifest.json verified 100% (BACKUP-RESILIENT-1;
 *      its schema.dump and every table file's sha256 are re-checked here).
 *   4. The file is not already APPLIED / BASELINED / SUPERSEDED_NOT_APPLIED in
 *      public.schema_migration_ledger (if the ledger exists).
 *   5. (F1-a) The file contains NO top-level transaction control (BEGIN / COMMIT / ROLLBACK / END / SAVEPOINT …):
 *      the runner owns the transaction. A COMMIT inside the file ends it early, so a --dry-run would PERSIST the
 *      migration and its ledger row (incident 2026-10-25, 092). Function bodies ($$ … $$) and comments are ignored.
 *   Self-test: node scripts/db/apply-migration.cjs --self-test
 *
 * The migration and its ledger row are written in ONE transaction. On failure everything
 * rolls back and (if the ledger exists) a FAILED row is recorded in a separate transaction.
 * Prints no secrets.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const { ROOT, dbTarget, redactor, fileChecksum } = require('./_db-env.cjs');
const { isLockTimeout, installStopHandler, safeBegin } = require('./live-safety.cjs');

const TOOL = 'scripts/db/apply-migration.cjs';
const MAX_BACKUP_AGE_MS = 60 * 60 * 1000;

function fail(msg, code = 2) {
  console.error(`REFUSED: ${msg}`);
  process.exit(code);
}

/** Pure: the first top-level transaction-control statement in `sql` (outside $$ bodies, comments, strings), or null. */
function transactionControl(sql) {
  const stripped = String(sql)
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
  const m = stripped.match(/(?:^|;)\s*((?:BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|END|SAVEPOINT|RELEASE)\b[^;]*);/i);
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 40) : null;
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  const cases = [
    ['BEGIN;\nCREATE TABLE t (id int);\nCOMMIT;', 'BEGIN'], // live-safety: test data (never executed)
    ['CREATE TABLE t (id int);\ncommit;', 'commit'],
    ['CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$\nBEGIN\n  PERFORM 1;\nEND;\n$$;\nSELECT 1;', null],
    ['CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RETURN NEW; END; $function$;', null],
    ["-- COMMIT;\n/* ROLLBACK; */\nSELECT 'COMMIT;';", null],
    ["DO $$ BEGIN RAISE NOTICE 'x'; END $$;\nSTART TRANSACTION;", 'START TRANSACTION'], // live-safety: test data (never executed)
  ];
  let ok = true;
  for (const [sql, want] of cases) {
    const got = transactionControl(sql);
    if (got !== want) {
      ok = false;
      console.log(`apply-migration self-test FAIL: want ${want} got ${got}`);
    }
  }
  const dir = path.resolve(ROOT, 'supabase', 'migrations');
  const hits = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && transactionControl(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (hits.length) {
    ok = false;
    console.log(`apply-migration self-test FAIL: transaction control in ${hits.join(', ')}`);
  }
  // LIVE-LOCK-SAFETY: the runner sets the lock / statement timeouts right after BEGIN, at the rule's values
  const self = fs.readFileSync(__filename, 'utf8');
  const safety = require('./live-safety.cjs');
  if (!/await safeBegin\(c\);/.test(self) || !/await client\.query\(`BEGIN \$\{mode\}; \$\{LIVE_SAFETY_SQL\}`\);/.test(fs.readFileSync(require.resolve('./live-safety.cjs'), 'utf8')) || safety.LOCK_TIMEOUT !== '3s' || safety.STATEMENT_TIMEOUT !== '60s' || safety.IDLE_IN_TX_TIMEOUT !== '30s') {
    ok = false;
    console.log('apply-migration self-test FAIL: LIVE-LOCK-SAFETY defaults missing (BEGIN + lock_timeout 3s / statement_timeout 60s / idle-in-tx 30s in one round trip)');
  }
  console.log(`apply-migration self-test: ${ok ? 'OK' : 'FAIL'} — ${cases.length} cases, migrations clean, live-lock-safety on`);
  process.exit(ok ? 0 : 1);
}
const dryRun = args.includes('--dry-run');
const fileArg = args.find((a) => !a.startsWith('--'));
if (!fileArg) fail('usage: apply-migration.cjs <migration.sql> [--dry-run]');
const file = path.resolve(ROOT, fileArg);
if (!fs.existsSync(file) || !file.endsWith('.sql')) fail('migration file not found');
const migrationsDir = path.resolve(ROOT, 'supabase', 'migrations');
if (path.dirname(file).toLowerCase() !== migrationsDir.toLowerCase()) fail('migration must live in supabase/migrations');
const filename = path.basename(file);
const txn = transactionControl(fs.readFileSync(file, 'utf8'));
if (txn) fail(`the file contains transaction control ("${txn}"); the runner owns the transaction — remove it`);

let target;
try {
  target = dbTarget();
} catch (e) {
  fail(e.message);
}
const redact = redactor(target);

function verifyRecentBackup() {
  const dir = path.resolve(target.backupDir);
  if (!fs.existsSync(dir)) fail(`backup dir not found (${dir})`);
  const dumps = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('-public.dump') || (f.endsWith('-resilient') && fs.existsSync(path.join(dir, f, 'manifest.json'))))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!dumps.length) fail('no *-public.dump backup found; run scripts/db/backup.cjs first');
  const newest = dumps[0];
  if (Date.now() - newest.t > MAX_BACKUP_AGE_MS) fail(`newest backup is older than 60 minutes (${newest.f}); run scripts/db/backup.cjs`);
  const bin = path.join(target.pgBin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore');
  if (newest.f.endsWith('-resilient')) return verifyResilient(path.join(dir, newest.f), newest.f, bin);
  let list;
  try {
    list = execFileSync(bin, ['--list', path.join(dir, newest.f)], { encoding: 'utf8' });
  } catch {
    fail(`backup ${newest.f} failed pg_restore --list`);
  }
  if (!/ TABLE DATA public /.test(list)) fail(`backup ${newest.f} contains no public table data`);
  return newest.f;
}

function verifyResilient(bdir, name, bin) {
  const sha = (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  let m;
  try {
    m = JSON.parse(fs.readFileSync(path.join(bdir, 'manifest.json'), 'utf8'));
  } catch {
    fail(`backup ${name}: manifest.json unreadable`);
  }
  if (m.method !== 'BACKUP-RESILIENT-1' || m.verified !== true) fail(`backup ${name}: manifest not verified`);
  if (!m.schema || sha(path.join(bdir, m.schema.file)) !== m.schema.sha256) fail(`backup ${name}: schema.dump checksum mismatch`);
  try {
    execFileSync(bin, ['--list', path.join(bdir, m.schema.file)], { encoding: 'utf8' });
  } catch {
    fail(`backup ${name}: schema.dump failed pg_restore --list`);
  }
  if (!m.tables.some((e) => e.schema === 'public') || !m.tables.some((e) => e.schema === 'auth')) fail(`backup ${name}: public/auth tables missing`);
  for (const e of m.tables) {
    const f = path.join(bdir, e.file || '');
    if (!e.file || !fs.existsSync(f) || sha(f) !== e.sha256) fail(`backup ${name}: ${e.schema}.${e.table} file missing or checksum mismatch`);
  }
  return `${name} (resilient, ${m.tables.length} tables, ${m.summary.rows} rows, manifest verified)`;
}

(async () => {
  const backup = dryRun ? '(dry-run: backup not required)' : verifyRecentBackup();
  const checksum = fileChecksum(file);
  const sql = fs.readFileSync(file, 'utf8');

  const c = new Client(target.pg);
  c.on('error', () => undefined);
  try {
    await c.connect();
  } catch (e) {
    fail(`connection/TLS failed (${e.code || 'error'})`);
  }
  installStopHandler(c); // INC-7: SIGINT / SIGTERM → ROLLBACK first, then close

  const ledgerExists = (await c.query(`SELECT to_regclass('public.schema_migration_ledger') IS NOT NULL AS e`)).rows[0].e;
  if (ledgerExists) {
    const row = (await c.query(`SELECT status, checksum_sha256 FROM public.schema_migration_ledger WHERE filename = $1`, [filename])).rows[0];
    if (row && ['APPLIED', 'BASELINED', 'SUPERSEDED_NOT_APPLIED'].includes(row.status)) {
      await c.end();
      fail(`${filename} is already ${row.status} in schema_migration_ledger`);
    }
  }

  console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'} ${filename} | sha256 ${checksum.slice(0, 16)}… | backup: ${backup}`);
  const started = Date.now();
  try {
    // Explicit READ WRITE: never inherit a session default from a pooled backend.
    // LIVE-LOCK-SAFETY via the shared safeBegin: lock_timeout 3s, statement_timeout 60s, idle-in-transaction 30s sent in
    // the SAME round trip as BEGIN (a stalled connection can never hold a transaction without them; never raised)
    await safeBegin(c);
    await c.query(sql);
    const ledgerNow = (await c.query(`SELECT to_regclass('public.schema_migration_ledger') IS NOT NULL AS e`)).rows[0].e;
    if (!ledgerNow) {
      if (!dryRun) throw new Error('schema_migration_ledger does not exist; apply 20261012000064 first');
      await c.query('ROLLBACK');
      console.log(`DRY-RUN OK (rolled back; ledger not present yet, ledger row skipped) in ${Date.now() - started} ms`);
      await c.end();
      return;
    }
    await c.query(
      `INSERT INTO public.schema_migration_ledger (filename, checksum_sha256, status, applied_at, applied_by_tool, notes)
       VALUES ($1, $2, 'APPLIED', now(), $3, $4)
       ON CONFLICT (filename) DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, status = 'APPLIED',
         applied_at = EXCLUDED.applied_at, applied_by_tool = EXCLUDED.applied_by_tool, notes = EXCLUDED.notes
       WHERE public.schema_migration_ledger.status = 'FAILED'`,
      [filename, checksum, TOOL, dryRun ? 'dry-run' : `applied with backup ${backup}`]
    );
    const ok = (await c.query(`SELECT status FROM public.schema_migration_ledger WHERE filename = $1`, [filename])).rows[0];
    if (!ok || ok.status !== 'APPLIED') throw new Error('ledger row not written (unexpected existing status)');
    if (dryRun) {
      await c.query('ROLLBACK');
      console.log(`DRY-RUN OK (rolled back) in ${Date.now() - started} ms`);
    } else {
      await c.query('COMMIT');
      console.log(`APPLIED + ledger row written in ${Date.now() - started} ms`);
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    console.error(`${dryRun ? 'DRY-RUN' : 'APPLY'} FAILED (rolled back): ${e.code || ''} ${redact(e.message).slice(0, 500)}`);
    if (isLockTimeout(e)) console.error('LIVE-LOCK-SAFETY: lock timeout — make sure no other live session touches these objects, retry ONCE, then STOP and report.');
    if (!dryRun && ledgerExists) {
      await c
        .query(
          `INSERT INTO public.schema_migration_ledger (filename, checksum_sha256, status, applied_at, applied_by_tool, notes)
           VALUES ($1, $2, 'FAILED', now(), $3, $4)
           ON CONFLICT (filename) DO UPDATE SET status = 'FAILED', applied_at = now(), notes = EXCLUDED.notes
           WHERE public.schema_migration_ledger.status = 'FAILED'`,
          [filename, checksum, TOOL, redact(e.message).slice(0, 300)]
        )
        .catch(() => undefined);
    }
    await c.end();
    process.exit(1);
  }
  await c.end();
})();
