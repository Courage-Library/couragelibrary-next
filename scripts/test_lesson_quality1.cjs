#!/usr/bin/env node
/**
 * LESSON-PROMPT-QUALITY-1 (architect 2026-10-30) — offline gate. The owner's first real lesson passed every check but
 * had quality gaps; master lessons are now EXAM-NEUTRAL (exam-specific content → exam notes).
 *   Q-1 LESSON v4 = v3 + the rulings (sha256 pinned, a valid LESSON template, no new placeholder); the exam-specific v3
 *       wording is gone ("EXAM QUESTION FORMAT", "how each exam", "(asked in <exam>)", "Exam strategy", "time budget");
 *       v3 untouched; the install script is audited, has a dry-run and states DEPLOY-BEFORE-ACTIVATE
 *   Q-2 render bug B: the parts line uses the MUST COVER outline when the node has no child nodes ("none listed" only
 *       when there is neither); child nodes still win
 *   Q-3 answer_in_options: an answer that is one of the question's options passes (letter or text); one that is not →
 *       warning with the example id; an example without listed options is not judged
 *   Q-4 mistake_names_option: a mistake naming no option → warning; naming "(b)" or the option text passes
 *   Q-5 word_bank: a vocabulary topic (antonyms …) with < 100 table rows → warning, ≥ 100 passes; a non-vocabulary topic
 *       gets no word-bank item
 *   Q-6 exam_neutral: an exam / tier / 4-digit year in the title, summary or a heading → warning naming the place;
 *       negative controls: the same words in a paragraph are not judged; "general" / "Mainstream" are not "GD" / "Mains"
 *   Q-7 the quality items are WARNINGS: they never make the checklist fail (draft + publish unaffected)
 *   Q-8 every shipped example lesson is clean (no quality warning) and the old 3-argument checklist is unchanged
 *   Q-9 wiring: the save, the publish gate and the paste UI pass the quality context; the exam-topic page's <title> and
 *       H1 = "<Topic> for <Exam>: Rules, Examples & Practice" (self-canonical, unchanged)
 * Run: node scripts/test_lesson_quality1.cjs
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
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 700)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

// LESSON template v4 (lib/prompts/lesson-template-v4.ts) — any edit is a new audited version, never a silent change
const V4_SHA = 'c08956bc12b5e9d9ceeaa7f9d06f3e9dc3c8e123e562a36f2bbba050f14852dc';
const V3_SHA = '9cb1c44ec418eb5a7f137470b5d7145dc81115f104fcc48b07ddf4b45d807e23';
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const L = require(path.join(ROOT, 'lib/prompts/lesson-prompt.ts'));
const X = require(path.join(ROOT, 'lib/prompts/lesson-examples.ts'));
const T = require(path.join(ROOT, 'lib/prompts/template.ts'));
const C = require(path.join(ROOT, 'lib/lessons/completeness.ts'));
const QL = require(path.join(ROOT, 'lib/lessons/quality.ts'));
const V3 = require(path.join(ROOT, 'lib/prompts/lesson-template-v3.ts')).LESSON_TEMPLATE_V3;
const V4 = require(path.join(ROOT, 'lib/prompts/lesson-template-v4.ts')).LESSON_TEMPLATE_V4;
const NODE = '11111111-1111-4111-8111-111111111111';

const ex = (id, question, answer, mistake) => ({ id, type: 'solved_example', difficulty: 'EASY', question, steps: [{ text: 'a' }, { text: 'b' }], answer, ...(mistake ? { mistake } : {}) });
const item = (items, key) => items.find((i) => i.key === key);

test('Q-1 LESSON v4 = v3 + the rulings: pinned, valid, no new placeholder; the exam-specific v3 wording is gone; v3 untouched; audited install with dry-run + DEPLOY-BEFORE-ACTIVATE', () => {
  assert(sha(V3) === V3_SHA, 'LESSON v3 changed');
  assert(sha(V4) === V4_SHA, `LESSON v4 sha256 ${sha(V4)} (pinned ${V4_SHA})`);
  assert(T.templateProblems('LESSON', V4).length === 0, `v4 template problems: ${T.templateProblems('LESSON', V4)}`);
  assert(JSON.stringify(T.templateSlots(V4).sort()) === JSON.stringify(T.templateSlots(V3).sort()), 'v4 uses a different placeholder set than v3');
  for (const want of ['used ONLY to set the depth', 'EXAM-NEUTRAL', 'competitive exams such as SSC, Banking and Railways', 'belong in\nthe separate exam notes', 'Difficulty calibration', 'How exams ask this topic', '(practice format)', 'WORD BANK of\n     120–150', 'at most 30 rows', 'undisputed entries', '"answer" = the correct option exactly as it\n   appears in the question', 'naming that wrong option from the question', 'Solving strategy', 'never invent ids'.replace('never', 'Never')])
    assert(V4.includes(want), `v4 lacks: ${want}`);
  for (const gone of ['EXAM QUESTION FORMAT', 'how each exam above actually asks', '(asked in <exam>)', '11. Exam strategy', 'time budget'])
    assert(!V4.includes(gone), `v4 still has: ${gone}`);
  const inst = read('scripts/content/lesson-prompt-4.cjs');
  assert(/fn_prompt_template_save_draft\('LESSON'/.test(inst) && /fn_prompt_template_activate/.test(inst) && /--dry-run/.test(inst) && /DEPLOY-BEFORE-ACTIVATE/.test(inst) && /LESSON_TEMPLATE_V4/.test(inst) && !/update public\.prompt_templates/i.test(inst), 'install script');
  return `v4 sha256 ${V4_SHA.slice(0, 12)}…`;
});

test('Q-2 render bug B: the parts line uses the MUST COVER outline when there are no child nodes; child nodes win; "none listed" only when neither', () => {
  const ctx = { nodeId: NODE, nodeName: 'Opposite Word Meaning', nodePath: 'English › Antonyms › Opposite Word Meaning', nodeLevel: 'SUBTOPIC', subjectName: 'English', subjectType: 'LANGUAGE', coverage: [], childNodes: [], aliases: [], existingLessons: [] };
  const outline = L.lessonPromptValues({ ...ctx, mustCover: ['Direct antonyms', 'Prefix antonyms', 'Context antonyms'] });
  assert(outline.CHILDREN.startsWith('Direct antonyms, Prefix antonyms, Context antonyms') && /MUST COVER/.test(outline.CHILDREN) && outline.CHILD_NODES.includes('- Prefix antonyms'), outline.CHILDREN);
  assert(L.lessonPromptValues({ ...ctx, childNodes: ['Child A'], mustCover: ['x'] }).CHILDREN === 'Child A', 'child nodes must win');
  assert(L.lessonPromptValues(ctx).CHILDREN === 'none listed', 'neither → none listed');
  const rendered = T.renderTemplate('LESSON', V4, L.lessonPromptValues({ ...ctx, mustCover: ['Direct antonyms'] }));
  assert(/Parts below this node \(cover ALL of them inside this lesson\): Direct antonyms/.test(rendered) && !/: none listed/.test(rendered), 'rendered v4 parts line');
});

test('Q-3 answer_in_options: the answer must be one of the question\'s options (letter or text); no listed options → not judged', () => {
  const q = 'Select the most appropriate ANTONYM of the given word. HAPPY (a) glad (b) cheerful (c) sad (d) merry';
  const good = C.lessonChecklist([ex('e1', q, '(c) sad'), ex('e2', q, 'sad'), ex('e3', 'Find 10% of 50.', '5')], 'LANGUAGE', undefined, {});
  assert(item(good, 'answer_in_options').ok, JSON.stringify(item(good, 'answer_in_options')));
  const bad = C.lessonChecklist([ex('e1', q, 'unhappy')], 'LANGUAGE', undefined, {});
  const w = item(bad, 'answer_in_options');
  assert(!w.ok && w.severity === 'warning' && /e1/.test(w.detail), JSON.stringify(w));
  assert(QL.questionOptions(q).map((o) => `${o.key}:${o.text}`).join('|') === 'a:glad|b:cheerful|c:sad|d:merry', JSON.stringify(QL.questionOptions(q)));
});

test('Q-4 mistake_names_option: a mistake that names no option → warning; "(b)" or the option text passes', () => {
  const q = 'Select the most appropriate ANTONYM of the given word. HAPPY (a) glad (b) cheerful (c) sad (d) merry';
  const ok = C.lessonChecklist([ex('e1', q, '(c) sad', 'Choosing (b) because it sounds positive.'), ex('e2', q, '(c) sad', 'Picking merry, a synonym.')], 'LANGUAGE', undefined, {});
  assert(item(ok, 'mistake_names_option').ok, JSON.stringify(item(ok, 'mistake_names_option')));
  const bad = C.lessonChecklist([ex('e9', q, '(c) sad', 'Students confuse the meaning.')], 'LANGUAGE', undefined, {});
  assert(!item(bad, 'mistake_names_option').ok && /e9/.test(item(bad, 'mistake_names_option').detail), JSON.stringify(item(bad, 'mistake_names_option')));
});

test('Q-5 word_bank: a vocabulary topic needs ≥ 100 table rows (warning below); a non-vocabulary topic gets no item', () => {
  const table = (n) => ({ id: `t${n}`, type: 'table', headers: ['Word', 'Antonym'], rows: Array.from({ length: n }, (_, i) => [`w${i}`, `a${i}`]) });
  const vocab = { nodeName: 'Opposite Word Meaning', nodePath: 'English Language › Antonyms › Opposite Word Meaning' };
  const few = item(C.lessonChecklist([table(30), table(30), table(30)], 'LANGUAGE', undefined, vocab), 'word_bank');
  assert(few && !few.ok && few.severity === 'warning' && /90 table row/.test(few.detail), JSON.stringify(few));
  assert(item(C.lessonChecklist([table(30), table(30), table(30), table(30), table(5)], 'LANGUAGE', undefined, vocab), 'word_bank').ok, '125 rows should pass');
  for (const n of ['Synonyms', 'One Word Substitution', 'Idioms and Phrases', 'Spelling Correction']) assert(QL.isVocabularyTopic({ nodeName: n }), n);
  assert(!item(C.lessonChecklist([table(3)], 'APTITUDE', undefined, { nodeName: 'Percentage', nodePath: 'Quantitative Aptitude › Percentage' }), 'word_bank'), 'non-vocabulary topic got a word-bank item');
});

test('Q-6 exam_neutral: exam / tier / year in the title, summary or a heading → warning naming the place; paragraphs not judged; no false "GD" / "Mains"', () => {
  const blocks = [{ id: 'h1', type: 'heading', level: 2, text: 'How SSC CGL Tier 1 asks antonyms' }, { id: 'p1', type: 'paragraph', text: 'Asked in SSC CGL 2024 and IBPS PO.' }];
  const w = item(C.lessonChecklist(blocks, 'LANGUAGE', undefined, { meta: { title: 'Antonyms for SSC CHSL 2025', summary: 'Practice.' }, examNames: ['SSC CGL'] }), 'exam_neutral');
  assert(!w.ok && /title: SSC/.test(w.detail) && /title: 2025/.test(w.detail) && /heading "h1": (SSC|CGL|Tier 1)/.test(w.detail) && !/p1/.test(w.detail), w.detail);
  const clean = item(C.lessonChecklist([{ id: 'h2', type: 'heading', level: 2, text: 'General rules and mainstream question types' }, ...blocks.slice(1)], 'LANGUAGE', undefined, { meta: { title: 'Antonyms: Rules, Examples and Practice', summary: 'How competitive exams such as SSC, Banking and Railways ask antonyms.' } }), 'exam_neutral');
  assert(!clean.ok && /summary: SSC/.test(clean.detail), 'the generic family phrase in the SUMMARY is still flagged (the rule: no exam name in title / summary / headings)');
  const neutral = item(C.lessonChecklist([{ id: 'h2', type: 'heading', level: 2, text: 'General rules and mainstream question types' }], 'LANGUAGE', undefined, { meta: { title: 'Antonyms: Rules, Examples and Practice', summary: 'Opposite meanings, word by word.' } }), 'exam_neutral');
  assert(neutral.ok, `false positive: ${neutral.detail}`);
});

test('Q-7 the quality items are WARNINGS: a lesson failing only them still passes the checklist', () => {
  const q = 'Select the ANTONYM. HAPPY (a) glad (b) cheerful (c) sad (d) merry';
  const ex0 = JSON.parse(JSON.stringify(X.lessonExampleFor('LANGUAGE', NODE)));
  const base = C.lessonChecklist(ex0.blocks, 'LANGUAGE', { minExamples: 1, maxExamples: 30, quickChecks: 1 });
  const withBad = C.lessonChecklist([...ex0.blocks, ex('bad', q, 'unhappy', 'confusion')], 'LANGUAGE', { minExamples: 1, maxExamples: 30, quickChecks: 1 }, { meta: { title: 'Antonyms for SSC 2025' }, nodeName: 'Antonyms' });
  const qualityKeys = ['answer_in_options', 'mistake_names_option', 'word_bank', 'exam_neutral'];
  assert(withBad.filter((i) => qualityKeys.includes(i.key)).every((i) => i.severity === 'warning'), 'a quality item is not a warning');
  assert(withBad.filter((i) => qualityKeys.includes(i.key) && !i.ok).length >= 3, 'expected failing quality warnings');
  assert(C.checklistPasses(base) === C.checklistPasses(withBad.filter((i) => !qualityKeys.includes(i.key))) , 'non-quality items changed');
  const errorsOnly = (xs) => xs.filter((i) => i.severity === 'error' && !i.ok).map((i) => i.key).join();
  assert(errorsOnly(withBad) === errorsOnly(base), `the quality context changed an ERROR item: ${errorsOnly(withBad)} vs ${errorsOnly(base)}`);
});

test('Q-8 the shipped example lessons are clean; the 3-argument checklist (no context) is unchanged', () => {
  const all = [L.lessonExample(NODE), ...X.EXAMPLE_SUBJECT_TYPES.map((t) => X.lessonExampleFor(t, NODE))];
  for (const [i, e] of all.entries()) {
    const w = QL.lessonQualityWarnings(e.blocks, { meta: e.meta, nodeName: 'Topic', nodePath: 'Subject › Topic' }).filter((x) => !x.ok);
    assert(w.length === 0, `example ${i}: ${JSON.stringify(w)}`);
  }
  const keys = C.lessonChecklist(all[0].blocks, 'APTITUDE').map((i) => i.key);
  assert(!keys.some((k) => ['answer_in_options', 'mistake_names_option', 'word_bank', 'exam_neutral'].includes(k)), 'quality items appeared without a context');
  return `${all.length} examples`;
});

test('Q-9 wiring: save + publish gate + paste UI pass the quality context; exam-topic <title> / H1 = "<Topic> for <Exam>: Rules, Examples & Practice" (self-canonical)', () => {
  const svc = read('services/lessons/lesson-authoring.service.ts');
  assert((svc.match(/lessonChecklist\([^;]*\{\s*meta: parsed\.meta,\s*nodeName: [^}]*examNames: coverage\.map\(\(x\) => x\.exam\)/g) || []).length === 2, 'service: save + publish gate');
  const ui = read('components/admin/lessons/lesson-generator.tsx');
  assert(/lessonChecklist\(result\.blocks, generator\?\.context\.subjectType \?\? null, generator\?\.size, \{\s*meta: result\.meta/.test(ui), 'paste UI');
  const page = read('app/exams/[slug]/[moduleSlug]/[...rest]/page.tsx');
  assert(/const examTopicTitle = \(topic: string, exam: string\) => `\$\{topic\} for \$\{exam\}: Rules, Examples & Practice`;/.test(page)
    && /title: examTopicTitle\(d\.node\.name, d\.exam\.title\)/.test(page) && /\{examTopicTitle\(d\.node\.name, d\.exam\.title\)\}\s*<\/h1>/.test(page) && /canonicalUrl: d\.path/.test(page), 'exam-topic title / H1 / canonical');
});

console.log(`\nLESSON-PROMPT-QUALITY-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
