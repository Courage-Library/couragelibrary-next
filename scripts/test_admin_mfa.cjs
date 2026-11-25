#!/usr/bin/env node
/**
 * AUTH-1 2b-3 — admin MFA guard (offline: TS transpile + mocks; no network).
 *   MF-01 flag off: admins pass without any AAL check (current behaviour)
 *   MF-02 flag on: AAL1 admin / staff → actions + API routes denied (FORBIDDEN), pages redirected to /admin/mfa?next=…
 *   MF-03 flag on: AAL2 admin passes; an AAL error / unknown level fails closed
 *   MF-04 students unaffected: FORBIDDEN / notFound exactly as before and NO AAL lookup happens
 *   MF-05 only /admin/mfa may render for an AAL1 admin (allowAal1 used exactly once); enrol / verify run in the browser
 *         (no factor secret reaches our server or database); runbook present (enrol first, recovery, no secrets)
 *   MF-06 ADMIN-MFA-LOOP-1: each URL rendered WITH its layouts (route tree read from app/): AAL1 /admin/mfa = 200 and
 *         never redirects to itself; AAL1 /admin, /admin/questions → /admin/mfa; AAL2 → 200; student 404; signed-out →
 *         login; the admin layout keeps AAL2 (no allowAal1). Negative controls: the old tree (page under the admin
 *         layout) is reported as a LOOP; a page relaxed to allowAal1 is reported as 200 for AAL1
 * Run: node scripts/test_admin_mfa.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;

let session = null;
let aal = 'aal1';
let aalCalls = 0;
class Redirect extends Error { constructor(to) { super(`REDIRECT ${to}`); this.to = to; } }
class NotFound extends Error { constructor() { super('NOT_FOUND'); } }
const MOCKS = {
  'server-only': {},
  'next/server': { NextResponse: { json: (b, i) => ({ body: b, status: i && i.status }) } },
  'next/navigation': { redirect: (to) => { throw new Redirect(to); }, notFound: () => { throw new NotFound(); } },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => ({
      auth: { mfa: { getAuthenticatorAssuranceLevel: async () => { aalCalls++; return aal === 'ERR' ? { data: null, error: { message: 'x' } } : { data: { currentLevel: aal }, error: null }; } } },
    }),
  },
  '@/lib/auth/session-state': { getSessionState: async () => session },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const G = require(path.join(ROOT, 'lib/auth/require-admin.ts'));
const asAdmin = (role = 'admin') => ({ state: 'user', user: { id: 'a1', email: 'a@b.c', app_metadata: { role } } });
const asStudent = () => ({ state: 'user', user: { id: 's1', email: 's@b.c', app_metadata: {} } });
const outcome = async (fn) => {
  try {
    const r = await fn();
    return r && r.ok === false ? `DENIED:${r.error}` : 'OK';
  } catch (e) {
    if (e instanceof Redirect) return `REDIRECT:${e.to}`;
    if (e instanceof NotFound) return 'NOT_FOUND';
    return `THROW:${e.code || e.message}`;
  }
};

(async () => {
  await test('MF-01 flag off: admins pass, no AAL lookup', async () => {
    delete process.env.ADMIN_MFA_REQUIRED;
    session = asAdmin();
    aal = 'aal1';
    aalCalls = 0;
    assert((await outcome(() => G.guardAdminAction())) === 'OK' && (await outcome(() => G.requireAdminPage({ path: '/admin/questions' }))) === 'OK' && aalCalls === 0, `calls ${aalCalls}`);
  });

  await test('MF-02 flag on: AAL1 admin/staff denied (actions, routes) and redirected (pages)', async () => {
    process.env.ADMIN_MFA_REQUIRED = 'true';
    aal = 'aal1';
    for (const role of ['admin', 'staff']) {
      session = asAdmin(role);
      assert((await outcome(() => G.guardAdminAction({ allowStaff: true }))) === 'DENIED:FORBIDDEN', `${role} action`);
      const route = await G.guardAdminRoute({ allowStaff: true });
      assert(route.ok === false && route.response.status === 403, `${role} route`);
      const page = await outcome(() => G.requireAdminPage({ allowStaff: true, path: '/admin/questions' }));
      assert(page === `REDIRECT:/admin/mfa?next=${encodeURIComponent('/admin/questions')}`, page);
    }
  });

  await test('MF-03 flag on: AAL2 passes; AAL error / unknown fails closed', async () => {
    process.env.ADMIN_MFA_REQUIRED = 'true';
    session = asAdmin();
    aal = 'aal2';
    assert((await outcome(() => G.guardAdminAction())) === 'OK' && (await outcome(() => G.requireAdminPage({ path: '/admin' }))) === 'OK', 'aal2');
    aal = 'ERR';
    assert((await outcome(() => G.guardAdminAction())) === 'DENIED:FORBIDDEN', 'error → denied');
    aal = null;
    assert((await outcome(() => G.guardAdminAction())) === 'DENIED:FORBIDDEN', 'unknown → denied');
  });

  await test('MF-04 students unaffected: same denials as before, no AAL lookup', async () => {
    for (const flag of [undefined, 'true']) {
      if (flag) process.env.ADMIN_MFA_REQUIRED = flag; else delete process.env.ADMIN_MFA_REQUIRED;
      session = asStudent();
      aalCalls = 0;
      assert((await outcome(() => G.guardAdminAction())) === 'DENIED:FORBIDDEN' && (await outcome(() => G.requireAdminPage({ path: '/admin' }))) === 'NOT_FOUND' && aalCalls === 0, `flag ${flag}: calls ${aalCalls}`);
      session = { state: 'none' };
      assert((await outcome(() => G.requireAdminPage({ path: '/admin' }))).startsWith('REDIRECT:/auth/login'), 'anonymous → login');
    }
    delete process.env.ADMIN_MFA_REQUIRED;
  });

  await test('MF-05 only /admin/mfa renders at AAL1; browser-side enrol; runbook', async () => {
    process.env.ADMIN_MFA_REQUIRED = 'true';
    session = asAdmin();
    aal = 'aal1';
    assert((await outcome(() => G.requireAdminPage({ allowStaff: true, path: '/admin/mfa', allowAal1: true }))) === 'OK', 'mfa page reachable at aal1');
    delete process.env.ADMIN_MFA_REQUIRED;
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(tsx?)$/.test(e.name) ? [`${d}/${e.name}`] : []));
    const users = ['app', 'components', 'lib'].flatMap(walk).filter((f) => /allowAal1:\s*true/.test(read(f)));
    assert(JSON.stringify(users) === JSON.stringify(['app/(site)/(admin-auth)/admin/mfa/page.tsx']), `allowAal1 used in ${users}`);
    const panel = read('components/admin/admin-mfa-panel.tsx');
    assert(/^"use client";/.test(panel) && /sb\.auth\.mfa\.enroll\(/.test(panel) && /sb\.auth\.mfa\.challengeAndVerify\(/.test(panel) && !/fetch\(|"use server"|Action\(/.test(panel), 'enrol / verify in the browser only');
    const doc = read('docs/auth/ADMIN_MFA.md');
    assert(/Enrol first, with the flag off/.test(doc) && /Emergency off/.test(doc) && /deleteFactor/.test(doc) && !/eyJ|sk_|service_role_key|password\s*[:=]/i.test(doc), 'runbook');
  });

  // ADMIN-MFA-LOOP-1: the page guards alone (MF-05) passed while production looped — the admin LAYOUT's guard wrapped
  // /admin/mfa too. MF-06 renders a URL the way Next does: every layout.tsx from app/ down to the page, then the page,
  // each with the requireAdminPage options read from the REAL files (route groups resolved from the filesystem).
  const routeTree = (() => {
    const pages = new Map();
    const walkDir = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => {
      if (e.isDirectory()) return walkDir(`${d}/${e.name}`);
      if (e.name !== 'page.tsx') return;
      const segs = d.split('/').slice(1).filter((s) => !/^\(.*\)$/.test(s));
      const url = '/' + segs.join('/');
      if (pages.has(url)) throw new Error(`two pages for ${url}: ${pages.get(url)} and ${d}/page.tsx`);
      pages.set(url, `${d}/page.tsx`);
    });
    walkDir('app');
    return pages;
  })();
  const guardOpts = (rel) => {
    const m = read(rel).match(/requireAdminPage\((\{[^}]*\})\)/);
    return m ? Function(`return (${m[1]})`)() : null;
  };
  // the guard chain of a page file: each ancestor layout.tsx (outermost first), then the page
  const chainFor = (pageFile) => {
    const dirs = pageFile.split('/').slice(0, -1);
    const files = [];
    for (let i = 1; i <= dirs.length; i++) {
      const lay = `${dirs.slice(0, i).join('/')}/layout.tsx`;
      if (fs.existsSync(path.join(ROOT, lay))) files.push(lay);
    }
    files.push(pageFile);
    return files.map((f) => ({ f, opts: guardOpts(f) })).filter((g) => g.opts);
  };
  const render = async (chain) => {
    for (const g of chain) {
      const r = await outcome(() => G.requireAdminPage(g.opts));
      if (r !== 'OK') return r;
    }
    return '200';
  };
  // follows redirects inside /admin (max 5 hops); returns the hop list, or the hop list ending in LOOP
  const follow = async (url, resolve) => {
    const hops = [];
    for (let i = 0; i < 5; i++) {
      const r = await render(resolve(new URL(url, 'http://x').pathname));
      hops.push(`${url} → ${r}`);
      if (!r.startsWith('REDIRECT:')) return hops;
      const to = r.slice('REDIRECT:'.length);
      if (to === url || hops.some((h) => h.startsWith(`${to} →`))) return [...hops, 'LOOP'];
      if (!to.startsWith('/admin')) return [...hops, `→ ${to}`];
      url = to;
    }
    return [...hops, 'TOO_MANY'];
  };
  const realResolve = (p) => chainFor(routeTree.get(p));
  const checkMfaTree = async (resolve) => {
    const errs = [];
    process.env.ADMIN_MFA_REQUIRED = 'true';
    session = asAdmin();
    aal = 'aal1';
    const mfa = await follow('/admin/mfa?next=%2Fadmin', resolve);
    if (mfa.join(' | ') !== '/admin/mfa?next=%2Fadmin → 200') errs.push(`AAL1 /admin/mfa: ${mfa.join(' | ')}`);
    for (const p of ['/admin', '/admin/questions']) {
      // the admin layout's guard runs first, so `next` is its own "/admin" (or the page's path); either way exactly one
      // hop to /admin/mfa, which then renders
      const hops = await follow(p, resolve);
      const ok = hops.length === 2 && /^\S+ → REDIRECT:\/admin\/mfa\?next=%2Fadmin(%2F\S*)?$/.test(hops[0]) && / → 200$/.test(hops[1]);
      if (!ok) errs.push(`AAL1 ${p}: ${hops.join(' | ')}`);
    }
    aal = 'aal2';
    for (const p of ['/admin', '/admin/questions', '/admin/mfa']) if ((await render(resolve(p))) !== '200') errs.push(`AAL2 ${p} not 200`);
    session = asStudent();
    aal = 'aal1';
    for (const p of ['/admin', '/admin/mfa']) if ((await render(resolve(p))) !== 'NOT_FOUND') errs.push(`student ${p} not 404`);
    session = { state: 'none' };
    for (const p of ['/admin', '/admin/mfa']) if (!(await render(resolve(p))).startsWith('REDIRECT:/auth/login')) errs.push(`signed-out ${p} not → login`);
    delete process.env.ADMIN_MFA_REQUIRED;
    return errs;
  };

  await test('MF-06 rendered with its layouts: AAL1 /admin/mfa = 200 (never self-redirect), /admin + /admin/questions → /admin/mfa, AAL2 200, student 404, signed-out → login', async () => {
    const mfaFile = routeTree.get('/admin/mfa');
    const adminLayout = 'app/(site)/admin/layout.tsx';
    assert(mfaFile && !mfaFile.startsWith('app/(site)/admin/'), `/admin/mfa must not sit under ${adminLayout}: ${mfaFile}`);
    assert(!chainFor(mfaFile).some((g) => g.f === adminLayout), 'admin layout wraps /admin/mfa');
    assert(chainFor(routeTree.get('/admin/questions')).some((g) => g.f === adminLayout), 'admin layout no longer wraps /admin/questions');
    // the MFA page's own guard is still its first awaited call (anonymous → login, no role → 404)
    assert(/^\s*await requireAdminPage\(\{ allowStaff: true, path: "\/admin\/mfa", allowAal1: true \}\);/m.test(read(mfaFile)), 'mfa page guard');
    // the admin layout keeps the full AAL2 rule: no allowAal1, no pathname exception
    const lay = read(adminLayout);
    assert(!/allowAal1/.test(lay) && guardOpts(adminLayout) && !guardOpts(adminLayout).allowAal1, 'admin layout must not relax AAL2');
    const errs = await checkMfaTree(realResolve);
    assert(errs.length === 0, errs.join('; '));
    return `/admin/mfa → ${mfaFile}`;
  });

  await test('MF-06 negative controls: the old tree loops; an AAL2 rule removed from the pages is caught', async () => {
    // (a) the MFA page back under the admin layout (the production bug) → the checker must report the loop
    const oldTree = (p) => (p === '/admin/mfa' ? [{ f: 'app/(site)/admin/layout.tsx', opts: guardOpts('app/(site)/admin/layout.tsx') }, { f: 'mfa', opts: guardOpts(routeTree.get('/admin/mfa')) }] : realResolve(p));
    const a = await checkMfaTree(oldTree);
    assert(a.some((e) => /LOOP/.test(e)), `old tree not caught: ${a.join('; ')}`);
    // (b) every guard on /admin/questions relaxed to allowAal1 → an AAL1 admin would get 200: the checker must fail
    const relaxed = (p) => realResolve(p).map((g) => (p === '/admin/questions' ? { ...g, opts: { ...g.opts, allowAal1: true } } : g));
    const b = await checkMfaTree(relaxed);
    assert(b.some((e) => /AAL1 \/admin\/questions: \/admin\/questions → 200/.test(e)), `relaxed tree not caught: ${b.join('; ')}`);
    return `caught: ${a.find((e) => /LOOP/.test(e))}`;
  });

  console.log(`\nADMIN-MFA: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
