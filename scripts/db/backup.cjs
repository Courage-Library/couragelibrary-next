/**
 * COURAGE LIBRARY — DATABASE BACKUP
 *
 * pg_dump of schema `public` (schema + data) and schema `auth` (data only), custom format,
 * TLS verify-full, written OUTSIDE the repo (BACKUP_DIR, default E:/CourageLibrary-Backups),
 * then verified with `pg_restore --list`.
 *
 * Credentials are passed to pg_dump through PG* environment variables only; nothing secret
 * is printed. Requires PostgreSQL client tools ≥ server major (PG_BIN, default PostgreSQL 17).
 *
 * Usage: node scripts/db/backup.cjs [label]
 *        node scripts/db/backup.cjs [label] --resilient   (BACKUP-RESILIENT-1: per-table, manifest-verified; the standard
 *                                                         mode on an unreliable network — see backup-resilient.cjs)
 */
if (process.argv.includes('--resilient')) {
  require('./backup-resilient.cjs');
  return;
}
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, dbTarget, redactor } = require('./_db-env.cjs');

const target = dbTarget();
const redact = redactor(target);
const label = (process.argv[2] || 'manual').replace(/[^a-zA-Z0-9_-]/g, '');
const dir = path.resolve(target.backupDir);

if (dir.toLowerCase().startsWith(path.resolve(ROOT).toLowerCase())) {
  console.error('BACKUP_DIR must be outside the repository.');
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });

const bin = (n) => path.join(target.pgBin, process.platform === 'win32' ? `${n}.exe` : n);
const env = {
  ...process.env,
  PGHOST: target.pg.host,
  PGPORT: String(target.pg.port),
  PGUSER: target.pg.user,
  PGPASSWORD: target.pg.password,
  PGDATABASE: target.pg.database,
  PGSSLMODE: 'verify-full',
  PGSSLROOTCERT: target.caPath,
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const files = {
  public: path.join(dir, `${label}-${stamp}-public.dump`),
  auth: path.join(dir, `${label}-${stamp}-auth-data.dump`),
};

function dump(args, name) {
  try {
    execFileSync(bin('pg_dump'), [...args, '--no-password'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error(`${name} dump FAILED: ${redact(e.stderr || e.message).slice(0, 400)}`);
    process.exit(1);
  }
}
dump(['--format=custom', '--schema=public', '--file', files.public], 'public');
dump(['--format=custom', '--schema=auth', '--data-only', '--file', files.auth], 'auth');

function verify(file, schema) {
  const list = execFileSync(bin('pg_restore'), ['--list', file], { encoding: 'utf8' });
  const tables = list.split(/\r?\n/).filter((l) => new RegExp(` TABLE ${schema} `).test(l)).length;
  const data = list.split(/\r?\n/).filter((l) => new RegExp(` TABLE DATA ${schema} `).test(l)).length;
  return { tables, data, size: fs.statSync(file).size };
}
const pub = verify(files.public, 'public');
const auth = verify(files.auth, 'auth');
if (pub.tables === 0 || pub.data === 0) {
  console.error('VERIFY FAILED: public dump has no tables/data entries.');
  process.exit(1);
}
const required = ['questions', 'question_versions', 'test_attempts'];
const listing = execFileSync(bin('pg_restore'), ['--list', files.public], { encoding: 'utf8' });
const missing = required.filter((t) => !new RegExp(` TABLE DATA public ${t} `).test(listing));
if (missing.length) {
  console.error(`VERIFY FAILED: missing table data for ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`BACKUP OK`);
console.log(`  public: ${files.public} (${pub.size} bytes, ${pub.tables} tables, ${pub.data} data entries)`);
console.log(`  auth:   ${files.auth} (${auth.size} bytes, ${auth.data} data entries)`);
