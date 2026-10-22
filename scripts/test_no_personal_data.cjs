/**
 * PUBLIC-HARDEN-1 (rule: NO real personal data in the repository, ever) — permanent gate.
 * Scans every tracked text file for:
 *   email      an email address outside the allow-list below
 *   phone      an Indian mobile number (optionally +91) or an E.164 number
 *   data-dump  a JSON array of ≥ 2 objects carrying ≥ 2 personal-data keys (email / phone / dob / address / full_name …)
 *              with non-empty values — unless every email in it is allow-listed and it has no phone / dob / address value
 * Prints file path + class + count only — NEVER the matched value. Minimum coverage: ≥ 500 tracked files scanned.
 * Run: node scripts/test_no_personal_data.cjs            node scripts/test_no_personal_data.cjs --self-test
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// Allow-list (reviewed). Anything else fails. Keep entries specific; add a reason for every new one.
const ALLOW_PATTERNS = [
  [/^support@couragelibrary\.in$/i, 'the public support address'],
  [/@([a-z0-9-]+\.)*[a-z0-9-]+\.test$/i, '.test is reserved for testing (RFC 2606) — QA identities and fixtures'],
  [/@([a-z0-9-]+\.)*example\.(com|org|net)$/i, 'example domains are reserved (RFC 2606)'],
  [/@([a-z0-9-]+\.)*[a-z0-9-]+\.local$/i, '.local is special-use (RFC 6762) — synthetic system actor in app code'],
  [/@([a-z0-9-]+\.)*[a-z0-9-]+\.internal$/i, '.internal is reserved for private use — fixtures'],
  [/^noreply@anthropic\.com$/i, 'co-author trailer (role address)'],
  [/^git@github\.com$/i, 'SSH remote syntax, not a mailbox'],
  [/^github-actions@github\.com$/i, 'GitHub Actions bot identity (git config example in an audit doc)'],
  [/^\d+\+[a-z0-9-]+@users\.noreply\.github\.com$/i, 'GitHub noreply address (not personal)'],
];
// exact role / fixture addresses on the brand domain (not natural persons)
const ALLOW_EXACT = new Set(['admin@couragelibrary.com', 'audit@couragelibrary.com', 'candidatea@couragelibrary.com', 'candidateb@couragelibrary.com',
  'support@couragelibrary.com', 'system@couragelibrary.com', 'test-admin@couragelibrary.com']);
// hostile open-redirect test vectors (userinfo tricks), allowed only in these files
// (keys assembled at runtime so this file itself carries no address literal)
const at = (local, domain) => `${local}@${domain}`;
const ALLOW_IN_FILE = { [at('login', 'evil.com')]: ['scripts/test_sec1d_redirects.cjs', 'docs/reports/sec/SEC1D_REDIRECTS_ROLES_REPORT.md'] };
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|otf|zip|gz|mp4|webm|mp3|lockb)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<![\dA-Za-z.\-_/#])(?:\+91[ -]?)?[6-9]\d{9}(?![\dA-Za-z])|(?<![\dA-Za-z])\+\d{11,14}(?!\d)/g;
const GOOGLE_SECRET = new RegExp(['GOC', 'SPX-'].join(''), 'g');
const PII_KEY =/^(e-?mail|user_?email|contact_?email|phone|mobile|contact_?phone|phone_?number|dob|date_?of_?birth|birth_?date|address|street|full_?name|first_?name|last_?name)$/i;

function emailAllowed(e, file) {
  const low = e.toLowerCase();
  if (ALLOW_EXACT.has(low)) return true;
  if (ALLOW_IN_FILE[low] && ALLOW_IN_FILE[low].includes(file)) return true;
  return ALLOW_PATTERNS.some(([re]) => re.test(low));
}

function dumpShapes(text, file) {
  if (!/\.json$/i.test(file)) return 0;
  let j;
  try { j = JSON.parse(text); } catch { return 0; }
  let hits = 0;
  const walk = (o) => {
    if (Array.isArray(o)) {
      const objs = o.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
      const pii = objs.filter((x) => Object.entries(x).filter(([k, v]) => PII_KEY.test(k) && typeof v === 'string' && v.trim()).length >= 2);
      if (pii.length >= 2) {
        const harmless = pii.every((x) => Object.entries(x).every(([k, v]) => !PII_KEY.test(k) || typeof v !== 'string' || (/mail/i.test(k) ? emailAllowed(v, file) : /name/i.test(k))));
        if (!harmless) hits++;
      }
      o.forEach(walk);
    } else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(j);
  return hits;
}

function scanText(text, file) {
  const out = {};
  const emails = (text.match(EMAIL) || []).filter((e) => !emailAllowed(e, file));
  if (emails.length) out.email = emails.length;
  const phones = (text.match(PHONE) || []).length;
  if (phones) out.phone = phones;
  const dumps = dumpShapes(text, file);
  if (dumps) out['data-dump'] = dumps;
  // AUTH-1 2b-1: a Google OAuth client SECRET must never be in the repo (it lives only in the Supabase dashboard).
  // Any occurrence of its prefix counts; the prefix is assembled at runtime so this file stays clean.
  const gsecret = (text.match(GOOGLE_SECRET) || []).length;
  if (gsecret) out['google-client-secret'] = gsecret;
  return out;
}

function scanFiles(root, files) {
  const findings = [];
  let scanned = 0;
  for (const f of files) {
    if (SKIP_EXT.test(f)) continue;
    let buf;
    try { buf = fs.readFileSync(path.join(root, f)); } catch { continue; }
    if (buf.includes(0)) continue; // binary
    scanned++;
    const r = scanText(buf.toString('utf8'), f);
    if (Object.keys(r).length) findings.push([f, r]);
  }
  return { scanned, findings };
}

function report({ scanned, findings }, min) {
  for (const [f, r] of findings) console.log(`  FAIL  ${f} — ${Object.entries(r).map(([k, n]) => `${k} ×${n}`).join(', ')}`);
  const ok = scanned >= min && findings.length === 0;
  console.log(`no-personal-data: ${ok ? 'OK' : 'FAIL'} — ${scanned} file(s) scanned (min ${min}), ${findings.length} file(s) with findings`);
  return ok;
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npd-'));
  const W = (n, s) => fs.writeFileSync(path.join(dir, n), s);
  const results = [];
  const run = (files) => scanFiles(dir, files);
  // planted fakes are assembled at runtime: the gate scans its own source too and must stay clean
  const ph = (a, b) => `${a}${b}`;
  W('a.md', `contact ${at('someone.real', 'gmail.com')} today`);
  results.push(['planted webmail address is caught', run(['a.md']).findings.length === 1]);
  W('b.ts', `const p = '${ph('98765', '43210')}'; // mobile`);
  results.push(['planted Indian mobile number is caught', run(['b.ts']).findings[0]?.[1].phone === 1]);
  W('c.json', JSON.stringify({ rows: [{ email: at('x1', 'fake-domain.org'), phone: ph('91234', '56780'), dob: '1999-01-01' }, { email: at('x2', 'fake-domain.org'), phone: ph('91234', '56781'), dob: '2000-02-02' }] }));
  const c = run(['c.json']).findings[0]?.[1] || {};
  results.push(['planted data-dump shape is caught', c['data-dump'] === 1]);
  W('d.ts', "const a = 'qa-student@courage-library.test'; const s = 'support@couragelibrary.in'; const e = 'x@example.com'; const id = 'f1e2d3c4-1234-4abc-9def-9876543210ab'; const ts = 17876543210123;");
  results.push(['allow-listed addresses, UUIDs and timestamps pass', run(['d.ts']).findings.length === 0]);
  W('e.json', JSON.stringify([{ email: 'a@x.test', full_name: 'QA One' }, { email: 'b@x.test', full_name: 'QA Two' }]));
  results.push(['fixture array with only .test emails and names passes', run(['e.json']).findings.length === 0]);
  W('f.md', `see /${at('login', 'evil.com')}`);
  results.push(['hostile vector outside its allowed file is caught', run(['f.md']).findings.length === 1]);
  W('g.env', `GOOGLE_SECRET=${['GOC', 'SPX-'].join('')}fakeFakeFakeFakeFake0123456789`);
  results.push(['planted Google client-secret prefix is caught', run(['g.env']).findings[0]?.[1]['google-client-secret'] === 1]);
  results.push(['empty input is a FAIL (minimum coverage)', report(run([]), 1) === false]);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [n, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  self-test: ${n}`);
  return results.every(([, ok]) => ok);
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  console.log('No personal data (PUBLIC-HARDEN-1)');
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  process.exit(report(scanFiles(ROOT, files), 500) ? 0 : 1);
}

module.exports = { scanText, scanFiles, emailAllowed };
