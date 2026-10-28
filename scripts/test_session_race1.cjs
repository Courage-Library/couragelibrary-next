#!/usr/bin/env node
/**
 * SESSION-RACE-1 — offline gate (no network: an in-process fake Supabase Auth with refresh-token rotation).
 * Parallel admin loaders with an EXPIRED access token raced the sign-in refresh (one client each, the same refresh
 * token; the losers read as signed out → "Unauthorized" on the first load).
 *   R-01 the race, reproduced with one @supabase/ssr client per loader (the old wiring): 5 refreshes with one token;
 *        the losers are classified "error" (retry), never "none" (signed out)
 *   R-02 the fix: ONE client per request → 5 parallel loaders = ONE refresh, every loader sees the user
 *   R-03 the middleware: a request whose refresh was lost to a parallel request keeps the browser's cookies (nothing
 *        cleared, no login redirect for /admin); a won refresh sets the rotated cookies; a revoked session → login
 *   S-01 source: createServerSupabaseClient is per-request (React cache) and the only SSR session factory besides the
 *        middleware; the guards read the session through it
 * Run: node scripts/test_session_race1.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

// ---------- the fake Supabase Auth (refresh-token rotation, no reuse interval: the strictest case)
const URL_ = 'http://fake.supabase.test';
const COOKIE = 'sb-fake-auth-token';
const USER = { id: '00000000-0000-4000-8000-0000000000aa', aud: 'authenticated', role: 'authenticated', email: 'qa-admin@courage-library.test', app_metadata: { role: 'admin' }, user_metadata: {} };
let auth;
function resetAuth(opts = {}) {
  auth = { live: new Map([['rt-1', 'at-1']]), used: new Set(), revoked: !!opts.revoked, refreshCalls: 0, n: 1 };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fakeFetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url);
  if (u.origin !== URL_) throw new Error(`unexpected fetch ${u.origin}`);
  await sleep(25); // a real round trip: parallel callers overlap
  if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token') {
    auth.refreshCalls++;
    const rt = JSON.parse(init.body).refresh_token;
    if (auth.revoked) return json(400, { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
    if (auth.used.has(rt)) return json(400, { code: 'refresh_token_already_used', error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' });
    if (!auth.live.has(rt)) return json(400, { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
    auth.used.add(rt);
    auth.live.delete(rt);
    auth.n++;
    const at = `at-${auth.n}`;
    auth.live.set(`rt-${auth.n}`, at);
    return json(200, { access_token: jwt(at), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `rt-${auth.n}`, user: USER });
  }
  if (u.pathname === '/auth/v1/user') {
    const bearer = (new Headers(init.headers).get('authorization') || '').replace(/^Bearer /, '');
    const tag = JSON.parse(Buffer.from(bearer.split('.')[1] || '', 'base64url').toString() || '{}').tag;
    return [...auth.live.values()].includes(tag) && tag !== 'at-1' ? json(200, USER) : json(401, { code: 'bad_jwt', msg: 'invalid JWT' });
  }
  throw new Error(`unexpected fetch ${u.pathname}`);
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (tag, exp = Math.floor(Date.now() / 1000) + 3600) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, exp, tag, role: 'authenticated' })}.sig`;
const expiredSessionCookie = () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  return 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt('at-1', past), token_type: 'bearer', expires_in: 3600, expires_at: past, refresh_token: 'rt-1', user: USER })).toString('base64url');
};
const sessionOf = (cookieValue) => JSON.parse(Buffer.from(cookieValue.replace(/^base64-/, ''), 'base64url').toString());

process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';
global.fetch = fakeFetch; // authTimeoutFetch (lib/supabase/auth-fetch) calls the global fetch
// Node 20 has no WebSocket; supabase-js builds a realtime client at construction (never connected here)
if (typeof global.WebSocket === 'undefined') global.WebSocket = class WebSocket { constructor() { throw new Error('no realtime in this gate'); } };

const { createServerClient } = require(path.join(ROOT, 'node_modules/@supabase/ssr'));
const { getSessionState } = require(path.join(ROOT, 'lib/auth/session-state.ts'));
const { authTimeoutFetch } = require(path.join(ROOT, 'lib/supabase/auth-fetch.ts'));
/** A server client exactly as lib/supabase/server.ts builds it, over a fake request cookie store. */
const serverClient = (jar) => createServerClient(URL_, 'fake-anon-key', {
  global: { fetch: authTimeoutFetch },
  cookies: { getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })), setAll: () => {} /* ignored in Server Components */ },
});
const LOADERS = 5;

test('R-01 the race (one client per loader, the old wiring): 5 parallel loaders refresh with ONE refresh token; the losers are a retry ("error"), never signed out ("none")', async () => {
  resetAuth();
  const jar = new Map([[COOKIE, expiredSessionCookie()]]);
  const states = await Promise.all(Array.from({ length: LOADERS }, () => getSessionState(serverClient(jar))));
  const count = (s) => states.filter((x) => x.state === s).length;
  assert(auth.refreshCalls === LOADERS, `refresh calls ${auth.refreshCalls}`);
  assert(count('user') === 1 && count('error') === LOADERS - 1 && count('none') === 0, `states: ${states.map((s) => s.state)}`);
  return `${auth.refreshCalls} refreshes → 1 user + ${count('error')} retry, 0 signed out`;
});

