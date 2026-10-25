#!/usr/bin/env node
/**
 * AGE-18 (owner decision, legal: couragelibrary.in is 18+ only) — offline gate. Flag AGE_GATE_ENABLED (default OFF).
 * Architect revision: ONE canonical column (user_profiles.adult_confirmed_at, 096); the gate trusts ONLY the
 * server-written app_metadata.adult_confirmed (never user_metadata, #60).
 *   AG-01 flag: on only for exactly "true"
 *   AG-02 checkbox input; ONLY app_metadata.adult_confirmed === true confirms — an edited user_metadata does NOT
 *   AG-03 gate decision: signed-in GET page without the app_metadata flag → /confirm-age (a Google user before
 *         onboarding, an existing user on the next visit, a user who edited user_metadata); exempt paths never
 *   AG-04 email sign-up: rejected server-side without the box BEFORE Supabase; box required, never pre-ticked; the time
 *         is only a stamp (input) in the sign-up metadata
 *   AG-05 middleware reads app_metadata only (no DB query) + onboarding backstop
 *   AG-06 app_metadata is set ONLY after fn_confirm_age succeeded (service role, merged, never from the client)
 *   AG-07 /confirm-age: box required server-side, fail CLOSED, safe next, sign-out; first sign-in sync
 *   AG-08 migration 109: no new column, sets adult_confirmed_at once, authenticated EXECUTE only; the leaderboard /
 *         public-profile 18+ checks (096) read the same column
 * Run: node scripts/test_age18.cjs
 */
const fs = require('fs');
const path = require('path');

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
const G = require(path.join(ROOT, 'lib/auth/age-gate.ts'));
const STAMP = { age_confirmed_at: '2026-10-25T20:00:00.000Z' };

test('AG-01 flag AGE_GATE_ENABLED: on only for exactly "true" (default off)', () => {
  assert(G.isAgeGateEnabled({}) === false && G.isAgeGateEnabled({ AGE_GATE_ENABLED: '1' }) === false && G.isAgeGateEnabled({ AGE_GATE_ENABLED: 'TRUE' }) === false && G.isAgeGateEnabled({ AGE_GATE_ENABLED: 'true' }) === true);
});

test('AG-02 only the server-written app_metadata flag confirms; an edited user_metadata does NOT', () => {
  assert(G.isAgeConfirmedInput('on') && !G.isAgeConfirmedInput(null) && !G.isAgeConfirmedInput('') && !G.isAgeConfirmedInput('off'), 'checkbox');
  assert(G.hasAgeConfirmation({ adult_confirmed: true }) && !G.hasAgeConfirmation({ adult_confirmed: 'true' }) && !G.hasAgeConfirmation({}) && !G.hasAgeConfirmation(null), 'app_metadata: exactly true');
  assert(!G.userNeedsAgeConfirmation({ app_metadata: { adult_confirmed: true } }) && G.userNeedsAgeConfirmation({ app_metadata: {}, user_metadata: { ...STAMP, adult_confirmed: true } }), 'user_metadata (even with adult_confirmed) never passes');
  assert(G.hasSignupAgeStamp(STAMP) && !G.hasSignupAgeStamp({ age_confirmed_at: 'yes' }), 'sign-up stamp is only an input');
});

