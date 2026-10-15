/**
 * SEC-HOTFIX-4 — admin/staff-only RLS on 11 content-authoring tables (migration 076).
 *
 * DB suite, couragelibrary-next only (ref guard + verified TLS via scripts/db/_db-env.cjs). Every scenario runs inside
 * BEGIN … ROLLBACK; nothing is persisted. To test the POLICY (not the grants), each table temporarily GRANTs
 * INSERT/UPDATE/DELETE to authenticated inside the rolled-back transaction.
 *
 *   P-1 static: no FOR ALL policy; every INSERT/UPDATE/DELETE policy and every authenticated SELECT policy on the 11
 *       tables is gated by fn_jwt_is_admin_or_staff(); the public read policies are unchanged
 *   P-2 student session (authenticated, no role): reads only what anon reads; UPDATE/DELETE affect 0 rows;
 *       INSERT is rejected by row-level security
 *   P-3 staff session (app_metadata.role = staff): reads every row; UPDATE reaches every row (policy path intact)
 *   P-4 grants unchanged: authenticated holds SELECT only (writes stay service-role only)
 *   P-6 PERMANENT RULE (whole public schema): no policy may give authenticated (or PUBLIC) blanket access, i.e.
 *       USING (true) / WITH CHECK (true), on non-public data. Blanket write policies always fail; blanket read
 *       policies are allowed only on the explicit PUBLIC_REFERENCE allow-list (or PENDING_RULING, reported loudly)
 *
 * Run: node scripts/test_sec_hotfix4_rls.cjs
 */
const crypto = require('crypto');
const { Client } = require('pg');
const { dbTarget } = require('./db/_db-env.cjs');

