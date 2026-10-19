/**
 * Current-affairs candidate routes — status, empty states (wording reviewed by humans), no DRAFT leaks (UX-2a.1, architect note).
 *
 * Added when decision #48 removed the root app/loading.tsx: that streaming boundary had masked a server render error
 * on /current-affairs and /current-affairs/date/[date] (formatEventDate called from a client module) as HTTP 200 +
 * error UI. This suite asserts real statuses on the LOCAL production build. It replaces, for these routes, the
 * legacy CA-5 / CA-6 suites, which connect with TLS verification disabled and are never run (HOTFIX-2 inventory,
 * backlog TEST-CA).
 *
 *   C-1 /current-affairs → 200, no error digest; with 0 published articles an empty-state block, no article cards (its wording is a human review item)
 *   C-2 /current-affairs/date/<valid date> → 200 (empty state when nothing is published that day); malformed date → 404
 *   C-3 /current-affairs/month/<valid month> → 200 (empty state when nothing published); malformed / month 13 → 404
 *   C-4 /current-affairs/<unknown slug> → 404
 *   C-5 no DRAFT leak: no non-PUBLISHED article's slug or headline appears on the hub / date / month pages, and each
 *       non-PUBLISHED article's own URL → 404 (DB read: verified TLS, read-only, transaction-scoped)
 *   C-6 every published article (if any) → 200 at /current-affairs/<slug>
 *
 * Run (via the live-gate runner, docs/testing/LIVE_GATES.md):
 *   node scripts/live/with-server.cjs -- "node scripts/test_ca_routes.cjs http://localhost:3100"
 */
const { Client } = require('pg');
const { dbTarget } = require('./db/_db-env.cjs');

const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.error('refused: local build only'); process.exit(2); }

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const get = async (p) => {
  for (let i = 1; i <= 3; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      const r = await fetch(BASE + p, { redirect: 'manual', signal: ctrl.signal });
      const body = await r.text();
      clearTimeout(t);
      return { status: r.status, body };
    } catch (e) { if (i === 3) throw new Error(`GET ${p}: ${e.cause ? e.cause.code : e.name}`); }
  }
};
const ERROR_DIGEST = /Attempted to call|NEXT_HTTP_ERROR_FALLBACK;500|"digest":"\d+"|Something went wrong/;
const notFoundShape = (r) => r.status === 404 || (r.status === 200 && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(r.body));
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

