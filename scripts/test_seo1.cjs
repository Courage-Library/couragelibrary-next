#!/usr/bin/env node
/**
 * SEO-1 gate (2026-11-22) — technical SEO for couragelibrary.in. Offline (no network, no DB).
 *   S1-1 every app route is classified: either PUBLIC (allow-listed here, decides its own robots) or matched by the
 *        X-Robots-Tag noindex list (lib/seo/private-routes.ts) that next.config applies — a new private page that nobody
 *        classified fails; no public route matches the noindex list
 *   S1-2 metadata: no canonical / og:url unless the page names its own URL (the root layout names none); the title keeps
 *        the brand only while it fits 60; descriptions clamp to 160 at a word boundary; og:locale; icons = logo suite
 *   S1-3 icons + manifest: every icon file exists with its stated size; maskable icons; /favicon.ico and
 *        /apple-touch-icon.png are rewrites to existing files (200, no redirect); the Organization logo is square ≥ 112
 *   S1-4 structured data: BreadcrumbList has `item` on every crumb but the last (unlinked middle crumbs dropped,
 *        positions 1..n); Organization keeps its documented keys with the suite logo; WebSite on "/" and "/hi" (no
 *        SearchAction); the FAQPage JSON-LD equals the visible FAQ items (same source, EN + HI)
 *   S1-5 sitemap: category hubs only with an active exam; no static sitemap URL is private, redirected or a legacy
 *        source; /category/<slug> is one 308 to /exams/<slug>
 *   S1-6 negative controls: each broken variant is caught
 * Run: node scripts/test_seo1.cjs
 */
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
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

/** Load a TS module from (possibly mutated) source; `@/` and relative imports resolve to repo files; `stubs` win. */
function loadTs(rel, src, stubs = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(src ?? read(rel), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    let t = null;
    if (id.startsWith('@/')) t = id.slice(2);
    else if (id.startsWith('./') || id.startsWith('../')) t = path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
    if (t !== null) {
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, undefined, stubs);
    }
    return require(id);
  };
  m._compile(js, file);
  return m.exports;
}
const STUBS = { 'server-only': {} };

// Next.js compiles header / redirect sources with path-to-regexp: case-insensitive, strict, "/" delimiter
const matcher = (sources) => sources.map((s) => ({ s, re: pathToRegexp(s, [], { sensitive: false, strict: true, delimiter: '/' }) }));
const matches = (compiled, p) => compiled.filter((c) => c.re.test(p)).map((c) => c.s);

// ---------------------------------------------------------------- S1-1 route classification
/** Public routes: indexable or deciding their own robots per page (e.g. noindex while empty). Everything else is private. */
const PUBLIC_ROUTES = new Set([
  '/', '/hi', '/about', '/contact', '/help', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/pricing', '/cnts',
  '/exams', '/exams/[slug]', '/exams/[slug]/[moduleSlug]', '/exams/[slug]/[moduleSlug]/[...rest]', '/exams/[slug]/course',
  '/exams/[slug]/course/[subject]', '/exams/[slug]/cycle/[cycleYear]', '/exams/[slug]/cycle/[cycleYear]/[moduleSlug]',
  '/learn/[...path]', '/hi/learn/[...path]', '/learn/topics/[topicId]',
  '/current-affairs', '/current-affairs/[slug]', '/current-affairs/date/[date]', '/current-affairs/month/[month]',
  '/mock-tests', '/practice', '/articles', '/articles/[slug]', '/courses', '/courses/[slug]', '/institutes', '/institutes/[slug]',
  '/live-tests', '/live-tests/[slug]',
  '/category/[slug]', // internal target of the /exams/<category> rewrite; the public /category/<slug> URL 308s to /exams/<slug>
]);
function appRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (e.name === 'page.tsx') out.push(dir.replace(/^app/, '').replace(/\/\([^)]*\)/g, '') || '/');
    }
  };
  walk('app');
  return [...new Set(out)].sort();
}
const sample = (route) => route.replace(/\[\.\.\.[^\]]+\]/g, 'a/b').replace(/\[[^\]]+\]/g, 'x1');

