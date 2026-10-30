#!/usr/bin/env node
/**
 * LESSON-NODE-ID-1 (architect 2026-10-29) — offline gate. The owner's lesson answer carried a practice_link
 * "node_id": "turn0file0" (a ChatGPT citation token): the prompt now lists the REAL node ids, "THIS_TOPIC" resolves to
 * the lesson's node, anything else is refused with a one-click fix, and assistant citation markers are refused anywhere
 * in the text with a one-click strip.
 *   N-1 turn0file0 → a helpful NODE_ID error (names the allowed ids + THIS_TOPIC; block id + field) with the fix
 *       USE_THIS_TOPIC; applying it fixes ONLY that block (every other block byte-identical) and the lesson then passes
 *   N-2 "THIS_TOPIC" resolves to the lesson's node id
 *   N-3 a subtopic id from the allowed list is accepted (any letter case → stored lower case)
 *   N-4 a real-looking but unrelated node id is refused; negative control: without the node-id context the same
 *       answer would pass the shape check (the context is what refuses it) and THIS_TOPIC alone is not a valid id
 *   N-5 citation markers are detected in paragraph / list / table / quick_check / solved_example / meta / facts (block
 *       id + field shown); the strip fix removes them all and nothing else; ordinary text ("turnover", "return1file2",
 *       "turn 0", 【 without †) is NOT flagged
 *   N-6 existing valid lessons still pass: the generic example + the six subject-type examples, with and without the
 *       node-id context
 *   N-7 the prompt: the ALLOWED NODE IDS block (this lesson first, names, THIS_TOPIC rule) is appended by the service
 *       after MUST COVER; BLOCK_SPEC points at it; LESSON v3 = v2 + the two rules (sha256 pinned, valid template, v2
 *       untouched); the install script uses the audited RPCs with a dry-run
 *   N-8 wiring: the save path passes this node's allowed ids (server-side, same rule); the paste UI passes them too and
 *       offers "Use this topic" / "Strip citation markers"
 * Run: node scripts/test_lesson_node_id1.cjs
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

const L = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const N = require(path.join(ROOT, 'lib/prompts/lesson-node-ids.ts'));
const X = require(path.join(ROOT, 'lib/prompts/lesson-examples.ts'));
const T = require(path.join(ROOT, 'lib/prompts/template.ts'));

// LESSON template v3 (lib/prompts/lesson-template-v3.ts) — any edit is a new audited version, never a silent change
const V3_SHA = '9cb1c44ec418eb5a7f137470b5d7145dc81115f104fcc48b07ddf4b45d807e23';
const TOPIC = '11111111-1111-4111-8111-111111111111';
const SUB = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const CTX = { nodeIds: { lessonNodeId: TOPIC, allowed: [{ id: TOPIC, name: 'Percentage', level: 'TOPIC' }, { id: SUB, name: 'Successive change', level: 'SUBTOPIC' }] } };
const lesson = (mutate) => {
  const o = JSON.parse(JSON.stringify(L.lessonExample(TOPIC)));
  if (mutate) mutate(o);
  return o;
};
const practice = (o) => o.blocks.find((b) => b.type === 'practice_link');
const paste = (o, opts = CTX) => L.parseLessonPaste(JSON.stringify(o), opts);

test('N-1 turn0file0 → a helpful NODE_ID error with the allowed ids + the "Use this topic" fix; the fix changes ONLY that block and the lesson passes', () => {
  const bad = lesson((o) => { practice(o).node_id = 'turn0file0'; });
  const r = paste(bad);
  assert(!r.ok && r.errors.length === 1, JSON.stringify(r).slice(0, 300));
  const e = r.errors[0];
  assert(e.code === 'NODE_ID' && /block \d+ \(id "practice"\) · node_id/.test(e.path), `path ${e.path}`);
  assert(/"turn0file0" is not a node of this lesson/.test(e.message) && e.message.includes(`Percentage (${TOPIC})`) && e.message.includes(`Successive change (${SUB})`) && /"THIS_TOPIC"/.test(e.message), e.message);
  assert(e.fix && e.fix.kind === 'USE_THIS_TOPIC' && e.fix.blockId === 'practice', JSON.stringify(e.fix));
  const fixedText = N.applyLessonFix(JSON.stringify(bad), e.fix, TOPIC);
  const fixed = JSON.parse(fixedText);
  const before = bad.blocks.filter((b) => b.id !== 'practice');
  const after = fixed.blocks.filter((b) => b.id !== 'practice');
  assert(JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(fixed.meta) === JSON.stringify(bad.meta), 'the fix touched another block or the meta');
  assert(practice(fixed).node_id === TOPIC && practice(fixed).mode === bad.blocks.find((b) => b.id === 'practice').mode, 'the fixed block');
  const again = L.parseLessonPaste(fixedText, CTX);
  assert(again.ok, JSON.stringify(again).slice(0, 300));
  // the fix does not apply to a part that does not hold the block (multi-part answers)
  assert(N.applyLessonFix(JSON.stringify(lesson((o) => { o.blocks = o.blocks.filter((b) => b.id !== 'practice'); })), e.fix, TOPIC) === null, 'fix applied to a part without the block');
  return e.message.slice(0, 90) + '…';
});

test('N-2 "THIS_TOPIC" resolves to the lesson node id', () => {
  const r = paste(lesson((o) => { practice(o).node_id = 'THIS_TOPIC'; }));
  assert(r.ok && r.blocks.find((b) => b.type === 'practice_link').node_id === TOPIC, JSON.stringify(r).slice(0, 300));
  return `THIS_TOPIC → ${TOPIC.slice(0, 8)}…`;
});

test('N-3 a subtopic id from the allowed list is accepted (upper case → stored lower case)', () => {
  const r = paste(lesson((o) => { practice(o).node_id = SUB.toUpperCase(); }));
  assert(r.ok && r.blocks.find((b) => b.type === 'practice_link').node_id === SUB, JSON.stringify(r).slice(0, 300));
});

test('N-4 a real-looking but unrelated node id is refused; negative controls: without the context it passes the shape check, and THIS_TOPIC alone is no id', () => {
  const foreign = lesson((o) => { practice(o).node_id = FOREIGN; });
  const r = paste(foreign);
  assert(!r.ok && r.errors[0].code === 'NODE_ID' && r.errors[0].message.includes(FOREIGN), JSON.stringify(r).slice(0, 300));
  assert(paste(foreign, {}).ok, 'negative control: the shape check alone should accept a UUID (the context is what refuses it)');
  const noCtx = paste(lesson((o) => { practice(o).node_id = 'THIS_TOPIC'; }), {});
  assert(!noCtx.ok && noCtx.errors.some((e) => /node_id/.test(e.path)), 'negative control: THIS_TOPIC without the context must not pass');
});

test('N-5 citation markers detected in paragraph / list / table / quick_check / solved_example / meta / facts (block id + field); strip fixes them and nothing else; ordinary text not flagged', () => {
  const marked = lesson((o) => {
    o.meta.summary = 'How changes combine citeturn0search1.';
    o.blocks.find((b) => b.id === 'intro-p').text = 'When a value changes by **a%** turn0file0 and then by **b%**.';
    o.blocks.splice(2, 0, { id: 'l-1', type: 'list', ordered: false, items: ['First 【4:0†source】 point', 'Second point'] });
    o.blocks.splice(3, 0, { id: 't-1', type: 'table', headers: ['Change', 'Net'], rows: [['10% then 20%', '32% [cite: 3]']] });
    o.blocks.find((b) => b.id === 'qc-1').options[0].text = '0% [cite_start]';
    o.blocks.find((b) => b.id === 'ex-1').answer = '32% increase citeturn0view2';
    o.uncertain_facts = ['A fact turn1news3'];
  });
  const r = paste(marked);
  assert(!r.ok && r.errors.every((e) => e.code === 'CITATION_ARTIFACT' && e.fix && e.fix.kind === 'STRIP_CITATIONS'), JSON.stringify(r).slice(0, 400));
  const paths = r.errors.map((e) => e.path);
  for (const want of [/\$\.meta\.summary/, /id "intro-p"\) · text/, /id "l-1"\) · items\[0\]/, /id "t-1"\) · rows\[0\]\[1\]/, /id "qc-1"\) · options\[0\]\.text/, /id "ex-1"\) · answer/, /\$\.uncertain_facts\[0\]/])
    assert(paths.some((p) => want.test(p)), `no error at ${want}: ${paths.join(' | ')}`);
  const stripped = N.applyLessonFix(JSON.stringify(marked), { kind: 'STRIP_CITATIONS' }, TOPIC);
  const s = JSON.parse(stripped);
  assert(s.meta.summary === 'How changes combine.' && s.blocks.find((b) => b.id === 'intro-p').text === 'When a value changes by **a%** and then by **b%**.', JSON.stringify([s.meta.summary, s.blocks.find((b) => b.id === 'intro-p').text]));
  assert(s.blocks.find((b) => b.id === 't-1').rows[0][1] === '32%' && s.blocks.find((b) => b.id === 'ex-1').answer === '32% increase' && s.uncertain_facts[0] === 'A fact', JSON.stringify(s.uncertain_facts));
  const untouched = (x) => JSON.stringify(x.blocks.filter((b) => !['intro-p', 'l-1', 't-1', 'qc-1', 'ex-1'].includes(b.id)));
  assert(untouched(s) === untouched(marked), 'the strip changed a block without markers');
  assert(L.parseLessonPaste(stripped, CTX).ok, 'stripped lesson does not pass');
  const clean = lesson((o) => { o.blocks.find((b) => b.id === 'intro-p').text = 'A turnover of 10 then return1file2 and turn 0 file, 【note】 stays.'; });
  assert(paste(clean).ok, 'ordinary text was flagged as a citation');
  assert(N.applyLessonFix(JSON.stringify(clean), { kind: 'STRIP_CITATIONS' }, TOPIC) === null, 'strip changed a clean lesson');
  return `${r.errors.length} markers in 7 places`;
});

test('N-6 existing valid lessons still pass: the generic example + the six subject-type examples, with and without the node-id context', () => {
  const all = [L.lessonExample(TOPIC), ...X.EXAMPLE_SUBJECT_TYPES.map((t) => X.lessonExampleFor(t, TOPIC))];
  for (const [i, ex] of all.entries()) {
    const a = L.parseLessonPaste(JSON.stringify(ex), CTX);
    const b = L.parseLessonPaste(JSON.stringify(ex), {});
    assert(a.ok && b.ok, `example ${i}: ${JSON.stringify(a.ok ? b : a).slice(0, 300)}`);
  }
  return `${all.length} examples`;
});

test('N-7 prompt: ALLOWED NODE IDS appended after MUST COVER; BLOCK_SPEC points at it; LESSON v3 = v2 + the rules (pinned, valid, v2 untouched); audited install with a dry-run', () => {
  const block = N.allowedNodeIdsBlock(CTX.nodeIds.allowed);
  assert(block.startsWith('\n\nALLOWED NODE IDS') && block.includes(`- ${TOPIC} — Percentage (TOPIC, this lesson)`) && block.includes(`- ${SUB} — Successive change (SUBTOPIC)`) && /"THIS_TOPIC"/.test(block) && /never invent an id/.test(block), block);
  assert(N.allowedNodeIdsBlock([]) === '', 'empty list renders nothing');
  const svc = read('services/lessons/lesson-authoring.service.ts');
  assert(/mustCoverBlock\(context\.mustCover\) \+ allowedNodeIdsBlock\(context\.allowedNodes\)/.test(svc) && /allowedNodes: allowedNodesFor\(tree, nodeId\)/.test(svc), 'service prompt append');
  assert(/ALLOWED NODE IDS at the end of this prompt, or "\$\{THIS_TOPIC\}"/.test(read('lib/prompts/lesson-prompt.ts')) && L.LESSON_BLOCK_SPEC.includes('"THIS_TOPIC"'), 'BLOCK_SPEC');
  const V2 = require(path.join(ROOT, 'lib/prompts/lesson-template-v2.ts')).LESSON_TEMPLATE_V2;
  const V3 = require(path.join(ROOT, 'lib/prompts/lesson-template-v3.ts')).LESSON_TEMPLATE_V3;
  const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  assert(sha(V2) === 'a6bf2f1cddcf1e1ff5829293db80b089e9864e2f6a82224f8eef4459cefe790d', 'LESSON v2 changed');
  assert(sha(V3) === V3_SHA, `LESSON v3 sha256 ${sha(V3)} (pinned ${V3_SHA})`);
  assert(T.templateProblems('LESSON', V3).length === 0, `v3 template problems: ${T.templateProblems('LESSON', V3)}`);
  assert(/Never invent ids/.test(V3) && /Never include citation markers/.test(V3) && /"THIS_TOPIC" or an id from ALLOWED NODE IDS/.test(V3), 'v3 rules');
  // v3 = v2 with only additions (every v2 line still present, in order)
  const v2Lines = V2.split('\n');
  let k = 0;
  for (const line of V3.split('\n')) if (k < v2Lines.length && (line === v2Lines[k] || (v2Lines[k].startsWith('10. One practice link') && line.startsWith('10. One practice link')))) k++;
  assert(k === v2Lines.length, `v3 is not v2 + additions (matched ${k}/${v2Lines.length} v2 lines)`);
  const inst = read('scripts/content/lesson-prompt-3.cjs');
  assert(/fn_prompt_template_save_draft\('LESSON'/.test(inst) && /fn_prompt_template_activate/.test(inst) && /--dry-run/.test(inst) && /safeBegin/.test(inst) && !/update public\.prompt_templates/i.test(inst), 'install script');
  return `v3 sha256 ${V3_SHA.slice(0, 12)}…`;
});

test('N-8 wiring: the save path passes the allowed ids (server-side); the paste UI passes them and offers the two fixes', () => {
  const svc = read('services/lessons/lesson-authoring.service.ts');
  assert(/mergeLessonParts\(parts\.map\(parseLessonPart\), \{ nodeIds: \{ lessonNodeId: nodeId, allowed: allowedNodesFor\(tree, nodeId\) \} \}\)/.test(svc), 'save path context');
  const ui = read('components/admin/lessons/lesson-generator.tsx');
  assert(/mergeLessonParts\(list\.map\(\(p\) => p\.parsed\), mergeOpts\)/.test(ui) && /applyLessonFix\(p\.text, fix, generator\.context\.nodeId\)/.test(ui), 'UI merge + fix');
  assert(/"Use this topic"/.test(ui) && /"Strip citation markers"/.test(ui) && /action=\{fixButton\}/.test(ui), 'UI buttons');
});

console.log(`\nLESSON-NODE-ID-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
