#!/usr/bin/env node
/**
 * PAY-1 B2a — offline gate for migration 141 (the admin-controlled access policy; static, no network).
 *   P2-01 tables: access_policies (kind CHECK, key CHECK, tier FREE/PRO, PK) with RLS and NO client grant; access_settings
 *         (one row, paywall_enabled DEFAULT false, seeded false) readable by clients, written by service_role only
 *   P2-02 fn_access_tier: SECURITY DEFINER, search_path '', STABLE; exact → MOCK_SERIES parent → kind default → 'PRO'
 *         (fail-closed); fn_access_allowed: INVOKER, switch off → true, FREE → true, anon → false, else fn_has_pro_self()
 *   P2-03 fn_has_pro_self: SECURITY DEFINER, auth.uid() only, authenticated + service_role (never anon)
 *   P2-04 the three writes (set / clear / paywall): SECURITY DEFINER, service_role only, validated, each writes an
 *         admin_audit_logs row with old → new; a kind default cannot be cleared
 *   P2-05 seed = D1 + PREMIUM_CA (+ explicit FREE rows for today's free mocks), ON CONFLICT DO NOTHING
 *   P2-06 SECDEF allow-list + P-9 public_ok + rollback 141 (drops everything, ROLLBACK-CHAIN line)
 *   P2-07 negative controls: a client grant on access_policies, a default other than PRO, an INVOKER tier function, a
 *         write function granted to authenticated, a set without audit → each fails its check
 * Run: node scripts/test_pay1_b2a.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 800)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};
const MIG = 'supabase/migrations/20261116000141_pay1_b2a_access_policy.sql';
const strip = (s) => s.replace(/--[^\n]*/g, '');
const fnBody = (sql, name) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  return i < 0 ? '' : sql.slice(i, sql.indexOf('$$;', sql.indexOf('$$', i) + 2) + 3);
};

