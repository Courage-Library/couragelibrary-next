#!/usr/bin/env node
/**
 * CA-4 PROMPT TEMPLATES + NODE LESSONS + THE TRANSLATION FLOW — offline gate (no network, no DB; reads source + runs the
 * pure TS modules).
 *   T-01 templates: {{NAME}} slots + {{#NAME}}…{{/NAME}} sections, required / unknown placeholders, render refuses a missing
 *        value; the SQL twin (fn_prompt_template_problems) lists the same placeholders; the 119 seeds = the TS constants
 *   L-01 LESSON prompt: exam coverage, basics → formulas → ALL question types → 10–15 solved examples easy → hard → shortcuts
 *        → traps → quick checks → practice → summary → Memory Lock; no copying; uncertain facts; the exact block JSON (list /
 *        quick_check / callout included, no image); its own example is valid; the paste parser is strict
 *   K-01 completeness checklist: errors block publishing (min examples, order, steps, formulas for aptitude, traps, quick
 *        checks, summary, Memory Lock, basics first); warnings do not
 *   H-01 TRANSLATE_HI: glossary + structure rules; the paste parser checks the blocks AND parity; the machine-translation
 *        seam is off (no provider, no network)
 *   P-01 parity: words may change; formulas, step math, answers, numbers (ASCII digits only), block ids / types / order,
 *        shapes may not; the SQL twin (fn_lesson_parity_errors) has the same codes
 *   D-01 migration 119: no BEGIN / COMMIT; every new function SECURITY INVOKER + pinned search_path, client EXECUTE revoked;
 *        prompt_templates RLS (admin read) + no client writes; rollback restores the exact 116 / 117 function bodies
 *   S-01 admin only: nav + ADMIN_ONLY_ROUTES, page guards (no staff), actions guarded first, client screens import no
 *        server module; an English node lesson publishes only when the checklist passes
 *   U-01 screens: one primary per header, labelled controls, #85 (the second language only in marked content fields /
 *        displays), the EN | HI review side by side
 *   R-01 reader: node lessons roll up to their topic; a Hindi reader gets the published Hindi version (labelled when it
 *        follows an older English version) or English + "Hindi coming soon"
 * Run: node scripts/test_ca4_lessons.cjs
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

const T = require(path.join(ROOT, 'lib/prompts/template.ts'));
const L = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const H = require(path.join(ROOT, 'lib/prompts/translate-prompt.ts'));
const P = require(path.join(ROOT, 'lib/lessons/parity.ts'));
const C = require(path.join(ROOT, 'lib/lessons/completeness.ts'));
const B = require(path.join(ROOT, 'lib/lessons/blocks.ts'));
const S = require(path.join(ROOT, 'lib/syllabus/intake-prompt.ts'));
const SEEDS = require(path.join(ROOT, 'scripts/content/ca4-template-seeds.cjs'));
const MIG = read('supabase/migrations/20261028000119_ca4_templates_node_lessons_hindi.sql');
const NODE = '11111111-2222-3333-4444-555555555555';

test('T-01 templates: slots + sections, required / unknown placeholders, render refuses a missing value; SQL twin placeholders = TS; seeds = TS constants', () => {
  assert(T.templateProblems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}}').length === 0, 'minimal syllabus');
  assert(T.templateProblems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}}').some((p) => /TIER_JSON/.test(p)), 'required');
  assert(T.templateProblems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{NODE_NAME}}').some((p) => /Unknown placeholder/.test(p)), 'unknown');
  assert(T.templateProblems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{#TIER}}x').some((p) => /not closed/.test(p)), 'open section');
  assert(T.templateProblems('LESSON', '').length === 1 && T.templateProblems('TRANSLATE_HI', '{{GLOSSARY}} {{EN_JSON}} {{BLOCK_RULES}} \u0007').some((p) => /Control/.test(p)), 'empty / control');
  const body = 'A{{#TIER}} — {{TIER}}{{/TIER}} {{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}}';
  const vals = { EXAM_NAME: 'X', EXAM_SLUG: 'x', CYCLE: '2026', TIER: '', TIER_JSON: 'null' };
  assert(T.renderTemplate('SYLLABUS', body, vals) === 'A X x 2026 null' && T.renderTemplate('SYLLABUS', body, { ...vals, TIER: 't1' }) === 'A — t1 X x 2026 null', 'sections');
  let threw = false;
  try {
    T.renderTemplate('SYLLABUS', body, { EXAM_NAME: 'X' });
  } catch {
    threw = true;
  }
  assert(threw, 'a missing value throws');
  // the SQL twin lists exactly the TS placeholders — its CURRENT definition is migration 121 (LESSON-PROMPT-2)
  const MIG121 = read('supabase/migrations/20261028000121_lesson_prompt_2.sql');
  for (const t of T.TEMPLATE_TYPES) {
    const block = MIG121.slice(MIG121.indexOf(`WHEN '${t}' THEN`), MIG121.indexOf(`WHEN '${t}' THEN`) + 900);
    const allowed = /v_allowed := ARRAY\[([^\]]+)\]/.exec(block)[1].replace(/\s+/g, '').replace(/'/g, '').split(',');
    const required = /v_required := ARRAY\[([^\]]+)\]/.exec(block)[1].replace(/\s+/g, '').replace(/'/g, '').split(',');
    const any = (/v_any := ARRAY\[([^\]]+)\]/.exec(block.split('WHEN ')[1]) || [])[1];
    const anyTs = (T.TEMPLATE_PLACEHOLDERS[t].requiredAny || []).map((g) => g.join('|'));
    assert(JSON.stringify(allowed) === JSON.stringify(T.TEMPLATE_PLACEHOLDERS[t].allowed) && JSON.stringify(required) === JSON.stringify(T.TEMPLATE_PLACEHOLDERS[t].required)
      && JSON.stringify(any ? any.replace(/\s+/g, '').replace(/'/g, '').split(',') : []) === JSON.stringify(anyTs), `${t}: SQL placeholders differ`);
  }
  const i = MIG.indexOf('-- @@SEEDS-BEGIN@@');
  const j = MIG.indexOf('-- @@SEEDS-END@@');
  assert(i > 0 && MIG.slice(i, j + '-- @@SEEDS-END@@'.length) === SEEDS.sqlBlock(), 'the 119 seeds differ from the TS constants (run scripts/content/ca4-template-seeds.cjs)');
  for (const [t, b] of SEEDS.seeds()) assert(T.templateProblems(t, b).length === 0, `${t} v1 is not a valid template`);
  assert(!MIG.includes("'QUESTION', 1,"), 'no QUESTION v1 seed');
  return Object.entries(T.TEMPLATE_PLACEHOLDERS).map(([k, v]) => `${k} ${v.allowed.length}`).join(' · ');
});

test('L-01 LESSON prompt: coverage + the full teaching order + rules + the exact block JSON; its example is valid; the paste parser is strict', () => {
  const ctx = { nodeId: NODE, nodeName: 'Percentage', nodePath: 'Quantitative Aptitude › Percentage', nodeLevel: 'TOPIC', subjectName: 'Quantitative Aptitude', subjectType: 'APTITUDE',
    coverage: [{ exam: 'SSC CGL', cycleYear: 2026, tier: 'tier-1', syllabusPath: 'Tier 1 › Quantitative Aptitude › Percentage', weightageTier: 'HIGH_YIELD', questionsMin: 2, questionsMax: 3 }],
    childNodes: ['Successive Percentage Change'], aliases: ['Percent'], existingLessons: [] };
  const p = T.renderTemplate('LESSON', L.LESSON_TEMPLATE_V1, L.lessonPromptValues(ctx));
  assert(!/\{\{/.test(p), 'unfilled placeholder');
  for (const x of ['SSC CGL 2026 (tier-1): Tier 1 › Quantitative Aptitude › Percentage, weightage HIGH_YIELD, about 2–3 question(s)', 'from the basics', 'formula block', 'ALL the question types',
    '10 to 15 solved examples, ordered from EASY to HARD', 'Shortcuts', 'Common traps', 'At least 5 quick checks in the style of previous year questions', 'practice link',
    'one-page revision summary', 'Memory Lock points', 'never copy text', 'uncertain_facts', 'LESSON_BLOCKS v2', 'Successive Percentage Change'])
    assert(p.includes(x), `missing: ${x}`);
  for (const t of B.BLOCK_TYPES.filter((x) => x !== 'image')) assert(L.LESSON_BLOCK_SPEC.includes(`- ${t}:`), `block spec: ${t}`);
  assert(/Do NOT output image blocks/.test(L.LESSON_BLOCK_SPEC) && /"TIP" \| "WARNING" \| "INFO" \| "MEMORY_HOOK"/.test(L.LESSON_BLOCK_SPEC), 'image / callout variants');
  const ex = L.lessonExample(NODE);
  const v = B.validateLesson(ex.meta, ex.blocks);
  assert(v.ok, `the example must be valid: ${JSON.stringify(v.errors)}`);
  const ok = L.parseLessonPaste('```json\n' + JSON.stringify({ ...ex, uncertain_facts: ['The 2026 weightage is an estimate.'] }) + '\n```');
  assert(ok.ok && ok.uncertainFacts.length === 1, 'fenced paste + facts');
  for (const [bad, why] of [
    [JSON.stringify({ ...ex, contract: 'X' }), 'contract'],
    [JSON.stringify({ ...ex, extra: 1 }), 'unknown key'],
    [JSON.stringify({ ...ex, uncertain_facts: ['<b>x</b>'] }), 'fact markup'],
    [JSON.stringify({ ...ex, blocks: [{ id: 'a', type: 'paragraph', text: 'see https://x.test' }] }), 'url'],
    ['not json', 'json'],
  ]) assert(!L.parseLessonPaste(bad).ok, `accepted: ${why}`);
  return `${p.length} chars`;
});

test('K-01 completeness checklist (LESSON-PROMPT-2): SIZE minimums, 4-option quick checks with feedback, ≥ 3 traps, a strategy list, 5–10 Memory Lock points, formulas required (APTITUDE) / forbidden (LANGUAGE)', () => {
  const E = require(path.join(ROOT, 'lib/prompts/lesson-examples.ts'));
  const LP = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
  const build = (type, n, q) => {
    const ex = E.lessonExampleFor(type, NODE);
    const b = ex.blocks;
    const one = b.find((x) => x.type === 'solved_example');
    const qc = b.find((x) => x.type === 'quick_check');
    const trap = b.find((x) => x.type === 'trap');
    const levels = Array.from({ length: n }, (_, i) => (i < n / 3 ? 'EASY' : i < (2 * n) / 3 ? 'MEDIUM' : 'HARD'));
    return [
      ...b.filter((x) => !['solved_example', 'quick_check', 'trap'].includes(x.type)).slice(0, b.findIndex((x) => x.type === 'solved_example')),
      ...levels.map((d, i) => ({ ...one, id: `ex-${i}`, difficulty: d })),
      ...[0, 1, 2].map((i) => ({ ...trap, id: `trap-${i}` })),
      ...Array.from({ length: q }, (_, i) => ({ ...qc, id: `qc-${i}` })),
      ...b.slice(b.findIndex((x) => x.type === 'solved_example') + 1).filter((x) => !['quick_check', 'trap'].includes(x.type)),
    ];
  };
  const HY = LP.lessonSize([{ weightageTier: 'MODERATE' }, { weightageTier: 'HIGH_YIELD' }]);
  const CORE = LP.lessonSize([{ weightageTier: 'CORE' }]);
  const LOW = LP.lessonSize([]);
  assert(HY.tier === 'HIGH_YIELD' && HY.minExamples === 15 && HY.quickChecks === 10 && CORE.minExamples === 12 && CORE.quickChecks === 8 && LOW.minExamples === 8 && LOW.quickChecks === 5, 'SIZE by the highest weightage');
  const fails = (blocks, type, size) => C.lessonChecklist(blocks, type, size).filter((i) => !i.ok && i.severity === 'error').map((i) => i.key);
  assert(fails(build('APTITUDE', 15, 10), 'APTITUDE', HY).length === 0, `aptitude HIGH_YIELD complete: ${fails(build('APTITUDE', 15, 10), 'APTITUDE', HY)}`);
  assert(fails(build('APTITUDE', 12, 8), 'APTITUDE', HY).join() === 'examples_min,quick_checks', 'below the HIGH_YIELD size');
  assert(fails(build('LANGUAGE', 8, 5), 'LANGUAGE', LOW).length === 0, `language complete: ${fails(build('LANGUAGE', 8, 5), 'LANGUAGE', LOW)}`);
  const langFormula = [...build('LANGUAGE', 8, 5), { id: 'f-x', type: 'formula', latex: 'a + b', reading: 'a plus b' }];
  assert(fails(langFormula, 'LANGUAGE', LOW).includes('formulas'), 'a formula in a language lesson fails');
  assert(fails(build('APTITUDE', 8, 5).filter((b) => b.type !== 'formula'), 'APTITUDE', LOW).includes('formulas'), 'aptitude without formulas fails');
  const threeOpts = build('GK_GA', 8, 5).map((b) => (b.type === 'quick_check' ? { ...b, options: b.options.slice(0, 3).map((o, i) => ({ ...o, correct: i === 0 })) } : b));
  const noFeedback = build('GK_GA', 8, 5).map((b) => (b.type === 'quick_check' ? { ...b, options: b.options.map((o) => ({ ...o, feedback: undefined })) } : b));
  assert(fails(threeOpts, 'GK_GA', LOW).includes('quick_check_shape') && fails(noFeedback, 'GK_GA', LOW).includes('quick_check_shape'), 'exactly 4 options + feedback on every option');
  assert(fails(build('REASONING', 8, 5).filter((b) => b.type !== 'trap' || b.id === 'trap-0'), 'REASONING', LOW).includes('traps'), 'at least 3 traps');
  assert(fails(build('PEDAGOGY', 8, 5).filter((b) => !/^strategy/.test(b.id)), 'PEDAGOGY', LOW).includes('strategy'), 'an exam-strategy list');
  const fewPoints = build('TECHNICAL', 8, 5).map((b) => (b.type === 'memory_lock_points' ? { ...b, points: b.points.slice(0, 4) } : b));
  assert(fails(fewPoints, 'TECHNICAL', LOW).includes('memory_lock'), '5–10 Memory Lock points');
  const hardFirst = build('APTITUDE', 8, 5).map((b) => (b.id === 'ex-0' ? { ...b, difficulty: 'HARD' } : b));
  assert(fails(hardFirst, 'APTITUDE', LOW).includes('examples_order'), 'easy → hard');
  return 'size + shape + type rules';
});

test('LP-01 LESSON template v2 = the owner-approved text (sha256 pinned), valid; every subject type renders with EXACTLY one true section; STATE_SPECIFIC → GK_GA; every slot filled', () => {
  const V2 = require(path.join(ROOT, 'lib/prompts/lesson-template-v2.ts')).LESSON_TEMPLATE_V2;
  const sha = require('crypto').createHash('sha256').update(V2, 'utf8').digest('hex');
  assert(sha === 'a6bf2f1cddcf1e1ff5829293db80b089e9864e2f6a82224f8eef4459cefe790d', `LESSON v2 is not the owner-approved text (sha256 ${sha})`);
  assert(T.templateProblems('LESSON', V2).length === 0, JSON.stringify(T.templateProblems('LESSON', V2)));
  const LP = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
  const marks = { APTITUDE: 'every formula as a formula block', REASONING: 'the rule of every pattern', LANGUAGE: 'every grammar rule as a numbered list', GK_GA: 'the facts in tables', TECHNICAL: 'definitions, principles, units/standards', PEDAGOGY: 'theories and thinkers in tables' };
  for (const [type, want] of [...Object.keys(marks).map((k) => [k, k]), ['STATE_SPECIFIC', 'GK_GA']]) {
    const ctx = { nodeId: NODE, nodeName: 'Active Passive', nodePath: 'English › Active Passive', nodeLevel: 'TOPIC', subjectName: 'English', subjectType: type,
      coverage: [{ exam: 'SSC CGL', cycleYear: 2026, tier: 'tier-1', syllabusPath: 'Tier 1 › English › Active Passive', weightageTier: 'CORE', questionsMin: null, questionsMax: 2, avgQuestions: 1 }], childNodes: [], aliases: [], existingLessons: [] };
    const out = T.renderTemplate('LESSON', V2, LP.lessonPromptValues(ctx));
    const on = Object.entries(marks).filter(([, m]) => out.includes(m)).map(([k]) => k);
    assert(on.length === 1 && on[0] === want, `${type}: sections on = ${on}`);
    assert(!/\{\{/.test(out) && out.includes('SSC CGL 2026 · tier-1 › Tier 1 › English › Active Passive · CORE · avg 1 question(s)') && out.includes('none listed'), `${type}: slots`);
    assert(out.includes('"contract": "LESSON_BLOCKS v2"'), `${type}: example`);
    if (want === 'APTITUDE') assert(out.includes('the formulas, speed rules'), 'the inline APTITUDE section in the summary line');
    else assert(out.includes('(key bullets, speed rules)'), `${type}: the inline APTITUDE section is dropped`);
  }
  return 'one section per type';
});

test('LP-02 the six examples are valid LESSON_BLOCKS v2 (through the paste parser) and model the v2 rules; LANGUAGE has no formula; GK_GA has a fact table + a MEMORY_HOOK', () => {
  const E = require(path.join(ROOT, 'lib/prompts/lesson-examples.ts'));
  for (const t of E.EXAMPLE_SUBJECT_TYPES) {
    const ex = E.lessonExampleFor(t, NODE);
    const r = L.parseLessonPaste(JSON.stringify(ex));
    assert(r.ok, `${t}: ${JSON.stringify(r.errors && r.errors.slice(0, 2))}`);
    const qcs = r.blocks.filter((b) => b.type === 'quick_check');
    assert(qcs.length && qcs.every((q) => q.options.length === 4 && q.options.filter((o) => o.correct).length === 1 && q.options.every((o) => o.feedback)), `${t}: quick checks`);
    assert(r.blocks.some((b) => b.type === 'heading' && /strategy/i.test(b.text)) && r.blocks.some((b) => b.type === 'callout' && b.variant === 'WARNING'), `${t}: strategy + warning`);
    assert(r.blocks.find((b) => b.type === 'memory_lock_points').points.length >= 5, `${t}: memory points`);
  }
  const lang = E.lessonExampleFor('LANGUAGE', NODE).blocks;
  const gk = E.lessonExampleFor('GK_GA', NODE).blocks;
  assert(!lang.some((b) => b.type === 'formula') && lang.some((b) => b.type === 'table'), 'LANGUAGE: no formula, a structure table');
  assert(gk.some((b) => b.type === 'table') && gk.some((b) => b.type === 'callout' && b.variant === 'MEMORY_HOOK'), 'GK_GA: a fact table + a memory hook');
  assert(E.lessonExampleFor('APTITUDE', NODE).blocks.some((b) => b.type === 'formula') && E.sectionForSubjectType('STATE_SPECIFIC') === 'GK_GA' && E.sectionForSubjectType(null) === null, 'APTITUDE formula; STATE_SPECIFIC → GK_GA');
  return `${E.EXAMPLE_SUBJECT_TYPES.length} examples`;
});

test('LP-03 multi-part answers merged in order (ids unique across parts), validated only when complete; "part N of M missing"; suggested subtopics taken out of meta (plain names)', () => {
  const E = require(path.join(ROOT, 'lib/prompts/lesson-examples.ts'));
  const full = E.lessonExampleFor('REASONING', NODE);
  const p1 = { ...full, part: 1, total_parts: 3, blocks: full.blocks.slice(0, 4) };
  const p2 = { contract: full.contract, part: 2, total_parts: 3, blocks: full.blocks.slice(4, 9) };
  const p3 = { contract: full.contract, part: 3, total_parts: 3, blocks: full.blocks.slice(9) };
  const part = (o) => L.parseLessonPart(JSON.stringify(o));
  const m1 = L.mergeLessonParts([part(p1), part(p3)]);
  assert(m1.state === 'INCOMPLETE' && JSON.stringify(m1.missing) === '[2]' && m1.totalParts === 3, JSON.stringify(m1));
  const m2 = L.mergeLessonParts([part(p3), part(p1), part(p2)]);
  assert(m2.state === 'COMPLETE' && m2.result.ok && m2.result.blocks.map((b) => b.id).join() === full.blocks.map((b) => b.id).join(), 'merged in part order');
  const dup = { ...p2, blocks: [full.blocks[0], ...p2.blocks.slice(1)] };
  const m3 = L.mergeLessonParts([part(p1), part(dup), part(p3)]);
  assert(m3.state === 'COMPLETE' && !m3.result.ok, 'a duplicate id across parts is refused by the validator');
  assert(L.mergeLessonParts([part(p1), part(p1)]).state === 'ERROR' && L.mergeLessonParts([part(p1), part({ ...p2, total_parts: 2 })]).state === 'ERROR', 'twice / disagreeing totals');
  assert(!L.parseLessonPaste(JSON.stringify(p1)).ok, 'a single part of three is not a lesson');
  const sug = E.lessonExampleFor('LANGUAGE', NODE);
  sug.meta.suggested_subtopics = ['Simple present', 'Simple past', 'simple present'];
  const r = L.parseLessonPaste(JSON.stringify(sug));
  assert(r.ok && JSON.stringify(r.suggestedSubtopics) === '["Simple present","Simple past"]' && !('suggested_subtopics' in r.meta), 'suggested subtopics');
  sug.meta.suggested_subtopics = ['<b>x</b>'];
  assert(!L.parseLessonPaste(JSON.stringify(sug)).ok, 'plain names only');
  return '3-part merge';
});

test('LP-04 generator: subject type required (refused with a Master-tree link), shown with the SIZE; suggested subtopics → "Add to Master tree" via the audited admin create, one confirmed click each', () => {
  const svc = read('services/lessons/lesson-authoring.service.ts');
  assert(/if \(!subject\.type\) return fail\("SUBJECT_TYPE_MISSING"/.test(svc) && (svc.match(/SUBJECT_TYPE_MISSING", SUBJECT_TYPE_MISSING/g) || []).length === 2, 'the service refuses (generator + save)');
  assert(/lessonChecklist\(parsed\.blocks, subject\.type, lessonSize\(await examCoverage\(c, tree, nodeId\)\)\)/.test(svc), 'the checklist uses the subject type + SIZE');
  const ui = read('components/admin/lessons/lesson-generator.tsx');
  assert(/Set the subject type in the Master tree first\./.test(ui) && /href="\/admin\/taxonomy"/.test(ui) && /subject type <span[^>]*>\{generator\.context\.subjectType\}/.test(ui), 'refusal + link + the subject type shown');
  assert(/createTaxonomyNodeAction\(\{ parentId: selectedNodeId, nodeType: childLevel, name \}\)/.test(ui) && /Confirm add/.test(ui) && /setConfirmAdd\(s\)/.test(ui), 'add to the Master tree: confirmed, audited admin create');
  return 'ok';
});
test('H-01 TRANSLATE_HI: glossary + structure rules; the paste parser checks blocks AND parity; no machine-translation provider', () => {
  const ex = L.lessonExample(NODE);
  const p = T.renderTemplate('TRANSLATE_HI', H.TRANSLATE_HI_TEMPLATE_V1, H.translatePromptValues(ex.meta, ex.blocks));
  for (const x of ['Percentage = प्रतिशत', 'same "id", the same "type", the same order', 'copy them character for character', 'never Devanagari digits', '"LESSON_BLOCKS v2 hi"', 'natural']) assert(p.includes(x), `missing: ${x}`);
  const hi = JSON.parse(JSON.stringify(ex.blocks));
  hi[1].text = 'जब कोई मान **a%** बदलता है';
  assert(H.parseTranslationPaste(JSON.stringify({ contract: H.TRANSLATION_PASTE_CONTRACT, meta: { title: 'क्रमिक प्रतिशत परिवर्तन' }, blocks: hi }), ex.blocks).ok, 'words-only translation');
  const formula = JSON.parse(JSON.stringify(hi));
  formula[2].latex = 'a + b';
  const r = H.parseTranslationPaste(JSON.stringify({ contract: H.TRANSLATION_PASTE_CONTRACT, meta: ex.meta, blocks: formula }), ex.blocks);
  assert(!r.ok && r.errors.some((e) => e.code === 'PARITY_FORMULA'), 'formula change');
  assert(!H.parseTranslationPaste(JSON.stringify({ contract: L.LESSON_PASTE_CONTRACT, meta: ex.meta, blocks: hi }), ex.blocks).ok, 'the English contract is not a translation');
  const prov = require(path.join(ROOT, 'lib/prompts/translation-provider.ts'));
  const src = read('lib/prompts/translation-provider.ts');
  assert(prov.getTranslationProvider() === null && prov.LESSON_MT_ENABLED === false && !/fetch\(|https?:\/\/|process\.env/.test(src), 'provider seam must be off (no network, no key)');
  return `${p.length} chars`;
});

test('P-01 parity: words may change; formulas / step math / answers / numbers / ids / types / order / shapes may not; the SQL twin has the same codes', () => {
  const en = L.lessonExample(NODE).blocks;
  const clone = () => JSON.parse(JSON.stringify(en));
  const codes = (hi) => P.parityErrors(en, hi).map((e) => e.code).sort().join(',');
  const m = (fn) => { const x = clone(); fn(x); return x; };
  assert(codes(clone()) === '' && codes(m((x) => { x[0].text = 'अर्थ'; })) === '', 'identity / words');
  const cases = {
    FORMULA: m((x) => { x[2].latex = 'a + b'; }),
    STEP_MATH: m((x) => { x[3].steps[0].math = '10 + 20'; }),
    ANSWERS: m((x) => { x[6].options[1].correct = false; }),
    NUMBERS: m((x) => { x[3].answer = '33% increase'; }),
    CALLOUT_VARIANT: m((x) => { x[4].variant = 'INFO'; }),
    PRACTICE_LINK: m((x) => { x[7].mode = 'MOCK'; }),
    MEMORY_LOCK_COUNT: m((x) => { x[9].points.pop(); }),
    SUMMARY_SHAPE: m((x) => { x[8].formulas = []; }),
    BLOCK_MISMATCH: m((x) => { x[0].id = 'other'; }),
    BLOCK_COUNT: clone().slice(1),
  };
  for (const [code, hi] of Object.entries(cases)) assert(codes(hi).split(',').includes(code), `${code}: got ${codes(hi)}`);
  assert(codes(m((x) => { x[3].question = 'एक मूल्य १०% बढ़ता है और फिर 20%.'; })).includes('NUMBERS'), 'Devanagari digits are a change');
  const sqlCodes = ['HEADING_LEVEL', 'LIST_SHAPE', 'FORMULA', 'EXAMPLE_SHAPE', 'STEP_MATH', 'CALLOUT_VARIANT', 'TRAP_KIND', 'TABLE_SHAPE', 'IMAGE', 'PRACTICE_LINK', 'ANSWERS', 'SUMMARY_SHAPE', 'MEMORY_LOCK_COUNT', 'NUMBERS', 'BLOCK_MISMATCH', 'BLOCK_COUNT'];
  const tsSrc = read('lib/lessons/parity.ts');
  for (const k of sqlCodes) assert(MIG.includes(`'${k}'`) && tsSrc.includes(`"${k}"`), `${k} missing in SQL or TS`);
  assert(/'\[0-9\]\+\(\?:\\\.\[0-9\]\+\)\?'/.test(MIG) && /\[0-9\]\+\(\?:\\\.\[0-9\]\+\)\?/.test(tsSrc), 'the same ASCII number pattern in SQL and TS');
  return `${Object.keys(cases).length} change kinds`;
});

test('D-01 migration 119: no BEGIN / COMMIT; new functions INVOKER + pinned search_path + client EXECUTE revoked; prompt_templates RLS admin read, no client writes; rollback restores the exact 116 / 117 bodies', () => {
  assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(MIG), 'BEGIN / COMMIT in the migration');
  const fns = [...MIG.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((x) => x[1]);
  assert(fns.length === 16, `functions: ${fns.length} ${fns.join(',')}`);
  assert(!/SECURITY DEFINER/i.test(MIG), 'SECURITY DEFINER');
  for (const f of new Set(fns)) {
    const at = MIG.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
    const head = MIG.slice(at, MIG.indexOf('AS $', at));
    if (f !== 'fn_prevent_published_version_mutation') assert(/SET search_path = public, pg_temp/.test(head), `${f}: search_path`);
    if (!/guard$|^fn_prevent/.test(f)) assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(MIG), `${f}: client EXECUTE not revoked`);
  }
  assert(/ALTER TABLE public\.prompt_templates ENABLE ROW LEVEL SECURITY;/.test(MIG) && /REVOKE ALL ON TABLE public\.prompt_templates FROM PUBLIC, anon, authenticated;/.test(MIG)
    && /GRANT SELECT ON TABLE public\.prompt_templates TO authenticated;/.test(MIG) && /FOR SELECT TO authenticated USING \(public\.fn_jwt_is_admin\(\)\)/.test(MIG), 'prompt_templates RLS / grants');
  assert(/uq_prompt_templates_one_active/.test(MIG) && /uq_learning_documents_node_lesson/.test(MIG) && /chk_learning_documents_owner/.test(MIG) && /chk_intake_session_contract/.test(MIG), 'constraints');
  const rb = read('docs/database/rollback/119_rollback.sql');
  const m116 = read('supabase/migrations/20261027000116_ca2_syllabus_intake.sql');
  const m117 = read('supabase/migrations/20261027000117_ca3_lesson_blocks.sql');
  const body = (src, name, end = '$fn$;') => { const a = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`); return src.slice(a, src.indexOf(end, a) + end.length); };
  for (const [src, n, end] of [[m116, 'fn_syllabus_intake_create'], [m116, 'fn_syllabus_intake_import'], [m117, 'fn_lesson_save_draft'], [m117, 'fn_lesson_publish'], [m117, 'fn_prevent_published_version_mutation', '$function$;']])
    assert(rb.includes(body(src, n, end)), `rollback: ${n} is not the exact original`);
  assert(/^BEGIN;/m.test(rb) && /^COMMIT;/m.test(rb) && /ROLLBACK 119: node lessons exist/.test(rb), 'rollback transaction + refusals');
  return `${fns.length} function definitions`;
});

test('S-01 admin only: nav + routes, page guards, actions guarded first, client screens import no server module, the checklist gates publishing', () => {
  const nav = read('lib/admin/nav.ts');
  for (const r of ['/admin/prompts', '/admin/lessons/generate', '/admin/lessons/[id]/translate']) assert(nav.includes(`  "${r}",`), `ADMIN_ONLY_ROUTES: ${r}`);
  assert(/\{ label: "Lesson generator", href: "\/admin\/lessons\/generate", icon: "learning", access: "admin" \}/.test(nav) && /\{ label: "Prompt templates", href: "\/admin\/prompts", icon: "learning", access: "admin" \}/.test(nav), 'nav');
  for (const f of ['app/admin/prompts/page.tsx', 'app/admin/lessons/generate/page.tsx', 'app/admin/lessons/[id]/translate/page.tsx']) {
    const s = read(f);
    assert(/await requireAdminPage\(\{ path: [^}]*\}\)/.test(s) && !/allowStaff/.test(s), `${f}: admin page guard`);
  }
  for (const [f, n] of [['app/admin/prompts/actions.ts', 2], ['app/admin/lessons/actions.ts', 7 /* + CA-7 launch, exam note draft / publish */]]) {
    const fns = read(f).split(/export async function /).slice(1);
    assert(fns.length === n, `${f}: ${fns.length} actions`);
    for (const x of fns) {
      const at = x.indexOf('const __auth = await guardAdminAction()');
      const b = x.lastIndexOf('{\n', at);
      assert(at > 0 && b > 0 && x.slice(b + 2, at).trim() === '' && !/allowStaff/.test(x), `${f}: not guarded first: ${x.slice(0, 40)}`);
    }
  }
  const pub = read('app/admin/lessons/actions.ts');
  assert(/publishChecklist\(versionId\)[\s\S]{0,200}checklistPasses\(checklist\)[\s\S]{0,300}code: "CHECKLIST"[\s\S]{0,200}LessonAdminService\.publish\(versionId\)/.test(pub), 'the checklist gate runs before publish');
  for (const [f, ms] of [['services/prompts/prompt-template.service.ts', ['getActiveBody', 'list', 'saveDraft', 'activate']], ['services/lessons/lesson-authoring.service.ts', ['listNodes', 'generator', 'saveGeneratedDraft', 'translation', 'saveTranslationDraft', 'publishChecklist']]]) {
    const s = read(f);
    for (const m of ms) {
      const at = s.indexOf(`static async ${m}(`);
      assert(at > 0 && /const c = await ctx\(\);\s*if \(!c\b[^\n]*\) return (?:fail\("UNAUTHORIZED"|null)/.test(s.slice(at, at + 500)), `${f}: ${m} guard`);
    }
  }
  for (const f of ['components/admin/prompts/prompt-templates-editor.tsx', 'components/admin/lessons/lesson-generator.tsx', 'components/admin/lessons/lesson-translation.tsx']) {
    const s = read(f);
    assert(/^"use client";/.test(s) && !/@\/services\/|@\/lib\/supabase/.test(s), `${f} imports a server module`);
  }
  return '3 pages · 6 actions';
});

