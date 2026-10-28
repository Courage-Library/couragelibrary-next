#!/usr/bin/env node
/**
 * INTAKE-ASSIST-1 + INTAKE-CONCEPTS-AS-OUTLINE — offline gate (no network, no DB; reads source + runs the pure TS
 * modules). The database half is scripts/live/test_intake_assist1.cjs.
 *   K-01 contract 3.2: a subtopic "outline" becomes EXPANDED concept items in order (case-insensitive de-dup, ≤ 30);
 *        outline + concepts together refused; outline is a v3 key only (v2 refuses it); every v3 / v3.1 payload stays valid
 *   K-02 Σ weightage: a subject whose topics' avg_questions are > 20 % off its questions gets ONE non-blocking warning
 *   G-01 the guide's arithmetic: exact batch parents-first (an exact topic under an undecided non-exact subject waits),
 *        subtopics only under a decided (not ignored) topic, concepts only under a decided subtopic, ≤ 1000; topic
 *        suggestions include matches below the CLOSE threshold and only under the parent's node
 *   L-01 LESSON "MUST COVER": appended after the rendered template (no placeholder), ≤ 50 lines, nothing when empty;
 *        the generator reads metadata.outlines[node] from PUBLISHED, then DRAFT syllabus units
 *   P-01 SYLLABUS prompt v3: a valid template (same placeholders), pinned sha256, outline instead of concepts, its own
 *        example passes the contract; activated through the audited RPCs (save_draft → activate), never in place
 *   D-01 migration 124: no BEGIN / COMMIT; no SECURITY DEFINER; EXECUTE revoked from PUBLIC / anon / authenticated and
 *        granted to service_role on all 5 functions; session row FOR UPDATE in bulk + undo; ≤ 1000; subtopics only for
 *        bulk approve; one shared approve helper (C2); OUTLINE concept-only; the rollback restores the 4-argument import
 *   S-01 C1: the server actions take no actor (it comes from guardAdminAction in the service); every action guards first
 *   U-01 the review screen: sticky guide with 7 steps + live counts, ONE primary (the current step's), "What does this
 *        mean?" (5 one-liners), progress bar, undo, required source check, row decision buttons, collapsible topics,
 *        status + level filters; English-only copy
 * Run: node scripts/test_intake_assist1.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

const C = require(path.join(ROOT, 'lib/syllabus/intake-contract.ts'));
const A = require(path.join(ROOT, 'lib/syllabus/intake-assist.ts'));
const CTX = { examSlug: 'ssc-cgl', cycleYear: 2026, tier: 'tier-1' };
const v3 = (subtopic) => ({
  contract_version: 3, exam: 'ssc-cgl', cycle_year: 2026, tier: 'tier-1', based_on: 'SSC CGL 2025 notification + PYQs',
  papers: [{ name: 'Tier 1', questions: 100, subjects: [{ name: 'Quantitative Aptitude', questions: 25, topics: [{ name: 'Percentage', origin: 'OFFICIAL', avg_questions: 3, subtopics: [subtopic] }] }] }],
});

test('K-01 contract 3.2: outline → EXPANDED concept items in order; outline + concepts refused; > 30 refused; v2 refuses outline; v3 concepts still valid', () => {
  const r = C.validateIntakePayload(JSON.stringify(v3({ name: 'Successive Change', origin: 'PYQ_TREND', outline: ['Net change', ' Discounts ', 'net change', 'Population'] })), CTX);
  assert(r.ok, JSON.stringify(r.errors));
  const sub = r.items.find((i) => i.level === 'SUBTOPIC');
  const lines = r.items.filter((i) => i.level === 'CONCEPT');
  assert(JSON.stringify(lines.map((i) => i.name)) === JSON.stringify(['Net change', 'Discounts', 'Population']), `lines: ${lines.map((i) => i.name)}`);
  assert(lines.every((i, j) => i.parent_key === sub.key && i.key === `${sub.key}.c${j}` && i.origin === 'EXPANDED' && i.position === j), 'keys / parent / origin / position');
  assert(r.stats.concepts === 3 && r.stats.expanded === 3, JSON.stringify(r.stats));
  const both = C.validateIntakePayload(JSON.stringify(v3({ name: 'S', origin: 'EXPANDED', outline: ['a'], concepts: [{ name: 'b', origin: 'EXPANDED' }] })), CTX);
  assert(!both.ok && both.errors.some((e) => /not both/.test(e.message)), 'outline + concepts');
  const tooMany = C.validateIntakePayload(JSON.stringify(v3({ name: 'S', origin: 'EXPANDED', outline: Array.from({ length: 31 }, (_, i) => `line ${i}`) })), CTX);
  assert(!tooMany.ok, '31 lines accepted');
  const conceptsStill = C.validateIntakePayload(JSON.stringify(v3({ name: 'S', origin: 'EXPANDED', concepts: [{ name: 'c', origin: 'EXPANDED', headings: ['h'] }] })), CTX);
  assert(conceptsStill.ok && conceptsStill.items.filter((i) => i.level === 'CONCEPT').length === 1, 'v3 concepts');
  const v2 = { contract_version: 2, exam: 'ssc-cgl', cycle_year: 2026, tier: 'tier-1', source_url: 'https://ssc.gov.in/x', as_of: '2026-05-01',
    papers: [{ name: 'Tier 1', subjects: [{ name: 'Quant', topics: [{ name: 'Percentage', subtopics: [{ name: 'S', outline: ['a'] }] }] }] }] };
  const r2 = C.validateIntakePayload(JSON.stringify(v2), CTX);
  assert(!r2.ok && r2.errors.some((e) => e.code === 'UNKNOWN_KEY' && /outline/.test(e.path)), 'v2 outline accepted');
  delete v2.papers[0].subjects[0].topics[0].subtopics[0].outline;
  assert(C.validateIntakePayload(JSON.stringify(v2), CTX).ok, 'v2 payload no longer valid');
  return '3 lines (1 duplicate dropped), v2 + v3 unchanged';
});

test('K-02 Σ weightage: > 20 % off → one non-blocking warning; within 20 % → none', () => {
  const p = v3({ name: 'S', origin: 'EXPANDED' });
  p.papers[0].subjects[0].topics.push({ name: 'Average', origin: 'OFFICIAL', avg_questions: 30 });
  const off = C.validateIntakePayload(JSON.stringify(p), CTX);
  assert(off.ok && off.warnings.length === 1 && /Quantitative Aptitude: the topics' estimates add up to about 33 questions, the subject has 25 \(\+32 %\) — check the weightage\./.test(off.warnings[0].message), JSON.stringify(off.ok ? off.warnings : off.errors));
  p.papers[0].subjects[0].topics[1].avg_questions = 24;
  const fine = C.validateIntakePayload(JSON.stringify(p), CTX);
  assert(fine.ok && fine.warnings.length === 0, JSON.stringify(fine.warnings));
  const checks = C.weightageChecks([{ key: 's', parentKey: null, level: 'SUBJECT', name: 'English', questions: 25, avgQuestions: null }, { key: 't', parentKey: 's', level: 'TOPIC', name: 'x', questions: null, avgQuestions: 32 }]);
  assert(checks.length === 1 && checks[0].off && checks[0].estimated === 32, JSON.stringify(checks));
  return 'warning + table';
});

test('G-01 guide arithmetic: parents first, scope, caps, suggestions below the CLOSE threshold', () => {
  const I = (id, parentId, level, extra = {}) => ({ id, parentId, level, name: id, matchStatus: 'NEW', matchedNodeId: null, decision: null, decisionNodeId: null, origin: null, ...extra });
  const items = [
    I('p', null, 'PAPER', { matchStatus: 'NOT_APPLICABLE' }),
    I('s1', 'p', 'SUBJECT', { matchStatus: 'EXACT', matchedNodeId: 'N-s1' }),
    I('t1', 's1', 'TOPIC', { matchStatus: 'EXACT', matchedNodeId: 'N-t1' }),
    I('s2', 'p', 'SUBJECT'),
    I('t2', 's2', 'TOPIC', { matchStatus: 'EXACT', matchedNodeId: 'N-t2' }),
    I('u1', 't1', 'SUBTOPIC'),
    I('u2', 't3', 'SUBTOPIC'),
    I('t3', 's1', 'TOPIC', { decision: 'IGNORE' }),
    I('c1', 'u1', 'CONCEPT'),
  ];
  assert(JSON.stringify(A.exactBatch(items)) === JSON.stringify(['s1', 't1']), `exact: ${A.exactBatch(items)}`);
  assert(A.subtopicBatch(items).length === 0, 'subtopics under an undecided topic');
  const linked = items.map((i) => (i.id === 's1' || i.id === 't1' ? { ...i, decision: 'LINK', decisionNodeId: `N-${i.id}` } : i));
  assert(JSON.stringify(A.subtopicBatch(linked)) === JSON.stringify(['u1']), `subtopics: ${A.subtopicBatch(linked)} (u2 is under an IGNORED topic)`);
  assert(A.outlineBatch(linked).length === 0 && A.waitingForParent(linked, 'CONCEPT') === 1, 'concept waits for its subtopic');
  const sub = linked.map((i) => (i.id === 'u1' ? { ...i, decision: 'APPROVE_NEW', decisionNodeId: 'N-u1' } : i));
  assert(JSON.stringify(A.outlineBatch(sub)) === JSON.stringify(['c1']), 'outline batch');
  const many = [I('s', null, 'SUBJECT', { decision: 'LINK', decisionNodeId: 'N' }), I('t', 's', 'TOPIC', { decision: 'LINK', decisionNodeId: 'NT' }), ...Array.from({ length: 1200 }, (_, k) => I(`u${k}`, 't', 'SUBTOPIC'))];
  assert(A.subtopicBatch(many).length === 1000, 'cap 1000');
  const nodes = [
    { id: 'n1', parentId: 'N-s1', nodeType: 'TOPIC', name: 'Time and Work', path: '' },
    { id: 'n2', parentId: 'N-s1', nodeType: 'TOPIC', name: 'Pipes and Cisterns', path: '' },
    { id: 'n3', parentId: 'OTHER', nodeType: 'TOPIC', name: 'Time and Distance', path: '' },
    { id: 'n4', parentId: 'N-s1', nodeType: 'TOPIC', name: 'Algebra', path: '' },
    { id: 'n5', parentId: 'N-s1', nodeType: 'TOPIC', name: 'Work and Wages', path: '' },
  ];
  const s = A.suggestionsFor({ ...I('x', 's1', 'TOPIC'), name: 'Time & Work' }, { ...items[1], decision: 'LINK', decisionNodeId: 'N-s1' }, nodes);
  assert(s.length === 3 && s[0].nodeId === 'n1' && s.every((x) => x.nodeId !== 'n3'), JSON.stringify(s));
  assert(s.some((x) => x.score < 0.55), 'a suggestion below the CLOSE threshold is shown');
  assert(A.suggestionsFor(I('y', 's2', 'TOPIC'), items[3], nodes).length === 0, 'no suggestions under an undecided parent');
  return `suggestions ${s.map((x) => `${x.name} ${x.score}`).join(', ')}`;
});

test('L-01 MUST COVER: appended block, capped, empty → nothing; the generator reads the unit outlines', () => {
  const L = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
  assert(L.mustCoverBlock([]) === '' && L.mustCoverBlock(undefined) === '', 'empty');
  const b = L.mustCoverBlock(['Net change', 'Discounts']);
  assert(b === `\n\n${L.MUST_COVER_HEADING}\n- Net change\n- Discounts`, JSON.stringify(b));
  assert(L.mustCoverBlock(Array.from({ length: 60 }, (_, i) => `l${i}`)).split('\n- ').length === 51, 'cap 50');
  const svc = read('services/lessons/lesson-authoring.service.ts');
  assert(/renderTemplate\("LESSON", template\.body, lessonPromptValues\(context\)\) \+ mustCoverBlock\(context\.mustCover\)/.test(svc), 'appended after render');
  assert(/\.in\("status", \["PUBLISHED", "DRAFT"\]\)/.test(svc) && /\.outlines/.test(svc) && /\[nodeId\]/.test(svc), 'reads metadata.outlines[nodeId] from PUBLISHED / DRAFT units');
  return 'ok';
});

test('P-01 SYLLABUS prompt v3: valid, pinned, outline instead of concepts, its example passes 3.2; audited activation', () => {
  const T = require(path.join(ROOT, 'lib/prompts/template.ts'));
  const { SYLLABUS_TEMPLATE_V3 } = require(path.join(ROOT, 'lib/syllabus/syllabus-template-v3.ts'));
  assert(T.templateProblems('SYLLABUS', SYLLABUS_TEMPLATE_V3).length === 0, 'template problems');
  const sha = crypto.createHash('sha256').update(SYLLABUS_TEMPLATE_V3, 'utf8').digest('hex');
  assert(sha.startsWith('d7edff5c2f02'), `the v3 text changed (sha256 ${sha.slice(0, 12)}) — save a new version instead`);
  assert(/Do NOT create\n   concept objects: give each subtopic an "outline"/.test(SYLLABUS_TEMPLATE_V3) && /every subtopic has an outline and no "concepts"/.test(SYLLABUS_TEMPLATE_V3) && !/"concepts": \[/.test(SYLLABUS_TEMPLATE_V3), 'v3 rules');
  const ex = SYLLABUS_TEMPLATE_V3.slice(SYLLABUS_TEMPLATE_V3.indexOf('{\n  "contract_version"')).replace('{{EXAM_SLUG}}', 'ssc-cgl').replace('{{CYCLE}}', '2026').replace('{{TIER_JSON}}', '"tier-1"');
  const r = C.validateIntakePayload(ex, CTX);
  assert(r.ok && r.items.filter((i) => i.level === 'CONCEPT').length === 3, JSON.stringify(r.ok ? r.stats : r.errors));
  const script = read('scripts/content/syllabus-prompt-32.cjs');
  assert(/fn_prompt_template_save_draft\('SYLLABUS', \$1, \$2, null, \$3\)/.test(script) && /fn_prompt_template_activate\(\$1, null, \$2\)/.test(script) && /syllabus-template-v3\.ts/.test(script) && /--dry-run/.test(script), 'audited draft → activate');
  const ca4 = read('scripts/live/test_ca4_lessons.cjs');
  assert(/3: sha\(require\(path\.join\(ROOT, 'lib\/syllabus\/syllabus-template-v3\.ts'\)\)\.SYLLABUS_TEMPLATE_V3\)/.test(ca4) && /A-1b SYLLABUS v3/.test(ca4), 'CA4 live pins v3');
  return `v3 ${SYLLABUS_TEMPLATE_V3.length} chars`;
});

test('D-01 migration 124 + rollback: invoker-only, revoked, locked, capped, shared approve, OUTLINE concept-only', () => {
  const m = read('supabase/migrations/20261028000124_intake_assist_1.sql');
  const code = m.replace(/--[^\n]*/g, '');
  assert(!/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(code), 'transaction control in the migration');
  assert(!/SECURITY DEFINER/i.test(code), 'SECURITY DEFINER');
  for (const sig of ['fn_syllabus_intake__approve_node(public.syllabus_intake_items, uuid, uuid, text)', 'fn_syllabus_intake_decide(uuid, text, uuid, uuid, text)', 'fn_syllabus_intake_bulk(uuid, text, uuid[], uuid, text)', 'fn_syllabus_intake_bulk_undo(uuid, uuid, text)', 'fn_syllabus_intake_import(uuid, text, uuid, text, text)']) {
    assert(m.includes(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`) && m.includes(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`), `grants ${sig}`);
  }
  const body = (name) => m.slice(m.indexOf(`FUNCTION public.${name}(`), m.indexOf('$fn$;', m.indexOf(`FUNCTION public.${name}(`)));
  for (const f of ['fn_syllabus_intake_bulk', 'fn_syllabus_intake_bulk_undo']) assert(/FROM public\.syllabus_intake_sessions WHERE id = p_session_id FOR UPDATE/.test(body(f)), `${f}: session row FOR UPDATE`);
  assert(/> 1000/.test(body('fn_syllabus_intake_bulk')) && /r\.level <> 'SUBTOPIC'/.test(body('fn_syllabus_intake_bulk')) && /r\.match_status <> 'EXACT'/.test(body('fn_syllabus_intake_bulk')), 'caps / subtopics only / EXACT only');
  assert(/fn_syllabus_intake__approve_node\(v_item/.test(body('fn_syllabus_intake_decide')) && /fn_syllabus_intake__approve_node\(r,/.test(body('fn_syllabus_intake_bulk')), 'one approve path (C2)');
  assert(/ORDER BY seq DESC LIMIT 1 FOR UPDATE/.test(body('fn_syllabus_intake_bulk_undo')) && /confrelid = 'public\.canonical_taxonomy_nodes'::regclass/.test(body('fn_syllabus_intake_bulk_undo')), 'undo: newest only + every FK checked');
  assert(/CHECK \(decision IS DISTINCT FROM 'OUTLINE' OR level = 'CONCEPT'\)/.test(m) && /c\.decision NOT IN \('IGNORE', 'OUTLINE'\)/.test(body('fn_syllabus_intake_import')), 'OUTLINE concept-only; never a mapping target');
  const rb = read('docs/database/rollback/124_rollback.sql');
  assert(/CREATE OR REPLACE FUNCTION public\.fn_syllabus_intake_import\(p_session_id uuid, p_version_tag text, p_actor_id uuid, p_actor_email text\)/.test(rb) && /DROP TABLE public\.syllabus_intake_batches/.test(rb) && /decision = 'OUTLINE'/.test(rb), 'rollback');
  return 'ok';
});

