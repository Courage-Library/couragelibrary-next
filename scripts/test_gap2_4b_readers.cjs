/**
 * GAP2-4b batch 2 — syllabus readers re-pointed to the canonical read model (+ GAP2-4c: legacy tables retired).
 *
 * Static (no network):
 *   R-01 no runtime file (app / components / services / lib / actions / middleware) reads the legacy syllabus tables
 *        exam_syllabi / exam_topics / exam_unit_mappings / exam_topic_mappings / taxonomy_aliases (comments
 *        ignored), and none imports a module of the reconciliation workbench retired in GAP2-4c
 *   R-02 the exam hub and cycle pages render ExamSyllabusSection from the candidate service, which reads ONLY
 *        fn_exam_syllabus_read_model; the legacy navigator, ExamSyllabusService, mapUnitToExam, the onboarding
 *        projection and every B-CURRICULUM-MAPPING tag are gone; the workbench pages / API routes / services and
 *        its sidebar link are gone
 *   R-03 ExamSyllabusSection is built from components/ui and has the three honest states
 * DB (couragelibrary-next, verified TLS, every write inside BEGIN … ROLLBACK — nothing persists):
 *   R-04 SSC CGL now (QB-KEY-1 round 2 amendment; was pinned to NO_SYLLABUS): the read model (anon) agrees with the
 *        DB — a PUBLISHED version ⇔ AVAILABLE with that version — and the section renders it: AVAILABLE → every
 *        paper / section title, no "Syllabus coming soon", no legacy SSC GD topic outside the read model;
 *        NO_SYLLABUS → "Syllabus coming soon" with no topics, counts or tiers
 *   R-05 a published TEST version on the inactive QA exam (rolled back) → AVAILABLE, rendered as the section / unit
 *        tree with weightage tier, the expected range only when known, and live topic counts
 *   R-06 coverage: with the published rows as they are now → UNAVAILABLE; with the TEST version published (same
 *        PostgREST rules as the service: UNIT nodes of PUBLISHED + active versions) → AVAILABLE and the unit carries
 *        the exam derived from the mapping
 * Optional live check (a local production build):
 *   R-07 --base=http://localhost:3100 → GET /exams/ssc-cgl: the syllabus section matches the read model (same rule
 *        as R-04; scripts/smoke/_syllabus-expect.cjs) and shows no legacy SSC GD topic outside it
 * DB + PostgREST (GAP2-4c, migration 084):
 *   R-08 exam_syllabi / exam_topics / exam_unit_mappings / taxonomy_aliases exist only in schema retired with their
 *        rows; anon / authenticated have no USAGE on retired and no privilege on the tables; PostgREST answers
 *        "not found" for each table as anon and as qa-student
 *
 * Run: node scripts/test_gap2_4b_readers.cjs [--offline] [--base=http://localhost:3100]
 */
const { safeBegin } = require('./db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const { checkSyllabusSection, syllabusSectionText } = require('./smoke/_syllabus-expect.cjs');
const ARGS = process.argv.slice(2);
const OFFLINE = ARGS.includes('--offline');
const BASE = (ARGS.find((a) => a.startsWith('--base=')) || '').slice(7).replace(/\/$/, '');

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
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2000)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
/** Thenable query builder mock: every chained call returns itself; awaiting yields the table's result. */
function mockClient(results) {
  return {
    from(table) {
      const res = results[table] || { data: [], error: null };
      const b = new Proxy({}, { get(_, prop) { return prop === 'then' ? (ok, ko) => Promise.resolve(res).then(ok, ko) : () => b; } });
      return b;
    },
  };
}
const LEGACY = /\b(exam_syllabi|exam_topics|exam_unit_mappings|exam_topic_mappings|taxonomy_aliases)\b/;
// modules of the reconciliation workbench retired in GAP2-4c
const WORKBENCH = /@\/(services\/(exam-syllabus-resolution|exam-syllabus-reconciliation|exam-syllabus-readiness|exam-syllabus-tree-importer|operational-syllabus-reconciliation)\.service|services\/reconciliation-normalizer|types\/dynamic-syllabus-reconciliation|lib\/syllabus\/reconciliation-rows|components\/admin\/syllabus-reconciliation\/)/;
const RETIRED_TABLES = ['exam_syllabi', 'exam_topics', 'exam_unit_mappings', 'taxonomy_aliases'];

