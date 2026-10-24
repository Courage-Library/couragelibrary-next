/**
 * CI-FIX-1 (decision #74): CAPTCHA-safe sign-in for the permanent QA identities in live tests.
 *
 * Supabase Attack Protection (Turnstile) is ON, so email + password sign-in without a captcha token is rejected.
 * Tests never solve, bypass or fake the captcha. Instead a session is minted server-side:
 *   service-role  auth.admin.generateLink({ type: 'magiclink', email })   → hashed_token   (NO email is sent:
 *                 generateLink only returns the link — "to be sent via a custom email provider", auth-js docs)
 *   anon          auth.verifyOtp({ type: 'email', token_hash })           → session        ('magiclink' as fallback)
 * Browser tests get the session as the app's own auth cookies, written by @supabase/ssr itself (same name, chunking
 * and encoding the server reads).
 *
 * Guards (all BEFORE any network call):
 *   - hard allow-list: only the three permanent QA identities on the reserved .test domain; anything else throws
 *   - ref lock: the project must be couragelibrary-next (scripts/db/gen-types.cjs assertProjectRef), never legacy
 *   - the identity must already exist (generateLink would CREATE a missing user for 'magiclink' — never allowed)
 * Never logs e-mails, tokens, links, cookies or ids; errors carry fixed codes + HTTP status only.
 *
 * API:  qaSession(email) → { access_token, refresh_token, expires_at }      qaUserClient(email) → supabase client
 *       qaAccessToken(email) → string                                       qaCookies(email, baseUrl) → cookies
 *       qaBrowserLogin(context, email, baseUrl)  (Playwright BrowserContext)
 * Probe: node scripts/live/qa-session.cjs --probe   (first live CI gate: proves /verify is not captcha-gated)
 */
const QA_IDENTITIES = Object.freeze(['qa-student@courage-library.test', 'qa-staff@courage-library.test', 'qa-admin@courage-library.test']);
const QA_DOMAIN = '@courage-library.test';

class QaSessionError extends Error {
  constructor(code, status) {
    super(`QA_SESSION_${code}${status ? ` (status ${status})` : ''}`);
    this.name = 'QaSessionError';
    this.code = `QA_SESSION_${code}`;
    this.status = status || null;
  }
}

/**
 * CI-LEAN-1 diagnostics: CI shows check IDs only (run-quiet), so when QA_SESSION_DIAG=1 (live CI step) a failed mint
 * prints ONE safe line whose ID is the fixed error code + HTTP status, e.g. "FAIL  QS-VERIFYFAILED-403". Fixed
 * vocabulary only — never an e-mail, token, link or message text.
 */
function diag(err) {
  if (process.env.QA_SESSION_DIAG !== '1' || !(err instanceof QaSessionError)) return;
  const id = `QS-${err.code.replace(/^QA_SESSION_/, '').replace(/_/g, '')}${err.status ? `-${Number(err.status)}` : ''}`;
  console.log(`  FAIL  ${id} (qa-session mint failed)`);
}

/**
 * CI-LEAN-1 session cache (live CI job only: QA_SESSION_CACHE_DIR = a job-scoped runner temp dir). One session per QA
 * identity per job instead of one per gate (~30 mints → 3): fewer magic links, and no gate can overwrite another
 * identity's pending link token. Files are 0600, named by sha256(e-mail), contain only the token pair + expiry, and are
 * never printed. Reused only while > 15 min of validity remain (the app never needs to refresh within a job).
 */
function cachePath(email) {
  const dir = process.env.QA_SESSION_CACHE_DIR;
  if (!dir) return null;
  return require('path').join(dir, `${require('crypto').createHash('sha256').update(email).digest('hex').slice(0, 32)}.json`);
}
function cacheRead(email) {
  const p = cachePath(email);
  if (!p) return null;
  try {
    const s = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    return s && s.access_token && s.refresh_token && Number(s.expires_at) * 1000 - Date.now() > 15 * 60 * 1000 ? s : null;
  } catch {
    return null;
  }
}
function cacheWrite(email, s) {
  const p = cachePath(email);
  if (!p) return;
  try {
    const fs = require('fs');
    fs.mkdirSync(require('path').dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(s), { mode: 0o600 });
  } catch {
    /* cache is an optimisation only */
  }
}

