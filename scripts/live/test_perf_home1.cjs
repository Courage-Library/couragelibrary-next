#!/usr/bin/env node
/**
 * PERF-HOME-1 — live gate on the LOCAL production build (refuses any other host). READ ONLY (GET requests; the QA
 * student session is only used to READ pages).
 *   C-1 cached HTML is identical for everyone: "/", "/exams", "/exams/ssc" fetched anonymously and as the signed-in QA
 *       student are byte-identical (after the per-build asset names) and contain no name / e-mail / role / session /
 *       token of the visitor; NEGATIVE CONTROL: /dashboard (dynamic, session shell) differs and names the student
 *   C-2 cached: the second request of each cached page is served from the cache — x-nextjs-cache HIT or STALE
 *       (stale-while-revalidate: still the cached HTML, regenerated in the background); the exam
 *       hub /exams/ssc-cgl stays dynamic (no x-nextjs-cache)
 *   C-3 routing: /exams/ssc (a category) is served by the cached category route (same URL, from cache) once the
 *       middleware has its slug list (a cold instance serves the dynamic page until then); its canonical link is
 *       /exams/ssc; an unknown /exams/<slug> still answers from the dynamic page (404 / coming soon), never the cache
 *   C-4 signed-in view: before any JavaScript the header shows "Go to dashboard" (not Sign in), the signed-out set is
 *       hidden; on a phone the student bottom nav appears in space reserved before the first paint (CLS 0)
 *   C-5 JavaScript off (anonymous): "Sign in" is visible and is a plain link to /auth/login
 *   C-6 (PERF-HOME-1b) the cached HTML is final: no streamed Suspense swap (hidden "S:" segments / $RC / B: templates)
 *       in "/", "/exams", "/exams/ssc"; the detector is self-tested on a streamed fixture (negative control)
 *   C-7 (PERF-HOME-1b) warm load of "/" on a slow connection (412 px, 4x CPU, 400 kbps, 400 ms RTT) ×3: CLS 0
 * Run (live-gate runner): node scripts/live/with-server.cjs -- "node scripts/live/test_perf_home1.cjs http://localhost:3100"
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require('playwright');
const { qaCookies } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.error('refused: local build only'); process.exit(2); }
const STUDENT = 'qa-student@courage-library.test';
let ok = true;
const chk = (n, c, info) => { if (!c) ok = false; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' — ' + String(info).slice(0, 400)}`); };
const CACHED = ['/', '/exams', '/exams/ssc'];

(async () => {
  const cookies = await qaCookies(STUDENT, BASE);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const get = (p, signedIn, init = {}) => fetch(BASE + p, { redirect: 'manual', ...init, headers: { ...(signedIn ? { cookie: cookieHeader } : {}), ...(init.headers || {}) } });
  // the visitor's identity strings that must never be in cached HTML
  const dash = await (await get('/dashboard', true)).text();
  const name = (dash.match(/Account: ([^"<]+)"/) || [])[1] || 'QA student';
  const secrets = [STUDENT, name, ...cookies.map((c) => c.value.slice(0, 24))].filter((s) => s && s.length >= 6);

  // C-1 + C-2
  const res = {};
  for (const p of CACHED) {
    // warm: the first request after a build may render; on a cold instance /exams/<category> is served dynamically until
    // the middleware's background slug list has arrived (bounded wait, ≤ 15 s)
    for (let i = 0; i < 15; i++) {
      const w = await get(p, false);
      if (w.headers.get('x-nextjs-cache') || p !== '/exams/ssc') break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const a = await get(p, false);
    const s = await get(p, true);
    res[p] = { a: await a.text(), s: await s.text(), ca: a.headers.get('x-nextjs-cache'), cs: s.headers.get('x-nextjs-cache'), status: [a.status, s.status] };
  }
  const norm = (h) => h.replace(/<!-- -->/g, '');
  const diff = CACHED.filter((p) => norm(res[p].a) !== norm(res[p].s));
  const leak = CACHED.flatMap((p) => secrets.filter((x) => res[p].s.includes(x) || res[p].a.includes(x)).map((x) => `${p}: ${x === STUDENT ? 'e-mail' : x === name ? 'name' : 'session token'}`));
  const roleWords = CACHED.filter((p) => /isStaff|"role":"(admin|staff|student)"|Account: /.test(res[p].s));
  chk('C-1 cached pages: identical HTML signed-in vs anonymous; no name / e-mail / role / token', diff.length === 0 && leak.length === 0 && roleWords.length === 0 && CACHED.every((p) => res[p].status.join() === '200,200'), JSON.stringify({ diff, leak, roleWords, status: CACHED.map((p) => res[p].status) }));
  const dashDiff = norm(dash) !== norm(await (await get('/dashboard', false)).text());
  chk('C-1 negative control: /dashboard (session shell) differs signed-in vs anonymous and carries the student', dashDiff && (dash.includes(name) || dash.includes('Account:')), JSON.stringify({ dashDiff, named: dash.includes(name) }));
  const fromCache = (h) => h === 'HIT' || h === 'STALE';
  chk('C-2 cached pages are served from the ISR cache (HIT / STALE), anonymous and signed-in', CACHED.every((p) => fromCache(res[p].ca) && fromCache(res[p].cs)), JSON.stringify(CACHED.map((p) => [p, res[p].ca, res[p].cs])));
  const hub = await get('/exams/ssc-cgl', false);
  chk('C-2 exam hub /exams/ssc-cgl stays dynamic (no ISR cache header)', hub.status === 200 && !hub.headers.get('x-nextjs-cache'), `${hub.status} ${hub.headers.get('x-nextjs-cache')}`);

  // C-3 routing
  const unknown = await get('/exams/no-such-exam-xyz', false);
  const canonical = (res['/exams/ssc'].a.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  chk('C-3 /exams/ssc served by the cached category route (canonical /exams/ssc); unknown slug not cached',
    /data-category-page="ssc"/.test(res['/exams/ssc'].a) && fromCache(res['/exams/ssc'].ca) && /\/exams\/ssc$/.test(canonical) && !unknown.headers.get('x-nextjs-cache'),
    JSON.stringify({ cat: /data-category-page="ssc"/.test(res['/exams/ssc'].a), cache: res['/exams/ssc'].ca, canonical, unknown: [unknown.status, unknown.headers.get('x-nextjs-cache')] }));

  // C-6 final HTML (no streamed swap)
  const streamed = (h) => /<div hidden id="S:\d+"|\$RC\(|<template id="B:\d+"/.test(h);
  const fixture = '<template id="B:0"></template><div hidden id="S:0"><p>x</p></div><script>$RC("B:0","S:0")</script>';
  chk('C-6 cached HTML is final: no streamed Suspense swap in /, /exams, /exams/ssc (detector self-test on a streamed fixture)',
    streamed(fixture) && !streamed('<main><p>final</p></main>') && CACHED.every((p) => !streamed(res[p].a)), JSON.stringify(CACHED.map((p) => [p, streamed(res[p].a)])));

  // C-4 / C-5 in a browser
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const host = new URL(BASE).hostname;
    // signed in, JavaScript OFF: the pre-paint hint is an inline script — so with JS off the signed-out set shows (C-5 for
    // signed-in is the documented fallback); with JS ON the very first paint already has the right set
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, domain: host, path: '/' })));
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    // stall every script except the inline ones: what the visitor sees BEFORE the app's JavaScript runs
    await page.route('**/_next/static/chunks/**', (r) => setTimeout(() => r.continue().catch(() => {}), 2500));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const early = await page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
      return { auth: document.documentElement.getAttribute('data-auth'), dashboard: vis('header a[href="/dashboard"]'), signIn: vis('header a[href="/auth/login"]'), space: vis('[data-student-nav-space]') };
    });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const late = await page.evaluate(() => ({ nav: !!document.querySelector('nav[aria-label="Student"]'), cls: window.__cls }));
    chk('C-4 signed in, before JavaScript: "Go to dashboard" shown, Sign in hidden, nav space reserved; then the bottom nav, CLS 0',
      early.auth === 'in' && early.dashboard && !early.signIn && early.space && late.nav && late.cls < 0.001, JSON.stringify({ early, late }));
    await ctx.close();
    // C-7 warm loads on a slow connection: the second load in the same context (HTTP cache on), throttled
    const slow = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true });
    const cls = [];
    await (await slow.newPage()).goto(BASE + '/', { waitUntil: 'load' });
    for (let i = 0; i < 3; i++) {
      const sp = await slow.newPage();
      const cdp = await slow.newCDPSession(sp);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await sp.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
      await sp.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 });
      await sp.waitForTimeout(3000);
      cls.push(await sp.evaluate(() => +window.__cls.toFixed(4)));
      await sp.close();
    }
    await slow.close();
    chk('C-7 warm "/" on a slow connection (400 kbps, 400 ms, 4x CPU) ×3: CLS 0', cls.every((c) => c < 0.001), JSON.stringify(cls));
    const off = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const p2 = await off.newPage();
    await p2.goto(BASE + '/', { waitUntil: 'load' });
    const signIn = await p2.evaluate(() => { const a = [...document.querySelectorAll('header a[href="/auth/login"]')].find((e) => e.getClientRects().length > 0); return a ? a.textContent.trim() : null; });
    chk('C-5 JavaScript off (anonymous): "Sign in" is visible and links to /auth/login', signIn === 'Sign in', String(signIn));
    await off.close();
  } finally {
    await browser.close();
  }
  console.log(ok ? 'PERF-HOME-1 live: ALL PASS' : 'PERF-HOME-1 live: FAILURES');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('ERROR', String(e.message).replace(/[a-z0-9.-]+\.supabase\.(co|com)/gi, '[host]').slice(0, 300)); process.exit(1); });
