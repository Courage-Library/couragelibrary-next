#!/usr/bin/env node
/**
 * RESULT-SEC-1 gate — a mock result is shown ONLY to the student who took it. Offline, no network, no DB.
 *   S-1 resolveOwnAttempt (lib/assessment/result-access.ts) with a fake Supabase client holding two users' rows:
 *       own attempt / result id / mock id → the viewer's own attempt; another user's attempt id, result id or mock id
 *       → nothing; no viewer → nothing. Proven twice: with RLS on (the session client) AND with RLS off (as if a
 *       service-role client were passed) — the explicit owner filters alone must still keep other users' rows out.
 *   S-2 the result page guard (rendered with stubs): no session → redirect to sign-in (never a load); a session outage
 *       → the retry state (never a load); signed in → the loader is called with THAT user's id
 *   S-3 the loader never falls back to the service role: getTestResult builds only the session client, has no
 *       try / catch fallback, resolves + checks ownership BEFORE any service-role read, and finalize-on-read runs only
 *       after the ownership check; getAttemptSubmissionStatus reads through the session with an owner filter
 *   S-4 negative controls: each broken variant is caught
 * Run: node scripts/test_result_sec1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const React = require('react');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

function loadTs(rel, src, stubs = {}) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(src ?? read(rel), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    let t = null;
    if (id.startsWith('@/')) t = id.slice(2);
    else if (id.startsWith('./') || id.startsWith('../')) t = path.relative(ROOT, path.resolve(path.dirname(file), id)).split(path.sep).join('/');
    if (t !== null) {
      const cand = [`${t}.ts`, `${t}.tsx`, `${t}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (!cand) throw new Error(`unresolved ${id}`);
      return loadTs(cand, undefined, stubs);
    }
    return require(id);
  };
  m._compile(js, file);
  return m.exports;
}

// ---------------------------------------------------------------- fake Supabase (two users, optional RLS)
const ME = 'u-me-0000';
const OTHER = 'u-other-0000';
const DB = {
  test_attempts: [
    { id: 'att-me-1', mock_test_id: 'mock-a', user_id: ME, status: 'submitted', started_at: '2026-11-01T10:00:00Z', submitted_at: '2026-11-01T11:00:00Z' },
    { id: 'att-other-1', mock_test_id: 'mock-b', user_id: OTHER, status: 'submitted', started_at: '2026-11-02T10:00:00Z', submitted_at: '2026-11-02T11:00:00Z' },
    { id: 'att-other-2', mock_test_id: 'mock-a', user_id: OTHER, status: 'submitted', started_at: '2026-11-03T10:00:00Z', submitted_at: '2026-11-03T11:00:00Z' },
  ],
  test_results: [
    { id: 'res-me-1', attempt_id: 'att-me-1', user_id: ME },
    { id: 'res-other-1', attempt_id: 'att-other-1', user_id: OTHER },
  ],
};
function fakeClient(viewer, { rls }) {
  return {
    from(table) {
      let rows = (DB[table] || []).slice();
      if (rls) rows = rows.filter((r) => r.user_id === viewer); // RLS: auth.uid() = user_id
      const q = {
        select() { return q; },
        eq(c, v) { rows = rows.filter((r) => r[c] === v); return q; },
        in(c, v) { rows = rows.filter((r) => v.includes(r[c])); return q; },
        order(c, o) { rows.sort((a, b) => (o.ascending ? 1 : -1) * String(a[c]).localeCompare(String(b[c]))); return q; },
        limit(n) { rows = rows.slice(0, n); return q; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null }); },
      };
      return q;
    },
  };
}

const ACCESS_REL = 'lib/assessment/result-access.ts';
const PAGE_REL = 'app/(site)/mock-tests/[id]/result/page.tsx';
const SVC_REL = 'services/assessment.service.ts';
const SRC = { access: read(ACCESS_REL), page: read(PAGE_REL), svc: read(SVC_REL) };

async function checkResolve(accessSrc) {
  const { resolveOwnAttempt } = loadTs(ACCESS_REL, accessSrc);
  const out = [];
  for (const rls of [true, false]) {
    const sb = fakeClient(ME, { rls });
    const tag = rls ? 'RLS on' : 'RLS off';
    const own = await resolveOwnAttempt(sb, 'att-me-1', ME);
    assert(own && own.id === 'att-me-1', `${tag}: own attempt id not resolved`);
    const byRes = await resolveOwnAttempt(sb, 'res-me-1', ME);
    assert(byRes && byRes.id === 'att-me-1', `${tag}: own result id not resolved`);
    const byMock = await resolveOwnAttempt(sb, 'mock-a', ME);
    assert(byMock && byMock.id === 'att-me-1', `${tag}: own mock id → ${byMock && byMock.id} (want the viewer's own attempt, never another user's)`);
    for (const [what, id] of [['attempt id', 'att-other-1'], ['result id', 'res-other-1'], ['mock id', 'mock-b']]) {
      const got = await resolveOwnAttempt(sb, id, ME);
      assert(got === null, `${tag}: another user's ${what} resolved to ${got && got.id}`);
    }
    assert((await resolveOwnAttempt(sb, 'att-me-1', '')) === null, `${tag}: no viewer still resolved`);
    out.push(tag);
  }
  return `own → shown; other user's attempt / result / mock → nothing (${out.join(' + ')})`;
}

async function checkPage(pageSrc) {
  const calls = [];
  class Redirect extends Error {}
  let session = { state: 'none' };
  const stubs = {
    'next/navigation': { redirect: (to) => { throw Object.assign(new Redirect('redirect'), { to }); }, notFound: () => { throw new Error('notFound'); } },
    'next/link': { __esModule: true, default: ({ children }) => children },
    '@/lib/auth/session': { getServerSession: async () => session },
    '@/components/auth/session-unavailable': { SessionUnavailable: () => React.createElement('div', { 'data-session-unavailable': '' }) },
    '@/lib/auth/safe-redirect': { loginRedirectPath: (p) => `/auth/login?next=${encodeURIComponent(p)}` },
    '@/services/assessment.service': {
      AssessmentService: {
        getTestResult: async (id, viewer) => { calls.push(['result', id, viewer]); return null; },
        getAttemptSubmissionStatus: async (id, viewer) => { calls.push(['status', id, viewer]); return null; },
      },
    },
    '@/components/assessment/result-view-client': { ResultViewClient: () => null },
    '@/components/ui/no-glass-zone': { NoGlassZone: ({ children }) => children },
    '@/components/ui/legacy/container': { Container: ({ children }) => children },
    '@/components/ui/legacy/card': { Card: ({ children }) => children },
    '@/components/ui/legacy/button': { Button: ({ children }) => children },
  };
  const Page = loadTs(PAGE_REL, pageSrc, stubs).default;
  const params = Promise.resolve({ id: 'att-x' });
  // no session → redirect to sign-in, no load
  let to = null;
  try { await Page({ params }); } catch (e) { if (e instanceof Redirect) to = e.to; else throw e; }
  assert(to && /^\/auth\/login\?next=%2Fmock-tests%2Fatt-x%2Fresult$/.test(to) && calls.length === 0, `no session: redirect ${to}, loads ${calls.length}`);
  // outage → retry state, no load
  session = { state: 'error' };
  const el = await Page({ params });
  assert(el && el.type && calls.length === 0 && /SessionUnavailable/.test(String(el.type.name || el.type)), `outage: ${el && el.type && el.type.name}, loads ${calls.length}`);
  // signed in → the loader gets THAT user's id
  session = { state: 'ok', user: { id: ME } };
  await Page({ params });
  assert(calls.length >= 1 && calls.every((c) => c[2] === ME) && calls[0][0] === 'result', `signed in: loader calls ${JSON.stringify(calls)}`);
  return 'no session → sign-in · outage → retry · signed in → own id';
}

function checkLoader(svc) {
  const s = code(svc);
  const fn = s.slice(s.indexOf('static async getTestResult('), s.indexOf('static async realCohortStanding('));
  assert(fn.length > 100, 'getTestResult not found');
  assert(/static async getTestResult\(attemptId: string, viewerId: string\)/.test(fn), 'getTestResult does not take the viewer id');
  assert(!/\bcatch\b/.test(fn.slice(0, fn.indexOf('r.user_id !== viewerId'))), 'a try / catch fallback before the ownership check');
  const iOwn = fn.indexOf('const attemptData = await resolveOwnAttempt(sb, attemptId, viewerId);');
  const iResCheck = fn.indexOf('if (!r || r.user_id !== viewerId) return null;');
  const iAdmin = fn.indexOf('createAdminServerSupabaseClient');
  const iFinal = fn.indexOf('finalizeExpiredAttempts(');
  assert(iOwn > 0 && /const sb = await createServerSupabaseClient\(\);/.test(fn.slice(0, iOwn)), 'ownership is not resolved through the session client');
  assert(iResCheck > iOwn, 'the result row is not owner-checked');
  assert(iAdmin < 0 || iAdmin > iResCheck, 'a service-role read before ownership is proven');
  assert(iFinal > iOwn && iFinal < iResCheck && /finalizeExpiredAttempts\(\{ userId: viewerId, limit: 20 \}\)/.test(fn), 'finalize-on-read is not after the ownership check / not scoped to the viewer');
  const st = s.slice(s.indexOf('static async getAttemptSubmissionStatus('), s.indexOf('static async getTestResult('));
  assert(/\(attemptId: string, viewerId: string\)/.test(st) && /createServerSupabaseClient\(\)/.test(st) && !/createAdminServerSupabaseClient/.test(st) && /\.eq\("user_id", viewerId\)/.test(st) && /attempt\.user_id !== viewerId/.test(st), 'submission status reads another user\'s attempt (service role / no owner check)');
  const acc = code(SRC.access);
  assert(!/createAdminServerSupabaseClient|lib\/supabase\/server/.test(acc),'result-access builds its own (service-role) client');
  return 'session client only · owner checked before any service-role read · finalize after';
}

(async () => {
  console.log('RESULT-SEC-1 result access (static + fake client)');
  await test('S-1 only the viewer\'s own attempt resolves (RLS on and off)', () => checkResolve());
  await test('S-2 page guard: no session → sign-in, outage → retry, signed in → own id', () => checkPage());
  await test('S-3 no service-role fallback; ownership before any service-role read; finalize after', () => checkLoader(SRC.svc));

  await test('S-4 negative controls: each broken variant is caught', async () => {
    const mut = (s, a, b) => {
      if (!s.includes(a)) throw new Error(`mutation anchor missing: ${a.slice(0, 80)}`);
      return s.split(a).join(b);
    };
    const muts = [
      ['no owner filter + no final check (RLS off shows another user)', () => checkResolve(mut(mut(SRC.access, '.eq("user_id", viewerId)', ''), 'if (!data || data.user_id !== viewerId) return null;', 'if (!data) return null;'))],
      ['mock-id lookup without the owner filter', () => checkResolve(mut(SRC.access, '      .eq("mock_test_id", idOrResultOrMock)\n      .eq("user_id", viewerId)', '      .eq("mock_test_id", idOrResultOrMock)'))],
      ['empty viewer accepted', () => checkResolve(mut(SRC.access, 'if (!viewerId || !idOrResultOrMock) return null;', 'if (!idOrResultOrMock) return null;').replace("if (!data || data.user_id !== viewerId) return null;", "if (!data) return null;").split('.eq("user_id", viewerId)').join(''))],
      ['page without the sign-in redirect', () => checkPage(mut(SRC.page, '  if (authSession.state === "none") redirect(loginRedirectPath(`/mock-tests/${id}/result`));\n', ''))],
      ['page loads during an outage', () => checkPage(mut(SRC.page, '  if (authSession.state === "error") return <SessionUnavailable />;\n', ''))],
      ['page passes a fixed id, not the viewer', () => checkPage(mut(SRC.page, 'AssessmentService.getTestResult(id, viewerId)', 'AssessmentService.getTestResult(id, "someone")'))],
      ['the old service-role fallback is back', () => checkLoader(mut(SRC.svc, '    const sb = await createServerSupabaseClient();\n\n    // 1 + 2.', '    let sb: any;\n    try { sb = await createServerSupabaseClient(); } catch { sb = createAdminServerSupabaseClient(); }\n\n    // 1 + 2.'))],
      ['finalize before the ownership check', () => checkLoader(mut(mut(SRC.svc, '    await AssessmentService.finalizeExpiredAttempts({ userId: viewerId, limit: 20 });\n', ''), '    const sb = await createServerSupabaseClient();\n\n', '    await AssessmentService.finalizeExpiredAttempts({ userId: viewerId, limit: 20 });\n    const sb = await createServerSupabaseClient();\n\n'))],
      ['result row not owner-checked', () => checkLoader(mut(SRC.svc, 'if (!r || r.user_id !== viewerId) return null;', 'if (!r) return null;'))],
      ['submission status via the service role', () => checkLoader(mut(SRC.svc, '    const sb = await createServerSupabaseClient();\n    const { data: attempt } = await sb', '    const sb = createAdminServerSupabaseClient();\n    const { data: attempt } = await sb'))],
    ];
    const missed = [];
    for (const [name, run] of muts) {
      try {
        await run();
        missed.push(name);
      } catch (e) {
        if (/mutation anchor missing/.test(String(e && e.message))) missed.push(`${name} (${e.message})`);
      }
    }
    assert(missed.length === 0, `not caught: ${missed.join('; ')}`);
    return `${muts.length}/${muts.length} broken variants caught`;
  });

  console.log(results.join('\n'));
  console.log(`\nRESULT-SEC-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
