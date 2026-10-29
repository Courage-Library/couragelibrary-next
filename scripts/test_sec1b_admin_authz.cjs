/**
 * COURAGE LIBRARY — SEC-1B ADMIN AUTHORIZATION (FAIL-CLOSED) TEST SUITE
 *
 * Part 1  guard unit tests (resolveRole / requireAdmin / failure mapping).
 * Part 2  authz matrix: EVERY exported admin server action and admin API route handler × scenarios
 *         (a) anonymous, (b) student (no role), (c) user_metadata.role='admin' only,
 *         (d) student passing an admin's id as adminUserId, (e) staff, (f) admin.
 *         a–d must be denied BEFORE any DB/storage call; staff only where intended; admin allowed.
 * Part 3  static check: every exported admin action/handler calls the canonical guard before its
 *         first DB/storage/service call.
 * Part 4  failure test: with a DB that fails every call, no action that attempted a write returns
 *         success, and no raw DB error text reaches the result.
 * Part 5  (--live) real sessions of the permanent QA identities against the guard (no writes).
 *
 * Offline parts use mocks only: no network (fetch blocked), no pg, no DB.
 * Run: node scripts/test_sec1b_admin_authz.cjs [--live]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
for (const k of Object.keys(process.env)) if (/^ADMIN_EMAILS$/.test(k)) delete process.env[k];

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

// ---------- Scenario + recording mocks ----------
const ADMIN_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const STAFF_ID = 'aaaaaaaa-0000-4000-8000-00000000000b';
const STUDENT_ID = 'aaaaaaaa-0000-4000-8000-00000000000c';
const MARKER = 'duplicate key value violates unique constraint "qa_sec1b_marker"';
const USERS = {
  anon: null,
  student: { id: STUDENT_ID, email: 'student@courage-library.test', app_metadata: {}, user_metadata: {} },
  userMetaAdmin: { id: STUDENT_ID, email: 'student@courage-library.test', app_metadata: {}, user_metadata: { role: 'admin' } },
  staff: { id: STAFF_ID, email: 'staff@courage-library.test', app_metadata: { role: 'staff' }, user_metadata: {} },
  admin: { id: ADMIN_ID, email: 'admin@courage-library.test', app_metadata: { role: 'admin' }, user_metadata: {} },
};
const state = { user: null, dbMode: 'ok', calls: { db: 0, writes: [], getUser: 0 } };
const resetCalls = () => (state.calls = { db: 0, writes: [], getUser: 0 });

function makeDb() {
  const WRITE_OPS = new Set(['insert', 'update', 'delete', 'upsert']);
  const failure = () => ({ data: null, error: { code: '23505', message: MARKER }, count: null });
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = {};
    const rec = (op) => (...args) => {
      q.ops.push(op);
      if (WRITE_OPS.has(op)) state.calls.writes.push(`${table}.${op}`);
      return chain;
    };
    ['select', 'eq', 'neq', 'in', 'not', 'or', 'lte', 'lt', 'gte', 'gt', 'order', 'limit', 'range', 'insert', 'update', 'delete', 'upsert', 'ilike', 'like', 'is', 'match', 'filter', 'contains', 'textSearch', 'returns'].forEach((op) => (chain[op] = rec(op)));
    const resolve = () => Promise.resolve(state.dbMode === 'fail' ? failure() : { data: null, error: null, count: 0 });
    chain.maybeSingle = resolve;
    chain.single = resolve;
    chain.csv = resolve;
    chain.then = (f, r) => resolve().then(f, r);
    return chain;
  };
  return {
    from: (t) => {
      state.calls.db++;
      return builder(t);
    },
    rpc: async (name) => {
      state.calls.db++;
      state.calls.writes.push(`rpc:${name}`);
      return state.dbMode === 'fail' ? failure() : { data: null, error: null };
    },
    storage: {
      from: () => {
        state.calls.db++;
        const fail = async () => (state.dbMode === 'fail' ? { data: null, error: { message: MARKER } } : { data: null, error: null });
        return { upload: async () => (state.calls.writes.push('storage.upload'), fail()), download: fail, list: fail, remove: async () => (state.calls.writes.push('storage.remove'), fail()) };
      },
    },
    auth: {
      getUser: async () => {
        state.calls.getUser++;
        return { data: { user: state.user }, error: null };
      },
      admin: {
        listUsers: async () => (state.calls.db++, { data: { users: [] }, error: state.dbMode === 'fail' ? { message: MARKER } : null }),
        updateUserById: async () => (state.calls.db++, state.calls.writes.push('auth.updateUser'), { data: null, error: state.dbMode === 'fail' ? { message: MARKER } : null }),
        getUserById: async () => (state.calls.db++, { data: { user: null }, error: null }),
        deleteUser: async () => (state.calls.db++, state.calls.writes.push('auth.deleteUser'), { data: null, error: null }),
        createUser: async () => (state.calls.db++, state.calls.writes.push('auth.createUser'), { data: { user: null }, error: null }),
      },
    },
  };
}
let sessionOverride = null; // Part 5 swaps in a real signed-in client
const MOCKS = {
  'server-only': {},
  'next/cache': { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn) => fn },
  'next/headers': { cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }), headers: async () => new Map() },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => sessionOverride || makeDb(),
    createAdminServerSupabaseClient: () => makeDb(),
    createPublicServerSupabaseClient: () => makeDb(),
  },
  pg: {
    Client: class {
      async connect() { state.calls.db++; throw new Error('pg disabled in SEC-1B tests'); }
      async query() { state.calls.db++; throw new Error('pg disabled in SEC-1B tests'); }
      async end() {}
      on() {}
    },
    Pool: class {
      async connect() { state.calls.db++; throw new Error('pg disabled in SEC-1B tests'); }
      async query() { state.calls.db++; throw new Error('pg disabled in SEC-1B tests'); }
      async end() {}
      on() {}
    },
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return originalLoad.call(this, request, parent, isMain);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  state.calls.db++;
  throw new Error('network disabled in SEC-1B tests');
};
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};

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
    lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2000)}`);
  }
}
function assert(c, m) {
  if (!c) throw new Error(m || 'assertion failed');
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const ACTION_FILES = [
  ...walk(path.join(ROOT, 'app/admin')).filter((f) => /actions\.ts$/.test(f)),
  ...['actions/admin-exam-knowledge.actions.ts', 'actions/exam-knowledge-import.actions.ts', 'actions/exam-knowledge-prompt.actions.ts', 'actions/question-factory.actions.ts'].map((f) => path.join(ROOT, f)),
].map(rel);
const ROUTE_FILES = walk(path.join(ROOT, 'app/api/admin')).filter((f) => /route\.ts$/.test(f)).map(rel);
// Routes that also accept a non-session credential (documented in the SEC-1B report).
const BEARER_ROUTES = new Set(['app/api/admin/current-affairs/import/route.ts']);
// Intended staff exclusions (admin only).
// Q1 architect ruling (SEC-1B): admin-only handlers. Staff must be FORBIDDEN on exactly this set.
const ADAPTIVE_ADMIN_ONLY = ['updateAdaptiveGlobalStatusAction', 'toggleAdaptiveEmergencyAction', 'updateAdaptiveSafetyLimitsAction', 'createAdaptiveAlgorithmVersionAction', 'activateAdaptiveAlgorithmVersionAction', 'saveAdaptiveConfigAction', 'updateEstimatorConfigAction', 'updateCATConfigAction', 'updateStoppingConfigAction', 'updatePersonalizationConfigAction'];
const ADMIN_ONLY = new Set([
  'app/admin/live-tests/intelligence/actions.ts#getCandidateDrillDownAction',
  ...['updateGlobalPremiumConfigAction', 'setExamPremiumAvailabilityAction', 'setTestTypeAvailabilityAction', 'updateGeneratorPolicyAction', 'searchCandidateAction', 'grantPromotionalPassAction', 'revokeEntitlementAction', 'updateCustomLimitsAction', 'toggleTestSeriesStatusAction', 'updateMockCuratedStatusAction'].map((n) => `app/admin/premium/actions.ts#${n}`),
  ...['createRewardAction', 'updateRewardAction', 'toggleRewardActiveAction', 'updateRedemptionStatusAction', 'uploadRewardImageAction'].map((n) => `app/admin/rewards/actions.ts#${n}`),
  ...['archiveExamAction', 'evaluateExamDeletionEligibilityAction', 'deleteExamDraftAction'].map((n) => `app/admin/exams/actions.ts#${n}`),
  // CA-1: Hindi name / subject type / state code, aliases, move and merge are structural writes too (admin only)
  ...['createTaxonomyNodeAction', 'renameTaxonomyNodeAction', 'setTaxonomyNodeActiveAction', 'reorderTaxonomyNodesAction', 'updateTaxonomyDetailsAction', 'addTaxonomyAliasAction', 'removeTaxonomyAliasAction', 'moveTaxonomyNodeAction', 'mergeTaxonomyNodesAction'].map((n) => `app/admin/taxonomy/actions.ts#${n}`),
  ...ADAPTIVE_ADMIN_ONLY.map((n) => `app/admin/adaptive/actions.ts#${n}`),
  ...ADAPTIVE_ADMIN_ONLY.map((n) => `app/admin/actions.ts#${n}`),
  'app/api/admin/current-affairs/import/route.ts#POST', // session path; bearer path unchanged
  'app/api/admin/reports/update-status/route.ts#POST', // F2 (#79): question reports are admin-only
  // SEC-1D (decision #16 update): PII pages' actions — gamification + billing.
  'app/admin/gamification/actions.ts#updateRewardPolicyAction',
  'app/admin/actions.ts#createSubscriptionPlanAction',
  // GAP2-4b: publishing / archiving a syllabus is admin-only (staff draft only)
  'app/admin/syllabus/actions.ts#publishSyllabusVersionAction',
  'app/admin/syllabus/actions.ts#archiveSyllabusVersionAction',
  // CA-2: the syllabus intake writes the master tree (aliases, new nodes) → admin only
  // CA-3: lesson blocks (draft + publish) → admin only
  ...['saveLessonDraftAction', 'publishLessonAction', 'saveGeneratedLessonAction', 'saveTranslationDraftAction'].map((n) => `app/admin/lessons/actions.ts#${n}`),
  ...['savePromptDraftAction', 'activatePromptAction'].map((n) => `app/admin/prompts/actions.ts#${n}`), // CA-4
  // CA-7: the course launch / pause, exam notes and the INTERNAL node flag are owner actions → admin only
  ...['setCourseLaunchAction', 'saveExamNoteDraftAction', 'publishExamNoteAction'].map((n) => `app/admin/lessons/actions.ts#${n}`),
  'app/admin/taxonomy/actions.ts#setTaxonomyNodeInternalAction',
  'app/admin/taxonomy/actions.ts#setTaxonomyContentSourceAction', // SYLLABUS-UI-1: admin only
  ...['createIntakeAction', 'addIntakeCycleAction', 'decideIntakeItemAction', 'importIntakeAction', 'discardIntakeAction', 'bulkIntakeAction', 'undoIntakeBulkAction'].map((n) => `app/admin/syllabus/intake/actions.ts#${n}`),
  // F9-B: library Pro grants are admin-only (staff cannot grant Pro)
  'app/admin/pro-library/actions.ts#grantLibraryProAction',
  'app/admin/pro-library/actions.ts#revokeLibraryProAction',
]);
// Commit-only flips (preview / dry-run stay staff): checked separately in B-01.
const COMMIT_ONLY = new Set(['app/admin/actions.ts#executeBulkImportAction', 'app/admin/actions.ts#importBulkQuestionsAction']);

const withTimeout = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms))]);
function poison(adminId) {
  const target = function () {};
  const handler = {
    get(_t, prop) {
      if (prop === 'adminUserId' || prop === 'userId' || prop === 'actorId') return adminId;
      if (prop === Symbol.toPrimitive) return () => 'x';
      if (prop === 'then') return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'length') return 0;
      if (prop === 'get') return (k) => (k === 'adminUserId' ? adminId : 'x');
      return proxy;
    },
    apply() {
      return proxy;
    },
  };
  const proxy = new Proxy(target, handler);
  return proxy;
}
function fakeRequest(adminId) {
  const headers = new Headers({ 'content-type': 'application/json' });
  return {
    url: 'http://localhost/api/admin/test?q=x&type=all',
    method: 'POST',
    headers,
    nextUrl: new URL('http://localhost/api/admin/test?q=x&type=all'),
    json: async () => ({ adminUserId: adminId, versionId: 'v1' }),
    text: async () => '{}',
    formData: async () => new FormData(),
  };
}
const AUTH_CODES = new Set(['UNAUTHORIZED', 'FORBIDDEN']);
function classify(kind, res, threw) {
  if (threw) return threw.name === 'AuthorizationError' ? `DENIED(throw:${threw.code})` : 'ALLOWED(threw)';
  if (res && res.__timeout) return 'ALLOWED(timeout)';
  if (kind === 'route') {
    const st = res && typeof res.status === 'number' ? res.status : 0;
    return st === 401 || st === 403 ? `DENIED(${st})` : `ALLOWED(${st})`;
  }
  if (res && res.ok === false && AUTH_CODES.has(res.error)) return `DENIED(${res.error})`;
  if (res && res.success === false && AUTH_CODES.has(res.code)) return `DENIED(${res.code})`;
  return 'ALLOWED';
}
async function invoke(entry, scenarioUser, opts = {}) {
  state.user = scenarioUser;
  state.dbMode = opts.dbMode || 'ok';
  resetCalls();
  const adminId = opts.adminId || ADMIN_ID;
  let res;
  let threw = null;
  try {
    if (entry.kind === 'route') res = await withTimeout(entry.fn(fakeRequest(adminId), { params: Promise.resolve({ id: 'x', versionId: 'x', nodeId: 'x' }) }), 3000);
    else res = await withTimeout(entry.fn(poison(adminId), poison(adminId), poison(adminId)), 3000);
  } catch (e) {
    threw = e;
  }
  return { verdict: classify(entry.kind, res, threw), res, threw, calls: { ...state.calls, writes: [...state.calls.writes] } };
}

// ---------- Part 1: guard unit ----------
async function part1() {
  const G = require(path.join(ROOT, 'lib/auth/require-admin.ts'));
  await test('U-01 resolveRole: app_metadata only; user_metadata never grants; an ADMIN_EMAILS match never grants (AUTH-1 #60)', async () => {
    assert(G.resolveRole(USERS.admin) === 'admin' && G.resolveRole(USERS.staff) === 'staff');
    assert(G.resolveRole(USERS.student) === null && G.resolveRole(USERS.userMetaAdmin) === null && G.resolveRole(null) === null);
    process.env.ADMIN_EMAILS = 'Student@Courage-Library.test';
    try {
      assert(G.resolveRole(USERS.student) === null, 'an email listed in ADMIN_EMAILS must not grant admin');
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
  });
  await test('U-02 requireAdmin: anon → UNAUTHORIZED; student/user_metadata → FORBIDDEN; staff only with allowStaff; admin ok', async () => {
    const outcome = async (user, opts) => {
      state.user = user;
      try {
        const ctx = await G.requireAdmin(opts);
        return `ok:${ctx.role}:${ctx.userId}`;
      } catch (e) {
        return e instanceof G.AuthorizationError ? e.code : `other:${e.message}`;
      }
    };
    assert((await outcome(null)) === 'UNAUTHORIZED');
    assert((await outcome(USERS.student)) === 'FORBIDDEN');
    assert((await outcome(USERS.userMetaAdmin)) === 'FORBIDDEN');
    assert((await outcome(USERS.staff)) === 'FORBIDDEN');
    assert((await outcome(USERS.staff, { allowStaff: true })) === `ok:staff:${STAFF_ID}`);
    assert((await outcome(USERS.admin)) === `ok:admin:${ADMIN_ID}`);
    assert(G.requireAdmin.length <= 1 && !/userId/.test(G.requireAdmin.toString().split(')')[0]), 'requireAdmin must not accept a user id');
  });
  await test('U-03 session errors fail closed', async () => {
    MOCKS['@/lib/supabase/server'].createServerSupabaseClient = async () => ({ auth: { getUser: async () => { throw new Error('boom'); } } });
    try {
      const r = await G.guardAdminAction({ allowStaff: true });
      assert(r.ok === false && r.error === 'UNAUTHORIZED');
    } finally {
      MOCKS['@/lib/supabase/server'].createServerSupabaseClient = async () => sessionOverride || makeDb();
    }
  });
  await test('U-04 failure mapping: DB errors → DB_ERROR generic (no raw text); app errors → VALIDATION; route statuses', async () => {
    const db = G.toActionFailure('t', { code: '23505', message: MARKER });
    assert(db.error === 'DB_ERROR' && !db.message.includes('qa_sec1b_marker') && db.ok === false && db.success === false);
    const v = G.toActionFailure('t', new Error('Unit title is required.'));
    assert(v.error === 'VALIDATION' && v.message === 'Unit title is required.');
    const a = G.toActionFailure('t', new G.AuthorizationError('FORBIDDEN'));
    assert(a.error === 'FORBIDDEN');
    assert(G.dbFailure('t', { code: 'XX000' }).error === 'DB_ERROR');
    assert(G.toRouteErrorResponse('t', { code: '23505', message: MARKER }).status === 500);
    assert(G.toRouteErrorResponse('t', new Error('Bad input')).status === 400);
  });
  await test('U-05 AdminContentStudioService.requireAdminAuth ignores a caller-supplied id (bypass removed)', async () => {
    const { AdminContentStudioService } = require(path.join(ROOT, 'services/admin-content-studio.service.ts'));
    state.user = USERS.student;
    let threw = null;
    try {
      await AdminContentStudioService.requireAdminAuth('x', ADMIN_ID);
    } catch (e) {
      threw = e;
    }
    assert(threw && threw.name === 'AuthorizationError' && threw.code === 'FORBIDDEN', 'student + admin id must be FORBIDDEN');
    state.user = USERS.admin;
    const ok = await AdminContentStudioService.requireAdminAuth('x', STUDENT_ID);
    assert(ok.userId === ADMIN_ID, 'actor id must come from the session, not the argument');
    state.user = USERS.student;
    resetCalls();
    let t2 = null;
    try {
      await AdminContentStudioService.reviewVersion({ versionId: 'v', decision: 'APPROVED', adminUserId: ADMIN_ID });
    } catch (e) {
      t2 = e;
    }
    assert(t2 && t2.code === 'FORBIDDEN' && state.calls.writes.length === 0, 'reviewVersion with a passed adminUserId must not authorize');
  });
  await test('U-06 AdminService.checkIsAdminOrStaff decides through the canonical resolveRole', async () => {
    const src = read('services/admin.service.ts');
    assert(/resolveRole\(user\)/.test(src) && !/appRole === "admin" \|\| appRole === "staff"/.test(src));
  });
}

// ---------- load every admin entry ----------
function loadEntries() {
  const entries = [];
  const loadErrors = [];
  for (const f of ACTION_FILES) {
    try {
      const mod = require(path.join(ROOT, f));
      for (const [name, fn] of Object.entries(mod)) if (typeof fn === 'function') entries.push({ file: f, name, fn, kind: 'action' });
    } catch (e) {
      loadErrors.push(`${f}: ${String(e.message).slice(0, 160)}`);
    }
  }
  for (const f of ROUTE_FILES) {
    try {
      const mod = require(path.join(ROOT, f));
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) if (typeof mod[m] === 'function') entries.push({ file: f, name: m, fn: mod[m], kind: 'route' });
    } catch (e) {
      loadErrors.push(`${f}: ${String(e.message).slice(0, 160)}`);
    }
  }
  return { entries, loadErrors };
}

const matrix = { counts: {}, rows: [] };
const FLAGS = ['FEATURE_ADAPTIVE', 'FEATURE_LIVE_TESTS', 'FEATURE_PSYCHOMETRICS', 'FEATURE_BATTLES', 'FEATURE_COURSES']; // GAP2-2b: + COURSES
const setFlags = (on) => FLAGS.forEach((k) => (on ? (process.env[k] = 'true') : delete process.env[k]));

// Quarantined (feature-gated) actions keep the DRIFT-1c order: gate first, canonical guard right after.
async function part2q(entries) {
  setFlags(false);
  const gated = entries.filter((e) => {
    if (e.kind !== 'action') return false;
    const src = read(e.file);
    const start = src.indexOf(`export async function ${e.name}(`);
    if (start < 0) return false;
    const next = src.indexOf('\nexport ', start + 10);
    const body = src.slice(start, next < 0 ? undefined : next);
    return /featureDisabledActionResult\(/.test(body);
  });
  const bad = [];
  for (const e of gated) {
    for (const [label, user] of Object.entries(USERS)) {
      const r = await invoke(e, user);
      const res = r.res || {};
      if (!(res.code === 'FEATURE_DISABLED' && r.calls.db === 0 && r.calls.getUser === 0 && r.calls.writes.length === 0)) bad.push(e.file + '#' + e.name + ' [' + label + '] → ' + JSON.stringify(res).slice(0, 80));
    }
  }
  await test('Q-01 flags OFF: every gated action returns FEATURE_DISABLED with zero DB/session calls in every scenario (' + gated.length + ' actions × ' + Object.keys(USERS).length + ')', async () => {
    assert(gated.length >= 90 && bad.length === 0, bad.slice(0, 20).join('\n') || 'only ' + gated.length + ' gated actions');
  });
  setFlags(true); // the matrix below exercises the guard behind every gate
}
async function part2(entries, loadErrors) {
  await test(`M-00 every admin action file and route loads (${ACTION_FILES.length} action files, ${ROUTE_FILES.length} route files, ${entries.length} entries)`, async () => {
    assert(loadErrors.length === 0, loadErrors.join('\n'));
    assert(entries.length >= 250, `only ${entries.length} entries`);
  });
  const scenarios = [
    ['a-anonymous', USERS.anon, 'deny'],
    ['b-student', USERS.student, 'deny'],
    ['c-user_metadata-admin', USERS.userMetaAdmin, 'deny'],
    ['d-student+adminUserId', USERS.student, 'deny'],
    ['e-staff', USERS.staff, 'staff'],
    ['f-admin', USERS.admin, 'allow'],
  ];
  for (const [label, user, expect] of scenarios) {
    const bad = [];
    let ok = 0;
    for (const e of entries) {
      const key = `${e.file}#${e.name}`;
      const bearerAnon = BEARER_ROUTES.has(e.file);
      const r = await invoke(e, user, { adminId: ADMIN_ID });
      const denied = r.verdict.startsWith('DENIED');
      let want = expect;
      if (expect === 'staff') want = ADMIN_ONLY.has(key) ? 'deny' : 'allow'; // COMMIT_ONLY: staff allowed here (preview args); B-01 checks commit
      let good;
      if (want === 'deny') good = denied && r.calls.db === 0 && r.calls.writes.length === 0;
      else good = !denied && r.calls.getUser > 0;
      if (want === 'deny' && bearerAnon) good = denied && r.calls.writes.length === 0; // bearer check precedes the session guard
      matrix.rows.push({ key, scenario: label, verdict: r.verdict, db: r.calls.db, writes: r.calls.writes.length });
      if (good) ok++;
      else bad.push(`${key} → ${r.verdict} (db ${r.calls.db}, writes ${r.calls.writes.join(',') || 0}, getUser ${r.calls.getUser})`);
    }
    matrix.counts[label] = `${ok}/${entries.length}`;
    await test(`M-${label}: ${expect === 'deny' ? 'denied before any DB call' : expect === 'staff' ? 'allowed except admin-only' : 'allowed'} (${ok}/${entries.length})`, async () => {
      assert(bad.length === 0, bad.slice(0, 40).join('\n') + (bad.length > 40 ? `\n… ${bad.length - 40} more` : ''));
    });
  }
}

// ---------- Part 3: static guard check ----------
const GUARD_RE = /\b(guardAdminAction|guardAdminRoute|requireAdmin)\s*\(/;
const FIRST_EFFECT_RE = /\.from\(\s*['"`]|\.rpc\(|\.storage\b|create(Admin|Public)?Server(Supabase)?Client\(|new Client\(|db\.query\(|getLearningArtifactStorage\(|\b[A-Z]\w+(Service|Engine|Importer|Builder|Orchestrator)\.\w+\(/;
async function part3() {
  const offenders = [];
  let checked = 0;
  for (const f of [...ACTION_FILES, ...ROUTE_FILES]) {
    const src = read(f);
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    sf.forEachChild((n) => {
      const isExport = n.modifiers && n.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExport) return;
      const fns = [];
      if (ts.isFunctionDeclaration(n) && n.name && n.body) fns.push([n.name.text, n.body]);
      if (ts.isVariableStatement(n)) n.declarationList.declarations.forEach((d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) && fns.push([d.name.getText(sf), d.initializer.body]));
      for (const [name, body] of fns) {
        if (ROUTE_FILES.includes(f) && !/^(GET|POST|PUT|PATCH|DELETE)$/.test(name)) continue;
        checked++;
        const text = body.getText(sf);
        const g = GUARD_RE.exec(text);
        const eff = FIRST_EFFECT_RE.exec(text);
        if (BEARER_ROUTES.has(f)) {
          if (!g || !/validateBearerToken\(/.test(text)) offenders.push(`${f}#${name}: bearer route without guard fallback`);
          continue;
        }
        if (!g || (eff && eff.index < g.index)) offenders.push(`${f}#${name}: ${g ? `"${eff[0]}" before guard` : 'no canonical guard'}`);
      }
    });
  }
  await test(`S-01 static: every exported admin action/handler calls the canonical guard before any DB/service call (${checked} checked)`, async () => {
    assert(checked >= 250 && offenders.length === 0, offenders.join('\n') || `only ${checked} checked`);
  });
  await test('S-02 static: no caller-supplied identity authorizes; no ignored/legacy checks in admin actions', async () => {
    const cs = read('services/admin-content-studio.service.ts');
    assert(!/if \(adminUserId\)\s*\{?\s*return/.test(cs), 'requireAdminAuth bypass still present');
    const offenders = [...ACTION_FILES, ...ROUTE_FILES].filter((f) => /AdminService\.checkIsAdminOrStaff\(\)/.test(read(f)));
    assert(offenders.length === 0, `legacy check still in: ${offenders.join(', ')}`);
  });
  await test('S-03 static: in-memory write fallbacks removed', async () => {
    const files = ['services/admin-content-studio.service.ts', 'services/learning-document.service.ts', 'services/curriculum-coverage.service.ts', 'services/ai/structured-content-importer.service.ts'];
    for (const f of files) {
      const s = read(f);
      assert(!/versionCache|getCachedVersion|updateCachedVersion|cacheVersion\(|mock-mapping-1/.test(s), `${f} still has an in-memory fallback`);
    }
    assert(!/catch \{\s*\/\/ Non-blocking fallback/.test(read('services/admin-current-affairs.service.ts')), 'CA audit failure still swallowed');
    assert(/persistErrors/.test(read('services/exam-onboarding/exam-onboarding-importer.service.ts')), 'importer persistence failures not surfaced');
    assert(/if \(error\) throw error;/.test(read('services/exam-onboarding/exam-onboarding.service.ts')), 'deleteExamPost failure not surfaced');
  });
  await test('S-04 static: admin routes never echo raw error text', async () => {
    const leaks = ROUTE_FILES.filter((f) => /NextResponse\.json\([^;]*\b(e|err|error)\??\.message/.test(read(f)));
    assert(leaks.length === 0, leaks.join(', '));
  });
}

// ---------- Part 4: failure test ----------
// ---------- Part 3b: Q1 commit-only flips + Current Affairs ingestion boundary ----------
async function part3b(entries) {
  const byKey = new Map(entries.map((e) => [`${e.file}#${e.name}`, e]));
  await test('B-01 bulk imports: staff FORBIDDEN on commit, allowed on preview / dry-run; admin allowed on commit', async () => {
    const exec = byKey.get('app/admin/actions.ts#executeBulkImportAction').fn;
    const qimp = byKey.get('app/admin/actions.ts#importBulkQuestionsAction').fn;
    const run = async (user, fn) => {
      state.user = user;
      resetCalls();
      try {
        return await withTimeout(fn(), 3000);
      } catch (e) {
        return { thrown: e.message };
      }
    };
    const denied = (r) => r && r.ok === false && r.error === 'FORBIDDEN';
    assert(denied(await run(USERS.staff, () => exec({ entity: 'questions', mode: 'commit', records: [] }))), 'staff commit (bulk content) must be FORBIDDEN');
    assert(denied(await run(USERS.staff, () => qimp([], 'commit'))), 'staff commit (bulk questions) must be FORBIDDEN');
    assert(!denied(await run(USERS.staff, () => exec({ entity: 'questions', mode: 'preview', records: [] }))), 'staff preview must be allowed');
    assert(!denied(await run(USERS.staff, () => qimp([], 'dry-run'))), 'staff dry-run must be allowed');
    assert(!denied(await run(USERS.admin, () => exec({ entity: 'questions', mode: 'commit', records: [] }))), 'admin commit must be allowed');
  });

  const route = (p) => require(path.join(ROOT, p));
  const importRoute = route('app/api/admin/current-affairs/import/route.ts');
  const approveRoute = route('app/api/admin/current-affairs/articles/[id]/approve/route.ts');
  const publishRoute = route('app/api/admin/current-affairs/articles/[id]/publish/route.ts');
  const { CurrentAffairsImportService } = require(path.join(ROOT, 'services/current-affairs-import.service.ts'));
  const { AdminCurrentAffairsService } = require(path.join(ROOT, 'services/admin-current-affairs.service.ts'));
  const spies = { importDraft: 0, approve: 0, publish: 0, compile: 0 };
  const orig = { importDraft: CurrentAffairsImportService.importDraft, approveDraft: AdminCurrentAffairsService.approveDraft, compileAndPublish: AdminCurrentAffairsService.compileAndPublish, compileVersion: AdminCurrentAffairsService.compileVersion };
  CurrentAffairsImportService.importDraft = async () => (spies.importDraft++, { success: true, articleId: 'a1', versionId: 'v1', status: 'DRAFT' });
  AdminCurrentAffairsService.approveDraft = async () => (spies.approve++, { success: true });
  AdminCurrentAffairsService.compileAndPublish = async () => (spies.publish++, { success: true });
  AdminCurrentAffairsService.compileVersion = async () => (spies.compile++, { success: true });
  const KEY = 'qa-sec1b-ingestion-key-0123456789';
  process.env.CURRENT_AFFAIRS_INGESTION_KEY = KEY;
  const req = (auth) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (auth) headers.set('authorization', auth);
    return { url: 'http://localhost/api/admin/current-affairs/import', method: 'POST', headers, json: async () => ({ rawPayload: {}, versionId: 'v1' }) };
  };
  const ctx = { params: Promise.resolve({ id: 'a1' }) };
  const reset = () => Object.keys(spies).forEach((k) => (spies[k] = 0));
  try {
    await test('C-01 valid bearer (no session) → import route reaches the DRAFT creation path only', async () => {
      state.user = null;
      reset();
      const r = await importRoute.POST(req(`Bearer ${KEY}`));
      assert(r.status >= 200 && r.status < 300, `status ${r.status}`);
      assert(spies.importDraft === 1 && spies.approve === 0 && spies.publish === 0 && spies.compile === 0, JSON.stringify(spies));
    });
    await test('C-02 invalid / missing bearer and no session → 401, nothing imported', async () => {
      state.user = null;
      reset();
      const a = await importRoute.POST(req('Bearer wrong-key'));
      const b = await importRoute.POST(req(null));
      assert(a.status === 401 && b.status === 401 && spies.importDraft === 0, `statuses ${a.status}/${b.status}, imports ${spies.importDraft}`);
      const body = await b.clone().text();
      assert(!/qa_sec1b_marker|violates|PGRST/.test(body), 'no raw error text');
    });
    await test('C-03 student session (no bearer) → 403; staff session → 403 (Q1: ingestion admin only); admin session → allowed', async () => {
      reset();
      state.user = USERS.student;
      const s = await importRoute.POST(req(null));
      state.user = USERS.staff;
      const t = await importRoute.POST(req(null));
      assert(s.status === 403 && t.status === 403 && spies.importDraft === 0, `student ${s.status}, staff ${t.status}`);
      state.user = USERS.admin;
      const a = await importRoute.POST(req(null));
      assert(a.status >= 200 && a.status < 300 && spies.importDraft === 1, `admin ${a.status}`);
    });
    await test('C-04 bearer cannot approve or publish (no session → 401, services never called)', async () => {
      state.user = null;
      reset();
      const a = await approveRoute.POST(req(`Bearer ${KEY}`), ctx);
      const p = await publishRoute.POST(req(`Bearer ${KEY}`), ctx);
      assert(a.status === 401 && p.status === 401 && spies.approve === 0 && spies.publish === 0 && spies.compile === 0, `approve ${a.status}, publish ${p.status}, ${JSON.stringify(spies)}`);
    });
  } finally {
    Object.assign(CurrentAffairsImportService, { importDraft: orig.importDraft });
    Object.assign(AdminCurrentAffairsService, { approveDraft: orig.approveDraft, compileAndPublish: orig.compileAndPublish, compileVersion: orig.compileVersion });
    delete process.env.CURRENT_AFFAIRS_INGESTION_KEY;
  }
}

async function part4(entries) {
  // Production configuration: quarantined (feature-gated) actions are unreachable with flags off. Their
  // internal error paths are out of SEC-1B scope (quarantine rule) and listed in the report (Q7).
  setFlags(false);
  const offenders = [];
  let writers = 0;
  for (const e of entries) {
    const r = await invoke(e, USERS.admin, { dbMode: 'fail' });
    const json = (() => {
      try {
        return JSON.stringify(r.res && r.res.__timeout ? {} : r.res) || '';
      } catch {
        return '';
      }
    })();
    let body = json;
    if (e.kind === 'route' && r.res && typeof r.res.clone === 'function') {
      try {
        body = await r.res.clone().text();
      } catch {
        body = '';
      }
    }
    const success = e.kind === 'route' ? r.res && r.res.status >= 200 && r.res.status < 300 && /"success":\s*true/.test(body) : r.res && (r.res.success === true || r.res.ok === true);
    if (r.calls.writes.length) writers++;
    if (r.calls.writes.length && success) offenders.push(`${e.file}#${e.name}: returned success after failed write(s) ${r.calls.writes.join(',')}`);
    if (body.includes('qa_sec1b_marker')) offenders.push(`${e.file}#${e.name}: raw DB error text in result`);
  }
  setFlags(true);
  await test(`F-01 DB failure (production flags): no success after a failed write, no raw DB text (${entries.length} entries, ${writers} attempted writes)`, async () => {
    assert(offenders.length === 0, offenders.slice(0, 40).join('\n'));
  });
  await test('F-02 targeted: Content Studio publish/review/compile surface DB errors (no cache fallback)', async () => {
    const { AdminContentStudioService } = require(path.join(ROOT, 'services/admin-content-studio.service.ts'));
    state.user = USERS.admin;
    state.dbMode = 'fail';
    for (const call of [() => AdminContentStudioService.reviewVersion({ versionId: 'v', decision: 'APPROVED' }), () => AdminContentStudioService.compileVersion('v'), () => AdminContentStudioService.publishVersion('v')]) {
      let threw = null;
      try {
        await call();
      } catch (e) {
        threw = e;
      }
      assert(threw && threw.code === '23505', `expected the DB error to propagate, got ${threw ? threw.message : 'success'}`);
    }
    const actions = require(path.join(ROOT, 'app/admin/content/actions.ts'));
    const r = await actions.publishVersionAction('v');
    assert(r.ok === false && r.error === 'DB_ERROR' && !JSON.stringify(r).includes('qa_sec1b_marker'), JSON.stringify(r));
    state.dbMode = 'ok';
  });
  await test('F-03 targeted: mapUnitToExam no longer fabricates a mapping on failure', async () => {
    const { CurriculumCoverageService } = require(path.join(ROOT, 'services/curriculum-coverage.service.ts'));
    state.dbMode = 'fail';
    let threw = null;
    try {
      await CurriculumCoverageService.mapUnitToExam({ learningUnitId: 'u', examTopicMappingId: 'm' });
    } catch (e) {
      threw = e;
    }
    state.dbMode = 'ok';
    assert(threw, 'mapUnitToExam returned success on DB failure');
  });
}

// ---------- Part 5: live QA identities ----------
async function part5() {
  const { readEnv, dbTarget } = require('./db/_db-env.cjs');
  dbTarget();
  const env = readEnv();
  globalThis.fetch = realFetch;
  const { createClient } = require('@supabase/supabase-js');
  const G = require(path.join(ROOT, 'lib/auth/require-admin.ts'));
  // CI-FIX-1 (#74): CAPTCHA-safe QA session (magic-link token minted server-side); the password argument is unused
  const { qaUserClient } = require('./live/qa-session.cjs');
  const signIn = async (email) => qaUserClient(email).catch((e) => {
    throw new Error(`QA session failed for ${email.split('@')[0]} (${e.code || e.name})`);
  });
  const decide = async (client, opts) => {
    sessionOverride = client;
    try {
      const ctx = await G.requireAdmin(opts);
      return `ok:${ctx.role}`;
    } catch (e) {
      return e.code || `other:${e.message}`;
    } finally {
      sessionOverride = null;
    }
  };
  const admin = await signIn('qa-admin@courage-library.test', env('QA_ADMIN_PASSWORD'));
  const staff = await signIn('qa-staff@courage-library.test', env('QA_STAFF_PASSWORD'));
  const student = await signIn('qa-student@courage-library.test', env('QA_STUDENT_PASSWORD'));
  const anon = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  await test('L-01 live: qa-admin → admin (both modes)', async () => {
    assert((await decide(admin)) === 'ok:admin' && (await decide(admin, { allowStaff: true })) === 'ok:admin');
  });
  await test('L-02 live: qa-staff → FORBIDDEN admin-only, allowed with allowStaff', async () => {
    assert((await decide(staff)) === 'FORBIDDEN' && (await decide(staff, { allowStaff: true })) === 'ok:staff');
  });
  await test('L-03 live: qa-student → FORBIDDEN; anonymous → UNAUTHORIZED', async () => {
    assert((await decide(student, { allowStaff: true })) === 'FORBIDDEN' && (await decide(anon, { allowStaff: true })) === 'UNAUTHORIZED');
  });
  await test('L-04 live: student cannot self-escalate via user_metadata (updateUser role=admin → still FORBIDDEN)', async () => {
    const { error } = await student.auth.updateUser({ data: { role: 'admin' } });
    assert(!error, 'updateUser failed');
    try {
      assert((await decide(student, { allowStaff: true })) === 'FORBIDDEN');
    } finally {
      await student.auth.updateUser({ data: { role: null } });
    }
  });
  await test('L-06 live: qa-staff → FORBIDDEN on a premium action and a taxonomy write; allowed on a QF review read', async () => {
    const premium = require(path.join(ROOT, 'app/admin/premium/actions.ts'));
    const taxonomy = require(path.join(ROOT, 'app/admin/taxonomy/actions.ts'));
    const qf = require(path.join(ROOT, 'actions/question-factory.actions.ts'));
    sessionOverride = staff;
    try {
      const p = await premium.searchCandidateAction('qa-nobody@courage-library.test');
      const t = await taxonomy.createTaxonomyNodeAction({ parentId: null, nodeType: 'SUBJECT', name: 'QA should not exist' });
      const q = await qf.qfListReviewQueueAction({});
      assert(p.ok === false && p.error === 'FORBIDDEN', `premium: ${JSON.stringify(p).slice(0, 120)}`);
      assert(t.ok === false && t.error === 'FORBIDDEN', `taxonomy: ${JSON.stringify(t).slice(0, 120)}`);
      assert(!(q && q.ok === false && (q.error === 'FORBIDDEN' || q.error === 'UNAUTHORIZED')) && !(q && q.errorCode === 'UNAUTHORIZED'), `QF review read denied: ${JSON.stringify(q).slice(0, 160)}`);
    } finally {
      sessionOverride = null;
    }
  });
  await test('L-05 live: drill-down action is admin-only with a real staff session', async () => {
    const actions = require(path.join(ROOT, 'app/admin/live-tests/intelligence/actions.ts'));
    sessionOverride = staff;
    try {
      const r = await actions.getCandidateDrillDownAction('00000000-0000-4000-8000-000000000000');
      assert(r.ok === false && r.error === 'FORBIDDEN', JSON.stringify(r));
    } finally {
      sessionOverride = null;
    }
  });
  // NO sign-out: these clients hold the live job's SHARED QA sessions (CI-LEAN-1 cache). Any auth.signOut() — even
  // { scope: 'local' }, which still revokes the current session on the server — made every later gate (SEC1C, SEC1D,
  // FIXTURE-FINAL) run signed out. The clients are in-memory only (persistSession false); nothing to clean up.
}

(async () => {
  console.log('SEC-1B admin authorization suite');
  await part1();
  const { entries, loadErrors } = loadEntries();
  await part2q(entries);
  await part2(entries, loadErrors);
  await part3();
  await part3b(entries);
  await part4(entries);
  if (ARGS.has('--live')) await part5();
  fs.writeFileSync(path.join(require('os').tmpdir(), 'sec1b_matrix.json'), JSON.stringify(matrix, null, 1));
  console.log(lines.join('\n'));
  console.log('\nmatrix:', JSON.stringify(matrix.counts));
  console.log(`\nSEC-1B suite: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(lines.join('\n'));
  console.log('SUITE ERROR', String(e && e.stack ? e.stack : e).slice(0, 800));
  process.exit(1);
});
