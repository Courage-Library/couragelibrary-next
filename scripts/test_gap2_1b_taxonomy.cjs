/**
 * COURAGE LIBRARY — GAP2-1b TAXONOMY SPINE TEST SUITE
 *
 * Part 1 (offline): TaxonomyService and the sections action with mocked admin auth and a
 *   recording Supabase mock; static scans for direct taxonomy writes. No network.
 * Part 2 (DB, --db): projection / guard / rule checks against couragelibrary-next. Every
 *   scenario runs inside BEGIN READ WRITE … ROLLBACK (ref guard + verified TLS via
 *   scripts/db/_db-env.cjs). Nothing is persisted.
 * Part 3 (--smoke): TaxonomyService against the real DB with a mocked admin session. Creates
 *   a QA subject + topic, renames / toggles / reorders them, then deletes both nodes (the
 *   projection removes the legacy rows). Leaves only the admin_audit_logs rows it wrote.
 *
 * Run: node scripts/test_gap2_1b_taxonomy.cjs [--db] [--smoke]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));

// ---------- TS transpile + @/ alias ----------
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  }
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

// ---------- Recording Supabase mock ----------
const WRITE_OPS = new Set(['insert', 'update', 'delete', 'upsert']);
function createMockSupabase(handler) {
  const log = { writes: [], queries: [] };
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = {};
    const record = (op) => (...args) => {
      q.ops.push({ op, args });
      if (WRITE_OPS.has(op)) log.writes.push({ table, op, args });
      return chain;
    };
    ['select', 'eq', 'neq', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete', 'upsert', 'ilike', 'is'].forEach((op) => {
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
  return { log, from: (table) => builder(table), rpc: async () => ({ data: null, error: null }) };
}
const opVal = (ops, op, col) => {
  const f = ops.find((o) => o.op === op && o.args[0] === col);
  return f ? f.args[1] : undefined;
};

// ---------- Module mocks ----------
const authState = { isAdmin: true, userId: '11111111-1111-4111-8111-111111111111', userEmail: 'admin@example.test' };
let currentSupabase = null;
let sessionOverride = null; // --smoke: a real signed-in qa-admin client
// SEC-1B: admin checks run through the canonical guard, which reads the session user.
const sessionUser = () => (authState.isAdmin ? { id: authState.userId, email: authState.userEmail, app_metadata: { role: 'admin' }, user_metadata: {} } : null);
const withSession = (client) => Object.assign(Object.create(null), client || {}, { auth: { getUser: async () => ({ data: { user: sessionUser() }, error: null }) } });
const MOCKS = {
  'server-only': {},
  '@/services/admin.service': {
    AdminService: { checkIsAdminOrStaff: async () => ({ ...authState }) },
    getIstTomorrowDateStr: () => '2026-01-01',
  },
  '@/lib/supabase/server': {
    createAdminServerSupabaseClient: () => currentSupabase,
    createServerSupabaseClient: async () => sessionOverride || withSession(currentSupabase),
  },
  'next/cache': { revalidatePath: () => undefined, revalidateTag: () => undefined },
  '@/lib/admin/bulk-importer': { BulkImportEngine: {} },
  '@/services/question-factory/question-csv-importer.service': { QuestionCsvImporterService: {} },
  '@/services/question-factory/admin-question-factory.service': { AdminQuestionFactoryService: {} },
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

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOPIC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NEW_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const nodeRow = (o) => ({ id: NEW_ID, parent_id: SUBJECT, root_subject_id: SUBJECT, name: 'Mensuration', slug: 'mensuration', node_type: 'TOPIC', node_depth: 2, hierarchy_path: 'quant.mensuration', display_order: 0, is_active: true, ...o });

function serviceMock(nodes, extra = {}) {
  return createMockSupabase(({ table, ops, mode }) => {
    if (table === 'canonical_taxonomy_nodes') {
      const ins = ops.find((o) => o.op === 'insert');
      const upd = ops.find((o) => o.op === 'update');
      if (ins) return extra.insertError ? { data: null, error: extra.insertError } : { data: nodeRow({ ...ins.args[0] }), error: null };
      if (upd) {
        const id = opVal(ops, 'eq', 'id');
        const base = nodes.find((n) => n.id === id) || nodeRow({ id });
        return { data: mode === 'single' ? { ...base, ...upd.args[0] } : null, error: null };
      }
      const id = opVal(ops, 'eq', 'id');
      if (id) return { data: nodes.find((n) => n.id === id) || null, error: null };
      const parent = opVal(ops, 'eq', 'parent_id');
      if (parent !== undefined) return { data: nodes.filter((n) => n.parent_id === parent), error: null };
      return { data: nodes, error: null };
    }
    if (table === 'admin_audit_logs') return { data: null, error: null };
    return { data: null, error: null };
  });
}

async function offline() {
  const rules = require(path.join(ROOT, 'services/taxonomy/taxonomy.rules.ts'));
  const svcMod = require(path.join(ROOT, 'services/taxonomy/taxonomy.service.ts'));
  const { TaxonomyService, mapTaxonomyDbError, buildTaxonomyTree } = svcMod;
  const subjectNode = { id: SUBJECT, parent_id: null, root_subject_id: SUBJECT, name: 'Quant', slug: 'quant', node_type: 'SUBJECT', node_depth: 1, hierarchy_path: 'quant', display_order: 0, is_active: true };
  const topicNode = { id: TOPIC, parent_id: SUBJECT, root_subject_id: SUBJECT, name: 'Algebra', slug: 'algebra', node_type: 'TOPIC', node_depth: 2, hierarchy_path: 'quant.algebra', display_order: 0, is_active: true };

  await test('O-01 slugify + name/slug validation', async () => {
    assert(rules.slugifyTaxonomyName('Profit & Loss') === 'profit-and-loss', rules.slugifyTaxonomyName('Profit & Loss'));
    assert(rules.slugifyTaxonomyName('  Speed, Distance / Time ') === 'speed-distance-time');
    assert(rules.validateNodeName('') && rules.validateNodeName('x'.repeat(121)) && !rules.validateNodeName('Algebra'));
    assert(rules.validateNodeSlug('Bad Slug') && rules.validateNodeSlug('a--b') && !rules.validateNodeSlug('time-and-work'));
  });

  await test('O-02 parent rules mirror the DB trigger', async () => {
    const ok = (t, p) => rules.isAllowedParent(t, p);
    assert(ok('SUBJECT', null) && !ok('SUBJECT', 'SUBJECT'));
    assert(ok('DOMAIN', 'SUBJECT') && !ok('DOMAIN', 'TOPIC') && !ok('DOMAIN', null));
    assert(ok('TOPIC', 'SUBJECT') && ok('TOPIC', 'DOMAIN') && !ok('TOPIC', 'TOPIC') && !ok('TOPIC', null));
    assert(ok('SUBTOPIC', 'TOPIC') && !ok('SUBTOPIC', 'SUBJECT'));
    assert(ok('CONCEPT', 'SUBTOPIC') && ok('METHOD', 'CONCEPT') && !ok('CONCEPT', null));
    const migration = read('supabase/migrations/20261012000070_t3_nodes_write_master_projection.sql');
    assert(/NEW\.node_type = 'TOPIC' AND v_parent_type NOT IN \('SUBJECT', 'DOMAIN'\)/.test(migration), 'migration TOPIC rule changed');
    assert(/NEW\.node_type = 'SUBTOPIC' AND v_parent_type <> 'TOPIC'/.test(migration), 'migration SUBTOPIC rule changed');
  });

  await test('O-03 every method rejects non-admins before any query', async () => {
    authState.isAdmin = false;
    currentSupabase = serviceMock([subjectNode]);
    try {
      const results = [
        await TaxonomyService.listTree(),
        await TaxonomyService.listNodesByType('SUBJECT'),
        await TaxonomyService.createNode({ parentId: SUBJECT, nodeType: 'TOPIC', name: 'X' }),
        await TaxonomyService.renameNode(TOPIC, 'Y'),
        await TaxonomyService.reorder(SUBJECT, [TOPIC]),
        await TaxonomyService.setActive(TOPIC, false),
      ];
      assert(results.every((r) => !r.success && r.code === 'UNAUTHORIZED'), JSON.stringify(results));
      assert(currentSupabase.log.queries.length === 0, 'queried while unauthorized');
    } finally {
      authState.isAdmin = true;
    }
  });

  await test('O-04 createNode writes only canonical_taxonomy_nodes + audit (correct columns)', async () => {
    currentSupabase = serviceMock([subjectNode]);
    const r = await TaxonomyService.createNode({ parentId: SUBJECT, nodeType: 'TOPIC', name: 'Mensuration', description: 'Areas and volumes' });
    assert(r.success, JSON.stringify(r));
    const tables = currentSupabase.log.writes.map((w) => `${w.table}.${w.op}`);
    assert(JSON.stringify(tables) === JSON.stringify(['canonical_taxonomy_nodes.insert', 'admin_audit_logs.insert']), tables.join(','));
    const row = currentSupabase.log.writes[0].args[0];
    assert(row.node_type === 'TOPIC' && row.slug === 'mensuration' && row.parent_id === SUBJECT && row.metadata.description === 'Areas and volumes', JSON.stringify(row));
    assert(!('legacy_topic_id' in row) && !('id' in row), 'service must not set ids/legacy columns (DB trigger does)');
    const audit = currentSupabase.log.writes[1].args[0];
    assert(Object.keys(audit).sort().join(',') === 'action_type,actor_email,actor_id,new_value,old_value,reason,target_entity,target_id', Object.keys(audit).join(','));
    assert(audit.action_type === 'TAXONOMY_NODE_CREATE' && audit.target_entity === 'canonical_taxonomy_node' && audit.actor_id === authState.userId);
  });

  await test('O-05 createNode rejects invalid parent type / unknown parent / bad slug without writing', async () => {
    currentSupabase = serviceMock([subjectNode, topicNode]);
    const a = await TaxonomyService.createNode({ parentId: TOPIC, nodeType: 'TOPIC', name: 'Nested' });
    const b = await TaxonomyService.createNode({ parentId: SUBJECT, nodeType: 'SUBTOPIC', name: 'Orphan' });
    const c = await TaxonomyService.createNode({ parentId: null, nodeType: 'CONCEPT', name: 'Root concept' });
    const d = await TaxonomyService.createNode({ parentId: NEW_ID, nodeType: 'TOPIC', name: 'Ghost parent' });
    const e = await TaxonomyService.createNode({ parentId: SUBJECT, nodeType: 'TOPIC', name: 'Ok', slug: 'Not A Slug' });
    assert(!a.success && a.code === 'TAXONOMY_RULE' && !b.success && !c.success && d.code === 'NOT_FOUND' && e.code === 'VALIDATION', JSON.stringify([a, b, c, d, e]));
    assert(currentSupabase.log.writes.length === 0, 'wrote despite rejection');
  });

  await test('O-06 rename / setActive / reorder audit; reorder requires exact sibling set', async () => {
    currentSupabase = serviceMock([subjectNode, topicNode, { ...topicNode, id: NEW_ID, name: 'Geometry', slug: 'geometry', display_order: 1 }]);
    const r1 = await TaxonomyService.renameNode(TOPIC, 'Algebra II');
    const r2 = await TaxonomyService.setActive(TOPIC, false);
    const bad = await TaxonomyService.reorder(SUBJECT, [TOPIC]);
    const r3 = await TaxonomyService.reorder(SUBJECT, [NEW_ID, TOPIC]);
    assert(r1.success && r2.success && !bad.success && bad.code === 'VALIDATION' && r3.success, JSON.stringify([r1, r2, bad, r3]));
    const actions = currentSupabase.log.writes.filter((w) => w.table === 'admin_audit_logs').map((w) => w.args[0].action_type);
    assert(JSON.stringify(actions) === JSON.stringify(['TAXONOMY_NODE_RENAME', 'TAXONOMY_NODE_DEACTIVATE', 'TAXONOMY_NODE_REORDER']), actions.join(','));
    assert(currentSupabase.log.writes.every((w) => ['canonical_taxonomy_nodes', 'admin_audit_logs'].includes(w.table)));
  });

  await test('O-07 DB errors map to admin messages', async () => {
    assert(mapTaxonomyDbError({ message: 'TAXONOMY_RULE: a TOPIC node cannot be placed under a TOPIC node' }).code === 'TAXONOMY_RULE');
    assert(mapTaxonomyDbError({ code: '23505', message: 'duplicate key value violates unique constraint "topics_slug_key"' }).code === 'DUPLICATE_SLUG');
    assert(mapTaxonomyDbError({ code: '23505', message: 'violates unique constraint "uq_canonical_sibling_slug"' }).code === 'DUPLICATE_SLUG');
    assert(mapTaxonomyDbError({ code: '23505', message: 'violates unique constraint "uq_topics_subject_name"' }).code === 'DUPLICATE_NAME');
    assert(mapTaxonomyDbError({ message: 'TAXONOMY_PROJECTION_ONLY: INSERT on public.topics' }).code === 'TAXONOMY_PROJECTION_ONLY');
    assert(mapTaxonomyDbError({ code: 'XX000', message: 'boom' }).code === 'DB_ERROR');
  });

  await test('O-08 buildTaxonomyTree nests and orders children', async () => {
    const tree = buildTaxonomyTree([
      { id: 's', parentId: null, nodeType: 'SUBJECT', name: 'S', displayOrder: 0 },
      { id: 't2', parentId: 's', nodeType: 'TOPIC', name: 'B', displayOrder: 1 },
      { id: 't1', parentId: 's', nodeType: 'TOPIC', name: 'A', displayOrder: 0 },
      { id: 'st', parentId: 't1', nodeType: 'SUBTOPIC', name: 'C', displayOrder: 0 },
    ]);
    assert(tree.length === 1 && tree[0].children.map((c) => c.id).join() === 't1,t2' && tree[0].children[0].children[0].id === 'st');
  });

  await test('O-09 sections action rejects free-text taxonomy creation and never writes subjects/topics', async () => {
    const actions = require(path.join(ROOT, 'app/admin/actions.ts'));
    const fd = (o) => ({ get: (k) => (k in o ? o[k] : null) });
    const base = { patternId: 'p1', name: 'Brand New Subject Name', questionCount: '25', marksPerQuestion: '2', negativeMark: '0.5' };
    currentSupabase = createMockSupabase(({ table }) => (table === 'pattern_sections' ? { data: [], error: null } : { data: null, error: null }));
    const missing = await actions.createSectionAction(null, fd(base));
    const unknown = await actions.createSectionAction(null, fd({ ...base, subjectId: NEW_ID }));
    assert(missing.error && /\/admin\/taxonomy/.test(missing.error), JSON.stringify(missing));
    assert(unknown.error && /\/admin\/taxonomy/.test(unknown.error), JSON.stringify(unknown));
    assert(!currentSupabase.log.writes.some((w) => ['subjects', 'topics', 'subtopics', 'canonical_taxonomy_nodes'].includes(w.table)), 'taxonomy write attempted');
    // existing subject → section is created against it, still no taxonomy write
    currentSupabase = createMockSupabase(({ table, ops }) => {
      if (table === 'canonical_taxonomy_nodes') return { data: opVal(ops, 'eq', 'id') === SUBJECT ? { id: SUBJECT, is_active: true } : null, error: null };
      if (table === 'pattern_sections') return { data: [], error: null };
      return { data: null, error: null };
    });
    const ok = await actions.createSectionAction(null, fd({ ...base, subjectId: SUBJECT }));
    assert(ok.success, JSON.stringify(ok));
    const writes = currentSupabase.log.writes.map((w) => `${w.table}.${w.op}`);
    assert(JSON.stringify(writes) === JSON.stringify(['pattern_sections.insert']) && currentSupabase.log.writes[0].args[0].subject_id === SUBJECT, writes.join(','));
    assert(!('toggleSectionStatusAction' in actions), 'toggleSectionStatusAction (direct subjects write) still exported');
  });

  await test('O-10 static: no direct subjects/topics/subtopics writes anywhere in app code', async () => {
    const hits = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '.next'].includes(e.name)) walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          const s = fs.readFileSync(p, 'utf8');
          const re = /from\(\s*['"`](subjects|topics|subtopics)['"`]\s*\)/g;
          let m;
          while ((m = re.exec(s))) {
            const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 400);
            const next = tail.search(/\.from\(|;\s*\n/);
            const segment = next >= 0 ? tail.slice(0, next) : tail;
            if (/\.(insert|upsert|update|delete)\(/.test(segment)) hits.push(`${path.relative(ROOT, p)} ${m[1]}`);
          }
          const sql = /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(public\.)?(subjects|topics|subtopics)\b/gi;
          while ((m = sql.exec(s))) hits.push(`${path.relative(ROOT, p)} SQL ${m[0]}`);
        }
      }
    };
    ['app', 'services', 'lib', 'actions', 'components', 'features'].forEach((d) => fs.existsSync(path.join(ROOT, d)) && walk(path.join(ROOT, d)));
    assert(hits.length === 0, hits.join('; '));
  });

  await test('O-11 static: projection service deleted; client UI imports no server modules; sidebar link', async () => {
    assert(!fs.existsSync(path.join(ROOT, 'services/canonical-taxonomy-projection.service.ts')), 'orphan projection service still present');
    const ui = read('app/admin/taxonomy/taxonomy-manager.tsx');
    assert(/^"use client";/.test(ui) && !/taxonomy\.service|lib\/supabase|admin\.service/.test(ui), 'client component imports server code');
    const page = read('app/admin/taxonomy/page.tsx');
    assert(/TaxonomyService\.listTree\(\)/.test(page));
    const actions = read('app/admin/taxonomy/actions.ts');
    assert(/^"use server";/.test(actions) && !/\.from\(/.test(actions), 'taxonomy actions must only call TaxonomyService');
    assert(/href="\/admin\/taxonomy"/.test(read('components/admin/admin-sidebar.tsx')), 'sidebar link missing');
  });

  await test('O-12 static: every TaxonomyService mutation checks admin and writes an audit row', async () => {
    const src = read('services/taxonomy/taxonomy.service.ts');
    for (const m of ['createNode', 'renameNode', 'reorder', 'setActive']) {
      const start = src.indexOf(`static async ${m}(`);
      const body = src.slice(start, src.indexOf('\n  }\n', start));
      assert(start > 0 && /this\.requireAdmin\(\)/.test(body) && /this\.audit\(/.test(body), `${m} lacks admin check or audit`);
    }
    assert(!/from\(['"](subjects|topics|subtopics)['"]\)/.test(src), 'service touches projection tables');
  });

  await test('O-13 static: migrations 069/070/071 present with the required guards', async () => {
    const m69 = read('supabase/migrations/20261012000069_t3_identity_rekey_canonical_nodes.sql');
    const m70 = read('supabase/migrations/20261012000070_t3_nodes_write_master_projection.sql');
    const m71 = read('supabase/migrations/20261012000071_revoke_learn_more_public_execute.sql');
    assert(/T3_REKEY_WINDOW_CLOSED/.test(m69) && /chk_canonical_legacy_identity/.test(m69) && /T3_REKEY_PROOF/.test(m69));
    assert(/app\.taxonomy_projection_write/.test(m70) && /BEFORE TRUNCATE ON public\.topics/.test(m70) && /DEFERRABLE INITIALLY DEFERRED/.test(m70));
    assert(/REVOKE EXECUTE ON FUNCTION public\.fn_resolve_learn_more\(uuid, uuid\) FROM PUBLIC, anon, authenticated/.test(m71));
    assert(!/EXCEPTION\s+WHEN\s+OTHERS/i.test(m69 + m70 + m71), 'exception swallowing in migrations');
  });
}

// ---------- Part 2: DB scenarios (rolled back) ----------
async function db() {
  const { Client } = require('pg');
  const { dbTarget } = require('./db/_db-env.cjs');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const one = async (sql, p = []) => (await q(sql, p))[0];
  const tag = `qa-gap2-${Date.now().toString(36)}`;

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
    assert(err, 'expected an error, statement succeeded');
    assert(re.test(`${err.code} ${err.message}`), `unexpected error: ${err.code} ${err.message}`);
    return err;
  }
  const insertNode = async (o) =>
    one(
      `INSERT INTO public.canonical_taxonomy_nodes (parent_id, name, slug, node_type, display_order, metadata)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), '{"source":"QA"}'::jsonb) RETURNING *`,
      [o.parent, o.name, o.slug, o.type, o.order ?? null]
    );
  const counts = async () => one(`SELECT (SELECT count(*) FROM public.subjects)::int s, (SELECT count(*) FROM public.topics)::int t, (SELECT count(*) FROM public.subtopics)::int st, (SELECT count(*) FROM public.canonical_taxonomy_nodes)::int n`);

  const before = await counts();
  const subject = await one(`SELECT id, slug FROM public.canonical_taxonomy_nodes WHERE node_type='SUBJECT' ORDER BY slug LIMIT 1`);
  const subject2 = await one(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type='SUBJECT' AND id <> $1 ORDER BY slug LIMIT 1`, [subject.id]);
  const usedTopic = await one(`SELECT canonical_topic_id id FROM public.questions LIMIT 1`);
  const existingTopicSlug = (await one(`SELECT slug FROM public.topics WHERE subject_id <> $1 LIMIT 1`, [subject.id])).slug;

  await test('DB-01 identity: every SUBJECT/TOPIC/SUBTOPIC node id = its legacy id', async () => {
    const r = await one(`SELECT count(*)::int bad FROM public.canonical_taxonomy_nodes WHERE NOT (
      (node_type='SUBJECT' AND id=legacy_subject_id) OR (node_type='TOPIC' AND id=legacy_topic_id) OR (node_type='SUBTOPIC' AND id=legacy_subtopic_id)
      OR (node_type IN ('DOMAIN','CONCEPT','METHOD') AND legacy_subject_id IS NULL AND legacy_topic_id IS NULL AND legacy_subtopic_id IS NULL))`);
    assert(r.bad === 0, `${r.bad} nodes break identity`);
  });

  const mirrorSql = `SELECT count(*)::int bad FROM public.canonical_taxonomy_nodes n
      LEFT JOIN public.subjects s ON n.node_type='SUBJECT' AND s.id=n.id
      LEFT JOIN public.topics t ON n.node_type='TOPIC' AND t.id=n.id
      LEFT JOIN public.subtopics st ON n.node_type='SUBTOPIC' AND st.id=n.id
      WHERE (n.node_type='SUBJECT' AND (s.id IS NULL OR (s.name,s.slug,s.display_order,s.is_active) IS DISTINCT FROM (n.name,n.slug,n.display_order,n.is_active)))
         OR (n.node_type='TOPIC' AND (t.id IS NULL OR (t.subject_id,t.name,t.slug,t.display_order,t.is_active) IS DISTINCT FROM (n.root_subject_id,n.name,n.slug,n.display_order,n.is_active)))
         OR (n.node_type='SUBTOPIC' AND (st.id IS NULL OR (st.topic_id,st.name,st.slug,st.display_order,st.is_active) IS DISTINCT FROM (n.parent_id,n.name,n.slug,n.display_order,n.is_active)))`;
  const projectionCountsMatch = async () =>
    one(`SELECT ((SELECT count(*) FROM public.subjects) = (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE node_type='SUBJECT')
          AND (SELECT count(*) FROM public.topics) = (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE node_type='TOPIC')
          AND (SELECT count(*) FROM public.subtopics) = (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE node_type='SUBTOPIC')) ok`);
  const assertMirror = async () => {
    const r = await one(mirrorSql);
    const k = await projectionCountsMatch();
    assert(r.bad === 0 && k.ok, `mirror broken: ${r.bad} differing, counts match=${k.ok}`);
  };

  await test('DB-02 projection mirrors nodes exactly (live)', assertMirror);

  await test('DB-03 every value in every subject/topic/subtopic FK column is a node id (live)', async () => {
    // GAP2-3: after 075 these FKs reference canonical_taxonomy_nodes (<col>, <col>_node_type) as *_node_fkey;
    // the first key column is the taxonomy id. Before 075 they referenced the projection tables.
    const fks = await q(`SELECT cl.relname tbl, a.attname col FROM pg_constraint con
      JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_class tcl ON tcl.oid=con.confrelid
      JOIN pg_attribute a ON a.attrelid=cl.oid AND a.attnum=con.conkey[1]
      WHERE con.contype='f' AND cl.relnamespace='public'::regnamespace AND cl.relname<>'canonical_taxonomy_nodes'
        AND ((tcl.relname IN ('subjects','topics','subtopics') AND tcl.relnamespace='public'::regnamespace)
             OR (tcl.relname = 'canonical_taxonomy_nodes' AND con.conname LIKE '%\\_node\\_fkey'))`);
    let bad = 0;
    for (const f of fks) {
      bad += (await one(`SELECT count(*)::int n FROM public."${f.tbl}" x WHERE x."${f.col}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes n WHERE n.id = x."${f.col}")`)).n;
    }
    assert(fks.length >= 30 && bad === 0, `${bad} values across ${fks.length} FK columns are not node ids`);
  });

  await test('DB-04 create TOPIC under SUBJECT → topics row with the same id', () =>
    tx(async () => {
      const n = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      const t = await one(`SELECT * FROM public.topics WHERE id=$1`, [n.id]);
      assert(t && t.subject_id === subject.id && t.name === n.name && t.slug === n.slug && n.legacy_topic_id === n.id, JSON.stringify({ n: n.id, t }));
      await c.query('SET CONSTRAINTS ALL IMMEDIATE');
      await assertMirror();
    }));

  await test('DB-05 rename (name + slug) → projected; hierarchy_path updated', () =>
    tx(async () => {
      const n = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      const u = await one(`UPDATE public.canonical_taxonomy_nodes SET name=$2, slug=$3 WHERE id=$1 RETURNING *`, [n.id, `QA Renamed ${tag}`, `${tag}-r`]);
      const t = await one(`SELECT name, slug FROM public.topics WHERE id=$1`, [n.id]);
      assert(t.name === `QA Renamed ${tag}` && t.slug === `${tag}-r` && u.hierarchy_path === `${subject.slug}.${tag}-r`, JSON.stringify({ t, path: u.hierarchy_path }));
      await assertMirror();
    }));

  await test('DB-06 deactivate / reactivate → projected', () =>
    tx(async () => {
      const n = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      await c.query(`UPDATE public.canonical_taxonomy_nodes SET is_active=false WHERE id=$1`, [n.id]);
      const off = await one(`SELECT is_active FROM public.topics WHERE id=$1`, [n.id]);
      await c.query(`UPDATE public.canonical_taxonomy_nodes SET is_active=true WHERE id=$1`, [n.id]);
      const on = await one(`SELECT is_active FROM public.topics WHERE id=$1`, [n.id]);
      assert(off.is_active === false && on.is_active === true);
      await assertMirror();
    }));

  await test('DB-07 create SUBTOPIC → subtopics row (topic_id = parent TOPIC)', () =>
    tx(async () => {
      const t = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      const st = await insertNode({ parent: t.id, name: `QA Subtopic ${tag}`, slug: `${tag}-st`, type: 'SUBTOPIC' });
      const row = await one(`SELECT * FROM public.subtopics WHERE id=$1`, [st.id]);
      assert(row && row.topic_id === t.id && st.legacy_subtopic_id === st.id, JSON.stringify(row));
      await c.query('SET CONSTRAINTS ALL IMMEDIATE');
      await assertMirror();
    }));

  await test('DB-08 create CONCEPT / METHOD → no legacy row', () =>
    tx(async () => {
      const pre = await counts();
      const t = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      const cpt = await insertNode({ parent: t.id, name: `QA Concept ${tag}`, slug: `${tag}-c`, type: 'CONCEPT' });
      await insertNode({ parent: cpt.id, name: `QA Method ${tag}`, slug: `${tag}-m`, type: 'METHOD' });
      const post = await counts();
      assert(post.t === pre.t + 1 && post.s === pre.s && post.st === pre.st && post.n === pre.n + 3, JSON.stringify({ pre, post }));
      assert(cpt.legacy_subject_id === null && cpt.legacy_topic_id === null && cpt.legacy_subtopic_id === null);
    }));

  await test('DB-09 TOPIC under DOMAIN under SUBJECT → topics.subject_id = SUBJECT; DOMAIN has no legacy row', () =>
    tx(async () => {
      const d = await insertNode({ parent: subject.id, name: `QA Domain ${tag}`, slug: `${tag}-d`, type: 'DOMAIN' });
      const t = await insertNode({ parent: d.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      const row = await one(`SELECT subject_id FROM public.topics WHERE id=$1`, [t.id]);
      assert(row.subject_id === subject.id && d.legacy_subject_id === null);
      await assertMirror();
    }));

  await test('DB-10 create SUBJECT → subjects row with the same id', () =>
    tx(async () => {
      const s = await insertNode({ parent: null, name: `QA Subject ${tag}`, slug: `${tag}-s`, type: 'SUBJECT' });
      const row = await one(`SELECT * FROM public.subjects WHERE id=$1`, [s.id]);
      assert(row && row.name === s.name && s.legacy_subject_id === s.id && s.root_subject_id === s.id);
      await c.query('SET CONSTRAINTS ALL IMMEDIATE');
      await assertMirror();
    }));

  await test('DB-11 direct INSERT into topics → rejected', () =>
    expectError(() => c.query(`INSERT INTO public.topics (subject_id, name, slug) VALUES ($1, $2, $3)`, [subject.id, `QA ${tag}`, `${tag}-x`]), /TAXONOMY_PROJECTION_ONLY/));
  await test('DB-12 direct UPDATE of topics → rejected', () =>
    expectError(() => c.query(`UPDATE public.topics SET name = name || ' x' WHERE id=$1`, [usedTopic.id]), /TAXONOMY_PROJECTION_ONLY/));
  await test('DB-13 direct DELETE from subjects → rejected', () =>
    expectError(() => c.query(`DELETE FROM public.subjects WHERE id=$1`, [subject.id]), /TAXONOMY_PROJECTION_ONLY/));
  await test('DB-14 TRUNCATE subtopics → rejected', () => expectError(() => c.query(`TRUNCATE public.subtopics`), /TAXONOMY_PROJECTION_ONLY|0A000|cannot truncate/i));
  await test('DB-15 direct INSERT into subtopics → rejected', () =>
    expectError(() => c.query(`INSERT INTO public.subtopics (topic_id, name, slug) VALUES ($1, $2, $3)`, [usedTopic.id, `QA ${tag}`, `${tag}-y`]), /TAXONOMY_PROJECTION_ONLY/));

  await test('DB-16 node_type change of TOPIC / into TOPIC → rejected', async () => {
    await expectError(() => c.query(`UPDATE public.canonical_taxonomy_nodes SET node_type='CONCEPT' WHERE id=$1`, [usedTopic.id]), /TAXONOMY_RULE: node_type/);
    await expectError(async () => {
      const t = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      const cpt = await insertNode({ parent: t.id, name: `QA Concept ${tag}`, slug: `${tag}-c`, type: 'CONCEPT' });
      await c.query(`UPDATE public.canonical_taxonomy_nodes SET node_type='SUBTOPIC' WHERE id=$1`, [cpt.id]);
    }, /TAXONOMY_RULE: node_type/);
  });

  await test('DB-17 invalid parent types → rejected', async () => {
    await expectError(() => insertNode({ parent: usedTopic.id, name: `QA ${tag}`, slug: `${tag}-a`, type: 'TOPIC' }), /TAXONOMY_RULE: a TOPIC node cannot be placed under a TOPIC/);
    await expectError(() => insertNode({ parent: subject.id, name: `QA ${tag}`, slug: `${tag}-b`, type: 'SUBTOPIC' }), /TAXONOMY_RULE: a SUBTOPIC node cannot be placed under a SUBJECT/);
    await expectError(() => insertNode({ parent: usedTopic.id, name: `QA ${tag}`, slug: `${tag}-c`, type: 'DOMAIN' }), /TAXONOMY_RULE: a DOMAIN node/);
    await expectError(() => insertNode({ parent: null, name: `QA ${tag}`, slug: `${tag}-d`, type: 'CONCEPT' }), /TAXONOMY_RULE: only SUBJECT nodes can be roots/);
    await expectError(() => insertNode({ parent: subject.id, name: `QA ${tag}`, slug: `${tag}-e`, type: 'SUBJECT' }), /TAXONOMY_RULE: a SUBJECT node/);
    const otherTopic = (await one(`SELECT id FROM public.canonical_taxonomy_nodes WHERE node_type='TOPIC' AND id<>$1 LIMIT 1`, [usedTopic.id])).id;
    await expectError(() => c.query(`UPDATE public.canonical_taxonomy_nodes SET parent_id=$2 WHERE id=$1`, [usedTopic.id, otherTopic]), /TAXONOMY_RULE: a TOPIC node cannot be placed under a TOPIC/);
  });

  await test('DB-18 id / legacy columns immutable; foreign legacy id on insert rejected', async () => {
    await expectError(() => c.query(`UPDATE public.canonical_taxonomy_nodes SET id=gen_random_uuid() WHERE id=$1`, [usedTopic.id]), /TAXONOMY_RULE: node ids are immutable/);
    await expectError(() => c.query(`UPDATE public.canonical_taxonomy_nodes SET legacy_topic_id=NULL WHERE id=$1`, [usedTopic.id]), /TAXONOMY_RULE: legacy back-references are immutable/);
    await expectError(
      () => c.query(`INSERT INTO public.canonical_taxonomy_nodes (parent_id, name, slug, node_type, legacy_topic_id) VALUES ($1, $2, $3, 'TOPIC', $4)`, [subject.id, `QA ${tag}`, `${tag}-f`, usedTopic.id]),
      /TAXONOMY_RULE: a TOPIC node carries only legacy_topic_id/
    );
    await expectError(
      () => c.query(`INSERT INTO public.canonical_taxonomy_nodes (parent_id, name, slug, node_type, legacy_topic_id) VALUES ($1, $2, $3, 'CONCEPT', $4)`, [usedTopic.id, `QA ${tag}`, `${tag}-g`, usedTopic.id]),
      /TAXONOMY_RULE: CONCEPT nodes have no legacy projection/
    );
  });

  await test('DB-19 projection is idempotent (no-op updates leave legacy rows untouched)', () =>
    tx(async () => {
      const pre = await one(`SELECT updated_at, name FROM public.topics WHERE id=$1`, [usedTopic.id]);
      await c.query(`UPDATE public.canonical_taxonomy_nodes SET name = name, display_order = display_order WHERE id=$1`, [usedTopic.id]);
      await c.query(`UPDATE public.canonical_taxonomy_nodes SET metadata = metadata || '{"qa":true}'::jsonb WHERE id=$1`, [usedTopic.id]);
      const post = await one(`SELECT updated_at, name FROM public.topics WHERE id=$1`, [usedTopic.id]);
      assert(String(pre.updated_at) === String(post.updated_at) && pre.name === post.name, 'legacy row was rewritten by a no-op');
      await assertMirror();
    }));

  await test('DB-20 delete: node of a topic with questions → rejected; fresh leaf topic node → legacy row removed', async () => {
    await expectError(() => c.query(`DELETE FROM public.canonical_taxonomy_nodes WHERE id=$1`, [usedTopic.id]), /23503|foreign key/i);
    await tx(async () => {
      const n = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      await c.query(`DELETE FROM public.canonical_taxonomy_nodes WHERE id=$1`, [n.id]);
      const gone = await one(`SELECT count(*)::int n FROM public.topics WHERE id=$1`, [n.id]);
      await c.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert(gone.n === 0);
      await assertMirror();
    });
  });

  await test('DB-21 move TOPIC to another SUBJECT → topics.subject_id follows', () =>
    tx(async () => {
      const n = await insertNode({ parent: subject.id, name: `QA Topic ${tag}`, slug: `${tag}-t`, type: 'TOPIC' });
      await c.query(`UPDATE public.canonical_taxonomy_nodes SET parent_id=$2 WHERE id=$1`, [n.id, subject2.id]);
      const row = await one(`SELECT subject_id FROM public.topics WHERE id=$1`, [n.id]);
      assert(row.subject_id === subject2.id);
      await assertMirror();
    }));

  await test('DB-22 reconciliation-workbench style insert (no legacy columns) auto-projects', () =>
    tx(async () => {
      const n = await one(
        `INSERT INTO public.canonical_taxonomy_nodes (parent_id, name, slug, node_type, display_order, is_active, metadata)
         VALUES ($1, $2, $3, 'TOPIC', 0, true, '{"source":"SYLLABUS_RECONCILIATION"}'::jsonb) RETURNING id, legacy_topic_id`,
        [subject.id, `QA Workbench ${tag}`, `${tag}-w`]
      );
      assert(n.legacy_topic_id === n.id && (await one(`SELECT count(*)::int n FROM public.topics WHERE id=$1`, [n.id])).n === 1);
    }));

  await test('DB-23 projection surfaces legacy uniqueness (topic slug used under another subject) → rejected', () =>
    expectError(() => insertNode({ parent: subject.id, name: `QA Dup ${tag}`, slug: existingTopicSlug, type: 'TOPIC' }), /23505.*topics_slug_key/));

  await test('DB-24 D1: fn_resolve_learn_more not executable by anon/authenticated (or dropped, GAP2-2a)', async () => {
    const exists = (await one(`SELECT to_regprocedure('public.fn_resolve_learn_more(uuid,uuid)') IS NOT NULL e`)).e;
    if (!exists) {
      // GAP2-2a (migration 072) dropped the function; calling it as anon/authenticated must fail.
      await expectError(async () => {
        await c.query('SET LOCAL ROLE anon');
        await c.query(`SELECT public.fn_resolve_learn_more($1, $2)`, [usedTopic.id, authState.userId]);
      }, /42883|does not exist/);
      return;
    }
    const r = await one(`SELECT has_function_privilege('anon','public.fn_resolve_learn_more(uuid,uuid)','EXECUTE') anon,
                                has_function_privilege('authenticated','public.fn_resolve_learn_more(uuid,uuid)','EXECUTE') auth,
                                has_function_privilege('service_role','public.fn_resolve_learn_more(uuid,uuid)','EXECUTE') svc`);
    assert(r.anon === false && r.auth === false && r.svc === true, JSON.stringify(r));
    await expectError(async () => {
      await c.query('SET LOCAL ROLE anon');
      await c.query(`SELECT public.fn_resolve_learn_more($1, $2)`, [usedTopic.id, authState.userId]);
    }, /42501|permission denied/);
    await expectError(async () => {
      await c.query('SET LOCAL ROLE authenticated');
      await c.query(`SELECT public.fn_resolve_learn_more($1, $2)`, [usedTopic.id, authState.userId]);
    }, /42501|permission denied/);
  });

  await test('DB-25 nothing persisted by the scenarios', async () => {
    const after = await counts();
    assert(JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    await assertMirror();
  });

  await c.end();
}

// ---------- Part 3: service smoke against the real DB ----------
async function smoke() {
  const { readEnv } = require('./db/_db-env.cjs');
  const { Client } = require('pg');
  const { dbTarget } = require('./db/_db-env.cjs');
  const env = readEnv();
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
  const { createClient } = require('@supabase/supabase-js');
  dbTarget(); // ref guard
  currentSupabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  // SEC-1B: smoke writes run as the permanent qa-admin identity (docs/testing/QA_IDENTITIES.md) — a real
  // signed-in session for the canonical guard; writes still use the service-role client.
  const qaAdmin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await qaAdmin.auth.signInWithPassword({ email: 'qa-admin@courage-library.test', password: env('QA_ADMIN_PASSWORD') });
  if (signIn.error || !signIn.data.user) throw new Error('qa-admin sign-in failed (run scripts/qa/ensure-qa-identities.cjs)');
  sessionOverride = qaAdmin;
  authState.isAdmin = true;
  authState.userId = signIn.data.user.id;
  authState.userEmail = 'qa-admin@courage-library.test';
  const { TaxonomyService } = require(path.join(ROOT, 'services/taxonomy/taxonomy.service.ts'));
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const tag = `qa-smoke-${Date.now().toString(36)}`;
  const created = [];
  const auditBefore = Number((await c.query(`SELECT count(*) n FROM public.admin_audit_logs`)).rows[0].n);
  try {
    await test('S-01 service: create SUBJECT + TOPIC, rename, deactivate, reactivate, reorder, listTree', async () => {
      const s = await TaxonomyService.createNode({ parentId: null, nodeType: 'SUBJECT', name: `QA Smoke Subject ${tag}`, slug: `${tag}-s` });
      assert(s.success, JSON.stringify(s));
      created.push(s.data.id);
      const t = await TaxonomyService.createNode({ parentId: s.data.id, nodeType: 'TOPIC', name: `QA Smoke Topic ${tag}`, slug: `${tag}-t` });
      assert(t.success, JSON.stringify(t));
      created.unshift(t.data.id);
      const t2 = await TaxonomyService.createNode({ parentId: s.data.id, nodeType: 'TOPIC', name: `QA Smoke Topic B ${tag}`, slug: `${tag}-t2` });
      assert(t2.success, JSON.stringify(t2));
      created.unshift(t2.data.id);
      const bad = await TaxonomyService.createNode({ parentId: t.data.id, nodeType: 'TOPIC', name: 'Nested topic' });
      assert(!bad.success && bad.code === 'TAXONOMY_RULE');
      const r = await TaxonomyService.renameNode(t.data.id, `QA Smoke Renamed ${tag}`, `${tag}-r`);
      const off = await TaxonomyService.deactivate(t.data.id);
      const on = await TaxonomyService.reactivate(t.data.id);
      const ord = await TaxonomyService.reorder(s.data.id, [t2.data.id, t.data.id]);
      assert(r.success && off.success && on.success && ord.success, JSON.stringify([r, off, on, ord]));
      const tree = await TaxonomyService.listTree();
      const node = tree.success && tree.data.find((n) => n.id === s.data.id);
      assert(node && node.children.map((x) => x.id).join() === `${t2.data.id},${t.data.id}`, 'tree does not reflect the reorder');
      const proj = (await c.query(`SELECT t.name, t.slug, t.subject_id, t.is_active, t.display_order FROM public.topics t WHERE t.id=$1`, [t.data.id])).rows[0];
      assert(proj && proj.name === `QA Smoke Renamed ${tag}` && proj.slug === `${tag}-r` && proj.subject_id === s.data.id && proj.is_active && proj.display_order === 1, JSON.stringify(proj));
      const subj = (await c.query(`SELECT count(*)::int n FROM public.subjects WHERE id=$1`, [s.data.id])).rows[0].n;
      assert(subj === 1);
    });
    await test('S-02 audit rows written with correct columns for every mutation', async () => {
      const rows = (await c.query(`SELECT action_type, actor_email, target_entity FROM public.admin_audit_logs WHERE actor_email=$1 AND created_at > now() - interval '10 minutes' ORDER BY created_at`, [authState.userEmail])).rows;
      const types = rows.map((r) => r.action_type);
      for (const t of ['TAXONOMY_NODE_CREATE', 'TAXONOMY_NODE_RENAME', 'TAXONOMY_NODE_DEACTIVATE', 'TAXONOMY_NODE_REACTIVATE', 'TAXONOMY_NODE_REORDER']) assert(types.includes(t), `missing ${t}`);
      assert(rows.every((r) => r.target_entity === 'canonical_taxonomy_node'));
    });
  } finally {
    // Cleanup: delete the QA nodes (children first); the projection removes the legacy rows.
    if (created.length) {
      await c.query('BEGIN READ WRITE');
      try {
        for (const id of created) await c.query(`DELETE FROM public.canonical_taxonomy_nodes WHERE id=$1`, [id]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        lines.push(`  WARN  smoke cleanup failed: ${e.message}`);
      }
    }
    const left = (await c.query(`SELECT (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE slug LIKE $1)::int n, (SELECT count(*) FROM public.subjects WHERE slug LIKE $1)::int s, (SELECT count(*) FROM public.topics WHERE slug LIKE $1)::int t`, [`${tag}%`])).rows[0];
    const auditAfter = Number((await c.query(`SELECT count(*) n FROM public.admin_audit_logs`)).rows[0].n);
    lines.push(`  INFO  smoke cleanup: nodes=${left.n} subjects=${left.s} topics=${left.t} left; audit rows added=${auditAfter - auditBefore}`);
    await test('S-03 smoke cleanup left no taxonomy rows', async () => assert(left.n === 0 && left.s === 0 && left.t === 0, JSON.stringify(left)));
    await c.end();
  }
}

(async () => {
  console.log('GAP2-1b taxonomy suite');
  await offline();
  if (ARGS.has('--db')) await db();
  if (ARGS.has('--smoke')) await smoke();
  console.log(lines.join('\n'));
  console.log(`\nGAP2-1b suite: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(lines.join('\n'));
  console.log('SUITE ERROR', e.code || '', String(e.message).slice(0, 300), String(e.stack).split('\n').slice(1, 6).join(' | '));
  process.exit(1);
});
