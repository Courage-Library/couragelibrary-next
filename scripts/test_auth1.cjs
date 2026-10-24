#!/usr/bin/env node
/**
 * AUTH-1 Stage 2a gate (decision #60).
 *
 * Offline (default, no network, no DB):
 *   A  role source       — app_metadata only; an ADMIN_EMAILS match grants nothing; user_metadata grants nothing
 *   B  profile           — ensureProfile is insert-only (edited name / deactivated profile survive a sign-in)
 *   C  /auth/confirm     — valid / invalid / expired token_hash, bad type, legacy code, recovery override,
 *                          open-redirect vectors; /auth/callback provider error → fixed code
 *   D  messages          — error-code mapping, ?m= allow-list, identical sign-up / reset / login answers
 *                          (no enumeration), provider text never returned, signup-closed page has no form
 *   E  session helper    — tri-state classification; simulated Supabase failure → retry UI, no redirect, no data
 *                          (pages, middleware, admin guards fail closed)
 *   F  ratchet           — raw `auth.getUser()` call sites outside the helper may only go down
 *
 * Live (--live, run ONLY via scripts/live/with-server.cjs; BASE_URL from the runner):
 *   L  /auth/confirm with a bogus / reused / valid token_hash (admin.generateLink for the permanent qa-student —
 *      no email is sent), open-redirect `next` with a valid token, profile name unchanged by the sign-in,
 *      ?m= allow-list in the browser, identical login errors, QA password sign-in still works.
 * Prints no secrets, emails, tokens or ids.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
const LIVE = ARGS.has('--live');

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
    lines.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
  }
}
function assert(c, m) {
  if (!c) throw new Error(m || 'assertion failed');
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

async function offline() {
  // ---------- Controllable mocks ----------
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth1-test.example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid';
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.AUTH_SIGNUP_ENABLED;
  process.env.ADMIN_EMAILS = 'student@courage-library.test,admin-by-email@courage-library.test';

  const PROVIDER_TEXT = 'PROVIDER-RAW-TEXT-a1b2';
  const state = {
    db: 0,
    writes: [],
    upserts: [],
    redirects: [],
    getUser: () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' } }),
    auth: {},
    existingProfile: null,
    signupDisabled: false,
  };
  const reset = () => {
    state.db = 0;
    state.writes = [];
    state.upserts = [];
    state.redirects = [];
    state.auth = {};
  };
  const makeClient = () => {
    const builder = (table) => {
      const chain = {};
      const ops = [];
      const rec = (op) => (...args) => {
        ops.push(op);
        if (['insert', 'update', 'delete', 'upsert'].includes(op)) state.writes.push(`${table}.${op}`);
        if (op === 'upsert') state.upserts.push({ table, row: args[0], opts: args[1] });
        return chain;
      };
      ['select', 'eq', 'neq', 'in', 'not', 'or', 'lte', 'lt', 'gte', 'gt', 'order', 'limit', 'range', 'insert', 'update', 'delete', 'upsert', 'ilike', 'is', 'match', 'filter', 'returns'].forEach((op) => (chain[op] = rec(op)));
      const resolve = () => {
        if (ops.includes('upsert')) return Promise.resolve({ data: null, error: null });
        if (table === 'user_profiles') return Promise.resolve({ data: state.existingProfile, error: null });
        return Promise.resolve({ data: null, error: null, count: 0 });
      };
      chain.maybeSingle = resolve;
      chain.single = resolve;
      chain.then = (f, r) => resolve().then(f, r);
      return chain;
    };
    const authCall = (name, dflt) => async (...args) => {
      const impl = state.auth[name];
      return impl ? impl(...args) : dflt;
    };
    return {
      from: (t) => {
        state.db++;
        return builder(t);
      },
      rpc: async () => {
        state.db++;
        return { data: null, error: null };
      },
      auth: {
        getUser: async () => state.getUser(),
        verifyOtp: authCall('verifyOtp', { data: { user: null }, error: { code: 'otp_expired', status: 403, message: PROVIDER_TEXT } }),
        exchangeCodeForSession: authCall('exchangeCodeForSession', { data: { user: null }, error: { status: 400, message: PROVIDER_TEXT } }),
        signInWithPassword: authCall('signInWithPassword', { data: { user: null }, error: null }),
        signUp: authCall('signUp', { data: { user: null, session: null }, error: null }),
        resetPasswordForEmail: authCall('resetPasswordForEmail', { data: {}, error: null }),
        updateUser: authCall('updateUser', { data: {}, error: null }),
        signOut: authCall('signOut', { error: null }),
      },
    };
  };
  class RedirectSignal extends Error {
    constructor(url) {
      super(`NEXT_REDIRECT ${url}`);
      this.url = url;
    }
  }
  let sessionOverride = null; // E: lets a test force getServerSession() to a state
  const realSessionPath = path.join(ROOT, 'lib/auth/session.ts');
  const MOCKS = {
    'server-only': {},
    'next/cache': { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn) => fn },
    'next/headers': { cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }), headers: async () => new Map() },
    'next/navigation': {
      redirect: (url) => {
        state.redirects.push(String(url));
        throw new RedirectSignal(String(url));
      },
      notFound: () => {
        throw new Error('NEXT_NOT_FOUND');
      },
      useSearchParams: () => new URLSearchParams(),
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
      usePathname: () => '/',
    },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => makeClient(),
      createAdminServerSupabaseClient: () => makeClient(),
      createPublicServerSupabaseClient: () => makeClient(),
    },
    '@supabase/ssr': { createServerClient: () => makeClient(), createBrowserClient: () => makeClient() },
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
    if (sessionOverride && (request === '@/lib/auth/session' || request === realSessionPath)) {
      return { getServerSession: async () => sessionOverride() };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/settings')) {
      return { ok: true, status: 200, json: async () => ({ disable_signup: state.signupDisabled, mailer_autoconfirm: false }) };
    }
    state.db++;
    throw new Error('network disabled in AUTH-1 offline tests');
  };
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};

  const { NextRequest } = require('next/server');

  // ================= A. Role source =================
  const ra = require(path.join(ROOT, 'lib/auth/require-admin.ts'));
  const U = {
    student: { id: 's', email: 'student@courage-library.test', app_metadata: {}, user_metadata: {} },
    emailOnly: { id: 'e', email: 'admin-by-email@courage-library.test', app_metadata: {}, user_metadata: {} },
    metaAdmin: { id: 'm', email: 'm@courage-library.test', app_metadata: {}, user_metadata: { role: 'admin' } },
    staff: { id: 't', email: 't@courage-library.test', app_metadata: { role: 'staff' }, user_metadata: {} },
    admin: { id: 'a', email: 'a@courage-library.test', app_metadata: { role: 'admin' }, user_metadata: {} },
    bogusRole: { id: 'b', email: 'b@courage-library.test', app_metadata: { role: 'superuser' }, user_metadata: {} },
  };
  await test('A-1 an email listed in ADMIN_EMAILS (no app_metadata role) is NOT admin or staff', () => {
    assert(ra.resolveRole(U.emailOnly) === null, `got ${ra.resolveRole(U.emailOnly)}`);
    assert(ra.resolveRole(U.student) === null, `got ${ra.resolveRole(U.student)}`);
  });
  await test('A-2 app_metadata.role admin / staff still resolve', () => {
    assert(ra.resolveRole(U.admin) === 'admin', 'admin');
    assert(ra.resolveRole(U.staff) === 'staff', 'staff');
  });
  await test('A-3 user_metadata.role and unknown app_metadata roles grant nothing', () => {
    assert(ra.resolveRole(U.metaAdmin) === null, 'user_metadata');
    assert(ra.resolveRole(U.bogusRole) === null, 'unknown role');
  });
  await test('A-4 requireAdmin: email-only match denied (FORBIDDEN), app_metadata admin allowed, anon UNAUTHORIZED', async () => {
    const as = (user) => () => ({ data: { user }, error: user ? null : { name: 'AuthSessionMissingError', status: 400 } });
    const codeOf = async () => {
      try {
        await ra.requireAdmin();
        return 'OK';
      } catch (e) {
        return e.code || e.message;
      }
    };
    state.getUser = as(U.emailOnly);
    assert((await codeOf()) === 'FORBIDDEN', 'email-only');
    state.getUser = as(U.admin);
    assert((await codeOf()) === 'OK', 'admin');
    state.getUser = as(null);
    assert((await codeOf()) === 'UNAUTHORIZED', 'anon');
  });
  await test('A-5 no source file reads ADMIN_EMAILS or grants by email any more', () => {
    const hits = [];
    for (const dir of ['app', 'lib', 'services', 'components', 'middleware.ts']) {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) continue;
      const files = fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
      for (const f of files.filter((x) => /\.(ts|tsx)$/.test(x))) {
        const code = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
        if (/ADMIN_EMAILS|configuredAdminEmails|getConfiguredAdminEmails/.test(code)) hits.push(rel(f));
      }
    }
    assert(hits.length === 0, `still referenced in: ${hits.join(', ')}`);
  });

  // ================= B. Profile insert-only =================
  const { UserProfileService } = require(path.join(ROOT, 'services/user-profile.service.ts'));
  await test('B-1 ensureProfile writes one INSERT … ON CONFLICT DO NOTHING (upsert ignoreDuplicates), never an update', async () => {
    reset();
    state.existingProfile = { id: 'u1', full_name: 'New', is_active: true };
    await UserProfileService.ensureProfile({ id: 'u1', email: 'x@courage-library.test', user_metadata: { full_name: 'New' } });
    assert(state.upserts.length === 1, `upserts ${state.upserts.length}`);
    const { row, opts } = state.upserts[0];
    assert(opts && opts.ignoreDuplicates === true && opts.onConflict === 'id', `opts ${JSON.stringify(opts)}`);
    const keys = Object.keys(row).sort().join(',');
    assert(keys === 'full_name,id,language_preference', `columns written: ${keys}`);
    assert(!state.writes.some((w) => /\.(update|insert|delete)$/.test(w)), `writes ${state.writes.join(',')}`);
  });
  await test('B-2 an edited name and a deactivated profile survive a sign-in (row returned as stored)', async () => {
    reset();
    state.existingProfile = { id: 'u2', full_name: 'Name Edited By Student', is_active: false, language_preference: 'hi' };
    const out = await UserProfileService.ensureProfile({ id: 'u2', email: 'y@courage-library.test', user_metadata: { full_name: 'Provider Name' } });
    assert(out && out.full_name === 'Name Edited By Student', `name ${out && out.full_name}`);
    assert(out.is_active === false, 'is_active flipped');
    assert(state.upserts[0].row.is_active === undefined && state.upserts[0].row.updated_at === undefined, 'is_active / updated_at written');
  });
  await test('B-3 static: ensureProfile has no .update( and no is_active write', () => {
    const src = read('services/user-profile.service.ts');
    const body = src.slice(src.indexOf('static async ensureProfile'), src.indexOf('\n  static ', src.indexOf('static async ensureProfile') + 10) >>> 0 || undefined);
    assert(!/\.update\(/.test(body), 'update() in ensureProfile');
    assert(!/is_active\s*:/.test(body), 'is_active written in ensureProfile');
    assert(/ignoreDuplicates:\s*true/.test(body), 'ignoreDuplicates missing');
  });

  // ================= C. /auth/confirm + /auth/callback =================
  const confirm = require(path.join(ROOT, 'app/auth/confirm/route.ts'));
  const callback = require(path.join(ROOT, 'app/auth/callback/route.ts'));
  const ORIGIN = 'https://app.example.invalid';
  const USER = { id: 'u-confirm', email: 'c@courage-library.test', user_metadata: {} };
  const otp = async ({ token_hash }) => {
    if (token_hash === 'valid-hash') return { data: { user: USER, session: {} }, error: null };
    if (token_hash === 'expired-hash') return { data: { user: null }, error: { code: 'otp_expired', status: 403, message: PROVIDER_TEXT } };
    return { data: { user: null }, error: { code: 'bad_jwt', status: 400, message: PROVIDER_TEXT } };
  };
  const hit = async (mod, qs) => {
    reset();
    state.auth.verifyOtp = otp;
    state.auth.exchangeCodeForSession = async (code) => (code === 'valid-code' ? { data: { user: USER }, error: null } : { data: { user: null }, error: { status: 400, message: PROVIDER_TEXT } });
    const res = await mod.GET(new NextRequest(`${ORIGIN}${mod === confirm ? '/auth/confirm' : '/auth/callback'}?${qs}`));
    const loc = res.headers.get('location') || '';
    return { status: res.status, loc, url: loc ? new URL(loc) : null };
  };
  const expectFail = (r, label) => {
    assert(r.status >= 300 && r.status < 400, `${label}: status ${r.status}`);
    assert(r.url && r.url.origin === ORIGIN && r.url.pathname === '/auth/login' && r.url.search === '?m=link-expired', `${label}: → ${r.loc}`);
    assert(!r.loc.includes('PROVIDER'), `${label}: provider text in redirect`);
  };
  await test('C-1 valid token_hash (signup / email / email_change) → verifyOtp → `next` on this origin + ensureProfile', async () => {
    for (const type of ['signup', 'email', 'email_change']) {
      const r = await hit(confirm, `token_hash=valid-hash&type=${type}&next=%2Fperformance`);
      assert(r.url && r.url.origin === ORIGIN && r.url.pathname === '/performance', `${type}: → ${r.loc}`);
      assert(state.upserts.length === 1, `${type}: ensureProfile not called`);
    }
    const d = await hit(confirm, 'token_hash=valid-hash&type=signup');
    assert(d.url.pathname === '/dashboard', `default → ${d.loc}`);
  });
  await test('C-2 invalid token_hash → /auth/login?m=link-expired (fixed code, no provider text)', async () => {
    expectFail(await hit(confirm, 'token_hash=not-a-real-hash&type=signup&next=%2Fdashboard'), 'invalid');
  });
  await test('C-3 expired token_hash → /auth/login?m=link-expired', async () => {
    expectFail(await hit(confirm, 'token_hash=expired-hash&type=recovery'), 'expired');
  });
  await test('C-4 missing / unknown type, oversize hash, no params, bad legacy code → link-expired', async () => {
    expectFail(await hit(confirm, 'token_hash=valid-hash'), 'no type');
    expectFail(await hit(confirm, 'token_hash=valid-hash&type=magiclink_admin'), 'unknown type');
    expectFail(await hit(confirm, `token_hash=${'a'.repeat(600)}&type=signup`), 'oversize');
    expectFail(await hit(confirm, ''), 'no params');
    expectFail(await hit(confirm, 'code=bogus-code'), 'bad code');
  });
  await test('C-5 recovery always lands on /auth/update-password (next ignored) and creates no profile', async () => {
    for (const next of ['%2Fadmin', 'https%3A%2F%2Fevil.example', '%2Fdashboard']) {
      const r = await hit(confirm, `token_hash=valid-hash&type=recovery&next=${next}`);
      assert(r.url && r.url.origin === ORIGIN && r.url.pathname === '/auth/update-password', `next=${next} → ${r.loc}`);
      assert(state.upserts.length === 0, 'ensureProfile on recovery');
    }
  });
  await test('C-6 open-redirect vectors in `next` never leave the origin (confirm + legacy code + callback)', async () => {
    const vectors = ['//evil.example', 'https://evil.example/x', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', '%2F%2Fevil.example', '/%09/evil.example', ' //evil.example', '///evil.example', 'http:/evil.example', '/%5Cevil.example', 'data:text/html,x'];
    for (const v of vectors) {
      const q = encodeURIComponent(v);
      for (const [mod, qs] of [[confirm, `token_hash=valid-hash&type=signup&next=${q}`], [confirm, `code=valid-code&next=${q}`], [callback, `code=valid-code&next=${q}`]]) {
        const r = await hit(mod, qs);
        assert(r.url && r.url.origin === ORIGIN, `${JSON.stringify(v)} → ${r.loc}`);
        assert(!/evil/i.test(r.url.host) && !/^javascript:|^data:/i.test(r.loc), `${JSON.stringify(v)} → ${r.loc}`);
      }
    }
  });
  await test('C-7 /auth/callback: provider error → ?m=oauth-failed; bad code → ?m=link-expired (no raw text)', async () => {
    const a = await hit(callback, `error=access_denied&error_description=${encodeURIComponent(PROVIDER_TEXT)}`);
    assert(a.url && a.url.pathname === '/auth/login' && a.url.search === '?m=oauth-failed', `→ ${a.loc}`);
    expectFail(await hit(callback, 'code=bogus'), 'callback bad code');
  });
  await test('C-8 sign-up and reset links point at /auth/confirm (emailRedirectTo / redirectTo)', () => {
    const src = read('app/auth/actions.ts');
    assert(/emailRedirectTo:\s*confirmUrl\(/.test(src), 'emailRedirectTo');
    assert(/redirectTo:\s*confirmUrl\("\/auth\/update-password"\)/.test(src), 'reset redirectTo');
    assert(/new URL\("\/auth\/confirm"/.test(src), 'confirmUrl target');
  });

  // ================= D. Messages, no enumeration =================
  const msgs = require(path.join(ROOT, 'lib/auth/messages.ts'));
  await test('D-1 mapAuthError: provider errors → fixed codes; unknown → generic', () => {
    const cases = [
      [{ status: 429 }, 'rate-limited'],
      [{ code: 'over_email_send_rate_limit' }, 'rate-limited'],
      [{ code: 'invalid_credentials' }, 'invalid-credentials'],
      [{ message: 'Invalid login credentials' }, 'invalid-credentials'],
      [{ code: 'email_not_confirmed' }, 'email-not-confirmed'],
      [{ code: 'weak_password' }, 'weak-password'],
      [{ code: 'signup_disabled' }, 'signup-closed'],
      [{ code: 'session_not_found' }, 'session-missing'],
      [{ code: 'email_address_invalid' }, 'invalid-email'],
      [{ message: PROVIDER_TEXT, status: 500 }, 'generic'],
      [null, 'generic'],
    ];
    for (const [err, want] of cases) assert(msgs.mapAuthError(err) === want, `${JSON.stringify(err)} → ${msgs.mapAuthError(err)} (want ${want})`);
    for (const code of Object.keys(msgs.AUTH_ERRORS)) assert(!/supabase|gotrue|postgres/i.test(msgs.AUTH_ERRORS[code]), `${code} mentions a provider`);
  });
  await test('D-2 ?m= allow-list: known codes only; unknown / prototype / free text ignored', () => {
    for (const c of Object.keys(msgs.AUTH_NOTICES)) assert(msgs.authNotice(c) && msgs.authNotice(c).text === msgs.AUTH_NOTICES[c].text, c);
    for (const c of [null, undefined, '', 'toString', '__proto__', 'constructor', 'hasOwnProperty', '<script>alert(1)</script>', 'Your account is locked, call 1800', 'link-expired ', 'LINK-EXPIRED', 42]) {
      assert(msgs.authNotice(c) === null, `${JSON.stringify(c)} rendered`);
    }
  });
  await test('D-3 password rule mirrors the dashboard rule (≥ 8, letters + digits)', () => {
    for (const ok of ['abcdefg1', 'Passw0rdLong', '1234567a']) assert(msgs.isAcceptablePassword(ok), ok);
    for (const bad of ['abc1', 'abcdefgh', '12345678', '', null]) assert(!msgs.isAcceptablePassword(bad), String(bad));
  });

  const actions = require(path.join(ROOT, 'app/auth/actions.ts'));
  const fd = (o) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const run = async (fn, form) => {
    try {
      return { result: await fn(null, fd(form)) };
    } catch (e) {
      if (e instanceof RedirectSignal) return { redirect: e.url };
      throw e;
    }
  };
  await test('D-4 sign-up: new address and already-registered address get IDENTICAL responses', async () => {
    reset();
    state.signupDisabled = false;
    state.auth.signUp = async () => ({ data: { user: { id: 'n', identities: [{}] }, session: null }, error: null });
    const fresh = await run(actions.signupAction, { fullName: 'A', email: 'new@courage-library.test', password: 'abcdefg1' });
    state.auth.signUp = async () => ({ data: { user: null, session: null }, error: { code: 'user_already_exists', status: 422, message: PROVIDER_TEXT } });
    const existing = await run(actions.signupAction, { fullName: 'A', email: 'old@courage-library.test', password: 'abcdefg1' });
    state.auth.signUp = async () => ({ data: { user: { id: 'o', identities: [] }, session: null }, error: null }); // obfuscated "exists" shape
    const obfuscated = await run(actions.signupAction, { fullName: 'A', email: 'old2@courage-library.test', password: 'abcdefg1' });
    const a = JSON.stringify(fresh);
    assert(a === JSON.stringify(existing) && a === JSON.stringify(obfuscated), `differ: ${a} | ${JSON.stringify(existing)} | ${JSON.stringify(obfuscated)}`);
    assert(fresh.result && fresh.result.code === 'check-email', a);
  });
  await test('D-5 reset: existing, unknown and failing addresses get IDENTICAL responses', async () => {
    reset();
    const answers = [];
    for (const res of [{ data: {}, error: null }, { data: null, error: { code: 'user_not_found', status: 404, message: PROVIDER_TEXT } }, { data: null, error: { status: 500, message: PROVIDER_TEXT } }]) {
      state.auth.resetPasswordForEmail = async () => res;
      answers.push(JSON.stringify(await run(actions.forgotPasswordAction, { email: 'who@courage-library.test' })));
    }
    assert(new Set(answers).size === 1, `differ: ${answers.join(' | ')}`);
    assert(answers[0].includes('check-email'), answers[0]);
  });
  await test('D-6 login: wrong password and unknown account give the same code; provider text never returned', async () => {
    reset();
    const answers = [];
    for (const err of [{ code: 'invalid_credentials', status: 400, message: PROVIDER_TEXT }, { code: 'user_not_found', status: 400, message: PROVIDER_TEXT }, { name: 'AuthApiError', status: 400, message: PROVIDER_TEXT }]) {
      state.auth.signInWithPassword = async () => ({ data: { user: null }, error: err });
      answers.push(JSON.stringify(await run(actions.loginAction, { email: 'who@courage-library.test', password: 'abcdefg1' })));
    }
    assert(new Set(answers).size === 1, `differ: ${answers.join(' | ')}`);
    assert(answers[0].includes('invalid-credentials'), answers[0]);
    // Supabase unreachable → "something went wrong", not "incorrect password" (account-independent)
    const outages = [];
    for (const err of [{ name: 'AuthRetryableFetchError', status: 0, message: PROVIDER_TEXT }, { status: 503, message: PROVIDER_TEXT }]) {
      state.auth.signInWithPassword = async () => ({ data: { user: null }, error: err });
      outages.push(JSON.stringify(await run(actions.loginAction, { email: 'who@courage-library.test', password: 'abcdefg1' })));
    }
    assert(outages.every((x) => x.includes('"code":"generic"')), `outage → ${outages.join(' | ')}`);
    assert(!answers.concat(outages).some((x) => x.includes('PROVIDER')), 'provider text returned');
  });
  await test('D-7 sign-up / update-password validate the password rule before calling Supabase', async () => {
    reset();
    let called = 0;
    state.auth.signUp = async () => (called++, { data: {}, error: null });
    state.auth.updateUser = async () => (called++, { data: {}, error: null });
    const s = await run(actions.signupAction, { email: 'x@courage-library.test', password: 'short1' });
    const u = await run(actions.updatePasswordAction, { password: 'abcdefgh', confirmPassword: 'abcdefgh' });
    const m = await run(actions.updatePasswordAction, { password: 'abcdefg1', confirmPassword: 'abcdefg2' });
    assert(s.result.code === 'weak-password' && u.result.code === 'weak-password' && m.result.code === 'password-mismatch', JSON.stringify([s, u, m]));
    assert(called === 0, 'Supabase called with an invalid password');
  });
  await test('D-8 static: auth actions / routes never return or redirect with provider error text', () => {
    for (const f of ['app/auth/actions.ts', 'app/auth/confirm/route.ts', 'app/auth/callback/route.ts']) {
      const src = read(f);
      assert(!/error\??\.message/.test(src), `${f} uses error.message`);
      assert(!/error_description|\?error=|\?message=/.test(src), `${f} forwards provider text`);
    }
    for (const f of walk(path.join(ROOT, 'app/auth')).filter((x) => /page\.tsx$/.test(x))) {
      const src = fs.readFileSync(f, 'utf8');
      assert(!/searchParams\??\.get\(\s*["'](error|message|error_description)["']/.test(src), `${rel(f)} renders a free-text query param`);
    }
  });
  await test('D-9 sign-up closed (server setting) → honest "Registrations open soon" page, no form; open → form', async () => {
    const signupPage = require(path.join(ROOT, 'app/auth/signup/page.tsx'));
    const { SignupForm } = require(path.join(ROOT, 'app/auth/signup/signup-form.tsx'));
    const find = (el, pred) => {
      if (!el || typeof el !== 'object') return false;
      if (Array.isArray(el)) return el.some((x) => find(x, pred));
      if (pred(el)) return true;
      return find(el.props && el.props.children, pred);
    };
    state.signupDisabled = true;
    const closed = await signupPage.default();
    assert(find(closed, (e) => e.props && Object.prototype.hasOwnProperty.call(e.props, 'data-signup-closed')), 'closed marker missing');
    assert(!find(closed, (e) => e.type === SignupForm), 'form rendered while closed');
    assert(find(closed, (e) => e.type === 'h1' && /Registrations open soon/.test(String(e.props.children))), 'heading');
    state.signupDisabled = false;
    process.env.AUTH_SIGNUP_ENABLED = 'false';
    const forced = await signupPage.default();
    assert(!find(forced, (e) => e.type === SignupForm), 'AUTH_SIGNUP_ENABLED=false ignored');
    delete process.env.AUTH_SIGNUP_ENABLED;
    const open = await signupPage.default();
    assert(open.type === SignupForm, 'form not rendered while open');
    reset();
    state.signupDisabled = true;
    let called = 0;
    state.auth.signUp = async () => (called++, { data: {}, error: null });
    const r = await run(actions.signupAction, { email: 'x@courage-library.test', password: 'abcdefg1' });
    assert(r.result.code === 'signup-closed' && called === 0, JSON.stringify(r));
    state.signupDisabled = false;
  });

  // ================= E. Session helper =================
  const ss = require(path.join(ROOT, 'lib/auth/session-state.ts'));
  await test('E-1 tri-state classification (user / none / error)', async () => {
    const c = (getUser) => ss.getSessionState({ auth: { getUser } });
    assert((await c(async () => ({ data: { user: { id: 1 } }, error: null }))).state === 'user', 'user');
    assert((await c(async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' } }))).state === 'none', 'missing');
    assert((await c(async () => ({ data: { user: null }, error: { name: 'AuthApiError', status: 403, code: 'bad_jwt', message: 'invalid JWT' } }))).state === 'none', 'bad jwt');
    assert((await c(async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } }))).state === 'error', 'retryable');
    assert((await c(async () => ({ data: { user: null }, error: { name: 'AuthApiError', status: 503, message: 'x' } }))).state === 'error', '503');
    assert((await c(async () => ({ data: null, error: { message: 'x', cause: { message: 'connect ETIMEDOUT' } } }))).state === 'error', 'cause');
    assert((await c(async () => { throw new TypeError('fetch failed'); })).state === 'error', 'thrown');
  });
  // feature-gated pages (notFound when a flag is off) are exercised with every flag on
  const { FEATURE_ENV } = require(path.join(ROOT, 'config/features.ts'));
  for (const k of Object.values(FEATURE_ENV)) process.env[k] = 'true';
  const SU = require(path.join(ROOT, 'components/auth/session-unavailable.tsx'));
  const PAGES = [
    ['app/dashboard/page.tsx', {}],
    ['app/performance/page.tsx', {}],
    ['app/achievements/page.tsx', {}],
    ['app/certificates/page.tsx', {}],
    // app/premium/page.tsx removed by UX-2b (/premium → 308 /pricing)
    ['app/store/page.tsx', {}],
    ['app/wallet/page.tsx', {}],
    ['app/mock-tests/[id]/take/page.tsx', { id: 'm-1' }],
    ['app/live-tests/[slug]/take/page.tsx', { slug: 'l-1' }],
    ['app/live-tests/[slug]/result/page.tsx', { slug: 'l-1' }],
  ];
  await test(`E-2 simulated Supabase failure → retry UI, no redirect, no data (${PAGES.length} guarded pages)`, async () => {
    sessionOverride = () => ({ state: 'error' });
    const bad = [];
    try {
      for (const [file, params] of PAGES) {
        reset();
        let el;
        try {
          const mod = require(path.join(ROOT, file));
          el = await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
        } catch (e) {
          bad.push(`${file}: threw ${e instanceof RedirectSignal ? 'redirect ' + e.url : e.message}`);
          continue;
        }
        if (!el || el.type !== SU.SessionUnavailable) bad.push(`${file}: rendered ${el && (el.type && (el.type.name || el.type))}`);
        if (state.redirects.length) bad.push(`${file}: redirect ${state.redirects.join(',')}`);
        if (state.db) bad.push(`${file}: ${state.db} data call(s)`);
      }
    } finally {
      sessionOverride = null;
    }
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('E-3 the same pages still redirect a signed-out visitor to login (state none)', async () => {
    sessionOverride = () => ({ state: 'none' });
    const bad = [];
    try {
      for (const [file, params] of PAGES) {
        reset();
        try {
          await require(path.join(ROOT, file)).default({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
          bad.push(`${file}: no redirect`);
        } catch (e) {
          if (!(e instanceof RedirectSignal) || !e.url.startsWith('/auth/login')) bad.push(`${file}: ${e.message}`);
        }
        if (state.db) bad.push(`${file}: ${state.db} data call(s)`);
      }
    } finally {
      sessionOverride = null;
    }
    assert(bad.length === 0, bad.join('\n        '));
  });
  await test('E-4 admin guards fail closed on a Supabase failure (deny; page guard → /auth/unavailable, not login)', async () => {
    state.getUser = () => {
      throw new TypeError('fetch failed');
    };
    let code = 'OK';
    try {
      await ra.requireAdmin();
    } catch (e) {
      code = e.code;
    }
    assert(code === 'UNAUTHORIZED', `requireAdmin → ${code}`);
    reset();
    let target = null;
    try {
      await ra.requireAdminPage({ path: '/admin/syllabus' });
    } catch (e) {
      target = e instanceof RedirectSignal ? e.url : `threw ${e.message}`;
    }
    assert(target && target.startsWith('/auth/unavailable?next='), `requireAdminPage → ${target}`);
    assert(decodeURIComponent(target.split('next=')[1]) === '/admin/syllabus', target);
    state.getUser = () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } });
    code = 'OK';
    try {
      await ra.requireAdmin();
    } catch (e) {
      code = e.code;
    }
    assert(code === 'UNAUTHORIZED', `requireAdmin (returned error) → ${code}`);
  });
  await test('E-5 middleware: Supabase failure does not send an admin page to login; signed-out still does', async () => {
    const { updateSession } = require(path.join(ROOT, 'lib/supabase/middleware.ts'));
    state.getUser = () => {
      throw new TypeError('fetch failed');
    };
    const err = await updateSession(new NextRequest('http://localhost:3100/admin/syllabus'));
    assert(!err.headers.get('location'), `error → ${err.headers.get('location')}`);
    state.getUser = () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } });
    const none = await updateSession(new NextRequest('http://localhost:3100/admin/syllabus'));
    const loc = none.headers.get('location') || '';
    assert(/\/auth\/login\?next=%2Fadmin%2Fsyllabus$/.test(loc), `none → ${loc}`);
  });
  await test('E-6 shell + guards use the shared helper; retry UI is a design-system component', () => {
    const shell = read('components/shell/app-shell.tsx');
    assert(/classifyAuthResult/.test(shell) && /SessionUnavailableBanner/.test(shell), 'app shell not tri-state');
    for (const [file] of PAGES) {
      const src = read(file);
      assert(/getServerSession\(\)/.test(src) && /state === "error"\) return <SessionUnavailable/.test(src), `${file} not migrated`);
    }
    const su = read('components/auth/session-unavailable.tsx');
    assert(/@\/components\/ui\//.test(su) && /role="status"/.test(su), 'retry UI not built from the design system');
    assert(/Connection problem/.test(su) && /try again/i.test(su), 'retry copy');
  });

  // ================= F. Ratchet =================
  await test(`F-1 ratchet: raw auth.getUser() call sites outside the helper ≤ ${RATCHET_BASELINE}`, () => {
    const { count, sites } = countRawGetUser();
    assert(count <= RATCHET_BASELINE, `${count} > baseline ${RATCHET_BASELINE} — use getServerSession() / getSessionState() instead. New: ${sites.slice(-5).join(', ')}`);
    if (count < RATCHET_BASELINE) lines.push(`        note: ${count} < baseline ${RATCHET_BASELINE} — lower RATCHET_BASELINE in scripts/test_auth1.cjs`);
  });
}

/**
 * Raw `auth.getUser()` call sites (code lines, comments excluded) in app/ components/ lib/ services/, excluding
 * the tri-state helper itself and the app shell (which classifies its single call with classifyAuthResult).
 * AUTH-1 Stage 2a baseline after migrating the page guards, middleware and admin guards. May only go down.
 */
