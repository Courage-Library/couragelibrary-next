#!/usr/bin/env node
/**
 * BACKUP-RESILIENCE-1 — LOCAL test of scripts/db/backup-resilient.cjs (docs/database/LOCAL_PG_TEST.md; never the project
 * database). Needs a throwaway local PostgreSQL (`node scripts/db/local-pg.cjs up --dir=…`). Steps:
 *   R-1 seed three LOCAL-only synthetic tables in it: a composite primary key (3,000 rows), wide rows (300 × ~6 KB) and
 *       one WITHOUT a primary key (150 rows) — plus the restored non-personal tables already there
 *   R-2 a clean backup → verified 100%
 *   R-3 a SLOW LINK (2 s pause inside every batch transaction) + FORCED CONNECTION DROPS in the middle of three tables →
 *       still verified 100%; every dropped table RESUMED from its last committed key; one table took > 30 s in total while
 *       each of its transactions stayed far below the 30 s idle limit
 *   R-4 restore that backup into a SECOND local database → every table identical to the source (rows + content hash)
 *   R-5 NEGATIVE CONTROLS (copies of the tool with a broken resume, in a scratch folder): resume from zero without
 *       truncating (duplicates) and resume past the failed batch (gaps) → the manifest must NOT verify
 *   R-6 clean up: the synthetic tables and the test backups are removed
 *   R-7 D-detect: (a) the clean run checked its schema-dump session by name ("clear"); (b) a FORCED DROP during the
 *       schema dump (pg_dump killed) while a session under its application_name stays open in a transaction — what a
 *       pooler keeps when the client dies (BACKUP_TEST_SCHEMA_ORPHAN=1, local only) → the backup FAILS before any data,
 *       printing the pid and a pid-specific terminate statement; the tool terminates nothing (the session is still
 *       there when the check runs and is released by the test hook afterwards)
 * Run: node scripts/db/test-backup-resilience.cjs --port=54329 --out=<dir outside the repo> [--scratch=<dir>]
 */
