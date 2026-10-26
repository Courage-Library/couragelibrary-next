#!/usr/bin/env node
/**
 * BRAND-1 gate — Navy + Saffron colour system (decision #70). Offline, deterministic; reads source files only.
 *   B-01 the tokens in app/globals.css carry the approved values (primary, interactive, accent + text on it, accent
 *        text, success, error, text, muted, bg, surface, border) and the semantic roles point at them
 *   B-02 contrast: every registered pair (components/ui/contrast-pairs.json) and every brand pair meets WCAG 2.2 AA
 *        (text 4.5:1, UI 3:1), computed in code from the tokens        (--table prints the full table)
 *   B-03 no colour literals (hex / rgb / hsl / oklch …) outside the token file, its mirror config/brand.ts and the
 *        email templates — in app/, components/, lib/, config/, services/, types/, middleware.ts (admin included)
 *   B-04 config/brand.ts mirrors the tokens exactly (theme-color, manifest background, BRAND_PALETTE)
 *   B-05 email templates: still pass the AUTH-1 2b-2 template checks (T-12); 600px max, system font stack, navy header
 *        bar with the text logo, one navy button ≥ 44px with white text, plain-text fallback link under it, hidden
 *        preheader, "You received this because…" footer, light colour scheme declared; only token colours, each
 *        text pair ≥ 4.5:1; no images / tracking
 *   B-06 exam rules: the timer is neutral → accent only (no red / danger); answer review marks right / wrong with an
 *        icon + text, never colour alone
 *   B-07 at most ONE accent-filled CTA per screen (static: per file)
 * Run: node scripts/test_brand1.cjs [--table]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
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

// ---------- tokens ----------
const css = read('app/globals.css');
const vars = {};
for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
function resolveColor(name) {
  let v = name === 'white' ? '#ffffff' : vars[`color-${name}`];
  for (let i = 0; i < 6 && v && /^var\(--/.test(v); i++) v = vars[v.slice(6, -1)];
  return v;
}
const hexToRgb = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (rgb) => rgb.map((x) => x / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)).reduce((a, s, i) => a + s * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const NEED = { text: 4.5, large: 3, nontext: 3, reading: 7 }; // reading = question / article text (R13, #84)

console.log("BRAND-1 colour system (values: BRAND-3 Brand Colour System v3, decision #84)");

test('B-01 tokens carry the approved v3 values (#84); semantic roles point at them', () => {
  // BRAND-3 (decision #84, owner-final): Brand Colour System v3; the BRAND-1 architecture (single source, roles) is unchanged
  const SPEC = {
    brand: '#1d4ed8', // primary blue-700: THE primary action (R4 revised)
    'brand-hover': '#1e40af', // blue-800
    'primary-50': '#eff4ff', // tint
    interactive: '#1d4ed8',
    link: '#1d4ed8',
    focus: '#1d4ed8',
    'accent-400': '#22c7dc', // cyan accent (never text on white)
    'accent-700': '#0e7490', // cyan text / info
    'accent-50': '#e8fafc', // cyan tint
    'accent-text': '#0e7490',
    'info-700': '#0e7490',
    'gradient-start': '#5cd8e6',
    'gradient-mid': '#3b82f6',
    'gradient-end': '#5000f0', // violet: gradient end only
    'primary-900': '#0b1b4d', // navy ink / sidebar / hero
    fg: '#0b1b4d', // headings / question text (navy)
    'fg-secondary': '#33415c', // body (slate-700)
    'fg-muted': '#64708a', // muted (slate-500)
    canvas: '#f7f8fc',
    surface: '#ffffff',
    line: '#e6e9f2',
    'success-600': '#16a34a',
    'danger-600': '#dc2626',
    'warning-600': '#ea580c', // orange, not yellow
    'focus-surround': '#0a1230', // focus-mode surround
    'hero-accent-text': '#a1eaf2', // cyan-200: the lighter cyan keeps ≥ 4.5:1 over the whole hero
  };
  const bad = Object.entries(SPEC).filter(([t, v]) => (resolveColor(t) || '').toLowerCase() !== v).map(([t, v]) => `${t}: ${resolveColor(t)} (want ${v})`);
  for (const k of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
    if (vars[`color-info-${k}`] !== `var(--color-accent-${k})`) bad.push(`info-${k} is not the cyan accent family`);
    if (!/^#[0-9a-f]{6}$/.test(vars[`color-warning-${k}`] || '')) bad.push(`warning-${k} is not the orange scale`);
  }
  assert(bad.length === 0, bad.join('; '));
  return `${Object.keys(SPEC).length} v3 roles; info = cyan, warning = orange`;
});

const BRAND_PAIRS = [
  { use: 'Body text on surface', fg: 'fg', bg: 'surface', kind: 'text' },
  { use: 'Body text on page bg', fg: 'fg', bg: 'canvas', kind: 'text' },
  { use: 'Muted text on surface', fg: 'fg-muted', bg: 'surface', kind: 'text' },
  { use: 'Muted text on page bg', fg: 'fg-muted', bg: 'canvas', kind: 'text' },
  { use: 'Heading / brand text on surface', fg: 'brand', bg: 'surface', kind: 'text' },
  { use: 'White on navy (header bar, primary button)', fg: 'white', bg: 'brand', kind: 'text' },
  { use: 'Link on surface', fg: 'link', bg: 'surface', kind: 'text' },
  { use: 'Link on page bg', fg: 'link', bg: 'canvas', kind: 'text' },
  { use: 'Ink on the cyan accent fill', fg: 'on-accent', bg: 'accent-400', kind: 'text' },
  { use: 'Cyan text on surface', fg: 'accent-text', bg: 'surface', kind: 'text' },
  { use: 'Question text on surface (R13)', fg: 'fg', bg: 'surface', kind: 'reading' },
  { use: 'Question text on page bg (R13)', fg: 'fg', bg: 'canvas', kind: 'reading' },
  { use: 'Body (slate-700) on surface (R13)', fg: 'fg-secondary', bg: 'surface', kind: 'reading' },
  { use: 'Timer normal: blue on blue tint', fg: 'primary-800', bg: 'primary-50', kind: 'text' },
  { use: 'Timer last 5 min: orange on orange tint', fg: 'warning-800', bg: 'warning-50', kind: 'text' },
  { use: 'Accent text on page bg', fg: 'accent-text', bg: 'canvas', kind: 'text' },
  { use: 'Success text on surface', fg: 'success-700', bg: 'surface', kind: 'text' },
  { use: 'Error text on surface', fg: 'danger-700', bg: 'surface', kind: 'text' },
  { use: 'Error text on page bg', fg: 'danger-700', bg: 'canvas', kind: 'text' },
  { use: 'Focus ring on surface', fg: 'focus', bg: 'surface', kind: 'nontext' },
  { use: 'Focus ring on page bg', fg: 'focus', bg: 'canvas', kind: 'nontext' },
  { use: 'Primary button boundary on page bg', fg: 'brand', bg: 'canvas', kind: 'nontext' },
];

test('B-02 contrast: every registered and brand pair meets WCAG 2.2 AA (text 4.5:1, UI 3:1)', () => {
  const reg = JSON.parse(read('components/ui/contrast-pairs.json')).pairs;
  assert(reg.length >= 40, `registered pairs ${reg.length} (min 40)`); // GATE-HYGIENE-1
  const rows = [];
  const bad = [];
  for (const p of [...BRAND_PAIRS, ...reg]) {
    const a = hexToRgb(resolveColor(p.fg));
    const b = hexToRgb(resolveColor(p.bg));
    if (!a || !b) {
      bad.push(`${p.fg} / ${p.bg}: token not found`);
      continue;
    }
    const r = ratio(a, b);
    rows.push({ ...p, r });
    if (NEED[p.kind] && r < NEED[p.kind]) bad.push(`${p.use}: ${p.fg} / ${p.bg} = ${r.toFixed(2)} < ${NEED[p.kind]}`);
  }
  if (process.argv.includes('--table')) {
    console.log('\n| Use | fg / bg | Ratio | Needs | Result |\n|---|---|---|---|---|');
    for (const p of rows) {
      const need = NEED[p.kind];
      console.log(`| ${p.use} | \`${p.fg}\` ${resolveColor(p.fg)} / \`${p.bg}\` ${resolveColor(p.bg)} | ${p.r.toFixed(2)}:1 | ${need ? `${p.kind} ≥ ${need}` : p.kind} | ${need ? (p.r >= need ? 'pass' : '**FAIL**') : 'n/a'} |`);
    }
    console.log('');
  }
  assert(bad.length === 0, bad.join('\n        '));
  const req = rows.filter((p) => NEED[p.kind]);
  return `${req.length} pairs checked (${rows.length - req.length} decorative / disabled); min text ${Math.min(...rows.filter((p) => p.kind === 'text').map((p) => p.r)).toFixed(2)}:1, min UI ${Math.min(...rows.filter((p) => p.kind === 'nontext').map((p) => p.r)).toFixed(2)}:1`;
});

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(p);
    return /\.(tsx?|jsx?|css|mjs|cjs)$/.test(e.name) ? [p] : [];
  });
}
const HEX = /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
const FN = /(?<![a-zA-Z])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
const ALLOW = new Set(['app/globals.css', 'config/brand.ts']);

test('B-03 no colour literals outside the token file, its mirror and the email templates (admin included)', () => {
  const files = [...['app', 'components', 'lib', 'config', 'services', 'types'].flatMap((d) => walk(path.join(ROOT, d))), path.join(ROOT, 'middleware.ts')];
  assert(files.length >= 400, `files scanned ${files.length} (min 400)`); // GATE-HYGIENE-1
  const bad = [];
  for (const f of files) {
    const r = rel(f);
    if (ALLOW.has(r)) continue;
    const s = fs.readFileSync(f, 'utf8');
    const n = (s.match(HEX) || []).length + (s.match(FN) || []).length;
    if (n) bad.push(`${r}: ${n}`);
  }
  assert(bad.length === 0, bad.join('; '));
  return `${files.length} files; allow-list: ${[...ALLOW].join(', ')}, docs/auth/email-templates/*.html`;
});

test('B-04 config/brand.ts mirrors the tokens exactly', () => {
  const brand = read('config/brand.ts');
  const val = (k) => ((new RegExp(`export const ${k} = "(#[0-9a-fA-F]{6})"`).exec(brand) || [])[1] || '').toLowerCase();
  assert(val('BRAND_THEME_COLOR') === resolveColor('brand'), `theme colour ${val('BRAND_THEME_COLOR')} (want the brand blue-700)`);
  assert(val('BRAND_BACKGROUND_COLOR') === resolveColor('ink-50'), 'background colour');
  const pal = [...brand.matchAll(/"([a-z]+(?:-[a-z]+)*(?:-\d+)?)": "(#[0-9a-fA-F]{6})"/g)];
  assert(pal.length >= 5, `palette entries ${pal.length}`);
  const drift = pal.filter(([, t, h]) => resolveColor(t) !== h.toLowerCase()).map(([, t]) => t);
  assert(drift.length === 0, `drift: ${drift.join(', ')}`);
  const hexes = brand.match(HEX) || [];
  assert(hexes.length === pal.length + 2, `brand.ts has ${hexes.length} hex values; only the mirrored ones are allowed`);
  return `${pal.length + 2} mirrored values`;
});

test('B-05 email templates: 2b-2 checks + brand layout, token colours only, contrast, no colour-only meaning', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test_auth1_2b2.cjs')], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  assert(/PASS {2}T-12 email templates/.test(r.stdout || ''), 'AUTH-1 2b-2 T-12 (template checks) did not pass');
  const tokenHex = new Set(Object.keys(vars).filter((k) => k.startsWith('color-')).map((k) => resolveColor(k.slice(6))).filter(Boolean).map((h) => h.toLowerCase()));
  const files = fs.readdirSync(path.join(ROOT, 'docs/auth/email-templates')).filter((f) => f.endsWith('.html'));
  assert(files.length === 5, `templates ${files.length}`);
  const navy = resolveColor('interactive'); // BRAND-2: email header + button = primary-700 #1D4ED8
  const out = [];
  for (const f of files) {
    const s = read(`docs/auth/email-templates/${f}`);
    const bad = [];
    if (!/max-width:600px/.test(s)) bad.push('600px max');
    if (!/font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto/.test(s)) bad.push('system font stack');
    // BRAND-3 (#84): the wordmark carries a small decorative CYAN dot (accent-400) before the text — never amber
    if (!new RegExp(`<td bgcolor="${navy}"[^>]*>(?:<span style="[^"]*background-color:${resolveColor('accent-400')};[^"]*"></span>)?Courage Library</td>`).test(s)) bad.push('blue header bar with the text wordmark');
    const buttons = [...s.matchAll(/<td bgcolor="([^"]+)"[^>]*>\s*<a href="[^"]+" style="([^"]+)">([^<]+)<\/a>/g)];
    if (buttons.length !== 1) bad.push(`${buttons.length} buttons (want 1)`);
    else {
      const [, bg, style, label] = buttons[0];
      const pad = /padding:(\d+)px/.exec(style);
      const lh = /line-height:(\d+)px/.exec(style);
      if (bg !== navy) bad.push('button is not navy');
      if (!/color:#ffffff/.test(style)) bad.push('button text not white');
      if (!/min-height:44px/.test(style) || !pad || !lh || 2 * Number(pad[1]) + Number(lh[1]) < 44) bad.push('button < 44px tall');
      if (!label.trim()) bad.push('button has no text');
      const after = s.slice(s.indexOf(buttons[0][0]) + buttons[0][0].length);
      if (!/copy this link into your browser:<br>\s*<a href="\{\{ \.SiteURL \}\}\/auth\/confirm/.test(after)) bad.push('no plain-text fallback link under the button');
    }
    if (!/<div style="display:none;max-height:0;[^"]*">[^<]{10,}<\/div>/.test(s)) bad.push('hidden preheader');
    if (!/You received this because/.test(s)) bad.push('"You received this because…" footer');
    if (!/<meta name="color-scheme" content="light">/.test(s)) bad.push('color-scheme meta');
    if (/<img\b|url\(|<script\b|<link\b|utm_|pixel/i.test(s)) bad.push('image / tracking / external asset');
    const used = [...new Set((s.match(HEX) || []).map((h) => h.toLowerCase()))];
    const off = used.filter((h) => !tokenHex.has(h));
    if (off.length) bad.push(`non-token colours ${off.join(', ')}`);
    // every inline text colour against its background (card = surface, header/button = navy, footer = canvas)
    const pairs = [['#ffffff', navy], [resolveColor('fg'), '#ffffff'], [resolveColor('fg-muted'), '#ffffff'], [resolveColor('link'), '#ffffff'], [resolveColor('fg-muted'), resolveColor('canvas')]];
    for (const [a, b] of pairs) if (ratio(hexToRgb(a), hexToRgb(b)) < 4.5) bad.push(`contrast ${a} on ${b}`);
    if (bad.length) out.push(`${f}: ${bad.join(', ')}`);
  }
  assert(out.length === 0, out.join('\n        '));
  return `${files.length} templates; links unchanged (2b-2 T-12)`;
});

test('B-06 exam rules: timer blue → orange in the last 5 min (never red / flashing); a wrong answer → soft red + "Here\'s why"; icon + text', () => {
  const t = read('components/assessment/assessment-timer.tsx');
  assert(!/(?:bg|text|border)-(?:red|rose|danger)-/.test(t) && !/animate-/.test(t), 'timer uses red / danger or animates');
  // R8 + R13 (#84): BLUE normally; ONE quiet final-minutes state in ORANGE (warning); the state is also TEXT ("5 min left")
  assert(/phase === "final" \? "bg-warning-50 border-warning-600 text-warning-800" : "bg-primary-50 border-primary-200 text-primary-800"/.test(t), 'timer is not blue → orange');
  const qc = read('components/assessment/question-review-card.tsx');
  assert(/"bg-danger-50 border-danger-300 text-fg font-semibold"/.test(qc) && /Here&apos;s why/.test(qc) && /data-heres-why/.test(qc), 'review: soft red tint + a prominent "Here\'s why"');
  assert(/C\.heresWhy/.test(read('components/practice/practice-runner.tsx')) && /heresWhy: "Here's why"/.test(read('content/practice.ts')), 'practice: "Here\'s why" after a wrong answer');
  assert(/5 min left/.test(t) && /<Clock aria-hidden="true"/.test(t), 'timer state has no non-colour cue (text + icon)');
  const q = read('components/assessment/question-review-card.tsx');
  assert(/<CheckCircle2 className="w-4 h-4 shrink-0 text-success-700" aria-hidden="true" \/>/.test(q) && /<XCircle className="w-4 h-4 shrink-0 text-danger-700" aria-hidden="true" \/>/.test(q), 'option rows lack the correct / wrong icon');
  assert(/"Correct answer"/.test(q) && /"Your answer, incorrect"/.test(q) && /sr-only">Correct:/.test(q) && /sr-only">Incorrect:/.test(q), 'option rows / verdict lack the text label');
  const r = read('components/ui/domain/question-renderer.tsx');
  assert(/Your answer/.test(r) && /Correct answer/.test(r), 'design-system question renderer lost its labels');
  return 'timer accent-only; review: icon + text';
});

test('B-07 R4 (revised, #84): the primary action is solid blue-700; no accent / cyan CTA fill; pills never mix two solid primaries', () => {
  const pill = read('components/ui/pill-button.tsx');
  assert(/primary: "focus-ring bg-brand text-fg-inverse/.test(pill) && /"on-dark": "focus-ring-on-dark bg-surface text-primary-700/.test(pill) && !/accent/.test(pill.replace(/\/\*[\s\S]*?\*\//g, '')), 'pill variants: primary = solid brand blue; on-dark = white with blue text; no accent variant');
  const files = ['app', 'components'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => /\.tsx$/.test(f) && !/design-system/.test(f));
  const bad = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const accentCta = [...s.matchAll(/<(?:button|a|Link|Button|ButtonLink)\b[^>]*className="[^"]*\bbg-accent-(?:300|400|500|600)\b/g)].length;
    if (accentCta) bad.push(`${rel(f)}: ${accentCta} cyan-filled CTA (the primary is blue-700)`);
    const solid = (s.match(/variant="(?:primary|on-dark)"/g) || []).length;
    if (solid > 4) bad.push(`${rel(f)}: ${solid} solid pill primaries`);
  }
  const header = read('components/shell/header-bar.tsx');
  assert(!/<PillLink\b(?![^>]*variant="outline")[^>]*>/.test(header), 'the header uses outline pills only (the page owns the one primary)');
  assert(bad.length === 0, bad.join('; '));
  return `${files.length} files; primary = blue-700, header outline only`;
});

test('B-09 every solid primary is exactly blue-700 #1D4ED8 with hover blue-800 #1E40AF (fix 3) — no #2563EB primary fill anywhere', () => {
  assert(resolveColor('brand') === '#1d4ed8' && resolveColor('brand-hover') === '#1e40af', 'brand / brand-hover tokens');
  assert(/primary:\s*"bg-brand text-fg-inverse hover:bg-brand-hover /.test(read('components/ui/button.tsx')), 'DS Button primary is not bg-brand / hover:bg-brand-hover');
  assert(/primary: "focus-ring bg-brand text-fg-inverse shadow-soft hover:bg-brand-hover"/.test(read('components/ui/pill-button.tsx')), 'Pill primary is not bg-brand / hover:bg-brand-hover');
  const lb = read('components/ui/legacy/button.tsx');
  assert(/default: "bg-primary-700 text-white hover:bg-primary-800 /.test(lb) && /primary: "bg-blue-700 text-white hover:bg-blue-800 /.test(lb), 'legacy Button default / primary are not blue-700 / blue-800');
  const bad = [];
  for (const f of ['app', 'components'].flatMap((d) => walk(path.join(ROOT, d))).filter((x) => /\.tsx$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8');
    const n600 = (s.match(/(?:^|[\s"'`])bg-(?:primary|blue|indigo|sky)-600\b/g) || []).length;
    const lighterHover = (s.match(/hover:bg-(?:primary|blue|indigo|sky)-(?:500|600)\b/g) || []).length;
    if (n600) bad.push(`${rel(f)}: ${n600} × bg-*-600 (#2563EB) fill`);
    if (lighterHover) bad.push(`${rel(f)}: ${lighterHover} × lighter blue hover`);
  }
  assert(bad.length === 0, bad.join('; '));
  return 'DS / pill / legacy primaries = #1D4ED8 → #1E40AF; 0 #2563EB fills';
});

const AMBER_HEX =/#(?:f59e0b|fcd34d|fef3c7|b45309|fbbf24|d97706|fde68a|fffbeb|92400e|78350f|451a03|eab308|facc15|fde047|fef08a|fef9c3|ca8a04|a16207|854d0e)\b/i;
const AMBER_CLASS = /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|decoration|shadow|caret|accent|placeholder)-(?:amber|yellow)-\d/;

test('B-08 NO yellow / amber anywhere (#84): tokens reset, no amber / yellow class or hex in code, emails or email assets', () => {
  assert(/--color-amber-\*: initial;/.test(css) && /--color-yellow-\*: initial;/.test(css), 'amber / yellow namespaces are not reset in app/globals.css');
  assert(!Object.keys(vars).some((k) => /^color-(?:amber|yellow)-\d/.test(k)), 'an amber / yellow token is defined');
  const tokenHexes = Object.keys(vars).filter((k) => k.startsWith('color-')).map((k) => (vars[k] || '').toLowerCase()).filter((v) => v.startsWith('#'));
  const yellowish = tokenHexes.filter((h) => AMBER_HEX.test(h));
  assert(yellowish.length === 0, `amber / yellow token values: ${yellowish.join(', ')}`);
  const code = [...['app', 'components', 'lib', 'content', 'config', 'services', 'types'].flatMap((d) => walk(path.join(ROOT, d)))];
  const emails = [...fs.readdirSync(path.join(ROOT, 'docs/auth/email-templates')).map((f) => path.join(ROOT, 'docs/auth/email-templates', f)), ...fs.readdirSync(path.join(ROOT, 'docs/email-assets')).filter((f) => /\.html$/.test(f)).map((f) => path.join(ROOT, 'docs/email-assets', f))];
  const bad = [];
  for (const f of [...code, ...emails]) {
    const s = fs.readFileSync(f, 'utf8');
    if (AMBER_CLASS.test(s)) bad.push(`${rel(f)}: amber / yellow class`);
    if (AMBER_HEX.test(s)) bad.push(`${rel(f)}: amber / yellow hex`);
  }
  assert(bad.length === 0, bad.join('; '));
  return `${code.length} code files + ${emails.length} email files clean; amber / yellow reset`;
});

console.log(`\nBRAND-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
