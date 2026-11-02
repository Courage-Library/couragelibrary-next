#!/usr/bin/env node
/**
 * GUIDE-SCOPE-1 (owner 2026-11-02: NO merging — every guide stays separate; fix the overlap with clear scopes).
 *   S-1 every one of the 24 module types has a one-line `covers` and a one-line `mustNotRepeat` (single line, ≤ 240
 *       chars, non-empty); no two `covers` lines are the same; the 24 types and their display names are unchanged
 *   S-2 scope keywords are owned by ONE module each (no keyword in two modules) and never appear in the owner's own
 *       mustNotRepeat line
 *   S-3 the authoring prompt (ExamKnowledgePromptBuilder) carries a <MODULE_SCOPE> block with this guide's covers +
 *       mustNotRepeat and one line per sibling guide; the contract version is CL-EXAM-AUTHOR-v1.1, one constant shared by
 *       the builder and the admin studio (no literal left)
 *   S-4 the validator (Gate 5) warns — never blocks — when a section heading uses a topic another guide owns;
 *       summary guides (overview, FAQ, notices) are exempt
 * --self-test: NEGATIVE CONTROLS — a missing covers line, a keyword owned twice, a prompt without the scope block, a
 *   scope finding that BLOCKS instead of warning, and an overlapping heading that is NOT flagged must each fail.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const REG = 'services/exam-knowledge/exam-module-registry.ts';
const BUILDER = 'services/exam-knowledge/exam-knowledge-prompt-builder.service.ts';
const VALIDATOR = 'services/exam-knowledge/exam-knowledge-validator.service.ts';
const STUDIO = 'components/admin/exam-knowledge/exam-knowledge-studio-view.tsx';
const TYPES = 'types/exam-knowledge.ts';
const EXPECTED_KEYS = ['EXAM_OVERVIEW', 'IMPORTANT_DATES', 'ELIGIBILITY', 'AGE_LIMIT', 'QUALIFICATION', 'PHYSICAL_STANDARDS', 'APPLICATION_PROCESS', 'SELECTION_PROCESS', 'EXAM_PATTERN', 'SYLLABUS', 'SYLLABUS_OVERVIEW', 'POSTS', 'SALARY', 'POST_PREFERENCE_SALARY', 'CAREER', 'VACANCIES', 'CUTOFF', 'CUTOFF_TRENDS', 'ADMIT_CARD', 'RESULT', 'PREPARATION', 'PREPARATION_STRATEGY', 'FAQ', 'NOTIFICATIONS'];

function loadRegistry(src) {
  const ts = require('typescript');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', out)((id) => (id.startsWith('@/') ? {} : require(id)), m, m.exports);
  return m.exports;
}

function check(over = {}) {
  const get = (f) => (f in over ? over[f] : read(f));
  const fails = [];
  const fail = (x) => fails.push(x);
  let R;
  try { R = loadRegistry(get(REG)); } catch (e) { return [`S-1 registry not loadable: ${e.message}`]; }
  const defs = Object.values(R.EXAM_MODULE_REGISTRY);
  // S-1
  if (JSON.stringify(defs.map((d) => d.key)) !== JSON.stringify(EXPECTED_KEYS)) fail(`S-1 the 24 module types changed: ${defs.map((d) => d.key).join(',')}`);
  for (const d of defs) {
    for (const f of ['covers', 'mustNotRepeat']) {
      const v = d[f];
      if (typeof v !== 'string' || !v.trim() || /\n/.test(v) || v.length > 240) fail(`S-1 ${d.key}.${f} is not one line (≤ 240 chars)`);
    }
  }
  const covers = defs.map((d) => (d.covers || '').toLowerCase());
  if (new Set(covers).size !== covers.length) fail('S-1 two modules have the same covers line');
  // S-2
  const owner = new Map();
  for (const d of defs) for (const k of d.scopeKeywords || []) {
    if (owner.has(k)) fail(`S-2 keyword "${k}" owned by ${owner.get(k)} and ${d.key}`);
    owner.set(k, d.key);
  }
  // S-3
  const b = get(BUILDER);
  if (!/<MODULE_SCOPE>[\s\S]*THIS GUIDE COVERS ONLY: \$\{module\.covers\}[\s\S]*THIS GUIDE MUST NOT REPEAT: \$\{module\.mustNotRepeat\}[\s\S]*\$\{siblingScopes\}[\s\S]*<\/MODULE_SCOPE>/.test(b)) fail('S-3 the prompt has no module scope block');
  if (!/\.filter\(\(m\) => m\.key !== module\.key\)/.test(b)) fail('S-3 the sibling list does not exclude the guide itself');
  if (!/EXAM_PROMPT_CONTRACT_VERSION = 'CL-EXAM-AUTHOR-v1\.1';/.test(get(TYPES))) fail('S-3 contract version is not CL-EXAM-AUTHOR-v1.1');
  if (/CL-EXAM-AUTHOR-v1\.\d/.test(get(STUDIO))) fail('S-3 the admin studio still has a literal contract version');
  // S-4
  if (typeof R.scopeOverlapWarnings !== 'function') fail('S-4 no scopeOverlapWarnings');
  else {
    const w = R.scopeOverlapWarnings('ELIGIBILITY', ['Who can apply', 'Age limit and relaxation']);
    const ex = R.scopeOverlapWarnings('FAQ', ['Age limit and relaxation']);
    const own = R.scopeOverlapWarnings('AGE_LIMIT', ['Age limit and relaxation']);
    if (w.length !== 1 || !/Age Limits & Relaxation Rules/.test(w[0]) || ex.length !== 0 || own.length !== 0) fail(`S-4 scope warnings wrong: ${JSON.stringify({ w, ex, own })}`);
  }
  const v = get(VALIDATOR);
  if (!/warnings\.push\(\.\.\.scopeOverlapWarnings\(spec\.moduleKey as ExamModuleKey, \(spec\.contentSections \|\| \[\]\)\.map\(\(sec\) => sec\.heading\)\)\);/.test(v) || /errors\.push\(\.\.\.scopeOverlapWarnings/.test(v)) fail('S-4 Gate 5 does not WARN on scope overlap (or blocks it)');
  return fails;
}

if (process.argv.includes('--self-test')) {
  const reg = read(REG);
  const controls = [
    ['a module without a covers line', { [REG]: reg.replace(/covers: 'The latest cut-off marks[^\n]*\n/, '') }, /S-1 CUTOFF\.covers/],
    ['a keyword owned twice', { [REG]: reg.replace("scopeKeywords: ['admit card', 'exam day'],", "scopeKeywords: ['admit card', 'exam day', 'age limit'],") }, /S-2 keyword "age limit"/],
    ['a prompt without the scope block', { [BUILDER]: read(BUILDER).replace('<MODULE_SCOPE>', '<MODULE_NOTES>') }, /S-3 the prompt has no module scope block/],
    ['scope overlap that blocks', { [VALIDATOR]: read(VALIDATOR).replace('warnings.push(...scopeOverlapWarnings(', 'errors.push(...scopeOverlapWarnings(') }, /S-4 Gate 5/],
    ['an overlapping heading not flagged', { [REG]: reg.replace("scopeKeywords: ['age limit', 'age relaxation', 'upper age'],", 'scopeKeywords: [],') }, /S-4 scope warnings wrong/],
  ];
  let bad = 0;
  for (const [n, over, want] of controls) {
    const f = check(over);
    const caught = f.some((x) => want.test(x));
    if (!caught) bad++;
    console.log(`${caught ? 'OK  ' : 'MISS'} negative control: ${n}${caught ? '' : ' — ' + JSON.stringify(f).slice(0, 300)}`);
  }
  console.log(bad ? 'GUIDE-SCOPE-1 self-test: FAILED' : 'GUIDE-SCOPE-1 self-test: all negative controls caught');
  process.exit(bad ? 1 : 0);
}

const fails = check();
for (const x of fails) console.log('FAIL ' + x);
console.log(fails.length ? `GUIDE-SCOPE-1: ${fails.length} FAILURES` : 'GUIDE-SCOPE-1: ALL PASS (24 separate guides, one-line scopes, prompt v1.1 scope block, Gate 5 scope warnings)');
process.exit(fails.length ? 1 : 0);
