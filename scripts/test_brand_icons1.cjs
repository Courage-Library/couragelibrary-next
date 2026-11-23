#!/usr/bin/env node
/**
 * BRAND-ICONS-1 gate (owner spec docs/design/BRAND_ICONS_V1_SPEC.md + decisions 23 Nov 2026) — offline, no network.
 *   B-1  masters: the 27 SVG masters parse and validate (scripts/gen-brand-icons.cjs); the committed data module is in
 *        sync with them (--check)
 *   B-2  component = masters: <BrandIcon> for all 9 × idle / active / onBlue draws the masters' geometry (paths +
 *        transforms), root 24 grid / 1.75 / round caps + joins / aria-hidden; idle has NO <defs> and no id; active fills
 *        the triangle with the masters' gradient stops (todays-mock: cyan front + #4B00E6 depth); onBlue = currentColor
 *        (the masters' #fff superseded), depth at 35 %; onBlue beats active; < 18 px never renders a gradient; the six
 *        small-signature icons never render below 18 px; active="current" = idle markup + the gradient wired to CSS
 *   B-3  unique gradient ids: many icons (same and different names, active + current) on one page → every id distinct,
 *        every url(#…) resolves inside its own <svg>
 *   B-4  where: the student nav (sidebar + phone bar) shows THE brand icon per meaning (studentItems / bottomItems),
 *        active style only via aria-current (no fixed `active` in the shell), the centre button = todays-mock onBlue;
 *        the result actions (Learn on blue, Learn / Practice, Mistake Vault, Memory Lock) and the dashboard cards (active,
 *        26 px, cl-blue-tint tile; the "Coming soon" Memory Lock card idle) use <BrandIcon>; no stray Lucide / path map /
 *        emoji for the 9 meanings; utility icons in the touched files go through <Icon>; Results / Learn nav only behind
 *        RESULTS_ROUTE / LEARN_INDEX_READY
 *   B-5  sizes: no call site renders practice / mocks / memory-lock / mistake-vault / results / current-affairs below 18
 *   B-6  aria: icons aria-hidden; the icon-only Mistake Vault / Memory Lock buttons keep aria-label + tooltip
 *   B-7  exam screen unchanged: its Lucide imports and icon lines match the recorded baseline; no BrandIcon / Icon there
 *   B-8  negative controls: each broken variant is caught
 * Run: node scripts/test_brand_icons1.cjs     (node scripts/test_brand_icons1.cjs --print-exam-baseline)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { spawnSync } = require('child_process');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
function test(name, fn) {
  try {
    const info = fn();
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

const STUBS = { 'next/link': { __esModule: true, default: ({ href, children, prefetch: _p, ...p }) => React.createElement('a', { href: String(href), ...p }, children) } };
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

const BI = 'components/icons/brand-icon.tsx';
const SRC = {
  bi: read(BI),
  icon: read('components/icons/icon.tsx'),
  shell: read('components/nav/student-shell.tsx'),
  nav: read('lib/nav/student-nav.ts'),
  card: read('components/assessment/question-review-card.tsx'),
  view: read('components/assessment/result-view-client.tsx'),
  ml: read('components/memory-lock/add-to-memory-lock-button.tsx'),
  cards: read('components/dashboard/quick-action-cards.tsx'),
  dash: read('app/(site)/dashboard/page.tsx'),
  css: read('app/globals.css'),
};
const NAMES = ['home', 'learn', 'practice', 'mocks', 'todays-mock', 'current-affairs', 'results', 'mistake-vault', 'memory-lock'];
const MIN18 = ['practice', 'mocks', 'memory-lock', 'mistake-vault', 'results', 'current-affairs'];
const attrs = (s) => Object.fromEntries([...String(s).matchAll(/([a-zA-Z][a-zA-Z0-9:-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const render = (props, overrides = {}) => renderToStaticMarkup(React.createElement(loadTs(BI, overrides).BrandIcon, props));
/** the drawing of a rendered or master svg: [{d, transform}] in order, plus the root and the defs */
function drawing(svg) {
  const root = attrs((svg.match(/^<svg\b([^>]*)>/) || [])[1] || '');
  const defs = (svg.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0];
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, '');
  const paths = [...body.matchAll(/<path\b([^>]*?)\/?>/g)].map((m) => attrs(m[1]));
  return { root, defs, paths };
}
const master = (name, suffix) => fs.readFileSync(path.join(ROOT, 'docs/design/brand-icons-v1', `icon-${name}${suffix}.svg`), 'utf8');

