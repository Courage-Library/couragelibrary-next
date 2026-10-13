/**
 * COURAGE LIBRARY — GAP2-2a LEARNING RE-POINT TEST SUITE
 *
 * Part 1 (offline): LearningResolverService contract (ordering, PUBLISHED-only, locking, no
 *   caller-supplied user id, single batch query), CA validation gate, Content Studio access
 *   level, static scans of candidate paths. Supabase is a recording mock; no network.
 * Part 2 (--db): couragelibrary-next, every scenario inside BEGIN READ WRITE … ROLLBACK
 *   (ref guard + verified TLS via scripts/db/_db-env.cjs): fn_resolve_learn_more gone,
 *   access_level CHECK, CA mapping FK/unique/validation (C4), course_lessons FK, RLS, bucket.
 *
 * Run: node scripts/test_gap2_2a_learning.cjs [--db]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(out.outputText, filename);
};

// ---------- Recording Supabase mock ----------
function createMockSupabase(handler, sessionUser = null) {
  const log = { queries: [], writes: [] };
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = {};
    const record = (op) => (...args) => {
      q.ops.push({ op, args });
      if (['insert', 'update', 'delete', 'upsert'].includes(op)) log.writes.push({ table, op, args });
      return chain;
    };
    ['select', 'eq', 'neq', 'in', 'not', 'or', 'lte', 'gt', 'order', 'limit', 'insert', 'update', 'delete', 'upsert', 'ilike', 'is'].forEach((op) => (chain[op] = record(op)));
    const resolve = (mode) => {
      log.queries.push(q);
      return Promise.resolve(handler({ table, ops: q.ops, mode }) || { data: null, error: null });
    };
    chain.maybeSingle = () => resolve('maybeSingle');
    chain.single = () => resolve('single');
    chain.then = (onF, onR) => resolve('many').then(onF, onR);
    return chain;
  };
  return { log, from: builder, auth: { getUser: async () => ({ data: { user: sessionUser } }) } };
}
const opVal = (ops, op, col) => {
  const f = ops.find((o) => o.op === op && o.args[0] === col);
  return f ? f.args[1] : undefined;
};

const authState = { isAdmin: true, userId: '11111111-1111-4111-8111-111111111111', userEmail: 'admin@example.test' };
let currentSupabase = null;
const storageCalls = [];
const MOCKS = {
  '@/services/admin.service': { AdminService: { checkIsAdminOrStaff: async () => ({ ...authState }) } },
  '@/lib/supabase/server': {
    createAdminServerSupabaseClient: () => currentSupabase,
    createServerSupabaseClient: async () => currentSupabase,
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};

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
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
// Old learning stack (word-bounded: current_affairs_article_versions is not article_versions).
const OLD_STACK_RE = /\blearning_resource_topics\b|\blearning_resources\b|from\(\s*['"]articles['"]\)|\barticle_versions\b|\bfn_resolve_learn_more\b/;

const T1 = '3569f1f2-0000-4000-8000-000000000001';
const T2 = '47f9c646-0000-4000-8000-000000000002';
const STUDENT = { id: '99999999-9999-4999-8999-999999999999' };

function docRow(o) {
  const id = o.id || `d${Math.random().toString(16).slice(2, 10)}-0000-4000-8000-000000000000`;
  const verId = o.verId || `v${id.slice(1)}`;
  return {
    id,
    canonical_slug: o.slug,
    document_type: o.type || 'CONCEPT_LESSON',
    access_level: o.access || 'FREE',
    status: o.status || 'PUBLISHED',
    current_published_version_id: o.noPtr ? null : verId,
    learning_units: { id: 'u1', topic_id: o.topic || T1, title: o.title || o.slug, estimated_minutes: 7, is_active: o.unitActive !== false, topics: { id: o.topic || T1, name: 'Number System', slug: 'number-system', subject_id: 's1', subjects: { name: 'Quant' } } },
    current_version: o.noVer ? null : { id: o.verMismatch ? 'other' : verId, is_published: o.verPublished !== false, review_status: o.verStatus || 'PUBLISHED', published_at: '2026-10-12T00:00:00Z', compiled_artifact_storage_key: `learning/docs/${id}/artifacts/v1.mdx` },
  };
}

function resolverMock(rows, { user = STUDENT, pro = false } = {}) {
  return createMockSupabase(({ table, ops, mode }) => {
    if (table === 'user_entitlements') return { data: pro ? [{ id: 'e1' }] : [], error: null };
    if (table === 'learning_documents') {
      const slug = opVal(ops, 'eq', 'canonical_slug');
      if (slug) return { data: rows.find((r) => r.canonical_slug === slug) || null, error: null };
      const inTopics = opVal(ops, 'in', 'learning_units.topic_id');
      const data = inTopics ? rows.filter((r) => inTopics.includes(r.learning_units.topic_id)) : rows;
      return { data: mode === 'many' ? data : data[0] || null, error: null };
    }
    if (table === 'questions') return { data: { canonical_topic_id: T1 }, error: null };
    return { data: null, error: null };
  }, user);
}

async function offline() {
  const storageMod = require(path.join(ROOT, 'services/storage/learning-artifact-storage.ts'));
  storageMod.setLearningArtifactStorageForTests({
    providerType: 'MEMORY',
    get: async (bucket, key) => {
      storageCalls.push({ bucket, key });
      return { data: Buffer.from('BODY-FOR-' + key), mimeType: 'text/mdx', byteSize: 1, sha256Hash: 'x', lastModified: new Date() };
    },
    put: async () => ({}),
    exists: async () => true,
  });
  const R = require(path.join(ROOT, 'services/learning/learning-resolver.service.ts'));
  const { LearningResolverService, sortLearningDocuments, isServableDocumentRow, LEARNING_DOCUMENT_TYPE_ORDER } = R;

  await test('O-01 ordering: CONCEPT_LESSON, TOPIC_SUMMARY_REVISION, COMMON_TRAPS, WORKED_EXAMPLES, FORMULA_SHORTCUT, PYQ_DEEP_DIVE', async () => {
    assert(LEARNING_DOCUMENT_TYPE_ORDER.join() === 'CONCEPT_LESSON,TOPIC_SUMMARY_REVISION,COMMON_TRAPS_AND_MISTAKES,WORKED_EXAMPLES,FORMULA_SHORTCUT_SHEET,PYQ_DEEP_DIVE');
    const types = ['PYQ_DEEP_DIVE', 'WORKED_EXAMPLES', 'CONCEPT_LESSON', 'FORMULA_SHORTCUT_SHEET', 'TOPIC_SUMMARY_REVISION', 'COMMON_TRAPS_AND_MISTAKES'];
    currentSupabase = resolverMock(types.map((t, i) => docRow({ slug: `s${i}`, type: t })));
    const docs = await LearningResolverService.resolveForTopic(T1);
    assert(docs.map((d) => d.document_type).join() === LEARNING_DOCUMENT_TYPE_ORDER.join(), docs.map((d) => d.document_type).join());
    const tie = sortLearningDocuments([{ document_type: 'CONCEPT_LESSON', title: 'B', canonical_slug: 'b' }, { document_type: 'CONCEPT_LESSON', title: 'A', canonical_slug: 'a' }]);
    assert(tie[0].title === 'A', 'tie-break by title');
  });

  await test('O-02 PUBLISHED-only: draft/archived/no pointer/unpublished or mismatched version/inactive unit excluded', async () => {
    const bad = [
      docRow({ slug: 'draft', status: 'DRAFT' }),
      docRow({ slug: 'arch', status: 'ARCHIVED' }),
      docRow({ slug: 'noptr', noPtr: true }),
      docRow({ slug: 'nover', noVer: true }),
      docRow({ slug: 'unpub', verPublished: false }),
      docRow({ slug: 'review', verStatus: 'COMPILED' }),
      docRow({ slug: 'mismatch', verMismatch: true }),
      docRow({ slug: 'inactive', unitActive: false }),
    ];
    bad.forEach((r) => assert(!isServableDocumentRow(r), `${r.canonical_slug} should not be servable`));
    const good = docRow({ slug: 'ok' });
    assert(isServableDocumentRow(good));
    currentSupabase = resolverMock([...bad, good]);
    const docs = await LearningResolverService.resolveForTopic(T1);
    assert(docs.length === 1 && docs[0].canonical_slug === 'ok', docs.map((d) => d.canonical_slug).join());
    const q = currentSupabase.log.queries.find((x) => x.table === 'learning_documents');
    assert(opVal(q.ops, 'eq', 'status') === 'PUBLISHED', 'query must filter status = PUBLISHED');
  });

  await test('O-03 lock: PRO doc locked for non-PRO and anonymous, unlocked for PRO; FREE never locked; href shape', async () => {
    const rows = [docRow({ slug: 'free' }), docRow({ slug: 'pro', type: 'TOPIC_SUMMARY_REVISION', access: 'PRO' })];
    currentSupabase = resolverMock(rows, { pro: false });
    let d = await LearningResolverService.resolveForTopic(T1);
    assert(d[0].is_locked === false && d[1].is_locked === true && d[0].href === '/articles/free', JSON.stringify(d));
    currentSupabase = resolverMock(rows, { user: null });
    d = await LearningResolverService.resolveForTopic(T1);
    assert(d[1].is_locked === true, 'anonymous must be locked');
    currentSupabase = resolverMock(rows, { pro: true });
    d = await LearningResolverService.resolveForTopic(T1);
    assert(d.every((x) => !x.is_locked), 'PRO viewer unlocked');
    const keys = Object.keys(d[0]).sort().join();
    assert(keys === 'access_level,canonical_slug,document_type,estimated_minutes,href,id,is_locked,title,topic_id,topic_name', keys);
  });

  await test('O-04 locked article: no body loaded from storage; unlocked article: body loaded', async () => {
    const rows = [docRow({ slug: 'free' }), docRow({ slug: 'pro', access: 'PRO' })];
    currentSupabase = resolverMock(rows, { pro: false });
    storageCalls.length = 0;
    const locked = await LearningResolverService.getArticle('pro');
    assert(locked && locked.is_locked && locked.body === null && storageCalls.length === 0, `storage calls ${storageCalls.length}`);
    const open = await LearningResolverService.getArticle('free');
    assert(open && !open.is_locked && /^BODY-FOR-/.test(open.body) && storageCalls.length === 1 && storageCalls[0].bucket === 'learning-artifacts');
    const CS = require(path.join(ROOT, 'services/content.service.ts')).ContentService;
    storageCalls.length = 0;
    const art = await CS.getArticleBySlug('pro');
    assert(art.isLocked === true && art.contentBody === null && storageCalls.length === 0, 'ContentService must not send a locked body');
  });

  await test('O-05 entitlement from the session only: no user-id parameter anywhere in the resolver', async () => {
    const src = read('services/learning/learning-resolver.service.ts');
    const sigs = src.match(/static async \w+\([^)]*\)/g) || [];
    assert(sigs.length >= 6, 'expected resolver methods');
    sigs.forEach((s) => assert(!/user/i.test(s), `method accepts a user parameter: ${s}`));
    assert(LearningResolverService.resolveForTopics.length === 1 && LearningResolverService.resolveForTopic.length === 1 && LearningResolverService.resolveForQuestion.length === 1);
    assert(/auth\.getUser\(\)/.test(src) && /createServerSupabaseClient/.test(src) && !/createAdminServerSupabaseClient/.test(src), 'resolution must use the session client');
    currentSupabase = resolverMock([], { pro: true });
    await LearningResolverService.getViewerAccess();
    const ent = currentSupabase.log.queries.find((q) => q.table === 'user_entitlements');
    assert(ent && !ent.ops.some((o) => o.op === 'eq' && o.args[0] === 'user_id'), 'must rely on RLS (own rows), not a user_id filter');
    assert(JSON.stringify(opVal(ent.ops, 'in', 'entitlement_type')) === JSON.stringify(['PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS']) && opVal(ent.ops, 'eq', 'is_active') === true);
    const ms = read('services/mistake.service.ts');
    const a = ms.slice(ms.indexOf('static async resolveLearningContentForMistake'), ms.indexOf('static async getBatchLearningContentForTopics'));
    const b = ms.slice(ms.indexOf('static async getBatchLearningContentForTopics'), ms.indexOf('function toMistakeLearningResolution'));
    assert(!/userId/.test(a.slice(0, a.indexOf('{', a.indexOf(')')))) && !/userId/.test(b.slice(0, b.indexOf('Promise'))), 'mistake learning functions must not accept a userId');
  });

  await test('O-06 batch is N+1-free: 25 topics → exactly one learning_documents query', async () => {
    const topics = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
    currentSupabase = resolverMock(topics.map((t, i) => docRow({ slug: `t${i}`, topic: t })));
    const map = await LearningResolverService.resolveForTopics([...topics, 'not-a-uuid', '']);
    const docQueries = currentSupabase.log.queries.filter((q) => q.table === 'learning_documents');
    assert(docQueries.length === 1, `${docQueries.length} queries`);
    assert(map.size === 25 && [...map.values()].every((v) => v.length === 1), 'one doc per topic; non-UUID keys ignored');
    assert(JSON.stringify(opVal(docQueries[0].ops, 'in', 'learning_units.topic_id')) === JSON.stringify(topics));
  });

  await test('O-07 resolveForQuestion maps through questions.canonical_topic_id', async () => {
    currentSupabase = resolverMock([docRow({ slug: 'q-doc' })]);
    const d = await LearningResolverService.resolveForQuestion('5f5f5f5f-0000-4000-8000-000000000000');
    assert(d.length === 1 && d[0].canonical_slug === 'q-doc');
    const q = currentSupabase.log.queries.find((x) => x.table === 'questions');
    assert(q && q.ops.some((o) => o.op === 'select' && /canonical_topic_id/.test(o.args[0])));
  });

  await test('O-08 static: candidate learning paths read no old-stack tables', async () => {
    const files = {
      'services/mistake.service.ts': null,
      'services/assessment.service.ts': null,
      'services/current-affairs.service.ts': null,
      'services/learning/learning-resolver.service.ts': null,
      'app/sitemap.ts': null,
      'app/articles/page.tsx': null,
      'app/articles/[slug]/page.tsx': null,
      'components/mistakes/mistake-learning-section.tsx': null,
      'components/current-affairs/current-affairs-learning-cta.tsx': null,
    };
    const bad = [];
    for (const f of Object.keys(files)) {
      const s = stripComments(read(f));
      if (OLD_STACK_RE.test(s)) bad.push(f);
    }
    const cs = read('services/content.service.ts');
    const learningPart = stripComments(cs.slice(0, cs.indexOf('static async getCourses')));
    if (OLD_STACK_RE.test(learningPart) || /\blearning_resource_id\b/.test(learningPart)) bad.push('services/content.service.ts (articles/learning part)');
    assert(bad.length === 0, bad.join(', '));
  });

  await test('O-09 CA validation gate: learning mappings must be existing PUBLISHED learning_documents', async () => {
    const { CurrentAffairsValidationService } = require(path.join(ROOT, 'services/current-affairs-validation.service.ts'));
    const db = {
      query: async (sql, params) => {
        if (/learning_documents WHERE id = \$1/.test(sql)) {
          if (params[0] === 'pub') return { rows: [{ id: 'pub', status: 'PUBLISHED' }] };
          if (params[0] === 'draft') return { rows: [{ id: 'draft', status: 'DRAFT' }] };
          return { rows: [] };
        }
        if (/canonical_taxonomy_nodes/.test(sql)) return { rows: [{ id: 'n1', slug: 'x', name: 'X' }] };
        return { rows: [] };
      },
    };
    const run = async (lm) => (await CurrentAffairsValidationService.validateGate4_TaxonomyAndMappings({ taxonomyMappings: [{ taxonomyNodeId: 'n1', isPrimary: true }], examMappings: [], questionMappings: [], learningMappings: lm }, db)).errors.filter((e) => /earning/.test(e));
    assert((await run([{ learningDocumentId: 'pub' }])).length === 0);
    assert((await run([{ learningDocumentId: 'draft' }])).some((e) => /not PUBLISHED/.test(e)));
    assert((await run([{ learningDocumentId: 'missing' }])).some((e) => /does not exist/.test(e)));
    assert((await run([{}])).some((e) => /missing learningDocumentId/.test(e)));
    assert((await run([{ learningDocumentId: 'pub' }, { learningDocumentId: 'pub' }])).some((e) => /Duplicate/.test(e)));
  });

  await test('O-10 Content Studio access level: admin only, FREE/PRO only, audited', async () => {
    const { AdminContentStudioService } = require(path.join(ROOT, 'services/admin-content-studio.service.ts'));
    currentSupabase = createMockSupabase(({ table, ops, mode }) => {
      if (table === 'learning_documents') return { data: mode === 'single' ? { id: 'd1', access_level: 'PRO' } : { id: 'd1', access_level: 'FREE' }, error: null };
      return { data: null, error: null };
    });
    const r = await AdminContentStudioService.setDocumentAccessLevel('d1', 'PRO');
    assert(r.access_level === 'PRO');
    const audit = currentSupabase.log.writes.find((w) => w.table === 'admin_audit_logs');
    assert(audit && audit.args[0].action_type === 'LEARNING_DOCUMENT_ACCESS_LEVEL' && audit.args[0].new_value.access_level === 'PRO');
    let threw = false;
    try { await AdminContentStudioService.setDocumentAccessLevel('d1', 'PAID'); } catch { threw = true; }
    assert(threw, 'invalid level must be rejected');
    authState.isAdmin = false;
    threw = false;
    try { await AdminContentStudioService.setDocumentAccessLevel('d1', 'FREE'); } catch { threw = true; } finally { authState.isAdmin = true; }
    assert(threw, 'non-admin must be rejected');
  });

  await test('O-11 static: durable storage, DB-generated version ids, dynamic article routes, sitemap on learning_documents', async () => {
    assert(!/id: `ver-/.test(read('services/learning-document.service.ts')), 'client-side version id still built');
    for (const f of ['services/admin-content-studio.service.ts', 'services/ai/structured-content-importer.service.ts', 'services/content.service.ts']) {
      assert(!/StorageFactory\.getProvider\(\)/.test(read(f)), `${f} still uses the in-memory default storage`);
    }
    assert(/export const dynamic = "force-dynamic"/.test(read('app/articles/[slug]/page.tsx')) && /export const dynamic = "force-dynamic"/.test(read('app/articles/page.tsx')));
    assert(/learning-locked-panel/.test(read('app/articles/[slug]/page.tsx')));
    assert(/from\("learning_documents"\)/.test(read('app/sitemap.ts')) && !/from\("articles"\)/.test(read('app/sitemap.ts')));
    const m = read('supabase/migrations/20261012000072_l2_learning_repoint.sql');
    assert(/L2_CA_MAPPINGS_NOT_EMPTY/.test(m) && /DROP FUNCTION IF EXISTS public\.fn_resolve_learn_more/.test(m) && /'learning-artifacts', 'learning-artifacts', false/.test(m));
  });
}

async function db() {
  const { Client } = require('pg');
  const { dbTarget } = require('./db/_db-env.cjs');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const one = async (sql, p = []) => (await c.query(sql, p)).rows[0];
  async function tx(fn) {
    await c.query('BEGIN READ WRITE');
    try {
      return await fn();
    } finally {
      await c.query('ROLLBACK');
    }
  }
  async function expectError(fn, re) {
    let err = null;
    await tx(async () => {
      try {
        await fn();
      } catch (e) {
        err = e;
      }
    });
    assert(err, 'expected an error');
    assert(re.test(`${err.code} ${err.message}`), `unexpected error: ${err.code} ${err.message}`);
  }
  const topic = await one(`SELECT id FROM public.topics WHERE slug='number-system'`);
  const node = await one(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type='TOPIC' LIMIT 1`);
  const HASH = 'a'.repeat(64);
  // In-transaction fixture: one PUBLISHED doc + one DRAFT doc on a fresh unit; a DRAFT CA article.
  async function fixture() {
    const tag = `qa-t-${Date.now().toString(36)}`;
    const unit = await one(`INSERT INTO public.learning_units (topic_id, title, slug, unit_type) VALUES ($1, $2, $3, 'CONCEPT_LESSON') RETURNING id`, [topic.id, `QA ${tag}`, tag]);
    const pub = await one(`INSERT INTO public.learning_documents (learning_unit_id, canonical_slug, document_type) VALUES ($1, $2, 'CONCEPT_LESSON') RETURNING id, access_level`, [unit.id, `${tag}-pub`]);
    const ver = await one(
      `INSERT INTO public.document_versions (document_id, version_number, source_spec_storage_key, source_spec_hash, compiled_artifact_storage_key, compiled_artifact_hash, review_status, is_published, published_at)
       VALUES ($1, 1, 'k1', $2, 'k2', $2, 'PUBLISHED', true, now()) RETURNING id`,
      [pub.id, HASH]
    );
    await c.query(`UPDATE public.learning_documents SET current_published_version_id=$2, status='PUBLISHED' WHERE id=$1`, [pub.id, ver.id]);
    const draft = await one(`INSERT INTO public.learning_documents (learning_unit_id, canonical_slug, document_type) VALUES ($1, $2, 'WORKED_EXAMPLES') RETURNING id`, [unit.id, `${tag}-draft`]);
    const art = await one(`INSERT INTO public.current_affairs_articles (news_date, slug) VALUES (CURRENT_DATE, $1) RETURNING id`, [`${tag}-ca`]);
    return { pub, draft, art };
  }

  await test('DB-01 fn_resolve_learn_more no longer exists', async () => {
    const r = await one(`SELECT to_regprocedure('public.fn_resolve_learn_more(uuid,uuid)') IS NULL gone`);
    assert(r.gone);
  });

  await test('DB-02 access_level: default FREE; CHECK rejects other values', async () => {
    await tx(async () => {
      const f = await fixture();
      assert(f.pub.access_level === 'FREE');
      await c.query(`UPDATE public.learning_documents SET access_level='PRO' WHERE id=$1`, [f.pub.id]);
    });
    await expectError(async () => {
      const f = await fixture();
      await c.query(`UPDATE public.learning_documents SET access_level='PAID' WHERE id=$1`, [f.pub.id]);
    }, /23514|chk_learning_documents_access_level/);
  });

  await test('DB-03 CA mapping: learning_resource_id gone; FK to learning_documents; unique per article', async () => {
    const col = await one(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='current_affairs_learning_mappings' AND column_name='learning_resource_id'`);
    assert(col.n === 0);
    await expectError(async () => {
      const f = await fixture();
      await c.query(`INSERT INTO public.current_affairs_learning_mappings (article_id, learning_document_id) VALUES ($1, gen_random_uuid())`, [f.art.id]);
    }, /23503/);
    await expectError(async () => {
      const f = await fixture();
      await c.query(`INSERT INTO public.current_affairs_learning_mappings (article_id, learning_document_id) VALUES ($1, $2), ($1, $2)`, [f.art.id, f.pub.id]);
    }, /23505|uq_ca_learning_mapping/);
  });

  await test('DB-04 C4: mapping to a PUBLISHED doc accepted (validation + insert); DRAFT doc rejected by validation; doc delete RESTRICTed', async () => {
    const { CurrentAffairsValidationService } = require(path.join(ROOT, 'services/current-affairs-validation.service.ts'));
    await tx(async () => {
      const f = await fixture();
      const gate = async (docId) =>
        (await CurrentAffairsValidationService.validateGate4_TaxonomyAndMappings(
          { taxonomyMappings: [{ taxonomyNodeId: node.id, isPrimary: true }], examMappings: [], questionMappings: [], learningMappings: [{ learningDocumentId: docId }] },
          { query: (sql, p) => c.query(sql, p) }
        )).errors.filter((e) => /earning/.test(e));
      assert((await gate(f.pub.id)).length === 0, 'published doc rejected');
      assert((await gate(f.draft.id)).some((e) => /not PUBLISHED/.test(e)), 'draft doc accepted');
      await c.query(`INSERT INTO public.current_affairs_learning_mappings (article_id, learning_document_id) VALUES ($1, $2)`, [f.art.id, f.pub.id]);
      await c.query('SAVEPOINT s');
      let restricted = false;
      try {
        await c.query(`UPDATE public.learning_documents SET current_published_version_id=NULL WHERE id=$1`, [f.pub.id]);
        await c.query(`DELETE FROM public.learning_documents WHERE id=$1`, [f.pub.id]);
      } catch (e) {
        restricted = /23503|Cannot delete/.test(`${e.code} ${e.message}`);
      }
      await c.query('ROLLBACK TO SAVEPOINT s');
      assert(restricted, 'deleting a mapped document must be refused');
    });
  });

  await test('DB-05 course_lessons.learning_document_id → learning_documents ON DELETE RESTRICT', async () => {
    const r = await one(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='course_lessons_learning_document_id_fkey'`);
    assert(r && /REFERENCES learning_documents\(id\) ON DELETE RESTRICT/.test(r.d), r && r.d);
    const lr = await one(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='course_lessons' AND column_name='learning_resource_id'`);
    assert(lr.n === 1, 'learning_resource_id must be untouched in 2a');
  });

  await test('DB-06 RLS: anon sees only PUBLISHED documents/versions and cannot read the private bucket', async () => {
    await tx(async () => {
      const f = await fixture();
      await c.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('learning-artifacts', $1)`, [`qa/${f.pub.id}.mdx`]);
      await c.query('SET LOCAL ROLE anon');
      const docs = (await c.query(`SELECT id, status FROM public.learning_documents WHERE id = ANY($1)`, [[f.pub.id, f.draft.id]])).rows;
      const vers = (await c.query(`SELECT count(*)::int n FROM public.document_versions WHERE is_published = false`)).rows[0].n;
      const objs = (await c.query(`SELECT count(*)::int n FROM storage.objects WHERE bucket_id = 'learning-artifacts'`)).rows[0].n;
      assert(docs.length === 1 && docs[0].id === f.pub.id, `anon saw ${docs.length} docs`);
      assert(vers === 0, 'anon saw unpublished versions');
      assert(objs === 0, `anon saw ${objs} private storage objects`);
    });
  });

  await test('DB-07 learning-artifacts bucket exists and is private', async () => {
    const b = await one(`SELECT public FROM storage.buckets WHERE id='learning-artifacts'`);
    assert(b && b.public === false);
  });

  await c.end();
}

(async () => {
  console.log('GAP2-2a learning suite');
  await offline();
  if (ARGS.has('--db')) await db();
  console.log(lines.join('\n'));
  console.log(`\nGAP2-2a suite: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(lines.join('\n'));
  console.log('SUITE ERROR', e.code || '', String(e.message).slice(0, 300));
  process.exit(1);
});