const RATCHET_BASELINE = 70;
const RATCHET_EXEMPT = new Set(['lib/auth/session-state.ts', 'components/shell/app-shell.tsx']);
function countRawGetUser() {
  const sites = [];
  for (const dir of ['app', 'components', 'lib', 'services']) {
    for (const f of walk(path.join(ROOT, dir)).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const r = rel(f);
      if (RATCHET_EXEMPT.has(r)) continue;
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
        if (/auth\.getUser\(\)/.test(line)) sites.push(`${r}:${i + 1}`);
      });
    }
  }
  return { count: sites.length, sites };
}

// ================= L. Live =================
async function live() {
  const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
  const host = BASE ? new URL(BASE).hostname : '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) throw new Error('--live needs BASE_URL on a local host (run via scripts/live/with-server.cjs)');
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
  const { readEnv } = require('./db/_db-env.cjs');
  const env = readEnv();
  const { createClient } = require('@supabase/supabase-js');
  const { chromium } = require('playwright');
  const { findUserByEmail } = require('./e2e/find-user.cjs');
  const admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const QA_STUDENT = 'qa-student@courage-library.test';
  const get = (p) => fetch(BASE + p, { redirect: 'manual', signal: AbortSignal.timeout(60000) });
  const locOf = (res) => {
    const l = res.headers.get('location');
    return l ? new URL(l, BASE) : null;
  };
  const freshHash = async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: QA_STUDENT });
    if (error || !data || !data.properties || !data.properties.hashed_token) throw new Error(`generateLink failed (${error && error.status})`);
    return data.properties.hashed_token;
  };
  const profileName = async () => {
    // errors surface as-is (a network failure must not read as "qa-student missing")
    const u = await findUserByEmail(admin, QA_STUDENT);
    if (!u) throw new Error('qa-student missing');
    const { data, error } = await admin.from('user_profiles').select('full_name,is_active').eq('id', u.id).maybeSingle();
    if (error) throw new Error(`user_profiles read failed (${error.code || error.message})`);
    return data;
  };

  await test('L-1 /auth/confirm with a bogus token_hash → /auth/login?m=link-expired', async () => {
    const res = await get('/auth/confirm?token_hash=0000deadbeef0000deadbeef0000deadbeef0000deadbeef00000000&type=signup&next=%2Fdashboard');
    const l = locOf(res);
    assert(res.status >= 300 && res.status < 400 && l && l.pathname === '/auth/login' && l.search === '?m=link-expired', `${res.status} → ${l}`);
  });
  const before = await profileName();
  await test('L-2 valid token_hash (generated, no email sent) → signed in, lands on sanitized `next`; reuse → link-expired', async () => {
    const hash = await freshHash();
    const res = await get(`/auth/confirm?token_hash=${hash}&type=email&next=%2Fperformance`);
    const l = locOf(res);
    assert(res.status >= 300 && res.status < 400 && l && l.origin === new URL(BASE).origin && l.pathname === '/performance', `${res.status} → ${l && l.pathname}`);
    const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).filter((c) => /sb-[^=]*-auth-token/.test(c));
    assert(cookies.length > 0, 'no session cookie set');
    const again = await get(`/auth/confirm?token_hash=${hash}&type=email&next=%2Fperformance`);
    const l2 = locOf(again);
    assert(l2 && l2.pathname === '/auth/login' && l2.search === '?m=link-expired', `reuse → ${l2}`);
  });
  await test('L-3 open redirect with a VALID token_hash stays on this origin', async () => {
    for (const v of ['//evil.example', 'https://evil.example/x', '/\\evil.example']) {
      const hash = await freshHash();
      const res = await get(`/auth/confirm?token_hash=${hash}&type=email&next=${encodeURIComponent(v)}`);
      const l = locOf(res);
      assert(l && l.origin === new URL(BASE).origin, `${JSON.stringify(v)} → ${l && l.host}`);
    }
  });
  await test('L-4 the confirm sign-in did not overwrite the stored profile (insert-only)', async () => {
    const after = await profileName();
    assert(before && after && before.full_name === after.full_name && before.is_active === after.is_active, 'profile changed by sign-in');
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    const loginAt = async (q) => {
      await page.goto(`${BASE}/auth/login${q}`, { waitUntil: 'load', timeout: 120000 });
      await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 120000 });
    };
    await test('L-5 ?m= allow-listed code renders its fixed text; unknown code / free text / ?error= render nothing', async () => {
      await loginAt('?m=link-expired');
      const n = await page.locator('[data-auth-notice]').allInnerTexts();
      assert(n.length === 1 && /invalid or has expired/.test(n[0]), `notice ${JSON.stringify(n)}`);
      for (const q of ['?m=hacked-by-someone', '?m=__proto__', `?m=${encodeURIComponent('<b>Call 1800 now</b>')}`, '?error=Call+1800+now&message=Call+1800+now&error_description=Call+1800+now']) {
        await loginAt(q);
        const cnt = await page.locator('[data-auth-notice],[data-auth-error]').count();
        const body = await page.locator('body').innerText();
        assert(cnt === 0 && !/1800|hacked/i.test(body), `${q}: ${cnt} message(s)`);
      }
    });
    await test('L-6 login: wrong password for a real account and an unknown account show the same fixed error', async () => {
      const errFor = async (email) => {
        await loginAt('');
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', 'wrongpass1');
        await page.locator('button[type="submit"]').first().click();
        const el = page.locator('[data-auth-error]').first();
        await el.waitFor({ state: 'visible', timeout: 60000 });
        return [await el.getAttribute('data-auth-error'), await el.innerText()];
      };
      const a = await errFor(QA_STUDENT);
      const b = await errFor('nobody-auth1@example.test');
      // CI-FIX-1 (#74): with Supabase CAPTCHA on, both answers are the fixed captcha code instead — still identical
      assert(JSON.stringify(a) === JSON.stringify(b) && ['invalid-credentials', 'captcha-failed', 'captcha-required'].includes(a[0]), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    });
    await test('L-7 (NEGATIVE, CI-FIX-1 #74) login form under CAPTCHA: field names unchanged, a fixed captcha code is shown, `next` is not followed', async () => {
      // Supabase CAPTCHA is ON: the form cannot sign in from a test (never solved / bypassed). A fixed dummy password —
      // never a real one. Signed-in behaviour is covered with CAPTCHA-safe QA sessions (scripts/live/qa-session.cjs).
      await loginAt('?next=%2Fperformance');
      await page.fill('input[name="email"]', QA_STUDENT);
      await page.fill('input[name="password"]', 'not-the-password-1');
      await page.locator('button[type="submit"]').first().click();
      const el = page.locator('[data-auth-error]').first();
      await el.waitFor({ state: 'visible', timeout: 60000 });
      const code = await el.getAttribute('data-auth-error');
      assert(['captcha-failed', 'captcha-required'].includes(code), `code ${code}`);
      assert(new URL(page.url()).pathname === '/auth/login', `moved to ${new URL(page.url()).pathname}`);
    });
    await test('L-8 /auth/unavailable renders the retry UI with a sanitized retry link', async () => {
      await page.goto(`${BASE}/auth/unavailable?next=${encodeURIComponent('//evil.example')}`, { waitUntil: 'load', timeout: 120000 });
      const box = page.locator('[data-session-unavailable]').first();
      await box.waitFor({ state: 'visible', timeout: 60000 });
      const href = await box.locator('a').first().getAttribute('href');
      assert(href === '/', `retry href ${href}`);
    });
  } finally {
    await browser.close();
  }
}