function checkMasters() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/gen-brand-icons.cjs'), '--check'], { encoding: 'utf8', timeout: 30000 });
  assert(r.status === 0, `data module out of sync with the masters: ${r.stdout.trim()} ${r.stderr.trim().slice(0, 200)}`);
  const files = fs.readdirSync(path.join(ROOT, 'docs/design/brand-icons-v1')).filter((f) => /\.svg$/.test(f));
  assert(files.length === 27, `${files.length} masters`);
  return '27 masters parse + validate · data module in sync';
}

function checkComponent(overrides = {}) {
  let n = 0;
  for (const name of NAMES) {
    const geo = drawing(master(name, '')).paths.map((p) => `${p.d}|${p.transform || ''}`);
    const variants = [
      ['idle', {}, ''],
      ['active', { active: true }, '-active'],
      ['onBlue', { onBlue: true }, '-on-blue'],
    ];
    for (const [v, props, suf] of variants) {
      const html = render({ name, size: 24, ...props }, overrides);
      const out = drawing(html);
      const m = drawing(master(name, suf));
      // geometry = the master's (order, d, transform)
      const got = out.paths.map((p) => `${p.d}|${p.transform || ''}`);
      assert(JSON.stringify(got) === JSON.stringify(geo) && JSON.stringify(m.paths.map((p) => `${p.d}|${p.transform || ''}`)) === JSON.stringify(geo), `${name} ${v}: geometry differs from the master`);
      const r = out.root;
      assert(r.viewBox === '0 0 24 24' && r['stroke-width'] === '1.75' && r['stroke-linecap'] === 'round' && r['stroke-linejoin'] === 'round' && r.stroke === 'currentColor' && r.fill === 'none' && r['aria-hidden'] === 'true' && r.focusable === 'false' && r.width === '24' && r.height === '24', `${name} ${v}: root attributes ${JSON.stringify(r)}`);
      const tri = out.paths[out.paths.length - 1];
      const dep = name === 'todays-mock' ? out.paths[0] : null;
      for (const o of out.paths.slice(0, name === 'todays-mock' ? 0 : -1)) assert(!o.fill && !o.stroke, `${name} ${v}: an outline path is coloured`);
      if (v === 'idle') {
        assert(!out.defs && !/\bid="/.test(html), `${name} idle: renders <defs> / an id`);
        assert(tri.fill === 'none' && tri.stroke === 'currentColor', `${name} idle: triangle ${JSON.stringify(tri)}`);
        if (dep) assert(dep.fill === 'none' && dep.stroke === '#C9CDF2', `${name} idle: depth`);
      } else if (v === 'active') {
        const id = (tri.fill.match(/^url\(#([^)]+)\)$/) || [])[1];
        assert(id && tri.stroke === 'none', `${name} active: triangle fill ${tri.fill}`);
        const g = (out.defs.match(new RegExp(`<linearGradient id="${id}"([^>]*)>([\\s\\S]*?)</linearGradient>`)) || []);
        assert(g.length, `${name} active: no gradient ${id}`);
        const stops = [...g[2].matchAll(/<stop\b([^>]*?)\/?>/g)].map((s) => [attrs(s[1]).offset, attrs(s[1])['stop-color']]);
        const kind = name === 'todays-mock' ? 'gc' : 'g';
        const mg = master(name, '-active').match(new RegExp(`<linearGradient id="cl-${kind}-[^"]*"[^>]*>([\\s\\S]*?)</linearGradient>`))[1];
        const mstops = [...mg.matchAll(/<stop\b([^>]*)\/>/g)].map((s) => [attrs(s[1]).offset, attrs(s[1])['stop-color']]);
        assert(JSON.stringify(stops) === JSON.stringify(mstops), `${name} active: stops ${JSON.stringify(stops)} vs master ${JSON.stringify(mstops)}`);
        assert(attrs(g[1]).x1 === '0' && attrs(g[1]).y2 === '1', `${name} active: gradient direction`);
        if (dep) assert(dep.fill === '#4B00E6' && dep.stroke === 'none', `${name} active: depth`);
      } else {
        assert(!out.defs && tri.fill === 'currentColor' && tri.stroke === 'none', `${name} onBlue: triangle ${JSON.stringify(tri)} (currentColor, no defs)`);
        if (dep) assert(dep.fill === 'currentColor' && dep['fill-opacity'] === '0.35' && dep.stroke === 'none', `${name} onBlue: depth ${JSON.stringify(dep)}`);
      }
      n++;
    }
    // onBlue beats active; < 18 px → no gradient; the six never below 18; current = idle markup + CSS-wired gradient
    const both = drawing(render({ name, size: 24, active: true, onBlue: true }, overrides));
    assert(both.paths[both.paths.length - 1].fill === 'currentColor' && !both.defs, `${name}: active beats onBlue`);
    const small = render({ name, size: 16, active: true }, overrides);
    const w = Number(drawing(small).root.width);
    assert(MIN18.includes(name) ? w === 18 : w === 16, `${name}: rendered at ${w} px for size 16`);
    // a gradient never renders below 18 px (the six are clamped to 18, so theirs may)
    if (w < 18) assert(!/<defs>/.test(small) && !/url\(#/.test(small), `${name}: a gradient at ${w} px`);
    for (const sz of [12, 16, 17]) if (!MIN18.includes(name)) assert(!/<defs>/.test(render({ name, size: sz, active: 'current' }, overrides)), `${name}: a gradient at ${sz} px (current)`);
    const cur = render({ name, size: 20, active: 'current' }, overrides);
    const cd = drawing(cur);
    const ctri = cd.paths[cd.paths.length - 1];
    const cid = (cd.defs.match(/<linearGradient id="([^"]+)"/) || [])[1];
    assert(ctri.fill === 'none' && ctri.stroke === 'currentColor' && ctri.class === 'cl-bi__tri' && cid && new RegExp(`--cl-bi-fill:url\\(#${cid}\\)`).test(cd.root.style || ''), `${name} current: not idle markup + the CSS-wired gradient`);
  }
  checkCss(SRC.css);
  return `${n} renders = masters (geometry, stops, fills) · onBlue beats active · 16 px no gradient · six ≥ 18 · current wired to aria-current`;
}

/** the nav active style is CSS on aria-current (the shell moves aria-current after client-side navigation) */
function checkCss(css) {
  assert(/\[aria-current="page"\] \.cl-bi__tri \{\s*fill: var\(--cl-bi-fill\);\s*stroke: none;\s*\}/.test(css), 'the aria-current CSS rule for nav icons is missing');
  assert(/\[aria-current="page"\] \.cl-bi__depth \{\s*fill: var\(--color-cl-logo-violet\);\s*stroke: none;\s*\}/.test(css) && /--color-cl-logo-violet: #4b00e6;/i.test(css), 'the aria-current depth rule (logo-violet token) is missing');
}

function checkIds(overrides = {}) {
  const { BrandIcon } = loadTs(BI, overrides);
  const kids = [];
  for (const n of NAMES) for (let i = 0; i < 3; i++) kids.push(React.createElement(BrandIcon, { key: `${n}a${i}`, name: n, size: 24, active: true }), React.createElement(BrandIcon, { key: `${n}c${i}`, name: n, size: 22, active: 'current' }), React.createElement(BrandIcon, { key: `${n}i${i}`, name: n, size: 20 }));
  const html = renderToStaticMarkup(React.createElement('div', null, kids));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert(ids.length === NAMES.length * 6, `${ids.length} gradient ids (want ${NAMES.length * 6}: active + current only)`);
  assert(new Set(ids).size === ids.length, `duplicate gradient ids: ${ids.filter((x, i) => ids.indexOf(x) !== i).slice(0, 3).join(', ')}`);
  for (const svg of html.match(/<svg\b[\s\S]*?<\/svg>/g)) {
    const own = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const ref of [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])) assert(own.has(ref), `url(#${ref}) does not resolve inside its own <svg>`);
  }
  return `${ids.length} ids on one page, all distinct, each url(#…) resolves in its own svg`;
}

const LUCIDE_MEANINGS = /<(Home|House|BookOpen|Book|Dumbbell|Target|Zap|Clock|Timer|Newspaper|BarChart\w*|ChartBar\w*|Archive|AlertTriangle|Lock|GraduationCap|Play)\b/;
// the same emoji set as FOOTER-1: U+2713 ✓ / U+2715 ✕ are RESULT-UX-1's text labels ("✓ Correct answer"), not emoji
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
function lucideNames(src) {
  return ((src.match(/import\s*\{([^}]*)\}\s*from\s*"lucide-react";/) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
}
function checkWhere(src = SRC, overrides = {}) {
  // nav rules: each meaning → its brand icon; Results / Learn only behind their flags
  const nav = loadTs('lib/nav/student-nav.ts', { ...overrides, 'lib/nav/student-nav.ts': src.nav });
  const labels = loadTs('content/nav/labels.ts').navLabels('en');
  const want = { home: 'home', practice: 'practice', mocks: 'mocks', currentAffairs: 'current-affairs', results: 'results', mistakeVault: 'mistake-vault', learn: 'learn' };
  const items = nav.studentItems(labels, { practice: true, payments: true, paywall: true }, true);
  const bar = nav.bottomItems(labels, { practice: true, payments: true, paywall: true });
  for (const it of [...items, ...bar.left, ...bar.right]) assert(want[it.key] === it.icon, `nav ${it.key} → icon ${it.icon}`);
  assert(nav.RESULTS_ROUTE === null ? !items.some((i) => i.key === 'results') : true, 'Results shown without a results route');
  assert(!nav.studentItems(labels, { practice: true, payments: true, paywall: true }, false).some((i) => i.key === 'learn'), 'Learn shown while the Learn index is not ready');
  // the shell: brand icons for the items (current via aria-current), todays-mock on blue; no private path map
  const sh = src.shell;
  assert(/<BrandIcon name=\{it\.icon\} size=\{20\} active="current" \/>/.test(sh) && /<BrandIcon name=\{it\.icon\} size=\{22\} active="current" \/>/.test(sh), 'the sidebar / phone bar items do not use <BrandIcon … active="current">');
  assert(/<span className="cl-ss__fab-c">\s*<BrandIcon name="todays-mock" size=\{22\} onBlue \/>/.test(sh), 'the centre button is not todays-mock on blue');
  assert(!/const ICONS\b|<path d=\{ICONS/.test(sh) && !/<BrandIcon\b[^>]*\bactive(?!="current")(\s|\/|=)/.test(sh), 'the shell keeps a private icon map or a fixed active icon');
  // the result actions
  assert(/<BrandIcon name="learn" size=\{16\} onBlue \/> Learn: \{topicName/.test(src.card) && /<BrandIcon name="mistake-vault" size=\{18\} \/>/.test(src.card), 'review card: Learn (on blue) / Mistake Vault are not brand icons');
  assert(/<BrandIcon name="learn" size=\{16\} \/> Learn/.test(src.view) && /<BrandIcon name="practice" size=\{18\} className="-mx-px" \/> Practice/.test(src.view), 'topic table: Learn / Practice are not brand icons');
  // owner: bumped 16 → 18 px with the button size unchanged (the labelled button's icon takes -1 px each side)
  assert(/<BrandIcon name="memory-lock" size=\{18\} \/>/.test(src.ml) && /<BrandIcon name="memory-lock" size=\{18\} className="-mx-px" \/>/.test(src.ml), 'Memory Lock buttons are not the brand icon at 18 px (labelled: -mx-px keeps the button width)');
  // dashboard cards: four active brand icons in the cl-blue-tint tile; the "Coming soon" card idle
  for (const n of ['mocks', 'practice', 'mistake-vault', 'memory-lock']) assert(new RegExp(`bg-cl-blue-tint text-cl-blue-text[^"]*">\\s*<BrandIcon name="${n}" size=\\{26\\} active />`).test(src.cards), `dashboard card ${n}: not an active 26 px brand icon in a cl-blue-tint tile`);
  assert(/text-primary-700 flex items-center justify-center">\s*<BrandIcon name="memory-lock" size=\{26\} \/>/.test(src.cards), 'the "Coming soon" Memory Lock card is not idle');
  assert(/<QuickActionCards mistakesCount=\{data\.mistakesCount\} battles=\{isFeatureEnabled\("BATTLES"\)\} memoryLock=\{isMemoryLockEnabled\(\)\} \/>/.test(src.dash), 'the dashboard does not render the cards with the same flags');
  // no stray Lucide / emoji for the 9 meanings; utility icons through <Icon> in the touched files
  for (const [n, s] of [['shell', sh], ['card', src.card], ['view', src.view], ['memory-lock', src.ml], ['cards', src.cards]]) {
    const m = s.match(LUCIDE_MEANINGS);
    assert(!m, `${n}: a Lucide icon for a brand meaning (${m && m[0]})`);
    assert(!EMOJI.test(s), `${n}: emoji`);
    for (const name of lucideNames(s)) if (n !== 'cards') assert(!new RegExp(`<${name}\\b`).test(s) && new RegExp(`icon=\\{${name}\\}`).test(s), `${n}: Lucide ${name} rendered directly, not via <Icon>`);
  }
  assert(lucideNames(src.cards).join() === 'Swords', 'the cards import a Lucide icon other than Swords (Battles, not a brand meaning)');
  // the dashboard page: the cards moved out (checked above); its utility arrow goes through <Icon>; the four card meanings
  // are no longer imported from Lucide there (owner decision 2: the other dashboard icons stay unchanged — BRAND-ICONS-2)
  assert(/<Icon icon=\{ArrowRight\} size=\{12\} className="w-3 h-3" \/>/.test(src.dash) && !/<ArrowRight\b/.test(src.dash), 'dashboard: the utility arrow is not via <Icon>');
  assert(!lucideNames(src.dash).some((n) => ['Target', 'Zap', 'AlertTriangle', 'Lock'].includes(n)), `dashboard: still imports a card-meaning Lucide icon (${lucideNames(src.dash).join(', ')})`);
  assert(/strokeWidth=\{1\.75\} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"/.test(src.icon), '<Icon> defaults (1.75, round, aria-hidden)');
  return 'nav 7 meanings + centre · result actions 5 · dashboard 4 active + 1 idle · no stray Lucide / emoji · utilities via <Icon>';
}

function checkSizes(src = SRC) {
  const bad = [];
  for (const [n, s] of Object.entries(src)) {
    for (const m of s.matchAll(/<BrandIcon name="([a-z-]+)" size=\{(\d+)\}/g)) if (MIN18.includes(m[1]) && Number(m[2]) < 18) bad.push(`${n}: ${m[1]} ${m[2]}`);
  }
  assert(bad.length === 0, `below 18 px: ${bad.join('; ')}`);
  assert(/export const BRAND_ICON_MIN_18[^=]*= \["practice", "mocks", "memory-lock", "mistake-vault", "results", "current-affairs"\];/.test(src.bi) && /Math\.max\(18, size\)/.test(src.bi), 'the component does not clamp the six to 18 px');
  return 'six never below 18 (call sites + component clamp)';
}

function checkAria(src = SRC) {
  assert(/aria-hidden="true"\s*focusable="false"/.test(src.bi), 'BrandIcon is not aria-hidden');
  assert(/<Tooltip content="Saved in Mistake Vault" side="top">\s*<Link href="\/mistakes" aria-label="Saved in Mistake Vault"[^>]*>\s*<BrandIcon name="mistake-vault"/.test(src.card), 'the Mistake Vault icon button lost its aria-label / tooltip');
  assert(/<Tooltip\b[\s\S]{0,200}<button type="button" aria-label=\{label\}[\s\S]{0,200}<BrandIcon name="memory-lock" size=\{18\} \/>/.test(src.ml), 'the Memory Lock icon button lost its aria-label / tooltip');
  return 'icons aria-hidden · icon-only buttons: aria-label + tooltip';
}

// B-7 exam screen: Lucide imports + icon lines, recorded from main 576612d (unchanged in this phase)
const EXAM_FILES = ['app/(site)/mock-tests/[id]/take/player-client.tsx', 'components/assessment/question-options.tsx', 'components/assessment/question-renderer.tsx', 'components/assessment/question-palette.tsx', 'components/assessment/assessment-timer.tsx', 'components/assessment/submit-dialog.tsx', 'components/assessment/instructions-modal.tsx', 'components/live-test/live-test-player-client.tsx'];
function examFingerprint(src) {
  const imp = (src.match(/import\s*\{[^}]*\}\s*from\s*"lucide-react";/g) || []).join('\n');
  const names = (imp.replace(/^import|from\s*"lucide-react";/g, '').match(/\b[A-Z][A-Za-z0-9]*\b/g) || []);
  const lines = src.split('\n').filter((l) => /<svg\b/.test(l) || names.some((n) => new RegExp(`<${n}\\b`).test(l))).map((l) => l.trim());
  return { hash: crypto.createHash('sha256').update(`${imp}\n${lines.join('\n')}`).digest('hex').slice(0, 16), lucide: names.length, lines: lines.length };
}
const EXAM_BASELINE = {
  'app/(site)/mock-tests/[id]/take/player-client.tsx': '8c8671f092f292b2', // 17 Lucide · 35 icon lines
  'components/assessment/question-options.tsx': '4338380450c5405f', // 2 Lucide · 2 icon lines
  'components/assessment/question-renderer.tsx': 'e85856a33f484a1a', // 3 Lucide · 4 icon lines
  'components/assessment/question-palette.tsx': '01ba4719c80b6fe9', // 0 Lucide · 0 icon lines
  'components/assessment/assessment-timer.tsx': '01ba4719c80b6fe9', // 0 Lucide · 0 icon lines
  'components/assessment/submit-dialog.tsx': '21f7f5f311affbcb', // 1 Lucide · 1 icon lines
  'components/assessment/instructions-modal.tsx': '01ba4719c80b6fe9', // 0 Lucide · 0 icon lines
  'components/live-test/live-test-player-client.tsx': '682949681fe1796d', // 11 Lucide · 13 icon lines
};
function checkExam(over = {}) {
  const out = [];
  for (const f of EXAM_FILES) {
    const s = over[f] ?? read(f);
    const fp = examFingerprint(s);
    assert(EXAM_BASELINE[f] === fp.hash, `${f}: exam icon imports / lines changed (${fp.hash})`);
    assert(!/BrandIcon|@\/components\/icons\//.test(s), `${f}: the exam screen uses the brand / utility icon components`);
    out.push(fp.lines);
  }
  return `${EXAM_FILES.length} exam files · ${out.reduce((a, b) => a + b, 0)} icon lines unchanged`;
}

if (process.argv.includes('--print-exam-baseline')) {
  for (const f of EXAM_FILES) {
    const fp = examFingerprint(read(f));
    console.log(`  ${JSON.stringify(f)}: '${fp.hash}', // ${fp.lucide} Lucide · ${fp.lines} icon lines`);
  }
  process.exit(0);
}

test('B-1 masters parse + validate; the data module is in sync', () => checkMasters());
test('B-2 <BrandIcon> = the masters (9 × idle / active / onBlue), sizes, current', () => checkComponent());
test('B-3 unique gradient ids per instance', () => checkIds());
test('B-4 nav / result actions / dashboard cards use the brand icons; utilities via <Icon>; no stray Lucide / emoji', () => checkWhere());
test('B-5 the six small-signature icons never below 18 px', () => checkSizes());
test('B-6 aria: icons hidden, icon-only buttons labelled + tooltip', () => checkAria());
test('B-7 exam screen icons unchanged', () => checkExam());

test('B-8 negative controls: each broken variant is caught', () => {
  const mut = (s, a, b) => {
    if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
    return s.split(a).join(b);
  };
  const S = SRC;
  // a mutated master set must fail the generator (copied to a temp dir; the real masters are never touched)
  const genFails = (file, a, b) => () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-'));
    try {
      for (const f of fs.readdirSync(path.join(ROOT, 'docs/design/brand-icons-v1'))) fs.copyFileSync(path.join(ROOT, 'docs/design/brand-icons-v1', f), path.join(dir, f));
      const p = path.join(dir, file);
      const s = fs.readFileSync(p, 'utf8');
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a}`);
      fs.writeFileSync(p, s.split(a).join(b));
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/gen-brand-icons.cjs'), '--check'], { encoding: 'utf8', env: { ...process.env, BRAND_ICONS_MASTERS_DIR: dir }, timeout: 30000 });
      assert(r.status === 0, 'generator rejected it');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const muts = [
    ['master: geometry differs between variants', genFails('icon-home-active.svg', 'M4 10.2 11 4.4', 'M4 10.3 11 4.4')],
    ['master: wrong gradient stop', genFails('icon-mocks-active.svg', '#475BFF', '#475BFE')],
    ['master: on-blue triangle not white', genFails('icon-learn-on-blue.svg', 'fill="#fff" stroke="none"', 'fill="#eee" stroke="none"')],
    ['master: a 28th file', () => { const dir = path.join(ROOT, 'docs/design/brand-icons-v1'); const extra = path.join(os.tmpdir(), 'bi-x'); fs.rmSync(extra, { recursive: true, force: true }); fs.mkdirSync(extra); for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(extra, f)); fs.writeFileSync(path.join(extra, 'icon-extra.svg'), '<svg viewBox="0 0 24 24"></svg>'); const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/gen-brand-icons.cjs'), '--check'], { encoding: 'utf8', env: { ...process.env, BRAND_ICONS_MASTERS_DIR: extra }, timeout: 30000 }); fs.rmSync(extra, { recursive: true, force: true }); assert(r.status === 0, 'rejected'); }],
    ['component: idle renders <defs>', () => checkComponent({ [BI]: mut(S.bi, 'const withDefs = mode === "active" || mode === "current";', 'const withDefs = true;') })],
    ['component: a fixed gradient id', () => checkIds({ [BI]: mut(S.bi, 'const gid = `cl-bi-${name}-${uid}`;', 'const gid = `cl-bi-${name}`;') })],
    ['component: onBlue hardcodes #fff', () => checkComponent({ [BI]: mut(S.bi, '? { fill: "currentColor", stroke: "none" }\n        : { fill: "none", stroke: "currentColor" };', '? { fill: "#fff", stroke: "none" }\n        : { fill: "none", stroke: "currentColor" };') })],
    ['component: active beats onBlue', () => checkComponent({ [BI]: mut(S.bi, 'onBlue ? "onBlue" : px < 18 || !active', 'active && px >= 18 ? (active === "current" ? "current" : "active") : onBlue ? "onBlue" : px < 18 || !active') })],
    ['component: a gradient at 16 px', () => checkComponent({ [BI]: mut(S.bi, 'px < 18 || !active ? "idle"', '!active ? "idle"') })],
    ['component: no 18 px clamp', () => checkComponent({ [BI]: mut(S.bi, 'Math.max(18, size)', 'size') })],
    ['component: stroke 2', () => checkComponent({ [BI]: mut(S.bi, 'strokeWidth={1.75}', 'strokeWidth={2}') })],
    ['component: not aria-hidden', () => checkComponent({ [BI]: mut(S.bi, '      aria-hidden="true"\n', '') })],
    ['component: a geometry change', () => checkComponent({ 'lib/icons/brand-icon-data.ts': mut(read('lib/icons/brand-icon-data.ts'), 'M4 10.2 11 4.4', 'M4 10.2 11 4.5') })],
    ['css: no aria-current rule', () => checkCss(mut(S.css, '[aria-current="page"] .cl-bi__tri', '[aria-current="x"] .cl-bi__tri'))],
    ['css: the active fill is a fixed colour', () => checkCss(mut(S.css, 'fill: var(--cl-bi-fill);', 'fill: #475bff;'))],
    ['dashboard: the arrow rendered directly', () => checkWhere({ ...S, dash: mut(S.dash, '<Icon icon={ArrowRight} size={12} className="w-3 h-3" />', '<ArrowRight className="w-3 h-3" />') })],
    ['nav: Practice shows the mocks icon', () => checkWhere({ ...S, nav: mut(S.nav, 'label: t.practice, icon: "practice" });\n  items.push', 'label: t.practice, icon: "mocks" });\n  items.push') })],
    ['nav: Learn without the index flag', () => checkWhere({ ...S, nav: mut(S.nav, 'if (learnReady) items.push({ key: "learn"', 'items.push({ key: "learn"') })],
    ['shell: a fixed active icon', () => checkWhere({ ...S, shell: mut(S.shell, '<BrandIcon name={it.icon} size={20} active="current" />', '<BrandIcon name={it.icon} size={20} active />') })],
    ['shell: the private path map is back', () => checkWhere({ ...S, shell: S.shell + '\nconst ICONS = { home: "M4 11" };\n' })],
    ['shell: centre button not on blue', () => checkWhere({ ...S, shell: mut(S.shell, '<BrandIcon name="todays-mock" size={22} onBlue />', '<BrandIcon name="todays-mock" size={22} />') })],
    ['shell: a Lucide utility rendered directly', () => checkWhere({ ...S, shell: mut(S.shell, '<Icon icon={CircleHelp} className="cl-ss__ic" />', '<CircleHelp className="cl-ss__ic" />') })],
    ['result: Mistake Vault back to Lucide Archive', () => checkWhere({ ...S, card: mut(S.card, '<BrandIcon name="mistake-vault" size={18} />', '<Archive aria-hidden="true" className="size-[18px]" />') })],
    ['result: an emoji', () => checkWhere({ ...S, view: mut(S.view, '<BrandIcon name="practice" size={18} className="-mx-px" /> Practice', '<BrandIcon name="practice" size={18} className="-mx-px" /> \u{1F3AF} Practice') })],
    ['dashboard: a card without the active style', () => checkWhere({ ...S, cards: mut(S.cards, '<BrandIcon name="mocks" size={26} active />', '<BrandIcon name="mocks" size={26} />') })],
    ['dashboard: the "Coming soon" card active', () => checkWhere({ ...S, cards: mut(S.cards, '<BrandIcon name="memory-lock" size={26} />', '<BrandIcon name="memory-lock" size={26} active />') })],
    ['size: Practice at 16 px', () => checkSizes({ ...S, view: mut(S.view, '<BrandIcon name="practice" size={18} className="-mx-px" />', '<BrandIcon name="practice" size={16} className="-mx-px" />') })],
    ['size: Memory Lock at 16 px', () => checkSizes({ ...S, ml: S.ml.replace('<BrandIcon name="memory-lock" size={18} className="-mx-px" />', '<BrandIcon name="memory-lock" size={16} className="-mx-px" />') })],
    ['aria: Mistake Vault button without aria-label', () => checkAria({ ...S, card: mut(S.card, 'aria-label="Saved in Mistake Vault" ', '') })],
    ['exam: a changed Lucide import', () => checkExam({ [EXAM_FILES[0]]: mut(read(EXAM_FILES[0]), '} from "lucide-react";', '  Sparkles,\n} from "lucide-react";') })],
    ['exam: the brand icon in the exam screen', () => checkExam({ [EXAM_FILES[1]]: read(EXAM_FILES[1]) + '\nimport { BrandIcon } from "@/components/icons/brand-icon";\n' })],
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

console.log('BRAND-ICONS-1 (offline)');
console.log(results.join('\n'));
console.log(`\nBRAND-ICONS-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
