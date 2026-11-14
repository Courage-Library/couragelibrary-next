#!/usr/bin/env node
/**
 * AUTH-HARDEN-1 — offline gate (TS transpile + mocks; no network, no secrets).
 * Google ID-token path: a NEW account (no profile row yet) follows the email sign-up's rules, server-side.
 *   H-01 new account + registrations closed (AUTH_SIGNUP_ENABLED=false) → signup-closed; signed out; the just-created
 *        account removed; no profile, no redirect
 *   H-02 new account + 18+ gate on + no 18+ box (missing / false / "on" / "true" / 1) → age-required; same handling
 *   H-03 new account + 18+ gate on + box ticked (exactly true) → let in; profile created; 18+ recorded
 *   H-04 EXISTING account (has a profile) with registrations closed AND the gate on AND no box → let in exactly as
 *        before: no sign-out, no removal, no 18+ prompt here (the middleware gate handles existing users)
 *   H-05 the new-account lookup fails → generic, signed out, no profile (fails closed)
 *   H-06 Supabase settings unreadable ("unknown") → treated as open, like the email sign-up
 *   H-07 removal guards (pure): Google-only identities + created < 2 min + no profile — anything else is kept
 *   H-08 login page: the 18+ box next to Google only while registrations are open AND the gate is on; ?m=age-required
 *        renders the same fixed text as the action
 *   H-09 negative controls: the action with the new-account check removed / the refusal ignored / the profile created
 *        before the check → H-01 / H-02 FAIL (static order check catches each mutation)
 * CI MFA (QA admin / staff, owner decision 2026-11-14: no exemptions):
 *   H-10 TOTP helper = RFC 6238 test vectors (SHA-1); a non-base32 secret throws without echoing it
 *   H-11 qa-session elevateToAal2 (mocked Supabase): verified factor + right code → AAL2 tokens; a rejected first code
 *        → one retry with the next step's code; no factor → MFA_NOT_ENROLLED; wrong secret → MFA_CODE_REJECTED; network
 *        → MFA_VERIFY_FAILED; the secret and the codes never appear in any error; the student never has a secret
 *   H-12 secrets: QA_ADMIN_TOTP_SECRET / QA_STAFF_TOTP_SECRET reach the two live jobs ONLY from GitHub secrets; both are
 *        in log-scan's secret list; nothing in scripts/lib/totp.cjs or qa-session.cjs logs a secret or a code
 *   H-13 CI switch: workflow_dispatch input admin_mfa (default false) → ADMIN_MFA_REQUIRED for the live jobs' server
 * Run: node scripts/test_auth_harden1.cjs
 */
