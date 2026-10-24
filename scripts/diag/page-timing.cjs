/**
 * PROD-TIMEOUT-1 page timing diagnostic (diagnostics only; not a gate).
 * Usage: node scripts/diag/page-timing.cjs <baseUrl> <admin|student|anon> <path> [observeSec=60] [--owner]
 * Optionally signs in as a permanent QA identity, then navigates to <path> with waitUntil 'load' and reports: time to
 * load, time to networkidle (bounded by observeSec), requests started after load, requests still in flight, repeating
 * requests (≥ 3× the same path) and slow requests (> 30 s). Paths are printed without query strings; hosts, cookies
 * and tokens are never printed.
 * anon works against any base URL (anonymous GETs only). Signed-in modes run against localhost; against production
 * ONLY with --owner (the owner runs signed-in production checks; agents never sign in to production).
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const [, , BASE_ARG, WHO, TARGET, OBS] = process.argv;
const BASE = BASE_ARG.replace(/\/$/, '');
// anon mode may run against production (anonymous GETs only); signed-in modes are local-only unless --owner
if (WHO !== 'anon' && !/^http:\/\/localhost:\d+$/.test(BASE) && !process.argv.includes('--owner')) throw new Error('signed-in diagnostics against a non-local URL need --owner (owner only)');
const OBSERVE = Number(OBS || 60) * 1000;
const env = readEnv();
const ID = WHO === 'admin' ? ['qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD'] : ['qa-student@courage-library.test', 'QA_STUDENT_PASSWORD'];
const clean = (u) => { try { const x = new URL(u); return (x.origin === new URL(BASE).origin ? '' : `[${x.hostname.endsWith('supabase.co') ? 'supabase' : 'external'}]`) + x.pathname; } catch { return '?'; } };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  // CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs)
  if (WHO !== 'anon') await require('../live/qa-session.cjs').qaBrowserLogin(context, ID[0], BASE);
  const page = await context.newPage();
  if (WHO !== 'anon') await page.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(1500);
  const reqs = new Map();
  let seq = 0;
  const t0 = Date.now();
  page.on('request', (r) => reqs.set(r, { id: ++seq, method: r.method(), path: clean(r.url()), type: r.resourceType(), start: Date.now() - t0, end: null, status: null }));
  page.on('requestfinished', async (r) => { const e = reqs.get(r); if (e) { e.end = Date.now() - t0; try { e.status = (await r.response()).status(); } catch { /* ignore */ } } });
  page.on('requestfailed', (r) => { const e = reqs.get(r); if (e) { e.end = Date.now() - t0; e.status = 'FAILED ' + ((r.failure() || {}).errorText || ''); } });
  const res = await page.goto(BASE + TARGET, { waitUntil: 'load', timeout: 120000 }).catch((e) => ({ err: e.message.split('\n')[0] }));
  const tLoad = Date.now() - t0;
  let tIdle = null;
  try { await page.waitForLoadState('networkidle', { timeout: OBSERVE }); tIdle = Date.now() - t0; } catch { tIdle = null; }
  if (tIdle === null) await page.waitForTimeout(2000);
  const all = [...reqs.values()];
  const after = all.filter((e) => e.start > tLoad);
  const inflight = all.filter((e) => e.end === null);
  const slow = all.filter((e) => (e.end === null ? Date.now() - t0 : e.end) - e.start > 30000);
  const byKey = {};
  for (const e of all) { const k = `${e.method} ${e.path}`; byKey[k] = byKey[k] || { n: 0, statuses: new Set(), afterLoad: 0 }; byKey[k].n++; byKey[k].statuses.add(String(e.status)); if (e.start > tLoad) byKey[k].afterLoad++; }
  const repeating = Object.entries(byKey).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].n - a[1].n);
  console.log(`DIAG ${WHO} ${TARGET}: status ${res && res.status ? res.status() : res && res.err}; load ${tLoad} ms; networkidle ${tIdle === null ? `NEVER within ${OBSERVE / 1000} s` : tIdle + ' ms'}`);
  console.log(`  requests: total ${all.length}; started after load ${after.length}; in flight at end ${inflight.length}; slow (>30 s) ${slow.length}`);
  for (const [k, v] of repeating.slice(0, 12)) console.log(`  REPEAT ${v.n}× (${v.afterLoad} after load) ${k} [${[...v.statuses].join(',')}]`);
  for (const e of inflight.slice(0, 12)) console.log(`  INFLIGHT #${e.id} ${e.method} ${e.path} (${e.type}) since ${e.start} ms`);
  for (const e of slow.slice(0, 12)) console.log(`  SLOW #${e.id} ${e.method} ${e.path} ${e.start}→${e.end === null ? 'open' : e.end} ms [${e.status}]`);
  // timeline of requests after load (first 25)
  for (const e of after.slice(0, 25)) console.log(`  after-load #${e.id} +${e.start} ms ${e.method} ${e.path} (${e.type}) → ${e.end === null ? 'open' : e.end - e.start + ' ms'} [${e.status}]`);
  await browser.close();
})().catch((e) => { console.log('DIAG ERROR', String(e.message).split('\n')[0].slice(0, 200)); process.exit(1); });