/** Pure: the normalised e-mail if it is an allowed QA identity, else throws (no network). */
function assertQaEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.endsWith(QA_DOMAIN) || !QA_IDENTITIES.includes(e)) throw new QaSessionError('NOT_ALLOWED');
  return e;
}

/** Ref-locked project config (throws before any network call). `deps` is for the offline unit test. */
function projectConfig(deps = {}) {
  const { readEnv } = deps.dbEnv || require('../db/_db-env.cjs');
  const { refFromPublicUrl, assertProjectRef } = deps.genTypes || require('../db/gen-types.cjs');
  const env = deps.env || readEnv();
  assertProjectRef(refFromPublicUrl(env)); // couragelibrary-next only
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const anon = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new QaSessionError('ENV_MISSING');
  return { url, anon, service };
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const isCaptcha = (err) => /captcha/i.test(`${(err && err.code) || ''} ${(err && err.message) || ''}`);
const retry = async (fn, tries = 3) => {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof QaSessionError && e.code !== 'QA_SESSION_NETWORK') throw e; // only network errors retry
    }
  }
  throw last;
};

/** Mints a session for a QA identity (see header). Returns tokens only — never logged. */
async function qaSession(email, deps = {}) {
  const e = assertQaEmail(email);
  const cfg = projectConfig(deps);
  if (!deps.noCache) {
    const cached = cacheRead(e);
    if (cached) return cached;
  }
  try {
    const s = await mintWith429Retry(e, cfg, deps);
    if (!deps.noCache) cacheWrite(e, s);
    return s;
  } catch (err) {
    diag(err);
    throw err;
  }
}

/** One bounded retry when the auth server rate-limits (HTTP 429); everything else fails at once. */
async function mintWith429Retry(e, cfg, deps) {
  try {
    return await mint(e, cfg, deps);
  } catch (err) {
    if (!(err instanceof QaSessionError) || err.status !== 429) throw err;
    await new Promise((r) => setTimeout(r, deps.retryDelayMs === undefined ? 30000 : deps.retryDelayMs));
    return mint(e, cfg, deps);
  }
}

async function mint(e, cfg, deps) {
  const { createClient } = deps.supabase || require('@supabase/supabase-js');
  const { findUserByEmail } = deps.findUser || require('../e2e/find-user.cjs');
  const admin = createClient(cfg.url, cfg.service, NO_SESSION);
  return retry(async () => {
    let user;
    try {
      user = await findUserByEmail(admin, e);
    } catch {
      throw new QaSessionError('NETWORK');
    }
    if (!user) throw new QaSessionError('IDENTITY_MISSING'); // never let generateLink create it
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: e });
    if (link.error) throw new QaSessionError(link.error.status ? 'GENERATE_LINK_FAILED' : 'NETWORK', link.error.status);
    const tokenHash = link.data && link.data.properties && link.data.properties.hashed_token;
    if (!tokenHash) throw new QaSessionError('NO_TOKEN_HASH');
    const anon = createClient(cfg.url, cfg.anon, NO_SESSION);
    let res = await anon.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
    if (res.error && !isCaptcha(res.error) && res.error.status && res.error.status !== 429) {
      // older auth servers only accept the deprecated 'magiclink' type for admin-generated magic links;
      // a hashed token is single use, so mint a fresh one for the second attempt
      const again = await admin.auth.admin.generateLink({ type: 'magiclink', email: e });
      const h2 = again.data && again.data.properties && again.data.properties.hashed_token;
      if (h2) res = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: h2 });
    }
    if (res.error) {
      if (isCaptcha(res.error)) throw new QaSessionError('VERIFY_CAPTCHA_GATED', res.error.status); // HARD STOP signal
      throw new QaSessionError(res.error.status ? 'VERIFY_FAILED' : 'NETWORK', res.error.status);
    }
    const s = res.data && res.data.session;
    if (!s || !s.access_token || !s.refresh_token) throw new QaSessionError('NO_SESSION');
    if (!res.data.user || String(res.data.user.email || '').toLowerCase() !== e) throw new QaSessionError('WRONG_USER');
    return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at };
  });
}

