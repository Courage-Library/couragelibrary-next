#!/usr/bin/env node
/**
 * BRAND-2 gate — colour values now BRAND-3 v3 (#84: blue + cyan, no amber), "modern glass" (#72), bilingual typography,
 * performance budget.
 * Offline (default; deterministic, reads source only):
 *   C-01 tokens carry the #84 (v3) values; categorical tokens exist; the semantic layer (dark-theme-ready names) is complete
 *   C-02 contrast incl. WORST-CASE glass-on-gradient (alpha-composited from the percentages in app/globals.css) and
 *        hero-accent-text, which may only be used on the hero (primary-900 / 800)
 *   C-03 no glass in the exam engine, question review or admin (static): no glass component / class there, and every
 *        such route root is a [data-no-glass] zone (CSS turns any legacy blur off)
 *   C-04 glass only where allowed (nav, home hero, auth card, dashboard header) and ≤ 3 glass groups on the home hero
 *   C-05 fallbacks: solid by default, blur only under @supports AND html:not(.lite); reduced-transparency resets;
 *        html.lite drops large shadows; the lite script runs in <head> with the right thresholds (unit)
 *   C-06 package.json / package-lock dependency sets unchanged (no new npm package, #44)
 *   C-07 fonts: Inter + Poppins 600/700 + Noto Sans Devanagari 400/600 via next/font, latin + devanagari subsets,
 *        only Inter preloaded; base 16px, line-height 1.6 (1.7 for lang="hi"); no sub-12px text in the new components
 *   C-08 touch targets ≥ 48 px on key buttons (static: pill buttons, nav actions, auth submits)
 *   C-09 categorical tokens are used by subject / section colours; legacy violet / teal / cyan / green no longer
 *        collapse into the primary
 *   C-10 no banned claim phrases in public copy (CCPA coaching-advertising guidelines 2024)
 *   C-11 email templates: blue #1D4ED8 header with the text wordmark, system fonts only, /auth/confirm links exact
 * Probe (--probe; CI server-checks, LOCAL production build, decision #69):
 *   P-01 font payload on "/" (cold) ≤ 160 KB; no Devanagari file on an English page
 *   P-02 a Hindi sample renders with the Devanagari web font (body) and Poppins (heading), not a system fallback
 *   P-03a…h touch targets ≥ 48 px measured at 360 px, one ID per target (CI shows which one fails)
 *   P-04 lite mode (deviceMemory 2) → html.lite, no backdrop blur; capable device → blur on the nav
 *   P-05 prefers-reduced-transparency: reduce → no backdrop blur
 *   P-06 "/" front-end budget, Moto-G-class emulation (4x CPU, Fast 4G, cold): LCP ≤ 2.5 s, CLS ≤ 0.1, transfer ≤ 500 KB
 * Prints no secrets.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const PROBE = process.argv.includes('--probe');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 3000)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(p);
    return /\.(tsx?|jsx?|css)$/.test(e.name) ? [p] : [];
  });
}

// ---------- tokens + colour maths ----------
const css = read('app/globals.css');
const vars = {};
for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
function resolveColor(name) {
  let v = name === 'white' ? '#ffffff' : vars[`color-${name}`];
  for (let i = 0; i < 6 && v && /^var\(--/.test(v); i++) v = vars[v.slice(6, -1)];
  return v;
}
const rgb = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h || '');
  if (!m) throw new Error(`not a colour: ${h}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const tok = (name) => rgb(resolveColor(name));
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
const lum = (c) => c.map((x) => x / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((a, s, i) => a + s * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
/** the percentage in `color-mix(in srgb, var(--color-<token>) N%, transparent)` inside a given CSS rule */
function mixPct(selectorRx, token) {
  const block = (css.match(selectorRx) || [])[0] || '';
  const m = new RegExp(`color-mix\\(in srgb, var\\(--color-${token}\\) (\\d+)%, transparent\\)`).exec(block);
  assert(m, `no color-mix for ${token} in ${selectorRx}`);
  return Number(m[1]) / 100;
}

