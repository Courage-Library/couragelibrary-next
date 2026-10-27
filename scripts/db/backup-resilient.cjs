/**
 * COURAGE LIBRARY — RESILIENT DATABASE BACKUP (BACKUP-RESILIENT-1)
 *
 * The standard pre-migration backup when the network is unreliable: instead of one long pg_dump (which a single
 * dropped connection kills, leaving an orphaned session that holds every table lock), it backs up per object:
 *
 *   1. schema   pg_dump --schema-only of schemas public + auth (custom format; small, one short session)
 *   2. data     every table of public + auth, ONE short session per table (4 in flight), at most 3 attempts per table:
 *               safeBegin (scripts/db/live-safety.cjs): BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY + lock 3 s,
 *               statement 60 s, idle-in-transaction 30 s in one statement (LIVE-LOCK-SWEEP; was statement 120 s);
 *               SELECT to_jsonb(t) FROM <schema>.<table> t  → <schema>.<table>.ndjson (one JSON row per line)
 *               The timeouts are transaction-local (the Supavisor transaction pooler ignores startup options): if the
 *               client dies mid-read the server ends that backend within 30 s — no orphan can keep locks.
 *   3. orphans  after any failed attempt: own orphaned sessions (same DB user, idle in transaction, running this
 *               script's own statement) are terminated and their PIDs recorded, before the retry
 *   4. manifest manifest.json: table → rows in the file → sha256 → bytes → attempts; then VERIFY: every public + auth
 *               table present, every file's sha256 re-checked, and the row count of every file equal to a live count
 *               taken at the end (a table whose count changed meanwhile is re-dumped, still within its 3 attempts).
 *               The backup is valid ONLY if the manifest verifies 100% (manifest.verified = true).
 *
 * Output: BACKUP_DIR/<label>-<stamp>-resilient/ (outside the repo). scripts/db/apply-migration.cjs accepts a verified
 * resilient backup younger than 60 minutes. Restore path: docs/database/MIGRATION_RUNBOOK.md ("BACKUP-RESILIENT-1").
 * Verified TLS only (dbTarget / PROD_CA_PATH); prints no secrets, hosts or connection strings; every wait bounded.
 *
 * Usage: node scripts/db/backup.cjs <label> --resilient     (or: node scripts/db/backup-resilient.cjs <label>)
 *        node scripts/db/backup-resilient.cjs --restore-test <backup-dir>   (one small table into a temp schema, rolled back)
 */