function classify(sources, publicRoutes = PUBLIC_ROUTES) {
  const why = [];
  const c = matcher(sources);
  const routes = appRoutes();
  for (const r of routes) {
    const hit = matches(c, sample(r));
    if (publicRoutes.has(r) && hit.length) why.push(`public route ${r} matches the noindex list (${hit.join(', ')})`);
    if (!publicRoutes.has(r) && !hit.length) why.push(`route ${r} is neither public nor in the noindex list`);
  }
  return { why, routes: routes.length };
}
function nextConfigWiring(cfg) {
  const why = [];
  if (!/import \{ PRIVATE_NOINDEX_SOURCES, PRIVATE_NOINDEX_VALUE \} from "\.\/lib\/seo\/private-routes";/.test(cfg)) why.push('next.config: the noindex list is not imported');
  if (!cfg.includes('...PRIVATE_NOINDEX_SOURCES.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: PRIVATE_NOINDEX_VALUE }] })),')) why.push('next.config: the noindex headers are not applied');
  if (!/PRIVATE_NOINDEX_VALUE = "noindex"/.test(read('lib/seo/private-routes.ts'))) why.push('the header value is not "noindex"');
  if (!cfg.includes('{ source: "/category/:slug", destination: "/exams/:slug", permanent: true },')) why.push('next.config: /category/<slug> is not a 308 to /exams/<slug>');
  if (!cfg.includes('{ source: "/favicon.ico", destination: `${BRAND_SUITE}/favicon/favicon.ico` },') || !cfg.includes('{ source: "/apple-touch-icon.png", destination: `${BRAND_SUITE}/app/apple-touch-icon-180.png` },')) why.push('next.config: /favicon.ico + /apple-touch-icon.png not served from the logo suite');
  return why;
}

// ---------------------------------------------------------------- S1-2 metadata
function checkMetadata(M, layoutSrc) {
  const why = [];
  const root = M.constructMetadata();
  if (root.alternates || (root.openGraph && root.openGraph.url)) why.push(`a canonical / og:url without a page URL: ${JSON.stringify(root.alternates)} ${root.openGraph && root.openGraph.url}`);
  const page = M.constructMetadata({ title: 'Terms', canonicalUrl: '/terms', description: 'x'.repeat(90) });
  if (!page.alternates || page.alternates.canonical !== 'https://couragelibrary.in/terms' || page.openGraph.url !== 'https://couragelibrary.in/terms') why.push(`self canonical: ${JSON.stringify(page.alternates)}`);
  if (page.title !== 'Terms | Courage Library') why.push(`short title keeps the brand: ${page.title}`);
  const long = 'Eligibility Criteria (Age, Education & Category) — SSC CGL';
  const lt = M.constructMetadata({ title: long, canonicalUrl: '/x' }).title;
  if (lt !== long) why.push(`a title over 60 with the brand must drop it: ${lt}`);
  if (M.seoTitle('Antonyms') !== 'Antonyms | Courage Library') why.push('seoTitle short');
  const srcText = 'Practise reading comprehension with timed passages, vocabulary in context, inference questions and elimination techniques that examiners reward in every tier of the exam.';
  const d = M.seoDescription(srcText);
  const kept = d.slice(0, -1);
  if (d.length > 160 || !d.endsWith('…') || !srcText.startsWith(kept) || !/\s/.test(srcText[kept.length] || '')) why.push(`description clamp (≤ 160, ends at a word): ${d.length} "${d.slice(-24)}"`);
  if (M.seoDescription('Short and fine.') !== 'Short and fine.') why.push('a short description changed');
  const def = M.constructMetadata({ canonicalUrl: '/x' });
  if (def.description.length > 160) why.push(`default description over 160 (${def.description.length})`);
  if (page.twitter.description !== page.description || page.openGraph.description !== page.description) why.push('og / twitter description differ from the meta description');
  if (page.openGraph.locale !== 'en_IN') why.push('og:locale');
  const icons = page.icons || {};
  if (!Array.isArray(icons.icon) || !icons.icon.every((i) => i.url.startsWith('/brand/courage-library-logo-suite/')) || !String(icons.apple && icons.apple.url).startsWith('/brand/courage-library-logo-suite/')) why.push('icons not from the logo suite');
  if (!/export const metadata: Metadata = constructMetadata\(\);/.test(layoutSrc)) why.push('the root layout must call constructMetadata() without a page URL');
  return why;
}

