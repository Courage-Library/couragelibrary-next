#!/usr/bin/env node
/**
 * Q3 guard (offline): the live gate scripts/live/test_flags_live.cjs stays NON-WRITING (rule 2026-10-20: a gate's runs
 * must not commit client writes). Checks:
 *   FS-1 the QA PostgREST client only reads (no insert / update / upsert / delete / rpc through it)
 *   FS-2 every SQL write sits in the rolledBack() helper, whose finally is an unconditional ROLLBACK (no COMMIT anywhere)
 *   FS-3 QA identity asserted before connecting; page checks are GETs and SKIP while the flag is off
 *   FS-4 registered in the CI live job (not offline / not prod-smoke)
 * Run: node scripts/test_flags_live_static.cjs
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'scripts/live/test_flags_live.cjs'), 'utf8').replace(/\r\n/g, '\n');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
const check = (id, name, ok, info = '') => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${ok ? '' : ` — ${info}`}`);
};

check('FS-1', 'the QA PostgREST client only reads', !/sb\.(rpc|from\([^)]*\)\s*\.(insert|update|upsert|delete))/.test(code) && !/\.(insert|update|upsert|delete)\(/.test(code));
const helper = code.slice(code.indexOf('const rolledBack = async'), code.indexOf('const rpc = async'));
check('FS-2a', 'rolledBack(): safeBegin (LIVE-LOCK-SWEEP: timeouts + rollback on stop) … finally ROLLBACK (unconditional)', /await safeBegin\(pg\);[\s\S]*finally \{\s*await pg\.query\('ROLLBACK'\);\s*\}/.test(helper));
check('FS-2b', 'no COMMIT anywhere', !/COMMIT/i.test(code));
const outside = code.replace(/rolledBack\(async[\s\S]*?\}\)\);/g, '');
check('FS-2c', 'no SQL write outside rolledBack()', !/\b(insert into|update user_profiles|delete from)\b/i.test(outside), (outside.match(/\b(insert into|update \w+|delete from)\b/i) || [''])[0]);
check('FS-3', 'QA identity asserted first; page checks are GETs that SKIP when the flag is off',
  code.indexOf('assertQaEmail(EMAIL)') > 0 && code.indexOf('assertQaEmail(EMAIL)') < code.indexOf('pg.connect()') && /if \(process\.env\[flag\] !== 'true'\) return 'SKIP';/.test(code) && !/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(code));
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-gates.yml'), 'utf8').replace(/\r\n/g, '\n');
// CI-LIVE-SPLIT-1: the flags gate belongs to the live-gates job
const live = wf.slice(wf.indexOf('\n  live-gates:'), wf.indexOf('\n  prod-smoke:'));
check('FS-4', 'registered in the live-gates job only', /"\$Q FLAGS-LIVE -- node scripts\/live\/test_flags_live\.cjs \$B"/.test(live) && (wf.match(/test_flags_live\.cjs/g) || []).length === 1);

console.log(`\nFLAGS-LIVE static: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
