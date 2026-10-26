/**
 * UX-1a design ratchet (decision #40). Offline; reads source files only.
 *
 * Counts legacy design debt in app/ + components/ (excluding admin: app/admin/**, components/admin/**):
 *   rawColor        raw hex / rgb() / hsl() / oklch() colour literals outside the token file (app/globals.css)
 *   paletteClass    Tailwind palette colour classes not mapped to tokens (bg-blue-600, text-slate-500/80, …)
 *   darkClass       `dark:` variant classes (inert since UX-1a; removed in UX-1b)
 *   smallText       text sizes below 12 px (text-[10px], text-[0.6rem], fontSize: 11)
 *   legacyImport    imports of components/ui/legacy/* (pre-UX-1 primitives; migrate in UX-1b)
 *
 *   R-1 no metric rises above docs/reports/ux/UX1_DESIGN_RATCHET.json
 *   R-2 the design system itself scores ZERO on every metric (components/ui/** except legacy/, lib/format)
 *   R-3 dark mode is disabled at the source: `@custom-variant dark` bound to [data-theme=dark], no
 *       prefers-color-scheme anywhere, nothing sets data-theme="dark", <html> has no dark class
 *   R-4 (BRAND-2 amendment) fonts: exactly Inter + Poppins + Noto Sans Devanagari via next/font in the root layout
 *       (self-hosted, only Inter preloaded); no external font requests
 *   R-5 contrast: every pair in components/ui/contrast-pairs.json meets its WCAG threshold, computed from the tokens
 *   R-7 config/brand.ts (theme-color meta, manifest, BRAND_PALETTE) mirrors the tokens exactly; it is not a second source
 *   R-8 (BRAND-1 amendment, decision #70) single token source: every legacy Tailwind palette name (slate-*, blue-*, …)
 *       is redefined in app/globals.css as var(--color-<brand scale>-N), never a raw value, so palette classes cannot
 *       reintroduce off-brand colours; strengthened by the contrast gates (R-5 and scripts/test_brand1.cjs)
 *   R-6 tokens never collide with legacy class names (no bare --color-primary / --color-card; no override of
 *       Tailwind's rounded-sm..2xl / shadow-sm..2xl) and the cn() registry lists every text / radius / shadow token
 *
 * Run:  node scripts/test_design_ratchet.cjs            (check)
 *       node scripts/test_design_ratchet.cjs --write    (record a new baseline; refused if any metric rose)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(ROOT, 'docs/reports/ux/UX1_DESIGN_RATCHET.json');
const TOKENS = path.join(ROOT, 'app/globals.css');
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

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(p);
    return /\.(tsx?|jsx?|css|mjs|cjs)$/.test(e.name) ? [p] : [];
  });
}

// ---------------------------------------------------------------- metrics
const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PROPS = 'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|accent|caret|inset-shadow|drop-shadow';
const RX = {
  rawColor: [
    /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g,
    // (?<![a-zA-Z]) not \b: Tailwind arbitrary values join with "_" (shadow-[0_4px_16px_rgba(…)])
    /(?<![a-zA-Z])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g,
  ],
  paletteClass: [new RegExp(`(?<![\\w-])(?:${PROPS})-(?:${PALETTE})-(?:50|[1-9]00|950)(?:\\/\\d+)?(?![\\w-])`, 'g')],
  darkClass: [/(?<![\w-])dark:/g],
};

function smallTextCount(src) {
  let n = 0;
  for (const m of src.matchAll(/text-\[(\d*\.?\d+)px\]/g)) if (parseFloat(m[1]) < 12) n++;
  for (const m of src.matchAll(/text-\[(\d*\.?\d+)rem\]/g)) if (parseFloat(m[1]) < 0.75) n++;
  for (const m of src.matchAll(/fontSize\s*:\s*["']?(\d*\.?\d+)(px)?["']?\s*[,}]/g)) if (parseFloat(m[1]) < 12) n++;
  return n;
}

function measure(file) {
  const src = fs.readFileSync(file, 'utf8');
  const r = rel(file);
  const out = { rawColor: 0, paletteClass: 0, darkClass: 0, smallText: smallTextCount(src), legacyImport: 0 };
  if (r !== 'app/globals.css') for (const rx of RX.rawColor) out.rawColor += (src.match(rx) || []).length;
  out.paletteClass = (src.match(RX.paletteClass[0]) || []).length;
  out.darkClass = (src.match(RX.darkClass[0]) || []).length;
  out.legacyImport = (src.match(/["']@\/components\/ui\/legacy\/[\w-]+["']/g) || []).length;
  return out;
}

const METRICS = ['rawColor', 'paletteClass', 'darkClass', 'smallText', 'legacyImport'];
const inScope = (r) => !r.startsWith('app/admin/') && !r.startsWith('components/admin/');
// UX-1b: the app shell and the shared brand logo are held to the same zero standard
const isDesignSystem = (r) =>
  (r.startsWith('components/ui/') && !r.startsWith('components/ui/legacy/')) || r.startsWith('lib/format/') || r.startsWith('components/shell/') || r.startsWith('components/brand/') ||
  // GAP2-4b: the admin syllabus editor is built on the design system (admin is otherwise outside the ratchet)
  r.startsWith('components/admin/syllabus/') || r.startsWith('app/admin/syllabus/');

const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))].filter((f) => inScope(rel(f)));
const totals = Object.fromEntries(METRICS.map((m) => [m, 0]));
const byArea = {};
const perFile = {};
for (const f of files) {
  const m = measure(f);
  const r = rel(f);
  perFile[r] = m;
  const area = r.split('/').slice(0, 2).join('/');
  byArea[area] = byArea[area] || Object.fromEntries(METRICS.map((k) => [k, 0]));
  for (const k of METRICS) {
    totals[k] += m[k];
    byArea[area][k] += m[k];
  }
}

// ---------------------------------------------------------------- tokens + contrast helpers
const css = fs.readFileSync(TOKENS, 'utf8');
const vars = {};
for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
function resolveColor(name) {
  let v = name === 'white' ? '#ffffff' : vars[`color-${name}`];
  for (let i = 0; i < 5 && v && /^var\(--/.test(v); i++) v = vars[v.slice(6, -1)];
  return v;
}
function hexToRgb(h) {
  const m = /^#([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (rgb) =>
  rgb
    .map((x) => x / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
    .reduce((a, s, i) => a + s * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const NEED = { text: 4.5, large: 3, nontext: 3, reading: 7 }; // reading = question / article text (R13, #84)

// ---------------------------------------------------------------- tests
console.log('UX-1a design ratchet');
const WRITE = process.argv.includes('--write');
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

// GATE-HYGIENE-1: missing dirs would lower every total and let the ratchet pass
test('R-0 minimum coverage: app/ and components/ exist; ≥ 200 in-scope files scanned', () => {
  assert(fs.existsSync(path.join(ROOT, 'app')) && fs.existsSync(path.join(ROOT, 'components')) && files.length >= 200, `in-scope files ${files.length} (min 200)`);
  return `${files.length} files`;
});

test('R-1 ratchet: no metric rises above the recorded baseline (app/ + components/, admin excluded)', () => {
  assert(base, `baseline missing: run with --write to record ${rel(BASELINE)}`);
  const rose = METRICS.filter((k) => totals[k] > base.totals[k]);
  if (rose.length) {
    const top = (k) =>
      Object.entries(perFile)
        .filter(([, m]) => m[k] > 0)
        .sort((a, b) => b[1][k] - a[1][k])
        .slice(0, 5)
        .map(([f, m]) => `${f}: ${m[k]}`)
        .join(', ');
    throw new Error(rose.map((k) => `${k} rose ${base.totals[k]} → ${totals[k]} (top files: ${top(k)})`).join('\n        '));
  }
  const fell = METRICS.filter((k) => totals[k] < base.totals[k]);
  return METRICS.map((k) => `${k} ${totals[k]}`).join(' · ') + (fell.length ? ` (lower than baseline: ${fell.join(', ')}; re-record with --write)` : '');
});

test('R-2 the design system scores zero on every metric (components/ui/** except legacy/, lib/format, components/shell, components/brand, admin syllabus editor)', () => {
  const ds = ['components/ui', 'lib/format', 'components/shell', 'components/brand', 'components/admin/syllabus', 'app/admin/syllabus'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => isDesignSystem(rel(f)));
  assert(ds.length >= 30, `expected ≥30 design-system files, found ${ds.length}`);
  const bad = [];
  for (const f of ds) {
    const m = measure(f);
    for (const k of METRICS) if (m[k]) bad.push(`${rel(f)}: ${k} ${m[k]}`);
  }
  assert(bad.length === 0, bad.join('\n        '));
  return `${ds.length} files`;
});

test('R-3 dark mode disabled at the source (inert dark: variant, no prefers-color-scheme, never activated)', () => {
  assert(/@custom-variant dark \(&:where\(\[data-theme=dark\], \[data-theme=dark\] \*\)\);/.test(css), 'globals.css must bind the dark variant to [data-theme=dark]');
  assert(/color-scheme:\s*light/.test(css), ':root must declare color-scheme: light');
  const all = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'lib'))];
  assert(all.length >= 300, `files scanned ${all.length} (min 300)`); // GATE-HYGIENE-1
  const bad = [];
  for (const f of all) {
    const s = fs.readFileSync(f, 'utf8');
    if (/prefers-color-scheme/.test(s)) bad.push(`${rel(f)}: prefers-color-scheme`);
    // the token file names [data-theme=dark] only as the inert variant selector
    if (rel(f) !== 'app/globals.css' && /data-theme\s*=\s*["']?dark|dataset\.theme\s*=|setAttribute\(\s*["']data-theme/.test(s)) bad.push(`${rel(f)}: sets data-theme`);
    if (/classList\.(add|toggle)\(\s*["']dark["']/.test(s)) bad.push(`${rel(f)}: toggles a dark class`);
  }
  const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
  if (/<html[^>]*\bdark\b/.test(layout)) bad.push('app/layout.tsx: <html> has a dark class');
  assert(bad.length === 0, bad.join('\n        '));
});

// BRAND-2 amendment (decision #71, bilingual typography): the font set is exactly Inter (body / UI), Poppins 600/700
// (headings) and Noto Sans Devanagari 400/600 (Hindi), all through next/font in the root layout (self-hosted at build),
// with only Inter preloaded. Still: no external font request, no other family, no second next/font import.
test('R-4 fonts: exactly Inter + Poppins + Noto Sans Devanagari via next/font (self-hosted, one import), no external requests', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
  assert(/import \{ Inter, Noto_Sans_Devanagari, Poppins \} from "next\/font\/google"/.test(layout), 'the root layout must import exactly Inter, Noto_Sans_Devanagari and Poppins from next/font/google');
  assert(/variable: "--font-inter"/.test(layout) && /inter\.variable/.test(layout), '--font-inter must be set on <html>');
  assert(/variable: "--font-poppins", preload: false/.test(layout) && /variable: "--font-devanagari", preload: false/.test(layout), 'Poppins and Noto Sans Devanagari must not be preloaded');
  assert(/--font-sans: var\(--font-inter\), var\(--font-devanagari\)/.test(css) && /--font-heading: var\(--font-poppins\)/.test(css), '--font-sans / --font-heading stacks');
  const all = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'lib'))];
  assert(all.length >= 300, `files scanned ${all.length} (min 300)`); // GATE-HYGIENE-1
  const bad = [];
  for (const f of all) {
    const s = fs.readFileSync(f, 'utf8');
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|@import\s+url\(/.test(s)) bad.push(`${rel(f)}: external font request`);
    if (rel(f) !== 'app/layout.tsx' && /from ["']next\/font\/|\b(?:Noto_Sans_Devanagari|Poppins|Inter)\(\{/.test(s)) bad.push(`${rel(f)}: font loaded outside the root layout`);
  }
  const fontImports = (layout.match(/from "next\/font\/(google|local)"/g) || []).length;
  assert(fontImports === 1, `expected exactly one next/font import in the root layout, found ${fontImports}`);
  assert(bad.length === 0, bad.join('\n        '));
});

test('R-5 contrast: every registered pair meets WCAG 2.2 AA (computed from app/globals.css)', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'components/ui/contrast-pairs.json'), 'utf8')).pairs;
  assert(Array.isArray(reg) && reg.length >= 40, `contrast pairs registered: ${reg && reg.length} (min 40)`); // GATE-HYGIENE-1
  const bad = [];
  const rows = [];
  for (const p of reg) {
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
    console.log('\n| Use | fg / bg | Ratio | Requirement | Result |\n|---|---|---|---|---|');
    for (const p of rows) {
      const need = NEED[p.kind];
      // AAA exists for text (7:1) and large text (4.5:1) only; non-text (1.4.11) is pass / fail
      const aaa = p.kind === 'text' ? 7 : p.kind === 'large' ? 4.5 : Infinity;
      const res = need ? (p.r >= need ? (p.r >= aaa ? 'AAA' : p.kind === 'nontext' ? 'Pass' : 'AA') : '**FAIL**') : p.kind === 'decorative' ? 'decorative only' : 'exempt (disabled)';
      console.log(`| ${p.use} | \`${p.fg}\` / \`${p.bg}\` | ${p.r.toFixed(2)}:1 | ${need ? `${p.kind} ≥ ${need}` : p.kind} | ${res} |`);
    }
    console.log('');
  }
  assert(bad.length === 0, bad.join('\n        '));
  return `${rows.length} pairs; min text ratio ${Math.min(...rows.filter((p) => p.kind === 'text').map((p) => p.r)).toFixed(2)}:1`;
});

test('R-6 token names are collision-free and registered in cn()', () => {
  const bad = [];
  for (const forbidden of ['color-primary', 'color-card', 'color-accent', 'color-border', 'color-muted', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-2xl', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl']) {
    if (new RegExp(`--${forbidden}\\s*:`).test(css)) bad.push(`globals.css overrides --${forbidden} (would restyle legacy pages)`);
  }
  const cn = fs.readFileSync(path.join(ROOT, 'components/ui/cn.ts'), 'utf8');
  const listed = (key) => (new RegExp(`${key}: \\[([^\\]]*)\\]`).exec(cn) || [, ''])[1];
  const tok = (prefix) => [...css.matchAll(new RegExp(`--${prefix}-([\\w-]+?)\\s*:`, 'g'))].map((m) => m[1]).filter((n) => !n.includes('--'));
  for (const k of ['text', 'radius', 'shadow']) assert(tok(k).length >= 1, `no --${k}-* tokens found in globals.css`); // GATE-HYGIENE-1
  for (const t of tok('text')) if (!listed('text').includes(`"${t}"`)) bad.push(`cn() text registry misses "${t}"`);
  for (const t of tok('radius')) if (!listed('radius').includes(`"${t}"`)) bad.push(`cn() radius registry misses "${t}"`);
  for (const t of tok('shadow')) if (!listed('shadow').includes(`"${t}"`)) bad.push(`cn() shadow registry misses "${t}"`);
  assert(bad.length === 0, bad.join('\n        '));
});

test('R-7 brand colours outside CSS (theme-color, manifest) mirror the tokens', () => {
  const brand = fs.readFileSync(path.join(ROOT, 'config/brand.ts'), 'utf8');
  const val = (k) => ((new RegExp(`export const ${k} = "(#[0-9a-fA-F]{6})"`).exec(brand) || [])[1] || '').toLowerCase();
  // BRAND-3 (#84): theme-color = the brand primary (blue-700)
  assert(val('BRAND_THEME_COLOR') === resolveColor('brand').toLowerCase(), `BRAND_THEME_COLOR ${val('BRAND_THEME_COLOR')} != brand ${resolveColor('brand')}`);
  assert(val('BRAND_BACKGROUND_COLOR') === resolveColor('ink-50').toLowerCase(), 'BRAND_BACKGROUND_COLOR != ink-50');
  const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
  assert(/themeColor: BRAND_THEME_COLOR/.test(layout), 'layout themeColor must use BRAND_THEME_COLOR');
  const manifest = fs.readFileSync(path.join(ROOT, 'app/manifest.ts'), 'utf8');
  assert(/theme_color: BRAND_THEME_COLOR/.test(manifest) && /background_color: BRAND_BACKGROUND_COLOR/.test(manifest), 'manifest colours must use config/brand.ts');
  // BRAND-1: every BRAND_PALETTE entry equals its token
  const palette = [...brand.matchAll(/"([a-z]+(?:-[a-z]+)*(?:-\d+)?)": "(#[0-9a-fA-F]{6})"/g)];
  assert(palette.length >= 5, `BRAND_PALETTE entries ${palette.length} (min 5)`); // GATE-HYGIENE-1
  const drift = palette.filter(([, tok, hex]) => (resolveColor(tok) || '').toLowerCase() !== hex.toLowerCase()).map(([, tok, hex]) => `${tok}: ${hex} != ${resolveColor(tok)}`);
  assert(drift.length === 0, drift.join('; '));
});

test('R-8 single token source: legacy palette names resolve to brand scales via var(), never raw values (BRAND-1)', () => {
  // BRAND-3 (#84): amber and yellow are NOT aliased — their namespaces are reset (no colour at all); every other legacy
  // name resolves to a brand scale; warning (v3 orange) is a brand scale of its own
  const LEGACY = 'slate|gray|zinc|neutral|stone|red|orange|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
  const BRAND = ['primary', 'accent', 'ink', 'success', 'danger', 'warning', 'cat-teal', 'cat-violet', 'cat-rose', 'cat-slate'];
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  const bad = [];
  let n = 0;
  for (const name of LEGACY.split('|')) {
    for (const k of shades) {
      const v = vars[`color-${name}-${k}`];
      n++;
      const m = /^var\(--color-([a-z-]+)-(\d+)\)$/.exec(v || '');
      if (!m || !BRAND.includes(m[1]) || m[2] !== k) bad.push(`${name}-${k}: ${v === undefined ? 'missing' : 'not a brand var()'}`);
    }
  }
  for (const k of shades) for (const b of BRAND) if (!/^#[0-9a-f]{6}$/i.test(resolveColor(`${b}-${k}`) || '')) bad.push(`${b}-${k} does not resolve to a hex value`);
  for (const k of shades) if (vars[`color-info-${k}`] !== `var(--color-accent-${k})`) bad.push(`info-${k} is not the cyan accent`);
  for (const f of ['amber', 'yellow']) {
    if (!css.includes(`--color-${f}-*: initial;`)) bad.push(`${f} namespace not reset`);
    if (shades.some((k) => vars[`color-${f}-${k}`] !== undefined)) bad.push(`${f} still defines colours`);
  }
  assert(n === 20 * 11, `checked ${n}`); // GATE-HYGIENE-1
  assert(bad.length === 0, bad.slice(0, 20).join('; '));
  return `${n} legacy palette names → brand tokens; amber / yellow reset; info → cyan, warning = orange scale`;
});

if (WRITE) {
  if (base && METRICS.some((k) => totals[k] > base.totals[k])) {
    console.log('\nREFUSED: a metric rose; the baseline can only go down.');
    process.exit(1);
  }
  const out = {
    $comment: 'UX-1a design ratchet baseline (decision #40). Counts may only go down. Scope: app/ + components/, excluding app/admin and components/admin. Written by scripts/test_design_ratchet.cjs --write.',
    recordedAt: new Date().toISOString().slice(0, 10),
    totals,
    byArea: Object.fromEntries(Object.entries(byArea).filter(([, m]) => METRICS.some((k) => m[k])).sort()),
  };
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nbaseline written: ${rel(BASELINE)}`);
}

console.log(`\nUX-1a design ratchet: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
