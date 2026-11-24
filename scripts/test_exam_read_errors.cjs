#!/usr/bin/env node
/**
 * EXAM-READ-404 (LIVE-GREEN-1 3c, owner 2026-11-24) — offline gate: a FAILED read is never a 404.
 * UX2A L-17 saw /exams/ssc-cgl/exam-pattern answer 404 in dispatch 45362983737 (200 on production and locally): the exam
 * knowledge read turned a database error into NOT_FOUND (exams read) or an empty guide list (the six batch reads used
 * `data || []` and ignored `error`), and the guide page then called notFound().
 *   R-1 the real service (transpiled, fake client): a missing exam row → NOT_FOUND; an inactive exam → INACTIVE
 *   R-2 an error on the exams read → throws ExamKnowledgeReadError (never NOT_FOUND)
 *   R-3 an error on ANY of the six batch reads (cycles, posts, patterns, sources, claims, guides) → throws
 *   R-4 all reads fine → FOUND; a guide that is not published is simply absent (the page's genuine 404)
 *   R-5 the error message names tables only (no slug, no row data)
 *   R-6 the exam pages call notFound() only for a non-FOUND status / a missing module, never inside a catch, and never
 *       wrap the read in a try/catch that hides the error
 *   R-7 negative controls: each broken variant is caught
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const SVC = 'services/exam-knowledge/exam-knowledge-candidate.service.ts';
const PAGES = [
  'app/(site)/exams/[slug]/page.tsx',
  'app/(site)/exams/[slug]/[moduleSlug]/page.tsx',
  'app/(site)/exams/[slug]/cycle/[cycleYear]/page.tsx',
  'app/(site)/exams/[slug]/cycle/[cycleYear]/[moduleSlug]/page.tsx',
];
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; results.push(`  FAIL  ${name}\n        ${String(e && e.message).slice(0, 600)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

/** load a TS module with "@/" resolved to the repo root and chosen modules stubbed */
let n = 0;
function loadTs(rel, src, stubs) {
  const filename = path.join(ROOT, rel.replace(/\.ts$/, `.__t${n++}.ts`));
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const out = ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  m.require = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith('@/')) return loadReal(id.slice(2), stubs);
    if (id.startsWith('./')) return loadReal(path.join(path.dirname(rel), id).replace(/\\/g, '/'), stubs);
    return require(id);
  };
  m._compile(out, filename);
  return m.exports;
}
const realCache = new Map();
function loadReal(rel, stubs) {
  for (const ext of ['.ts', '.tsx', '/index.ts']) {
    const f = rel + ext;
    if (fs.existsSync(path.join(ROOT, f))) {
      if (!realCache.has(f)) realCache.set(f, loadTs(f, read(f), stubs));
      return realCache.get(f);
    }
  }
  throw new Error(`cannot resolve ${rel}`);
}

/** a fake supabase-js client: each table answers { data, error } from the scenario; every builder call is chainable */
function fakeClient(scn) {
  const ok = {
    exams: { data: scn.exam === undefined ? { id: 'e1', slug: 'ssc-cgl', title: 'SSC CGL', is_active: true, conducting_org: null } : scn.exam, error: null },
    exam_cycles: { data: [], error: null },
    exam_posts: { data: [], error: null },
    exam_patterns: { data: [], error: null },
    exam_sources: { data: [], error: null },
    exam_claims: { data: [], error: null },
    exam_knowledge_documents: { data: scn.docs || [], error: null },
  };
  const answer = (t) => (scn.fail && scn.fail.includes(t) ? { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } } : ok[t] || { data: [], error: null });
  const builder = (t) => {
    const b = {};
    for (const k of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'is', 'not', 'gte', 'lte']) b[k] = () => b;
    b.maybeSingle = () => Promise.resolve(answer(t));
    b.single = () => Promise.resolve(answer(t));
    b.then = (res, rej) => Promise.resolve(answer(t)).then(res, rej);
    return b;
  };
  return { from: (t) => builder(t), rpc: () => Promise.resolve({ data: null, error: { message: 'rpc not in this test' } }) };
}

const STUBS = { '@/lib/supabase/server': { createServerSupabaseClient: async () => { throw new Error('the gate passes its own client'); } } };
const loadService = (src = read(SVC)) => { realCache.clear(); return loadTs(SVC, src, STUBS); };

const BATCH = ['exam_cycles', 'exam_posts', 'exam_patterns', 'exam_sources', 'exam_claims', 'exam_knowledge_documents'];

