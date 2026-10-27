/**
 * COURAGE LIBRARY — QF-1 QUESTION FACTORY OFFLINE TEST SUITE
 *
 * Fully offline: no network, no .env.local, no database. Supabase is replaced
 * by a recording mock; admin auth is mocked. Run: node scripts/test_qf1_question_factory.cjs
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

for (const k of Object.keys(process.env)) {
  if (/SUPABASE|POSTGRES|DATABASE_URL|ADMIN_EMAILS/.test(k)) delete process.env[k];
}

// ---------- TS transpile + @/ alias ----------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(out.outputText, filename);
};

// ---------- Recording Supabase mock ----------
const WRITE_OPS = new Set(['insert', 'update', 'delete', 'upsert']);
function createMockSupabase(handler) {
  const log = { queries: [], rpcs: [], writes: [] };
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = {};
    const record = (op) => (...args) => {
      q.ops.push({ op, args });
      if (WRITE_OPS.has(op)) log.writes.push({ table, op, args });
      return chain;
    };
    ['select', 'eq', 'neq', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete', 'upsert', 'ilike', 'is', 'not', 'gte', 'lt'].forEach((op) => {
      chain[op] = record(op);
    });
    const resolve = (mode) => {
      log.queries.push(q);
      return Promise.resolve(handler({ table, ops: q.ops, mode }) || { data: null, error: null });
    };
    chain.maybeSingle = () => resolve('maybeSingle');
    chain.single = () => resolve('single');
    chain.then = (onF, onR) => resolve('many').then(onF, onR);
    return chain;
  };
  return {
    log,
    from: (table) => builder(table),
    rpc: (name, args) => {
      log.rpcs.push({ name, args });
      return Promise.resolve(handler({ rpc: name, args }) || { data: null, error: null });
    },
  };
}
const filterVal = (ops, op, col) => {
  const f = ops.find((o) => o.op === op && o.args[0] === col);
  return f ? f.args[1] : undefined;
};

// ---------- Module mocks for admin auth / supabase factory ----------
const authState = { isAdmin: true, userId: '11111111-1111-4111-8111-111111111111', userEmail: 'admin@example.test' };
let currentSupabase = null;
// SEC-1B: admin checks run through the canonical guard, which reads the session user.
const sessionUser = () => (authState.isAdmin ? { id: authState.userId, email: authState.userEmail, app_metadata: { role: 'admin' }, user_metadata: {} } : null);
const withSession = (client) => Object.assign(Object.create(null), client || {}, { auth: { getUser: async () => ({ data: { user: sessionUser() }, error: null }) } });
const MOCKS = {
  'server-only': {},
  '@/services/admin.service': {
    AdminService: { checkIsAdminOrStaff: async () => ({ ...authState }) },
  },
  '@/lib/supabase/server': {
    createAdminServerSupabaseClient: () => currentSupabase,
    createServerSupabaseClient: async () => withSession(currentSupabase),
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};

// ---------- Harness ----------
let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    lines.push(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    lines.push(`  FAIL  ${name}\n        ${e && e.message ? e.message : e}`);
  }
}
function assert(c, m) {
  if (!c) throw new Error(m || 'assertion failed');
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---------- Fixtures ----------
const TOPIC = '22222222-2222-4222-8222-222222222222';
const OTHER_TOPIC = '33333333-3333-4333-8333-333333333333';
const SUBTOPIC = '44444444-4444-4444-8444-444444444444';
const FOREIGN_SUBTOPIC = '55555555-5555-4555-8555-555555555555';
const EXAM = '66666666-6666-4666-8666-666666666666';
const INACTIVE_EXAM = '77777777-7777-4777-8777-777777777777';
const HASH = 'a'.repeat(64);

function item(overrides = {}) {
  return {
    clientRef: 'q1',
    stem: 'A train 120 m long passes a pole in 6 seconds. What is its speed in km/h?',
    language: 'en',
    difficulty: 'medium',
    options: [
      { key: 'A', text: '20 km/h' },
      { key: 'B', text: '72 km/h' },
      { key: 'C', text: '60 km/h' },
      { key: 'D', text: '54 km/h' },
    ],
    correctKey: 'B',
    explanationMd: 'Speed = 120/6 = 20 m/s; converting with 18/5 gives 72 km/h. Option A forgets to convert units.',
    sourceType: 'ORIGINAL',
    ...overrides,
  };
}
function spec(items, overrides = {}) {
  return { specVersion: '1.0.0', contractVersion: 'CL-QUESTION-AUTHOR-v1.0', contextHash: HASH, target: { topicId: TOPIC }, items, ...overrides };
}
function lookups(overrides = {}) {
  const calls = { exact: 0, stems: 0 };
  return {
    calls,
    resolveTarget: async (t) => {
      const errors = [];
      if (t.topicId !== TOPIC) errors.push('Topic not found.');
      if (t.subtopicId && t.subtopicId !== SUBTOPIC) errors.push('Subtopic does not belong to the target topic.');
      if (t.examId && t.examId !== EXAM) errors.push('Exam not found or inactive.');
      return { ok: errors.length === 0, errors, topic: null, subtopic: null, exam: null };
    },
    rebuildContextHash: async () => HASH,
    resolveExamSlug: async (slug) => (slug === 'ssc-cgl' ? EXAM : null),
    findExactDuplicates: async (topicId, stems) => {
      calls.exact++;
      // checksum stand-in for the DB function: identical text → identical checksum.
      return stems.map((s, index) => ({ index, checksum: `ck:${s.trim().toLowerCase()}`, duplicateVersionId: null }));
    },
    listExistingStems: async () => {
      calls.stems++;
      return [];
    },
    ...overrides,
  };
}
const OPTS = { origin: 'AI_EXTERNAL', requireContextHash: true, cognitiveTrapCodes: [], currentYear: 2026 };

(async () => {
  const V = require(path.join(ROOT, 'services/question-factory/question-validation.service.ts'));
  const { QuestionValidationService, jaccardSimilarity } = V;
  const { QuestionContextBuilder } = require(path.join(ROOT, 'services/question-factory/question-context-builder.service.ts'));
  const { QuestionPromptBuilder } = require(path.join(ROOT, 'services/question-factory/question-prompt-builder.service.ts'));
  const { QuestionTaxonomyResolver } = require(path.join(ROOT, 'services/question-factory/question-taxonomy-resolver.ts'));
  const { QuestionFactoryImporterService } = require(path.join(ROOT, 'services/question-factory/question-factory-importer.service.ts'));
  const { QuestionCsvImporterService } = require(path.join(ROOT, 'services/question-factory/question-csv-importer.service.ts'));
  const { AdminQuestionFactoryService } = require(path.join(ROOT, 'services/question-factory/admin-question-factory.service.ts'));

  const validate = (s, lk = lookups(), opts = OPTS) => QuestionValidationService.validateBatch(s, lk, opts);
  const itemErrors = (r, i = 0) => (r.items[i] ? r.items[i].errors.join(' | ') : r.errors.join(' | '));

  // ===================== CONTEXT BUILDER =====================
  console.log('\n[Context builder]');
  const raw = () => ({
    subject: { id: 'subj', name: 'Quantitative Aptitude', description: 'Maths' },
    topic: { id: TOPIC, name: 'Speed <Time> & Distance', description: 'Relative <b>speed</b>' },
    subtopic: null,
    exam: null,
    publishedStems: [
      { versionId: 'v2', stem: 'Second stem' },
      { versionId: 'v1', stem: 'First stem with <script>' },
    ],
    cognitiveTrapCodes: ['CALCULATION_SLIP', 'DISTRACTOR_TRAP'],
  });
  const req = { topicId: TOPIC, count: 10, difficultyMix: { easy: 3, medium: 5, hard: 2 } };

  await test('CTX-1 deterministic: same input → same hash', async () => {
    assert(QuestionContextBuilder.assemble(raw(), req).contextHash === QuestionContextBuilder.assemble(raw(), req).contextHash);
  });
  await test('CTX-2 key order / stem order irrelevant', async () => {
    const r = raw();
    const reordered = {
      cognitiveTrapCodes: [...r.cognitiveTrapCodes].reverse(),
      publishedStems: [...r.publishedStems].reverse(),
      exam: null,
      subtopic: null,
      topic: { description: r.topic.description, name: r.topic.name, id: r.topic.id },
      subject: { description: r.subject.description, name: r.subject.name, id: r.subject.id },
    };
    assert(QuestionContextBuilder.assemble(reordered, req).contextHash === QuestionContextBuilder.assemble(r, req).contextHash);
  });
  await test('CTX-3 hash changes when data changes; not when count/mix change', async () => {
    const base = QuestionContextBuilder.assemble(raw(), req).contextHash;
    const r2 = raw();
    r2.publishedStems.push({ versionId: 'v3', stem: 'New published stem' });
    assert(QuestionContextBuilder.assemble(r2, req).contextHash !== base, 'data change must change hash');
    const other = QuestionContextBuilder.assemble(raw(), { topicId: TOPIC, count: 1, difficultyMix: { easy: 1, medium: 0, hard: 0 } });
    assert(other.contextHash === base, 'count/mix must not affect hash');
  });
  await test('CTX-4 bounded ≤ 32,000 chars with oversized input', async () => {
    const r = raw();
    r.publishedStems = Array.from({ length: 500 }, (_, i) => ({ versionId: `v${String(i).padStart(4, '0')}`, stem: 'x'.repeat(5000) }));
    r.topic.description = 'y'.repeat(50000);
    const c = QuestionContextBuilder.assemble(r, req);
    assert(c.contextCharacters <= 32000, `size ${c.contextCharacters}`);
    assert(c.doNotDuplicateStems.length <= 60, 'stems capped at 60');
    assert(c.doNotDuplicateStems.every((s) => s.length <= 161), 'stems truncated to 160');
  });
  await test('CTX-5 escapes < and >', async () => {
    const c = QuestionContextBuilder.assemble(raw(), req);
    const all = JSON.stringify(c);
    assert(!/[<>]/.test(all.replace(/\\u003c|\\u003e/g, '')), 'raw angle brackets present');
    assert(c.topic.name.includes('&lt;Time&gt;'));
  });
  await test('CTX-6 only PUBLISHED + current stems are queried (fetchRawData filters)', async () => {
    const sb = createMockSupabase(({ table, ops, mode }) => {
      if (table === 'topics') return { data: { id: TOPIC, name: 'T', slug: 't', description: '', is_active: true, subject_id: 's', subjects: { id: 's', name: 'S' } }, error: null };
      if (table === 'question_versions') return { data: [{ id: 'v1', question_text: 'published stem', created_at: '2026-01-01' }], error: null };
      if (table === 'mistake_cognitive_types') return { data: [{ id: 'CALCULATION_SLIP' }, { id: 'UNCLASSIFIED' }], error: null };
      return { data: null, error: null };
    });
    const rawData = await QuestionContextBuilder.fetchRawData(sb, { topicId: TOPIC, subtopicId: null, examId: null });
    const qv = sb.log.queries.find((q) => q.table === 'question_versions');
    assert(filterVal(qv.ops, 'eq', 'lifecycle_status') === 'PUBLISHED', 'lifecycle filter missing');
    assert(filterVal(qv.ops, 'eq', 'is_current') === true, 'is_current filter missing');
    assert(filterVal(qv.ops, 'eq', 'questions.status') === 'published', 'question status filter missing');
    assert(!rawData.cognitiveTrapCodes.includes('UNCLASSIFIED'));
    assert(sb.log.writes.length === 0, 'context builder wrote to DB');
  });

  // ===================== PROMPT BUILDER =====================
  console.log('[Prompt builder]');
  await test('PROMPT-1 contains contract id, schema and rules; no secrets', async () => {
    const p = QuestionPromptBuilder.buildPrompt(QuestionContextBuilder.assemble(raw(), req)).prompt;
    ['CL-QUESTION-AUTHOR-v1.0', '"specVersion": "1.0.0"', '"correctKey"', 'EXACTLY 4 options', 'EXACTLY ONE option is correct', 'NO copyrighted verbatim', 'NO citation markers', 'NO images', '```json'].forEach((s) =>
      assert(p.includes(s), `missing: ${s}`)
    );
    assert(!/eyJ|service_role|postgres(ql)?:\/\/|sb_secret|SUPABASE_/i.test(p), 'secret-like content in prompt');
    assert(p.includes(HASH) === false && p.includes(QuestionContextBuilder.assemble(raw(), req).contextHash), 'context hash embedded');
  });

  // ===================== GATE 1 =====================
  console.log('[Gate 1]');
  const g1Cases = [
    ['missing stem', spec([item({ stem: undefined })])],
    ['3 options', spec([item({ options: item().options.slice(0, 3) })])],
    ['5 options', spec([item({ options: [...item().options, { key: 'A', text: 'extra' }] })])],
    ['duplicate keys', spec([item({ options: [{ key: 'A', text: 'a' }, { key: 'A', text: 'b' }, { key: 'C', text: 'c' }, { key: 'D', text: 'd' }] })])],
    ['duplicate option texts', spec([item({ options: [{ key: 'A', text: '72 km/h' }, { key: 'B', text: '72  KM/H' }, { key: 'C', text: 'c' }, { key: 'D', text: 'd' }] })])],
    ['correctKey not in options', spec([item({ correctKey: 'E' })])],
    ['bad enum (difficulty)', spec([item({ difficulty: 'expert' })])],
    ['image field present', spec([item({ question_image_url: 'https://x/y.png' })])],
    ['option image field present', spec([item({ options: [{ key: 'A', text: 'a', imageUrl: 'https://x' }, { key: 'B', text: 'b' }, { key: 'C', text: 'c' }, { key: 'D', text: 'd' }] })])],
    ['short explanation', spec([item({ explanationMd: 'too short' })])],
  ];
  for (const [name, s] of g1Cases) {
    await test(`G1 reject: ${name}`, async () => {
      const r = await validate(s);
      assert(r.acceptedCount === 0 && !r.items[0].gates.GATE_1_SCHEMA.passed, itemErrors(r));
    });
  }
  await test('G1 reject: > 25 items (batch)', async () => {
    const r = await validate(spec(Array.from({ length: 26 }, (_, i) => item({ clientRef: `q${i}`, stem: `Stem number ${i} unique text` }))));
    assert(!r.passed && !r.batchGates.GATE_1_SCHEMA.passed && r.acceptedCount === 0);
  });
  await test('G1 reject: unknown top-level field', async () => {
    const r = await validate({ ...spec([item()]), publish: true });
    assert(!r.passed && r.errors.join(' ').includes('Unknown top-level field'));
  });
  await test('G1 pass: valid item accepted', async () => {
    const r = await validate(spec([item()]));
    assert(r.passed && r.acceptedCount === 1, itemErrors(r));
  });

  // ===================== GATE 2 =====================
  console.log('[Gate 2]');
  await test('G2 sanitize: oaicite / 【†】 / [cite: 1] stripped, item accepted with warning', async () => {
    const r = await validate(spec([item({ explanationMd: item().explanationMd + ' :contentReference[oaicite:0]{index=0} 【4†source】 [cite: 1]' })]));
    assert(r.acceptedCount === 1, itemErrors(r));
    const ex = r.items[0].normalizedItem.explanationMd;
    assert(!/oaicite|†|\[cite/.test(ex), 'artifacts remain');
    assert(r.items[0].gates.GATE_2_SECURITY.warnings.length > 0, 'no strip warning');
  });
  await test('G2 reject: residual artifact after sanitization', async () => {
    const sanitizer = require(path.join(ROOT, 'services/ai/ai-citation-sanitizer.ts'));
    const orig = sanitizer.sanitizeAiCitationArtifacts;
    sanitizer.sanitizeAiCitationArtifacts = (t) => t; // simulate a sanitizer bypass
    try {
      const r = await validate(spec([item({ stem: item().stem + ' [cite: 3]' })]));
      assert(r.acceptedCount === 0 && r.items[0].errors.join(' ').includes('residual citation'), itemErrors(r));
    } finally {
      sanitizer.sanitizeAiCitationArtifacts = orig;
    }
  });
  for (const [name, stem] of [
    ['<script>', 'What is 2+2? <script>alert(1)</script>'],
    ['onerror=', 'Look at <img src=x onerror=alert(1)> and answer'],
    ['javascript:', 'See [link](javascript:alert(1)) and answer'],
    ['<iframe>', 'Watch <iframe src="https://x"></iframe> then answer'],
  ]) {
    await test(`G2 reject: ${name}`, async () => {
      const r = await validate(spec([item({ stem })]));
      assert(r.acceptedCount === 0 && !r.items[0].gates.GATE_2_SECURITY.passed, itemErrors(r));
    });
  }

  // ===================== GATE 3 =====================
  console.log('[Gate 3]');
  await test('G3 reject: unknown topic, and resolver never writes', async () => {
    const sb = createMockSupabase(({ table }) => (table === 'topics' ? { data: null, error: null } : { data: null, error: null }));
    const resolver = new QuestionTaxonomyResolver(sb);
    const lk = lookups({ resolveTarget: (t) => resolver.resolveTarget(t) });
    const r = await validate(spec([item()], { target: { topicId: OTHER_TOPIC } }), lk);
    assert(!r.passed && !r.batchGates.GATE_3_TAXONOMY.passed, r.errors.join(' '));
    assert(sb.log.writes.length === 0, 'resolver wrote to DB');
  });
  await test('G3 reject: subtopic of another topic', async () => {
    const sb = createMockSupabase(({ table }) => {
      if (table === 'topics') return { data: { id: TOPIC, name: 'T', slug: 't', is_active: true, subject_id: 's', subjects: { name: 'S' } }, error: null };
      if (table === 'subtopics') return { data: { id: FOREIGN_SUBTOPIC, name: 'Other', topic_id: OTHER_TOPIC, is_active: true }, error: null };
      return { data: null, error: null };
    });
    const resolver = new QuestionTaxonomyResolver(sb);
    const r = await validate(spec([item()], { target: { topicId: TOPIC, subtopicId: FOREIGN_SUBTOPIC } }), lookups({ resolveTarget: (t) => resolver.resolveTarget(t) }));
    assert(!r.passed && r.errors.join(' ').includes('does not belong'), r.errors.join(' '));
    assert(sb.log.writes.length === 0);
  });
  await test('G3 reject: inactive exam', async () => {
    const sb = createMockSupabase(({ table }) => {
      if (table === 'topics') return { data: { id: TOPIC, name: 'T', slug: 't', is_active: true, subject_id: 's', subjects: { name: 'S' } }, error: null };
      if (table === 'exams') return { data: { id: INACTIVE_EXAM, slug: 'old', title: 'Old', is_active: false }, error: null };
      return { data: null, error: null };
    });
    const resolver = new QuestionTaxonomyResolver(sb);
    const r = await validate(spec([item()], { target: { topicId: TOPIC, examId: INACTIVE_EXAM } }), lookups({ resolveTarget: (t) => resolver.resolveTarget(t) }));
    assert(!r.passed && r.errors.join(' ').toLowerCase().includes('inactive'), r.errors.join(' '));
  });
  await test('G3 reject: stale contextHash (STALE_CONTEXT)', async () => {
    const r = await validate(spec([item()]), lookups({ rebuildContextHash: async () => 'b'.repeat(64) }));
    assert(!r.passed && r.errors.join(' ').includes('STALE_CONTEXT'));
  });
  await test('G3 fail-closed: taxonomy lookup error', async () => {
    const r = await validate(spec([item()]), lookups({ resolveTarget: async () => { throw new Error('db down'); } }));
    assert(!r.passed && r.errors.join(' ').includes('fail-closed'));
  });

  // ===================== GATE 4 =====================
  console.log('[Gate 4]');
  await test('G4 reject: PYQ without year/exam', async () => {
    const r = await validate(spec([item({ sourceType: 'PYQ', pyq: { reference: 'somewhere' } })]));
    assert(r.acceptedCount === 0 && !r.items[0].gates.GATE_4_PROVENANCE.passed, itemErrors(r));
  });
  await test('G4 reject: PYQ without pyq block', async () => {
    const r = await validate(spec([item({ sourceType: 'PYQ' })]));
    assert(r.acceptedCount === 0 && !r.items[0].gates.GATE_4_PROVENANCE.passed);
  });
  await test('G4 reject: future year', async () => {
    const r = await validate(spec([item({ sourceType: 'PYQ', pyq: { examSlug: 'ssc-cgl', year: 2031, reference: 'SSC CGL 2031' } })]));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('year'));
  });
  await test('G4 reject: PYQ exam slug not found', async () => {
    const r = await validate(spec([item({ sourceType: 'PYQ', pyq: { examSlug: 'made-up-exam', year: 2023, reference: 'X' } })]));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('does not match'));
  });
  await test('G4 reject: ORIGINAL with pyq block', async () => {
    const r = await validate(spec([item({ pyq: { examSlug: 'ssc-cgl', year: 2023, reference: 'SSC CGL 2023' } })]));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('ORIGINAL'));
  });
  await test('G4 pass: valid PYQ', async () => {
    const r = await validate(spec([item({ sourceType: 'PYQ', pyq: { examSlug: 'ssc-cgl', year: 2023, reference: 'SSC CGL 2023 Tier 1' } })]));
    assert(r.acceptedCount === 1, itemErrors(r));
  });

  // ===================== GATE 5 =====================
  // Ruling B (2026-10-27): past-paper provenance accepts ANY existing exam (active or not), exactly like the SQL import
  // function; a TARGET exam (mapping) still has to be active. Nothing else changed.
  await test('G4 provenance: an existing INACTIVE exam resolves; an unknown slug does not; the query never filters on is_active', async () => {
    const GD = '6b933751-0000-4000-8000-000000000001';
    const sb = createMockSupabase(({ table, ops }) => {
      if (table !== 'exams') return { data: null, error: null };
      const slug = (ops.find((o) => o.op === 'eq' && o.args[0] === 'slug') || { args: [] }).args[1];
      return { data: slug === 'ssc-gd' ? { id: GD, slug: 'ssc-gd' } : null, error: null };
    });
    const resolver = new QuestionTaxonomyResolver(sb);
    assert((await resolver.resolveExamSlug('SSC-GD ')) === GD, 'inactive existing exam resolves (normalised slug)');
    assert((await resolver.resolveExamSlug('no-such-exam')) === null && (await resolver.resolveExamSlug('')) === null, 'unknown / empty slug → null');
    assert(!sb.log.queries.some((q) => q.ops.some((o) => o.args && o.args[0] === 'is_active')), 'no is_active filter for provenance');
    assert(sb.log.writes.length === 0, 'read only');
    const r = await validate(spec([item({ sourceType: 'PYQ', pyq: { examSlug: 'ssc-gd', year: 2025, reference: 'SSC GD 2025' } })]), lookups({ resolveExamSlug: (s) => resolver.resolveExamSlug(s) }));
    assert(r.items[0].gates.GATE_4_PROVENANCE.passed && r.items[0].gates.GATE_4_PROVENANCE.details.pyqExamId === GD, JSON.stringify(r.items[0].gates.GATE_4_PROVENANCE.errors));
  });
  await test('G4 target exam is still ACTIVE-only (mapping / visibility rule unchanged)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'services/question-factory/question-taxonomy-resolver.ts'), 'utf8');
    const fn = src.slice(src.indexOf('async getActiveExamById('), src.indexOf('async getActiveExamById(') + 600);
    assert(/is_active/.test(fn) && /exam = await this\.getActiveExamById\(target\.examId\)/.test(src), 'resolveTarget keeps the active-exam check');
  });
  console.log('[Gate 5]');
  const words = (n, last) => Array.from({ length: n - 1 }, (_, i) => `word${i}`).concat([last]).join(' ');
  await test('G5 jaccard fixtures: 21 tokens → 0.90, 9 tokens → 0.75', async () => {
    assert(Math.abs(jaccardSimilarity(words(21, 'alpha'), words(21, 'beta')) - 0.9) < 1e-9);
    assert(Math.abs(jaccardSimilarity(words(9, 'alpha'), words(9, 'beta')) - 0.75) < 1e-9);
  });
  await test('G5 reject: exact duplicate vs existing bank', async () => {
    const r = await validate(spec([item()]), lookups({
      findExactDuplicates: async (t, stems) => stems.map((s, index) => ({ index, checksum: 'ck', duplicateVersionId: '99999999-9999-4999-8999-999999999999' })),
    }));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('Exact duplicate'));
  });
  await test('G5 reject: duplicate within batch (DB checksum equal)', async () => {
    const r = await validate(spec([item({ clientRef: 'q1' }), item({ clientRef: 'q2', stem: '  ' + item().stem.toUpperCase() })]), lookups({
      findExactDuplicates: async (t, stems) => stems.map((s, index) => ({ index, checksum: 'same', duplicateVersionId: null })),
    }));
    assert(r.items[0].passed && !r.items[1].passed && r.items[1].errors.join(' ').includes('batch item'), itemErrors(r, 1));
  });
  await test('G5 reject: near-duplicate 0.90 vs existing', async () => {
    const r = await validate(spec([item({ stem: words(21, 'alpha') })]), lookups({
      listExistingStems: async () => [{ versionId: '88888888-8888-4888-8888-888888888888', stem: words(21, 'beta') }],
    }));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('Near-duplicate (0.90)'), itemErrors(r));
  });
  await test('G5 warn: near-duplicate 0.75 flagged, still accepted', async () => {
    const r = await validate(spec([item({ stem: words(9, 'alpha') })]), lookups({
      listExistingStems: async () => [{ versionId: '88888888-8888-4888-8888-888888888888', stem: words(9, 'beta') }],
    }));
    assert(r.acceptedCount === 1 && r.items[0].warnings.join(' ').includes('0.75') && r.items[0].nearDuplicates.length === 1, itemErrors(r));
  });
  await test('G5 fail-closed: checksum lookup error rejects', async () => {
    const r = await validate(spec([item()]), lookups({ findExactDuplicates: async () => { throw new Error('rpc down'); } }));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('fail-closed'));
  });
  await test('G5 fail-closed: stem lookup error rejects', async () => {
    const r = await validate(spec([item()]), lookups({ listExistingStems: async () => { throw new Error('timeout'); } }));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('fail-closed'));
  });
  await test('G5 fail-closed: wrong row count from DB rejects', async () => {
    const r = await validate(spec([item()]), lookups({ findExactDuplicates: async () => [] }));
    assert(r.acceptedCount === 0 && itemErrors(r).includes('fail-closed'));
  });

  // ===================== IMPORTER =====================
  console.log('[Importer]');
  const importerSb = () =>
    createMockSupabase(({ table, rpc }) => {
      if (table === 'mistake_cognitive_types') return { data: [], error: null };
      if (rpc === 'fn_import_question_drafts') return { data: { success: true, batch_id: 'batch-1', items: [{ client_ref: 'q1', question_id: 'qid', version_id: 'vid' }] }, error: null };
      return { data: null, error: null };
    });
  const aiPayload = (s) => '```json\n' + JSON.stringify(s) + '\n```';

  await test('IMP-1 dry-run performs zero writes and zero import RPCs', async () => {
    const sb = importerSb();
    const res = await QuestionFactoryImporterService.run({ mode: 'dry-run', origin: 'AI_EXTERNAL', actorId: authState.userId, supabase: sb, rawInput: aiPayload(spec([item()])), lookups: lookups() });
    assert(res.status === 'DRY_RUN' && res.report.acceptedCount === 1, JSON.stringify(res.report.errors));
    assert(sb.log.writes.length === 0, 'writes during dry-run');
    assert(!sb.log.rpcs.some((r) => r.name === 'fn_import_question_drafts'), 'import RPC during dry-run');
  });
  await test('IMP-2 commit sends only accepted items', async () => {
    const sb = importerSb();
    const res = await QuestionFactoryImporterService.run({
      mode: 'commit', origin: 'AI_EXTERNAL', actorId: authState.userId, supabase: sb,
      rawInput: aiPayload(spec([item({ clientRef: 'q1' }), item({ clientRef: 'q2', stem: 'Other <script>x</script> stem' })])),
      lookups: lookups(),
    });
    const call = sb.log.rpcs.find((r) => r.name === 'fn_import_question_drafts');
    assert(res.status === 'IMPORTED' && call, res.errorMessage);
    assert(call.args.p_batch.items.length === 1 && call.args.p_batch.items[0].client_ref === 'q1', 'rejected item sent');
    assert(call.args.p_batch.origin === 'AI_EXTERNAL' && call.args.p_actor === authState.userId);
    assert(sb.log.writes.length === 0, 'direct table writes outside the atomic RPC');
  });
  await test('IMP-3 commit with zero accepted items writes nothing', async () => {
    const sb = importerSb();
    const res = await QuestionFactoryImporterService.run({ mode: 'commit', origin: 'AI_EXTERNAL', actorId: authState.userId, supabase: sb, rawInput: aiPayload(spec([item({ correctKey: 'Z' })])), lookups: lookups() });
    assert(res.status === 'REJECTED' && sb.log.rpcs.length === 0 && sb.log.writes.length === 0);
  });
  await test('IMP-4 payload > 200 KB rejected before parsing', async () => {
    const res = await QuestionFactoryImporterService.run({ mode: 'dry-run', origin: 'AI_EXTERNAL', actorId: 'x', supabase: importerSb(), rawInput: 'x'.repeat(205 * 1024), lookups: lookups() });
    assert(res.status === 'REJECTED' && res.errorCode === 'PAYLOAD_TOO_LARGE');
  });
  await test('IMP-5 multiple fenced blocks / invalid JSON rejected', async () => {
    const r1 = await QuestionFactoryImporterService.run({ mode: 'dry-run', origin: 'AI_EXTERNAL', actorId: 'x', supabase: importerSb(), rawInput: '```json\n{}\n```\n```json\n{}\n```', lookups: lookups() });
    const r2 = await QuestionFactoryImporterService.run({ mode: 'dry-run', origin: 'AI_EXTERNAL', actorId: 'x', supabase: importerSb(), rawInput: '```json\n{not json\n```', lookups: lookups() });
    assert(r1.status === 'REJECTED' && r2.status === 'REJECTED' && r2.errorCode === 'INVALID_JSON');
  });

  // ===================== ADMIN SERVICE =====================
  console.log('[Admin service]');
  // Courage Studio (#84): approve also runs the server auto checks on the stored version, so the fixture is a complete
  // version (key among the options, explanation, topic, difficulty); versionState.explanation = null makes one fail.
  const versionState = { lifecycle: 'DRAFT', explanation: 'Because 12 × 3 = 36, option A is the only answer.' };
  const adminSb = () =>
    createMockSupabase(({ table, rpc, ops }) => {
      if (table === 'question_versions') return { data: { id: 'v1', lifecycle_status: versionState.lifecycle, question_id: 'q1', question_text: 'What is 12 × 3?', difficulty: 'medium', language: 'en', questions: { canonical_topic_id: TOPIC, topics: { name: 'Arithmetic' } }, question_options: [{ option_key: 'A', option_text: '36', order_index: 0 }, { option_key: 'B', option_text: '39', order_index: 1 }], question_answers: [{ correct_option_key: 'A', explanation_md: versionState.explanation }], question_version_authoring: [{}] }, error: null };
      if (table === 'admin_audit_logs') return { data: null, error: null };
      if (rpc) return { data: { success: true }, error: null };
      return { data: [], error: null };
    });
  const methods = [
    ['getTaxonomyTree', () => AdminQuestionFactoryService.getTaxonomyTree()],
    ['generatePrompt', () => AdminQuestionFactoryService.generatePrompt(req)],
    ['importAiPayload', () => AdminQuestionFactoryService.importAiPayload('{}', 'dry-run')],
    ['createManualDraft', () => AdminQuestionFactoryService.createManualDraft({ topicId: TOPIC }, item())],
    ['listReviewQueue', () => AdminQuestionFactoryService.listReviewQueue({})],
    ['getVersionDetail', () => AdminQuestionFactoryService.getVersionDetail('v1')],
    ['submitForReview', () => AdminQuestionFactoryService.submitForReview('v1')],
    ['requestChanges', () => AdminQuestionFactoryService.requestChanges('v1', 'fix')],
    ['approve', () => AdminQuestionFactoryService.approve('v1', {})],
    ['reject', () => AdminQuestionFactoryService.reject('v1', 'no')],
    ['editDraft', () => AdminQuestionFactoryService.editDraft('v1', item())],
    ['createRevision', () => AdminQuestionFactoryService.createRevision('q1', item())],
    ['publish', () => AdminQuestionFactoryService.publish('v1')],
    ['getCoverage', () => AdminQuestionFactoryService.getCoverage()],
  ];
  await test(`ADM-1 every method (${methods.length}) rejects non-admin, with zero DB access`, async () => {
    authState.isAdmin = false;
    try {
      for (const [name, fn] of methods) {
        currentSupabase = adminSb();
        const res = await fn();
        assert(res.success === false && res.errorCode === 'UNAUTHORIZED', `${name} did not reject`);
        assert(currentSupabase.log.queries.length === 0 && currentSupabase.log.rpcs.length === 0, `${name} touched DB`);
      }
    } finally {
      authState.isAdmin = true;
    }
  });
  await test('ADM-2 approve without (complete) checklist → error, no RPC', async () => {
    versionState.lifecycle = 'IN_REVIEW';
    currentSupabase = adminSb();
    const r1 = await AdminQuestionFactoryService.approve('v1', null);
    const r2 = await AdminQuestionFactoryService.approve('v1', { correct_key_verified: true });
    assert(!r1.success && r1.errorCode === 'QF_CHECKLIST_REQUIRED' && !r2.success && r2.errorCode === 'QF_CHECKLIST_REQUIRED');
    assert(currentSupabase.log.rpcs.length === 0);
  });
  await test('ADM-3 approve with full checklist calls transition RPC + audit', async () => {
    versionState.lifecycle = 'IN_REVIEW';
    currentSupabase = adminSb();
    const full = { correct_key_verified: true, explanation_correct: true, no_ambiguity: true, topic_correct: true, difficulty_sensible: true, provenance_verified: true };
    const r = await AdminQuestionFactoryService.approve('v1', full);
    assert(r.success, r.error);
    assert(currentSupabase.log.rpcs[0].name === 'fn_transition_question_version' && currentSupabase.log.rpcs[0].args.p_to === 'APPROVED');
    const audit = currentSupabase.log.writes.find((w) => w.table === 'admin_audit_logs');
    assert(audit && audit.args[0].actor_email && audit.args[0].action_type && audit.args[0].target_entity === 'question_version', 'audit columns');
  });
  await test('ADM-3b approve with a failed blocking auto check → QF_AUTO_CHECK_FAILED with the reason, no RPC', async () => {
    versionState.lifecycle = 'IN_REVIEW';
    versionState.explanation = null;
    try {
      currentSupabase = adminSb();
      const full = { correct_key_verified: true, explanation_correct: true, no_ambiguity: true, topic_correct: true, difficulty_sensible: true, provenance_verified: true };
      const r = await AdminQuestionFactoryService.approve('v1', full);
      assert(!r.success && r.errorCode === 'QF_AUTO_CHECK_FAILED' && /explanation/i.test(r.error), `${r.errorCode}: ${r.error}`);
      assert(currentSupabase.log.rpcs.length === 0, 'no transition RPC');
    } finally {
      versionState.explanation = 'Because 12 × 3 = 36, option A is the only answer.';
    }
  });
  await test('ADM-4 publish from non-APPROVED → error, no RPC', async () => {
    for (const state of ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED']) {
      versionState.lifecycle = state;
      currentSupabase = adminSb();
      const r = await AdminQuestionFactoryService.publish('v1');
      assert(!r.success && r.errorCode === 'QF_ILLEGAL_TRANSITION', `publish from ${state}`);
      assert(currentSupabase.log.rpcs.length === 0);
    }
  });
  // Courage Studio (#84 Q4): self-approve + publish. The approver comes from the audit log; the setting from
  // premium_system_configs (ADMIN_REQUIRE_SECOND_REVIEWER). On → refused before the RPC; off → published + audited.
  const q4Sb = (secondReviewer, approver) =>
    createMockSupabase(({ table, rpc, mode }) => {
      if (table === 'question_versions') return { data: { id: 'v1', lifecycle_status: 'APPROVED' }, error: null };
      if (table === 'admin_audit_logs') return { data: mode === 'maybeSingle' ? { actor_id: approver } : null, error: null };
      if (table === 'premium_system_configs') return { data: secondReviewer === null ? [] : [{ config_key: 'ADMIN_REQUIRE_SECOND_REVIEWER', config_value: { value: secondReviewer }, is_enabled: true }], error: null };
      if (rpc) return { data: { success: true, superseded_version_id: null }, error: null };
      return { data: [], error: null };
    });
  await test('Q4-1 self-approve + publish: second reviewer ON → QF_SECOND_REVIEWER_REQUIRED, no RPC', async () => {
    currentSupabase = q4Sb(true, authState.userId);
    const r = await AdminQuestionFactoryService.publish('v1');
    assert(!r.success && r.errorCode === 'QF_SECOND_REVIEWER_REQUIRED', `${r.errorCode}`);
    assert(currentSupabase.log.rpcs.length === 0, 'no publish RPC');
  });
  await test('Q4-2 self-approve + publish: setting OFF / absent → published + QF_SELF_APPROVED_PUBLISH audit row', async () => {
    for (const setting of [false, null]) {
      currentSupabase = q4Sb(setting, authState.userId);
      const r = await AdminQuestionFactoryService.publish('v1');
      assert(r.success, `setting ${setting}: ${r.error}`);
      assert(currentSupabase.log.rpcs[0].name === 'fn_publish_question_version', 'publish RPC');
      const acts = currentSupabase.log.writes.filter((w) => w.table === 'admin_audit_logs').map((w) => w.args[0].action_type);
      assert(acts.includes('QF_PUBLISH') && acts.includes('QF_SELF_APPROVED_PUBLISH'), JSON.stringify(acts));
    }
  });
  await test('Q4-3 a different approver: published, no self-approve audit row, even with the setting ON', async () => {
    currentSupabase = q4Sb(true, '22222222-2222-4222-8222-222222222222');
    const r = await AdminQuestionFactoryService.publish('v1');
    assert(r.success, r.error);
    const acts = currentSupabase.log.writes.filter((w) => w.table === 'admin_audit_logs').map((w) => w.args[0].action_type);
    assert(acts.includes('QF_PUBLISH') && !acts.includes('QF_SELF_APPROVED_PUBLISH'), JSON.stringify(acts));
  });
  await test('ADM-5 illegal transitions rejected (DRAFT→APPROVED, PUBLISHED→IN_REVIEW, REJECTED→IN_REVIEW)', async () => {
    const cases = [['DRAFT', () => AdminQuestionFactoryService.approve('v1', {})], ['PUBLISHED', () => AdminQuestionFactoryService.submitForReview('v1')], ['REJECTED', () => AdminQuestionFactoryService.submitForReview('v1')], ['DRAFT', () => AdminQuestionFactoryService.reject('v1', 'x')]];
    for (const [state, fn] of cases) {
      versionState.lifecycle = state;
      currentSupabase = adminSb();
      const r = await fn();
      assert(!r.success && r.errorCode === 'QF_ILLEGAL_TRANSITION', `${state}: ${r.errorCode}`);
      assert(currentSupabase.log.rpcs.length === 0);
    }
  });
  await test('ADM-6 request changes / reject require notes', async () => {
    versionState.lifecycle = 'IN_REVIEW';
    currentSupabase = adminSb();
    const r = await AdminQuestionFactoryService.reject('v1', '   ');
    assert(!r.success && r.errorCode === 'QF_NOTES_REQUIRED');
  });
  await test('ADM-7 editDraft only for DRAFT/CHANGES_REQUESTED', async () => {
    versionState.lifecycle = 'PUBLISHED';
    currentSupabase = adminSb();
    const r = await AdminQuestionFactoryService.editDraft('v1', item());
    assert(!r.success && r.errorCode === 'QF_ILLEGAL_TRANSITION');
  });

  // ===================== CSV IMPORTER =====================
  console.log('[CSV importer]');
  const csvSb = () =>
    createMockSupabase(({ table, rpc, ops }) => {
      if (table === 'subjects') return { data: [{ id: 'subj-1', name: 'Quant', slug: 'quant' }], error: null };
      if (table === 'topics') return { data: [{ id: TOPIC, name: 'Speed', slug: 'speed', subject_id: 'subj-1' }], error: null };
      if (table === 'exams') return { data: [], error: null };
      if (table === 'mistake_cognitive_types') return { data: [], error: null };
      if (rpc === 'fn_import_question_drafts') {
        const items = rpc ? null : null;
        return { data: { success: true, batch_id: 'b1', items: [] }, error: null };
      }
      return { data: null, error: null };
    });
  const csvRow = (o = {}) => ({
    question_text: item().stem,
    options: JSON.stringify({ A: '20 km/h', B: '72 km/h', C: '60 km/h', D: '54 km/h' }),
    correct_answer: 'B',
    explanation: item().explanationMd,
    section_name: 'Quant',
    topic: 'Speed',
    ...o,
  });
  await test('CSV-1 unknown topic row rejected with explicit message; no taxonomy writes', async () => {
    const sb = csvSb();
    const res = await QuestionCsvImporterService.run({ rows: [csvRow({ topic: 'Mensuration' })], mode: 'commit', actorId: authState.userId, supabase: sb, lookups: lookups() });
    assert(res.rejected === 1 && res.rows[0].errors[0].includes("Topic 'Mensuration' not found — create it via curriculum/onboarding first."), res.rows[0].errors.join(' '));
    assert(sb.log.writes.length === 0 && sb.log.rpcs.length === 0);
  });
  await test('CSV-2 never inserts into topics/exams/exam_cycles/exam_patterns/subjects', async () => {
    const sb = csvSb();
    await QuestionCsvImporterService.run({
      rows: [csvRow(), csvRow({ section_name: 'Unknown Subject' }), csvRow({ exam: 'nope' }), csvRow({ pattern_section_id: 'ps-x' })],
      mode: 'commit', actorId: authState.userId, supabase: sb, lookups: lookups(),
    });
    const bad = sb.log.writes.filter((w) => ['topics', 'subtopics', 'exams', 'exam_cycles', 'exam_patterns', 'subjects', 'questions', 'question_versions'].includes(w.table));
    assert(bad.length === 0, `forbidden writes: ${bad.map((b) => b.table).join(',')}`);
  });
  await test('CSV-3 accepted rows go only through fn_import_question_drafts (DRAFT), never status published', async () => {
    const sb = csvSb();
    await QuestionCsvImporterService.run({ rows: [csvRow()], mode: 'commit', actorId: authState.userId, supabase: sb, lookups: lookups() });
    const call = sb.log.rpcs.find((r) => r.name === 'fn_import_question_drafts');
    assert(call && call.args.p_batch.origin === 'CSV_IMPORT' && call.args.p_batch.items.length === 1, 'rpc not called');
    assert(!JSON.stringify(call.args).includes('"published"'), 'published status in payload');
  });
  await test('CSV-4 image columns / short explanation rejected by gates', async () => {
    const res = await QuestionCsvImporterService.run({ rows: [csvRow({ question_image: 'https://x/y.png' }), csvRow({ explanation: 'short' })], mode: 'dry-run', actorId: 'x', supabase: csvSb(), lookups: lookups() });
    assert(res.rejected === 2, JSON.stringify(res.rows.map((r) => r.errors)));
  });
  await test('CSV-5 dry-run writes nothing', async () => {
    const sb = csvSb();
    const res = await QuestionCsvImporterService.run({ rows: [csvRow()], mode: 'dry-run', actorId: 'x', supabase: sb, lookups: lookups() });
    assert(res.accepted === 1 && sb.log.writes.length === 0 && sb.log.rpcs.length === 0);
  });

  // ===================== STATIC CHECKS =====================
  console.log('[Static checks]');
  const walk = (dir, out = []) => {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
    }
    return out;
  };
  await test('STATIC-1 bulk-importer has no `status: "published"` question insert and no taxonomy inserts', async () => {
    const src = read('lib/admin/bulk-importer.ts');
    const qBlock = src.slice(src.indexOf('case "questions"'), src.indexOf('case "mock_tests"'));
    assert(!/status:\s*"published"/.test(qBlock), 'published insert in questions path');
    assert(!/from\("(topics|subjects|exams|exam_cycles|exam_patterns|questions|question_versions)"\)\s*\.insert/.test(src.replace(/\s+/g, ' ').replace(/\) \./g, ').')), 'taxonomy/question insert remains');
  });
  await test('STATIC-2 admin actions: no direct question/version inserts or published status for questions', async () => {
    const full = read('app/admin/actions.ts');
    const src = full.replace(/\s+/g, ' ');
    assert(!/from\("questions"\) ?\.insert/.test(src), 'questions insert');
    assert(!/from\("question_versions"\) ?\.(insert|update)/.test(src), 'version insert/update');
    assert(!/from\("question_(options|answers)"\) ?\.(insert|update)/.test(src), 'option/answer write');
    // Question import + question CRUD paths must never create taxonomy.
    const bulk = full.slice(full.indexOf('export async function importBulkQuestionsAction'), full.indexOf('1. CATEGORY CRUD ACTIONS'));
    const crud = full.slice(full.indexOf('function questionFormToItem'), full.indexOf('6. MOCK TEST CRUD ACTIONS'));
    [bulk, crud].forEach((block) => {
      assert(block.length > 100, 'question block not found');
      assert(!/from\("(topics|subtopics|subjects|exams|exam_cycles|exam_patterns)"\)\s*\.insert/.test(block), 'taxonomy insert in question path');
    });
  });
  await test('STATIC-3 no "use client" file imports services/question-factory', async () => {
    const offenders = ['app', 'components', 'lib', 'actions']
      .flatMap((d) => walk(path.join(ROOT, d)))
      .filter((f) => {
        const s = fs.readFileSync(f, 'utf8');
        return /^\s*["']use client["']/.test(s) && /services\/question-factory/.test(s);
      });
    assert(offenders.length === 0, offenders.join(', '));
  });
  await test('STATIC-4 no NODE_TLS_REJECT_UNAUTHORIZED / rejectUnauthorized:false in QF files', async () => {
    const files = [...walk(path.join(ROOT, 'services/question-factory')), ...walk(path.join(ROOT, 'components/admin/question-factory')), path.join(ROOT, 'actions/question-factory.actions.ts'), path.join(ROOT, 'scripts/test_qf1_question_factory.cjs'), path.join(ROOT, 'scripts/test_qf1_db.cjs')].filter((f) => fs.existsSync(f));
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      const stripped = s.replace(/\/\/.*$/gm, '').replace(/'[^'\n]*NODE_TLS[^'\n]*'/g, '');
      assert(!/NODE_TLS_REJECT_UNAUTHORIZED\s*=/.test(stripped) && !/rejectUnauthorized\s*:\s*false/.test(stripped), path.relative(ROOT, f));
    }
  });
  await test('STATIC-5 migration: all QF functions SECURITY DEFINER + pinned search_path; service_role-only grants', async () => {
    const sql = read('supabase/migrations/20261012000063_qf1_question_factory_core.sql');
    const fnBlocks = sql.split(/CREATE OR REPLACE FUNCTION /).slice(1);
    assert(fnBlocks.length >= 12, `found ${fnBlocks.length} functions`);
    fnBlocks.forEach((b) => {
      const head = b.slice(0, b.indexOf('AS $$'));
      assert(/SECURITY DEFINER/.test(head) && /SET search_path = public, pg_temp/.test(head), `function ${b.slice(0, 40)}`);
    });
    ['fn_question_stem_checksum', 'fn_import_question_drafts', 'fn_transition_question_version', 'fn_publish_question_version', 'fn_update_question_draft', 'fn_create_question_revision', 'fn_qf_find_exact_duplicates'].forEach((n) => assert(sql.includes(`'public.${n}(`), `grant list missing ${n}`));
    assert(sql.includes("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated") && sql.includes('GRANT EXECUTE ON FUNCTION %s TO service_role'));
    assert(!/GRANT[^;]*TO[^;]*(anon|authenticated)/.test(sql.replace(/REVOKE[^;]*;/g, '')), 'grant to anon/authenticated');
  });
  await test('STATIC-6 migration never edits old migrations and contains mock_questions pre-check before RLS change', async () => {
    const sql = read('supabase/migrations/20261012000063_qf1_question_factory_core.sql');
    assert(sql.indexOf('mock_questions reference non-PUBLISHED') < sql.indexOf('CREATE POLICY "QF1 candidate read published question versions"'));
    const { execFileSync } = require('child_process');
    // F0: only EDITS of existing migrations count (modified / deleted / renamed); a new, staged migration is allowed
    const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=MDR', 'HEAD', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert(changed === '', `existing migrations modified: ${changed}`);
  });
  await test('A1-1 question_versions gains only lifecycle_status + content_checksum', async () => {
    const sql = read('supabase/migrations/20261012000063_qf1_question_factory_core.sql');
    const start = sql.search(/ALTER TABLE public\.question_versions\s+ADD COLUMN/);
    assert(start >= 0, 'question_versions ADD COLUMN block not found');
    const alter = sql.slice(start, sql.indexOf(';', start));
    const added = (alter.match(/ADD COLUMN IF NOT EXISTS (\w+)/g) || []).map((m) => m.split(' ').pop());
    assert(JSON.stringify(added) === JSON.stringify(['lifecycle_status', 'content_checksum']), `added: ${added}`);
    assert(!/ALTER TABLE public\.question_versions[^;]*ADD COLUMN[^;]*(origin|authoring_metadata|review_notes|reviewed_by|created_by|import_batch_id|context_hash|contract_version)/.test(sql), 'authoring column on question_versions');
  });
  await test('A1-2 question_version_authoring: RLS on, privileges revoked, no candidate policies, frozen by trigger', async () => {
    const sql = read('supabase/migrations/20261012000063_qf1_question_factory_core.sql');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS public.question_version_authoring'));
    assert(/version_id UUID PRIMARY KEY REFERENCES public\.question_versions\(id\) ON DELETE RESTRICT/.test(sql));
    assert(sql.includes('ALTER TABLE public.question_version_authoring ENABLE ROW LEVEL SECURITY;'));
    assert(sql.includes('REVOKE ALL ON public.question_version_authoring FROM anon, authenticated;'));
    assert(!/CREATE POLICY[^;]*ON public\.question_version_authoring/.test(sql), 'policy on authoring table');
    assert(sql.includes('trg_qf_question_version_authoring_integrity') && sql.includes("v_state IN ('PUBLISHED', 'SUPERSEDED')"));
    assert(/INSERT INTO public\.question_version_authoring \(version_id, origin\)\s+SELECT qv\.id, 'LEGACY_UNKNOWN'/.test(sql), 'legacy authoring backfill');
  });
  await test('A1-3 TS reads authoring fields only via question_version_authoring', async () => {
    const svc = read('services/question-factory/admin-question-factory.service.ts');
    assert(svc.includes('question_version_authoring!inner(origin, import_batch_id)') && svc.includes('question_version_authoring(*)'));
    assert(!/\.eq\('origin'|\.eq\('import_batch_id'/.test(svc), 'filters on question_versions authoring columns');
    const types = read('types/database.ts');
    const qv = types.slice(types.indexOf('      question_versions: {'), types.indexOf('Relationships:', types.indexOf('      question_versions: {')));
    assert(!/authoring_metadata|review_notes|reviewed_by|import_batch_id|\borigin\b/.test(qv), 'authoring fields still typed on question_versions');
  });
  await test('A2-1 exam_question_mappings candidate policy requires published parent question', async () => {
    const sql = read('supabase/migrations/20261012000063_qf1_question_factory_core.sql');
    assert(sql.includes('DROP POLICY IF EXISTS "Public read exam question mappings" ON public.exam_question_mappings;'));
    const pol = sql.slice(sql.indexOf('CREATE POLICY "QF1 candidate read published exam question mappings"'));
    assert(/q\.id = exam_question_mappings\.question_id\s+AND q\.status = 'published'/.test(pol.slice(0, 400)));
  });

  await test('STATIC-7 TS selectors filter PUBLISHED + current', async () => {
    const checks = [
      ['services/assessment.service.ts', '"question_versions.lifecycle_status", "PUBLISHED"'],
      ['services/premium-generator.service.ts', '.eq("lifecycle_status", "PUBLISHED")'],
      ['services/adaptive/adaptive-selection.service.ts', '.eq("lifecycle_status", "PUBLISHED")'],
      ['services/adaptive/adaptive-remediation.service.ts', '"question_versions.lifecycle_status", "PUBLISHED"'],
      // DRILL-1 (085): drills are compiled server-side by fn_generate_mistake_drill
      ['supabase/migrations/20261016000085_drill1_server_authoritative_drills.sql', "JOIN public.question_versions qv ON qv.question_id = q.id AND qv.is_current AND qv.lifecycle_status = 'PUBLISHED'"],
      ['services/current-affairs-daily-quiz.service.ts', "qv.lifecycle_status = 'PUBLISHED'"],
    ];
    checks.forEach(([f, needle]) => assert(read(f).includes(needle), `${f} missing filter`));
  });

  console.log(lines.join('\n'));
  console.log(`\nQF-1 offline suite: ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Suite crashed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
