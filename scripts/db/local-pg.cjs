#!/usr/bin/env node
/**
 * LOCAL-PG-1 (SYLLABUS-MAP-1 B1, owner rule 2026-11-12: "migrations written + tested locally"): a THROWAWAY local
 * PostgreSQL built from a resilient backup, so a new migration and its gate run without touching production.
 * Setup and rules: docs/database/LOCAL_PG_TEST.md.
 *   up      initdb (trust auth) in --dir, start on 127.0.0.1:--port only; create STUB Supabase roles (service_role with
 *           BYPASSRLS) + the extensions schema; restore schema.dump (public + auth: tables, functions, triggers, RLS,
 *           grants — no rows); then load the DATA of the listed NON-PERSONAL tables only (default below) with triggers
 *           and FKs off (session_replication_role = replica). Restore failures are reported, never patched.
 *   apply   run ONE migration file the way the runner does: one transaction, the file + its ledger row (APPLIED,
 *           checksum = sha256 of the LF-normalised file, applied_by_tool "local-pg"); an error rolls everything back
 *   counts  row count + md5 per table (DEFAULT_TABLES + --extra=a,b) — hashes only, never row data; --compare=<before>
 *           hashes over the BEFORE columns and lists differences; --applied=<file> leaves that migration's ledger row out
 *   down    stop the server and delete --dir (the data folder); the binaries stay
 * Never connects anywhere but 127.0.0.1; reads the backup files only. --dir must be outside the repo.
 * Usage:
 *   node scripts/db/local-pg.cjs up     --dir=<data dir> [--port=54329] [--backup=<…-resilient dir>] [--bin=<pg bin>]
 *   node scripts/db/local-pg.cjs apply  --file=supabase/migrations/<file>.sql [--port=54329]
 *   node scripts/db/local-pg.cjs counts [--port=54329] [--extra=t1,t2] [--out=<file.json>] [--compare=<before.json>] [--applied=<file>.sql]
 *   node scripts/db/local-pg.cjs down   --dir=<data dir> [--bin=<pg bin>]
 */