async function checkService(M) {
  const S = M.ExamKnowledgeCandidateService;
  const view = (scn) => S.getExamKnowledgeCandidateView({ examSlug: 'ssc-cgl', supabaseClient: fakeClient(scn) });
  // R-1
  const missing = await view({ exam: null });
  assert(missing.status === 'NOT_FOUND', `missing exam row → ${missing.status}`);
  const inactive = await view({ exam: { id: 'e1', slug: 'ssc-cgl', title: 'SSC CGL', is_active: false } });
  assert(inactive.status === 'INACTIVE', `inactive exam → ${inactive.status}`);
  // R-2 / R-3 / R-5
  const throwsOn = async (fail) => {
    try { const r = await view({ fail }); return { threw: false, status: r.status }; } catch (e) { return { threw: true, name: e && e.name, msg: String(e && e.message) }; }
  };
  const bad = [];
  for (const t of ['exams', ...BATCH]) {
    const r = await throwsOn([t]);
    if (!r.threw) bad.push(`${t} error → status ${r.status} (must throw)`);
    else if (r.name !== 'ExamKnowledgeReadError' || !r.msg.includes(t)) bad.push(`${t} error → ${r.name}: ${r.msg}`);
    else if (/ssc-cgl|e1|statement timeout/.test(r.msg)) bad.push(`${t}: the message carries the slug / an id / the DB text`);
  }
  assert(bad.length === 0, bad.join(' | '));
  // R-4
  const found = await view({ docs: [] });
  assert(found.status === 'FOUND' && found.data, `all reads fine → ${found.status}`);
  return `missing → NOT_FOUND, inactive → INACTIVE; an error on exams + ${BATCH.length} batch reads → throws (tables only); fine → FOUND`;
}

function checkPages(srcs) {
  const bad = [];
  for (const [f, s] of Object.entries(srcs)) {
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!/getExamKnowledgeCandidateView\(/.test(code)) { bad.push(`${f}: no knowledge read (pages list out of date)`); continue; }
    // no try/catch around the knowledge read (it would turn the thrown read error back into a 404 / empty page)
    if (/try\s*\{[^}]*getExamKnowledgeCandidateView/.test(code)) bad.push(`${f}: the knowledge read is inside try/catch`);
    if (/\.catch\([^)]*\)[^;]*;?/.test(code.slice(code.indexOf('getExamKnowledgeCandidateView'))) && /getExamKnowledgeCandidateView\([^)]*\{[\s\S]*?\}\)\s*\.catch\(/.test(code)) bad.push(`${f}: .catch() on the knowledge read`);
    if (/catch\s*(\([^)]*\))?\s*\{[^}]*notFound\(\)/.test(code)) bad.push(`${f}: notFound() inside a catch`);
  }
  assert(bad.length === 0, bad.join(' | '));
  return `${Object.keys(srcs).length} exam pages: notFound() only on a non-FOUND status / a missing module`;
}

(async () => {
  const SRC = read(SVC);
  const PAGE_SRC = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
  await test('R-1..R-5 the real service: missing row = NOT_FOUND; any read error throws (tables only); fine = FOUND', () => checkService(loadService()));
  await test('R-6 the exam pages never turn a read error into notFound()', () => checkPages(PAGE_SRC));
  await test('R-7 negative controls: each broken variant is caught', async () => {
    const mut = (s, a, b) => { assert(s.includes(a), `anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b); };
    const page = PAGES[1];
    const cases = [
      ['exams read error → NOT_FOUND again', () => checkService(loadService(mut(mut(SRC, "      if (examErr) throw new ExamKnowledgeReadError('exams');\n", ''), '      if (!exam) {', '      if (examErr || !exam) {')))],
      ['batch read errors ignored again', () => checkService(loadService(mut(SRC, '      if (failed.length) throw new ExamKnowledgeReadError(failed.join(\', \'));\n', '')))],
      ['the guide read dropped from the check', () => checkService(loadService(mut(SRC, "          ['exam_knowledge_documents', docRes],\n", '')))],
      ['the slug in the error message', () => checkService(loadService(mut(SRC, 'super(`exam knowledge read failed: ${tables}`);', 'super(`exam knowledge read failed: ${tables} (ssc-cgl)`);')))],
      ['a page catches the read error into a 404', () => checkPages({ ...PAGE_SRC, [page]: mut(PAGE_SRC[page], '  const result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({\n    examSlug: slug,\n  });', '  let result;\n  try { result = await ExamKnowledgeCandidateService.getExamKnowledgeCandidateView({ examSlug: slug }); } catch { notFound(); }') })],
    ];
    const missed = [];
    for (const [name, fn] of cases) {
      let caught = false;
      try { await fn(); } catch (e) { caught = !/anchor missing/.test(String(e.message)); if (!caught) missed.push(`${name}: ${e.message}`); continue; }
      if (!caught) missed.push(name);
    }
    assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
    return `${cases.length}/${cases.length} broken variants caught`;
  });
  console.log('EXAM-READ-404 (LIVE-GREEN-1 3c)');
  for (const r of results) console.log(r);
  console.log(`\nEXAM-READ-404: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
