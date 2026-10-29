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
 * Batch 2 (Mock tests + the mock-test setup overview, Patterns, Sections, Categories, Schedules, Bulk import):
 *   B2-01 Studio header; exactly ONE primary on the list pages and the overview; Schedules / Bulk import keep the
 *         contextual actions in their tabs (no solid primary in the header, no solid-blue tab)
 *   B2-02 list + drawer: create and edit open in StudioDrawer; no hand-rolled fixed overlay modal on the 3 list pages
 *   B2-03 every input / select / textarea on the 3 list pages has an id with a StudioField / <label htmlFor>
 *   B2-04 icon-only buttons are named (aria-label), never by title alone; pagination is labelled
 *   B2-05 v3 status chips; an inactive item reads "Inactive" (not "Draft"); stat strips filter (aria-pressed) with
 *         counts from the same list the filter uses
 *   B2-06 Schedules + Bulk import: real tablist / tab / tabpanel with arrow keys, underline style
 *   B2-07 R12: the question count is null on a failed read ("–"), never a made-up 0; failed toggles are shown
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
  reportsPage: 'app/admin/support/question-reports/page.tsx',
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

// ---------------------------------------------------------------- batch 2
const B2 = {
  patterns: read('components/admin/admin-patterns-manager.tsx'),
  sections: read('components/admin/admin-sections-manager.tsx'),
  mocks: read('components/admin/admin-mock-tests-manager.tsx'),
  schedules: read('components/admin/admin-schedules-manager.tsx'),
  bulk: read('components/admin/admin-bulk-import-studio.tsx'),
};
// ADMIN-IA-1 (2026-10-29): Categories folded into Exams and the orphan Mock test setup overview retired (their old
// addresses redirect); the three remaining list pages keep every check
const LISTS = ['patterns', 'sections', 'mocks'];

test('B2-01 Studio header; ONE primary on the list pages; Schedules / Bulk import: no header primary, no solid-blue tab', () => {
  for (const k of LISTS) {
    const src = code(B2[k]);
    assert(/<StudioPageHeader\b/.test(src), `${k}: no StudioPageHeader`);
    const n = (src.match(/className=\{studioPrimaryAction\}/g) || []).length;
    assert(n === 1, `${k}: ${n} primary actions`);
    assert(!/AdminBreadcrumbs|components\/ui\/legacy\/(card|button|badge|alert)/.test(src), `${k}: legacy breadcrumbs / cards / buttons / badges remain`);
  }
  for (const k of ['schedules', 'bulk']) {
    const src = code(B2[k]);
    assert(/<StudioPageHeader\b/.test(src) && !/AdminBreadcrumbs/.test(src), `${k}: Studio header`);
    const header = src.slice(src.indexOf('<StudioPageHeader'), src.indexOf('/>', src.indexOf('actions={')) + 2);
    assert(!/studioPrimaryAction|bg-primary-700/.test(header), `${k}: a solid primary in the header`);
  }
  return 'mock tests, patterns, sections · schedules, bulk import';
});

test('B2-02 list + drawer: create and edit open in StudioDrawer; no fixed overlay modal on the 3 list pages', () => {
  for (const k of LISTS) {
    const src = code(B2[k]);
    assert((src.match(/<StudioDrawer\b/g) || []).length === 2, `${k}: create + edit drawers`);
    assert(!/fixed inset-0/.test(src), `${k}: a hand-rolled overlay modal remains`);
  }
  return '4 pages × 2 drawers';
});

test('B2-03 every input / select / textarea on the 3 list pages is labelled', () => {
  let n = 0;
  for (const k of LISTS) {
    const src = code(B2[k]);
    for (const m of src.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      if (/type="hidden"/.test(m[2])) continue;
      const id = /\bid="([^"]+)"/.exec(m[2]);
      assert(id, `${k}: an unlabelled <${m[1]}> (${m[2].slice(0, 60)})`);
      assert(src.includes(`htmlFor="${id[1]}"`), `${k}: #${id[1]} has no StudioField / label`);
      n++;
    }
  }
  for (const [k, id] of [['schedules', 'sched-exam'], ['bulk', 'bi-category'], ['bulk', 'bi-section']]) assert(B2[k].includes(`id="${id}"`) && B2[k].includes(`htmlFor="${id}"`), `${k}: #${id} labelled`);
  return `${n} controls`;
});

