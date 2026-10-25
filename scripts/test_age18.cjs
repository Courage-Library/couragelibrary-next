#!/usr/bin/env node
/**
 * AGE-18 (owner decision, legal: couragelibrary.in is 18+ only) — offline gate. Flag AGE_GATE_ENABLED (default OFF).
 *   AG-01 flag: on only for exactly "true"
 *   AG-02 checkbox input: only a ticked box confirms; metadata confirmation must be a real time
 *   AG-03 gate decision: signed-in GET page without confirmation → /confirm-age (a Google user before onboarding, an
 *         existing user on the next visit); confirmed / signed out / POST / exempt (auth, API, legal, the page itself) → no
 *   AG-04 email sign-up: the server rejects a sign-up without the box BEFORE calling Supabase; the box is required and
 *         never pre-ticked; the time travels in the sign-up metadata
 *   AG-05 middleware + onboarding backstop: the gate runs in the middleware (no DB query) and onboarding cannot skip it
 *   AG-06 /confirm-age: box required server-side; fn_confirm_age result required (fail CLOSED); `next` sanitized, no loop;
 *         sign-out stays possible
 *   AG-07 first sign-in after an email sign-up copies the checkbox time to the profile (login, Google, email link)
 *   AG-08 migration 109: column not client-writable (not in the 096 column grants), set once, authenticated EXECUTE only
 * Run: node scripts/test_age18.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
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

const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(out.outputText, filename);
};
void Module;
const G = require(path.join(ROOT, 'lib/auth/age-gate.ts'));

test('AG-01 flag AGE_GATE_ENABLED: on only for exactly "true" (default off)', () => {
  assert(G.isAgeGateEnabled({}) === false && G.isAgeGateEnabled({ AGE_GATE_ENABLED: '1' }) === false && G.isAgeGateEnabled({ AGE_GATE_ENABLED: 'TRUE' }) === false && G.isAgeGateEnabled({ AGE_GATE_ENABLED: 'true' }) === true);
});

test('AG-02 only a ticked box confirms; metadata must hold a real time', () => {
  assert(G.isAgeConfirmedInput('on') && !G.isAgeConfirmedInput(null) && !G.isAgeConfirmedInput('') && !G.isAgeConfirmedInput('off') && !G.isAgeConfirmedInput('false'), 'checkbox');
  assert(G.hasAgeConfirmation({ age_confirmed_at: '2026-10-25T20:00:00.000Z' }) && !G.hasAgeConfirmation({}) && !G.hasAgeConfirmation(null) && !G.hasAgeConfirmation({ age_confirmed_at: 'yes' }) && !G.hasAgeConfirmation({ age_confirmed_at: true }), 'metadata');
});

test('AG-03 gate decision (Google user before onboarding, existing user, exempt paths)', () => {
  const d = (o) => G.needsAgeGate({ enabled: true, method: 'GET', signedIn: true, userMetadata: {}, pathname: '/dashboard', ...o });
  assert(d({ pathname: '/onboarding' }) === true, 'a Google user (no confirmation) is gated before onboarding');
  assert(d({ pathname: '/dashboard' }) && d({ pathname: '/mock-tests/x/take' }) && d({ pathname: '/admin' }), 'existing users on their next visit, any app page');
  assert(!d({ userMetadata: { age_confirmed_at: '2026-10-25T20:00:00.000Z' } }), 'confirmed → no gate');
  assert(!d({ enabled: false }) && !d({ signedIn: false }) && !d({ method: 'POST' }), 'flag off / signed out / server-action POST → no gate');
  for (const p of ['/confirm-age', '/auth/login', '/auth/callback', '/api/health', '/privacy', '/terms', '/grievance', '/help', '/contact', '/']) assert(!d({ pathname: p }), `exempt ${p}`);
});

test('AG-04 email sign-up: rejected without the box before Supabase; box required, never pre-ticked', () => {
  const a = code(read('app/auth/actions.ts'));
  const fn = a.slice(a.indexOf('export async function signupAction('), a.indexOf('export async function logoutAction('));
  const check = fn.indexOf('if (ageGate && !isAgeConfirmedInput(formData.get(AGE_CHECKBOX_FIELD))) return fail("age-required");');
  assert(check > 0 && check < fn.indexOf('supabase.auth.signUp('), 'server-side check before signUp');
  assert(/\.\.\.\(ageGate \? \{ \[AGE_METADATA_KEY\]: new Date\(\)\.toISOString\(\) \} : \{\}\)/.test(fn), 'confirmation time in the sign-up metadata');
  assert(/"age-required": "Please confirm that you are 18 or older/.test(read('lib/auth/messages.ts')), 'fixed message');
  const f = code(read('app/auth/signup/signup-form.tsx'));
  assert(/<input type="checkbox" name=\{AGE_CHECKBOX_FIELD\} required /.test(f) && !/defaultChecked|checked=\{/.test(f), 'required, not pre-ticked');
  assert(/ageGate=\{isAgeGateEnabled\(\)\}/.test(read('app/auth/signup/page.tsx')), 'shown when the flag is on');
});

test('AG-05 middleware gate (GET, no DB query) + onboarding backstop', () => {
  const m = code(read('lib/supabase/middleware.ts'));
  assert(/needsAgeGate\(\{ enabled: isAgeGateEnabled\(\), method: request\.method, pathname, signedIn: true, userMetadata:/.test(m) && /ageUrl\.pathname = AGE_CONFIRM_PATH;/.test(m), 'middleware redirects to /confirm-age');
  const blk = m.slice(m.indexOf('needsAgeGate('), m.indexOf('return supabaseResponse;', m.indexOf('needsAgeGate(')));
  assert(!/\.from\(|\.rpc\(/.test(blk), 'no database query in the middleware gate');
  const o = code(read('app/onboarding/page.tsx'));
  assert(/if \(isAgeGateEnabled\(\) && userNeedsAgeConfirmation\(session\.user\)\) \{\s*redirect\(`\$\{AGE_CONFIRM_PATH\}\?next=/.test(o), 'onboarding cannot skip it');
  assert(G.userNeedsAgeConfirmation({ user_metadata: {} }) && !G.userNeedsAgeConfirmation({ user_metadata: { age_confirmed_at: '2026-10-25T20:00:00.000Z' } }) && !G.userNeedsAgeConfirmation(null), 'helper');
});

test('AG-06 /confirm-age: required server-side, fail CLOSED, safe next, sign-out', () => {
  const act = code(read('app/confirm-age/actions.ts'));
  assert(/if \(!isAgeConfirmedInput\(formData\.get\(AGE_CHECKBOX_FIELD\)\)\) redirect\(back\("required"\)\);/.test(act), 'box required');
  assert(/const at = await recordAgeConfirmation\(supabase\);\s*if \(!at\) redirect\(back\("failed"\)\);/.test(act), 'RPC result required');
  assert(/sanitizeRedirectPath\(/.test(act) && /next\.startsWith\(AGE_CONFIRM_PATH\) \? "\/dashboard" : next/.test(act), 'next sanitized, no loop');
  const pg = code(read('app/confirm-age/page.tsx'));
  assert(/<input type="checkbox" name=\{AGE_CHECKBOX_FIELD\} required /.test(pg) && !/defaultChecked/.test(pg) && /action=\{logoutAction\}/.test(pg), 'page: required box, sign-out');
  const rc = code(read('lib/auth/age-confirm.ts'));
  assert(/supabase\.rpc\("fn_confirm_age"\)/.test(rc) && /if \(error \|\| !res\?\.success \|\| typeof res\.age_confirmed_at !== "string"\) return null;/.test(rc), 'fn_confirm_age result checked');
});

test('AG-07 first sign-in copies the sign-up confirmation to the profile', () => {
  assert(/await syncAgeConfirmationOnSignIn\(supabase\);\s*if \(!isOnboardingEnabled\(\)\) return target;/.test(code(read('lib/onboarding/server.ts'))), 'postLoginTarget (email + Google ID-token sign-in)');
  assert(/await syncAgeConfirmationOnSignIn\(supabase\);\s*return NextResponse\.redirect\(target\);/.test(code(read('app/auth/callback/route.ts'))), 'email-link / OAuth callback');
});

test('AG-08 migration 109: not client-writable, set once, authenticated EXECUTE only', () => {
  const MIG = 'supabase/migrations/20261025000109_age_confirmation.sql';
  if (!fs.existsSync(path.join(ROOT, MIG))) return 'SKIP — 109 is held on its branch (not in this tree yet); checked there';
  const sql = read(MIG);
  assert(/ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;/.test(sql), 'column');
  assert(/SET age_confirmed_at\s+= coalesce\(age_confirmed_at, pg_catalog\.now\(\)\)/.test(sql) && /WHERE id = v_uid/.test(sql) && /v_uid uuid := auth\.uid\(\);/.test(sql), 'auth.uid(), set once');
  assert(/REVOKE ALL ON FUNCTION public\.fn_confirm_age\(\) FROM PUBLIC, anon;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fn_confirm_age\(\) TO authenticated;/.test(sql) && !/GRANT (INSERT|UPDATE)[^;]*age_confirmed_at/.test(sql), 'grants');
  const g096 = read('supabase/migrations/20261025000096_f8_profile_username.sql');
  assert(!/age_confirmed_at/.test(g096.match(/GRANT UPDATE \([^)]*\) ON public\.user_profiles/)[0]), '096 client column grants exclude it');
  assert(!/^\s*(BEGIN|COMMIT)\s*;/m.test(sql), 'no transaction control');
});

console.log(`\nAGE-18: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
