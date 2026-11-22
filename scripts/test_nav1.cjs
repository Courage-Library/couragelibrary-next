#!/usr/bin/env node
/**
 * NAV-1 gate (owner spec docs/design/NAV_V1_SPEC.md, 23 Nov 2026) — offline, no network, no DB.
 * Stage A — THE visitor header (components/nav/visitor-header.tsx), rendered to HTML with the real code (only next/link
 * and the client enhancer are stubbed):
 *   N-1 one visitor header for every public page: the landing, the cached public shell and the signed-out session shell
 *       all render it; no other header component is rendered for a visitor; the old landing header / PUBLIC_NAV are gone
 *   N-2 the EN | हिंदी switch only on "/" and "/hi" (the landing passes it; no other caller does)
 *   N-3 Exams menu from live data: a live category is a link to /exams/<slug> with "<live> live · more coming"; every other
 *       one is a muted "Coming soon" that is NOT a link (menu + drawer); a failed read → no category link at all
 *   N-4 Learn only once a Learn index route exists; every header link resolves to an app route
 *   N-5 signed-in hint: both link sets (auth-out / auth-in) with "Go to dashboard"; a known signed-out page renders the
 *       signed-out set only; sign-up closed → "Explore exams" → /exams, never /auth/signup (UXFIX1 X-01)
 *   N-6 no JavaScript: Exams is a real link to /exams, the phone menu and the drawer's exam list are native <details>;
 *       the header is a server component, no cookie / header read (PERF-HOME-1); one small client enhancer
 *   N-7 cl-* tokens only: no colour literal in the nav components, styles or helpers
 *   N-8 typed EN / HI labels: same keys, none empty, the spec §6 wording
 *   N-9 a11y + motion: labelled landmarks, 48 px targets, focus ring, transitions only without reduced motion
 *   N-10 negative controls: each broken variant is caught
 * Run: node scripts/test_nav1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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

const STUBS = {
  'next/link': { __esModule: true, default: ({ href, children, prefetch, ...p }) => React.createElement('a', { href: String(href), ...p }, children) },
  './visitor-nav-enhancer': { VisitorNavEnhancer: () => null },
};
function loadTs(rel, src, stubs = STUBS) {
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

const VH_REL = 'components/nav/visitor-header.tsx';
const VN_REL = 'lib/nav/visitor-nav.ts';
const LB_REL = 'content/nav/labels.ts';
const SRC = {
  vh: read(VH_REL),
  vn: read(VN_REL),
  enh: read('components/nav/visitor-nav-enhancer.tsx'),
  css: read('app/nav.css'),
  labels: read(LB_REL),
  landing: read('components/landing-v1/landing-page.tsx'),
  pub: read('components/shell/public-shell.tsx'),
  app: read('components/shell/app-shell.tsx'),
  // NAV-1 Stage B: the old student header, bottom nav, account menu and the cached-page student bar are deleted
  removed: ['components/shell/header-bar.tsx', 'components/shell/bottom-nav.tsx', 'components/shell/account-links.tsx', 'components/shell/nav-menu.tsx', 'components/shell/public-student-nav.tsx', 'lib/ui/local-session.ts'].filter((p) => fs.existsSync(path.join(ROOT, p))),
  cfg: read('components/shell/nav-config.ts'),
  landingCss: read('app/(landing)/landing.css'),
  layout: read('app/layout.tsx'),
  live: read('lib/nav/live-categories.ts'),
  // Stage B
  ss: read('components/nav/student-shell.tsx'),
  sn: read('lib/nav/student-nav.ts'),
  sEnh: read('components/nav/student-nav-enhancer.tsx'),
  ssCss: read('app/nav-student.css'),
  prefs: read('lib/ui/nav-prefs.ts'),
  policy: read('lib/access/policy.ts'),
};

// ---------------------------------------------------------------- Stage B checks
const SN_REL = 'lib/nav/student-nav.ts';
const SS_REL = 'components/nav/student-shell.tsx';
const loadSn = (src) => loadTs(SN_REL, src);
const FLAGS = [
  { practice: true, payments: false, paywall: false },
  { practice: false, payments: true, paywall: true },
];

function checkStudentItems(snSrc) {
  const why = [];
  const SN = loadSn(snSrc);
  const L = loadTs(LB_REL);
  const on = SN.studentItems(L.NAV_EN, FLAGS[0]).map((i) => i.key).join(',');
  const off = SN.studentItems(L.NAV_EN, FLAGS[1]).map((i) => i.key).join(',');
  if (on !== 'home,practice,mocks,currentAffairs,mistakeVault' || off !== 'home,mocks,currentAffairs,mistakeVault') why.push(`items: ${on} | ${off}`);
  const resultsPage = ['app/(site)/results/page.tsx', 'app/(site)/mock-tests/results/page.tsx'].some((p) => fs.existsSync(path.join(ROOT, p)));
  if (!resultsPage && (SN.RESULTS_ROUTE !== null || /results/.test(on + off))) why.push('Results shown although no results list page exists');
  const learnIndex = fs.existsSync(path.join(ROOT, 'app/(site)/learn/page.tsx'));
  if (!learnIndex && /learn/.test(on + off)) why.push('Learn shown although no Learn index exists');
  const links = new Set();
  for (const f of FLAGS) {
    SN.studentItems(L.NAV_EN, f).forEach((i) => links.add(i.href));
    const b = SN.bottomItems(L.NAV_EN, f);
    [...b.left, ...b.right].forEach((i) => links.add(i.href));
    links.add(b.centre.href);
    SN.accountLinks(L.NAV_EN, { name: 'X', isStaff: true, profile: true, studyPreferences: true }, f, 'Study preferences', true).forEach((l) => links.add(l.href));
  }
  links.add('/help');
  const bad = [...links].filter((h) => !routeExists(h));
  if (bad.length) why.push(`student links without a route: ${bad.join(', ')}`);
  return { why, n: links.size };
}

function checkExamFocus(app, snSrc) {
  const why = [];
  const SN = loadSn(snSrc);
  for (const p of ['/mock-tests/abc/take', '/live-tests/x-1/take', '/mock-tests/abc/take/']) if (!SN.isExamFocus(p)) why.push(`not exam focus: ${p}`);
  for (const p of ['/mock-tests', '/mock-tests/abc', '/mock-tests/abc/result', '/mock-tests/abc/leaderboard', '/live-tests/x-1/result', '/live-tests/x-1/submitted', '/dashboard']) if (SN.isExamFocus(p)) why.push(`exam focus on a non-attempt page: ${p}`);
  const i = app.indexOf('  if (isExamFocus(pathname)) {');
  const branch = i >= 0 ? app.slice(i, app.indexOf('\n  }\n', i)) : '';
  if (!branch || !/return \(\s*<main id="main-content"[^>]*data-exam-focus=""/.test(branch) || /<StudentShell|<SignedOutHeader|<SiteFooter|\{footer\}|\{skip\}/.test(branch)) why.push('the exam-focus branch must render only <main> (no header, sidebar, bottom bar or footer)');
  if (i < 0 || i > app.indexOf('<StudentShell') || i > app.indexOf('<SignedOutHeader pathname')) why.push('exam focus must be decided before any navigation renders');
  return why;
}

function checkBySession(app, pub = SRC.pub) {
  const why = [];
  if (!/if \(account && !pathname\.startsWith\("\/admin"\)\) \{\s*return \(\s*<>\s*\{skip\}\s*<StudentShell/.test(app)) why.push('a signed-in user must get THE student shell on every per-request page (admin excepted)');
  if (!/\{!account && !pathname\.startsWith\("\/admin"\) && <SignedOutHeader pathname=\{pathname\} \/>\}/.test(app)) why.push('no session → THE visitor header');
  if (/<StudentShell\b|getUser\(|cookies\(\)/.test(code(pub))) why.push('the cached public shell must not render the student shell or read the session');
  return why;
}

function checkProChip(ss, policy, app) {
  const why = [];
  if (!/\{it\.key === "mistakeVault" && <ProChip paywall=\{paywall\} \/>\}/.test(ss) || !/return \(await paywall\) \? <span className="cl-ss__pro" data-pro-chip="">PRO<\/span> : null;/.test(ss)) why.push('the PRO chip must show only on Mistake Vault and only when the switch is on');
  if (!/export function paywallOnForNav\(ms = 800\): Promise<boolean> \{/.test(policy) || !/cachedPaywall\(\)\.then\(\(s\) => s === "on", \(\) => false\)/.test(policy) || !/new Promise<boolean>\(\(resolve\) => setTimeout\(\(\) => resolve\(false\), ms\)\),/.test(policy)) why.push('the switch read must be the cached one, bounded, never rejecting, false when unknown');
  if (!/paywall=\{paywallOnForNav\(\)\}/.test(app) || /await paywallOnForNav/.test(app)) why.push('AppShell must stream the switch (never awaited)');
  return why;
}

function checkAccountMenu(snSrc, ss = SRC.ss) {
  const why = [];
  const SN = loadSn(snSrc);
  const L = loadTs(LB_REL);
  const keys = (a, f, sheet) => SN.accountLinks(L.NAV_EN, a, f, 'Study preferences', sheet).map((l) => l.key).join(',');
  const student = { name: 'Asha Verma', isStaff: false, profile: false, studyPreferences: false };
  const staff = { name: 'Admin', isStaff: true, profile: true, studyPreferences: true };
  if (keys(student, FLAGS[0], false) !== 'help') why.push(`student, flags off, payments off: ${keys(student, FLAGS[0], false)}`);
  if (keys(staff, FLAGS[1], false) !== 'profile,studyPreferences,help,billing,admin') why.push(`staff, flags on, payments on: ${keys(staff, FLAGS[1], false)}`);
  if (keys(student, FLAGS[0], true) !== 'mistakeVault,help') why.push(`sheet adds Mistake Vault: ${keys(student, FLAGS[0], true)}`);
  if (!/import \{ logoutAction \} from "@\/app\/\(site\)\/auth\/actions";/.test(ss) || !/<form action=\{logoutAction\} className="cl-ss__outf">\s*<button type="submit" className="cl-ss__out" data-sign-out="">/.test(ss)) why.push('Sign out must be the existing sign-out form (logoutAction), unchanged');
  if (!/data-lang-choice="en"/.test(ss) || !/data-lang-choice="hi"/.test(ss) || !/\{t\.languageNote\}/.test(ss)) why.push('Language EN | हिंदी with the "Hindi where available" note');
  if (/\/notifications|aria-label="Notifications"/.test(ss + (snSrc || SRC.sn))) why.push('a notifications bell / link (notifications do not exist yet)');
  return why;
}

function checkStudentRender(snSrc, ssSrc) {
  const why = [];
  const SN = loadSn(snSrc);
  const stubs = { ...STUBS, '@/app/(site)/auth/actions': { logoutAction: async () => {} }, './student-nav-enhancer': { StudentNavEnhancer: () => null }, './coin-balance': { CoinBalance: () => null }, '@/lib/nav/student-nav': SN };
  const SS = loadTs(SS_REL, ssSrc, stubs);
  const L = loadTs(LB_REL);
  const props = { t: L.NAV_EN, account: { name: 'Asha Verma', isStaff: false, profile: true, studyPreferences: false }, flags: { practice: true, payments: false }, paywall: Promise.resolve(false), pathname: '/mistakes/drill', lessonCoins: false, studyPreferencesLabel: 'Study preferences', footer: React.createElement('footer', null, 'f'), children: React.createElement('h1', null, 'Page') };
  const html = renderToStaticMarkup(React.createElement(SS.StudentShell, props));
  if (count(html, /<aside class="cl-ss__side" aria-label="Student">/g) !== 1 || count(html, /<header class="cl-ss__top"/g) !== 1 || count(html, /<main id="main-content"/g) !== 1 || count(html, /<nav class="cl-ss__bar" aria-label="Student"/g) !== 1) why.push('one sidebar, one top bar, one main, one bottom bar');
  if (count(html, /<h1\b/g) !== 1) why.push(`the shell adds a heading (h1 count ${count(html, /<h1\b/g)})`);
  if (!/<p class="cl-ss__title" data-student-title="">Mistake Vault<\/p>/.test(html)) why.push('the top bar title = the active item (a <p>)');
  if (count(html, /aria-current="page"[^>]*data-student-key="mistakeVault"/g) !== 1 || count(html, /aria-current="page"/g) !== 1) why.push('aria-current on the active sidebar item only');
  const attr = (tag, name) => ((tag || '').match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
  const fabTag = (html.match(/<a\b[^>]*class="cl-ss__fab"[^>]*>/) || [])[0];
  const fab = [null, attr(fabTag, 'href'), (attr(fabTag, 'aria-label') || '').replace(/&#x27;/g, "'")];
  if (fab[1] !== '/mock-tests' || fab[2] !== "Start today's free mock" || !/data-todays-mock=""/.test(fabTag || '') || !/Today&#x27;s mock|Today's mock/.test(html)) why.push(`centre button: ${fab[1]} / ${fab[2]}`);
  const tabs = [...html.matchAll(/<a\b[^>]*class="cl-ss__tab"[^>]*>/g)].map((m) => attr(m[0], 'href')).join(',');
  if (tabs !== '/dashboard,/practice,/mock-tests,/current-affairs') why.push(`bottom bar tabs: ${tabs}`);
  if (!/<summary class="cl-ss__av" aria-label="Account: Asha Verma" data-account-toggle=""><span aria-hidden="true">AV<\/span>/.test(html)) why.push('avatar = the user\'s own initials, labelled');
  const order = html.indexOf('</main>') < html.indexOf('<footer') && html.indexOf('<footer') < html.indexOf('cl-ss__bar');
  if (!order) why.push('the footer sits inside the padded column, before the bottom bar');
  return why;
}

function checkCollapse(src) {
  const why = [];
  if (!/<script dangerouslySetInnerHTML=\{\{ __html: NAV_PREFS_SCRIPT \}\} \/>/.test(src.layout) || src.layout.indexOf('NAV_PREFS_SCRIPT }}') > src.layout.indexOf('</head>')) why.push('the collapse preference must be applied by an inline <head> script (before paint)');
  if (!/localStorage\.getItem\("\$\{SIDEBAR_PREF_KEY\}"\)==="collapsed"\)document\.documentElement\.setAttribute\("data-sidebar","collapsed"\)/.test(src.prefs) || !/^export const NAV_PREFS_SCRIPT = `try\{/m.test(src.prefs)) why.push('pre-paint script: localStorage → <html data-sidebar>, wrapped in try');
  if (!/store\.set\(SIDEBAR_PREF_KEY, collapsed \? "collapsed" : "expanded"\)/.test(src.sEnh)) why.push('the toggle must remember the choice');
  if (!/grid-template-columns: 240px minmax\(0, 1fr\);/.test(src.ssCss) || !/html\[data-sidebar="collapsed"\] \.cl-ss \{\s+grid-template-columns: 72px minmax\(0, 1fr\);/.test(src.ssCss)) why.push('240 / 72 px from the html attribute (no JS layout)');
  why.push(...checkTokens({ ssCss: src.ssCss, ss: src.ss, sn: src.sn, sEnh: src.sEnh }));
  const motionFree = src.ssCss.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, '');
  if (/transition:|animation:/.test(motionFree)) why.push('a student transition outside prefers-reduced-motion: no-preference');
  for (const [sel, rule] of [['.cl-ss__it', /min-height: 48px/], ['.cl-ss__av', /height: 48px/], ['.cl-ss__mi,\n.cl-ss__out', /min-height: 48px/], ['.cl-ss__seg button', /min-height: 48px/]]) {
    const i = src.ssCss.indexOf(`${sel} {`);
    if (i < 0 || !rule.test(src.ssCss.slice(i, src.ssCss.indexOf('}', i)))) why.push(`${sel}: 48 px target`);
  }
  if (!/import "\.\/nav-student\.css";/.test(src.layout)) why.push('nav-student.css not loaded');
  return why;
}

/** N-11: the header never waits on a read (AUTH1-RESILIENCE-HANG): bounded, never-rejecting, streamed inside the header. */
function checkStreaming(app, live = SRC.live, vh = SRC.vh) {
  const why = [];
  if (!app.includes('categories={loadNavLive().then((live) => navCategories(t, live))}') || /await loadLandingLiveData|await loadNavLive/.test(code(app))) why.push('AppShell must pass the categories as a promise (never awaited)');
  if (/<Suspense[^>]*>\s*<SignedOutHeader/.test(app)) why.push('the whole header is streamed (a hidden second header in the HTML)');
  if (!live.includes('new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),') || !live.includes('loadLandingLiveData().catch(() => null),') || !/NAV_LIVE_TIMEOUT_MS = 800;/.test(live)) why.push('the category read is not bounded (≤ 800 ms, never rejects)');
  if (!/<Suspense fallback=\{render\(fallback\)\}>/.test(vh) || !/const fallbackCategories = navCategories\(t, null\);/.test(vh)) why.push('the tiles must stream with a no-link fallback');
  return why;
}
const LIVE = { categories: { ssc: true, banking: false, railway: false }, liveShortNames: { ssc: ['CGL'] }, moreComing: { ssc: true } };

