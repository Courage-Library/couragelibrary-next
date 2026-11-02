#!/usr/bin/env node
/**
 * UX-IMP-1 (owner-approved IMPECCABLE-1 list) — offline gate for items 1–5 and 8.
 *   I-1 login: every field through <Field> (label ↔ input by id: login-email / login-password), exactly one <h1>, 48 px
 *       fields (h-12) and links (min-h-12), errors / notices announced (<Alert … live>), no legacy Input on the page
 *   I-2 exam hub: orderMocks = free first → full-length → sectional → other → title (natural) → id; total and stable
 *       (every permutation of the fixture gives the same order); mock cards and guide rows ≥ 48 px; breadcrumbs ≥ 48 px
 *   I-3 category intro from live data only: categoryIntro names exactly the listed exams (live as live, listed
 *       coming-soon as coming soon) and nothing else; the page and its metadata never show the admin free text
 *   I-4 the sign-up link follows the setting: login shows "Create an account" only when sign-up is open (else
 *       "Explore exams"); the page reads the setting bounded (1.5 s) and closed on failure
 *   I-5 reveal = progressive enhancement: the reveal CSS never hides (no opacity / visibility / display), transform only,
 *       off with reduced motion / print; the script never marks content hidden
 *   I-8 header: every action link (Sign in, Start free / Explore exams, Go to dashboard; bar and phone menu) carries
 *       aria-current from here(href) and an aria-[current=page] style in the bar
 * --self-test: NEGATIVE CONTROLS — one mutation per item must fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const F = {
  loginForm: 'app/(site)/auth/login/login-form.tsx', loginPage: 'app/(site)/auth/login/page.tsx', examPage: 'lib/exams/exam-page.ts', examHome: 'components/exams/exam-home.tsx',
  crumb: 'components/ui/breadcrumb.tsx', cats: 'lib/exams/categories.ts', catPage: 'components/exams/category-page.tsx', catRoute: 'app/(public)/category/[slug]/page.tsx',
  hubRoute: 'app/(site)/exams/[slug]/page.tsx', css: 'app/globals.css', reveal: 'components/landing/landing-enhancements.tsx', header: 'components/shell/header-bar.tsx',
};

function loadTs(src, stubs = {}) {
  const ts = require('typescript');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  // other project modules are not needed by the pure functions under test: an inert stand-in
  const inert = new Proxy({}, { get: () => () => null });
  new Function('require', 'module', 'exports', out)((id) => (id in stubs ? stubs[id] : id.startsWith('@/') ? inert : require(id)), mod, mod.exports);
  return mod.exports;
}

function check(over = {}) {
  const f = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, k in over ? over[k] : read(p)]));
  const fails = [];
  const fail = (m) => fails.push(m);
  // I-1
  const lf = f.loginForm;
  if (!/<Field id="login-email" label="Email address" required>\s*<Input name="email"[^>]*className="h-12"/.test(lf) || !/<Field id="login-password" label="Password" required>\s*<Input name="password"[^>]*className="h-12"/.test(lf)) fail('I-1 login fields not labelled through <Field> with 48 px inputs');
  if ((lf.match(/<h1\b/g) || []).length !== 1) fail('I-1 login: not exactly one <h1>');
  if (!/<Alert tone="danger" live data-auth-error=/.test(lf) || !/live data-auth-notice=""/.test(lf)) fail('I-1 login errors / notices not announced (Alert live)');
  if (/components\/ui\/legacy\/input|<label className="block text-xs/.test(lf)) fail('I-1 login still uses the legacy input / an unbound label');
  if ((lf.match(/inline-flex min-h-12 items-center/g) || []).length < 3) fail('I-1 login links < 48 px');
  // I-2
  const stubs = { '@/lib/format': { formatDateShort: (d) => d, formatNumber: String }, '@/content/exam-page': { EXAM_PAGE: { guides: { asOf: (d) => `as of ${d}`, groups: {} }, cta: {}, mocks: {} }, NOT_PUBLISHED: '' } };
  let order = null;
  try { order = loadTs(f.examPage, stubs).orderMocks; } catch (e) { fail(`I-2 orderMocks not loadable: ${e.message}`); }
  if (order) {
    const M = (id, title, testType, isFree) => ({ id, title, testType, isFree, questions: null, minutes: null, totalMarks: null });
    const fixture = [M('6', 'Mock 10', 'sectional', true), M('2', 'Mock 2', 'full_length', false), M('1', 'Mock 10', 'full_length', true), M('3', 'Mock 2', 'full_length', true), M('5', 'Quiz', null, true), M('4', 'Mock 2', 'sectional', true)];
    const want = '3,1,4,6,5,2';
    const perms = [fixture, [...fixture].reverse(), [fixture[3], fixture[0], fixture[5], fixture[1], fixture[4], fixture[2]]];
    const got = perms.map((p) => order(p).map((m) => m.id).join());
    if (got.some((g) => g !== want)) fail(`I-2 mock order ${JSON.stringify(got)} (want ${want}: free → full → sectional → other → title natural → id, stable)`);
  }
  if (!/orderMocks\(rows\)/.test(read('lib/exams/exam-page-server.ts'))) fail('I-2 the hub does not use orderMocks');
  if (!/<Card variant="interactive" className="min-h-12 w-full" data-mock-card="">/.test(f.examHome) || !/className="focus-ring flex min-h-12 items-center justify-between[^"]*" data-guide-card="">/.test(f.examHome)) fail('I-2 mock cards / guide rows < 48 px');
  if ((f.crumb.match(/inline-flex min-h-12 items-center/g) || []).length < 2) fail('I-2 breadcrumb links < 48 px');
  // I-3
  let intro = null;
  try { intro = loadTs(f.cats, { '@/lib/text/and-list': loadTs(read('lib/text/and-list.ts')) }).categoryIntro; } catch (e) { fail(`I-3 categoryIntro not loadable: ${e.message}`); }
  if (intro) {
    const ex = [{ slug: 'ssc-cgl', title: 'SSC CGL', status: 'ACTIVE' }, { slug: 'ssc-chsl', title: 'SSC CHSL', status: 'COMING_SOON' }, { slug: 'ssc-mts', title: 'SSC MTS', status: 'COMING_SOON' }];
    const t = intro('SSC', ex);
    const named = ['SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD'].filter((n) => (t || '').includes(n));
    if (!t || named.join() !== 'SSC CGL,SSC CHSL,SSC MTS' || !/Coming soon: SSC CHSL & SSC MTS\./.test(t) || intro('SSC', []) !== null) fail(`I-3 categoryIntro: ${JSON.stringify(t)}`);
  }
  if (/category\.shortDesc/.test(f.catPage) || !/categoryIntro\(category\.name, exams\)/.test(f.catPage)) fail('I-3 the category page shows the admin free text');
  for (const k of ['catRoute', 'hubRoute']) if (!/description: \(!cat\.examsFailed && categoryIntro\(cat\.category\.name, cat\.exams\)\)/.test(f[k]) || /description: cat\.category\.shortDesc/.test(f[k])) fail(`I-3 ${F[k]} metadata uses the admin free text`);
  // I-4
  if (!/\{signupOpen \? \(/.test(lf) || !/href="\/auth\/signup"/.test(lf.slice(lf.indexOf('{signupOpen ? ('), lf.indexOf(') : ('))) || /href="\/auth\/signup"/.test(lf.slice(lf.indexOf(') : ('))) || !/href="\/exams"/.test(lf.slice(lf.indexOf(') : (')))) fail('I-4 login links to sign-up regardless of the setting');
  if (!/getSignupAvailability\(\)\.then\(\(a\) => a !== "closed", \(\) => false\)/.test(f.loginPage) || !/setTimeout\(\(\) => ok\(false\), 1500\)/.test(f.loginPage) || !/signupOpen=\{open\}/.test(f.loginPage)) fail('I-4 the login page does not pass a bounded, closed-on-failure sign-up setting');
  // I-5
  const css = f.css;
  const block = css.slice(css.indexOf('@keyframes reveal-rise'), css.indexOf('/* PERF-HOME-1: the cached public pages carry both link sets'));
  if (!block || /opacity|visibility|display:\s*none/.test(block) || /data-reveal-pending/.test(css) || !/@media \(prefers-reduced-motion: reduce\), print/.test(block)) fail('I-5 the reveal CSS can hide content / ignores reduced motion');
  if (/data-reveal-pending|style\.opacity|\.hidden\s*=\s*true/.test(f.reveal)) fail('I-5 the reveal script marks content hidden');
  // I-8
  const h = f.header;
  if (!/const here = \(href: string\): "page" \| undefined => \(pathname === \(href\.split\(\/\[\?#\]\/\)\[0\] \|\| "\/"\) \? "page" : undefined\);/.test(h)) fail('I-8 header: no here() helper');
  const actions = h.match(/<(?:PillLink|ButtonLink) href=(?:"\/auth\/login"|"\/auth\/signup"|"\/dashboard"|\{LANDING_HERO\.secondaryCta\.href\})[^>]*>/g) || [];
  const missing = actions.filter((t) => !/aria-current=\{here\(/.test(t));
  if (actions.length < 10 || missing.length) fail(`I-8 header actions without aria-current: ${missing.length} of ${actions.length}`);
  if ((h.match(/aria-\[current=page\]:/g) || []).length < 8) fail('I-8 header: no active style for the current-page action');
  return fails;
}

if (process.argv.includes('--self-test')) {
  const r = (k) => read(F[k]);
  const controls = [
    ['login password label unbound', { loginForm: r('loginForm').replace('<Field id="login-password" label="Password" required>', '<Field id="login-pw" label="Password" required>') }, /I-1 login fields/],
    ['login with two h1', { loginForm: r('loginForm').replace('</h1>', '</h1><h1>x</h1>') }, /I-1 login: not exactly one/],
    ['mocks not free-first', { examPage: r('examPage').replace('Number(b.isFree) - Number(a.isFree) ||', '') }, /I-2 mock order/],
    ['category page shows admin text', { catPage: r('catPage').replace('{intro && (', '{category.shortDesc && (') }, /I-3 the category page/],
    ['login always links to sign-up', { loginForm: r('loginForm').replace('<Link href="/exams" className', '<Link href="/auth/signup" className') }, /I-4 login links/],
    ['reveal CSS hides', { css: r('css').replace('    from {\n      transform: translateY(12px);', '    from {\n      opacity: 0;\n      transform: translateY(12px);') }, /I-5 the reveal CSS/],
    ['a header action without aria-current', { header: r('header').replace(' aria-current={here("/auth/login")}', '') }, /I-8 header actions without aria-current/],
  ];
  let bad = 0;
  for (const [n, over, want] of controls) {
    const f = check(over);
    const caught = f.some((x) => want.test(x));
    if (!caught) bad++;
    console.log(`${caught ? 'OK  ' : 'MISS'} negative control: ${n}${caught ? '' : ' — ' + JSON.stringify(f).slice(0, 300)}`);
  }
  console.log(bad ? 'UX-IMP-1 self-test: FAILED' : 'UX-IMP-1 self-test: all negative controls caught');
  process.exit(bad ? 1 : 0);
}

const fails = check();
for (const x of fails) console.log('FAIL ' + x);
console.log(fails.length ? `UX-IMP-1 offline: ${fails.length} FAILURES` : 'UX-IMP-1 offline: ALL PASS (login a11y, hub order + targets, category intro, sign-up link, reveal never hides, header current page)');
process.exit(fails.length ? 1 : 0);
