/**
 * COURAGE LIBRARY — SEC-1C ADMIN PAGE AUTHORIZATION TEST SUITE (layouts are not security boundaries)
 *
 * Part 1  static: every app/admin/**\/page.tsx (and layout, generateMetadata) calls requireAdminPage as
 *         its first awaited call, before any data fetch; admin-only pages never pass allowStaff; every
 *         page is force-dynamic; no client page.tsx; middleware redirects anonymous /admin page
 *         requests and makes no role decision; no data-fetching server component in components/admin.
 * Part 2  guard unit: requireAdminPage + sanitizeAdminNext (anonymous → login redirect with a safe
 *         `next`; student / user_metadata-only admin / staff-on-admin-page → notFound; allowed roles).
 * Part 3  page execution: EVERY admin page is executed with recording mocks as anonymous, student,
 *         user_metadata.role='admin' and (admin-only pages) staff → denied before ANY service/DB call.
 * Part 4  (--live [baseUrl]) every /admin/* path over HTTP as anonymous, qa-student, qa-staff, qa-admin
 *         (permanent QA identities, sign-in only) + payload scanner (no PII values are printed).
 *
 * Run: node scripts/test_sec1c_admin_pages.cjs [--live [http://localhost:3100 | https://…]]
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const LIVE_BASE = (LIVE && argv[argv.indexOf('--live') + 1] && /^https?:\/\//.test(argv[argv.indexOf('--live') + 1]))
  ? argv[argv.indexOf('--live') + 1].replace(/\/$/, '')
  : 'http://localhost:3100';
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

// ---------- mocks ----------
const USERS = {
  anon: null,
  student: { id: 'aaaaaaaa-0000-4000-8000-00000000000c', email: 'student@courage-library.test', app_metadata: {}, user_metadata: {} },
  userMetaAdmin: { id: 'aaaaaaaa-0000-4000-8000-00000000000c', email: 'student@courage-library.test', app_metadata: {}, user_metadata: { role: 'admin' } },
  staff: { id: 'aaaaaaaa-0000-4000-8000-00000000000b', email: 'staff@courage-library.test', app_metadata: { role: 'staff' }, user_metadata: {} },
  admin: { id: 'aaaaaaaa-0000-4000-8000-00000000000a', email: 'admin@courage-library.test', app_metadata: { role: 'admin' }, user_metadata: {} },
};
const state = { user: null, getUserThrows: false, calls: [] };
class RedirectSignal extends Error { constructor(url) { super('NEXT_REDIRECT ' + url); this.url = url; } }
class NotFoundSignal extends Error { constructor() { super('NEXT_NOT_FOUND'); } }

const recorder = (label) =>
  new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (prop === '__esModule') return true;
      return recorder(`${label}.${String(prop)}`);
    },
    apply: () => {
      state.calls.push(label);
      return Promise.resolve({ data: null, error: null });
    },
  });
const sessionClient = () => ({
  auth: {
    getUser: async () => {
      if (state.getUserThrows) throw new Error('fetch failed');
      return { data: { user: state.user }, error: null };
    },
  },
  from: (t) => { state.calls.push(`session.from(${t})`); return recorder(`session.${t}`); },
  rpc: (n) => { state.calls.push(`session.rpc(${n})`); return Promise.resolve({ data: null, error: null }); },
  storage: recorder('session.storage'),
});
const MOCKS = {
  'server-only': {},
  'next/navigation': {
    redirect: (url) => { throw new RedirectSignal(url); },
    notFound: () => { throw new NotFoundSignal(); },
    useRouter: () => ({}), usePathname: () => '/', useSearchParams: () => new URLSearchParams(), useParams: () => ({}),
  },
  'next/cache': { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn) => fn },
  'next/headers': { cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }), headers: async () => new Map() },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => sessionClient(),
    createAdminServerSupabaseClient: () => { state.calls.push('createAdminServerSupabaseClient'); return recorder('serviceRole'); },
    createPublicServerSupabaseClient: () => { state.calls.push('createPublicServerSupabaseClient'); return recorder('public'); },
  },
};
const MOCK_PREFIXES = ['@/services/'];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  if (MOCK_PREFIXES.some((p) => request.startsWith(p))) return recorder(request);
  return originalLoad.call(this, request, parent, isMain);
};
const realFetch = globalThis.fetch;
if (!LIVE) globalThis.fetch = async () => { state.calls.push('fetch'); throw new Error('network disabled'); };

// ---------- harness ----------
let passed = 0;
let failed = 0;
const lines = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    lines.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
};
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const PAGES = walk(path.join(ROOT, 'app/admin')).filter((f) => /[\\/]page\.tsx$/.test(f)).map(rel).sort();
const segOf = (p) => p.replace(/^app\/admin\/?/, '').replace(/\/?page\.tsx$/, '');
// Decision #16 + SEC-1C: admin-only pages. Every other admin page allows staff.
// SEC-1D: + gamification, billing, live-tests/[id]/results (PII pages).
const ADMIN_ONLY = new Set(['premium', 'rewards', 'adaptive', 'taxonomy', 'live-tests/intelligence', 'live-tests/[id]/intelligence', 'users', 'gamification', 'billing', 'live-tests/[id]/results']);

/** Body of the default-exported function (or a named function) — brace-matched. */
function fnBody(src, header) {
  const i = src.search(header);
  if (i < 0) return null;
  const open = src.indexOf('{', src.indexOf(')', i));
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(open + 1, j);
  }
  return null;
}
/** The first statement that awaits/fetches/calls a service must be `await requireAdminPage(`. */
function firstGuardViolation(body) {
  const stmts = body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').split(/;\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) {
    if (/\bawait\s+requireAdminPage\(/.test(s)) return null;
    if (/\bawait\b|Promise\.all|Service\.|createAdminServerSupabaseClient|createServerSupabaseClient|\.from\(|fetch\(|isFeatureEnabled|redirect\(|notFound\(|return\b/.test(s)) return s.slice(0, 140);
  }
  return 'no requireAdminPage call';
}

(async () => {
  // ===================== Part 1: static =====================
  await test(`S-01 inventory: ${PAGES.length} app/admin page.tsx files (expected 37: +design-system UX-1a, +syllabus + syllabus/[id] GAP2-4b)`, async () => {
    assert(PAGES.length === 37, `found ${PAGES.length}`);
  });
  await test('S-02 every admin page: requireAdminPage is the FIRST awaited call (before any data/service/gate)', async () => {
    const bad = [];
    for (const p of PAGES) {
      const src = read(p);
      const body = fnBody(src, /export default (async )?function \w*\s*\(/);
      const v = body == null ? 'no default export body' : firstGuardViolation(body);
      if (v) bad.push(`${p}: ${v}`);
      if (/generateMetadata/.test(src)) {
        const mb = fnBody(src, /export (async )?function generateMetadata\s*\(/);
        const mv = mb == null ? 'generateMetadata body not found' : firstGuardViolation(mb);
        if (mv) bad.push(`${p}#generateMetadata: ${mv}`);
      }
    }
    const lb = fnBody(read('app/admin/layout.tsx'), /export default (async )?function \w*\s*\(/);
    const lv = firstGuardViolation(lb || '');
    if (lv) bad.push(`app/admin/layout.tsx: ${lv}`);
    assert(bad.length === 0, bad.join('\n        '));
    return `${PAGES.length} pages + layout`;
  });
  await test('S-03 admin-only pages never pass allowStaff; every other page passes allowStaff: true', async () => {
    const bad = [];
    for (const p of PAGES) {
      const call = (read(p).match(/requireAdminPage\(([^)]*)\)/) || [])[1] || '';
      const staff = /allowStaff:\s*true/.test(call);
      if (ADMIN_ONLY.has(segOf(p)) === staff) bad.push(`${p}: ${staff ? 'allows staff' : 'admin only'} (expected ${ADMIN_ONLY.has(segOf(p)) ? 'admin only' : 'staff'})`);
    }
    const seen = new Set(PAGES.map(segOf));
    for (const s of ADMIN_ONLY) if (!seen.has(s)) bad.push(`admin-only page missing: ${s}`);
    assert(bad.length === 0, bad.join('\n        '));
    return `admin-only: ${[...ADMIN_ONLY].join(', ')}`;
  });
  await test('S-04 every admin page is force-dynamic (no static prerender / ISR of admin data)', async () => {
    const bad = PAGES.filter((p) => !/export const dynamic = "force-dynamic"/.test(read(p)));
    assert(bad.length === 0, bad.join(', '));
  });
  await test('S-05 no client page.tsx under app/admin (client views sit behind a guarded server wrapper)', async () => {
    const bad = PAGES.filter((p) => /^\s*["']use client["']/.test(read(p)));
    assert(bad.length === 0, bad.join(', '));
  });
  await test('S-06 middleware: anonymous /admin page requests → login redirect; no role decision; /api/admin untouched', async () => {
    const m = read('lib/supabase/middleware.ts');
    assert(/pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)/.test(m), 'admin path check missing');
    assert(/loginUrl\.pathname = "\/auth\/login"/.test(m) && /NextResponse\.redirect\(loginUrl\)/.test(m), 'login redirect missing');
    assert(!/app_metadata|resolveRole|role\s*===/.test(m), 'middleware makes a role decision');
    assert(!/startsWith\("\/api\/admin/.test(m), 'middleware touches /api/admin');
    assert(/matcher/.test(read('middleware.ts')), 'middleware matcher missing');
  });
  await test('S-07 components/admin: no server component fetches data on its own', async () => {
    const bad = walk(path.join(ROOT, 'components/admin')).filter((f) => /\.tsx?$/.test(f)).filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      return !/^\s*["']use client["']/.test(s) && /Service\.|createServerSupabaseClient|createAdminServerSupabaseClient|\.from\(/.test(s);
    }).map(rel);
    assert(bad.length === 0, bad.join(', '));
  });

  // ===================== Part 2: guard unit =====================
  const guard = require(path.join(ROOT, 'lib/auth/require-admin.ts'));
  const run = async (user, opts, throwsGetUser = false) => {
    state.user = user;
    state.getUserThrows = throwsGetUser;
    try {
      const r = await guard.requireAdminPage(opts);
      return { allowed: r };
    } catch (e) {
      if (e instanceof RedirectSignal) return { redirect: e.url };
      if (e instanceof NotFoundSignal) return { notFound: true };
      throw e;
    } finally {
      state.getUserThrows = false;
    }
  };
  await test('U-01 anonymous → redirect /auth/login?next=<page path>', async () => {
    const r = await run(USERS.anon, { allowStaff: true, path: '/admin/content' });
    assert(r.redirect === '/auth/login?next=%2Fadmin%2Fcontent', JSON.stringify(r));
  });
  await test('U-02 session error (getUser throws) → redirect to login, not allowed', async () => {
    const r = await run(USERS.admin, { allowStaff: true, path: '/admin' }, true);
    assert(r.redirect === '/auth/login?next=%2Fadmin', JSON.stringify(r));
  });
  await test('U-03 bad next values are sanitized to /admin (no open redirect)', async () => {
    const bad = ['https://evil.example/x', '//evil.example', '/notadmin', '/admin/../etc', '/admin//evil.example', '/admin\\evil', '/admin?x=1', '/admin#x', '/adminx', 'admin', undefined, null, 42, '/admin/%2F%2Fevil'];
    for (const b of bad) assert(guard.sanitizeAdminNext(b) === '/admin', `not sanitized: ${String(b)}`);
    for (const ok of ['/admin', '/admin/content', '/admin/live-tests', '/admin/questions/factory']) assert(guard.sanitizeAdminNext(ok) === ok, `valid path rejected: ${ok}`);
    const r = await run(USERS.anon, { allowStaff: true, path: '//evil.example' });
    assert(r.redirect === '/auth/login?next=%2Fadmin', JSON.stringify(r));
  });
  await test('U-04 student (no role) → notFound', async () => {
    const r = await run(USERS.student, { allowStaff: true, path: '/admin' });
    assert(r.notFound, JSON.stringify(r));
  });
  await test('U-05 user_metadata.role=admin only → notFound (user_metadata never trusted)', async () => {
    const r = await run(USERS.userMetaAdmin, { allowStaff: true, path: '/admin' });
    assert(r.notFound, JSON.stringify(r));
  });
  await test('U-06 staff on admin-only page → notFound', async () => {
    const r = await run(USERS.staff, { path: '/admin/premium' });
    assert(r.notFound, JSON.stringify(r));
  });
  await test('U-07 staff on staff page → allowed (role staff)', async () => {
    const r = await run(USERS.staff, { allowStaff: true, path: '/admin/content' });
    assert(r.allowed && r.allowed.role === 'staff' && r.allowed.userId === USERS.staff.id, JSON.stringify(r));
  });
  await test('U-08 admin → allowed on admin-only and staff pages', async () => {
    const a = await run(USERS.admin, { path: '/admin/premium' });
    const b = await run(USERS.admin, { allowStaff: true, path: '/admin/content' });
    assert(a.allowed && a.allowed.role === 'admin' && b.allowed && b.allowed.role === 'admin', JSON.stringify([a, b]));
  });
  await test('U-09 guard takes no user id (signature: options only)', async () => {
    const src = read('lib/auth/require-admin.ts');
    const sig = (src.match(/export async function requireAdminPage\(([^)]*)\)/) || [])[1] || '';
    assert(/^opts: RequireAdminPageOptions = \{\}$/.test(sig.trim()), sig);
    assert(!/userId|adminUserId/.test((src.match(/export interface RequireAdminPageOptions[\s\S]*?\n\}/) || [''])[0]), 'options accept a user id');
  });

  // ===================== Part 3: page execution, denied before any data call =====================
  const params = { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }), searchParams: Promise.resolve({}) };
  const execPage = async (p, user) => {
    state.user = user;
    state.calls = [];
    try {
      const mod = require(path.join(ROOT, p));
      await mod.default(params);
      return { outcome: 'RENDERED', calls: state.calls.slice() };
    } catch (e) {
      if (e instanceof RedirectSignal) return { outcome: 'REDIRECT', url: e.url, calls: state.calls.slice() };
      if (e instanceof NotFoundSignal) return { outcome: 'NOT_FOUND', calls: state.calls.slice() };
      return { outcome: 'ERROR ' + String(e.message).slice(0, 120), calls: state.calls.slice() };
    }
  };
  // Feature flags ON so the quarantine gate cannot be what stops the request.
  process.env.FEATURE_ADAPTIVE = 'true';
  process.env.FEATURE_LIVE_TESTS = 'true';
  for (const [label, user, expect] of [['anonymous', USERS.anon, 'REDIRECT'], ['student', USERS.student, 'NOT_FOUND'], ['user_metadata admin', USERS.userMetaAdmin, 'NOT_FOUND']]) {
    await test(`P-${label}: every admin page → ${expect} before any service/DB call (flags ON)`, async () => {
      const bad = [];
      for (const p of PAGES) {
        const r = await execPage(p, user);
        if (r.outcome !== expect) bad.push(`${p}: ${r.outcome}`);
        else if (expect === 'REDIRECT' && !/^\/auth\/login\?next=%2Fadmin/.test(r.url)) bad.push(`${p}: redirect ${r.url}`);
        if (r.calls.length) bad.push(`${p}: calls before denial: ${r.calls.slice(0, 4).join(', ')}`);
      }
      assert(bad.length === 0, bad.join('\n        '));
      return `${PAGES.length}/${PAGES.length}`;
    });
  }
  await test('P-staff: admin-only pages → NOT_FOUND before any call; staff pages pass the guard', async () => {
    const bad = [];
    let staffPassed = 0;
    for (const p of PAGES) {
      const r = await execPage(p, USERS.staff);
      if (ADMIN_ONLY.has(segOf(p))) {
        if (r.outcome !== 'NOT_FOUND' || r.calls.length) bad.push(`${p}: ${r.outcome} calls=${r.calls.length}`);
      } else if (r.outcome === 'NOT_FOUND' || (r.outcome === 'REDIRECT' && /auth\/login/.test(r.url))) {
        bad.push(`${p}: staff denied (${r.outcome})`);
      } else staffPassed++;
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `admin-only ${ADMIN_ONLY.size} denied, staff pages ${staffPassed} passed the guard`;
  });
  await test('P-admin: every page passes the guard (no login redirect / notFound from the guard)', async () => {
    const bad = [];
    for (const p of PAGES) {
      const r = await execPage(p, USERS.admin);
      if (r.outcome === 'NOT_FOUND' || (r.outcome === 'REDIRECT' && /auth\/login/.test(r.url))) bad.push(`${p}: ${r.outcome}`);
    }
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('P-layout: anonymous → login redirect, student → notFound, staff/admin → rendered', async () => {
    const L = require(path.join(ROOT, 'app/admin/layout.tsx')).default;
    const out = {};
    for (const [k, u] of Object.entries({ anon: USERS.anon, student: USERS.student, staff: USERS.staff, admin: USERS.admin })) {
      state.user = u;
      try { await L({ children: null }); out[k] = 'RENDERED'; } catch (e) { out[k] = e instanceof RedirectSignal ? 'REDIRECT' : e instanceof NotFoundSignal ? 'NOT_FOUND' : 'ERROR ' + e.message; }
    }
    assert(out.anon === 'REDIRECT' && out.student === 'NOT_FOUND' && out.staff === 'RENDERED' && out.admin === 'RENDERED', JSON.stringify(out));
  });
  delete process.env.FEATURE_ADAPTIVE;
  delete process.env.FEATURE_LIVE_TESTS;

  // ===================== Part 4: live HTTP (permanent QA identities, sign-in only) =====================
  if (LIVE) {
    globalThis.fetch = realFetch;
    const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
    const { readEnv } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
    const env = readEnv();
    const DUMMY = '00000000-0000-4000-8000-000000000000';
    const LIVE_PATHS = PAGES.map((p) => '/admin' + (segOf(p) ? '/' + segOf(p).replace(/\[id\]/g, DUMMY) : ''));
    const segFromPath = (u) => u.replace(/^\/admin\/?/, '').replace(new RegExp(DUMMY, 'g'), '[id]');
    const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const scan = (body) => ({
      email: (body.match(EMAIL) || []).length,
      qa: (body.match(/qa-(admin|staff|student)@courage-library\.test/g) || []).length,
      draft: (body.match(/\\?"(DRAFT|IN_REVIEW|PENDING_REVIEW|PENDING|NOT_CREATED|draft|archived|IN_PROGRESS)\\?"/g) || []).length,
      kpi: (body.match(/QUESTION BANK|MOCK TEST PAPERS|totalQuestions|totalUsers|questionsInBank|\\?"count\\?"\s*:/g) || []).length,
      adminLinks: (body.match(/\\?"href\\?"\s*:\s*\\?"\/admin\//g) || []).length,
      uuid: (body.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []).filter((u) => u !== DUMMY).length,
      piiKeys: (body.match(/\\?"(email|user_email|full_name|display_name|phone|userName|userId|reporterUserId|candidateEmail)\\?"\s*:/g) || []).length,
      restricted: /Access Restricted/.test(body),
    });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const get = async (request, url) => {
      for (let i = 1; i <= 3; i++) {
        try {
          const r = await request.get(LIVE_BASE + url, { maxRedirects: 0, timeout: 180000 });
          return { status: r.status(), location: r.headers()['location'] || '', body: await r.text() };
        } catch (e) { if (i === 3) return { status: 0, location: '', body: '', err: String(e.message).slice(0, 100) }; }
      }
    };
    const signIn = async (email, pwKey) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      for (let i = 1; i <= 3; i++) {
        try {
          await page.goto(LIVE_BASE + '/auth/login', { waitUntil: 'networkidle', timeout: 180000 });
          await page.fill('input[name="email"]', email);
          await page.fill('input[name="password"]', env(pwKey));
          await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 120000 }), page.click('button[type="submit"]')]);
          return ctx;
        } catch { /* retry */ }
      }
      await ctx.close();
      throw new Error(`sign-in failed after 3 attempts (${email.split('@')[0]})`);
    };
    const anonCtx = await browser.newContext();
    await test(`L-01 anonymous: every /admin path → 30x to /auth/login, no admin markers / RSC data (${LIVE_BASE})`, async () => {
      const bad = [];
      for (const u of LIVE_PATHS) {
        const r = await get(anonCtx.request, u);
        const loc = r.location ? new URL(r.location, LIVE_BASE) : null;
        const m = scan(r.body);
        if (![302, 303, 307, 308].includes(r.status) || !loc || loc.pathname !== '/auth/login') bad.push(`${u}: HTTP ${r.status} → ${loc ? loc.pathname : '-'}${r.err ? ' ' + r.err : ''}`);
        else if (!/^\/admin/.test(loc.searchParams.get('next') || '')) bad.push(`${u}: next=${loc.searchParams.get('next')}`);
        if (m.email || m.draft || m.kpi || m.adminLinks || m.uuid || m.piiKeys || m.restricted || /self\.__next_f/.test(r.body)) bad.push(`${u}: payload ${JSON.stringify(m)}`);
      }
      assert(bad.length === 0, bad.join('\n        '));
      return `${LIVE_PATHS.length}/${LIVE_PATHS.length}`;
    });
    await test('L-02 anonymous /api/admin route → 401 uniform JSON (unchanged)', async () => {
      const r = await get(anonCtx.request, '/api/admin/current-affairs/stats');
      const j = JSON.parse(r.body || '{}');
      assert(r.status === 401 && j.ok === false && j.success === false && j.error === 'UNAUTHORIZED' && j.message === 'Sign in required.', `HTTP ${r.status}`);
    });
    await anonCtx.close();

    // Per role: (data) denied responses carry no admin data beyond the same user's own site 404 and show the
    // not-found UI; (status) denied → HTTP 404, allowed → 200 (or an in-admin redirect).
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const roleRun = async (email, pwKey, expectFor) => {
      const ctx = await signIn(email, pwKey);
      const base404 = await get(ctx.request, '/zz-sec1c-baseline-404');
      const b = scan(base404.body);
      const ownUuids = new Set(base404.body.match(UUID_RE) || []);
      // Emails other than the signed-in user's own (the admin layout shows the user's own email).
      const foreignEmails = (body) => (body.match(EMAIL) || []).filter((e) => e.toLowerCase() !== email.toLowerCase()).length;
      const b404Foreign = foreignEmails(base404.body);
      const data = [];
      const status = [];
      const counts = { allowed: 0, denied: 0 };
      for (const u of LIVE_PATHS) {
        const exp = expectFor(segFromPath(u));
        let r = await get(ctx.request, u);
        // Middleware fails closed (→ login) when its session lookup cannot reach Supabase; retry ≤ 3 total.
        for (let i = 1; i < 3 && exp === 'allowed' && r.location && new URL(r.location, LIVE_BASE).pathname === '/auth/login'; i++) r = await get(ctx.request, u);
        if (r.status === 0) { status.push(`${u}: no response ${r.err || ''}`); data.push(`${u}: no response`); continue; }
        if (exp === 'allowed') {
          const ok = r.status === 200 || ([302, 303, 307, 308].includes(r.status) && /^\/admin/.test(new URL(r.location, LIVE_BASE).pathname));
          if (ok) counts.allowed++; else status.push(`${u}: HTTP ${r.status}${r.location ? ' → ' + new URL(r.location, LIVE_BASE).pathname : ''} (expected allowed)`);
          continue;
        }
        counts.denied++;
        // Architect ruling A (SEC-1C §10a): with the root app/loading.tsx streaming boundary, a denied
        // signed-in user gets HTTP 200 carrying the not-found digest + UI + noindex (or a plain 404).
        const notFoundShape = r.status === 404 || (r.status === 200 && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(r.body)
          && /<meta name="robots" content="noindex"/.test(r.body) && /Page Not Found/.test(r.body));
        if (!notFoundShape) status.push(`${u}: HTTP ${r.status} without not-found digest/UI/noindex (expected not-found)`);
        const m = scan(r.body);
        for (const k of ['draft', 'kpi', 'adminLinks', 'piiKeys']) if (m[k] > b[k]) data.push(`${u}: ${k} ${m[k]} > own 404 ${b[k]}`);
        const fe = foreignEmails(r.body);
        if (fe > b404Foreign) data.push(`${u}: ${fe} email(s) other than the user's own (own 404: ${b404Foreign})`);
        const foreign = [...new Set(r.body.match(UUID_RE) || [])].filter((x) => !ownUuids.has(x) && x !== DUMMY).length;
        if (foreign) data.push(`${u}: ${foreign} uuid(s) not in the user's own 404`);
        if (!/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(r.body) && r.status !== 404) data.push(`${u}: not-found UI not rendered`);
        if (m.restricted) data.push(`${u}: admin layout rendered`);
      }
      await ctx.close();
      return { data, status, counts };
    };
    const runs = {};
    const role = async (key, email, pw, fn) => { if (!runs[key]) runs[key] = await roleRun(email, pw, fn); return runs[key]; };
    const STUDENT = () => role('student', 'qa-student@courage-library.test', 'QA_STUDENT_PASSWORD', () => 'denied');
    const STAFF = () => role('staff', 'qa-staff@courage-library.test', 'QA_STAFF_PASSWORD', (s) => (ADMIN_ONLY.has(s) ? 'denied' : 'allowed'));
    const ADMIN = () => role('admin', 'qa-admin@courage-library.test', 'QA_ADMIN_PASSWORD', () => 'allowed');
    await test('L-03a qa-student: every /admin path denied with NO admin data (≤ own site 404, not-found UI)', async () => {
      const r = await STUDENT(); assert(r.data.length === 0, r.data.join('\n        ')); return `denied ${r.counts.denied}`;
    });
    await test('L-03b qa-student: every /admin path → not-found response (404, or 200 + not-found digest/UI + noindex; ruling A)', async () => {
      const r = await STUDENT();
      assert(r.status.length === 0 && r.data.length === 0, [...r.status, ...r.data].slice(0, 6).join('\n        ') + (r.status.length > 6 ? `\n        … ${r.status.length} total` : ''));
      return `${r.counts.denied} not-found`;
    });
    await test('L-04a qa-staff: admin-only pages denied with NO admin data; staff pages allowed', async () => {
      const r = await STAFF();
      const notAllowed = r.status.filter((s) => /expected allowed|no response/.test(s));
      assert(r.data.length === 0 && notAllowed.length === 0, [...r.data, ...notAllowed].join('\n        '));
      return `allowed ${r.counts.allowed}, denied ${r.counts.denied}`;
    });
    await test('L-04b qa-staff: admin-only pages → not-found response (404, or 200 + not-found digest/UI + noindex; ruling A)', async () => {
      const r = await STAFF();
      const nf = r.status.filter((s) => /expected not-found/.test(s));
      assert(nf.length === 0 && r.data.length === 0, [...nf, ...r.data].join('\n        '));
      return `${r.counts.denied} not-found`;
    });
    await test('L-05 qa-admin: every /admin path allowed (200 or in-admin redirect)', async () => {
      const r = await ADMIN(); assert(r.status.length === 0, r.status.join('\n        ')); return `allowed ${r.counts.allowed}`;
    });
    await browser.close();
  }

  console.log(lines.join('\n'));
  console.log(`\nSEC-1C admin page authorization suite: ${passed}/${passed + failed} passed${LIVE ? ` (live: ${LIVE_BASE})` : ''}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.log('SEC-1C SUITE ERROR', String(e && e.stack ? e.stack : e).slice(0, 1500));
  process.exit(1);
});
