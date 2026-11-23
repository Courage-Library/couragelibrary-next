#!/usr/bin/env node
/**
 * LEGAL-LINK-1 gate (owner, 2026-11-23) — no public footer may lose a compliance link again. Offline (source only);
 * the rendered pages are checked by the anonymous smoke (LEGAL-LINK-1 check), which runs before every promotion.
 *   L-1 the shared helper (scripts/smoke/_legal-links.cjs) self-test: footer-only, exact paths, missing → caught
 *   L-2 landing footer ("/" and "/hi", components/landing-v1): its columns link R.terms, R.privacy, R.refund, R.shipping
 *       and R.contact; LANDING_ROUTES maps them to the five paths; EN + HI carry a shipping label (HI: शिपिंग पॉलिसी)
 *   L-3 navy footer (/exams, /about … components/shell/site-footer via FOOTER_ABOUT.legal): all five paths, rendered
 *       unconditionally (FOOTER_LEGAL mapped with no flag filter)
 *   L-4 the anonymous smoke checks /, /hi, /exams, /about with the helper
 *   L-5 negative controls: each broken variant is caught
 * Run: node scripts/test_legal_link1.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const FIVE = ['/privacy', '/terms', '/refund-policy', '/shipping-policy', '/contact'];
const SRC = {
  page: read('components/landing-v1/landing-page.tsx'),
  facts: read('content/landing-page/facts.ts'),
  en: read('content/landing-page/en.ts'),
  hi: read('content/landing-page/hi.ts'),
  types: read('content/landing-page/types.ts'),
  pub: read('content/public-pages.ts'),
  footer: read('components/shell/site-footer.tsx'),
  smoke: read(path.join('scripts', 'smoke', fs.readdirSync(path.join(ROOT, 'scripts/smoke')).find((f) => /^anonymous-smoke\.cjs$/.test(f)))),
};

function checkLanding(s) {
  // routes: the keys the footer uses → the five paths
  const routes = s.facts.slice(s.facts.indexOf('export const LANDING_ROUTES'), s.facts.indexOf('} as const;', s.facts.indexOf('export const LANDING_ROUTES')));
  const want = { privacy: '/privacy', terms: '/terms', refund: '/refund-policy', shipping: '/shipping-policy', contact: '/contact' };
  for (const [k, p] of Object.entries(want)) assert(new RegExp(`\\n {2}${k}: "${p}",`).test(routes), `LANDING_ROUTES.${k} is not "${p}"`);
  // the footer columns (the array literal in the footer function)
  const at = s.page.indexOf('const l = t.footer.links;');
  assert(at > 0, 'landing footer links block not found');
  const cols = s.page.slice(at, s.page.indexOf('<footer', at));
  for (const k of Object.keys(want)) assert(new RegExp(`\\[l\\.${k}, R\\.${k}\\]`).test(cols), `the landing footer does not link [l.${k}, R.${k}]`);
  assert(/<footer className="lp-ft"/.test(s.page), 'the landing footer element is gone');
  // labels
  assert(/\n {6}shipping: string;\n/.test(s.types), 'LandingCopy footer.links has no shipping label');
  assert(/\n {6}shipping: "Shipping policy",\n/.test(s.en), 'EN shipping label missing');
  assert(/\n {6}shipping: "शिपिंग पॉलिसी",\n/.test(s.hi), 'HI shipping label is not "शिपिंग पॉलिसी"');
  return 'columns link terms · privacy · refund · shipping · contact; EN + HI labels';
}

function checkNavy(s) {
  const legalAt = s.pub.indexOf('export const FOOTER_ABOUT');
  const block = s.pub.slice(legalAt, s.pub.indexOf('} as const;', legalAt));
  const legal = block.slice(block.indexOf('legal: ['));
  for (const p of FIVE) assert(legal.includes(`{ href: "${p}", `), `FOOTER_ABOUT.legal does not link ${p}`);
  assert(/\{FOOTER_LEGAL\.map\(\(it\) => \(/.test(s.footer), 'site-footer does not render FOOTER_LEGAL unfiltered');
  return 'FOOTER_ABOUT.legal has all five; rendered unfiltered';
}

function checkSmoke(s) {
  assert(/require\('\.\/_legal-links\.cjs'\)/.test(s.smoke) && /await checkLegalPages\(BASE, \{ headers: BYPASS_HEADERS \}\)/.test(s.smoke), 'the anonymous smoke does not check the footers with the helper (full HTML, bypass headers)');
  assert(/LEGAL-LINK-1 fetch failed — links NOT checked/.test(s.smoke) && /fetchFailed\.length === 0 && missing\.length === 0/.test(s.smoke), 'a fetch failure is not reported as such / does not fail the check');
  const { LEGAL_PAGES, LEGAL_PATHS } = require(path.join(ROOT, 'scripts/smoke/_legal-links.cjs'));
  assert(JSON.stringify(LEGAL_PAGES) === JSON.stringify(['/', '/hi', '/exams', '/about']) && JSON.stringify([...LEGAL_PATHS].sort()) === JSON.stringify([...FIVE].sort()), 'the smoke pages / paths are not / /hi /exams /about × the five');
  return 'smoke checks / /hi /exams /about × 5 paths';
}

test('L-1 helper self-test (footer-only, exact paths, missing → caught)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/smoke/_legal-links.cjs')], { encoding: 'utf8', timeout: 20000 });
  assert(r.status === 0, `self-test failed: ${r.stdout.split('\n').filter((l) => /FAIL/.test(l)).join(' | ')}`);
  return (r.stdout.match(/(\d+\/\d+) passed/) || [])[1];
});
test('L-1b a fetch failure is "fetch failed", never "links missing" (closed local port, no outside request)', () => {
  const r = spawnSync(process.execPath, ['-e', "require(process.argv[1]).checkLegalPages('http://127.0.0.1:9', { attempts: 2, timeoutMs: 3000 }).then((x) => console.log(JSON.stringify(x)))", path.join(ROOT, 'scripts/smoke/_legal-links.cjs')], { encoding: 'utf8', timeout: 60000 });
  const res = JSON.parse(r.stdout || '[]');
  assert(res.length === 4 && res.every((x) => x.kind === 'fetch-failed' && x.missing === null && /after 2 attempts/.test(x.error)), `unexpected: ${r.stdout.slice(0, 200)}`);
  // the helper reads the COMPLETE final page: redirects followed, whole body, per-attempt timeout
  const h = read('scripts/smoke/_legal-links.cjs');
  assert(/redirect: 'follow'/.test(h) && /AbortSignal\.timeout\(timeoutMs\)/.test(h) && /await r\.text\(\)/.test(h) && /<\\\/html>/.test(h), 'fetchFull does not follow redirects / time out / read the whole body / require </html>');
  return '4/4 pages "fetch-failed" after 2 attempts; redirect follow + timeout + full body';
});
test('L-2 landing footer ("/", "/hi") links all five', () => checkLanding(SRC));
test('L-3 navy footer (/exams, /about) links all five', () => checkNavy(SRC));
test('L-4 the anonymous smoke checks the rendered footers', () => checkSmoke(SRC));

test('L-5 negative controls: each broken variant is caught', () => {
  const mut = (k, a, b) => {
    if (!SRC[k].includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 60)}`);
    return { ...SRC, [k]: SRC[k].split(a).join(b) };
  };
  const muts = [
    ['landing loses shipping', () => checkLanding(mut('page', ', [l.shipping, R.shipping]', ''))],
    ['landing loses privacy', () => checkLanding(mut('page', '[l.privacy, R.privacy], ', ''))],
    ['landing loses contact', () => checkLanding(mut('page', '[l.contact, R.contact], ', ''))],
    ['shipping route points elsewhere', () => checkLanding(mut('facts', 'shipping: "/shipping-policy"', 'shipping: "/shipping"'))],
    ['HI label in English', () => checkLanding(mut('hi', 'shipping: "शिपिंग पॉलिसी"', 'shipping: "Shipping policy"'))],
    ['navy footer loses shipping', () => checkNavy(mut('pub', '    { href: "/shipping-policy", label: "Shipping Policy" },\n', ''))],
    ['navy footer loses refund', () => checkNavy(mut('pub', '    { href: "/refund-policy", label: "Refund Policy" },\n', ''))],
    ['navy legal filtered by a flag', () => checkNavy(mut('footer', '{FOOTER_LEGAL.map((it) => (', '{visibleItems(FOOTER_LEGAL, flags).map((it) => ('))],
    ['smoke without the footer check', () => checkSmoke(mut('smoke', 'await checkLegalPages(BASE, { headers: BYPASS_HEADERS })', '[]'))],
    ['smoke ignores fetch failures', () => checkSmoke(mut('smoke', 'fetchFailed.length === 0 && missing.length === 0', 'missing.length === 0'))],
  ];
  const missed = [];
  for (const [name, run] of muts) {
    try {
      run();
      missed.push(name);
    } catch (e) {
      if (/mutation anchor missing/.test(String(e && e.message))) missed.push(`${name} (${e.message})`);
    }
  }
  assert(missed.length === 0, `not caught: ${missed.join('; ')}`);
  return `${muts.length}/${muts.length} broken variants caught`;
});

console.log('LEGAL-LINK-1 (offline)');
console.log(results.join('\n'));
console.log(`\nLEGAL-LINK-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
