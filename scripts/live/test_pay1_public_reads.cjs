#!/usr/bin/env node
/**
 * PAY-1 B2b part 2 step 1 — EXECUTED proof for migration 145 (the narrow public reads; owner conditions 1–4,
 * 2026-11-15). ONE transaction, always rolled back (withLiveTransaction). Counts / codes / column NAMES only; no row
 * values, ids or e-mails printed.
 *   P-C catalog: each of the five is SECURITY DEFINER, STABLE, search_path "", EXECUTE for anon + authenticated, not
 *       PUBLIC
 *   P-A anon calls each one successfully; every output column is a listing figure (no content column)
 *   P-E equivalence: each result equals the same read done directly with the filters stated (published, non-dynamic,
 *       active template, no QA fixtures / PUBLISHED + current + published question) — nothing wider, nothing missing
 *   P-D a draft and a dynamic mock never appear (a published static copy does)
 *   P-N negative control: a planted function returning question_text (granted to anon) is caught by the same column
 *       check; anon still cannot list the reserved questions (fn_reserved_question_ids, 42501)
 * Run: node scripts/live/test_pay1_public_reads.cjs [--pre]               (project DB; --pre applies 145 in the tx)
 *      node scripts/live/test_pay1_public_reads.cjs --local=54329 --pre   (local copy)
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000145_pay1_b2b_public_reads.sql'), 'utf8');
const FNS = ['fn_public_exam_mocks(uuid)', 'fn_public_mock_counts()', 'fn_public_hindi_question_count()', 'fn_public_mock_shape(uuid)', 'fn_public_ca_daily_mock_id(date)'];
const OUT_OK = new Set(['id', 'title', 'duration_minutes', 'total_questions', 'total_marks', 'is_free', 'test_type', 'exam_id', 'published_mocks',
  'fn_public_hindi_question_count', 'fn_public_ca_daily_mock_id']);

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}`);
};
function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}
/** the column check (condition 1): names only; a name outside the listing set is a leak */
const leakCols = (fields) => fields.map((f) => f.name).filter((n) => !OUT_OK.has(n));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const asAnon = async (s, p) => {
    await c.query('SAVEPOINT a');
    await c.query('SET LOCAL ROLE anon');
    try {
      const r = await c.query(s, p);
      await c.query('RESET ROLE');
      await c.query('RELEASE SAVEPOINT a');
      return { code: null, rows: r.rows, fields: r.fields };
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT a');
      await c.query('RESET ROLE');
      return { code: e.code || 'ERR', rows: [], fields: [] };
    }
  };
  try {
    await withLiveTransaction(c, async () => {
      if (PRE) await c.query(SQL);

      // ---------- P-C catalog
      const cat = await q(`select p.oid::regprocedure::text sig, p.prosecdef d, p.provolatile v, p.proconfig cfg,
              has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') public_x
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'fn_public\\_%' and p.proname <> 'fn_public_identities'`);
      const bad = FNS.filter((f) => {
        const r = cat.find((x) => x.sig === f);
        return !r || !r.d || r.v !== 's' || !(r.cfg || []).includes('search_path=""') || !r.anon_x || !r.auth_x || r.public_x;
      });
      chk('P-C the five: SECURITY DEFINER, STABLE, search_path "", EXECUTE anon + authenticated, not PUBLIC', bad.length === 0 && cat.length === FNS.length, `bad: ${bad.join(', ')}; found ${cat.length}`);

      // fixtures: an exam with a published static mock (the copy below) + a draft and a dynamic copy of it
      const base = await one(`select m.id::text id, t.exam_id::text exam from public.mock_tests m join public.mock_templates t on t.id = m.template_id
             where t.is_active and m.status = 'published' and not m.is_dynamic and m.slug not like 'qa-fixture-run-%' order by m.created_at limit 1`);
      if (!base) {
        if (LOCAL) console.log('SKIP P-A / P-E / P-D — the local copy has no mock rows (non-personal tables only); they run in the project --pre proof');
        else chk('P-A / P-E / P-D need a published static mock of an active template', false, 'none in this database');
      } else {
        const copy = async (patch) => (await one(`insert into public.mock_tests
              select (jsonb_populate_record(null::public.mock_tests, to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'slug', m.slug || '-pr-gate-' || substr(md5(random()::text), 1, 6)) || $2::jsonb)).*
                from public.mock_tests m where m.id = $1 returning id::text id`, [base.id, JSON.stringify(patch)])).id;
        const draft = await copy({ status: 'draft' });
        const dyn = await copy({ is_dynamic: true });
        const pub = await copy({});
        const dateStr = '2099-12-31';
        const ca = await copy({ slug: `ca-daily-${dateStr}` });

        // ---------- P-A anon calls + column check
        const calls = {
          exam: await asAnon(`select * from public.fn_public_exam_mocks($1)`, [base.exam]),
          counts: await asAnon(`select * from public.fn_public_mock_counts()`),
          hindi: await asAnon(`select public.fn_public_hindi_question_count()`),
          shape: await asAnon(`select * from public.fn_public_mock_shape($1)`, [pub]),
          caId: await asAnon(`select public.fn_public_ca_daily_mock_id($1::date)`, [dateStr]),
        };
        const errs = Object.entries(calls).filter(([, r]) => r.code).map(([k, r]) => `${k}:${r.code}`);
        const leaks = Object.entries(calls).flatMap(([k, r]) => leakCols(r.fields).map((n) => `${k}.${n}`));
        chk('P-A anon calls all five; every output column is a listing figure (no content column)', errs.length === 0 && leaks.length === 0, `errors ${errs.join(', ')} leaks ${leaks.join(', ')}`);

        // ---------- P-E equivalence with the stated filters (as the owner role, no RLS)
        const direct = await q(`select m.id::text from public.mock_tests m join public.mock_templates t on t.id = m.template_id
              where t.exam_id = $1 and t.is_active and m.status = 'published' and not m.is_dynamic and m.slug not like 'qa-fixture-run-%' order by m.title limit 60`, [base.exam]);
        const dCounts = await q(`select t.exam_id::text e, count(*)::int n from public.mock_tests m join public.mock_templates t on t.id = m.template_id
              where t.is_active and m.status = 'published' and not m.is_dynamic and m.slug not like 'qa-fixture-run-%' group by 1 order by 1`);
        const dHindi = await one(`select count(*)::int n from public.question_versions qv join public.questions qq on qq.id = qv.question_id
              where qv.language = 'hi' and qv.lifecycle_status = 'PUBLISHED' and qv.is_current and qq.status = 'published'`);
        const examIds = calls.exam.rows.map((r) => r.id).sort();
        const cnt = calls.counts.rows.map((r) => ({ e: r.exam_id, n: r.published_mocks })).sort((a, b) => (a.e < b.e ? -1 : 1));
        chk('P-E each result equals the read with the stated filters (exam list, counts, Hindi count)',
          same(examIds, direct.map((r) => r.id).sort()) && same(cnt, dCounts) && calls.hindi.rows[0].fn_public_hindi_question_count === dHindi.n,
          JSON.stringify({ exam: [examIds.length, direct.length], counts: [cnt.length, dCounts.length], hindi: [calls.hindi.rows[0]?.fn_public_hindi_question_count, dHindi.n] }));

        // ---------- P-D draft / dynamic never listed; the published copy is
        const shapeOf = async (id) => (await asAnon(`select * from public.fn_public_mock_shape($1)`, [id])).rows.length;
        chk('P-D a draft or dynamic mock never appears (list + shape); the published static copy and the dated CA mock do',
          !examIds.includes(draft) && !examIds.includes(dyn) && (await shapeOf(draft)) === 0 && (await shapeOf(dyn)) === 0 && calls.shape.rows.length === 1 && calls.caId.rows[0].fn_public_ca_daily_mock_id === ca,
          JSON.stringify({ draftListed: examIds.includes(draft), dynListed: examIds.includes(dyn), pubShape: calls.shape.rows.length, ca: calls.caId.rows[0]?.fn_public_ca_daily_mock_id === ca }));
      }

      // ---------- P-N negative control: a planted content-returning function is caught by the same check
      await c.query(`CREATE FUNCTION public.fn_public_leak_gate() RETURNS TABLE (id uuid, question_text text)
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT qv.id, qv.question_text FROM public.question_versions qv LIMIT 1 $$`);
      await c.query(`GRANT EXECUTE ON FUNCTION public.fn_public_leak_gate() TO anon`);
      const leak = await asAnon(`select * from public.fn_public_leak_gate()`);
      chk('P-N negative control: a planted function returning question_text is caught by the column check', leak.code === null && leakCols(leak.fields).includes('question_text'), leak.code || leakCols(leak.fields).join());
      const res = await asAnon(`select public.fn_reserved_question_ids()`);
      chk('P-N anon still cannot list the reserved questions (42501)', res.code === '42501', res.code);
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`PAY-1 public reads live${LOCAL ? ' [LOCAL]' : ''}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exitCode = ok ? 0 : 1;
})();
