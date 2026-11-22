#!/usr/bin/env node
/**
 * EXAM-UX-1 gate (owner spec docs/design/EXAM_UX_V1_SPEC.md + exam-ux-v1-reference.html, 23 Nov 2026) — offline, no
 * network, no DB. Layout / presentation of the mock-test attempt screen only; the engine is gated elsewhere, unchanged
 * (PLAYER-RESUME, PROCTOR-LOG1, phase5c, EXAM-FINALIZE1, F3-PLAYER P0-1…P0-6).
 *   X-1 one 100dvh column: top bar 60 / 54 · tabs 52 / 44 · question (the ONLY scroll area) · action bar 68 / 64 + safe
 *       area; the action bar is a sibling of the question scroll, never inside it; chrome + a usable question area fit
 *       every gated viewport (1280×720, 1366×768, 1920×1080, 768×1024, 390×844, 360×740). The browser proof is
 *       scripts/live/test_exam_ux1_pages.cjs (local fixture build).
 *   X-2 no "Go to question no." anywhere (the grid covers it)
 *   X-3 ONE legend: all 5 states, each with its count (rendered with the real component); filters with counts
 *   X-4 cl-* tokens only: no colour literal and no legacy palette class in the player, palette, timer and their helpers
 *   X-5 never auto-advance: choosing an option saves it and stays on the question
 *   X-6 the watermark stays (same content, lighter), inside the question area
 *   X-7 timer: normal → amber ≤ 5:00 → red ≤ 1:00, no flashing, ONE announcement at 5 min and ONE at 1 min
 *   X-8 phone action bar: Previous / Mark / Clear as labelled icons (tooltips) + a wide Save & Next; palette sheet holds
 *       legend, filters, grid, Submit test (the existing confirmation), Instructions, Full screen
 *   X-9 the test fixture is never a route in a deployed build (build-flag page extension + production 404 + noindex)
 *   X-10 negative controls: each broken variant is caught
 * Run: node scripts/test_exam_ux1.cjs
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

function loadTs(rel, src, overrides = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(src ?? read(rel), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    let t = null;
    if (id.startsWith('@/')) t = id.slice(2);
    else if (id.startsWith('./') || id.startsWith('../')) t = path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
    if (t !== null) {
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, overrides[cand]);
    }
    return require(id);
  };
  m._compile(js, file);
  return m.exports;
}

const PLAYER_REL = 'app/(site)/mock-tests/[id]/take/player-client.tsx';
const PAL_REL = 'components/assessment/question-palette.tsx';
const PALLIB_REL = 'lib/assessment/palette.ts';
const TIMER_REL = 'components/assessment/assessment-timer.tsx';
const TIMERLIB_REL = 'lib/assessment/timer.ts';
const FX_PAGE_REL = 'app/(fixture)/dev/exam-fixture/page.fixture.tsx';
const FX_LAYOUT_REL = 'app/(fixture)/layout.fixture.tsx';
const SRC = {
  player: read(PLAYER_REL),
  pal: read(PAL_REL),
  pallib: read(PALLIB_REL),
  timer: read(TIMER_REL),
  timerlib: read(TIMERLIB_REL),
  config: read('next.config.ts'),
  fxPage: read(FX_PAGE_REL),
  fxLayout: read(FX_LAYOUT_REL),
};
const layoutRegion = (P) => (P.indexOf('data-exam-layout="v1"') < 0 ? '' : P.slice(P.lastIndexOf('<div', P.indexOf('data-exam-layout="v1"'))));
const classOf = (s, marker) => (s.match(new RegExp(`className="([^"]*)"[^>]*${marker.replace(/[[\]]/g, '\\$&')}`)) || [])[1] || '';
const px = (cls, re) => {
  const m = cls.match(re);
  if (!m) return null;
  return m[1].startsWith('[') ? Number(m[1].slice(1, -3)) : Number(m[1]) * 4;
};

// ---------------------------------------------------------------- X-1 layout
const VIEWPORTS = [
  { name: '1280×720', w: 1280, h: 720 },
  { name: '1366×768', w: 1366, h: 768 },
  { name: '1920×1080', w: 1920, h: 1080 },
  { name: '768×1024', w: 768, h: 1024 },
  { name: '390×844', w: 390, h: 844 },
  { name: '360×740', w: 360, h: 740 },
];
const MIN_QUESTION_PX = 280; // a question + four options must have room without scrolling the page
function checkLayout(P) {
  const L = layoutRegion(P);
  assert(L.length > 0, 'no data-exam-layout="v1" root');
  const root = classOf(P, 'data-exam-layout="v1"');
  assert(/\bfixed inset-0\b/.test(root) && /\bh-dvh\b/.test(root) && /\bflex-col\b/.test(root) && /\boverflow-hidden\b/.test(root), `root is not a non-scrolling 100dvh column: "${root}"`);
  const top = classOf(L, 'data-exam-topbar=""');
  const tabs = (L.match(/data-section-tabs=""[\s\S]{0,80}className="([^"]*)"/) || [])[1] || '';
  const scroll = classOf(L, 'data-question-scroll=""');
  const bar = classOf(L, 'data-action-bar=""');
  assert(/\bshrink-0\b/.test(top) && /\bshrink-0\b/.test(tabs) && /\bshrink-0\b/.test(bar), 'top bar / tabs / action bar must keep their height (shrink-0)');
  assert(/\bmin-h-0\b/.test(scroll) && /\bflex-1\b/.test(scroll) && /\boverflow-y-auto\b/.test(scroll), `the question panel is not the scroll area: "${scroll}"`);
  assert(/pb-\[env\(safe-area-inset-bottom\)\]/.test(bar), 'action bar lacks the safe area');
  // the action bar is a SIBLING after the question area: it closes after </main> of the scroll panel and the aside
  const iScroll = L.indexOf('data-question-scroll=""');
  const iMainEnd = L.indexOf('</main>', iScroll);
  const iBar = L.indexOf('data-action-bar=""');
  assert(iScroll > 0 && iMainEnd > iScroll && iBar > iMainEnd, 'the action bar sits inside the scrolling question area');
  // other scroll areas: only the question panel (+ the desktop palette column, its own list, and the tabs row sideways)
  const scrollers = (L.match(/overflow-y-auto/g) || []).length;
  assert(scrollers === 2 && /className="hidden w-\[320px\] shrink-0 overflow-y-auto[^"]*" aria-label="Question palette" data-palette-column=""/.test(L), `vertical scroll areas: ${scrollers} (want the question + the palette column)`);
  // heights from the classes
  const h = {
    topPhone: px(top, /(?:^|\s)h-(\[\d+px\]|\d+)(?=\s|$)/), topLg: px(top, /lg:h-(\[\d+px\]|\d+)/),
    tabsPhone: px(tabs, /(?:^|\s)h-(\[\d+px\]|\d+)(?=\s|$)/), tabsLg: px(tabs, /lg:h-(\[\d+px\]|\d+)/),
  };
  // the bar = its 1 px top border + one row (67 / 63 px) → 68 / 64 px (measured in the browser by E-1)
  const border = /(?:^|\s)border-t(?:\s|$)/.test(bar) ? 1 : 0;
  const barDesk = px(L.slice(iBar, iBar + 600), /className="hidden h-(\[\d+px\]|\d+) [^"]*lg:flex"/) + border;
  const barPhone = px(L.slice(iBar, iBar + 4000), /className="flex h-(\[\d+px\]|\d+) [^"]*lg:hidden"/) + border;
  assert(h.topLg === 60 && h.topPhone === 54, `top bar ${h.topLg} / ${h.topPhone} px (want 60 / 54)`);
  assert(h.tabsLg === 52 && h.tabsPhone === 44, `tabs ${h.tabsLg} / ${h.tabsPhone} px (want 52 / 44)`);
  assert(barDesk === 68 && barPhone === 64, `action bar ${barDesk} / ${barPhone} px (want 68 / 64)`);
  const rows = [];
  for (const v of VIEWPORTS) {
    const desk = v.w >= 1024;
    const chrome = desk ? h.topLg + h.tabsLg + barDesk : h.topPhone + h.tabsPhone + barPhone + 34; // 34 px home indicator
    const room = v.h - chrome;
    assert(room >= MIN_QUESTION_PX, `${v.name}: the action bar would leave the screen (chrome ${chrome} px, question ${room} px)`);
    rows.push(`${v.name} ${room}`);
  }
  return `question px: ${rows.join(', ')}`;
}

// ---------------------------------------------------------------- X-2 no "Go to question"
function checkNoGoto(P, PAL) {
  for (const [n, s] of [['player', P], ['palette', PAL]]) {
    const c = code(s);
    assert(!/go\s*to\s*question/i.test(c), `${n}: "Go to question" is back`);
    assert(!/type="number"|inputMode="numeric"|jumpTo|gotoValue|goToInput/.test(c), `${n}: a question-number input is back`);
  }
  return 'grid only';
}

// ---------------------------------------------------------------- X-3 legend + filters (real render)
const SAMPLE = [
  ...Array(3).fill('answered'), ...Array(2).fill('not_answered'), ...Array(4).fill('not_visited'), ...Array(1).fill('marked'), ...Array(5).fill('marked_answered'),
].map((status, i) => ({ questionOrder: i + 1, status }));
function checkLegend(palSrc, libSrc) {
  const overrides = libSrc ? { [PALLIB_REL]: libSrc } : {};
  const { QuestionPalette } = loadTs(PAL_REL, palSrc, overrides);
  const html = renderToStaticMarkup(React.createElement(QuestionPalette, { questions: SAMPLE, currentOrder: 4, sectionName: 'Sec', onSelectQuestion() {} }));
  const legends = html.match(/data-palette-legend=""/g) || [];
  assert(legends.length === 1, `${legends.length} legends (want exactly one)`);
  const want = { answered: 3, not_answered: 2, not_visited: 4, marked: 1, marked_answered: 5 };
  for (const [st, n] of Object.entries(want)) {
    assert(new RegExp(`data-legend-state="${st}"`).test(html), `legend lacks the "${st}" state`);
    const m = html.match(new RegExp(`data-legend-count="${st}"[^>]*>(\\d+)<`));
    assert(m && Number(m[1]) === n, `legend count for "${st}" is ${m ? m[1] : 'missing'} (want ${n})`);
  }
  const fc = Object.fromEntries([...html.matchAll(/data-filter-count="(\w+)"[^>]*>(\d+)</g)].map((m) => [m[1], Number(m[2])]));
  assert(fc.all === 15 && fc.unanswered === 6 && fc.marked === 6, `filter counts ${JSON.stringify(fc)} (want all 15 · not answered 6 · marked 6)`);
  const cells = html.match(/<button[^>]*aria-label="Question \d+, [^"]+"[^>]*>/g) || [];
  assert(cells.length === 15 && cells.every((c) => /size-12/.test(c)), `${cells.length} grid cells (want 15, each 48 px)`);
  assert(/aria-label="Question 2, answered"/.test(html) && /aria-label="Question 4, not answered"/.test(html) && /aria-label="Question 15, answered &amp; marked for review"/.test(html), 'cell names are not "Question N, state"');
  assert((html.match(/aria-current="true"/g) || []).length === 1, 'the current question is not marked (aria-current)');
  assert(!/<input/.test(html), 'an input in the palette');
  return '5 states + counts · 3 filters + counts · 15 × 48 px cells';
}

// ---------------------------------------------------------------- X-4 tokens only
const LITERAL = /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|(?<![a-zA-Z])(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|\[#[0-9a-fA-F]+\]/;
const LEGACY = /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|ring-offset|fill|stroke|outline|divide|from|via|to|decoration|caret|accent|placeholder)-(?:fg|danger|primary|success|warning|info|neutral|gray|slate|zinc|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|white|black|cat-[a-z]+)(?:-\d+|-[a-z]+)?(?![\w-])/;
function checkTokens(srcs) {
  const bad = [];
  for (const [n, s] of Object.entries(srcs)) {
    const c = code(n === 'player' ? layoutRegion(s) : s);
    const lit = c.match(LITERAL);
    if (lit) bad.push(`${n}: colour literal ${lit[0]}`);
    const leg = c.match(LEGACY);
    if (leg) bad.push(`${n}: legacy colour class ${leg[0]}`);
  }
  assert(bad.length === 0, bad.join('; '));
  return `${Object.keys(srcs).length} files: cl-* tokens only`;
}

// ---------------------------------------------------------------- X-5 never auto-advance
function checkNoAutoAdvance(P) {
  const i = P.indexOf('const handleSelectOption = useCallback(');
  assert(i > 0, 'handleSelectOption not found');
  const body = P.slice(i, P.indexOf('\n  );', i));
  assert(/NEVER AUTO ADVANCES/.test(P.slice(i - 80, i)), 'the "never auto-advance" rule comment is gone');
  assert(!/navigateTo|setCurrentIndex|handleSaveAndNext|handleMarkAndNext|goNext|goPrevious|setTimeout|openSubmit|setIsSubmitOpen/.test(body), 'choosing an option moves on (auto-advance)');
  assert(/persistAnswer\(currentQ\.mockQuestionId, updated\)/.test(body), 'choosing an option no longer saves it');
  assert(/onSelectOption=\{handleSelectOption\}/.test(P), 'the options do not use handleSelectOption');
  return 'select → save, stay';
}

// ---------------------------------------------------------------- X-6 watermark
function checkWatermark(P) {
  const L = layoutRegion(P);
  const iScroll = L.indexOf('data-question-scroll=""');
  const region = L.slice(iScroll, L.indexOf('</main>', iScroll));
  const wm = (region.match(/<CandidateSecurityWatermark([\s\S]*?)\/>/) || [])[1];
  assert(wm, 'the watermark is gone from the question area');
  for (const prop of ['examTitle={session.testTitle}', 'maskedCandidateId={`CL••••${session.attemptId.slice(0, 4).toUpperCase()}`}', 'attemptIdShort={session.attemptId.slice(0, 6).toUpperCase()}', 'timestamp={new Date().toLocaleDateString(']) {
    assert(wm.includes(prop), `watermark content changed (missing ${prop.slice(0, 40)})`);
  }
  assert(/\bisLighter\b/.test(wm), 'watermark is not the lighter variant');
  const W = read('components/assessment/candidate-security-watermark.tsx');
  const op = Number((W.match(/WATERMARK_OPACITY_LIGHTER = ([0-9.]+)/) || [])[1]);
  assert(op > 0 && op <= 0.035, `lighter watermark opacity ${op}`);
  return `same content, opacity ${op}`;
}

// ---------------------------------------------------------------- X-7 timer
function checkTimer(T, TL) {
  const lib = loadTs(TIMERLIB_REL, TL);
  const tones = [3600, 301, 300, 61, 60, 1, 0].map(lib.timerTone).join(',');
  assert(tones === 'normal,normal,amber,amber,red,red,red', `tones ${tones}`);
  assert(lib.timerAnnouncement('normal') === '' && lib.timerAnnouncement('amber') === '5 minutes left.' && lib.timerAnnouncement('red') === '1 minute left.', 'announcements are not exactly 5 min + 1 min');
  const c = code(T);
  assert(!/animate-|transition-colors|blink/.test(c), 'the timer flashes / animates');
  assert(/\}, \[tone\]\);/.test(c) && (c.match(/aria-live="polite"/g) || []).length === 1, 'announcements are not ONE polite region driven by the tone change');
  assert(/border-cl-timer-red bg-cl-timer-red-tint text-cl-timer-red-text/.test(c) && /border-cl-timer-amber bg-cl-timer-amber-tint text-cl-timer-amber-text/.test(c) && /border-cl-blue-line bg-cl-blue-tint text-cl-blue-text/.test(c), 'timer tones are not the cl-timer / cl-blue tokens');
  assert(/role="timer"/.test(c) && /aria-label=\{`Time left: \$\{time\}`\}/.test(c) && /tabular-nums/.test(c), 'timer: role / accessible name / tabular numbers');
  assert(lib.formatTimeLeft(65) === '01:05' && lib.formatTimeLeft(3600) === '1:00:00', `time format ${lib.formatTimeLeft(65)} / ${lib.formatTimeLeft(3600)}`);
  return 'normal → amber 5:00 → red 1:00 · 2 announcements';
}

// ---------------------------------------------------------------- X-8 phone bar + sheet
function checkPhone(P) {
  const L = layoutRegion(P);
  // a breakpoint-hidden control must hide with a VARIANT (max-lg:hidden): a bare `hidden` next to a class helper loses to
  // the helper's own display class (inline-flex / flex) and the control shows at every width (found in EXAM-UX-1 review)
  const clash = L.match(/className=\{`[^`]*(?<![\w:-])hidden\b[^`]*\$\{ex[A-Z]\w*\}[^`]*`\}|className=\{`[^`]*\$\{ex[A-Z]\w*\}[^`]*(?<![\w:-])hidden\b[^`]*`\}/);
  assert(!clash, `bare "hidden" with a class helper (shows at every width): ${clash && clash[0].slice(0, 90)}`);
  const hdr = L.slice(L.indexOf('data-exam-topbar=""'), L.indexOf('</header>'));
  assert(['data-header-label="instructions"', 'data-header-label="fullscreen"', 'data-submit-test=""'].every((m) => new RegExp(`className=\\{\`\\$\\{ex[A-Z]\\w*\\} max-lg:hidden\`\\}[^>]*${m}`).test(hdr)), 'desktop-only header controls are not hidden below 1024 px');
  const iBar = L.indexOf('data-action-bar=""');
  const phone = L.slice(L.indexOf('className="flex h-[63px]', iBar), L.indexOf('{/* ====', iBar + 10) > 0 ? L.indexOf('{/* ====', iBar + 10) : undefined);
  for (const [k, label] of [['previous', 'Previous'], ['mark', 'Mark for review'], ['clear', 'Clear response']]) {
    const btn = (phone.match(new RegExp(`<Tooltip content=[^>]*>\\s*<button[^>]*aria-label="${label}[^"]*"[^>]*className=\\{exIcon\\}[^>]*data-cbt-phone="${k}"`)) || [])[0];
    assert(btn, `phone ${label}: not a labelled icon button with a tooltip`);
  }
  assert(/className=\{`\$\{exPrimary\} min-h-12 flex-1`\} data-cbt-phone="save-next"/.test(phone), 'phone Save & Next is not the wide primary');
  assert(/const exIcon = "focus-ring flex size-12 /.test(P), 'phone icons under 48 px');
  const iSheet = L.indexOf('data-palette-sheet=""');
  const sheet = L.slice(iSheet, L.indexOf('</Dialog>', iSheet));
  assert(iSheet > 0 && /<Dialog open=\{isMobilePaletteOpen\}[^>]*variant="sheet"/.test(L), 'no palette bottom sheet');
  assert(/<QuestionPalette/.test(sheet) && /\/> Instructions/.test(sheet) && /\} Full screen/.test(sheet), 'sheet lacks the palette / Instructions / Full screen');
  const submit = (sheet.match(/<button[\s\S]*?data-submit-test-sheet=""[\s\S]*?<\/button>/) || [])[0] || '';
  assert(/setIsMobilePaletteOpen\(false\)/.test(submit) && /openSubmit\(\)|setIsSubmitOpen\(true\)/.test(submit) && /Submit test/.test(submit), 'sheet Submit test does not open the existing confirmation');
  assert(/<SubmitDialog/.test(P) && /data-palette-open=""/.test(L), 'existing confirmation / palette button missing');
  return 'icons + tooltips + wide primary · sheet complete';
}

// ---------------------------------------------------------------- X-9 fixture never deployed
function checkFixture(cfg, page, layout) {
  const pe = (cfg.match(/pageExtensions: \[([^\]]*\])\s*\)?\s*:\s*\[\]\)\]|pageExtensions: \[([^\n]*)\],/) || [])[0] || '';
  assert(/pageExtensions: \["tsx", "ts", "jsx", "js", \.\.\.\(process\.env\.EXAM_UX_FIXTURE === "1" \? \["fixture\.tsx"\] : \[\]\)\]/.test(cfg), `pageExtensions does not gate the fixture on EXAM_UX_FIXTURE=1: ${pe.slice(0, 120)}`);
  const fixtureFiles = (function walk(d) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  })(path.join(ROOT, 'app/(fixture)'));
  const plain = fixtureFiles.filter((f) => !/\.fixture\.tsx$/.test(f));
  assert(plain.length === 0, `fixture files that are routes in every build: ${plain.map((f) => path.relative(ROOT, f)).join(', ')}`);
  assert(/if \(process\.env\.VERCEL_ENV === "production" \|\| process\.env\.EXAM_UX_FIXTURE !== "1"\) notFound\(\);/.test(page), 'the fixture page lacks the production / flag 404');
  assert(!/createClient|supabase|getSession|getUser|from "@\/services\/(?!assessment\.service")/.test(code(page)) && /import type \{ ActiveAttemptSession/.test(page), 'the fixture reads data (it must be synthetic only)');
  assert(/robots: \{ index: false, follow: false \}/.test(layout), 'the fixture is indexable');
  return `${fixtureFiles.length} fixture files, flag-only + production 404 + noindex`;
}

(async () => {
  console.log('EXAM-UX-1 attempt screen (static)');
  await test('X-1 one 100dvh column; only the question scrolls; the action bar fits all six viewports', () => checkLayout(SRC.player));
  await test('X-2 no "Go to question no."', () => checkNoGoto(SRC.player, SRC.pal));
  await test('X-3 one legend: 5 states with counts; filters with counts; 48 px named cells', () => checkLegend());
  await test('X-4 cl-* tokens only (no colour literal / legacy class) in the player, palette and timer', () =>
    checkTokens({ player: SRC.player, palette: SRC.pal, 'palette-lib': SRC.pallib, timer: SRC.timer, 'timer-lib': SRC.timerlib }));
  await test('X-5 never auto-advance', () => checkNoAutoAdvance(SRC.player));
  await test('X-6 watermark kept: same content, lighter, inside the question area', () => checkWatermark(SRC.player));
  await test('X-7 timer: normal → amber ≤ 5:00 → red ≤ 1:00, no flashing, 2 announcements', () => checkTimer(SRC.timer, SRC.timerlib));
  await test('X-8 phone: icon actions + wide Save & Next; palette sheet with Submit test / Instructions / Full screen', () => checkPhone(SRC.player));
  await test('X-9 the test fixture never exists in a deployed build', () => checkFixture(SRC.config, SRC.fxPage, SRC.fxLayout));

  await test('X-10 negative controls: each broken variant is caught', () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const P = SRC.player;
    const muts = [
      ['action bar off-screen at 1366×768 (a taller bar)', () => checkLayout(mut(P, 'className="hidden h-[67px] items-center', 'className="hidden h-[700px] items-center'))],
      ['action bar 1 px over spec (border, no row trim)', () => checkLayout(mut(P, 'className="hidden h-[67px] items-center', 'className="hidden h-[68px] items-center'))],
      ['action bar inside the scrolling question area', () =>
        checkLayout(mut(P, '        </main>\n', `        <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" data-action-bar="">x</div>\n        </main>\n`))],
      ['the page scrolls (root not overflow-hidden)', () => checkLayout(mut(P, 'flex h-dvh flex-col overflow-hidden', 'flex min-h-dvh flex-col'))],
      ['a second vertical scroll area', () => checkLayout(mut(P, 'data-section-tabs=""', 'data-section-tabs="" data-x="overflow-y-auto"'))],
      ['the top bar grows', () => checkLayout(mut(P, 'lg:h-[60px] lg:gap-3', 'lg:h-[96px] lg:gap-3'))],
      ['"Go to question" present', () => checkNoGoto(P, SRC.pal.replace('</div>\n  );\n}', '<label>Go to question no.<input type="number" /></label></div>\n  );\n}'))],
      ['legend missing a state', () => checkLegend(undefined, mut(SRC.pallib, '  { status: "marked", label: "Marked for review" },\n', ''))],
      ['legend missing a count', () => checkLegend(mut(SRC.pal, '{counts[s.status]}', ''))],
      ['legend with a wrong count', () => checkLegend(mut(SRC.pal, '{counts[s.status]}', '{counts[s.status] + (s.status === "marked" ? 1 : 0)}'))],
      ['a second legend', () => checkLegend(mut(SRC.pal, '{/* Filters with counts (segmented) */}', '<ul data-palette-legend="" />'))],
      ['filters without counts', () => checkLegend(mut(SRC.pal, '<span className="tabular-nums" data-filter-count={f.key}>{fCounts[f.key]}</span>', ''))],
      ['palette cells under 48 px', () => checkLegend(mut(SRC.pal, 'focus-ring relative flex size-12', 'focus-ring relative flex size-9'))],
      ['colour literal in the player', () => checkTokens({ player: mut(P, 'data-question-scroll=""', 'data-question-scroll="" style={{ color: "#c8341f" }}') })],
      ['rgb() colour in the palette', () => checkTokens({ palette: mut(SRC.pal, 'data-palette-grid=""', 'data-palette-grid="" style={{ background: "rgb(1, 2, 3)" }}') })],
      ['legacy colour class in the timer', () => checkTokens({ timer: mut(SRC.timer, 'border-cl-timer-red bg-cl-timer-red-tint', 'border-danger-600 bg-cl-timer-red-tint') })],
      ['arbitrary hex class in the player', () => checkTokens({ player: mut(P, 'bg-cl-cloud select-none', 'bg-[#f6f7fb] select-none') })],
      ['auto-advance introduced', () => checkNoAutoAdvance(mut(P, '        persistAnswer(currentQ.mockQuestionId, updated);\n      }\n    },', '        persistAnswer(currentQ.mockQuestionId, updated);\n      }\n      setTimeout(() => handleSaveAndNext(), 400);\n    },'))],
      ['auto-advance via navigation', () => checkNoAutoAdvance(mut(P, '      setAnswers((prev) => ({\n        ...prev,\n        [currentQ.mockQuestionId]: updated,\n      }));', '      setAnswers((prev) => ({\n        ...prev,\n        [currentQ.mockQuestionId]: updated,\n      }));\n      navigateToQuestionIndex(currentIndex + 1);'))],
      ['watermark removed', () => checkWatermark(P.replace(/<CandidateSecurityWatermark[\s\S]*?\/>/, ''))],
      ['watermark content changed', () => checkWatermark(mut(P, 'examTitle={session.testTitle}', 'examTitle="Exam"'))],
      ['watermark moved out of the question area', () => {
        const wm = P.match(/\s*<CandidateSecurityWatermark[\s\S]*?\/>/)[0];
        return checkWatermark(mut(P.replace(wm, ''), '<div className="fixed inset-0 z-50', `${wm}<div className="fixed inset-0 z-50`));
      }],
      ['timer flashes', () => checkTimer(mut(SRC.timer, '"flex min-h-11 items-center', '"animate-pulse flex min-h-11 items-center'), SRC.timerlib)],
      ['timer never turns red', () => checkTimer(SRC.timer, mut(SRC.timerlib, 'if (seconds <= RED_TONE_SECONDS) return "red";', ''))],
      ['timer announces every second', () => checkTimer(mut(SRC.timer, '}, [tone]);', '}, [seconds, tone]);'), SRC.timerlib)],
      ['phone Previous without a label', () => checkPhone(mut(P, 'aria-label="Previous" className={exIcon} data-cbt-phone="previous"', 'className={exIcon} data-cbt-phone="previous"'))],
      ['sheet without Submit test', () => checkPhone(P.replace(/<button[\s\S]*?data-submit-test-sheet=""[\s\S]*?<\/button>/, ''))],
      ['desktop-only header button shown on phones (bare hidden + helper)', () => checkPhone(mut(P, 'className={`${exOutline} max-lg:hidden`} data-submit-test=""', 'className={`hidden lg:inline-flex ${exOutline}`} data-submit-test=""'))],
      ['Instructions always in the phone header', () => checkPhone(mut(P, 'className={`${exText} max-lg:hidden`} data-header-label="instructions"', 'className={exText} data-header-label="instructions"'))],
      ['fixture in every build', () => checkFixture(mut(SRC.config, '...(process.env.EXAM_UX_FIXTURE === "1" ? ["fixture.tsx"] : [])', '"fixture.tsx"'), SRC.fxPage, SRC.fxLayout)],
      ['fixture page without the production 404', () => checkFixture(SRC.config, mut(SRC.fxPage, 'process.env.VERCEL_ENV === "production" || ', ''), SRC.fxLayout)],
      ['fixture reads the database', () => checkFixture(SRC.config, 'import { createClient } from "@/lib/supabase/server";\n' + SRC.fxPage, SRC.fxLayout)],
      ['fixture indexable', () => checkFixture(SRC.config, SRC.fxPage, mut(SRC.fxLayout, 'robots: { index: false, follow: false }', 'robots: { index: true }'))],
    ];
    const missed = [];
    for (const [name, run] of muts) {
      let caught = false;
      try {
        run();
      } catch (e) {
        caught = !/mutation anchor missing/.test(String(e && e.message));
        if (!caught) missed.push(`${name} (${e.message})`);
        continue;
      }
      if (!caught) missed.push(name);
    }
    assert(missed.length === 0, `not caught: ${missed.join('; ')}`);
    return `${muts.length}/${muts.length} broken variants caught`;
  });

  console.log(results.join('\n'));
  console.log(`\nEXAM-UX-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
