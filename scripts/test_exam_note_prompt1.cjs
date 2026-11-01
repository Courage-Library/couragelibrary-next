#!/usr/bin/env node
/**
 * EXAM-NOTE-PROMPT-1 (migration 127) — offline gate.
 *   N-1 TS ↔ SQL parity: TEMPLATE_PLACEHOLDERS.EXAM_NOTE (allowed / required) = the migration's EXAM_NOTE branch; the
 *       type is in TEMPLATE_TYPES, the CHECK and save_draft's list; the other branches are the live bodies unchanged
 *   N-2 the code v1 passes the checker, renders with no slot left, keeps the no-invention rules; negative controls: a body
 *       without {{EXAM_LINES}} / with a LESSON-only slot is refused
 *   N-3 migration hygiene: no BEGIN / COMMIT, NO EXAM_NOTE seed (DEPLOY-BEFORE-ACTIVATE), proof block; rollback restores
 *       the pre-127 bodies (md5 proof) and deletes EXAM_NOTE rows first; LF only
 *   N-4 "Copy prompt": admin-only action; the service keeps ONLY this exam's syllabus lines; the editor catches a failed
 *       call (inline message); the code v1 is the fallback until a DB version is active; the prompts editor labels the type
 * Run: node scripts/test_exam_note_prompt1.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) { return origResolve.call(this, r.startsWith('@/') ? path.join(ROOT, r.slice(2)) : r, ...rest); };
require.extensions['.ts'] = (m, fn) => m._compile(ts.transpileModule(fs.readFileSync(fn, 'utf8'), { fileName: fn, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, fn);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { const info = fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

const MIG = 'supabase/migrations/20261031000127_exam_note_template.sql';
const RB = 'docs/database/rollback/127_rollback.sql';
const T = require(path.join(ROOT, 'lib/prompts/template.ts'));
const E = require(path.join(ROOT, 'lib/prompts/exam-note-prompt.ts'));
const sqlArray = (src, label) => {
  const m = new RegExp(`WHEN 'EXAM_NOTE' THEN[\\s\\S]*?${label} := ARRAY\\[([^\\]]*)\\]`).exec(src);
  return m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) : null;
};

test('N-1 TS ↔ SQL parity for EXAM_NOTE; type in TEMPLATE_TYPES / CHECK / save_draft; other branches = the live bodies', () => {
  const sql = read(MIG);
  const spec = T.TEMPLATE_PLACEHOLDERS.EXAM_NOTE;
  assert(T.TEMPLATE_TYPES.includes('EXAM_NOTE'), 'TEMPLATE_TYPES');
  const allowed = sqlArray(sql, 'v_allowed');
  const required = sqlArray(sql, 'v_required');
  assert(allowed && allowed.join() === [...spec.allowed].join() && required && required.join() === [...spec.required].join(), `parity: SQL ${allowed} / ${required} vs TS ${spec.allowed} / ${spec.required}`);
  assert(/ARRAY\['SYLLABUS'::text, 'LESSON'::text, 'QUESTION'::text, 'TRANSLATE_HI'::text, 'EXAM_NOTE'::text\]/.test(sql) && /p_type NOT IN \('SYLLABUS', 'LESSON', 'QUESTION', 'TRANSLATE_HI', 'EXAM_NOTE'\)/.test(sql), 'CHECK / save_draft list');
  // the migration body = the pre-127 body (from the rollback) + exactly the EXAM_NOTE additions
  const fn = (src, name) => { const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`); return src.slice(i, src.indexOf('$function$', src.indexOf('$function$', i) + 10) + 10); };
  const rb = read(RB);
  const newProblems = fn(sql, 'fn_prompt_template_problems').replace(/        WHEN 'EXAM_NOTE' THEN\n[\s\S]*?(?=        ELSE\n)/, '');
  assert(newProblems === fn(rb, 'fn_prompt_template_problems'), 'fn_prompt_template_problems: changed beyond the EXAM_NOTE branch');
  assert(fn(sql, 'fn_prompt_template_save_draft').replace(", 'EXAM_NOTE')", ')') === fn(rb, 'fn_prompt_template_save_draft'), 'fn_prompt_template_save_draft: changed beyond the type list');
  return `${allowed.length} allowed / ${required.length} required`;
});

test('N-2 the code v1 passes the checker and renders fully; no-invention rules kept; negative controls refused', () => {
  const v1 = E.EXAM_NOTE_TEMPLATE_V1;
  assert(T.templateProblems('EXAM_NOTE', v1).length === 0, `v1 problems: ${T.templateProblems('EXAM_NOTE', v1)}`);
  const vals = E.examNotePromptValues({ examName: 'SSC CGL', examSlug: 'ssc-cgl', nodeName: 'Percentage', nodePath: 'Quantitative Aptitude › Percentage', nodeLevel: 'TOPIC', subjectName: 'Quantitative Aptitude', coverage: [], masterLesson: null });
  const out = T.renderTemplate('EXAM_NOTE', v1, vals);
  assert(!/\{\{[#/]?[A-Za-z_]+\}\}/.test(out) && /not in a published SSC CGL syllabus yet/.test(out), 'render');
  assert(/Do not invent years, past-paper claims/.test(v1) && /never claim a question appeared in a past paper/.test(v1) && /"contract": "EXAM_NOTE v1"/.test(v1), 'no-invention rules / contract');
  assert(T.templateProblems('EXAM_NOTE', v1.split('{{EXAM_LINES}}').join('')).some((p) => /EXAM_LINES/.test(p)), 'negative control: missing EXAM_LINES not refused');
  assert(T.templateProblems('EXAM_NOTE', v1 + ' {{CHILD_NODES}}').some((p) => /Unknown placeholder \{\{CHILD_NODES\}\}/.test(p)), 'negative control: a LESSON-only slot not refused');
  return `${v1.length} chars; rendered ${out.length}`;
});

test('N-3 migration hygiene (no BEGIN / COMMIT, no seed, proof); rollback restores the pre-127 bodies (md5) after deleting EXAM_NOTE rows; LF', () => {
  const sql = read(MIG);
  const rb = read(RB);
  const code = sql.replace(/--[^\n]*/g, '');
  assert(!/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(code), 'transaction control in the migration');
  const top = code.replace(/\$function\$[\s\S]*?\$function\$/g, '').replace(/\$proof\$[\s\S]*?\$proof\$/g, ''); // statements outside function bodies / the proof
  assert(!/INSERT INTO public\.prompt_templates/i.test(top) && !/(?<!FUNCTION public\.)fn_prompt_template_(save_draft|activate)\s*\(/.test(top), 'the migration seeds / activates a template (DEPLOY-BEFORE-ACTIVATE)');
  assert(/(?<!FUNCTION public\.)fn_prompt_template_(save_draft|activate)\s*\(/.test("SELECT public.fn_prompt_template_save_draft('EXAM_NOTE', 'x', null, null, 'a');"), 'negative control: a seeding call was not detected');
  assert(/DO \$proof\$/.test(sql) && /EXAM_NOTE_PROOF/.test(sql) && /126 is not applied/.test(sql), 'proof / preflight');
  assert(/^DELETE FROM public\.prompt_templates WHERE template_type = 'EXAM_NOTE';/m.test(rb) && /'f98a6470f96d5b5a3165a1bd22fe341c'/.test(rb) && /'ecf297abebcb8b546bbe1b491857c882'/.test(rb), 'rollback: delete first + md5 proof');
  assert(!/\r/.test(sql) && !/\r/.test(rb), 'CRLF');
});

