#!/usr/bin/env node
/**
 * SYLLABUS-UI-1 + SYLLABUS-PUBLISH-IMPACT + SHELL-SCROLL-FIX-1 — offline gate (no network, no DB).
 *   W-01 warnings: "Structure" (anything that is not a content gap) vs "Content gaps" (no lessons / no questions, one row
 *        per topic); a Current Affairs-linked topic's "no lessons" is replaced by the CA label, its "no questions" stays;
 *        NEGATIVE CONTROL: without the CA link the same warning is a gap again
 *   T-01 tree: unit label by mapped level ("1 topic · 2 subtopics"); expected questions (min–max, else ~avg); Σ per
 *        section / paper vs its own count, > 20 % off flagged; "Go to unit" finds the unit(s) of a topic
 *   P-01 publish: typed confirmation exactly when a removed topic has lessons, questions or progress; the editor PAGE
 *        computes the impact after its admin guard (service role, read only: student progress is not readable by an admin
 *        session) and the dialog keeps "Publish now" off until it is shown + the phrase typed; the action stays RPC-only
 *        (EDITOR gate) and archives the chosen other-tier versions through the audited archive RPC
 *   E-01 editor (Studio rules): ONE primary on the screen (Publish, in the header; the dialogs' confirm buttons aside);
 *        Save details / Save topics secondary; Delete a quiet danger action with a confirm; warnings grouped + filterable
 *        with "Go to unit", lesson editor, question bank, coverage links; NEGATIVE CONTROL: the primary-count check fails
 *        on a copy with a second primary
 *   V-01 versions: JSON import (contract v1) behind "Advanced" + pointer to Syllabus intake; the cycle note names the live
 *        version's cycle; publishers by display name (no e-mail); tier shown
 *   C-01 content source: setContentSource is admin-only, TOPIC-only, audited, keeps other metadata keys
 *   S-01 shell: the admin shell and #admin-content are containing blocks (relative), h-dvh, one scroller; the intake guide
 *        has no nested scroll region; the Playwright gate (scripts/live/test_shell_scroll.cjs) has its negative control
 * Run: node scripts/test_syllabus_ui1.cjs
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
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};

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
const A = require(path.join(ROOT, 'lib/syllabus/editor-assist.ts'));

const W = (code, topic, name, node = null) => ({ code, topic_id: topic, node_id: node, message: code === 'TOPIC_NO_SERVABLE_DOCUMENTS' ? `Topic "${name}" has no published learning documents yet.` : code === 'TOPIC_NO_PUBLISHED_QUESTIONS' ? `Topic "${name}" has no published questions yet.` : `${name}`, });

test('W-01 warnings: structure vs content gaps; Current Affairs replaces the "no lessons" gap (negative control without the link)', () => {
  const ws = [
    W('TOPIC_NO_SERVABLE_DOCUMENTS', 't-ca', 'Current Affairs'),
    W('TOPIC_NO_PUBLISHED_QUESTIONS', 't-ca', 'Current Affairs'),
    W('TOPIC_NO_SERVABLE_DOCUMENTS', 't-a', 'Algebra'),
    W('TOPIC_NO_PUBLISHED_QUESTIONS', 't-a', 'Algebra'),
    W('TOPIC_NO_PUBLISHED_QUESTIONS', 't-b', 'Botany'),
    W('TOPIC_IN_MULTIPLE_SECTIONS', 't-a', 'Algebra is in 2 sections'),
    W('UNCERTAIN_ITEM', null, 'Paper is uncertain', 'n-1'),
  ];
  const g = A.groupWarnings(ws, new Set(['t-ca']));
  assert(g.structure.length === 2 && g.structure.every((w) => !A.CONTENT_GAP_CODES.includes(w.code)), JSON.stringify(g.structure));
  assert(JSON.stringify(g.gaps.map((r) => [r.name, r.gaps])) === JSON.stringify([['Algebra', ['NO_LESSONS', 'NO_QUESTIONS']], ['Botany', ['NO_QUESTIONS']], ['Current Affairs', ['NO_QUESTIONS']]]), JSON.stringify(g.gaps));
  assert(g.noLessons === 1 && g.noQuestions === 3 && JSON.stringify(g.caLinked) === JSON.stringify([{ topicId: 't-ca', name: 'Current Affairs' }]), JSON.stringify(g));
  const neg = A.groupWarnings(ws, new Set());
  assert(neg.noLessons === 2 && neg.caLinked.length === 0, 'negative control: without the link the gap must come back');
  return '2 structure · 3 gap rows · CA label; negative control ok';
});

test('T-01 tree: mapping labels, expected questions, Σ per section / paper (> 20 % flagged), units of a topic', () => {
  const rollup = { t1: { topicId: 't1', level: 'TOPIC' }, s1: { topicId: 't1', level: 'SUBTOPIC' }, s2: { topicId: 't1', level: 'SUBTOPIC' }, s3: { topicId: 't2', level: 'SUBTOPIC' } };
  const N = (id, parent, kind, extra = {}) => ({ id, parent_id: parent, kind, title: id, slug: id, description: null, display_order: 0, depth: parent ? 2 : 1, weightage_tier: null, expected_questions_min: null, expected_questions_max: null, is_mandatory: true, mappings: [], ...extra });
  const nodes = [
    N('p', null, 'PAPER', { expected_questions_max: 100 }),
    N('sec', 'p', 'SECTION', { expected_questions_max: 25 }),
    N('u1', 'sec', 'UNIT', { mappings: [{ topic_id: 's1', weight: null }, { topic_id: 's2', weight: null }], avg_questions: 20 }),
    N('u2', 'sec', 'UNIT', { mappings: [{ topic_id: 't1', weight: null }, { topic_id: 's3', weight: null }], expected_questions_min: 2, expected_questions_max: 4 }),
  ];
  assert(A.mappingLabel(nodes[2], rollup) === '2 subtopics' && A.mappingLabel(nodes[3], rollup) === '1 topic · 1 subtopic', `${A.mappingLabel(nodes[2], rollup)} / ${A.mappingLabel(nodes[3], rollup)}`);
  assert(A.unitQuestions(nodes[2]).label === '~20 Q' && A.unitQuestions(nodes[3]).label === '2–4 Q', 'unit questions');
  const sums = A.questionSums(nodes);
  const sec = sums.get('sec');
  const paper = sums.get('p');
  assert(sec.label === 'Σ 22–24 / 25 Q' && !sec.off, JSON.stringify(sec));
  assert(paper.label === 'Σ 22–24 / 100 Q' && paper.off, `paper ${JSON.stringify(paper)} (77 % off must be flagged)`);
  assert(JSON.stringify(A.unitsForTopic(nodes, rollup, 't1')) === JSON.stringify(['u1', 'u2']) && JSON.stringify(A.unitsForTopic(nodes, rollup, 't2')) === JSON.stringify(['u2']), 'units of a topic');
  return 'ok';
});

test('P-01 publish: typed confirmation rule; impact computed by the page; RPC-only action archives the chosen other tiers', () => {
  const base = { current: null, otherPublished: [], topicsAdded: [], unitsAdded: 0, unitsRemoved: 0, withLessons: 0, withQuestions: 0, topics: 0 };
  const T = (l, q, p) => ({ id: 'x', name: 'X', publishedLessons: l, publishedQuestions: q, progressRows: p });
  assert(!A.needsTypedConfirm({ ...base, topicsRemoved: [T(0, 0, 0)] }), 'an empty removed topic needs no typed confirmation');
  for (const t of [T(1, 0, 0), T(0, 3, 0), T(0, 0, 2)]) assert(A.needsTypedConfirm({ ...base, topicsRemoved: [t] }), `typed confirmation for ${JSON.stringify(t)}`);
  assert(A.confirmPhrase(4) === 'PUBLISH v4', 'phrase');
  const act = read('app/admin/syllabus/actions.ts');
  const pub = act.slice(act.indexOf('export async function publishSyllabusVersionAction'), act.indexOf('export async function archiveSyllabusVersionAction'));
  assert(/const __auth = await guardAdminAction\(\);/.test(pub.split('\n')[1]), 'publish guards first');
  assert(!/\.from\(|createAdminServerSupabaseClient/.test(pub) && /supabase\.rpc\("fn_syllabus_archive_version", \{ p_version_id: id \}\)/.test(pub) && /archiveOtherIds\.includes\(versionId\)/.test(pub), 'RPC-only; the chosen versions archived through the audited RPC; never the published one');
  const page = read('app/admin/syllabus/[id]/page.tsx');
  assert(/ctx\.role === "admin" && v\.status === "DRAFT" \? await computePublishImpact\(v\.id\)/.test(page) && page.indexOf('requireAdminPage') < page.indexOf('computePublishImpact(v.id)'), 'the page computes the impact after its guard (admin + draft)');
  const imp = read('lib/syllabus/publish-impact.ts');
  assert(/import "server-only";/.test(imp) && /\(exam_cycle_id IS NOT DISTINCT|exam_cycle_id \?\? null\) === cycleId/.test(imp) && /v\.tier === null \? 0 : 1/.test(imp), 'mirrors the read model order (cycle, exam-wide, all tiers first)');
  return 'ok';
});

/** the number of solid primary buttons outside the dialogs (variant absent = primary) */
function primariesOutsideDialogs(src) {
  const body = src.slice(src.indexOf('return ('), src.indexOf('<Dialog'));
  return (body.match(/<Button(?![^>]*variant=)[^>]*>/g) || []).length;
}

