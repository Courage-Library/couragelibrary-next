#!/usr/bin/env node
/**
 * Courage Studio phase 3 — batch 1 (Question bank, Question drafts / factory, Question reports, Current affairs admin):
 * the Studio template, statically. Offline, reads source only.
 *   P3-01 each batch-1 page uses StudioPageHeader with exactly ONE primary action (R4); quiet secondary actions
 *   P3-02 D-5: every report count is computed with the SAME predicate as its filter (Verified / Resolved separate)
 *   P3-03 list rows and filter counts are real buttons (no clickable <div>); counts are aria-pressed toggles
 *   P3-04 every <select> in the batch-1 components has a name (associated label / StudioField / aria-label)
 *   P3-05 icon-only buttons are named (delete / previous / next / close)
 *   P3-06 list + drawer: the question add / edit forms and the report inspector open in StudioDrawer (native dialog)
 *   P3-07 v3 status chips (StatusChip) for statuses; unknown counts show "–", never a made-up 0 (R12)
 *   P3-08 the factory tabs: real tablist / tab / tabpanel with arrow keys; underline style (no second solid primary)
 * Run: node scripts/test_studio_phase3.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const FILES = {
  bank: 'components/admin/admin-question-manager.tsx',
  factory: 'components/admin/question-factory/question-factory-studio.tsx',
  reportsPage: 'app/admin/question-reports/page.tsx',
  reports: 'components/admin/admin-question-reports-manager.tsx',
  caHeader: 'components/admin/current-affairs/current-affairs-header.tsx',
  caStats: 'components/admin/current-affairs/current-affairs-stats-bar.tsx',
  caFilter: 'components/admin/current-affairs/current-affairs-filter-bar.tsx',
  caTable: 'components/admin/current-affairs/current-affairs-table.tsx',
};
const S = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, code(read(f))]));

test('P3-01 Studio header with exactly ONE primary action per page', () => {
  for (const [k, src] of [['bank', S.bank], ['factory', S.factory], ['ca', S.caHeader]]) {
    assert(/<StudioPageHeader\b/.test(src), `${k}: no StudioPageHeader`);
    assert((src.match(/className=\{studioPrimaryAction\}/g) || []).length === 1, `${k}: ${(src.match(/className=\{studioPrimaryAction\}/g) || []).length} primary actions`);
  }
  assert(/<StudioPageHeader\b/.test(S.reportsPage), 'reports page header');
  assert(!/bg-(emerald|purple|indigo)-50 hover:bg-/.test(S.caHeader), 'CA: no coloured pseudo-primary buttons');
  return 'bank, factory, reports, current affairs';
});

test('P3-02 D-5: each report count uses the same predicate as its filter', () => {
  const r = S.reports;
  assert(/const countOf = \(key: string\) => \(key === "ALL" \? reports\.length : reports\.filter\(\(r\) => r\.status === key\)\.length\);/.test(r), 'count = r.status === key');
  assert(/if \(selectedStatus !== "ALL" && r\.status !== selectedStatus\) return false;/.test(r), 'filter = r.status === key');
  assert(/key: "VERIFIED"/.test(r) && /key: "RESOLVED"/.test(r) && !/"RESOLVED" \|\| r\.status === "VERIFIED"|VERIFIED"\s*\|\|/.test(r), 'Verified and Resolved counted separately');
});

test('P3-03 rows and counts are buttons; no clickable divs', () => {
  for (const [k, src] of Object.entries(S)) assert(!/<div[^>]*\sonClick=/.test(src.replace(/<dialog[\s\S]*?>/g, '')), `${k}: clickable <div>`);
  assert(/<button type="button" onClick=\{\(\) => handleSelectReport\(r\)\}/.test(S.reports), 'report rows are buttons');
  const strip = code(read('components/admin/studio/studio-page.tsx'));
  assert(/aria-pressed=\{!!s\.active\}/.test(strip), 'counts are aria-pressed toggles');
});

test('P3-04 every <select> in batch 1 has a name', () => {
  const bad = [];
  for (const [k, src] of Object.entries(S)) {
    for (const m of src.matchAll(/<select\b([^>]*)>/g)) {
      const attrs = m[1];
      const id = (attrs.match(/\bid=["{]([^"}]+)["}]/) || [])[1];
      const named = /aria-label=|aria-labelledby=/.test(attrs) || (id && new RegExp(`htmlFor=["{]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["}]`).test(src));
      if (!named) bad.push(`${k}: <select${attrs.slice(0, 60)}>`);
    }
  }
  assert(bad.length === 0, bad.join('\n        '));
});

test('P3-05 icon-only buttons are named', () => {
  assert(/aria-label="Delete question"/.test(S.bank) && /aria-label="Previous page"/.test(S.bank) && /aria-label="Next page"/.test(S.bank), 'bank: delete / prev / next');
  assert(/aria-label=\{`Close \$\{title\}`\}/.test(code(read('components/admin/studio/studio-drawer.tsx'))), 'drawer close button');
});

test('P3-06 list + drawer: add / edit / inspect open in the Studio drawer (native dialog)', () => {
  const d = code(read('components/admin/studio/studio-drawer.tsx'));
  assert(/<dialog/.test(d) && /showModal\(\)/.test(d) && /aria-labelledby=\{titleId\}/.test(d), 'native modal dialog, labelled');
  assert(/<StudioDrawer open=\{addOpen\}/.test(S.bank) && /<StudioDrawer open=\{!!editingQuestion\}/.test(S.bank), 'bank: add + edit drawers');
  assert(/<StudioDrawer\s+open=\{!!activeReport\}/.test(S.reports), 'reports: inspector drawer');
  assert(/onClick=\{\(\) => setAddOpen\(true\)\}/.test(S.bank), 'bank: "Add question" opens the drawer');
});

test('P3-07 v3 status chips; unknown counts show "–", never 0', () => {
  assert(/<StatusChip status=\{r\.status\} \/>/.test(S.reports) && /<StatusChip status=\{status\} \/>/.test(S.caTable), 'StatusChip in reports + CA');
  assert(/const v = \(n: number \| undefined\) => \(isLoading \|\| !stats \? null : n \?\? 0\);/.test(S.caStats), 'CA counts null while loading / unknown');
  assert(/s\.value === null \? "–"/.test(code(read('components/admin/studio/studio-page.tsx'))), 'the strip renders "–" for null');
});

test('P3-08 factory tabs: tablist / tab / tabpanel, arrow keys, underline (no second solid primary)', () => {
  const f = S.factory;
  assert(/role="tablist"/.test(f) && /role="tab"/.test(f) && /role="tabpanel"/.test(f) && /aria-controls="qf-tabpanel"/.test(f), 'ARIA tabs');
  assert(/e\.key !== "ArrowRight" && e\.key !== "ArrowLeft"/.test(f) && /tabIndex=\{active \? 0 : -1\}/.test(f), 'arrow keys + roving tabindex');
  assert(!/bg-primary-700 text-white/.test(f), 'no solid-blue tab');
});

console.log(`\nCourage Studio phase 3 (batch 1): ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