test('AG-03 gate decision (Google user, existing user, edited user_metadata, exempt paths)', () => {
  const d = (o) => G.needsAgeGate({ enabled: true, method: 'GET', user: { app_metadata: {}, user_metadata: { ...STAMP, adult_confirmed: true } }, pathname: '/dashboard', ...o });
  assert(d({ pathname: '/onboarding' }) === true, 'a Google user (no confirmation) is gated before onboarding');
  assert(d({ pathname: '/dashboard' }) && d({ pathname: '/mock-tests/x/take' }) && d({ pathname: '/admin' }), 'existing users on their next visit');
  assert(d({}) === true, 'a user who EDITED user_metadata (stamp + adult_confirmed) is still gated');
  assert(!d({ user: { app_metadata: { adult_confirmed: true } } }), 'server-confirmed → no gate');
  assert(!d({ enabled: false }) && !d({ user: null }) && !d({ method: 'POST' }), 'flag off / signed out / server-action POST');
  for (const p of ['/confirm-age', '/auth/login', '/auth/callback', '/api/health', '/privacy', '/terms', '/grievance', '/help', '/contact', '/']) assert(!d({ pathname: p }), `exempt ${p}`);
  const gateSrc = code(read('lib/auth/age-gate.ts'));
  const decision = gateSrc.slice(gateSrc.indexOf('export function needsAgeGate('));
  assert(!/user_metadata|userMetadata/.test(decision) && /return userNeedsAgeConfirmation\(input\.user\);/.test(decision), 'the gate decision reads the app_metadata flag only');
});

