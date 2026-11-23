#!/usr/bin/env node
/**
 * LEGAL-LINK-1 gate (owner, 2026-11-23) — no public footer may lose a compliance link again. Offline (source only);
 * the rendered pages are checked by the anonymous smoke (LEGAL-LINK-1 check), which runs before every promotion.
 * FOOTER-1 retry (owner, 2026-11-23): re-pointed from the two old footers (the landing's inline footer and the navy
 * SiteFooter, both removed) to THE public footer, components/footer/public-footer.tsx — same rule.
 *   L-1  the shared helper (scripts/smoke/_legal-links.cjs) self-test: footer-only, exact paths, missing → caught
 *   L-1b a fetch failure is "fetch failed", never "links missing"; the helper reads the complete final page
 *   L-2  PublicFooter: FOOTER_ROUTES maps privacy / terms / refund / shipping / contact to the five paths;
 *        COMPLIANCE_ROUTES lists exactly those five; footerColumns links all five unconditionally (legal column: privacy,
 *        terms, refund, shipping; company column: contact); PublicFooter renders footerColumns unfiltered; EN + HI copy
 *        carry the labels (HI shipping: शिपिंग पॉलिसी)
 *        (was: the landing's inline footer columns R.terms … R.contact)
 *   L-3  every public page renders PublicFooter: the landing (/ and /hi) with no footer of its own, the public shell
 *        (/exams, /about …) and the app shell for visitors; no other public <footer> component exists
 *        (was: the navy SiteFooter's FOOTER_ABOUT.legal)
 *   L-4  the anonymous smoke checks /, /hi, /exams, /about with the helper
 *   L-5  negative controls: each broken variant is caught
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
  links: read('lib/site/footer-links.ts'),
  footer: read('components/footer/public-footer.tsx'),
  copy: read('content/footer.ts'),
  landing: read('components/landing-v1/landing-page.tsx'),
  publicShell: read('components/shell/public-shell.tsx'),
  appShell: read('components/shell/app-shell.tsx'),
  smoke: read(path.join('scripts', 'smoke', fs.readdirSync(path.join(ROOT, 'scripts/smoke')).find((f) => /^anonymous-smoke\.cjs$/.test(f)))),
};
const KEYS = { privacy: '/privacy', terms: '/terms', refund: '/refund-policy', shipping: '/shipping-policy', contact: '/contact' };

function checkPublicFooter(s) {
  const routes = s.links.slice(s.links.indexOf('export const FOOTER_ROUTES'), s.links.indexOf('} as const;', s.links.indexOf('export const FOOTER_ROUTES')));
  for (const [k, p] of Object.entries(KEYS)) assert(new RegExp(`\\n {2}${k}: "${p.replace(/[/-]/g, (c) => `\\${c}`)}",`).test(routes), `FOOTER_ROUTES.${k} is not "${p}"`);
  assert(/export const COMPLIANCE_ROUTES = \[FOOTER_ROUTES\.privacy, FOOTER_ROUTES\.terms, FOOTER_ROUTES\.refund, FOOTER_ROUTES\.shipping, FOOTER_ROUTES\.contact\] as const;/.test(s.links), 'COMPLIANCE_ROUTES is not exactly the five');
  const fc = s.links.slice(s.links.indexOf('export function footerColumns'), s.links.indexOf('\n}\n', s.links.indexOf('export function footerColumns')));
  const col = (key) => {
    const i = fc.indexOf(`key: "${key}"`);
    return i < 0 ? '' : fc.slice(i, fc.indexOf('\n    },', i));
  };
  const legal = col('legal');
  const company = col('company');
  for (const k of ['privacy', 'terms', 'refund', 'shipping']) assert(new RegExp(`\\n {8}\\{ label: t\\.${k}, href: FOOTER_ROUTES\\.${k} \\},`).test(legal), `the legal column does not link ${k} unconditionally`);
  assert(/\n {8}\{ label: t\.contact, href: FOOTER_ROUTES\.contact \},/.test(company), 'the company column does not link contact unconditionally');
  assert(/\{footerColumns\(t, categories\)\.map\(\(c\) => \(/.test(s.footer) && !/footerColumns\([^)]*\)\.filter/.test(s.footer), 'PublicFooter does not render footerColumns unfiltered');
  assert(/<footer\b/.test(s.footer), 'PublicFooter renders no <footer> element (the smoke checks inside <footer>)');
  for (const k of ['privacy', 'terms', 'refund', 'shipping', 'contact']) assert((s.copy.match(new RegExp(`\\n {2}${k}: "[^"]+",`, 'g')) || []).length === 2, `content/footer.ts: ${k} label not set for EN and HI`);
  assert(/\n {2}shipping: "Shipping Policy",/.test(s.copy) && /\n {2}shipping: "शिपिंग पॉलिसी",/.test(s.copy), 'shipping labels are not "Shipping Policy" / "शिपिंग पॉलिसी"');
  return 'FOOTER_ROUTES + COMPLIANCE_ROUTES = the five · legal + company columns link them unconditionally · EN + HI labels';
}

function checkWired(s) {
  assert(/<PublicFooter\b/.test(s.landing) && !/<footer\b/.test(s.landing), 'the landing (/ and /hi) does not render PublicFooter, or renders a footer of its own');
  assert(/<PublicFooter\b/.test(s.publicShell), 'the public shell (/exams, /about …) does not render PublicFooter');
  assert(/<PublicFooter\b/.test(s.appShell), 'the app shell does not render PublicFooter for visitors');
  // no other public footer component may exist (the old SiteFooter / inline landing footer must not come back)
  const others = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(e.name) && /<footer\b/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')) && !['components/footer/public-footer.tsx', 'components/footer/student-footer.tsx'].includes(rel)) others.push(rel);
    }
  };
  walk('components');
  walk('app');
  assert(others.length === 0, `another <footer> component: ${others.join(', ')}`);
  return 'landing + public shell + app shell render PublicFooter; no other public <footer>';
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
  const h = read('scripts/smoke/_legal-links.cjs');
  assert(/redirect: 'follow'/.test(h) && /AbortSignal\.timeout\(timeoutMs\)/.test(h) && /await r\.text\(\)/.test(h) && /<\\\/html>/.test(h), 'fetchFull does not follow redirects / time out / read the whole body / require </html>');
  return '4/4 pages "fetch-failed" after 2 attempts; redirect follow + timeout + full body';
});
test('L-2 PublicFooter links all five (FOOTER_ROUTES, COMPLIANCE_ROUTES, footerColumns, EN + HI labels)', () => checkPublicFooter(SRC));
test('L-3 every public page renders PublicFooter (/, /hi, /exams, /about …); no other public footer', () => checkWired(SRC));
test('L-4 the anonymous smoke checks the rendered footers', () => checkSmoke(SRC));

test('L-5 negative controls: each broken variant is caught', () => {
  const mut = (k, a, b) => {
    if (!SRC[k].includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 60)}`);
    return { ...SRC, [k]: SRC[k].split(a).join(b) };
  };
  const muts = [
    ['legal column loses shipping', () => checkPublicFooter(mut('links', '        { label: t.shipping, href: FOOTER_ROUTES.shipping },\n', ''))],
    ['legal column loses privacy', () => checkPublicFooter(mut('links', '        { label: t.privacy, href: FOOTER_ROUTES.privacy },\n', ''))],
    ['company column loses contact', () => checkPublicFooter(mut('links', '        { label: t.contact, href: FOOTER_ROUTES.contact },\n', ''))],
    ['shipping behind a flag', () => checkPublicFooter(mut('links', '        { label: t.shipping, href: FOOTER_ROUTES.shipping },\n', '        ...(flag ? [{ label: t.shipping, href: FOOTER_ROUTES.shipping }] : []),\n'))],
    ['shipping route points elsewhere', () => checkPublicFooter(mut('links', 'shipping: "/shipping-policy"', 'shipping: "/shipping"'))],
    ['COMPLIANCE_ROUTES drops refund', () => checkPublicFooter(mut('links', 'FOOTER_ROUTES.refund, FOOTER_ROUTES.shipping, FOOTER_ROUTES.contact] as const;', 'FOOTER_ROUTES.shipping, FOOTER_ROUTES.contact] as const;'))],
    ['PublicFooter filters the columns', () => checkPublicFooter(mut('footer', '{footerColumns(t, categories).map((c) => (', '{footerColumns(t, categories).filter((c) => c.key !== "legal").map((c) => ('))],
    ['HI shipping label in English', () => checkPublicFooter(mut('copy', 'shipping: "शिपिंग पॉलिसी"', 'shipping: "Shipping Policy"'))],
    ['landing grows its own footer again', () => checkWired(mut('landing', '<PublicFooter', '<footer className="lp-ft"></footer>\n      <PublicFooter'))],
    ['landing without PublicFooter', () => checkWired(mut('landing', '<PublicFooter', '<Nothing'))],
    ['public shell without PublicFooter', () => checkWired(mut('publicShell', '<PublicFooter', '<Nothing'))],
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