test('R-02 the fix (ONE client per request): 5 parallel loaders = ONE refresh; every loader sees the user', async () => {
  resetAuth();
  const jar = new Map([[COOKIE, expiredSessionCookie()]]);
  const shared = serverClient(jar);
  const states = await Promise.all(Array.from({ length: LOADERS }, () => getSessionState(shared)));
  assert(auth.refreshCalls === 1 && states.every((s) => s.state === 'user' && s.user.id === USER.id), `refresh calls ${auth.refreshCalls}; states ${states.map((s) => s.state)}`);
  // and a later loader in the same request does not refresh again
  const late = await getSessionState(shared);
  assert(late.state === 'user' && auth.refreshCalls === 1, 'a later loader reuses the refreshed session');
  return `1 refresh for ${LOADERS} loaders`;
});

test('R-03 middleware: a lost refresh race keeps the browser cookies (nothing cleared, no /admin login redirect); a won refresh sets the rotated cookies; a revoked session → login', async () => {
  const { NextRequest } = require(path.join(ROOT, 'node_modules/next/server'));
  const { updateSession } = require(path.join(ROOT, 'lib/supabase/middleware.ts'));
  const req = (cookie) => new NextRequest(`http://localhost:3100/admin/taxonomy`, { headers: { cookie: `${COOKIE}=${cookie}` } });
  const authCookies = (res) => res.cookies.getAll().filter((c) => c.name.startsWith(COOKIE));

  // two parallel page requests from one tab carry the same expired session
  resetAuth();
  const cookie = expiredSessionCookie();
  const [a, b] = await Promise.all([updateSession(req(cookie)), updateSession(req(cookie))]);
  const [won, lost] = authCookies(a).length ? [a, b] : [b, a];
  const set = authCookies(won);
  assert(auth.refreshCalls === 2 && set.length === 1 && set[0].value && sessionOf(set[0].value).refresh_token === 'rt-2', `the winner sets the rotated session: ${JSON.stringify(set.map((c) => c.name))}`);
  assert(authCookies(lost).length === 0 && !lost.headers.get('location'), `the loser clears nothing and does not redirect: ${JSON.stringify({ cookies: authCookies(lost), location: lost.headers.get('location') })}`);

  // a genuinely revoked session is still a sign-out: /admin → login
  resetAuth({ revoked: true });
  const r = await updateSession(req(expiredSessionCookie()));
  assert(/\/auth\/login\?next=%2Fadmin%2Ftaxonomy$/.test(r.headers.get('location') || ''), `revoked → login (${r.headers.get('location')})`);
  return 'race kept, rotation set, revoked → login';
});

test('S-01 source: one session client per request (React cache); the only other SSR client is the middleware; guards read the session through it; cookie writes buffered in the middleware; one browser client per tab', async () => {
  const server = read('lib/supabase/server.ts');
  assert(/import \{ cache \} from "react";/.test(server) && /export async function createServerSupabaseClient\(\): Promise<SupabaseClient<Database>> \{\s*return requestSupabaseClient\(\);\s*\}/.test(server) && /const requestSupabaseClient = cache\(createRequestSupabaseClient\);/.test(server), 'per-request client');
  const all = require('child_process').execFileSync('git', ['grep', '-l', 'createServerClient', '--', 'lib', 'app', 'services', 'components', 'middleware.ts'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').sort();
  assert(JSON.stringify(all) === JSON.stringify(['lib/supabase/middleware.ts', 'lib/supabase/server.ts']), `other SSR session clients: ${all}`);
  const guard = read('lib/auth/require-admin.ts');
  assert((guard.match(/supabase = await createServerSupabaseClient\(\);\n\s+session = await getSessionState/g) || []).length === 2, 'requireAdmin + requireAdminPage use the per-request client');
  const mw = read('lib/supabase/middleware.ts');
  assert(/setAll\(cookiesToSet: CookieToSet\[\]\) \{\n\s+pendingCookies = cookiesToSet;/.test(mw) && /if \(toSet && session\.state !== "error"\)/.test(mw), 'middleware buffers cookie writes until the session is classified');
  const browser = read('lib/supabase/client.ts');
  assert(/let browserClient: AppSupabaseClient \| null = null;/.test(browser) && /if \(browserClient\) return browserClient;/.test(browser), 'one browser client per tab (auth-js navigator.locks single-flights its refresh across tabs)');
  return 'server: per request · browser: per tab';
});

(async () => {
  let passed = 0;
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      const info = await fn();
      passed++;
      console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${String(e && e.stack ? e.stack : e).slice(0, 900)}`);
    }
  }
  console.log(`\nSESSION-RACE-1 offline: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
