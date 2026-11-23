#!/usr/bin/env node
/**
 * UX-FIX-1 (Phase 3 audit) — offline, static gate.
 *   X-01 while sign-up is closed no start action links to /auth/signup (header, mobile menu, landing hero + final band);
 *        the primary action is "Explore SSC CGL"; when open the one label is "Start free" — outline pill in the header,
 *        amber (accent) only for the in-page primary (two-amber ruling)
 *   X-02 the closing "Create a free account" line is gone from the landing page
 *   X-03 no nav / menu / footer link to /flashcards, /descriptive, /community, /institutes, /articles; those routes are
 *        noindex (page metadata + segment layout) and /flashcards is not in the sitemap
 *   X-04 /descriptive makes no "expert faculty evaluation" claim
 *   X-05 "Sign in" is always visible in the bar (not hidden on phones), 48 px
 *        LANDING-1 exemptions (owner round 3, 2026-11-21) — the LANDING header ("/", "/hi") only: (1) X-05: on phones its bar
 *        is logo + language switch + menu, "Sign in" is the FIRST menu item and the start action the second; (2) BRAND-3
 *        R4: it carries the spec's SOLID "Start free". Both are encoded in scripts/test_landing1.cjs LD-8; the shared
 *        header (components/shell/header-bar.tsx) keeps X-05 and R4 as checked here. The landing start action follows
 *        X-01 (closed → "Explore exams" → /exams).
 *   X-06 the hero shows loop steps 1–3 + a "See all N steps" link (≥ 48 px); no step 4–6 copy in the hero
 *   X-07 the hero feature list is plain text + icon (no pill / glass chip)
 *   X-08 exam cards: exactly one link per card (stretched CardLink), the "Open exam" cue is decorative
 *   X-09 the /practice nav label is "Mistake drills" (F2: "Practice" with PRACTICE on; "Mistake drills" → /mistakes/drill)
 *   X-10 one spelling: no "practise / practised / practising" in public copy
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('UX-FIX-1');

test('X-01 sign-up closed → no /auth/signup start action, primary "Explore SSC CGL"; open → "Start free" (header outline, in-page amber)', () => {
  // NAV-1 Stage A (re-pointed, rule kept): every signed-out visitor gets THE visitor header (components/nav/visitor-header.tsx).
  // Its start actions (bar, compact bar, menu) come ONLY from startAction(): open → "Start free" → /auth/signup, closed (or
  // unknown) → "Explore exams" → /exams; while the setting is still being read the closed view is shown.
  const vh = code(read('components/nav/visitor-header.tsx'));
  const vn = code(read('lib/nav/visitor-nav.ts'));
  assert(!/\/auth\/signup/.test(vh) && (vh.match(/href=\{s\.href\}/g) || []).length === 3, 'visitor header: no hard-coded /auth/signup; the three start spots use the resolved start');
  assert(/return signupOpen \? \{ href: VISITOR_ROUTES\.signUp, label: t\.startFree \} : \{ href: VISITOR_ROUTES\.exams, label: t\.exploreExams \};/.test(vn) && /signUp: "\/auth\/signup"/.test(vn), 'closed → Explore exams → /exams; open → Start free → /auth/signup');
  assert(/const closed: StartLink = \{ href: VISITOR_ROUTES\.exams, label: t\.exploreExams \};/.test(vh) && /<Suspense fallback=\{render\(closed\)\}>/.test(vh), 'start action must fall back to the closed view');
  // R4 (revised, #84): the SIGNED-IN header never uses a solid primary; the visitor header's solid "Start free" is the
  // owner's recorded exemption (LANDING-1 round 3, extended to the shared visitor header by NAV-1)
  // NAV-1 Stage B: the signed-in header is THE student shell's top bar
  const ss = code(read('components/nav/student-shell.tsx'));
  const header = ss.slice(ss.indexOf('<header className="cl-ss__top"'), ss.indexOf('</header>'));
  assert(header.length > 100 && !/variant="(?:primary|on-dark|accent)|bg-accent-|bg-brand|cl-vh__pill|cl-ss__fab/.test(header) && !/\/auth\/signup/.test(ss), 'the signed-in header uses a solid primary CTA or a sign-up link');
  assert(/BRAND-3 R4: the header's "Start free" is the SOLID cl-blue pill/.test(read('components/nav/visitor-header.tsx')), 'R4 exemption recorded on the visitor header');
  assert(/outline: "focus-ring border border-primary-700 text-primary-700/.test(read('components/ui/pill-button.tsx')), 'outline pill variant');
  // the shell must never wait on the Supabase setting (AUTH1-RESILIENCE-HANG): a never-rejecting promise, not an await
  const shell = code(read('components/shell/app-shell.tsx'));
  assert(/start=\{signupOpen\(\)\.then\(\(open\) => startAction\(t, open\)\)\}/.test(shell) && /getSignupAvailability\(\)\.then\(\(a\) => a !== "closed", \(\) => false\)/.test(shell), 'AppShell must stream the sign-up state');
  assert(!/await getSignupAvailability/.test(shell), 'AppShell awaits the sign-up setting (blocks every page during an outage)');
  const cta = code(read('components/landing/landing-cta.tsx'));
  assert(/if \(mode === "signup-closed"\) \{[\s\S]*?<PillLink href=\{explore\.href\} variant="on-dark"/.test(cta), 'closed: ONE primary "Explore exams"');
  // PERF-HOME-1: "/" is cached and its CTA reads no session — the signed-out variant is the closed view unless sign-up is open
  // PERF-HOME-1b: the cached page reads the setting before rendering and passes it; not passed → the CLOSED view
  assert(/export function LandingCta\(\{ spot, signupOpen = false \}: \{ spot: Spot; signupOpen\?: boolean \}\) \{\s*const signedOut: Mode = signupOpen \? "signup-open" : "signup-closed";/.test(cta), 'signed-out variant must be the closed view unless sign-up is open (default closed)');
  // LANDING-1: "/" and "/hi" read the cached sign-up setting (no cookie) and, while it is closed, every start action
  // becomes "Explore exams" → /exams (lib/landing/landing-copy.ts; scripts/test_landing1.cjs LD-8 renders both states)
  const ld = code(read('lib/landing/landing-page-data.ts'));
  assert(/getSignupAvailability\(\)\.catch\(\(\) => "unknown" as const\)/.test(ld) && /signupOpen: signup !== "closed"/.test(ld), 'home reads the sign-up setting');
  const lc = code(read('lib/landing/landing-copy.ts'));
  assert(/const start: StartAction = f\.signupOpen \? \{ label: base\.startFree, href: signUpHref \} : \{ label: base\.hero\.explore, href: examsHref \};/.test(lc), 'closed → Explore exams → /exams');
  for (const f of ['app/(landing)/page.tsx', 'app/(landing)/hi/page.tsx']) assert(/resolveLandingCopy\(LANDING_(EN|HI), facts\)/.test(code(read(f))), `${f} resolves the start action`);
  assert(!/href=\{R\.signUp\}/.test(code(read('components/landing-v1/landing-page.tsx'))), 'the landing page never links /auth/signup directly (only through the resolved start action)');
  const pub = code(read('components/shell/public-shell.tsx'));
  // PERF-HOME-1b: the cached shell reads it before rendering (background ISR) through the never-rejecting, bounded
  // signupOpen() (a failure → closed); the session AppShell keeps streaming it (checked above)
  assert(/start=\{startAction\(NAV_EN, signup\)\}/.test(pub) && /getSignupAvailability\(\)\.then\(\(a\) => a !== "closed", \(\) => false\)/.test(pub) && /await Promise\.all\(\[signupOpen\(\), loadNavLive\(\)\]\)/.test(pub) /* FOOTER-1: the brand + category reads only fed the old footer */ && !/await getSignupAvailability/.test(pub), 'PublicShell reads the sign-up state through signupOpen() (closed on failure)');
  assert(/const start = spot === "hero" \? LANDING_HERO\.primaryCta : LANDING_FINAL_CTA\.cta;\s+return \(\s+<>\s+<PillLink href=\{start\.href\} variant="on-dark"/.test(cta), 'open: ONE primary Start free');
  const L = read('content/landing.ts');
  assert(/primaryCta: \{ label: "Start free"/.test(L) && /cta: \{ label: "Start free"/.test(L) && /startFree: "Start free"/.test(L) && !/Get started/.test(L), 'one label "Start free"');
  // HOME-1: no exam-specific action on home — the closed-sign-up primary goes to the category tiles
  assert(/secondaryCta: \{ label: "Explore exams", href: "\/#categories" \}/.test(L) && !/Explore SSC/.test(L), 'explore target');
  return 'closed-safe header, menu, hero, final band';
});

test('X-02 the closing "Create a free account" line is not rendered', () => {
  const s = code(read('components/landing/landing-sections.tsx'));
  assert(!/LANDING_FINAL_CTA\.text/.test(s), 'final band still renders the text line');
  return 'removed';
});

const HIDDEN = ['/flashcards', '/descriptive', '/community', '/institutes', '/articles'];
test('X-03 no nav / footer link to unready routes; they are noindex; /flashcards not in the sitemap', () => {
  // FOOTER-1 (re-pointed, rule kept): the footer links live in lib/site/footer-links.ts + the two footer components
  const nav = code(read('lib/site/footer-links.ts') + read('components/footer/public-footer.tsx') + read('components/footer/student-footer.tsx') + read('lib/nav/visitor-nav.ts') + read('lib/nav/student-nav.ts'));
  const linked = HIDDEN.filter((r) => new RegExp(`(?:href: |: )"${r}"`).test(nav));
  assert(linked.length === 0, `still linked: ${linked.join(', ')}`);
  for (const r of HIDDEN) {
    const seg = r.slice(1);
    assert(/noIndex: true/.test(read(`app/(site)/${seg}/page.tsx`)), `${r}: page not noindex`); // PERF-HOME-1 route group
    if (seg !== 'articles') assert(/robots: \{ index: false, follow: false \}/.test(read(`app/(site)/${seg}/layout.tsx`)), `${r}: segment layout not noindex`);
  }
  assert(!/\/flashcards/.test(code(read('app/sitemap.ts'))), '/flashcards still in the sitemap');
  return `${HIDDEN.length} routes unlinked + noindex`;
});

test('X-04 /descriptive makes no "expert faculty evaluation" claim', () => {
  assert(!/expert faculty/i.test(read('app/(site)/descriptive/page.tsx')), 'claim still present');
  return 'claim removed';
});

test('X-05 "Sign in" is always reachable: in the bar on desktop, in the phone menu (owner exemption), 48 px', () => {
  // NAV-1 Stage A: the owner's X-05 exemption (LANDING-1 round 3) extended to THE visitor header (NAV-1 spec §1, owner
  // 23 Nov 2026): ≥ 900 px "Sign in" is in the bar; below, the bar is logo + start action + menu and "Sign in" is the
  // first action in the menu. Both 48 px. Never hidden from a signed-out visitor at any width.
  const vh = read('components/nav/visitor-header.tsx');
  const css = read('app/nav.css');
  assert(/UXFIX1 X-05: on phones the bar is logo \+ start action \+ menu; "Sign in" is in the menu/.test(vh), 'X-05 exemption not recorded');
  assert(/<Link className="cl-vh__signin" href=\{VISITOR_ROUTES\.signIn\}[^>]*>/.test(vh) && /\.cl-vh__signin \{[^}]*min-height: 48px;/.test(css), 'desktop bar: Sign in missing or < 48 px');
  const menu = vh.slice(vh.indexOf('data-drawer-panel=""'));
  assert(/href=\{VISITOR_ROUTES\.signIn\}[^>]*data-menu-item="signin"/.test(menu) && menu.indexOf('data-menu-item="signin"') < menu.indexOf('data-menu-item="start"') && /\.cl-vh__ctas \.cl-vh__pill \{\s+height: 48px;/.test(css), 'phone menu: Sign in missing, after the start action, or < 48 px');
  // the auth pages are signed-out pages: Sign in leads there from every public page
  assert(/signIn: "\/auth\/login"/.test(read('lib/nav/visitor-nav.ts')), 'Sign in target');
  return 'bar on desktop, first menu action on phones';
});

test('X-06 (HOME-1) hero: no step card (the loop is ONE section right below, 5 steps), one action', () => {
  const s = read('components/landing/landing-sections.tsx');
  const hero = s.slice(s.indexOf('export function LandingHero'), s.indexOf('export function LandingCategories'));
  assert(!/HERO_STEPS|GlassCard|LANDING_LOOP/.test(hero), 'the hero repeats the steps');
  assert((hero.match(/<LandingCta /g) || []).length === 1, 'the hero must have exactly one action spot');
  assert(/SectionHeading id="loop-title"/.test(s) && read('content/landing.ts').match(/\{ title: "(Learn|Practice|Mock|Analyze|Revise)"/g).length === 5, '5 loop steps');
  return 'no repeat; 5 steps';
});

test('X-07 (HOME-1) hero: low text — no feature list, no pills / glass chips', () => {
  const s = read('components/landing/landing-sections.tsx');
  const hero = s.slice(s.indexOf('export function LandingHero'), s.indexOf('export function LandingCategories'));
  assert(!/GlassChip|rounded-full px-|glass-dark[^"]*rounded-full/.test(hero.replace(/size-2 rounded-full/g, '')), 'pill styling in the hero');
  assert(!/<ul\b|HERO_CHIPS/.test(hero), 'a feature list in the hero');
  return 'plain';
});

test('X-08 exam cards: one stretched link per card, the cue is decorative', () => {
  const card = read('components/ui/card.tsx');
  assert(/after:absolute after:inset-0/.test(card) && /"relative flex flex-col/.test(card), 'CardLink must stretch over a relative card');
  for (const f of ['components/exams/category-page.tsx', 'app/(public)/exams/page.tsx']) { // HOME-1: home has no exam cards
    const s = read(f);
    const cards = s.split('<Card variant="interactive"').slice(1).map((c) => c.slice(0, c.indexOf('</Card>')));
    assert(cards.length >= 1, `${f}: no interactive card`);
    for (const c of cards) assert((c.match(/<CardLink\b/g) || []).length === 1 && !/<Link\b|<a\b|ButtonLink/.test(c), `${f}: a card has more than one link`);
  }
  assert(/text-link" aria-hidden="true">\s*Open exam/.test(read('components/exams/category-page.tsx')), '"Open exam" cue must be decorative');
  assert(!/<Card variant="interactive"|LANDING_EXAMS/.test(read('components/landing/landing-sections.tsx')), 'exam cards are back on home');
  return 'single link';
});

test('X-09 the /practice nav label is "Mistake drills" (F2: "Practice" once topic practice is on; drills stay a separate entry)', () => {
  // FOOTER-1 (re-pointed, rule kept): the owner's footer columns have no /practice or drills link at all, so the footer
  // can never mislabel /practice; THE student nav shows "Practice" → /practice ONLY with PRACTICE on
  const fl = read('lib/site/footer-links.ts') + read('components/footer/public-footer.tsx') + read('components/footer/student-footer.tsx');
  assert(!/\/practice|\/mistakes\/drill/.test(fl), 'a footer links /practice or the drills (not in the FOOTER-1 columns)');
  const sn = read('lib/nav/student-nav.ts');
  assert((sn.match(/if \(f\.practice\) (?:items|left)\.push\(\{ key: "practice", href: "\/practice", label: t\.practice, icon: "practice" \}\);/g) || []).length === 2 && (sn.match(/href: "\/practice"/g) || []).length === 2, 'student nav: Practice only with the flag (sidebar + bottom bar)');
  return 'no footer /practice link · student nav gated';
});

test('X-10 one spelling: no "practise" forms in public copy', () => {
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(tsx?|md)$/.test(e.name) ? [`${d}/${e.name}`] : []));
  const files = ['app', 'components', 'content'].flatMap(walk).filter((f) => !/\/admin\//.test(f));
  assert(files.length >= 200, `files ${files.length}`);
  const hits = files.filter((f) => /\bpractis(e|ed|es|ing)\b/i.test(read(f)));
  assert(hits.length === 0, hits.join(', '));
  return `${files.length} files`;
});

console.log(`\nUX-FIX-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
