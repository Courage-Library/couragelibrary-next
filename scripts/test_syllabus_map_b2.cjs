#!/usr/bin/env node
/**
 * SYLLABUS-MAP-1 B2 — offline gate (design docs/syllabus/SYLLABUS_MAP_1_DESIGN.md; migration 139).
 *   X-1 matcher, EXAM_MAP: path → EXACT_REF; unknown path → UNKNOWN_REF with suggestions; a name → EXACT; the same name
 *       on two nodes → CLOSE (ambiguous, never linked); an alias → ALIAS; an alias on two nodes → CLOSE; a similar name →
 *       CLOSE; nothing → NEW; internal / inactive nodes are never matched; a proposed node that already exists under its
 *       parent → EXACT (no duplicate); a proposed node whose parent path is missing → error
 *   X-2 matcher, MASTER_INTAKE: one subject only (a path of another subject → UNKNOWN_REF); a subtopic of a proposed topic
 *       → NEW with its parent key; a subject that does not exist → error
 *   X-3 property: whatever the input, an item is linked ONLY when exact (EXACT_REF / EXACT / ALIAS); a CLOSE / NEW /
 *       UNKNOWN_REF item never carries a matched node (fuzzy never links, never creates)
 *   X-4 the two sample files (data/syllabus-map/*.sample.json) are valid, warning-free, and show what the prompts need
 *       (MASTER: refs + a proposed topic with subtopics; EXAM: a choice group, a name entry, a proposed subtopic, stages)
 *   X-5 migration 139 (static): no transaction control; NO SECURITY DEFINER; search_path '' on every function; RLS on
 *       both tables, no client privilege; writers service_role only; preflight on 138; the idempotency index; the
 *       parent constraint; it never redefines a v3 intake function; rollback 139 drops exactly what 139 creates
 *   X-6 wiring: every action guards first; every service method starts with the admin context; both pages require an
 *       admin; the review UI creates a node ONLY from an explicit button on a proposed item and imports only when
 *       nothing is undecided; the v3 intake files do not import the new code
 * Run: node scripts/test_syllabus_map_b2.cjs
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
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const MI = require(path.join(ROOT, 'lib/syllabus/master-intake-contract.ts'));
const EM = require(path.join(ROOT, 'lib/syllabus/exam-map-contract.ts'));
const MM = require(path.join(ROOT, 'lib/syllabus/map-matcher.ts'));

// a small synthetic master tree
let seq = 0;
const nodes = [];
const N = (type, path, name, extra = {}) => {
  const parent = path.includes('.') ? nodes.find((n) => n.path === path.slice(0, path.lastIndexOf('.'))) : null;
  const n = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, parentId: parent ? parent.id : null, nodeType: type, name, nameHi: null, path, isActive: true, isInternal: false, ...extra };
  nodes.push(n);
  return n;
};
N('SUBJECT', 'eng', 'English');
N('TOPIC', 'eng.antonyms', 'Antonyms');
N('SUBTOPIC', 'eng.antonyms.opposite-word-meaning', 'Opposite Word Meaning');
N('TOPIC', 'eng.synonyms', 'Synonyms');
N('TOPIC', 'eng.idioms', 'Idioms and Phrases');
N('TOPIC', 'eng.general', 'General', { isInternal: true });
N('TOPIC', 'eng.old', 'Old Topic', { isActive: false });
N('SUBJECT', 'rea', 'Reasoning');
N('TOPIC', 'rea.analogy', 'Analogy');
N('TOPIC', 'rea.series', 'Series');
N('SUBTOPIC', 'rea.series.number-series', 'Number Series');
N('TOPIC', 'rea.maths-series', 'Series'); // a second "Series" (ambiguous by name)
const aliases = [
  { nodeId: nodes.find((n) => n.path === 'eng.idioms').id, normalized: 'idiomatic expressions' },
  { nodeId: nodes.find((n) => n.path === 'rea.analogy').id, normalized: 'pairs' },
  { nodeId: nodes.find((n) => n.path === 'eng.synonyms').id, normalized: 'pairs' }, // an alias on two nodes
];
const id = (p) => nodes.find((n) => n.path === p).id;

const examFile = (entries) => ({
  contract: 'EXAM_MAP',
  contract_version: 1,
  exam: 'demo',
  cycle_year: null,
  tier: null,
  based_on: 'test',
  source_url: 'https://example.com/n',
  as_of: '2026-11-15',
  papers: [{ name: 'Paper', questions: 10, marks: 20, sections: [{ name: 'S', questions: 10, marks: 20, map: entries }] }],
  selection_process: [{ stage: 'CBT', name: 'CBT', nature: 'MERIT', paper: 'Paper' }],
});
const matchExam = (entries) => {
  const v = EM.validateExamMap(examFile(entries));
  if (!v.ok) throw new Error(`fixture: ${JSON.stringify(v.errors)}`);
  return MM.matchExamMap(v.value, nodes, aliases);
};

test('X-1 matcher (EXAM_MAP): path / name / alias / ambiguous / similar / none / internal / proposed', () => {
  const r = matchExam([
    { ref: 'eng.antonyms' },
    { ref: 'eng.antonymz' },
    { name: 'Synonyms' },
    { name: 'Series' },
    { name: 'Idiomatic Expressions' },
    { name: 'Pairs' },
    { name: 'Analogies' },
    { name: 'Quantum Physics' },
    { name: 'General' },
    { ref: 'eng.old' },
    { new: true, level: 'SUBTOPIC', parent_ref: 'eng.antonyms', name: 'Opposite word meaning' },
    { new: true, level: 'SUBTOPIC', parent_ref: 'eng.antonyms', name: 'Prefix Antonyms' },
  ]);
  assert(r.ok, JSON.stringify(r.errors));
  const s = r.items.map((i) => i.match_status);
  const want = ['EXACT_REF', 'UNKNOWN_REF', 'EXACT', 'CLOSE', 'ALIAS', 'CLOSE', 'CLOSE', 'NEW', 'NEW', 'UNKNOWN_REF', 'EXACT', 'NEW'];
  assert(JSON.stringify(s) === JSON.stringify(want), `${JSON.stringify(s)}\n≠ ${JSON.stringify(want)}`);
  assert(r.items[0].matched_node_id === id('eng.antonyms') && r.items[0].level === 'TOPIC', 'path match + level');
  assert(r.items[1].candidates.some((c) => c.path === 'eng.antonyms'), 'unknown path → suggestions');
  assert(r.items[3].candidates.length === 2 && r.items[3].candidates.every((c) => /series/.test(c.path)), 'ambiguous name → both as suggestions');
  assert(r.items[4].matched_node_id === id('eng.idioms'), 'alias');
  assert(r.items[6].candidates.some((c) => c.path === 'rea.analogy'), 'similar name → suggestion');
  assert(r.items[8].candidates.length === 0 && !r.items.some((i) => i.matched_node_id === id('eng.general')), 'internal nodes never matched');
  assert(r.items[10].matched_node_id === id('eng.antonyms.opposite-word-meaning') && r.items[10].parent_node_id === id('eng.antonyms'), 'a proposed node that exists → EXACT (no duplicate)');
  assert(r.items[11].parent_node_id === id('eng.antonyms') && r.items[11].matched_node_id === null, 'a real proposal → NEW under its parent');
  const bad = matchExam([{ new: true, level: 'TOPIC', parent_ref: 'nope', name: 'X' }]);
  assert(!bad.ok && /parent "nope"/.test(bad.errors[0].message), 'missing parent path → error');
  return `${s.length} entries`;
});

test('X-2 matcher (MASTER_INTAKE): one subject; subtopics of a proposed topic; unknown subject', () => {
  const raw = {
    contract: 'MASTER_INTAKE',
    contract_version: 1,
    subject: 'eng',
    nodes: [
      { ref: 'eng.synonyms', aliases: ['Same meaning'] },
      { ref: 'rea.analogy', outline: ['x'] }, // another subject: the validator refuses it already
    ],
  };
  assert(!MI.validateMasterIntake(raw).ok, 'the validator keeps one subject per file');
  const ok = {
    ...raw,
    nodes: [
      { ref: 'eng.synonyms', aliases: ['Same meaning'] },
      { ref: 'eng.antonyms.no-such', outline: ['A'] },
      { new: true, level: 'TOPIC', parent_ref: 'eng', name: 'Sentence Completion', subtopics: [{ name: 'Single Blank' }] },
      { new: true, level: 'TOPIC', parent_ref: 'eng', name: 'antonyms' },
    ],
  };
  const v = MI.validateMasterIntake(ok);
  assert(v.ok, JSON.stringify(v.errors));
  const r = MM.matchMasterIntake(v.value, nodes, aliases);
  assert(r.ok && r.subjectNodeId === id('eng'), JSON.stringify(r));
  const s = r.items.map((i) => `${i.key}:${i.match_status}`);
  assert(JSON.stringify(s) === JSON.stringify(['n0:EXACT_REF', 'n1:UNKNOWN_REF', 'n2:NEW', 'n2.s0:NEW', 'n3:EXACT']), JSON.stringify(s));
  const sub = r.items.find((i) => i.key === 'n2.s0');
  assert(sub.parent_key === 'n2' && sub.parent_node_id === null, 'subtopic of a proposed topic waits for it');
  const none = MM.matchMasterIntake({ ...v.value, subject: 'math' }, nodes, aliases);
  assert(!none.ok, 'unknown subject → error');
});

test('X-3 property: only exact matches are linked; a fuzzy / new / unknown item never carries a node', () => {
  const names = ['Antonym', 'Synonym words', 'Series', 'Number series', 'Analogy', 'Pairs', 'Idioms', 'Opposites', 'Zzz', 'General', 'Old Topic', 'antonyms', 'SYNONYMS'];
  const refs = ['eng.antonyms', 'eng.general', 'eng.old', 'rea.series.number-series', 'rea.x', 'eng.synonyms.y'];
  const r = matchExam([...names.map((n) => ({ name: n })), ...refs.map((p) => ({ ref: p }))]);
  assert(r.ok, JSON.stringify(r.errors));
  for (const i of r.items) {
    const linked = MM.LINKED_STATUSES.includes(i.match_status);
    assert(linked === (i.matched_node_id !== null), `${i.raw_name || i.ref_path}: ${i.match_status} / ${i.matched_node_id}`);
    if (i.matched_node_id) assert(!nodes.find((n) => n.id === i.matched_node_id).isInternal && nodes.find((n) => n.id === i.matched_node_id).isActive, 'linked only to an active, public node');
  }
  return `${r.items.length} items, ${r.items.filter((i) => i.matched_node_id).length} linked`;
});

test('X-4 the sample files are valid and cover what the prompts need', () => {
  const m = MI.validateMasterIntake(read('data/syllabus-map/master-intake.sample.json'));
  const e = EM.validateExamMap(read('data/syllabus-map/exam-map.sample.json'));
  assert(m.ok && m.warnings.length === 0 && e.ok && e.warnings.length === 0, JSON.stringify([m.errors, m.warnings, e.errors, e.warnings]));
  assert(m.value.stats.existing >= 2 && m.value.items.some((i) => i.kind === 'NEW' && i.level === 'TOPIC') && m.value.items.some((i) => i.parentKey), 'MASTER: refs + a proposed topic with subtopics');
  const p = e.value.papers[0];
  assert(p.choiceGroups.length === 1 && p.sections.filter((s) => s.choiceGroup).length === 2, 'EXAM: a choice group with two alternatives');
  const entries = p.sections.flatMap((s) => s.map);
  assert(entries.some((x) => x.kind === 'NAME') && entries.some((x) => x.kind === 'NEW') && e.value.selectionProcess.length === 5, 'EXAM: a name entry, a proposed node, five stages');
  return `MASTER ${m.value.stats.items} items · EXAM ${e.value.stats.items} items`;
});

const MIG = 'supabase/migrations/20261115000139_syllabus_map_b2.sql';
const RB = 'docs/database/rollback/139_rollback.sql';
const outside = (sql) => sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ').replace(/--[^\n]*/g, ' ');

