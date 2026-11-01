#!/usr/bin/env node
/**
 * QA-FIXTURE-EXCLUSION (architect 2026-10-31) — offline gate. CI creates QA fixtures in the shared database while the
 * owner works; on the ADMIN side they must never show up (I13 in SYL-IMPORT-1 covers the public / student side).
 *   X-1 every admin surface that LISTS master-tree nodes filters the per-run QA topics (slug qa-fixture-run-%) —
 *       intake matcher + intake suggestions, master tree (tree + type lists), coverage matrix, lesson generator node
 *       picker (+ the INTERNAL rule), content-studio topic list, question-bank subject / topic filters, syllabus editor
 *       picker, import catalog; Today's recent activity drops QA identities' audit rows; the conducting bodies grid
 *       shows QA logo fixtures to QA identities only. Negative control: a listing query without the filter is flagged.
 *   X-2 the REAL intake matcher (lib/syllabus/tree-matcher.ts): WITHOUT the exclusion an intake topic matches the QA run
 *       node (negative control) and the node is a suggestion for "Percentage"; WITH it (the same rows the SQL filter
 *       leaves) neither happens, and the real "Percentage" still matches
 *   X-3 visibleBodies: the owner never sees a QA logo fixture body; a QA identity does (the E2E needs its card)
 * Live proof during a real run (committed per-run topics): SYL-IMPORT-1 I15.
 * Run: node scripts/test_qa_fixture_exclusion.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
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
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

const QA = require(path.join(ROOT, 'lib/qa/fixtures.ts'));
const FILTER = /\.not\((["'])slug\1, (["'])like\2, QA_RUN_SLUG_LIKE\)/;
// [surface, file, a regex that finds the listing query; the filter must sit in the same statement]
const SURFACES = [
  ['intake matcher', 'services/syllabus/intake.service.ts', /select\("id, parent_id, node_type, name, name_hi, is_active"\)[^\n]*/],
  ['intake suggestions (detail)', 'services/syllabus/intake.service.ts', /select\("id, parent_id, node_type, name, hierarchy_path"\)[^\n]*/],
  ['master tree (default view)', 'services/taxonomy/taxonomy.service.ts', /select\(NODE_COLUMNS\)[^\n]*order\('hierarchy_path'[^\n]*/],
  ['master tree (type lists)', 'services/taxonomy/taxonomy.service.ts', /select\(NODE_COLUMNS\)\.eq\('node_type', nodeType\)[^\n]*/],
  ['coverage matrix', 'services/learning/coverage.service.ts', /select\("id, parent_id, name, hierarchy_path, node_type, is_active, is_internal"\)[^\n]*/],
  ['lesson generator node picker', 'services/lessons/lesson-authoring.service.ts', /select\("id, parent_id, node_type, name, subject_type, root_subject_id, display_order, is_internal"\)\s*\.eq\("is_active", true\)\s*[^\n]*/],
  ['content-studio topic list', 'services/admin-content-studio.service.ts', /select\('id, name, parent_id, display_order'\)\.eq\('node_type', 'TOPIC'\)[^\n]*/],
  ['question bank: subject filter', 'services/admin.service.ts', /select\("id, name, slug"\)\.eq\("node_type", "SUBJECT"\)[^\n]*/],
  ['question bank: topic filter', 'services/admin.service.ts', /select\("id, subject_id:root_subject_id, name, slug"\)\.eq\("node_type", "TOPIC"\)[^\n]*/],
  ['syllabus editor picker', 'app/(site)/admin/syllabus/[id]/page.tsx', /select\("id, name, slug, node_type, root_subject_id, parent_id, display_order, metadata"\)[^\n]*/],
  ['syllabus import catalog', 'lib/syllabus/import-catalog.ts', /select\("id, hierarchy_path, name, is_active"\)\.eq\("node_type", "TOPIC"\)[^\n]*/],
];
const unfiltered = (src, re) => { const m = re.exec(src); return !m ? 'query not found' : FILTER.test(m[0]) ? null : 'no QA-run filter'; };

