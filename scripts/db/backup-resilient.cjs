/**
 * COURAGE LIBRARY — RESILIENT DATABASE BACKUP (BACKUP-RESILIENT-1; BACKUP-RESILIENCE-1 2026-11-15)
 *
 * The standard pre-migration backup when the network is unreliable (the owner works on a mobile hotspot). Instead of one
 * long pg_dump (which a single dropped connection kills, leaving an orphaned session that holds every table lock), it
 * backs up per object:
 *
 *   1. schema   pg_dump --schema-only of schemas public + auth (custom format). BACKUP-RESILIENCE-1: the dump session
 *               carries its own limits (PGOPTIONS: idle_in_transaction_session_timeout 30 s, statement_timeout 120 s,
 *               lock_timeout 10 s; --lock-wait-timeout 10 s) so a client that dies can never leave it holding locks (the
 *               2026-11-14 orphan: 23 min, 283 locks). A transaction-mode pooler ignores startup options — the target is
 *               the NON-POOLING connection; check it once with the read-only probe in docs/database/MIGRATION_RUNBOOK.md.
 *   2. data     every table of public + auth in KEYSET BATCHES (BACKUP-RESILIENCE-1): rows in primary-key order, each
 *               batch its OWN short read-only transaction (safeBegin: lock 3 s, statement 60 s, idle-in-transaction
 *               30 s), sized to ~512 KB from the rows already read, appended to <schema>.<table>.ndjson only after its
 *               COMMIT. A failed batch (dropped connection, timeout) is retried on a new connection and RESUMES FROM THE
 *               LAST COMMITTED KEY — never from zero (up to 5 failed batches per pass). A table without a primary key is
 *               read in one transaction (logged). 4 tables in flight.
 *   3. orphans  after any failed attempt: own orphaned sessions are REPORTED (never terminated; they end themselves)
 *   4. verify   manifest.json (rows, sha256, bytes, batches, resumes per table), then: every public + auth table present;
 *               every file's sha256 re-checked; its rows = a live count AND its content hash = the live content hash
 *               (md5 of the rows in the same order, computed by the server at the end). A table that drifted meanwhile is
 *               re-dumped from zero (at most 3 passes). The backup is valid ONLY if the manifest verifies 100%.
 *
 * Output: BACKUP_DIR/<label>-<stamp>-resilient/ (outside the repo). scripts/db/apply-migration.cjs accepts a verified
 * resilient backup younger than 60 minutes. Restore: docs/database/MIGRATION_RUNBOOK.md ("BACKUP-RESILIENT-1").
 * Verified TLS only (dbTarget / PROD_CA_PATH); prints no secrets, hosts or connection strings; every wait bounded.
 *
 * Usage: node scripts/db/backup.cjs <label> --resilient     (or: node scripts/db/backup-resilient.cjs <label>)
 *        node scripts/db/backup-resilient.cjs --restore-test <backup-dir>   (one small table into a temp schema, rolled back)
 * LOCAL test mode (docs/database/LOCAL_PG_TEST.md; never the project database):
 *        node scripts/db/backup-resilient.cjs <label> --local=<port> --out=<dir> [--bin=<pg bin>] [--batch-bytes=N]
 *        test hooks, honoured ONLY with --local: BACKUP_TEST_DELAY_MS (pause inside every batch — a slow link),
 *        BACKUP_TEST_DROP=<schema.table>:<batch>[,…] (the client socket is destroyed at that batch on every pass)
 */