test('X-5 migration 139 (static) + its rollback', () => {
  const sql = read(MIG);
  const top = outside(sql);
  assert(!/^\s*(BEGIN|COMMIT|ROLLBACK|END|SAVEPOINT|START\s+TRANSACTION)\b/im.test(top), 'transaction control');
  assert(!/SECURITY\s+DEFINER/i.test(top), 'SECURITY DEFINER');
  const fns = [...sql.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert(fns.length === 9, `functions ${fns.length}`);
  for (const f of fns) {
    const head = sql.slice(sql.indexOf(`CREATE FUNCTION public.${f}(`)).slice(0, 700);
    assert(/\nSET search_path = ''\n/.test(head), `${f}: search_path ''`);
    assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(sql) && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role;`).test(sql), `${f}: service_role only`);
  }
  for (const t of ['syllabus_map_sessions', 'syllabus_map_items']) {
    assert(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`).test(sql) && new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated;`).test(sql), `${t}: RLS`);
    assert(!new RegExp(`GRANT [^;]* ON TABLE public\\.${t} TO [^;]*(anon|authenticated)`).test(sql), `${t}: no client grant`);
  }
  assert(/filename = '20261114000138_syllabus_map_b1\.sql' AND status = 'APPLIED'/.test(sql), 'preflight on 138');
  assert(/CREATE UNIQUE INDEX uq_syllabus_map_session_file ON public\.syllabus_map_sessions \(contract, payload_sha256\) WHERE status IN \('REVIEW', 'IMPORTED'\)/.test(sql), 'idempotency index');
  assert(/CONSTRAINT chk_map_item_parent CHECK \(kind = 'NEW' OR \(parent_node_id IS NULL AND parent_item_id IS NULL\)\)/.test(sql), 'only a proposed node has a parent');
  assert(!/fn_syllabus_intake_(create|decide|import|bulk|discard)\s*\(/.test(sql.replace(/--[^\n]*/g, '')) && !/syllabus_intake_(sessions|items)/.test(sql.replace(/--[^\n]*/g, '')), 'the v3 intake is not touched');
  const rb = read(RB);
  const tables = [...sql.matchAll(/CREATE TABLE public\.(\w+)/g)].map((m) => m[1]);
  for (const f of fns) assert(new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\(`).test(rb), `rollback misses ${f}`);
  for (const t of tables) assert(new RegExp(`DROP TABLE IF EXISTS public\\.${t};`).test(rb), `rollback misses ${t}`);
  const drops = [...outside(rb).matchAll(/DROP (FUNCTION|TABLE) IF EXISTS public\.(\w+)/g)].map((m) => m[2]);
  assert(drops.length === fns.length + tables.length && drops.every((d) => fns.includes(d) || tables.includes(d)), `rollback drops ${drops.join(', ')}`);
  assert(!/\b(DELETE|UPDATE|INSERT)\b/i.test(outside(rb)), 'rollback changes no rows');
  return `${fns.length} functions, ${tables.length} tables, 0 SECURITY DEFINER`;
});

