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

test('C-18 CI-PORT-1: with-server waits for the port of a just-stopped server, BOUNDED, then still refuses', () => {
  const s = fs.readFileSync(path.join(ROOT, 'scripts/live/with-server.cjs'), 'utf8');
  assert(/const PORT_WAIT_MS = (\d+);/.test(s) && Number(s.match(/const PORT_WAIT_MS = (\d+);/)[1]) <= 30000, 'bounded wait (≤ 30 s)');
  assert(/while \(!\(await portFree\(PORT\)\) && Date\.now\(\) - portWaitStart < PORT_WAIT_MS\) await sleep\(500\);/.test(s), 'polls within the bound');
  assert(/if \(!\(await portFree\(PORT\)\)\) \{ console\.error\(`\[with-server\] port \$\{PORT\} is in use — stop the other server first \(refusing to start\)`\); process\.exit\(2\); \}/.test(s), 'the refusal stands after the wait');
});

test('C-9 with-server never prints the server log tail when CI_QUIET=1', () => {
  const s = fs.readFileSync(path.join(ROOT, 'scripts/live/with-server.cjs'), 'utf8');
  assert(/if \(process\.env\.CI_QUIET === '1'\) return '\(server log withheld in CI/.test(s), 'CI_QUIET guard missing in tail()');
  return 'guarded';
});

test('C-10 workflow is public-safe: no artifact upload except the failure-only sanitized build log (CI-FLAKE-1), no tee, CI_QUIET=1, every gate via run-quiet, actions pinned, push main (code only) + dispatch, never pull_request', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-gates.yml'), 'utf8');
  // CI-FLAKE-1 amendment (architect ruling 2026-10-28): the ONLY artifact allowed is the sanitized build log, on failure
  // only, from $RUNNER_TEMP/build-diag (run-quiet --keep-log: scanned lines + env lines redacted), pinned, ≤ 7 days
  const uploads = [...w.matchAll(/- name: ([^\n]*)\n((?: {8}[^\n]*\n)+)/g)].filter((m) => /upload-artifact/.test(m[2]));
  assert(uploads.length === 3, `artifact uploads: ${uploads.length} (expected the 3 failure-only build logs)`);
  for (const [, , body] of uploads)
    assert(/^ {8}if: failure\(\)$/m.test(body) && /^ {8}uses: actions\/upload-artifact@[0-9a-f]{40} /m.test(body) && /^ {10}path: \$\{\{ runner\.temp \}\}\/build-diag\/$/m.test(body)
      && /^ {10}retention-days: [1-7]$/m.test(body) && !/\n {10}path: [^\n]*\n {12}/.test(body), `an artifact upload that is not the failure-only sanitized build log:\n${body}`);
  assert((w.match(/--keep-log "\$RUNNER_TEMP\/build-diag"/g) || []).length === 3, 'the build-diag folder is written only by run-quiet --keep-log (the sanitizer)');
  assert(!/\btee\b/.test(w), 'tee present');
  assert(/CI_QUIET: '1'/.test(w), 'CI_QUIET not set');
  const gateLines = w.split('\n').filter((l) => /node scripts\/(test_|smoke\/|e2e\/|diag\/net-probe|ci\/db-sessions)/.test(l) && !/^\s*#/.test(l));
  const unwrapped = gateLines.filter((l) => !/run-quiet\.cjs --id|\$Q [A-Z0-9-]+ --|\bq [A-Z0-9-]+ /.test(l));
  assert(gateLines.length >= 40 && unwrapped.length === 0, `gate lines ${gateLines.length}; unwrapped: ${unwrapped.map((l) => l.trim().slice(0, 60)).join(' | ')}`);
  const uses = w.match(/uses: \S+/g) || [];
  assert(uses.length >= 6 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), 'unpinned action');
  // CI-1 finalised (#65): dispatch kept + push to main for code changes (docs-only skipped); never pull_request
  const code = w.replace(/#.*$/gm, '');
  assert(/^on:\n {2}workflow_dispatch:/m.test(code) && !/pull_request/.test(code), 'dispatch missing or pull_request present');
  const push = (code.match(/^ {2}push:\n((?: {4}.*\n)+)/m) || [])[1] || '';
  assert(/branches: \[main\]/.test(push) && !/paths-ignore/.test(push), 'push must be main-only with an ordered paths filter');
  const pats = [...push.matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1]);
  const lastNeg = Math.max(pats.indexOf('!docs/**'), pats.indexOf('!**/*.md'));
  const must = ['scripts/**', 'app/**', 'lib/**', 'services/**', 'components/**', 'supabase/**', 'package*.json', '.github/**'];
  assert(pats[0] === '**' && lastNeg > 0 && must.every((p) => pats.indexOf(p) > lastNeg), `paths filter: ${pats.join(' ')}`);
  // CI-LEAN-1 (decision #73): live = nightly schedule + manual dispatch only (never on push); prod-smoke after a push / dispatch
  assert(/if: github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.live\)/.test(code), 'live must run on schedule / dispatch only');
  assert(/if: github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.prod_smoke\)/.test(code), 'prod-smoke must run on push / dispatch');
  assert(/^ {2}schedule:\n {4}- cron: '0 21 \* \* \*'/m.test(code), 'nightly schedule (~02:30 IST) missing');
  assert(/cancel-in-progress: false/.test(code), 'concurrency must not cancel in progress');
  return `${gateLines.length} gate lines wrapped; ${uses.length} actions pinned`;
});