function render(over = {}, { vhSrc, vnSrc } = {}) {
  const VN = loadTs(VN_REL, vnSrc);
  const L = loadTs(LB_REL);
  const VH = loadTs(VH_REL, vhSrc, { ...STUBS, '@/lib/nav/visitor-nav': VN });
  const t = over.lang === 'hi' ? L.NAV_HI : L.NAV_EN;
  const props = { t, homeHref: over.lang === 'hi' ? '/hi' : '/', langSwitch: false, categories: VN.navCategories(t, 'live' in over ? over.live : LIVE), start: VN.startAction(t, over.signupOpen ?? true), auth: 'hint', ...over.props };
  return renderToStaticMarkup(React.createElement(VH.VisitorHeader, props));
}
const count = (html, re) => (html.match(re) || []).length;
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*?\shref="([^"]+)"/g)].map((m) => m[1]);

// does an app route serve this path? (static segments, [param], [...rest]; route groups ignored)
const ROUTES = (() => {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (e.name === 'page.tsx') out.push((dir.replace(/^app/, '').replace(/\/\([^)]*\)/g, '') || '/').split('/').filter(Boolean));
    }
  };
  walk('app');
  return out;
})();
function routeExists(p) {
  const seg = p.split(/[?#]/)[0].split('/').filter(Boolean);
  return ROUTES.some((r) => {
    for (let i = 0; i < r.length; i++) {
      if (/^\[\.\.\./.test(r[i])) return seg.length > i;
      if (seg[i] === undefined) return false;
      if (!/^\[/.test(r[i]) && r[i] !== seg[i]) return false;
    }
    return r.length === seg.length;
  });
}

function checkOneHeader(src) {
  const why = [];
  if (!/<VisitorHeader\s/.test(src.landing) || !/<VisitorHeader t=\{NAV_EN\}/.test(src.pub) || !/<VisitorHeader\s/.test(src.app)) why.push('a public surface does not render THE visitor header (landing / cached shell / signed-out session shell)');
  if (/<header\b/.test(code(src.landing)) || /className="lp-hd"|lp-menu|lp-burger/.test(src.landing + src.landingCss)) why.push('the landing still renders its own header');
  if (/<HeaderBar\b/.test(src.pub)) why.push('the cached public shell renders a second header (HeaderBar)');
  if (/<HeaderBar\b|<BottomNav\b|<PublicStudentNav\b/.test(src.app + src.pub + src.landing)) why.push('an old header / bottom nav is rendered');
  if (src.removed.length) why.push(`dead nav code left: ${src.removed.join(', ')}`);
  if (/export const PUBLIC_NAV/.test(src.cfg)) why.push('PUBLIC_NAV still exported (dead)');
  if (!/import "\.\/nav\.css";/.test(src.layout)) why.push('nav.css not loaded');
  const html = render();
  if (count(html, /<header\b/g) !== 1 || !/data-visitor-header=""/.test(html)) why.push('the header must render exactly one <header>');
  return why;
}

function checkLanguageSwitch(src, vn) {
  const why = [];
  const VN = loadTs(VN_REL, vn);
  if (!VN.showsLanguageSwitch('/') || !VN.showsLanguageSwitch('/hi') || VN.showsLanguageSwitch('/exams') || VN.showsLanguageSwitch('/hi/learn/x') || VN.showsLanguageSwitch('/current-affairs')) why.push('showsLanguageSwitch: "/" and "/hi" only');
  if (!/<VisitorHeader[\s\S]*?langSwitch\s/.test(src.landing)) why.push('the landing has no language switch');
  if (!/langSwitch=\{false\}/.test(src.pub) || !/langSwitch=\{false\}/.test(src.app) || /langSwitch(\s|=\{true\})/.test(src.pub.replace('langSwitch={false}', '')) || /langSwitch(\s|=\{true\})/.test(src.app.replace('langSwitch={false}', ''))) why.push('a non-landing page renders the language switch (e.g. /exams)');
  const on = render({ props: { langSwitch: true } });
  const off = render();
  if (count(on, /data-lang-switch=""/g) !== 2 || !/href="\/hi" hrefLang="hi" lang="hi"/.test(on) || count(off, /data-lang-switch=""/g) !== 0) why.push('switch markup (bar + menu when on, none when off)');
  return why;
}

function checkCategories(vhSrc, vnSrc) {
  const why = [];
  const html = render({}, { vhSrc, vnSrc });
  const mega = html.slice(html.indexOf('data-exams-panel'), html.indexOf('</div>', html.indexOf('cl-vh__all')));
  if (!/<a class="cl-vh__cat" href="\/exams\/ssc" data-exams-item="">[\s\S]*?<small>CGL live · more coming<\/small>/.test(mega)) why.push('the live category is not a link with its live status');
  const soon = [...html.matchAll(/data-category-soon=""/g)].length;
  if (soon !== 12) why.push(`"Coming soon" tiles: ${soon} (6 in the menu + 6 in the drawer expected)`);
  for (const slug of ['banking', 'railway', 'police', 'defence', 'teaching', 'state-psc']) if (hrefs(html).includes(`/exams/${slug}`)) why.push(`a Coming soon category is a link: /exams/${slug}`);
  if (!/<span class="cl-vh__cat cl-vh__cat--soon" data-category-soon="">[\s\S]*?<small>Coming soon<\/small>/.test(html)) why.push('Coming soon tile markup');
  const failedRead = render({ live: null }, { vhSrc, vnSrc });
  if (hrefs(failedRead).some((h) => /^\/exams\/[a-z]/.test(h))) why.push('a failed read still links a category');
  const hi = render({ lang: 'hi' }, { vhSrc, vnSrc });
  if (!/CGL उपलब्ध · और जल्द/.test(hi) || !/जल्द आ रहा है/.test(hi) || !/अपनी परीक्षा चुनें/.test(hi)) why.push('Hindi menu labels');
  return why;
}

function checkLinks(vnSrc) {
  const why = [];
  const VN = loadTs(VN_REL, vnSrc);
  const html = render({}, { vnSrc });
  const learnIndex = fs.existsSync(path.join(ROOT, 'app/(site)/learn/page.tsx')) || fs.existsSync(path.join(ROOT, 'app/(public)/learn/page.tsx'));
  if (VN.LEARN_INDEX_READY !== learnIndex) why.push(`LEARN_INDEX_READY (${VN.LEARN_INDEX_READY}) ≠ a Learn index route exists (${learnIndex})`);
  if (!learnIndex && hrefs(html).some((h) => h === '/learn')) why.push('Learn shown although no Learn index exists');
  const order = [...html.matchAll(/data-nav-key="([a-zA-Z]+)"/g)].map((m) => m[1]).join(',');
  if (order !== 'exams,currentAffairs,mockTests') why.push(`desktop links: ${order}`);
  const bad = [...new Set(hrefs(html))].filter((h) => h.startsWith('/') && !routeExists(h));
  if (bad.length) why.push(`header links without a route (404): ${bad.join(', ')}`);
  return { why, n: new Set(hrefs(html)).size };
}

function checkAuthStates(vnSrc) {
  const why = [];
  const hint = render({}, { vnSrc });
  if (count(hint, /class="auth-out cl-vh__auth"/g) !== 1 || count(hint, /class="auth-in cl-vh__auth"/g) !== 1 || count(hint, /class="auth-in cl-vh__compact"/g) !== 1 || count(hint, /class="auth-in cl-vh__ctas"/g) !== 1) why.push('hint mode: both link sets (bar, compact, menu)');
  if (count(hint, />Go to dashboard</g) !== 3 || !hrefs(hint).includes('/dashboard')) why.push('hint mode: Go to dashboard ×3');
  const out = render({ props: { auth: 'out' } }, { vnSrc });
  if (/auth-in|auth-out|Go to dashboard|\/dashboard/.test(out)) why.push('a known signed-out page renders the signed-in set');
  const closed = render({ signupOpen: false }, { vnSrc });
  if (hrefs(closed).includes('/auth/signup') || count(closed, />Explore exams</g) !== 3) why.push('sign-up closed: Explore exams ×3, no /auth/signup');
  const open = render({ signupOpen: true }, { vnSrc });
  if (count(open, /href="\/auth\/signup"/g) !== 3 || count(open, />Start free</g) !== 3) why.push('sign-up open: Start free → /auth/signup ×3');
  return why;
}

function checkNoJs(src) {
  const why = [];
  const html = render({}, { vhSrc: src.vh });
  if (!/<a class="cl-vh__link" href="\/exams" data-nav-key="exams" data-exams-trigger=""/.test(html) || / aria-haspopup=/.test(html)) why.push('Exams must be a plain link to /exams in the HTML (aria-haspopup added only by the enhancer)');
  if (!/<details class="cl-vh__drawer" data-nav-drawer=""><summary class="cl-vh__burger"/.test(html) || !/<details class="cl-vh__acc"><summary class="cl-vh__item">/.test(html)) why.push('phone menu / exam list are not native <details>');
  if (!/data-exams-panel="" hidden=""/.test(html)) why.push('the Exams panel must start hidden');
  if (/"use client"/.test(src.vh) || /from "next\/headers"|cookies\(|headers\(/.test(code(src.vh) + code(src.vn))) why.push('the visitor header must be a server component with no cookie / header read');
  if (!/^"use client";/.test(src.enh) || src.enh.length > 9000) why.push(`the enhancer must be the one small client file (${src.enh.length} chars)`);
  if (!/aria-haspopup", "true"/.test(src.enh) || !/e\.key === "Escape"/.test(src.enh) || !/ArrowDown/.test(src.enh) || !/e\.key === "Tab"/.test(src.enh) || !/INTENT_MS = 150/.test(src.enh)) why.push('enhancer: haspopup / Esc / arrows / focus trap / 150 ms intent');
  return why;
}

function checkTokens(files) {
  const why = [];
  for (const [name, s] of Object.entries(files)) {
    const c = code(s);
    const lit = c.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|(?<![-\w])(?:white|black)\b(?=\s*[;,)])/g);
    if (lit) why.push(`${name}: colour literal ${lit.slice(0, 3).join(' ')}`);
    if (/className="[^"]*\b(?:bg|text|border)-(?:primary|slate|gray|blue|white|black)-?\d*/.test(c)) why.push(`${name}: a non cl-* colour utility`);
  }
  return why;
}

function checkLabels(L) {
  const why = [];
  const en = Object.keys(L.NAV_EN).sort().join();
  const hi = Object.keys(L.NAV_HI).sort().join();
  if (en !== hi) why.push('EN / HI label keys differ');
  for (const [k, v] of [...Object.entries(L.NAV_EN), ...Object.entries(L.NAV_HI)]) if (typeof v !== 'string' || !v.trim()) why.push(`empty label ${k}`);
  const spec = { exams: ['Exams', 'परीक्षाएँ'], currentAffairs: ['Current Affairs', 'करेंट अफेयर्स'], mockTests: ['Mock Tests', 'मॉक टेस्ट'], learn: ['Learn', 'पढ़ाई'], signIn: ['Sign in', 'साइन इन'], startFree: ['Start free', 'मुफ़्त शुरू करें'], goToDashboard: ['Go to dashboard', 'डैशबोर्ड पर जाएँ'], exploreExams: ['Explore exams', 'परीक्षाएँ देखें'], chooseExam: ['Choose your exam', 'अपनी परीक्षा चुनें'], allExams: ['All exams →', 'सभी परीक्षाएँ →'], comingSoon: ['Coming soon', 'जल्द आ रहा है'], home: ['Home', 'होम'], practice: ['Practice', 'प्रैक्टिस'], mocks: ['Mocks', 'मॉक'], results: ['Results', 'परिणाम'], mistakeVault: ['Mistake Vault', 'मिस्टेक वॉल्ट'], todaysMock: ["Today's mock", 'आज का मॉक'], myResults: ['My results', 'मेरे परिणाम'], profile: ['Profile', 'प्रोफ़ाइल'], language: ['Language', 'भाषा'], help: ['Help', 'मदद'], signOut: ['Sign out', 'साइन आउट'], collapse: ['Collapse', 'छोटा करें'], menu: ['Menu', 'मेनू'] };
  for (const [k, [e, h]] of Object.entries(spec)) if (L.NAV_EN[k] !== e || L.NAV_HI[k] !== h) why.push(`spec §6 label ${k}: ${L.NAV_EN[k]} / ${L.NAV_HI[k]}`);
  return { why, n: Object.keys(spec).length };
}

function checkA11y(src) {
  const why = [];
  const html = render();
  if (!/<nav class="cl-vh__nav" aria-label="Main">/.test(html) || !/<nav aria-label="Menu" class="cl-vh__panel-nav">/.test(html) || !/role="dialog" aria-label="Menu"/.test(html)) why.push('labelled nav landmarks / drawer');
  if (!/aria-label="Courage Library"/.test(html) || !/alt="Courage Library"/.test(html) || !/width="141" height="30"/.test(html)) why.push('logo link label / alt / size (no layout shift)');
  const css = src.css;
  for (const [sel, rule] of [['.cl-vh__link', /min-height: 48px/], ['.cl-vh__signin', /min-height: 48px/], ['.cl-vh__burger', /height: 48px/], ['.cl-vh__item', /min-height: 48px/], ['.cl-vh__lang a', /min-width: 48px/], ['.cl-vh__all', /min-height: 48px/]]) {
    const i = css.indexOf(`${sel} {`);
    if (i < 0 || !rule.test(css.slice(i, css.indexOf('}', i)))) why.push(`${sel}: 48 px target`);
  }
  if (!/outline: 2px solid var\(--color-cl-blue\);/.test(css)) why.push('focus ring 2 px cl-blue');
  const motionFree = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, '');
  if (/transition:|animation:/.test(motionFree)) why.push('a transition / animation outside prefers-reduced-motion: no-preference');
  if (!/@media \(max-width: 899\.98px\)/.test(css) || !/height: 66px;/.test(css) || !/height: 60px;/.test(css)) why.push('900 px breakpoint, 66 / 60 px bar');
  if (!/html\.lite \.cl-vh \{[\s\S]*?background: var\(--color-cl-white\);/.test(css)) why.push('lite mode: solid header');
  return why;
}

(async () => {
  await test('N-1 one visitor header for every public page; the old landing header, PUBLIC_NAV and HeaderBar visitor code are gone', () => {
    const why = checkOneHeader(SRC);
    assert(why.length === 0, why.join('; '));
  });
  await test('N-2 the EN | हिंदी switch only on "/" and "/hi"', () => {
    const why = checkLanguageSwitch(SRC);
    assert(why.length === 0, why.join('; '));
  });
  await test('N-3 Exams menu from live data: live → link + status; Coming soon → not a link; failed read → no link; Hindi', () => {
    const why = checkCategories();
    assert(why.length === 0, why.join('; '));
  });
  await test('N-4 Learn only with a Learn index route; link order; every header link resolves to a route', () => {
    const { why, n } = checkLinks();
    assert(why.length === 0, why.join('; '));
    return `${n} distinct links resolve`;
  });
  await test('N-5 signed-in hint (Go to dashboard), known signed-out set, sign-up closed → Explore exams (X-01)', () => {
    const why = checkAuthStates();
    assert(why.length === 0, why.join('; '));
  });
  await test('N-6 no JavaScript works (links + native <details>); server component, no cookie / header read; one small enhancer', () => {
    const why = checkNoJs(SRC);
    assert(why.length === 0, why.join('; '));
  });
  await test('N-7 cl-* tokens only — no colour literal in the nav code and styles', () => {
    const why = checkTokens({ vh: SRC.vh, vn: SRC.vn, enh: SRC.enh, css: SRC.css });
    assert(why.length === 0, why.join('; '));
  });
  await test('N-8 typed EN / HI labels: same keys, none empty, spec §6 wording', () => {
    const { why, n } = checkLabels(loadTs(LB_REL));
    assert(why.length === 0, why.join('; '));
    return `${n} spec labels × 2 languages`;
  });
  await test('N-9 a11y + motion: labelled landmarks, 48 px targets, focus ring, reduced motion, lite mode, bar sizes', () => {
    const why = checkA11y(SRC);
    assert(why.length === 0, why.join('; '));
  });

  await test('N-11 the header never waits on a read: bounded (≤ 800 ms) category read, only the tiles stream', () => {
    const why = checkStreaming(SRC.app);
    assert(why.length === 0, why.join('; '));
  });

  // ---------------------------------------------------------------- Stage B — the student shell + exam focus
  await test('N-12 student items: Home, Practice (flag), Mocks, Current Affairs, Mistake Vault; Results / Learn hidden while their pages do not exist; every link routed', () => {
    const { why, n } = checkStudentItems();
    assert(why.length === 0, why.join('; '));
    return `${n} distinct student links resolve`;
  });
  await test('N-13 exam focus: a live attempt renders no visitor header, sidebar, bottom bar or footer; results show the nav again', () => {
    const why = checkExamFocus(SRC.app);
    assert(why.length === 0, why.join('; '));
  });
  await test('N-14 navigation by session: signed in → THE student shell on per-request pages (not admin); the cached pages untouched', () => {
    const why = checkBySession(SRC.app);
    assert(why.length === 0, why.join('; '));
  });
  await test('N-15 PRO chip on Mistake Vault only while the paywall master switch is on (bounded read, display only)', () => {
    const why = checkProChip(SRC.ss, SRC.policy, SRC.app);
    assert(why.length === 0, why.join('; '));
  });
  await test('N-16 avatar menu / sheet: Profile, Study preferences, Help, Billing (payments), Admin studio (staff), Language, Sign out (existing flow); no bell', () => {
    const why = checkAccountMenu();
    assert(why.length === 0, why.join('; '));
  });
  await test('N-17 rendered shell: sidebar + top bar + bottom bar with the centre button → Mocks list; landmarks, aria-current, no extra h1, avatar = own initials', () => {
    const why = checkStudentRender();
    assert(why.length === 0, why.join('; '));
  });
  await test('N-18 sidebar collapse remembered client-side, applied before paint (no shift); student styles: cl-* tokens, 48 px, reduced motion', () => {
    const why = checkCollapse(SRC);
    assert(why.length === 0, why.join('; '));
  });

  await test('N-10 negative controls: each broken variant is caught', () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const muts = [
      ['language switch rendered on /exams', () => checkLanguageSwitch({ ...SRC, pub: mut(SRC.pub, 'langSwitch={false}', 'langSwitch') })],
      ['language switch on every page by rule', () => checkLanguageSwitch(SRC, mut(SRC.vn, 'return pathname === "/" || pathname === "/hi";', 'return true;'))],
      ['a Coming soon category rendered as a link', () => checkCategories(mut(SRC.vh, 'return c.href ? (', 'return true ? ('), undefined)],
      ['a Coming soon category linked in the drawer', () => checkCategories(mut(mut(SRC.vh, '{c.href ? (', '{true ? ('), '<a href={c.href}>', '<a href={`/exams/${c.slug}`}>'), undefined)],
      ['the header waits on the category read (no streaming)', () => checkStreaming(mut(SRC.app, 'categories={loadNavLive().then((live) => navCategories(t, live))}', 'categories={navCategories(t, await loadLandingLiveData())}'))],
      ['an unbounded category read', () => checkStreaming(SRC.app, mut(SRC.live, 'new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),', ''))],
      ['a category linked although the read failed', () => checkCategories(undefined, mut(SRC.vn, 'href: isLive ? `/exams/${c.slug}` : null,', 'href: `/exams/${c.slug}`,'))],
      ['a second header on a public route', () => checkOneHeader({ ...SRC, pub: mut(SRC.pub, '<VisitorHeader t={NAV_EN}', '<HeaderBar account={null} flags={flags} />\n      <VisitorHeader t={NAV_EN}') })],
      ['the landing keeps its own header', () => checkOneHeader({ ...SRC, landing: SRC.landing + '\nfunction Old() { return <header className="lp-hd" />; }\n' })],
      ['a removed nav file left behind', () => checkOneHeader({ ...SRC, removed: ['components/shell/header-bar.tsx'] })],
      ['the old header rendered for a student', () => checkOneHeader({ ...SRC, app: SRC.app + '\n<HeaderBar account={account} />\n' })],
      ['Learn shown without a Learn index', () => checkLinks(mut(SRC.vn, 'export const LEARN_INDEX_READY = false;', 'export const LEARN_INDEX_READY = true;')).why],
      ['a header link to a missing route', () => checkLinks(mut(SRC.vn, 'mockTests: "/mock-tests",', 'mockTests: "/mocks-all",')).why],
      ['sign-up closed still links sign-up', () => checkAuthStates(mut(SRC.vn, ': { href: VISITOR_ROUTES.exams, label: t.exploreExams };', ': { href: VISITOR_ROUTES.signUp, label: t.startFree };'))],
      ['Exams needs JavaScript (a button)', () => checkNoJs({ ...SRC, vh: mut(SRC.vh, '<a className="cl-vh__link" href={VISITOR_ROUTES.exams}', '<button className="cl-vh__link" data-href={VISITOR_ROUTES.exams}') })],
      ['the header reads a cookie', () => checkNoJs({ ...SRC, vh: 'import { cookies } from "next/headers";\n' + SRC.vh })],
      ['a colour literal in the nav CSS', () => checkTokens({ css: mut(SRC.css, 'background: var(--color-cl-blue);', 'background: #475bff;') })],
      ['a colour literal in the header', () => checkTokens({ vh: mut(SRC.vh, 'style={{ background: c.swatch }}', 'style={{ background: "rgb(71, 91, 255)" }}') })],
      ['a missing Hindi label', () => checkLabels({ NAV_EN: loadTs(LB_REL).NAV_EN, NAV_HI: { ...loadTs(LB_REL).NAV_HI, help: '' } }).why],
      ['a transition without reduced-motion guard', () => checkA11y({ ...SRC, css: SRC.css + '\n.cl-vh__x { transition: color 1s; }\n' })],
      ['a target under 48 px', () => checkA11y({ ...SRC, css: mut(SRC.css, '.cl-vh__burger {\n  list-style: none;\n  width: 48px;\n  height: 48px;', '.cl-vh__burger {\n  list-style: none;\n  width: 40px;\n  height: 40px;') })],
      // Stage B
      ['site nav rendered on an exam attempt route', () => checkExamFocus(mut(SRC.app, '  if (isExamFocus(pathname)) {', '  if (false && isExamFocus(pathname)) {'))],
      ['a result page treated as an attempt (no nav)', () => checkExamFocus(SRC.app, mut(SRC.sn, '/^\\/mock-tests\\/[^/]+\\/take(?:\\/|$)/', '/^\\/mock-tests\\/[^/]+\\/(?:take|result)(?:\\/|$)/'))],
      ['Learn shown in the student nav without a Learn index', () => checkStudentItems(mut(SRC.sn, 'export function studentItems(t: NavLabels, f: StudentFlags, learnReady: boolean = LEARN_INDEX_READY)', 'export function studentItems(t: NavLabels, f: StudentFlags, learnReady: boolean = true)')).why],
      ['Results shown without a results page', () => checkStudentItems(mut(SRC.sn, 'export const RESULTS_ROUTE: string | null = null;', 'export const RESULTS_ROUTE: string | null = "/results";')).why],
      ['a notifications bell in the top bar', () => checkAccountMenu(SRC.sn, SRC.ss.replace('<CoinBalance enabled={lessonCoins} />', '<CoinBalance enabled={lessonCoins} />\n<a href="/notifications" aria-label="Notifications" />'))],
      ['PRO chip shown with the paywall off', () => checkProChip(mut(SRC.ss, 'return (await paywall) ? <span className="cl-ss__pro"', 'return true ? <span className="cl-ss__pro"'), SRC.policy, SRC.app)],
      ['PRO chip from an unbounded switch read', () => checkProChip(SRC.ss, mut(SRC.policy, '    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),\n', ''), SRC.app)],
      ['Admin studio shown to a student', () => checkAccountMenu(mut(SRC.sn, 'if (a.isStaff) out.push(', 'if (true) out.push('))],
      ['Billing shown with payments off', () => checkAccountMenu(mut(SRC.sn, 'if (f.payments) out.push(', 'if (true) out.push('))],
      ['a new sign-out flow', () => checkAccountMenu(SRC.sn, mut(SRC.ss, '<form action={logoutAction} className="cl-ss__outf">', '<form action="/api/sign-out" className="cl-ss__outf">'))],
      ['the student shell on admin pages', () => checkBySession(mut(SRC.app, 'if (account && !pathname.startsWith("/admin")) {', 'if (account) {'))],
      ['the student shell on the cached pages', () => checkBySession(SRC.app, SRC.pub + '\n<StudentShell />\n')],
      ['the centre button to a guessed mock', () => checkStudentRender(mut(SRC.sn, 'export const TODAYS_MOCK_HREF = "/mock-tests";', 'export const TODAYS_MOCK_HREF = "/mock-tests/today";'))],
      ['a duplicate h1 in the top bar', () => checkStudentRender(undefined, mut(SRC.ss, '<p className="cl-ss__title" data-student-title="">\n              {title}\n            </p>', '<h1 className="cl-ss__title" data-student-title="">\n              {title}\n            </h1>'))],
      ['collapse applied after paint (no pre-paint script)', () => checkCollapse({ ...SRC, layout: SRC.layout.replace('<script dangerouslySetInnerHTML={{ __html: NAV_PREFS_SCRIPT }} />', '') })],
      ['a colour literal in the student CSS', () => checkCollapse({ ...SRC, ssCss: mut(SRC.ssCss, 'background: var(--color-cl-blue-tint);', 'background: #eef0ff;') })],
    ];
    const missed = [];
    for (const [n, f] of muts) {
      let why;
      try { why = f(); } catch (e) { why = /anchor missing/.test(e.message) ? [] : [e.message]; }
      if (!why || !why.length) missed.push(n);
    }
    assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
    return `${muts.length} mutations caught`;
  });

  console.log('NAV-1 gate (Stage A + B)');
  console.log(results.join('\n'));
  console.log(`NAV-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