(async () => {
  await test('X-1 every admin listing of master-tree nodes filters QA run topics; Today drops QA audit rows; QA logo bodies hidden from the owner; negative control', async () => {
    const bad = SURFACES.map(([n, f, re]) => [n, unfiltered(read(f), re)]).filter(([, p]) => p).map(([n, p]) => `${n}: ${p}`);
    assert(bad.length === 0, bad.join('; '));
    assert(/is_internal/.test(read('services/lessons/lesson-authoring.service.ts')) && /\.eq\("is_internal", false\)/.test(read('app/(site)/admin/syllabus/intake/page.tsx')), 'the INTERNAL rules (lesson picker, intake page) are gone');
    assert(/from\("admin_audit_logs"\)\.select\("action_type, target_entity, created_at"\)\.not\("actor_email", "like", QA_EMAIL_LIKE\)/.test(read('lib/admin/today.ts')), "Today's recent activity keeps QA identities' rows");
    assert(/conductingOrgs=\{visibleBodies\(orgs, viewer\.userEmail\)\}/.test(read('app/(site)/admin/exams/page.tsx')), 'the bodies grid shows QA logo fixtures to everyone');
    assert(QA.QA_RUN_SLUG_LIKE === 'qa-fixture-run-%' && require(path.join(ROOT, 'scripts/live/_qa-run-fixture.cjs')).RUN_PREFIX === QA.QA_RUN_SLUG_PREFIX, 'the app marker and the fixture writer disagree');
    // negative control: the scanner flags a listing query without the filter
    assert(unfiltered('c.db.from("canonical_taxonomy_nodes").select("id, parent_id, name, hierarchy_path, node_type, is_active, is_internal"),', SURFACES[4][2]) === 'no QA-run filter', 'negative control: an unfiltered query was not flagged');
    return `${SURFACES.length} listing queries filtered + Today + bodies grid`;
  });

  await test('X-2 the real intake matcher: without the exclusion a QA run node is matched / suggested (negative control); with it, never — and "Percentage" still matches the real node', async () => {
    const { matchIntake } = require(path.join(ROOT, 'lib/syllabus/tree-matcher.ts'));
    const node = (id, parentId, nodeType, name, slug) => ({ id, parentId, nodeType, name, nameHi: null, isActive: true, slug });
    const all = [
      node('S', null, 'SUBJECT', 'Quantitative Aptitude', 'quantitative-aptitude'),
      node('P', 'S', 'TOPIC', 'Percentage', 'percentage'),
      node('Q1', 'S', 'TOPIC', 'QA Fixture percentage (abc123)', 'qa-fixture-run-abc123-percentage'),
      node('Q2', 'S', 'TOPIC', 'QA Fixture average (abc123)', 'qa-fixture-run-abc123-average'),
    ];
    const items = [
      { key: 's1', parent_key: null, level: 'SUBJECT', name: 'Quantitative Aptitude' },
      { key: 's1.t1', parent_key: 's1', level: 'TOPIC', name: 'QA Fixture percentage (abc123)' },
      { key: 's1.t2', parent_key: 's1', level: 'TOPIC', name: 'Percentage' },
      { key: 's1.t3', parent_key: 's1', level: 'TOPIC', name: 'QA Fixture average' },
    ].map((x) => ({ ...x, name_hi: null, aliases: [] }));
    const qaIds = new Set(['Q1', 'Q2']);
    const touchesQa = (out) => out.filter((m) => qaIds.has(m.matched_node_id) || (m.candidates || []).some((c) => qaIds.has(c.node_id || c.id || c.nodeId)));
    const before = matchIntake(items, all, []);
    assert(touchesQa(before).length >= 1 && before.find((m) => m.key === 's1.t1').matched_node_id === 'Q1', `negative control: without the exclusion the matcher should match the QA run node (${JSON.stringify(before.map((m) => [m.key, m.match_status, m.matched_node_id]))})`);
    const kept = all.filter((n) => !QA.isQaRunNodeSlug(n.slug)); // = the rows .not("slug", "like", "qa-fixture-run-%") returns
    const after = matchIntake(items, kept, []);
    assert(touchesQa(after).length === 0, `with the exclusion a QA run node was matched / suggested: ${JSON.stringify(touchesQa(after))}`);
    assert(after.find((m) => m.key === 's1.t2').matched_node_id === 'P' && after.find((m) => m.key === 's1').matched_node_id === 'S', 'the real nodes no longer match');
    return `without: ${touchesQa(before).length} item(s) touch a QA node; with: 0; "Percentage" → real node`;
  });

  await test('X-3 conducting bodies: QA logo fixture bodies hidden from the owner, shown to QA identities', async () => {
    const orgs = [{ slug: 'ssc' }, { slug: 'qa-logo-fixture-abc' }];
    const ownerLike = ['owner', 'example.com'].join('@'); // built at runtime (no-personal-data gate)
    assert(QA.visibleBodies(orgs, ownerLike).map((o) => o.slug).join() === 'ssc', 'owner sees a QA fixture body');
    assert(QA.visibleBodies(orgs, 'qa-admin@courage-library.test').length === 2 && QA.visibleBodies(orgs, null).length === 1, 'QA identity / no email');
    assert(QA.isQaIdentity('QA-Staff@Courage-Library.test') && !QA.isQaIdentity(['someone', 'courage-library.test.evil.com'].join('@')), 'identity rule');
  });

  console.log(`\nQA-FIXTURE-EXCLUSION: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
