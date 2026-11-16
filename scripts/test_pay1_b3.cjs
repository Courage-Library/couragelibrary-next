#!/usr/bin/env node
/**
 * PAY-1 B3 part 1 — offline gate (static; no network) for migration 147 and its rollback (owner decisions 2026-11-15).
 *   P4-01 seeds: MISTAKE_VAULT → FREE only where no admin changed it (updated_by IS NULL); MISTAKE_DRILLS PRO, never
 *         overwriting an existing row
 *   P4-02 fn_access_allowed_many: DEFINER, STABLE, search_path '', ≤ 500 keys, the SAME rule as fn_access_allowed
 *         (switch off → allowed; FREE → allowed; else the caller's own Pro via fn_has_pro_self, never for anon); EXECUTE
 *         anon + authenticated + service_role, not PUBLIC; allow-list + P-9 entries
 *   P4-03 the thread / flashcard read policies, the flashcard review and both battle functions decide through the central
 *         check (or refuse PRO) and read no user_entitlements; the two search_indexes read policies are dropped
 *   P4-04 rollback: chain line; restores the live definitions (incl. the old entitlement reads), both search policies,
 *         drops fn_access_allowed_many, reverts the seeds only where no admin changed them
 *   P4-05 negative controls
 * Run: node scripts/test_pay1_b3.cjs
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
const MIG = 'supabase/migrations/20261116000147_pay1_b3_central_checks.sql';
const RB = 'docs/database/rollback/147_rollback.sql';
const block = (sql, startRx) => {
  const m = sql.match(startRx);
  if (!m) return '';
  const rest = sql.slice(m.index);
  const end = rest.search(/\n\$(?:function)?\$;?\n/);
  return end < 0 ? rest : rest.slice(0, end + 4);
};

const seedCheck = (sql) => {
  if (!/UPDATE public\.access_policies SET tier = 'FREE'[^;]*WHERE item_kind = 'FEATURE' AND item_key = 'MISTAKE_VAULT' AND tier = 'PRO' AND updated_by IS NULL;/.test(sql.replace(/\s+/g, ' '))) return 'MISTAKE_VAULT seed must only change an untouched PRO row';
  if (!/INSERT INTO public\.access_policies \(item_kind, item_key, tier\) VALUES \('FEATURE', 'MISTAKE_DRILLS', 'PRO'\)\s+ON CONFLICT \(item_kind, item_key\) DO NOTHING;/.test(sql)) return 'MISTAKE_DRILLS seed must not overwrite';
  return null;
};
const manyCheck = (sql) => {
  const f = block(sql, /CREATE OR REPLACE FUNCTION public\.fn_access_allowed_many\(p_kind text, p_keys text\[\]\)/);
  if (!f) return 'fn_access_allowed_many missing';
  if (!/LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''/.test(f)) return 'DEFINER / STABLE / search_path';
  if (!/cardinality\(p_keys\) > 500/.test(f)) return '≤ 500 keys';
  if (!/IF v_on IS TRUE AND auth\.uid\(\) IS NOT NULL THEN\s+v_pro := public\.fn_has_pro_self\(\);/.test(f)) return 'Pro only for a signed-in caller, only when the switch is on';
  if (!/\(v_on IS DISTINCT FROM true OR t\.tier = 'FREE' OR v_pro\)/.test(f)) return 'not the fn_access_allowed rule';
  if (!/public\.fn_access_tier\(p_kind, k\.key\)/.test(f)) return 'tier from fn_access_tier';
  if (!sql.includes('REVOKE ALL ON FUNCTION public.fn_access_allowed_many(text, text[]) FROM PUBLIC;') || !sql.includes('GRANT EXECUTE ON FUNCTION public.fn_access_allowed_many(text, text[]) TO anon, authenticated, service_role;')) return 'grants';
  return null;
};
const centralCheck = (sql) => {
  const thr = (sql.match(/ALTER POLICY "p_threads_read_public"[\s\S]*?;\n/) || [''])[0];
  const fca = (sql.match(/ALTER POLICY "p_fcards_select"[\s\S]*?;\n/) || [''])[0];
  if (!/public\.fn_access_allowed\('COURSE', c\.id::text\)/.test(thr) || /user_entitlements|access_tier|is_free_preview/.test(thr)) return 'thread policy not on the central check';
  if (!/public\.fn_access_allowed\('FEATURE', 'FLASHCARDS'\)/.test(fca) || /user_entitlements/.test(fca)) return 'flashcard policy not on the central check';
  if (!/DROP POLICY "p_search_indexes_read_public" ON public\.search_indexes;/.test(sql) || !/DROP POLICY "p_search_indexes_read_auth" ON public\.search_indexes;/.test(sql)) return 'search policies not dropped';
  const rev = block(sql, /CREATE OR REPLACE FUNCTION public\.fn_submit_flashcard_review\(/);
  if (!/v_has_pro := public\.fn_access_allowed\('FEATURE', 'FLASHCARDS'\);/.test(rev) || /user_entitlements/.test(rev)) return 'flashcard review not on the central check';
  const bat = block(sql, /CREATE OR REPLACE FUNCTION public\.fn_find_or_create_battle_room\(/);
  const join = block(sql, /CREATE OR REPLACE FUNCTION public\.fn_join_battle_by_code\(/);
  if (!/IF p_access_tier IS DISTINCT FROM 'FREE' THEN\s+RETURN jsonb_build_object\('success', false/.test(bat) || /user_entitlements/.test(bat)) return 'battle arena: PRO not refused / entitlement read left';
  if (!/IF v_access_tier IS DISTINCT FROM 'FREE' THEN\s+RETURN jsonb_build_object\('success', false/.test(join) || /user_entitlements/.test(join)) return 'battle join: PRO not refused / entitlement read left';
  if (/user_entitlements/.test(sql.replace(/^--.*$/gm, ''))) return 'an entitlement read is left in 147';
  return null;
};
const rollbackCheck = (rb) => {
  if (!/^-- ROLLBACK-CHAIN: run first: /m.test(rb)) return 'chain line';
  for (const f of ['fn_join_battle_by_code', 'fn_find_or_create_battle_room', 'fn_submit_flashcard_review']) if (!rb.includes(`CREATE OR REPLACE FUNCTION public.${f}(`)) return `restores ${f}`;
  if ((rb.match(/user_entitlements/g) || []).length < 5) return 'the live definitions (with their entitlement reads) are not restored';
  if (!/CREATE POLICY "p_search_indexes_read_public"/.test(rb) || !/CREATE POLICY "p_search_indexes_read_auth"/.test(rb)) return 'search policies not restored';
  if (!/ALTER POLICY "p_fcards_select"/.test(rb) || !/ALTER POLICY "p_threads_read_public"/.test(rb)) return 'policies not restored';
  if (!/DROP FUNCTION IF EXISTS public\.fn_access_allowed_many\(text, text\[\]\);/.test(rb)) return 'fn_access_allowed_many not dropped';
  if (!/DELETE FROM public\.access_policies WHERE item_kind = 'FEATURE' AND item_key = 'MISTAKE_DRILLS' AND updated_by IS NULL;/.test(rb)) return 'MISTAKE_DRILLS revert must spare an admin row';
  if (!/AND item_key = 'MISTAKE_VAULT' AND tier = 'FREE' AND updated_by IS NULL;/.test(rb.replace(/\s+/g, ' '))) return 'MISTAKE_VAULT revert must spare an admin row';
  return null;
};

const SQL = read(MIG);
const RBS = read(RB);
test('P4-01 seeds: MISTAKE_VAULT → FREE only where untouched; MISTAKE_DRILLS PRO without overwriting', () => {
  const why = seedCheck(SQL);
  assert(why === null, why);
});
test('P4-02 fn_access_allowed_many: DEFINER, STABLE, search_path "", ≤ 500 keys, the fn_access_allowed rule; anon + authenticated; allow-list + P-9', () => {
  const why = manyCheck(SQL);
  assert(why === null, why);
  const a = JSON.parse(read('scripts/secdef/allowlist.json'));
  const e = a.functions['fn_access_allowed_many(p_kind text, p_keys text[])'];
  assert(e && e.class === 'A' && e.client.join() === 'anon,authenticated' && e.search_path === '""' && a.public_ok.includes('fn_access_allowed_many(p_kind text, p_keys text[])'), 'allow-list entry');
  assert(/fn_access_allowed_many: '[^']{20,}'/.test(read('scripts/test_sec_hotfix4_rls.cjs')), 'RLS P-9 entry');
});
test('P4-03 thread / flashcard policies, flashcard review and both battle functions on the central check (or PRO refused); no entitlement read left; search policies dropped', () => {
  const why = centralCheck(SQL);
  assert(why === null, why);
});
test('P4-04 rollback restores the live definitions + both search policies, drops fn_access_allowed_many, reverts seeds only where untouched', () => {
  const why = rollbackCheck(RBS);
  assert(why === null, why);
});
test('P4-05 negative controls: each mutation is caught', () => {
  const muts = [
    ['seed overwrites an admin choice', seedCheck(SQL.replace(" AND tier = 'PRO' AND updated_by IS NULL;", ';'))],
    ['batched check treats anon as Pro', manyCheck(SQL.replace('IF v_on IS TRUE AND auth.uid() IS NOT NULL THEN', 'IF v_on IS TRUE THEN'))],
    ['batched check ignores the switch', manyCheck(SQL.replace('(v_on IS DISTINCT FROM true OR t.tier = ', '(t.tier = '))],
    ['batched check granted to PUBLIC', manyCheck(SQL.replace('REVOKE ALL ON FUNCTION public.fn_access_allowed_many(text, text[]) FROM PUBLIC;\n', ''))],
    ['flashcard policy keeps an entitlement read', centralCheck(SQL.replace("public.fn_access_allowed('FEATURE', 'FLASHCARDS') OR", "(EXISTS (SELECT 1 FROM user_entitlements ue WHERE ue.user_id = auth.uid())) OR"))],
    ['a search policy kept', centralCheck(SQL.replace('DROP POLICY "p_search_indexes_read_auth" ON public.search_indexes;\n', ''))],
    ['PRO battle arenas allowed', centralCheck(SQL.replace("IF p_access_tier IS DISTINCT FROM 'FREE' THEN", 'IF false THEN'))],
    ['rollback forgets to drop the batched check', rollbackCheck(RBS.replace('DROP FUNCTION IF EXISTS public.fn_access_allowed_many(text, text[]);\n', ''))],
    ['rollback deletes an admin MISTAKE_DRILLS row', rollbackCheck(RBS.replace("AND item_key = 'MISTAKE_DRILLS' AND updated_by IS NULL;", "AND item_key = 'MISTAKE_DRILLS';"))],
  ];
  const missed = muts.filter(([, w]) => w === null).map(([k]) => k);
  assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
  return `${muts.length} mutations caught`;
});

console.log(`\nPAY-1 B3: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
