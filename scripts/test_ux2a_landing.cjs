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
 *   L-10 (HOME-1, owner-approved re-point) numbers on the page equal the live anonymous counts (PostgREST, same
 *        filters): every public category tile shows its exact active-exam count (a link) or "Coming soon" (not a link);
 *        the feature totals (mock tests / guides) match; current affairs / syllabus are listed exactly when published;
 *        every other number is accounted for. Each category page /exams/<category> lists exactly its active exams as
 *        links (no extra, none missing) and shows no unexplained number
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
const PAGE = 'app/(public)/page.tsx';
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
      if (t.endsWith('.json') && fs.existsSync(path.join(ROOT, t))) return JSON.parse(fs.readFileSync(path.join(ROOT, t), 'utf8')); // HOME-1 marketing-shots manifest
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
  // UX-FIX-1: the CTA spots also read the sign-up availability (server-only module); the static render shows the fallback
  'server-only': {},
  '@/lib/auth/signup-availability': { getSignupAvailability: async () => 'closed' },
};

// ---------------------------------------------------------------- routes
function appRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name === 'page.tsx') out.push(('/' + rel.replace(/^app\/?/, '').replace(/\/?page\.tsx$/, '')).replace(/\/\([^/]+\)/g, '') || '/'); // route groups add no segment
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
// routes not built yet (UX-2b built /about, /contact, /privacy, /terms, /cnts — they are real routes now)
const UX2B_ROUTES = ['/legal'];

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

  await test('L-2 no dead links: every landing / header / footer / public-page href routes; nothing points to unbuilt pages', async () => {
    const files = [CONTENT, SECTIONS, CTA, HEADER, FOOTER, 'components/shell/nav-config.ts', 'content/public-pages.ts'];
    const hrefs = new Set();
    for (const f of files) {
      const s = read(f);
      for (const m of s.matchAll(/href(?:=|: )"(\/[^"]*)"/g)) hrefs.add(m[1]);
    }
    assert(hrefs.size >= 15, `only ${hrefs.size} hrefs found in the landing / header / footer sources (min 15)`); // GATE-HYGIENE-1
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
    // HOME-1 (ruling Q2): the closed-sign-up primary is "Explore exams" → the category tiles; never an exam-specific action
    assert(C.LANDING_HERO.secondaryCta.href === '/#categories' && C.LANDING_HERO.secondaryCta.label === 'Explore exams', 'Explore exams');
    // HOME-1 expert UX pass (owner): the slogan is the eyebrow; the H1 names only categories with live exams
    assert(C.LANDING_BRAND_LINE === 'Learn Smarter. Prepare Independently.' && C.LANDING_HERO.eyebrow === C.LANDING_BRAND_LINE, 'brand line (eyebrow)');
    assert(C.LANDING_HERO.title([]) === 'Free preparation for government exams' && C.LANDING_HERO.title(['SSC']) === 'Free preparation for SSC exams' && C.LANDING_HERO.title(['SSC', 'Railway', 'Banking']) === 'Free preparation for SSC, Railway & Banking exams', 'honest H1');
    const header = read(HEADER);
    assert(/href="\/auth\/login"[^>]*>\s*\{SHELL_COPY\.signIn\}/.test(header) && /href="\/auth\/signup"[^>]*>\s*\{SHELL_COPY\.startFree\}/.test(header), 'Sign in / Start free'); // UX-FIX-1: one label "Start free" (only while sign-up is open)
    assert(/href="\/dashboard"[^>]*>\s*\{SHELL_COPY\.goToDashboard\}/.test(header) && /const onLanding = pathname === "\/";/.test(header), 'Go to dashboard on "/"');
    const page = stripComments(read(PAGE));
    const cta = stripComments(read(CTA));
    assert(!/redirect\(|notFound\(|requireAuth|getUser\(\)/.test(page + cta), '"/" must not redirect or gate (display-only session check)');
    // HOME-1 expert UX pass (amendment, for owner sign-off): the page may await EXACTLY ONE thing before the hero — the
    // cached, 800 ms-bounded, never-rejecting live-category names for the honest H1. Everything else stays streamed;
    // L-15 (live) still proves the hero is in the first HTML flush.
    const sync = /export default function HomePage\(\)/.test(page);
    const awaits = [...page.slice(page.indexOf('export default')).matchAll(/await\s+([\w.]+)\(/g)].map((m) => m[1]);
    const loader = stripComments(read('lib/exams/category-data.ts'));
    const bounded = /export async function loadLiveCategoryNames\(\)[\s\S]{0,300}readLiveCategoryNames\(\)\.catch\(\(\) => null\), new Promise<null>\(\(ok\) => setTimeout\(\(\) => ok\(null\), 800\)\)/.test(loader) && /unstable_cache\(/.test(loader);
    // + HOME-1 pre-release: the Hindi availability (honest chip / FAQ) is read in the SAME bounded step (lib/landing/home-facts.ts)
    const facts = stripComments(read('lib/landing/home-facts.ts'));
    const hindi = stripComments(read('lib/landing/hindi-content.ts'));
    const factsOk = /await Promise\.all\(\[loadLiveCategoryNames\(\), loadHindiAvailability\(\)\]\)/.test(facts) && (facts.match(/await /g) || []).length === 1
      && /readHindiAvailability\(\)\.catch\(\(\) => null\), new Promise<null>\(\(ok\) => setTimeout\(\(\) => ok\(null\), 800\)\)/.test(hindi) && /unstable_cache\(/.test(hindi);
    assert(sync || (/export default async function HomePage\(\)/.test(page) && awaits.join() === 'loadHomeFacts' && bounded && factsOk), `HomePage: synchronous, or awaiting only the cached + bounded home facts (awaits: ${awaits.join() || 'none'}, names bounded: ${bounded}, facts: ${factsOk})`);
    // PERF-HOME-1 (owner, option 1): "/" is cached HTML shared by everyone — the CTA reads NO session; both variants are
    // rendered and CSS shows one from <html data-auth> (no JS → signed-out). UX-FIX-1 kept: the signed-out variant is
    // "signup-closed" (never a link to a closed sign-up) unless the GLOBAL sign-up setting is open.
    assert(!/getSession\(|getUser\(|cookies\(|headers\(|createServerSupabaseClient|createClient\(/.test(cta), 'the CTA reads no session / request (cached page)');
    assert(/<span className="auth-in contents" data-cta-variant="signed-in">\s*<Cta spot=\{spot\} mode="signed-in" \/>/.test(cta) && /<span className="auth-out contents" data-cta-variant="signed-out">\s*<Cta spot=\{spot\} mode=\{signedOut\} \/>/.test(cta), 'both variants, toggled by the auth-in / auth-out classes');
    assert(/const signedOut: Mode = \(await getSignupAvailability\(\)\) === "closed" \? "signup-closed" : "signup-open";/.test(cta), 'signed-out variant follows the global sign-up setting (closed → no sign-up link)');
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
    // HOME-1: the category tiles (a failed read = null) + "What you get" (ONLY live features; nothing "coming soon")
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(S.LandingCategories, { categories: null }), React.createElement(S.LandingFeatures, { data: { ok: false } })));
    const text = html.replace(/<[^>]+>/g, ' ');
    assert(!/\d/.test(text), `digits in the fallback: ${text.match(/.{0,30}\d.{0,30}/)}`);
    assert(/could not be loaded right now/.test(text) && /href="\/exams"/.test(html), 'fallback text / browse link');
    assert(!/Coming soon/.test(text) && !/Syllabus tracker|Daily current affairs/.test(text), 'unknown content features must be left out (not listed as coming soon) on home');
    // with live data the numbers come only from the data; a category without exams is an honest, non-link "Coming soon"
    const live = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(S.LandingFeatures, { data: ok }),
      React.createElement(S.LandingCategories, { categories: [{ id: 'c1', slug: 'ssc', name: 'SSC', shortDesc: null, iconKey: 'ssc', icon: null, activeExams: 1 }, { id: 'c2', slug: 'police', name: 'Police', shortDesc: null, iconKey: 'police', icon: null, activeExams: 0 }] })));
    const liveText = live.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert(/2 free mock tests/.test(liveText) && /1 guide published/.test(liveText) && /1 exam/.test(liveText) && /Police Coming soon/.test(liveText), liveText.slice(0, 300));
    assert(/href="\/exams\/ssc"/.test(live) && !/href="\/exams\/police"/.test(live), 'only a category with exams is a link');
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
    if (!found.length) console.log('  WARN  VACUOUS (0 items): L-15 no segment loading.tsx found to check'); // GATE-HYGIENE-1
    const bad = found.filter((f) => !/import \{ PageLoading \} from "@\/components\/shell\/page-loading";/.test(read(f)) || /legacy/.test(read(f)));
    assert(bad.length === 0, `not built from PageLoading: ${bad.join(', ')}`);
    const pl = read('components/shell/page-loading.tsx');
    assert(/from "@\/components\/ui\/skeleton"/.test(pl) && !/legacy|dark:|#[0-9a-f]{3,6}\b/i.test(stripComments(pl)), 'PageLoading must use components/ui only');
    // PERF-HOME-1: the same routes in either route group
    const PUBLIC = ['app/loading.tsx', 'app/exams/loading.tsx', 'app/(public)/loading.tsx', 'app/(site)/loading.tsx', 'app/(public)/exams/loading.tsx', 'app/(site)/exams/loading.tsx', 'app/(site)/mock-tests/loading.tsx', 'app/(site)/current-affairs/loading.tsx', 'app/(site)/pricing/loading.tsx'];
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
    let descriptions = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (!rel.startsWith('app/(site)/admin') && !rel.startsWith('app/api')) walk(rel); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const src = read(rel);
        for (const m of src.matchAll(/description:\s*(?:\n\s*)?["'`]([^"'`]+)["'`]/g)) if (++descriptions && /\b\d+\+|thousands of|lakhs? of|millions? of/i.test(m[1])) claims.push(`${rel}: ${m[1].slice(0, 80)}`);
      }
    };
    walk('app');
    walk('config');
    assert(descriptions >= 5, `only ${descriptions} metadata descriptions scanned (min 5)`); // GATE-HYGIENE-1
    assert(claims.length === 0, claims.join(' | '));
    return `exact; 0 count claims in ${descriptions} metadata descriptions`;
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
    // GATE-SCOPE-SWEEP (2026-10-29): the sitemap is prerendered at BUILD time; a lesson / course the owner unpublishes or
    // pauses after the build may 404 legitimately — such a 404 is tolerated ONLY for a path whose content changed after the
    // build (read-only lookup); every other non-200 still fails
    const buildAt = fs.statSync(path.join(ROOT, '.next', 'BUILD_ID')).mtime;
    const { Client } = require('pg');
    const { dbTarget } = require('./db/_db-env.cjs');
    const { safeBegin } = require('./db/live-safety.cjs');
    const changed = new Set();
    const db = new Client(dbTarget().pg); db.on('error', () => {}); await db.connect();
    try {
      await safeBegin(db, { readOnly: true });
      const nodes = (await db.query(`select replace(n.hierarchy_path, '.', '/') p from public.learning_documents d join public.canonical_taxonomy_nodes n on n.id = d.node_id
          where d.document_type = 'NODE_LESSON' and (d.updated_at > $1 or n.updated_at > $1)`, [buildAt])).rows.map((r) => r.p);
      for (const x of nodes) { changed.add(`/learn/${x}`); changed.add(`/hi/learn/${x}`); }
      const courses = (await db.query(`select e.slug from public.exam_course_launches l join public.exams e on e.id = l.exam_id where l.changed_at > $1`, [buildAt])).rows.map((r) => r.slug);
      for (const sl of courses) changed.add(`/exams/${sl}/course`);
      await db.query('ROLLBACK');
    } finally { await db.end().catch(() => {}); }
    const isChanged = (p) => {
      if (changed.has(p)) return true;
      const m = p.match(/^\/exams\/[a-z0-9-]+\/(.+)$/); // an exam-topic page of a changed lesson node
      return !!m && changed.has(`/learn/${m[1]}`);
    };
    const bad = [];
    let skipped = 0;
    for (const p of paths) {
      let r = null;
      for (let i = 1; i <= 3 && (!r || r.status >= 500); i++) r = await get(p);
      if (r.status === 404 && isChanged(p)) { skipped++; continue; }
      if (r.status !== 200) bad.push(`${p} ${r.status}`);
    }
    assert(bad.length === 0, bad.join(', '));
    return `${paths.length} URLs, all 200${skipped ? ` (${skipped} changed after the build: 404 tolerated)` : ''}`;
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // the rendered text (React streams some segments out of order in the HTML; the DOM has them in place)
  const domText = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
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

  await test('L-10 numbers on "/" and on each category page equal the live anonymous counts (categories, exams, mocks, guides)', async () => {
    const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
    const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=exact', 'Content-Type': 'application/json' };
    const rest = async (p, init) => { for (let i = 1; i <= 3; i++) { try { return await fetch(`${URL_}/rest/v1/${p}`, { headers: h, ...init }); } catch (e) { if (i === 3) throw new Error(`rest: ${e.cause ? e.cause.code : 'network error'}`); } } };
    const total = (r) => Number((r.headers.get('content-range') || '*/0').split('/')[1]);
    const exams = await (await rest('exams?select=id,slug,title,category_id&is_active=eq.true')).json();
    assert(Array.isArray(exams) && exams.length >= 1, `active exams read: ${Array.isArray(exams) ? exams.length : 'error'} (min 1)`); // GATE-HYGIENE-1
    // anonymous RLS already hides inactive / internal categories; the filters repeat the page's own rule
    const cats = await (await rest('exam_categories?select=id,slug,name&is_active=eq.true&is_internal=eq.false')).json();
    assert(Array.isArray(cats) && cats.length >= 1, `public categories read: ${Array.isArray(cats) ? cats.length : 'error'} (min 1)`); // GATE-HYGIENE-1
    assert(!/could not be loaded right now/.test(domText), 'the page shows the fallback (live read failed on the server)');
    const perCat = new Map(cats.map((c) => [c.slug, exams.filter((e) => e.category_id === c.id)]));
    assert([...perCat.values()].some((l) => l.length > 0), 'no category has an active exam (min 1 live tile)'); // GATE-HYGIENE-1

    // the tiles as rendered (per tile: link or not, its own text)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    // every public category is a tile (owner 2026-11-02: tiles restored): live = link with its count; else a "Coming soon" tile
    const tilesOf = async () => page.evaluate(() => [...document.querySelectorAll('[data-category-tile]')].map((t) => ({ slug: t.dataset.categoryTile, link: t.tagName === 'A', href: t.getAttribute('href'), text: t.innerText.replace(/\s+/g, ' ').trim() })));
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
      const tiles = await tilesOf();
      assert(tiles.map((t) => t.slug).sort().join() === cats.map((c) => c.slug).sort().join(), `tiles ${tiles.map((t) => t.slug)} ≠ public categories ${cats.map((c) => c.slug)}`);
      for (const c of cats) {
        const t = tiles.find((x) => x.slug === c.slug);
        const n = perCat.get(c.slug).length;
        assert(t.text.includes(c.name), `${c.slug}: name missing`);
        if (n > 0) assert(t.link && t.href === `/exams/${c.slug}` && t.text.includes(`${n} exam${n === 1 ? '' : 's'}`) && !/Coming soon/.test(t.text), `${c.slug}: expected a link with "${n} exam${n === 1 ? '' : 's'}" (got ${JSON.stringify(t)})`);
        else assert(!t.link && /Coming soon/.test(t.text) && !/\d/.test(t.text), `${c.slug}: expected a "Coming soon" tile that is not a link (got ${JSON.stringify(t)})`);
      }

      let mocksAll = 0;
      let guidesAll = 0;
      let anySyllabus = false;
      for (const e of exams) {
        mocksAll += total(await rest(`mock_tests?select=id,mock_templates!inner(exam_id)&mock_templates.exam_id=eq.${e.id}&status=eq.published&is_dynamic=eq.false&limit=1`));
        guidesAll += total(await rest(`exam_knowledge_documents?select=id&exam_id=eq.${e.id}&status=eq.PUBLISHED&current_published_version_id=not.is.null&limit=1`));
        const rm = await (await rest('rpc/fn_exam_syllabus_read_model', { method: 'POST', body: JSON.stringify({ p_exam_id: e.id }) })).json();
        anySyllabus = anySyllabus || (rm && rm.state === 'AVAILABLE');
      }
      if (mocksAll > 0) assert(domText.includes(`${mocksAll} free mock test${mocksAll === 1 ? '' : 's'} live`), `total mocks ${mocksAll}`);
      if (guidesAll > 0) assert(domText.includes(`${guidesAll} guide${guidesAll === 1 ? '' : 's'} published`), `total guides ${guidesAll}`);
      // "What you get" lists only what works today: a feature is listed exactly when its content is published
      const ca = total(await rest('current_affairs_articles?select=id&status=eq.PUBLISHED&limit=1'));
      assert(domText.includes('Daily current affairs') === ca > 0, `current affairs ${ca} vs listed ${domText.includes('Daily current affairs')}`);
      assert(domText.includes('Syllabus tracker') === anySyllabus, `syllabus ${anySyllabus} vs listed ${domText.includes('Syllabus tracker')}`);
      // every number on "/" is accounted for (category counts, totals, step numbers, the founding year, the © year)
      const nums = [...domText.matchAll(/\b\d+\b/g)].map((x) => Number(x[0]));
      // + the number of live exams (the "What you get" stats, HOME-1 expert UX pass)
      const allowed = new Set([mocksAll, guidesAll, exams.length, ...[...perCat.values()].map((l) => l.length), 1, 2, 3, 4, 5, 6, 7, 2024, new Date().getFullYear()]);
      const unknown = nums.filter((n) => !allowed.has(n));
      assert(unknown.length === 0, `unexplained numbers on "/": ${[...new Set(unknown)].join(', ')}`);

      // each live category page lists exactly its active exams as links (no extra, none missing); no unexplained number
      const pages = [];
      for (const c of cats.filter((x) => perCat.get(x.slug).length > 0)) {
        const live = perCat.get(c.slug);
        const r = await page.goto(`${BASE}/exams/${c.slug}`, { waitUntil: 'networkidle', timeout: 30000 });
        assert(r.status() === 200, `/exams/${c.slug} → ${r.status()}`);
        const got = await page.evaluate(() => ({
          active: [...document.querySelectorAll('[data-category-exam="active"] a')].map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim() })),
          soonLinks: document.querySelectorAll('[data-category-exam="soon"] a').length,
          failed: !!document.querySelector('[data-category-unavailable]'),
          text: document.querySelector('main').innerText.replace(/\s+/g, ' '),
        }));
        assert(!got.failed, `/exams/${c.slug}: the exam read failed on the server`);
        assert(got.active.length === live.length && live.every((e) => got.active.some((a) => a.href === `/exams/${e.slug}` && a.text === e.title)), `/exams/${c.slug}: active exams ${JSON.stringify(got.active)} ≠ live ${live.map((e) => e.slug)}`);
        assert(got.soonLinks === 0, `/exams/${c.slug}: a coming-soon exam is a link`);
        // exam titles may contain digits (a year, "Tier 2") — the listed titles are stripped first
        const soonTitles = await page.evaluate(() => [...document.querySelectorAll('[data-category-exam="soon"] h2')].map((h) => h.textContent.trim()));
        const stripped = [...live.map((e) => e.title), ...soonTitles].reduce((t, x) => t.split(x).join(' '), got.text);
        const bad = [...stripped.matchAll(/\b\d+\b/g)].map((x) => Number(x[0])).filter((n) => n !== new Date().getFullYear());
        assert(bad.length === 0, `/exams/${c.slug}: unexplained numbers ${[...new Set(bad)].join(', ')}`);
        pages.push(`${c.slug}: ${live.length} active`);
      }
      return `${cats.length} categories (${pages.join('; ')}); mocks ${mocksAll}; guides ${guidesAll}; current affairs ${ca}; syllabus ${anySyllabus ? 'listed' : 'not listed'}`;
    } finally {
      await ctx.close();
    }
  });

  await test('L-11 every internal link on "/" answers < 400 for an anonymous visitor', async () => {
    const hrefs = [...new Set([...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('/_next') && !/\.(png|ico|svg|webmanifest|json)$/.test(h)))];
    assert(hrefs.length >= 10, `only ${hrefs.length} internal links on "/" (min 10)`); // GATE-HYGIENE-1
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
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
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
      // CI-FIX-1 (#74): CAPTCHA-safe QA session cookies (no login form; scripts/live/qa-session.cjs)
      await require('./live/qa-session.cjs').qaBrowserLogin(ctx, 'qa-student@courage-library.test', BASE);
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
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
