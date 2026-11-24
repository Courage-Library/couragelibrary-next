#!/usr/bin/env node
/**
 * DOMAIN-CUTOVER-1 legacy redirects — offline gate (owner Q4 2026-10-29, GO 2026-11-22).
 * The rules in lib/seo/legacy-redirects.ts are evaluated with Next.js's OWN matcher (next/dist/compiled/path-to-regexp,
 * case-insensitive like next.config redirects) over every legacy URL in docs/ops/DOMAIN_CUTOVER_1_LEGACY_URLS.txt
 * (596, re-read from the 9 legacy sitemaps on 2026-11-22):
 *   LR-1 every listed URL matches a rule (no 404), and its destination is an EXISTING new-app route
 *   LR-2 one hop: no destination is matched by any rule again (no chain, no loop); destinations end in no ".html"
 *   LR-3 no rule shadows a real new-app route (no legacy prefix is a route folder; the new routes / , /exams, /hi,
 *        /exams/ssc-cgl, /mock-tests, /learn/x, /dashboard … are NOT redirected)
 *   LR-4 unknown ".html" paths (old bookmarks) → /exams; mixed case and %20 paths match; the exact top-level pages go to
 *        their direct equivalents (about, contact, SSC CGL, the category hubs, /pricing for the closed legacy checkout)
 *   LR-5 next.config.ts spreads every rule as a permanent redirect
 *   LR-6 negative controls: each mutation is caught
 * Run: node scripts/test_legacy_redirects.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp');

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
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const ts = require('typescript');
const SRC = read('lib/seo/legacy-redirects.ts');
function load(src) {
  const filename = path.join(ROOT, 'lib/seo/legacy-redirects.ts');
  const m = new Module(filename, module);
  m.filename = filename;
  m._compile(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports.LEGACY_REDIRECTS;
}

const URLS = read('docs/ops/DOMAIN_CUTOVER_1_LEGACY_URLS.txt').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((u) => u.replace(/^https?:\/\/(www\.)?couragelibrary\.in/i, '') || '/');

// Next.js: redirect sources are compiled with path-to-regexp, sensitive: false, strict: true, delimiter "/"
const compile = (rules) => rules.map((r) => ({ ...r, re: pathToRegexp(r.source, [], { sensitive: false, strict: true, delimiter: '/' }) }));
const first = (crules, p) => crules.find((r) => r.re.test(p)) || null;

// does an app route exist for this path (any route group, dynamic segments allowed)?
const GROUPS = fs.readdirSync(path.join(ROOT, 'app'), { withFileTypes: true }).filter((d) => d.isDirectory() && /^\(.*\)$/.test(d.name)).map((d) => d.name);
function routeExists(href) {
  const p = href.split('#')[0].split('?')[0];
  if (p === '/') return true;
  const segs = p.replace(/^\//, '').split('/');
  const tryDir = (base) => {
    let cur = path.join(ROOT, 'app', base);
    for (const s of segs) {
      if (fs.existsSync(path.join(cur, s))) cur = path.join(cur, s);
      else {
        const dyn = fs.existsSync(cur) ? fs.readdirSync(cur).find((n) => /^\[[^.\]]+\]$/.test(n)) : null;
        if (!dyn) return false;
        cur = path.join(cur, dyn);
      }
    }
    return fs.existsSync(path.join(cur, 'page.tsx'));
  };
  return tryDir('') || GROUPS.some((d) => tryDir(d));
}

const NEW_ROUTES = ['/', '/hi', '/exams', '/exams/ssc', '/exams/ssc-cgl', '/exams/police', '/mock-tests', '/learn/abc', '/hi/learn/abc', '/dashboard', '/pricing', '/about', '/contact', '/help', '/current-affairs', '/auth/login', '/auth/signup', '/refund-policy', '/terms', '/privacy'];

function checkAll(rules, urls) {
  const cr = compile(rules);
  // LR-1 + LR-2
  const unmatched = [];
  const missing = new Set();
  const chains = [];
  for (const u of urls) {
    const r = first(cr, u);
    // no rule: fine only when the new app serves that exact path itself (the legacy home "/")
    if (!r) { if (!routeExists(u)) unmatched.push(u); continue; }
    if (!routeExists(r.destination)) missing.add(r.destination);
    if (first(cr, r.destination)) chains.push(`${u} → ${r.destination} → again`);
  }
  assert(unmatched.length === 0, `LR-1 ${unmatched.length} listed URL(s) match no rule (would 404): ${unmatched.slice(0, 5).join(', ')}`);
  assert(missing.size === 0, `LR-1 destination(s) without a route: ${[...missing].join(', ')}`);
  assert(chains.length === 0, `LR-2 chain / loop: ${chains.slice(0, 3).join(' | ')}`);
  // LR-2b (LIVE-GREEN-1 3a, owner): /category/<slug> is SEO-1's 308 to /exams/<slug> and /category-cache/<slug> is the
  // internal rewrite target — neither is ever a legacy destination (a second hop / an unindexed page); the one-hop
  // promise forbids both outright, independent of which rule list this check can see
  const viaCategory = rules.filter((r) => /^\/category(-cache)?(\/|$|\?|#)/i.test(r.destination));
  assert(viaCategory.length === 0, `LR-2b a legacy target is /category/* or /category-cache/* (a second hop / the internal route): ${viaCategory.map((r) => `${r.source} → ${r.destination}`).slice(0, 3).join(' | ')}`);
  for (const r of rules) {
    assert(!/\.html$/i.test(r.destination) && routeExists(r.destination) && !first(cr, r.destination), `LR-2 destination ${r.destination} is not a final, existing route`);
  }
  // LR-3
  const shadowed = NEW_ROUTES.filter((p) => first(cr, p));
  assert(shadowed.length === 0, `LR-3 a new-app route is redirected: ${shadowed.join(', ')}`);
  const appDirs = new Set([...fs.readdirSync(path.join(ROOT, 'app')), ...GROUPS.flatMap((g) => fs.readdirSync(path.join(ROOT, 'app', g)))].map((n) => n.toLowerCase()));
  const prefixes = [...new Set(rules.map((r) => r.source.split('/')[1]).filter((s) => s && !s.includes('.') && !s.startsWith(':')))];
  const clash = prefixes.filter((p) => appDirs.has(p.toLowerCase()));
  assert(clash.length === 0, `LR-3 a legacy prefix is also a route folder: ${clash.join(', ')}`);
  return { cr, n: urls.length };
}

function checkSpecifics(rules) {
  const cr = compile(rules);
  const to = (p) => (first(cr, p) || {}).destination;
  const want = {
    '/about.html': '/about', '/contact.html': '/contact', '/SSC-CGL.html': '/exams/ssc-cgl', '/Banking-Main.html': '/exams/banking',
    '/Railway-Main.html': '/exams/railway', '/Defence-Main.html': '/exams/defence', '/Delhi-Police.html': '/exams/police',
    '/enroll.html': '/pricing', '/free-trial.html': '/pricing', '/dashboard.html': '/dashboard',
    '/ssc-cgl/english-language/Descriptive/Essay-Writing.html': '/exams/ssc-cgl',
    '/delhi-police/Computer%20knowledge/Basics%20of%20Computers/computer-processing-cycle.html': '/exams/police',
    '/ssc-gd/elementary-mathematics/algebra/basic-identities.html': '/exams/ssc',
    '/Blog/Beginner-Strategy.html': '/exams', '/mock/ssc-cgl-mock-1.html': '/mock-tests',
    // case-insensitive + unknown .html (old bookmarks)
    '/ABOUT.HTML': '/about', '/SSC-CGL/Quant/x.HTML': '/exams/ssc-cgl', '/some-old-page.html': '/exams', '/a/b/c/old.html': '/exams',
  };
  const bad = Object.entries(want).filter(([p, d]) => to(p) !== d).map(([p, d]) => `${p} → ${to(p)} (want ${d})`);
  assert(bad.length === 0, `LR-4 ${bad.join(' | ')}`);
  return `${Object.keys(want).length} cases`;
}

function checkConfig(cfg) {
  assert(/import \{ LEGACY_REDIRECTS \} from "\.\/lib\/seo\/legacy-redirects";/.test(cfg), 'next.config does not import the map');
  assert(/\.\.\.LEGACY_REDIRECTS\.map\(\(r\) => \(\{ source: r\.source, destination: r\.destination, permanent: true \}\)\)/.test(cfg), 'next.config must spread every rule as permanent');
}

const RULES = load(SRC);
const CFG = read('next.config.ts');
test(`LR-1/2/3 every legacy URL → one hop to an existing route; no chain / loop; no new route shadowed`, () => `${checkAll(RULES, URLS).n} URLs, ${RULES.length} rules`);
test('LR-4 direct equivalents, hubs, mixed case, %20, unknown .html → /exams', () => checkSpecifics(RULES));
test('LR-5 next.config spreads every rule as a permanent redirect', () => checkConfig(CFG));
test('LR-6 negative controls: each mutation is caught', () => {
  const mut = (a, b) => { assert(SRC.includes(a), `anchor missing: ${a}`); return load(SRC.replace(a, b)); };
  const cases = [
    // without the section rule the pages fall to the ".html" fallback (/exams): no 404, but not the closest hub
    ['a section rule removed → wrong hub', () => checkSpecifics(mut('  { source: "/delhi-police/:path*", destination: "/exams/police" },\n', ''))],
    ['section rule + fallback removed → 404s', () => checkAll(load(SRC.replace('  { source: "/delhi-police/:path*", destination: "/exams/police" },\n', '').replace('const FALLBACK: LegacyRedirect[] = [{ source: "/:path(.*\\\\.html)", destination: "/exams" }];', 'const FALLBACK: LegacyRedirect[] = [];')), URLS)],
    ['a destination without a route', () => checkAll(mut('{ source: "/about.html", destination: "/about" }', '{ source: "/about.html", destination: "/about-us" }'), URLS)],
    ['a chain (destination redirected again)', () => checkAll(mut('{ source: "/enroll.html", destination: "/pricing" }', '{ source: "/enroll.html", destination: "/free-trial.html" }'), URLS)],
    ['a target on the internal /category-cache route', () => checkAll([...RULES.slice(0, 1), { source: '/old-cat2.html', destination: '/category-cache/ssc' }, ...RULES.slice(1)], URLS)],
    ['a target under /category (second hop via the SEO-1 308)', () => checkAll(mut('{ source: "/Delhi-Police.html", destination: "/exams/police" }', '{ source: "/Delhi-Police.html", destination: "/category/police" }'), URLS)],
    ['a target /category with a query', () => checkAll([...RULES, { source: '/old-cat.html', destination: '/category/ssc?x=1' }], [...URLS, '/old-cat.html'])],
    ['a loop', () => checkAll([...RULES, { source: '/exams', destination: '/exams/ssc-cgl' }, { source: '/exams/ssc-cgl', destination: '/exams' }], URLS)],
    ['a new route shadowed', () => checkAll([{ source: '/mock-tests', destination: '/exams' }, ...RULES], URLS)],
    ['a legacy prefix that is a route folder', () => checkAll([...RULES, { source: '/pricing/:path*', destination: '/exams' }], URLS)],
    ['no .html fallback', () => checkSpecifics(mut('const FALLBACK: LegacyRedirect[] = [{ source: "/:path(.*\\\\.html)", destination: "/exams" }];', 'const FALLBACK: LegacyRedirect[] = [];'))],
    ['wrong equivalent', () => checkSpecifics(mut('{ source: "/SSC-CGL.html", destination: "/exams/ssc-cgl" }', '{ source: "/SSC-CGL.html", destination: "/exams" }'))],
    ['an unlisted URL', () => checkAll(RULES, [...URLS, '/unknown-section/page'])],
    ['not permanent', () => checkConfig(CFG.replace('destination: r.destination, permanent: true', 'destination: r.destination, permanent: false'))],
  ];
  const missed = [];
  for (const [name, fn] of cases) {
    try { fn(); missed.push(name); } catch (e) { if (/anchor missing/.test(String(e.message))) missed.push(`${name}: ${e.message}`); }
  }
  assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
  return `${cases.length} mutations caught`;
});
console.log(results.join('\n'));
console.log(`\nLEGACY-REDIRECTS: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