(async () => {
  console.log('Current-affairs candidate routes');
  // DB: what exists (verified TLS via dbTarget; read-only transaction)
  let published = [];
  let hidden = [];
  {
    let lastErr = null;
    for (let i = 1; i <= 3 && !published.length && !hidden.length; i++) {
      const c = new Client({ ...dbTarget().pg, port: 6543 });
      c.on('error', () => {});
      try {
        await c.connect();
        await c.query('BEGIN READ ONLY');
        // headline: every version's headline (a DRAFT revision of a published article must not leak either)
        const rows = (await c.query(`SELECT a.slug, a.status, a.news_date::text d, (SELECT v.headline FROM public.current_affairs_article_versions v WHERE v.article_id = a.id ORDER BY v.version_number DESC LIMIT 1) headline FROM public.current_affairs_articles a`)).rows;
        await c.query('ROLLBACK');
        published = rows.filter((r) => r.status === 'PUBLISHED');
        hidden = rows.filter((r) => r.status !== 'PUBLISHED');
        lastErr = null;
        break;
      } catch (e) { lastErr = e.code || 'DB_ERROR'; } finally { await c.end().catch(() => {}); }
    }
    if (lastErr) { console.log(`  FAIL  DB read (${lastErr})`); failed++; return finish(); }
  }
  console.log(`  info: ${published.length} published, ${hidden.length} non-published article(s)`);

  const hub = await get('/current-affairs');
  await test('C-1 /current-affairs → 200, no error digest; empty-state block and no article cards when 0 published (wording: WARN)', async () => {
    assert(hub.status === 200, `status ${hub.status}`);
    assert(!ERROR_DIGEST.test(hub.body), 'error digest / error UI in the response');
    const articleLinks = (hub.body.replace(/href="\/current-affairs\/(date|month)\/[^"]+"/g, '').match(/href="\/current-affairs\/[a-z0-9-]{8,}"/g) || []).length;
    if (published.length > 0) assert(articleLinks >= 1, `${published.length} published but 0 article links on the hub`); // GATE-HYGIENE-1
    if (published.length === 0) {
      assert(articleLinks === 0, `${articleLinks} article link(s) shown with 0 published`);
      assert(/No current affairs published for[\s\S]{0,120}?yet\./i.test(hub.body), 'no empty-state block'); // UX-2b.H heading; the date may sit in its own tag / comment
      // UX-2b.H: the old copy claimed articles exist while 0 do; it must never return
      assert(!/undergoing 5-gate fact verification|Events Being Processed/i.test(hub.body), 'old empty-state wording is back ("5-gate fact verification" / "Events Being Processed")');
    }
    return published.length ? `${published.length} published` : 'empty-state block, 0 article links';
  });

  const dateOk = await get(`/current-affairs/date/${today}`);
  await test('C-2 /current-affairs/date: valid date → 200 (empty state if none); malformed → 404', async () => {
    assert(dateOk.status === 200 && !ERROR_DIGEST.test(dateOk.body), `valid date: status ${dateOk.status}${ERROR_DIGEST.test(dateOk.body) ? ' + error digest' : ''}`);
    if (!published.some((a) => a.d === today)) assert(/No events recorded for/.test(dateOk.body), 'empty state missing');
    for (const bad of ['not-a-date', '2026-1-1', '20261017']) {
      const r = await get(`/current-affairs/date/${bad}`);
      assert(notFoundShape(r), `${bad}: status ${r.status}`);
    }
    return 'valid 200; 3 malformed → 404';
  });

  const monthOk = await get(`/current-affairs/month/${month}`);
  await test('C-3 /current-affairs/month: valid month → 200 (empty state if none); malformed / month 13 → 404', async () => {
    assert(monthOk.status === 200 && !ERROR_DIGEST.test(monthOk.body), `valid month: status ${monthOk.status}`);
    if (!published.some((a) => (a.d || '').startsWith(month))) assert(/No events recorded in/.test(monthOk.body), 'empty state missing');
    for (const bad of ['2026-13', 'bad', '2026-1']) {
      const r = await get(`/current-affairs/month/${bad}`);
      assert(notFoundShape(r), `${bad}: status ${r.status}`);
    }
    return 'valid 200; 3 malformed → 404';
  });

  await test('C-4 /current-affairs/<unknown slug> → 404', async () => {
    const r = await get('/current-affairs/ux2a1-no-such-article-0000');
    assert(notFoundShape(r), `status ${r.status}`);
    return String(r.status);
  });

  await test('C-5 no DRAFT leak: non-published slugs / headlines never shown; their URLs → 404', async () => {
    const pages = [hub.body, dateOk.body, monthOk.body].join('\n');
    if (hidden.length === 0) console.log('  WARN  VACUOUS (0 items): C-5 there are no non-published articles, so no draft leak could be tested'); // GATE-HYGIENE-1
    const leaks = hidden.filter((a) => (a.slug && pages.includes(a.slug)) || (a.headline && a.headline.length > 12 && pages.includes(a.headline)));
    assert(leaks.length === 0, `${leaks.length} non-published article(s) visible (status ${[...new Set(leaks.map((l) => l.status))].join(', ')})`);
    const sample = hidden.slice(0, 10);
    for (const a of sample) {
      if (!a.slug) continue;
      const r = await get(`/current-affairs/${encodeURIComponent(a.slug)}`);
      assert(notFoundShape(r), `a ${a.status} article answers ${r.status}`);
    }
    return `${hidden.length} non-published checked on 3 pages; ${sample.length} URL(s) → 404`;
  });

  await test('C-6 every published article → 200', async () => {
    for (const a of published.slice(0, 20)) {
      const r = await get(`/current-affairs/${encodeURIComponent(a.slug)}`);
      assert(r.status === 200 && !ERROR_DIGEST.test(r.body), `published article → ${r.status}`);
    }
    if (!published.length) console.log('  WARN  VACUOUS (0 items): C-6 no published article to request'); // GATE-HYGIENE-1
    return published.length ? `${Math.min(20, published.length)} checked` : 'VACUOUS: none published';
  });
  finish();
})().catch((e) => { console.error('SUITE ERROR', e.code || e.name || 'error'); process.exit(1); });

function finish() {
  console.log(`\nCA routes: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