const { safeBegin } = require('./live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const { ROOT, dbTarget, redactor } = require('./_db-env.cjs');

const target = dbTarget();
const redact = redactor(target);
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 4; // per-table sessions in flight at once (connection setup dominates on a slow link)
const SCHEMAS = ['public', 'auth'];
const OWN_STATEMENT = /SELECT to_jsonb\(t\) FROM "|^COPY |FROM pg_catalog\.|pg_depend|LOCK TABLE/;

const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errCode = (e) => (e && (e.code || (e.cause && e.cause.code))) || 'ERROR';

async function withClient(fn) {
  const c = new Client({ ...target.pg });
  c.on('error', () => {});
  const timer = setTimeout(() => c.end().catch(() => {}), 300000); // hard bound per session
  try {
    await c.connect();
    return await fn(c);
  } finally {
    clearTimeout(timer);
    await c.end().catch(() => {});
  }
}

/**
 * INC-7 / LIVE-LOCK-SAFETY: NEVER terminates a session — it REPORTS own orphaned sessions (pids) for the owner. Every
 * backup session sets idle_in_transaction_session_timeout = 30s, so an orphan ends itself. Returns the PIDs found.
 * (Before 2026-10-25 this terminated own orphans; the name and manifest field are kept for compatibility.)
 */
async function terminateOwnOrphans(log) {
  try {
    return await withClient(async (c) => {
      const rows = (await c.query(`SELECT pid, query FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND usename = current_user
            AND state IN ('idle in transaction', 'idle in transaction (aborted)')
            AND now() - state_change > interval '5 seconds'`)).rows.filter((r) => OWN_STATEMENT.test(r.query || ''));
      const found = rows.map((r) => r.pid);
      if (found.length) log(`  own orphaned session(s) found — NOT terminated, report to the owner: ${found.join(', ')} (they end within 30 s by idle_in_transaction_session_timeout)`);
      return found;
    });
  } catch (e) {
    log(`  orphan check failed (${errCode(e)}) — the 30 s idle-in-transaction timeout still bounds any orphan`);
    return [];
  }
}

async function listTables() {
  return withClient(async (c) => (await c.query(`SELECT n.nspname s, c.relname t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1) AND c.relkind IN ('r', 'p') ORDER BY 1, 2`, [SCHEMAS])).rows);
}

async function dumpTable(s, t, file) {
  return withClient(async (c) => {
    await safeBegin(c, { readOnly: true, isolation: 'REPEATABLE READ' });


    const rows = (await c.query(`SELECT to_jsonb(t)::text AS r FROM "${s}"."${t}" t`)).rows;
    await c.query('COMMIT');
    fs.writeFileSync(file, rows.map((x) => x.r).join('\n') + (rows.length ? '\n' : ''));
    return rows.length;
  });
}

const countLines = (file) => { const txt = fs.readFileSync(file, 'utf8'); return txt === '' ? 0 : txt.split('\n').filter((l) => l !== '').length; };

async function liveCounts(tables) {
  return withClient(async (c) => {
    await safeBegin(c, { readOnly: true });


    const out = {};
    for (const { s, t } of tables) out[`${s}.${t}`] = Number((await c.query(`SELECT count(*) n FROM "${s}"."${t}"`)).rows[0].n);
    await c.query('COMMIT');
    return out;
  });
}

async function backup(label) {
  const dir0 = path.resolve(target.backupDir);
  if (dir0.toLowerCase().startsWith(path.resolve(ROOT).toLowerCase())) throw new Error('BACKUP_DIR must be outside the repository');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(dir0, `${label}-${stamp}-resilient`);
  fs.mkdirSync(dir, { recursive: true });
  const logLines = [];
  const log = (m) => { logLines.push(m); console.log(m); try { fs.appendFileSync(path.join(dir, 'backup.log'), m + '\n'); } catch { /* final log written in finish() */ } };
  const manifest = { method: 'BACKUP-RESILIENT-1', label, stamp, schemas: SCHEMAS, schema: null, tables: [], orphansTerminated: [], verified: false };

  // 1. schema-only dump (bounded, ≤ 3 attempts)
  const bin = (n) => path.join(target.pgBin, process.platform === 'win32' ? `${n}.exe` : n);
  const env = { ...process.env, PGHOST: target.pg.host, PGPORT: String(target.pg.port), PGUSER: target.pg.user, PGPASSWORD: target.pg.password, PGDATABASE: target.pg.database, PGSSLMODE: 'verify-full', PGSSLROOTCERT: target.caPath };
  const schemaFile = path.join(dir, 'schema.dump');
  for (let a = 1; a <= MAX_ATTEMPTS; a++) {
    try {
      execFileSync(bin('pg_dump'), ['--format=custom', '--schema-only', ...SCHEMAS.flatMap((s) => ['--schema', s]), '--file', schemaFile, '--no-password'], { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
      const list = execFileSync(bin('pg_restore'), ['--list', schemaFile], { encoding: 'utf8', timeout: 60000 });
      manifest.schema = { file: 'schema.dump', sha256: sha256File(schemaFile), bytes: fs.statSync(schemaFile).size, tables: list.split(/\r?\n/).filter((l) => / TABLE (public|auth) /.test(l)).length, attempts: a };
      log(`schema: ok (attempt ${a}, ${manifest.schema.tables} tables, ${manifest.schema.bytes} bytes)`);
      break;
    } catch (e) {
      log(`schema: attempt ${a} failed (${redact(String(e.stderr || e.message)).split('\n')[0].slice(0, 120)})`);
      manifest.orphansTerminated.push(...(await terminateOwnOrphans(log)));
      if (a === MAX_ATTEMPTS) { manifest.failed = 'schema'; break; }
      await sleep(5000);
    }
  }
  if (manifest.failed) return finish(dir, manifest, logLines, false);

  // 2. data per table
  let tables;
  for (let a = 1; a <= MAX_ATTEMPTS && !tables; a++) {
    try { tables = await listTables(); } catch (e) { log(`table list: attempt ${a} failed (${errCode(e)})`); if (a < MAX_ATTEMPTS) await sleep(5000); }
  }
  if (!tables) { manifest.failed = 'table list'; return finish(dir, manifest, logLines, false); }
  log(`tables: ${tables.length} (${SCHEMAS.map((s) => `${s} ${tables.filter((x) => x.s === s).length}`).join(', ')})`);
  const entries = new Map();
  const dumpOne = async ({ s, t }, entry) => {
    const file = path.join(dir, `${s}.${t}.ndjson`);
    while (entry.attempts < MAX_ATTEMPTS) {
      entry.attempts += 1;
      try {
        const n = await dumpTable(s, t, file);
        Object.assign(entry, { file: path.basename(file), rows: n, sha256: sha256File(file), bytes: fs.statSync(file).size, error: null });
        return true;
      } catch (e) {
        entry.error = errCode(e);
        log(`  ${s}.${t}: attempt ${entry.attempts} failed (${entry.error})`);
        manifest.orphansTerminated.push(...(await terminateOwnOrphans(log)));
        if (entry.attempts < MAX_ATTEMPTS) await sleep(3000);
      }
    }
    return false;
  };
  for (const tb of tables) entries.set(`${tb.s}.${tb.t}`, { schema: tb.s, table: tb.t, attempts: 0 });
  const queue = [...tables];
  let done = 0;
  const worker = async () => {
    while (queue.length && !manifest.failed) {
      const tb = queue.shift();
      if (!(await dumpOne(tb, entries.get(`${tb.s}.${tb.t}`)))) { manifest.failed = manifest.failed || `${tb.s}.${tb.t}`; return; }
      if (++done % 20 === 0) log(`  ${done}/${tables.length} tables`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (manifest.failed) { manifest.tables = [...entries.values()]; return finish(dir, manifest, logLines, false); }

  // 3. verify: live counts at the end vs rows in each file; re-dump a drifted table within its attempts
  let live = null;
  for (let a = 1; a <= MAX_ATTEMPTS && !live; a++) {
    try { live = await liveCounts(tables); } catch (e) { log(`live counts: attempt ${a} failed (${errCode(e)})`); if (a < MAX_ATTEMPTS) await sleep(5000); }
  }
  if (!live) { manifest.failed = 'live counts'; manifest.tables = [...entries.values()]; return finish(dir, manifest, logLines, false); }
  for (const tb of tables) {
    const key = `${tb.s}.${tb.t}`;
    const entry = entries.get(key);
    while (entry.rows !== live[key] && entry.attempts < MAX_ATTEMPTS) {
      log(`  ${key}: ${entry.rows} rows in file vs ${live[key]} live — re-dumping`);
      if (!(await dumpOne(tb, entry))) break;
      try { live = { ...live, ...(await liveCounts([tb])) }; } catch { /* keep the old count; the check below decides */ }
    }
  }
  manifest.tables = [...entries.values()];
  manifest.liveCountsAtEnd = live;
  const problems = [];
  for (const e of manifest.tables) {
    const key = `${e.schema}.${e.table}`;
    const f = path.join(dir, e.file || '');
    if (!e.file || !fs.existsSync(f)) { problems.push(`${key}: file missing`); continue; }
    if (sha256File(f) !== e.sha256) problems.push(`${key}: sha256 mismatch`);
    if (countLines(f) !== e.rows) problems.push(`${key}: file rows ${countLines(f)} ≠ manifest ${e.rows}`);
    if (e.rows !== live[key]) problems.push(`${key}: rows ${e.rows} ≠ live ${live[key]}`);
  }
  const listed = new Set(manifest.tables.map((e) => `${e.schema}.${e.table}`));
  for (const tb of tables) if (!listed.has(`${tb.s}.${tb.t}`)) problems.push(`${tb.s}.${tb.t}: not in manifest`);
  if (!SCHEMAS.every((s) => manifest.tables.some((e) => e.schema === s))) problems.push('a schema has no tables in the manifest');
  manifest.problems = problems;
  return finish(dir, manifest, logLines, problems.length === 0);
}

function finish(dir, manifest, logLines, verified) {
  manifest.verified = verified;
  manifest.summary = {
    tables: manifest.tables.length,
    rows: manifest.tables.reduce((a, e) => a + (e.rows || 0), 0),
    bytes: manifest.tables.reduce((a, e) => a + (e.bytes || 0), 0) + (manifest.schema ? manifest.schema.bytes : 0),
    retries: manifest.tables.reduce((a, e) => a + Math.max(0, (e.attempts || 0) - 1), 0) + (manifest.schema ? manifest.schema.attempts - 1 : 0),
    orphansTerminated: manifest.orphansTerminated.length,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(dir, 'backup.log'), logLines.join('\n') + '\n');
  if (verified) {
    console.log(`BACKUP OK (resilient): ${path.basename(dir)} — ${manifest.summary.tables} tables, ${manifest.summary.rows} rows, retries ${manifest.summary.retries}, own orphans found (never terminated) ${manifest.summary.orphansTerminated}; manifest verified 100%`);
  } else {
    console.log(`BACKUP FAILED (resilient): ${manifest.failed ? `stopped at ${manifest.failed} after ${MAX_ATTEMPTS} attempts` : `manifest did not verify (${(manifest.problems || []).length} problem(s): ${(manifest.problems || []).slice(0, 5).join('; ')})`}`);
  }
  return verified;
}

/** restore dry-test: one small table into a temp schema inside a rolled-back transaction; compares row hashes */
async function restoreTest(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (!manifest.verified) throw new Error('manifest not verified');
  const pick = manifest.tables.filter((e) => e.schema === 'public' && e.rows > 0 && e.rows <= 50).sort((a, b) => a.rows - b.rows)[0];
  if (!pick) throw new Error('no small public table in the manifest');
  const lines = fs.readFileSync(path.join(dir, pick.file), 'utf8').split('\n').filter(Boolean); // raw JSON text: no numeric precision loss
  return withClient(async (c) => {
    await safeBegin(c);
    try {
      await c.query('CREATE SCHEMA bk_restore_test');
      await c.query(`CREATE TABLE bk_restore_test."${pick.table}" (LIKE public."${pick.table}" INCLUDING DEFAULTS INCLUDING GENERATED)`);
      const cols = (await c.query(`SELECT attname FROM pg_attribute WHERE attrelid = 'public."${pick.table}"'::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum`)).rows.map((r) => `"${r.attname}"`).join(', ');
      await c.query(`INSERT INTO bk_restore_test."${pick.table}" (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::public."${pick.table}", $1::jsonb)`, ['[' + lines.join(',') + ']']);
      const h = async (sch) => (await c.query(`SELECT count(*)::int n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) h FROM ${sch}."${pick.table}" x`)).rows[0];
      const restored = await h('bk_restore_test');
      const live = await h('public');
      console.log(`restore test: public.${pick.table} — ${restored.n} rows restored into a temp schema; row hash ${restored.h === live.h ? 'IDENTICAL' : 'DIFFERENT'} to live (${live.n} rows); rolled back`);
      return restored.h === live.h && restored.n === pick.rows;
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  });
}

if (require.main === module || process.argv.includes('--resilient')) {
  const args = process.argv.slice(2).filter((a) => a !== '--resilient');
  const ri = args.indexOf('--restore-test');
  const run = ri >= 0
    ? restoreTest(path.resolve(args[ri + 1])).then((ok) => process.exit(ok ? 0 : 1))
    : backup((args[0] || 'manual').replace(/[^a-zA-Z0-9_-]/g, '')).then((ok) => process.exit(ok ? 0 : 1));
  run.catch((e) => { console.error('ERROR', redact(String(e && e.message ? e.message : e)).slice(0, 200)); process.exit(1); });
}

module.exports = { backup, restoreTest };
