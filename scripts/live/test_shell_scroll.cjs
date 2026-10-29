#!/usr/bin/env node
/**
 * SHELL-SCROLL-FIX-1 — the admin shell has ONE scroll container (#admin-content); the document never scrolls; the
 * sidebar is full height and stays put. LOCAL ONLY, through scripts/live/with-server.cjs (BASE_URL = the local build),
 * READ ONLY (signs in as the QA admin with cookies; the run fails on any non-GET request).
 * Per route × size (1440×900 desktop, 1024×768 tablet, 390×844 phone):
 *   S-1 document.scrollingElement.scrollHeight ≤ innerHeight (no outer document scroll, no blank area below)
 *   S-2 the only scrolling element outside a dialog is #admin-content (no nested scroll regions); the sidebar's own nav
 *       list may scroll on short screens (it is beside the content, never inside it)
 *   S-3 after #admin-content is scrolled to its end: the document is still at 0 and (≥ md) the sidebar's bottom edge
 *       is the viewport's bottom edge
 *   S-4 a drawer (if the route has one) opens without making the document scroll
 *   N-1 negative control: the same checks FAIL on the page after a test-only style lets the shell grow (the gate can
 *       see the bug it guards against)
 * Usage: node scripts/live/with-server.cjs -- "node scripts/live/test_shell_scroll.cjs [--routes=a,b] [--diagnose]"
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const BASE = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('BASE_URL must be a local dev host');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
// a short page, long lists, a long tree, the intake list (sticky guide), a page with a drawer
const ROUTES = arg('routes', '/admin,/admin/syllabus,/admin/syllabus/intake,/admin/taxonomy,/admin/questions,/admin/lessons').split(',');
const SIZES = [[1440, 900], [1024, 768], [390, 844]];
const DIAGNOSE = process.argv.includes('--diagnose');

let ok = true;
const chk = (n, cond, info) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`); };

/** runs in the page: the scroll facts of the shell */
function measure() {
  const vh = window.innerHeight;
  const doc = document.scrollingElement || document.documentElement;
  const scrollers = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[role="dialog"]') || el.matches('[data-admin-sidebar]')) continue; // a drawer / the sidebar's own nav list
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 1 || el.clientHeight === 0) continue;
    scrollers.push(el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
  }
  const content = document.getElementById('admin-content');
  if (content) content.scrollTop = content.scrollHeight;
  const sidebar = [...document.querySelectorAll('[data-admin-sidebar]')].find((s) => getComputedStyle(s).display !== 'none');
  const sb = sidebar ? sidebar.getBoundingClientRect() : null;
  const tops = [...document.body.children].map((c) => `${c.tagName.toLowerCase()}#${c.id || ''}:${Math.round(c.getBoundingClientRect().height)}`);
  return { vh, docHeight: doc.scrollHeight, docTop: doc.scrollTop, scrollers, sidebarBottom: sb ? Math.round(sb.bottom) : null, sidebarHeight: sb ? Math.round(sb.height) : null, contentScrolls: content ? content.scrollHeight > content.clientHeight : false, tops };
}

function problems(m, w) {
  const out = [];
  if (m.docHeight > m.vh + 1) out.push(`document scrolls (${m.docHeight} > ${m.vh})`);
  if (m.docTop !== 0) out.push(`document scrolled to ${m.docTop}`);
  const extra = m.scrollers.filter((s) => s !== '#admin-content');
  if (extra.length) out.push(`other scroll regions: ${extra.join(', ')}`);
  if (w >= 768 && (m.sidebarBottom === null || Math.abs(m.sidebarBottom - m.vh) > 1)) out.push(`sidebar bottom ${m.sidebarBottom} ≠ viewport ${m.vh}`);
  return out;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await browser.newContext();
    await qaBrowserLogin(ctx, 'qa-admin@courage-library.test', BASE);
    const page = await ctx.newPage();
    const nonGet = [];
    page.on('request', (r) => { if (r.method() !== 'GET') nonGet.push(r.url().replace(BASE, '')); });
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        if (new URL(page.url()).pathname !== route) {
          // a transient session-check failure lands on /auth/unavailable: retry once, then fail loudly
          await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
          if (new URL(page.url()).pathname !== route) { chk(`S ${w}x${h} ${route}: reached`, false, `landed on ${new URL(page.url()).pathname}`); continue; }
        }
        const m = await page.evaluate(measure);
        if (DIAGNOSE) console.log(`${w}x${h} ${route}`, JSON.stringify(m));
        const p = problems(m, w);
        chk(`S ${w}x${h} ${route}: one scroll container, no document scroll${w >= 768 ? ', sidebar full height' : ''}`, p.length === 0, p.join('; '));
      }
    }
    // S-4: a drawer — "New category" opens the Studio drawer (opening it writes nothing)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/admin/categories`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'New category' }).click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    const md = await page.evaluate(measure);
    chk('S-4 a drawer opens without making the document scroll', md.docHeight <= md.vh + 1 && md.docTop === 0, JSON.stringify(md));
    // N-1: negative control — let the shell grow (test-only style) → the same checks must fail
    await page.goto(`${BASE}/admin/syllabus`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '[data-admin-shell]{height:auto!important;max-height:none!important;overflow:visible!important} #admin-content{overflow:visible!important}' });
    const neg = problems(await page.evaluate(measure), 1440);
    chk('N-1 negative control: with the shell allowed to grow, the gate reports the document scroll', neg.length > 0, 'no problem found');
    chk('R read only: no non-GET request', nonGet.length === 0, nonGet.join(', '));
  } finally {
    await browser.close();
  }
  console.log(ok ? 'SHELL-SCROLL: all checks passed' : 'SHELL-SCROLL: FAILED');
  process.exit(ok ? 0 : 1);
})();
