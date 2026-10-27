#!/usr/bin/env node
/**
 * MISTAKE-VERSION-1 (architect, 2026-10-27) — offline gate. A mistake / review always shows the version the student
 * ANSWERED; a newer published version is shown as the correction ("This question was corrected"); a superseded version
 * is never shown as if it were current.
 *   MV-01 correction core: correctionFor / answeredVersionIdOf / listTextFor (units)
 *   MV-02 the vault detail shows the answered snapshot (+ the correction); no arbitrary version[0]; ownership first
 *   MV-03 the vault lists + "next best revisions" show the answered text, else the CURRENT version — never [0]
 *   MV-04 the result review: the pinned (answered) version + the correction; the card renders it
 *   MV-05 drills: generation serves CURRENT versions; a resumed drill flags a corrected question (boolean only, no answer
 *         data in the pre-submit payload) and the runner says so
 *   MV-06 Memory Lock / practice serve only CURRENT versions and the answer RPC refuses a non-current version
 *   MV-07 the shared block: text + icon, the corrected key labelled in words
 * Run: node scripts/test_mistake_version1.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(out.outputText, filename);
};
const C = require(path.join(ROOT, 'lib/questions/correction-core.ts'));

test('MV-01 correction core', () => {
  const cur = { id: 'v2', questionText: 'fixed', options: [{ key: 'A', text: 'a' }], correctOptionKey: 'A', explanation: null };
  assert(C.correctionFor('v1', cur) === cur, 'a newer current version is the correction');
  assert(C.correctionFor('v2', cur) === null && C.correctionFor(null, cur) === null && C.correctionFor('v1', null) === null, 'no correction when current / unknown');
  assert(C.answeredVersionIdOf([{ question_version_id: null }, { question_version_id: 'v3', occurrence_status: 'REVOKED' }, { question_version_id: 'v2', occurrence_status: 'ACTIVE' }]) === 'v2', 'newest ACTIVE occurrence with a version');
  assert(C.answeredVersionIdOf([{ question_version_id: 'v3', occurrence_status: 'REVOKED' }]) === 'v3' && C.answeredVersionIdOf([{ question_version_id: null }]) === null && C.answeredVersionIdOf([]) === null, 'fallbacks');
  assert(C.listTextFor('answered', [{ question_text: 'x', is_current: true }]) === 'answered', 'answered text first');
  assert(C.listTextFor(null, [{ question_text: 'old', is_current: false }, { question_text: 'current', is_current: true }]) === 'current', 'else the CURRENT version — not [0]');
  assert(C.listTextFor(null, [{ question_text: 'old', is_current: false }]) === 'Question prompt unavailable', 'never a non-current version');
  assert(C.CORRECTED_NOTICE === 'This question was corrected', 'notice text');
});

const svc = code(read('services/mistake.service.ts'));

test('MV-02 vault detail: the answered snapshot + the correction; ownership first; no version[0]', () => {
  const fn = svc.slice(svc.indexOf('static async getMistakeDetail('), svc.indexOf('return {', svc.indexOf('static async getMistakeDetail(')));
  const iOwn = fn.indexOf('.eq("user_id", user.id)');
  const iLoad = fn.indexOf('loadVersionSnapshots(');
  assert(iOwn > 0 && iLoad > iOwn && fn.indexOf('loadCurrentVersions(') > iOwn, 'ownership (own vault row) before any version read');
  assert(/const answeredId = answeredVersionIdOf\(occurrencesRes\.data \?\? \[\]\);/.test(fn) && /const shown = answered \?\? current;/.test(fn) && /const correction = correctionFor\(answered\?\.id \?\? null, current\);/.test(fn), 'answered → shown; correction = current ≠ answered');
  const ret = svc.slice(svc.indexOf('static async getMistakeDetail('));
  assert(/answeredVersionKnown: !!answered,/.test(ret) && /correction,/.test(ret.slice(0, 6000)), 'detail returns answeredVersionKnown + correction');
  const page = read('app/mistakes/[id]/page.tsx');
  assert(/\{mistake\.correction && <CorrectedVersion correction=\{mistake\.correction\} \/>\}/.test(page) && /mistake\.answeredVersionKnown === false/.test(page), 'page: correction block + the "not recorded" note');
});

test('MV-03 lists show the answered text, else the CURRENT one — never question_versions[0]', () => {
  assert(!/question_versions\?\.\[0\]/.test(svc), 'an arbitrary question_versions[0] remains in the mistake service');
  assert((svc.match(/listTextFor\(/g) || []).length >= 2 && (svc.match(/questions\(question_versions\(question_text, is_current\)\)/g) || []).length === 2, 'both lists use listTextFor with is_current');
  assert(/private static async answeredTextsByVault\(/.test(svc) && /answeredVersionIdOf\(occ\.filter/.test(svc), 'answered text per vault from its occurrences');
});

test('MV-04 result review: the pinned answered version + the correction', () => {
  const a = code(read('services/assessment.service.ts'));
  const fn = a.slice(a.indexOf('static async getTestResult('));
  assert(/const currentVersions = await loadCurrentVersions\(rawQuestions\.map/.test(fn) && /correction: correctionFor\(qv\?\.id \?\? null, qv\?\.question_id \? currentVersions\.get\(qv\.question_id\) : null\),/.test(fn), 'correction per reviewed question');
  assert(/questionText: qv\?\.question_text/.test(fn), 'the review text is the pinned (answered) version');
  const card = read('components/assessment/question-review-card.tsx');
  assert(/\{correction && <CorrectedVersion correction=\{correction\} \/>\}/.test(card) && /correction=\{q\.correction \?\? null\}/.test(read('components/assessment/result-view-client.tsx')), 'card renders it; the result view passes it');
});

test('MV-05 drills: CURRENT versions served; a corrected stored version is flagged (boolean only) and said', () => {
  const dir = path.join(ROOT, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => /\.sql$/.test(f)).sort();
  const latest = files.filter((f) => /FUNCTION public\.fn_generate_mistake_drill\(/.test(fs.readFileSync(path.join(dir, f), 'utf8'))).pop();
  const sql = fs.readFileSync(path.join(dir, latest), 'utf8');
  const body = sql.slice(sql.lastIndexOf('FUNCTION public.fn_generate_mistake_drill('));
  assert(/qv\.is_current/.test(body.slice(0, 8000)), `fn_generate_mistake_drill (${latest}) serves the current version`);
  const fn = svc.slice(svc.indexOf('static async getMistakeDrill('), svc.indexOf('static async submitMistakeDrill('));
  assert(fn.indexOf('.eq("user_id", user.id)') > 0 && fn.indexOf('.eq("user_id", user.id)') < fn.indexOf('loadCurrentVersions('), 'own drill row before the version read');
  assert(/if \(correctionFor\(q\.question_version_id \?\? null, current\.get\(q\.question_id\)\)\) q\.corrected = true;/.test(fn) && /corrected_count:/.test(fn), 'resume flags corrected questions');
  const P = code(read('services/mistakes/drill-payload.ts'));
  assert(/if \(q\.corrected === true\) out\.corrected = true;/.test(P) && !/correct_option|explanation|is_correct/.test(P.slice(P.indexOf('export function toPublicDrillQuestion('))), 'whitelist: the flag is a boolean; still no answer data');
  assert(/\{currentQ\.corrected && \(/.test(read('components/mistakes/mistake-drill-runner.tsx')), 'the runner says the question was corrected');
});

test('MV-06 Memory Lock / practice serve only CURRENT versions; the answer RPC refuses a non-current version', () => {
  const s = code(read('lib/practice/server.ts'));
  assert(/is_current/.test(s), 'practice / Memory Lock load current versions');
  const dir = path.join(ROOT, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => /\.sql$/.test(f)).sort();
  const latest = files.filter((f) => /FUNCTION public\.fn_memory_lock_answer\(/.test(fs.readFileSync(path.join(dir, f), 'utf8'))).pop();
  const sql = fs.readFileSync(path.join(dir, latest), 'utf8');
  const body = sql.slice(sql.lastIndexOf('FUNCTION public.fn_memory_lock_answer('));
  assert(/is_current/.test(body.slice(0, 6000)), `fn_memory_lock_answer (${latest}) requires the current version`);
});

test('MV-07 the corrected block: text + icon; the corrected key in words', () => {
  const c = read('components/questions/corrected-version.tsx');
  assert(/\{CORRECTED_NOTICE\}/.test(c) && /<RefreshCw aria-hidden="true"/.test(c) && /Correct answer/.test(c) && /You answered the version above/.test(c), 'notice text, icon, "Correct answer" label');
  const v = read('lib/questions/versions-server.ts');
  assert(/\.eq\("is_current", true\)/.test(v) && /catch \{/.test(v), 'current = is_current; a failed read claims no correction');
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (['node_modules', '.next'].includes(e.name) ? [] : walk(`${d}/${e.name}`)) : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : []));
  const clientImporters = ['app', 'components', 'lib'].flatMap(walk).filter((f) => /^\s*["']use client["']/.test(read(f)) && /questions\/versions-server/.test(read(f)));
  assert(clientImporters.length === 0, `client components import the service-role loader: ${clientImporters.join(', ')}`);
});

console.log(`\nMISTAKE-VERSION-1: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
