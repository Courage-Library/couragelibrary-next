#!/usr/bin/env node
/**
 * ADMIN-UX-1 visual capture (phase B/C before/after evidence) — LOCAL ONLY, READ ONLY. Never run in CI: admin pages
 * show personal data and CI artifacts of a public repo are public (architect Q7, 2026-10-26).
 *   - signs in as the permanent QA admin (and QA staff for the role-aware views) via scripts/live/qa-session.cjs
 *     (cookies only — no form, no captcha); base URL must be a local dev host
 *   - every e-mail address in the DOM (text, input values, title / aria attributes) is replaced by "•••@•••"
 *     BEFORE each screenshot; the run FAILS if any e-mail-looking string is still present afterwards
 *   - records every non-GET request made by the pages; the run fails if there is one (read-only browsing)
 *   - axe-core (WCAG 2.0/2.1/2.2 A + AA) on each route at 1440: serious / critical counts per route → summary.json
 *   - output is written OUTSIDE the repository (names / student data are not masked; captures are never committed)
 * Usage (through scripts/live/with-server.cjs only):
 *   node scripts/visual/admin-capture.cjs --base=http://localhost:3100 --out=<dir> [--widths=1440,1024] [--routes=a,b]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { qaBrowserLogin } = require(path.join(ROOT, 'scripts/live/qa-session.cjs'));

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const BASE = arg('base', 'http://localhost:3100').replace(/\/$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE)) throw new Error('base must be a local dev host');
// OUTSIDE the repo by default: names / student data stay on screen even with e-mails blanked — never commit captures
const OUT = path.resolve(arg('out', path.join(ROOT, '..', 'CourageLibrary-Backups', 'admin-ux1-captures', 'capture')));
if (OUT.startsWith(ROOT + path.sep)) throw new Error('--out must be outside the repository (captures may show names)');
const WIDTHS = arg('widths', '1440,1024').split(',').map(Number);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Every static admin route (dynamic [segments] are skipped; redirects are recorded as such). */
function staticRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/\[/.test(e.name)) walk(rel); } else if (e.name === 'page.tsx') out.push('/' + dir.replace(/^app\/?/, ''));
    }
  };
  walk('app/admin');
  return out.sort();
}

async function maskEmails(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'g');
    let n = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (re.test(t.nodeValue)) { t.nodeValue = t.nodeValue.replace(re, '•••@•••'); n++; }
    for (const el of document.querySelectorAll('input, textarea')) if (re.test(el.value)) { el.value = el.value.replace(re, '•••@•••'); n++; }
    for (const el of document.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
      for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v && re.test(v)) { el.setAttribute(a, v.replace(re, '•••@•••')); n++; } }
    }
    const left = (document.body.innerText.match(re) || []).length;
    return { masked: n, left };
  }, EMAIL_RE.source);
}

async function axe(page) {
  await page.addScriptTag({ path: path.join(ROOT, 'node_modules/axe-core/axe.min.js') });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const routes = arg('routes', '') ? arg('routes', '').split(',') : staticRoutes();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const summary = { base: 'local', widths: WIDTHS, routes: [], nonGet: [], emailLeaks: [] };
  try {
    // --as=anon|student|staff|admin (comma list) runs the given routes as those identities (BRAND-3 student pages);
    // default: admin on every route + staff on two (the ADMIN-UX-1 role-aware views)
    const EMAIL = { admin: 'qa-admin@courage-library.test', staff: 'qa-staff@courage-library.test', student: 'qa-student@courage-library.test', anon: null };
    const AS = arg('as', '') ? arg('as', '').split(',').filter((w) => w in EMAIL) : null;
    const plan = AS ? AS.map((w) => [w, EMAIL[w], routes]) : [['admin', EMAIL.admin, routes], ['staff', EMAIL.staff, ['/admin', '/admin/questions/factory']]];
    for (const [who, email, list] of plan) {
      const ctx = await browser.newContext();
      if (email) await qaBrowserLogin(ctx, email, BASE);
      const page = await ctx.newPage();
      page.on('request', (r) => { if (r.method() !== 'GET' && r.method() !== 'HEAD') summary.nonGet.push(`${who} ${r.method()} ${new URL(r.url()).pathname}`); });
      for (const route of list) {
        const row = { who, route, status: null, finalPath: null, shots: [], axe: null };
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: 900 });
          const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 60)}` }));
          row.status = typeof res.status === 'function' ? res.status() : null;
          row.finalPath = new URL(page.url()).pathname;
          await page.waitForTimeout(400);
          const m = await maskEmails(page);
          if (m.left) summary.emailLeaks.push(`${who} ${route}@${w}: ${m.left}`);
          const file = `${who}${route.replace(/\//g, '_') || '_root'}@${w}.png`;
          if (!m.left) await page.screenshot({ path: path.join(OUT, file), fullPage: true });
          row.shots.push(file);
          if (w === WIDTHS[0] && (AS || who === 'admin')) row.axe = await axe(page).catch((e) => [{ id: 'AXE_ERROR', impact: 'n/a', nodes: 0, note: e.message.slice(0, 80) }]);
        }
        summary.routes.push(row);
        console.log(`${who} ${route} → ${row.status} ${row.finalPath}${row.axe ? ' axe ' + row.axe.map((v) => `${v.id}×${v.nodes}`).join(',') : ''}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  const axeTotal = summary.routes.reduce((s, r) => s + (r.axe ? r.axe.length : 0), 0);
  console.log(`routes ${summary.routes.length} · non-GET ${summary.nonGet.length} · e-mail leaks ${summary.emailLeaks.length} · axe serious/critical rules ${axeTotal}`);
  process.exit(summary.nonGet.length || summary.emailLeaks.length ? 1 : 0);
})().catch((e) => { console.log('ERROR', e.message.slice(0, 200)); process.exit(2); });