test('S-01 C1: no actor argument from the client; every action guards first', () => {
  const a = read('app/admin/syllabus/intake/actions.ts');
  assert(/export async function bulkIntakeAction\(sessionId: string, action: string, itemIds: string\[\]\)/.test(a) && /export async function undoIntakeBulkAction\(sessionId: string\)/.test(a), 'signatures without an actor');
  for (const fn of ['bulkIntakeAction', 'undoIntakeBulkAction', 'importIntakeAction']) {
    const body = a.slice(a.indexOf(`export async function ${fn}`), a.indexOf('\n}\n', a.indexOf(`export async function ${fn}`)));
    assert(/const __auth = await guardAdminAction\(\)/.test(body.split('\n')[1]), `${fn} guards first`);
  }
  const s = read('services/syllabus/intake.service.ts');
  assert(/fn_syllabus_intake_bulk", \{[\s\S]{0,200}p_actor_id: c\.userId as string,\s*p_actor_email: c\.userEmail/.test(s) && /fn_syllabus_intake_bulk_undo", \{ p_session_id: sessionId, p_actor_id: c\.userId as string, p_actor_email: c\.userEmail \}/.test(s), 'actor from the server auth context');
  return 'ok';
});

test('U-01 review screen: guide, one primary, meanings, progress, undo, source check, row buttons, collapse, filters', () => {
  const u = read('components/admin/syllabus/intake-review.tsx');
  assert(/data-intake-guide=""/.test(u) && /sticky top-0/.test(u) && /aria-expanded=\{guideOpen\}/.test(u), 'sticky collapsible guide');
  for (const t of ['Confirm exact matches', 'Check close matches', 'Check new topics', 'Subtopics under decided topics', 'Concepts', 'Verify source & weightage', 'Create draft syllabus']) assert(u.includes(`title: "${t}"`), `step ${t}`);
  for (const t of ['Link all exact matches (', 'Approve all new subtopics under decided topics (', 'Keep all as lesson outline (']) assert(u.includes(t), `action ${t}`);
  assert((u.match(/studioPrimaryAction/g) || []).length === 3 && /n === current \? studioPrimaryAction : studioQuietAction/.test(u), 'one primary: the current step (+ the drawer save)');
  assert(/What does this mean\?/.test(u) && (u.match(/^  \["[A-Z]/gm) || []).length === 5, 'five one-line meanings');
  assert(/role="progressbar"/.test(u) && /decided<\/?/.test(u) || /\{done\.decided\}\/\{done\.total\} decided/.test(u), 'progress');
  assert(/data-undo-bulk=""/.test(u) && /undoIntakeBulkAction\(session\.id\)/.test(u), 'undo');
  assert(/I verified the notification on the official website \(ssc\.gov\.in for SSC exams\)/.test(u) && /Not verifiable — mark the paper as uncertain/.test(u) && /sourceCheck === null/.test(u), 'required source check');
  assert(/data-row-decisions=""/.test(u) && /Keep as outline/.test(u) && /aria-label=\{`Decide \$\{i\.name\}`\}/.test(u), 'row decision buttons');
  assert(/aria-expanded=\{expanded\.has\(i\.id\)\}/.test(u) && /subtopic\(s\)/.test(u), 'collapsible topics with counts');
  assert(/label="Status"/.test(u) && /label="Level"/.test(u) && /data-suggestions=""/.test(u) && /data-weightage=""/.test(u), 'filters, suggestions, weightage');
  assert(!/[ऀ-ॿ]/.test(u) && !/\blang=/.test(u), 'English-only (#85)');
  return 'ok';
});

console.log(`\nINTAKE-ASSIST-1 offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