async function qaAccessToken(email, deps) {
  return (await qaSession(email, deps)).access_token;
}

/** An anon-key supabase-js client signed in as the QA identity (no persistence, no auto refresh). */
async function qaUserClient(email, deps = {}) {
  const s = await qaSession(email, deps);
  const cfg = projectConfig(deps);
  const { createClient } = deps.supabase || require('@supabase/supabase-js');
  const c = createClient(cfg.url, cfg.anon, NO_SESSION);
  const { error } = await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) throw new QaSessionError('SET_SESSION_FAILED', error.status);
  return c;
}

/**
 * The app's auth cookies for the QA identity, written by @supabase/ssr's own server client (exactly what the app's
 * middleware / server components read). Returned in Playwright's cookie shape for `baseUrl`.
 */
async function qaCookies(email, baseUrl, deps = {}) {
  const s = await qaSession(email, deps);
  const cfg = projectConfig(deps);
  const { createServerClient } = deps.ssr || require('@supabase/ssr');
  const jar = new Map();
  const client = createServerClient(cfg.url, cfg.anon, {
    cookies: {
      getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
      setAll: (list) => list.forEach((c) => (c.value ? jar.set(c.name, c) : jar.delete(c.name))),
    },
  });
  const { error } = await client.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) throw new QaSessionError('SET_SESSION_FAILED', error.status);
  await new Promise((r) => setTimeout(r, 50)); // @supabase/ssr flushes setAll on the auth event
  const cookies = [...jar.values()];
  if (!cookies.some((c) => /-auth-token(\.\d+)?$/.test(c.name))) throw new QaSessionError('NO_AUTH_COOKIE');
  const origin = new URL(baseUrl).origin;
  return cookies.map((c) => ({ name: c.name, value: c.value, url: origin, httpOnly: Boolean(c.options && c.options.httpOnly), secure: false, sameSite: 'Lax' }));
}

/** Signs a Playwright BrowserContext in as the QA identity (no login form, no captcha). */
async function qaBrowserLogin(context, email, baseUrl, deps) {
  await context.addCookies(await qaCookies(email, baseUrl, deps));
}

module.exports = { QA_IDENTITIES, QaSessionError, assertQaEmail, projectConfig, qaSession, qaAccessToken, qaUserClient, qaCookies, qaBrowserLogin };

// ---------- probe (first live CI gate): /verify must not be captcha-gated ----------
if (require.main === module && process.argv.includes('--probe')) {
  (async () => {
    console.log('QA session probe (decision #74)');
    const checks = [];
    try {
      const c = await qaUserClient('qa-student@courage-library.test', { noCache: true }); // always a FRESH mint
      const { data, error } = await c.auth.getUser();
      checks.push(['Q-01 magic-link session for qa-student (generateLink → verifyOtp; /verify not captcha-gated)', !error && data && data.user ? '' : 'getUser failed']);
      await c.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch (e) {
      checks.push(['Q-01 magic-link session for qa-student (generateLink → verifyOtp; /verify not captcha-gated)', e.code || 'QA_SESSION_UNKNOWN']);
    }
    try {
      assertQaEmail('someone@example.com');
      checks.push(['Q-02 a non-QA e-mail is refused before any network call', 'accepted']);
    } catch (e) {
      checks.push(['Q-02 a non-QA e-mail is refused before any network call', e.code === 'QA_SESSION_NOT_ALLOWED' ? '' : 'wrong error']);
    }
    for (const [name, err] of checks) console.log(`  ${err ? 'FAIL' : 'PASS'}  ${name}${err ? ` — ${err}` : ''}`);
    const failed = checks.filter(([, err]) => err).length;
    console.log(`\nQA session probe: ${checks.length - failed}/${checks.length} passed`);
    process.exit(failed ? 1 : 0);
  })();
}
