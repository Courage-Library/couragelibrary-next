/**
 * HOTFIX-2: curriculum coverage never fabricates values (decision #15). Unit test, NO network.
 *
 * Runs the real CurriculumCoverageService (transpiled) against a mocked Supabase client:
 *   H2-1 failing learning_units / exam_unit_mappings reads (today's production state) → status UNAVAILABLE, zero values,
 *        no subjects / exams, and NONE of the former fabricated values (pilot document, pilot version, default exam,
 *        synthesised "unit-…" ids) appear anywhere in the result
 *   H2-2 any other failing source read → UNAVAILABLE too (no partial numbers)
 *   H2-3 all reads succeed but tables are empty → AVAILABLE with honest zeros and nothing synthesised
 *   H2-4 quality metrics inherit UNAVAILABLE and report zero units
 *   H2-5 static: the fabrication code is gone; the coverage view renders the notice (no figures) when UNAVAILABLE;
 *        the B-CURRICULUM-MAPPING tags remain for GAP2-4
 *
 * Run: node scripts/test_hotfix2_coverage.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return originalResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;
const MOCKS = {
  'server-only': {},
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => { throw new Error('test must pass a client'); },
    createAdminServerSupabaseClient: () => { throw new Error('test must pass a client'); },
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.stack ? e.stack : e).slice(0, 1500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

/** Thenable query builder mock: every chained call returns itself; awaiting yields the table's result. */
function mockClient(results) {
  return {
    from(table) {
      const res = results[table] || { data: [], error: null };
      const b = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return (ok, ko) => Promise.resolve(res).then(ok, ko);
          return () => b;
        },
      });
      return b;
    },
  };
}
const FAIL = { data: null, error: { code: '42703', message: 'column does not exist' } };
const LIVE_ROWS = {
  exams: { data: [{ id: 'exam-1', title: 'SSC CGL', slug: 'ssc-cgl' }], error: null },
  subjects: { data: [{ id: 'sub-1', name: 'Quantitative Aptitude', slug: 'quantitative-aptitude', display_order: 1 }], error: null },
  topics: { data: [{ id: 'top-1', subject_id: 'sub-1', name: 'Percentage', slug: 'percentage', display_order: 1 }], error: null },
  learning_documents: { data: [], error: null },
  document_versions: { data: [], error: null },
  questions: { data: [{ id: 'q1', canonical_topic_id: 'top-1', status: 'published' }], error: null },
};
// strings that only the removed fabrication could produce
const FABRICATED = ['doc-pilot-percentage-concept', 'ver-pilot-percentage-v1', 'percentages-and-fraction-equivalence', 'Percentages & Fraction Equivalence', '5ecaf736-b8c4-41fb-990a-feb306429cfb', 'e0100000-0000-4000-8000-000000000001', '"unit-top-1"', 'Fundamentals & Core Concepts'];

