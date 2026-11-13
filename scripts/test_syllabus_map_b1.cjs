#!/usr/bin/env node
/**
 * SYLLABUS-MAP-1 B1 — offline gate (design docs/syllabus/SYLLABUS_MAP_1_DESIGN.md, owner-approved 2026-11-12).
 *   M-1 MASTER_INTAKE v1: a valid file (existing refs + a new topic with subtopics) → items, lines, kinds
 *   M-2 outline caps (owner 2026-11-12): 30 lines/node pass, 31 fail; 200 characters pass, 201 fail; a duplicate line
 *       (case-insensitive) fails; 6,000 lines per file pass, 6,001 fail; outline lines are NOT items (1,000 nodes with
 *       6,000 lines pass; 1,001 nodes fail)
 *   M-3 structure: one subject per file; topic / subtopic depth; duplicate ref; duplicate new name (normalized); a new
 *       topic under a topic; exam data in a master file; unknown key; not JSON; > 256 KB
 *   E-1 EXAM_MAP v1: SSC GD 2026 (CBT 80 Q / 160 marks; English OR Hindi; PET / PST / MEDICAL / DV as stages) passes
 *   E-2 (a) sums: English + Hindi both counted → 100 ≠ 80 fails; one group pick → passes; marks too
 *   E-3 (b) group members differ → fails; a 1-member group → fails; an undeclared group → fails
 *   E-4 (c) PET / PST / Medical / Document Verification as a PAPER → STAGE_AS_PAPER; negative controls: "Computer
 *       Based Examination", "Paramedical Staff Nursing Paper", "General Intelligence and Reasoning" pass
 *   E-5 (d) a paper without sections / a section without map entries fail
 *   E-6 (e) "outline" (or a nested subtopic tree) anywhere in an exam map → OUTLINE_IN_EXAM_MAP
 *   E-7 (f) Σ avg_questions > ±20 % → WARNING only (the file still passes)
 *   E-8 items = sections + map entries: 1,000 pass, 1,001 fail
 *   E-9 selection_process: a paper on a PET stage / an unknown paper / 21 stages fail; details kept as plain values
 *   S-1 migration 138 (static): no transaction control; NO SECURITY DEFINER; search_path '' on every function; RLS on
 *       both tables; client grants (outlines: none; stages: SELECT + PUBLISHED-only policy); writers granted to
 *       service_role only; ledger preflight on 137; the SQL caps (30 / 200) and stage kinds = the TypeScript ones
 *   S-2 rollback 138 drops every object 138 creates (functions, tables, column, constraint), nothing else
 * Run: node scripts/test_syllabus_map_b1.cjs
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const MI = require(path.join(ROOT, 'lib/syllabus/master-intake-contract.ts'));
const EM = require(path.join(ROOT, 'lib/syllabus/exam-map-contract.ts'));
const CM = require(path.join(ROOT, 'lib/syllabus/map-contract-common.ts'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const codes = (r) => (r.ok ? [] : r.errors.map((e) => e.code));
const has = (r, code) => codes(r).includes(code);
const lines = (n, prefix = 'Line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

// ---------------------------------------------------------------- fixtures
const MASTER = {
  contract: 'MASTER_INTAKE',
  contract_version: 1,
  subject: 'english-comprehension',
  based_on: 'SSC / Railways / Banking English syllabi 2023–2026',
  nodes: [
    { ref: 'english-comprehension.antonyms', aliases: ['Opposites'] },
    { ref: 'english-comprehension.antonyms.opposite-word-meaning', outline: ['Direct antonyms', 'Prefix antonyms (un-, in-, dis-)', 'Context antonyms'] },
    { new: true, level: 'TOPIC', parent_ref: 'english-comprehension', name: 'Sentence Rearrangement', name_hi: 'वाक्य पुनर्व्यवस्था', aliases: ['Para jumbles'], subtopics: [{ name: 'PQRS Sequencing', outline: ['Opening sentence clues', 'Connector words'] }] },
  ],
};
const masterWith = (nodes) => ({ ...clone(MASTER), nodes });
const sub = (i) => `english-comprehension.t${Math.floor(i / 100)}.s${i % 100}`;

const section = (name, q, map, extra = {}) => ({ name, questions: q, marks: q * 2, map, ...extra });
const refs = (...r) => r.map((ref) => ({ ref, weightage_tier: 'CORE', avg_questions: 20 / r.length }));
const GD = {
  contract: 'EXAM_MAP',
  contract_version: 1,
  exam: 'ssc-gd-constable',
  cycle_year: 2026,
  tier: null,
  based_on: 'SSC GD Constable 2026 notice',
  source_url: 'https://ssc.gov.in/notice/gd-2026',
  as_of: '2026-11-01',
  papers: [
    {
      name: 'Computer Based Examination',
      questions: 80,
      marks: 160,
      duration_minutes: 60,
      negative_marking: 0.25,
      choice_groups: [{ id: 'language', label: 'English or Hindi', pick: 1 }],
      sections: [
        section('General Intelligence and Reasoning', 20, refs('reasoning.analogy', 'reasoning.coding-decoding')),
        section('General Knowledge and General Awareness', 20, refs('general-awareness.history', 'general-awareness.polity')),
        section('Elementary Mathematics', 20, refs('quantitative-aptitude.percentage', 'quantitative-aptitude.number-system')),
        section('English Language', 20, refs('english-comprehension.antonyms', 'english-comprehension.synonyms'), { choice_group: 'language' }),
        section('Hindi Language', 20, [{ new: true, level: 'TOPIC', parent_ref: 'hindi', name: 'संधि', name_en: 'Sandhi', avg_questions: 20 }], { choice_group: 'language' }),
      ],
    },
  ],
  selection_process: [
    { stage: 'CBT', name: 'Computer Based Examination', nature: 'MERIT', paper: 'Computer Based Examination' },
    { stage: 'PET', name: 'Physical Efficiency Test', nature: 'QUALIFYING', details: { male: '5 km in 24 minutes', female: '1.6 km in 8.5 minutes' } },
    { stage: 'PST', name: 'Physical Standard Test', nature: 'QUALIFYING' },
    { stage: 'MEDICAL', name: 'Detailed Medical Examination', nature: 'QUALIFYING' },
    { stage: 'DV', name: 'Document Verification', nature: 'QUALIFYING' },
  ],
};
const gd = (mut) => {
  const o = clone(GD);
  mut(o);
  return o;
};

// ---------------------------------------------------------------- MASTER_INTAKE
test('M-1 MASTER_INTAKE v1: a valid file → items, outline lines, existing / new', () => {
  const r = MI.validateMasterIntake(MASTER);
  assert(r.ok, JSON.stringify(r.errors));
  const s = r.value.stats;
  assert(s.items === 4 && s.existing === 2 && s.new === 2 && s.outlineLines === 5, JSON.stringify(s));
  const pq = r.value.items.find((x) => x.name === 'PQRS Sequencing');
  assert(pq && pq.kind === 'NEW' && pq.level === 'SUBTOPIC' && pq.parentKey === 'n2' && pq.parentRef === null, JSON.stringify(pq));
  assert(MI.validateMasterIntake(JSON.stringify(MASTER)).ok, 'the same file as text');
  return `${s.items} items, ${s.outlineLines} lines`;
});

test('M-2 outline caps: 30 / node, 200 characters, no duplicate line, 6,000 / file; outline lines are not items', () => {
  const one = (outline) => MI.validateMasterIntake(masterWith([{ ref: 'english-comprehension.antonyms', outline }]));
  assert(one(lines(30)).ok, '30 lines pass');
  assert(has(one(lines(31)), 'OUTLINE_TOO_LONG'), '31 lines fail');
  assert(one(['x'.repeat(200)]).ok && has(one(['x'.repeat(201)]), 'INVALID_LENGTH'), '200 / 201 characters');
  assert(has(one(['Direct antonyms', 'DIRECT ANTONYMS']), 'DUPLICATE_LINE'), 'duplicate line (case-insensitive)');
  assert(has(one(['two\nlines']), 'INVALID_VALUE') && has(one(['**bold**']), 'NOT_PLAIN_TEXT') && has(one([]), 'OUTLINE_TOO_LONG'), 'one plain line; never empty');
  const many = (n, perNode) => masterWith(Array.from({ length: n }, (_, i) => ({ ref: sub(i), outline: lines(perNode) })));
  const r6000 = MI.validateMasterIntake(many(200, 30));
  assert(r6000.ok && r6000.value.stats.outlineLines === 6000, '6,000 lines pass');
  const r6001 = MI.validateMasterIntake(masterWith([...many(200, 30).nodes, { ref: 'english-comprehension.z.extra', outline: ['One more'] }]));
  assert(has(r6001, 'TOO_MANY_OUTLINE_LINES'), '6,001 lines fail');
  const r1000 = MI.validateMasterIntake(masterWith([...many(200, 30).nodes, ...Array.from({ length: 800 }, (_, i) => ({ ref: sub(200 + i), aliases: [`Alias ${i}`] }))]));
  assert(r1000.ok && r1000.value.stats.items === 1000 && r1000.value.stats.outlineLines === 6000, `1,000 nodes + 6,000 lines pass: ${JSON.stringify(r1000.ok ? r1000.value.stats : r1000.errors.slice(0, 2))}`);
  const r1001 = MI.validateMasterIntake(masterWith(Array.from({ length: 1001 }, (_, i) => ({ ref: sub(i), aliases: ['A'] }))));
  assert(has(r1001, 'TOO_MANY_ITEMS') && codes(r1001).filter((x) => x === 'TOO_MANY_ITEMS').length === 1, '1,001 nodes fail once');
  assert(CM.OUTLINE_LINES_PER_NODE_MAX === 30 && CM.MASTER_OUTLINE_LINES_MAX === 6000 && CM.MAP_MAX_ITEMS === 1000, 'constants');
});

test('M-3 structure: one subject; depth; duplicates; new-node parents; exam data refused; unknown key; JSON; size', () => {
  const r = (nodes, root = {}) => MI.validateMasterIntake({ ...masterWith(nodes), ...root });
  assert(has(r([{ ref: 'quantitative-aptitude.percentage', outline: ['A'] }]), 'OTHER_SUBJECT'), 'another subject');
  assert(has(r([{ ref: 'english-comprehension', outline: ['A'] }]), 'WRONG_LEVEL'), 'the subject itself');
  assert(has(r([{ ref: 'english-comprehension.antonyms', aliases: ['A'] }, { ref: 'english-comprehension.antonyms', outline: ['B'] }]), 'DUPLICATE_REF'), 'duplicate ref');
  assert(has(r([{ new: true, level: 'TOPIC', parent_ref: 'english-comprehension.antonyms', name: 'X' }]), 'WRONG_PARENT'), 'a topic under a topic');
  assert(has(r([{ new: true, level: 'SUBTOPIC', parent_ref: 'english-comprehension', name: 'X' }]), 'WRONG_PARENT'), 'a subtopic under the subject');
  const dup = r([{ new: true, level: 'TOPIC', parent_ref: 'english-comprehension', name: 'Para Jumbles' }, { new: true, level: 'TOPIC', parent_ref: 'english-comprehension', name: 'PARA  jumbles' }]);
  assert(has(dup, 'DUPLICATE_NEW'), 'duplicate new name (normalized)');
  assert(has(r([{ ref: 'english-comprehension.antonyms', questions: 5 }]), 'EXAM_DATA_IN_MASTER') && has(r([{ ref: 'english-comprehension.antonyms', aliases: ['A'] }], { papers: [] }), 'EXAM_DATA_IN_MASTER'), 'exam data refused');
  assert(has(r([{ ref: 'english-comprehension.antonyms', colour: 'red' }]), 'UNKNOWN_KEY'), 'unknown key');
  assert(has(MI.validateMasterIntake('not json'), 'INVALID_JSON') && has(MI.validateMasterIntake(' '.repeat(257 * 1024)), 'TOO_LARGE'), 'JSON + size');
  assert(has(r([{ ref: 'english-comprehension.antonyms', aliases: ['A'] }], { subject: 'English' }), 'INVALID_VALUE') && has(r([], {}), 'MISSING'), 'subject slug; at least one node');
  const warn = MI.validateMasterIntake(masterWith([{ ref: 'english-comprehension.antonyms' }]));
  assert(warn.ok && warn.warnings.some((w) => w.code === 'NOTHING_TO_CHANGE'), 'a ref with nothing to change is a warning');
});

// ---------------------------------------------------------------- EXAM_MAP
test('E-1 EXAM_MAP v1: SSC GD 2026 (80 Q / 160 marks; English OR Hindi; PET / PST / MEDICAL / DV as stages) passes', () => {
  const r = EM.validateExamMap(GD);
  assert(r.ok, JSON.stringify(r.errors));
  const v = r.value;
  assert(v.papers.length === 1 && v.papers[0].choiceGroups[0].pick === 1 && v.papers[0].sections.filter((s) => s.choiceGroup === 'language').length === 2, 'group');
  assert(v.selectionProcess.map((s) => s.stage).join() === 'CBT,PET,PST,MEDICAL,DV' && v.selectionProcess[1].details.male === '5 km in 24 minutes', 'stages');
  assert(v.stats.sections === 5 && v.stats.entries === 9 && v.stats.newEntries === 1 && v.stats.items === 14, JSON.stringify(v.stats));
  assert(EM.validateExamMap(JSON.stringify(GD)).ok, 'as text');
  return JSON.stringify(v.stats);
});

test('E-2 (a) the pattern adds up: both languages counted → 100 ≠ 80 fails; one pick per group passes; marks too', () => {
  const both = EM.validateExamMap(gd((o) => o.papers[0].sections.forEach((s) => delete s.choice_group)));
  assert(has(both, 'SUM_MISMATCH') && /100 questions/.test(both.errors.find((e) => e.code === 'SUM_MISMATCH').message), JSON.stringify(both.errors));
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].marks = 150))), 'SUM_MISMATCH'), 'marks');
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].questions = 100))), 'SUM_MISMATCH'), 'a paper total that counts both languages');
});

test('E-3 (b) a group: members alike, more members than picked, declared before use', () => {
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].sections[4].questions = 25))), 'GROUP_MEMBERS_DIFFER'), 'members differ');
  assert(has(EM.validateExamMap(gd((o) => delete o.papers[0].sections[4].choice_group)), 'GROUP_TOO_SMALL'), 'one member');
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].sections[3].choice_group = 'lang'))), 'UNKNOWN_GROUP'), 'undeclared group');
});

test('E-4 (c) PET / PST / Medical / Document Verification are never papers (+ negative controls)', () => {
  for (const n of ['Physical Efficiency Test (PET)', 'PST', 'Medical Examination', 'Document Verification', 'Typing Test', 'Interview']) {
    const r = EM.validateExamMap(gd((o) => (o.papers[0].name = n, o.selection_process[0].paper = n)));
    assert(has(r, 'STAGE_AS_PAPER'), `${n} must be refused as a paper`);
  }
  for (const n of ['Computer Based Examination', 'Paramedical Staff Nursing Paper', 'General Intelligence and Reasoning']) {
    const r = EM.validateExamMap(gd((o) => (o.papers[0].name = n, o.selection_process[0].paper = n)));
    assert(r.ok, `${n} is a written paper: ${JSON.stringify(r.errors)}`);
  }
});

test('E-5 (d) a paper needs a section, a section a map entry', () => {
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].sections = []))), 'EMPTY_PAPER'), 'empty paper');
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].sections[0].map = []))), 'EMPTY_SECTION'), 'empty section');
  assert(has(EM.validateExamMap(gd((o) => (o.papers = []))), 'MISSING'), 'no paper');
});

test('E-6 (e) an outline (or a nested tree) anywhere in an exam map is refused', () => {
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].sections[0].map[0].outline = lines(3)))), 'OUTLINE_IN_EXAM_MAP'), 'in a map entry');
  assert(has(EM.validateExamMap(gd((o) => (o.papers[0].sections[0].subtopics = []))), 'OUTLINE_IN_EXAM_MAP'), 'a subtopic tree in a section');
  assert(has(EM.validateExamMap(gd((o) => (o.outline = []))), 'OUTLINE_IN_EXAM_MAP'), 'at the root');
});

test('E-7 (f) Σ avg_questions more than ±20 % off → a WARNING only', () => {
  const r = EM.validateExamMap(gd((o) => o.papers[0].sections[0].map.forEach((m) => (m.avg_questions = 2))));
  assert(r.ok && r.warnings.some((w) => w.code === 'AVG_QUESTIONS_SPREAD'), JSON.stringify(r.ok ? r.warnings : r.errors));
  assert(!EM.validateExamMap(GD).warnings.some((w) => w.code === 'AVG_QUESTIONS_SPREAD'), 'no warning when it adds up');
});

test('E-8 items = sections + map entries: 1,000 pass, 1,001 fail', () => {
  // 5 sections + 7 other entries + n in section 0 = 12 + n items
  const big = (n) => gd((o) => (o.papers[0].sections[0].map = Array.from({ length: n }, (_, i) => ({ ref: `reasoning.t${i}` }))));
  const ok = EM.validateExamMap(big(988));
  assert(ok.ok && ok.value.stats.items === 1000, JSON.stringify(ok.ok ? ok.value.stats : ok.errors.slice(0, 2)));
  assert(has(EM.validateExamMap(big(989)), 'TOO_MANY_ITEMS'), '1,001 fail');
});

test('E-9 selection_process: paper only on a written stage, a known paper, ≤ 20 stages, plain details', () => {
  assert(has(EM.validateExamMap(gd((o) => (o.selection_process[1].paper = 'Computer Based Examination'))), 'INVALID_VALUE'), 'a PET stage with a paper');
  assert(has(EM.validateExamMap(gd((o) => (o.selection_process[0].paper = 'Tier 2'))), 'UNKNOWN_PAPER'), 'unknown paper');
  assert(has(EM.validateExamMap(gd((o) => (o.selection_process = Array.from({ length: 21 }, () => ({ stage: 'OTHER', name: 'Stage', nature: 'QUALIFYING' }))))), 'INVALID_VALUE'), '21 stages');
  assert(has(EM.validateExamMap(gd((o) => (o.selection_process[1].details = { male: '<b>5 km</b>' }))), 'NOT_PLAIN_TEXT'), 'plain details');
  assert(has(EM.validateExamMap(gd((o) => (o.selection_process[2].stage = 'RUN'))), 'INVALID_VALUE'), 'stage kind');
  const none = EM.validateExamMap(gd((o) => delete o.selection_process));
  assert(none.ok && none.warnings.some((w) => w.code === 'NO_SELECTION_PROCESS'), 'missing → warning');
});

// ---------------------------------------------------------------- migration 138 (static)
const MIG = 'supabase/migrations/20261114000138_syllabus_map_b1.sql';
const RB = 'docs/database/rollback/138_rollback.sql';
// statements outside function bodies and comments (the runner's F1-a rule)
const outside = (sql) => sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ').replace(/--[^\n]*/g, ' ');

