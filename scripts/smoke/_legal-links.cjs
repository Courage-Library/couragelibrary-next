/**
 * LEGAL-LINK-1 (owner, 2026-11-23) — every public footer links all five compliance pages (payment-gateway compliance).
 * Pure helpers shared by the anonymous smoke (runs on the real rendered pages, before promotion) and the offline gate
 * scripts/test_legal_link1.cjs. Only links INSIDE a <footer> count (a consent line elsewhere on the page does not).
 * A link counts when its href is the path itself, optionally with a #fragment or ?query ("/contact#grievance-officer").
 */
const LEGAL_PATHS = ['/privacy', '/terms', '/refund-policy', '/shipping-policy', '/contact'];
const LEGAL_PAGES = ['/', '/hi', '/exams', '/about'];

function footerHtml(html) {
  return [...String(html || '').matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi)].map((m) => m[0]).join('\n');
}

/** the compliance paths the page's footer(s) do NOT link; [] = all five present; no footer → all five missing */
function missingLegalLinks(html) {
  const foot = footerHtml(html);
  return LEGAL_PATHS.filter((p) => !new RegExp(`href="${p.replace(/[/-]/g, (c) => `\\${c}`)}(?:[#?][^"]*)?"`).test(foot));
}

/**
 * Fetch one page's COMPLETE final HTML: follows redirects (www / alias → apex), reads the whole body, ≤ timeoutMs per
 * attempt, up to `attempts` tries (the smoke's own retry policy: 3). Never throws.
 * → { ok: true, status, body } | { ok: false, error } (network error / timeout / non-200 / empty body)
 */
async function fetchFull(url, { headers = {}, attempts = 3, timeoutMs = 30000 } = {}) {
  let last = '';
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow', headers, signal: AbortSignal.timeout(timeoutMs) });
      const body = await r.text();
      if (r.status !== 200) return { ok: false, error: `HTTP ${r.status}` };
      if (!/<\/html>/i.test(body)) {
        last = 'incomplete body (no </html>)';
        continue;
      }
      return { ok: true, status: r.status, body };
    } catch (e) {
      last = e && e.name === 'TimeoutError' ? `timeout ${timeoutMs / 1000}s` : String((e && e.cause && e.cause.code) || (e && e.message) || e).slice(0, 40);
    }
  }
  return { ok: false, error: `${last} after ${attempts} attempts` };
}

/** Check every page: → [{ page, kind: 'ok' | 'missing' | 'fetch-failed', found, missing, error }] */
async function checkLegalPages(base, opts = {}) {
  const out = [];
  for (const page of LEGAL_PAGES) {
    const f = await fetchFull(base.replace(/\/$/, '') + page, opts);
    if (!f.ok) {
      out.push({ page, kind: 'fetch-failed', found: null, missing: null, error: f.error });
      continue;
    }
    const missing = missingLegalLinks(f.body);
    out.push({ page, kind: missing.length ? 'missing' : 'ok', found: LEGAL_PATHS.length - missing.length, missing, error: null });
  }
  return out;
}

const describe = (r) => (r.kind === 'fetch-failed' ? `${r.page} FETCH FAILED (${r.error})` : `${r.page} ${r.found}/5${r.missing.length ? ` missing ${r.missing.join(' ')}` : ''}`);

function selfTest() {
  const all = LEGAL_PATHS.map((p) => `<a href="${p}">x</a>`).join('');
  const cases = [
    ['all five in the footer → none missing', `<main></main><footer class="lp-ft">${all}</footer>`, []],
    ['contact with a fragment counts', `<footer>${all.replace('href="/contact"', 'href="/contact#grievance-officer"')}</footer>`, []],
    ['shipping missing → caught', `<footer>${all.replace('<a href="/shipping-policy">x</a>', '')}</footer>`, ['/shipping-policy']],
    ['a link outside the footer does not count', `<main><a href="/shipping-policy">x</a></main><footer>${all.replace('<a href="/shipping-policy">x</a>', '')}</footer>`, ['/shipping-policy']],
    ['look-alike path does not count', `<footer>${all.replace('href="/terms"', 'href="/terms-old"')}</footer>`, ['/terms']],
    ['no footer → all missing', `<main>${all}</main>`, LEGAL_PATHS],
    ['links split over two footers count', `<footer>${LEGAL_PATHS.slice(0, 2).map((p) => `<a href="${p}">x</a>`).join('')}</footer><p></p><footer>${LEGAL_PATHS.slice(2).map((p) => `<a href="${p}">x</a>`).join('')}</footer>`, []],
  ];
  let bad = 0;
  for (const [name, html, want] of cases) {
    const got = missingLegalLinks(html);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  legal-links self-test: ${name}${ok ? '' : ` (got ${got.join(',')})`}`);
  }
  console.log(`legal-links self-test: ${cases.length - bad}/${cases.length} passed`);
  return bad === 0;
}

if (require.main === module) {
  const i = process.argv.indexOf('--check');
  if (i < 0) process.exit(selfTest() ? 0 : 1);
  // read-only anonymous check of a live base URL; counts only
  const base = process.argv[i + 1];
  if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1):\d+)$/i.test(String(base || ''))) {
    console.log('usage: _legal-links.cjs --check https://<host> | http://localhost:<port>');
    process.exit(2);
  }
  checkLegalPages(base).then((res) => {
    for (const r of res) console.log(`${r.kind === 'ok' ? 'OK  ' : r.kind === 'missing' ? 'MISS' : 'ERR '}  ${describe(r)}`);
    process.exit(res.every((r) => r.kind === 'ok') ? 0 : 1);
  });
}
module.exports = { LEGAL_PATHS, LEGAL_PAGES, footerHtml, missingLegalLinks, fetchFull, checkLegalPages, describe, selfTest };
