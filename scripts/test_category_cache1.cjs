#!/usr/bin/env node
/**
 * CATEGORY-CACHE-1 (LIVE-GREEN-1 3a, owner 2026-11-24) — offline gate for the internal cached category route.
 *
 * Root cause it guards: the internal rewrite target of /exams/<category> was /category/<slug>, which SEO-1 308s to
 * /exams/<slug>; under `next start` the rewritten request is routed again, so /exams/<category> looped (CI SMOKE-* and
 * UX2A L-17 since 45093554555). The target is now /category-cache/<slug> (lib/exams/category-cache-route.ts).
 *   K-1 one route definition: the middleware rewrites to categoryCachePath(slug); the cache refresh revalidates
 *       PUBLIC_CATEGORY_ROUTE = CATEGORY_CACHE_ROUTE; both resolve to the same app route, which exists; the old
 *       app/(public)/category folder is gone; no other code names the internal path → category pages never go stale
 *   K-2 no redirect source (next.config literal rules, ADMIN_REDIRECTS, LEGACY_REDIRECTS, the middleware) matches the
 *       rewrite target; /category/<slug> keeps SEO-1's single next.config 308 (Next keeps the query string)
 *   K-3 a DIRECT request for /category-cache/* gets X-Robots-Tag noindex from the middleware, only without the rewrite
 *       marker; the rewrite sets the marker; no next.config header rule names the internal path (it would leak onto
 *       /exams/<slug> under `next start` — measured locally 2026-11-24)
 *   K-4 never linked, never in the sitemap, not blocked in robots.txt (crawlers must see the noindex)
 *   K-5 negative controls: each broken variant is caught
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
function test(name, fn) {
  try { const info = fn(); passed++; results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; results.push(`  FAIL  ${name}\n        ${String(e && e.message).slice(0, 700)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function loadTs(rel, src = read(rel)) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m._compile(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return m.exports;
}

const P = {
  route: 'lib/exams/category-cache-route.ts',
  mw: 'middleware.ts',
  helper: 'lib/cache/revalidate-public.ts',
  cfg: 'next.config.ts',
  page: 'app/(public)/category-cache/[slug]/page.tsx',
  robots: 'app/robots.ts',
};
const SRC = Object.fromEntries(Object.entries(P).map(([k, f]) => [k, read(f)]));

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name).replace(/\\/g, '/')] : []));
}
const CODE = ['app', 'components', 'lib'].flatMap(walk).concat(['middleware.ts']);

// ---------------------------------------------------------------- K-1
function checkOneRoute(src = SRC, files = null) {
  const R = loadTs(P.route, src.route);
  assert(R.CATEGORY_CACHE_ROUTE === '/category-cache/[slug]' && R.categoryCachePath('ssc') === R.CATEGORY_CACHE_ROUTE.replace('[slug]', 'ssc'), `route ${R.CATEGORY_CACHE_ROUTE} vs path ${R.categoryCachePath('ssc')}`);
  assert(R.categoryCacheSlugOf('/category-cache/ssc') === 'ssc' && R.categoryCacheSlugOf('/category/ssc') === null && R.categoryCacheSlugOf('/category-cache/a/b') === null, 'categoryCacheSlugOf');
  const routeDir = R.CATEGORY_CACHE_ROUTE.replace(/^\//, '');
  assert(fs.existsSync(path.join(ROOT, 'app', '(public)', ...routeDir.split('/'), 'page.tsx')), `no app route at app/(public)${R.CATEGORY_CACHE_ROUTE}/page.tsx`);
  assert(!fs.existsSync(path.join(ROOT, 'app', '(public)', 'category')), 'the old app/(public)/category folder is back');
  const mw = strip(src.mw);
  assert(/import \{ CATEGORY_REWRITE_MARKER, categoryCachePath, categoryCacheSlugOf \} from "@\/lib\/exams\/category-cache-route";/.test(src.mw), 'middleware does not import the route module');
  assert(/target\.pathname = categoryCachePath\(slug\);/.test(mw) && !/target\.pathname = `\/category/.test(mw), 'the middleware rewrite target is not categoryCachePath(slug)');
  const helper = strip(src.helper);
  assert(/import \{ CATEGORY_CACHE_ROUTE \} from "@\/lib\/exams\/category-cache-route";/.test(src.helper) && /export const PUBLIC_CATEGORY_ROUTE = CATEGORY_CACHE_ROUTE;/.test(helper) && /revalidatePath\(PUBLIC_CATEGORY_ROUTE, "page"\);/.test(helper), 'the cache refresh does not revalidate CATEGORY_CACHE_ROUTE');
  // no other code names the internal path or refreshes a category path by hand
  const bad = [];
  for (const f of files ? Object.keys(files) : CODE) {
    if (f === P.route) continue;
    const s = strip(files ? files[f] : read(f));
    if (/["'`]\/category-cache\b/.test(s)) bad.push(`${f}: names "/category-cache"`);
    for (const m of s.matchAll(/revalidate(?:Path|Tag)\(([^)]*)\)/g)) if (/category/i.test(m[1]) && !/PUBLIC_CATEGORY_ROUTE|["']categories["']/.test(m[1])) bad.push(`${f}: ${m[0]}`);
  }
  assert(bad.length === 0, `the internal path is named / refreshed outside the route module: ${bad.slice(0, 3).join(' | ')}`);
  return `${R.CATEGORY_CACHE_ROUTE}: rewrite = refresh = app route; ${CODE.length} files scanned`;
}

// ---------------------------------------------------------------- K-2
function redirectSources(cfg, legacySrc = read('lib/seo/legacy-redirects.ts'), adminSrc = read('lib/admin/nav-redirects.ts')) {
  const literal = [...strip(cfg).matchAll(/\{ source: "([^"]+)", destination: [^}]*permanent: (?:true|false) \}/g)].map((m) => m[1]);
  const legacy = loadTs('lib/seo/legacy-redirects.ts', legacySrc).LEGACY_REDIRECTS.map((r) => r.source);
  const admin = loadTs('lib/admin/nav-redirects.ts', adminSrc).ADMIN_REDIRECTS.map((r) => r.from);
  return { literal, legacy, admin };
}
function checkNoRedirect(cfg = SRC.cfg, mw = SRC.mw, legacySrc, adminSrc) {
  const { literal, legacy, admin } = redirectSources(cfg, legacySrc, adminSrc);
  const all = [...literal, ...legacy, ...admin];
  const samples = ['/category-cache/ssc', '/category-cache/banking', '/category-cache/x-y-1'];
  const hits = [];
  for (const s of all) {
    const re = pathToRegexp(s, [], { sensitive: false, strict: true, delimiter: '/' });
    for (const p of samples) if (re.test(p)) hits.push(`${s} matches ${p}`);
  }
  assert(hits.length === 0, `a redirect source matches the rewrite target: ${hits.slice(0, 3).join(' | ')}`);
  const m = strip(mw);
  assert(!/NextResponse\.redirect\(/.test(m), 'middleware.ts issues its own redirect (it would hit the rewrite target under next start)');
  assert(literal.includes('/category/:slug') && /\{ source: "\/category\/:slug", destination: "\/exams\/:slug", permanent: true \}/.test(cfg), "SEO-1's /category/<slug> 308 is not in next.config");
  return `${all.length} redirect sources (${literal.length} literal, ${admin.length} admin, ${legacy.length} legacy) + middleware: none matches /category-cache/*`;
}

// ---------------------------------------------------------------- K-3
function checkNoindex(mw = SRC.mw, cfg = SRC.cfg) {
  const m = strip(mw);
  assert(/if \(categoryCacheSlugOf\(request\.nextUrl\.pathname\) && request\.headers\.get\(CATEGORY_REWRITE_MARKER\) !== "1"\) \{\n\s+response\.headers\.set\("X-Robots-Tag", "noindex"\);\n\s+return response;\n\s+\}/.test(m), 'a direct /category-cache request does not get X-Robots-Tag noindex (only without the marker)');
  assert(/const forwarded = new Headers\(request\.headers\);\n\s+forwarded\.set\(CATEGORY_REWRITE_MARKER, "1"\);\n\s+const rewritten = NextResponse\.rewrite\(target, \{ request: \{ headers: forwarded \} \}\);/.test(m), 'the rewrite does not carry the marker (the second routing pass would be noindexed → /exams/<slug> noindexed)');
  assert(m.indexOf('categoryCacheSlugOf(request.nextUrl.pathname)') < m.indexOf('const slug = request.method'), 'the noindex step must come before the rewrite step');
  const headerBlock = strip(cfg).split('headers: async () => [')[1] || '';
  assert(!/category-cache|source: "\/category/.test(headerBlock), 'a next.config header rule names the internal path (it leaks onto /exams/<slug> under next start)');
  return 'direct request → noindex (no marker); rewrite carries the marker; no header rule';
}

// ---------------------------------------------------------------- K-4
function checkNotExposed(robots = SRC.robots, files = null) {
  const r = strip(robots);
  assert(!/category/.test(r), 'robots.txt mentions category paths (a disallow would hide the noindex from crawlers)');
  const sitemapFiles = (files ? Object.keys(files) : CODE).filter((f) => /sitemap/i.test(f));
  assert(sitemapFiles.length >= 1, 'no sitemap source found (vacuous)');
  const linky = [];
  for (const f of files ? Object.keys(files) : CODE) {
    if (f === P.route) continue;
    const s = strip(files ? files[f] : read(f));
    if (/href=\{?["'`]\/category-cache|categoryCachePath\(/.test(s) && f !== 'middleware.ts') linky.push(f);
  }
  assert(linky.length === 0, `the internal path is linked / built outside the middleware: ${linky.join(', ')}`);
  return `robots.txt silent on it; ${sitemapFiles.length} sitemap source(s) + every component never link it`;
}

test('K-1 one route definition: rewrite target = cache refresh = app route; nothing else names it', () => checkOneRoute());
test('K-2 no redirect source (config, admin, legacy, middleware) matches the rewrite target; SEO-1 /category 308 kept', () => checkNoRedirect());
test('K-3 direct /category-cache request → X-Robots-Tag noindex (middleware, without the marker only); no header rule', () => checkNoindex());
test('K-4 never linked, never in the sitemap, not blocked in robots.txt', () => checkNotExposed());

test('K-5 negative controls: each broken variant is caught', () => {
  const mut = (s, a, b) => { assert(s.includes(a), `anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b); };
  const filesWith = (extra) => { const o = {}; for (const f of CODE) o[f] = read(f); return { ...o, ...extra }; };
  const cases = [
    ['rewrite back to /category/<slug>', () => checkOneRoute({ ...SRC, mw: mut(SRC.mw, 'target.pathname = categoryCachePath(slug);', 'target.pathname = `/category/${slug}`;') })],
    ['refresh a literal old route', () => checkOneRoute({ ...SRC, helper: mut(SRC.helper, 'export const PUBLIC_CATEGORY_ROUTE = CATEGORY_CACHE_ROUTE;', 'export const PUBLIC_CATEGORY_ROUTE = "/category/[slug]";') })],
    ['route constant moved without the folder', () => checkOneRoute({ ...SRC, route: mut(SRC.route, 'export const CATEGORY_CACHE_PREFIX = "/category-cache";', 'export const CATEGORY_CACHE_PREFIX = "/cat-cache";') })],
    ['a hand-written refresh of a category path', () => checkOneRoute(SRC, filesWith({ 'lib/x.ts': 'revalidatePath("/category-cache/[slug]", "page");' }))],
    ['a config redirect on the internal path', () => checkNoRedirect(mut(SRC.cfg, '  redirects: async () => [\n', '  redirects: async () => [\n    { source: "/category-cache/:slug", destination: "/exams/:slug", permanent: true },\n'))],
    ['a legacy section rule that swallows it', () => checkNoRedirect(SRC.cfg, SRC.mw, read('lib/seo/legacy-redirects.ts').replace('export const LEGACY_REDIRECTS', 'const EXTRA = [{ source: "/category-cache/:path*", destination: "/exams" }];\nexport const LEGACY_REDIRECTS').replace(/export const LEGACY_REDIRECTS([^=]*)= \[/, 'export const LEGACY_REDIRECTS$1= [...EXTRA, '))],
    ['a middleware redirect', () => checkNoRedirect(SRC.cfg, mut(SRC.mw, '  // the session is refreshed', '  if (request.nextUrl.pathname.startsWith("/category")) return NextResponse.redirect(new URL("/exams", request.url), 308);\n  // the session is refreshed'))],
    ['SEO-1 /category 308 removed', () => checkNoRedirect(mut(SRC.cfg, '    { source: "/category/:slug", destination: "/exams/:slug", permanent: true },\n', ''))],
    ['noindex without the marker check (would noindex /exams/<slug>)', () => checkNoindex(mut(SRC.mw, ' && request.headers.get(CATEGORY_REWRITE_MARKER) !== "1"', ''))],
    ['rewrite without the marker', () => checkNoindex(mut(SRC.mw, '    forwarded.set(CATEGORY_REWRITE_MARKER, "1");\n', ''))],
    ['no noindex at all', () => checkNoindex(mut(SRC.mw, '    response.headers.set("X-Robots-Tag", "noindex");\n', ''))],
    ['noindex as a next.config header rule', () => checkNoindex(SRC.mw, mut(SRC.cfg, '  headers: async () => [\n', '  headers: async () => [\n    { source: "/category-cache/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },\n'))],
    ['robots.txt blocks it', () => checkNotExposed(mut(SRC.robots, 'disallow: ["/api/", "/admin/", "/dashboard/"]', 'disallow: ["/api/", "/admin/", "/dashboard/", "/category-cache/"]'))],
    ['a link to it', () => checkNotExposed(SRC.robots, filesWith({ 'components/x.tsx': '<Link href="/category-cache/ssc">SSC</Link>' }))],
    ['the sitemap lists it', () => checkNotExposed(SRC.robots, filesWith({ 'lib/seo/x-sitemap.ts': 'entries.push({ url: `${base}${categoryCachePath(slug)}` });' }))],
  ];
  const missed = [];
  for (const [name, fn] of cases) {
    try { fn(); missed.push(name); } catch (e) { if (/anchor missing/.test(String(e.message))) missed.push(`${name}: ${e.message}`); }
  }
  assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
  return `${cases.length}/${cases.length} broken variants caught`;
});

console.log('CATEGORY-CACHE-1 (LIVE-GREEN-1 3a)');
for (const r of results) console.log(r);
console.log(`\nCATEGORY-CACHE-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
