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
  const header = code(read('components/shell/header-bar.tsx'));
  const signupLinks = header.match(/href="\/auth\/signup"/g) || [];
  assert(signupLinks.length === 2, `header /auth/signup links: ${signupLinks.length} (bar + menu, both inside signupOpen)`);
  assert((header.match(/<StartAction\s+signup=\{signup\}\s+open=\{\s*<PillLink href="\/auth\/signup" variant="outline"/g) || []).length === 2, 'header signup links must be the outline "open" branch of StartAction');
  // two-amber ruling: the header never uses the amber fill; amber is only the in-page primary
  assert(!/variant="accent|bg-accent-/.test(header), 'header uses an amber (accent) CTA');
  assert(/outline: "focus-ring border border-primary-600 text-primary-700/.test(read('components/ui/pill-button.tsx')), 'outline pill variant');
  assert((header.match(/closed=\{\s*<(PillLink|ButtonLink) href=\{LANDING_HERO\.secondaryCta\.href\}/g) || []).length === 2, 'closed: Explore SSC CGL in the bar and the menu');
  assert(/<Suspense fallback=\{closed\}>/.test(header) && /if \(!signup\) return closed;/.test(header) && /return use\(signup\) \? open : closed;/.test(header), 'start action must fall back to the closed view');
  // the shell must never wait on the Supabase setting (AUTH1-RESILIENCE-HANG): a never-rejecting promise, not an await
  const shell = code(read('components/shell/app-shell.tsx'));
  assert(/signup=\{account === null \? signupOpen\(\) : undefined\}/.test(shell) && /getSignupAvailability\(\)\.then\(\(a\) => a !== "closed", \(\) => false\)/.test(shell), 'AppShell must stream the sign-up state');
  assert(!/await getSignupAvailability/.test(shell), 'AppShell awaits the sign-up setting (blocks every page during an outage)');
  const cta = code(read('components/landing/landing-cta.tsx'));
  assert(/if \(mode === "signup-closed"\) \{[\s\S]*?<PillLink href=\{explore\.href\} variant="accent"/.test(cta), 'closed: one amber "Explore SSC CGL"');
  assert(/<Suspense fallback=\{<Cta spot=\{spot\} mode="signup-closed" \/>\}>/.test(cta), 'fallback must be the closed view');
  assert(/const start = spot === "hero" \? LANDING_HERO\.primaryCta : LANDING_FINAL_CTA\.cta;\s+return \(\s+<>\s+<PillLink href=\{start\.href\} variant="accent"/.test(cta), 'open: amber Start free');
  const L = read('content/landing.ts');
  assert(/primaryCta: \{ label: "Start free"/.test(L) && /cta: \{ label: "Start free"/.test(L) && /startFree: "Start free"/.test(L) && !/Get started/.test(L), 'one label "Start free"');
  assert(/secondaryCta: \{ label: "Explore SSC CGL", href: "\/exams\/ssc-cgl" \}/.test(L), 'explore target');
  return 'closed-safe header, menu, hero, final band';
});

test('X-02 the closing "Create a free account" line is not rendered', () => {
  const s = code(read('components/landing/landing-sections.tsx'));
  assert(!/LANDING_FINAL_CTA\.text/.test(s), 'final band still renders the text line');
  return 'removed';
});

const HIDDEN = ['/flashcards', '/descriptive', '/community', '/institutes', '/articles'];
test('X-03 no nav / footer link to unready routes; they are noindex; /flashcards not in the sitemap', () => {
  const nav = code(read('components/shell/nav-config.ts'));
  const linked = HIDDEN.filter((r) => new RegExp(`href: "${r}"`).test(nav));
  assert(linked.length === 0, `still linked: ${linked.join(', ')}`);
  for (const r of HIDDEN) {
    const seg = r.slice(1);
    assert(/noIndex: true/.test(read(`app/${seg}/page.tsx`)), `${r}: page not noindex`);
    if (seg !== 'articles') assert(/robots: \{ index: false, follow: false \}/.test(read(`app/${seg}/layout.tsx`)), `${r}: segment layout not noindex`);
  }
  assert(!/\/flashcards/.test(code(read('app/sitemap.ts'))), '/flashcards still in the sitemap');
  return `${HIDDEN.length} routes unlinked + noindex`;
});

test('X-04 /descriptive makes no "expert faculty evaluation" claim', () => {
  assert(!/expert faculty/i.test(read('app/descriptive/page.tsx')), 'claim still present');
  return 'claim removed';
});

test('X-05 "Sign in" is always visible in the bar (phones too), 48 px', () => {
  const h = read('components/shell/header-bar.tsx');
  assert(/<ButtonLink href="\/auth\/login" variant="ghost" size="md" className="min-h-12 rounded-full px-3">/.test(h), 'Sign in hidden or < 48 px');
  return 'visible at every width';
});

test('X-06 hero: loop steps 1–3 + "See all N steps" (≥ 48 px), no steps 4–6', () => {
  const s = read('components/landing/landing-sections.tsx');
  assert(/const HERO_STEPS = \[0, 1, 2\]\.map/.test(s), 'hero steps are not 1–3');
  assert(/<a href="#loop-title" className="focus-ring-on-dark inline-flex min-h-12/.test(s) && /LANDING_LOOP\.seeAll\(LANDING_LOOP\.steps\.length\)/.test(s), 'See all link');
  assert(/id="loop-title"/.test(s) || /SectionHeading id="loop-title"/.test(s), 'link target missing');
  return 'steps 1–3 + link';
});

test('X-07 hero feature list is plain text + icon (no pill, no glass chip)', () => {
  const s = read('components/landing/landing-sections.tsx');
  const hero = s.slice(s.indexOf('export function LandingHero'), s.indexOf('export function LandingLoop'));
  assert(!/GlassChip|rounded-full px-|glass-dark[^"]*rounded-full/.test(hero.replace(/size-2 rounded-full/g, '')), 'pill styling in the hero list');
  assert(/<li key=\{chip\} className="inline-flex items-center gap-2 text-body-sm font-medium text-hero-fg">/.test(hero), 'plain list item');
  return 'plain';
});

test('X-08 exam cards: one stretched link per card, the cue is decorative', () => {
  const card = read('components/ui/card.tsx');
  assert(/after:absolute after:inset-0/.test(card) && /"relative flex flex-col/.test(card), 'CardLink must stretch over a relative card');
  for (const f of ['components/landing/landing-sections.tsx', 'app/exams/page.tsx']) {
    const s = read(f);
    const cards = s.split('<Card variant="interactive"').slice(1).map((c) => c.slice(0, c.indexOf('</Card>')));
    assert(cards.length >= 1, `${f}: no interactive card`);
    for (const c of cards) assert((c.match(/<CardLink\b/g) || []).length === 1 && !/<Link\b|<a\b|ButtonLink/.test(c), `${f}: a card has more than one link`);
  }
  assert(/text-primary-700" aria-hidden="true">\s*\{LANDING_EXAMS\.cardCta\}/.test(read('components/landing/landing-sections.tsx')), '"Open exam" cue must be decorative');
  return 'single link';
});

test('X-09 the /practice nav label is "Mistake drills" (F2: "Practice" once topic practice is on; drills stay a separate entry)', () => {
  const nav = read('components/shell/nav-config.ts');
  const items = [...nav.matchAll(/\{ href: "(\/practice|\/mistakes\/drill)", label: "([^"]+)"(?:, (flag|unlessFlag): "([A-Z]+)")? \}/g)].map((m) => ({ href: m[1], label: m[2], kind: m[3] || null, flag: m[4] || null }));
  const off = items.filter((i) => i.href === '/practice' && i.kind !== 'flag');
  const on = items.filter((i) => i.kind === 'flag' && i.flag === 'PRACTICE');
  assert(off.length >= 2 && off.every((i) => i.label === 'Mistake drills' && i.kind === 'unlessFlag' && i.flag === 'PRACTICE'), `flag off: ${JSON.stringify(off)}`);
  assert(on.length >= 4 && on.filter((i) => i.href === '/practice').every((i) => i.label === 'Practice') && on.filter((i) => i.href === '/mistakes/drill').every((i) => i.label === 'Mistake drills'), `flag on: ${JSON.stringify(on)}`);
  return `${off.length} flag-off + ${on.length} flag-on entries`;
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