// ---------------------------------------------------------------- S1-3 icons
async function checkIcons(I, manifestSrc) {
  const sharp = require('sharp');
  const why = [];
  const pub = (u) => path.join(ROOT, 'public', u);
  const files = [...I.SITE_ICONS.icon.map((i) => [i.url, i.sizes]), [I.SITE_ICONS.apple.url, I.SITE_ICONS.apple.sizes], [I.SITE_ICONS.shortcut, null], ...I.MANIFEST_ICONS.map((i) => [i.src, i.sizes]), [I.ORGANIZATION_LOGO_PATH, null]];
  for (const [u, sizes] of files) {
    if (!fs.existsSync(pub(u))) { why.push(`missing file public${u}`); continue; }
    if (sizes && /^\d+x\d+$/.test(sizes) && /\.png$/.test(u)) {
      const m = await sharp(pub(u)).metadata();
      if (`${m.width}x${m.height}` !== sizes) why.push(`${u} is ${m.width}x${m.height}, says ${sizes}`);
    }
  }
  const logo = await sharp(pub(I.ORGANIZATION_LOGO_PATH)).metadata().catch(() => null);
  if (!logo || logo.width !== logo.height || logo.width < 112) why.push('Organization logo not square ≥ 112');
  if (!I.MANIFEST_ICONS.some((i) => i.purpose === 'maskable' && i.sizes === '512x512') || !I.MANIFEST_ICONS.some((i) => i.purpose === 'any' && i.sizes === '512x512')) why.push('manifest needs any + maskable 512');
  if (!/icons: MANIFEST_ICONS\.map\(\(i\) => \(\{ \.\.\.i \}\)\),/.test(manifestSrc) || !/theme_color: BRAND_THEME_COLOR/.test(manifestSrc)) why.push('manifest not wired to MANIFEST_ICONS / brand colour');
  if (!fs.existsSync(pub('/brand/courage-library-logo-suite/favicon/favicon.ico')) || !fs.existsSync(pub('/brand/courage-library-logo-suite/app/apple-touch-icon-180.png'))) why.push('root icon rewrite targets missing');
  return why;
}

