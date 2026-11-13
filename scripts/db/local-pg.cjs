#!/usr/bin/env node
/**
 * LOCAL-PG-1 (SYLLABUS-MAP-1 B1, owner rule 2026-11-12: "migrations written + tested locally"): a THROWAWAY local
 * PostgreSQL built from a resilient backup, so a new migration and its gate run without touching production.
 *   up     initdb (trust auth, localhost only) in --dir, start on --port, create the Supabase roles (service_role with
 *          BYPASSRLS) + the extensions schema, restore schema.dump (public + auth: tables, functions, triggers, RLS,
 *          grants), then load the DATA of the listed tables only (default: the non-personal syllabus / taxonomy / exam
 *          tables + the migration ledger) with triggers and FKs off (session_replication_role = replica).
 *   down   stop the server and delete --dir.
 * Never connects anywhere but localhost; reads the backup files only. The data dir and its logs stay outside the repo
 * (pass a scratch / temp --dir). Requires the PostgreSQL client + server binaries (--bin, default PG 17 on Windows).
 * Usage:
 *   node scripts/db/local-pg.cjs up --dir=<tmp> [--port=54329] [--backup=<…-resilient dir>] [--tables=a,b,…]
 *   node scripts/db/local-pg.cjs down --dir=<tmp> [--port=54329]
 */
require('./safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { Client } = require('pg');

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const CMD = process.argv[2];
const DIR = arg('dir');
const PORT = Number(arg('port', '54329'));
const BIN = arg('bin', 'C:/Program Files/PostgreSQL/17/bin');
const DEFAULT_TABLES = [
  'schema_migration_ledger', 'exams', 'exam_cycles', 'exam_categories', 'canonical_taxonomy_nodes', 'taxonomy_node_aliases', 'topics', 'subjects', 'subtopics',
  'exam_syllabus_versions', 'exam_syllabus_nodes', 'exam_syllabus_canonical_mappings',
];
const TABLES = arg('tables', DEFAULT_TABLES.join(',')).split(',').filter(Boolean);
const ROLES = ['anon', 'authenticated', 'authenticator', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'dashboard_user', 'pgbouncer', 'supabase_realtime_admin', 'supabase_replication_admin', 'supabase_read_only_user'];

const exe = (name) => path.join(BIN, process.platform === 'win32' ? `${name}.exe` : name);
const fail = (m) => {
  console.log(`LOCAL-PG: ${m}`);
  process.exit(1);
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

const local = (db = 'postgres') => {
  const c = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: db });
  c.on('error', () => {});
  return c;
};

async function up() {
  if (!DIR) fail('--dir is required');
  if (fs.existsSync(DIR) && fs.readdirSync(DIR).length) fail(`${DIR} is not empty (run "down" first)`);
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

  // the schema (public + auth); errors for Supabase-platform objects that do not exist locally are counted, not fatal
  const r = spawnSync(exe('pg_restore'), ['--no-owner', '-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', '-d', 'postgres', path.join(backup, 'schema.dump')], { encoding: 'utf8' });
  const errors = (r.stderr || '').split('\n').filter((l) => /error:/i.test(l));
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
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = `[${rows.slice(i, i + 500).join(',')}]`;
      const cols = (await d.query(`SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) c FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = ''`, [`public.${t}`])).rows[0].c;
      await d.query(`INSERT INTO public.${t} (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::public.${t}, $1::jsonb)`, [chunk]);
    }
    loaded.push(`${t}: ${rows.length}`);
  }
  await d.end();
  console.log(`LOCAL-PG up: port ${PORT}, backup ${path.basename(backup)}, restore errors ${errors.length} (restore-errors.log), data: ${loaded.join(' · ')}`);
}

function down() {
  if (!DIR) fail('--dir is required');
  const data = path.join(DIR, 'data');
  if (fs.existsSync(data)) spawnSync(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`LOCAL-PG down: ${DIR} removed`);
}

(async () => {
  if (CMD === 'up') await up();
  else if (CMD === 'down') down();
  else fail('usage: up | down --dir=<tmp>');
})().catch((e) => fail(String(e.message).slice(0, 300)));
