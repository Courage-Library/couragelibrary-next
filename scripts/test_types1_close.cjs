/**
 * TYPES-1 CLOSE — permanent drift guard.
 *
 *   X-1 live select audit over ALL of app/, services/, lib/, actions/, components/ (read-only, ref-locked): every
 *       failing select must belong to an explicitly owned bucket —
 *         • a quarantined module (Class C, flags off; TYPES-1:C register),
 *         • the remaining batch scope (B3 → after TEST-CA; B5 closed by GAP2-4b),
 *         • a registered tracked Class B read (table + file listed below).
 *       Any other failing select is NEW drift and fails the test.
 *   X-2 ratchet: only B3 remains (owner TEST-CA); no GAP2-4-owned register entry; tsExpectError exceptions recorded
 *   X-3 register: every Class B tag has an owner phase
 *
 * Run: node scripts/test_types1_close.cjs [--offline]   (--offline skips X-1)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const ratchet = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/types/TYPES1_RATCHET.json'), 'utf8'));
const register = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/types/TYPES1_ESCAPES.json'), 'utf8')).escapes;

// Same quarantine set as scripts/test_types1.cjs (T-08).
const QUARANTINED = /^(services\/adaptive\/|services\/admin-adaptive\.service\.ts|services\/live-test-|app\/admin\/live-tests\/|app\/live-tests\/|services\/battle\.service\.ts|app\/battles\/|app\/api\/battles\/|services\/psychometrics\.service\.ts|app\/performance\/|services\/admin-competition-intelligence\.service\.ts|services\/candidate-intelligence\.service\.ts|components\/admin\/adaptive\/|components\/admin\/live-tests\/)/;
// Files that TEST-CA (current affairs) rewrites beyond the ratchet scope. GAP2-4b closed the B5 family (GAP2-4):
// no exam knowledge / syllabus file is owned any more — a failing select there is NEW drift.
const OWNED_FILES = [
  { re: /^services\/current-affairs-validation\.service\.ts$/, owner: 'TEST-CA (B3 family)' },
];
// Registered tracked Class B reads: file + table that is expected to fail until its owner phase.
const TRACKED = [
  { file: 'services/dashboard.service.ts', table: /^(user_topic_mastery|daily_study_recommendations|user_exam_readiness)$/, tag: 'B-DSH-*' },
  { file: 'services/billing.service.ts', table: /^user_entitlements$/, tag: 'B-BILLING-SUB-STATUS' },
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

(async () => {
  console.log('TYPES-1 CLOSE drift guard');

  if (OFFLINE) {
    console.log('  SKIP  X-1 live select audit (--offline)');
  } else {
    await test('X-1 every failing live select is owned (quarantine / remaining batch / tracked Class B)', async () => {
      const files = ['app', 'services', 'lib', 'actions', 'components'].flatMap((d) => walk(path.join(ROOT, d))).map((f) => path.relative(ROOT, f));
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/types1-select-audit.cjs'), ...files], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      // GATE-HYGIENE-1: an audit that crashed or audited nothing would leave 0 FAIL lines (a vacuous pass)
      const summary = /select audit: (\d+) ok, (\d+) failing/.exec(r.stdout || '');
      assert(!r.error && r.status !== null && summary && Number(summary[1]) + Number(summary[2]) >= 1 && files.length >= 300,
        `select audit did not run fully (status ${r.status}, summary ${summary ? summary[0] : 'missing'}, files ${files.length})`);
      const lines = (r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
      const remaining = ratchet.remaining.map((x) => ({ re: new RegExp(x.scope), owner: x.owner }));
      const counts = { quarantine: 0, remaining: 0, owned: 0, tracked: 0 };
      const unowned = [];
      for (const l of lines) {
        const m = l.match(/^FAIL\s+(\S+):\d+\s+(\S+)/);
        if (!m) { unowned.push(l); continue; }
        const [, file, table] = m;
        if (QUARANTINED.test(file)) counts.quarantine++;
        else if (remaining.some((x) => x.re.test(file))) counts.remaining++;
        else if (OWNED_FILES.some((x) => x.re.test(file))) counts.owned++;
        else if (TRACKED.some((x) => x.file === file && x.table.test(table))) counts.tracked++;
        else unowned.push(l);
      }
      assert(unowned.length === 0, `NEW drift (no owner):\n        ${unowned.join('\n        ')}`);
      return `${(r.stdout || '').trim().split('\n').pop()} — owned: ${JSON.stringify(counts)}`;
    });
  }

  await test('X-2 ratchet: only B3 (after TEST-CA) remains (B5 closed by GAP2-4b); tsExpectError exceptions recorded', async () => {
    const batches = ratchet.remaining.map((x) => x.batch).sort();
    assert(JSON.stringify(batches) === JSON.stringify(['B3']), `remaining: ${batches.join(',')}`);
    assert(/TEST-CA/.test(ratchet.remaining.find((x) => x.batch === 'B3').owner), 'owner');
    assert(!register.some((e) => /GAP2-4/.test(e.owner || '')), 'a register entry is still owned by GAP2-4');
    const ex = ratchet.exceptions || [];
    const total = ex.reduce((a, e) => a + (e.to - e.from), 0);
    assert(total === ratchet.values.tsExpectError, `exceptions (${total}) must account for tsExpectError (${ratchet.values.tsExpectError})`);
    return JSON.stringify(ratchet.values);
  });

  await test('X-3 every Class B register entry names an owner phase', async () => {
    const b = register.filter((e) => e.class === 'B');
    const missing = b.filter((e) => !e.owner || /UNASSIGNED/i.test(e.owner));
    assert(missing.length === 0, missing.map((e) => e.id).join(', '));
    return `${b.length} Class B entries`;
  });

  console.log(`\nTYPES-1 CLOSE: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