test('U-01 screens: one primary per header, labelled controls, #85 markers, EN | HI side by side', () => {
  for (const f of ['components/admin/prompts/prompt-templates-editor.tsx', 'components/admin/lessons/lesson-generator.tsx', 'components/admin/lessons/lesson-translation.tsx']) {
    const s = read(f);
    const at = s.indexOf('<StudioPageHeader', s.lastIndexOf('return (', s.indexOf('<StudioPageHeader', s.indexOf('const errors') > 0 ? s.indexOf('const errors') : 0)));
    const header = s.slice(at, s.indexOf('/>\n', s.indexOf('actions=', at) > 0 ? s.indexOf('actions=', at) : at));
    assert((header.match(/studioPrimaryAction/g) || []).length === 1, `${f}: one primary in the header (${(header.match(/studioPrimaryAction/g) || []).length})`);
    const ids = [...s.matchAll(/<(?:select|input|textarea)\s+id="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert(s.includes(`htmlFor="${id}"`), `${f}: no label for #${id}`);
    assert(!/[ऀ-ॿ]/.test(s) && !/window\.confirm|alert\(/.test(s), `${f}: Devanagari / browser dialog`);
  }
  const t = read('components/admin/lessons/lesson-translation.tsx');
  assert(/id="tr-paste"\s+lang="hi"\s+data-content-field="lesson-translation-json"/.test(t), 'the translation paste is a marked content field');
  assert(/<div lang="hi" data-content-display="lesson-translation-block">/.test(t) && /md:grid-cols-2/.test(t) && /\{i \+ 1\}\. \{b\.id\} · \{b\.type\} · EN/.test(t), 'EN | HI side by side, HI in a marked display');
  return 'prompts · generator · translation';
});

test('R-01 reader: node lessons roll up to their topic; Hindi when published (outdated label) else English + "Hindi coming soon"', () => {
  const r = read('services/learning/learning-resolver.service.ts');
  for (const x of ["'NODE_LESSON'", 'isServableNodeRow', 'topicsOf', 'servableNodeLessons', "userContentLanguage()", "'HI_OUTDATED'", "'HI_COMING_SOON'", ".eq('language', 'hi')", ".eq('is_current', true)", "hi.translated_from_version_id === ver.id ? 'HI' : 'HI_OUTDATED'"])
    assert(r.includes(x), `resolver: ${x}`);
  assert(/if \(!doc\.is_locked && ver\?\.id\)/.test(r), 'bodies only for unlocked viewers');
  const page = read('app/articles/[slug]/page.tsx');
  assert(/Hindi coming soon\. This lesson is shown in English for now\./.test(page) && /<div lang=\{article\.lessonLanguage\}>/.test(page) && /NODE_LESSON: "Lesson"/.test(page), 'article page');
  return 'resolver + article';
});

console.log(`\nCA4-LESSONS offline: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
