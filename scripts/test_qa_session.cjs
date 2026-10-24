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
    const bad = ['someone@example.com', 'qa-student@courage-library.com', 'qa-student@courage-library.test.evil.com', 'admin@courage-library.test', '', null, 'QA-STUDENT@courage-library.test '];
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

  console.log(`\nQA session helper: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