(async () => {
  console.log('GAP2-4b readers (canonical syllabus read model)');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ExamSyllabusSection } = require(path.join(ROOT, 'components/exams/exam-syllabus-section.tsx'));
  const render = (syllabus) => renderToStaticMarkup(React.createElement(ExamSyllabusSection, { syllabus, examTitle: 'Test Exam' }));

  // ---------------- static ----------------
  await test('R-01 no runtime reader of the legacy / retired syllabus tables; no import of a retired workbench module', async () => {
    const files = ['app', 'components', 'services', 'lib', 'actions', 'hooks'].flatMap((d) => walk(path.join(ROOT, d)));
    if (exists('middleware.ts')) files.push(path.join(ROOT, 'middleware.ts'));
    assert(files.length >= 300, `files scanned ${files.length} (min 300)`); // GATE-HYGIENE-1
    const bad = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (rel === 'types/database.ts') continue;
      stripComments(fs.readFileSync(f, 'utf8')).split('\n').forEach((l, i) => { if (LEGACY.test(l) || WORKBENCH.test(l)) bad.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`); });
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${files.length} files`;
  });

  await test('R-02 hub reads only the read model; legacy navigator / service / mapUnitToExam / projection / B-tags / workbench gone', async () => {
    const bad = [];
    for (const page of ['app/exams/[slug]/page.tsx', 'app/exams/[slug]/cycle/[cycleYear]/page.tsx']) {
      const s = read(page);
      if (!/<ExamSyllabusSection\b/.test(s) || !/id="syllabus"/.test(s)) bad.push(`${page}: syllabus section not rendered from ExamSyllabusSection`);
      if (/exam-syllabus-navigator|ExamSyllabusNavigator|curriculum\b/.test(stripComments(s))) bad.push(`${page}: legacy curriculum / navigator reference`);
    }
    const cand = stripComments(read('services/exam-knowledge/exam-knowledge-candidate.service.ts'));
    if (!/rpc\('fn_exam_syllabus_read_model'/.test(cand)) bad.push('candidate service does not call fn_exam_syllabus_read_model');
    if (/\.from\('(topics|subjects|questions)'\)/.test(cand)) bad.push('candidate service still derives a syllabus from tables');
    for (const gone of ['components/exams/exam-syllabus-navigator.tsx', 'services/exam-syllabus.service.ts']) if (exists(gone)) bad.push(`${gone} still exists`);
    const code = ['app', 'components', 'services', 'lib', 'actions'].flatMap((d) => walk(path.join(ROOT, d))).map((f) => [path.relative(ROOT, f).replace(/\\/g, '/'), fs.readFileSync(f, 'utf8')]);
    assert(code.length >= 300, `files scanned ${code.length} (min 300)`); // GATE-HYGIENE-1
    for (const [rel, s] of code) {
      if (/\bmapUnitToExam\b|saveSyllabusProjection|upsertExamUnitMapping/.test(s)) bad.push(`${rel}: mapUnitToExam / syllabus projection writer still present`);
      if (/B-CURRICULUM-MAPPING/.test(s)) bad.push(`${rel}: B-CURRICULUM-MAPPING tag`);
    }
    for (const gone of ['app/admin/syllabus-reconciliation', 'app/api/admin/syllabus-reconciliation', 'components/admin/syllabus-reconciliation',
      'services/exam-syllabus-tree-importer.service.ts', 'services/exam-syllabus-resolution.service.ts', 'services/operational-syllabus-reconciliation.service.ts',
      'services/exam-syllabus-reconciliation.service.ts', 'services/exam-syllabus-readiness.service.ts', 'services/reconciliation-normalizer.ts',
      'types/dynamic-syllabus-reconciliation.ts', 'lib/syllabus/reconciliation-rows.ts']) if (exists(gone)) bad.push(`${gone} still exists (GAP2-4c)`);
    if (/syllabus-reconciliation/.test(read('components/admin/admin-sidebar.tsx'))) bad.push('admin sidebar still links the workbench');
    assert(bad.length === 0, bad.join('\n        '));
  });

  await test('R-03 ExamSyllabusSection: components/ui only; NO_SYLLABUS / UNAVAILABLE / AVAILABLE states', async () => {
    const s = read('components/exams/exam-syllabus-section.tsx');
    const imports = [...s.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    assert(imports.length >= 1, 'no imports parsed from exam-syllabus-section.tsx'); // GATE-HYGIENE-1
    const foreign = imports.filter((i) => !/^@\/components\/ui\/|^@\/lib\/format$|^@\/types\/syllabus$|^lucide-react$/.test(i));
    assert(foreign.length === 0, `unexpected imports: ${foreign}`);
    const none = render({ state: 'NO_SYLLABUS', exam_id: 'x', version: null, nodes: [], totals: null });
    assert(/Syllabus coming soon/.test(none) && !/<li/.test(none), 'NO_SYLLABUS must show only the coming-soon state');
    const un = render({ state: 'UNAVAILABLE' });
    assert(/could not be loaded/.test(un) && !/<li/.test(un), 'UNAVAILABLE must show only the notice');
  });

  if (OFFLINE) {
    console.log('  SKIP  R-04 … R-08 (--offline)');
    return finish();
  }

  // ---------------- DB ----------------
  const { Client } = require('pg');
  const { dbTarget } = require('./db/_db-env.cjs');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const q = async (sql, p) => (await c.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  let CLAIMS = {};
  const rpc = async (who, fnName, args) => {
    await c.query(`SET LOCAL ROLE ${who === 'anon' ? 'anon' : 'authenticated'}`);
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(CLAIMS[who] || {})]);
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    try {
      return (await one(`SELECT public.${fnName}(${ph}) AS r`, args)).r;
    } finally {
      await c.query('RESET ROLE');
    }
  };
  const tx = async (mode, fn) => {
    await safeBegin(c, { readOnly: /READ ONLY/.test(mode) });
    try {
      return await fn();
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  };
  // same rules as PUBLISHED_TOPIC_MAPPINGS_SELECT + filters in services/curriculum-coverage.service.ts
  const publishedMappingRows = () => q(`SELECT m.canonical_node_id::text AS canonical_node_id,
        json_build_object('weightage_tier', n.weightage_tier, 'required_cognitive_depth', n.required_cognitive_depth, 'is_mandatory', n.is_mandatory,
          'version', json_build_object('exam_id', v.exam_id, 'exam', (SELECT json_build_object('id', e.id, 'title', e.title) FROM public.exams e WHERE e.id = v.exam_id))) AS node
      FROM public.exam_syllabus_canonical_mappings m
      JOIN public.exam_syllabus_nodes n ON n.id = m.syllabus_node_id AND n.node_kind = 'UNIT'
      JOIN public.exam_syllabus_versions v ON v.id = n.syllabus_version_id AND v.status = 'PUBLISHED' AND v.is_active`);
  const coverageTables = async () => ({
    exams: { data: await q(`SELECT id::text, title, slug FROM public.exams WHERE is_active`), error: null },
    subjects: { data: await q(`SELECT id::text, name, slug, display_order FROM public.subjects ORDER BY display_order`), error: null },
    topics: { data: await q(`SELECT id::text, subject_id::text, name, slug, display_order FROM public.topics ORDER BY display_order`), error: null },
    learning_units: { data: await q(`SELECT id::text, topic_id::text, subtopic_id::text, title, slug, unit_type, display_order, is_active FROM public.learning_units ORDER BY display_order`), error: null },
    learning_documents: { data: await q(`SELECT id::text, learning_unit_id::text, canonical_slug, document_type, status, updated_at FROM public.learning_documents`), error: null },
    document_versions: { data: await q(`SELECT id::text, document_id::text, version_number, review_status, author_type, is_published, updated_at FROM public.document_versions`), error: null },
    questions: { data: await q(`SELECT id::text, canonical_topic_id::text, status FROM public.questions`), error: null },
    exam_syllabus_canonical_mappings: { data: await publishedMappingRows(), error: null },
  });

  try {
    const fx = await tx('READ ONLY', async () => ({
      ids: Object.fromEntries((await q(`SELECT email, id FROM auth.users WHERE email IN ('qa-staff@courage-library.test','qa-admin@courage-library.test')`)).map((r) => [r.email, r.id])),
      exams: Object.fromEntries((await q(`SELECT slug, id, is_active FROM public.exams WHERE slug IN ('ssc-cgl','qa-syllabus-test')`)).map((r) => [r.slug, r])),
      // GAP2-4c: the legacy SSC GD topics now live in schema retired (owner connection only)
      gdTopics: (await q(`SELECT DISTINCT t.name FROM retired.exam_topics et JOIN public.canonical_taxonomy_nodes t ON t.id = et.topic_id`)).map((r) => r.name),
      topics: await q(`SELECT t.id::text id, t.name FROM public.canonical_taxonomy_nodes t
                         WHERE t.node_type = 'TOPIC' AND t.is_active
                         ORDER BY (SELECT count(*) FROM public.questions x WHERE x.canonical_topic_id = t.id AND x.status = 'published') DESC, t.name LIMIT 2`),
    }));
    assert(fx.ids['qa-staff@courage-library.test'] && fx.ids['qa-admin@courage-library.test'], 'QA staff / admin identities missing');
    assert(fx.exams['ssc-cgl'] && fx.exams['qa-syllabus-test'], 'ssc-cgl or the QA test exam (migration 081) missing');
    assert(fx.exams['qa-syllabus-test'].is_active === false, 'the QA test exam must stay inactive');
    assert(fx.topics.length === 2, 'need two active TOPICs');
    // GATE-HYGIENE-1: R-04 / R-07 legacy-topic leak checks iterate gdTopics — an empty set would pass vacuously
    assert(fx.gdTopics.length >= 1, 'no legacy SSC GD topic names resolved from retired.exam_topics');
    fx.topic = fx.topics[0];
    fx.topic2 = fx.topics[1];
    CLAIMS = {
      staff: { sub: fx.ids['qa-staff@courage-library.test'], role: 'authenticated', email: 'qa-staff@courage-library.test', app_metadata: { role: 'staff' } },
      admin: { sub: fx.ids['qa-admin@courage-library.test'], role: 'authenticated', email: 'qa-admin@courage-library.test', app_metadata: { role: 'admin' } },
    };

    // QB-KEY-1 round 2 (audited amendment; was: pinned NO_SYLLABUS + "Syllabus coming soon"): the read model must agree
    // with the DB (a PUBLISHED version ⇔ AVAILABLE with that version) and the section must render what it says.
    await test('R-04 SSC CGL now: read model (anon) agrees with the DB (PUBLISHED ⇔ AVAILABLE) and the section renders it', async () =>
      tx('READ ONLY', async () => {
        const published = (await q(`SELECT id::text FROM public.exam_syllabus_versions WHERE exam_id = $1 AND status = 'PUBLISHED'`, [fx.exams['ssc-cgl'].id])).map((r) => r.id);
        const rm = await rpc('anon', 'fn_exam_syllabus_read_model', [fx.exams['ssc-cgl'].id, null]);
        const html = render(rm);
        const sy = checkSyllabusSection(`<section id="syllabus">${html}</section>`, rm);
        if (published.length) {
          assert(published.length === 1 && rm.state === 'AVAILABLE' && rm.version && rm.version.id === published[0] && rm.nodes.length > 0, `CGL read model ${rm.state} vs ${published.length} PUBLISHED`);
          assert(sy.ok, sy.detail);
          // nothing beyond the read model: a legacy SSC GD topic name may appear only as a topic of the read model
          const modelTopics = new Set(rm.nodes.flatMap((n) => (n.topics || []).map((t) => t.name)));
          for (const t of fx.gdTopics) assert(!html.includes(t) || modelTopics.has(t), `legacy SSC GD topic rendered outside the read model: ${t}`);
          return sy.detail;
        }
        assert(rm.state === 'NO_SYLLABUS' && rm.nodes.length === 0, `CGL read model: ${rm.state} (no PUBLISHED version)`);
        assert(sy.ok, sy.detail);
        assert(!/practice question|lesson|High yield|Core|questions expected/i.test(html.replace(/We are preparing[^<]*/, '')), 'fabricated syllabus content rendered');
        for (const t of fx.gdTopics) assert(!html.includes(t), `legacy SSC GD topic rendered: ${t}`);
        return 'NO_SYLLABUS';
      }));

    let published = null;
    await test('R-05 published TEST version (QA exam, rolled back) → AVAILABLE tree: tier, expected range only when known, live counts', async () =>
      tx('READ WRITE', async () => {
        const exam = fx.exams['qa-syllabus-test'].id;
        const d = await rpc('staff', 'fn_syllabus_create_draft', [exam, null, null, null]);
        const sec = (await rpc('staff', 'fn_syllabus_upsert_node', [d.version_id, { kind: 'SECTION', title: 'GAP2-4b Section', weightage_tier: 'HIGH_YIELD' }])).node_id;
        const u1 = (await rpc('staff', 'fn_syllabus_upsert_node', [d.version_id, { kind: 'UNIT', title: 'GAP2-4b Unit known', parent_id: sec, weightage_tier: 'CORE', expected_questions_min: 3, expected_questions_max: 5 }])).node_id;
        const u2 = (await rpc('staff', 'fn_syllabus_upsert_node', [d.version_id, { kind: 'UNIT', title: 'GAP2-4b Unit unknown', parent_id: sec }])).node_id;
        await rpc('staff', 'fn_syllabus_set_unit_mappings', [u1, [fx.topic.id], null]);
        await rpc('staff', 'fn_syllabus_set_unit_mappings', [u2, [fx.topic2.id], null]);
        const pubRes = await rpc('admin', 'fn_syllabus_publish', [d.version_id]);
        assert(pubRes && pubRes.success === true, `publish refused: ${JSON.stringify(pubRes).slice(0, 600)}`);
        const rm = await rpc('anon', 'fn_exam_syllabus_read_model', [exam, null]);
        assert(rm.state === 'AVAILABLE' && rm.version.id === d.version_id, `state ${rm.state}`);
        const html = render(rm);
        const indep = await one(`SELECT (SELECT count(*)::int FROM public.questions x WHERE x.canonical_topic_id = $1 AND x.status = 'published') qn`, [fx.topic.id]);
        const bad = [];
        for (const s of ['GAP2-4b Section', 'GAP2-4b Unit known', 'GAP2-4b Unit unknown', fx.topic.name, 'High yield', 'Core', '3–5 questions expected']) if (!html.includes(s)) bad.push(`missing "${s}"`);
        const expectQ = indep.qn > 0 ? `${indep.qn.toLocaleString('en-IN')} practice question` : 'Questions coming soon';
        if (!html.includes(expectQ)) bad.push(`question count "${expectQ}" not rendered`);
        // the unknown unit shows no range at all (never "0 questions")
        const unknownLi = html.slice(html.indexOf('GAP2-4b Unit unknown'), html.indexOf('</li>', html.indexOf('GAP2-4b Unit unknown')));
        if (/questions expected|0 questions/.test(unknownLi)) bad.push('unknown range rendered as a value');
        if (!/<details/.test(html) || !/<summary/.test(html)) bad.push('section is not a disclosure group');
        assert(bad.length === 0, bad.join('\n        '));
        // a learning unit on the mapped topic (rolled back) so the coverage matrix has a unit to attach the exam to
        await q(`INSERT INTO public.learning_units (topic_id, title, slug, unit_type, estimated_minutes, display_order, is_active)
                 VALUES ($1, 'GAP2-4b test unit', 'gap2-4b-test-unit', 'CONCEPT_LESSON', 10, 999, true)`, [fx.topic.id]);
        published = { cov: await coverageTables() };
        return `units 2, topic q=${indep.qn}`;
      }));

    await test('R-06 coverage: UNAVAILABLE with nothing published; AVAILABLE + derived exam with the TEST version published', async () => {
      const { CurriculumCoverageService } = require(path.join(ROOT, 'services/curriculum-coverage.service.ts'));
      const now = await tx('READ ONLY', coverageTables);
      const realPublished = now.exam_syllabus_canonical_mappings.data.length;
      const m0 = await CurriculumCoverageService.getCurriculumCoverageMatrix(mockClient(now));
      if (realPublished === 0) {
        assert(m0.status === 'UNAVAILABLE' && /no published syllabus/.test(m0.unavailableReason), `nothing published but ${m0.status}`);
        assert(m0.subjects.length === 0 && Object.values(m0.overall).every((v) => v === 0), 'figures without a published syllabus');
      }
      assert(published, 'R-05 did not capture the published state');
      const m1 = await CurriculumCoverageService.getCurriculumCoverageMatrix(mockClient(published.cov));
      assert(m1.status === 'AVAILABLE', `with a published version: ${m1.status} ${m1.unavailableReason || ''}`);
      const units = m1.subjects.flatMap((s) => s.topics).filter((t) => t.topicId === fx.topic.id || t.id === fx.topic.id).flatMap((t) => t.units);
      assert(units.length > 0, 'the mapped topic has no units in the matrix');
      const qa = fx.exams['qa-syllabus-test'].id;
      assert(units.every((u) => u.mappedExams.some((e) => e.examId === qa)), 'unit does not carry the exam derived from the published mapping');
      const others = m1.subjects.flatMap((s) => s.topics).filter((t) => ![fx.topic.id, fx.topic2.id].includes(t.topicId || t.id)).flatMap((t) => t.units);
      assert(!others.some((u) => u.mappedExams.some((e) => e.examId === qa)), 'exam attached to an unmapped topic');
      return `now ${m0.status} (${realPublished} published mappings); with TEST version AVAILABLE, ${units.length} unit(s) derived`;
    });

    await test('R-08 legacy tables only in schema retired (rows kept, no anon / authenticated access); PostgREST "not found" as anon and qa-student', async () => {
      const cat = await tx('READ ONLY', async () => ({
        where: await q(`SELECT c.relname, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND c.relname = ANY($1)`, [RETIRED_TABLES]),
        counts: (await q(`SELECT (SELECT count(*)::int FROM retired.exam_syllabi) exam_syllabi, (SELECT count(*)::int FROM retired.exam_topics) exam_topics,
                                 (SELECT count(*)::int FROM retired.exam_unit_mappings) exam_unit_mappings, (SELECT count(*)::int FROM retired.taxonomy_aliases) taxonomy_aliases`))[0],
        usage: (await q(`SELECT has_schema_privilege('anon', 'retired', 'USAGE') a, has_schema_privilege('authenticated', 'retired', 'USAGE') u`))[0],
        privs: await q(`SELECT c.relname, r.rolname FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
                         WHERE c.relnamespace = 'retired'::regnamespace AND c.relname = ANY($1)
                           AND (has_table_privilege(r.rolname, c.oid, 'SELECT') OR has_table_privilege(r.rolname, c.oid, 'INSERT')
                                OR has_table_privilege(r.rolname, c.oid, 'UPDATE') OR has_table_privilege(r.rolname, c.oid, 'DELETE'))`, [RETIRED_TABLES]),
      }));
      const bad = [];
      for (const t of RETIRED_TABLES) {
        const at = cat.where.filter((w) => w.relname === t).map((w) => w.nspname);
        if (JSON.stringify(at) !== JSON.stringify(['retired'])) bad.push(`${t} lives in ${at.join(',') || 'nowhere'}`);
      }
      if (JSON.stringify(cat.counts) !== JSON.stringify({ exam_syllabi: 1, exam_topics: 18, exam_unit_mappings: 0, taxonomy_aliases: 0 })) bad.push(`row counts ${JSON.stringify(cat.counts)}`);
      if (cat.usage.a || cat.usage.u) bad.push('anon / authenticated have USAGE on retired');
      if (cat.privs.length) bad.push(`privileges remain: ${cat.privs.map((p) => p.relname + ':' + p.rolname).join(', ')}`);
      // PostgREST: the tables are not exposed (public schema only) — as anon and as the permanent QA student
      const { readEnv } = require('./db/_db-env.cjs');
      const env = readEnv();
      const url = env('NEXT_PUBLIC_SUPABASE_URL');
      const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      // CI-FIX-1 (#74): CAPTCHA-safe QA session (magic-link token minted server-side; no password sign-in)
      const { qaAccessToken } = require('./live/qa-session.cjs');
      const student = await qaAccessToken('qa-student@courage-library.test').catch((e) => assert(false, `qa-student session failed (${e.code || e.name})`));
      const seen = [];
      for (const t of RETIRED_TABLES) {
        for (const [who, bearer] of [['anon', anon], ['student', student]]) {
          let res = null;
          for (let i = 1; i <= 3 && !res; i++) res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${bearer}` } }).catch(() => null);
          assert(res, `${t}:${who} request failed`);
          const body = await res.json().catch(() => null);
          const code = body && !Array.isArray(body) ? body.code : null;
          // 404 + PGRST205 = relation not in the exposed schema cache; 401/403/42501 = permission error
          const ok = res.status === 404 || res.status === 401 || res.status === 403 || code === 'PGRST205' || code === '42501';
          if (!ok) bad.push(`${t}:${who} → ${res.status}${Array.isArray(body) ? ' rows ' + body.length : ' ' + code}`);
          seen.push(`${res.status}${code ? '/' + code : ''}`);
        }
      }
      assert(bad.length === 0, bad.join('\n        '));
      return `retired only; rows 1/18/0/0; REST ${[...new Set(seen)].join(', ')} (anon + student × ${RETIRED_TABLES.length})`;
    });

    if (BASE) {
      // QB-KEY-1 round 2 (audited amendment; was: pinned "Syllabus coming soon")
      await test(`R-07 ${BASE}/exams/ssc-cgl syllabus section matches the read model; no legacy SSC GD topic outside it`, async () => {
        const res = await fetch(`${BASE}/exams/ssc-cgl`, { redirect: 'manual' });
        assert(res.status === 200, `status ${res.status}`);
        const html = await res.text();
        const rm = await tx('READ ONLY', () => rpc('anon', 'fn_exam_syllabus_read_model', [fx.exams['ssc-cgl'].id, null]));
        const sy = checkSyllabusSection(html, rm);
        assert(sy.ok, sy.detail);
        const sec = syllabusSectionText(html);
        const modelTopics = new Set((rm.nodes || []).flatMap((n) => (n.topics || []).map((t) => t.name)));
        for (const t of fx.gdTopics) assert(!sec.includes(t) || modelTopics.has(t), `legacy topic in the syllabus section outside the read model: ${t}`);
        return sy.detail;
      });
    }
  } finally {
    await c.end().catch(() => {});
  }
  finish();
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });

function finish() {
  console.log(`\nGAP2-4b readers: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}