require('./safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { Client } = require('pg');
const { fileChecksum } = require('./_db-env.cjs');
const { safeBegin } = require('./live-safety.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const CMD = process.argv[2];
const DIR = arg('dir');
const PORT = Number(arg('port', '54329'));
const BIN = arg('bin', process.env.LOCAL_PG_BIN || 'C:/pg17-local/pgsql/bin');
/** non-personal tables only: no names, e-mails, answers or payments (owner rule 2026-11-14) */
const DEFAULT_TABLES = [
  'schema_migration_ledger', 'exams', 'exam_cycles', 'exam_categories', 'canonical_taxonomy_nodes', 'taxonomy_node_aliases', 'topics', 'subjects', 'subtopics',
  'exam_syllabus_versions', 'exam_syllabus_nodes', 'exam_syllabus_canonical_mappings',
];
const TABLES = arg('tables', DEFAULT_TABLES.join(',')).split(',').filter(Boolean);
/** stub roles a Supabase schema dump refers to (NOLOGIN; no passwords) */
const ROLES = ['anon', 'authenticated', 'authenticator', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'dashboard_user', 'pgbouncer', 'supabase_realtime_admin', 'supabase_replication_admin', 'supabase_read_only_user'];

const exe = (name) => path.join(BIN, process.platform === 'win32' ? `${name}.exe` : name);
const fail = (m) => {
  console.log(`LOCAL-PG: ${m}`);
  process.exit(1);
};
const local = () => {
  const c = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
};

function latestBackup() {
  const dir = arg('backup') || (() => {
    const base = process.env.BACKUP_DIR || 'E:/CourageLibrary-Backups';
    const all = fs.readdirSync(base).filter((d) => d.endsWith('-resilient')).map((d) => path.join(base, d));
    all.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return all[0];
  })();
  if (!dir || !fs.existsSync(path.join(dir, 'schema.dump'))) fail('no resilient backup with schema.dump found (pass --backup=…)');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.verified !== true) fail(`backup ${path.basename(dir)} is not verified`);
  return dir;
}

async function up() {
  if (!DIR) fail('--dir is required');
  if (path.resolve(DIR).toLowerCase().startsWith(ROOT.toLowerCase())) fail('--dir must be outside the repository');
  if (fs.existsSync(DIR) && fs.readdirSync(DIR).length) fail(`${DIR} is not empty (run "down" first)`);
  const version = execFileSync(exe('postgres'), ['--version'], { encoding: 'utf8' }).trim();
  if (!/\(PostgreSQL\) 17\./.test(version)) fail(`the local server must be PostgreSQL 17 like production (got: ${version})`);
  const backup = latestBackup();
  fs.mkdirSync(DIR, { recursive: true });
  const data = path.join(DIR, 'data');
  execFileSync(exe('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
  execFileSync(exe('pg_ctl'), ['-D', data, '-l', path.join(DIR, 'server.log'), '-o', `-p ${PORT} -c listen_addresses=127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });

  const c = local();
  await c.connect();
  for (const r of ROLES) await c.query(`CREATE ROLE ${r} NOLOGIN`);
  await c.query('CREATE ROLE service_role NOLOGIN BYPASSRLS');
  await c.query('GRANT anon, authenticated, service_role TO postgres');
  await c.query('CREATE SCHEMA extensions');
  for (const ext of ['pgcrypto', 'uuid-ossp', 'pg_trgm']) await c.query(`CREATE EXTENSION IF NOT EXISTS "${ext}" WITH SCHEMA extensions`);
  await c.end();

  // the schema (public + auth, no rows); failures for platform objects that do not exist locally are REPORTED as is
  const r = spawnSync(exe('pg_restore'), ['--no-owner', '-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', '-d', 'postgres', path.join(backup, 'schema.dump')], { encoding: 'utf8' });
  const errors = (r.stderr || '').split('\n').filter((l) => /error:/i.test(l)).map((l) => l.replace(/^pg_restore: error: /, '').slice(0, 220));
  fs.writeFileSync(path.join(DIR, 'restore-errors.log'), errors.join('\n'));

  const d = local();
  await d.connect();
  await d.query("SET session_replication_role = 'replica'");
  const loaded = [];
  for (const t of TABLES) {
    const f = path.join(backup, `public.${t}.ndjson`);
    if (!fs.existsSync(f)) {
      loaded.push(`${t}: no file`);
      continue;
    }
    const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
    const cols = (await d.query(`SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) c FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = ''`, [`public.${t}`])).rows[0].c;
    for (let i = 0; i < rows.length; i += 500) {
      await d.query(`INSERT INTO public.${t} (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::public.${t}, $1::jsonb)`, [`[${rows.slice(i, i + 500).join(',')}]`]);
    }
    loaded.push(`${t}: ${rows.length}`);
  }
  await d.end();
  console.log(`LOCAL-PG up: ${version}; 127.0.0.1:${PORT}; backup ${path.basename(backup)}`);
  console.log(`  data (non-personal tables only): ${loaded.join(' · ')}`);
  console.log(`  restore errors: ${errors.length}${errors.length ? ` (full list: ${path.join(DIR, 'restore-errors.log')})` : ''}`);
  const kinds = new Map();
  for (const e of errors) {
    const k = e.replace(/"[^"]*"/g, '"…"').replace(/\bCommand was:.*$/, '').slice(0, 120);
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }
  for (const [k, n] of [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${n} × ${k}`);
}

async function apply() {
  const file = arg('file');
  if (!file || !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(file)) fail('--file=supabase/migrations/<file>.sql');
  const sql = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const name = path.basename(file);
  const c = local();
  await c.connect();
  try {
    await safeBegin(c); // the shared helper (LIVE-LOCK-SAFETY timeouts), as for every script
    await c.query(sql);
    await c.query(`INSERT INTO public.schema_migration_ledger (filename, checksum_sha256, status, applied_at, applied_by_tool, notes) VALUES ($1, $2, 'APPLIED', now(), 'local-pg', 'LOCAL TEST ONLY')`, [name, fileChecksum(path.join(ROOT, file))]);
    await c.query('COMMIT');
    console.log(`LOCAL-PG apply: ${name} APPLIED (local only)`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`LOCAL-PG apply: ${name} REFUSED, rolled back — ${e.code || ''} ${String(e.message).slice(0, 200)}`);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

/**
 * Row count + md5 per table. With --compare=<before.json>, a table is hashed over the columns it had BEFORE (so a new
 * nullable column does not count as a change) and every difference is listed; exit 1 when an existing table changed.
 */
async function counts() {
  const extra = arg('extra', '').split(',').filter(Boolean);
  const before = arg('compare') ? JSON.parse(fs.readFileSync(arg('compare'), 'utf8')) : null;
  const c = local();
  await c.connect();
  const out = {};
  for (const t of [...DEFAULT_TABLES, ...extra]) {
    const reg = (await c.query('SELECT to_regclass($1) r', [`public.${t}`])).rows[0].r;
    if (!reg) {
      out[t] = null;
      continue;
    }
    const cols = (await c.query(`SELECT array_agg(attname::text ORDER BY attnum) c FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped`, [`public.${t}`])).rows[0].c;
    const use = before && before[t] ? before[t].cols.filter((x) => cols.includes(x)) : cols;
    const expr = `concat_ws(',', ${use.map((x) => `x.${JSON.stringify(x)}::text`).join(', ')})`;
    // --applied=<file>: the migration's OWN ledger row is left out, so the ledger compares like any other table
    const skip = t === 'schema_migration_ledger' && arg('applied') ? arg('applied') : null;
    const r = (await c.query(`SELECT count(*)::int n, md5(coalesce(string_agg(${expr}, '|' ORDER BY ${expr}), '')) h FROM public.${t} x${skip ? ' WHERE x.filename <> $1' : ''}`, skip ? [skip] : [])).rows[0];
    out[t] = { rows: r.n, md5: r.h.slice(0, 12), cols };
  }
  await c.end();
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
  console.log(`LOCAL-PG counts: ${Object.entries(out).map(([t, v]) => `${t} ${v ? `${v.rows}/${v.md5}` : '—'}`).join(' · ')}`);
  if (before) {
    const diffs = [];
    for (const [t, b] of Object.entries(before)) {
      const a = out[t];
      if (!b && !a) continue;
      if (!b) diffs.push(`${t}: NEW table (${a.rows} rows)`);
      else if (!a) diffs.push(`${t}: GONE`);
      else if (a.rows !== b.rows || a.md5 !== b.md5) diffs.push(`${t}: ${b.rows}/${b.md5} → ${a.rows}/${a.md5}`);
      else if (a.cols.length !== b.cols.length) diffs.push(`${t}: same rows, + column(s) ${a.cols.filter((x) => !b.cols.includes(x)).join(', ')}`);
    }
    const changed = diffs.filter((d) => !/NEW table|\+ column/.test(d));
    console.log(`LOCAL-PG compare: ${changed.length ? 'EXISTING DATA CHANGED' : 'existing data unchanged'}${diffs.length ? ` — ${diffs.join('; ')}` : ''}`);
    if (changed.length) process.exitCode = 1;
  }
}

function down() {
  if (!DIR) fail('--dir is required');
  const data = path.join(DIR, 'data');
  if (fs.existsSync(data)) spawnSync(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`LOCAL-PG down: ${DIR} removed (binaries kept)`);
}

(async () => {
  if (CMD === 'up') await up();
  else if (CMD === 'apply') await apply();
  else if (CMD === 'counts') await counts();
  else if (CMD === 'down') down();
  else fail('usage: up | apply | counts | down');
})().catch((e) => fail(String(e.message).slice(0, 300)));