// ---------------------------------------------------------------- S1-4 structured data
function checkJsonLd(J, O, landingSrcs) {
  const why = [];
  const items = J.breadcrumbListItems([{ label: 'Home', href: '/' }, { label: 'English Comprehension' }, { label: 'Antonyms', href: '/learn/english-comprehension/antonyms' }]);
  if (items.length !== 2 || items[1].name !== 'Antonyms' || items.map((i) => i.position).join() !== '1,2') why.push(`unlinked middle crumb kept or positions wrong: ${JSON.stringify(items)}`);
  if (!items.every((i) => /^https:\/\/couragelibrary\.in\//.test(i.item))) why.push('crumb items not absolute on the apex');
  const last = J.breadcrumbListItems([{ label: 'Home', href: '/' }, { label: 'Current page' }]);
  if (last.length !== 2 || 'item' in last[1]) why.push('the last crumb (no URL) must stay');
  const bc = J.generateBreadcrumbSchema([{ label: 'Home', href: '/' }, { label: 'Mid' }, { label: 'Here', href: '/here' }]);
  if (bc.itemListElement.some((i, n, a) => n < a.length - 1 && !i.item)) why.push('generateBreadcrumbSchema: a middle crumb without item');
  const org = O.landingOrganizationJsonLd();
  if (JSON.stringify(Object.keys(org).sort()) !== JSON.stringify(['@context', '@type', 'address', 'email', 'logo', 'name', 'url'])) why.push(`Organization keys ${Object.keys(org)}`);
  if (org.logo !== 'https://couragelibrary.in/brand/courage-library-logo-suite/png/mark-512.png') why.push(`Organization logo ${org.logo}`);
  if (/sameAs/.test(JSON.stringify(org))) why.push('sameAs without verified profiles');
  if (J.generateOrganizationSchema().logo !== org.logo) why.push('the generic Organization logo differs');
  for (const lang of ['en', 'hi']) {
    const w = O.landingWebSiteJsonLd(lang);
    if (w['@type'] !== 'WebSite' || w.url !== 'https://couragelibrary.in/' || w.inLanguage !== lang || w.name !== 'Courage Library' || /SearchAction|potentialAction/.test(JSON.stringify(w))) why.push(`WebSite ${lang}: ${JSON.stringify(w)}`);
  }
  for (const [rel, lang] of [['app/(landing)/page.tsx', 'en'], ['app/(landing)/hi/page.tsx', 'hi']]) {
    const s = landingSrcs[rel];
    if (!s.includes(`<JsonLd data={landingWebSiteJsonLd("${lang}")} />`) || !s.includes('<JsonLd data={landingFaqJsonLd(t)} />')) why.push(`${rel}: WebSite / FAQ JSON-LD not rendered`);
  }
  return why;
}
function checkFaq(D, EN, HI, R, pageSrc) {
  const why = [];
  for (const [label, copy] of [['en', EN.LANDING_EN], ['hi', HI.LANDING_HI]]) {
    for (const facts of [{ liveExamNames: ['SSC CGL'], hindiLive: true, signupOpen: true }, { liveExamNames: [], hindiLive: false, signupOpen: false }]) {
      const { t } = R.resolveLandingCopy(copy, facts);
      const ld = D.landingFaqJsonLd(t);
      const visible = t.faq.items.map((f) => [f.q, f.a]);
      const marked = ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]);
      if (JSON.stringify(visible) !== JSON.stringify(marked)) why.push(`${label}: the FAQ JSON-LD differs from the visible FAQ (${marked.length} vs ${visible.length})`);
      if (ld.inLanguage !== t.lang) why.push(`${label}: FAQ inLanguage`);
    }
  }
  if (!/\{t\.faq\.items\.map\(\(f, i\) => \(/.test(pageSrc)) why.push('the visible FAQ is not rendered from t.faq.items');
  return why;
}

// ---------------------------------------------------------------- S1-5 sitemap
function checkCategories(C) {
  const why = [];
  const cats = [
    { id: 'c1', slug: 'ssc', is_active: true, is_internal: false, updated_at: '2026-11-01T00:00:00Z' },
    { id: 'c2', slug: 'railway', is_active: true, is_internal: false, updated_at: '2026-11-01T00:00:00Z' },
    { id: 'c3', slug: 'hidden', is_active: false, is_internal: false, updated_at: null },
    { id: 'c4', slug: 'staff', is_active: true, is_internal: true, updated_at: null },
    { id: 'c5', slug: 'Bad Slug', is_active: true, is_internal: false, updated_at: null },
  ];
  const exams = [{ category_id: 'c1', updated_at: '2026-11-20T00:00:00Z' }, { category_id: 'c3', updated_at: null }, { category_id: 'c4', updated_at: null }, { category_id: 'c5', updated_at: null }];
  const out = C.categoryHubEntries('https://couragelibrary.in', cats, exams);
  const urls = out.map((e) => e.url);
  if (urls.join() !== 'https://couragelibrary.in/exams/ssc') why.push(`category hubs: ${urls.join(', ')}`);
  if (!out[0] || new Date(out[0].lastModified).toISOString() !== '2026-11-20T00:00:00.000Z') why.push('category lastmod = newest of the category and its exams');
  return why;
}
function checkSitemapStatic(sm, cfg, privateSources) {
  const why = [];
  const statics = [...sm.matchAll(/url: `\$\{baseUrl\}([^`$]*)`/g)].map((m) => m[1] || '/');
  for (const m of sm.matchAll(/\.\.\.\[([^\]]+)\]\.map\(\(p\) => \(\{\s*url: `\$\{baseUrl\}\$\{p\}`/g)) statics.push(...[...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  if (statics.length < 10) why.push(`static sitemap URLs not found (${statics.length})`);
  const priv = matcher(privateSources);
  const redirectSources = [...cfg.matchAll(/\{ source: "([^"]+)", destination: "[^"]*", permanent: true \}/g)].map((m) => m[1]);
  const legacy = loadTs('lib/seo/legacy-redirects.ts').LEGACY_REDIRECTS.map((r) => r.source);
  const red = matcher([...redirectSources, ...legacy]);
  for (const p of statics) {
    if (matches(priv, p).length) why.push(`sitemap lists a noindex URL: ${p}`);
    if (matches(red, p).length) why.push(`sitemap lists a redirected URL: ${p}`);
  }
  if (!/dynamicEntries\.push\(\.\.\.categoryHubEntries\(baseUrl, categoriesRes\.data, examsRes\.data\)\);/.test(sm) || !/if \(categoriesRes\.error\) logSitemapReadFailure\("exam_categories", categoriesRes\.error\);/.test(sm)) why.push('sitemap: category hubs not wired (or their read error not logged)');
  return { why, statics: statics.length };
}

(async () => {
  const PR = loadTs('lib/seo/private-routes.ts');
  const CFG = read('next.config.ts');
  const META_SRC = read('lib/seo/metadata.ts');
  const LAYOUT = read('app/layout.tsx');
  const M = loadTs('lib/seo/metadata.ts', META_SRC, STUBS);
  const I = loadTs('lib/seo/brand-icons.ts');
  const MANIFEST = read('app/manifest.ts');
  const J = loadTs('lib/seo/jsonld.ts', undefined, STUBS);
  const O_SRC = read('lib/landing/organization-jsonld.ts');
  const O = loadTs('lib/landing/organization-jsonld.ts', O_SRC, STUBS);
  const LANDING = { 'app/(landing)/page.tsx': read('app/(landing)/page.tsx'), 'app/(landing)/hi/page.tsx': read('app/(landing)/hi/page.tsx') };
  const D_REL = 'lib/landing/landing-page-data.ts';
  const D_SRC = read(D_REL);
  const DATA_STUBS = { ...STUBS, 'next/cache': { unstable_cache: (f) => f }, '@/lib/supabase/server': { createPublicServerSupabaseClient: () => ({}) } };
  const loadData = (src) => loadTs(D_REL, src, DATA_STUBS);
  const D = loadData(D_SRC);
  const EN = loadTs('content/landing-page/en.ts');
  const HI = loadTs('content/landing-page/hi.ts');
  const R = loadTs('lib/landing/landing-copy.ts');
  const PAGE_SRC = read('components/landing-v1/landing-page.tsx');
  const C_SRC = read('lib/seo/category-sitemap.ts');
  const C = loadTs('lib/seo/category-sitemap.ts', C_SRC);
  const SM = read('app/sitemap.ts');

  await test('S1-1 every app route is public (allow-listed) or noindex by header; no public route is noindexed; next.config wiring', () => {
    const { why, routes } = classify(PR.PRIVATE_NOINDEX_SOURCES);
    why.push(...nextConfigWiring(CFG));
    assert(why.length === 0, why.join('; '));
    return `${routes} routes classified (${PUBLIC_ROUTES.size} public), ${PR.PRIVATE_NOINDEX_SOURCES.length} noindex patterns`;
  });
  await test('S1-2 metadata: no inherited canonical; self canonical only when named; title / description lengths; og:locale; suite icons', () => {
    const why = checkMetadata(M, LAYOUT);
    assert(why.length === 0, why.join('; '));
  });
  await test('S1-3 icons + manifest from the logo suite: files exist with their sizes, any + maskable, square Organization logo', async () => {
    const why = await checkIcons(I, MANIFEST);
    assert(why.length === 0, why.join('; '));
  });
  await test('S1-4 structured data: breadcrumbs valid, Organization (suite logo, no sameAs), WebSite (no SearchAction), FAQ = visible FAQ', () => {
    const why = [...checkJsonLd(J, O, LANDING), ...checkFaq(D, EN, HI, R, PAGE_SRC)];
    assert(why.length === 0, why.join('; '));
  });
  await test('S1-5 sitemap: category hubs only with an active exam; no static URL private / redirected / legacy', () => {
    const s = checkSitemapStatic(SM, CFG, PR.PRIVATE_NOINDEX_SOURCES);
    const why = [...checkCategories(C), ...s.why];
    assert(why.length === 0, why.join('; '));
    return `${s.statics} static sitemap URLs checked`;
  });

  await test('S1-6 negative controls: each broken variant is caught', async () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const muts = [
      // S1-1
      ['auth pages left indexable', () => classify(PR.PRIVATE_NOINDEX_SOURCES.filter((s) => s !== '/auth/:path*')).why],
      ['test-taking pages left indexable', () => classify(PR.PRIVATE_NOINDEX_SOURCES.filter((s) => s !== '/mock-tests/:id/:path*')).why],
      ['a public page noindexed', () => classify([...PR.PRIVATE_NOINDEX_SOURCES, '/exams/:path*']).why],
      ['an unclassified new private route', () => classify(PR.PRIVATE_NOINDEX_SOURCES, new Set([...PUBLIC_ROUTES].filter((r) => r !== '/pricing'))).why.concat(classify(PR.PRIVATE_NOINDEX_SOURCES.filter((s) => s !== '/wallet/:path*')).why)],
      ['noindex headers not applied', () => nextConfigWiring(mut(CFG, '...PRIVATE_NOINDEX_SOURCES.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: PRIVATE_NOINDEX_VALUE }] })),', ''))],
      ['/category served as a duplicate again', () => nextConfigWiring(mut(CFG, '{ source: "/category/:slug", destination: "/exams/:slug", permanent: true },', ''))],
      ['favicon back to a redirect', () => nextConfigWiring(mut(CFG, '{ source: "/favicon.ico", destination: `${BRAND_SUITE}/favicon/favicon.ico` },', '{ source: "/favicon.ico", destination: "/brand/icon/32" },'))],
      // S1-2
      ['canonical defaults to the home page again', () => checkMetadata(loadTs('lib/seo/metadata.ts', mut(META_SRC, 'const url = canonicalUrl ? `${siteConfig.url}${canonicalUrl}` : null;', 'const url = canonicalUrl ? `${siteConfig.url}${canonicalUrl}` : siteConfig.url;'), STUBS), LAYOUT)],
      ['brand suffix always added', () => checkMetadata(loadTs('lib/seo/metadata.ts', mut(META_SRC, 'return withBrand.length <= SEO_TITLE_MAX ? withBrand : title;', 'return withBrand;'), STUBS), LAYOUT)],
      ['description not clamped', () => checkMetadata(loadTs('lib/seo/metadata.ts', mut(META_SRC, 'const desc = seoDescription(description);', 'const desc = description;'), STUBS), LAYOUT)],
      ['clamp cuts mid-word', () => checkMetadata(loadTs('lib/seo/metadata.ts', mut(META_SRC, 'return `${(space > 80 ? cut.slice(0, space) : cut)', 'return `${(cut)'), STUBS), LAYOUT)],
      ['root layout names a canonical', () => checkMetadata(M, mut(LAYOUT, 'export const metadata: Metadata = constructMetadata();', 'export const metadata: Metadata = constructMetadata({ canonicalUrl: "/" });'))],
      // S1-3
      ['an icon file that does not exist', async () => checkIcons({ ...I, SITE_ICONS: { ...I.SITE_ICONS, apple: { ...I.SITE_ICONS.apple, url: '/brand/courage-library-logo-suite/app/apple-touch-icon-999.png' } } }, MANIFEST)],
      ['an icon with the wrong stated size', async () => checkIcons({ ...I, MANIFEST_ICONS: I.MANIFEST_ICONS.map((i) => (i.sizes === '512x512' && i.purpose === 'any' ? { ...i, sizes: '256x256' } : i)) }, MANIFEST)],
      ['no maskable icon', async () => checkIcons({ ...I, MANIFEST_ICONS: I.MANIFEST_ICONS.filter((i) => i.purpose !== 'maskable') }, MANIFEST)],
      ['a non-square Organization logo', async () => checkIcons({ ...I, ORGANIZATION_LOGO_PATH: '/brand/courage-library-logo-suite/png/logo-horizontal@2x.png' }, MANIFEST)],
      // S1-4
      ['unlinked middle crumb kept', () => checkJsonLd(loadTs('lib/seo/jsonld.ts', mut(read('lib/seo/jsonld.ts'), 'const kept = items.filter((item, index) => index === items.length - 1 || Boolean(item.href));', 'const kept = items;'), STUBS), O, LANDING)],
      ['old logo in the Organization', () => checkJsonLd(J, loadTs('lib/landing/organization-jsonld.ts', mut(O_SRC, 'logo: `${siteConfig.url}${ORGANIZATION_LOGO_PATH}`,', 'logo: `${siteConfig.url}/images/logo.png`,'), STUBS), LANDING)],
      ['a SearchAction to a page that does not exist', () => checkJsonLd(J, loadTs('lib/landing/organization-jsonld.ts', mut(O_SRC, '    inLanguage: lang,\n', '    inLanguage: lang,\n    potentialAction: { "@type": "SearchAction", target: "https://couragelibrary.in/search?q={q}" },\n'), STUBS), LANDING)],
      ['WebSite JSON-LD not rendered on /hi', () => checkJsonLd(J, O, { ...LANDING, 'app/(landing)/hi/page.tsx': mut(LANDING['app/(landing)/hi/page.tsx'], '<JsonLd data={landingWebSiteJsonLd("hi")} />', '') })],
      ['FAQ JSON-LD drops a question', () => checkFaq(loadData(mut(D_SRC, 'mainEntity: t.faq.items.map(', 'mainEntity: t.faq.items.slice(1).map(')), EN, HI, R, PAGE_SRC)],
      ['FAQ JSON-LD answer diverges', () => checkFaq(loadData(mut(D_SRC, 'acceptedAnswer: { "@type": "Answer", text: f.a }', 'acceptedAnswer: { "@type": "Answer", text: f.a + " Guaranteed results." }')), EN, HI, R, PAGE_SRC)],
      // S1-5
      ['a category without exams listed', () => checkCategories(loadTs('lib/seo/category-sitemap.ts', mut(C_SRC, ' || !newest.has(c.id)) continue;', ') continue;')))],
      ['an internal category listed', () => checkCategories(loadTs('lib/seo/category-sitemap.ts', mut(C_SRC, 'c.is_internal !== false || ', '')))],
      ['a noindex page in the sitemap', () => checkSitemapStatic(mut(SM, '...["/pricing", "/about",', '...["/pricing", "/dashboard", "/about",'), CFG, PR.PRIVATE_NOINDEX_SOURCES).why],
      ['a redirected page in the sitemap', () => checkSitemapStatic(mut(SM, '...["/pricing", "/about",', '...["/pricing", "/premium", "/about",'), CFG, PR.PRIVATE_NOINDEX_SOURCES).why],
      ['category hubs not wired', () => checkSitemapStatic(mut(SM, 'dynamicEntries.push(...categoryHubEntries(baseUrl, categoriesRes.data, examsRes.data));', ''), CFG, PR.PRIVATE_NOINDEX_SOURCES).why],
    ];
    const missed = [];
    for (const [n, f] of muts) {
      let why;
      try { why = await f(); } catch (e) { why = /anchor missing/.test(e.message) ? [] : [e.message]; }
      if (!why || !why.length) missed.push(n);
    }
    assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
    return `${muts.length} mutations caught`;
  });

  console.log('SEO-1 gate');
  console.log(results.join('\n'));
  console.log(`SEO-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