function tablesCheck(sql) {
  const s = strip(sql);
  if (!/item_kind\s+text\s+NOT NULL CHECK \(item_kind IN \('FEATURE', 'MOCK_SERIES', 'MOCK_TEST', 'COURSE', 'LESSON', 'TOPIC'\)\)/.test(s)) return 'item_kind CHECK';
  if (!/tier\s+text\s+NOT NULL CHECK \(tier IN \('FREE', 'PRO'\)\)/.test(s) || !/PRIMARY KEY \(item_kind, item_key\)/.test(s)) return 'tier / PK';
  if (!/ALTER TABLE public\.access_policies ENABLE ROW LEVEL SECURITY;/.test(s)) return 'RLS on access_policies';
  if (/GRANT [A-Z, ]*ON public\.access_policies TO [^;]*(anon|authenticated)/.test(s) || /CREATE POLICY [^;]*ON public\.access_policies/.test(s)) return 'access_policies must have no client grant / policy';
  if (!/paywall_enabled boolean\s+NOT NULL DEFAULT false/.test(s) || !/INSERT INTO public\.access_settings \(id, paywall_enabled\) VALUES \(true, false\)/.test(s)) return 'switch default off + seeded off';
  if (/GRANT [^;]*(INSERT|UPDATE|DELETE)[^;]*ON public\.access_settings TO [^;]*(anon|authenticated)/.test(s)) return 'clients must not write access_settings';
  return null;
}
function fnCheck(sql) {
  const tier = fnBody(sql, 'fn_access_tier');
  if (!/STABLE SECURITY DEFINER SET search_path = ''/.test(tier)) return 'fn_access_tier: STABLE SECURITY DEFINER, search_path ""';
  if (!/RETURN COALESCE\(v_tier, 'PRO'\);/.test(tier) || !/IF p_kind IS NULL OR p_key IS NULL THEN\s+RETURN 'PRO';/.test(tier)) return 'fn_access_tier: fail-closed PRO';
  if (!/item_kind = 'MOCK_SERIES' AND item_key = v_series::text/.test(tier)) return 'fn_access_tier: series parent';
  const allowed = fnBody(sql, 'fn_access_allowed');
  if (!/STABLE SECURITY INVOKER SET search_path = ''/.test(allowed)) return 'fn_access_allowed: INVOKER';
  if (!/IF v_on IS DISTINCT FROM true THEN\s+RETURN true;/.test(allowed) || !/fn_access_tier\(p_kind, p_key\) = 'FREE'/.test(allowed) || !/IF auth\.uid\(\) IS NULL THEN\s+RETURN false;/.test(allowed) || !/RETURN public\.fn_has_pro_self\(\);/.test(allowed)) return 'fn_access_allowed: switch → FREE → anon → own Pro';
  const self = fnBody(sql, 'fn_has_pro_self');
  if (!/SECURITY DEFINER SET search_path = ''/.test(self) || !/public\.fn_has_pro\(auth\.uid\(\)\)/.test(self) || /p_user/.test(self)) return 'fn_has_pro_self: DEFINER, auth.uid() only';
  for (const [f, act] of [['fn_access_policy_set', 'ACCESS_POLICY_SET'], ['fn_access_policy_clear', 'ACCESS_POLICY_CLEAR'], ['fn_paywall_set', 'PAYWALL_SET']]) {
    const b = fnBody(sql, f);
    if (!/SECURITY DEFINER SET search_path = ''/.test(b)) return `${f}: DEFINER`;
    if (!new RegExp(`INSERT INTO public\\.admin_audit_logs [^;]*'${act}'`).test(b)) return `${f}: audit row ${act}`;
    if (!/old_value/.test(b)) return `${f}: old value audited`;
  }
  if (!/IF p_key = '\*' THEN\s+RAISE EXCEPTION 'ACCESS_POLICY: a kind default cannot be cleared/.test(fnBody(sql, 'fn_access_policy_clear'))) return 'clear refuses a kind default';
  return null;
}
function grantCheck(sql) {
  const s = strip(sql);
  const want = {
    'fn_access_tier(text, text)': 'anon, authenticated, service_role',
    'fn_access_allowed(text, text)': 'anon, authenticated, service_role',
    'fn_has_pro_self()': 'authenticated, service_role',
    'fn_access_policy_set(text, text, text, uuid, text)': 'service_role',
    'fn_access_policy_clear(text, text, uuid, text)': 'service_role',
    'fn_paywall_set(boolean, uuid, text)': 'service_role',
  };
  for (const [f, to] of Object.entries(want)) {
    const esc = f.replace(/[()]/g, '\\$&');
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`).test(s)) return `${f}: revoke from PUBLIC / anon / authenticated first`;
    const grants = [...s.matchAll(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO ([^;]+);`, 'g'))].map((m) => m[1].trim());
    if (grants.length !== 1 || grants[0] !== to) return `${f}: EXECUTE ${grants.join(' | ') || 'none'} (want ${to})`;
  }
  return null;
}