// ================= R. Resilience (Supabase blackholed in the server process) =================
/**
 * Run ONLY as:  AUTH1_BLACKHOLE=<refuse|hang> NODE_OPTIONS="--require ./scripts/live/supabase-blackhole.cjs"
 *               node scripts/live/with-server.cjs -- "node scripts/test_auth1.cjs --resilience=<refuse|hang>"
 * The preload makes every Supabase fetch of the LOCAL server fail at once (refuse) or never answer (hang). The visitor
 * presents a well-formed but never-validated session cookie (fake token; it is never sent anywhere: the blackhole
 * intercepts it), so every guard takes the "could not ask Supabase" path. No network is needed.
 */
const RES_MAX_MS = 20000; // middleware + page + shell auth reads, each ≤ AUTH_FETCH_TIMEOUT_MS (5 s)
async function resilience(mode) {
  const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) throw new Error('--resilience needs BASE_URL on a local host (run via scripts/live/with-server.cjs)');
  if (!['refuse', 'hang'].includes(mode)) throw new Error('--resilience=refuse|hang');
  const { readEnv } = require('./db/_db-env.cjs');
  const env = readEnv();
  const ref = new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
  const b64u = (s) => Buffer.from(s).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const fakeUser = { id: '00000000-0000-4000-8000-0000000a0711', aud: 'authenticated', role: 'authenticated', email: 'resilience@example.test', app_metadata: { role: 'admin' }, user_metadata: {} };
  const fakeJwt = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub: fakeUser.id, aud: 'authenticated', role: 'authenticated', exp: now + 3600 }))}.${b64u('not-a-signature')}`;
  const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'not-a-refresh-token', user: fakeUser };
  const COOKIE = `sb-${ref}-auth-token=base64-${b64u(JSON.stringify(session))}`;
  const STACK = /\bat [\w.<>]+ \(|node_modules|\.next[\\/]server|fetch failed|ECONNREFUSED|AuthRetryableFetchError|blackhole|TypeError:/;

  const timed = async (method, p, { cookie = true, body } = {}) => {
    const started = Date.now();
    const headers = { accept: p.startsWith('/api/') ? 'application/json' : 'text/html' };
    if (cookie) headers.cookie = COOKIE;
    if (body) headers['content-type'] = 'application/json';
    try {
      const res = await fetch(BASE + p, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(RES_MAX_MS + 10000) });
      const text = await res.text();
      return { p, status: res.status, location: res.headers.get('location') || '', text, ms: Date.now() - started };
    } catch (e) {
      return { p, status: 0, location: '', text: '', ms: Date.now() - started, err: e.name };
    }
  };
  const TARGETS = [
    ['GET', '/', { cookie: false }, 'public page'],
    ['GET', '/', {}, 'public page + session cookie'],
    ['GET', '/dashboard', {}, 'student page'],
    ['GET', '/wallet', {}, 'student page'],
    ['GET', '/store', {}, 'student page'],
    ['GET', '/admin', {}, 'admin page'],
    ['GET', '/admin/syllabus', {}, 'admin page'],
    ['GET', '/api/admin/current-affairs/articles', {}, 'admin API'],
    ['POST', '/api/store/redeem', { body: JSON.stringify({ rewardId: 'x' }) }, 'student API'],
    ['GET', '/auth/signup', { cookie: false }, 'auth page'],
  ];
  const results = [];
  for (let round = 0; round < 6; round++) {
    // 10 concurrent requests per round, 6 rounds = 60 requests
    results.push(...(await Promise.all(TARGETS.map(([m, p, o, kind]) => timed(m, p, o).then((r) => ({ ...r, kind, round }))))));
  }
  const fmt = (rs) => rs.map((r) => `${r.p} ${r.status}${r.location ? ' → ' + r.location : ''} ${r.ms}ms${r.err ? ' ' + r.err : ''}`).slice(0, 4).join('; ');

  await test(`R-1 [${mode}] ${results.length} requests across public / student / admin pages, admin + student API: all answered within ${RES_MAX_MS / 1000} s`, () => {
    const bad = results.filter((r) => r.status === 0 || r.ms > RES_MAX_MS);
    const max = Math.max(...results.map((r) => r.ms));
    assert(bad.length === 0, `${bad.length} unanswered / slow: ${fmt(bad)}`);
    lines.push(`        slowest ${max} ms`);
  });
  await test(`R-2 [${mode}] no response contains a stack trace or provider error text`, () => {
    const bad = results.filter((r) => STACK.test(r.text));
    assert(bad.length === 0, `${bad.length}: ${fmt(bad)} — ${bad[0] && (bad[0].text.match(STACK) || [''])[0]}`);
  });
  await test(`R-3 [${mode}] student pages: "Connection problem" retry UI, 200, no redirect (to login or anywhere), no student data`, () => {
    const rs = results.filter((r) => r.kind === 'student page');
    const bad = rs.filter((r) => r.status !== 200 || r.location || !/data-session-unavailable/.test(r.text) || !/Connection problem/.test(r.text));
    assert(rs.length >= 18 && bad.length === 0, `${bad.length}/${rs.length}: ${fmt(bad)}`);
    // the visitor's identity never reaches the HTML (nothing was loaded for them)
    assert(!rs.some((r) => r.text.includes('resilience@example.test') || r.text.includes(fakeUser.id)), 'user identity rendered');
  });
  await test(`R-4 [${mode}] admin pages: denied → /auth/unavailable?next=<admin path>, never login, never rendered`, () => {
    const rs = results.filter((r) => r.kind === 'admin page');
    const bad = rs.filter((r) => !(r.status >= 300 && r.status < 400) || !/^\/auth\/unavailable\?next=%2Fadmin/.test(r.location.replace(BASE, '')));
    assert(rs.length >= 12 && bad.length === 0, `${bad.length}/${rs.length}: ${fmt(bad)}`);
  });
  await test(`R-5 [${mode}] APIs fail closed: admin API 401, student API 401 (no data, JSON only)`, () => {
    const rs = results.filter((r) => r.kind === 'admin API' || r.kind === 'student API');
    const bad = rs.filter((r) => r.status !== 401 || !/^\s*\{/.test(r.text));
    assert(rs.length >= 12 && bad.length === 0, `${bad.length}/${rs.length}: ${fmt(bad)}`);
  });
  await test(`R-6 [${mode}] public pages render (200); the signed-in visitor sees the "couldn't check your sign-in" banner, not a login redirect`, () => {
    const anon = results.filter((r) => r.kind === 'public page' || r.kind === 'auth page');
    const withCookie = results.filter((r) => r.kind === 'public page + session cookie');
    const bad = anon.concat(withCookie).filter((r) => r.status !== 200);
    assert(bad.length === 0, `${bad.length}: ${fmt(bad)}`);
    assert(withCookie.every((r) => /couldn(&#x27;|')t check your sign-in/.test(r.text)), 'banner missing for the signed-in visitor');
    assert(anon.filter((r) => r.p === '/').every((r) => !/couldn(&#x27;|')t check your sign-in/.test(r.text)), 'banner shown to an anonymous visitor');
  });

  // server action: the real login form (useActionState → loginAction → signInWithPassword, blackholed)
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await test(`R-7 [${mode}] server action (login × 3): fixed "something went wrong" code, no "incorrect password", stays on the page`, async () => {
      for (let i = 0; i < 3; i++) {
        await page.goto(`${BASE}/auth/login`, { waitUntil: 'load', timeout: 60000 });
        await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 60000 });
        await page.fill('input[name="email"]', 'resilience@example.test');
        await page.fill('input[name="password"]', 'abcdefg1');
        const started = Date.now();
        await page.locator('button[type="submit"]').first().click();
        const el = page.locator('[data-auth-error]').first();
        await el.waitFor({ state: 'visible', timeout: RES_MAX_MS });
        const code = await el.getAttribute('data-auth-error');
        const text = await el.innerText();
        assert(code === 'generic' && !/incorrect/i.test(text) && !STACK.test(text), `attempt ${i + 1}: ${code} / ${text}`);
        assert(new URL(page.url()).pathname === '/auth/login', `moved to ${page.url()}`);
        assert(Date.now() - started <= RES_MAX_MS, `took ${Date.now() - started} ms`);
      }
    });
  } finally {
    await browser.close();
  }
  await test(`R-8 [${mode}] the server is still up and serving at the end`, async () => {
    const r = await timed('GET', '/auth/login', { cookie: false });
    assert(r.status === 200, `GET /auth/login → ${r.status} ${r.err || ''}`);
  });
}

(async () => {
  const resMode = [...ARGS].find((a) => a.startsWith('--resilience'));
  if (resMode) {
    await resilience(resMode.split('=')[1]);
    console.log(`AUTH-1 Stage 2a resilience gate (${resMode.split('=')[1]})`);
    console.log(lines.join('\n'));
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
  if (ARGS.has('--count')) {
    const { count, sites } = countRawGetUser();
    console.log(`raw auth.getUser() call sites: ${count}`);
    if (ARGS.has('--list')) sites.forEach((s) => console.log(`  ${s}`));
    return;
  }
  if (LIVE) await live();
  else await offline();
  console.log(`AUTH-1 Stage 2a ${LIVE ? 'live' : 'offline'} gate`);
  console.log(lines.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`AUTH-1 gate crashed: ${e && e.message}`);
  process.exit(2);
});