require('./db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 1200)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const GOOD_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJoMSJ9.c2lnbmF0dXJl';
const CLIENT_ID = 'harden1-client.apps.googleusercontent.com';

(async () => {
  // ---------- harness (as scripts/test_auth1_2b1.cjs): TS transpile + @/ alias + mocks ----------
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

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://harden1-test.example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  process.env.AUTH_GOOGLE_ENABLED = 'true';
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
  delete process.env.AUTH_CAPTCHA_ENABLED;

  const jar = new Map();
  const spy = { signOut: 0, deleted: [], profiles: [], ageRecorded: 0, logs: [] };
  const world = { user: null, hasProfile: false, lookupError: false, settings: { disable_signup: false }, settingsFail: false };
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
    'next/script': { __esModule: true, default: (p) => React.createElement('script', { src: p.src }) },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({
        auth: {
          signInWithIdToken: async () => ({ data: { user: world.user, session: {} }, error: null }),
          getUser: async () => ({ data: { user: world.user }, error: null }),
          signOut: async () => (spy.signOut++, { error: null }),
        },
      }),
      createAdminServerSupabaseClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (world.lookupError ? { data: null, error: { message: 'x' } } : { data: world.hasProfile ? { id: world.user.id } : null, error: null }) }) }) }),
        auth: { admin: { deleteUser: async (id) => (spy.deleted.push(id), { error: null }) } },
      }),
    },
    '@/services/user-profile.service': { UserProfileService: { ensureProfile: async (u) => (spy.profiles.push(u), null) } },
    '@/lib/auth/age-confirm': {
      recordAgeConfirmation: async () => (spy.ageRecorded++, true),
      syncAgeConfirmationOnSignIn: async () => undefined,
    },
  };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
    return origLoad.call(this, request, parent, isMain);
  };
  // Supabase public settings (getSignupAvailability): mocked fetch, never the network
  global.fetch = async () => {
    if (world.settingsFail) throw new TypeError('fetch failed');
    return { ok: true, json: async () => world.settings };
  };
  const origError = console.error;
  console.error = (...a) => spy.logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));

  const core = require(path.join(ROOT, 'lib/auth/google-nonce-core.ts'));
  const signin = require(path.join(ROOT, 'lib/auth/google-signin.ts'));
  const messages = require(path.join(ROOT, 'lib/auth/messages.ts'));
  const actions = require(path.join(ROOT, 'app/(site)/auth/google-actions.ts'));

  const newUser = (over = {}) => ({ id: 'h1-new', email: 'h1@example.test', created_at: new Date(Date.now() - 3000).toISOString(), identities: [{ provider: 'google' }], app_metadata: {}, user_metadata: {}, ...over });
  const reset = (over = {}) => {
    spy.signOut = 0;
    spy.deleted.length = 0;
    spy.profiles.length = 0;
    spy.ageRecorded = 0;
    spy.logs.length = 0;
    Object.assign(world, { user: newUser(), hasProfile: false, lookupError: false, settings: { disable_signup: false }, settingsFail: false }, over);
  };
  const env = ({ signup, age }) => {
    if (signup === false) process.env.AUTH_SIGNUP_ENABLED = 'false';
    else delete process.env.AUTH_SIGNUP_ENABLED;
    if (age) process.env.AGE_GATE_ENABLED = 'true';
    else delete process.env.AGE_GATE_ENABLED;
  };
  const call = async (ageConfirmed) => {
    jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
    try {
      return { result: await actions.signInWithGoogleAction(GOOD_TOKEN, '/dashboard', undefined, ageConfirmed) };
    } catch (e) {
      if (e instanceof RedirectSignal) return { redirect: e.url };
      throw e;
    }
  };

  await test('H-01 NEW Google account + registrations closed → signup-closed; signed out; just-created account removed; no profile', async () => {
    reset();
    env({ signup: false, age: false });
    const r = await call(true);
    assert(r.result && r.result.code === 'signup-closed', JSON.stringify(r));
    assert(spy.signOut === 1 && spy.deleted.length === 1 && spy.profiles.length === 0, JSON.stringify(spy));
    // the Supabase project switch alone closes it too
    reset({ settings: { disable_signup: true } });
    env({ signup: true, age: false });
    const r2 = await call(true);
    assert(r2.result && r2.result.code === 'signup-closed' && spy.profiles.length === 0, `project switch: ${JSON.stringify(r2)}`);
    assert(!spy.logs.join(' ').includes('h1@example.test') && !spy.logs.join(' ').includes('h1-new'), 'an e-mail or id was logged');
    return 'app flag + project switch → refused';
  });

  await test('H-02 NEW Google account + 18+ gate on + no 18+ box → age-required; signed out; removed; no profile', async () => {
    const inputs = [undefined, false, 'on', 'true', 1, null];
    for (const v of inputs) {
      reset();
      env({ signup: true, age: true });
      const r = await call(v);
      assert(r.result && r.result.code === 'age-required', `${JSON.stringify(v)} → ${JSON.stringify(r)}`);
      assert(spy.signOut === 1 && spy.deleted.length === 1 && spy.profiles.length === 0 && spy.ageRecorded === 0, JSON.stringify(spy));
    }
    return `${inputs.length} non-true inputs refused`;
  });

  await test('H-03 NEW Google account + gate on + box ticked → let in; profile created; 18+ recorded', async () => {
    reset();
    env({ signup: true, age: true });
    const r = await call(true);
    assert(r.redirect === '/dashboard', JSON.stringify(r));
    assert(spy.profiles.length === 1 && spy.ageRecorded === 1 && spy.signOut === 0 && spy.deleted.length === 0, JSON.stringify(spy));
    // gate off: a new account needs no box
    reset();
    env({ signup: true, age: false });
    const r2 = await call(undefined);
    assert(r2.redirect === '/dashboard' && spy.profiles.length === 1 && spy.ageRecorded === 0, JSON.stringify(r2));
    return 'let in; 18+ recorded only when the gate is on';
  });

  await test('H-04 EXISTING account: closed registrations + gate on + no box → let in as before (no sign-out / removal / 18+ here)', async () => {
    reset({ hasProfile: true, user: newUser({ id: 'h1-old', created_at: '2026-01-01T00:00:00Z' }) });
    env({ signup: false, age: true });
    const r = await call(undefined);
    assert(r.redirect === '/dashboard', JSON.stringify(r));
    assert(spy.signOut === 0 && spy.deleted.length === 0 && spy.profiles.length === 1 && spy.ageRecorded === 0, JSON.stringify(spy));
    return 'unaffected';
  });

  await test('H-05 the new-account lookup fails → generic; signed out; no profile (fails closed)', async () => {
    reset({ lookupError: true });
    env({ signup: true, age: false });
    const r = await call(true);
    assert(r.result && r.result.code === 'generic' && spy.signOut === 1 && spy.profiles.length === 0 && spy.deleted.length === 0, JSON.stringify({ r, spy }));
    return 'fails closed';
  });

  await test('H-06 Supabase settings unreadable → "unknown" → treated as open (as the email sign-up)', async () => {
    reset({ settingsFail: true });
    env({ signup: true, age: false });
    const r = await call(undefined);
    assert(r.redirect === '/dashboard' && spy.profiles.length === 1, JSON.stringify(r));
    assert(signin.newGoogleAccountRefusal({ signup: 'unknown', ageGate: false, ageConfirmed: false }) === null, 'unknown must not refuse');
    return 'open';
  });

  await test('H-07 removal guards: only Google-only, created < 2 min, no profile — everything else is kept', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const at = (sec) => new Date(now - sec * 1000).toISOString();
    const ok = (u, prof = false) => signin.isRemovableRefusedGoogleAccount(u, prof, now);
    assert(ok({ created_at: at(5), identities: [{ provider: 'google' }] }) === true, 'fresh google-only');
    const kept = [
      [{ created_at: at(5), identities: [{ provider: 'google' }] }, true, 'has a profile'],
      [{ created_at: at(5), identities: [{ provider: 'google' }, { provider: 'email' }] }, false, 'linked e-mail identity'],
      [{ created_at: at(5), identities: [{ provider: 'email' }] }, false, 'e-mail only'],
      [{ created_at: at(5), identities: [] }, false, 'no identities'],
      [{ created_at: at(5) }, false, 'identities missing'],
      [{ created_at: at(600), identities: [{ provider: 'google' }] }, false, '10 min old'],
      [{ created_at: 'not a date', identities: [{ provider: 'google' }] }, false, 'bad date'],
      [{ created_at: new Date(now + 60000).toISOString(), identities: [{ provider: 'google' }] }, false, 'in the future'],
      [null, false, 'no user'],
    ];
    for (const [u, prof, why] of kept) assert(ok(u, prof) === false, `removed although: ${why}`);
    return `${kept.length} cases kept`;
  });

  await test('H-08 login page: 18+ box next to Google only while registrations open AND gate on; ?m=age-required = action text', async () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const loginPage = require(path.join(ROOT, 'app/(site)/auth/login/page.tsx')).default;
    // the page reads a nonce hash for the button: give it a fresh raw nonce on the "request"
    const out = {};
    for (const [signup, age] of [[true, true], [true, false], [false, true]]) {
      reset({ settings: { disable_signup: !signup } });
      env({ signup, age });
      jar.set(core.GOOGLE_NONCE_COOKIE, core.randomRawNonce());
      const html = renderToStaticMarkup(await loginPage());
      out[`${signup ? 'open' : 'closed'}/${age ? 'gate' : 'nogate'}`] = html.includes('data-google-age');
    }
    assert(out['open/gate'] === true && out['open/nogate'] === false && out['closed/gate'] === false, JSON.stringify(out));
    const n = messages.authNotice('age-required');
    assert(n && n.text === messages.AUTH_ERRORS['age-required'] && n.tone === 'error', 'notice text ≠ action text');
    return JSON.stringify(out);
  });

  /** static order check on the action: lookup → refusal (sign out + removal + return) → profile → 18+ record */
  function orderCheck(src) {
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // comments are not code
    const body = stripped.slice(stripped.indexOf('export async function signInWithGoogleAction'));
    const iLookup = body.indexOf('isNew = await isNewAccount(user.id)');
    const iRefusal = body.indexOf('const refusal = newGoogleAccountRefusal(');
    const iReturn = body.indexOf('return fail(refusal);');
    const iProfile = body.indexOf('await UserProfileService.ensureProfile(user)');
    if (iLookup < 0 || iRefusal < 0 || iReturn < 0 || iProfile < 0) return 'missing step';
    if (!(iLookup < iRefusal && iRefusal < iReturn && iReturn < iProfile)) return 'wrong order (the profile must come after the check)';
    if (!/if \(isNew\) \{\n\s+const refusal/.test(body)) return 'the refusal must apply to new accounts';
    const block = body.slice(iRefusal, iReturn);
    if (!/signOut\(/.test(block) || !/removeRefusedGoogleAccount\(user\)/.test(block)) return 'a refusal must sign out and remove';
    if (!/ageConfirmed: ageOk/.test(body) || !/const ageOk = ageConfirmed === true;/.test(body)) return 'only exactly true counts as 18+';
    return null;
  }

  await test('H-09 negative controls: mutated actions are caught (order / refusal ignored / check removed / lax 18+)', () => {
    const SRC = read('app/(site)/auth/google-actions.ts');
    assert(orderCheck(SRC) === null, `real source: ${orderCheck(SRC)}`);
    const muts = {
      'check removed': SRC.replace('    const refusal = newGoogleAccountRefusal(', '    const refusal = null && newGoogleAccountRefusal('),
      'refusal ignored': SRC.replace('      return fail(refusal);', '      // return fail(refusal);'),
      'profile before the check': SRC.replace('  // AUTH-HARDEN-1: a NEW account must pass the sign-up rules', '  await UserProfileService.ensureProfile(user);\n  // AUTH-HARDEN-1: a NEW account must pass the sign-up rules').replace(/\n  \/\/ insert-only profile \(#60\)[^\n]*\n  await UserProfileService\.ensureProfile\(user\);/, ''),
      'lax 18+ input': SRC.replace('const ageOk = ageConfirmed === true;', 'const ageOk = Boolean(ageConfirmed);'),
      'no sign-out on refusal': SRC.replace(/(const refusal = newGoogleAccountRefusal[\s\S]*?)await supabase\.auth\.signOut\(\{ scope: "local" \}\)\.catch\(\(\) => undefined\);/, '$1'),
    };
    for (const [k, m] of Object.entries(muts)) {
      assert(m !== SRC, `${k}: mutation did not apply`);
      assert(orderCheck(m) !== null, `${k}: not caught`);
    }
    return `${Object.keys(muts).length} mutations caught`;
  });

  console.error = origError;

  // ---------- CI MFA ----------
  const { totp, hotp, base32Decode } = require('./lib/totp.cjs');
  await test('H-10 TOTP = RFC 6238 test vectors (SHA-1); a non-base32 secret throws without echoing it', () => {
    const key = Buffer.from('12345678901234567890');
    const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
    for (const [t, want] of vectors) assert(hotp(key, Math.floor(t / 30), 8) === want, `t=${t}`);
    assert(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', { time: 59000 }) === '287082', 'base32 path');
    assert(base32Decode('gezd gnbv-gy3t qojq').equals(Buffer.from('1234567890')), 'base32 tolerant of case / spaces / dashes');
    try {
      totp('NOT*BASE32-SECRET-XYZ1', { time: 0 });
      throw new Error('accepted a bad secret');
    } catch (e) {
      assert(!String(e.message).includes('NOT*BASE32') && /not base32/.test(e.message), e.message);
    }
    return `${vectors.length} vectors`;
  });

  await test('H-11 elevateToAal2: right code → AAL2; rejected first code → one retry; not enrolled / wrong secret / network → fixed codes; no secret in errors', async () => {
    const qa = require('./live/qa-session.cjs');
    const SECRET = 'JBSWY3DPEHPK3PXP';
    const jwt = (aal) => `x.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.y`;
    const mk = ({ factors = [{ id: 'f1', status: 'verified' }], verify }) => {
      const seen = [];
      return {
        seen,
        supabase: {
          createClient: () => ({
            auth: {
              setSession: async () => ({ error: null }),
              mfa: {
                listFactors: async () => ({ data: { totp: factors }, error: null }),
                challengeAndVerify: async (a) => (seen.push(a.code), verify(a, seen.length)),
              },
            },
          }),
        },
      };
    };
    let clock = Date.parse('2026-11-14T12:00:10Z');
    const deps = (m) => ({ supabase: m.supabase, now: () => clock, sleep: async (ms) => { clock += ms; } });
    const cfg = { url: 'https://x.invalid', anon: 'anon' };
    const s0 = { access_token: jwt('aal1'), refresh_token: 'r1', expires_at: 0 };
    const ok = { data: { access_token: jwt('aal2'), refresh_token: 'r2', expires_in: 3600 }, error: null };
    const bad = { data: null, error: { status: 422, message: 'Invalid TOTP code entered' } };

    // right code first time
    let m = mk({ verify: (a) => (a.code === totp(SECRET, { time: clock }) ? ok : bad) });
    let s = await qa.elevateToAal2(s0, SECRET, cfg, deps(m));
    assert(qa.aalOf(s.access_token) === 'aal2' && s.refresh_token === 'r2' && m.seen.length === 1, 'first code');
    // first code rejected → next step's code
    clock = Date.parse('2026-11-14T12:00:29Z');
    m = mk({ verify: (a, n) => (n === 1 ? bad : ok) });
    s = await qa.elevateToAal2(s0, SECRET, cfg, deps(m));
    assert(qa.aalOf(s.access_token) === 'aal2' && m.seen.length === 2 && m.seen[0] !== m.seen[1], 'retry with a fresh code');
    // failures → fixed codes, never the secret or a code
    const cases = [
      [mk({ factors: [], verify: () => ok }), 'QA_SESSION_MFA_NOT_ENROLLED'],
      [mk({ factors: [{ id: 'f1', status: 'unverified' }], verify: () => ok }), 'QA_SESSION_MFA_NOT_ENROLLED'],
      [mk({ verify: () => bad }), 'QA_SESSION_MFA_CODE_REJECTED'],
      [mk({ verify: () => ({ data: null, error: { status: 0, message: 'fetch failed' } }) }), 'QA_SESSION_MFA_VERIFY_FAILED'],
    ];
    for (const [mm, want] of cases) {
      try {
        await qa.elevateToAal2(s0, SECRET, cfg, deps(mm));
        throw new Error(`no error (want ${want})`);
      } catch (e) {
        assert(e.code === want, `${e.code} (want ${want})`);
        assert(!String(e.message).includes(SECRET) && !mm.seen.some((c) => String(e.message).includes(c)), 'secret / code in the error');
      }
    }
    // the student never has a TOTP secret; admin / staff read theirs from the env only
    const env = (k) => ({ QA_ADMIN_TOTP_SECRET: 'AAAA', QA_STAFF_TOTP_SECRET: 'BBBB' })[k];
    assert(qa.totpSecretFor('qa-student@courage-library.test', { env }) === null, 'student');
    assert(qa.totpSecretFor('qa-admin@courage-library.test', { env }) === 'AAAA' && qa.totpSecretFor('qa-staff@courage-library.test', { env }) === 'BBBB', 'admin / staff');
    assert(qa.totpSecretFor('qa-admin@courage-library.test', { env: () => undefined }) === null, 'not configured → null (AAL1)');
    return `2 successes, ${cases.length} fixed failure codes`;
  });

  await test('H-12 TOTP secrets: only from GitHub secrets in the two live jobs; in log-scan; never logged', () => {
    const wf = read('.github/workflows/ci-gates.yml');
    for (const k of ['QA_ADMIN_TOTP_SECRET', 'QA_STAFF_TOTP_SECRET']) {
      const lines = wf.split('\n').filter((l) => l.includes(k));
      assert(lines.length === 2 && lines.every((l) => l.trim() === `${k}: \${{ secrets.${k} }}`), `${k}: ${lines.length} line(s), each must be "${k}: \${{ secrets.${k} }}"`);
      assert(new RegExp(`'${k}'`).test(read('scripts/ci/log-scan.cjs')), `${k} not in log-scan SECRET_ENV`);
    }
    const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['scripts/lib/totp.cjs', 'scripts/live/qa-session.cjs']) {
      const c = code(read(f));
      // a logging call that interpolates or passes the secret / code variables (fixed words in a message are fine)
      const leak = /console\.\w+\((?:[^;]*?[(,])?\s*(secret|code|secretBase32)\s*[,)]|console\.\w+\([^;]*?\$\{\s*(secret|code|secretBase32)\s*\}/;
      assert(!leak.test(c), `${f} logs a secret or a code`);
      // negative control: the check catches a leaking line
      assert(leak.test('console.log(`code ${code}`);') && leak.test('console.error(secret);'), 'leak check is blind');
    }
    assert(/(^|\n)\.env\*?\.local|(^|\n)\.env\*/.test(read('.gitignore')), '.env.local is not git-ignored');
    return 'wired from secrets only';
  });

  await test('H-13 CI switch: dispatch input admin_mfa (default false) → ADMIN_MFA_REQUIRED for both live jobs', () => {
    const wf = read('.github/workflows/ci-gates.yml');
    assert(/\n {6}admin_mfa:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: false/.test(wf), 'input admin_mfa (boolean, default false)');
    const lines = wf.split('\n').filter((l) => /^\s+ADMIN_MFA_REQUIRED: /.test(l));
    assert(lines.length === 2 && lines.every((l) => l.trim() === "ADMIN_MFA_REQUIRED: ${{ github.event_name == 'workflow_dispatch' && inputs.admin_mfa && 'true' || 'false' }}"), `${lines.length} line(s)`);
    return 'dispatch-only, default off';
  });

  console.log(`\nAUTH-HARDEN-1: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 400)}`);
  process.exit(1);
});