const SQL = read(MIG);
test('P2-01 tables: policy table RLS + no client grant; switch row off by default, client-readable only', () => {
  const why = tablesCheck(SQL);
  assert(why === null, why);
});
test('P2-02/03/04 functions: DEFINER tier (fail-closed PRO, series parent), INVOKER central check, own-Pro helper, audited service-role writes', () => {
  const why = fnCheck(SQL);
  assert(why === null, why);
});
test('P2-04b grants: exactly as designed (central check + tier for clients; writes service_role only; own-Pro never anon)', () => {
  const why = grantCheck(SQL);
  assert(why === null, why);
});
test('P2-05 seed: D1 defaults + PREMIUM_CA, free mocks kept free, never overwrites', () => {
  const s = strip(SQL);
  for (const row of ["('FEATURE', 'ADVANCED_ANALYTICS', 'PRO')", "('FEATURE', 'MISTAKE_VAULT', 'PRO')", "('FEATURE', 'MEMORY_LOCK', 'PRO')", "('FEATURE', 'PREMIUM_CA', 'PRO')",
    "('FEATURE', 'FLASHCARDS', 'FREE')", "('MOCK_TEST', '*', 'PRO')", "('MOCK_SERIES', '*', 'PRO')", "('LESSON', '*', 'FREE')", "('COURSE', '*', 'FREE')", "('TOPIC', '*', 'FREE')"]) assert(s.includes(row), `seed ${row}`);
  assert(/SELECT 'MOCK_TEST', m\.id::text, 'FREE' FROM public\.mock_tests m WHERE m\.is_free = true\s+ON CONFLICT \(item_kind, item_key\) DO NOTHING;/.test(s), 'free mocks stay free');
  assert((s.match(/ON CONFLICT \(item_kind, item_key\) DO NOTHING/g) || []).length === 2, 'seed never overwrites');
  return '10 defaults + free mocks';
});
test('P2-06 SECDEF allow-list + P-9 public_ok + rollback 141', () => {
  const a = JSON.parse(read('scripts/secdef/allowlist.json'));
  const e = (k) => a.functions[k];
  assert(e('fn_access_tier(p_kind text, p_key text)')?.class === 'A' && a.public_ok.includes('fn_access_tier(p_kind text, p_key text)'), 'fn_access_tier entry + public_ok');
  assert(JSON.stringify(e('fn_has_pro_self()')?.client) === '["authenticated"]', 'fn_has_pro_self entry');
  for (const k of ['fn_access_policy_set(p_kind text, p_key text, p_tier text, p_actor_id uuid, p_actor_email text)', 'fn_access_policy_clear(p_kind text, p_key text, p_actor_id uuid, p_actor_email text)', 'fn_paywall_set(p_enabled boolean, p_actor_id uuid, p_actor_email text)']) {
    assert(e(k)?.class === 'B-service' && e(k).client.length === 0, `${k}`);
  }
  // 142 made the central check DEFINER (access_settings private): listed, public_ok, P-9
  const ca = e('fn_access_allowed(p_kind text, p_key text)');
  assert(ca?.class === 'A' && JSON.stringify(ca.client) === '["anon","authenticated"]' && a.public_ok.includes('fn_access_allowed(p_kind text, p_key text)'), 'fn_access_allowed entry (142)');
  assert(/fn_access_tier: '/.test(read('scripts/test_sec_hotfix4_rls.cjs')) && /fn_access_allowed: '/.test(read('scripts/test_sec_hotfix4_rls.cjs')), 'P-9 SECDEF_PUBLIC_OK entries');
  const rb = read('docs/database/rollback/141_rollback.sql');
  assert(/^-- ROLLBACK-CHAIN: run first: /m.test(rb), 'chain line');
  for (const x of ['fn_paywall_set(boolean, uuid, text)', 'fn_access_policy_clear(text, text, uuid, text)', 'fn_access_policy_set(text, text, text, uuid, text)', 'fn_access_allowed(text, text)', 'fn_has_pro_self()', 'fn_access_tier(text, text)']) {
    assert(rb.includes(`DROP FUNCTION IF EXISTS public.${x};`), `rollback drops ${x}`);
  }
  assert(/DROP TABLE IF EXISTS public\.access_settings;/.test(rb) && /DROP TABLE IF EXISTS public\.access_policies;/.test(rb), 'rollback drops the tables');
});
/** 142 (fix, owner GO 2026-11-15): access_settings private; the central check DEFINER with the same rule and grants */
const M142 = 'supabase/migrations/20261116000142_pay1_b2a_access_settings_private.sql';
function fixCheck(sql) {
  const s = strip(sql);
  if (!/DROP POLICY IF EXISTS p_access_settings_read ON public\.access_settings;/.test(s)) return 'drop the blanket read policy';
  if (!/REVOKE ALL ON public\.access_settings FROM PUBLIC, anon, authenticated;/.test(s)) return 'revoke client access to access_settings';
  if (/GRANT [^;]*ON public\.access_settings TO [^;]*(anon|authenticated)/.test(s) || /CREATE POLICY [^;]*ON public\.access_settings/.test(s)) return 'no client grant / policy on access_settings';
  const b = fnBody(sql, 'fn_access_allowed');
  if (!/STABLE SECURITY DEFINER SET search_path = ''/.test(b)) return 'fn_access_allowed: DEFINER, search_path ""';
  if (!/IF v_on IS DISTINCT FROM true THEN\s+RETURN true;/.test(b) || !/fn_access_tier\(p_kind, p_key\) = 'FREE'/.test(b) || !/IF auth\.uid\(\) IS NULL THEN\s+RETURN false;/.test(b) || !/RETURN public\.fn_has_pro_self\(\);/.test(b)) return 'fn_access_allowed: same rule';
  if (!/GRANT EXECUTE ON FUNCTION public\.fn_access_allowed\(text, text\) TO anon, authenticated, service_role;/.test(s)) return 'grants unchanged';
  return null;
}
test('P2-08 142: access_settings private (RLS P-6); the central check DEFINER with the same rule; rollback 142 restores 141', () => {
  const why = fixCheck(read(M142));
  assert(why === null, why);
  const rb = read('docs/database/rollback/142_rollback.sql');
  assert(/^-- ROLLBACK-CHAIN: run first: /m.test(rb) && /STABLE SECURITY INVOKER SET search_path = ''/.test(rb) && /CREATE POLICY p_access_settings_read ON public\.access_settings/.test(rb), 'rollback 142');
  const muts = [
    ['policy kept', fixCheck(read(M142).replace('DROP POLICY IF EXISTS p_access_settings_read ON public.access_settings;', ''))],
    ['still INVOKER', fixCheck(read(M142).replace("LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''", "LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''"))],
    ['client read re-granted', fixCheck(read(M142) + '\nGRANT SELECT ON public.access_settings TO authenticated;\n')],
    ['anon allowed Pro', fixCheck(read(M142).replace(/IF auth\.uid\(\) IS NULL THEN\s+RETURN false;/, 'IF auth.uid() IS NULL THEN RETURN true;'))],
  ];
  const missed = muts.filter(([, why]) => why === null).map(([k]) => k);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

/** app half: admin-only actions through the audited RPCs; ONE app entry to the central check, session client, fail-closed */
function appCheck(actions, policy, otherCallers) {
  for (const fn of ['setAccessPolicyAction', 'clearAccessPolicyAction', 'setPaywallAction']) {
    const i = actions.indexOf(`export async function ${fn}(`);
    if (i < 0) return `${fn} missing`;
    const body = actions.slice(i, actions.indexOf('\n}\n', i));
    if (!/^[^\n]*\n  const auth = await guardAdminAction\(\);\n  if \(!auth\.ok\) return auth;/.test(body)) return `${fn}: guardAdminAction() first (admin only)`;
    if (/allowStaff/.test(body)) return `${fn}: staff must not change access`;
  }
  if (!/rpc\("fn_access_policy_set"/.test(actions) || !/rpc\("fn_access_policy_clear"/.test(actions) || !/rpc\("fn_paywall_set"/.test(actions)) return 'writes only through the audited RPCs';
  if (/from\("access_policies"\)\.(insert|update|upsert|delete)|from\("access_settings"\)\.(insert|update|upsert|delete)/.test(actions)) return 'no direct table writes';
  const ca = policy.slice(policy.indexOf('export async function canAccess('), policy.indexOf('export async function accessTier('));
  if (!/createServerSupabaseClient\(\)/.test(ca) || /createAdminServerSupabaseClient/.test(ca)) return 'canAccess: the user session (auth.uid()), never the service role';
  if (!/return !error && data === true;/.test(ca) || !/catch \{\n\s+return false;/.test(ca)) return 'canAccess: fail-closed';
  if (otherCallers.length) return `the central check is called outside lib/access/policy.ts: ${otherCallers.join(', ')}`;
  return null;
}
function centralCallers() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && rel !== 'lib/access/policy.ts' && /rpc\("fn_access_(allowed|tier)"/.test(read(rel))) out.push(rel);
    }
  };
  for (const d of ['app', 'services', 'lib', 'components']) walk(d);
  return out;
}
test('P2-09 app: admin-only audited actions; canAccess = session + fail-closed; the only app entry to the central check', () => {
  const actions = read('app/(site)/admin/access/actions.ts');
  const policy = read('lib/access/policy.ts');
  const why = appCheck(actions, policy, centralCallers());
  assert(why === null, why);
  assert(/requireAdminPage\(\{ path: "\/admin\/access" \}\)/.test(read('app/(site)/admin/access/page.tsx')), 'page: requireAdminPage, admin only');
  assert(/"\/admin\/access",/.test(read('lib/admin/nav.ts')), 'ADMIN_ONLY_ROUTES');
  const muts = [
    ['staff allowed', appCheck(actions.replace('export async function setPaywallAction(payload: { enabled: boolean; confirm: string }): Promise<AccessActionResult> {\n  const auth = await guardAdminAction();', 'export async function setPaywallAction(payload: { enabled: boolean; confirm: string }): Promise<AccessActionResult> {\n  const auth = await guardAdminAction({ allowStaff: true });'), policy, [])],
    ['no guard', appCheck(actions.replace(/(export async function clearAccessPolicyAction[^\n]*\n)  const auth = await guardAdminAction\(\);\n  if \(!auth\.ok\) return auth;\n/, '$1'), policy, [])],
    ['direct table write', appCheck(actions + '\nconst x = () => createAdminServerSupabaseClient().from("access_policies").upsert({});\n', policy, [])],
    ['canAccess via service role', appCheck(actions, policy.replace('const supabase = await createServerSupabaseClient();\n    const { data, error } = await supabase.rpc("fn_access_allowed"', 'const supabase = createAdminServerSupabaseClient();\n    const { data, error } = await supabase.rpc("fn_access_allowed"'), [])],
    ['canAccess fail-open', appCheck(actions, policy.replace('return !error && data === true;', 'return error ? true : data === true;'), [])],
    ['a second caller', appCheck(actions, policy, ['services/x.ts'])],
  ];
  const missed = muts.filter(([, w]) => w === null).map(([k]) => k);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

test('P2-07 negative controls: each mutation is caught', () => {
  const muts = [
    ['client grant on policies', tablesCheck(SQL.replace('GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_policies TO service_role;', 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_policies TO service_role;\nGRANT SELECT ON public.access_policies TO authenticated;'))],
    ['default FREE instead of PRO', fnCheck(SQL.replace("RETURN COALESCE(v_tier, 'PRO');", "RETURN COALESCE(v_tier, 'FREE');"))],
    ['INVOKER tier function', fnCheck(SQL.replace("RETURNS text\nLANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''", "RETURNS text\nLANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''"))],
    ['write granted to authenticated', grantCheck(SQL.replace('GRANT EXECUTE ON FUNCTION public.fn_paywall_set(boolean, uuid, text) TO service_role;', 'GRANT EXECUTE ON FUNCTION public.fn_paywall_set(boolean, uuid, text) TO authenticated, service_role;'))],
    ['set without audit', fnCheck(SQL.replace(/(CREATE OR REPLACE FUNCTION public\.fn_access_policy_set[\s\S]*?)INSERT INTO public\.admin_audit_logs/, '$1PERFORM 1; -- INSERT INTO nothing'))],
    ['switch default on', tablesCheck(SQL.replace('paywall_enabled boolean     NOT NULL DEFAULT false', 'paywall_enabled boolean     NOT NULL DEFAULT true'))],
    ['own-Pro helper for anon', grantCheck(SQL.replace('GRANT EXECUTE ON FUNCTION public.fn_has_pro_self() TO authenticated, service_role;', 'GRANT EXECUTE ON FUNCTION public.fn_has_pro_self() TO anon, authenticated, service_role;'))],
  ];
  const missed = muts.filter(([, why]) => why === null).map(([k]) => k);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

console.log(`\nPAY-1 B2a: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
