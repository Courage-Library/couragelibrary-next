/**
 * CI-1 Stage 2 — tests for the CI support code (offline; fake values only).
 *   C-1 readEnv(): no .env.local + CI=true → reads process.env only; writes no file
 *   C-2 readEnv(): no .env.local + CI unset → throws ENV_MISSING (unchanged local behaviour)
 *   C-3 readEnv(): .env.local present → file values, process.env still wins (unchanged)
 *   C-4 log-scan self-test (planted fake secret / ref / host / IPv4 / IPv6 / JWT / pg URL / auth header / DB host → FAIL;
 *       clean log passes; empty dir FAILs)
 *   C-5 mask-derived self-test (count only outside GitHub Actions; ::add-mask:: lines only on Actions)
 *   C-6 with-server binds the server to 127.0.0.1 (static)
 * Run: node scripts/ci/test_ci_scripts.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;
const test = (name, fn) => { try { const info = fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`); } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

/** a throw-away project root holding a copy of _db-env.cjs, optionally with a fake .env.local */
function sandbox(withEnvFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-env-'));
  fs.mkdirSync(path.join(dir, 'scripts', 'db'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts/db/_db-env.cjs'), path.join(dir, 'scripts/db/_db-env.cjs'));
  if (withEnvFile) fs.writeFileSync(path.join(dir, '.env.local'), 'FAKE_A=from-file\nFAKE_B=file-b\n');
  return dir;
}
const probe = (dir, env) => spawnSync(process.execPath, ['-e', `try { const e = require(${JSON.stringify(path.join(dir, 'scripts/db/_db-env.cjs'))}).readEnv(); console.log(JSON.stringify({ a: e('FAKE_A') || null, b: e('FAKE_B') || null })); } catch (err) { console.log('THROW ' + err.message.split(':')[0]); }`],
  { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: 'utf8' }).stdout.trim();

console.log('CI-1 Stage 2 — CI support code');

test('C-1 readEnv: no .env.local + CI=true → process.env only; no file written', () => {
  const dir = sandbox(false);
  const out = probe(dir, { CI: 'true', FAKE_A: 'from-env' });
  const files = fs.readdirSync(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert(out === JSON.stringify({ a: 'from-env', b: null }), `got ${out}`);
  assert(!files.includes('.env.local') && files.length === 1, `files written: ${files.join(', ')}`);
  return 'env value read; nothing written';
});

test('C-2 readEnv: no .env.local + CI unset → throws ENV_MISSING', () => {
  const dir = sandbox(false);
  const out = probe(dir, { FAKE_A: 'from-env' });
  const out2 = probe(dir, { CI: '1', FAKE_A: 'from-env' }); // only the exact value 'true' enables the fallback
  fs.rmSync(dir, { recursive: true, force: true });
  assert(out === 'THROW ENV_MISSING' && out2 === 'THROW ENV_MISSING', `got ${out} / ${out2}`);
  return 'throws (CI unset and CI=1)';
});

test('C-3 readEnv: .env.local present → file values; process.env wins (unchanged)', () => {
  const dir = sandbox(true);
  const out = probe(dir, { CI: 'true', FAKE_B: 'env-b' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert(out === JSON.stringify({ a: 'from-file', b: 'env-b' }), `got ${out}`);
  return 'file + env precedence';
});

test('C-4 log-scan self-test (planted patterns FAIL, clean passes, empty FAILs)', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'log-scan.cjs'), '--self-test'], { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter((l) => /self-test:/.test(l));
  assert(r.status === 0 && lines.length >= 11 && lines.every((l) => l.startsWith('PASS')), r.stdout.slice(-600));
  return `${lines.length} self-test checks`;
});

test('C-5 mask-derived self-test', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'mask-derived.cjs'), '--self-test'], { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter((l) => /self-test:/.test(l));
  assert(r.status === 0 && lines.length >= 8 && lines.every((l) => l.startsWith('PASS')), r.stdout.slice(-600));
  return `${lines.length} self-test checks`;
});

test('C-6 with-server binds next start to 127.0.0.1', () => {
  const s = fs.readFileSync(path.join(ROOT, 'scripts/live/with-server.cjs'), 'utf8');
  assert(/'start', '-p', String\(PORT\), '-H', '127\.0\.0\.1'/.test(s), 'next start is not bound to 127.0.0.1');
  return 'bound';
});

// ---- PUBLIC-HARDEN-1: public-repo log hardening
const fakeGate = (body) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rq-')); const f = path.join(d, 'gate.cjs'); fs.writeFileSync(f, body); return { d, f }; };
const quiet = (id, file, env = {}) => spawnSync(process.execPath, [path.join(__dirname, 'run-quiet.cjs'), '--id', id, '--', process.execPath, file],
  { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, RUNNER_TEMP: os.tmpdir(), ...env } });

