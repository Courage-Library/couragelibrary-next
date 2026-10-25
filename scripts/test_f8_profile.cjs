#!/usr/bin/env node
/**
 * F8 (#80) — profile + username. Offline gate (TS transpile + mocks + static; the DB behaviour was proven in a
 * rolled-back smoke before commit):
 *   PF-01 username rules: format, reserved names, profanity incl. look-alike characters, 30-day change window
 *   PF-02 the migration seeds EXACTLY the same reserved / profanity lists as lib/profile/username.ts
 *   PF-03 migration 096: username unique + format CHECK; a public profile needs a username AND the 18+ confirmation
 *         (CHECK — no minor public profile, no date of birth stored); client writes narrowed to column grants (the new
 *         columns only via the RPCs); RPCs SECDEF '' with auth.uid(), authenticated only, allow-listed; rollback
 *   PF-04 actions: flag off → nothing; local rules answer instantly; fixed codes only
 *   PF-05 public profile: only username + month joined; only when public AND 18+ confirmed; flag off → 404;
 *         settings page 404 when off; "Profile" menu link only with the flag; public toggle needs the 18+ tick
 * Run: node scripts/test_f8_profile.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sqlCode = (s) => s.replace(/--.*$/gm, '');
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

const ts = require('typescript');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) return origResolve.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
  return origResolve.call(this, request, parent, isMain, options);
};
const transpile = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = transpile;
const rpcCalls = [];
let reply = null;
let filters = [];
let row = null;
const MOCKS = {
  'server-only': {},
  'next/cache': { revalidatePath: () => undefined },
  '@/lib/auth/session-state': { getSessionState: async () => ({ state: 'user', user: { id: 'u1' } }) },
  '@/lib/supabase/server': {
    createServerSupabaseClient: async () => ({ rpc: async (fn, args) => (rpcCalls.push([fn, args]), reply) }),
    createAdminServerSupabaseClient: () => {
      const q = { select: (c) => (filters.push(['select', c]), q), eq: (k, v) => (filters.push(['eq', k, v]), q), not: (k, o, v) => (filters.push(['not', k, o, v]), q), maybeSingle: async () => ({ data: row }) };
      return { from: () => q };
    },
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(MOCKS, request)) return MOCKS[request];
  return origLoad.call(this, request, parent, isMain);
};
const MIG = 'supabase/migrations/20261025000096_f8_profile_username.sql';

(async () => {
  const U = require(path.join(ROOT, 'lib/profile/username.ts'));

  await test('PF-01 username rules', () => {
    const cases = { ab: 'INVALID_FORMAT', '9lives': 'INVALID_FORMAT', a__b: 'INVALID_FORMAT', abc_: 'INVALID_FORMAT', 'with-dash': 'INVALID_FORMAT', [`a${'b'.repeat(20)}`]: 'INVALID_FORMAT', admin: 'NOT_ALLOWED', Support: 'NOT_ALLOWED', 'sh1t_happens': 'NOT_ALLOWED', x_b1tch_x: 'NOT_ALLOWED', ram_kumar: 'OK', Priya_2026: 'OK', abc: 'OK' };
    for (const [u, want] of Object.entries(cases)) assert(U.checkUsername(u) === want, `${u}: ${U.checkUsername(u)} ≠ ${want}`);
    assert(U.foldForProfanity('B1tCh_3') === 'bitche', U.foldForProfanity('B1tCh_3'));
    const now = new Date('2026-10-25T00:00:00Z');
    assert(U.nextChangeAllowedAt(null, now) === null, 'first choice free');
    assert(U.nextChangeAllowedAt('2026-10-10T00:00:00Z', now).toISOString() === '2026-11-09T00:00:00.000Z', 'within 30 days → next date');
    assert(U.nextChangeAllowedAt('2026-09-20T00:00:00Z', now) === null, 'after 30 days → free');
    return `${Object.keys(cases).length} cases`;
  });

  await test('PF-02 migration seeds exactly the TS lists', () => {
    const m = read(MIG);
    const seeded = (kind) => [...m.matchAll(new RegExp(`\\('([a-z_]+)', '${kind}'\\)`, 'g'))].map((x) => x[1]).sort();
    assert(JSON.stringify(seeded('RESERVED')) === JSON.stringify([...U.RESERVED_USERNAMES].sort()), 'reserved lists differ');
    assert(JSON.stringify(seeded('PROFANITY')) === JSON.stringify([...U.PROFANITY_TERMS].sort()), 'profanity lists differ');
    assert(/translate\(v_name, '013457@\$', 'oieastas'\)/.test(m), 'SQL folding = TS folding (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s)');
  });

  await test('PF-03 migration 096: constraints, 18+ rule, column grants, RPCs, rollback', () => {
    const m = sqlCode(read(MIG));
    assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m), 'no top-level BEGIN / COMMIT');
    assert(/CHECK \(\s*NOT profile_public OR \(username IS NOT NULL AND adult_confirmed_at IS NOT NULL\)\)/.test(m), 'public needs username + 18+ (CHECK)');
    assert(!/birth|dob\b|date_of_birth/i.test(m), 'no date of birth stored');
    assert(/CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_username/.test(m) && /username ~ '\^\[a-z\]\[a-z0-9_\]\{2,19\}\$'/.test(m), 'unique + format');
    assert(/REVOKE INSERT, UPDATE ON public\.user_profiles FROM anon, authenticated;/.test(m) && /GRANT INSERT \(id, full_name, phone, avatar_url, language_preference\) ON public\.user_profiles TO authenticated;/.test(m) && /GRANT UPDATE \(full_name, phone, avatar_url, language_preference, updated_at\) ON public\.user_profiles TO authenticated;/.test(m), 'client writes narrowed to column grants');
    for (const [fn, sig] of [['fn_set_username', '(text)'], ['fn_set_profile_visibility', '(boolean, boolean)']]) {
      const body = m.slice(m.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`), m.indexOf(`REVOKE ALL ON FUNCTION public.${fn}`));
      assert(/SECURITY DEFINER\s+SET search_path = ''/.test(body) && /v_uid\s+uuid := auth\.uid\(\);/.test(body) && !/p_user_id/.test(body), `${fn}: SECDEF '' + auth.uid()`);
      assert(m.includes(`REVOKE ALL ON FUNCTION public.${fn}${sig} FROM PUBLIC, anon;`) && m.includes(`GRANT EXECUTE ON FUNCTION public.${fn}${sig} TO authenticated;`), `${fn}: authenticated only`);
    }
    assert(/interval '30 days'/.test(m) && /'TOO_SOON'/.test(m) && /'TAKEN'/.test(m) && /'NEED_ADULT_CONFIRMATION'/.test(m), '30-day window, taken, 18+');
    assert(/REVOKE ALL ON public\.username_blocklist FROM PUBLIC, anon, authenticated;/.test(m), 'blocklist not client-readable');
    const allow = JSON.parse(read('scripts/secdef/allowlist.json')).functions;
    assert(allow['fn_set_username(p_username text)']?.class === 'A' && allow['fn_set_profile_visibility(p_public boolean, p_confirm_adult boolean)']?.class === 'A', 'allow-list');
    const rb = read('docs/database/rollback/096_rollback.sql');
    assert(/DROP COLUMN IF EXISTS username,/.test(rb) && /DROP TABLE IF EXISTS public\.username_blocklist;/.test(rb), 'rollback');
  });

  await test('PF-04 actions: flag off → nothing; instant local rules; fixed codes', async () => {
    const A = require(path.join(ROOT, 'app/settings/profile/actions.ts'));
    delete process.env.PROFILES_ENABLED;
    assert((await A.setUsernameAction({ username: 'ram_kumar' })) === 'FAILED' && rpcCalls.length === 0, 'flag off');
    process.env.PROFILES_ENABLED = 'true';
    assert((await A.setUsernameAction({ username: 'admin' })) === 'NOT_ALLOWED' && rpcCalls.length === 0, 'local rule answers without the RPC');
    reply = { data: { success: true, code: 'SET' }, error: null };
    assert((await A.setUsernameAction({ username: 'ram_kumar' })) === 'SET' && rpcCalls.at(-1)[0] === 'fn_set_username', 'SET');
    reply = { data: { success: false, code: 'weird SQL text' }, error: null };
    assert((await A.setUsernameAction({ username: 'ram_kumar' })) === 'FAILED', 'unknown → FAILED');
    reply = { data: { success: false, code: 'NEED_ADULT_CONFIRMATION' }, error: null };
    assert((await A.setProfileVisibilityAction({ public: true, confirmAdult: false })) === 'NEED_ADULT_CONFIRMATION', 'visibility code');
    assert(JSON.stringify(rpcCalls.at(-1)) === JSON.stringify(['fn_set_profile_visibility', { p_public: true, p_confirm_adult: false }]), 'visibility args');
    delete process.env.PROFILES_ENABLED;
  });

  await test('PF-05 public profile minimal + 18+ only; flag-gated pages and menu link', async () => {
    const S = require(path.join(ROOT, 'lib/profile/server.ts'));
    row = { username: 'ram_kumar', created_at: '2026-09-01T00:00:00Z' };
    filters = [];
    const p = await S.loadPublicProfile('Ram_Kumar');
    assert(JSON.stringify(p) === JSON.stringify({ username: 'ram_kumar', memberSince: '2026-09-01T00:00:00Z' }), JSON.stringify(p));
    assert(JSON.stringify(filters) === JSON.stringify([['select', 'username, created_at'], ['eq', 'username', 'ram_kumar'], ['eq', 'profile_public', true], ['not', 'adult_confirmed_at', 'is', null]]), `only public + 18+, only 2 columns: ${JSON.stringify(filters)}`);
    assert((await S.loadPublicProfile('bad name!')) === null, 'invalid → null');
    for (const f of ['app/u/[username]/page.tsx', 'app/settings/profile/page.tsx']) assert(/if \(!isProfilesEnabled\(\)\) notFound\(\);/.test(code(read(f))), `${f}: flag off → 404`);
    const links = code(read('components/shell/account-links.tsx'));
    assert(/account\.profile \? \[\{ href: "\/settings\/profile", label: "Profile" \}, \.\.\.ACCOUNT_MENU\] : ACCOUNT_MENU/.test(links) && /profile: isProfilesEnabled\(\),/.test(read('components/shell/app-shell.tsx')), 'menu link only with the flag');
    const form = code(read('components/profile/profile-settings-form.tsx'));
    assert(/I confirm I am 18 or older/.test(form) && /disabled=\{pending \|\| \(!isPublic && \(!props\.username \|\| !adult\)\)\}/.test(form), 'public toggle needs a username and the 18+ tick');
  });

  await test('PF-06 architect rulings: leaderboard opt-in column via RPC only, 18+ only; no client-writable privileged column', async () => {
    const m = sqlCode(read(MIG));
    assert(/ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT false/.test(m) && /CHECK \(NOT leaderboard_opt_in OR adult_confirmed_at IS NOT NULL\)/.test(m), 'column default false + 18+ CHECK');
    const upd = (m.match(/GRANT UPDATE \(([^)]+)\) ON public\.user_profiles TO authenticated;/) || [])[1] || '';
    for (const col of ['is_active', 'id', 'created_at', 'leaderboard_opt_in', 'adult_confirmed_at', 'username', 'username_changed_at', 'profile_public']) assert(!upd.split(/,\s*/).includes(col), `client UPDATE grant includes ${col}`);
    const fn = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public.fn_set_leaderboard_opt_in'), m.indexOf('REVOKE ALL ON FUNCTION public.fn_set_leaderboard_opt_in'));
    assert(/SECURITY DEFINER\s+SET search_path = ''/.test(fn) && /v_uid\s+uuid := auth\.uid\(\);/.test(fn) && /IF p_opt_in AND v_adult IS NULL THEN\s+RETURN jsonb_build_object\('success', false, 'code', 'NEED_ADULT_CONFIRMATION'\)/.test(fn), "SECDEF '' + auth.uid(); under-18 rejected");
    assert(/GRANT EXECUTE ON FUNCTION public\.fn_set_leaderboard_opt_in\(boolean\) TO authenticated;/.test(m) && JSON.parse(read('scripts/secdef/allowlist.json')).functions['fn_set_leaderboard_opt_in(p_opt_in boolean)']?.class === 'A', 'authenticated only, allow-listed');
    const svc = code(read('services/assessment.service.ts'));
    const opt = svc.slice(svc.indexOf('private static async leaderboardOptIns('), svc.indexOf('static async getTestLeaderboard('));
    assert(/\.eq\("leaderboard_opt_in", true\)/.test(opt) && /\.not\("adult_confirmed_at", "is", null\)/.test(opt) && !/user_metadata/.test(opt) && !/user_metadata/.test(svc.slice(svc.indexOf("private static async accountFlags("), svc.indexOf("private static async leaderboardOptIns("))), "leaderboard reads the column (18+ only), never user_metadata");
    const A = require(path.join(ROOT, 'app/settings/profile/actions.ts'));
    process.env.PROFILES_ENABLED = 'true';
    rpcCalls.length = 0;
    reply = { data: { success: false, code: 'NEED_ADULT_CONFIRMATION' }, error: null };
    assert((await A.setLeaderboardOptInAction({ optIn: true, confirmAdult: false, keepPublic: false })) === 'NEED_ADULT_CONFIRMATION' && JSON.stringify(rpcCalls) === JSON.stringify([['fn_set_leaderboard_opt_in', { p_opt_in: true }]]), 'opt-in via the RPC only');
    rpcCalls.length = 0;
    reply = { data: { success: true, code: 'OPTED_IN' }, error: null };
    assert((await A.setLeaderboardOptInAction({ optIn: true, confirmAdult: true, keepPublic: false })) === 'OPTED_IN' && JSON.stringify(rpcCalls.map((x) => x[0])) === JSON.stringify(['fn_set_profile_visibility', 'fn_set_leaderboard_opt_in']) && rpcCalls[0][1].p_public === false, '18+ confirmation recorded without making the profile public');
    delete process.env.PROFILES_ENABLED;
  });

  console.log(`\nF8 profile: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