const TABLES = [
  'canonical_taxonomy_nodes', 'taxonomy_aliases',
  'exam_syllabus_versions', 'exam_syllabus_nodes', 'exam_syllabus_canonical_mappings',
  'exam_knowledge_documents', 'exam_doc_versions', 'exam_posts', 'exam_sources', 'exam_claims', 'exam_claim_sources',
];
// public read policies that must stay exactly as they were (name → USING expression), captured before 076
const PUBLIC_READ = {
  canonical_taxonomy_nodes: ['Public candidates can view active canonical taxonomy nodes', '(is_active = true)'],
  taxonomy_aliases: ['Public candidates can view taxonomy aliases', 'true'],
  exam_syllabus_versions: ['Public candidates can view published exam syllabus versions', "((status = 'PUBLISHED'::text) AND (is_active = true))"],
  exam_knowledge_documents: ['Public candidates can view published exam knowledge documents', "((status = 'PUBLISHED'::text) AND (current_published_version_id IS NOT NULL))"],
  exam_doc_versions: ['Public candidates can view published exam doc versions', "((is_published = true) AND (review_status = 'PUBLISHED'::text))"],
  exam_posts: ['Public candidates can view active exam posts', '(is_active = true)'],
  exam_sources: ['Public candidates can view verified exam sources', "(verification_status = 'SOURCE_VERIFIED'::text)"],
  exam_claims: ['Public candidates can view verified exam claims', "(verification_status = 'VERIFIED'::text)"],
  exam_claim_sources: ['Public candidates can view claim sources', 'true'],
};
// P-6: tables whose rows are public by design (reference content, no user data). Additions need an architect ruling.
const PUBLIC_REFERENCE = new Set([
  'exam_topics', 'pattern_sections', 'taxonomy_aliases', 'exam_claim_sources', 'learning_unit_asset_bindings',
  'mistake_cognitive_types', 'exam_cutoff_benchmarks',
]);
// P-6: per-user rows behind a blanket read policy; tolerated only until the architect rules (0 rows on 2026-10-16)
const PENDING_RULING = new Set(['leaderboard_weekly_snapshots', 'user_battle_stats']);
const isTrue = (s) => /^\(*\s*true\s*\)*$/i.test(String(s || '').trim());
function blanketViolations(policies) {
  const bad = [];
  const pending = [];
  for (const p of policies) {
    if (!/authenticated|\{public\}/.test(p.roles)) continue;
    const readBlanket = p.cmd !== 'INSERT' && isTrue(p.qual);
    const writeBlanket = p.cmd !== 'SELECT' && (readBlanket || (p.cmd !== 'DELETE' && isTrue(p.wc)));
    if (writeBlanket) bad.push(`${p.t}: blanket ${p.cmd} policy "${p.policyname}"`);
    else if (readBlanket && PENDING_RULING.has(p.t)) pending.push(p.t);
    else if (readBlanket && !PUBLIC_REFERENCE.has(p.t)) bad.push(`${p.t}: blanket read on non-allow-listed table "${p.policyname}"`);
  }
  return { bad, pending };
}
const STUDENT = { sub: '00000000-0000-4000-8000-0000000000a1', role: 'authenticated', app_metadata: {} };
const STAFF = { sub: '00000000-0000-4000-8000-0000000000b2', role: 'authenticated', app_metadata: { role: 'staff' } };

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { const info = await fn(); passed++; console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`); } catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 2500)}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

(async () => {
  console.log('SEC-HOTFIX-4 staff-only RLS');
  const c = new Client({ ...dbTarget().pg, port: 6543 });
  c.on('error', () => {});
  await c.connect();
  const q = (sql, p) => c.query(sql, p);
  const as = async (claims, role = 'authenticated') => {
    await q(`SET LOCAL ROLE ${role}`);
    await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || {})]);
  };
  try {
    await test('P-1 static: no FOR ALL policy; all authenticated policies gated by fn_jwt_is_admin_or_staff(); public reads unchanged', async () => {
      const { rows } = await q(`SELECT tablename t, policyname, cmd, roles::text roles, coalesce(qual,'') qual, coalesce(with_check,'') wc
                                FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1)`, [TABLES]);
      const bad = [];
      for (const t of TABLES) {
        const ps = rows.filter((r) => r.t === t);
        if (ps.some((p) => p.cmd === 'ALL')) bad.push(`${t}: FOR ALL policy present`);
        for (const p of ps) {
          const authn = /authenticated/.test(p.roles);
          const write = ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(p.cmd);
          const gated = (s) => /fn_jwt_is_admin_or_staff\(\)/.test(s);
          if (write && /\{public\}|anon/.test(p.roles)) bad.push(`${t}: write policy for public/anon "${p.policyname}"`);
          if (write && p.cmd !== 'INSERT' && !gated(p.qual)) bad.push(`${t}: ${p.cmd} USING not gated "${p.policyname}"`);
          if (write && p.cmd !== 'DELETE' && !gated(p.wc)) bad.push(`${t}: ${p.cmd} WITH CHECK not gated "${p.policyname}"`);
          if (p.cmd === 'SELECT' && authn && !gated(p.qual)) bad.push(`${t}: authenticated SELECT not gated "${p.policyname}"`);
        }
        for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) if (!ps.some((p) => p.cmd === cmd && /authenticated/.test(p.roles))) bad.push(`${t}: no admin/staff ${cmd} policy`);
        const pub = PUBLIC_READ[t];
        if (pub && !ps.some((p) => p.policyname === pub[0] && p.cmd === 'SELECT' && /\{public\}/.test(p.roles) && p.qual === pub[1])) bad.push(`${t}: public read policy changed or missing`);
      }
      assert(bad.length === 0, bad.join('\n        '));
      return `${rows.length} policies on ${TABLES.length} tables`;
    });

    const results = [];
    for (const t of TABLES) {
      await q('BEGIN READ WRITE');
      try {
        await q(`GRANT INSERT, UPDATE, DELETE ON public.${t} TO authenticated`); // test the POLICY; rolled back below
        const total = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        const col = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`, [t])).rows[0].c; // no-op update column
        const sample = (await q(`SELECT to_jsonb(x) j FROM public.${t} x LIMIT 1`)).rows[0];
        await q('SAVEPOINT s');
        await as({}, 'anon');
        const anonCount = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        await q('ROLLBACK TO SAVEPOINT s');
        await as(STUDENT);
        const stCount = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        // a write that RLS lets through either affects rows or fails on a constraint/trigger: both mean the row was reachable
        const probe = async (sql) => { await q('SAVEPOINT w'); try { const n = (await q(sql)).rowCount; await q('RELEASE SAVEPOINT w'); return n; } catch (e) { await q('ROLLBACK TO SAVEPOINT w'); return `REACHED(${e.code})`; } };
        const stUpd = await probe(`UPDATE public.${t} SET "${col}" = "${col}"`);
        const stDel = await probe(`DELETE FROM public.${t}`);
        await q('ROLLBACK TO SAVEPOINT s');
        // INSERT attempt as student (RLS WITH CHECK runs before constraint checks)
        let insert = 'n/a';
        await as(STUDENT);
        try {
          if (sample) {
            const row = { ...sample.j, id: crypto.randomUUID() };
            // only writable columns (generated / identity columns cannot be inserted — that would fail before RLS)
            const cols = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' AND identity_generation IS NULL ORDER BY ordinal_position`, [t])).rows.map((r) => `"${r.c}"`).join(', ');
            await q(`INSERT INTO public.${t} (${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.${t}, $1::jsonb)`, [JSON.stringify(row)]);
          } else {
            await q(`INSERT INTO public.${t} DEFAULT VALUES`);
          }
          insert = 'ALLOWED';
        } catch (e) {
          // BEFORE INSERT triggers run before RLS: a trigger error (P0001) is inconclusive and covered by P-1 + P-5
          insert = e.code === '42501' && /row-level security/i.test(e.message) ? 'DENIED_BY_RLS' : e.code === 'P0001' ? 'TRIGGER_FIRST' : `OTHER_ERROR ${e.code}`;
        }
        await q('ROLLBACK TO SAVEPOINT s');
        await as(STAFF);
        const sfCount = Number((await q(`SELECT count(*) n FROM public.${t}`)).rows[0].n);
        const sfUpd = await (async () => { await q('SAVEPOINT w'); try { const n = (await q(`UPDATE public.${t} SET "${col}" = "${col}"`)).rowCount; await q('RELEASE SAVEPOINT w'); return n; } catch (e) { await q('ROLLBACK TO SAVEPOINT w'); return `ERROR(${e.code})`; } })();
        await q('ROLLBACK TO SAVEPOINT s');
        results.push({ t, total, anonCount, stCount, stUpd, stDel, insert, sfCount, sfUpd });
      } finally {
        await q('ROLLBACK');
      }
    }

    await test('P-2 student session: reads only what anon reads; UPDATE/DELETE 0 rows; INSERT denied by RLS', async () => {
      const bad = results.filter((r) => r.stCount !== r.anonCount || r.stUpd !== 0 || r.stDel !== 0 || !['DENIED_BY_RLS', 'TRIGGER_FIRST'].includes(r.insert));
      assert(bad.length === 0, bad.map((r) => `${r.t}: read ${r.stCount}/${r.total} (anon ${r.anonCount}), update ${r.stUpd}, delete ${r.stDel}, insert ${r.insert}`).join('\n        '));
      const hidden = results.reduce((a, r) => a + (r.total - r.stCount), 0);
      const trig = results.filter((r) => r.insert === 'TRIGGER_FIRST').map((r) => r.t);
      return `${results.length} tables; ${hidden} non-public rows hidden from students; insert denied by RLS on ${results.length - trig.length}${trig.length ? `, trigger-first on ${trig.join(', ')} (see P-5)` : ''}`;
    });

    await test('P-3 staff session: reads every row and UPDATE reaches every row', async () => {
      // staff UPDATE must reach every row: affected = total, or a trigger/constraint error (anything but RLS 42501)
      const reached = (r) => r.sfUpd === r.total || (typeof r.sfUpd === 'string' && !/42501/.test(r.sfUpd));
      const bad = results.filter((r) => r.sfCount !== r.total || !reached(r));
      assert(bad.length === 0, bad.map((r) => `${r.t}: staff read ${r.sfCount}/${r.total}, update ${r.sfUpd}`).join('\n        '));
    });

    await test('P-5 policy predicate: fn_jwt_is_admin_or_staff() false for a student, true for staff / admin; not executable by anon (policies are TO authenticated)', async () => {
      const out = {};
      out.anonCanExecute = (await q("SELECT has_function_privilege('anon', 'public.fn_jwt_is_admin_or_staff()', 'EXECUTE') v")).rows[0].v;
      for (const [k, claims, role] of [['student', STUDENT, 'authenticated'], ['staff', STAFF, 'authenticated'], ['admin', { ...STAFF, app_metadata: { role: 'admin' } }, 'authenticated']]) {
        await q('BEGIN READ ONLY');
        try { await as(claims, role); out[k] = (await q('SELECT public.fn_jwt_is_admin_or_staff() v')).rows[0].v; } finally { await q('ROLLBACK'); }
      }
      assert(out.student === false && out.staff === true && out.admin === true && out.anonCanExecute === false, JSON.stringify(out));
      return JSON.stringify(out);
    });

    await test('P-4 grants unchanged: authenticated holds SELECT only on the 11 tables', async () => {
      const { rows } = await q(`SELECT table_name t, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants
                                WHERE table_schema='public' AND grantee='authenticated' AND table_name = ANY($1) GROUP BY 1`, [TABLES]);
      const bad = TABLES.filter((t) => (rows.find((r) => r.t === t) || {}).p !== 'SELECT');
      assert(bad.length === 0, bad.map((t) => `${t}: ${(rows.find((r) => r.t === t) || {}).p}`).join(', '));
    });

    await test('P-6 permanent rule: no blanket (USING/WITH CHECK true) policy for authenticated/PUBLIC on non-public data (whole schema)', async () => {
      // self-test: the pre-076 policy shape and a blanket read on user data must both be caught
      const fixture = blanketViolations([
        { t: 'exam_sources', policyname: 'fixture', cmd: 'ALL', roles: '{authenticated}', qual: 'true', wc: 'true' },
        { t: 'user_profiles', policyname: 'fixture-read', cmd: 'SELECT', roles: '{authenticated}', qual: '(true)', wc: '' },
      ]);
      assert(fixture.bad.length === 2, 'self-test: classifier missed the pre-076 pattern');
      const { rows } = await q(`SELECT tablename t, policyname, cmd, roles::text roles, coalesce(qual,'') qual, coalesce(with_check,'') wc
                                FROM pg_policies WHERE schemaname='public'`);
      const { bad, pending } = blanketViolations(rows);
      assert(bad.length === 0, bad.join('\n        '));
      const pend = [...new Set(pending)];
      return `${rows.length} policies scanned; ${PUBLIC_REFERENCE.size} allow-listed public tables` +
        (pend.length ? `; PENDING RULING (per-user data under a blanket read): ${pend.join(', ')}` : '');
    });
  } finally {
    await c.end();
  }
  console.log(`\nSEC-HOTFIX-4 RLS: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', String(e.message).replace(/postgres(ql)?:\/\/\S+/g, '[url]').slice(0, 300)); process.exit(1); });
