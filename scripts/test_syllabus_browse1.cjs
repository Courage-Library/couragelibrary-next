#!/usr/bin/env node
/**
 * SYLLABUS-UI-1 (syllabus browser) — offline gate (no network, no DB, no browser).
 *   L-01 search: name or subtopic match; accents / case / spaces ignored; a subtopic-only match opens its topic until the
 *        user closes it during that search; NEGATIVE CONTROL: an unrelated query shows nothing
 *   L-02 open / closed: toggle flips; Expand all / Collapse all touch only the shown, expandable topics of the subject;
 *        a topic without a body never opens
 *   L-03 subject switch + counts: per-subject counts follow the query; restore keeps only subjects / topics that still
 *        exist (untrusted session JSON: arrays, numbers, junk are dropped)
 *   M-01 markup (server render of SyllabusBrowser): tablist + one tab per subject (first selected, roving tabindex),
 *        tabpanels; topic toggles are <button aria-expanded="false" aria-controls>; keepMounted = every subject's topics
 *        and every body in the HTML (hidden); admin mode (no keepMounted) = only the first subject, no bodies; search
 *        has a label; Expand all / Collapse all; the jump sheet is a native <dialog>; no hash links that change the URL
 *   M-02 the student section: the read model → one tab per SECTION (the paper's title on the page), units as topic rows
 *        with weightage, "N subtopics" and the topic's practice / lesson counts ONCE; subtopic rows = names only
 *   M-03 dedupe (display only, by node_name): a topic whose only subtopic has its own name shows just the topic row;
 *        NEGATIVE CONTROLS: a differently named sole subtopic (whose shared topic `name` DOES equal the title — the old
 *        bug) and two same-name subtopics stay listed
 *   M-04 regression (SSC CGL "Statement-Based Reasoning"): subtopic labels come from node_name (the mapped node), not
 *        `name` (the rolled-up topic every mapping shares) → 3 distinct labels; no node_name → name
 *   S-01 sticky: ONE sticky bar (+ the rail beside it) at top-(--sticky-offset); the token is defined once in globals.css;
 *        the intake guide no longer sticks and the review sets --sticky-offset to minus the pane padding; the cycle page's
 *        quick nav sits under the header and the page offsets the token by its height; jump targets clear the bar
 *   P-01 no new package: the browser imports only react, lucide-react and its own state module (no tailwind-merge — the
 *        student page's bundle), and every storage access is inside try/catch
 * Run: node scripts/test_syllabus_browse1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;

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

const S = require(path.join(ROOT, 'lib/syllabus/browse-state.ts'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SyllabusBrowser } = require(path.join(ROOT, 'components/syllabus/syllabus-browser.tsx'));
const { ExamSyllabusSection } = require(path.join(ROOT, 'components/exams/exam-syllabus-section.tsx'));

const ITEMS = [
  { id: 'a1', subjectId: 'A', name: 'Number Series', terms: ['Missing Number', 'Wrong Term'], expandable: true },
  { id: 'a2', subjectId: 'A', name: 'Coding-Decoding', terms: ['Letter Shift'], expandable: true },
  { id: 'a3', subjectId: 'A', name: 'Calendar', terms: [], expandable: false },
  { id: 'b1', subjectId: 'B', name: 'Percentage', terms: ['Successive Change', 'Number of Students'], expandable: true },
  { id: 'b2', subjectId: 'B', name: 'Profit and Loss', terms: ['Café Bills'], expandable: true },
];
const EMPTY = { open: new Set(), closedInSearch: new Set() };
const shownWith = (q) => {
  const m = S.matchTopics(ITEMS, q);
  return ITEMS.filter((t) => S.isVisible(m, q, t.id)).map((t) => t.id);
};

test('L-01 search: name / subtopic match, normalised; subtopic-only match auto-opens until closed (negative control)', () => {
  assert(S.normText('  CAFÉ   Bills ') === 'cafe bills', `normText: ${S.normText('  CAFÉ   Bills ')}`);
  assert(shownWith('').length === ITEMS.length, 'empty query shows everything');
  assert(JSON.stringify(shownWith(S.normText('NUMBER'))) === JSON.stringify(['a1', 'b1']), `"number": ${shownWith('number')}`);
  assert(JSON.stringify(shownWith(S.normText('cafe'))) === JSON.stringify(['b2']), 'accent-insensitive subtopic match');
  assert(shownWith(S.normText('zzz-no-such-topic')).length === 0, 'NEGATIVE CONTROL: an unrelated query must show nothing');
  const q = S.normText('letter shift');
  const m = S.matchTopics(ITEMS, q);
  const a2 = ITEMS[1];
  assert(S.isOpen(a2, EMPTY, q, m) === true, 'a subtopic-only match opens its topic');
  assert(S.isOpen(ITEMS[0], EMPTY, S.normText('number series'), S.matchTopics(ITEMS, S.normText('number series'))) === false, 'a name match does not auto-open');
  const closed = S.toggleTopic(EMPTY, a2, q, m);
  assert(S.isOpen(a2, closed, q, m) === false, 'the user can close an auto-opened topic during the search');
  assert(S.isOpen(a2, { open: closed.open, closedInSearch: new Set() }, '', S.matchTopics(ITEMS, '')) === false, 'after the search it is closed again (never opened explicitly)');
  return 'number → 2, café → 1, zzz → 0';
});

test('L-02 open / closed: toggle; Expand all / Collapse all on shown expandable topics only; a topic without a body never opens', () => {
  const m = S.matchTopics(ITEMS, '');
  let s = S.toggleTopic(EMPTY, ITEMS[0], '', m);
  assert(S.isOpen(ITEMS[0], s, '', m) && !S.isOpen(ITEMS[1], s, '', m), 'toggle opens one topic');
  s = S.toggleTopic(s, ITEMS[0], '', m);
  assert(!S.isOpen(ITEMS[0], s, '', m), 'toggle closes it again');
  assert(S.toggleTopic(EMPTY, ITEMS[2], '', m) === EMPTY && !S.isOpen(ITEMS[2], S.setAllTopics(EMPTY, ITEMS, true), '', m), 'a topic without a body never opens');
  const subjectA = ITEMS.filter((t) => t.subjectId === 'A');
  const all = S.setAllTopics(EMPTY, subjectA, true);
  assert(S.isOpen(ITEMS[0], all, '', m) && S.isOpen(ITEMS[1], all, '', m) && !S.isOpen(ITEMS[3], all, '', m), 'Expand all opens the subject\'s topics only');
  const none = S.setAllTopics(all, subjectA, false);
  assert(subjectA.every((t) => !S.isOpen(t, none, '', m)), 'Collapse all closes them');
  const q = S.normText('letter');
  const mq = S.matchTopics(ITEMS, q);
  assert(!S.isOpen(ITEMS[1], S.setAllTopics(EMPTY, [ITEMS[1]], false), q, mq), 'Collapse all also closes search auto-opens');
  return 'ok';
});

test('L-03 subject counts follow the query; restore keeps only what exists (untrusted JSON)', () => {
  const q = S.normText('number');
  const c = S.subjectCounts(['A', 'B'], ITEMS, q, S.matchTopics(ITEMS, q));
  assert(c.get('A') === 1 && c.get('B') === 1, `counts ${[...c]}`);
  const c0 = S.subjectCounts(['A', 'B'], ITEMS, '', S.matchTopics(ITEMS, ''));
  assert(c0.get('A') === 3 && c0.get('B') === 2, 'no query: all topics');
  const r = S.restoreState({ subject: 'B', open: ['a1', 'gone', 7, 'a1', null] }, ['A', 'B'], ITEMS.map((t) => t.id));
  assert(r.subject === 'B' && JSON.stringify(r.open) === '["a1"]', JSON.stringify(r));
  for (const junk of [null, 'x', 42, [], { subject: 'Z', open: 'a1' }]) {
    const j = S.restoreState(junk, ['A', 'B'], ['a1']);
    assert(j.subject === null && j.open.length === 0, `junk restored: ${JSON.stringify(junk)}`);
  }
  return 'ok';
});

test('L-04 tab labels: the long subject names get their short form, per part; unknown names stay (negative control)', () => {
  const cases = [
    ['General Intelligence and Reasoning', 'Reasoning'],
    ['English Comprehension', 'English'],
    ['English Language', 'English'],
    ['Tier 1 · English Comprehension', 'Tier 1 · English'],
    ['Quantitative Aptitude', 'Quantitative Aptitude'],
    ['General Awareness', 'General Awareness'],
    ['English Literature', 'English Literature'],
  ];
  const bad = cases.filter(([a, b]) => S.shortSubjectLabel(a) !== b).map(([a, b]) => `${a} → ${S.shortSubjectLabel(a)} (want ${b})`);
  assert(bad.length === 0, bad.join('; '));
  return `${cases.length} cases`;
});

const h = React.createElement;
const browserProps = (keepMounted) => ({
  storageKey: 'gate',
  label: 'Syllabus',
  keepMounted,
  subjects: [{ id: 'A', label: 'Reasoning', intro: h('p', null, 'INTRO-A') }, { id: 'B', label: 'Quant' }],
  topics: ITEMS.map((t) => ({ id: t.id, subjectId: t.subjectId, name: t.name, terms: t.terms, summary: h('span', null, `SUM-${t.id}`), actions: t.id === 'a1' ? h('button', { type: 'button' }, 'ACT-a1') : undefined, body: t.expandable ? h('ul', null, ...t.terms.map((x) => h('li', { key: x }, x))) : undefined })),
});

test('M-01 markup: tabs, panels, toggles with aria-expanded, keepMounted vs lazy, labelled search, expand / collapse, native dialog', () => {
  const html = renderToStaticMarkup(h(SyllabusBrowser, browserProps(true)));
  const tabs = html.match(/role="tab"[^>]*>/g) || [];
  assert(/role="tablist" aria-label="Subjects"/.test(html) && tabs.length === 2, `tabs ${tabs.length}`);
  assert(/aria-selected="true"[^>]*tabindex="0"/.test(tabs[0]) && /aria-selected="false"[^>]*tabindex="-1"/.test(tabs[1]), 'first tab selected, roving tabindex');
  assert((html.match(/role="tabpanel"/g) || []).length === 2 && /data-subject-panel="B"[^>]*>|hidden=""[^>]*data-subject-panel="B"/.test(html), 'two tabpanels, the second hidden');
  const toggles = html.match(/<button[^>]*data-topic-toggle[^>]*>/g) || [];
  assert(toggles.length === 4 && toggles.every((b) => /aria-expanded="false"/.test(b) && /aria-controls="/.test(b)), `4 toggles collapsed with aria-controls (got ${toggles.length})`);
  const a3 = html.slice(html.indexOf('data-topic="a3"'), html.indexOf('</li>', html.indexOf('data-topic="a3"')));
  assert(/<div data-topic-toggle=""/.test(a3) && !/<button/.test(a3) && a3.includes('SUM-a3'), 'a topic without a body has no toggle button');
  for (const s of ['Missing Number', 'Successive Change', 'Café Bills', 'INTRO-A', 'ACT-a1']) assert(html.includes(s), `keepMounted: "${s}" in the HTML`);
  assert((html.match(/data-topic-body=""/g) || []).length === 4 && (html.match(/hidden="" class="border-t[^"]*" data-topic-body/g) || []).length === 4, 'every body present and hidden');
  assert(/<label[^>]*><span class="sr-only">Search topics and subtopics<\/span>/.test(html) && /type="search"/.test(html), 'labelled search');
  assert(/data-expand-all=""[^>]*>Expand all/.test(html) && /data-collapse-all=""[^>]*>Collapse all/.test(html), 'Expand all / Collapse all');
  assert(/<dialog[^>]*data-jump-sheet=""/.test(html) && /aria-haspopup="dialog"[^>]*data-jump-open/.test(html), 'jump sheet = native dialog');
  assert(/<nav aria-label="Topics in Reasoning"[^>]*data-rail=""/.test(html), 'rail names the subject');
  const long = renderToStaticMarkup(h(SyllabusBrowser, { ...browserProps(false), subjects: [{ id: 'A', label: 'English Comprehension' }, { id: 'B', label: 'Quant' }] }));
  assert(/role="tab"[^>]*title="English Comprehension"[^>]*>English<span/.test(long), 'a shortened tab shows the short label, the full name as its title');
  assert(/data-subject-tabs-wrap=""/.test(long) && !/data-tabs-fade/.test(long), 'the edge fade appears only once an overflow is measured (none on the server)');
  const b = read('components/syllabus/syllabus-browser.tsx');
  assert(/data-tabs-fade="right"/.test(b) && /data-tabs-fade="left"/.test(b) && /data-tabs-more=""/.test(b) && /bg-linear-to-l from-surface/.test(b), 'right / left fade + arrow exist in the source');
  const lazy = renderToStaticMarkup(h(SyllabusBrowser, browserProps(false)));
  assert(!lazy.includes('SUM-b1') && !lazy.includes('Missing Number') && lazy.includes('SUM-a1') && !/data-topic-body/.test(lazy), 'admin mode: only the open subject, no closed bodies');
  return `${html.length} chars (keepMounted), ${lazy.length} (lazy)`;
});

// read-model fixtures as fn_exam_syllabus_read_model returns them: name = the rolled-up TOPIC's name, node_name = the
// mapped node's own name (SYLLABUS-UI-1: the label)
const ZERO = { topics: 0, published_questions: 0, servable_documents: 0, topics_with_questions: 0, topics_with_documents: 0 };
const rmNode = (o) => ({ description: null, order: 0, depth: 1, weightage_tier: null, expected_questions_min: null, expected_questions_max: null, is_mandatory: true, topics: [], counts: ZERO, slug: o.id, ...o });
const rmTopic = (id, name, nodeName, nodeId = `n-${id}`) => ({ topic_id: id, name, slug: id, subject_id: null, weight: null, published_questions: 0, servable_documents: 0, node_id: nodeId, node_type: 'SUBTOPIC', node_name: nodeName });
const rmCounts = (q, docs) => ({ ...ZERO, topics: 1, published_questions: q, servable_documents: docs });
const rmSyllabus = (nodes) => ({
  state: 'AVAILABLE', exam_id: 'e',
  version: { id: 'v', version_number: 1, version_tag: 't', exam_cycle_id: null, published_at: '2026-10-29T00:00:00Z' },
  totals: { nodes: nodes.length, topics: 3, published_questions: 0, servable_documents: 0 },
  nodes,
});
/** the visible text of a topic's body (tags and attributes removed) */
const bodyText = (row) => { const i = row.indexOf('data-topic-body'); return i < 0 ? '' : row.slice(i, row.indexOf('</ul>', i)).replace(/^[^>]*>/, '').replace(/<[^>]+>/g, ' | '); };
const rowOf = (html, id, nextId) => html.slice(html.indexOf(`data-topic="${id}"`), nextId ? html.indexOf(`data-topic="${nextId}"`) : undefined);

