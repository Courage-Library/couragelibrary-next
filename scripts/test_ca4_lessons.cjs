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
  // the SQL twin lists exactly the TS placeholders
  for (const t of T.TEMPLATE_TYPES) {
    const block = MIG.slice(MIG.indexOf(`WHEN '${t}' THEN`), MIG.indexOf(`WHEN '${t}' THEN`) + 600);
    const allowed = /v_allowed := ARRAY\[([^\]]+)\]/.exec(block)[1].replace(/\s+/g, '').replace(/'/g, '').split(',');
    const required = /v_required := ARRAY\[([^\]]+)\]/.exec(block)[1].replace(/\s+/g, '').replace(/'/g, '').split(',');
    assert(JSON.stringify(allowed) === JSON.stringify(T.TEMPLATE_PLACEHOLDERS[t].allowed) && JSON.stringify(required) === JSON.stringify(T.TEMPLATE_PLACEHOLDERS[t].required), `${t}: SQL placeholders differ`);
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

test('K-01 completeness checklist: the errors block publishing; warnings do not', () => {
  const ex = L.lessonExample(NODE);
  const short = C.lessonChecklist(ex.blocks, 'APTITUDE');
  assert(!C.checklistPasses(short) && ['examples_min', 'traps', 'quick_checks'].every((k) => short.find((i) => i.key === k && !i.ok && i.severity === 'error')), 'the short example fails');
  const ex1 = ex.blocks.find((b) => b.type === 'solved_example');
  const qc = ex.blocks.find((b) => b.type === 'quick_check');
  const trap = ex.blocks.find((b) => b.type === 'trap');
  const levels = ['EASY', 'EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HARD', 'HARD', 'HARD'];
  const full = [
    ...ex.blocks.filter((b) => !['solved_example', 'quick_check', 'trap'].includes(b.type)).slice(0, 3),
    ...levels.map((d, n) => ({ ...ex1, id: `ex-${n}`, difficulty: d })),
    ...[0, 1].map((n) => ({ ...trap, id: `trap-${n}` })),
    ...[0, 1, 2, 3, 4].map((n) => ({ ...qc, id: `qc-${n}` })),
    ...ex.blocks.filter((b) => ['callout', 'revision_summary', 'memory_lock_points'].includes(b.type)),
  ];
  const good = C.lessonChecklist(full, 'APTITUDE');
  assert(C.checklistPasses(good), JSON.stringify(good.filter((i) => !i.ok)));
  const hardFirst = full.map((b) => (b.id === 'ex-0' ? { ...b, difficulty: 'HARD' } : b));
  assert(!C.checklistPasses(C.lessonChecklist(hardFirst, 'APTITUDE')), 'easy → hard order');
  const noFormula = full.filter((b) => b.type !== 'formula');
  assert(!C.checklistPasses(C.lessonChecklist(noFormula, 'APTITUDE')) && C.checklistPasses(C.lessonChecklist(noFormula, 'GENERAL_AWARENESS')), 'formulas: an error for aptitude, a warning otherwise');
  const noBasics = full.filter((b) => b.type !== 'paragraph');
  assert(!C.checklistPasses(C.lessonChecklist(noBasics, 'APTITUDE')), 'basics first');
  return `${good.length} items`;
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
  for (const [f, n] of [['app/admin/prompts/actions.ts', 2], ['app/admin/lessons/actions.ts', 4]]) {
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
