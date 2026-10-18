/**
 * #54 SECURITY DEFINER ratchet (permanent gate, beside P-9; SECDEF-S2-1, architect-approved).
 * Baseline / reviewed allow-list: scripts/secdef/allowlist.json (every SECURITY DEFINER function in public, its class,
 * its client grants and a one-line reason). Live catalogue (verified TLS, BEGIN READ ONLY).
 *   SR-0 minimum coverage: ≥ 1 function scanned and the live count is reported (GATE-HYGIENE-1)
 *   SR-1 no NEW SECURITY DEFINER function: every live one is in the allow-list (review + add it there first)
 *   SR-2 no new client exposure: anon / authenticated / PUBLIC EXECUTE only as listed for that function
 *   SR-3 anon / PUBLIC EXECUTE on a callable function only with public_ok (P-9 SECDEF_PUBLIC_OK)
 *   SR-4 search_path pinned to '' or 'public, pg_temp' on every function
 *   SR-5 counts may only go down: total, client-executable callable, anon-or-PUBLIC, and per class ≤ max
 * Reductions (revoked grants, dropped functions) pass and are listed as NOTE so the baseline can be tightened.
 * Run: node scripts/test_secdef_ratchet.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { ROOT, dbTarget } = require('./db/_db-env.cjs');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/secdef/allowlist.json'), 'utf8'));

(async () => {
  console.log('#54 SECURITY DEFINER ratchet');
  const c = new Client({ ...dbTarget().pg });
  c.on('error', () => {});
  await c.connect();
  let live;
  try {
    await c.query('BEGIN READ ONLY');
    live = (await c.query(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' sig, (p.prorettype = 'trigger'::regtype) trg,
        (SELECT substring(x from 13) FROM unnest(coalesce(p.proconfig, '{}')) x WHERE x LIKE 'search_path=%' LIMIT 1) sp,
        has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') pub
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef ORDER BY 1`)).rows;
    await c.query('ROLLBACK');
  } finally {
    await c.end().catch(() => {});
  }
  const clientOf = (f) => [f.anon && 'anon', f.auth && 'authenticated', f.pub && 'PUBLIC'].filter(Boolean);
  const notes = [];

  await test('SR-0 minimum coverage: SECURITY DEFINER functions scanned', async () => {
    assert(live.length >= 1 && Object.keys(base.functions).length >= 1, `live ${live.length}, allow-list ${Object.keys(base.functions).length}`);
    return `${live.length} live, ${Object.keys(base.functions).length} in the allow-list`;
  });

  await test('SR-1 no new SECURITY DEFINER function outside the reviewed allow-list', async () => {
    const unknown = live.filter((f) => !base.functions[f.sig]).map((f) => f.sig);
    const gone = Object.keys(base.functions).filter((s) => !live.some((f) => f.sig === s));
    if (gone.length) notes.push(`dropped / renamed (remove from the allow-list, lower max): ${gone.join(', ')}`);
    assert(unknown.length === 0, `new SECURITY DEFINER function(s) — review against #54 and add to scripts/secdef/allowlist.json: ${unknown.join(', ')}`);
    return `${live.length} listed`;
  });

  await test('SR-2 no new client EXECUTE (anon / authenticated / PUBLIC) beyond the allow-list', async () => {
    const bad = [];
    for (const f of live) {
      const b = base.functions[f.sig];
      if (!b) continue;
      const now = clientOf(f);
      const extra = now.filter((g) => !b.client.includes(g));
      const lost = b.client.filter((g) => !now.includes(g));
      if (extra.length) bad.push(`${f.sig}: new EXECUTE for ${extra.join(', ')}`);
      if (lost.length) notes.push(`${f.sig}: EXECUTE revoked from ${lost.join(', ')} (tighten the allow-list)`);
    }
    assert(bad.length === 0, bad.join('\n        '));
    return `${live.filter((f) => clientOf(f).length).length} functions with client EXECUTE, all as listed`;
  });

  await test('SR-3 anon / PUBLIC EXECUTE on a callable function only with public_ok', async () => {
    const bad = live.filter((f) => !f.trg && (f.anon || f.pub) && !base.public_ok.includes(f.sig)).map((f) => `${f.sig}: ${f.pub ? 'PUBLIC' : 'anon'}`);
    assert(bad.length === 0, bad.join(', '));
    return `public_ok: ${base.public_ok.length}`;
  });

  // every function keeps the pinned search_path recorded in the allow-list (no function loses or loosens it); new
  // functions are reviewed under SR-1 and must use '' or 'public, pg_temp' (#54)
  await test('SR-4 search_path pinned and unchanged from the allow-list', async () => {
    const bad = live.filter((f) => f.sp === null || (base.functions[f.sig] && base.functions[f.sig].search_path !== f.sp)).map((f) => `${f.sig}: ${f.sp === null ? 'unpinned' : `${f.sp} (allow-list: ${base.functions[f.sig].search_path})`}`);
    assert(bad.length === 0, bad.join(', '));
    const other = live.filter((f) => !(f.sp === '""' || f.sp === 'public, pg_temp')).map((f) => `${f.sig}=${f.sp}`);
    return `${live.length} pinned${other.length ? `; recorded non-default: ${other.join(', ')}` : ''}`;
  });

  await test('SR-5 counts may only go down (total, client-executable, anon-or-PUBLIC, per class)', async () => {
    const cls = (f) => (base.functions[f.sig] || {}).class;
    const counts = {
      total: live.length,
      client_executable_callable: live.filter((f) => !f.trg && clientOf(f).length).length,
      anon_or_public: live.filter((f) => f.anon || f.pub).length,
      A: live.filter((f) => cls(f) === 'A' && clientOf(f).length).length,
      C: live.filter((f) => cls(f) === 'C' && clientOf(f).length).length,
      'B-trigger': live.filter((f) => f.trg).length,
      'B-service': live.filter((f) => cls(f) === 'B-service').length,
      'B-internal': live.filter((f) => cls(f) === 'B-internal').length,
    };
    const over = Object.entries(counts).filter(([k, n]) => n > base.max[k]).map(([k, n]) => `${k} ${n} > max ${base.max[k]}`);
    const under = Object.entries(counts).filter(([k, n]) => n < base.max[k]).map(([k, n]) => `${k} ${n} < ${base.max[k]}`);
    if (under.length) notes.push(`counts went down (lower max in the allow-list): ${under.join(', ')}`);
    assert(over.length === 0, over.join(', '));
    return Object.entries(counts).map(([k, n]) => `${k} ${n}/${base.max[k]}`).join(', ');
  });

  for (const n of notes) console.log(`  NOTE  ${n}`);
  console.log(`\n#54 SECDEF ratchet: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e && e.code ? `error code ${e.code}` : String(e && e.message).slice(0, 200)); process.exit(1); });
