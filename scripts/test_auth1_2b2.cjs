#!/usr/bin/env node
/**
 * AUTH-1 2b-2 gate — Cloudflare Turnstile on the auth forms (flag default OFF) + branded Supabase email templates.
 * Offline (default; deterministic, no network). Uses only Cloudflare's PUBLIC always-pass TEST site key.
 *   T-01 flag helper: on only with AUTH_CAPTCHA_ENABLED=true AND a well-formed site key
 *   T-02 flag off → login / signup / forgot-password: no Turnstile script, no widget, no token field
 *   T-03 flag on → widget on all three pages (signup only while its form is shown); script src exact; hidden field
 *   T-04 flag off → the 4 actions need no token and send none to Supabase
 *   T-05 flag on → signInWithPassword / signUp / resetPasswordForEmail / signInWithIdToken receive options.captchaToken
 *   T-06 flag on, token missing → captcha-required; Supabase not called (4 actions)
 *   T-07 flag on, token oversized / non-string → captcha-failed; Supabase not called (4 actions)
 *   T-08 Supabase captcha error → captcha-failed (4 actions); raw provider text never in results or logs; token never logged
 *   T-09 single use: forms pass resetKey={state}; the widget resets + clears the token after each submit (static + unit)
 *   T-10 ?m= allow-list: captcha-required / captcha-failed render their fixed texts (= action texts)
 *   T-11 2b-1 Google suite 17/17 with the CAPTCHA flag off AND on
 *   T-12 email templates: {{ .TokenHash }}, /auth/confirm, type accepted by the route, no http:// links, links + <img>
 *        ONLY from the exact allow-list (scripts/lib/email-allowlist.cjs, EMAIL AMENDMENT 2026-10-27),
 *        no {{ .ConfirmationURL }}, sender no-reply@couragelibrary.in
 *   T-13 secret gate: Turnstile-secret-looking values and the Google client-secret prefix: 0 in tracked files (counts)
 *   T-14 static: no Turnstile secret env var / siteverify call in app code; tokens never logged; Google flow intact
 * Probe (--probe, via scripts/live/with-server.cjs against the LOCAL production build; expectation from the server's
 * own env AUTH_CAPTCHA_ENABLED): P-01 the 3 pages carry the Turnstile script + widget iff the flag is on.
 * Prints no secrets, tokens, nonces or emails.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROBE = process.argv.includes('--probe');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TEST_SITE_KEY = '1x00000000000000000000AA'; // Cloudflare's public always-pass TEST site key
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN = 'g2b2-turnstile-test-token';
const PROVIDER_TEXT = 'PROVIDER-RAW-TEXT-g2b2';
const CLIENT_ID = 'test-client-1234.apps.googleusercontent.com';

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
const captchaFlag = (on, key = TEST_SITE_KEY) => {
  if (on) process.env.AUTH_CAPTCHA_ENABLED = 'true';
  else delete process.env.AUTH_CAPTCHA_ENABLED;
  if (key === null) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = key;
};
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://g2b2-test.example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid';
  delete process.env.AUTH_GOOGLE_ENABLED;
  const jar = new Map();
  const spy = { calls: [], logs: [] };
  const ok = {
    signInWithPassword: { data: { user: null }, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } },
    signUp: { data: { user: null, session: null }, error: null },
    resetPasswordForEmail: { data: {}, error: null },
    signInWithIdToken: { data: { user: null }, error: { status: 400, code: 'bad_jwt', message: 'bad' } },
  };
  let impl = {};
  let signupAvailability = 'open';
  class RedirectSignal extends Error {
    constructor(url) {
      super(`NEXT_REDIRECT ${url}`);
      this.url = url;
    }
  }
  const React = require('react');
  const authCall = (name) => async (...args) => {
    spy.calls.push({ name, args });
    return impl[name] ? impl[name](...args) : ok[name];
  };
  const MOCKS = {
    'server-only': {},
    'next/cache': { revalidatePath: () => undefined },
    'next/headers': {
      cookies: async () => ({
        get: (n) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        set: (n, v) => jar.set(n, v),
        delete: (o) => jar.delete(typeof o === 'string' ? o : o.name),
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
          signInWithPassword: authCall('signInWithPassword'),
          signUp: authCall('signUp'),
          resetPasswordForEmail: authCall('resetPasswordForEmail'),
          signInWithIdToken: authCall('signInWithIdToken'),
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      }),
    },
    '@/services/user-profile.service': { UserProfileService: { ensureProfile: async () => null } },
    '@/lib/auth/signup-availability': { getSignupAvailability: async () => signupAvailability },
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
    return origLoad.call(this, request, parent, isMain);
  };
  const origError = console.error;
  console.error = (...a) => spy.logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const { renderToStaticMarkup } = require('react-dom/server');

  const captcha = require(path.join(ROOT, 'lib/auth/captcha.ts'));
  const msgs = require(path.join(ROOT, 'lib/auth/messages.ts'));
  const actions = require(path.join(ROOT, 'app/auth/actions.ts'));
  const gActions = require(path.join(ROOT, 'app/auth/google-actions.ts'));
  const core = require(path.join(ROOT, 'lib/auth/google-nonce-core.ts'));
  const loginPage = require(path.join(ROOT, 'app/auth/login/page.tsx')).default;
  const signupPage = require(path.join(ROOT, 'app/auth/signup/page.tsx')).default;
  const forgotPage = require(path.join(ROOT, 'app/auth/forgot-password/page.tsx')).default;

  const PAGES = { login: loginPage, signup: signupPage, 'forgot-password': forgotPage };
  const renderPage = async (name) => renderToStaticMarkup(await PAGES[name]());
  const hasTurnstile = (html) => ({
    script: html.includes('challenges.cloudflare.com'),
    exactScript: html.includes(`<script src="${SCRIPT_SRC.replace(/&/g, '&amp;')}" data-strategy="afterInteractive">`),
    widget: html.includes('data-turnstile'),
    field: /name="captchaToken"/.test(html),
  });

  await test('T-01 flag helper: on only with AUTH_CAPTCHA_ENABLED=true AND a well-formed site key', () => {
    const E = (en, key) => ({ AUTH_CAPTCHA_ENABLED: en, NEXT_PUBLIC_TURNSTILE_SITE_KEY: key });
    const cases = [
      [E('true', TEST_SITE_KEY), true],
      [E('true', '0x4AAAAAAAfakeSiteKey12'), true],
      [E('true', ''), false],
      [E('true', '   '), false],
      [E('true', undefined), false],
      [E('true', 'key" onload="x'), false],
      [E('true', 'k'.repeat(101)), false],
      [E('TRUE', TEST_SITE_KEY), false],
      [E('1', TEST_SITE_KEY), false],
      [E(undefined, TEST_SITE_KEY), false],
    ];
    const bad = cases.filter(([env, want]) => captcha.isCaptchaEnabled(env) !== want);
    assert(bad.length === 0, bad.map(([e]) => JSON.stringify(e)).join('; '));
    assert(captcha.TURNSTILE_SCRIPT_SRC === SCRIPT_SRC, `script src ${captcha.TURNSTILE_SCRIPT_SRC}`);
    return `${cases.length} cases`;
  });

  await test('T-02 flag off → login / signup / forgot-password: no Turnstile script, widget or token field', async () => {
    const out = [];
    for (const [on, key] of [[false, TEST_SITE_KEY], [false, null], [true, null], [true, 'bad key!']]) {
      captchaFlag(on, key);
      signupAvailability = 'open';
      for (const name of Object.keys(PAGES)) {
        const t = hasTurnstile(await renderPage(name));
        assert(!t.script && !t.widget && !t.field, `${name} (flag ${on}, key ${key === null ? 'unset' : 'set'}): ${JSON.stringify(t)}`);
      }
      out.push(`${on}/${key === null ? 'nokey' : 'key'}`);
    }
    return `3 pages × ${out.length} off-states clean`;
  });

  await test('T-03 flag on → widget + exact script + hidden field on all three pages; signup only while its form shows', async () => {
    captchaFlag(true);
    signupAvailability = 'open';
    for (const name of Object.keys(PAGES)) {
      const html = await renderPage(name);
      const t = hasTurnstile(html);
      assert(t.exactScript && t.widget && t.field, `${name}: ${JSON.stringify(t)}`);
      assert((html.match(/data-turnstile/g) || []).length === 1, `${name}: more than one widget`);
    }
    signupAvailability = 'closed';
    const closed = await renderPage('signup');
    assert(closed.includes('data-signup-closed') && !hasTurnstile(closed).widget && !hasTurnstile(closed).script, 'widget rendered on the closed sign-up page');
    signupAvailability = 'open';
    // with Google also on, the login page still has exactly ONE widget (shared by the form and the Google button)
    process.env.AUTH_GOOGLE_ENABLED = 'true';
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
    jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
    const both = await renderPage('login');
    delete process.env.AUTH_GOOGLE_ENABLED;
    assert(both.includes('data-google-signin') && (both.match(/data-turnstile/g) || []).length === 1, 'login with Google: widget count ≠ 1');
    return `script ${SCRIPT_SRC}; closed sign-up → none`;
  });

  // ---------- action helpers ----------
  const fd = (obj) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) f.append(k, v);
    return f;
  };
  const run = async (fn) => {
    try {
      return { result: await fn() };
    } catch (e) {
      if (e instanceof RedirectSignal) return { redirect: e.url };
      throw e;
    }
  };
  const GOOD_ID_TOKEN = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ4In0', 'c2lnbmF0dXJl'].join('.');
  const ACTIONS = {
    signInWithPassword: (t) => run(() => actions.loginAction(null, fd({ email: 'qa@example.test', password: 'Passw0rdX', captchaToken: t }))),
    signUp: (t) => run(() => actions.signupAction(null, fd({ fullName: 'QA', email: 'qa@example.test', password: 'Passw0rdX', captchaToken: t }))),
    resetPasswordForEmail: (t) => run(() => actions.forgotPasswordAction(null, fd({ email: 'qa@example.test', captchaToken: t }))),
    signInWithIdToken: (t) => {
      process.env.AUTH_GOOGLE_ENABLED = 'true';
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
      jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
      return run(() => gActions.signInWithGoogleAction(GOOD_ID_TOKEN, '/dashboard', t)).finally(() => delete process.env.AUTH_GOOGLE_ENABLED);
    },
  };
  const captchaOf = (c) => (c.name === 'signInWithPassword' || c.name === 'signInWithIdToken' ? c.args[0]?.options?.captchaToken : c.args[c.name === 'signUp' ? 0 : 1]?.[c.name === 'signUp' ? 'options' : 'captchaToken']);
  const tokenSent = (c) => (c.name === 'signUp' ? c.args[0]?.options?.captchaToken : captchaOf(c));

  await test('T-04 flag off → no token required and none sent (4 actions)', async () => {
    captchaFlag(false);
    impl = {};
    const out = [];
    for (const [name, act] of Object.entries(ACTIONS)) {
      for (const t of [undefined, TOKEN]) {
        spy.calls.length = 0;
        const r = await act(t);
        assert(spy.calls.length === 1 && spy.calls[0].name === name, `${name}: Supabase calls ${spy.calls.map((c) => c.name)} (${JSON.stringify(r)})`);
        assert(tokenSent(spy.calls[0]) === undefined, `${name}: a token was sent with the flag off`);
        assert(!['captcha-required', 'captcha-failed'].includes(r.result && r.result.code), `${name}: ${r.result.code}`);
      }
      out.push(name);
    }
    return `${out.length} actions × (no token, token) → called, nothing sent`;
  });

  await test('T-05 flag on → each Supabase call receives options.captchaToken', async () => {
    captchaFlag(true);
    impl = {};
    for (const [name, act] of Object.entries(ACTIONS)) {
      spy.calls.length = 0;
      await act(TOKEN);
      assert(spy.calls.length === 1 && spy.calls[0].name === name, `${name}: calls ${spy.calls.map((c) => c.name)}`);
      assert(tokenSent(spy.calls[0]) === TOKEN, `${name}: captchaToken not passed`);
    }
    // the email/redirect options are kept next to the token
    spy.calls.length = 0;
    await ACTIONS.signUp(TOKEN);
    assert(/\/auth\/confirm\?next=%2Fdashboard$/.test(spy.calls[0].args[0].options.emailRedirectTo), 'signUp emailRedirectTo lost');
    spy.calls.length = 0;
    await ACTIONS.resetPasswordForEmail(TOKEN);
    assert(/\/auth\/confirm\?next=%2Fauth%2Fupdate-password$/.test(spy.calls[0].args[1].redirectTo), 'reset redirectTo lost');
    return '4/4 receive the token; redirect options intact';
  });

  await test('T-06 flag on, token missing → captcha-required; Supabase not called (4 actions)', async () => {
    captchaFlag(true);
    for (const [name, act] of Object.entries(ACTIONS)) {
      for (const t of [undefined, '']) {
        spy.calls.length = 0;
        const r = await act(t);
        assert(r.result && r.result.code === 'captcha-required' && r.result.error === msgs.AUTH_ERRORS['captcha-required'], `${name}(${JSON.stringify(t)}): ${JSON.stringify(r)}`);
        assert(spy.calls.length === 0, `${name}: Supabase called`);
      }
    }
    return '8 cases, 0 Supabase calls';
  });

  await test('T-07 flag on, token oversized / non-string → captcha-failed; Supabase not called (4 actions)', async () => {
    captchaFlag(true);
    const big = 'x'.repeat(2049);
    let n = 0;
    for (const [name, act] of Object.entries(ACTIONS)) {
      const bad = name === 'signInWithIdToken' ? [big, 42, { t: TOKEN }, [TOKEN]] : [big, new File(['x'], 'token.txt')];
      for (const t of bad) {
        spy.calls.length = 0;
        const r = await act(t);
        assert(r.result && r.result.code === 'captcha-failed', `${name}: ${JSON.stringify(r)}`);
        assert(spy.calls.length === 0, `${name}: Supabase called`);
        n++;
      }
    }
    // exactly 2048 is still accepted (boundary)
    spy.calls.length = 0;
    await ACTIONS.resetPasswordForEmail('y'.repeat(2048));
    assert(spy.calls.length === 1, '2048-char token rejected');
    return `${n} cases rejected; 2048 accepted`;
  });

  await test('T-08 Supabase captcha error → captcha-failed (4 actions); raw text never surfaces; token never logged', async () => {
    captchaFlag(true);
    const errs = [
      { code: 'captcha_failed', status: 400, message: `captcha protection: request disallowed (${PROVIDER_TEXT})` },
      { status: 400, message: `Captcha verification process failed ${PROVIDER_TEXT}` },
    ];
    const outs = [];
    for (const err of errs) {
      impl = {
        signInWithPassword: async () => ({ data: { user: null }, error: err }),
        signUp: async () => ({ data: { user: null, session: null }, error: err }),
        resetPasswordForEmail: async () => ({ data: {}, error: err }),
        signInWithIdToken: async () => ({ data: { user: null }, error: err }),
      };
      for (const [name, act] of Object.entries(ACTIONS)) {
        spy.logs.length = 0;
        const r = await act(TOKEN);
        assert(r.result && r.result.code === 'captcha-failed' && r.result.error === msgs.AUTH_ERRORS['captcha-failed'], `${name}: ${JSON.stringify(r)}`);
        const logs = spy.logs.join('\n');
        assert(!logs.includes(TOKEN) && !logs.includes(PROVIDER_TEXT) && !logs.includes('qa@example.test'), `${name}: token / provider text / email logged`);
        outs.push(JSON.stringify(r));
      }
    }
    impl = {};
    assert(msgs.mapAuthError(errs[0]) === 'captcha-failed', 'mapAuthError');
    assert(!outs.some((o) => o.includes(PROVIDER_TEXT) || /disallowed|verification process/i.test(o)), 'provider text reached the client');
    // the other mappings are unchanged
    assert(msgs.mapAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }) === 'invalid-credentials', 'invalid_credentials remapped');
    return `${outs.length} results → captcha-failed`;
  });

  await test('T-09 single use: forms reset the widget after each submit (static) and the widget resets + clears its token (unit)', async () => {
    for (const [f, action] of [['app/auth/login/login-form.tsx', 'login'], ['app/auth/signup/signup-form.tsx', 'signup'], ['app/auth/forgot-password/forgot-password-form.tsx', 'forgot-password']]) {
      const s = code(read(f));
      assert(new RegExp(`<TurnstileWidget siteKey=\\{captcha\\.siteKey\\} action="${action}" resetKey=\\{state\\}`).test(s), `${f}: widget not reset on state`);
    }
    const w = code(read('components/auth/turnstile-widget.tsx'));
    assert(/window\.turnstile\?\.reset\(widgetId\.current\)/.test(w) && /\[resetKey, update\]/.test(w), 'widget has no reset effect');
    assert(/window\.location\.replace\(googleRetryUrl\(/.test(code(read('components/auth/google-signin-button.tsx'))), 'Google failure path no longer reloads in full');

    // unit: load the widget with a tiny hook runner (no DOM library in the repo, #44)
    const widgetPath = path.join(ROOT, 'components/auth/turnstile-widget.tsx');
    const hooks = { refs: [], states: [], effects: [], i: 0, pending: [] };
    const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((x, k) => !Object.is(x, b[k]));
    const fakeReact = {
      useRef: (init) => {
        const k = hooks.i++;
        if (!hooks.refs[k]) hooks.refs[k] = { current: init };
        return hooks.refs[k];
      },
      useState: (init) => {
        const k = hooks.i++;
        if (!(k in hooks.states)) hooks.states[k] = init;
        return [hooks.states[k], (v) => (hooks.states[k] = v)];
      },
      useCallback: (fn, deps) => {
        const k = hooks.i++;
        const prev = hooks.refs[k];
        if (!prev || depsChanged(prev.deps, deps)) hooks.refs[k] = { fn, deps };
        return hooks.refs[k].fn;
      },
      useEffect: (fn, deps) => {
        const k = hooks.i++;
        const prev = hooks.effects[k];
        if (!prev || depsChanged(prev.deps, deps)) {
          hooks.effects[k] = { deps };
          hooks.pending.push(fn);
        }
      },
    };
    const jsx = (type, props) => ({ type, props });
    const saved = { react: MOCKS.react, rt: MOCKS['react/jsx-runtime'] };
    MOCKS.react = fakeReact;
    MOCKS['react/jsx-runtime'] = { jsx, jsxs: jsx, Fragment: 'fragment' };
    delete require.cache[widgetPath];
    let Widget;
    try {
      Widget = require(widgetPath).TurnstileWidget;
    } finally {
      delete require.cache[widgetPath];
      if (saved.react === undefined) delete MOCKS.react;
      if (saved.rt === undefined) delete MOCKS['react/jsx-runtime'];
    }
    const calls = { render: [], reset: [], remove: [] };
    let cb = null;
    global.window = {
      turnstile: {
        render: (el, o) => (calls.render.push(o), (cb = o), 'wid-1'),
        reset: (id) => calls.reset.push(id),
        remove: (id) => calls.remove.push(id),
      },
    };
    const reported = [];
    const find = (node, pred) => {
      if (!node || typeof node !== 'object') return null;
      if (pred(node)) return node;
      const kids = node.props && node.props.children;
      for (const c of Array.isArray(kids) ? kids : [kids]) {
        const f = find(c, pred);
        if (f) return f;
      }
      return null;
    };
    const render = (resetKey) => {
      hooks.i = 0;
      const tree = Widget({ siteKey: TEST_SITE_KEY, action: 'login', resetKey, onToken: (t) => reported.push(t) });
      const effects = hooks.pending.splice(0);
      effects.forEach((fn) => fn());
      return tree;
    };
    try {
      let tree = render(null);
      const script = find(tree, (n) => n.props && n.props.src === SCRIPT_SRC);
      assert(script && script.props.strategy === 'afterInteractive', 'script element');
      hooks.refs[0].current = {}; // the slot <div>
      script.props.onReady();
      assert(calls.render.length === 1 && cb.sitekey === TEST_SITE_KEY && cb['response-field'] === false && cb.action === 'login', 'explicit render options');
      cb.callback(TOKEN);
      tree = render(null);
      assert(find(tree, (n) => n.type === 'input' && n.props.name === 'captchaToken').props.value === TOKEN, 'token not in the hidden field');
      assert(calls.reset.length === 0, 'reset before any submit');
      const failure1 = { error: 'x', code: 'invalid-credentials' }; // useActionState keeps one object per submit result
      tree = render(failure1); // a submit came back (failure)
      assert(calls.reset.length === 1 && calls.reset[0] === 'wid-1', `reset calls ${JSON.stringify(calls.reset)}`);
      tree = render(failure1); // a plain re-render must not reset again
      assert(find(tree, (n) => n.type === 'input' && n.props.name === 'captchaToken').props.value === '', 'spent token kept');
      assert(reported[reported.length - 1] === null, 'parent (Google button) not told the token is gone');
      tree = render({ error: 'y' }); // second failure → second reset
      assert(calls.reset.length === 2, 'second failure did not reset');
      cb['expired-callback']();
      render({ error: 'y' });
      assert(reported[reported.length - 1] === null, 'expiry not reported');
    } finally {
      delete global.window;
    }
    return `reset after each submit (${calls.reset.length}×); token cleared + reported`;
  });

  await test('T-10 ?m= allow-list: captcha-required / captcha-failed render their fixed texts (= action texts)', async () => {
    const nav = MOCKS['next/navigation'];
    const orig = nav.useSearchParams;
    captchaFlag(false);
    try {
      for (const c of ['captcha-required', 'captcha-failed']) {
        const n = msgs.authNotice(c);
        assert(n && n.tone === 'error' && n.text === msgs.AUTH_ERRORS[c], `${c}: ${JSON.stringify(n)}`);
        nav.useSearchParams = () => new URLSearchParams({ m: c });
        const html = await renderPage('login');
        assert(html.includes('data-auth-notice') && html.includes(n.text.replace(/'/g, '&#x27;')), `${c} not rendered`);
      }
      for (const bad of ['captcha', 'CAPTCHA-FAILED', 'captcha_failed', '<b>captcha-failed</b>']) assert(msgs.authNotice(bad) === null, `${bad} rendered`);
    } finally {
      nav.useSearchParams = orig;
    }
    return '2 codes; variants ignored';
  });

  console.error = origError;
}

function nonOffline() {
  return test('T-11 2b-1 Google suite 17/17 with the CAPTCHA flag off AND on', () => {
    const out = [];
    for (const on of [false, true]) {
      const env = { ...process.env };
      delete env.AUTH_CAPTCHA_ENABLED;
      delete env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      if (on) Object.assign(env, { AUTH_CAPTCHA_ENABLED: 'true', NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY });
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test_auth1_2b1.cjs')], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000 });
      const m = (r.stdout || '').match(/AUTH-1 2b-1: (\d+)\/(\d+) passed/);
      assert(r.status === 0 && m && m[1] === '17' && m[2] === '17', `captcha ${on ? 'on' : 'off'}: exit ${r.status} ${m ? m[0] : '(no summary)'}`);
      out.push(`${on ? 'on' : 'off'} 17/17`);
    }
    return out.join(', ');
  });
}

function templates() {
  return test('T-12 email templates: token_hash → /auth/confirm, accepted type, https only, allow-listed links + images only, no ConfirmationURL', () => {
    const route = read('app/auth/confirm/route.ts');
    const typeSet = new Set([...(route.match(/new Set<EmailOtpType>\(\[([^\]]+)\]\)/) || [])[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    assert(typeSet.size === 5, `route types: ${[...typeSet]}`);
    assert(/searchParams\.get\("token_hash"\)/.test(route) && /searchParams\.get\("type"\)/.test(route) && /searchParams\.get\("next"\)/.test(route), 'route params changed');
    const WANT = { 'confirm-signup': 'email', 'reset-password': 'recovery', 'magic-link': 'email', 'change-email': 'email_change', invite: 'invite' };
    const out = [];
    for (const [name, type] of Object.entries(WANT)) {
      const s = read(`docs/auth/email-templates/${name}.html`);
      // EMAIL AMENDMENT (2026-10-27): ONE allow-list shared with BRAND-2 C-11 and BRAND-1 B-05 (scripts/lib/email-allowlist.cjs)
      const AL = require(path.join(ROOT, 'scripts/lib/email-allowlist.cjs'));
      const hrefs = AL.hrefsOf(s).filter((h) => AL.CONFIRM_RE.test(h));
      assert(hrefs.length === 2, `${name}: ${hrefs.length} confirm links (want button + fallback)`);
      for (const h of hrefs) {
        const m = h.match(AL.CONFIRM_RE);
        assert(m[1] === type && typeSet.has(m[1]), `${name}: type ${m[1]} (want ${type}, route accepts ${[...typeSet]})`);
        const sanitize = require(path.join(ROOT, 'lib/auth/safe-redirect.ts')).sanitizeRedirectPath;
        assert(sanitize(m[2], '') === m[2], `${name}: next ${m[2]} not kept by the sanitizer`);
      }
      const al = AL.checkTemplate(s, null);
      assert(al.length === 0, `${name}: ${al.join('; ')}`);
      assert(s.includes('{{ .TokenHash }}'), `${name}: no TokenHash`);
      assert(!/http:\/\//i.test(s), `${name}: http:// link`);
      assert(!s.includes('ConfirmationURL'), `${name}: ConfirmationURL used`);
      assert(s.includes('no-reply@couragelibrary.in') && s.includes('Courage Library'), `${name}: branding / sender`);
      if (type === 'recovery') assert(hrefs.every((h) => h.endsWith('next=/auth/update-password')), 'recovery next');
      out.push(`${name}:${type}`);
    }
    // the allow-list rejects everything else (self-test on a real template, mutated)
    const AL = require(path.join(ROOT, 'scripts/lib/email-allowlist.cjs'));
    const base = read('docs/auth/email-templates/confirm-signup.html');
    const confirmUrl = '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard';
    assert(AL.checkTemplate(base, confirmUrl).length === 0, 'allow-list self-test baseline');
    const mutants = {
      utm: base.replace('href="https://couragelibrary.in/"', 'href="https://couragelibrary.in/?utm_source=email"'),
      otherLink: base.replace('href="https://cnts.couragelibrary.in/"', 'href="https://example.com/"'),
      otherImage: base.replace('https://couragelibrary.in/email/strip-cnts.png', 'https://cdn.example.com/x.png'),
      noAlt: base.replace(/alt="Courage Library"/, 'alt=""'),
      noHeight: base.replace('height="120"', ''),
      thirdConfirm: base.replace('</body>', `<a href="${confirmUrl}">again</a></body>`),
      cssUrl: base.replace('</style>', '.x{background:url(https://couragelibrary.in/email/banner.png)}</style>'),
    };
    for (const [k, m] of Object.entries(mutants)) assert(AL.checkTemplate(m, confirmUrl).length > 0, `allow-list accepted the ${k} mutant`);
    // the paste file (docs/email-assets/SUPABASE_TEMPLATES.md) carries exactly the repo copies (minus the header comment)
    const paste = read('docs/email-assets/SUPABASE_TEMPLATES.md');
    for (const n of Object.keys(WANT)) assert(paste.includes(read(`docs/auth/email-templates/${n}.html`).replace(/<!--[\s\S]*?-->\n/, '')), `SUPABASE_TEMPLATES.md out of sync with ${n}.html (re-run scripts/email/build-auth-templates.cjs)`);
    const doc = read('docs/auth/EMAIL_TEMPLATES.md');
    assert(Object.keys(WANT).every((n) => doc.includes(`email-templates/${n}.html`)) && /no-reply@couragelibrary\.in/.test(doc), 'EMAIL_TEMPLATES.md incomplete');
    return out.join(', ');
  });
}

function secrets() {
  return test('T-13 secret gate: Turnstile-secret-looking values and the Google client-secret prefix occur 0 times in tracked files', () => {
    const { scanText } = require('./test_no_personal_data.cjs');
    const ls = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
    const files = ls.stdout.split('\0').filter(Boolean).filter((f) => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz|bundle)$/i.test(f));
    assert(files.length >= 500, `only ${files.length} files`);
    let ts = 0;
    let g = 0;
    for (const f of files) {
      let text;
      try {
        text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      } catch {
        continue;
      }
      const r = scanText(text, f);
      ts += r['turnstile-secret'] || 0;
      g += r['google-client-secret'] || 0;
    }
    assert(ts === 0 && g === 0, `turnstile-secret ${ts}, google-client-secret ${g}`);
    // the detector itself works (assembled at runtime so this file stays clean)
    assert(scanText(`S=${['1x', '0'.repeat(31), 'AA'].join('')}`, 'x')['turnstile-secret'] === 1, 'detector misses the test-secret shape');
    assert(!scanText(`K=${TEST_SITE_KEY}`, 'x')['turnstile-secret'], 'site key flagged as a secret');
    return `0 / 0 in ${files.length} files (tracked + new)`;
  });
}

function staticChecks() {
  return test('T-14 static: no Turnstile secret / siteverify in app code; tokens never logged; Google 2b-1 flow intact', () => {
    const FILES = ['lib/auth/captcha.ts', 'components/auth/turnstile-widget.tsx', 'app/auth/actions.ts', 'app/auth/google-actions.ts', 'components/auth/google-signin-button.tsx', 'app/auth/login/page.tsx', 'app/auth/login/login-form.tsx', 'app/auth/signup/page.tsx', 'app/auth/signup/signup-form.tsx', 'app/auth/forgot-password/page.tsx', 'app/auth/forgot-password/forgot-password-form.tsx'];
    const bad = [];
    for (const f of FILES) {
      const s = code(read(f));
      if (/TURNSTILE_SECRET|CAPTCHA_SECRET|siteverify|secret_?key/i.test(s)) bad.push(`${f}: secret / siteverify`);
      for (const m of s.matchAll(/console\.(log|error|warn|info)\(([^;]*)\);/g)) if (/captcha|token|credential|nonce|email|cookie/i.test(m[2].replace(/"[^"]*"/g, ''))) bad.push(`${f}: logs ${m[2].slice(0, 40)}`);
    }
    const ga = code(read('app/auth/google-actions.ts'));
    const order = ['isGoogleSignInEnabled()', 'isWellFormedIdToken(credential)', 'checkCaptchaToken(captchaToken)', 'consumeNonce()', 'signInWithIdToken('].map((k) => ga.indexOf(k));
    assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `Google action order changed: ${order}`);
    const mw = code(read('middleware.ts'));
    assert(/request\.method === "GET" && request\.nextUrl\.pathname === "\/auth\/login" && isGoogleSignInEnabled\(\)/.test(mw) && !/captcha/i.test(mw), 'middleware changed');
    const pages = ['app/auth/login/page.tsx', 'app/auth/signup/page.tsx', 'app/auth/forgot-password/page.tsx'].map((f) => read(f));
    assert(pages.every((p) => /isCaptchaEnabled\(\)/.test(p) && !/^"use client"/.test(p.replace(/^﻿/, ''))), 'flag not evaluated in a server page');
    const pkg = JSON.parse(read('package.json'));
    assert(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /turnstile|captcha/i.test(d)), 'a Turnstile / captcha package was added (#44)');
    assert(bad.length === 0, bad.join('; '));
    return `${FILES.length} files; Google order flag → shape → captcha → nonce → Supabase`;
  });
}

// ---------- probe: the local production build (scripts/live/with-server.cjs sets BASE_URL) ----------
async function probe() {
  const base = process.env.BASE_URL;
  assert(base && /^http:\/\/localhost:\d+$/.test(base), 'BASE_URL must be the local server (with-server.cjs)');
  const expectOn = process.env.AUTH_CAPTCHA_ENABLED === 'true' && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  await test(`P-01 real server, flag ${expectOn ? 'ON' : 'OFF'}: login / signup / forgot-password Turnstile markup`, async () => {
    const out = [];
    for (const p of ['/auth/login', '/auth/signup', '/auth/forgot-password']) {
      let html = '';
      for (let i = 1; i <= 3; i++) {
        try {
          const res = await fetch(base + p, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
          assert(res.status === 200, `${p}: HTTP ${res.status}`);
          html = await res.text();
          break;
        } catch (e) {
          if (i === 3) throw e;
        }
      }
      const script = html.includes('challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
      const widget = html.includes('data-turnstile');
      const field = html.includes('name="captchaToken"');
      const formShown = p !== '/auth/signup' || !html.includes('data-signup-closed');
      const want = expectOn && formShown;
      assert(script === want && widget === want && field === want, `${p}: script ${script}, widget ${widget}, field ${field} (want ${want})`);
      if (!want) assert(!html.includes('challenges.cloudflare.com'), `${p}: Cloudflare referenced with the widget off`);
      out.push(`${p} ${want ? 'widget' : 'none'}${formShown ? '' : ' (sign-up closed)'}`);
    }
    return out.join('; ');
  });
}

(async () => {
  console.log(`AUTH-1 2b-2 Turnstile + email templates (${PROBE ? 'probe' : 'offline'})`);
  if (PROBE) await probe();
  else {
    await offline();
    await nonOffline();
    await templates();
    await secrets();
    await staticChecks();
  }
  console.log(`\nAUTH-1 2b-2: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(`AUTH-1 2b-2 SUITE ERROR ${e && e.message}`);
  process.exit(2);
});