test('M-02 student section: one tab per SECTION, the paper title, units as topic rows (weightage, subtopics, counts once)', () => {
  const html = renderToStaticMarkup(h(ExamSyllabusSection, { examTitle: 'X', syllabus: rmSyllabus([
    rmNode({ id: 'p', parent_id: null, kind: 'PAPER', title: 'Tier 1', order: 1 }),
    rmNode({ id: 's1', parent_id: 'p', kind: 'SECTION', title: 'Reasoning Section', order: 1, expected_questions_min: 25, expected_questions_max: 25 }),
    rmNode({ id: 's2', parent_id: 'p', kind: 'SECTION', title: 'Empty Section', order: 2 }),
    rmNode({ id: 'u1', parent_id: 's1', kind: 'UNIT', title: 'Unit With Lessons', order: 1, weightage_tier: 'HIGH_YIELD', topics: [rmTopic('t1', 'Unit With Lessons', 'Sub One'), rmTopic('t1', 'Unit With Lessons', 'Sub Two')], counts: rmCounts(12, 2) }),
    rmNode({ id: 'u2', parent_id: 's1', kind: 'UNIT', title: 'Unit Coming', order: 2, topics: [rmTopic('t3', 'Unit Coming', 'Sub Three')] }),
  ]) }));
  for (const s of ['Tier 1', 'Reasoning Section', 'Empty Section', 'Unit With Lessons', 'High yield', '2 subtopics', '2 lessons available', '12 practice questions', 'Lessons coming soon', 'Questions coming soon', 'Sub One', 'Sub Two', 'Sub Three', '25 questions expected']) assert(html.includes(s), `missing "${s}"`);
  assert((html.match(/role="tab"/g) || []).length === 2, 'one tab per section (the empty one too)');
  assert(/data-lesson-status="available"/.test(html) && /data-lesson-status="coming-soon"/.test(html), 'lesson status per topic');
  const u1 = rowOf(html, 'u1', 'u2');
  assert((u1.match(/12 practice questions/g) || []).length === 1 && (u1.match(/2 lessons available/g) || []).length === 1, 'the topic\'s counts appear ONCE (on the topic row)');
  const body = bodyText(u1);
  assert(body.includes('Sub One') && !/practice question|lesson/i.test(body), 'subtopic rows show their name only (no counts)');
  return 'ok';
});

