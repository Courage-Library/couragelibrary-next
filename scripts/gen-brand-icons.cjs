#!/usr/bin/env node
/**
 * BRAND-ICONS-1 — generate lib/icons/brand-icon-data.ts from the 27 SVG masters in docs/design/brand-icons-v1/
 * (9 icons × idle / active / on-blue; owner-approved spec docs/design/BRAND_ICONS_V1_SPEC.md).
 * The masters are parsed and VALIDATED (fails loudly on anything unexpected):
 *   - root: viewBox 0 0 24 24, fill none, stroke-width 1.75, round caps / joins (stroke currentColor; on-blue #fff)
 *   - the same geometry in all three variants: outline paths (plain strokes), one signature triangle path (optional
 *     transform) and, for todays-mock only, a depth path (transform) behind it
 *   - variant fills: idle triangle = outline (stroke currentColor), active = url(#cl-g-…) (todays-mock: url(#cl-gc-…)),
 *     on-blue = #fff; todays-mock depth: idle stroke #C9CDF2, active fill #4B00E6, on-blue fill rgba(255,255,255,.35)
 *   - the gradient stops are the fixed brand values (logo: #22E3F2 → #475BFF → #4B00E6; cyan: #3FF0F7 → #1FC9E8)
 * Usage: node scripts/gen-brand-icons.cjs          (writes the data module)
 *        node scripts/gen-brand-icons.cjs --check  (fails if the committed module differs from the masters)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// BRAND_ICONS_MASTERS_DIR: the gate's negative controls parse mutated copies of the masters (read-only)
const DIR = process.env.BRAND_ICONS_MASTERS_DIR || path.join(ROOT, 'docs/design/brand-icons-v1');
const OUT = path.join(ROOT, 'lib/icons/brand-icon-data.ts');
const NAMES = ['home', 'learn', 'practice', 'mocks', 'todays-mock', 'current-affairs', 'results', 'mistake-vault', 'memory-lock'];
const VARIANTS = [['idle', ''], ['active', '-active'], ['onBlue', '-on-blue']];
const LOGO_STOPS = [['0', '#22E3F2'], ['.55', '#475BFF'], ['1', '#4B00E6']];
const CYAN_STOPS = [['0', '#3FF0F7'], ['1', '#1FC9E8']];

const attrs = (s) => Object.fromEntries([...s.matchAll(/([a-zA-Z][a-zA-Z0-9:-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
function fail(msg) {
  throw new Error(`gen-brand-icons: ${msg}`);
}

/** parse one master → { root, stops: { g, gc }, paths: [attrs] } */
function parse(file) {
  const s = fs.readFileSync(file, 'utf8');
  const rootM = s.match(/^<svg\b([^>]*)>/);
  if (!rootM || !/<\/svg>\s*$/.test(s)) fail(`${path.basename(file)}: not a single <svg> document`);
  const root = attrs(rootM[1]);
  const stops = {};
  for (const g of s.matchAll(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient>/g)) {
    const a = attrs(g[1]);
    const kind = /^cl-gc-/.test(a.id) ? 'gc' : /^cl-g-/.test(a.id) ? 'g' : fail(`${path.basename(file)}: unknown gradient ${a.id}`);
    if (a.x1 !== '0' || a.y1 !== '0' || a.x2 !== '1' || a.y2 !== '1') fail(`${path.basename(file)}: gradient direction`);
    stops[kind] = { id: a.id, stops: [...g[2].matchAll(/<stop\b([^>]*)\/>/g)].map((m) => [attrs(m[1]).offset, attrs(m[1])['stop-color']]) };
  }
  const body = s.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const tags = [...body.matchAll(/<(\w+)\b([^>]*?)\/>/g)];
  if (tags.some((t) => t[1] !== 'path')) fail(`${path.basename(file)}: only <path> elements are supported`);
  if (body.replace(/<path\b[^>]*?\/>/g, '').trim()) fail(`${path.basename(file)}: unexpected content`);
  return { root, stops, paths: tags.map((t) => attrs(t[2])) };
}

