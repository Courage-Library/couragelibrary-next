#!/usr/bin/env node
/**
 * CI-FIX-1 (decision #74) offline unit test for scripts/live/qa-session.cjs — no network: every Supabase client is a
 * fake injected through `deps`.
 *   Q-01 a non-QA / non-.test e-mail is refused BEFORE any client is created or any request is made
 *   Q-02 a project ref other than couragelibrary-next (e.g. legacy) is refused before any client is created
 *   Q-03 happy path: generateLink(magiclink) → verifyOtp(type 'email', token_hash) → session for the right user
 *   Q-04 a missing QA identity is refused and generateLink is NEVER called (it would create the user)
 *   Q-05 a captcha error on /verify → QA_SESSION_VERIFY_CAPTCHA_GATED (the CI hard-stop signal)
 *   Q-06 fallback: type 'email' rejected → a FRESH hashed token is verified with the deprecated 'magiclink' type
 *   Q-07 nothing secret is ever printed or put into error messages (console + errors spied: tokens, hashes, e-mail)
 *   Q-08 qaCookies: cookies come from @supabase/ssr's own writer, carry the auth-token name, scoped to the base URL
 *   Q-09 no password sign-in API is used by the helper (static)
 *   Q-13 (CI-LEAN-1 root cause) supabase-js clients construct on Node < 22 once the helper is loaded (WebSocket stand-in)
 *   Q-14 (CI-LEAN-1) scripts that use the helper never sign out (any scope revokes the shared job session on the server)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const H = require('./live/qa-session.cjs');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 600)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

// ---------- fakes ----------
const GOOD_REF = 'abcdefghijklmnopqrst';
const EMAIL = 'qa-student@courage-library.test';
const SECRETS = { access: 'ACCESS-TOKEN-q4z', refresh: 'REFRESH-TOKEN-q4z', hash1: 'HASH-ONE-q4z', hash2: 'HASH-TWO-q4z', link: 'https://x.test/verify?token=LINK-q4z' };
const makeEnv = (ref) => (k) => ({ NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-q4z', SUPABASE_SERVICE_ROLE_KEY: 'service-key-q4z' })[k];
function makeDeps({ ref = GOOD_REF, userExists = true, verify = 'ok' } = {}) {
  const calls = { createClient: 0, generateLink: [], verifyOtp: [], findUser: 0, setSession: 0 };
  let hashN = 0;
  const supabase = {
    createClient: () => {
      calls.createClient++;
      return {
        auth: {
          admin: {
            generateLink: async (args) => {
              calls.generateLink.push(args);
              hashN++;
              return { data: { properties: { hashed_token: hashN === 1 ? SECRETS.hash1 : SECRETS.hash2, action_link: SECRETS.link } }, error: null };
            },
          },
          verifyOtp: async (args) => {
            calls.verifyOtp.push(args);
            if (verify === 'captcha') return { data: {}, error: { status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed' } };
            if (verify === 'email-rejected' && args.type === 'email') return { data: {}, error: { status: 403, code: 'otp_expired', message: 'Email link is invalid or has expired' } };
            return { data: { session: { access_token: SECRETS.access, refresh_token: SECRETS.refresh, expires_at: 1 }, user: { email: EMAIL } }, error: null };
          },
          setSession: async () => {
            calls.setSession++;
            return { error: null };
          },
        },
      };
    },
  };
  const genTypes = {
    refFromPublicUrl: (env) => new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0],
    // the real ref lock compares a sha256 fingerprint; the fake accepts exactly GOOD_REF and refuses everything else
    assertProjectRef: (r) => {
      if (r !== GOOD_REF) throw new Error('REF_LOCK: project ref is not couragelibrary-next — refusing to run');
      return r;
    },
  };
  const findUser = { findUserByEmail: async () => (calls.findUser++, userExists ? { id: 'uid-q4z', email: EMAIL } : null) };
  return { calls, deps: { env: makeEnv(ref), genTypes, supabase, findUser } };
}

const logs = [];
const orig = { log: console.log, error: console.error, warn: console.warn };
const spyOn = () => {
  logs.length = 0;
  console.error = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
};
const spyOff = () => Object.assign(console, { error: orig.error, warn: orig.warn });

(async () => {
  console.log('QA session helper (CI-FIX-1, decision #74)');

  await test('Q-01 a non-QA / non-.test e-mail is refused before any client or request', async () => {
    // look-alike domains are assembled at runtime so this file carries no non-reserved address literal (no-personal-data gate)
    const at = (local, domain) => [local, domain].join('@');
    const bad = ['someone@example.com', at('qa-student', ['courage-library', 'com'].join('.')), at('qa-student', ['courage-library.test', 'evil', 'com'].join('.')), 'admin@courage-library.test', '', null, 'QA-STUDENT@courage-library.test '];
    let n = 0;
    for (const e of bad) {
      const { calls, deps } = makeDeps();
      const isAllowedVariant = String(e || '').trim().toLowerCase() === EMAIL;
      try {
        await H.qaSession(e, deps);
        if (!isAllowedVariant) throw new Error(`accepted ${JSON.stringify(e)}`);
      } catch (err) {
        if (isAllowedVariant) throw err;
        assert(err.code === 'QA_SESSION_NOT_ALLOWED', `${JSON.stringify(e)} → ${err.code || err.message}`);
        assert(calls.createClient === 0 && calls.findUser === 0 && calls.generateLink.length === 0, 'a client / request happened');
        n++;
      }
    }
    return `${n} refused, 0 clients created`;
  });

  await test('Q-02 a project ref other than couragelibrary-next is refused before any client is created', async () => {
    const { calls, deps } = makeDeps({ ref: 'legacyprojectrefxxxxx' });
    let err = null;
    try {
      await H.qaSession(EMAIL, deps);
    } catch (e) {
      err = e;
    }
    assert(err && /REF_LOCK/.test(err.message), `got ${err && err.message}`);
    assert(calls.createClient === 0, 'client created before the ref lock');
    // the real ref lock refuses a fake ref too (sha256 fingerprint of couragelibrary-next)
    const real = require('./db/gen-types.cjs');
    let realErr = null;
    try {
      real.assertProjectRef('legacyprojectrefxxxxx');
    } catch (e) {
      realErr = e;
    }
    assert(realErr && /REF_LOCK/.test(realErr.message), 'real assertProjectRef accepted a foreign ref');
    return 'refused (fake + real lock)';
  });

  await test("Q-03 happy path: generateLink(magiclink) → verifyOtp(type 'email', token_hash) → session for the QA user", async () => {
    const { calls, deps } = makeDeps();
    const s = await H.qaSession(EMAIL, deps);
    assert(s.access_token === SECRETS.access && s.refresh_token === SECRETS.refresh, 'session tokens');
    assert(calls.generateLink.length === 1 && calls.generateLink[0].type === 'magiclink' && calls.generateLink[0].email === EMAIL, 'generateLink args');
    assert(!('password' in calls.generateLink[0]) && !('options' in calls.generateLink[0]), 'generateLink must carry no password / options');
    assert(calls.verifyOtp.length === 1 && calls.verifyOtp[0].type === 'email' && calls.verifyOtp[0].token_hash === SECRETS.hash1, 'verifyOtp args');
    return '1 link, 1 verify';
  });

  await test('Q-04 a missing QA identity is refused and generateLink is never called (it would create the user)', async () => {
    const { calls, deps } = makeDeps({ userExists: false });
    let err = null;
    try {
      await H.qaSession(EMAIL, deps);
    } catch (e) {
      err = e;
    }
    assert(err && err.code === 'QA_SESSION_IDENTITY_MISSING', `got ${err && (err.code || err.message)}`);
    assert(calls.generateLink.length === 0, 'generateLink called for a missing user');
    return 'refused';
  });

  await test('Q-05 a captcha error on /verify → QA_SESSION_VERIFY_CAPTCHA_GATED (hard-stop signal)', async () => {
    const { deps } = makeDeps({ verify: 'captcha' });
    let err = null;
    try {
      await H.qaSession(EMAIL, deps);
    } catch (e) {
      err = e;
    }
    assert(err && err.code === 'QA_SESSION_VERIFY_CAPTCHA_GATED', `got ${err && (err.code || err.message)}`);
    return err.code;
  });

  await test("Q-06 fallback: 'email' rejected → a fresh hashed token verified with the deprecated 'magiclink' type", async () => {
    const { calls, deps } = makeDeps({ verify: 'email-rejected' });
    const s = await H.qaSession(EMAIL, deps);
    assert(s.access_token === SECRETS.access, 'no session');
    assert(calls.generateLink.length === 2, `generateLink ${calls.generateLink.length}× (want a fresh token)`);
    assert(calls.verifyOtp[1].type === 'magiclink' && calls.verifyOtp[1].token_hash === SECRETS.hash2, 'second verify must use the FRESH hash');
    return 'fresh token for the fallback';
  });

  await test('Q-07 nothing secret is printed or put into error messages (tokens, hashes, links, e-mail)', async () => {
    spyOn();
    const msgs = [];
    try {
      for (const opt of [{}, { verify: 'captcha' }, { userExists: false }, { verify: 'email-rejected' }]) {
        const { deps } = makeDeps(opt);
        try {
          await H.qaSession(EMAIL, deps);
        } catch (e) {
          msgs.push(String(e.message), String(e.stack || ''));
        }
      }
      try {
        await H.qaSession('someone@example.com', makeDeps().deps);
      } catch (e) {
        msgs.push(String(e.message));
      }
    } finally {
      spyOff();
    }
    const all = [...logs, ...msgs].join('\n');
    const leaked = [...Object.values(SECRETS), EMAIL, 'someone@example.com', 'service-key-q4z', 'anon-key-q4z'].filter((s) => all.includes(s));
    assert(leaked.length === 0, `leaked ${leaked.length} secret value(s)`);
    assert(logs.length === 0, `${logs.length} console line(s) written by the helper`);
    return `${msgs.length} error texts checked, 0 console lines`;
  });

  await test("Q-08 qaCookies: written by @supabase/ssr's own cookie writer, auth-token name, scoped to the base URL", async () => {
    const { deps } = makeDeps();
    let setAllUsed = false;
    deps.ssr = {
      createServerClient: (url, key, opts) => ({
        auth: {
          setSession: async () => {
            setAllUsed = true;
            opts.cookies.setAll([{ name: `sb-${GOOD_REF}-auth-token`, value: 'base64-COOKIE', options: { path: '/', httpOnly: false } }]);
            return { error: null };
          },
        },
      }),
    };
    const cookies = await H.qaCookies(EMAIL, 'http://localhost:3100/some/path', deps);
    assert(setAllUsed, 'the ssr client did not write the cookie');
    assert(cookies.length === 1 && cookies[0].name === `sb-${GOOD_REF}-auth-token` && cookies[0].url === 'http://localhost:3100', JSON.stringify(cookies.map((c) => [c.name, c.url])));
    return 'ssr-written, origin-scoped';
  });

  await test('Q-09 the helper never uses a password sign-in API (static)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/live/qa-session.cjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert(!/signInWithPassword|grant_type=password|password\s*:/.test(src), 'password sign-in found');
    assert(/generateLink\(\{ type: 'magiclink', email: e \}\)/.test(src) && /verifyOtp\(\{ type: 'email', token_hash: tokenHash \}\)/.test(src), 'magic-link flow changed');
    assert(crypto.createHash('sha256').update(H.QA_IDENTITIES.join(',')).digest('hex').length === 64 && H.QA_IDENTITIES.length === 3 && H.QA_IDENTITIES.every((e) => e.endsWith('@courage-library.test')), 'allow-list');
    return '3 QA identities, magic link only';
  });

  await test('Q-10 (CI-LEAN-1) job session cache: one mint per identity, 0600 file, not reused near expiry, bypassed by noCache', async () => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cache-'));
    const prev = process.env.QA_SESSION_CACHE_DIR;
    process.env.QA_SESSION_CACHE_DIR = dir;
    try {
      const A = makeDeps();
      const now = Math.floor(Date.now() / 1000);
      // fresh tokens valid for an hour
      A.deps.supabase = { createClient: (...args) => { const c = makeDeps().deps.supabase.createClient(...args); const v = c.auth.verifyOtp; c.auth.verifyOtp = async (x) => { A.calls.verifyOtp.push(x); const r = await v(x); r.data.session.expires_at = now + 3600; return r; }; return c; } };
      await H.qaSession(EMAIL, A.deps);
      await H.qaSession(EMAIL, A.deps);
      assert(A.calls.verifyOtp.length === 1, `minted ${A.calls.verifyOtp.length}× (want 1, then cache)`);
      const files = fs.readdirSync(dir);
      assert(files.length === 1 && !files[0].includes('qa-student'), 'cache file name must not contain the e-mail');
      if (process.platform !== 'win32') assert((fs.statSync(path.join(dir, files[0])).mode & 0o777) === 0o600, 'cache file not 0600');
      await H.qaSession(EMAIL, { ...A.deps, noCache: true });
      assert(A.calls.verifyOtp.length === 2, 'noCache did not mint fresh');
      // near expiry (< 15 min) → not reused
      fs.writeFileSync(path.join(dir, files[0]), JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: now + 600 }));
      await H.qaSession(EMAIL, A.deps);
      assert(A.calls.verifyOtp.length === 3, 'a nearly expired cached session was reused');
    } finally {
      if (prev === undefined) delete process.env.QA_SESSION_CACHE_DIR;
      else process.env.QA_SESSION_CACHE_DIR = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
    return '1 mint / identity; 0600; expiry + noCache honoured';
  });

  await test('Q-11 (CI-LEAN-1) HTTP 429 → exactly one bounded retry; other errors are not retried', async () => {
    const { calls, deps } = makeDeps();
    let n = 0;
    const base = deps.supabase.createClient;
    deps.supabase = { createClient: (...args) => { const c = base(...args); const g = c.auth.admin.generateLink; c.auth.admin.generateLink = async (x) => (++n === 1 ? { data: null, error: { status: 429, message: 'rate limited' } } : g(x)); return c; } };
    deps.retryDelayMs = 0;
    const s = await H.qaSession(EMAIL, deps);
    assert(s.access_token === SECRETS.access && n === 2, `generateLink ${n}×`);
    const B = makeDeps({ verify: 'captcha' });
    B.deps.retryDelayMs = 0;
    let err = null;
    try {
      await H.qaSession(EMAIL, B.deps);
    } catch (e) {
      err = e;
    }
    assert(err && err.code === 'QA_SESSION_VERIFY_CAPTCHA_GATED' && B.calls.generateLink.length === 1, 'a non-429 error was retried');
    return `429 → retried once (${calls.generateLink.length + n} link calls)`;
  });

  await test('Q-12 (CI-LEAN-1) diagnostics: only with QA_SESSION_DIAG=1, one line, fixed code + status, nothing secret', async () => {
    const out = [];
    const prevLog = console.log;
    const prev = process.env.QA_SESSION_DIAG;
    try {
      console.log = (...a) => out.push(a.join(' '));
      delete process.env.QA_SESSION_DIAG;
      await H.qaSession(EMAIL, makeDeps({ verify: 'captcha' }).deps).catch(() => {});
      assert(out.length === 0, 'printed without QA_SESSION_DIAG=1');
      process.env.QA_SESSION_DIAG = '1';
      await H.qaSession(EMAIL, makeDeps({ verify: 'captcha' }).deps).catch(() => {});
    } finally {
      console.log = prevLog;
      if (prev === undefined) delete process.env.QA_SESSION_DIAG;
      else process.env.QA_SESSION_DIAG = prev;
    }
    assert(out.length === 1 && /^ {2}FAIL {2}QS-VERIFYCAPTCHAGATED-400 \(qa-session mint failed\)$/.test(out[0]), JSON.stringify(out));
    assert(![...Object.values(SECRETS), EMAIL].some((v) => out[0].includes(v)), 'secret in the diagnostic line');
    return out[0].trim();
  });

  await test('Q-13 (CI-LEAN-1 root cause) real supabase-js clients can be created on Node < 22 once the helper is loaded', () => {
    const src = fs.readFileSync(path.join(__dirname, 'live', 'qa-session.cjs'), 'utf8');
    const shim = src.indexOf("if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = class DummyWebSocket {};");
    assert(shim > 0 && shim < src.indexOf("require('@supabase/supabase-js')") && shim < src.indexOf("require('@supabase/ssr')"), 'WebSocket stand-in must be installed at module load, before any supabase require');
    // behaviour: with the helper loaded, the REAL library constructs a client (no network on construction)
    require(path.join(__dirname, 'live', 'qa-session.cjs'));
    const { createClient } = require('@supabase/supabase-js');
    createClient('https://example.invalid', 'k', { auth: { persistSession: false, autoRefreshToken: false } });
    return `node ${process.versions.node}: client constructed`;
  });

  await test('Q-14 (CI-LEAN-1) no script that uses the QA session helper signs out at all (any scope revokes the shared job session)', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.c?js$/.test(e.name) ? [path.join(d, e.name)] : []));
    // qa-session.cjs itself is excluded: its probe signs out only its own FRESH (noCache) session
    const users = walk(__dirname).filter((f) => /qa-session/.test(fs.readFileSync(f, 'utf8')) && !/test_qa_session\.cjs$|[\\/]live[\\/]qa-session\.cjs$/.test(f));
    assert(users.length >= 8, `scripts using the helper: ${users.length} (min 8)`);
    const bad = [];
    for (const f of users) {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const m of src.matchAll(/\.signOut\(([^)]*)\)/g)) bad.push(`${path.relative(__dirname, f)}: signOut(${m[1]})`);
    }
    assert(bad.length === 0, bad.join('; '));
    return `${users.length} scripts; no sign-out on shared sessions`;
  });

  console.log(`\nQA session helper: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
