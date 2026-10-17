/**
 * UX-2a — public shell (header / footer) + landing page "/".
 *
 * Static (offline):
 *   L-1 content/landing.ts holds no hardcoded number (comments excluded); the only allowed figure is the founding
 *       year 2024. Counts come from lib/landing/landing-data.ts at request time.
 *   L-2 no dead links: every href in the landing copy, landing sections, header and footer resolves to an app route
 *       (dynamic segments allowed), and no link points to a route UX-2b has not built (/about, /contact, /privacy,
 *       /terms, /cnts)
 *   L-3 CTA targets: Start free → /auth/signup, Sign in → /auth/login, Go to dashboard → /dashboard, Explore SSC CGL →
 *       /exams/ssc-cgl; the header labels come from the copy file; "/" is never redirected
 *   L-4 honest data access: the landing reader uses the visitor's session client only (no service role, no writes),
 *       reads only published rows (mock_tests published + non-dynamic, PUBLISHED guides, PUBLISHED current affairs,
 *       the PUBLISHED-only syllabus read model) and is bounded by a timeout
 *   L-5 DB-read failure → honest fallback (simulated): malformed rows / an error / a thrown read / a hung read all
 *       give { ok: false }; the rendered Exams + What-you-get sections then contain no digit at all
 *   L-6 Organization JSON-LD: documented facts only (name, url, email, logo, Kanpur address), no sameAs / rating /
 *       counts; the JsonLd component escapes "<"
 *   L-7 design: the new / changed UX-2a files use tokens only (no raw colour, palette class, dark: variant, text
 *       under 12 px); content width 1200 px in header and footer
 *   L-8 honest copy: no testimonials, ratings, toppers, rankings, "best", guarantees, student counts; no internal
 *       words; Pro / payments described as coming soon, no prices
 * Live (local production build only, anonymous + qa-student; refuses non-localhost):
 *   L-9  GET / → 200; brand line; exactly one h1; landmarks; canonical + og:title / og:description; JSON-LD parses;
 *        no "undefined" / "NaN" / "null" in the visible text
 *   L-10 numbers on the page equal the live anonymous counts (PostgREST, same filters); current affairs / syllabus
 *        shown as coming soon exactly when nothing is published
 *   L-11 every internal link on "/" answers < 400 for an anonymous visitor (redirects not followed)
 *   L-12 sitemap.xml lists "/"
 *   L-13 axe-core (bundled with eslint-plugin-jsx-a11y; no new dependency) on "/" at 360 and 1440: 0 serious /
 *        critical violations; CLS ≤ 0.1
 *   L-14 signed-in visitor (qa-student, local): "/" is not redirected, shows "Go to dashboard" (header + hero), no
 *        Sign in / Get started
 * UX-2a.1 (decisions #47 / #48 / #49):
 *   L-15 no root app/loading.tsx; every segment loading.tsx renders the design-system PageLoading; live: the "/" hero
 *        is in the first HTML flush (before any streamed segment)
 *   L-16 site default description is exactly the #47 text (siteConfig → metadata default, manifest, Organization
 *        JSON-LD fallback); no exam-count claim ("50+", "thousands of") in any page metadata description
 *   L-17 live: every URL in sitemap.xml answers 200 on the local build (no /learn, /blog or flagged-off routes)
 *
 * Run: node scripts/test_ux2a_landing.cjs [--offline] [http://localhost:3100]
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OFFLINE = process.argv.includes('--offline');
const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');

const CONTENT = 'content/landing.ts';
const SECTIONS = 'components/landing/landing-sections.tsx';
const DATA = 'lib/landing/landing-data.ts';
const JSONLD = 'lib/landing/organization-jsonld.ts';
const PAGE = 'app/page.tsx';
const HEADER = 'components/shell/header-bar.tsx';
const FOOTER = 'components/shell/site-footer.tsx';
const CTA = 'components/landing/landing-cta.tsx';
const NEW_FILES = [CONTENT, SECTIONS, CTA, DATA, JSONLD, PAGE, HEADER, FOOTER, 'components/seo/json-ld.tsx'];

// ---------------------------------------------------------------- TS loader (stubs for next/* and the supabase server)
function loadTs(rel, stubs = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const req = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith('./') || id.startsWith('../')) {
      const t = path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
      const cand = [`${t}.ts`, `${t}.tsx`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (cand) return loadTs(cand, stubs);
    }
    if (id.startsWith('@/')) {
      const t = id.slice(2);
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, stubs);
    }
    return m.require(id);
  };
  new Function('module', 'exports', 'require', 'process', js)(m, m.exports, req, process);
  return m.exports;
}
const React = require('react');
const STUBS = {
  'next/link': { __esModule: true, default: ({ href, children, ...p }) => React.createElement('a', { href: String(href), ...p }, children) },
  // the session-dependent CTA spots render their signed-out fallback in the static render
  '@/lib/supabase/server': { createServerSupabaseClient: async () => { throw new Error('no session in the offline render'); } },
};

// ---------------------------------------------------------------- routes
function appRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name === 'page.tsx') out.push('/' + rel.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, ''));
    }
  };
  walk('app');
  return out.map((r) => (r === '/' ? '/' : r.replace(/\/$/, '')));
}
const ROUTES = appRoutes();
const routeExists = (href) => {
  const p = href.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return ROUTES.some((r) => {
    if (r === p) return true;
    const re = new RegExp('^' + r.replace(/\/\[\[?\.\.\.[^\]]+\]\]?/g, '(?:/.*)?').replace(/\[[^\]]+\]/g, '[^/]+') + '$');
    return re.test(p);
  });
};
const UX2B_ROUTES = ['/about', '/contact', '/privacy', '/terms', '/cnts', '/legal'];

(async () => {
  console.log('UX-2a landing + public shell');

  await test('L-1 content/landing.ts has no hardcoded numbers (only the founding year 2024)', async () => {
    const code = stripComments(read(CONTENT)).replace(/\$\{n\}|\(n\)|n === 1|\(n: number\)/g, '');
    const digits = [...code.matchAll(/\d+/g)].map((m) => m[0]).filter((d) => d !== '2024');
    assert(digits.length === 0, `numbers in the copy: ${digits.join(', ')}`);
    assert(/since August 2024/.test(code), 'founding year sentence missing');
    // the number templates only format what the reader passes in
    const C = loadTs(CONTENT, STUBS);
    assert(C.LANDING_EXAMS.mocks(8) === '8 free mock tests' && C.LANDING_EXAMS.mocks(1) === '1 free mock test', 'mock template');
    return 'no digits except 2024';
  });

  await test('L-2 no dead links: every landing / header / footer href routes; nothing points to UX-2b pages', async () => {
    const files = [CONTENT, SECTIONS, CTA, HEADER, FOOTER, 'components/shell/nav-config.ts'];
    const hrefs = new Set();
    for (const f of files) {
      const s = read(f);
      for (const m of s.matchAll(/href(?:=|: )"(\/[^"]*)"/g)) hrefs.add(m[1]);
    }
    hrefs.add('/exams/ssc-cgl');
    const dead = [...hrefs].filter((h) => !routeExists(h));
    const ux2b = [...hrefs].filter((h) => UX2B_ROUTES.some((r) => h === r || h.startsWith(`${r}/`)));
    assert(dead.length === 0, `no route for: ${dead.join(', ')}`);
    assert(ux2b.length === 0, `links to unbuilt UX-2b pages: ${ux2b.join(', ')}`);
    return `${hrefs.size} hrefs routed`;
  });

  await test('L-3 CTA targets valid; header labels from the copy file; "/" is public (no redirect)', async () => {
    const C = loadTs(CONTENT, STUBS);
    assert(C.LANDING_HERO.primaryCta.href === '/auth/signup' && C.LANDING_HERO.primaryCta.label === 'Start free', 'Start free');
    assert(C.LANDING_HERO.signedInCta.href === '/dashboard' && C.LANDING_FINAL_CTA.signedInCta.href === '/dashboard', 'Go to dashboard');
    assert(C.LANDING_HERO.secondaryCta.href === '/exams/ssc-cgl' && C.LANDING_HERO.secondaryCta.label === 'Explore SSC CGL', 'Explore SSC CGL');
    assert(C.LANDING_HERO.title === 'Learn Smarter. Prepare Independently.' && C.LANDING_BRAND_LINE === C.LANDING_HERO.title, 'brand line');
    const header = read(HEADER);
    assert(/href="\/auth\/login"[^>]*>\s*\{SHELL_COPY\.signIn\}/.test(header) && /href="\/auth\/signup" size="sm">\s*\{SHELL_COPY\.getStarted\}/.test(header), 'Sign in / Get started');
    assert(/href="\/dashboard" size="sm">\s*\{SHELL_COPY\.goToDashboard\}/.test(header) && /const onLanding = pathname === "\/";/.test(header), 'Go to dashboard on "/"');
    const page = stripComments(read(PAGE));
    const cta = stripComments(read(CTA));
    assert(!/redirect\(|notFound\(|requireAuth|getUser\(\)/.test(page + cta), '"/" must not redirect or gate (display-only session check)');
    assert(/export default function HomePage\(\)/.test(page), 'HomePage must be synchronous (hero in the first HTML flush, not behind app/loading.tsx)');
    assert(/auth\.getSession\(\)/.test(cta) && /<Suspense fallback=\{<Cta spot=\{spot\} signedIn=\{false\} \/>\}>/.test(cta), 'display-only session check in its own Suspense (signed-out fallback)');
    return 'hero, final CTA, header';
  });

  await test('L-4 honest data access: session client, published rows only, no writes, no service role, timeout', async () => {
    const s = stripComments(read(DATA));
    assert(!/createAdminServerSupabaseClient|service_role|SERVICE_ROLE/.test(s + read(PAGE)), 'service role');
    assert(!/\.(insert|update|upsert|delete)\(/.test(s), 'writes');
    assert(/from\("mock_tests"\)[\s\S]*?\.eq\("status", "published"\)\s*\.eq\("is_dynamic", false\)/.test(s), 'mock filter');
    assert(/from\("exam_knowledge_documents"\)[\s\S]*?\.eq\("status", "PUBLISHED"\)\s*\.not\("current_published_version_id", "is", null\)/.test(s), 'guide filter');
    assert(/from\("current_affairs_articles"\)[\s\S]*?\.eq\("status", "PUBLISHED"\)/.test(s), 'current-affairs filter');
    assert(/rpc\("fn_exam_syllabus_read_model"/.test(s) && /\.eq\("is_active", true\)/.test(s), 'read model + active exams');
    assert(/Promise\.race\(\[readRows\(supabase\), timeout\]\)/.test(s), 'timeout');
    assert(!/draft|DRAFT/.test(s.replace(/DRAFT data/g, '')), 'DRAFT data referenced');
    return 'published-only, read-only';
  });

  await test('L-5 DB-read failure → { ok: false } and a no-number fallback (simulated)', async () => {
    const D = loadTs(DATA, STUBS);
    const good = { exams: [{ id: 'e1', slug: 'ssc-cgl', title: 'SSC CGL', category: 'SSC' }], mocks: [{ mock_templates: { exam_id: 'e1' } }, { mock_templates: { exam_id: 'e1' } }], guides: [{ exam_id: 'e1' }], syllabusStates: { e1: { state: 'NO_SYLLABUS' } }, currentAffairsCount: 0 };
    const ok = D.buildLandingData(good);
    assert(ok.ok && ok.exams[0].publishedMocks === 2 && ok.exams[0].publishedGuides === 1 && !ok.exams[0].syllabusAvailable && ok.currentAffairsPublished === 0, JSON.stringify(ok));
    for (const bad of [{ ...good, exams: null }, { ...good, mocks: [{}] }, { ...good, currentAffairsCount: null }, { ...good, exams: [{ id: 'e1' }] }]) assert(D.buildLandingData(bad).ok === false, 'malformed rows accepted');
    const chain = (result) => { const b = new Proxy({}, { get: (_, p) => (p === 'then' ? (r, j) => Promise.resolve(result).then(r, j) : () => b) }); return b; };
    const clients = {
      error: { from: () => chain({ data: null, error: { code: 'XX' } }), rpc: async () => ({ data: null, error: null }) },
      throws: { from: () => { throw new Error('network'); }, rpc: async () => ({}) },
      hangs: { from: () => chain(new Promise(() => {})), rpc: () => new Promise(() => {}) },
    };
    for (const [name, client] of Object.entries(clients)) {
      const r = await D.loadLandingData(client, 300);
      assert(r.ok === false, `${name}: ${JSON.stringify(r)}`);
    }
    // render the data sections with the failed read: no digits anywhere, fallback text + browse link present
    const { renderToStaticMarkup } = require('react-dom/server');
    const S = loadTs(SECTIONS, STUBS);
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(S.LandingExams, { data: { ok: false } }), React.createElement(S.LandingFeatures, { data: { ok: false } })));
    const text = html.replace(/<[^>]+>/g, ' ');
    assert(!/\d/.test(text), `digits in the fallback: ${text.match(/.{0,30}\d.{0,30}/)}`);
    assert(/could not be loaded right now/.test(text) && /href="\/exams"/.test(html), 'fallback text / browse link');
    assert(/Syllabus tracker[\s\S]*?Coming soon/.test(text) && /Daily current affairs[\s\S]*?Coming soon/.test(text), 'content features must be coming soon when unknown');
    // with live data the numbers come only from the data
    const live = renderToStaticMarkup(React.createElement(S.LandingExams, { data: ok })).replace(/<[^>]+>/g, ' ');
    assert(/2 free mock tests/.test(live) && /1 exam guide/.test(live) && /Syllabus coming soon/.test(live), live.slice(0, 300));
    return 'error / throw / hang → fallback; 0 digits rendered';
  });

  await test('L-6 Organization JSON-LD: documented facts only; JsonLd escapes "<"', async () => {
    const J = loadTs(JSONLD, STUBS);
    const o = J.landingOrganizationJsonLd();
    assert(JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['@context', '@type', 'address', 'email', 'logo', 'name', 'url']), Object.keys(o).join(','));
    assert(o.email === 'support@couragelibrary.in' && o.address.addressLocality === 'Kanpur' && o.name === 'Courage Library', 'values');
    assert(!/sameAs|aggregateRating|review|numberOf|alumni/i.test(JSON.stringify(o)), 'invented fields');
    assert(/replace\(\/<\/g, "\\\\u003c"\)/.test(read('components/seo/json-ld.tsx')), 'JsonLd must escape <');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { JsonLd } = loadTs('components/seo/json-ld.tsx', STUBS);
    const out = renderToStaticMarkup(React.createElement(JsonLd, { data: { x: '</script><b>' } }));
    assert(!out.includes('</script><b>') && JSON.parse(out.replace(/^<script[^>]*>|<\/script>$/g, '')).x === '</script><b>', 'escape');
    return 'EducationalOrganization; escaped';
  });

  await test('L-7 design: tokens only in the UX-2a files; 1200 px header / footer', async () => {
    const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
    const bad = [];
    for (const f of NEW_FILES) {
      const s = stripComments(read(f));
      if (/#[0-9a-fA-F]{3,8}\b(?![^"]*")|rgba?\(|hsla?\(|oklch\(/.test(s.replace(/href="#main-content"/g, ''))) bad.push(`${f}: raw colour`);
      if (new RegExp(`\\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:${PALETTE})-\\d`).test(s)) bad.push(`${f}: palette class`);
      if (/\bdark:/.test(s)) bad.push(`${f}: dark:`);
      if (/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]|text-\[0?\.\d+rem\]|text-xs\b/.test(s)) bad.push(`${f}: text under 12 px`);
    }
    assert(bad.length === 0, bad.join('; '));
    assert(/max-w-\[1200px\]/.test(read(HEADER)) && (read(FOOTER).match(/max-w-\[1200px\]/g) || []).length === 2 && !/max-w-7xl/.test(read(HEADER) + read(FOOTER)), '1200 px');
    return `${NEW_FILES.length} files`;
  });

  await test('L-8 honest copy: no testimonials / ratings / toppers / counts of students; Pro coming soon, no prices', async () => {
    const C = loadTs(CONTENT, STUBS);
    const all = JSON.stringify(C, (k, v) => (typeof v === 'function' ? v(1) : v));
    const banned = /testimonial|rating|rated|topper|rank(?:ed|ing)|\bbest\b|guarantee|lakh|thousands|million|\bno\.?\s*1\b|#1|students? trust|selected|Supabase|Production|canonical|deterministic|telemetry|debug/i;
    const hit = all.match(banned);
    assert(!hit, `banned word: ${hit && hit[0]}`);
    assert(!/₹|\bRs\.?\s?\d|\bINR\b|\/month|per month|\bprices?\b/.test(all), 'a price');
    assert(C.LANDING_PLANS.text === 'Free during early access. Pro coming soon.', 'plans line');
    return 'clean';
  });


  await test('L-15 no root app/loading.tsx; segment loading UIs use the design-system PageLoading (#48)', async () => {
    assert(!fs.existsSync(path.join(ROOT, 'app/loading.tsx')), 'root app/loading.tsx must not exist (#48)');
    const found = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name === 'loading.tsx') found.push(rel);
      }
    };
    walk('app');
    const bad = found.filter((f) => !/import \{ PageLoading \} from "@\/components\/shell\/page-loading";/.test(read(f)) || /legacy/.test(read(f)));
    assert(bad.length === 0, `not built from PageLoading: ${bad.join(', ')}`);
    const pl = read('components/shell/page-loading.tsx');
    assert(/from "@\/components\/ui\/skeleton"/.test(pl) && !/legacy|dark:|#[0-9a-f]{3,6}\b/i.test(stripComments(pl)), 'PageLoading must use components/ui only');
    const PUBLIC = ['app/loading.tsx', 'app/exams/loading.tsx', 'app/mock-tests/loading.tsx', 'app/current-affairs/loading.tsx', 'app/pricing/loading.tsx'];
    assert(!found.some((f) => PUBLIC.includes(f)), 'public routes must render static content immediately (no segment loading UI)');
    return `${found.length} segment loading UIs: ${found.map((f) => f.replace(/^app\//, '/').replace(/\/loading\.tsx$/, '')).join(', ')}`;
  });

  await test('L-16 site default description is the #47 text; no exam-count claims in page metadata', async () => {
    const WANT = 'Courage Library helps you prepare for Indian government exams with free mock tests, answer analysis and a Mistake Vault that turns every wrong answer into revision. Learn Smarter. Prepare Independently.';
    const site = loadTs('config/site.ts', STUBS).siteConfig;
    assert(site.description === WANT, `siteConfig.description: ${site.description}`);
    assert(/description = siteConfig\.description/.test(read('lib/seo/metadata.ts')), 'metadata default must use siteConfig.description');
    assert(/description: siteConfig\.description/.test(read('lib/seo/jsonld.ts')) && /description: siteConfig\.description/.test(read('app/manifest.ts')), 'Organization JSON-LD fallback / manifest must use siteConfig.description');
    const claims = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (!rel.startsWith('app/admin') && !rel.startsWith('app/api')) walk(rel); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const src = read(rel);
        for (const m of src.matchAll(/description:\s*(?:\n\s*)?["'`]([^"'`]+)["'`]/g)) if (/\b\d+\+|thousands of|lakhs? of|millions? of/i.test(m[1])) claims.push(`${rel}: ${m[1].slice(0, 80)}`);
      }
    };
    walk('app');
    walk('config');
    assert(claims.length === 0, claims.join(' | '));
    return 'exact; 0 count claims in metadata';
  });

  if (OFFLINE) { console.log('  SKIP  live L-9 … L-17 (--offline)'); return finish(); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) { console.log('  FAIL  live checks run against a local build only'); failed++; return finish(); }

  // ---------------------------------------------------------------- live (local build)
  const { readEnv } = require('./db/_db-env.cjs');
  const env = readEnv();
  const { chromium } = require('playwright');
  const get = async (p) => { for (let i = 1; i <= 3; i++) { try { return await fetch(BASE + p, { redirect: 'manual' }); } catch (e) { if (i === 3) throw new Error(`GET ${p}: ${e.cause ? e.cause.code : 'network error'}`); } } };
  const home = await get('/');
  const html = await home.text();
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

  await test('L-15b live: the "/" hero is in the first HTML flush (no streamed root loading boundary)', async () => {
    const hero = html.indexOf('id="hero-title"');
    const seg = html.indexOf('<div hidden id="S:');
    assert(hero > 0, 'hero missing');
    assert(seg === -1 || hero < seg, `hero at ${hero} comes after the first streamed segment at ${seg}`);
    return seg === -1 ? 'no streamed segments before the hero' : `hero ${hero} < first segment ${seg}`;
  });

  await test('L-17 every sitemap URL answers 200 on the local build (#49)', async () => {
    const xml = await (await get('/sitemap.xml')).text();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname + new URL(m[1]).search);
    assert(paths.length > 0, 'empty sitemap');
    assert(!paths.some((p) => p === '/learn' || p === '/blog'), 'removed routes still listed');
    const bad = [];
    for (const p of paths) {
      let r = null;
      for (let i = 1; i <= 3 && (!r || r.status >= 500); i++) r = await get(p);
      if (r.status !== 200) bad.push(`${p} ${r.status}`);
    }
    assert(bad.length === 0, bad.join(', '));
    return `${paths.length} URLs, all 200`;
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // the rendered text (React streams some segments out of order in the HTML; the DOM has them in place)
  const domText = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
    const t = await page.evaluate(() => document.body.innerText);
    await ctx.close();
    return t.replace(/\s+/g, ' ');
  })();

  await test('L-9 GET / 200: brand line, one h1, landmarks, canonical + OG text, JSON-LD parses, no undefined/NaN/null', async () => {
    assert(home.status === 200, String(home.status));
    assert(visible.includes('Learn Smarter. Prepare Independently.'), 'brand line');
    assert((html.match(/<h1[\s>]/g) || []).length === 1, 'exactly one h1');
    assert(/<header[\s>]/.test(html) && /<main id="main-content"/.test(html) && /<footer[\s>]/.test(html), 'landmarks');
    assert(/<link rel="canonical" href="[^"]+"/.test(html) && /<meta property="og:title" content="Courage Library: Government exam preparation with free mock tests"/.test(html) && /<meta property="og:description"/.test(html), 'canonical / OG');
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert(ld.length >= 1 && ld.some((o) => o['@type'] === 'EducationalOrganization' && o.email === 'support@couragelibrary.in'), 'JSON-LD');
    const bad = ['undefined', 'NaN', 'null'].filter((t) => new RegExp(`\\b${t}\\b`).test(visible) || new RegExp(`\\b${t}\\b`).test(domText));
    assert(bad.length === 0, `visible text contains ${bad.join(', ')}`);
    assert(!/Phase 1B|Supabase|Production/.test(visible), 'diagnostic text');
    return `${ld.length} JSON-LD block(s)`;
  });

  await test('L-10 numbers on "/" equal the live anonymous counts; coming soon exactly when nothing is published', async () => {
    const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
    const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=exact', 'Content-Type': 'application/json' };
    const rest = async (p, init) => { for (let i = 1; i <= 3; i++) { try { return await fetch(`${URL_}/rest/v1/${p}`, { headers: h, ...init }); } catch (e) { if (i === 3) throw new Error(`rest: ${e.cause ? e.cause.code : 'network error'}`); } } };
    const total = (r) => Number((r.headers.get('content-range') || '*/0').split('/')[1]);
    const exams = await (await rest('exams?select=id,slug,title&is_active=eq.true')).json();
    assert(!/could not be loaded right now/.test(domText), 'the page shows the fallback (live read failed on the server)');
    let mocksAll = 0;
    let guidesAll = 0;
    let anySyllabus = false;
    for (const e of exams) {
      const m = total(await rest(`mock_tests?select=id,mock_templates!inner(exam_id)&mock_templates.exam_id=eq.${e.id}&status=eq.published&is_dynamic=eq.false&limit=1`));
      const g = total(await rest(`exam_knowledge_documents?select=id&exam_id=eq.${e.id}&status=eq.PUBLISHED&current_published_version_id=not.is.null&limit=1`));
      const rm = await (await rest('rpc/fn_exam_syllabus_read_model', { method: 'POST', body: JSON.stringify({ p_exam_id: e.id }) })).json();
      mocksAll += m;
      guidesAll += g;
      anySyllabus = anySyllabus || (rm && rm.state === 'AVAILABLE');
      assert(domText.includes(e.title), `${e.title} card missing`);
      if (m > 0) assert(domText.includes(`${m} free mock test${m === 1 ? '' : 's'}`), `${e.slug}: mock count ${m} not shown`);
      if (g > 0) assert(domText.includes(`${g} exam guide${g === 1 ? '' : 's'}`), `${e.slug}: guide count ${g} not shown`);
    }
    if (mocksAll > 0) assert(domText.includes(`${mocksAll} free mock test${mocksAll === 1 ? '' : 's'} live`), `total mocks ${mocksAll}`);
    if (guidesAll > 0) assert(domText.includes(`${guidesAll} guide${guidesAll === 1 ? '' : 's'} published`), `total guides ${guidesAll}`);
    const ca = total(await rest('current_affairs_articles?select=id&status=eq.PUBLISHED&limit=1'));
    const block = (title) => (domText.match(new RegExp(`${title}\\s+(Available now|Coming soon)`)) || [])[1];
    assert(block('Daily current affairs') === (ca > 0 ? 'Available now' : 'Coming soon'), `current affairs ${ca} vs ${block('Daily current affairs')}`);
    assert(block('Syllabus tracker') === (anySyllabus ? 'Available now' : 'Coming soon'), `syllabus vs ${block('Syllabus tracker')}`);
    // every number domText on the page is accounted for (counts, step numbers, the founding year, the © year)
    const nums = [...domText.matchAll(/\b\d+\b/g)].map((x) => Number(x[0]));
    const allowed = new Set([mocksAll, guidesAll, 1, 2, 3, 4, 5, 6, 7, 2024, new Date().getFullYear(), ...exams.map(() => 0)]);
    const unknown = nums.filter((n) => !allowed.has(n));
    assert(unknown.length === 0, `unexplained numbers on "/": ${[...new Set(unknown)].join(', ')}`);
    return `${exams.length} active exam(s); mocks ${mocksAll}; guides ${guidesAll}; current affairs ${ca}; syllabus ${anySyllabus ? 'available' : 'coming soon'}`;
  });

  await test('L-11 every internal link on "/" answers < 400 for an anonymous visitor', async () => {
    const hrefs = [...new Set([...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('/_next') && !/\.(png|ico|svg|webmanifest|json)$/.test(h)))];
    const bad = [];
    for (const h of hrefs) {
      const r = await get(h.replace(/&amp;/g, '&'));
      if (r.status >= 400) bad.push(`${h} ${r.status}`);
    }
    assert(bad.length === 0, bad.join(', '));
    return `${hrefs.length} links`;
  });

  await test('L-12 sitemap.xml lists "/"', async () => {
    const r = await get('/sitemap.xml');
    const xml = await r.text();
    assert(r.status === 200 && /<loc>https?:\/\/[^<]+?\/?<\/loc>/.test(xml) && [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].some((m) => new URL(m[1]).pathname === '/'), 'no "/" entry');
  });

  try {
    await test('L-13 axe-core on "/" at 360 and 1440: 0 serious / critical; CLS ≤ 0.1', async () => {
      let axePath = null;
      try { axePath = require.resolve('axe-core/axe.min.js'); } catch { /* not installed */ }
      const out = [];
      for (const w of [360, 1440]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: 'light' });
        const page = await ctx.newPage();
        await page.addInitScript(() => {
          window.__cls = 0;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
        await page.waitForTimeout(500);
        const cls = await page.evaluate(() => window.__cls);
        assert(cls <= 0.1, `${w}: CLS ${cls}`);
        if (axePath) {
          await page.addScriptTag({ path: axePath });
          const res = await page.evaluate(async () => {
            // eslint-disable-next-line no-undef
            const r = await axe.run(document, { resultTypes: ['violations'] });
            return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0] && v.nodes[0].target.join(' ') }));
          });
          const serious = res.filter((v) => v.impact === 'serious' || v.impact === 'critical');
          assert(serious.length === 0, `${w}: ${JSON.stringify(serious)}`);
          out.push(`${w}: ${res.length} violation(s), 0 serious/critical, CLS ${cls.toFixed(3)}`);
        } else out.push(`${w}: axe-core not installed (skipped), CLS ${cls.toFixed(3)}`);
        await ctx.close();
      }
      return out.join('; ');
    });

    await test('L-14 signed-in visitor (qa-student, local): "/" stays public, shows Go to dashboard, no Sign in / Get started', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(120000);
      for (let i = 1; i <= 3; i++) {
        await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
        await page.fill('input[type="email"]', 'qa-student@courage-library.test');
        await page.fill('input[type="password"]', env('QA_STUDENT_PASSWORD'));
        await Promise.all([page.waitForURL((u) => !/\/auth\/login/.test(String(u))).catch(() => undefined), page.locator('button[type="submit"]').first().click()]);
        if (!/\/auth\/login/.test(page.url())) break;
        await page.waitForTimeout(15000);
      }
      assert(!/\/auth\/login/.test(page.url()), 'sign-in failed (qa-student)');
      const resp = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      assert(new URL(page.url()).pathname === '/' && resp.status() === 200, `redirected to ${new URL(page.url()).pathname}`);
      const banner = page.getByRole('banner');
      assert(await banner.getByRole('link', { name: 'Go to dashboard' }).isVisible(), 'header: Go to dashboard');
      assert((await banner.getByRole('link', { name: 'Sign in' }).count()) === 0 && (await banner.getByRole('link', { name: 'Get started' }).count()) === 0, 'Sign in / Get started shown to a signed-in visitor');
      assert(await page.getByRole('main').getByRole('link', { name: 'Go to dashboard' }).first().isVisible(), 'hero: Go to dashboard');
      assert((await page.getByRole('main').getByRole('link', { name: 'Start free' }).count()) === 0, 'Start free shown to a signed-in visitor');
      await ctx.close();
      return 'public, Go to dashboard ×2';
    });
  } finally {
    await browser.close();
  }
  finish();
})().catch((e) => { console.error('SUITE ERROR', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300)); process.exit(1); });

function finish() {
  console.log(`\nUX-2a landing: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
