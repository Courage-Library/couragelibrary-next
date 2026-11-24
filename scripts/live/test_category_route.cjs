#!/usr/bin/env node
/**
 * CATEGORY-ROUTE-LIVE (LIVE-GREEN-1 3a, owner 2026-11-24) — /exams/<category> never loops and the internal cached
 * route is never indexed, on a WARM local production build (`next start`, the CI live server). Anonymous, read-only.
 *
 * Root cause it guards: the middleware rewrites /exams/<category> to the cached category route; that route used to be
 * /category/<slug>, which SEO-1 308s to /exams/<slug>. Under `next start` the rewritten request is routed again, so once
 * the middleware's category list was warm, /exams/<category> answered 308 to itself (Chrome: 20 hops) — SMOKE-* failed
 * at /auth/login (the header prefetches /exams/ssc), UX2A L-17 saw "/exams/ssc 308" (dispatches since 45093554555).
 * The route is now /category-cache/<slug> (lib/exams/category-cache-route.ts; offline gate CATEGORY-CACHE-1).
 *
 *   C-0 warm-up (≤ 30 s): a category hub from sitemap.xml is served by the cached route (200 + cache-control s-maxage)
 *       — or loops (308 to itself, then C-1 / C-2 fail); none at all → vacuous → fail
 *   C-1 every category hub, plain GET → 200 from the cached route, never redirected (3 rounds)
 *   C-2 every category hub, router request (RSC + prefetch headers, ?_rsc) → 200, never redirected (3 rounds)
 *   C-3 /category/<slug>?a=1&b=two → ONE 308 to /exams/<slug>?a=1&b=two (SEO-1; query kept); the target answers 200
 *   C-4 /auth/login in a browser: the signed-in smoke's own request rule (no non-static path > 3×, static > 10×,
 *       nothing open > 30 s)
 *   C-5 negative controls: the verdicts reject a self-308 (the loop), an uncached hub, a 307, a dropped query, two hops,
 *       a noindexed hub, a direct internal request without noindex / with a wrong canonical
 *   C-6 a DIRECT /category-cache/<slug> → 200, X-Robots-Tag noindex (beyond the host's own value), canonical
 *       /exams/<slug>; and /exams/<slug> carries exactly the host's X-Robots-Tag (control page /about) — never more
 *   C-7 sitemap.xml lists no /category-cache URL (robots.txt: offline K-4 — non-production hosts disallow "/")
 *   Broken variant (owner): the build of a241a9d (internal /category/<slug> + the SEO-1 308) fails C-1 / C-2 / C-3 / C-4.
 * Usage: node scripts/live/test_category_route.cjs [http://localhost:3100]
 */
'use strict';
const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');