test('S-1 migration 138: no transaction control, NO SECURITY DEFINER, search_path, RLS, grants, preflight, caps = TS', () => {
  const sql = read(MIG);
  const top = outside(sql);
  assert(!/^\s*(BEGIN|COMMIT|ROLLBACK|END|SAVEPOINT|START\s+TRANSACTION)\b/im.test(top), 'transaction control in the file');
  assert(!/SECURITY\s+DEFINER/i.test(top), 'a SECURITY DEFINER function (the ratchet count must stay unchanged)');
  const fns = [...sql.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert(fns.length === 5, `functions: ${fns.join(', ')}`);
  for (const f of fns) {
    const body = sql.slice(sql.indexOf(`CREATE FUNCTION public.${f}(`));
    assert(/\n(?:LANGUAGE \w+\n)?(?:IMMUTABLE\n)?SET search_path = ''\n/.test(body.slice(0, 600)), `${f}: search_path ''`);
    assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(sql) && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role;`).test(sql), `${f}: service_role only`);
    assert(!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO [^;]*(anon|authenticated)`).test(sql), `${f}: no client grant`);
  }
  for (const t of ['taxonomy_node_outlines', 'exam_selection_stages']) assert(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`).test(sql) && new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated;`).test(sql), `${t}: RLS + revoke`);
  assert(!/GRANT [^;]* ON TABLE public\.taxonomy_node_outlines TO [^;]*(anon|authenticated)/.test(sql), 'outlines: no client access');
  assert(/GRANT SELECT ON TABLE public\.exam_selection_stages TO anon, authenticated;/.test(sql) && /CREATE POLICY selection_stages_published_read ON public\.exam_selection_stages FOR SELECT TO anon, authenticated USING \(status = 'PUBLISHED'\);/.test(sql), 'stages: PUBLISHED-only read');
  assert((sql.match(/CREATE POLICY/g) || []).length === 1, 'exactly one policy (read)');
  assert(/filename = '20261103000137_lesson_coins_earn\.sql' AND status = 'APPLIED'/.test(sql), 'ledger preflight on 137');
  // the SQL mirrors the TypeScript caps / kinds
  assert(/cardinality\(p_items\) BETWEEN 1 AND 30/.test(sql) && /char_length\(l\.line\) NOT BETWEEN 1 AND 200/.test(sql), 'outline caps 30 / 200');
  const kinds = (sql.match(/stage_kind\s+text NOT NULL CHECK \(stage_kind IN \(([^)]*)\)\)/) || [])[1];
  assert(kinds && kinds.replace(/'|\s/g, '') === EM.SELECTION_STAGE_KINDS.join(','), `stage kinds ${kinds}`);
  assert(/position BETWEEN 1 AND 20/.test(sql) && EM.SELECTION_STAGES_MAX === 20, 'stage count');
  assert(/choice_group IS NULL\s+OR \(node_kind = 'SECTION'/.test(sql), 'choice_group on SECTION only');
  return `${fns.length} functions, 0 SECURITY DEFINER`;
});

test('S-2 rollback 138 drops exactly what 138 creates', () => {
  const sql = read(MIG);
  const rb = read(RB);
  const fns = [...sql.matchAll(/CREATE FUNCTION public\.(\w+)\(([^)]*)\)/g)].map((m) => m[1]);
  const tables = [...sql.matchAll(/CREATE TABLE public\.(\w+)/g)].map((m) => m[1]);
  for (const f of fns) assert(new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\(`).test(rb), `rollback misses function ${f}`);
  for (const t of tables) assert(new RegExp(`DROP TABLE IF EXISTS public\\.${t};`).test(rb), `rollback misses table ${t}`);
  assert(/DROP CONSTRAINT IF EXISTS chk_syllabus_node_choice_group;/.test(rb) && /DROP COLUMN IF EXISTS choice_group;/.test(rb), 'column + constraint');
  const drops = [...outside(rb).matchAll(/DROP (FUNCTION|TABLE|COLUMN|CONSTRAINT) IF EXISTS (?:public\.)?(\w+)/g)].map((m) => m[2]);
  const created = new Set([...fns, ...tables, 'choice_group', 'chk_syllabus_node_choice_group']);
  assert(drops.every((d) => created.has(d)) && drops.length === created.size, `drops ${drops.join(', ')}`);
  assert(!/^\s*(BEGIN|COMMIT)\b/im.test(outside(rb)) && !/\b(DELETE|UPDATE|INSERT)\b/i.test(outside(rb)), 'no transaction control, no row change');
});

console.log(`\nSYLLABUS-MAP-B1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
