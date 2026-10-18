/**
 * CI-1 Stage 2 — log scan (architect-approved). Fails if any log line contains a secret or a host / IP / token pattern.
 * Usage: node scripts/ci/log-scan.cjs <dir|file> [...]      node scripts/ci/log-scan.cjs --self-test
 * Reports file:line and the PATTERN CLASS only — never the matched text.
 *   secret      the value of a secret env var (or a value derived from one: project ref, DB host / user / password)
 *   host        *.supabase.co / *.supabase.com
 *   ipv4 / ipv6 an IP address other than loopback (127.x, ::1) or 0.0.0.0
 *   jwt         eyJ…​.…​ tokens
 *   pg-url      postgres:// URL with credentials
 *   auth-header Authorization: Bearer …
 *   sb-key      sb_secret_… / sb_publishable_… keys
 * Minimum coverage (GATE-HYGIENE-1): scanning 0 files or 0 lines is a FAIL.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SECRET_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'POSTGRES_URL_NON_POOLING', 'QA_STUDENT_PASSWORD', 'QA_STAFF_PASSWORD', 'QA_ADMIN_PASSWORD'];

/** secret values + values derived from them (≥ 6 chars, to avoid matching trivial strings) */
function secretValues(env = process.env) {
  const out = new Set();
  for (const k of SECRET_ENV) if (env[k] && env[k].length >= 6) out.add(env[k]);
  try { const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]; if (ref.length >= 6) out.add(ref); } catch { /* not set */ }
  try {
    const u = new URL(env.POSTGRES_URL_NON_POOLING);
    for (const v of [u.hostname, decodeURIComponent(u.username), decodeURIComponent(u.password)]) if (v && v.length >= 6) out.add(v);
  } catch { /* not set */ }
  if (env.PROD_CA_PEM) for (const l of env.PROD_CA_PEM.split(/\r?\n/)) if (l.length >= 40 && !/^-----/.test(l)) out.add(l.trim());
  return [...out];
}

const PATTERNS = [
  ['host', /[a-z0-9-]+(\.[a-z0-9-]+)*\.supabase\.(co|com)\b/i],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['pg-url', /postgres(ql)?:\/\/[^\s/@]+@/i],
  ['auth-header', /authorization\s*[:=]\s*["']?bearer\s+\S{8,}/i],
  ['sb-key', /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/],
];
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])/g;
const IPV6 = /(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}(?![0-9a-f:])/gi;

function scanLine(line, secrets) {
  const hits = [];
  if (secrets.some((s) => line.includes(s))) hits.push('secret');
  for (const [cls, re] of PATTERNS) if (re.test(line)) hits.push(cls);
  for (const m of line.matchAll(IPV4)) {
    const o = m.slice(1, 5).map(Number);
    if (o.every((x) => x <= 255) && o[0] !== 127 && !(o[0] === 0 && o[1] === 0 && o[2] === 0 && o[3] === 0)) { hits.push('ipv4'); break; }
  }
  if (IPV6.test(line)) hits.push('ipv6');
  IPV6.lastIndex = 0;
  return hits;
}

function listFiles(targets) {
  const files = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    else files.push(p);
  };
  targets.forEach(walk);
  return files;
}

/** returns { files, lines, findings: [{ file, line, classes }] } */
function scan(targets, env = process.env) {
  const secrets = secretValues(env);
  const files = listFiles(targets);
  let lines = 0;
  const findings = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    text.split(/\r?\n/).forEach((l, i) => {
      lines++;
      const classes = scanLine(l, secrets);
      if (classes.length) findings.push({ file: f, line: i + 1, classes });
    });
  }
  return { files: files.length, lines, findings };
}

function report(r, label = 'log-scan') {
  if (r.files === 0 || r.lines === 0) { console.log(`${label}: FAIL — nothing scanned (${r.files} files, ${r.lines} lines)`); return false; }
  for (const f of r.findings.slice(0, 50)) console.log(`${label}: FAIL ${path.basename(f.file)}:${f.line} [${f.classes.join(', ')}]`);
  console.log(`${label}: ${r.findings.length ? 'FAIL' : 'OK'} — ${r.files} file(s), ${r.lines} line(s), ${r.findings.length} finding(s)`);
  return r.findings.length === 0;
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-scan-'));
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-value-0123456789', NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', POSTGRES_URL_NON_POOLING: 'postgresql://fakeuser.abcdefghij:fakepass987@fake-pooler.example.net:6543/postgres' };
  const planted = {
    secret: 'error: key fake-service-role-value-0123456789 rejected',
    ref: 'connecting to project abcdefghijklmnopqrst now',
    host: 'GET https://xyzxyzxyzxyzxyzxyzxy.supabase.co/rest/v1/x',
    ipv4: 'connect ETIMEDOUT 10.1.2.3:6543',
    ipv6: 'connect to 2406:da1a:6b0:f601:0:0:0:1 failed',
    jwt: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
    'pg-url': 'url postgres://someone:pw@db.example.org:5432/postgres',
    'auth-header': 'Authorization: Bearer abcdefghijklmnop',
    dbhost: 'host fake-pooler.example.net refused',
  };
  const results = [];
  for (const [name, line] of Object.entries(planted)) {
    fs.writeFileSync(path.join(dir, 'planted.log'), `ok line\n${line}\nok line\n`);
    const r = scan([path.join(dir, 'planted.log')], env);
    results.push([`planted ${name} is caught`, r.findings.length === 1 && r.findings[0].line === 2]);
  }
  fs.writeFileSync(path.join(dir, 'planted.log'), 'PASS  K-1 ok\nserver on http://127.0.0.1:3100 and http://localhost:3100\n[with-server] healthy\nNext.js 15.5.23 Node v20.19.4 at 12:30:45\n');
  const clean = scan([path.join(dir, 'planted.log')], env);
  results.push(['clean log (loopback, versions, times) passes', clean.findings.length === 0 && clean.lines === 5]);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'log-scan-empty-'));
  results.push(['empty directory is a FAIL (nothing scanned)', report(scan([empty], env), 'log-scan(self-test, expected FAIL)') === false]);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
  for (const [n, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  self-test: ${n}`);
  return results.every(([, ok]) => ok);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  if (!args.length) { console.log('usage: log-scan.cjs <dir|file> [...] | --self-test'); process.exit(2); }
  process.exit(report(scan(args)) ? 0 : 1);
}

module.exports = { scan, scanLine, secretValues, selfTest };
