/**
 * COURAGE LIBRARY — GAP2-2b LEGACY LEARNING RETIREMENT SUITE
 *
 * Offline (default):
 *   S-*  static: no reference to retired tables / removed actions in app, services, lib, actions,
 *        components, types, config; /courses links gated; no placeholder reference path.
 *   K-*  courses flag OFF: every course page / route / service entry point disabled with ZERO calls;
 *        flag ON: lesson content resolved only via LearningResolverService.resolveDocuments.
 *   R-*  compile resolvers: no catalog / unknown / unpublished / non-current / missing asset →
 *        unresolved (compile fails); valid published question + real asset → compiles; publish of a
 *        version with unresolved references is blocked; compileVersionAction → VALIDATION naming it.
 * --db (verified TLS, ref guard; reads, plus writes only inside BEGIN … ROLLBACK):
 *   D-*  catalog, privileges, PostgREST (anon + qa-student), zero-reference scan, data preservation,
 *        FKs / dropped columns, functions, rollback dry-run.
 *
 * Run: node scripts/test_gap2_2b_retirement.cjs [--db]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
for (const k of Object.keys(process.env)) if (/^(ADMIN_EMAILS|FEATURE_COURSES)$/.test(k)) delete process.env[k];

// ---------- TS transpile + @/ alias ----------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
require.extensions['.tsx'] = transpile;

// ---------- recording mocks ----------
const calls = [];
const recorder = (label) =>
  new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (prop === '__esModule') return true;
      return recorder(`${label}.${String(prop)}`);
    },
    apply: () => {
      calls.push(label);
      return Promise.resolve({ data: null, error: null });
    },
  });
class NotFoundSignal extends Error { constructor() { super('NEXT_NOT_FOUND'); } }

/** Programmable Supabase mock: tables → rows; eq filters; maybeSingle/single/then; records every call. */
function makeDb(tables, log) {
  const builder = (table) => {
    const filters = [];
    let updatePayload = null;
    const chain = {};
    const rows = () => (tables[table] || []).filter((r) => filters.every(([c, v]) => r[c] === v));
    ['select', 'order', 'limit', 'in', 'not', 'or', 'lte', 'gte', 'is', 'range'].forEach((op) => (chain[op] = () => chain));
    chain.eq = (c, v) => { filters.push([c, v]); return chain; };
    chain.update = (p) => { updatePayload = p; log.push(`update:${table}`); return chain; };
    chain.insert = () => { log.push(`insert:${table}`); return chain; };
    const result = (single) => {
      if (updatePayload) return { data: single ? { ...(rows()[0] || {}), ...updatePayload } : null, error: null };
      const r = rows();
      return { data: single ? r[0] || null : r, error: null };
    };
    chain.maybeSingle = async () => result(true);
    chain.single = async () => result(true);
    chain.then = (f, rj) => Promise.resolve(result(false)).then(f, rj);
    return chain;
  };
  return { from: (t) => { log.push(`from:${t}`); return builder(t); }, rpc: async (n) => { log.push(`rpc:${n}`); return { data: null, error: null }; } };
}

const sessionState = { user: null, db: null };
let serviceMocks = true;
const REAL_SERVICES = new Set();
const resolverMock = { resolveDocuments: null };
const MOCKS = {
  'server-only': {},
  'next/navigation': { notFound: () => { throw new NotFoundSignal(); }, redirect: (u) => { throw new Error('NEXT_REDIRECT ' + u); }, useRouter: () => ({}), usePathname: () => '/', useSearchParams: () => new URLSearchParams(), useParams: () => ({}) },
  'next/cache': { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn) => fn },
  'next/headers': { cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }), headers: async () => new Map() },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => {
      calls.push('createServerSupabaseClient');
      const db = sessionState.db || recorder('session');
      return new Proxy(db, { get: (t, p) => (p === 'auth' ? { getUser: async () => ({ data: { user: sessionState.user }, error: null }) } : t[p]) });
    },
    createAdminServerSupabaseClient: () => { calls.push('createAdminServerSupabaseClient'); return sessionState.adminDb || recorder('serviceRole'); },
    createPublicServerSupabaseClient: () => { calls.push('createPublicServerSupabaseClient'); return recorder('public'); },
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  if (request === '@/services/learning/learning-resolver.service' && resolverMock.resolveDocuments) {
    return { LearningResolverService: { resolveDocuments: resolverMock.resolveDocuments } };
  }
  if (serviceMocks && request.startsWith('@/services/') && !REAL_SERVICES.has(request)) return recorder(request);
  return originalLoad.call(this, request, parent, isMain);
};
const freshRequire = (rel) => {
  const p = require.resolve(path.join(ROOT, rel));
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(path.join(ROOT, 'app')) || k.startsWith(path.join(ROOT, 'services')) || k.startsWith(path.join(ROOT, 'lib'))) delete require.cache[k]; });
  return require(p);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { calls.push('fetch'); throw new Error('network disabled offline'); };

// ---------- harness ----------
let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try { const info = await fn(); passed++; lines.push(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, acc); } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
};
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const RETIRED_RE = /(?<![/\w-])(learning_resources|learning_resource_topics|article_versions)\b|from\(\s*["'`]articles["'`]\s*\)|["'`]articles["'`]\s*\)|\blearning_resource_id\b|\bfn_publish_article_version\b|\bcreateArticleAction\b|\bgetAdminContent\b|\bAdminContentManager\b/;
const UUID = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = { id: UUID(1), email: 'admin@courage-library.test', app_metadata: { role: 'admin' }, user_metadata: {} };

