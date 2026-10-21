#!/usr/bin/env node
/**
 * Local-only files are never tracked (permanent gate; root cause: 221898e published two local-only reports).
 * Checks the git INDEX (tracked + staged), so a staged local-only file fails before it can be committed:
 *   - every path listed in docs/ops/LOCAL_ONLY_PATHS.txt (paths only, no content)
 *   - any docs/reports/**\/*_LOCAL*.md (local-only report naming pattern)
 *   - each listed path must also be git-ignored (so `git add -A` / `git add .` cannot pick it up)
 * Prints paths only. --self-test: plants a fake local-only file in a throwaway repo and proves the gate catches it.
 * Run: node scripts/test_no_local_only_tracked.cjs [--self-test]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIST = 'docs/ops/LOCAL_ONLY_PATHS.txt';
const PATTERN = /^docs\/reports\/(.+\/)?[^/]*_LOCAL[^/]*\.md$/i;

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

function readList(root) {
  const f = path.join(root, LIST);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** Pure: tracked paths that are local-only (listed or matching the pattern). */
function violations(tracked, listed) {
  const set = new Set(listed.map((p) => p.replace(/\\/g, '/')));
  return tracked.filter((p) => set.has(p) || PATTERN.test(p));
}

function check(root) {
  const ls = git(root, ['ls-files', '-z']);
  if (ls.status !== 0) throw new Error('git ls-files failed');
  const tracked = ls.stdout.split('\0').filter(Boolean);
  const listed = readList(root);
  const bad = violations(tracked, listed);
  const notIgnored = listed.filter((p) => git(root, ['check-ignore', '-q', '--no-index', p]).status !== 0);
  return { tracked: tracked.length, listed: listed.length, bad, notIgnored };
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-only-'));
  try {
    git(dir, ['init', '-q']);
    fs.mkdirSync(path.join(dir, 'docs/ops'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs/reports/sec'), { recursive: true });
    fs.writeFileSync(path.join(dir, LIST), '# test\ndocs/reports/sec/FAKE_AUDIT.md\n');
    fs.writeFileSync(path.join(dir, 'docs/reports/sec/FAKE_AUDIT.md'), 'planted\n');
    fs.writeFileSync(path.join(dir, 'docs/reports/sec/X_LOCAL_NOTE.md'), 'planted\n');
    fs.writeFileSync(path.join(dir, 'docs/reports/sec/PUBLIC_OK.md'), 'fine\n');
    git(dir, ['add', '-A']);
    const r1 = check(dir);
    const caught = r1.bad.sort().join(',') === 'docs/reports/sec/FAKE_AUDIT.md,docs/reports/sec/X_LOCAL_NOTE.md' && r1.notIgnored.length === 1;
    // clean state: untracked + ignored → passes
    git(dir, ['rm', '--cached', '-q', 'docs/reports/sec/FAKE_AUDIT.md', 'docs/reports/sec/X_LOCAL_NOTE.md']);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'docs/reports/**/*_LOCAL*.md\ndocs/reports/sec/FAKE_AUDIT.md\n');
    const r2 = check(dir);
    const clean = r2.bad.length === 0 && r2.notIgnored.length === 0;
    console.log(`  ${caught ? 'PASS' : 'FAIL'}  self-test: planted listed path + *_LOCAL* file staged → caught (${r1.bad.length}); not ignored → caught`);
    console.log(`  ${clean ? 'PASS' : 'FAIL'}  self-test: untracked + git-ignored → clean`);
    return caught && clean;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
if (process.argv.includes('--self-test')) {
  console.log('no-local-only-tracked self-test');
  const ok = selfTest();
  console.log(`\nno-local-only-tracked self-test: ${ok ? '2/2 passed' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}

const r = check(ROOT);
console.log('No local-only file tracked');
const ok1 = r.listed >= 1;
console.log(`  ${ok1 ? 'PASS' : 'FAIL'}  L-0 local-only list present and non-empty — ${r.listed} path(s) listed, ${r.tracked} tracked files scanned`);
console.log(`  ${r.bad.length ? 'FAIL' : 'PASS'}  L-1 no listed path and no docs/reports/**/*_LOCAL*.md is tracked or staged${r.bad.length ? ' — ' + r.bad.join(', ') : ''}`);
console.log(`  ${r.notIgnored.length ? 'FAIL' : 'PASS'}  L-2 every listed path is git-ignored${r.notIgnored.length ? ' — not ignored: ' + r.notIgnored.join(', ') : ''}`);
const passed = [ok1, !r.bad.length, !r.notIgnored.length].filter(Boolean).length;
console.log(`\nno-local-only-tracked: ${passed}/3 passed`);
process.exit(passed === 3 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { violations, readList, PATTERN };