test('M-03 dedupe (display only) by node_name: a sole subtopic named like its topic → only the topic row; NEGATIVE CONTROLS stay listed', () => {
  const { soleSameNameSubtopic } = require(path.join(ROOT, 'components/exams/exam-syllabus-section.tsx'));
  const same = rmNode({ id: 'u1', parent_id: 's', kind: 'UNIT', title: 'Number  Series', order: 1, topics: [rmTopic('t1', 'Number Series', 'number series')], counts: rmCounts(7, 0) });
  const other = rmNode({ id: 'u2', parent_id: 's', kind: 'UNIT', title: 'Analogy', order: 2, topics: [rmTopic('t2', 'Analogy', 'Word Analogy')] });
  const twice = rmNode({ id: 'u3', parent_id: 's', kind: 'UNIT', title: 'Syllogism', order: 3, topics: [rmTopic('t3', 'Syllogism', 'Syllogism', 'n-a'), rmTopic('t3', 'Syllogism', 'Syllogism', 'n-b')] });
  assert(soleSameNameSubtopic(same) && !soleSameNameSubtopic(other) && !soleSameNameSubtopic(twice), 'rule: exactly one subtopic whose node_name is the topic name (case / spaces ignored)');
  assert(!soleSameNameSubtopic(other) && other.topics[0].name === other.title, 'NEGATIVE CONTROL (the old bug): the shared topic `name` equals the title, node_name does not → not deduped');
  const html = renderToStaticMarkup(h(ExamSyllabusSection, { examTitle: 'X', syllabus: rmSyllabus([rmNode({ id: 's', parent_id: null, kind: 'SECTION', title: 'Reasoning' }), same, other, twice]) }));
  const r1 = rowOf(html, 'u1', 'u2');
  const r2 = rowOf(html, 'u2', 'u3');
  const r3 = rowOf(html, 'u3');
  assert(!/<button[^>]*data-topic-toggle/.test(r1) && !/data-topic-body/.test(r1) && !/\d+ subtopics?/.test(r1) && /data-sole-subtopic=""/.test(r1) && /7 practice questions/.test(r1), 'deduped: one row, no toggle / body / "1 subtopic", practice count on the row');
  assert((r1.match(/number series|Number {2}Series/gi) || []).length === 1, 'the name appears once');
  assert(/<button[^>]*data-topic-toggle/.test(r2) && /Word Analogy/.test(r2) && /1 subtopic/.test(r2), 'NEGATIVE CONTROL: a differently named sole subtopic is still listed');
  assert(/2 subtopics/.test(r3) && (r3.match(/data-subtopic="">Syllogism</g) || []).length === 2, 'NEGATIVE CONTROL: two same-name subtopics are still listed');
  return 'ok';
});

