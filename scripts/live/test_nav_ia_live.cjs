#!/usr/bin/env node
/**
 * NAV-IA-1 live (ADMIN-IA-1 phase B) — LOCAL ONLY, through scripts/live/with-server.cjs (BASE_URL = the local build),
 * READ ONLY (cookie sign-in as the QA identities; the run fails on any non-GET request other than the read-only server
 * actions some pages load their data with).
 *   L-1 admin: every nav route (items, tabs, actions) answers 200 at its own address, with the section bar
 *   L-2 every retired address (lib/admin/nav-redirects.ts) answers a permanent redirect (308) to its new address, which
 *       then loads (admin)
 *   L-3 staff: every admin-only route (ADMIN_ONLY_ROUTES without [params]) is the site 404 BY URL — tabs of a merged
 *       section included (e.g. /admin/exams/notes, /admin/support/question-reports); an old admin-only address
 *       redirects and then 404s; every staff route of the nav loads (200)
 * Run: node scripts/live/with-server.cjs -- "node scripts/live/test_nav_ia_live.cjs"
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const BASE = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('BASE_URL must be a local dev host');
const loadTs = (rel) => {
  const m = { exports: {} };
  const out = ts.transpileModule(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', 'require', out)(m, m.exports, require);
  return m.exports;
};
const NAV = loadTs('lib/admin/nav.ts');
const { ADMIN_REDIRECTS } = loadTs('lib/admin/nav-redirects.ts');
// the local build runs with the dormant flags off; a flagged route is skipped (its page shows a "not live" panel)
const FLAGS = { ADAPTIVE: false, LIVE_TESTS: false, SUPPORT: process.env.SUPPORT_TICKETS_ENABLED === 'true', PAYMENTS: process.env.PAYMENTS_ENABLED === 'true' };

let ok = true;
const chk = (n, cond, info) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`); };
const routesOf = (nav) => [...new Set(nav.flatMap((g) => g.items.flatMap((it) => [...(it.tabs ?? [it]).map((t) => t.href), ...(it.actions ?? []).map((a) => a.href)])))];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const nonGet = [];
    const session = async (email) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await qaBrowserLogin(ctx, email, BASE);
      const page = await ctx.newPage();
      // pages that load their data through read-only server actions (POST with a next-action header) are allowed;
      // any other non-GET request fails the run
      page.on('request', (r) => { if (r.method() !== 'GET' && !r.headers()['next-action']) nonGet.push(`${r.method()} ${r.url().replace(BASE, '')}`); });
      return { ctx, page };
    };
    // a status for a URL with redirects followed; one retry when the session check lands on /auth/unavailable
    const visit = async (page, url) => {
      for (let i = 0; i < 2; i++) {
        const res = await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
        const at = new URL(page.url()).pathname;
        if (at !== '/auth/unavailable') return { status: res ? res.status() : 0, at };
      }
      return { status: 0, at: '/auth/unavailable' };
    };

    // ---------------- admin
    const admin = await session('qa-admin@courage-library.test');
    const adminNav = NAV.visibleNav('admin', FLAGS);
    const bad1 = [];
    for (const r of routesOf(adminNav)) {
      const v = await visit(admin.page, r);
      const bar = r === '/admin' || (await admin.page.locator('[data-section-bar]').count()) === 1;
      if (v.status !== 200 || v.at !== r || !bar) bad1.push(`${r} → ${v.status} at ${v.at}${bar ? '' : ' (no section bar)'}`);
    }
    chk(`L-1 admin: ${routesOf(adminNav).length} nav routes load at their own address with the section bar`, bad1.length === 0, bad1.join('; '));
    const bad2 = [];
    for (const r of ADMIN_REDIRECTS) {
      const res = await admin.ctx.request.get(BASE + r.from, { maxRedirects: 0 });
      const loc = res.headers().location || '';
      const v = await visit(admin.page, r.from);
      if (res.status() !== 308 || new URL(loc, BASE).pathname !== r.to || v.status !== 200 || v.at !== r.to) bad2.push(`${r.from} → ${res.status()} ${loc} / lands ${v.status} ${v.at}`);
    }
    const q = await admin.ctx.request.get(`${BASE}/admin/users?q=abc`, { maxRedirects: 0 });
    chk(`L-2 ${ADMIN_REDIRECTS.length} retired addresses: 308 to the new address, which loads; the query string is kept`, bad2.length === 0 && /\/admin\/students\?q=abc$/.test(q.headers().location || ''), bad2.join('; ') || q.headers().location);

    // ---------------- staff
    const staff = await session('qa-staff@courage-library.test');
    const bad3 = [];
    const adminOnly = NAV.ADMIN_ONLY_ROUTES.filter((r) => !/\[/.test(r));
    for (const r of adminOnly) {
      const v = await visit(staff.page, r);
      if (v.status !== 404) bad3.push(`${r} → ${v.status} at ${v.at}`);
    }
    for (const old of ['/admin/billing', '/admin/lessons/notes', '/admin/question-reports', '/admin/settings', '/admin/design-system', '/admin/taxonomy']) {
      const v = await visit(staff.page, old);
      if (v.status !== 404) bad3.push(`old ${old} → ${v.status} at ${v.at}`);
    }
    const staffNav = NAV.visibleNav('staff', FLAGS);
    for (const r of routesOf(staffNav)) {
      const v = await visit(staff.page, r);
      if (v.status !== 200) bad3.push(`staff route ${r} → ${v.status}`);
    }
    chk(`L-3 staff: ${adminOnly.length} admin-only routes (+ 6 old addresses) are the 404 by URL; ${routesOf(staffNav).length} staff routes load`, bad3.length === 0, bad3.join('; '));
    chk('R read only: no non-GET request', nonGet.length === 0, nonGet.join(', '));
  } catch (e) {
    ok = false;
    console.log(`FAIL error — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await browser.close();
  }
  console.log(ok ? 'NAV-IA-1 live: all checks passed' : 'NAV-IA-1 live: FAILED');
  process.exit(ok ? 0 : 1);
})();