require('./safe-net.cjs'); // SAFE-NET (the local server only; masks output all the same)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const PORT = arg('port', '54329');
const OUT = arg('out');
const SCRATCH = arg('scratch', OUT && path.join(OUT, 'scratch'));
if (!/^\d{4,5}$/.test(PORT) || !OUT || path.resolve(OUT).toLowerCase().startsWith(ROOT.toLowerCase())) {
  console.log('usage: --port=<local port> --out=<dir outside the repository>');
  process.exit(1);
}
let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + String(info).slice(0, 600) : ''}`);
};
const local = () => {
  const c = new Client({ host: '127.0.0.1', port: Number(PORT), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
};

function runBackup(script, label, env = {}, extra = []) {
  const r = spawnSync(process.execPath, [script, label, `--local=${PORT}`, `--out=${OUT}`, ...extra], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 900000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const dir = fs.readdirSync(OUT).filter((d) => d.startsWith(`${label}-`)).map((d) => path.join(OUT, d)).sort().pop();
  const manifest = dir && fs.existsSync(path.join(dir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) : null;
  return { status: r.status, out, dir, manifest };
}
const table = (m, name) => m.tables.find((e) => `${e.schema}.${e.table}` === name);

/** a copy of the tool with a BROKEN resume, in the scratch folder (requires resolved to the repo) */
function brokenCopy(name, from, to) {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/db/backup-resilient.cjs'), 'utf8');
  if (src.split(from).length !== 2) throw new Error(`${name}: anchor not found once`);
  fs.mkdirSync(SCRATCH, { recursive: true });
  const f = path.join(SCRATCH, `${name}.cjs`);
  const dbDir = path.join(ROOT, 'scripts/db').replace(/\\/g, '/');
  const pgDir = path.join(ROOT, 'node_modules/pg').replace(/\\/g, '/'); // the copy lives outside the repo
  fs.writeFileSync(f, src.replace(from, to).replace(/require\('\.\/([a-z_.-]+\.cjs)'\)/g, (_, m) => `require('${dbDir}/${m}')`).replace("require('pg')", `require('${pgDir}')`));
  return f;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = local();
  await c.connect();
  try {
    // R-1 synthetic tables (local only)
    await c.query(`DROP TABLE IF EXISTS public.bk_synth_composite, public.bk_synth_wide, public.bk_synth_nopk`);
    await c.query(`CREATE TABLE public.bk_synth_composite (a integer, b text, payload text NOT NULL, PRIMARY KEY (a, b))`);
    await c.query(`INSERT INTO public.bk_synth_composite SELECT g / 3, 'k' || (g % 3), md5(g::text) || repeat('x', g % 50) FROM generate_series(1, 3000) g`);
    await c.query(`CREATE TABLE public.bk_synth_wide (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), n integer NOT NULL, body text NOT NULL)`);
    await c.query(`INSERT INTO public.bk_synth_wide (n, body) SELECT g, repeat(md5(g::text), 190) FROM generate_series(1, 300) g`);
    await c.query(`CREATE TABLE public.bk_synth_nopk (x integer, y text)`);
    await c.query(`INSERT INTO public.bk_synth_nopk SELECT g % 40, 'row ' || g FROM generate_series(1, 150) g`);
    chk('R-1 synthetic tables: composite key 3,000 rows, wide 300 × ~6 KB, no key 150 rows', true);

    const TOOL = path.join(ROOT, 'scripts/db/backup-resilient.cjs');
    // R-2 clean
    const clean = runBackup(TOOL, 'r2-clean');
    chk('R-2 clean backup → verified 100%', clean.status === 0 && clean.manifest && clean.manifest.verified, clean.out.split('\n').slice(-3).join(' | '));
    const sc = clean.manifest && clean.manifest.schema && clean.manifest.schema.sessionCheck;
    chk('R-7a normal run: the schema-dump session was checked by its own name → clear', /^clear \(backup-schema-[0-9a-f]{8}-a1\)$/.test(sc || ''), sc);

    // R-7b forced drop during the schema dump, a session under its name left behind
    const orphan = runBackup(TOOL, 'r7-schema-orphan', { BACKUP_TEST_SCHEMA_ORPHAN: '1' });
    const om = orphan.manifest;
    const olog = orphan.dir && fs.existsSync(path.join(orphan.dir, 'backup.log')) ? fs.readFileSync(path.join(orphan.dir, 'backup.log'), 'utf8') : orphan.out;
    const left = (om && om.schemaSessionsLeft) || [];
    const pid = left[0] && left[0].pid;
    chk('R-7b forced drop during the schema dump + session left → the backup FAILS before any data',
      orphan.status !== 0 && om && om.verified !== true && /^schema session left open \(backup-schema-[0-9a-f]{8}-a1\)$/.test(om.failed || '') && !(om.tables || []).length,
      JSON.stringify({ status: orphan.status, failed: om && om.failed, tables: om && (om.tables || []).length }));
    const sqlRe = new RegExp(`pid ${pid} .*SELECT pg_terminate_backend\\(${pid}\\) FROM pg_stat_activity WHERE pid = ${pid} AND application_name = 'backup-schema-[0-9a-f]{8}-a1';`);
    chk('R-7c the log names the leftover: SESSION LEFT OPEN + pid + a pid-specific terminate statement for the owner',
      left.length === 1 && Number.isInteger(pid) && /SESSION LEFT OPEN/.test(olog) && sqlRe.test(olog),
      olog.split('\n').filter((l) => /schema/i.test(l)).join(' | ').slice(0, 500));
    const still = (await c.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'backup-schema-%'`)).rows[0].n;
    chk('R-7d the tool terminated nothing; the test hook released its session afterwards (none left now)', still === 0, `left now: ${still}`);

    // R-3 slow link + drops mid-table
    const drops = 'public.bk_synth_composite:5,public.bk_synth_wide:3,public.canonical_taxonomy_nodes:1';
    const slow = runBackup(TOOL, 'r3-slow-drops', { BACKUP_TEST_DELAY_MS: '2000', BACKUP_TEST_DROP: drops }, ['--batch-bytes=10000']);
    const m = slow.manifest;
    const comp = m && table(m, 'public.bk_synth_composite');
    const wide = m && table(m, 'public.bk_synth_wide');
    const nodes = m && table(m, 'public.canonical_taxonomy_nodes');
    const nopk = m && table(m, 'public.bk_synth_nopk');
    chk('R-3a slow link (2 s inside every batch) + 3 forced drops mid-table → verified 100%', slow.status === 0 && m && m.verified, slow.out.split('\n').slice(-4).join(' | '));
    chk('R-3b every dropped table resumed from its last committed key (one pass, ≥ 1 resume each; rows complete)',
      m && [comp, wide, nodes].every((e) => e && e.resumes >= 1 && e.attempts === 1) && comp.rows === 3000 && wide.rows === 300,
      JSON.stringify(m && [comp, wide, nodes].map((e) => e && { t: e.table, resumes: e.resumes, attempts: e.attempts, rows: e.rows, batches: e.batches })));
    chk('R-3c the composite table took > 30 s in total in many short transactions (each ≈ 2 s ≪ the 30 s idle limit)', comp && comp.ms > 30000 && comp.batches >= 15, JSON.stringify(comp && { ms: comp.ms, batches: comp.batches }));
    chk('R-3d the table without a primary key was read in one transaction and verified', nopk && nopk.key === null && nopk.batches === 1 && nopk.rows === 150, JSON.stringify(nopk));
    const logText = slow.dir ? fs.readFileSync(path.join(slow.dir, 'backup.log'), 'utf8') : '';
    chk('R-3e the log names each resume ("resuming from the last committed key")', (logText.match(/resuming from the last committed key/g) || []).length >= 3, logText.slice(0, 300));

    // R-4 restore into a second database and compare
    const rc = spawnSync(process.execPath, [path.join(ROOT, 'scripts/db/local-pg.cjs'), 'restore-check', `--backup=${slow.dir}`, '--into=restore_check', `--port=${PORT}`], { encoding: 'utf8', timeout: 600000 });
    chk('R-4 restored into a second local database → every table IDENTICAL (rows + content hash)', rc.status === 0 && /IDENTICAL/.test(rc.stdout), (rc.stdout || rc.stderr).trim());

    // R-5 negative controls: a broken resume must fail verification
    const neg = [
      ['neg_resume_from_zero', `      state.resumes += 1;`, `      state.resumes += 1;\n      state.lastKey = null; // BROKEN: restarts from zero, keeps the rows already written`],
      // after a resume the first batch read is NOT written (its key still advances): a gap
      ['neg_resume_loses_batch', `            fs.appendFileSync(file, rows.map((x) => x.r + '\\n').join(''));\n            const last`, `            if (!(state.resumes > 0 && !state.lost && (state.lost = true))) fs.appendFileSync(file, rows.map((x) => x.r + '\\n').join('')); // BROKEN\n            const last`],
    ];
    for (const [name, from, to] of neg) {
      const f = brokenCopy(name, from, to);
      const r = runBackup(f, `r5-${name.replace(/_/g, '-')}`, { BACKUP_TEST_DROP: 'public.bk_synth_composite:5' }, ['--batch-bytes=10000']);
      const bad = r.manifest && table(r.manifest, 'public.bk_synth_composite');
      chk(`R-5 ${name}: the broken resume → the manifest does NOT verify`, r.status !== 0 && r.manifest && r.manifest.verified === false && /bk_synth_composite/.test((r.manifest.problems || []).join(' ') + (r.manifest.failed || '')),
        JSON.stringify({ status: r.status, verified: r.manifest && r.manifest.verified, problems: r.manifest && r.manifest.problems, rows: bad && bad.rows }));
    }
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 400)}`);
  } finally {
    // R-6 clean up
    await c.query(`DROP TABLE IF EXISTS public.bk_synth_composite, public.bk_synth_wide, public.bk_synth_nopk`).catch(() => {});
    await c.query(`DROP DATABASE IF EXISTS restore_check`).catch(() => {});
    await c.end().catch(() => {});
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  console.log(ok ? 'BACKUP-RESILIENCE-1 local: ALL PASS' : 'BACKUP-RESILIENCE-1 local: FAILURES');
  process.exitCode = ok ? 0 : 1;
})();