test('M-04 regression (SSC CGL "Statement-Based Reasoning"): 3 mappings, one topic name, 3 node_names → 3 distinct labels; fallback to name', () => {
  const { subtopicLabel } = require(path.join(ROOT, 'components/exams/exam-syllabus-section.tsx'));
  const T = 'Statement-Based Reasoning';
  const subs = ['Decision Making and Problem Solving', 'Statement and Argument', 'Statement and Conclusion'];
  const unit = rmNode({ id: 'u1', parent_id: 's', kind: 'UNIT', title: T, order: 1, topics: subs.map((n, i) => rmTopic('t-sbr', T, n, `n-${i}`)) });
  const html = renderToStaticMarkup(h(ExamSyllabusSection, { examTitle: 'X', syllabus: rmSyllabus([rmNode({ id: 's', parent_id: null, kind: 'SECTION', title: 'Reasoning' }), unit]) }));
  const labels = [...rowOf(html, 'u1').matchAll(/data-subtopic="">([^<]+)</g)].map((m) => m[1]);
  assert(JSON.stringify(labels) === JSON.stringify(subs), `rendered labels: ${JSON.stringify(labels)}`);
  assert(!labels.includes(T), 'NEGATIVE CONTROL: the shared topic name is not a subtopic label');
  const body = bodyText(rowOf(html, 'u1'));
  assert(body.includes(subs[0]) && !body.includes(T), 'the topic name is not repeated inside its body');
  assert(subtopicLabel({ name: 'Fallback', node_name: null }) === 'Fallback' && subtopicLabel({ name: 'Fallback', node_name: '  ' }) === 'Fallback', 'no node_name → name');
  return labels.join(' · ');
});