(async () => {
  // ===================== S: static =====================
  await test('S-01 no retired-table / removed-action reference in app, services, lib, actions, components, types, config', async () => {
    const files = ['app', 'services', 'lib', 'actions', 'components', 'types', 'config'].flatMap((d) => walk(path.join(ROOT, d)));
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (RETIRED_RE.test(line)) bad.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        // legacy dependent columns (current-affairs tables have their own article_id — excluded)
        if (/\b(\.article_id|resource_id)\b/.test(line) && !/current[_-]?affairs|currentAffairs|CurrentAffairs/i.test(line) && !/current-affairs|current_affairs/.test(rel(f))) bad.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    assert(bad.length === 0, bad.slice(0, 15).join('\n        '));
    return `${files.length} files`;
  });
  await test('S-02 removed: admin legacy content manager, createArticleAction, getAdminContent, bulk-import "articles" option', async () => {
    assert(!fs.existsSync(path.join(ROOT, 'components/admin/admin-content-manager.tsx')), 'admin-content-manager.tsx still exists');
    assert(!/export async function createArticleAction/.test(read('app/admin/actions.ts')));
    assert(!/getAdminContent\(/.test(read('services/admin.service.ts')) && !/getAdminContent/.test(read('app/admin/content/page.tsx')));
    assert(!/value="articles"/.test(read('components/admin/bulk-import-modal.tsx')));
  });
  await test('S-03 /courses links gated by server-evaluated FEATURE_COURSES (nav, header, mobile, /articles, thread)', async () => {
    // UX-1b: the shell (components/shell) lists /courses only in nav-config with flag "COURSES" (filtered by visibleItems)
    const files = ['components/shell/header-bar.tsx', 'components/shell/bottom-nav.tsx', 'components/shell/site-footer.tsx', 'app/articles/page.tsx', 'app/community/[id]/thread-client.tsx'];
    assert(/\{ href: "\/courses", label: "Courses", flag: "COURSES" \}/.test(read('components/shell/nav-config.ts')), 'nav-config /courses not flagged');
    const bad = [];
    for (const f of files) {
      const s = read(f);
      let i = -1;
      while ((i = s.indexOf('href="/courses"', i + 1)) >= 0) {
        const before = s.slice(Math.max(0, i - 160), i);
        if (!/\{(coursesEnabled|isFeatureEnabled\("COURSES"\)) && \(\s*<Link\s*$/.test(before)) bad.push(`${f}: ungated /courses link`);
      }
    }
    assert(/COURSES: isFeatureEnabled\("COURSES"\)/.test(read('components/shell/app-shell.tsx')), 'shell does not pass the flag');
    assert(/coursesEnabled=\{isFeatureEnabled\("COURSES"\)\}/.test(read('app/community/[id]/page.tsx')), 'thread page does not pass the flag');
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('S-04 compile resolvers: no placeholder / mock reference path remains', async () => {
    for (const f of ['services/question-reference.service.ts', 'services/asset-reference.service.ts', 'services/controlled-content-compiler.service.ts', 'services/learning/reference-catalog.ts']) {
      const s = read(f);
      assert(!/mock-|Mock |canonical-q-id|Canonical Question Text|SSC CGL Tier 1|asset-slug|Educational Diagram|learning\/assets\//.test(s), `${f} still contains a placeholder`);
    }
    for (const f of ['services/admin-content-studio.service.ts', 'services/ai/structured-content-importer.service.ts']) {
      const s = read(f);
      const compiles = (s.match(/compileAndStoreVersion\(\{[\s\S]*?\}\);/g) || []);
      assert(compiles.length > 0 && compiles.every((c) => /referenceCatalogs: createReferenceCatalogs\(/.test(c)), `${f}: a compile path has no reference catalogs`);
    }
    assert(/ControlledContentCompiler\.compile\(spec, createReferenceCatalogs\(/.test(read('services/admin-content-studio.service.ts')), 'compileVersion without catalogs');
    assert(/verifyReferences\(publishSpec, createReferenceCatalogs\(/.test(read('services/admin-content-studio.service.ts')), 'publish does not re-verify references');
  });
  await test('S-05 FEATURE_COURSES: server-only flag, default off, exact "true"', async () => {
    const cfg = read('config/features.ts');
    assert(/COURSES: 'FEATURE_COURSES'/.test(cfg) && /COURSES: false/.test(cfg) && !/NEXT_PUBLIC_FEATURE_COURSES/.test(cfg));
    delete require.cache[require.resolve(path.join(ROOT, 'config/features.ts'))];
    const { isFeatureEnabled } = require(path.join(ROOT, 'config/features.ts'));
    const v = (x) => { if (x === undefined) delete process.env.FEATURE_COURSES; else process.env.FEATURE_COURSES = x; return isFeatureEnabled('COURSES'); };
    assert(v(undefined) === false && v('') === false && v('1') === false && v('TRUE') === false && v('yes') === false && v('true') === true);
    delete process.env.FEATURE_COURSES;
  });

  // ===================== K: courses flag =====================
  const params = { params: Promise.resolve({ slug: 'any-course' }), searchParams: Promise.resolve({}) };
  await test('K-01 flag OFF: /courses, /courses/[slug], /courses/[slug]/learn → notFound with ZERO calls', async () => {
    delete process.env.FEATURE_COURSES;
    const bad = [];
    for (const p of ['app/courses/page.tsx', 'app/courses/[slug]/page.tsx', 'app/courses/[slug]/learn/page.tsx']) {
      calls.length = 0;
      let nf = false;
      try { await freshRequire(p).default(params); } catch (e) { nf = e instanceof NotFoundSignal; if (!nf) bad.push(`${p}: ${e.message}`); }
      if (!nf) bad.push(`${p}: not notFound`);
      if (calls.length) bad.push(`${p}: calls ${calls.join(',')}`);
    }
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('K-02 flag OFF: /api/courses/complete-lesson + playback-heartbeat → 404 FEATURE_DISABLED with ZERO calls', async () => {
    const bad = [];
    for (const p of ['app/api/courses/complete-lesson/route.ts', 'app/api/courses/playback-heartbeat/route.ts']) {
      calls.length = 0;
      const res = await freshRequire(p).POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ lessonId: UUID(9) }) }));
      const j = await res.json();
      if (res.status !== 404 || j.code !== 'FEATURE_DISABLED') bad.push(`${p}: ${res.status} ${JSON.stringify(j)}`);
      if (calls.length) bad.push(`${p}: calls ${calls.join(',')}`);
    }
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('K-03 flag OFF: ContentService course entry points (getCourses, getCourseBySlug, updateLessonPlayback, completeLesson) → disabled, ZERO calls', async () => {
    REAL_SERVICES.add('@/services/content.service');
    calls.length = 0;
    const { ContentService } = freshRequire('services/content.service.ts');
    const a = await ContentService.getCourses();
    const b = await ContentService.getCourseBySlug('x');
    const c = await ContentService.updateLessonPlayback(UUID(9), 10);
    const d = await ContentService.completeLesson(UUID(9));
    REAL_SERVICES.delete('@/services/content.service');
    assert(Array.isArray(a) && a.length === 0 && b === null && c.code === 'FEATURE_DISABLED' && d.code === 'FEATURE_DISABLED', JSON.stringify({ a, b, c, d }));
    assert(calls.length === 0, calls.join(','));
  });
  await test('K-04 flag OFF: admin createCourseAction → FEATURE_DISABLED before guard/DB (also covered by SEC-1B Q-01)', async () => {
    calls.length = 0;
    sessionState.user = ADMIN;
    const { createCourseAction } = freshRequire('app/admin/actions.ts');
    const fd = new FormData(); fd.set('title', 'x'); fd.set('slug', 'x');
    const r = await createCourseAction(null, fd);
    assert(r && r.code === 'FEATURE_DISABLED' && calls.length === 0, `${JSON.stringify(r)} calls=${calls.join(',')}`);
  });
  await test('K-05 flag ON: lessons resolve ONLY via LearningResolverService.resolveDocuments(learning_document_id)', async () => {
    process.env.FEATURE_COURSES = 'true';
    REAL_SERVICES.add('@/services/content.service');
    const docId = UUID(77);
    const resolverCalls = [];
    resolverMock.resolveDocuments = async (ids) => {
      resolverCalls.push(ids);
      return new Map([[docId, { id: docId, title: 'Doc', href: '/articles/doc', is_locked: false, access_level: 'FREE' }]]);
    };
    const log = [];
    sessionState.user = null;
    sessionState.db = makeDb({
      courses: [{ id: UUID(5), slug: 'c1', is_published: true, title: 'C', access_tier: 'FREE', price_inr: 0,
        course_modules: [{ id: UUID(6), title: 'M', display_order: 1, course_lessons: [
          { id: UUID(7), module_id: UUID(6), title: 'L1', slug: 'l1', lesson_type: 'TEXT', duration_seconds: 0, is_free_preview: true, display_order: 1, learning_document_id: docId },
          { id: UUID(8), module_id: UUID(6), title: 'L2', slug: 'l2', lesson_type: 'VIDEO', duration_seconds: 10, is_free_preview: true, display_order: 2, learning_document_id: null },
        ] }] }],
    }, log);
    const { ContentService } = freshRequire('services/content.service.ts');
    const detail = await ContentService.getCourseBySlug('c1');
    resolverMock.resolveDocuments = null;
    sessionState.db = null;
    REAL_SERVICES.delete('@/services/content.service');
    delete process.env.FEATURE_COURSES;
    assert(detail, 'no course detail');
    const lessons = detail.modules[0].lessons;
    assert(resolverCalls.length === 1 && JSON.stringify(resolverCalls[0]) === JSON.stringify([docId]), `resolver calls ${JSON.stringify(resolverCalls)}`);
    assert(lessons[0].learningDocument && lessons[0].learningDocument.href === '/articles/doc' && lessons[1].learningDocument === null, JSON.stringify(lessons));
    assert(!log.some((l) => /learning_documents|document_versions/.test(l)), `content service read learning tables directly: ${log.join(',')}`);
    assert(!/learning_documents|document_versions|getLearningArtifactStorage/.test(read('services/content.service.ts').split('getCourseBySlug')[1].split('static async updateLessonPlayback')[0]), 'getCourseBySlug reads content outside the resolver');
  });

  // ===================== R: compile resolvers =====================
  serviceMocks = false; // real services from here on
  const spec = () => JSON.parse(JSON.stringify(require(path.join(__dirname, 'fixtures/gap2_2b_lesson_spec.json'))));
  const QV = UUID(101);
  const ASSET = UUID(201);
  const withRefs = () => { const s = spec(); s.authenticPyqReferences = [{ questionVersionId: QV, relevanceRationale: 'Direct application.' }]; s.sections[0].diagramAssetId = ASSET; return s; };
  const storage = (objects) => ({ providerType: 'memory', put: async () => ({}), get: async (b, k) => (objects[k] ? { data: Buffer.from(objects[k]) } : null), exists: async (b, k) => Boolean(objects[k]), delete: async () => undefined });
  const catalogs = (qRow, aRow, objects = {}) => {
    const { createReferenceCatalogs } = freshRequire('services/learning/reference-catalog.ts');
    const db = makeDb({ question_versions: qRow ? [qRow] : [], learning_assets: aRow ? [aRow] : [] }, []);
    return createReferenceCatalogs(db, storage(objects));
  };
  const goodQ = { id: QV, question_id: UUID(102), version_number: 1, question_text: 'Q', options_type: 'SINGLE_CHOICE', lifecycle_status: 'PUBLISHED', is_current: true, questions: { status: 'published' } };
  const goodA = { id: ASSET, status: 'PUBLISHED', storage_bucket: 'learning-artifacts', storage_key: 'learning/assets/real.svg', mime_type: 'image/svg+xml', alt_text: 'Diagram', caption: null, original_filename: 'real.svg', width: 10, height: 10, aspect_ratio: 1 };
  const compile = async (s, cat) => freshRequire('services/controlled-content-compiler.service.ts').ControlledContentCompiler.compile(s, cat);
  const codes = (r) => (r.errors || []).map((e) => e.code).sort().join(',');

  await test('R-01 no catalog clients → both references unresolved (REFERENCE_CATALOG_UNAVAILABLE), compile fails', async () => {
    const r = await compile(withRefs(), undefined);
    assert(!r.success && r.validationStage === 'REFERENTIAL' && codes(r) === 'REFERENCE_CATALOG_UNAVAILABLE,REFERENCE_CATALOG_UNAVAILABLE', JSON.stringify(r.errors));
    assert(r.errors.every((e) => e.message.includes(e.path)), 'error does not name the reference');
  });
  await test('R-02 unknown question version + unknown asset → QUESTION_NOT_FOUND, ASSET_NOT_FOUND', async () => {
    const r = await compile(withRefs(), catalogs(null, null));
    assert(!r.success && codes(r) === 'ASSET_NOT_FOUND,QUESTION_NOT_FOUND', codes(r));
  });
  await test('R-03 unpublished / non-current / archived-question versions → QUESTION_INACTIVE', async () => {
    for (const q of [{ ...goodQ, lifecycle_status: 'DRAFT', is_current: true }, { ...goodQ, is_current: false }, { ...goodQ, questions: { status: 'archived' } }, { ...goodQ, lifecycle_status: 'IN_REVIEW' }]) {
      const r = await compile(withRefs(), catalogs(q, goodA, { [goodA.storage_key]: '<svg/>' }));
      assert(!r.success && codes(r) === 'QUESTION_INACTIVE', `${JSON.stringify(q)} → ${codes(r)}`);
    }
  });
  await test('R-04 asset: missing storage object / not published / outside the private bucket → ASSET_INACTIVE', async () => {
    for (const [a, objs] of [[goodA, {}], [{ ...goodA, status: 'VALIDATED' }, { [goodA.storage_key]: 'x' }], [{ ...goodA, storage_bucket: 'question-images' }, { [goodA.storage_key]: 'x' }]]) {
      const r = await compile(withRefs(), catalogs(goodQ, a, objs));
      assert(!r.success && codes(r) === 'ASSET_INACTIVE', `${JSON.stringify(a.status)}/${a.storage_bucket} → ${codes(r)}`);
    }
  });
  await test('R-05 valid published question + real asset object → compiles', async () => {
    const r = await compile(withRefs(), catalogs(goodQ, goodA, { [goodA.storage_key]: '<svg/>' }));
    assert(r.success && r.artifact && r.artifact.questionVersionIds[0] === QV && r.artifact.assetIds[0] === ASSET, JSON.stringify(r.errors || r));
  });
  await test('R-06 spec without references compiles without catalogs (no false positives)', async () => {
    const s = spec(); s.authenticPyqReferences = []; delete s.sections[0].diagramAssetId;
    const r = await compile(s, undefined);
    assert(r.success, JSON.stringify(r.errors));
  });

  // publish / compile action with unresolved references
  // The storage override must be set on the module instance the service under test loaded.
  const setStorage = (p) => require(path.join(ROOT, 'services/storage/learning-artifact-storage.ts')).setLearningArtifactStorageForTests(p);
  const VID = UUID(301);
  const versionRow = (status) => ({ id: VID, document_id: UUID(302), version_number: 1, is_published: false, review_status: status, source_spec_storage_key: 'spec.json', compiled_artifact_storage_key: 'art.mdx', approved_by_user_id: null });
  await test('R-07 publishVersion: a COMPILED version whose references no longer resolve is NOT published (no update)', async () => {
    const log = [];
    sessionState.user = ADMIN;
    const adminDb = makeDb({ document_versions: [versionRow('COMPILED')], question_versions: [], learning_assets: [] }, log);
    const { AdminContentStudioService } = freshRequire('services/admin-content-studio.service.ts');
    setStorage(storage({ 'spec.json': JSON.stringify(withRefs()), 'art.mdx': 'x' }));
    let err = null;
    try { await AdminContentStudioService.publishVersion(VID, adminDb); } catch (e) { err = e; }
    setStorage(null);
    assert(err && /\[UNRESOLVED_REFERENCES\]/.test(err.message) && err.message.includes(QV) && err.message.includes(ASSET), err ? err.message : 'published');
    assert(!log.some((l) => l.startsWith('update:')), `writes happened: ${log.join(',')}`);
  });
  await test('R-08 compileVersionAction: unresolved references → VALIDATION failure naming them (no status change)', async () => {
    const log = [];
    sessionState.user = ADMIN;
    sessionState.adminDb = makeDb({ document_versions: [versionRow('APPROVED')], question_versions: [], learning_assets: [] }, log);
    const { compileVersionAction } = freshRequire('app/admin/content/actions.ts');
    setStorage(storage({ 'spec.json': JSON.stringify(withRefs()), 'art.mdx': 'x' }));
    const r = await compileVersionAction(VID);
    setStorage(null);
    sessionState.adminDb = null;
    assert(r && r.ok === false && r.error === 'VALIDATION' && r.message.includes(QV) && r.message.includes(ASSET), JSON.stringify(r).slice(0, 300));
    assert(!log.some((l) => l.startsWith('update:')), `writes happened: ${log.join(',')}`);
  });

  // ===================== D: database =====================
  if (ARGS.has('--db')) await dbTests();

  console.log(lines.join('\n'));
  console.log(`\nGAP2-2b suite: ${passed}/${passed + failed} passed${ARGS.has('--db') ? ' (offline + DB)' : ' (offline)'}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.log('SUITE ERROR', String(e && e.stack ? e.stack : e).slice(0, 1500)); process.exit(1); });

async function dbTests() {
  Module._load = originalLoad;
  globalThis.fetch = realFetch;
  const { Client } = require(path.join(ROOT, 'node_modules/pg'));
  const { readEnv, dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
  const env = readEnv();
  const TARGETS = ['learning_resources', 'learning_resource_topics', 'articles', 'article_versions'];
  // §1 forensics (pre-migration): row counts and non-null dependent values.
  const EXPECTED_ROWS = { learning_resources: 1, learning_resource_topics: 0, articles: 1, article_versions: 0 };
  const EXPECTED_REFS = { discussion_threads: 0, batch_curriculum_assignments: 0, daily_study_recommendations: 0, course_lessons: 0 };
  const ZERO_REF = "(?<![/\\w-])(learning_resources|learning_resource_topics|articles|article_versions)\\M(?!/)";

  let c;
  for (let i = 1; i <= 3; i++) {
    try { c = new Client({ ...dbTarget().pg, port: 6543 }); c.on('error', () => {}); await c.connect(); break; } catch (e) { c = null; if (i === 3) { failed++; lines.push(`  FAIL  D-00 connect: ${e.code || e.message}`); return; } }
  }
  const q = async (s, p = []) => (await c.query(s, p)).rows;
  const ro = async (fn) => { await c.query('BEGIN READ ONLY'); try { return await fn(); } finally { await c.query('ROLLBACK'); } };
  const rw = async (fn) => { await c.query('BEGIN READ WRITE'); try { return await fn(); } finally { await c.query('ROLLBACK'); } };

  await test('D-01 retire targets exist ONLY in schema retired; retired has no anon/authenticated USAGE or table privileges', () => ro(async () => {
    const rows = await q(`SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname = ANY($1) AND c.relkind='r'`, [TARGETS]);
    assert(rows.length === 4 && rows.every((r) => r.nspname === 'retired'), JSON.stringify(rows));
    const usage = await q(`SELECT has_schema_privilege('anon','retired','USAGE') a, has_schema_privilege('authenticated','retired','USAGE') b, has_schema_privilege('public','retired','USAGE') p`);
    assert(!usage[0].a && !usage[0].b, JSON.stringify(usage));
    const priv = await q(`SELECT c.relname, r.rolname FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolname)
      WHERE c.relnamespace='retired'::regnamespace AND c.relkind IN ('r','S')
      AND (has_table_privilege(r.rolname, c.oid, 'SELECT') OR has_table_privilege(r.rolname, c.oid, 'INSERT') OR has_table_privilege(r.rolname, c.oid, 'UPDATE') OR has_table_privilege(r.rolname, c.oid, 'DELETE'))`);
    assert(priv.length === 0, JSON.stringify(priv));
    const acl = await q(`SELECT relname, relacl::text FROM pg_class WHERE relnamespace='retired'::regnamespace AND relkind='r' AND relacl::text ~ '(anon|authenticated|=r)'`);
    assert(acl.length === 0, JSON.stringify(acl));
  }));
  await test('D-02 PostgREST: anon key and qa-student session → /rest/v1/<retired> 4xx with no rows; Accept-Profile retired refused', async () => {
    const url = env('NEXT_PUBLIC_SUPABASE_URL');
    const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const get = async (p, token, profile) => {
      for (let i = 1; i <= 3; i++) {
        try {
          const r = await fetch(`${url}/rest/v1/${p}?select=*&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${token}`, ...(profile ? { 'Accept-Profile': profile } : {}) } });
          return { status: r.status, body: await r.text() };
        } catch (e) { if (i === 3) throw e; }
      }
    };
    // CI-FIX-1 (#74): CAPTCHA-safe QA session (scripts/live/qa-session.cjs)
    const studentToken = await require('./live/qa-session.cjs').qaAccessToken('qa-student@courage-library.test').catch(() => null);
    assert(studentToken, 'qa-student sign-in failed');
    const bad = [];
    for (const [who, tok] of [['anon', anon], ['qa-student', studentToken]]) {
      for (const t of TARGETS) {
        const r = await get(t, tok);
        let rows = null; try { const j = JSON.parse(r.body); rows = Array.isArray(j) ? j.length : null; } catch {}
        if (r.status < 400 || rows) bad.push(`${who} /rest/v1/${t} → ${r.status}${rows ? ' rows ' + rows : ''}`);
        const rp = await get(t, tok, 'retired');
        if (rp.status < 400) bad.push(`${who} Accept-Profile retired ${t} → ${rp.status}`);
      }
    }
    assert(bad.length === 0, bad.join('\n        '));
    return 'anon + qa-student × 4 tables × (public, Accept-Profile retired)';
  });
  await test('D-03 zero references to retired tables from public functions, views, policies, triggers, column defaults', () => ro(async () => {
    const fn = await q(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosrc ~ $1`, [ZERO_REF]);
    const views = await q(`SELECT viewname FROM pg_views WHERE schemaname='public' AND definition ~ $1`, [ZERO_REF]);
    const mviews = await q(`SELECT matviewname FROM pg_matviews WHERE schemaname='public' AND definition ~ $1`, [ZERO_REF]);
    const pol = await q(`SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND (coalesce(qual,'') ~ $1 OR coalesce(with_check,'') ~ $1)`, [ZERO_REF]);
    const trg = await q(`SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace AND p.prosrc ~ $1`, [ZERO_REF]);
    const defs = await q(`SELECT c.relname, a.attname FROM pg_attrdef ad JOIN pg_class c ON c.oid=ad.adrelid JOIN pg_attribute a ON a.attrelid=ad.adrelid AND a.attnum=ad.adnum WHERE c.relnamespace='public'::regnamespace AND pg_get_expr(ad.adbin, ad.adrelid) ~ $1`, [ZERO_REF]);
    const fks = await q(`SELECT con.conname FROM pg_constraint con JOIN pg_class t ON t.oid=con.confrelid WHERE con.contype='f' AND con.connamespace='public'::regnamespace AND t.relnamespace='retired'::regnamespace`);
    const all = [...fn.map((r) => 'fn ' + r.proname), ...views.map((r) => 'view ' + r.viewname), ...mviews.map((r) => 'mview ' + r.matviewname), ...pol.map((r) => `policy ${r.tablename}.${r.policyname}`), ...trg.map((r) => `trigger ${r.relname}.${r.tgname}`), ...defs.map((r) => `default ${r.relname}.${r.attname}`), ...fks.map((r) => 'public fk → retired ' + r.conname)];
    assert(all.length === 0, all.join(', '));
  }));
  await test('D-04 data preservation: retired row counts == pre-migration; legacy_refs rows == pre-migration non-null dependent values', () => ro(async () => {
    for (const [t, n] of Object.entries(EXPECTED_ROWS)) {
      const got = Number((await q(`SELECT count(*) n FROM retired."${t}"`))[0].n);
      assert(got === n, `${t}: ${got} != ${n}`);
    }
    const refs = await q(`SELECT source_table, count(*)::int n FROM retired.gap2_2b_legacy_refs GROUP BY 1`);
    for (const [t, n] of Object.entries(EXPECTED_REFS)) {
      const got = (refs.find((r) => r.source_table === t) || { n: 0 }).n;
      assert(got === n, `legacy_refs ${t}: ${got} != ${n}`);
    }
    const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='retired' AND table_name='gap2_2b_legacy_refs' ORDER BY ordinal_position`);
    assert(['source_table', 'source_pk', 'column_name', 'old_value', 'retired_at'].every((x) => cols.some((r) => r.column_name === x)), JSON.stringify(cols));
  }));
  await test('D-05 new learning_document_id FKs valid; legacy dependent columns gone; checks re-pointed', () => ro(async () => {
    const fk = await q(`SELECT cl.relname tbl, con.conname, pg_get_constraintdef(con.oid) d, con.convalidated v FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid
      WHERE con.contype='f' AND cl.relname IN ('discussion_threads','batch_curriculum_assignments','daily_study_recommendations','course_lessons') AND pg_get_constraintdef(con.oid) ~ 'learning_documents'`);
    for (const t of ['discussion_threads', 'batch_curriculum_assignments', 'daily_study_recommendations', 'course_lessons']) assert(fk.some((r) => r.tbl === t && r.v), `${t}: no valid FK to learning_documents`);
    for (const t of ['discussion_threads', 'batch_curriculum_assignments', 'daily_study_recommendations']) assert(fk.find((r) => r.tbl === t).d.includes('ON DELETE SET NULL'), `${t}: not ON DELETE SET NULL`);
    for (const t of ['discussion_threads', 'batch_curriculum_assignments', 'daily_study_recommendations', 'course_lessons']) {
      const orphans = Number((await q(`SELECT count(*) n FROM public."${t}" x WHERE x.learning_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.learning_documents d WHERE d.id = x.learning_document_id)`))[0].n);
      assert(orphans === 0, `${t}: ${orphans} orphan learning_document_id`);
    }
    const gone = await q(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name IN ('discussion_threads','batch_curriculum_assignments') AND column_name='article_id') OR (table_name='daily_study_recommendations' AND column_name='resource_id') OR (table_name='course_lessons' AND column_name='learning_resource_id'))`);
    assert(gone.length === 0, JSON.stringify(gone));
    const checks = await q(`SELECT conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname IN ('check_exact_single_context','chk_assignment_content_xor')`);
    assert(checks.length === 2 && checks.every((r) => r.d.includes('learning_document_id') && !r.d.includes('article_id')), JSON.stringify(checks));
  }));
  await test('D-06 fn_publish_article_version dropped; rewritten functions keep SECURITY DEFINER + search_path; ACLs not widened', () => ro(async () => {
    assert((await q(`SELECT to_regprocedure('public.fn_publish_article_version(uuid,text,text,text,uuid)') IS NULL g`))[0].g, 'still exists');
    const fns = await q(`SELECT p.proname, p.prosecdef, array_to_string(p.proconfig, ',') cfg, array_to_string(p.proacl, ',') acl FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('fn_create_discussion_thread','fn_create_batch_assignment','fn_complete_course_lesson','fn_reconcile_search_indexes','fn_generate_daily_recommendations')`);
    assert(fns.length === 5, `found ${fns.length}`);
    const EXPECT_ACL = {
      fn_create_discussion_thread: 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres',
      fn_create_batch_assignment: '=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres',
      fn_complete_course_lesson: 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres',
      // SECDEF-S2-2 (090): authenticated EXECUTE revoked (no app caller) — narrowed, never widened
      fn_reconcile_search_indexes: 'postgres=X/postgres,service_role=X/postgres',
      fn_generate_daily_recommendations: 'postgres=X/postgres,service_role=X/postgres',
    };
    for (const f of fns) {
      assert(f.prosecdef && /search_path=public, pg_temp/.test(f.cfg), `${f.proname}: secdef/search_path`);
      assert(f.acl === EXPECT_ACL[f.proname], `${f.proname}: ACL ${f.acl}`);
    }
  }));

  // Shared fixture inside a rolled-back transaction: one PUBLISHED and one DRAFT learning document.
  const fixture = async () => {
    const topic = (await q(`SELECT id FROM public.topics ORDER BY created_at LIMIT 1`))[0].id;
    const studentId = (await q(`SELECT id FROM auth.users WHERE email='qa-student@courage-library.test'`))[0].id;
    const mk = async (status, published, slug) => {
      const u = (await q(`INSERT INTO public.learning_units (topic_id, title, slug, unit_type, estimated_minutes, display_order, is_active) VALUES ($1, $2, $3, 'CONCEPT_LESSON', 5, 0, true) RETURNING id`, [topic, `QA GAP2-2b ${slug}`, slug]))[0].id;
      const d = (await q(`INSERT INTO public.learning_documents (learning_unit_id, canonical_slug, document_type, status, access_level) VALUES ($1, $2, 'CONCEPT_LESSON', 'DRAFT', 'FREE') RETURNING id`, [u, slug]))[0].id;
      const h = 'a'.repeat(64);
      const v = (await q(`INSERT INTO public.document_versions (document_id, version_number, schema_version, compiler_version, component_contract_version, source_spec_storage_key, source_spec_hash, compiled_artifact_storage_key, compiled_artifact_hash, author_type, review_status, is_published, published_at)
        VALUES ($1, 1, '1.0.0', '1.0.0', '1.0.0', 'qa/spec.json', $2, 'qa/art.mdx', $2, 'HUMAN', $3, $4, CASE WHEN $4 THEN now() ELSE NULL END) RETURNING id`, [d, h, published ? 'PUBLISHED' : 'DRAFT', published]))[0].id;
      await q(`UPDATE public.learning_documents SET status = $2, current_published_version_id = CASE WHEN $3 THEN $4::uuid ELSE NULL END WHERE id = $1`, [d, status, published, v]);
      return d;
    };
    const pub = await mk('PUBLISHED', true, 'qa-gap2-2b-published-' + Date.now());
    const draft = await mk('DRAFT', false, 'qa-gap2-2b-draft-' + Date.now());
    return { pub, draft, studentId };
  };
  const asUser = async (sub, role = 'authenticated') => {
    await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
    await q(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub || '']);
    await q(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
  };

  await test('D-07 fn_create_discussion_thread (as qa-student, rolled back): PUBLISHED learning document → thread with learning_document_id; DRAFT → refused', () => rw(async () => {
    const f = await fixture();
    await asUser(f.studentId);
    await q('SET LOCAL ROLE authenticated');
    const ok = (await q(`SELECT public.fn_create_discussion_thread('ARTICLE', $1, 'QA GAP2-2b thread title', 'QA body text') r`, [f.pub]))[0].r;
    const no = (await q(`SELECT public.fn_create_discussion_thread('ARTICLE', $1, 'QA GAP2-2b thread title', 'QA body text') r`, [f.draft]))[0].r;
    await q('RESET ROLE');
    assert(ok.success === true, JSON.stringify(ok));
    assert(no.success === false, JSON.stringify(no));
    const row = (await q(`SELECT learning_document_id, context_type FROM public.discussion_threads WHERE id = $1`, [ok.thread_id]))[0];
    assert(row && row.learning_document_id === f.pub && row.context_type === 'ARTICLE', JSON.stringify(row));
  }));
  await test('D-08 fn_create_batch_assignment source re-pointed: ARTICLE assignments write learning_document_id', () => ro(async () => {
    const src = (await q(`SELECT prosrc FROM pg_proc WHERE proname='fn_create_batch_assignment' AND pronamespace='public'::regnamespace`))[0].prosrc;
    assert(/v_document_id := p_content_id/.test(src) && /flashcard_deck_id, learning_document_id, topic_id/.test(src) && !/article_id/.test(src), 'not re-pointed');
  }));
  await test('D-09 fn_generate_daily_recommendations: deprecated deterministic empty result, no rows written', () => rw(async () => {
    const f = await fixture();
    await asUser(f.studentId);
    const before = Number((await q(`SELECT count(*) n FROM public.daily_study_recommendations`))[0].n);
    const r = (await q(`SELECT public.fn_generate_daily_recommendations($1, CURRENT_DATE, 'v1.0') r`, [f.studentId]))[0].r;
    const after = Number((await q(`SELECT count(*) n FROM public.daily_study_recommendations`))[0].n);
    assert(r.success === true && r.deprecated === true && r.tasks_generated === 0 && before === after, JSON.stringify(r));
  }));
  await test('D-10 fn_reconcile_search_indexes (service role, rolled back): indexes the PUBLISHED learning document, never the DRAFT', () => rw(async () => {
    const f = await fixture();
    await asUser(null, 'service_role');
    const r = (await q(`SELECT public.fn_reconcile_search_indexes() r`))[0].r;
    assert(r.success === true, JSON.stringify(r));
    const pub = await q(`SELECT is_published, canonical_url FROM public.search_indexes WHERE entity_type='ARTICLE' AND source_id=$1`, [f.pub]);
    const draft = await q(`SELECT 1 FROM public.search_indexes WHERE source_id=$1`, [f.draft]);
    assert(pub.length === 1 && pub[0].is_published === true && pub[0].canonical_url.startsWith('/articles/'), JSON.stringify(pub));
    assert(draft.length === 0, 'DRAFT document indexed');
    const unpublishedArticles = Number((await q(`SELECT count(*) n FROM public.search_indexes si WHERE si.entity_type IN ('ARTICLE','RESOURCE') AND si.is_published
      AND NOT EXISTS (SELECT 1 FROM public.learning_documents d JOIN public.document_versions v ON v.id=d.current_published_version_id WHERE d.id=si.source_id AND d.status='PUBLISHED' AND v.is_published)`))[0].n);
    assert(unpublishedArticles === 0, `${unpublishedArticles} non-servable ARTICLE/RESOURCE entries published`);
  }));
  await test('D-11 fn_complete_course_lesson uses learning_document_id → learning_units.topic_id only', () => ro(async () => {
    const src = (await q(`SELECT prosrc FROM pg_proc WHERE proname='fn_complete_course_lesson' AND pronamespace='public'::regnamespace`))[0].prosrc;
    assert(/cl\.learning_document_id/.test(src) && /JOIN public\.learning_units u ON u\.id = d\.learning_unit_id/.test(src) && !/learning_resource/.test(src), 'not re-pointed');
  }));
  await test('D-14 fn_complete_course_lesson (as qa-student, rolled back): lesson → learning document completes and logs one ARTICLE_COMPLETED event on the document topic', () => rw(async () => {
    const f = await fixture();
    const lesson = (await q(`SELECT cl.id, c.id course_id FROM public.course_lessons cl JOIN public.course_modules cm ON cm.id = cl.module_id JOIN public.courses c ON c.id = cm.course_id LIMIT 1`))[0];
    assert(lesson, 'no course lesson to exercise');
    await q(`UPDATE public.course_lessons SET learning_document_id = $2, lesson_type = 'TEXT', duration_seconds = 0, is_published = true, is_free_preview = true WHERE id = $1`, [lesson.id, f.pub]);
    const topic = (await q(`SELECT u.topic_id FROM public.learning_documents d JOIN public.learning_units u ON u.id = d.learning_unit_id WHERE d.id = $1`, [f.pub]))[0].topic_id;
    await asUser(f.studentId);
    await q('SET LOCAL ROLE authenticated');
    const r1 = (await q(`SELECT public.fn_complete_course_lesson($1) r`, [lesson.id]))[0].r;
    const r2 = (await q(`SELECT public.fn_complete_course_lesson($1) r`, [lesson.id]))[0].r;
    await q('RESET ROLE');
    assert(r1.success === true && r2.success === true, JSON.stringify({ r1, r2 }));
    const ev = await q(`SELECT topic_id, event_type, resource_slug FROM public.learning_activity_events WHERE user_id = $1 AND metadata->>'lesson_id' = $2`, [f.studentId, lesson.id]);
    assert(ev.length === 1 && ev[0].topic_id === topic && ev[0].event_type === 'ARTICLE_COMPLETED' && ev[0].resource_slug.startsWith('qa-gap2-2b-published-'), JSON.stringify(ev));
  }));
  await test('D-12 rollback dry-run: docs/database/rollback/073_rollback.sql executes cleanly inside BEGIN … ROLLBACK', () => rw(async () => {
    await c.query(read('docs/database/rollback/073_rollback.sql'));
    const back = await q(`SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='articles' AND c.relkind='r'`);
    const cols = await q(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='article_id' AND table_name IN ('discussion_threads','batch_curriculum_assignments')`);
    const fn = (await q(`SELECT to_regprocedure('public.fn_publish_article_version(uuid,text,text,text,uuid)') IS NOT NULL e`))[0].e;
    const retired = (await q(`SELECT to_regnamespace('retired') IS NULL e`))[0].e;
    assert(back.length === 1 && back[0].nspname === 'public' && cols.length === 2 && fn && retired, JSON.stringify({ back, cols, fn, retired }));
  }));
  await test('D-13 after the rolled-back checks the live state is unchanged (tables still retired)', () => ro(async () => {
    const rows = await q(`SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname = ANY($1) AND c.relkind='r'`, [TARGETS]);
    assert(rows.length === 4 && rows.every((r) => r.nspname === 'retired'));
  }));
  await c.end();
}