(async () => {
  console.log('HOTFIX-2 curriculum coverage (no fabricated values)');
  const { CurriculumCoverageService } = require(path.join(ROOT, 'services/curriculum-coverage.service.ts'));

  await test('H2-1 failing learning_units + exam_unit_mappings (production today) → UNAVAILABLE, no fabricated values', async () => {
    const m = await CurriculumCoverageService.getCurriculumCoverageMatrix(mockClient({ ...LIVE_ROWS, learning_units: FAIL, exam_unit_mappings: FAIL }));
    assert(m.status === 'UNAVAILABLE', `status ${m.status}`);
    assert(/learning_units/.test(m.unavailableReason) && /exam_unit_mappings/.test(m.unavailableReason), `reason: ${m.unavailableReason}`);
    assert(m.subjects.length === 0 && m.exams.length === 0, 'subjects/exams must be empty');
    assert(Object.values(m.overall).every((v) => v === 0), `overall not zero: ${JSON.stringify(m.overall)}`);
    assert(Object.values(m.byDocumentType).every((d) => Object.values(d).every((v) => v === 0)), 'byDocumentType not zero');
    const json = JSON.stringify(m);
    for (const f of FABRICATED) assert(!json.includes(f), `fabricated value present: ${f}`);
    return m.unavailableReason;
  });

  await test('H2-2 any other failing source read → UNAVAILABLE (no partial numbers)', async () => {
    for (const t of ['exams', 'subjects', 'topics', 'learning_documents', 'document_versions', 'questions']) {
      const ok = { ...LIVE_ROWS, learning_units: { data: [], error: null }, exam_unit_mappings: { data: [], error: null }, [t]: FAIL };
      const m = await CurriculumCoverageService.getCurriculumCoverageMatrix(mockClient(ok));
      assert(m.status === 'UNAVAILABLE' && m.unavailableReason.includes(t), `${t}: ${m.status} ${m.unavailableReason}`);
    }
    return '6 tables';
  });

  await test('H2-3 all reads succeed, tables empty → AVAILABLE, honest zeros, nothing synthesised', async () => {
    const m = await CurriculumCoverageService.getCurriculumCoverageMatrix(mockClient({ ...LIVE_ROWS, learning_units: { data: [], error: null }, exam_unit_mappings: { data: [], error: null } }));
    assert(m.status === 'AVAILABLE', `status ${m.status}`);
    assert(m.overall.totalUnits === 0 && m.overall.publishedDocSlots === 0 && m.overall.overallCoveragePct === 0, JSON.stringify(m.overall));
    const json = JSON.stringify(m);
    for (const f of FABRICATED) assert(!json.includes(f), `fabricated value present: ${f}`);
    assert(!m.subjects.some((s) => s.topics.some((t) => t.units.length > 0)), 'units were synthesised');
  });

  await test('H2-4 quality metrics inherit UNAVAILABLE and report zero units', async () => {
    const q = await CurriculumCoverageService.getCurriculumQualityMetrics(mockClient({ ...LIVE_ROWS, learning_units: FAIL, exam_unit_mappings: FAIL }));
    assert(q.status === 'UNAVAILABLE', `status ${q.status}`);
    assert(q.totalLearningUnits === 0 && q.mappedLearningUnits === 0, JSON.stringify(q).slice(0, 200));
  });

  await test('H2-5 static: fabrication code removed; view shows the notice; B-CURRICULUM-MAPPING tags kept', async () => {
    const svc = fs.readFileSync(path.join(ROOT, 'services/curriculum-coverage.service.ts'), 'utf8');
    for (const f of ['doc-pilot-percentage-concept', 'defaultExam', 'synthesize canonical units', '5ecaf736-b8c4-41fb-990a-feb306429cfb']) assert(!svc.includes(f), `service still contains ${f}`);
    assert((svc.match(/@ts-expect-error TYPES-1:B-CURRICULUM-MAPPING/g) || []).length === 5, 'B-CURRICULUM-MAPPING directives must stay (GAP2-4)');
    const view = fs.readFileSync(path.join(ROOT, 'components/admin/content-studio/curriculum-coverage-view.tsx'), 'utf8');
    const i = view.indexOf('if (matrix && matrix.status === "UNAVAILABLE")');
    assert(i > 0, 'view must branch on UNAVAILABLE');
    const block = view.slice(i, view.indexOf('// If full matrix is not supplied', i));
    assert(block.includes('{COVERAGE_UNAVAILABLE_MESSAGE}') && !/matrix\.overall|matrix\.subjects|%/.test(block.replace(/className="[^"]*"/g, '')), 'unavailable branch must show the notice and no figures');
    const types = fs.readFileSync(path.join(ROOT, 'types/curriculum-coverage.ts'), 'utf8');
    assert(types.includes("COVERAGE_UNAVAILABLE_MESSAGE = 'Coverage unavailable — pending syllabus rebuild (GAP2-4)'"), 'message text');
  });

  console.log(`\nHOTFIX-2 coverage: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