test('AG-04 email sign-up: rejected without the box before Supabase; box required, never pre-ticked', () => {
  const a = code(read('app/auth/actions.ts'));
  const fn = a.slice(a.indexOf('export async function signupAction('), a.indexOf('export async function logoutAction('));
  const check = fn.indexOf('if (ageGate && !isAgeConfirmedInput(formData.get(AGE_CHECKBOX_FIELD))) return fail("age-required");');
  assert(check > 0 && check < fn.indexOf('supabase.auth.signUp('), 'server-side check before signUp');
  assert(/\.\.\.\(ageGate \? \{ \[AGE_SIGNUP_STAMP_KEY\]: new Date\(\)\.toISOString\(\) \} : \{\}\)/.test(fn), 'stamp (input) in the sign-up metadata');
  assert(/"age-required": "Please confirm that you are 18 or older/.test(read('lib/auth/messages.ts')), 'fixed message');
  const f = code(read('app/auth/signup/signup-form.tsx'));
  assert(/<input type="checkbox" name=\{AGE_CHECKBOX_FIELD\} required /.test(f) && !/defaultChecked|checked=\{/.test(f), 'required, not pre-ticked');
  assert(/ageGate=\{isAgeGateEnabled\(\)\}/.test(read('app/auth/signup/page.tsx')), 'shown when the flag is on');
});

test('AG-05 middleware reads app_metadata only (no DB query) + onboarding backstop', () => {
  const m = code(read('lib/supabase/middleware.ts'));
  assert(/needsAgeGate\(\{ enabled: isAgeGateEnabled\(\), method: request\.method, pathname, user: session\.user \}\)/.test(m) && /ageUrl\.pathname = AGE_CONFIRM_PATH;/.test(m), 'gate wired with the session user');
  assert(!/app_metadata\s*[.\[]|\.app_metadata/.test(m), 'the middleware itself reads no app_metadata field (no role decision, SEC-1C S-06)');
  const blk = m.slice(m.indexOf('needsAgeGate('), m.indexOf('return supabaseResponse;', m.indexOf('needsAgeGate(')));
  assert(!/\.from\(|\.rpc\(|user_metadata/.test(blk), 'no DB query, no user_metadata');
  assert(/if \(isAgeGateEnabled\(\) && userNeedsAgeConfirmation\(session\.user\)\) \{\s*redirect\(`\$\{AGE_CONFIRM_PATH\}\?next=/.test(code(read('app/onboarding/page.tsx'))), 'onboarding cannot skip it');
});

test('AG-06 app_metadata set ONLY after fn_confirm_age succeeded (service role, merged)', () => {
  const rc = code(read('lib/auth/age-confirm.ts'));
  const fn = rc.slice(rc.indexOf('export async function recordAgeConfirmation('), rc.indexOf('export async function syncAgeConfirmationOnSignIn('));
  const rpc = fn.indexOf('supabase.rpc("fn_confirm_age")');
  const guard = fn.indexOf('if (error || !res?.success || typeof res.adult_confirmed_at !== "string") return false;');
  const mirror = fn.indexOf('return await mirrorAdultConfirmed(auth.user.id);');
  assert(rpc > 0 && guard > rpc && mirror > guard, 'RPC → success check → mirror');
  const mr = rc.slice(rc.indexOf('async function mirrorAdultConfirmed('), rc.indexOf('export async function recordAgeConfirmation('));
  assert(/createAdminServerSupabaseClient\(\)/.test(mr) && /const merged = \{ \.\.\.\(data\.user\.app_metadata \?\? \{\}\), \[AGE_APP_METADATA_FLAG\]: true \};/.test(mr) && /updateUserById\(userId, \{ app_metadata: merged \}\)/.test(mr), 'service role, existing app_metadata (role) preserved');
  for (const f of ['app/confirm-age/page.tsx', 'app/auth/signup/signup-form.tsx']) assert(!/app_metadata\s*:/.test(read(f)), `never written from ${f}`);
  assert(/^import "server-only";/.test(read('lib/auth/age-confirm.ts')), 'server only');
});

test('AG-07 /confirm-age fail CLOSED + first sign-in sync', () => {
  const act = code(read('app/confirm-age/actions.ts'));
  assert(/if \(!isAgeConfirmedInput\(formData\.get\(AGE_CHECKBOX_FIELD\)\)\) redirect\(back\("required"\)\);/.test(act), 'box required');
  assert(/const ok = await recordAgeConfirmation\(supabase\);\s*if \(!ok\) redirect\(back\("failed"\)\);/.test(act), 'fail closed');
  assert(/next\.startsWith\(AGE_CONFIRM_PATH\) \? "\/dashboard" : next/.test(act), 'no loop');
  const pg = code(read('app/confirm-age/page.tsx'));
  assert(/hasAgeConfirmation\(session\.user\.app_metadata\)/.test(pg) && /action=\{logoutAction\}/.test(pg) && !/defaultChecked/.test(pg), 'page');
  assert(/await syncAgeConfirmationOnSignIn\(supabase\);\s*if \(!isOnboardingEnabled\(\)\) return target;/.test(code(read('lib/onboarding/server.ts'))), 'postLoginTarget');
  assert(/await syncAgeConfirmationOnSignIn\(supabase\);\s*return NextResponse\.redirect\(target\);/.test(code(read('app/auth/callback/route.ts'))), 'callback');
  const rc = code(read('lib/auth/age-confirm.ts'));
  assert(/if \(hasSignupAgeStamp\(user\.user_metadata\)\) \{\s*await recordAgeConfirmation\(supabase\);/.test(rc), 'the stamp only triggers the RPC (then the same mirror)');
});

test('AG-08 migration 109: one column (adult_confirmed_at), set once, authenticated only; 096 checks use it', () => {
  const MIG = 'supabase/migrations/20261025000109_age_confirmation.sql';
  if (!fs.existsSync(path.join(ROOT, MIG))) return 'SKIP — 109 not in this tree';
  const sql = read(MIG).replace(/^--.*$/gm, '');
  assert(!/ADD COLUMN/i.test(sql) && !/age_confirmed_at/.test(sql), 'no new column');
  assert(/SET adult_confirmed_at = coalesce\(adult_confirmed_at, pg_catalog\.now\(\)\)/.test(sql) && /v_uid uuid := auth\.uid\(\);/.test(sql) && /WHERE id = v_uid/.test(sql), 'auth.uid(), set once');
  assert(/REVOKE ALL ON FUNCTION public\.fn_confirm_age\(\) FROM PUBLIC, anon;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fn_confirm_age\(\) TO authenticated;/.test(sql), 'grants');
  const g096 = read('supabase/migrations/20261025000096_f8_profile_username.sql');
  assert(!/adult_confirmed_at/.test(g096.match(/GRANT UPDATE \([^)]*\) ON public\.user_profiles/)[0]), 'not client-writable (096 column grants)');
  assert(/CHECK \(NOT leaderboard_opt_in OR adult_confirmed_at IS NOT NULL\)/.test(g096) && /SELECT p\.adult_confirmed_at INTO v_adult/.test(g096), 'leaderboard / profile 18+ logic reads the same column');
});

console.log(`\nAGE-18: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