let passed = 0;
let failed = 0;
function check(name, ok, info = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`);
}

/** one hop: status, location (path + query), cache-control, x-robots-tag, body (text) */
async function hop(url, headers = {}, body = false) {
  let r;
  for (let i = 1; i <= 3; i++) {
    try { r = await fetch(url, { headers, redirect: 'manual' }); break; } catch (e) { if (i === 3) throw new Error(`GET ${new URL(url).pathname}: ${e.cause ? e.cause.code : 'network error'}`); }
  }
  const text = body ? await r.text() : (await r.arrayBuffer().catch(() => null), '');
  const loc = r.headers.get('location');
  const rel = (u) => { if (!u) return null; const x = new URL(u, BASE); return x.pathname + x.search; };
  return { status: r.status, location: rel(loc), cc: r.headers.get('cache-control') || '', xrt: r.headers.get('x-robots-tag') || '', text };
}

// ---- verdicts (pure: C-5 feeds them broken shapes) ----
const cached = (h) => /s-maxage=\d+/.test(h.cc);
/** a category hub: 200 from the cached route, never redirected, never more X-Robots-Tag than the host gives every page */
const hubOk = (h, hostXrt) => h.status === 200 && !h.location && cached(h) && h.xrt === hostXrt;
/** /category/<slug>?q → exactly one 308 to /exams/<slug>?q, whose target answers 200 */
const legacyOk = (slug, query, first, second) => first.status === 308 && first.location === `/exams/${slug}${query}` && second.status === 200 && !second.location;
const tokens = (x) => x.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
/** a direct internal request: 200, noindex beyond the host value, canonical → /exams/<slug> */
const directOk = (slug, h, hostXrt) => {
  const extra = h.xrt !== hostXrt && tokens(h.xrt).includes('noindex');
  const canon = (h.text.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  return h.status === 200 && extra && /\/exams\/[a-z0-9-]+$/.test(canon) && canon.endsWith(`/exams/${slug}`);
};

(async () => {
  console.log(`CATEGORY-ROUTE-LIVE (${BASE})`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { check('runs against a local build only', false, new URL(BASE).hostname); process.exit(1); }

  const control = await hop(`${BASE}/about`);
  const hostXrt = control.xrt; // the host's own X-Robots-Tag (localhost: SEO-HYGIENE noindex on every page)
  const xml = (await hop(`${BASE}/sitemap.xml`, {}, true)).text;
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const candidates = [...new Set(locs.filter((p) => /^\/exams\/[a-z0-9-]+$/.test(p)))];

  // C-0 warm-up: the middleware's category list loads in the background; a hub is warm once it is served by the cached
  // route (s-maxage) — or loops (the broken build)
  const hubs = new Map(); // slug → 'cached' | 'loop'
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && hubs.size === 0) {
    for (const p of candidates) {
      const h = await hop(BASE + p);
      if (h.status === 200 && cached(h)) hubs.set(p.split('/')[2], 'cached');
      else if (h.status === 308 && h.location === p) hubs.set(p.split('/')[2], 'loop');
    }
    if (!hubs.size) await new Promise((r) => setTimeout(r, 1000));
  }
  check('C-0 warm-up: a category hub is served by the cached route (or loops) within 30 s', hubs.size > 0, hubs.size ? [...hubs].map(([s, k]) => `${s}: ${k}`).join(', ') + ` (of ${candidates.length} /exams/<x> sitemap URLs)` : `none of ${candidates.length} candidates (vacuous)`);
  if (!hubs.size) process.exit(1);
  const slugs = [...hubs.keys()];

  const bad1 = [];
  const bad2 = [];
  for (const slug of slugs) {
    for (let i = 0; i < 3; i++) {
      const plain = await hop(`${BASE}/exams/${slug}`);
      if (!hubOk(plain, hostXrt)) bad1.push(`${slug}#${i}: ${plain.status}${plain.location ? ' → ' + plain.location : ''}${cached(plain) ? '' : ' (not cached)'}${plain.xrt !== hostXrt ? ` xrt "${plain.xrt}"` : ''}`);
      const rsc = await hop(`${BASE}/exams/${slug}?_rsc=cr${i}`, { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Url': '/auth/login' });
      if (rsc.status !== 200 || rsc.location) bad2.push(`${slug}#${i}: ${rsc.status}${rsc.location ? ' → ' + rsc.location : ''}`);
    }
  }
  check('C-1 category hub, plain GET → 200 from the cached route, never redirected, no extra X-Robots-Tag (3 rounds)', bad1.length === 0, bad1.length ? bad1.slice(0, 3).join(' | ') : `${slugs.length} hub(s); X-Robots-Tag = host value "${hostXrt}"`);
  check('C-2 category hub, router (RSC prefetch) request → 200, never redirected (3 rounds)', bad2.length === 0, bad2.length ? bad2.slice(0, 3).join(' | ') : `${slugs.length} hub(s)`);

  const q = '?a=1&b=two';
  const bad3 = [];
  for (const slug of slugs) {
    const first = await hop(`${BASE}/category/${slug}${q}`);
    const second = first.location ? await hop(BASE + first.location) : { status: 0 };
    if (!legacyOk(slug, q, first, second)) bad3.push(`${slug}: ${first.status} → ${first.location} → ${second.status}`);
  }
  check('C-3 /category/<slug>?query → one 308 to /exams/<slug>?query (query kept), target 200', bad3.length === 0, bad3.length ? bad3.join(' | ') : `${slugs.length} hub(s), query kept`);

  // C-4: the signed-in smoke's own request rule on /auth/login (anonymous; no form submit)
  {
    const { chromium } = require('playwright');
    const STATIC_TYPES = new Set(['image', 'font', 'media', 'stylesheet', 'manifest']);
    const STATIC_PATH = /^\/_next\/(image|static\/media)\b|\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css)$/i;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await (await browser.newContext()).newPage();
      const reqs = new Map();
      let active = true;
      const origin = new URL(BASE).origin;
      const pathOf = (u) => { try { const x = new URL(u); return (x.origin === origin ? '' : '[external]') + x.pathname; } catch { return '?'; } };
      page.on('request', (r) => { if (active) reqs.set(r, { key: `${r.method()} ${pathOf(r.url())}`, isStatic: STATIC_TYPES.has(r.resourceType()) || STATIC_PATH.test(pathOf(r.url())), start: Date.now(), end: null }); });
      page.on('requestfinished', (r) => { const e = reqs.get(r); if (e) e.end = Date.now(); });
      page.on('requestfailed', (r) => { const e = reqs.get(r); if (e) e.end = Date.now(); });
      await page.goto(BASE + '/auth/login', { waitUntil: 'load', timeout: 30000 });
      await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(3000);
      active = false;
      const all = [...reqs.values()];
      const now = Date.now();
      const top = (xs) => { const m = {}; for (const e of xs) m[e.key] = (m[e.key] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1])[0] || ['-', 0]; };
      const [dk, dn] = top(all.filter((e) => !e.isStatic));
      const [sk, sn] = top(all.filter((e) => e.isStatic));
      const long = all.filter((e) => (e.end === null ? now : e.end) - e.start > 30000);
      check('C-4 /auth/login request rule of the signed-in smoke (no path > 3×, static > 10×, nothing open > 30 s)', dn <= 3 && sn <= 10 && long.length === 0, `${all.length} requests, max ${dn}× ${dk}, static max ${sn}× ${sk}, ${long.length} > 30 s`);
    } finally {
      await browser.close();
    }
  }

  // C-6 the internal route itself: a direct request is noindexed, canonical → /exams/<slug>
  const bad6 = [];
  for (const slug of slugs) {
    const d = await hop(`${BASE}/category-cache/${slug}`, {}, true);
    if (!directOk(slug, d, hostXrt)) bad6.push(`${slug}: ${d.status}, xrt "${d.xrt}" (host "${hostXrt}"), canonical ${(d.text.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] ? new URL((d.text.match(/<link rel="canonical" href="([^"]+)"/) || [])[1]).pathname : 'none'}`);
  }
  check('C-6 direct /category-cache/<slug> → 200, X-Robots-Tag noindex beyond the host value, canonical /exams/<slug>', bad6.length === 0, bad6.length ? bad6.join(' | ') : `${slugs.length} hub(s)`);

  // C-7 never in the sitemap
  const leaked = locs.filter((p) => /^\/category-cache(\/|$)/.test(p));
  check('C-7 sitemap.xml lists no /category-cache URL', leaked.length === 0, leaked.length ? leaked.slice(0, 3).join(', ') : `${locs.length} URLs`);

  // C-5 negative controls on the verdicts
  const s = slugs[0];
  const HX = 'noindex, nofollow';
  const page = (canon) => `<html><head><link rel="canonical" href="https://couragelibrary.in${canon}"/></head></html>`;
  const controls = [
    ['the loop: hub answers 308 to itself', !hubOk({ status: 308, location: `/exams/${s}`, cc: '', xrt: HX }, HX)],
    ['hub not served by the cached route', !hubOk({ status: 200, location: null, cc: 'private, no-cache', xrt: HX }, HX)],
    ['hub noindexed (marker missing)', !hubOk({ status: 200, location: null, cc: 's-maxage=60', xrt: `${HX}, noindex` }, HX)],
    ['legacy 307 (temporary)', !legacyOk(s, q, { status: 307, location: `/exams/${s}${q}` }, { status: 200 })],
    ['legacy redirect drops the query', !legacyOk(s, q, { status: 308, location: `/exams/${s}` }, { status: 200 })],
    ['legacy redirect lands on another redirect (two hops)', !legacyOk(s, q, { status: 308, location: `/exams/${s}${q}` }, { status: 308, location: `/exams/${s}` })],
    ['direct internal request without noindex', !directOk(s, { status: 200, xrt: HX, text: page(`/exams/${s}`) }, HX)],
    ['direct internal request with a self canonical', !directOk(s, { status: 200, xrt: `${HX}, noindex`, text: page(`/category-cache/${s}`) }, HX)],
    ['direct internal request redirected', !directOk(s, { status: 308, xrt: `${HX}, noindex`, text: '' }, HX)],
  ];
  const missed = controls.filter(([, caught]) => !caught).map(([n]) => n);
  check('C-5 negative controls: each broken shape is rejected', missed.length === 0, missed.length ? `not caught: ${missed.join(', ')}` : `${controls.length}/${controls.length}`);

  console.log(`\nCATEGORY-ROUTE-LIVE: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(`  FAIL  CATEGORY-ROUTE-LIVE crashed — ${String(e && e.message).slice(0, 160)}`);
  process.exit(1);
});