test('C-11 with-server precheck: foreign next server / lighthouse / port-targeting processes detected; ours ignored (SECDEF-S2-2)', () => {
  const { classifyCommand } = require(path.join(ROOT, 'scripts/live/_foreign.cjs'));
  const R = 'E:\\Courage Library';
  const cases = [
    ['node C:/npm/node_modules/npm/bin/npx-cli.js next start -p 3100', 'next server'],
    ['"node" "D:\\Other\\node_modules\\.bin\\..\\next\\dist\\bin\\next" start -p 3100', 'next server'],
    ['node C:/tmp/scratchpad/lh/cls.mjs http://localhost:3100', 'lighthouse / audit script'],
    ['node D:/x/node_modules/lighthouse/cli/index.js http://localhost:3000', 'lighthouse / audit script'],
    ['node E:\\Courage Library\\node_modules\\next\\dist\\bin\\next start -p 3300 -H 127.0.0.1', null],
    ['node scripts/test_auth1.cjs --live', null],
    ['node D:/other/serve.js http://localhost:3300/x', 'process targeting :3300'],
    ['node D:/other/serve.js --port=33001', null],
  ];
  const bad = cases.filter(([c, want]) => classifyCommand(c, R, 3300) !== want).map(([c, want]) => `${want} ← ${c.slice(0, 50)}`);
  assert(bad.length === 0, bad.join(' | '));
  const src = fs.readFileSync(path.join(ROOT, 'scripts/live/with-server.cjs'), 'utf8');
  assert(/foreignServerProcesses\(ROOT, PORT\)/.test(src) && /refusing to start/.test(src), 'runner does not refuse on foreign processes');
  return `${cases.length} cases; runner refuses`;
});

