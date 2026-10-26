#!/usr/bin/env node
/**
 * SILENT-FAIL-1 (architect, 2026-10-26) — offline gate. A server-side write on important data must never fail silently
 * (the 095 regression stopped mistake recording for ~15 h unnoticed: MistakeService ignored every { error }).
 *   SF-01 every insert / update / upsert / delete on an important table reads its { error } (static sweep of app / lib /
 *         services; a PostgREST write never rejects, so `.catch()` does not count)
 *   SF-02 no `.catch(() => {})` / `.catch(() => undefined)` swallowing on a Supabase query builder
 *   SF-03 recordExamMistakes logs + counts every failed vault / lineage write and returns failedCount
 *   SF-04 submitTestAttempt keeps the result for the student but logs scoring, status and vault failures
 *   SF-05 the structured logger writes ids + error code only (tag ops.write_failure); VAULT-HEALTH runs in the live job
 * Run: node scripts/test_silent_fail1.cjs
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const IMPORTANT = ['test_results', 'test_attempts', 'attempt_answers', 'user_mistake_vault', 'user_mistake_occurrences', 'user_entitlements', 'support_tickets', 'practice_answers', 'payment_orders', 'payment_transactions', 'billing_invoices', 'question_errata_reports', 'attempt_proctor_events', 'admin_audit_logs'];
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(f.name)) files.push(p);
  }
};
['services', 'app', 'lib'].forEach((d) => walk(path.join(ROOT, d)));

/** Unchecked writes: the statement (from its `await` line to the closing `;`) on an important table does not read `error`. */
function uncheckedWrites() {
  const out = [];
  for (const f of files) {
    const lines = read(path.relative(ROOT, f)).split('\n');
    lines.forEach((l, i) => {
      const m = l.match(/\.from\(["'](\w+)["']\)/);
      if (!m || !IMPORTANT.includes(m[1])) return;
      // statement start: the nearest line at or above with `await` (≤ 4 lines up)
      let start = i;
      for (let k = i; k >= Math.max(0, i - 4); k--) if (/\bawait\b/.test(lines[k])) { start = k; break; }
      let end = i;
      while (end < lines.length - 1 && !/;\s*$/.test(lines[end])) end++;
      const stmt = lines.slice(start, end + 1).join('\n');
      if (!/\.(insert|update|upsert|delete)\(/.test(stmt)) return;
      if (/\.(select|maybeSingle|single)\(/.test(stmt) && !/\.(insert|update|upsert|delete)\(/.test(stmt.split('.from(')[1] || '')) return;
      const head = lines[start];
      const destructured = /(const|let)\s*\{[^}]*\berror\b[^}]*\}\s*=/.test(head);
      const named = (head.match(/(?:const|let)\s+(\w+)\s*=\s*await/) || [])[1];
      const namedChecked = named && new RegExp(`\\b${named}\\.error\\b`).test(lines.slice(start, end + 12).join('\n'));
      const returned = /^\s*return\s+await\b|^\s*return\s+\(?await\b/.test(head);
      if (!(destructured || namedChecked || returned)) out.push(`${path.relative(ROOT, f).split(path.sep).join('/')}:${i + 1} ${m[1]}`);
    });
  }
  return out;
}

test('SF-01 every write to an important table reads its { error }', () => {
  const bad = uncheckedWrites();
  assert(bad.length === 0, `${bad.length} unchecked write(s):\n        ${bad.join('\n        ')}`);
  return `${IMPORTANT.length} tables, ${files.length} files scanned`;
});

test('SF-02 no .catch(() => {}) swallowing on Supabase query builders', () => {
  const bad = [];
  for (const f of files) {
    const s = read(path.relative(ROOT, f));
    const re = /\.from\([^)]*\)[\s\S]{0,400}?\}\)\s*\.catch\(\(\)\s*=>\s*(\{\s*\}|undefined|null)\)/g;
    let m;
    while ((m = re.exec(s))) if (!/;\s*\n/.test(m[0].slice(0, m[0].lastIndexOf('.catch')))) bad.push(path.relative(ROOT, f).split(path.sep).join('/'));
  }
  assert(bad.length === 0, [...new Set(bad)].join(', '));
});

test('SF-03 recordExamMistakes logs + counts every failed write', () => {
  const s = read('services/mistake.service.ts');
  const fn = s.slice(s.indexOf('static async recordExamMistakes('), s.indexOf('static async getMistakeVaultSummary('));
  for (const [t, op] of [['user_mistake_vault', 'select'], ['user_mistake_vault', 'insert'], ['user_mistake_vault', 'update'], ['user_mistake_occurrences', 'insert']]) {
    assert(new RegExp(`fail\\("${t}", "${op}",`).test(fn), `${t} ${op} not checked`);
  }
  assert(/reportWriteFailure\(\{ fn: "MistakeService\.recordExamMistakes"/.test(fn) && /return \{ success: failedCount === 0, recordedCount, failedCount \};/.test(fn), 'logged + failedCount returned');
});

test('SF-04 submitTestAttempt: result kept, failures logged (scoring, status, vault)', () => {
  const s = read('services/assessment.service.ts');
  const fn = s.slice(s.indexOf('static async submitTestAttempt('), s.indexOf('static maskCandidateName('));
  assert(/if \(evalError\) reportWriteFailure\(/.test(fn) && /if \(statusError\) reportWriteFailure\(/.test(fn), 'scoring + status');
  assert(/const vault = await MistakeService\.recordExamMistakes\(/.test(fn) && /if \(vault\.failedCount > 0\)/.test(fn) && /catch \(err\) \{\s*reportWriteFailure\(/.test(fn), 'vault');
  assert(!/Mistake Vault notice/.test(fn), 'the old swallowing catch is gone');
});

test('SF-05 logger = ids + error code only; VAULT-HEALTH in the live job', () => {
  const w = read('lib/ops/write-failure.ts');
  assert(/^import "server-only";/.test(w) && /tag: WRITE_FAILURE_TAG, fn: f\.fn, table: f\.table, op: f\.op, code: f\.code \?\? null, ids,/.test(w), 'structured line');
  assert(!/email|full_name|selected_option|answer_text/i.test(w.replace(/\/\*[\s\S]*?\*\//g, '')), 'no PII fields');
  assert(/"\$Q VAULT-HEALTH -- node scripts\/live\/test_vault_health\.cjs" \\/.test(read('.github/workflows/ci-gates.yml')), 'nightly');
});

console.log(`\nSILENT-FAIL-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