test('S-01 sticky: one bar + rail at the token; token defined once; intake guide not sticky; cycle quick nav offset; jump margin', () => {
  const b = read('components/syllabus/syllabus-browser.tsx');
  const sticky = b.match(/\bsticky top-\(--sticky-offset\)/g) || [];
  assert(sticky.length === 2 && (b.match(/\bsticky\b/g) || []).filter((x) => x).length >= 2 && !/sticky top-(0|\d|\[)/.test(b), `two sticky elements at the token (bar + rail), got ${sticky.length}`);
  assert(/data-syllabus-bar=""/.test(b) && /z-10/.test(b) && /bg-surface px-1 py-2" data-syllabus-bar/.test(b), 'the bar is opaque (bg-surface) under the header (z-10 < z-30)');
  assert(/scroll-mt-\[calc\(max\(var\(--sticky-offset\),0px\)\+var\(--syl-bar-h,4rem\)\+0\.75rem\)\]/.test(b) && /--syl-bar-h/.test(b), 'jump targets clear the bar');
  const g = read('app/globals.css');
  assert((g.match(/--sticky-offset:/g) || []).length === 1 && /--site-header-h: 4rem;/.test(g), 'the token is defined once');
  assert(/sticky top-0 z-30[^"]*"[^>]*data-header-solid/.test(read('components/shell/header-bar.tsx')) && /h-16/.test(read('components/shell/header-bar.tsx')), 'the site header is 4rem (h-16) and sticky at 0');
  const r = read('components/admin/syllabus/intake-review.tsx');
  const code = r.replace(/\/\/.*|\{\/\*[^]*?\*\/\}|\/\*[^]*?\*\//g, '');
  assert(!/[\s"'`]sticky[\s"'`]/.test(code) &&/\[--sticky-offset:-1rem\] sm:\[--sticky-offset:-1\.5rem\]/.test(r), 'intake review: nothing else sticks; the offset is minus the pane padding');
  const shell = read('app/(site)/admin/layout.tsx');
  const pane = (/id="admin-content"[^>]*className="([^"]*)"/.exec(shell) || [])[1] || '';
  assert(['p-4', 'sm:p-6', 'xl:py-6'].every((c) => pane.split(/\s+/).includes(c)) && !/(^|\s)(md|lg|xl):p(t|y)?-(?!6)/.test(pane),'the admin pane padding the offset mirrors (p-4 / sm:p-6 / xl:py-6) — change both together');
  const qn = read('components/exams/exam-quick-nav.tsx');
  const cyc = read('app/(site)/exams/[slug]/cycle/[cycleYear]/page.tsx');
  assert(/sticky top-\(--site-header-h\) z-20 flex h-13/.test(qn) && /\[--sticky-offset:calc\(var\(--site-header-h\)\+3\.25rem\)\]/.test(cyc), 'cycle page: quick nav (h-13 = 3.25rem) under the header, the token offset by it');
  assert(/scroll-mt-\(--sticky-offset\)/.test(read('components/exams/exam-home.tsx')) && /id="syllabus"[^>]*scroll-mt-\(--sticky-offset\)/.test(cyc), '#syllabus anchors clear the header');
  return 'ok';
});

test('P-01 no new package; no tailwind-merge in the browser; storage only inside try/catch', () => {
  const b = read('components/syllabus/syllabus-browser.tsx');
  const imports = [...b.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert(imports.length >= 3, 'imports parsed');
  const foreign = imports.filter((i) => !['react', 'lucide-react', '@/lib/syllabus/browse-state'].includes(i));
  assert(foreign.length === 0, `unexpected imports: ${foreign}`);
  const lib = read('lib/syllabus/browse-state.ts');
  assert(![...lib.matchAll(/from "([^"]+)"/g)].length, 'the state module imports nothing');
  const uses = b.split('\n').map((l, i) => [l, i]).filter(([l]) => /sessionStorage|matchMedia/.test(l) && !/^\s*(\/?\*|\/\/)/.test(l));
  assert(uses.length >= 3, `storage uses found ${uses.length}`);
  const lines = b.split('\n');
  for (const [, i] of uses) assert(lines.slice(Math.max(0, i - 3), i).some((x) => /\btry \{/.test(x)), `line ${i + 1} not inside try`);
  const pkg = JSON.parse(read('package.json'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort().join(',');
  assert(!/jsdom|testing-library|framer|radix|headlessui|virtual/.test(deps), 'no UI / test package added');
  return 'ok';
});

console.log(`\nSYLLABUS-BROWSE-1 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
