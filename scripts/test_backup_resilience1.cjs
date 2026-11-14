#!/usr/bin/env node
/**
 * BACKUP-RESILIENCE-1 — offline gate for scripts/db/backup-resilient.cjs (the behaviour itself is proven on a local
 * PostgreSQL by scripts/db/test-backup-resilience.cjs: slow link, forced drops, restore = identical, broken resume fails).
 *   B-1 keyset batches: rows in primary-key order, WHERE (key) > (last key) … LIMIT; each batch its own safeBegin
 *       read-only transaction; the file only receives a batch AFTER its COMMIT; batch size adapts (≈ 512 KB, 10–5,000 rows)
 *   B-2 resume: a failed batch is retried on a NEW connection from the last committed key — the catch keeps lastKey and
 *       the rows already written; a pass gives up after 5 failed batches; a whole pass is retried at most 3 times
 *   B-3 D-detect (pg_dump resets its own timeouts, so its session cannot be limited; owner ruling 2026-11-14): the
 *       attempt window [start, end] is read on the SERVER clock; after EVERY attempt (success or failure) a LEFTOVER =
 *       any session of the backup role, except the checking one, 'idle in transaction' / '… (aborted)' / 'active', whose
 *       xact_start (not backend_start: pooled backends are reused) lies in [start − 2 s, end] — NOT by application_name
 *       (the production pooler replaces it). A leftover, or a check that cannot run → the backup FAILS with pid + a
 *       pid-specific pg_terminate_backend statement for the owner; the tool never terminates anything. The read-only
 *       probe SHOWs the limits INSIDE a safeBegin transaction and finds its own idle transaction (session A) from
 *       session B with the same query. Every session is closed in finally
 *   B-7 negative controls: no check / leftover ignored / automatic terminate / backend_start window / a name filter /
 *       'active' or 'aborted' dropped / no 2 s margin / client-clock window → B-3 fails
 *   B-4 verification unchanged in kind and stronger: file sha256, rows = live count AND content hash = live content hash
 *       (same order); drift → re-dump from zero; the manifest method stays BACKUP-RESILIENT-1 (the runner accepts it)
 *   B-5 test hooks (delay / forced drop) are honoured ONLY in --local mode; the project target is dbTarget()
 *   B-6 negative controls: the two broken resumes of the local test (restart from zero / lose a batch) and a "reset on
 *       retry" mutation each make B-2's static check FAIL
 * Run: node scripts/test_backup_resilience1.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const SRC = read('scripts/db/backup-resilient.cjs');
const pass = (s) => s.slice(s.indexOf('async function dumpTablePass('), s.indexOf('const fileLines ='));

test('B-1 keyset batches, each its own read-only transaction; append only after COMMIT; adaptive size', () => {
  const p = pass(SRC);
  assert(/WHERE \(\$\{keyCols\.join\(', '\)\}\) > \(\$\{keyParams\(2\)\}\)/.test(p) && /ORDER BY \$\{keyCols\.join\(', '\)\} LIMIT \$1/.test(p), 'keyset WHERE / ORDER BY / LIMIT');
  const loop = p.slice(p.indexOf('for (;;) {\n          const batchNo'));
  const begin = loop.indexOf('await safeBegin(c, { readOnly: true });');
  const commit = loop.indexOf("await c.query('COMMIT');");
  const append = loop.indexOf('fs.appendFileSync(file');
  assert(begin > 0 && commit > begin && append > commit, 'BEGIN → SELECT → COMMIT → append');
  assert(/TARGET_BATCH_BYTES = Number\(arg\('batch-bytes'\) \|\| 512 \* 1024\)/.test(SRC) && /MIN_BATCH_ROWS = 10;/.test(SRC) && /MAX_BATCH_ROWS = 5000;/.test(SRC), 'adaptive batch size');
});

/** B-2's static check, as a function so the negative controls can run it on mutated sources */
function resumeCheck(s) {
  const p = pass(s);
  const catchBlock = p.slice(p.lastIndexOf('} catch (e) {'), p.lastIndexOf('} catch (e) {') + 600);
  if (!/state\.failures \+= 1;/.test(catchBlock) || !/if \(state\.failures >= MAX_BATCH_FAILURES\) throw e;/.test(catchBlock)) return 'catch: failures counted and bounded';
  if (/state\.(lastKey|rows)\s*=|writeFileSync\(file|state\.batches\s*=/.test(catchBlock)) return 'catch must keep lastKey / rows / the file (resume, not restart)';
  if (!/const done = await withClient\(async \(c\) =>/.test(p)) return 'a retry opens a NEW connection';
  if (!/state\.lastKey = tb\.key\.map\(\(_, i\) => last\[`k\$\{i\}`\]\);/.test(p)) return 'lastKey = the last committed row';
  const succ = p.slice(p.indexOf('if (rows.length) {'), p.indexOf('if (rows.length < params[0])'));
  if (!/^\s*if \(rows\.length\) \{\n\s*fs\.appendFileSync\(file, rows\.map\(\(x\) => x\.r \+ '\\n'\)\.join\(''\)\);/.test(succ)) return 'every committed batch is written, unconditionally';
  return null;
}

test('B-2 resume from the last committed key on a new connection; bounded failures and passes', () => {
  const why = resumeCheck(SRC);
  assert(why === null, why);
  assert(/const MAX_BATCH_FAILURES = 5;/.test(SRC) && /const MAX_ATTEMPTS = 3;/.test(SRC), 'bounds');
});

/** B-3's static check, as a function so the negative controls can run it on mutated sources */
function detectCheck(s) {
  const sqlStart = s.indexOf('const LEFTOVER_SQL = `');
  const sql = s.slice(sqlStart, s.indexOf('`;', sqlStart));
  if (sqlStart < 0) return 'LEFTOVER_SQL';
  if (!/WHERE a\.usename = current_user AND a\.pid <> pg_backend_pid\(\)/.test(sql)) return 'the backup role, except the checking session';
  if (!/a\.state IN \('idle in transaction', 'idle in transaction \(aborted\)', 'active'\)/.test(sql)) return 'the three states';
  if (!/AND a\.xact_start >= \$1::timestamptz - interval '2 seconds' AND a\.xact_start <= \$2::timestamptz/.test(sql)) return 'xact_start in [start − 2 s, end]';
  if (/backend_start|application_name|datname/.test(sql)) return 'no backend_start / application_name / database filter (fewer matches = missed leftovers)';
  const loop = s.slice(s.indexOf("const schemaFile = path.join(dir, 'schema.dump');"), s.indexOf('// 2. data per table'));
  const tryAt = loop.indexOf('    try {\n      execFileSync(');
  if (!/t0 = await serverNow\(\); \/\/ window start/.test(loop.slice(0, tryAt))) return 'window start on the server clock, before the dump';
  if (/PGOPTIONS/.test(s)) return 'no PGOPTIONS (pg_dump resets them; detect, not prevent)';
  if (!/'--lock-wait-timeout=10000'/.test(loop)) return '--lock-wait-timeout';
  const afterTry = loop.slice(loop.indexOf('    } catch (e) {', tryAt));
  if (!/\n {4}const t1 = await serverNow\(\)\.catch\(\(\) => null\); \/\/ window end/.test(afterTry)) return 'window end on the server clock, after every attempt';
  if (!/\n {4}const left = t1 === null \? null : await schemaSessionsLeft\(t0, t1, log\);/.test(afterTry)) return 'the session check runs after every attempt (outside try/catch)';
  if (!/\} else if \(left\.length\) \{\n\s+manifest\.failed = `schema session left open/.test(afterTry)) return 'a leftover FAILS the backup';
  if (!/if \(left === null\) \{\n\s+manifest\.failed =/.test(afterTry)) return 'a check that cannot run FAILS the backup';
  if (!/for \(const r of left\) log\(.*\$\{r\.pid\}.*\$\{terminateSql\(r\)\}/.test(afterTry)) return 'pid + statement printed for the owner';
  if (!/const terminateSql = \(r\) => `SELECT pg_terminate_backend\(\$\{r\.pid\}\) FROM pg_stat_activity WHERE pid = \$\{r\.pid\} AND xact_start = '\$\{r\.xact_start\}'::timestamptz;`;/.test(s)) return 'pid-specific terminate statement';
  if (/query\(\s*[`'"][^`'"]*pg_terminate_backend/i.test(s) || /pg_cancel_backend/.test(s)) return 'the tool must never terminate a session itself';
  const fn = s.slice(s.indexOf('async function schemaSessionsLeft('), s.indexOf('async function holdOrphanForTest('));
  if (!/c\.query\(LEFTOVER_SQL, \[t0, t1\]\)/.test(fn) || !/return null;/.test(fn)) return 'schemaSessionsLeft: LEFTOVER_SQL over the window, null on error';
  if (!/if \(!target\.local\) throw new Error\('test hook outside --local'\);/.test(s)) return 'the orphan hook is local-only';
  return null;
}

test('B-3 D-detect by xact_start window (server clock); leftover → FAIL + pid-specific terminate SQL; probe A/B', () => {
  const why = detectCheck(SRC);
  assert(why === null, why);
  const probe = SRC.slice(SRC.indexOf('async function probeSessionLimits'), SRC.indexOf("if (require.main === module"));
  assert(/await safeBegin\(a, \{ readOnly: true \}\);[\s\S]*SHOW \$\{k\}[\s\S]*b\.query\(LEFTOVER_SQL, \[t0, t1\]\)[\s\S]*await a\.query\('ROLLBACK'\);/.test(probe), 'probe: SHOW inside safeBegin in A, LEFTOVER_SQL from B, then rollback');
  assert(/const detectOk = stateA === 'idle in transaction';/.test(probe) && /return limitsOk && detectOk;/.test(probe) && /finally \{\n\s+await a\.end\(\)/.test(probe), 'probe passes only if A is found idle in transaction; A closed in finally');
  assert(/LOCK_TIMEOUT/.test(probe) && /STATEMENT_TIMEOUT/.test(probe) && /IDLE_IN_TX_TIMEOUT/.test(probe), 'probe compares with live-safety');
  assert(!/(INSERT|UPDATE|DELETE|ALTER|CREATE|pg_terminate_backend)/.test(probe), 'probe is read-only');
  assert(/finally \{\n\s+clearTimeout\(timer\);\n\s+await c\.end\(\)\.catch\(\(\) => \{\}\);/.test(SRC), 'withClient always closes');
});

test('B-4 verification: sha256 + rows = live + content hash = live (same order); method unchanged for the runner', () => {
  assert(/if \(fileContentMd5\(f\) !== live\[key\]\.md5\) problems\.push\(`\$\{key\}: content hash ≠ live`\);/.test(SRC), 'content hash');
  assert(/if \(e\.rows !== live\[key\]\.rows\) problems\.push/.test(SRC) && /if \(sha256File\(f\) !== e\.sha256\) problems\.push/.test(SRC), 'rows + sha256');
  assert(/string_agg\(to_jsonb\(t\)::text, E'\\\\n' ORDER BY \$\{orderBy\(tb\)\}\)/.test(SRC) && /const orderBy = \(tb\) =>/.test(SRC), 'the live hash uses the file order');
  assert(/method: 'BACKUP-RESILIENT-1'/.test(SRC) && /m\.method !== 'BACKUP-RESILIENT-1' \|\| m\.verified !== true/.test(read('scripts/db/apply-migration.cjs')), 'runner compatibility');
});

test('B-5 test hooks only in --local mode; the project target is dbTarget()', () => {
  assert(/if \(!LOCAL\) return dbTarget\(\);/.test(SRC) && /const TEST = target\.local\n\s+\? \{/.test(SRC) && /: \{ delayMs: 0, drops: new Map\(\), schemaOrphan: false \}; \/\/ the hooks never run against the project database/.test(SRC), 'hooks gated on target.local');
  assert(/host: '127\.0\.0\.1'/.test(SRC), 'local = 127.0.0.1 only');
});

test('B-6 negative controls: broken resumes make B-2 fail', () => {
  const muts = {
    'restart from zero': SRC.replace('      state.resumes += 1;', '      state.resumes += 1;\n      state.lastKey = null;'),
    'lose a batch after a resume': SRC.replace("            fs.appendFileSync(file, rows.map((x) => x.r + '\\n').join(''));\n            const last", "            if (!(state.resumes > 0 && !state.lost && (state.lost = true))) fs.appendFileSync(file, rows.map((x) => x.r + '\\n').join(''));\n            const last"),
    'truncate on retry': SRC.replace('      state.resumes += 1;', "      state.resumes += 1;\n      fs.writeFileSync(file, '');"),
  };
  for (const [k, m] of Object.entries(muts)) {
    assert(m !== SRC, `${k}: mutation did not apply`);
    assert(resumeCheck(m) !== null, `${k}: B-2 did not catch it`);
  }
  return `${Object.keys(muts).length} mutations caught`;
});

test('B-7 negative controls: weaker detection or an automatic terminate make B-3 fail', () => {
  const muts = {
    'no session check': SRC.replace('const left = t1 === null ? null : await schemaSessionsLeft(t0, t1, log);', 'const left = [];'),
    'leftover ignored': SRC.replace(/\} else if \(left\.length\) \{\n\s+manifest\.failed = `schema session left open \(\$\{appName\}\)`;/, '} else if (left.length) {'),
    'automatic terminate': SRC.replace('      manifest.schemaSessionsLeft = left;', '      manifest.schemaSessionsLeft = left;\n      for (const r of left) await withClient((c) => c.query(`SELECT pg_terminate_backend(${r.pid})`));'),
    'backend_start window': SRC.replace("AND a.xact_start >= $1::timestamptz - interval '2 seconds' AND a.xact_start <= $2::timestamptz", "AND a.backend_start >= $1::timestamptz - interval '2 seconds' AND a.backend_start <= $2::timestamptz"),
    'name filter': SRC.replace("     AND a.state IN ('idle in transaction'", "     AND a.application_name LIKE 'backup-schema-%'\n     AND a.state IN ('idle in transaction'"),
    "'active' dropped": SRC.replace("'idle in transaction (aborted)', 'active')", "'idle in transaction (aborted)')"),
    "'aborted' dropped": SRC.replace("('idle in transaction', 'idle in transaction (aborted)', 'active')", "('idle in transaction', 'active')"),
    'no 2 s margin': SRC.replace("$1::timestamptz - interval '2 seconds'", '$1::timestamptz'),
    'client-clock window': SRC.replace('t0 = await serverNow(); // window start', 't0 = new Date().toISOString(); // window start'),
  };
  for (const [k, m] of Object.entries(muts)) {
    assert(m !== SRC, `${k}: mutation did not apply`);
    assert(detectCheck(m) !== null, `${k}: B-3 did not catch it`);
  }
  return `${Object.keys(muts).length} mutations caught`;
});

console.log(`\nBACKUP-RESILIENCE-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
