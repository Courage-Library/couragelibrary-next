#!/usr/bin/env node
/**
 * AUTH-1 2b-1 gate — Sign in with Google (decision #66), flag default OFF.
 * Offline (default; deterministic, no network): T-01 … T-13
 *   T-01 flag off → login page: no GIS script, no Google button; middleware mints nothing
 *   T-02 flag on → script + button; the client gets a 64-hex nonce HASH that is not the raw value (raw never in props)
 *   T-03 sha256(raw) === hashedHex
 *   T-04 nonce cookie: HttpOnly, SameSite=Lax, Path=/, Max-Age=600, Secure in production; minted only for /auth/login
 *        (an existing valid nonce is reused, never replaced) and forwarded on the request
 *   T-05 consumeNonce deletes the cookie; a second consume → null
 *   T-06 action with the flag off → google-disabled; Supabase not called
 *   T-07 malformed credentials → google-failed; Supabase not called
 *   T-08 missing nonce cookie → google-nonce; Supabase not called
 *   T-09 error mapping → fixed codes; provider text never in the result or the server log; credential / nonce never logged
 *   T-10 success → insert-only profile + safe redirect (external / protocol-relative next → /dashboard); nonce single use
 *   T-11 no role / user_metadata / claims read in the new files (static)
 *   T-12 the Google client-secret prefix occurs 0 times in all tracked files
 *   T-13 flag helper: client id must end with .apps.googleusercontent.com
 *   T-14 (2b-1a) static: middleware mints GET-only; the button's error path is a FULL page load (no setResult-only /
 *        router.push), google-disabled excepted
 *   T-15 (2b-1a) middleware: POST /auth/login without a cookie → no Set-Cookie, nothing forwarded; GET still mints;
 *        GET with a valid cookie still reuses
 *   T-16 (2b-1a) ?m= allow-list: the 4 Google codes render their fixed texts (= the action texts); unknown / markup → none
 *   T-17 (2b-1a) retry URL keeps a safe internal `next`, drops external / protocol-relative / javascript: ones
 * Live (--live, CI ci-live, NEW project only; non-writing):
 *   L-01 signInWithIdToken with a well-formed but fake token → a fixed error code; auth user count unchanged
 *   L-02 no profile row created (user_profiles count unchanged)
 * Probe (--probe, via scripts/live/with-server.cjs against the LOCAL production build; CI job server-checks, decision #69;
 * expectation from the server's env AUTH_GOOGLE_ENABLED + NEXT_PUBLIC_GOOGLE_CLIENT_ID):
 *   P-01 GIS script / button / nonce cookie iff the flag is on; cookie attributes; page carries sha256(raw) only
 *   P-02 (2b-1a) an existing nonce is reused; a POST never mints; ?m=google-nonce renders on the retry page
 * Prints no secrets, tokens, nonces or emails.
 * AUTH-1 2b-2: every action call also passes a Turnstile test token, so this suite must pass 17/17 with the CAPTCHA flag
 * off (token ignored) AND on (AUTH_CAPTCHA_ENABLED=true + a site key in the environment) — scripts/test_auth1_2b2.cjs runs both.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIVE = process.argv.includes('--live');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SECRET_PREFIX = ['GOC', 'SPX-'].join(''); // assembled: this file must not contain the literal
const CLIENT_ID = 'test-client-1234.apps.googleusercontent.com';
const PROVIDER_TEXT = 'PROVIDER-RAW-TEXT-g2b1';
const CAPTCHA_TOKEN = 'g2b1-turnstile-test-token';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const flag = (on, id = CLIENT_ID) => {
  if (on) process.env.AUTH_GOOGLE_ENABLED = 'true';
  else delete process.env.AUTH_GOOGLE_ENABLED;
  if (id === null) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = id;
};

async function offline() {
  // ---------- harness: TS transpile + @/ alias + mocks ----------
  const ts = require('typescript');
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
    return origResolve.call(this, request, parent, isMain, options);
  };
  const transpile = (module, filename) => {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
    module._compile(out.outputText, filename);
  };
  require.extensions['.ts'] = transpile;
  require.extensions['.tsx'] = transpile;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://g2b1-test.example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  const jar = new Map();
  const deleted = [];
  const spy = { idToken: [], profiles: [], logs: [] };
  let idTokenImpl = async () => ({ data: { user: null }, error: { message: PROVIDER_TEXT } });
  class RedirectSignal extends Error {
    constructor(url) {
      super(`NEXT_REDIRECT ${url}`);
      this.url = url;
    }
  }
  const React = require('react');
  const MOCKS = {
    'server-only': {},
    'next/cache': { revalidatePath: () => undefined },
    'next/headers': {
      cookies: async () => ({
        get: (n) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        set: (n, v) => jar.set(n, v),
        delete: (o) => {
          const n = typeof o === 'string' ? o : o.name;
          deleted.push(o);
          jar.delete(n);
        },
      }),
      headers: async () => new Map(),
    },
    'next/navigation': {
      redirect: (url) => {
        throw new RedirectSignal(String(url));
      },
      useSearchParams: () => new URLSearchParams(),
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
      usePathname: () => '/auth/login',
    },
    'next/script': { __esModule: true, default: (p) => React.createElement('script', { src: p.src, 'data-strategy': p.strategy }) },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({
        auth: {
          signInWithIdToken: async (args) => {
            spy.idToken.push(args);
            return idTokenImpl(args);
          },
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      }),
    },
    '@/services/user-profile.service': { UserProfileService: { ensureProfile: async (u) => (spy.profiles.push(u), null) } },
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } }) } }) },
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
    return origLoad.call(this, request, parent, isMain);
  };
  const origError = console.error;
  console.error = (...a) => spy.logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const { renderToStaticMarkup } = require('react-dom/server');
  const { NextRequest } = require('next/server');

  const core = require(path.join(ROOT, 'lib/auth/google-nonce-core.ts'));
  const nonceSrv = require(path.join(ROOT, 'lib/auth/google-nonce.ts'));
  const flagMod = require(path.join(ROOT, 'lib/auth/google-flag.ts'));
  const signin = require(path.join(ROOT, 'lib/auth/google-signin.ts'));
  const actions = require(path.join(ROOT, 'app/auth/google-actions.ts'));
  const loginPage = require(path.join(ROOT, 'app/auth/login/page.tsx')).default;
  const { middleware } = require(path.join(ROOT, 'middleware.ts'));
  const { LoginForm } = require(path.join(ROOT, 'app/auth/login/login-form.tsx'));

  /** find the LoginForm element in the page tree and render the page */
  const renderLogin = async () => {
    const el = await loginPage();
    let formProps = null;
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.type === LoginForm) formProps = n.props;
      walk(n.props && n.props.children);
    };
    walk(el);
    return { html: renderToStaticMarkup(el), formProps };
  };
  const mw = async (url, headers = {}, method = 'GET') => {
    const res = await middleware(new NextRequest(url, { headers, method }));
    const set = res.headers.get('set-cookie') || '';
    const fwd = res.headers.get('x-middleware-request-cookie') || res.headers.get('x-middleware-override-headers') || '';
    return { set, fwd, res };
  };

  await test('T-01 flag off → login page has no GIS script and no Google button; middleware mints no nonce', async () => {
    flag(false);
    jar.clear();
    const { html, formProps } = await renderLogin();
    assert(!/accounts\.google\.com\/gsi\/client/.test(html) && !/data-google-signin/.test(html), 'Google markup rendered with the flag off');
    assert(formProps && formProps.google === null, `google prop: ${JSON.stringify(formProps && formProps.google)}`);
    const m = await mw('http://localhost/auth/login');
    assert(!m.set.includes(core.GOOGLE_NONCE_COOKIE), 'nonce cookie minted with the flag off');
    flag(true, 'not-a-google-id');
    const m2 = await mw('http://localhost/auth/login');
    assert(!m2.set.includes(core.GOOGLE_NONCE_COOKIE), 'nonce minted with a malformed client id');
    return 'no script, no button, no cookie';
  });

  await test('T-02 flag on → script + button; client gets a 64-hex nonce hash ≠ raw; raw never in client props or HTML', async () => {
    flag(true);
    const raw = core.randomRawNonce();
    jar.clear();
    jar.set(core.GOOGLE_NONCE_COOKIE, raw); // as forwarded by the middleware for this render
    const { html, formProps } = await renderLogin();
    assert(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" data-strategy="afterInteractive">/.test(html), 'GIS script missing');
    assert(/data-google-signin/.test(html) && /aria-label="Sign in with Google"/.test(html), 'Google button slot missing');
    const g = formProps && formProps.google;
    assert(g && g.clientId === CLIENT_ID && /^[0-9a-f]{64}$/.test(g.nonceHash) && g.nonceHash !== raw, `google prop: ${g ? Object.keys(g).join(',') : g}`);
    assert(!JSON.stringify(formProps).includes(raw) && !html.includes(raw), 'raw nonce reached the client');
    return 'hash only';
  });

  await test('T-03 sha256(raw) === hashedHex', async () => {
    const { raw, hashedHex } = await core.createNonce();
    assert(/^[0-9a-f]{64}$/.test(raw) && hashedHex === crypto.createHash('sha256').update(raw).digest('hex'), 'hash mismatch');
    jar.clear();
    jar.set(core.GOOGLE_NONCE_COOKIE, raw);
    assert((await nonceSrv.nonceHashForRender()) === hashedHex, 'page hash ≠ sha256(raw)');
    return '64-hex raw; hash matches';
  });

  await test('T-04 nonce cookie: HttpOnly, SameSite=Lax, Path=/, Max-Age=600, Secure in production; login only; an existing valid nonce is reused', async () => {
    flag(true);
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const m = await mw('https://example.invalid/auth/login');
      const c = m.set.split(/,(?=\s*[A-Za-z0-9_]+=)/).find((s) => s.trim().startsWith(`${core.GOOGLE_NONCE_COOKIE}=`)) || '';
      assert(c, 'no nonce cookie for /auth/login');
      for (const attr of [/HttpOnly/i, /SameSite=lax/i, /Path=\//, /Max-Age=600/, /Secure/i]) assert(attr.test(c), `cookie lacks ${attr}`);
      const value = (c.match(new RegExp(`${core.GOOGLE_NONCE_COOKIE}=([^;]+)`)) || [])[1];
      assert(core.isRawNonce(value) && m.fwd.includes(value), 'cookie not forwarded on the request (page could not render the hash)');
      process.env.NODE_ENV = 'development';
      const dev = (await mw('http://localhost/auth/login')).set;
      assert(!/Secure/i.test(dev.split(/,(?=\s*[A-Za-z0-9_]+=)/).find((s) => s.includes(core.GOOGLE_NONCE_COOKIE)) || ''), 'Secure outside production (local http would drop it)');
      // an existing valid nonce is REUSED (a prefetch or second tab must not replace the one a rendered page holds;
      // Next.js strips its router headers before middleware, so prefetches cannot be told apart there)
      const existing = core.randomRawNonce();
      const reuse = await mw('http://localhost/auth/login', { cookie: `${core.GOOGLE_NONCE_COOKIE}=${existing}` });
      assert(reuse.fwd.includes(existing), 'the existing nonce is not the one forwarded to the page');
      assert(!reuse.set.includes(core.GOOGLE_NONCE_COOKIE), 'existing valid nonce re-minted');
      const bad = await mw('http://localhost/auth/login', { cookie: `${core.GOOGLE_NONCE_COOKIE}=not-a-nonce` });
      assert(bad.set.includes(core.GOOGLE_NONCE_COOKIE), 'malformed nonce cookie not replaced');
      assert(!(await mw('http://localhost/auth/signup')).set.includes(core.GOOGLE_NONCE_COOKIE), 'nonce minted outside /auth/login');
    } finally {
      process.env.NODE_ENV = prev;
    }
    const o = core.nonceCookieOptions('production');
    assert(o.httpOnly && o.secure && o.sameSite === 'lax' && o.path === '/' && o.maxAge === 600, JSON.stringify(o));
    return 'attributes + scope';
  });

  await test('T-05 consumeNonce reads and deletes the cookie; a second consume → null', async () => {
    const raw = core.randomRawNonce();
    jar.clear();
    deleted.length = 0;
    jar.set(core.GOOGLE_NONCE_COOKIE, raw);
    assert((await nonceSrv.consumeNonce()) === raw, 'first consume');
    assert(deleted.some((d) => (typeof d === 'string' ? d : d.name) === core.GOOGLE_NONCE_COOKIE && (typeof d === 'string' || d.path === '/')), 'cookie not deleted (Path=/)');
    assert((await nonceSrv.consumeNonce()) === null, 'second consume not null');
    jar.set(core.GOOGLE_NONCE_COOKIE, 'not-a-nonce');
    assert((await nonceSrv.consumeNonce()) === null, 'malformed cookie accepted');
    return 'single use';
  });

  const GOOD_TOKEN = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ4In0', 'c2lnbmF0dXJl'].join('.');
  const call = async (credential, next) => {
    try {
      return { result: await actions.signInWithGoogleAction(credential, next, CAPTCHA_TOKEN) };
    } catch (e) {
      if (e instanceof RedirectSignal) return { redirect: e.url };
      throw e;
    }
  };

  await test('T-06 action with the flag off → google-disabled (server enforced); Supabase not called', async () => {
    flag(false);
    spy.idToken.length = 0;
    jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
    const r = await call(GOOD_TOKEN, '/dashboard');
    assert(r.result && r.result.code === 'google-disabled' && spy.idToken.length === 0, JSON.stringify(r));
    return 'google-disabled, 0 calls';
  });

  await test('T-07 malformed credentials → google-failed; Supabase not called', async () => {
    flag(true);
    spy.idToken.length = 0;
    const bad = ['', 'a.b', 'a.b.c.d', 'a..c', `${'a'.repeat(2000)}.${'b'.repeat(2000)}.${'c'.repeat(200)}`, 'a.b.c d', 42, null, undefined, { token: GOOD_TOKEN }];
    for (const c of bad) {
      jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
      const r = await call(c, '/dashboard');
      assert(r.result && r.result.code === 'google-failed', `${JSON.stringify(c)?.slice(0, 30)} → ${JSON.stringify(r)}`);
    }
    assert(spy.idToken.length === 0, `Supabase called ${spy.idToken.length}×`);
    return `${bad.length} inputs rejected`;
  });

  await test('T-08 missing nonce cookie → google-nonce; Supabase not called', async () => {
    flag(true);
    spy.idToken.length = 0;
    jar.clear();
    const r = await call(GOOD_TOKEN, '/dashboard');
    assert(r.result && r.result.code === 'google-nonce' && spy.idToken.length === 0, JSON.stringify(r));
    return 'google-nonce, 0 calls';
  });

  await test('T-09 error mapping → fixed codes; no provider text in results or logs; credential / nonce never logged', async () => {
    flag(true);
    const cases = [
      [{ code: 'signup_disabled', status: 422, message: `Signups not allowed ${PROVIDER_TEXT}` }, 'signup-closed'],
      [{ status: 400, message: `User not found ${PROVIDER_TEXT}` }, 'signup-closed'],
      [{ status: 400, message: `Nonces mismatch ${PROVIDER_TEXT}` }, 'google-nonce'],
      [{ name: 'AuthRetryableFetchError', status: 0, message: `fetch failed ${PROVIDER_TEXT}` }, 'generic'],
      [Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }), 'generic'],
      [{ status: 400, code: 'bad_jwt', message: `Bad ID token ${PROVIDER_TEXT}` }, 'google-failed'],
      [{ status: 400, message: `Provider (issuer "https://accounts.google.com") is not enabled ${PROVIDER_TEXT}` }, 'google-failed'],
    ];
    const outs = [];
    for (const [err, want] of cases) {
      assert(signin.mapGoogleError(err) === want, `mapGoogleError → ${signin.mapGoogleError(err)} (want ${want})`);
      const raw = core.randomRawNonce();
      jar.set(core.GOOGLE_NONCE_COOKIE, raw);
      spy.logs.length = 0;
      idTokenImpl = async () => ({ data: { user: null }, error: err });
      const r = await call(GOOD_TOKEN, '/dashboard');
      assert(r.result && r.result.code === want, `action → ${JSON.stringify(r)} (want ${want})`);
      const logs = spy.logs.join('\n');
      assert(!logs.includes(GOOD_TOKEN) && !logs.includes(raw) && !logs.includes(PROVIDER_TEXT), 'credential / nonce / provider text logged');
      outs.push(JSON.stringify(r));
    }
    // a thrown error (network) is mapped too
    jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
    idTokenImpl = async () => {
      throw new TypeError(`fetch failed ${PROVIDER_TEXT}`);
    };
    outs.push(JSON.stringify(await call(GOOD_TOKEN, '/dashboard')));
    assert(!outs.some((o) => o.includes(PROVIDER_TEXT) || o.includes('Nonces') || o.includes('issuer')), 'provider text reached the client');
    return `${cases.length + 1} cases → fixed codes`;
  });

  await test('T-10 success → insert-only profile + safe redirect (hostile next → /dashboard); same nonce cannot be used twice', async () => {
    flag(true);
    const USER = { id: 'u-g2b1', email: 'g2b1@example.test', app_metadata: {}, user_metadata: { full_name: 'G Test', role: 'admin' } };
    idTokenImpl = async () => ({ data: { user: USER, session: {} }, error: null });
    const targets = [['https://evil.example/x', '/dashboard'], ['//evil.example', '/dashboard'], ['/\\evil.example', '/dashboard'], ['javascript:alert(1)', '/dashboard'], ['', '/dashboard'], ['/performance', '/performance']];
    for (const [next, want] of targets) {
      spy.idToken.length = 0;
      spy.profiles.length = 0;
      const raw = core.randomRawNonce();
      jar.set(core.GOOGLE_NONCE_COOKIE, raw);
      const r = await call(GOOD_TOKEN, next);
      assert(r.redirect === want, `next=${JSON.stringify(next)} → ${JSON.stringify(r)}`);
      assert(spy.idToken.length === 1 && spy.idToken[0].provider === 'google' && spy.idToken[0].nonce === raw && spy.idToken[0].token === GOOD_TOKEN, 'signInWithIdToken args');
      assert(spy.profiles.length === 1 && spy.profiles[0] === USER, 'ensureProfile not called with the session user');
      // single use: replaying the same credential with no fresh nonce fails before Supabase
      spy.idToken.length = 0;
      const again = await call(GOOD_TOKEN, next);
      assert(again.result && again.result.code === 'google-nonce' && spy.idToken.length === 0, `replay → ${JSON.stringify(again)}`);
    }
    return `${targets.length} redirects safe; replay → google-nonce`;
  });

  const NEW_FILES = ['lib/auth/google-flag.ts', 'lib/auth/google-nonce-core.ts', 'lib/auth/google-nonce.ts', 'lib/auth/google-signin.ts', 'app/auth/google-actions.ts', 'components/auth/google-signin-button.tsx', 'app/auth/login/page.tsx', 'app/auth/login/login-form.tsx', 'middleware.ts'];
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  await test('T-11 no role / user_metadata / app_metadata / ID-token claims read in the new files; no logging of secrets (static)', () => {
    const bad = [];
    for (const f of NEW_FILES) {
      const s = code(read(f));
      if (/user_metadata|app_metadata|\.role\b|\brole\s*:|claims|jwtDecode|atob\(/.test(s)) bad.push(`${f}: role / claims access`);
      for (const m of s.matchAll(/console\.(log|error|warn|info)\(([^;]*)\);/g)) if (/credential|nonce|token|cookie|email|authorization/i.test(m[2].replace(/"[^"]*"/g, ''))) bad.push(`${f}: logs ${m[2].slice(0, 40)}`);
    }
    assert(!/nonce:\s*nonceHash/.test(code(read('app/auth/google-actions.ts'))), 'action must pass the RAW nonce, not the hash');
    assert(/nonce: nonceHash/.test(read('components/auth/google-signin-button.tsx')), 'GIS must receive the hash');
    assert(!/google-nonce(?!-core)/.test(read('components/auth/google-signin-button.tsx') + read('app/auth/login/login-form.tsx')), 'client code imports the server nonce module');
    assert(!/initialize[^]*prompt\(/.test(read('components/auth/google-signin-button.tsx')), 'One Tap / prompt() used');
    assert(bad.length === 0, bad.join('; '));
    return `${NEW_FILES.length} files`;
  });

  await test('T-12 the Google client-secret prefix occurs 0 times in all tracked files', () => {
    const ls = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
    const files = ls.stdout.split('\0').filter(Boolean).filter((f) => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz|bundle)$/i.test(f));
    assert(files.length >= 500, `only ${files.length} files`);
    let count = 0;
    for (const f of files) {
      try {
        count += fs.readFileSync(path.join(ROOT, f), 'utf8').split(SECRET_PREFIX).length - 1;
      } catch {
        /* removed in the working tree */
      }
    }
    assert(count === 0, `${count} occurrence(s)`);
    return `0 in ${files.length} tracked files`;
  });

  await test('T-13 flag helper: on only with AUTH_GOOGLE_ENABLED=true AND a *.apps.googleusercontent.com client id', () => {
    const E = (en, id) => ({ AUTH_GOOGLE_ENABLED: en, NEXT_PUBLIC_GOOGLE_CLIENT_ID: id });
    const cases = [
      [E('true', CLIENT_ID), true],
      [E('true', 'evil.example.com'), false],
      [E('true', '.apps.googleusercontent.com'), false],
      [E('true', `${CLIENT_ID}.evil.com`), false],
      [E('true', 'x y.apps.googleusercontent.com'), false],
      [E('true', ''), false],
      [E('TRUE', CLIENT_ID), false],
      [E('1', CLIENT_ID), false],
      [E(undefined, CLIENT_ID), false],
    ];
    const bad = cases.filter(([env, want]) => flagMod.isGoogleSignInEnabled(env) !== want);
    assert(bad.length === 0, bad.map(([e]) => JSON.stringify(e)).join('; '));
    return `${cases.length} cases`;
  });

  // ---------------- 2b-1a: retry after a failed attempt ----------------
  await test('T-14 static: middleware mints GET-only; button error path = full page load (google-disabled excepted)', () => {
    const m = code(read('middleware.ts'));
    assert(/request\.method === "GET" && request\.nextUrl\.pathname === "\/auth\/login" && isGoogleSignInEnabled\(\)/.test(m), 'mint condition is not GET-only');
    const b = code(read('components/auth/google-signin-button.tsx'));
    assert(/window\.location\.replace\(googleRetryUrl\(/.test(b), 'error path does not reload the page in full');
    assert(!/router\.(push|replace|refresh)|useRouter/.test(b), 'soft navigation used');
    const cb = b.slice(b.indexOf('signInWithGoogleAction(credential'), b.indexOf('window.location.replace'));
    assert(/r\.code === "google-disabled"/.test(cb) && (cb.match(/setResult\(r\)/g) || []).length === 1, 'setResult is used for more than the google-disabled case');
    assert(!/\.prompt\(/.test(b), 'One Tap / automatic prompt');
    return 'GET-only mint; location.replace on error';
  });

  await test('T-15 middleware: POST /auth/login (server action) never mints or forwards; GET mints; GET with a valid cookie reuses', async () => {
    flag(true);
    const post = await mw('http://localhost/auth/login', { 'next-action': 'x', 'content-type': 'text/plain;charset=UTF-8' }, 'POST');
    assert(!post.set.includes(core.GOOGLE_NONCE_COOKIE), 'POST minted a nonce cookie');
    assert(!post.fwd.includes(`${core.GOOGLE_NONCE_COOKIE}=`), 'POST forwarded a nonce on the request');
    for (const method of ['PUT', 'DELETE', 'PATCH']) assert(!(await mw('http://localhost/auth/login', {}, method)).set.includes(core.GOOGLE_NONCE_COOKIE), `${method} minted`);
    const get = await mw('http://localhost/auth/login');
    assert(get.set.includes(core.GOOGLE_NONCE_COOKIE), 'GET no longer mints');
    const existing = core.randomRawNonce();
    const reuse = await mw('http://localhost/auth/login', { cookie: `${core.GOOGLE_NONCE_COOKIE}=${existing}` });
    assert(!reuse.set.includes(core.GOOGLE_NONCE_COOKIE) && reuse.fwd.includes(existing), 'GET with a valid cookie does not reuse');
    return 'POST/PUT/DELETE/PATCH 0 mints; GET mints; GET reuses';
  });

  await test('T-16 ?m= allow-list: the 4 Google codes render their fixed texts; unknown / markup codes render nothing', async () => {
    const msgs = require(path.join(ROOT, 'lib/auth/messages.ts'));
    const codes = ['google-failed', 'google-nonce', 'signup-closed', 'generic'];
    for (const c of codes) {
      const n = msgs.authNotice(c);
      assert(n && n.text === msgs.AUTH_ERRORS[c], `${c}: notice ${JSON.stringify(n)} ≠ action text`);
    }
    assert(/session expired/i.test(msgs.AUTH_NOTICES['google-nonce'].text) && /try again/i.test(msgs.AUTH_NOTICES['google-nonce'].text), 'google-nonce text');
    assert(msgs.AUTH_NOTICES['signup-closed'].text === 'Registrations are not open yet.', 'signup-closed text');
    for (const bad of ['google-disabled', 'google_failed', 'GOOGLE-FAILED', '<b>google-failed</b>', 'google-failed"><script>', 'x', '']) assert(msgs.authNotice(bad) === null, `${JSON.stringify(bad)} rendered`);
    // rendered on the login page from ?m=
    const nav = MOCKS['next/navigation'];
    const orig = nav.useSearchParams;
    try {
      flag(false);
      for (const c of codes) {
        nav.useSearchParams = () => new URLSearchParams({ m: c });
        const { html } = await renderLogin();
        const want = msgs.AUTH_NOTICES[c].text.replace(/'/g, '&#x27;');
        assert(html.includes('data-auth-notice') && html.includes(want), `${c}: notice not rendered`);
      }
      nav.useSearchParams = () => new URLSearchParams({ m: '<img src=x onerror=alert(1)>' });
      assert(!(await renderLogin()).html.includes('data-auth-notice'), 'markup code rendered');
    } finally {
      nav.useSearchParams = orig;
    }
    return `${codes.length} codes rendered; unknown / markup ignored`;
  });

  await test('T-17 retry URL keeps a safe internal `next`, drops external / protocol-relative / javascript: ones', () => {
    const cases = [
      ['/performance', '/auth/login?m=google-nonce&next=%2Fperformance'],
      ['/exams/ssc-cgl?tab=syllabus', '/auth/login?m=google-nonce&next=%2Fexams%2Fssc-cgl%3Ftab%3Dsyllabus'],
      ['https://evil.example/x', '/auth/login?m=google-nonce'],
      ['//evil.example', '/auth/login?m=google-nonce'],
      ['/\\evil.example', '/auth/login?m=google-nonce'],
      ['javascript:alert(1)', '/auth/login?m=google-nonce'],
      ['', '/auth/login?m=google-nonce'],
      [undefined, '/auth/login?m=google-nonce'],
    ];
    const bad = cases.filter(([n, want]) => signin.googleRetryUrl('google-nonce', n) !== want).map(([n]) => `${JSON.stringify(n)} → ${signin.googleRetryUrl('google-nonce', n)}`);
    assert(bad.length === 0, bad.join('; '));
    assert(signin.googleRetryUrl('signup-closed', '/dashboard') === '/auth/login?m=signup-closed&next=%2Fdashboard', 'code param');
    return `${cases.length} next values`;
  });

  console.error = origError;
}

// ---------- live: CI ci-live, NEW project only, non-writing ----------
async function live() {
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};
  const { readEnv } = require('./db/_db-env.cjs');
  const { refFromPublicUrl, assertProjectRef } = require('./db/gen-types.cjs');
  const env = readEnv();
  assertProjectRef(refFromPublicUrl(env)); // ref lock: couragelibrary-next only, never the legacy project
  const { createClient } = require('@supabase/supabase-js');
  const URL_ = env('NEXT_PUBLIC_SUPABASE_URL');
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(URL_, env('SUPABASE_SERVICE_ROLE_KEY'), noSession);
  const anon = createClient(URL_, env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), noSession);
  // map errors exactly as the server action does (same module)
  const ts = require('typescript');
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
    return origResolve.call(this, request, parent, isMain, options);
  };
  require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
  const { mapGoogleError } = require(path.join(ROOT, 'lib/auth/google-signin.ts'));

  const retry = async (fn) => {
    for (let i = 1; i <= 3; i++) {
      try {
        return await fn();
      } catch (e) {
        if (i === 3) throw e;
      }
    }
  };
  const userCount = () => retry(async () => {
    let n = 0;
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsers failed (${error.status})`);
      n += data.users.length;
      if (data.users.length < 200) return n;
    }
    throw new Error('user list exceeded the page limit');
  });
  const profileCount = () => retry(async () => {
    const { count, error } = await admin.from('user_profiles').select('id', { count: 'exact', head: true });
    if (error) throw new Error(`profile count failed (${error.code})`);
    return count;
  });

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const fakeToken = `${b64({ alg: 'RS256', kid: 'g2b1-fake', typ: 'JWT' })}.${b64({ iss: 'https://accounts.google.com', aud: 'fake.apps.googleusercontent.com', sub: 'g2b1-fake-subject', email: 'g2b1-fake@example.test', email_verified: true, nonce: 'f'.repeat(64), iat: now, exp: now + 300 })}.${Buffer.from('not-a-signature').toString('base64url')}`;
  const usersBefore = await userCount();
  const profilesBefore = await profileCount();
  let code = null;
  await test('L-01 signInWithIdToken with a well-formed fake token → a fixed error code; auth user count unchanged', async () => {
    const { data, error } = await retry(() => anon.auth.signInWithIdToken({ provider: 'google', token: fakeToken, nonce: 'a'.repeat(64) }));
    assert(!data?.user && !data?.session && error, 'a fake token produced a session');
    code = mapGoogleError(error);
    assert(['google-failed', 'google-nonce', 'signup-closed', 'generic'].includes(code), `unmapped: ${code}`);
    const usersAfter = await userCount();
    assert(usersAfter === usersBefore, `auth users ${usersBefore} → ${usersAfter}`);
    return `code ${code}; auth users ${usersBefore} → ${usersAfter}`;
  });
  await test('L-02 no profile row created for that attempt', async () => {
    const profilesAfter = await profileCount();
    assert(profilesAfter === profilesBefore, `user_profiles ${profilesBefore} → ${profilesAfter}`);
    return `user_profiles ${profilesBefore} → ${profilesAfter}`;
  });
}

// ---------- probe: the local production build (scripts/live/with-server.cjs sets BASE_URL; CI job server-checks) ----------
// Expectation from the server's own env (inherited by the gate): AUTH_GOOGLE_ENABLED=true + a test client id → ON.
// Non-writing, no Supabase and no Google request (the page only references the GIS script; the server never fetches it).
async function probe() {
  const base = process.env.BASE_URL;
  assert(base && /^http:\/\/localhost:\d+$/.test(base), 'BASE_URL must be the local server (with-server.cjs)');
  const on = process.env.AUTH_GOOGLE_ENABLED === 'true' && /\.apps\.googleusercontent\.com$/.test(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '');
  const NONCE = 'cl_g_nonce';
  const get = async (p, opts = {}) => {
    for (let i = 1; i <= 3; i++) {
      try {
        const res = await fetch(base + p, { redirect: 'manual', signal: AbortSignal.timeout(30000), ...opts });
        return { status: res.status, html: await res.text(), cookies: res.headers.getSetCookie ? res.headers.getSetCookie() : [] };
      } catch (e) {
        if (i === 3) throw e;
      }
    }
  };
  const nonceCookie = (r) => r.cookies.find((c) => c.startsWith(`${NONCE}=`)) || '';
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

  await test(`P-01 real server, Google flag ${on ? 'ON' : 'OFF'}: GET /auth/login → GIS script, button and nonce cookie iff on`, async () => {
    const r = await get('/auth/login');
    assert(r.status === 200, `HTTP ${r.status}`);
    const script = r.html.includes('accounts.google.com/gsi/client');
    const button = r.html.includes('data-google-signin');
    const c = nonceCookie(r);
    if (!on) {
      assert(!script && !button && !c, `flag off: script ${script}, button ${button}, cookie ${!!c}`);
      return 'no script, no button, no cookie';
    }
    assert(script && button && c, `flag on: script ${script}, button ${button}, cookie ${!!c}`);
    for (const attr of [/HttpOnly/i, /SameSite=lax/i, /Path=\//, /Max-Age=600/]) assert(attr.test(c), `cookie lacks ${attr}`);
    const raw = (c.match(/^cl_g_nonce=([0-9a-f]{64});/) || [])[1];
    assert(raw, 'nonce cookie value is not 64 hex');
    assert(r.html.includes(sha(raw)) && !r.html.includes(raw), 'page does not carry sha256(raw) only');
    return 'cookie attributes ok; page has the hash, never the raw value';
  });

  await test(`P-02 real server, Google flag ${on ? 'ON' : 'OFF'}: an existing nonce is reused; POST never mints (2b-1a)`, async () => {
    if (!on) {
      const post = await get('/auth/login', { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: '[]' });
      assert(!nonceCookie(post), 'POST minted with the flag off');
      return 'flag off: nothing minted';
    }
    const first = await get('/auth/login');
    const raw = (nonceCookie(first).match(/^cl_g_nonce=([0-9a-f]{64});/) || [])[1];
    assert(raw, 'no nonce on the first GET');
    const again = await get('/auth/login', { headers: { cookie: `${NONCE}=${raw}` } });
    assert(again.status === 200 && !nonceCookie(again) && again.html.includes(sha(raw)), 'existing valid nonce not reused');
    const post = await get('/auth/login', { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8', 'next-action': '0'.repeat(40) }, body: '[]' });
    assert(!nonceCookie(post), 'a POST to /auth/login minted a nonce');
    const retry = await get('/auth/login?m=google-nonce');
    assert(retry.status === 200 && retry.html.includes('data-auth-notice') && /session expired/i.test(retry.html), '?m=google-nonce notice not rendered on the retry page');
    return 'reuse ok; POST 0 mints; retry notice rendered';
  });
}

(async () => {
  const PROBE = process.argv.includes('--probe');
  console.log(`AUTH-1 2b-1 Google sign-in (${PROBE ? 'probe' : LIVE ? 'live' : 'offline'})`);
  if (PROBE) await probe();
  else if (LIVE) await live();
  else await offline();
  console.log(`\nAUTH-1 2b-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`AUTH-1 2b-1 SUITE ERROR ${e && e.message}`);
  process.exit(2);
});