test('E-01 editor: one primary (Publish, header); secondary saves; quiet danger Delete + confirm; grouped warnings with links (negative control)', () => {
  const e = read('components/admin/syllabus/syllabus-editor.tsx');
  assert(primariesOutsideDialogs(e) === 1 && /data-header-actions=""[\s\S]{0,400}<Button onClick=\{openPublish\}/.test(e), `primaries outside dialogs: ${primariesOutsideDialogs(e)}`);
  const mutated = e.replace('<Button variant="secondary" onClick={saveDetails}', '<Button onClick={saveDetails}');
  assert(primariesOutsideDialogs(mutated) === 2, 'negative control: a second primary must be counted');
  assert(/variant="dangerQuiet" onClick=\{\(\) => setConfirm\("delete"\)\}/.test(e) && /open=\{confirm === "delete"\}/.test(e), 'quiet danger Delete with a confirm');
  assert(/data-warnings-structure=""/.test(e) && /data-warnings-gaps=""/.test(e) && /<details className="rounded-control border border-line px-3 py-2" data-warnings-gaps="">/.test(e), 'structure open, gaps collapsed');
  for (const x of ['Go to unit', '/admin/lessons/new?node=${g.topicId}', '/admin/questions?topic=${g.topicId}', '/admin/coverage?exam=${exam.id}', 'id="gap-filter"', 'id="gap-search"', 'Linked to Current Affairs']) assert(e.includes(x), `editor: ${x}`);
  assert(/data-publish-impact=""/.test(e) && /disabled=\{!impact \|\| !typedOk\}/.test(e) && /Also archive version/.test(e), 'publish dialog shows the impact; confirm waits for it (and the typed phrase)');
  assert(/data-unit-meta=""/.test(e) && /data-section-sum=""/.test(e), 'tree: unit meta + section sums');
  return 'ok';
});

