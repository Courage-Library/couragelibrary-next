/**
 * HOTFIX-1 static + unit checks (no network).
 *
 *   H-01 no redirect / link / route constant to the non-existent "/login" (or "/register") in app/, components/,
 *        lib/, services/, config/
 *   H-02 the 4 fixed pages (achievements, certificates, live-tests result, performance) redirect via loginRedirectPath
 *   H-03 loginRedirectPath: "/auth/login?next=<encoded sanitized path>"; hostile `next` falls back to "/"
 *   H-04 the public home page renders no developer diagnostics (Phase 1B, Supabase / connection state, project
 *        name, environment, HealthService) and links to /exams and /auth/login
 *
 * Run: node scripts/test_hotfix1.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const FIXED = {
  'app/achievements/page.tsx': 'loginRedirectPath("/achievements")',
  'app/certificates/page.tsx': 'loginRedirectPath("/certificates")',
  'app/live-tests/[slug]/result/page.tsx': 'loginRedirectPath(`/live-tests/${encodeURIComponent(slug)}/result`)',
  'app/performance/page.tsx': 'loginRedirectPath(`/performance',
};

(async () => {
  console.log('HOTFIX-1 checks');

  await test('H-01 no reference to the non-existent /login or /register route', async () => {
    const hits = [];
    for (const d of ['app', 'components', 'lib', 'services', 'config']) {
      for (const f of walk(path.join(ROOT, d))) {
        const rel = path.relative(ROOT, f).replace(/\\/g, '/');
        fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
          if (/["'`]\/(login|register)(?=[?"'`/#]|$)/.test(l)) hits.push(`${rel}:${i + 1}`);
        });
      }
    }
    assert(hits.length === 0, hits.join(', '));
  });

  await test('H-02 the 4 fixed pages redirect anonymous visitors via loginRedirectPath', async () => {
    for (const [f, call] of Object.entries(FIXED)) {
      const src = read(f);
      assert(src.includes('import { loginRedirectPath } from "@/lib/auth/safe-redirect";'), `${f}: helper not imported`);
      assert(src.includes(`redirect(${call}`), `${f}: redirect does not use loginRedirectPath`);
    }
    return '4 pages';
  });

  await test('H-03 loginRedirectPath builds /auth/login?next=<sanitized>; hostile next → "/"', async () => {
    const src = read('lib/auth/safe-redirect.ts');
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const m = { exports: {} };
    new Function('module', 'exports', js)(m, m.exports);
    const { loginRedirectPath } = m.exports;
    const cases = [
      ['/achievements', '/auth/login?next=%2Fachievements'],
      ['/performance?exam=ssc-cgl', '/auth/login?next=%2Fperformance%3Fexam%3Dssc-cgl'],
      ['/live-tests/some-slug/result', '/auth/login?next=%2Flive-tests%2Fsome-slug%2Fresult'],
      ['https://evil.example/x', '/auth/login?next=%2F'],
      ['//evil.example', '/auth/login?next=%2F'],
      ['/%2F%2Fevil', '/auth/login?next=%2F'],
      ['/a/../admin', '/auth/login?next=%2F'],
      [undefined, '/auth/login?next=%2F'],
    ];
    for (const [input, want] of cases) {
      const got = loginRedirectPath(input);
      assert(got === want, `loginRedirectPath(${JSON.stringify(input)}) = ${got}, want ${want}`);
    }
    return `${cases.length} cases`;
  });

  await test('H-04 home page has no developer diagnostics and links to /exams + /auth/login', async () => {
    const src = read('app/page.tsx');
    for (const bad of [/Phase 1B/i, /Supabase/i, /Connection State/i, /couragelibrary-next/i, /HealthService/, /checkSystemHealth/, /process\.env/, /environment/i, /Architect/i]) {
      assert(!bad.test(src), `home page still contains ${bad}`);
    }
    assert(src.includes('Learn Smarter. Prepare Independently.'), 'tagline missing');
    assert(/href="\/exams"/.test(src) && /href="\/auth\/login"/.test(src), 'links to /exams and /auth/login required');
  });

  console.log(`\nHOTFIX-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
