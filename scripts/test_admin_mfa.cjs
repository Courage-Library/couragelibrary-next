#!/usr/bin/env node
/**
 * AUTH-1 2b-3 — admin MFA guard (offline: TS transpile + mocks; no network).
 *   MF-01 flag off: admins pass without any AAL check (current behaviour)
 *   MF-02 flag on: AAL1 admin / staff → actions + API routes denied (FORBIDDEN), pages redirected to /admin/mfa?next=…
 *   MF-03 flag on: AAL2 admin passes; an AAL error / unknown level fails closed
 *   MF-04 students unaffected: FORBIDDEN / notFound exactly as before and NO AAL lookup happens
 *   MF-05 only /admin/mfa may render for an AAL1 admin (allowAal1 used exactly once); enrol / verify run in the browser
 *         (no factor secret reaches our server or database); runbook present (enrol first, recovery, no secrets)
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
    assert(JSON.stringify(users) === JSON.stringify(['app/admin/mfa/page.tsx']), `allowAal1 used in ${users}`);
    const panel = read('components/admin/admin-mfa-panel.tsx');
    assert(/^"use client";/.test(panel) && /sb\.auth\.mfa\.enroll\(/.test(panel) && /sb\.auth\.mfa\.challengeAndVerify\(/.test(panel) && !/fetch\(|"use server"|Action\(/.test(panel), 'enrol / verify in the browser only');
    const doc = read('docs/auth/ADMIN_MFA.md');
    assert(/Enrol first, with the flag off/.test(doc) && /Emergency off/.test(doc) && /deleteFactor/.test(doc) && !/eyJ|sk_|service_role_key|password\s*[:=]/i.test(doc), 'runbook');
  });

  console.log(`\nADMIN-MFA: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
