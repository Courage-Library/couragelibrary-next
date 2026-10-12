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
 *   3. (apply only) A *-public.dump in BACKUP_DIR newer than 60 minutes passes `pg_restore --list`.
 *   4. The file is not already APPLIED / BASELINED / SUPERSEDED_NOT_APPLIED in
 *      public.schema_migration_ledger (if the ledger exists).
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

const TOOL = 'scripts/db/apply-migration.cjs';
const MAX_BACKUP_AGE_MS = 60 * 60 * 1000;

function fail(msg, code = 2) {
  console.error(`REFUSED: ${msg}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find((a) => !a.startsWith('--'));
if (!fileArg) fail('usage: apply-migration.cjs <migration.sql> [--dry-run]');
const file = path.resolve(ROOT, fileArg);
if (!fs.existsSync(file) || !file.endsWith('.sql')) fail('migration file not found');
const migrationsDir = path.resolve(ROOT, 'supabase', 'migrations');
if (path.dirname(file).toLowerCase() !== migrationsDir.toLowerCase()) fail('migration must live in supabase/migrations');
const filename = path.basename(file);

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
    .filter((f) => f.endsWith('-public.dump'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!dumps.length) fail('no *-public.dump backup found; run scripts/db/backup.cjs first');
  const newest = dumps[0];
  if (Date.now() - newest.t > MAX_BACKUP_AGE_MS) fail(`newest backup is older than 60 minutes (${newest.f}); run scripts/db/backup.cjs`);
  const bin = path.join(target.pgBin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore');
  let list;
  try {
    list = execFileSync(bin, ['--list', path.join(dir, newest.f)], { encoding: 'utf8' });
  } catch {
    fail(`backup ${newest.f} failed pg_restore --list`);
  }
  if (!/ TABLE DATA public /.test(list)) fail(`backup ${newest.f} contains no public table data`);
  return newest.f;
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
    await c.query('BEGIN READ WRITE');
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
