/**
 * COURAGE LIBRARY — SEC-1D REDIRECT SANITIZING + PII PAGE ROLE FLIPS
 *
 * Part 1  sanitizer unit tests (lib/auth/safe-redirect.ts): ≥25 hostile inputs fall back safely; valid
 *         paths (incl. query on non-admin paths) are preserved, fragments stripped; admin variant.
 * Part 2  one implementation: require-admin's sanitizeAdminNext and middleware both use the shared one.
 * Part 3  execution: app/auth/callback GET and loginAction run with mocks — hostile `next` never leaves
 *         the origin; no string concatenation of origin + next.
 * Part 4  role flips: gamification / billing / live-tests results pages + their actions admin-only.
 * Part 5  (--live [baseUrl]) login honours `next` (qa-student); callback stays on origin; qa-staff gets
 *         not-found (no data) on /admin/gamification and /admin/billing; qa-admin → 200.
 *
 * Run: node scripts/test_sec1d_redirects.cjs [--live [http://localhost:3100 | https://…]]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const LIVE_BASE = (LIVE && /^https?:\/\//.test(argv[argv.indexOf('--live') + 1] || '')) ? argv[argv.indexOf('--live') + 1].replace(/\/$/, '') : 'http://localhost:3100';

// ---------- TS transpile + @/ alias ----------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;

// ---------- mocks (offline parts) ----------
class RedirectSignal extends Error { constructor(url) { super('NEXT_REDIRECT ' + url); this.url = url; } }
const authMock = { exchangeOk: true, signInOk: true };
const MOCKS = {
  'server-only': {},
  'next/navigation': { redirect: (u) => { throw new RedirectSignal(u); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => ({
      auth: {
        exchangeCodeForSession: async () => (authMock.exchangeOk ? { data: { user: { id: 'u1' } }, error: null } : { data: {}, error: { message: 'bad code' } }),
        getUser: async () => ({ data: { user: null }, error: null }),
        signInWithPassword: async () => (authMock.signInOk ? { data: { user: { id: 'u1' } }, error: null } : { data: {}, error: { message: 'Invalid login credentials' } }),
      },
    }),
  },
  '@/services/user-profile.service': { UserProfileService: { ensureProfile: async () => undefined } },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};

// ---------- harness ----------
let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; lines.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const show = (v) => JSON.stringify(String(v).slice(0, 60));

const HOSTILE = [
  '//evil.com', '///evil.com', '/\\evil.com', '\\\\evil.com', '\\/evil.com', '@evil.com', '/@evil.com', '/login@evil.com',
  'https://evil.com', 'http:evil.com', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>x</script>',
  '%2F%2Fevil.com', '/%2F%2Fevil.com', '/%2fevil.com', '/%252F%252Fevil.com', '/%5Cevil.com', '/%5cevil.com', '%5C%5Cevil.com',
  '\t//evil.com', '/\t/evil.com', '\n/evil', '/\r\nLocation: https://evil.com', '/%0d%0aSet-Cookie:x=1', '/%00evil', '/\u0000evil',
  '/..//evil.com', '/../evil', '/a/../../evil', '/%2e%2e/evil', '/./evil', '/' + 'a'.repeat(600),
  '／／evil.com', '/／evil.com', '/%E2%80%AEevil', '/ evil', ' /mistakes', 'evil.com', '', '/%', '/%zz',
];
const VALID = [
  ['/', '/'], ['/mistakes', '/mistakes'], ['/dashboard', '/dashboard'], ['/auth/update-password', '/auth/update-password'],
  ['/mock-tests/ssc-cgl-tier-1-full-mock', '/mock-tests/ssc-cgl-tier-1-full-mock'], ['/mock-tests?tab=daily&page=2', '/mock-tests?tab=daily&page=2'],
  ['/dashboard#section', '/dashboard'], ['/articles/some-slug?ref=home#top', '/articles/some-slug?ref=home'], ['/admin/content', '/admin/content'],
];

(async () => {
  const sr = require(path.join(ROOT, 'lib/auth/safe-redirect.ts'));

  // ===================== Part 1: sanitizer =====================
  await test(`U-01 ${HOSTILE.length} hostile inputs → fallback "/"`, async () => {
    assert(HOSTILE.length >= 25, 'need ≥25 hostile inputs');
    const bad = HOSTILE.filter((h) => sr.sanitizeRedirectPath(h) !== '/').map((h) => `${show(h)} → ${show(sr.sanitizeRedirectPath(h))}`);
    assert(bad.length === 0, bad.join('\n        '));
    return `${HOSTILE.length}/${HOSTILE.length}`;
  });
  await test('U-02 non-string / null / undefined / objects → fallback; custom fallback honoured', async () => {
    for (const v of [null, undefined, 42, {}, ['/x'], true]) assert(sr.sanitizeRedirectPath(v) === '/', `value ${String(v)}`);
    assert(sr.sanitizeRedirectPath('//evil.com', '/dashboard') === '/dashboard');
    assert(sr.sanitizeRedirectPath('//evil.com', '') === '');
  });
  await test(`U-03 ${VALID.length} valid paths preserved (query kept on non-admin paths, fragment stripped)`, async () => {
    const bad = VALID.filter(([i, o]) => sr.sanitizeRedirectPath(i) !== o).map(([i, o]) => `${show(i)} → ${show(sr.sanitizeRedirectPath(i))} (expected ${o})`);
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('U-04 length limit: 512 accepted, 513 rejected', async () => {
    const ok = '/' + 'a'.repeat(511);
    assert(sr.sanitizeRedirectPath(ok) === ok && sr.sanitizeRedirectPath(ok + 'a') === '/');
  });
  await test('U-05 sanitizeAdminPath: /admin paths only, no query; hostile → /admin', async () => {
    const cases = [['/admin', '/admin'], ['/admin/content', '/admin/content'], ['/admin/live-tests', '/admin/live-tests'], ['/admin?x=1', '/admin'], ['/admin/content?tab=x', '/admin/content'],
      ['/notadmin', '/admin'], ['/adminx', '/admin'], ['/dashboard', '/admin'], ...HOSTILE.map((h) => [h, '/admin'])];
    const bad = cases.filter(([i, o]) => sr.sanitizeAdminPath(i) !== o).map(([i, o]) => `${show(i)} → ${show(sr.sanitizeAdminPath(i))} (expected ${o})`);
    assert(bad.length === 0, bad.join('\n        '));
    return `${cases.length} cases`;
  });
  await test('U-06 safeRedirectUrl: always same origin (hostile and valid)', async () => {
    const origin = 'https://app.example';
    for (const h of HOSTILE) { const u = sr.safeRedirectUrl(h, origin); assert(u.origin === origin && u.pathname === '/', `${show(h)} → ${u.href}`); }
    assert(sr.safeRedirectUrl('/mistakes?x=1', origin).href === 'https://app.example/mistakes?x=1');
  });

  // ===================== Part 2: one implementation =====================
  await test('O-01 sanitizeAdminNext delegates to the shared sanitizer; middleware imports it; no duplicate regex', async () => {
    const ra = read('lib/auth/require-admin.ts');
    const mw = read('lib/supabase/middleware.ts');
    assert(/import \{ sanitizeAdminPath \} from "@\/lib\/auth\/safe-redirect"/.test(ra) && /return sanitizeAdminPath\(path\);/.test(ra), 'require-admin does not delegate');
    assert(/import \{ sanitizeAdminPath \} from "@\/lib\/auth\/safe-redirect"/.test(mw) && !/function sanitizeAdminNext/.test(mw), 'middleware keeps its own copy');
    assert(!/\^\\\/admin\(/.test(ra) && !/\^\\\/admin\(/.test(mw), 'admin path regex duplicated outside safe-redirect');
    assert(!/^\s*import\s+["']server-only["']/m.test(read('lib/auth/safe-redirect.ts')), 'safe-redirect must not be server-only');
  });

  // ===================== Part 3: execution =====================
  await test('C-01 callback: hostile next → redirect stays on the request origin (success path)', async () => {
    const { GET } = require(path.join(ROOT, 'app/auth/callback/route.ts'));
    authMock.exchangeOk = true;
    const origin = 'https://app.example';
    const bad = [];
    for (const h of HOSTILE) {
      const res = await GET(new Request(`${origin}/auth/callback?code=c&next=${encodeURIComponent(h)}`));
      const loc = new URL(res.headers.get('location'));
      if (loc.origin !== origin || loc.pathname !== '/') bad.push(`${show(h)} → ${loc.href}`);
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${HOSTILE.length} hostile`;
  });
  await test('C-02 callback: valid next kept, missing next → /dashboard, bad code → same-origin login error', async () => {
    const { GET } = require(path.join(ROOT, 'app/auth/callback/route.ts'));
    const origin = 'https://app.example';
    authMock.exchangeOk = true;
    const a = new URL((await GET(new Request(`${origin}/auth/callback?code=c&next=%2Fauth%2Fupdate-password`))).headers.get('location'));
    const b = new URL((await GET(new Request(`${origin}/auth/callback?code=c`))).headers.get('location'));
    authMock.exchangeOk = false;
    const c = new URL((await GET(new Request(`${origin}/auth/callback?code=c&next=%2F%2Fevil.com`))).headers.get('location'));
    authMock.exchangeOk = true;
    assert(a.href === `${origin}/auth/update-password`, a.href);
    assert(b.href === `${origin}/dashboard`, b.href);
    assert(c.origin === origin && c.pathname === '/auth/login', c.href);
  });
  await test('C-03 callback source: no origin + next string concatenation', async () => {
    const s = read('app/auth/callback/route.ts');
    assert(!/\$\{origin\}\$\{/.test(s) && !/origin\s*\+\s*next/.test(s), 'string concatenation found');
    assert(/safeRedirectUrl\(/.test(s));
  });
  await test('C-04 loginAction: hostile next → "/", valid → kept, empty → /dashboard, failed sign-in → no redirect', async () => {
    const { loginAction } = require(path.join(ROOT, 'app/auth/actions.ts'));
    const run = async (next) => {
      const fd = new FormData(); fd.set('email', 'a@b.test'); fd.set('password', 'x'); if (next !== undefined) fd.set('next', next);
      try { return { result: await loginAction(null, fd) }; } catch (e) { if (e instanceof RedirectSignal) return { redirect: e.url }; throw e; }
    };
    authMock.signInOk = true;
    const bad = [];
    for (const h of HOSTILE.filter((x) => x !== '')) { const r = await run(h); if (r.redirect !== '/') bad.push(`${show(h)} → ${JSON.stringify(r)}`); }
    const v = await run('/mistakes'); if (v.redirect !== '/mistakes') bad.push(`/mistakes → ${JSON.stringify(v)}`);
    const q = await run('/mock-tests?tab=daily'); if (q.redirect !== '/mock-tests?tab=daily') bad.push(`query → ${JSON.stringify(q)}`);
    const e = await run(''); if (e.redirect !== '/dashboard') bad.push(`empty → ${JSON.stringify(e)}`);
    const n = await run(undefined); if (n.redirect !== '/dashboard') bad.push(`absent → ${JSON.stringify(n)}`);
    authMock.signInOk = false;
    const f = await run('//evil.com'); if (f.redirect || !f.result || !f.result.error) bad.push(`failed sign-in → ${JSON.stringify(f)}`);
    authMock.signInOk = true;
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('C-05 login page passes `next` to the action via a hidden field (sanitized server-side)', async () => {
    const s = read('app/auth/login/page.tsx');
    assert(/searchParams\.get\("next"\)/.test(s) && /<input type="hidden" name="next" value=\{next\} \/>/.test(s));
    assert(/sanitizeRedirectPath\(next\)/.test(read('app/auth/actions.ts')));
  });

  // ===================== Part 4: role flips (static) =====================
  await test('R-01 pages admin-only: gamification, billing, live-tests/[id]/results', async () => {
    for (const p of ['app/admin/gamification/page.tsx', 'app/admin/billing/page.tsx', 'app/admin/live-tests/[id]/results/page.tsx']) {
      const call = (read(p).match(/requireAdminPage\(([^)]*)\)/) || [])[1] || '';
      assert(call && !/allowStaff/.test(call), `${p}: ${call}`);
    }
  });
  await test('R-02 actions admin-only: updateRewardPolicyAction, createSubscriptionPlanAction (reports stays staff)', async () => {
    const g = read('app/admin/gamification/actions.ts');
    assert(/export async function updateRewardPolicyAction[\s\S]{0,300}guardAdminAction\(\);/.test(g), 'gamification action');
    const a = read('app/admin/actions.ts');
    assert(/export async function createSubscriptionPlanAction[\s\S]{0,200}guardAdminAction\(\);/.test(a), 'billing action');
    assert(/requireAdminPage\(\{ allowStaff: true, path: "\/admin\/reports" \}\)/.test(read('app/admin/reports/page.tsx')), 'reports must stay staff');
  });

  // ===================== Part 5: live =====================
  if (LIVE) {
    const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
    const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
    const env = readEnv();
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const baseOrigin = new URL(LIVE_BASE).origin;
    const loginTo = async (email, pwKey, next) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      for (let i = 1; i <= 3; i++) {
        try {
          await page.goto(`${LIVE_BASE}/auth/login${next === undefined ? '' : '?next=' + encodeURIComponent(next)}`, { waitUntil: 'networkidle', timeout: 180000 });
          await page.fill('input[name="email"]', email);
          await page.fill('input[name="password"]', env(pwKey));
          await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 120000 }), page.click('button[type="submit"]')]);
          await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => undefined);
          return { ctx, page, url: new URL(page.url()) };
        } catch { /* retry */ }
      }
      await ctx.close();
      throw new Error(`sign-in failed after 3 attempts (${email.split('@')[0]})`);
    };
    await test(`L-01 qa-student /auth/login?next=/mistakes → lands on /mistakes (${LIVE_BASE})`, async () => {
      const s = await loginTo('qa-student@courage-library.test', 'QA_STUDENT_PASSWORD', '/mistakes');
      const u = s.url; await s.ctx.close();
      assert(u.origin === baseOrigin && u.pathname === '/mistakes', `${u.origin === baseOrigin ? 'same origin' : 'OTHER ORIGIN'} ${u.pathname}`);
    });
    await test('L-02 qa-student /auth/login?next=//evil.com → lands on "/" (same origin)', async () => {
      const s = await loginTo('qa-student@courage-library.test', 'QA_STUDENT_PASSWORD', '//evil.com');
      const u = s.url; await s.ctx.close();
      assert(u.origin === baseOrigin && u.pathname === '/', `${u.origin === baseOrigin ? 'same origin' : 'OTHER ORIGIN'} ${u.pathname}`);
    });
    await test('L-03 /auth/callback?next=//evil.com (no valid code) → redirect stays on origin', async () => {
      for (let i = 1; i <= 3; i++) {
        try {
          const r = await fetch(`${LIVE_BASE}/auth/callback?code=invalid-sec1d&next=${encodeURIComponent('//evil.com')}`, { redirect: 'manual' });
          const loc = new URL(r.headers.get('location'), LIVE_BASE);
          assert([302, 303, 307, 308].includes(r.status) && loc.origin === baseOrigin, `HTTP ${r.status} → ${loc.origin === baseOrigin ? loc.pathname : 'OTHER ORIGIN'}`);
          return `HTTP ${r.status} → ${loc.pathname}`;
        } catch (e) { if (i === 3 || /assert|OTHER ORIGIN|HTTP/.test(e.message)) throw e; }
      }
    });
    const pageCheck = async (ctx, p) => {
      for (let i = 1; i <= 3; i++) {
        try {
          const r = await ctx.request.get(LIVE_BASE + p, { maxRedirects: 0, timeout: 180000 });
          return { status: r.status(), location: r.headers()['location'] || '', body: await r.text() };
        } catch { /* retry */ }
      }
      return { status: 0, body: '' };
    };
    const DATA = /\\?"(userName|userId|policyCode|baseCoins|priceInr|price_inr|durationDays|orders|plans|reasonCode|balanceAfter)\\?"\s*:/g;
    await test('L-04 qa-staff /admin/gamification, /admin/billing → not-found UI, no data', async () => {
      const s = await loginTo('qa-staff@courage-library.test', 'QA_STAFF_PASSWORD', undefined);
      const bad = [];
      for (const p of ['/admin/gamification', '/admin/billing']) {
        const r = await pageCheck(s.ctx, p);
        const nf = r.status === 404 || (r.status === 200 && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(r.body) && /<meta name="robots" content="noindex"/.test(r.body) && /Page Not Found/.test(r.body));
        const data = (r.body.match(DATA) || []).length;
        if (!nf || data) bad.push(`${p}: HTTP ${r.status}, not-found ${nf}, data keys ${data}`);
      }
      await s.ctx.close();
      assert(bad.length === 0, bad.join('\n        '));
    });
    await test('L-05 qa-admin /admin/gamification, /admin/billing → 200', async () => {
      const s = await loginTo('qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD', undefined);
      const out = [];
      for (const p of ['/admin/gamification', '/admin/billing']) {
        let r = await pageCheck(s.ctx, p);
        for (let i = 1; i < 3 && r.location && /\/auth\/login/.test(r.location); i++) r = await pageCheck(s.ctx, p); // middleware fails closed on network errors
        out.push(`${p}: ${r.status}`);
      }
      await s.ctx.close();
      assert(out.every((o) => /: 200$/.test(o)), out.join(', '));
      return out.join(', ');
    });
    await browser.close();
  }

  console.log(lines.join('\n'));
  console.log(`\nSEC-1D redirects + roles suite: ${passed}/${passed + failed} passed${LIVE ? ` (live: ${LIVE_BASE})` : ''}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('SEC-1D SUITE ERROR', String(e && e.stack ? e.stack : e).slice(0, 1500)); process.exit(1); });