async function offline() {
  await test('C-01 #84 (v3) token values, categorical tokens, complete semantic layer (dark-theme-ready names)', () => {
    // BRAND-3 (#84) values; the BRAND-2 structure (glass, categorical scales, semantic layer) is unchanged
    const SPEC = {
      brand: '#1d4ed8', 'primary-700': '#1d4ed8', 'primary-800': '#1e40af', 'primary-900': '#0b1b4d', 'accent-400': '#22c7dc', 'accent-text': '#0e7490',
      'hero-accent-text': '#a1eaf2', 'success-600': '#16a34a', 'danger-600': '#dc2626', 'warning-600': '#ea580c', fg: '#0b1b4d', 'fg-muted': '#64708a',
      canvas: '#f7f8fc', surface: '#ffffff', line: '#e6e9f2', 'on-accent': '#0b1b4d', link: '#1d4ed8',
      'subject-blue': '#2563eb', 'subject-teal': '#0d9488', 'subject-violet': '#7c3aed', 'subject-cyan': '#0e7490', 'subject-rose': '#e11d48', 'subject-slate': '#475569',
    };
    const bad = Object.entries(SPEC).filter(([t, v]) => (resolveColor(t) || '').toLowerCase() !== v).map(([t, v]) => `${t}: ${resolveColor(t)} (want ${v})`);
    const SEMANTIC = ['canvas', 'surface', 'surface-sunken', 'fg', 'fg-secondary', 'fg-muted', 'fg-inverse', 'line', 'line-control', 'brand', 'brand-hover', 'interactive', 'link', 'focus', 'on-accent', 'accent-text', 'hero-bg', 'hero-bg-mid', 'hero-bg-end', 'hero-fg', 'hero-fg-muted', 'hero-accent-text', 'hero-focus'];
    for (const s of SEMANTIC) if (!/^var\(--color-|^#ffffff$/.test(vars[`color-${s}`] || '')) bad.push(`semantic token ${s} missing`);
    assert(!/data-theme="dark"|prefers-color-scheme/.test(css), 'a dark theme was added (out of scope)');
    assert(bad.length === 0, bad.join('; '));
    return `${Object.keys(SPEC).length} values; ${SEMANTIC.length} semantic roles`;
  });

  await test('C-02 contrast incl. worst-case glass-on-gradient and hero-accent-text (alpha-composited from globals.css)', () => {
    const lightGlass = mixPct(/html:not\(\.lite\) \.glass-light \{[^}]*\}/, 'surface');
    const darkGlass = mixPct(/html:not\(\.lite\) \.glass-dark \{[^}]*\}/, 'hero-bg'); // dark-tinted glass
    const accentGlow = mixPct(/\.hero-gradient \{[^}]*\}/, 'gradient-start'); // BRAND-3: cyan glow (gradient start)
    const violetGlow = mixPct(/\.hero-gradient \{[^}]*\}/, 'gradient-end'); // BRAND-3: violet glow (gradient end)
    const blueGlow = mixPct(/\.hero-gradient \{[^}]*\}/, 'primary-600');
    const authGlow = mixPct(/\.auth-gradient \{[^}]*\}/, 'gradient-start');
    const white = tok('surface');
    // hero regions (worst = lightest possible point under the content)
    const heroLeft = over(tok('primary-600'), blueGlow, tok('hero-bg-mid')); // text column: blue glow over the mid stop
    // card side: the cyan glow over the light stop (worse for white text than the violet glow — both are checked)
    const heroRight = over(tok('gradient-start'), accentGlow, tok('hero-bg-end'));
    const heroViolet = over(tok('gradient-end'), violetGlow, tok('hero-bg-end'));
    const heroCard = over(tok('hero-bg'), darkGlass, heroRight); // glass-dark (hero-bg tint) on that
    const heroChips = over(tok('hero-bg'), darkGlass, heroLeft);
    const navOnHero = over(white, lightGlass, tok('hero-bg')); // floating nav at the top of the hero (darkest → worst for ink)
    const navOnCanvas = over(white, lightGlass, tok('canvas'));
    const authBg = over(tok('gradient-start'), authGlow, tok('primary-100'));
    const authCard = over(white, lightGlass, authBg);
    const P = [
      ['Hero headline / lead (white) on the text column', tok('hero-fg'), heroLeft, 4.5],
      ['Hero lead (hero-fg-muted) on the text column', tok('hero-fg-muted'), heroLeft, 4.5],
      ['Hero eyebrow (hero-accent-text) on the text column', tok('hero-accent-text'), heroLeft, 4.5],
      ['Hero headline line 2 (hero-accent-text, large) on the text column', tok('hero-accent-text'), heroLeft, 3],
      ['Hero glass card text (white) — worst case', tok('hero-fg'), heroCard, 4.5],
      ['Hero glass card secondary text (hero-fg-muted) — worst case', tok('hero-fg-muted'), heroCard, 4.5],
      ['Hero glass chip text (white) — worst case', tok('hero-fg'), heroChips, 4.5],
      ['Hero chip check icon (hero-accent-text, UI) — worst case', tok('hero-accent-text'), heroChips, 3],
      ['Primary pill on the hero (on-dark): blue-700 text on white', tok('primary-700'), tok('surface'), 4.5],
      ['Hero glass card text (white) — over the violet glow', tok('hero-fg'), over(tok('hero-bg'), darkGlass, heroViolet), 4.5],
      ['Ghost-on-dark pill text (white) on the text column', tok('hero-fg'), heroLeft, 4.5],
      ['Nav glass: ink text over the darkest hero point', tok('fg'), navOnHero, 4.5],
      ['Nav glass: link / Sign in (primary-700) over the darkest hero point', tok('link'), navOnHero, 4.5],
      ['Nav glass: secondary text over the darkest hero point', tok('fg-secondary'), navOnHero, 4.5],
      ['Nav glass: link over the canvas', tok('link'), navOnCanvas, 4.5],
      ['Nav glass: white on the brand pill (Get started)', tok('fg-inverse'), tok('brand'), 4.5],
      ['Auth glass card: ink text — worst case', tok('fg'), authCard, 4.5],
      ['Auth glass card: muted text — worst case', tok('fg-muted'), authCard, 4.5],
      ['Auth glass card: link — worst case', tok('link'), authCard, 4.5],
      ['Focus ring on the dark hero (UI)', tok('hero-focus'), tok('hero-bg'), 3],
      ['Focus ring on the hero text column (UI)', tok('hero-focus'), heroLeft, 3],
      ['Lite / no-blur fallback: white on glass-dark solid', tok('hero-fg'), tok('hero-bg-mid'), 4.5],
    ];
    const rows = P.map(([use, fg, bg, need]) => ({ use, fg: hex(fg), bg: hex(bg), r: ratio(fg, bg), need }));
    if (process.argv.includes('--table')) {
      console.log('\n| Use | fg / composited bg | Ratio | Needs |\n|---|---|---|---|');
      for (const r of rows) console.log(`| ${r.use} | ${r.fg} / ${r.bg} | ${r.r.toFixed(2)}:1 | ≥ ${r.need} |`);
      console.log('');
    }
    const bad = rows.filter((r) => r.r < r.need).map((r) => `${r.use}: ${r.r.toFixed(2)} < ${r.need}`);
    // hero-accent-text only in hero contexts
    const HERO_OK = ['components/landing/landing-sections.tsx', 'app/dashboard/page.tsx', 'components/brand/wordmark.tsx', 'components/ui/pill-button.tsx'];
    for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      const r = rel(f);
      if (/text-hero-accent-text|hero-accent-text/.test(fs.readFileSync(f, 'utf8')) && !HERO_OK.includes(r) && r !== 'app/globals.css' && r !== 'components/ui/gradient-hero.tsx') bad.push(`${r}: hero-accent-text outside the hero`);
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${rows.length} pairs; glass light ${Math.round(lightGlass * 100)}% / dark ${Math.round(darkGlass * 100)}%; min ${Math.min(...rows.map((r) => r.r)).toFixed(2)}:1`;
  });

  const GLASS = /\bglass-(?:light|dark)\b|\bGlass(?:Card|Chip|Nav)\b|@\/components\/ui\/glass"|\bbackdrop-filter\b/;
  await test('C-03 no glass in the exam engine, question review or admin; their roots are [data-no-glass] zones', () => {
    const ZONES = ['app/mock-tests', 'app/live-tests', 'app/admin', 'app/mistakes/drill', 'app/battles', 'components/assessment', 'components/live-test', 'components/admin', 'components/mistakes'];
    const files = ZONES.flatMap((d) => walk(path.join(ROOT, d)));
    assert(files.length >= 100, `zone files ${files.length}`); // GATE-HYGIENE-1
    const bad = files.filter((f) => GLASS.test(fs.readFileSync(f, 'utf8'))).map(rel);
    const ROOTS = {
      'app/mock-tests/[id]/take/page.tsx': 2,
      'app/mock-tests/[id]/result/page.tsx': 1,
      'app/live-tests/[slug]/take/page.tsx': 1,
    };
    for (const [f, n] of Object.entries(ROOTS)) {
      const s = read(f);
      const wrapped = (s.match(/<NoGlassZone>/g) || []).length;
      if (wrapped < n) bad.push(`${f}: ${wrapped}/${n} player / review returns inside <NoGlassZone>`);
    }
    if (!/data-no-glass=""/.test(read('app/admin/layout.tsx'))) bad.push('app/admin/layout.tsx root is not data-no-glass');
    if (!/data-no-glass=""/.test(read('app/mistakes/drill/page.tsx'))) bad.push('app/mistakes/drill/page.tsx root is not data-no-glass');
    if (!/\[data-no-glass\],\s*\[data-no-glass\] \* \{[^}]*backdrop-filter: none !important/.test(css)) bad.push('globals.css: [data-no-glass] rule missing');
    // the signed-in header (shown above the exam player) must stay solid
    const header = read('components/shell/header-bar.tsx');
    if (!/if \(!student\) return <GlassNav/.test(header)) bad.push('header-bar: glass must be limited to the public (non-student) header');
    assert(bad.length === 0, bad.join('; '));
    return `${files.length} zone files clean; 5 zone roots marked`;
  });

  await test('C-04 glass only in allowed places; home hero ≤ 3 glass groups per viewport (nav + chips + card)', () => {
    const ALLOWED = new Set(['components/ui/glass.tsx', 'components/shell/header-bar.tsx', 'components/landing/landing-sections.tsx', 'app/dashboard/page.tsx',
      'app/auth/login/login-form.tsx', 'app/auth/signup/signup-form.tsx', 'app/auth/signup/page.tsx', 'app/auth/forgot-password/forgot-password-form.tsx', 'app/globals.css']);
    const all = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))];
    const users = all.filter((f) => /\bglass-(?:light|dark)\b|\bGlass(?:Card|Chip|Nav)\b/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    const outside = users.filter((u) => !ALLOWED.has(u));
    assert(outside.length === 0, `glass outside the allowed places: ${outside.join(', ')}`);
    const hero = read('components/landing/landing-sections.tsx');
    const heroBlock = hero.slice(hero.indexOf('export function LandingHero'), hero.indexOf('export function LandingLoop'));
    const groups = (heroBlock.match(/<GlassCard\b/g) || []).length + (/<GlassChip\b/.test(heroBlock) ? 1 : 0) + 1; // + the floating nav
    assert(groups <= 3, `home hero glass groups ${groups} (max 3)`);
    assert(!/glass-(?:light|dark)/.test(heroBlock.replace(/<GlassCard[^>]*>/, '')), 'nested glass inside the hero card');
    return `${users.length} files use glass, all allowed; hero groups ${groups}`;
  });

  await test('C-05 fallbacks: solid default, blur only with @supports AND not .lite, reduced-transparency reset, lite shadows; lite script (unit)', () => {
    const solidLight = /\n\.glass-light \{\s*background-color: var\(--color-surface\);/.test(css);
    const solidDark = /\.glass-dark \{\s*background-color: var\(--color-hero-bg-mid\);/.test(css);
    assert(solidLight && solidDark, 'solid default (no-support) styles missing');
    const supports = css.slice(css.indexOf('@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))'));
    assert(/html:not\(\.lite\) \.glass-light \{[^}]*backdrop-filter: blur/.test(supports) && /html:not\(\.lite\) \.glass-dark \{[^}]*backdrop-filter: blur/.test(supports), 'blur not limited to @supports + html:not(.lite)');
    const blurOutside = css.replace(supports, '').match(/backdrop-filter: blur/g);
    assert(!blurOutside, 'backdrop blur declared outside the @supports block');
    assert(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\.glass-light \{[^}]*backdrop-filter: none[\s\S]*?\.glass-dark \{[^}]*backdrop-filter: none/.test(css), 'reduced-transparency reset missing');
    // specificity: the reset must use the SAME selector as the blur rule (html:not(.lite) …) and come after it, or the
    // blur wins (first CI run of P-05 caught exactly this)
    const rt = css.indexOf('@media (prefers-reduced-transparency: reduce)');
    assert(rt > css.indexOf('@supports ((backdrop-filter') && /@media \(prefers-reduced-transparency: reduce\) \{\s*html:not\(\.lite\) \.glass-light,/.test(css) && /html:not\(\.lite\) \.glass-dark,\s*html\.lite \.glass-dark \{\s*background-color: var\(--color-hero-bg-mid\)/.test(css), 'reduced-transparency reset is weaker than (or before) the blur rule');
    assert(/html\.lite \.shadow-glass,\s*html\.lite \.shadow-soft \{[^}]*box-shadow: var\(--shadow-e1\)/.test(css), 'lite: large shadows not dropped');
    const layout = read('app/layout.tsx');
    assert(/<head>\s*\{\/\*[^*]*\*\/\}\s*<script dangerouslySetInnerHTML=\{\{ __html: LITE_MODE_SCRIPT \}\} \/>\s*<\/head>/.test(layout), 'lite script not inline in <head>');
    // unit: load the module (TS → CJS) and evaluate the inline script against fake devices
    const ts = require('typescript');
    const src = ts.transpileModule(read('lib/ui/lite-mode.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const m = new Module('lite-mode');
    m._compile(src, path.join(ROOT, 'lib/ui/lite-mode.ts'));
    const { LITE_MODE_SCRIPT, isLiteDevice } = m.exports;
    const run = (nav) => {
      const classes = new Set();
      new Function('navigator', 'document', LITE_MODE_SCRIPT)(nav, { documentElement: { classList: { add: (c) => classes.add(c) } } });
      return classes.has('lite');
    };
    const cases = [[{ deviceMemory: 2, hardwareConcurrency: 8 }, true], [{ deviceMemory: 4, hardwareConcurrency: 8 }, true], [{ deviceMemory: 8, hardwareConcurrency: 4 }, true], [{ deviceMemory: 8, hardwareConcurrency: 8, connection: { saveData: true } }, true], [{ deviceMemory: 8, hardwareConcurrency: 8 }, false], [{ hardwareConcurrency: 12 }, false], [{}, false]];
    const bad = cases.filter(([nav, want]) => run(nav) !== want || isLiteDevice(nav) !== want).map(([nav]) => JSON.stringify(nav));
    assert(bad.length === 0, `lite decision wrong for ${bad.join(', ')}`);
    assert(run(null) === false, 'script must swallow errors');
    assert(LITE_MODE_SCRIPT.length < 300, `lite script ${LITE_MODE_SCRIPT.length} chars (keep it tiny)`);
    return `${cases.length} device cases; script ${LITE_MODE_SCRIPT.length} chars`;
  });

  await test('C-06 no new npm package: dependency sets of package.json and package-lock unchanged (#44)', () => {
    const EXPECTED = '0bf48bf39d814c6414df932c48ad3531c7c8ca715a035777baa990123abb45eb'; // BRAND-1 baseline (0dd5c0e)
    const p = JSON.parse(read('package.json'));
    const l = JSON.parse(read('package-lock.json')).packages[''];
    const h = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
    assert(h({ d: p.dependencies, dd: p.devDependencies }) === EXPECTED, 'package.json dependencies changed');
    assert(h({ d: l.dependencies, dd: l.devDependencies }) === EXPECTED, 'package-lock root dependencies changed');
    return 'unchanged since 0dd5c0e';
  });

  await test('C-07 fonts + typography: Inter / Poppins 600·700 / Noto Sans Devanagari 400·600 via next/font; base 16px, 1.6 / 1.7 (hi); no sub-12px text in new components', () => {
    const layout = read('app/layout.tsx');
    assert(/Inter\(\{ subsets: \["latin"\], display: "swap", variable: "--font-inter" \}\)/.test(layout), 'Inter config');
    assert(/Poppins\(\{ subsets: \["latin", "devanagari"\], weight: \["600", "700"\], display: "swap", variable: "--font-poppins", preload: false \}\)/.test(layout), 'Poppins config');
    assert(/Noto_Sans_Devanagari\(\{ subsets: \["devanagari"\], weight: \["400", "600"\], display: "swap", variable: "--font-devanagari", preload: false \}\)/.test(layout), 'Noto Sans Devanagari config');
    assert(/font-size: 100%/.test(css) && /body \{[^}]*line-height: 1\.6;/.test(css) && /:lang\(hi\) \{\s*line-height: 1\.7;/.test(css), 'base size / line-heights');
    assert(/h1,\s*h2,\s*h3,\s*\.font-heading \{\s*font-family: var\(--font-heading\);/.test(css), 'headings use the heading face');
    const NEW = ['components/ui/glass.tsx', 'components/ui/pill-button.tsx', 'components/ui/gradient-hero.tsx', 'components/brand/wordmark.tsx', 'components/landing/landing-sections.tsx'];
    const small = NEW.filter((f) => /text-\[(?:[0-9]|1[01])px\]|text-\[0\.[0-6]\d*rem\]/.test(read(f)));
    assert(small.length === 0, `sub-12px text in ${small.join(', ')}`);
    return 'next/font only; Devanagari faces load on demand';
  });

  await test('C-08 touch targets ≥ 48 px on key buttons (static)', () => {
    const pill = read('components/ui/pill-button.tsx');
    assert(/inline-flex min-h-12 /.test(pill), 'PillLink / PillButton not min-h-12');
    const header = read('components/shell/header-bar.tsx');
    // UX-FIX-1: Sign in is always in the bar (48 px); the start action (sign-up open: Start free / closed: Explore SSC CGL)
    // is a 48 px pill from sm up; the menu button is 48 px
    assert(/className="min-h-12 rounded-full px-3"/.test(header) && /<PillLink href="\/auth\/signup" variant="outline"/.test(header) && /className="size-12 rounded-full lg:hidden"/.test(header), 'nav actions / menu button < 48 px');
    assert(/inline-flex min-h-12 items-center/.test(read('components/brand/wordmark.tsx')), 'wordmark link < 48 px');
    const legacy = read('components/ui/legacy/button.tsx');
    assert(/lg: "h-12 /.test(legacy), 'legacy lg button no longer 48 px');
    const submits = ['app/auth/login/login-form.tsx', 'app/auth/signup/signup-form.tsx', 'app/auth/forgot-password/forgot-password-form.tsx'].filter((f) => !/type="submit"[\s\S]{0,120}size="lg"/.test(read(f)));
    assert(submits.length === 0, `auth submit not size lg (48 px): ${submits.join(', ')}`);
    return 'pills 48 px, nav actions 48 px, auth submits 48 px';
  });

  await test('C-09 categorical tokens drive subject / section colours; no hue collapse into the primary', () => {
    // BRAND-3 (#84): legacy cyan-* is now the brand accent (cyan); the other hues stay on the categorical scales
    const LEGACY = { violet: 'cat-violet', purple: 'cat-violet', fuchsia: 'cat-violet', teal: 'cat-teal', cyan: 'accent', green: 'cat-teal', lime: 'cat-teal', rose: 'cat-rose', pink: 'cat-rose' };
    const bad = Object.entries(LEGACY).filter(([n, to]) => vars[`color-${n}-600`] !== `var(--color-${to}-600)`).map(([n]) => n);
    assert(bad.length === 0, `legacy hues not on categorical scales: ${bad.join(', ')}`);
    const sc = read('lib/ui/subject-colors.ts');
    for (const t of ['blue', 'teal', 'violet', 'cyan', 'rose', 'slate']) assert(sc.includes(`"bg-subject-${t}"`), `subject-colors misses ${t}`);
    assert(/subjectSwatch\(i\)/.test(read('components/ui/domain/result-summary.tsx')), 'result sections do not use categorical colours');
    assert(/subjectSwatchFor\(name\)/.test(read('components/ui/domain/topic-node.tsx')), 'subject nodes do not use categorical colours');
    return '6 categorical tokens; result sections + subject nodes';
  });

  await test('C-10 no banned claim phrases in public copy (CCPA coaching-advertising guidelines, 2024)', () => {
    const files = ['content', 'components/landing', 'components/public', 'app/about', 'app/cnts', 'app/contact', 'app/privacy', 'app/terms', 'app/pricing', 'app/auth']
      .flatMap((d) => walk(path.join(ROOT, d)))
      .concat(['app/page.tsx', 'app/exams/page.tsx', 'components/shell/site-footer.tsx', 'components/shell/header-bar.tsx'].map((f) => path.join(ROOT, f)));
    assert(files.length >= 20, `files ${files.length}`);
    const BANNED = [
      /guarantee/i, /\btoppers?\b/i, /\bAIR\s*-?\s*\d/i, /\brank\s*(?:#|no\.?\s*)?1\b/i, /server[- ]?(?:secure|authoritative)/i,
      /\b100\s*%\s*(?:result|success|selection)/i, /\bno\.?\s*1\b|\bnumber one\b|#1\b/i, /\bbest (?:coaching|institute|platform)\b/i,
      /\blakhs? of (?:students|aspirants|users)\b/i, /\bselection (?:assured|confirmed|guaranteed)\b/i,
    ];
    const hits = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const rx of BANNED) if (rx.test(s)) hits.push(`${rel(f)}: ${rx}`);
    }
    assert(hits.length === 0, hits.join('; '));
    return `${files.length} files, ${BANNED.length} patterns, 0 hits`;
  });

  await test('C-11 email templates: blue #1D4ED8 header with the text wordmark, system fonts only, /auth/confirm links exact', () => {
    const WANT = { 'confirm-signup': ['email', '/dashboard'], 'reset-password': ['recovery', '/auth/update-password'], 'magic-link': ['email', '/dashboard'], 'change-email': ['email_change', '/dashboard'], invite: ['invite', '/auth/update-password'] };
    const bad = [];
    for (const [name, [type, next]] of Object.entries(WANT)) {
      const s = read(`docs/auth/email-templates/${name}.html`);
      const url = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;
      const hrefs = [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      if (hrefs.length !== 2 || hrefs.some((h) => h !== url)) bad.push(`${name}: links differ from ${url}`);
      if (!/<td bgcolor="#1d4ed8"[^>]*>.*Courage Library<\/td>/.test(s)) bad.push(`${name}: header`);
      if (/@font-face|fonts\.googleapis|Poppins|Inter['",]/.test(s)) bad.push(`${name}: web font`);
      if (!/font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto/.test(s)) bad.push(`${name}: system font stack`);
    }
    assert(bad.length === 0, bad.join('; '));
    return '5 templates';
  });
}

// ---------- probe: real local production build (CI server-checks) ----------
async function probe() {
  const base = process.env.BASE_URL;
  assert(base && /^http:\/\/localhost:\d+$/.test(base), 'BASE_URL must be the local server (with-server.cjs)');
  const R = Module.createRequire(path.join(ROOT, 'package.json'));
  const { chromium } = R('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const CAPABLE = () => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  };
  try {
    await test('P-01 font payload on "/" (cold) ≤ 160 KB; no Devanagari file on an English page', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const fonts = [];
      page.on('response', async (r) => {
        if (r.request().resourceType() === 'font') {
          try {
            fonts.push({ url: r.url(), bytes: (await r.body()).length });
          } catch {
            /* aborted */
          }
        }
      });
      await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);
      await ctx.close();
      const total = fonts.reduce((a, f) => a + f.bytes, 0);
      assert(fonts.length >= 1, 'no font downloaded at all');
      assert(total <= 160 * 1024, `fonts ${(total / 1024).toFixed(1)} KB > 160 KB`);
      return `${fonts.length} file(s), ${(total / 1024).toFixed(1)} KB`;
    });

    await test('P-02 Hindi sample renders with the Devanagari web font (body) and Poppins (heading)', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => {
        const p = document.createElement('p');
        p.id = 'hi-body';
        p.lang = 'hi';
        p.textContent = 'सरकारी परीक्षा की तैयारी: रोज़ अभ्यास करें।';
        const h = document.createElement('h2');
        h.id = 'hi-head';
        h.lang = 'hi';
        h.textContent = 'मॉक टेस्ट और विश्लेषण';
        document.querySelector('main').prepend(h, p);
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.fonts].filter((f) => f.status === 'unloaded').map(() => null));
      });
      await page.waitForTimeout(1500);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument');
      const fontsFor = async (sel) => {
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
        const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
        return fonts;
      };
      const body = await fontsFor('#hi-body');
      const head = await fontsFor('#hi-head');
      const lh = await page.$eval('#hi-body', (el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
      await ctx.close();
      const bodyDeva = body.find((f) => f.isCustomFont && /devanagari/i.test(f.familyName));
      const headPoppins = head.find((f) => f.isCustomFont && /poppins/i.test(f.familyName));
      assert(bodyDeva, `body Hindi rendered with ${JSON.stringify(body.map((f) => [f.familyName, f.isCustomFont]))}`);
      assert(headPoppins, `heading Hindi rendered with ${JSON.stringify(head.map((f) => [f.familyName, f.isCustomFont]))}`);
      assert(Math.abs(lh - 1.7) < 0.05, `lang="hi" line-height ${lh.toFixed(2)} (want 1.7)`);
      return `body: ${bodyDeva.familyName}; heading: ${headPoppins.familyName}; line-height ${lh.toFixed(2)}`;
    });

    // P-03a…h (CI-FIX-1): one check ID per target, so CI's summary line (IDs only) names the failing target
    const TARGETS = [
      ['P-03a', 'home nav "Sign in" (always in the bar, UX-FIX-1)', '/', 'header a[href="/auth/login"]'],
      ['P-03b', 'home nav menu button', '/', 'header button[aria-label="Open menu"]'],
      // UX-FIX-1: the hero's primary action depends on sign-up (open: Start free / closed: Explore SSC CGL)
      ['P-03c', 'home hero primary CTA', '/', '#main-content section a[href="/auth/signup"], #main-content section a[href="/dashboard"], #main-content section a[href="/exams/ssc-cgl"]'],
      ['P-03d', 'home hero "Explore SSC CGL"', '/', '#main-content a[href="/exams/ssc-cgl"]'],
      ['P-03e', 'login submit', '/auth/login', 'form button[type="submit"]'],
      ['P-03f', 'login nav menu button', '/auth/login', 'header button[aria-label="Open menu"]'],
      ['P-03g', 'forgot-password submit', '/auth/forgot-password', 'form button[type="submit"]'],
      ['P-03h', 'home nav wordmark link', '/', 'header a[href="/"]'],
    ];
    const ctx360 = await browser.newContext({ viewport: { width: 360, height: 780 } });
    const page360 = await ctx360.newPage();
    let loaded = null;
    for (const [id, label, p, sel] of TARGETS) {
      await test(`${id} touch target ≥ 48 px at 360 px: ${label} (${p})`, async () => {
        // CI-FLAKE-1: on failure also print a SAFE reason sub-ID (run-quiet shows only check IDs): NAV, NOTVISIBLE or W<w>H<h>
        const why = (code, msg) => {
          console.log(`  FAIL  ${id}-${code}`);
          throw new Error(msg);
        };
        if (loaded !== p) {
          try {
            await page360.goto(base + p, { waitUntil: 'load', timeout: 60000 });
          } catch (e) {
            loaded = null;
            why('NAV', String(e && e.message));
          }
          loaded = p;
        }
        const el = page360.locator(sel).first();
        // bounded: a streamed (Suspense) element may attach just after "load"; the size rule itself is unchanged
        await el.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        const box = await el.boundingBox();
        if (!box) why('NOTVISIBLE', 'not visible');
        if (!(box.height >= 47.5 && box.width >= 47.5)) why(`W${Math.round(box.width)}H${Math.round(box.height)}`, `${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
        return `${box.width.toFixed(1)}×${box.height.toFixed(1)}`;
      });
    }
    await ctx360.close();

    await test('P-04 lite mode: low-end device → html.lite + no blur; capable device → blur on the public nav', async () => {
      const out = [];
      for (const [label, init, wantLite] of [['deviceMemory 2', () => Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }), true], ['capable', CAPABLE, false]]) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addInitScript(init);
        const page = await ctx.newPage();
        await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
        const r = await page.evaluate(() => {
          const nav = document.querySelector('header .glass-light');
          const cs = nav ? getComputedStyle(nav) : null;
          return { lite: document.documentElement.classList.contains('lite'), blur: cs ? cs.backdropFilter || cs.webkitBackdropFilter : 'missing' };
        });
        await ctx.close();
        assert(r.lite === wantLite, `${label}: html.lite = ${r.lite}`);
        assert(wantLite ? r.blur === 'none' : /blur/.test(r.blur), `${label}: nav backdrop-filter = ${r.blur}`);
        out.push(`${label}: lite ${r.lite}, blur ${r.blur === 'none' ? 'none' : 'on'}`);
      }
      return out.join('; ');
    });

    await test('P-05 prefers-reduced-transparency: reduce → no backdrop blur (capable device)', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(CAPABLE);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
      const r = await page.evaluate(() => ({
        matches: matchMedia('(prefers-reduced-transparency: reduce)').matches,
        blur: getComputedStyle(document.querySelector('header .glass-light')).backdropFilter,
      }));
      await ctx.close();
      assert(r.matches, 'emulation not applied');
      assert(r.blur === 'none', `backdrop-filter ${r.blur}`);
      return 'solid';
    });

    await test('P-06 "/" front-end budget (Moto-G-class: 412×823, 4x CPU, Fast 4G, cold): LCP ≤ 2.5 s, CLS ≤ 0.1, transfer ≤ 500 KB', async () => {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 165, downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9, uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        let bytes = 0;
        cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength || 0));
        await page.addInitScript(() => {
          window.__lcp = 0;
          window.__cls = 0;
          new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__cls += e.hadRecentInput ? 0 : e.value))).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(`${base}/`, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(3000);
        const m = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls }));
        runs.push({ ...m, kb: bytes / 1024 });
        await ctx.close();
      }
      const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
      const lcp = med('lcp');
      const cls = med('cls');
      const kb = med('kb');
      assert(lcp <= 2500 && cls <= 0.1 && kb <= 500, `LCP ${(lcp / 1000).toFixed(2)} s, CLS ${cls.toFixed(3)}, transfer ${kb.toFixed(0)} KB`);
      return `median of 3: LCP ${(lcp / 1000).toFixed(2)} s · CLS ${cls.toFixed(3)} · transfer ${kb.toFixed(0)} KB`;
    });
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log(`BRAND-2 Royal Blue + Amber + modern glass (${PROBE ? 'probe' : 'offline'})`);
  if (PROBE) await probe();
  else await offline();
  console.log(`\nBRAND-2: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`BRAND-2 SUITE ERROR ${e && e.message}`);
  process.exit(2);
});
