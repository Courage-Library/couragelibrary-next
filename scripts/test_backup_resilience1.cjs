#!/usr/bin/env node
/**
 * BACKUP-RESILIENCE-1 — offline gate for scripts/db/backup-resilient.cjs (the behaviour itself is proven on a local
 * PostgreSQL by scripts/db/test-backup-resilience.cjs: slow link, forced drops, restore = identical, broken resume fails).
 *   B-1 keyset batches: rows in primary-key order, WHERE (key) > (last key) … LIMIT; each batch its own safeBegin
 *       read-only transaction; the file only receives a batch AFTER its COMMIT; batch size adapts (≈ 512 KB, 10–5,000 rows)
 *   B-2 resume: a failed batch is retried on a NEW connection from the last committed key — the catch keeps lastKey and
 *       the rows already written; a pass gives up after 5 failed batches; a whole pass is retried at most 3 times
 *   B-3 the schema-dump session carries its own limits (PGOPTIONS idle 30 s / statement 120 s / lock 10 s +
 *       --lock-wait-timeout) and the read-only --probe-session-limits checks them; every session is closed in finally
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

test('B-3 schema-dump session limits (PGOPTIONS + --lock-wait-timeout); probe; sessions closed in finally', () => {
  assert(/const SCHEMA_SESSION_OPTIONS = '-c idle_in_transaction_session_timeout=30s -c statement_timeout=120s -c lock_timeout=10s';/.test(SRC), 'options');
  assert(/PGOPTIONS: SCHEMA_SESSION_OPTIONS,/.test(SRC) && /'--lock-wait-timeout=10000'/.test(SRC), 'pg_dump gets them');
  assert(/async function probeSessionLimits\(\)[\s\S]*options: SCHEMA_SESSION_OPTIONS[\s\S]*SHOW \$\{k\}/.test(SRC) && !/probeSessionLimits[\s\S]{0,900}(INSERT|UPDATE|DELETE|ALTER|CREATE)/.test(SRC.slice(SRC.indexOf('async function probeSessionLimits'))), 'read-only probe');
  assert(/finally \{\n\s+clearTimeout\(timer\);\n\s+await c\.end\(\)\.catch\(\(\) => \{\}\);/.test(SRC), 'withClient always closes');
});

test('B-4 verification: sha256 + rows = live + content hash = live (same order); method unchanged for the runner', () => {
  assert(/if \(fileContentMd5\(f\) !== live\[key\]\.md5\) problems\.push\(`\$\{key\}: content hash ≠ live`\);/.test(SRC), 'content hash');
  assert(/if \(e\.rows !== live\[key\]\.rows\) problems\.push/.test(SRC) && /if \(sha256File\(f\) !== e\.sha256\) problems\.push/.test(SRC), 'rows + sha256');
  assert(/string_agg\(to_jsonb\(t\)::text, E'\\\\n' ORDER BY \$\{orderBy\(tb\)\}\)/.test(SRC) && /const orderBy = \(tb\) =>/.test(SRC), 'the live hash uses the file order');
  assert(/method: 'BACKUP-RESILIENT-1'/.test(SRC) && /m\.method !== 'BACKUP-RESILIENT-1' \|\| m\.verified !== true/.test(read('scripts/db/apply-migration.cjs')), 'runner compatibility');
});

test('B-5 test hooks only in --local mode; the project target is dbTarget()', () => {
  assert(/if \(!LOCAL\) return dbTarget\(\);/.test(SRC) && /const TEST = target\.local\n\s+\? \{/.test(SRC) && /: \{ delayMs: 0, drops: new Map\(\) \}; \/\/ the hooks never run against the project database/.test(SRC), 'hooks gated on target.local');
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

console.log(`\nBACKUP-RESILIENCE-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