test('X-6 wiring: guards first; explicit creation only; import only when decided; v3 untouched', () => {
  const actions = read('app/(site)/admin/syllabus/map/actions.ts');
  const fns = actions.split(/export async function /).slice(1);
  assert(fns.length === 7 && fns.every((f) => /^\w+\([^)]*\)[^{]*\{\n\s+const __auth = await guardAdminAction\(\)/.test(f)), `actions guarded first (${fns.length})`);
  const svc = read('services/syllabus/map-intake.service.ts');
  const methods = svc.split(/\n  static async /).slice(1);
  // the first line of every method body (the signature line ends with "{"; inline return types may contain "{ … }")
  const firstBody = (m) => {
    const lines = m.split('\n');
    const i = lines.findIndex((l) => /\{\s*$/.test(l));
    return [lines[i + 1] && lines[i + 1].trim(), lines[i + 2] && lines[i + 2].trim()];
  };
  const unguarded = methods.filter((m) => {
    const [a, b] = firstBody(m);
    return a !== 'const c = await ctx();' || !/^if \(!c\) return fail\("UNAUTHORIZED"/.test(b || '');
  });
  assert(methods.length === 9 && unguarded.length === 0, `service methods start with the admin context (${methods.length}; unguarded: ${unguarded.map((m) => m.split('(')[0]).join(', ')})`);
  assert(/const auth = await guardAdminAction\(\);/.test(svc.slice(svc.indexOf('async function ctx()'))), 'ctx() guards');
  for (const p of ['app/(site)/admin/syllabus/map/page.tsx', 'app/(site)/admin/syllabus/map/[id]/page.tsx']) assert(/await requireAdminPage\(\{ path: "\/admin\/syllabus\/map" \}\)/.test(read(p)), `${p}: admin page`);
  const ui = read('components/admin/syllabus/map-review.tsx');
  // the ONLY request to create a node is the explicit button shown for a proposed, undecided item
  const requests = ui.match(/decideMapItemAction\([^)]*"APPROVE_NEW"/g) || [];
  assert(requests.length === 1 && /it\.kind === "NEW" && it\.decision === null && \(\s*<button[\s\S]{0,300}?decideMapItemAction\(session\.id, it\.id, "APPROVE_NEW"/.test(ui), `creation only from the explicit button on a proposed, undecided item (${requests.length} request(s))`);
  assert(/disabled=\{pending \|\| stats\.open > 0 \|\| stats\.conflicts > 0\}/.test(ui), 'import only when nothing is undecided and no conflict is open');
  for (const f of ['services/syllabus/intake.service.ts', 'app/(site)/admin/syllabus/intake/actions.ts', 'components/admin/syllabus/intake-review.tsx', 'components/admin/syllabus/intake-wizard.tsx', 'lib/syllabus/tree-matcher.ts'])
    assert(!/map-intake\.service|map-matcher|exam-map-contract|master-intake-contract/.test(read(f)), `${f} must not depend on the new code`);
});

console.log(`\nSYLLABUS-MAP-B2: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
