#!/usr/bin/env node
/**
 * LANDING-1 — offline gate for the landing page "/" (EN) and "/hi" (HI) (docs/design/LANDING_V1_SPEC.md + owner
 * decisions L1–L5 and the copy amendments of 2026-11-21). It REPLACES the HOME-1 checks H-1 (order / 5 steps), H-2 (no
 * exam names on home), H-10 (solid header) and H-11 (navy footer); the honest-copy rules (H-3) live on here.
 *   LD-1 copy: en.ts and hi.ts have the SAME keys and list lengths; the owner's amendments are in place (hero sub,
 *        search, "Choose your exam" lead, step 1 / 4, Free list 1 / 3 / 5, pain 1 / 2, FAQ 1 / 2); no "Learn" nav item and
 *        no "Lessons" footer link (L4); 5 library fact pills with "AC · 5G Wi-Fi" as ONE pill
 *   LD-2 honest copy (H-3 kept): no price, no guarantee, no "No.1" / "#1", no counted students / selections, no
 *        testimonial wording, "topper" only inside the "No fake toppers" promise; the owner's banned overclaims never
 *        come back: "score down topic by topic", "result, topic by topic", "टॉपिक के हिसाब से बाँटकर", "and quiz",
 *        "exact lesson"
 *   LD-3 structure (replaces H-1): header → hero → find-exam band → choose-exam → pain → how (6 steps, "Improve" last)
 *        → free / Pro → library → promises → FAQ (native <details>, first open) → final CTA → footer; ONE <h1>;
 *        exam names allowed (replaces H-2) but category cards and chips are DATA-DRIVEN (H-4 principle): a card is a
 *        link only when its category has a live exam, else "Coming soon" and no link; a chip only for a live exam
 *   LD-4 header / footer (replaces H-10 / H-11): sticky blurred white header with the logo-suite logo, the language
 *        switch (two links, aria-current) and the data-auth link sets; phone menu = native <details>; charcoal footer
 *        with the reversed logo-suite logo, 3 link columns and the legal row; every link target is an EXISTING route
 *   LD-5 cache (PERF-HOME-1 for "/" AND "/hi"): ISR (export const revalidate), no force-dynamic, no cookies() /
 *        headers() / searchParams / Suspense, the layout reads no session; "/hi" is in PUBLIC_PAGE_PATHS; canonical +
 *        hreflang (en, hi, x-default → /)
 *   LD-6 tokens + styles: every cl-* spec token defined in app/globals.css with the spec hex; the landing stylesheet
 *        holds no colour literal, has the 2 px cl-blue focus ring and the reduced-motion rule; the logo files are the
 *        final suite (referenced, never recoloured)
 *   LD-8 data-driven copy (owner round 3): FAQ 1 names only the LIVE exams (templates, never hard-coded names; 0 / 1 / 2+
 *        live → the none / is / are lines, joined with and / और); the search copy names no exam; the Hindi lines (hero
 *        badge + sub, FAQ 3, promise 4) only behind published Hindi content > 0; sign-up closed → every start action is
 *        "Explore exams" → /exams; the landing reader uses only the public client / public read functions (migration 145)
 *        and the anon-key auth settings — never the service role, never a cookie / header (UX2A L-4 condition); "/" and
 *        "/hi" never redirect or gate (UX2A L-3); exemptions recorded: BRAND-3 R4 (solid "Start free" in the LANDING
 *        header only) and UXFIX1 X-05 (phone bar = logo + language + menu; "Sign in" first in the menu, the start
 *        action second)
 *   LD-9 LANDING-1.1: (a) the footer "made" line (a Hindi claim) is behind the same published-Hindi condition (EN "Made for
 *        government-exam aspirants" / HI "सरकारी परीक्षाओं के aspirants के लिए" until then); (b) a LIVE category's subtitle is
 *        built from its live exams ("CGL live · more coming" / "CGL उपलब्ध · और जल्द") — no hard-coded exam list on a live card;
 *        "more coming" from the same COMING_SOON_EXAMS list the category page uses; (c) "/hi" is in the sitemap with the
 *        same priority / changefreq as "/" and hreflang alternates en → /, hi → /hi on both
 *   LD-7 negative controls: each mutation is caught
 * Run: node scripts/test_landing1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

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
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const ts = require('typescript');
function loadTs(rel, src, extra = {}) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const out = ts.transpileModule(src ?? read(rel), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const origReq = m.require.bind(m);
  m.require = (id) => (extra[id] ? extra[id] : origReq(id));
  m._compile(out, filename);
  return m.exports;
}

const FACTS_SRC = read('content/landing-page/facts.ts');
const EN_SRC = read('content/landing-page/en.ts');
const HI_SRC = read('content/landing-page/hi.ts');
const PAGE_SRC = read('components/landing-v1/landing-page.tsx');
const CSS = read('app/(landing)/landing.css');
// NAV-1 Stage A: the landing renders THE shared visitor header — its header rules are checked on that component
const VH_SRC = read('components/nav/visitor-header.tsx');
const NAV_CSS = read('app/nav.css');
const GLOBALS = read('app/globals.css');
const EN_ROUTE = read('app/(landing)/page.tsx');
const HI_ROUTE = read('app/(landing)/hi/page.tsx');
const LAYOUT = read('app/(landing)/layout.tsx');
const DATA = read('lib/landing/landing-page-data.ts');
const REVAL = read('lib/cache/revalidate-public.ts');

const loadCopy = (enSrc = EN_SRC, hiSrc = HI_SRC, factsSrc = FACTS_SRC) => {
  const facts = loadTs('content/landing-page/facts.ts', factsSrc);
  return {
    facts,
    en: loadTs('content/landing-page/en.ts', enSrc, { './facts': facts }).LANDING_EN,
    hi: loadTs('content/landing-page/hi.ts', hiSrc, { './facts': facts }).LANDING_HI,
  };
};

function shape(v) {
  if (Array.isArray(v)) return `[${v.length}:${v.length ? shape(v[0]) : ''}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}:${shape(v[k])}`).join(',')}}`;
  return typeof v;
}
const allText = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(allText) : v && typeof v === 'object' ? Object.values(v).flatMap(allText) : []);

const AMEND = {
  en: {
    'hero.sub': 'Free lessons, practice and mock tests for government exams, in Hindi and English. Starting with SSC, with more exams on the way.',
    'band.search': 'Search for your exam…',
    'exams.lead': 'Start with the exam you are preparing for. SSC is live now; more categories are coming.',
    'how.steps.0.text': 'Clear lessons, topic by topic',
    'how.steps.3.text': 'See the sections and topics where marks were lost',
    'plans.free.list.0': 'Topic-wise lessons for every live exam',
    'plans.free.list.2': 'Daily current affairs',
    'plans.free.list.4': 'Section-wise result with your weak topics',
    'pain.items.0.answer': "Every wrong answer is saved for revision, with an explanation and a link to that topic's lesson wherever one is available.",
    'pain.items.1.answer': 'Each mock shows your score section by section and names the topics where you keep losing marks.',
    'faq.items.1.a': 'Yes. Lessons, daily practice, current affairs, free daily mocks and your result with weak topics are free. Pro is optional.',
  },
  hi: {
    'hero.sub': 'सरकारी परीक्षाओं के लिए मुफ़्त lessons, practice और mock tests, हिंदी और English में। शुरुआत SSC से, और परीक्षाएँ जल्द आ रही हैं।',
    'band.search': 'अपनी परीक्षा खोजें…',
    'exams.lead': 'जिस परीक्षा की तैयारी कर रहे हैं, वहीं से शुरू करें। SSC अभी उपलब्ध है; बाकी श्रेणियाँ जल्द आ रही हैं।',
    'how.steps.0.text': 'टॉपिक-वार साफ़ lessons',
    'how.steps.3.text': 'देखें किस section और टॉपिक में नंबर कटे',
    'plans.free.list.0': 'हर उपलब्ध परीक्षा के टॉपिक-वार lessons',
    'plans.free.list.2': 'रोज़ करेंट अफेयर्स',
    'plans.free.list.4': 'Section-wise result, कमज़ोर टॉपिक के साथ',
    'pain.items.0.answer': 'हर गलत जवाब revision के लिए सेव होता है, explanation के साथ, और जहाँ उपलब्ध हो वहाँ उस टॉपिक के lesson का link भी।',
    'pain.items.1.answer': 'हर mock आपका स्कोर section के हिसाब से दिखाता है और उन टॉपिक के नाम बताता है जहाँ आपके नंबर बार-बार कटते हैं।',
    'faq.items.1.a': 'हाँ। Lessons, रोज़ की practice, करेंट अफेयर्स, रोज़ के मुफ़्त mocks और कमज़ोर टॉपिक के साथ आपका result मुफ़्त हैं। Pro वैकल्पिक है।',
  },
};
const at = (o, p) => p.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

function checkCopy(c) {
  assert(shape(c.en) === shape(c.hi), 'en.ts and hi.ts differ in keys or list lengths');
  assert(c.en.lang === 'en' && c.hi.lang === 'hi', 'lang keys');
  for (const lang of ['en', 'hi']) for (const [k, v] of Object.entries(AMEND[lang])) assert(at(c[lang], k) === v, `${lang} ${k} is not the owner's amended copy`);
  assert(c.en.how.steps.length === 6 && c.en.how.steps[5].title === 'Improve' && c.hi.how.steps[5].title === 'बेहतर', '6 steps, "Improve" last');
  // FOOTER-1 (re-pointed, rule kept): the landing has no footer copy of its own any more (THE public footer); its Learn
  // link appears only once the Learn index exists (lib/site/footer-links.ts, gated by FOOTER-1 F-3)
  assert(!('learn' in c.en.nav) && !('footer' in c.en) && !('footer' in c.hi), 'L4: no Learn nav item / a landing-only footer copy');
  assert(!Object.values(c.en.nav).some((s) => /^(Learn|Lessons)$/.test(s)) && /\.\.\.\(learnReady \? \[\{ label: "Learn", href: FOOTER_ROUTES\.learn \}\] : \[\]\)/.test(read('lib/site/footer-links.ts')) && /export const LEARN_INDEX_READY = false;/.test(read('lib/nav/visitor-nav.ts')), 'L4: a "Learn" / "Lessons" link label (footer Learn only behind LEARN_INDEX_READY)');
  const pills = c.facts.LANDING_LIBRARY_FACTS;
  assert(pills.en.length === 5 && pills.hi.length === 5 && pills.en.includes('AC · 5G Wi-Fi') && pills.hi.includes('AC · 5G Wi-Fi'), '5 library pills, "AC · 5G Wi-Fi" as one');
  assert(c.en.hero.h1Before + c.en.hero.h1Strong + c.en.hero.h1After === 'Find your weak topics. Fix them. Score better in your next attempt.', 'EN H1');
  assert((c.hi.hero.h1Before + c.hi.hero.h1Strong + c.hi.hero.h1After).startsWith('अपने कमज़ोर टॉपिक पहचानें'), 'HI H1');
  return `${allText(c.en).length} EN strings = ${allText(c.hi).length} HI strings`;
}

const BANNED = [/score down topic by topic/i, /result, topic by topic/i, /टॉपिक के हिसाब से बाँटकर/, /and quiz/i, /exact lesson/i];
function checkHonest(c) {
  const texts = [...allText(c.en), ...allText(c.hi), ...allText(c.facts.LANDING_LIBRARY_FACTS)];
  const hits = [];
  for (const s of texts) {
    for (const re of BANNED) if (re.test(s)) hits.push(`overclaim "${s.slice(0, 60)}"`);
    if (/₹\s?\d|\bRs\.?\s?\d|\bINR\b|\/month|per month|प्रति माह/i.test(s)) hits.push(`price "${s.slice(0, 60)}"`);
    if (/guarantee|गारंटी|100\s?%|\bNo\.?\s?1\b|#1\b|number one/i.test(s)) hits.push(`guarantee / rank "${s.slice(0, 60)}"`);
    if (/\d[\d,.]*\s*(\+\s*)?(students|aspirants|selections|toppers|lakh|crore)/i.test(s)) hits.push(`counted claim "${s.slice(0, 60)}"`);
    if (/testimonial|review(s)? from|rated|⭐|\bstars?\b/i.test(s)) hits.push(`testimonial / rating "${s.slice(0, 60)}"`);
    if (/topper|टॉपर/i.test(s) && !/No fake toppers|कोई नकली टॉपर नहीं/.test(s)) hits.push(`topper "${s.slice(0, 60)}"`);
  }
  assert(hits.length === 0, hits.join(' | '));
  return `${texts.length} strings checked`;
}

function routeExists(href) {
  const p = href.split('#')[0].split('?')[0];
  if (p === '/' || p === '/hi') return true;
  const segs = p.replace(/^\//, '').split('/');
  const dirs = fs.readdirSync(path.join(ROOT, 'app'), { withFileTypes: true }).filter((d) => d.isDirectory() && /^\(.*\)$/.test(d.name)).map((d) => d.name);
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
  return tryDir('') || dirs.some((d) => tryDir(d));
}

function checkStructure(pageSrc, facts) {
  const main = pageSrc.slice(pageSrc.indexOf('<main id="main-content">'), pageSrc.indexOf('</main>'));
  const order = [...main.matchAll(/<(Hero|Band|Exams|Pain|How|Plans|Library|Promises|Faq|Final)\b/g)].map((m) => m[1]);
  assert(order.join(',') === 'Hero,Band,Exams,Pain,How,Plans,Library,Promises,Faq,Final', `section order: ${order.join(',')}`);
  const shell = pageSrc.slice(pageSrc.indexOf('export function LandingPageV1'));
  // FOOTER-1 (re-pointed, rule kept): the footer is THE public footer
  assert(shell.indexOf('<Header') < shell.indexOf('<main') && shell.indexOf('</main>') < shell.indexOf('<PublicFooter') && shell.indexOf('<PublicFooter') > 0, 'header → main → footer');
  assert((pageSrc.match(/<h1\b/g) || []).length === 1, 'exactly one <h1>');
  assert(/<details key=\{f\.q\} open=\{i === 0\}>/.test(pageSrc), 'FAQ = native <details>, the first open');
  assert(/const isLive = live\[c\.slug\] === true;/.test(pageSrc) && /isLive \? \(\s*<Link className="lp-exam" href=\{R\.examCategory\(c\.slug\)\}/.test(pageSrc) && /<div className="lp-exam lp-exam--soon"/.test(pageSrc) && /\{!isLive && <span className="lp-exam__soon">\{t\.exams\.comingSoon\}<\/span>\}/.test(pageSrc), 'category cards: link only when live, else "Coming soon" and no link');
  assert(/const chips = LANDING_CHIPS\.filter\(\(c\) => liveExams\.includes\(c\.slug\)\);/.test(pageSrc) && !/LANDING_CHIPS\.map/.test(pageSrc), 'chips only for live exams');
  // every link target exists
  const R = facts.LANDING_ROUTES;
  const hrefs = [R.home.en, R.home.hi, R.signUp, R.signIn, R.dashboard, R.exams, R.currentAffairs, R.mockTests, R.terms, R.privacy, R.refund, R.grievance, R.about, R.contact, R.help, R.examCategory('ssc'), ...facts.LANDING_CHIPS.map((c) => c.href)];
  const missing = hrefs.filter((h) => !routeExists(h));
  assert(missing.length === 0, `link targets without a route: ${missing.join(', ')}`);
  assert(R.grievance === '/contact#grievance-officer' && !/\/learn\b/.test(JSON.stringify(R)), 'L4 fallbacks (grievance → /contact#grievance-officer; nothing points at /learn)');
  return `${hrefs.length} link targets resolve`;
}

function checkHeaderFooter(pageSrc, vh = VH_SRC) {
  // NAV-1 Stage A (re-pointed, rules kept): the landing header IS the shared visitor header, with the switch and the hint
  assert(/<VisitorHeader\s[\s\S]*?langSwitch\s[\s\S]*?auth="hint"\s*\/>/.test(pageSrc) && /<header className="cl-vh"/.test(vh) && /\.cl-vh \{\s+position: sticky;/.test(NAV_CSS) && /backdrop-filter: saturate\(1\.4\) blur\(10px\);/.test(NAV_CSS) && /background: var\(--cl-header-bg\);/.test(NAV_CSS), 'sticky, blurred white header (replaces H-10) — the shared visitor header');
  // FOOTER-1: the footer logo moved with the footer into THE public footer (light surface → the standard lockup)
  assert(/const LOGO = "\/brand\/courage-library-logo-suite\/svg\/logo-horizontal\.svg";/.test(vh) && /const LOGO = "\/brand\/courage-library-logo-suite\/svg\/logo-horizontal\.svg";/.test(read('components/footer/public-footer.tsx')), 'the final logo-suite files');
  assert(/<Link href="\/" hrefLang="en" lang="en" aria-current=\{t\.lang === "en" \? "page" : undefined\}>/.test(vh) && /<Link href="\/hi" hrefLang="hi" lang="hi" aria-current=\{t\.lang === "hi" \? "page" : undefined\}>/.test(vh), 'language switch = two plain links with aria-current (L1)');
  assert(vh.includes('className={`${out}cl-vh__auth`}') && vh.includes('className="auth-in cl-vh__auth"') && vh.includes('const out = auth === "hint" ? "auth-out " : "";'), 'L5: the data-auth link sets');
  assert(/<details className="cl-vh__drawer" data-nav-drawer="">/.test(vh), 'phone menu = native <details> (works without JS)');
  assert(!/"use client"/.test(vh), 'the visitor header is a server component (its one client helper is a separate file)');
  // FOOTER-1 (owner spec, re-pointed): the landing renders THE public footer — the language switch here only, no sign-up
  // band (the landing ends with its own final CTA), Hindi copy on /hi; no landing-only footer CSS left
  assert(/<PublicFooter\s+t=\{footerCopy\(t\.lang\)\}[\s\S]*?band=\{null\}\s+langSwitch=\{navLabels\(t\.lang\)\}/.test(pageSrc) && !/\.lp-ft\b/.test(CSS) && !/<footer\b/.test(pageSrc), 'THE public footer (switch, no band) replaces the landing footer');
  assert(!/"use client"/.test(pageSrc), 'the landing page is a server component (no client JS)');
}

function checkCache(enRoute, hiRoute, layout, data, reval) {
  for (const [n, s] of [['/', enRoute], ['/hi', hiRoute]]) {
    assert(/export const revalidate = \d+;/.test(s), `${n}: no export const revalidate (ISR)`);
    assert(!/force-dynamic|cookies\(|headers\(|searchParams|<Suspense|"use client"/.test(s), `${n}: reads a cookie / header / searchParams or streams`);
  }
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert(!/cookies\(|headers\(|getUser|getSession|getServerSession|AppShell|PublicShell/.test(code(layout)), 'the landing layout reads a session or reuses the shared shell');
  assert(!/cookies\(|headers\(|getUser|getSession/.test(data) && /createPublicServerSupabaseClient\(\)/.test(data) && /tags: \["categories"\]/.test(data), 'the landing data read is cookie-free, public and tagged "categories"');
  assert(/PUBLIC_PAGE_PATHS = \[[^\]]*"\/"[^\]]*"\/hi"/.test(reval), '"/hi" is revalidated with "/"');
  assert(/languages: \{ en: abs\("\/"\), hi: abs\("\/hi"\), "x-default": abs\("\/"\) \}/.test(data) && /canonical: abs\(path\)/.test(data), 'canonical + hreflang en / hi / x-default');
  assert(!fs.existsSync(path.join(ROOT, 'app/(public)/page.tsx')), 'the old home page under app/(public) must be gone (one "/" only)');
}

const SPEC_TOKENS = { 'cl-blue': '#475bff', 'cl-blue-hover': '#394eff', 'cl-blue-text': '#3a4beb', 'cl-blue-deep': '#2a3587', 'cl-blue-tint': '#eef0ff', 'cl-charcoal': '#18191b', 'cl-slate': '#5b6070', 'cl-silver': '#a9aebb', 'cl-cloud': '#f5f6fa', 'cl-line': '#e6e8ef', 'cl-ocean': '#0471ac', 'cl-violet': '#7a4ce2', 'cl-teal': '#2e8694', 'cl-coral': '#ff6b4a', 'cl-coral-text': '#c2401f', 'cl-coral-tint': '#ffede7' };
function checkTokens(globals, css) {
  for (const [k, v] of Object.entries(SPEC_TOKENS)) assert(new RegExp(`--color-${k}: ${v};`, 'i').test(globals), `token ${k} ≠ ${v}`);
  assert(/--cl-band: linear-gradient\(135deg, #485bff 0%, #4262f3 45%, #3973d6 100%\);/i.test(globals), 'cl-band gradient');
  assert(/--color-primary-700: #1d4ed8;/.test(globals), 'an existing token changed (primary-700)');
  const lit = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b|(?<![a-z-])(?:rgba?|hsla?|oklch)\(/gi);
  assert(!lit, `colour literal in the landing stylesheet: ${(lit || []).join(', ')}`);
  assert(/outline: 2px solid var\(--color-cl-blue\);/.test(css), 'the 2 px cl-blue focus ring');
  assert(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*transition: none !important;/.test(css), 'reduced motion removes transitions');
  assert(!/filter:\s*(hue|invert|brightness)|fill:\s*[^;]*logo/i.test(css), 'the logo must not be recoloured');
}

const LANDING_COPY_SRC = read('lib/landing/landing-copy.ts');
const EXAM_NAMES = /SSC|CGL|CHSL|MTS|IBPS|RRB|NTPC|CTET|UP Police|Banking|Railway|बैंकिंग|रेलवे/;
const HINDI_CLAIM = /Hindi (&|and) English|in Hindi and English|Learn in the language you think in|Can I study in Hindi|हिंदी और English में|जिस भाषा में सोचते हैं|क्या हिंदी में पढ़ाई हो सकती है/;

function checkDataDriven(c, R, pageSrc, data, routes, vh = VH_SRC) {
  for (const t of [c.en, c.hi]) {
    // (a) no hard-coded exam names in FAQ 1 / search
    assert(t.faq.items[0].a === '{LIVE_EXAMS_ANSWER}', `${t.lang}: FAQ 1 answer must be the placeholder (built from live exams)`);
    assert(!EXAM_NAMES.test(t.liveExams.one + t.liveExams.many) && !EXAM_NAMES.test(t.band.search), `${t.lang}: an exam name hard-coded in FAQ 1 / search copy`);
    assert(t.liveExams.one.includes('{LIVE_EXAMS}') && t.liveExams.many.includes('{LIVE_EXAMS}'), `${t.lang}: templates`);
  }
  const en = (names) => R.resolveLandingCopy(c.en, { liveExamNames: names, hindiLive: false, signupOpen: true }).t.faq.items[0].a;
  const hi = (names) => R.resolveLandingCopy(c.hi, { liveExamNames: names, hindiLive: false, signupOpen: true }).t.faq.items[0].a;
  assert(en([]) === 'Exams are being added step by step, starting with SSC.' && hi([]) === 'परीक्षाएँ धीरे-धीरे जोड़ी जा रही हैं, शुरुआत SSC से।', 'none live');
  assert(en(['SSC CGL']) === 'SSC CGL is live now. More exams are coming next, added step by step from each official syllabus.', `one live: ${en(['SSC CGL'])}`);
  assert(en(['SSC CGL', 'SSC CHSL']).startsWith('SSC CGL and SSC CHSL are live now.') && en(['A', 'B', 'C']).startsWith('A, B and C are live now.'), 'many live (EN)');
  assert(hi(['SSC CGL']).startsWith('SSC CGL अभी उपलब्ध है।') && hi(['SSC CGL', 'SSC CHSL']).startsWith('SSC CGL और SSC CHSL अभी उपलब्ध हैं।'), 'HI is / are');
  // (b) Hindi claims only behind published Hindi content
  for (const base of [c.en, c.hi]) {
    const off = R.resolveLandingCopy(base, { liveExamNames: [], hindiLive: false, signupOpen: true }).t;
    const on = R.resolveLandingCopy(base, { liveExamNames: [], hindiLive: true, signupOpen: true }).t;
    const shown = (t) => JSON.stringify([t.hero.badge, t.hero.sub, t.faq.items[2], t.promises.items[3]]);
    assert(!HINDI_CLAIM.test(shown(off)), `${base.lang}: a Hindi claim while no Hindi content is published`);
    assert(HINDI_CLAIM.test(shown(on)), `${base.lang}: the Hindi-live lines are missing`);
    assert(!HINDI_CLAIM.test(base.meta.description), `${base.lang}: the static meta description makes a Hindi claim`);
  }
  assert(/const hindiLive = !!hindi && hindi\.questions \+ hindi\.lessons \+ hindi\.currentAffairs > 0;/.test(data), 'the condition = published Hindi content > 0');
  // the component renders ONLY the resolved copy: it never reaches back into the raw dictionaries
  assert(!/LANDING_EN|LANDING_HI|hindiPending|liveExams\.(one|many|none)/.test(pageSrc), 'the page component reads raw dictionary lines');
  for (const r of routes) assert(/const \{ t, start \} = resolveLandingCopy\(LANDING_(EN|HI), facts\);/.test(r) && /<JsonLd data=\{landingFaqJsonLd\(t\)\} \/>/.test(r), 'the pages resolve the copy (page + JSON-LD)');
  // (c) sign-up closed → Explore exams → /exams everywhere
  const closed = R.resolveLandingCopy(c.en, { liveExamNames: [], hindiLive: false, signupOpen: false }).start;
  const open = R.resolveLandingCopy(c.hi, { liveExamNames: [], hindiLive: false, signupOpen: true }).start;
  assert(closed.label === 'Explore exams' && closed.href === '/exams' && open.label === 'मुफ़्त शुरू करें' && open.href === '/auth/signup', 'start action');
  // NAV-1: hero, plans, final in the page + the resolved start handed to the shared header (bar, compact bar, menu)
  // LIVE-GREEN-1 3b (re-pointed, rule kept): the page's three start actions are the ONE StartOrDashboard link (hero, plans, final)
  assert(!/href=\{R\.signUp\}/.test(pageSrc) && (pageSrc.match(/href=\{start\.href\}/g) || []).length === 1 && (pageSrc.match(/<StartOrDashboard t=\{t\} start=\{start\} where="(hero|plans|final)"/g) || []).length === 3 && pageSrc.includes('start={{ href: start.href, label: start.label }}') && (vh.match(/href=\{s\.href\}/g) || []).length === 3 && !/\/auth\/signup/.test(vh), 'every start action (header, menu, hero, plans, final) uses the resolved start');
  // (d) exemptions recorded — NAV-1: on the shared visitor header (LANDING-1 round 3, extended by NAV-1)
  assert(vh.includes(`BRAND-3 R4: the header's "Start free" is the SOLID cl-blue pill`) && /<Link className="cl-vh__pill" href=\{s\.href\}[^>]*data-start="header">/.test(vh) && /\.cl-vh__pill \{[^}]*background: var\(--color-cl-blue\);/.test(NAV_CSS), 'R4 exemption: the solid start action in the visitor header');
  const menu = vh.slice(vh.indexOf('data-drawer-panel=""'));
  assert(vh.includes('UXFIX1 X-05: on phones the bar is logo + start action + menu; "Sign in" is in the menu') && menu.indexOf('data-menu-item="signin"') > 0 && menu.indexOf('data-menu-item="signin"') < menu.indexOf('data-menu-item="start"') && /href=\{VISITOR_ROUTES\.signIn\}[^>]*data-menu-item="signin"/.test(menu), 'X-05 exemption: "Sign in" in the phone menu, before the start action');
  // (e) the L-4 condition: public reads only, never the service role, no cookie / header
  const hindi = read('lib/landing/hindi-content.ts');
  const signup = read('lib/auth/signup-availability.ts');
  for (const [n, src] of [['landing-page-data', data], ['hindi-content', hindi], ['signup-availability', signup]]) {
    assert(!/createAdminServerSupabaseClient|service_role|SERVICE_ROLE|cookies\(|headers\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), `${n}: service role / cookie / header`);
  }
  assert(/createPublicServerSupabaseClient\(\)/.test(data) && /sb\.rpc\("fn_public_hindi_question_count"\)/.test(hindi) && /headers: \{ apikey: supabaseAnonKey \}/.test(signup), 'public client / public read function / anon key');
  // (f) "/" and "/hi" never redirect or gate
  for (const r of routes) assert(!/redirect\(|notFound\(|requireAuth|getUser\(|getSession\(/.test(r), 'a redirect / gate on the landing page');
  return 'FAQ 1 0/1/2/3 live × EN/HI; Hindi on/off; sign-up open/closed';
}

const SITEMAP = read('app/sitemap.ts');
function checkLanding11(c, R, pageSrc, data, sitemap, footerSrc = read('content/footer.ts')) {
  // (a) FOOTER-1 (re-pointed, rule made stronger): the landing's conditional "made" line went with the landing footer;
  // THE public footer makes NO Hindi claim at all (EN or HI copy), so nothing there depends on published Hindi content
  for (const base of [c.en, c.hi]) {
    const t = R.resolveLandingCopy(base, { liveExamNames: [], hindiLive: false, signupOpen: true }).t;
    assert(!('footer' in t), `${base.lang}: a landing-only footer copy is back`);
  }
  const strings = [...footerSrc.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
  const claims = strings.filter((s) => HINDI_CLAIM.test(s));
  assert(strings.length > 30 && claims.length === 0, `the footer copy makes a Hindi claim: ${claims.join(' | ')}`);
  assert(!/footer\.made/.test(pageSrc), 'the page renders a footer "made" line');
  // (b) live-category subtitles from data
  assert(R.liveCategorySubtitle(c.en, ['CGL'], true) === 'CGL live · more coming' && R.liveCategorySubtitle(c.hi, ['CGL'], true) === 'CGL उपलब्ध · और जल्द', 'today\'s SSC subtitle (EN / HI)');
  assert(R.liveCategorySubtitle(c.en, ['CGL', 'CHSL'], false) === 'CGL, CHSL live' && R.liveCategorySubtitle(c.en, [], true) === '', 'more live exams / none');
  assert(R.examShortName('SSC CGL', 'SSC') === 'CGL' && R.examShortName('IBPS PO', 'Banking') === 'IBPS PO' && R.examShortName('SSC', 'SSC') === 'SSC', 'short names');
  assert(/<small>\{isLive \? liveCategorySubtitle\(t, detail\.shortNames\[c\.slug\] \?\? \[\], detail\.moreComing\[c\.slug\] === true\) : c\.examples\[t\.lang\]\}<\/small>/.test(pageSrc), 'a live card shows the data-driven subtitle; only a "Coming soon" card keeps the example list');
  assert((pageSrc.match(/c\.examples\[/g) || []).length === 1, 'the static example list is used in one place only (the Coming-soon branch)');
  assert(/liveShortNames\[c\.slug\] = live\.map\(\(e\) => examShortName\(e\.title as string, c\.name \?\? ""\)\);/.test(data) && /moreComing\[c\.slug\] = COMING_SOON_EXAMS\.some\(/.test(data) && /import \{ COMING_SOON_EXAMS \} from "@\/content\/public-pages";/.test(data), 'subtitles from the live read + the category page\'s coming-soon list');
  // (c) sitemap
  const entry = (u) => (sitemap.match(new RegExp(`\\{\\s*url: ${u},\\s*lastModified: new Date\\(\\),\\s*changeFrequency: "([a-z]+)",\\s*priority: ([0-9.]+),\\s*alternates: landingAlternates,\\s*\\}`)) || []);
  const home = entry('baseUrl');
  const hi = entry('`\\$\\{baseUrl\\}/hi`');
  assert(home.length && hi.length && home[1] === hi[1] && home[2] === hi[2], `"/hi" in the sitemap with the same changefreq / priority as "/" (${home.slice(1)} vs ${hi.slice(1)})`);
  assert(/const landingAlternates = \{ languages: \{ en: baseUrl, hi: `\$\{baseUrl\}\/hi` \} \};/.test(sitemap), 'hreflang alternates en → /, hi → /hi');
  return 'footer on / off × EN / HI; subtitles; sitemap /hi';
}

// LD-10 LIVE-GREEN-1 3b (owner): (a) a signed-in visitor gets "Go to dashboard" instead of every start action in the page
// body (UX2A L-14 kept) — the pre-paint auth hint swaps two links in one box (no layout shift, no session read);
// (b) no current-affairs claim on "/" while none is published (the Free list item + the FAQ answer; fail closed);
// (c) FOOTER-BAND-CLAIM: the footer band copy is always true — no daily-mock / current-affairs claim
const CA_CLAIM = /current affairs|अफेयर्स/i;
function checkLiveGreen3b(c, R, pageSrc, data, footerSrc = read('content/footer.ts'), globals = GLOBALS) {
  // (a)
  const comp = pageSrc.slice(pageSrc.indexOf('function StartOrDashboard('), pageSrc.indexOf('function Hero('));
  assert(/<Link className=\{`\$\{className\} auth-out`\} href=\{start\.href\}[^>]*data-landing-start=\{where\}>/.test(comp), 'the start action is not hidden for a signed-in visitor (auth-out)');
  assert(/<Link className=\{`\$\{className\} auth-in`\} href=\{R\.dashboard\} data-landing-dashboard=\{where\}>\s*\{navLabels\(t\.lang\)\.goToDashboard\}/.test(comp), 'no "Go to dashboard" twin for a signed-in visitor (auth-in → /dashboard)');
  assert(c.facts.LANDING_ROUTES.dashboard === '/dashboard', 'the dashboard route');
  assert(/html:not\(\[data-auth="in"\]\) \.auth-in,\s*html\[data-auth="in"\] \.auth-out \{\s*display: none !important;/.test(globals), 'the pre-paint swap rule (.auth-in / .auth-out)');
  for (const w of ['hero', 'plans', 'final']) assert(new RegExp(`<StartOrDashboard t=\\{t\\} start=\\{start\\} where="${w}"`).test(pageSrc), `the ${w} start action is not swapped`);
  // (b)
  for (const base of [c.en, c.hi]) {
    const body = (t) => JSON.stringify([t.hero, t.band, t.exams, t.pain, t.how, t.plans, t.library, t.promises, t.faq, t.final]);
    const off = R.resolveLandingCopy(base, { liveExamNames: [], hindiLive: false, signupOpen: true, currentAffairsLive: false }).t;
    const unknown = R.resolveLandingCopy(base, { liveExamNames: [], hindiLive: false, signupOpen: true }).t;
    const on = R.resolveLandingCopy(base, { liveExamNames: [], hindiLive: false, signupOpen: true, currentAffairsLive: true }).t;
    assert(!CA_CLAIM.test(body(off)) && !CA_CLAIM.test(body(unknown)), `${base.lang}: a current-affairs claim while none is published (or unknown)`);
    assert(on.plans.free.list.includes(base.currentAffairsPending.planItem) && CA_CLAIM.test(body(on)), `${base.lang}: the current-affairs lines are missing once articles are published`);
    assert(off.plans.free.list.length === base.plans.free.list.length - 1, `${base.lang}: the Free list must drop exactly the current-affairs item`);
  }
  assert(/timed\(sb\.from\("current_affairs_articles"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("status", "PUBLISHED"\)\)/.test(data), 'the published current-affairs count is not part of the bounded landing read');
  assert(/const currentAffairsLive = !!ca && !ca\.error && typeof ca\.count === "number" && ca\.count > 0;/.test(data) && /currentAffairsLive: false \}\)\);/.test(data) && /currentAffairsLive: live\.currentAffairsLive === true/.test(data), 'the current-affairs condition does not fail closed');
  // (c)
  const bands = [...footerSrc.matchAll(/bandText: "([^"]+)"/g)].map((m) => m[1]);
  assert(bands.length === 2 && bands.every((b) => !/daily|डेली|रोज़|current affairs|अफेयर्स/i.test(b)), `the footer band makes a daily-mock / current-affairs claim: ${bands.join(' | ')}`);
  return 'signed-in swap × hero / plans / final; CA claim off / unknown / on × EN / HI; band copy';
}

(async () => {
  const c = loadCopy();
  const R = loadTs('lib/landing/landing-copy.ts');
  await test('LD-1 copy: same keys EN / HI, owner amendments, no Learn / Lessons, 5 library pills', () => checkCopy(c));
  await test('LD-2 honest copy (H-3) + the banned overclaims', () => checkHonest(c));
  await test('LD-3 structure (replaces H-1 / H-2): order, 6 steps, one h1, data-driven cards and chips, existing routes', () => checkStructure(PAGE_SRC, c.facts));
  await test('LD-4 header / footer (replaces H-10 / H-11)', () => checkHeaderFooter(PAGE_SRC));
  await test('LD-5 cache (PERF-HOME-1 for / and /hi) + canonical / hreflang', () => checkCache(EN_ROUTE, HI_ROUTE, LAYOUT, DATA, REVAL));
  await test('LD-6 tokens + styles + logo', () => checkTokens(GLOBALS, CSS));
  await test('LD-8 data-driven copy (live exams, published Hindi, sign-up), exemptions R4 / X-05, public reads only', () => checkDataDriven(c, R, PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE]));
  await test('LD-9 LANDING-1.1: the footer makes no Hindi claim (FOOTER-1); live-category subtitles from data; /hi in the sitemap', () => checkLanding11(c, R, PAGE_SRC, DATA, SITEMAP));
  await test('LD-10 LIVE-GREEN-1 3b: signed-in visitors get "Go to dashboard"; no current-affairs claim unless published; band copy always true', () => checkLiveGreen3b(c, R, PAGE_SRC, DATA));
  await test('LD-7 negative controls: each mutation is caught', async () => {
    const mut = (s, a, b) => { assert(s.includes(a), `mutation anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b); };
    const cases = [
      ['HI key missing', () => checkCopy(loadCopy(EN_SRC, mut(HI_SRC, '    photoNote: "असली फ़ोटो ली जानी है",\n', '')))],
      ['old pain 2 copy', () => checkHonest(loadCopy(mut(EN_SRC, 'Each mock shows your score section by section and names the topics where you keep losing marks.', "Each mock breaks your score down topic by topic, so you can see where marks are lost.")))],
      ['and quiz', () => checkHonest(loadCopy(mut(EN_SRC, '"Daily current affairs",', '"Daily current affairs and quiz",')))],
      ['exact lesson', () => checkHonest(loadCopy(mut(EN_SRC, "a link to that topic's lesson wherever one is available.", 'a link to the exact lesson.')))],
      ['Hindi overclaim', () => checkHonest(loadCopy(EN_SRC, mut(HI_SRC, 'हर mock आपका स्कोर section के हिसाब से दिखाता है', 'हर mock आपका स्कोर टॉपिक के हिसाब से बाँटकर दिखाता है')))],
      ['a price', () => checkHonest(loadCopy(mut(EN_SRC, 'note: "Pro opens soon. Free features stay free."', 'note: "Pro from ₹299. Free features stay free."')))],
      ['a guarantee', () => checkHonest(loadCopy(mut(EN_SRC, '"Score better in your next attempt"', '"Guaranteed selection in your next attempt"')))],
      ['a counted claim', () => checkHonest(loadCopy(mut(EN_SRC, 'badge: "Free for every aspirant · Hindi & English"', 'badge: "Trusted by 50,000+ students"')))],
      ['Learn nav back', () => checkCopy(loadCopy(mut(EN_SRC, 'nav: { exams: "Exams",', 'nav: { learn: "Learn", exams: "Exams",')))],
      ['6 library pills', () => checkCopy(loadCopy(EN_SRC, HI_SRC, mut(FACTS_SRC, '"AC · 5G Wi-Fi", "Newspapers daily"', '"AC", "5G Wi-Fi", "Newspapers daily"')))],
      ['section order', () => checkStructure(mut(PAGE_SRC, '        <Pain t={t} />\n        <How t={t} />', '        <How t={t} />\n        <Pain t={t} />'), c.facts)],
      ['always-link cards', () => checkStructure(mut(PAGE_SRC, 'const isLive = live[c.slug] === true;', 'const isLive = true;'), c.facts)],
      ['all chips', () => checkStructure(mut(PAGE_SRC, 'const chips = LANDING_CHIPS.filter((c) => liveExams.includes(c.slug));', 'const chips = LANDING_CHIPS;'), c.facts)],
      ['a missing route', () => checkStructure(PAGE_SRC, { ...c.facts, LANDING_ROUTES: { ...c.facts.LANDING_ROUTES, help: '/learn' } })],
      ['no aria-current', () => checkHeaderFooter(PAGE_SRC, mut(VH_SRC, 'aria-current={t.lang === "hi" ? "page" : undefined}', ''))],
      ['the landing without the shared header', () => checkHeaderFooter(mut(PAGE_SRC, '<VisitorHeader', '<header'))],
      ['the visitor header as a client component', () => checkHeaderFooter(PAGE_SRC, '"use client";\n' + VH_SRC)],
      ['client component', () => checkHeaderFooter('"use client";\n' + PAGE_SRC)],
      ['cookie read', () => checkCache(mut(EN_ROUTE, 'export default async function HomePage() {', 'import { cookies } from "next/headers";\nexport default async function HomePage() {\n  await cookies();'), HI_ROUTE, LAYOUT, DATA, REVAL)],
      ['/hi not ISR', () => checkCache(EN_ROUTE, mut(HI_ROUTE, 'export const revalidate = 300;', 'export const dynamic = "force-dynamic";'), LAYOUT, DATA, REVAL)],
      ['/hi not revalidated', () => checkCache(EN_ROUTE, HI_ROUTE, LAYOUT, DATA, mut(REVAL, '["/", "/hi", "/exams"]', '["/", "/exams"]'))],
      ['no hreflang', () => checkCache(EN_ROUTE, HI_ROUTE, LAYOUT, mut(DATA, ', "x-default": abs("/")', ''), REVAL)],
      ['FAQ 1 hard-coded names', () => checkDataDriven(loadCopy(EN_SRC.replace('{ q: "Which exams are covered?", a: "{LIVE_EXAMS_ANSWER}" }', '{ q: "Which exams are covered?", a: "SSC CGL, CHSL and MTS are live." }')), R, PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE])],
      ['search names an exam', () => checkDataDriven(loadCopy(mut(EN_SRC, 'search: "Search for your exam…",', 'search: "Search SSC CGL, CHSL, MTS…",')), R, PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE])],
      ['Hindi claim always shown', () => checkDataDriven(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, 'badge: f.hindiLive ? base.hero.badge : base.hindiPending.badge', 'badge: base.hero.badge')), PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE])],
      ['Hindi FAQ always shown', () => checkDataDriven(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, 'if (i === 2 && !f.hindiLive) return { ...base.hindiPending.faq };', '')), PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE])],
      ['Hindi read via service role', () => checkDataDriven(c, R, PAGE_SRC, DATA.replace('createPublicServerSupabaseClient()', 'createAdminServerSupabaseClient()'), [EN_ROUTE, HI_ROUTE])],
      ['sign-up closed still links sign-up', () => checkDataDriven(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, ': { label: base.hero.explore, href: examsHref }', ': { label: base.startFree, href: signUpHref }')), PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE])],
      ['Sign in not before the start action in the menu', () => checkDataDriven(c, R, PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE], mut(VH_SRC, 'data-menu-item="signin"', 'data-menu-item="signin-x"'))],
      ['the header start action hard-codes sign-up', () => checkDataDriven(c, R, PAGE_SRC, DATA, [EN_ROUTE, HI_ROUTE], mut(VH_SRC, 'href={s.href} aria-current={here(s.href)} data-nav-action="" data-start="header"', 'href="/auth/signup" data-start="header"'))],
      ['a Hindi claim in the footer copy', () => checkLanding11(c, R, PAGE_SRC, DATA, SITEMAP, mut(read('content/footer.ts'), 'tagline: "Learn Smarter. Prepare Independently.",\n  library: "Also a study library in Kanpur",', 'tagline: "Learn Smarter. Prepare Independently.",\n  library: "Learn in Hindi and English",'))],
      ['the landing renders a footer made line again', () => checkLanding11(c, R, PAGE_SRC + '\n<span>{t.footer.made}</span>\n', DATA, SITEMAP)],
      ['live card with the static list', () => checkLanding11(c, R, mut(PAGE_SRC, '{isLive ? liveCategorySubtitle(t, detail.shortNames[c.slug] ?? [], detail.moreComing[c.slug] === true) : c.examples[t.lang]}', '{c.examples[t.lang]}'), DATA, SITEMAP)],
      ['more coming always', () => checkLanding11(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, '${moreComing ? ` · ${t.exams.moreComing}` : ""}', '` · ${t.exams.moreComing}`')), PAGE_SRC, DATA, SITEMAP)],
      ['subtitle from a fixed list', () => checkLanding11(c, R, PAGE_SRC, mut(DATA, 'liveShortNames[c.slug] = live.map((e) => examShortName(e.title as string, c.name ?? ""));', 'liveShortNames[c.slug] = ["CGL", "CHSL", "MTS", "GD"];'), SITEMAP)],
      ['/hi missing from the sitemap', () => checkLanding11(c, R, PAGE_SRC, DATA, SITEMAP.replace(/\n    \{\n      url: `\$\{baseUrl\}\/hi`,[\s\S]*?\n    \},/, ''))],
      ['/hi with a lower priority', () => checkLanding11(c, R, PAGE_SRC, DATA, SITEMAP.replace(/(url: `\$\{baseUrl\}\/hi`,\s*lastModified: new Date\(\),\s*changeFrequency: "daily",\s*priority: )1\.0/, '$10.5'))],
      ['no hreflang in the sitemap', () => checkLanding11(c, R, PAGE_SRC, DATA, mut(SITEMAP, 'const landingAlternates = { languages: { en: baseUrl, hi: `${baseUrl}/hi` } };', 'const landingAlternates = undefined;'))],
      ['start action shown to a signed-in visitor', () => checkLiveGreen3b(c, R, mut(PAGE_SRC, '<Link className={`${className} auth-out`} href={start.href}', '<Link className={className} href={start.href}'), DATA)],
      ['no Go to dashboard twin', () => checkLiveGreen3b(c, R, mut(PAGE_SRC, '<Link className={`${className} auth-in`} href={R.dashboard}', '<Link className={`${className} auth-in`} href={start.href}'), DATA)],
      ['the final CTA not swapped', () => checkLiveGreen3b(c, R, mut(PAGE_SRC, '<StartOrDashboard t={t} start={start} where="final"', '<StartOrDashboard t={t} start={start} where="plans"'), DATA)],
      ['current affairs always claimed', () => checkLiveGreen3b(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, 'const caLive = f.currentAffairsLive === true;', 'const caLive = true;')), PAGE_SRC, DATA)],
      ['the FAQ keeps its current-affairs answer', () => checkLiveGreen3b(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, '    if (!caLive && item.q === base.currentAffairsPending.faq.q) return { ...base.currentAffairsPending.faq };\n', '')), PAGE_SRC, DATA)],
      ['unknown treated as published', () => checkLiveGreen3b(c, loadTs('lib/landing/landing-copy.ts', mut(LANDING_COPY_SRC, 'const caLive = f.currentAffairsLive === true;', 'const caLive = f.currentAffairsLive !== false;')), PAGE_SRC, DATA)],
      ['the count fails open', () => checkLiveGreen3b(c, R, PAGE_SRC, mut(DATA, 'currentAffairsLive: false }));', 'currentAffairsLive: true }));'))],
      ['the band claims a daily mock again', () => checkLiveGreen3b(c, R, PAGE_SRC, DATA, mut(read('content/footer.ts'), 'bandText: "Timed mock tests, topic practice and a Mistake Vault."', 'bandText: "Free daily mock, current affairs and practice."'))],
      ['token changed', () => checkTokens(mut(GLOBALS, '--color-cl-blue: #475bff;', '--color-cl-blue: #4050ff;'), CSS)],
      ['colour literal', () => checkTokens(GLOBALS, CSS + '\n.lp-x { color: #ff0000; }')],
      ['no reduced motion', () => checkTokens(GLOBALS, CSS.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*$/, ''))],
    ];
    const missed = [];
    for (const [name, fn] of cases) {
      try { await fn(); missed.push(name); } catch (e) { if (/mutation anchor missing/.test(String(e.message))) missed.push(`${name}: ${e.message}`); }
    }
    assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
    return `${cases.length} mutations caught`;
  });
  console.log(results.join('\n'));
  console.log(`\nLANDING-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