function build() {
  const files = fs.readdirSync(DIR).filter((f) => /\.svg$/.test(f)).sort();
  const want = NAMES.flatMap((n) => VARIANTS.map(([, suf]) => `icon-${n}${suf}.svg`)).sort();
  if (JSON.stringify(files) !== JSON.stringify(want)) fail(`masters are not exactly the 27 files: ${files.join(', ')}`);
  const icons = {};
  for (const name of NAMES) {
    const v = Object.fromEntries(VARIANTS.map(([k, suf]) => [k, parse(path.join(DIR, `icon-${name}${suf}.svg`))]));
    for (const [k, p] of Object.entries(v)) {
      const r = p.root;
      if (r.viewBox !== '0 0 24 24' || r.fill !== 'none' || r['stroke-width'] !== '1.75' || r['stroke-linecap'] !== 'round' || r['stroke-linejoin'] !== 'round') fail(`${name} ${k}: root attributes`);
      if (name !== 'todays-mock' && r.stroke !== (k === 'onBlue' ? '#fff' : 'currentColor')) fail(`${name} ${k}: root stroke ${r.stroke}`);
      for (const [kind, stops] of [['g', LOGO_STOPS], ['gc', CYAN_STOPS]]) if (!p.stops[kind] || JSON.stringify(p.stops[kind].stops) !== JSON.stringify(stops)) fail(`${name} ${k}: ${kind} stops are not the brand values`);
    }
    const geo = (p) => p.paths.map((a) => `${a.d}|${a.transform || ''}`).join('\n');
    if (geo(v.idle) !== geo(v.active) || geo(v.idle) !== geo(v.onBlue)) fail(`${name}: geometry differs between variants`);
    const n = v.idle.paths.length;
    let outlines;
    let triangle;
    let depth = null;
    if (name === 'todays-mock') {
      if (n !== 2) fail(`${name}: expected depth + triangle`);
      const [di, da, db] = [v.idle.paths[0], v.active.paths[0], v.onBlue.paths[0]];
      if (!(di.fill === 'none' && di.stroke === '#C9CDF2' && da.fill === '#4B00E6' && da.stroke === 'none' && db.fill === 'rgba(255,255,255,.35)' && db.stroke === 'none' && di.transform)) fail(`${name}: depth fills`);
      depth = { d: di.d, transform: di.transform };
      outlines = [];
    } else {
      outlines = v.idle.paths.slice(0, n - 1).map((a, i) => {
        for (const p of [a, v.active.paths[i], v.onBlue.paths[i]]) if (Object.keys(p).some((key) => key !== 'd')) fail(`${name}: an outline path carries ${Object.keys(p).join(',')}`);
        return a.d;
      });
    }
    const [ti, ta, tb] = [v.idle.paths[n - 1], v.active.paths[n - 1], v.onBlue.paths[n - 1]];
    const grad = name === 'todays-mock' ? 'gc' : 'g';
    if (!(ti.fill === 'none' && ti.stroke === 'currentColor')) fail(`${name}: idle triangle`);
    if (!(ta.fill === `url(#${v.active.stops[grad].id})` && ta.stroke === 'none')) fail(`${name}: active triangle fill ${ta.fill}`);
    if (!(tb.fill === '#fff' && tb.stroke === 'none')) fail(`${name}: on-blue triangle fill ${tb.fill}`);
    triangle = { d: ti.d, ...(ti.transform ? { transform: ti.transform } : {}) };
    icons[name] = { outlines, triangle, ...(depth ? { depth } : {}), gradient: grad === 'gc' ? 'cyan' : 'logo' };
  }
  const lines = [
    '// GENERATED by scripts/gen-brand-icons.cjs from docs/design/brand-icons-v1/*.svg (27 masters) — do not edit by hand.',
    '// BRAND-ICONS-1 (owner-approved spec docs/design/BRAND_ICONS_V1_SPEC.md). Check: node scripts/gen-brand-icons.cjs --check',
    '',
    `export const BRAND_ICON_NAMES = ${JSON.stringify(NAMES)} as const;`,
    'export type BrandIconName = (typeof BRAND_ICON_NAMES)[number];',
    '',
    'export interface BrandIconShape {',
    '  /** plain outline strokes (currentColor) */',
    '  outlines: readonly string[];',
    '  /** the signature triangle: outline when idle, gradient when active, solid currentColor on blue */',
    '  triangle: { d: string; transform?: string };',
    '  /** todays-mock only: the violet depth layer behind the triangle */',
    '  depth?: { d: string; transform: string };',
    '  gradient: "logo" | "cyan";',
    '}',
    '',
    '/** fixed brand gradient stops (logo colours — allowed on active icons and the Today\'s mock button only) */',
    `export const BRAND_GRADIENTS = ${JSON.stringify({ logo: LOGO_STOPS.map(([o, c]) => ({ offset: o, color: c })), cyan: CYAN_STOPS.map(([o, c]) => ({ offset: o, color: c })) })} as const;`,
    '',
    '/** todays-mock depth layer per variant (from the masters) */',
    'export const BRAND_DEPTH = { idleStroke: "#C9CDF2", activeFill: "#4B00E6", onBlueOpacity: 0.35 } as const;',
    '',
    'export const BRAND_ICONS: Record<BrandIconName, BrandIconShape> = {',
    ...NAMES.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(icons[n])},`),
    '};',
    '',
  ];
  return lines.join('\n');
}

if (require.main === module) {
  const out = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== out) {
      console.log('FAIL  gen-brand-icons --check: lib/icons/brand-icon-data.ts differs from the masters (run node scripts/gen-brand-icons.cjs)');
      process.exit(1);
    }
    console.log('PASS  gen-brand-icons --check: the data module matches the 27 masters');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, out);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${NAMES.length} icons)`);
  }
}
module.exports = { build, parse, NAMES };