test('B2-04 icon-only buttons are named (aria-label); pagination labelled', () => {
  for (const k of LISTS) {
    const src = code(B2[k]);
    for (const m of src.matchAll(/<button\b([^>]*)>\s*<(Edit2|Power|Trash2|ChevronLeft|ChevronRight)\b/g)) assert(/aria-label=/.test(m[1]), `${k}: an unnamed ${m[2]} button`);
    assert(!/title="(Edit|Delete|Toggle|Deactivate|Activate)/.test(src), `${k}: a button named only by title`);
  }
  for (const k of ['patterns', 'sections']) assert(/aria-label="Previous page"/.test(B2[k]) && /aria-label="Next page"/.test(B2[k]) && /aria-label=\{`Page \$\{n\}`\}/.test(B2[k]), `${k}: labelled pagination`);
  assert(/aria-label="Dismiss the notification"/.test(B2.schedules), 'schedules: the toast close button');
  return 'ok';
});

test('B2-05 v3 status chips ("Inactive", not "Draft"); stat strips filter with counts from the filtered list', () => {
  assert(/<StatusChip status=\{pattern\.isActive \? "ACTIVE" : "INACTIVE"\} \/>/.test(B2.patterns) && /<StatusChip status=\{mock\.isPublished \? "PUBLISHED" : "DRAFT"\} \/>/.test(B2.mocks), 'chips');
  for (const k of LISTS) assert(/<StudioStatStrip\b[\s\S]{0,200}onSelect=/.test(B2[k]) && /active: \w+ === "ALL"/.test(B2[k]), `${k}: a filtering stat strip`);
  // D-5 rule from batch 1: each count uses the same predicate as its filter
  assert(/ACTIVE: inCategory\.filter\(\(p\) => p\.isActive\)\.length/.test(B2.patterns) && /if \(status === "ACTIVE" && !p\.isActive\) return false;/.test(B2.patterns), 'patterns: count = filter');
  assert(/READY: inPattern\.filter\(ready\)\.length/.test(B2.sections) && /if \(bank === "READY" && !ready\(s\)\) return false;/.test(B2.sections), 'sections: count = filter');
  assert(/PUBLISHED: scoped\.filter\(\(t\) => t\.isPublished\)\.length/.test(B2.mocks) && /if \(publish === "PUBLISHED" && !t\.isPublished\) return false;/.test(B2.mocks), 'mock tests: count = filter');
  return 'ok';
});

test('B2-06 Schedules + Bulk import: tablist / tab / tabpanel, arrow keys, underline', () => {
  for (const [k, prefix, n] of [['schedules', 'sched', 2], ['bulk', 'bi', 3]]) {
    const src = B2[k];
    assert(/role="tablist"/.test(src) && /role="tab"/.test(src) && /aria-selected=\{activeTab === key\}/.test(src) && /tabIndex=\{activeTab === key \? 0 : -1\}/.test(src), `${k}: tab roles`);
    assert(/e\.key !== "ArrowRight" && e\.key !== "ArrowLeft"/.test(src), `${k}: arrow keys`);
    assert((src.match(new RegExp(`role="tabpanel" id="${prefix}-panel-`, 'g')) || []).length === n, `${k}: ${n} tab panels`);
    assert(/border-b-2/.test(src) && !/activeTab === "(prompt|images|csv|daily_mocks|exam_cycles)"\s*\?\s*"bg-primary-700/.test(src), `${k}: underline, no solid-blue tab`);
  }
  return 'ok';
});

test('B2-07 R12: the overview question count is null on a failed read ("–"); failed toggles are shown', () => {
  const svc = read('services/admin.service.ts');
  assert(/static async getQuestionsCount\(\): Promise<number \| null> \{[\s\S]{0,260}return error \? null : \(count \?\? 0\);/.test(svc), 'getQuestionsCount: null on error');
  // ADMIN-IA-1: the overview page is retired (redirects to Mock tests); getQuestionsCount keeps its null-on-error contract
  assert(/if \(res\?\.error\) setActionFeedback\(\{ type: "error"/.test(B2.mocks), 'toggle failures are shown');
  return 'ok';
});

console.log(`\nCourage Studio phase 3 (batch 1 + 2): ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