require('./safe-net.cjs'); // SAFE-NET: masks IPs / hosts / e-mails / keys in all output (scripts/db/safe-net.cjs)
const { safeBegin } = require('./live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const { ROOT, dbTarget, redactor } = require('./_db-env.cjs');

const ARGS = process.argv.slice(2);
const arg = (k) => (ARGS.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;
const LOCAL = arg('local');

/** The project database (verified TLS), or — with --local — a throwaway PostgreSQL on 127.0.0.1 only. */
function resolveTarget() {
  if (!LOCAL) return dbTarget();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const out = arg('out');
  if (!out) throw new Error('--local needs --out=<dir> (outside the repository)');
  return {
    pg: { host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: arg('db') || 'postgres' },
    caPath: null,
    backupDir: out,
    pgBin: arg('bin') || 'C:/pg17-local/pgsql/bin',
    local: true,
  };
}
const target = resolveTarget();
const redact = target.local ? (s) => s : redactor(target);
const TEST = target.local
  ? {
      delayMs: Number(process.env.BACKUP_TEST_DELAY_MS || 0),
      drops: new Map((process.env.BACKUP_TEST_DROP || '').split(',').filter(Boolean).map((d) => [d.slice(0, d.lastIndexOf(':')), Number(d.slice(d.lastIndexOf(':') + 1))])),
    }
  : { delayMs: 0, drops: new Map() }; // the hooks never run against the project database

/** the session limits of the schema dump (PGOPTIONS; checked by --probe-session-limits) */
const SCHEMA_SESSION_OPTIONS = '-c idle_in_transaction_session_timeout=30s -c statement_timeout=120s -c lock_timeout=10s';
const MAX_ATTEMPTS = 3; // schema dump / table list / live check, and full passes per table
const MAX_BATCH_FAILURES = 5; // failed batches per pass (each resumes from the last committed key)
const CONCURRENCY = 4;
const TARGET_BATCH_BYTES = Number(arg('batch-bytes') || 512 * 1024);
const MIN_BATCH_ROWS = 10;
const MAX_BATCH_ROWS = 5000;
const SCHEMAS = ['public', 'auth'];
const OWN_STATEMENT = /SELECT to_jsonb\(t\)|^COPY |FROM pg_catalog\.|pg_depend|LOCK TABLE/;

const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errCode = (e) => (e && (e.code || (e.cause && e.cause.code))) || 'ERROR';
const qi = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function withClient(fn) {
  const c = new Client({ ...target.pg });
  c.on('error', () => {});
  const timer = setTimeout(() => c.end().catch(() => {}), 300000); // hard bound per session
  try {
    await c.connect();
    return await fn(c);
  } finally {
    clearTimeout(timer);
    await c.end().catch(() => {}); // always closed, error or not
  }
}

/** NEVER terminates a session — it REPORTS own orphaned sessions (pids). Every session here ends itself (timeouts). */
async function reportOwnOrphans(log) {
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

/** tables + their primary-key columns (in key order) and types */
async function listTables() {
  return withClient(async (c) => {
    const rows = (await c.query(`
      SELECT n.nspname s, c.relname t,
             (SELECT json_agg(json_build_object('col', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) ORDER BY array_position(i.indkey::int2[], a.attnum))
                FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::int2[])
               WHERE i.indrelid = c.oid AND i.indisprimary) AS key
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ANY($1) AND c.relkind IN ('r', 'p') ORDER BY 1, 2`, [SCHEMAS])).rows;
    return rows.map((r) => ({ s: r.s, t: r.t, key: r.key || null }));
  });
}

/** the ORDER BY of a table: its primary key, else the row text (a table without a key is read in one transaction) */
const orderBy = (tb) => (tb.key ? tb.key.map((k) => `t.${qi(k.col)}`).join(', ') : 'to_jsonb(t)::text');

/**
 * One FULL PASS over a table in keyset batches: a fresh file; each batch its own short read-only transaction; a failed
 * batch is retried on a new connection from the LAST COMMITTED KEY (state.lastKey) — the file only ever receives
 * committed batches. Returns { rows, batches, resumes }.
 */
async function dumpTablePass(tb, file, log) {
  const name = `${tb.s}.${tb.t}`;
  fs.writeFileSync(file, '');
  const state = { lastKey: null, rows: 0, batches: 0, resumes: 0, failures: 0, batchRows: Number(arg('batch-rows') || 50), dropped: new Set() };
  const from = `FROM ${qi(tb.s)}.${qi(tb.t)} t`;
  if (!tb.key) {
    // no primary key: one transaction (logged); a failure restarts the pass
    await withClient(async (c) => {
      await safeBegin(c, { readOnly: true });
      const rows = (await c.query(`SELECT to_jsonb(t)::text AS r ${from} ORDER BY ${orderBy(tb)}`)).rows;
      await c.query('COMMIT');
      fs.appendFileSync(file, rows.map((x) => x.r + '\n').join(''));
      state.rows = rows.length;
      state.batches = 1;
    });
    return state;
  }
  const keyCols = tb.key.map((k) => `t.${qi(k.col)}`);
  const keyOut = tb.key.map((k, i) => `t.${qi(k.col)}::text AS k${i}`).join(', ');
  const keyParams = (offset) => tb.key.map((k, i) => `$${offset + i}::${k.type}`).join(', ');
  for (;;) {
    try {
      const done = await withClient(async (c) => {
        for (;;) {
          const batchNo = state.batches;
          const drop = TEST.drops.get(name);
          if (drop !== undefined && drop === batchNo && !state.dropped.has(batchNo)) {
            state.dropped.add(batchNo); // TEST (local only): the link drops in the middle of the table
            c.connection.stream.destroy();
          }
          await safeBegin(c, { readOnly: true });
          const where = state.lastKey ? `WHERE (${keyCols.join(', ')}) > (${keyParams(2)})` : '';
          const params = state.lastKey ? [state.batchRows, ...state.lastKey] : [state.batchRows];
          const res = await c.query(`SELECT to_jsonb(t)::text AS r, ${keyOut} ${from} ${where} ORDER BY ${keyCols.join(', ')} LIMIT $1`, params);
          if (TEST.delayMs) await sleep(TEST.delayMs); // TEST (local only): a slow link inside the batch transaction
          await c.query('COMMIT');
          const rows = res.rows;
          if (rows.length) {
            fs.appendFileSync(file, rows.map((x) => x.r + '\n').join(''));
            const last = rows[rows.length - 1];
            state.lastKey = tb.key.map((_, i) => last[`k${i}`]);
            state.rows += rows.length;
            state.batches += 1;
            const bytes = rows.reduce((a, x) => a + x.r.length + 1, 0);
            if (!arg('batch-rows')) state.batchRows = Math.max(MIN_BATCH_ROWS, Math.min(MAX_BATCH_ROWS, Math.round(TARGET_BATCH_BYTES / Math.max(1, bytes / rows.length))));
          }
          if (rows.length < params[0]) return true;
        }
      });
      if (done) return state;
    } catch (e) {
      state.failures += 1;
      log(`  ${name}: batch ${state.batches + 1} failed (${errCode(e)}) — resuming from the last committed key (${state.rows} rows kept)`);
      if (state.failures >= MAX_BATCH_FAILURES) throw e;
      state.resumes += 1;
      await sleep(TEST.delayMs ? 200 : 3000);
    }
  }
}

const fileLines = (file) => {
  const txt = fs.readFileSync(file, 'utf8');
  return txt === '' ? [] : txt.split('\n').filter((l) => l !== '');
};
/** content hash of a file: md5 of its lines joined by "\n" (= the server's string_agg in the same order) */
const fileContentMd5 = (file) => crypto.createHash('md5').update(fileLines(file).join('\n'), 'utf8').digest('hex');

/** live row count + content hash per table — each table its own short read-only transaction */
async function liveCheck(tables) {
  return withClient(async (c) => {
    const out = {};
    for (const tb of tables) {
      await safeBegin(c, { readOnly: true });
      const r = (await c.query(`SELECT count(*)::bigint n, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY ${orderBy(tb)}), '')) h FROM ${qi(tb.s)}.${qi(tb.t)} t`)).rows[0];
      await c.query('COMMIT');
      out[`${tb.s}.${tb.t}`] = { rows: Number(r.n), md5: r.h };
    }
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
  const manifest = { method: 'BACKUP-RESILIENT-1', version: 'BACKUP-RESILIENCE-1', label, stamp, schemas: SCHEMAS, local: !!target.local, schema: null, tables: [], orphansTerminated: [], verified: false };
  if (target.local && (TEST.delayMs || TEST.drops.size)) log(`LOCAL TEST hooks: delay ${TEST.delayMs} ms per batch; drops ${[...TEST.drops].map(([t, b]) => `${t}@${b}`).join(', ') || 'none'}`);

  // 1. schema-only dump — the session carries its own timeouts (never left holding locks)
  const bin = (n) => path.join(target.pgBin, process.platform === 'win32' ? `${n}.exe` : n);
  const env = {
    ...process.env,
    PGHOST: target.pg.host,
    PGPORT: String(target.pg.port),
    PGUSER: target.pg.user,
    PGPASSWORD: target.pg.password || '',
    PGDATABASE: target.pg.database,
    PGSSLMODE: target.local ? 'disable' : 'verify-full',
    ...(target.local ? {} : { PGSSLROOTCERT: target.caPath }),
    PGOPTIONS: SCHEMA_SESSION_OPTIONS,
  };
  const schemaFile = path.join(dir, 'schema.dump');
  for (let a = 1; a <= MAX_ATTEMPTS; a++) {
    try {
      execFileSync(bin('pg_dump'), ['--format=custom', '--schema-only', '--lock-wait-timeout=10000', ...SCHEMAS.flatMap((s) => ['--schema', s]), '--file', schemaFile, '--no-password'], { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
      const list = execFileSync(bin('pg_restore'), ['--list', schemaFile], { encoding: 'utf8', timeout: 60000 });
      manifest.schema = { file: 'schema.dump', sha256: sha256File(schemaFile), bytes: fs.statSync(schemaFile).size, tables: list.split(/\r?\n/).filter((l) => / TABLE (public|auth) /.test(l)).length, attempts: a };
      log(`schema: ok (attempt ${a}, ${manifest.schema.tables} tables, ${manifest.schema.bytes} bytes)`);
      break;
    } catch (e) {
      log(`schema: attempt ${a} failed (${redact(String(e.stderr || e.message)).split('\n')[0].slice(0, 120)})`);
      manifest.orphansTerminated.push(...(await reportOwnOrphans(log)));
      if (a === MAX_ATTEMPTS) { manifest.failed = 'schema'; break; }
      await sleep(5000);
    }
  }
  if (manifest.failed) return finish(dir, manifest, logLines, false);

  // 2. data per table, in keyset batches
  let tables;
  for (let a = 1; a <= MAX_ATTEMPTS && !tables; a++) {
    try { tables = await listTables(); } catch (e) { log(`table list: attempt ${a} failed (${errCode(e)})`); if (a < MAX_ATTEMPTS) await sleep(5000); }
  }
  if (!tables) { manifest.failed = 'table list'; return finish(dir, manifest, logLines, false); }
  const noKey = tables.filter((x) => !x.key);
  log(`tables: ${tables.length} (${SCHEMAS.map((s) => `${s} ${tables.filter((x) => x.s === s).length}`).join(', ')}); without a primary key (one transaction each): ${noKey.length}`);
  const entries = new Map();
  /** one full pass of a table, at most MAX_ATTEMPTS passes */
  const dumpOne = async (tb, entry) => {
    const file = path.join(dir, `${tb.s}.${tb.t}.ndjson`);
    while (entry.attempts < MAX_ATTEMPTS) {
      entry.attempts += 1;
      try {
        const t0 = Date.now();
        const st = await dumpTablePass(tb, file, log);
        Object.assign(entry, { file: path.basename(file), rows: st.rows, batches: st.batches, resumes: (entry.resumes || 0) + st.resumes, ms: Date.now() - t0, sha256: sha256File(file), contentMd5: fileContentMd5(file), bytes: fs.statSync(file).size, error: null });
        return true;
      } catch (e) {
        entry.error = errCode(e);
        log(`  ${tb.s}.${tb.t}: pass ${entry.attempts} failed (${entry.error})`);
        manifest.orphansTerminated.push(...(await reportOwnOrphans(log)));
        if (entry.attempts < MAX_ATTEMPTS) await sleep(3000);
      }
    }
    return false;
  };
  for (const tb of tables) entries.set(`${tb.s}.${tb.t}`, { schema: tb.s, table: tb.t, key: tb.key ? tb.key.map((k) => k.col) : null, attempts: 0 });
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

  // 3. verify: live count + content hash at the end vs each file; a drifted table is re-dumped from zero
  let live = null;
  for (let a = 1; a <= MAX_ATTEMPTS && !live; a++) {
    try { live = await liveCheck(tables); } catch (e) { log(`live check: attempt ${a} failed (${errCode(e)})`); if (a < MAX_ATTEMPTS) await sleep(5000); }
  }
  if (!live) { manifest.failed = 'live check'; manifest.tables = [...entries.values()]; return finish(dir, manifest, logLines, false); }
  for (const tb of tables) {
    const key = `${tb.s}.${tb.t}`;
    const entry = entries.get(key);
    while ((entry.rows !== live[key].rows || entry.contentMd5 !== live[key].md5) && entry.attempts < MAX_ATTEMPTS) {
      log(`  ${key}: file ${entry.rows} rows / ${String(entry.contentMd5).slice(0, 8)} vs live ${live[key].rows} / ${live[key].md5.slice(0, 8)} — re-dumping from zero`);
      if (!(await dumpOne(tb, entry))) break;
      try { live = { ...live, ...(await liveCheck([tb])) }; } catch { /* keep the old value; the check below decides */ }
    }
  }
  manifest.tables = [...entries.values()];
  manifest.liveAtEnd = Object.fromEntries(Object.entries(live).map(([k, v]) => [k, v.rows]));
  const problems = [];
  for (const e of manifest.tables) {
    const key = `${e.schema}.${e.table}`;
    const f = path.join(dir, e.file || '');
    if (!e.file || !fs.existsSync(f)) { problems.push(`${key}: file missing`); continue; }
    if (sha256File(f) !== e.sha256) problems.push(`${key}: sha256 mismatch`);
    if (fileLines(f).length !== e.rows) problems.push(`${key}: file rows ${fileLines(f).length} ≠ manifest ${e.rows}`);
    if (e.rows !== live[key].rows) problems.push(`${key}: rows ${e.rows} ≠ live ${live[key].rows}`);
    if (fileContentMd5(f) !== live[key].md5) problems.push(`${key}: content hash ≠ live`);
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
    batches: manifest.tables.reduce((a, e) => a + (e.batches || 0), 0),
    resumes: manifest.tables.reduce((a, e) => a + (e.resumes || 0), 0),
    orphansTerminated: manifest.orphansTerminated.length,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(dir, 'backup.log'), logLines.join('\n') + '\n');
  if (verified) {
    console.log(`BACKUP OK (resilient): ${path.basename(dir)} — ${manifest.summary.tables} tables, ${manifest.summary.rows} rows, ${manifest.summary.batches} batches, ${manifest.summary.resumes} resume(s), re-dumps ${manifest.summary.retries}, own orphans found (never terminated) ${manifest.summary.orphansTerminated}; manifest verified 100%`);
  } else {
    console.log(`BACKUP FAILED (resilient): ${manifest.failed ? `stopped at ${manifest.failed}` : `manifest did not verify (${(manifest.problems || []).length} problem(s): ${(manifest.problems || []).slice(0, 5).join('; ')})`}`);
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

/**
 * READ-ONLY probe: does this connection honour startup options (a transaction-mode pooler ignores them)? Connects with
 * the same options the schema dump uses and SHOWs the three settings. Changes nothing.
 */
async function probeSessionLimits() {
  const c = new Client({ ...target.pg, options: SCHEMA_SESSION_OPTIONS });
  c.on('error', () => {});
  await c.connect();
  try {
    const show = async (k) => (await c.query(`SHOW ${k}`)).rows[0][k];
    const got = { idle_in_transaction_session_timeout: await show('idle_in_transaction_session_timeout'), statement_timeout: await show('statement_timeout'), lock_timeout: await show('lock_timeout') };
    const ok = got.idle_in_transaction_session_timeout === '30s' && got.statement_timeout === '2min' && got.lock_timeout === '10s';
    console.log(`session limits probe (read-only): ${JSON.stringify(got)} — ${ok ? 'HONOURED' : 'NOT honoured by this connection'}`);
    return ok;
  } finally {
    await c.end().catch(() => {});
  }
}

if (require.main === module || process.argv.includes('--resilient')) {
  const args = ARGS.filter((a) => a !== '--resilient' && !a.startsWith('--local=') && !a.startsWith('--out=') && !a.startsWith('--bin=') && !a.startsWith('--db=') && !a.startsWith('--batch-'));
  const ri = args.indexOf('--restore-test');
  const run = args.includes('--probe-session-limits')
    ? probeSessionLimits().then((ok) => process.exit(ok ? 0 : 1))
    : ri >= 0
    ? restoreTest(path.resolve(args[ri + 1])).then((ok) => process.exit(ok ? 0 : 1))
    : backup((args[0] || 'manual').replace(/[^a-zA-Z0-9_-]/g, '')).then((ok) => process.exit(ok ? 0 : 1));
  run.catch((e) => { console.error('ERROR', redact(String(e && e.message ? e.message : e)).slice(0, 200)); process.exit(1); });
}

module.exports = { backup, restoreTest };