test('N-4 Copy prompt: admin-only action; only THIS exam\'s lines; editor catches failures; code v1 fallback; type label', () => {
  const act = read('app/(site)/admin/lessons/actions.ts');
  assert(/export async function examNotePromptAction\(examId: string, nodeId: string\) \{\n  const __auth = await guardAdminAction\(\)/.test(act), 'action: admin only, guard first');
  const svc = read('services/lessons/lesson-authoring.service.ts');
  assert(/coverage: coverage\.filter\(\(x\) => x\.examId === examId\)/.test(svc) && /examId: v\.exam_id,/.test(svc), 'service: only this exam\'s syllabus lines');
  assert(/PromptTemplateService\.getActiveBody\("EXAM_NOTE"\)/.test(svc) && /EXAM_NOTE: EXAM_NOTE_TEMPLATE_V1/.test(read('services/prompts/prompt-template.service.ts')), 'active body with the code v1 fallback');
  const ed = read('components/admin/lessons/exam-notes-editor.tsx');
  assert(/try \{\s*const r = await examNotePromptAction\(examId, nodeId\);[\s\S]*?\} catch \{\s*setPromptMsg\(\{ ok: false,/.test(ed), 'editor: the action call is caught (inline message, never the error boundary)');
  assert(/EXAM_NOTE: "Exam note"/.test(read('components/admin/prompts/prompt-templates-editor.tsx')), 'prompts editor label');
});

console.log(`\nEXAM-NOTE-PROMPT-1 offline: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
