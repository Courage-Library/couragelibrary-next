#!/usr/bin/env node
/**
 * CA-6 QA fixture: ONE published node lesson for the QA topic of qa-number-system-concept-lesson ("Number System") —
 * the evidence for the master lesson page, the exam-topic page, the SEO live gate and LESSON-PERF (architect GO: "a real
 * or QA published lesson"). Idempotent: an already published QA lesson is left as is. Written through the audited RPCs
 * (fn_lesson_create_node_document → fn_lesson_save_draft → fn_lesson_publish; actor ca6-qa-fixture@…). The content is a
 * short but correct divisibility lesson that passes the completeness checklist; the title says it is a QA lesson.
 *   --dry-run   everything inside ONE rolled-back transaction (the first run of a new writer is non-writing)
 * LIVE-LOCK-SAFETY: safeBegin (3 s / 60 s / 30 s).
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
const { validateLesson } = require(path.join(ROOT, 'lib/lessons/blocks.ts'));
const { lessonChecklist, checklistPasses } = require(path.join(ROOT, 'lib/lessons/completeness.ts'));

const DRY = process.argv.includes('--dry-run');
const ACTOR = 'ca6-qa-fixture@courage-library.test';

const digitSum = (n) => String(n).split('').reduce((a, d) => a + Number(d), 0);
const altDiff = (n) => {
  const d = String(n).split('').reverse().map(Number);
  const odd = d.filter((_, i) => i % 2 === 0).reduce((a, x) => a + x, 0);
  const even = d.filter((_, i) => i % 2 === 1).reduce((a, x) => a + x, 0);
  return [odd, even];
};

function lesson(topicId) {
  const ex = [];
  const add = (difficulty, q, steps, answer, shortcut) => ex.push({ id: `ex-${ex.length + 1}`, type: 'solved_example', difficulty, question: q, steps, answer, ...(shortcut ? { shortcut } : {}) });
  for (const n of [114, 4518, 7425]) { const s = digitSum(n); add('EASY', `Is ${n} divisible by 3?`, [{ text: `Add the digits: ${String(n).split('').join(' + ')} = ${s}.` }, { text: `${s} ${s % 3 === 0 ? 'is' : 'is not'} divisible by 3.` }], s % 3 === 0 ? 'Yes' : 'No', 'Only the digit sum matters.'); }
  for (const n of [5832, 98361, 123453]) { const s = digitSum(n); add('MEDIUM', `Is ${n} divisible by 9?`, [{ text: `Digit sum = ${s}.` }, { text: `${s} ${s % 9 === 0 ? 'is' : 'is not'} divisible by 9.` }], s % 9 === 0 ? 'Yes' : 'No'); }
  add('MEDIUM', 'Is 3,716 divisible by 4?', [{ text: 'Look at the last two digits only: 16.' }, { text: '16 is divisible by 4, so 3,716 is divisible by 4.' }], 'Yes', 'Last two digits for 4.');
  for (const n of [1452, 918082, 70587]) { const [o, e] = altDiff(n); add('HARD', `Is ${n} divisible by 11?`, [{ text: `Sum of the digits in odd places from the right = ${o}; in even places = ${e}.`, math: `${o} - ${e} = ${o - e}` }, { text: `The difference ${o - e} ${(o - e) % 11 === 0 ? 'is' : 'is not'} 0 or a multiple of 11.` }], (o - e) % 11 === 0 ? 'Yes' : 'No', 'Alternate-digit difference.'); }
  const qc = (i, prompt, opts) => ({ id: `qc-${i}`, type: 'quick_check', prompt, options: opts.map(([t, c], j) => ({ id: `o${j + 1}`, text: t, correct: c })) });
  const blocks = [
    { id: 'intro-h', type: 'heading', level: 2, text: 'Divisibility rules' },
    { id: 'intro', type: 'paragraph', text: 'A divisibility rule tells you whether a number divides another **without long division**. In exams it saves time in simplification, factor and remainder questions.' },
    { id: 'rules', type: 'list', ordered: false, items: ['**3**: the digit sum is divisible by 3.', '**9**: the digit sum is divisible by 9.', '**4**: the number formed by the last two digits is divisible by 4.', '**11**: the difference between the sums of alternate digits is 0 or a multiple of 11.'] },
    { id: 'f-11', type: 'formula', name: 'Rule for 11', latex: 'S_{odd} - S_{even} \\equiv 0 \\pmod{11}', reading: 'the sum of the odd-place digits minus the sum of the even-place digits is a multiple of 11' },
    { id: 'examples-h', type: 'heading', level: 2, text: 'Solved examples' },
    ...ex,
    { id: 'tip', type: 'callout', variant: 'TIP', title: 'Shortcut', text: 'For 9, keep adding the digits until one digit is left: the number is divisible by 9 only when that digit is 9.' },
    { id: 'traps-h', type: 'heading', level: 2, text: 'Common traps' },
    { id: 'trap-1', type: 'trap', kind: 'FORMULA_CONFUSION', text: 'Using the digit sum for 11.', why: 'The rule for 11 uses the alternate-digit difference, not the digit sum.' },
    { id: 'trap-2', type: 'trap', kind: 'MISREAD_KEYWORD', text: 'Checking only the last digit for 4.', why: 'For 4 you need the last two digits.' },
    { id: 'checks-h', type: 'heading', level: 2, text: 'Quick check' },
    qc(1, 'Which rule decides divisibility by 9?', [['Digit sum divisible by 9', true], ['Last digit is 9', false]]),
    qc(2, 'Is 1,452 divisible by 11?', [['Yes', true], ['No', false]]),
    qc(3, 'Which digits decide divisibility by 4?', [['The last two digits', true], ['The first two digits', false]]),
    qc(4, 'The digit sum of 7,425 is…', [['18', true], ['17', false]]),
    qc(5, 'Is 3,716 divisible by 4?', [['Yes', true], ['No', false]]),
    { id: 'practice', type: 'practice_link', node_id: topicId, mode: 'PRACTICE', label: 'Practice Number System' },
    { id: 'summary', type: 'revision_summary', bullets: ['3 and 9: digit sum.', '4: last two digits.', '11: alternate-digit difference.'], formulas: ['S_{odd} - S_{even} \\equiv 0 \\pmod{11}'], speed_rules: ['Check the digit sum first.'] },
    { id: 'memory', type: 'memory_lock_points', points: ['3 and 9: digit sum', '4: last two digits', '11: alternate-digit difference'] },
  ];
  return { meta: { title: 'QA – Number System: Divisibility (test lesson)', summary: 'QA test lesson: the divisibility rules for 3, 9, 4 and 11, with solved examples.', estimated_minutes: 12 }, blocks };
}

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  const c = new Client(target.pg);
  c.on('error', () => {});
  await c.connect();
  try {
    await safeBegin(c, { readOnly: false });
    const [qa] = (await c.query(`select u.topic_id from public.learning_documents d join public.learning_units u on u.id = d.learning_unit_id where d.canonical_slug = 'qa-number-system-concept-lesson'`)).rows;
    if (!qa) throw new Error('QA topic missing');
    const L = lesson(qa.topic_id);
    const v = validateLesson(L.meta, L.blocks);
    if (!v.ok) throw new Error(`invalid lesson: ${JSON.stringify(v.errors.slice(0, 3))}`);
    const list = lessonChecklist(v.blocks, 'APTITUDE');
    if (!checklistPasses(list)) throw new Error(`checklist: ${list.filter((i) => !i.ok && i.severity === 'error').map((i) => i.key).join(',')}`);
    const [existing] = (await c.query(`select d.id, d.status from public.learning_documents d where d.document_type = 'NODE_LESSON' and d.node_id = $1`, [qa.topic_id])).rows;
    if (existing && existing.status === 'PUBLISHED') {
      console.log('QA lesson already published — nothing to do');
      await c.query('ROLLBACK');
      return;
    }
    await c.query(`set local role service_role`);
    const doc = (await c.query(`select public.fn_lesson_create_node_document($1, 'FREE', null, $2) r`, [qa.topic_id, ACTOR])).rows[0].r;
    const saved = (await c.query(`select public.fn_lesson_save_draft($1, 'en', $2::jsonb, $3::jsonb, 'HUMAN', null, $4) r`, [doc.document_id, JSON.stringify(L.meta), JSON.stringify(L.blocks), ACTOR])).rows[0].r;
    await c.query(`select public.fn_lesson_publish($1, null, $2)`, [saved.version_id, ACTOR]);
    const [chk] = (await c.query(`select d.status, d.canonical_slug, n.hierarchy_path from public.learning_documents d join public.canonical_taxonomy_nodes n on n.id = d.node_id where d.id = $1`, [doc.document_id])).rows;
    await c.query(DRY ? 'ROLLBACK' : 'COMMIT');
    console.log(`${DRY ? 'DRY-RUN (rolled back)' : 'COMMITTED'}: QA lesson ${chk.status} — /learn/${chk.hierarchy_path.split('.').join('/')} (${v.blocks.length} blocks, checklist passes)`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.log(`FAILED — ${red(String(e.message)).slice(0, 300)}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
})();