test('C-7 run-quiet prints ONE summary line (ID, status, counts, failing IDs) and no detail text', () => {
  const { d, f } = fakeGate("console.log('  PASS  K-1 secret-detail-alpha ok');\nconsole.log('  FAIL  P-9 exposes fn_detail_beta to anon');\nconsole.log('  WARN  VACUOUS x');\nconsole.log('\\nSuite: 1/2 passed');\nprocess.exit(1);\n");
  const r = quiet('FAKE-GATE', f);
  fs.rmSync(d, { recursive: true, force: true });
  const out = r.stdout.trim();
  assert(r.status === 1, `exit ${r.status}`);
  assert(out.split('\n').length === 1 && /^FAKE-GATE FAIL exit 1 — passed 1\/2 · fail-lines 1 · warns 1 · failing \[P-9\]$/.test(out), `summary: ${out}`);
  assert(!/detail-alpha|fn_detail_beta|exposes/.test(out), 'detail text leaked');
  return out;
});

test('C-8 run-quiet: a planted secret in the gate output → FAIL, output withheld', () => {
  const { d, f } = fakeGate("console.log('  PASS  X ok ' + process.env.SUPABASE_SERVICE_ROLE_KEY);\n");
  const r = quiet('LEAKY-GATE', f, { SUPABASE_SERVICE_ROLE_KEY: 'fake-planted-service-role-0123456789' });
  fs.rmSync(d, { recursive: true, force: true });
  assert(r.status === 1 && /^LEAKY-GATE FAIL — log scan: 1 finding\(s\) \[secret\] — output withheld$/.test(r.stdout.trim()), `got ${r.status}: ${r.stdout.trim()}`);
  assert(!r.stdout.includes('fake-planted'), 'secret printed');
  return 'withheld';
});

test('C-9 with-server never prints the server log tail when CI_QUIET=1', () => {
  const s = fs.readFileSync(path.join(ROOT, 'scripts/live/with-server.cjs'), 'utf8');
  assert(/if \(process\.env\.CI_QUIET === '1'\) return '\(server log withheld in CI/.test(s), 'CI_QUIET guard missing in tail()');
  return 'guarded';
});

test('C-10 workflow is public-safe: no artifact upload, no tee, CI_QUIET=1, every gate via run-quiet, actions pinned, dispatch-only', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-gates.yml'), 'utf8');
  assert(!/upload-artifact/.test(w), 'artifact upload present');
  assert(!/\btee\b/.test(w), 'tee present');
  assert(/CI_QUIET: '1'/.test(w), 'CI_QUIET not set');
  const gateLines = w.split('\n').filter((l) => /node scripts\/(test_|smoke\/|e2e\/|diag\/net-probe|ci\/db-sessions)/.test(l) && !/^\s*#/.test(l));
  const unwrapped = gateLines.filter((l) => !/run-quiet\.cjs --id|\$Q [A-Z0-9-]+ --|\bq [A-Z0-9-]+ /.test(l));
  assert(gateLines.length >= 40 && unwrapped.length === 0, `gate lines ${gateLines.length}; unwrapped: ${unwrapped.map((l) => l.trim().slice(0, 60)).join(' | ')}`);
  const uses = w.match(/uses: \S+/g) || [];
  assert(uses.length >= 6 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), 'unpinned action');
  assert(/^on:\n {2}workflow_dispatch:/m.test(w) && !/^ {2}push:/m.test(w) && !/pull_request/.test(w.replace(/#.*$/gm, '')), 'trigger is not dispatch-only');
  return `${gateLines.length} gate lines wrapped; ${uses.length} actions pinned`;
});

console.log(`\nCI support: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