test('C-12 run-quiet: a crash with 0 summary lines yields ONE safe diag token (names only, log-scanned); self-test', () => {
  const st = spawnSync(process.execPath, [path.join(ROOT, 'scripts/ci/run-quiet.cjs'), '--self-test'], { encoding: 'utf8' });
  assert(st.status === 0, `self-test: ${st.stdout.trim()}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rq-crash-'));
  const crash = path.join(tmp, 'crash.cjs');
  const SECRET = 'planted-value-must-not-print-0123456789';
  fs.writeFileSync(crash, `console.error('value ${SECRET}'); throw new Error('ENV_MISSING: NEXT_PUBLIC_SUPABASE_URL / POSTGRES_URL_NON_POOLING');\n`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/ci/run-quiet.cjs'), '--id', 'C12-CRASH', '--', process.execPath, crash], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: tmp } });
  const line = (r.stdout || '').trim();
  assert(r.status === 1 && /C12-CRASH FAIL exit 1 .* · diag MISSING_ENV:NEXT_PUBLIC_SUPABASE_URL,POSTGRES_URL_NON_POOLING$/.test(line), `summary: ${line}`);
  assert(!line.includes(SECRET) && line.split('\n').length === 1, 'detail text leaked into the summary');
  fs.rmSync(tmp, { recursive: true, force: true });
  return line.replace(/^C12-CRASH /, '');
});

test('C-13 anonymous smoke needs ONLY public values (ci-public least privilege): no DB / CA / service-role read', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/smoke/anonymous-smoke.cjs'), 'utf8');
  const bad = ['refFromEnv', 'dbTarget', 'POSTGRES_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PROD_CA', 'SUPABASE_ACCESS_TOKEN'].filter((k) => src.includes(k));
  assert(bad.length === 0, `anonymous smoke references: ${bad.join(', ')}`);
  assert(/refFromPublicUrl\(env\)/.test(src) && /assertProjectRef\(/.test(src), 'ref lock (public URL + sha256) missing');
  return 'public URL ref lock only';
});

test('C-14 run-quiet passes a wrapped gate\'s "--self-test" to the gate (it must not run run-quiet\'s own self-test)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rq-flag-'));
  const gate = path.join(tmp, 'gate.cjs');
  fs.writeFileSync(gate, "console.log(process.argv.includes('--self-test') ? 'PASS  gate ran its own self-test' : 'FAIL  flag lost');\n");
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/ci/run-quiet.cjs'), '--id', 'C14', '--', process.execPath, gate, '--self-test'], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: tmp } });
  fs.rmSync(tmp, { recursive: true, force: true });
  const line = (r.stdout || '').trim();
  assert(r.status === 0 && /^C14 PASS exit 0 — passed 1 line\(s\) · fail-lines 0/.test(line), `got: ${line}`);
  return 'gate executed with its flag';
});

test('C-15 every job has timeout-minutes (CI-FIX-1: offline 15 · server-checks 20 · live-journeys 45 · live-gates 60 · prod-smoke 20)', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-gates.yml'), 'utf8');
  const jobsAt = w.indexOf('\njobs:\n');
  assert(jobsAt > 0, 'no jobs block');
  const blocks = w.slice(jobsAt).split(/\n(?= {2}[a-z][\w-]*:\n)/).slice(1);
  const want = { offline: 15, 'server-checks': 20, 'live-journeys': 45, 'live-gates': 60, 'prod-smoke': 20 }; // CI-LIVE-SPLIT-1; live-gates 45 → 60 = interim, CI-SPEED-1 (architect 2026-10-29)
  const got = {};
  for (const b of blocks) {
    const name = b.match(/^ {2}([a-z][\w-]*):/)[1];
    const t = b.match(/^ {4}timeout-minutes: (\d+)$/m);
    got[name] = t ? Number(t[1]) : null;
  }
  const names = Object.keys(got);
  assert(names.length >= 4, `jobs found: ${names.join(', ')}`); // GATE-HYGIENE-1
  const missing = names.filter((n) => got[n] === null);
  assert(missing.length === 0, `jobs without timeout-minutes: ${missing.join(', ')}`);
  const wrong = Object.entries(want).filter(([n, v]) => got[n] !== v).map(([n, v]) => `${n}: ${got[n]} (want ${v})`);
  assert(wrong.length === 0, wrong.join('; '));
  return names.map((n) => `${n} ${got[n]}`).join(' · ');
});

test('C-17 CI-LIVE-SPLIT-1: the nightly live gates run in 2 parallel jobs and NOTHING is skipped', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-gates.yml'), 'utf8').replace(/\r\n/g, '\n');
  const job = (n) => {
    const i = w.indexOf(`\n  ${n}:\n`);
    assert(i > 0, `job ${n} missing`);
    const rest = w.slice(i + 1);
    const next = rest.slice(1).search(/\n {2}(?:[a-z][\w-]*:\n|# -{10})/);
    return next > 0 ? rest.slice(0, next + 1) : rest;
  };
  assert(!/\n {2}live:\n/.test(w), 'the single live job still exists');
  const A = job('live-journeys');
  const B = job('live-gates');
  const ids = (b) => [...b.matchAll(/"\$Q ([A-Z0-9-]+) -- /g)].map((m) => m[1]);
  // the canonical nightly list (38 gates as before the split, + CA1-TAXONOMY-LIVE, CA2-INTAKE-LIVE, CA3-LESSONS-LIVE, CA4-LESSONS-LIVE, LESSON-PROMPT-2-LIVE, CA5-COURSES-LIVE, LESSON-PERF, CA6-SEO-LIVE, CA7-LIVE, LAUNCH-MODE-1-LIVE, SYLIMPORT1-SCOPE-CONTROLS) — each in exactly one job; the QA-session probe in both
  const CANON = ['QA-SESSION-PROBE', 'SECDEF-RATCHET', 'RLS', 'QF1-DB', 'QBKEY1', 'SECDEF-S2-1', 'TYPES1-CLOSE', 'GAP2-4A', 'READERS', 'SYLIMPORT1', 'SYLIMPORT1-SCOPE-CONTROLS', 'CLEANUP-1', 'JOURNEY', 'LINEAGE', 'DRILL1', 'STUDENT-DRILL', 'CLEANUP-2', 'FIXTURE', 'SMOKE-STUDENT-MISTAKE-1', 'SMOKE-STUDENT-MISTAKE-2', 'SMOKE-STUDENT-MISTAKE-3', 'VAULT-HEALTH', 'F9-PRICING', 'ADMIN-D1-D2', 'CA1-TAXONOMY-LIVE', 'CA2-INTAKE-LIVE', 'CA3-LESSONS-LIVE', 'CA4-LESSONS-LIVE', 'LESSON-PROMPT-2-LIVE', 'CA5-COURSES-LIVE', 'LESSON-PERF', 'CA6-SEO-LIVE', 'CA7-LIVE', 'LAUNCH-MODE-1-LIVE', 'SMOKE-ADMIN-PAGES-1', 'SMOKE-ADMIN-PAGES-2', 'SMOKE-ADMIN-PAGES-3', 'SMOKE-STUDENT-PAGES', 'SMOKE-STAFF-CONTENT', 'SMOKE-ADMIN-HOME', 'FLAGS-LIVE', 'UX2A-LIVE', 'UX2B-LIVE', 'AUTH1-2B1-LIVE', 'CA-ROUTES', 'SEC1B-LIVE', 'SEC1C-LIVE', 'SEC1D-LIVE', 'ANON-SMOKE-LOCAL', 'INTAKE-ASSIST-1-LIVE', 'PUBLISH-IMPACT-LIVE', 'PUBLISH-CONFIRM-LIVE'];
  const a = ids(A), b = ids(B);
  const all = [...a, ...b].filter((x) => x !== 'QA-SESSION-PROBE');
  assert(a[0] === 'QA-SESSION-PROBE' && b[0] === 'QA-SESSION-PROBE', 'each job starts with the QA-session probe');
  assert(new Set(all).size === all.length, `a gate runs twice: ${all.filter((x, i) => all.indexOf(x) !== i)}`);
  const missing = CANON.filter((x) => x !== 'QA-SESSION-PROBE' && !all.includes(x));
  const extra = all.filter((x) => !CANON.includes(x));
  assert(missing.length === 0 && extra.length === 0, `missing ${missing} · unknown ${extra}`);
  // student-data writers only in live-journeys (the final cleanup / fixture too); the same rules in both jobs
  // QF1-DB too: its BASE-1 before/after counts cover student tables, so it must never overlap the journeys (run 40465685537)
  for (const x of ['CLEANUP-1', 'JOURNEY', 'LINEAGE', 'DRILL1', 'STUDENT-DRILL', 'CLEANUP-2', 'FIXTURE', 'QF1-DB']) assert(a.includes(x), `${x} must run in live-journeys`);
  assert(/CLEANUP-FINAL/.test(A) && /FIXTURE-FINAL/.test(A) && !/CLEANUP-FINAL|FIXTURE-FINAL/.test(B), 'final cleanup / fixture only in live-journeys');
  for (const [n, j] of [['live-journeys', A], ['live-gates', B]]) {
    assert(/needs: offline/.test(j) && /if: github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.live\)/.test(j), `${n}: same trigger (nightly / dispatch live=true)`);
    assert(/environment: ci-live/.test(j) && /E2E_KEEP_USER: '1'/.test(j) && /QA_SESSION_CACHE_DIR: \$\{\{ runner\.temp \}\}\/qa-session/.test(j), `${n}: same secrets environment + QA session rules`);
    assert(/DB-SESSIONS-PRE/.test(j) && /DB-SESSIONS-POST/.test(j) && /log-scan\.cjs/.test(j), `${n}: orphan-session checks + log scan`);
    assert(!/needs: live/.test(j), `${n}: the jobs run in parallel`);
  }
  return `live-journeys ${a.length} · live-gates ${b.length} (= ${CANON.length} + the probe)`;
});

test('C-16 no QA password sign-in in any script (decision #74: CAPTCHA-safe QA sessions); only the negative login-page tests submit the form, with fixed dummy passwords', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.c?js$/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = walk(path.join(ROOT, 'scripts'));
  assert(files.length >= 100, `scripts scanned ${files.length}`); // GATE-HYGIENE-1
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  const SELF = new Set(['scripts/ci/test_ci_scripts.cjs', 'scripts/live/qa-session.cjs', 'scripts/test_qa_session.cjs']);
  // negative login-page tests (CAPTCHA on): they may type a FIXED dummy password into the form — never a real one
  const DUMMY_FILL_ALLOWED = new Set(['scripts/test_auth1.cjs', 'scripts/test_sec1d_redirects.cjs']);
  const bad = [];
  let fills = 0;
  for (const f of files) {
    const r = rel(f);
    if (SELF.has(r)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (/\.signInWithPassword\(/.test(src)) bad.push(`${r}: signInWithPassword() call`);
    if (/grant_type=password/.test(src)) bad.push(`${r}: password grant`);
    for (const m of src.matchAll(/\.fill\(\s*(['"`])((?:(?!\1).)*password(?:(?!\1).)*)\1\s*,\s*([^)]*)\)/gi)) {
      const arg = m[3].trim();
      fills++;
      if (!DUMMY_FILL_ALLOWED.has(r)) bad.push(`${r}: types into a password field`);
      else if (!/^'[^'$]*'$/.test(arg)) bad.push(`${r}: password field filled with a non-literal value`);
    }
  }
  assert(bad.length === 0, bad.join('; '));
  return `${files.length} scripts; ${fills} dummy password fill(s), all in negative login-page tests`;
});

console.log(`\nCI support: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