test('V-01 versions: Advanced JSON import + intake pointer, clear cycle note, display names (no e-mail), tier', () => {
  const v = read('components/admin/syllabus/version-list.tsx');
  assert(/<details[^>]*data-advanced-import="">\s*<summary[^>]*>Advanced: import a syllabus JSON \(contract v1\)<\/summary>/.test(v) && /href="\/admin\/syllabus\/intake"/.test(v), 'advanced import + pointer');
  assert(/data-cycle-note=""/.test(v) && /is published for/.test(v) && !/No published version for this cycle yet/.test(v), 'cycle note');
  assert(/by \{pub\.name\}/.test(v) && !/pub\.email/.test(v) && /\{v\.tier \?\? "all tiers"\}/.test(v), 'display name + tier');
  const p = read('app/admin/syllabus/page.tsx');
  assert(/from\("user_profiles"\)\.select\("id, full_name"\)/.test(p) && !/actor_email/.test(p), 'names from user_profiles; the e-mail is not even read');
  return 'ok';
});

test('C-01 content source: admin-only, TOPIC-only, audited, other metadata kept', () => {
  const s = read('services/taxonomy/taxonomy.service.ts');
  const f = s.slice(s.indexOf('static async setContentSource'), s.indexOf('/** MASTER-TREE UX: the node lesson state per node'));
  assert(/const ctx = await this\.requireAdmin\(\);/.test(f) && /row\.node_type !== 'TOPIC'/.test(f) && /\{ \.\.\.\(row\.metadata as Record<string, Json>\) \}/.test(f) && /this\.audit\(ctx, 'TAXONOMY_NODE_CONTENT_SOURCE'/.test(f), 'service rules');
  const a = read('app/admin/taxonomy/actions.ts');
  const fn = a.slice(a.indexOf('export async function setTaxonomyContentSourceAction'));
  assert(/const __auth = await guardAdminAction\(\)/.test(fn.split('\n')[1]), 'action guards first');
  return 'ok';
});

test('S-01 shell: containing blocks + one scroller; no nested scroll in the intake guide; the Playwright gate has a negative control', () => {
  const l = read('app/admin/layout.tsx');
  assert(/data-admin-shell="" data-no-glass="" className="relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden/.test(l) && /id="admin-content" tabIndex=\{-1\} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto/.test(l), 'shell');
  const sb = read('components/admin/admin-sidebar.tsx');
  assert((sb.match(/<aside data-admin-sidebar=""/g) || []).length === 2, 'both sidebars marked');
  const r = read('components/admin/syllabus/intake-review.tsx');
  assert(!/max-h-\[55vh\] overflow-y-auto/.test(r) && /data-guide-bar="" className="sticky top-0/.test(r), 'guide: sticky bar, no nested scroll');
  const g = read('scripts/live/test_shell_scroll.cjs');
  assert(/N-1 negative control/.test(g) && /\[data-admin-shell\]\{height:auto!important/.test(g) && /\['390', '844'\]|\[390, 844\]/.test(g), 'gate: negative control + phone size');
  return 'ok';
});

console.log(`\nSYLLABUS-UI-1 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
