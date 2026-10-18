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

console.log(`\nCI support: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
