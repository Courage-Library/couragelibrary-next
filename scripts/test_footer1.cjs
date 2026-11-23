#!/usr/bin/env node
/**
 * FOOTER-1 gate (owner spec docs/design/FOOTER_V1_SPEC.md + decisions 23 Nov 2026) — offline, no network, no DB.
 *   F-1 page groups: the landing, the cached public shell and the per-request visitor pages render THE PublicFooter;
 *       signed-in student pages THE StudentFooter; a live attempt (exam focus) and admin no footer; no other <footer>
 *       in app / components; the old navy SiteFooter and the landing's inline footer are gone; each footer renders ONE
 *       <footer> landmark
 *   F-2 config: unset e-mail / socials → not rendered; never a placeholder ("[contact", "example.com", href="#"); a
 *       placeholder value in the config is refused; the account / owner address is never in the footer code; the library
 *       line links /about#started and that anchor exists on /about
 *   F-3 only real routes: every footer href resolves to an existing app route; not-ready items are text, not links
 *       (Daily free mock, Learn, Partner Schools left out)
 *   F-4 sign-up band: never on / and /hi or auth pages; "Start free" → /auth/signup when sign-up is open, "Explore
 *       exams" → /exams when closed; hidden for a signed-in visitor (cached pages: the data-auth hint; per-request pages:
 *       a student never gets the public footer)
 *   F-5 language: the EN | हिंदी switch only on / and /hi (THE header switch); Hindi copy only on /hi (same keys)
 *   F-6 links: external links rel="noopener noreferrer" + target _blank + aria-label; no emoji in any render
 *   F-7 payment-gateway compliance (owner decision 6): the public footer ALWAYS links Privacy, Terms, Refund, Shipping
 *       and Contact (whatever the category data, language or band)
 *   F-8 trust line: "© year Courage Library · Registered MSME (Udyam)" always; Razorpay only while payments are on; the
 *       not-affiliated line in EN and HI
 *   F-9 student slim line: Help · Privacy · Terms · Refunds (+ Contact on desktop); 48 px rows on phones (R10); tokens only
 *   F-10 negative controls: each broken variant is caught
 *   F-11 the band never waits on a DB / auth / settings read (R-6 follow-up): a value, no Suspense, no reads
 * Run: node scripts/test_footer1.cjs
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
  'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...p }) => React.createElement('a', { href: String(href), ...p }, children) },
};
function loadTs(rel, overrides = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(overrides[rel] ?? read(rel), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(STUBS, id)) return STUBS[id];
    let t = null;
    if (id.startsWith('@/')) t = id.slice(2);
    else if (id.startsWith('./') || id.startsWith('../')) t = path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
    if (t !== null) {
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, overrides);
    }
    return require(id);
  };
  m._compile(js, file);
  return m.exports;
}

const PF = 'components/footer/public-footer.tsx';
const SF = 'components/footer/student-footer.tsx';
const CFG = 'lib/site/footer-config.ts';
const LINKS = 'lib/site/footer-links.ts';
const COPY = 'content/footer.ts';
const SRC = {
  pf: read(PF),
  sf: read(SF),
  cfg: read(CFG),
  links: read(LINKS),
  copy: read(COPY),
  app: read('components/shell/app-shell.tsx'),
  pub: read('components/shell/public-shell.tsx'),
  landing: read('components/landing-v1/landing-page.tsx'),
  css: read('app/footer.css'),
  navcss: read('app/nav-student.css'),
};
const CATS = [
  { slug: 'ssc', name: 'SSC', href: '/exams/ssc' },
  { slug: 'banking', name: 'Banking', href: null },
  { slug: 'railway', name: 'Railways', href: null },
  { slug: 'police', name: 'Police', href: null },
  { slug: 'defence', name: 'Defence', href: null },
  { slug: 'teaching', name: 'Teaching', href: null },
];
function renderPublic(o = {}, overrides = {}) {
  const { PublicFooter } = loadTs(PF, overrides);
  const { FOOTER_EN, FOOTER_HI } = loadTs(COPY, overrides);
  const { navLabels } = loadTs('content/nav/labels.ts', overrides);
  const lang = o.lang ?? 'en';
  return renderToStaticMarkup(
    React.createElement(PublicFooter, {
      t: lang === 'hi' ? FOOTER_HI : FOOTER_EN,
      categories: o.categories ?? CATS,
      band: o.band === undefined ? { open: true, authHint: false } : o.band,
      langSwitch: o.langSwitch ? navLabels(lang) : null,
      paymentsEnabled: o.payments ?? false,
      year: 2026,
    }),
  );
}
const renderStudent = (overrides = {}) => renderToStaticMarkup(React.createElement(loadTs(SF, overrides).StudentFooter, { year: 2026 }));
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

// ---------------------------------------------------------------- route table (app/**/page.tsx, deployed extensions only)
function routePatterns() {
  const out = [];
  (function walk(dir, segs) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'api' || e.name.startsWith('_')) continue;
        walk(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name]);
      } else if (e.name === 'page.tsx' || e.name === 'page.ts') {
        const rx = segs.map((s) => (/^\[\[?\.\.\./.test(s) ? '(?:/.+)?' : /^\[.+\]$/.test(s) ? '/[^/]+' : `/${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)).join('');
        out.push(new RegExp(`^${rx || '/'}$`.replace('^/$', '^/$')));
      }
    }
  })(path.join(ROOT, 'app'), []);
  return out;
}
const ROUTES = routePatterns();
const resolves = (href) => {
  const p = href.split(/[?#]/)[0] || '/';
  return ROUTES.some((r) => r.test(p));
};

// ---------------------------------------------------------------- checks
function checkGroups(src) {
  const app = code(src.app);
  // exam focus: only <main>, no footer
  const focus = app.slice(app.indexOf('if (isExamFocus(pathname)) {'), app.indexOf('const footer ='));
  assert(focus.length > 20 && !/footer|Footer/.test(focus.replace(/data-exam-focus/g, '')), 'exam focus renders a footer');
  assert(/const footer = <StudentFooter \/>;/.test(app) && /footer=\{footer\}/.test(app), 'students do not get THE student footer');
  assert(/const visitorFooter = pathname\.startsWith\("\/admin"\) \? null : \(\s*<PublicFooter/.test(app) && /<\/main>\s*\{visitorFooter\}/.test(app), 'visitors do not get THE public footer (or admin gets one)');
  assert(/<PublicFooter t=\{FOOTER_EN\} categories=\{categories\}/.test(code(src.pub)), 'the cached public shell does not render THE public footer');
  assert(/<PublicFooter\s+t=\{footerCopy\(t\.lang\)\}/.test(code(src.landing)) && !/<footer\b|function Footer\(/.test(code(src.landing)), 'the landing keeps its own footer');
  assert(!fs.existsSync(path.join(ROOT, 'components/shell/site-footer.tsx')) && !/SiteFooter/.test(app + code(src.pub)), 'the old navy SiteFooter is still there');
  // no other <footer> element in app / components
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(p);
      } else if (/\.tsx$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, 'app'));
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, 'components'));
  const others = files.filter((f) => /<footer\b/.test(code(fs.readFileSync(f, 'utf8')))).map((f) => path.relative(ROOT, f).split(path.sep).join('/')).filter((f) => ![PF, SF].includes(f));
  assert(others.length === 0, `other <footer> elements: ${others.join(', ')}`);
  const pf = renderPublic();
  const sf = renderStudent();
  assert((pf.match(/<footer\b/g) || []).length === 1 && (sf.match(/<footer\b/g) || []).length === 1, 'a footer renders more than one <footer> landmark');
  assert(/<nav aria-label="Footer"/.test(pf) && /<nav aria-label="Help and legal"/.test(sf), 'footer navs lack their distinct labels');
  return `${files.length} files · one <footer> each · exam focus + admin none`;
}

const PLACEHOLDER = /\[contact|example\.com|href="#"|placeholder|your-handle|lorem/i;
function checkConfig(overrides = {}) {
  const html = renderPublic({}, overrides);
  assert(!/mailto:/.test(html) && !/data-footer-email/.test(html), 'an unset contact e-mail is rendered');
  assert(!/data-footer-social/.test(html), 'unset socials are rendered');
  assert(!PLACEHOLDER.test(html), `a placeholder in the footer: ${(html.match(PLACEHOLDER) || [])[0]}`);
  const cfg = loadTs(CFG, overrides);
  assert(cfg.FOOTER_CONFIG.contactEmail === null, 'contactEmail must stay null until the owner sets it');
  assert(cfg.footerEmail({ ...cfg.FOOTER_CONFIG, contactEmail: 'hello@example.com' }) === null && cfg.footerSocials({ ...cfg.FOOTER_CONFIG, social: { youtube: 'https://example.com/x', instagram: '#', telegram: 'http://t.me/x' } }).length === 0, 'a placeholder / non-https value is accepted');
  // the account / owner address never appears in footer code
  const all = [SRC.pf, SRC.sf, SRC.cfg, SRC.links, SRC.copy].join('\n');
  assert(!/supportEmail|SHELL_COPY|@couragelibrary\.in/.test(all), 'the footer uses the account / support address');
  // library line
  assert(cfg.FOOTER_CONFIG.libraryPath === '/about#started' && /<PublicSection id="started"/.test(read('app/(site)/about/page.tsx')) && /<h2 id=\{id\}/.test(read('components/public/public-page.tsx')), 'the library path is not /about#started or the anchor is missing');
  assert(/href="\/about#started"[^>]*data-footer-library=""/.test(html), 'library line missing');
  return 'unset → hidden · placeholders refused · library → /about#started';
}

function checkConfigured(overrides = {}) {
  // a configured state (test-only values on an invented test domain, never shipped): socials + e-mail render correctly
  const src = (overrides[CFG] ?? SRC.cfg).replace('contactEmail: null,', 'contactEmail: "team@fixture-domain.test",').replace('youtube: siteConfig.links.youtube,', 'youtube: "https://www.youtube.com/@fixture-channel",');
  const html = renderPublic({}, { ...overrides, [CFG]: src });
  assert(/href="mailto:team@fixture-domain\.test"/.test(html), 'a configured e-mail is not rendered');
  const socials = [...html.matchAll(/<a\b[^>]*data-footer-social|<a\b[^>]*class="cl-ft__soc-a"[^>]*>/g)].map((m) => m[0]);
  assert(socials.length === 1, `configured socials ${socials.length}`);
  for (const a of html.match(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g) || []) {
    assert(/target="_blank"/.test(a) && /rel="noopener noreferrer"/.test(a) && /aria-label="[^"]+"/.test(a), `external link without target / rel / aria-label: ${a.slice(0, 160)}`);
  }
  assert(/aria-label="Courage Library on YouTube \(opens in a new tab\)"/.test(html), 'social aria-label');
  return 'e-mail + one social · rel + target + aria-label';
}

function checkRoutes(overrides = {}) {
  const html = renderPublic({ langSwitch: true }, overrides) + renderPublic({ lang: 'hi', langSwitch: true, band: null }, overrides) + renderStudent(overrides);
  const bad = [...new Set(hrefs(html).filter((h) => h.startsWith('/') && !resolves(h)))];
  assert(bad.length === 0, `footer links to missing routes: ${bad.join(', ')}`);
  // muted items are text
  const soon = html.match(/<span[^>]*data-footer-soon=""[^>]*>[^<]*/g) || [];
  assert(soon.length >= 4 && soon.every((s) => !/<a/.test(s)) && /Banking · soon/.test(html), 'not-ready categories must be muted text');
  assert(!/<a[^>]*>(?:Banking|Railways)</.test(html), 'a not-live category is a link');
  const L = loadTs(LINKS, overrides);
  const cols = L.footerColumns(loadTs(COPY, overrides).FOOTER_EN, CATS, { learnReady: false });
  const labels = cols.flatMap((c) => c.items.map((i) => i.label)).join(' | ');
  assert(!/Daily free mock|Partner Schools|^Learn$|\| Learn\b/.test(labels), `left-out items shown: ${labels}`);
  assert(cols[0].items.length === 6 && cols[0].items[5].href === '/exams', 'Exams column: 5 categories + All exams');
  assert(L.footerColumns(loadTs(COPY, overrides).FOOTER_EN, CATS, { learnReady: true })[1].items.some((i) => i.href === '/learn'), 'Learn does not appear once the index is ready');
  return `${new Set(hrefs(html)).size} hrefs resolve · muted = text`;
}

function checkBand(overrides = {}) {
  const L = loadTs(LINKS, overrides);
  assert(!L.bandAllowed('/') && !L.bandAllowed('/hi') && !L.bandAllowed('/auth/login') && !L.bandAllowed('/auth/signup?x=1') && L.bandAllowed('/exams') && L.bandAllowed('/privacy'), 'band page rule');
  const open = renderPublic({ band: { open: true, authHint: false } }, overrides);
  assert(/href="\/auth\/signup"[^>]*data-footer-start="signup"[^>]*>Start free</.test(open), 'open → Start free /auth/signup');
  const closed = renderPublic({ band: { open: false, authHint: false } }, overrides);
  assert(/href="\/exams"[^>]*data-footer-start="explore"[^>]*>Explore exams</.test(closed) && !/auth\/signup/.test(closed), 'closed → Explore exams /exams');
  const hint = renderPublic({ band: { open: true, authHint: true } }, overrides);
  assert(/<aside class="cl-ft-band auth-out"/.test(hint) && /html\[data-auth="in"\] \.auth-out/.test(read('app/globals.css')), 'signed-in hint does not hide the band on cached pages');
  assert(!/data-footer-band/.test(renderPublic({ band: null }, overrides)), 'band: null still renders');
  // R-6 follow-up (owner): per-request pages pass the safe default (no read); cached pages pass the value they resolved
  assert(/band=\{bandAllowed\(pathname\) \? \{ open: false, authHint: false \} : null\}/.test(code(SRC.app)) && /band=\{null\}/.test(code(SRC.landing)) && /band=\{\{ open: signup, authHint: true \}\}/.test(code(SRC.pub)), 'band wiring');
  return 'open / closed / hint / landing + auth none';
}

/**
 * F-11 (owner, R-6 follow-up): the band NEVER waits on a DB / auth / settings read on a request — `open` is a value (no
 * promise, no Suspense, no async band component); the per-request shell passes a literal; the footer components call
 * no auth / settings / data read themselves; the cached shell's value is read BEFORE rendering (ISR, not per request).
 */
const READ_CALLS = /getSignupAvailability|signupOpen\(|getUser\(|getSession\(|getServerSession|createServerSupabaseClient|createAdminServerSupabaseClient|\.rpc\(|\.from\(/;
function checkNoBlockingBand(src = SRC) {
  const pf = code(src.pf);
  assert(/band: \{ open: boolean; authHint: boolean \} \| null;/.test(pf), 'the band takes a promise (it could wait on a read)');
  assert(!/BandSlot|ResolvedBand/.test(pf) && !/open instanceof Promise/.test(pf), 'a streamed / awaited band slot is back');
  for (const [n, s] of [['public-footer', pf], ['student-footer', code(src.sf)], ['footer-links', code(src.links)], ['footer-config', code(src.cfg)]]) {
    const m = s.match(READ_CALLS);
    assert(!m, `${n} reads auth / settings / data itself (${m && m[0]})`);
  }
  const app = code(src.app);
  const bandArg = (app.match(/<PublicFooter[\s\S]*?band=\{([^\n]*)\}\n/) || [])[1] || '';
  assert(/^bandAllowed\(pathname\) \? \{ open: false, authHint: false \} : null$/.test(bandArg.trim()), `the per-request band reads something: ${bandArg}`);
  const pub = code(src.pub);
  assert(/const \[signup, live\] = await Promise\.all\(\[signupOpen\(\), loadNavLive\(\)\]\);/.test(pub) && /band=\{\{ open: signup, authHint: true \}\}/.test(pub), 'the cached shell does not pass its already-resolved value');
  return 'value only · no Suspense · no reads in the footer · per-request default "Explore exams"';
}

function checkLang(overrides = {}) {
  const L = loadTs(LINKS, overrides);
  assert(L.footerLangFor('/hi') === 'hi' && L.footerLangFor('/') === 'en' && L.footerLangFor('/hi/learn/x') === 'en', 'Hindi only on /hi');
  assert(/langSwitch=\{navLabels\(t\.lang\)\}/.test(code(SRC.landing)) && /langSwitch=\{null\}/.test(code(SRC.app)) && /langSwitch=\{null\}/.test(code(SRC.pub)), 'the switch is not only on the landing (/ and /hi)');
  const hi = renderPublic({ lang: 'hi', langSwitch: true, band: null }, overrides);
  assert(/data-lang-switch=""/.test(hi) && /hrefLang="hi"|hreflang="hi"/i.test(hi), 'THE header switch is not in the /hi footer');
  for (const s of ['परीक्षाएँ', 'तैयारी', 'कंपनी', 'मदद और नियम', 'प्राइवेसी पॉलिसी', 'पंजीकृत MSME (उद्यम)', 'जल्द']) assert(hi.includes(s), `/hi footer misses "${s}"`);
  const { FOOTER_EN, FOOTER_HI } = loadTs(COPY, overrides);
  const keys = (o) => Object.keys(o).sort().join(',');
  assert(keys(FOOTER_EN) === keys(FOOTER_HI) && Object.entries(FOOTER_HI).every(([, v]) => typeof v === 'function' || String(v).length > 0), 'EN / HI keys differ or a Hindi string is empty');
  assert(!/data-lang-switch/.test(renderPublic({}, overrides)), 'switch rendered without langSwitch');
  return 'switch on / and /hi · Hindi copy on /hi';
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
function checkEmoji(htmls) {
  for (const [n, h] of htmls) assert(!EMOJI.test(h), `${n}: emoji in the footer`);
  return `${htmls.length} renders`;
}

function checkCompliance(overrides = {}) {
  const L = loadTs(LINKS, overrides);
  const variants = [
    renderPublic({}, overrides),
    renderPublic({ categories: [] }, overrides),
    renderPublic({ lang: 'hi', band: null, langSwitch: true }, overrides),
    renderPublic({ band: null, payments: true }, overrides),
  ];
  for (const v of variants) {
    const hs = hrefs(v);
    const missing = [...L.COMPLIANCE_ROUTES, '/help'].filter((r) => !hs.includes(r));
    assert(missing.length === 0, `public footer misses compliance links: ${missing.join(', ')}`);
  }
  assert(JSON.stringify([...L.COMPLIANCE_ROUTES]) === JSON.stringify(['/privacy', '/terms', '/refund-policy', '/shipping-policy', '/contact']), 'the compliance set changed');
  return '/privacy /terms /refund-policy /shipping-policy /contact in every variant';
}

function checkTrust(overrides = {}) {
  const off = renderPublic({ payments: false }, overrides);
  const on = renderPublic({ payments: true }, overrides);
  assert(off.includes('© 2026 Courage Library · Registered MSME (Udyam)') && !/Razorpay/.test(off), 'payments off: no Razorpay, © + MSME always');
  assert(on.includes('© 2026 Courage Library · Registered MSME (Udyam) · Secure payments by Razorpay'), 'payments on: Razorpay line');
  assert(/data-not-affiliated=""[^>]*>Courage Library is an independent platform and is not affiliated with any exam conducting body\.</.test(off), 'EN not-affiliated line');
  assert(/data-not-affiliated=""[^>]*>Courage Library एक स्वतंत्र प्लेटफ़ॉर्म है/.test(renderPublic({ lang: 'hi', band: null }, overrides)), 'HI not-affiliated line');
  assert(/paymentsEnabled=\{isPaymentsEnabled\(\)\}/.test(SRC.app) && /paymentsEnabled=\{isPaymentsEnabled\(\)\}/.test(SRC.pub) && /paymentsEnabled=\{isPaymentsEnabled\(\)\}/.test(SRC.landing), 'payments flag not wired');
  return 'MSME always · Razorpay only with payments on · disclaimer EN + HI';
}

function checkStudent(overrides = {}, css = SRC.css) {
  const html = renderStudent(overrides);
  for (const [l, h] of [['Help', '/help'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Refunds', '/refund-policy'], ['Contact', '/contact']]) assert(new RegExp(`href="${h}"[^>]*>${l}<`).test(html), `student line misses ${l}`);
  assert(/© 2026 Courage Library/.test(html) && /<li class="cl-sf__desk"><a[^>]*href="\/contact"/.test(html), 'Contact is desktop-only; © line');
  const phone = (css.match(/@media \(max-width: 1023\.98px\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  // 48 px on phones (R10 — above the spec's 44 px minimum)
  assert(/\.cl-sf__a \{\s*min-height: 48px;/.test(phone) && /\.cl-sf__desk \{\s*display: none;/.test(phone), 'student phone rows < 48 px or Contact shown on phones');
  const pub = (css.match(/@media \(max-width: 899\.98px\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  assert(/\.cl-ft__a,\s*\.cl-ft__lib,\s*\.cl-ft__mail \{\s*min-height: 48px;/.test(pub) && /\.cl-ft__soc-a \{\s*width: 48px;\s*height: 48px;/.test(pub) && /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(pub), 'public phone: 2 × 2 columns with 48 px rows');
  // tokens only
  const lit = code(css).match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert(!lit, `colour literal in app/footer.css: ${lit && lit[0]}`);
  for (const [n, s] of [['public-footer', SRC.pf], ['student-footer', SRC.sf]]) assert(!/#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(/.test(code(s)), `colour literal in ${n}`);
  return 'links · desktop-only Contact · 48 px · tokens';
}

(async () => {
  console.log('FOOTER-1 site footer (static + render)');
  await test('F-1 page groups: public / student / none; one <footer>; old footers gone', () => checkGroups(SRC));
  await test('F-2 config: unset → hidden, no placeholders, no account address, library /about#started', () => checkConfig());
  await test('F-2b configured values render safely (test-only values)', () => checkConfigured());
  await test('F-3 only real routes are links; not-ready items muted / left out', () => checkRoutes());
  await test('F-4 sign-up band rules', () => checkBand());
  await test('F-5 language switch on / and /hi only; Hindi copy on /hi', () => checkLang());
  await test('F-6 no emoji in any footer render', () =>
    checkEmoji([['public', renderPublic()], ['hi', renderPublic({ lang: 'hi', langSwitch: true, band: null })], ['student', renderStudent()], ['payments', renderPublic({ payments: true })]]));
  await test('F-7 payment-gateway compliance links always present', () => checkCompliance());
  await test('F-8 trust line + not-affiliated line', () => checkTrust());
  await test('F-11 the band never waits on a DB / auth / settings read (value only; per-request default "Explore exams")', () => checkNoBlockingBand());
  await test('F-9 student slim line; 48 px phone rows; tokens only', () => checkStudent());

  await test('F-10 negative controls: each broken variant is caught', () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const muts = [
      ['a footer inside a live exam', () => checkGroups({ ...SRC, app: mut(SRC.app, '      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none" data-exam-focus="">\n        {content}\n      </main>', '      <main id="main-content" tabIndex={-1} className="min-h-dvh flex-1 outline-none" data-exam-focus="">\n        {content}\n      </main>\n      <StudentFooter />') })],
      ['students get the public footer', () => checkGroups({ ...SRC, app: mut(SRC.app, 'const footer = <StudentFooter />;', 'const footer = <PublicFooter t={FOOTER_EN} categories={[]} band={null} langSwitch={null} paymentsEnabled={false} />;') })],
      ['the landing keeps an inline footer', () => checkGroups({ ...SRC, landing: SRC.landing + '\nfunction Footer() { return <footer className="lp-ft" />; }\n' })],
      ['placeholder contact text', () => checkConfig({ [PF]: mut(SRC.pf, '{email && (', '{true && (').replace('{email}\n', '{email ?? "[contact email]"}\n') })],
      ['the account address hard-coded', () => checkConfig({ [CFG]: mut(SRC.cfg, 'contactEmail: null,', 'contactEmail: SHELL_COPY.supportEmail,') })],
      ['socials without rel', () => checkConfigured({ [PF]: mut(SRC.pf, 'target="_blank" rel="noopener noreferrer" ', 'target="_blank" ') })],
      ['a link to a missing route', () => checkRoutes({ [LINKS]: mut(SRC.links, 'about: "/about",', 'about: "/about-us",') })],
      ['a not-ready category as a link', () => checkRoutes({ [LINKS]: mut(SRC.links, 'top.map((c) => (c.href ? { label: c.name, href: c.href } : { label: c.name, href: null, soon: true }))', 'top.map((c) => ({ label: c.name, href: `/exams/${c.slug}` }))') })],
      ['Daily free mock linked to a guess', () => checkRoutes({ [LINKS]: mut(SRC.links, '        { label: t.currentAffairs, href: FOOTER_ROUTES.currentAffairs },\n', '        { label: t.currentAffairs, href: FOOTER_ROUTES.currentAffairs },\n        { label: "Daily free mock", href: "/mock-tests" },\n') })],
      ['band on the landing', () => checkBand({ [LINKS]: mut(SRC.links, 'if (p === "/" || p === "/hi") return false;', '') })],
      ['band on auth pages', () => checkBand({ [LINKS]: mut(SRC.links, 'return !(p === "/auth" || p.startsWith("/auth/"));', 'return true;') })],
      ['closed sign-up still links sign-up', () => checkBand({ [PF]: mut(SRC.pf, 'href={band.open ? FOOTER_ROUTES.signUp : FOOTER_ROUTES.exams}', 'href={FOOTER_ROUTES.signUp}') })],
      ['the per-request band waits on the sign-up read', () => checkNoBlockingBand({ ...SRC, app: mut(SRC.app, 'band={bandAllowed(pathname) ? { open: false, authHint: false } : null}', 'band={bandAllowed(pathname) ? { open: await signupOpen(), authHint: false } : null}') })],
      ['the band takes a promise again', () => checkNoBlockingBand({ ...SRC, pf: mut(SRC.pf, 'band: { open: boolean; authHint: boolean } | null;', 'band: { open: boolean | Promise<boolean>; authHint: boolean } | null;') })],
      ['the footer reads the setting itself', () => checkNoBlockingBand({ ...SRC, pf: mut(SRC.pf, 'const email = footerEmail();', 'const email = footerEmail();\n  void getSignupAvailability();') })],
      ['Hindi footer on /hi/learn', () => checkLang({ [LINKS]: mut(SRC.links, 'return (pathname.split(/[?#]/)[0] || "/") === "/hi" ? "hi" : "en";', 'return pathname.startsWith("/hi") ? "hi" : "en";') })],
      ['a missing Hindi string', () => checkLang({ [COPY]: mut(SRC.copy, 'helpLegal: "मदद और नियम",', 'helpLegal: "",') })],
      ['emoji in the footer', () => checkEmoji([['x', renderPublic({}, { [COPY]: mut(SRC.copy, 'bandTitle: "Start preparing today",', 'bandTitle: "Start preparing today \u{1F680}",') })]])],
      ['Shipping Policy dropped', () => checkCompliance({ [LINKS]: mut(SRC.links, '        { label: t.shipping, href: FOOTER_ROUTES.shipping },\n', '') })],
      ['Contact dropped', () => checkCompliance({ [LINKS]: mut(SRC.links, '        { label: t.contact, href: FOOTER_ROUTES.contact },\n      ],\n    },\n    {\n      key: "legal"', '      ],\n    },\n    {\n      key: "legal"') })],
      ['Razorpay claimed with payments off', () => checkTrust({ [LINKS]: mut(SRC.links, '...(paymentsEnabled ? [t.razorpay] : [])', 't.razorpay') })],
      ['not-affiliated line removed', () => checkTrust({ [PF]: mut(SRC.pf, '                {t.notAffiliated}\n', '') })],
      ['student phone rows under 48 px', () => checkStudent({}, mut(SRC.css, '  .cl-sf__a {\n    min-height: 48px;', '  .cl-sf__a {\n    min-height: 30px;'))],
      ['public phone rows under 48 px', () => checkStudent({}, mut(SRC.css, '  .cl-ft__lib,\n  .cl-ft__mail {\n    min-height: 48px;', '  .cl-ft__lib,\n  .cl-ft__mail {\n    min-height: 36px;'))],
      ['a colour literal in the footer CSS', () => checkStudent({}, mut(SRC.css, '  background: var(--color-cl-cloud);', '  background: #f5f6fa;'))],
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

  console.log(results.join('\n'));
  console.log(`\nFOOTER-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
