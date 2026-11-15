#!/usr/bin/env node
/**
 * PAY-1 B2b part 2 step 2 — EXECUTED proof for migration 146 (the client revoke on question_versions /
 * question_options / mock_questions / mock_tests; owner conditions 2026-11-15). ONE transaction, always rolled back
 * (withLiveTransaction). Codes / counts / code locations only; no row values, ids or e-mails printed.
 *   R-C catalog: no SELECT (table or column) for anon / authenticated on the four tables; the three dependent policies
 *       call the two DEFINER helpers and no longer read the four tables; helpers STABLE, search_path "", grants as
 *       designed
 *   R-N direct reads of each of the four tables as anon and as the free student → refused (42501)
 *   R-J the journey core, as the free student, exactly as the app's session client does it:
 *       start (the app starts on the server) → answer (upsert INSERT) → autosave (upsert UPDATE) → resume (own answers
 *       + own attempt read back) → position save (test_attempts update) → guards: another user's attempt, a question of
 *       another mock, after the deadline, after submit → all refused; mock sections of a published mock readable by
 *       anon + student, of a draft mock not
 *   R-S the statement replay: every client-side statement of the journey + staff code (scripts/fixtures/
 *       pay1_146_statements.cjs, derived from the code) runs as the same role — printed statement → code → result
 *   R-V negative control: the OLD attempt_answers UPDATE policy restored (a 146 variant that forgets that rewrite) →
 *       the autosave step fails (permission denied on a revoked table) — the replay catches it
 * Run: node scripts/live/test_pay1_revoke.cjs [--pre] [--quiet]              (project DB; --pre applies 146 in the tx)
 *      node scripts/live/test_pay1_revoke.cjs --local=54329 [--pre]          (local copy: synthetic content rows)
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { pgClient } = require(path.join(ROOT, 'scripts/db/safe-net.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const F = require(path.join(ROOT, 'scripts/fixtures/pay1_146_statements.cjs'));

const PRE = process.argv.includes('--pre');
const QUIET = process.argv.includes('--quiet');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000146_pay1_b2b_content_revoke.sql'), 'utf8');
const RB = fs.readFileSync(path.join(ROOT, 'docs/database/rollback/146_rollback.sql'), 'utf8').replace(/\r\n/g, '\n');
const OLD_UPDATE_POLICY = RB.slice(RB.indexOf('DROP POLICY "Users can update own attempt answers"'), RB.indexOf('DROP POLICY "Public read published mock_sections"'));

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 700)}`);
};
function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}
const PRIV = /permission denied for (table|relation|function|schema)/i;
const CTX = { exam: null, someQ: null };
let BASELINE = new Map();

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  let sp = 0;
  /** run s as role (claims) inside a savepoint; returns { code, msg, rows, count } */
  const as = async (role, claims, s, p) => {
    const name = `s${++sp}`;
    await c.query(`SAVEPOINT ${name}`);
    try {
      await c.query(`SET LOCAL ROLE ${role}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      const r = await c.query(s, p);
      await c.query('RESET ROLE');
      await c.query(`select set_config('request.jwt.claims', '', true)`);
      await c.query(`RELEASE SAVEPOINT ${name}`);
      return { code: null, msg: '', rows: r.rows, count: r.rowCount };
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await c.query('RESET ROLE');
      await c.query(`select set_config('request.jwt.claims', '', true)`);
      return { code: e.code || 'ERR', msg: String(e.message || ''), rows: [], count: 0 };
    }
  };
  try {
    await withLiveTransaction(c, async () => {

      // ---------- identities (local: synthetic, inside the rolled-back tx)
      const user = async (email) => {
        let u = await one(`select id::text id from auth.users where email = $1`, [email]);
        if (!u && LOCAL) u = await one(`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), $1, 'authenticated', 'authenticated') returning id::text id`, [email]);
        if (!u) throw new Error(`${email.split('@')[0]} missing`);
        return u.id;
      };
      const sid = await user('qa-student@courage-library.test');
      const aid = await user('qa-admin@courage-library.test');
      const other = LOCAL ? await user('pay1-revoke-other@courage-library.test') : aid; // "another user"
      const STUDENT = ['authenticated', { sub: sid, role: 'authenticated' }];
      const STAFF = ['authenticated', { sub: aid, role: 'authenticated', app_metadata: { role: 'admin' }, aal: 'aal2' }];
      const ANON = ['anon', { role: 'anon' }];
      CTX.exam = await one(`select e.id::text exam, c.id::text cycle from public.exams e join public.exam_cycles c on c.exam_id = e.id limit 1`);
      CTX.someQ = await one(`select qv.id::text vid, qv.question_id::text qid from public.question_versions qv limit 1`);
      // BASELINE: the replay WITHOUT 146 (before the --pre apply; else 146 rolled back inside a savepoint)
      if (PRE) {
        BASELINE = await replayAll(STUDENT, STAFF, sid);
        await c.query(SQL);
      } else {
        await c.query('SAVEPOINT baseline');
        await c.query(RB);
        BASELINE = await replayAll(STUDENT, STAFF, sid);
        await c.query('ROLLBACK TO SAVEPOINT baseline');
      }

      // ---------- R-C catalog
      const grants = await q(`select c.relname t, x.grantee::regrole::text g from pg_class c cross join lateral aclexplode(c.relacl) x
            where c.relnamespace = 'public'::regnamespace and c.relname = any($1) and x.privilege_type = 'SELECT' and x.grantee in ('anon'::regrole, 'authenticated'::regrole)
          union all
          select c.relname || '.' || a.attname, x.grantee::regrole::text from pg_attribute a join pg_class c on c.oid = a.attrelid cross join lateral aclexplode(a.attacl) x
            where c.relnamespace = 'public'::regnamespace and c.relname = any($1) and x.privilege_type = 'SELECT' and x.grantee in ('anon'::regrole, 'authenticated'::regrole)`, [F.REVOKED]);
      const pols = await q(`select policyname n, coalesce(qual, '') || ' ' || coalesce(with_check, '') e from pg_policies
            where schemaname = 'public' and ((tablename = 'attempt_answers' and policyname in ('Users can insert own attempt answers', 'Users can update own attempt answers'))
               or (tablename = 'mock_sections' and policyname = 'Public read published mock_sections'))`);
      const polBad = pols.filter((p) => !/fn_attempt_answer_writable|fn_mock_test_published/.test(p.e) || new RegExp(`\\b(${F.REVOKED.join('|')})\\b`).test(p.e.replace(/fn_\w+/g, '')));
      const other4 = await q(`select tablename || '.' || policyname p from pg_policies where schemaname = 'public' and tablename <> all($1)
            and (coalesce(qual, '') || coalesce(with_check, '')) ~ $2 and not (coalesce(qual, '') || coalesce(with_check, '')) ~ 'fn_(attempt_answer_writable|mock_test_published)'`, [F.REVOKED, `\\m(${F.REVOKED.join('|')})\\M`]);
      const helpers = await q(`select p.proname n, p.prosecdef d, p.provolatile v, p.proconfig cfg,
              has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u
            from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_attempt_answer_writable', 'fn_mock_test_published')`);
      const hOk = helpers.length === 2 && helpers.every((h) => h.d && h.v === 's' && (h.cfg || []).includes('search_path=""') && h.u && h.a === (h.n === 'fn_mock_test_published'));
      chk('R-C no client SELECT (table or column) on the four tables; the 3 dependent policies call the DEFINER helpers; no other policy reads the four; helpers STABLE, search_path "", anon only on fn_mock_test_published',
        grants.length === 0 && pols.length === 3 && polBad.length === 0 && other4.length === 0 && hOk,
        JSON.stringify({ grants: grants.map((g) => `${g.t}:${g.g}`), policies: pols.length, polBad: polBad.map((p) => p.n), other: other4.map((o) => o.p), helpers: helpers.map((h) => `${h.n}:${h.d}/${h.v}/${h.a}/${h.u}`) }));

      // ---------- R-N direct reads refused
      const direct = [];
      for (const t of F.REVOKED) for (const [label, who] of [['anon', ANON], ['student', STUDENT]]) {
        const r = await as(who[0], who[1], `select 1 from public.${t} limit 1`);
        if (r.code !== '42501') direct.push(`${label}:${t}=${r.code || 'READ'}`);
      }
      chk('R-N direct reads of question_versions / question_options / mock_questions / mock_tests as anon and as the student → refused (42501)', direct.length === 0, direct.join(', '));

      // ---------- fixtures: a published static mock with ≥ 2 questions + a draft mock + another mock's question
      let fx = null;
      const real = await one(`select m.id::text mock, (array_agg(mq.id::text order by mq.question_order))[1:2] mqs
            from public.mock_tests m join public.mock_questions mq on mq.mock_test_id = m.id
           where m.status = 'published' and not m.is_dynamic and exists (select 1 from public.mock_sections s where s.mock_test_id = m.id)
           group by m.id having count(*) >= 2 order by m.id limit 1`);
      const otherMq = real && await one(`select mq.id::text id from public.mock_questions mq where mq.mock_test_id <> $1::uuid limit 1`, [real.mock]);
      let draftMock = null;
      if (real && otherMq) {
        // a DRAFT copy of the real mock with a copy of one of its sections (rolled back with everything else)
        draftMock = await one(`insert into public.mock_tests select (jsonb_populate_record(null::public.mock_tests, to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'slug', m.slug || '-revoke-gate-draft', 'status', 'draft'))).* from public.mock_tests m where m.id = $1 returning id::text id`, [real.mock]);
        await q(`insert into public.mock_sections (id, mock_test_id, section_name, num_questions, subject_id) select gen_random_uuid(), $2::uuid, s.section_name, s.num_questions, s.subject_id from public.mock_sections s where s.mock_test_id = $1 limit 1`, [real.mock, draftMock.id]);
      }
      if (real && otherMq && draftMock) fx = { mock: real.mock, mq1: real.mqs[0], mq2: real.mqs[1], otherMq: otherMq.id, draft: draftMock.id };
      else if (LOCAL) {
        // synthetic content rows (FK checks off ONLY while the fixture is written; the replay runs normally)
        await c.query(`SET LOCAL session_replication_role = replica`);
        const g = await one(`select gen_random_uuid()::text tpl, gen_random_uuid()::text subj, gen_random_uuid()::text topic`);
        const mk = async (status) => (await one(`insert into public.mock_tests (id, template_id, title, slug, status, duration_minutes, total_questions, total_marks, is_dynamic)
              values (gen_random_uuid(), $1, 'revoke gate', 'pay1-revoke-gate-' || substr(md5(random()::text), 1, 8), $2, 60, 2, 4, false) returning id::text id`, [g.tpl, status])).id;
        const mock = await mk('published');
        const draft = await mk('draft');
        const otherMock = await mk('published');
        const sec = async (m) => (await one(`insert into public.mock_sections (id, mock_test_id, section_name, num_questions, subject_id) values (gen_random_uuid(), $1, 'S', 2, $2) returning id::text id`, [m, g.subj])).id;
        const s1 = await sec(mock); await sec(draft); const s3 = await sec(otherMock);
        const mq = async (m, s, order) => {
          const qn = (await one(`insert into public.questions (id, canonical_topic_id, status) values (gen_random_uuid(), $1, 'published') returning id::text id`, [g.topic])).id;
          const qv = (await one(`insert into public.question_versions (id, question_id, question_text, lifecycle_status, is_current) values (gen_random_uuid(), $1, 'revoke gate', 'PUBLISHED', true) returning id::text id`, [qn])).id;
          return (await one(`insert into public.mock_questions (id, mock_test_id, mock_section_id, question_order, question_version_id) values (gen_random_uuid(), $1, $2, $3, $4) returning id::text id`, [m, s, order, qv])).id;
        };
        fx = { mock, mq1: await mq(mock, s1, 1), mq2: await mq(mock, s1, 2), otherMq: await mq(otherMock, s3, 1), draft };
        await c.query(`SET LOCAL session_replication_role = origin`);
      }
      if (!fx) chk('R-J fixtures: a published static mock with ≥ 2 questions and sections, a draft mock with sections', false, 'none in this database');
      else {
        // the app starts / finalizes attempts on the SERVER (service role) — the fixture does the same
        await q(`update public.test_attempts set status = 'abandoned' where user_id = $1 and status = 'in_progress'`, [sid]);
        const attempt = async (u, startedAgo = '1 minute') => (await one(`insert into public.test_attempts (user_id, mock_test_id, status, started_at) values ($1, $2, 'in_progress', now() - $3::interval) returning id::text id`, [u, fx.mock, startedAgo])).id;
        const att = await attempt(sid);
        // the app's autosave: supabase.from("attempt_answers").upsert({...}, { onConflict: "attempt_id,mock_question_id" })
        const UPSERT = `insert into public.attempt_answers (attempt_id, mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds, updated_at)
            values ($1, $2, $3, false, 5, now())
            on conflict (attempt_id, mock_question_id) do update set selected_option_key = excluded.selected_option_key, is_marked_for_review = excluded.is_marked_for_review,
               time_spent_seconds = excluded.time_spent_seconds, updated_at = excluded.updated_at`;
        const ins = await as(...STUDENT, UPSERT, [att, fx.mq1, 'A']);
        const upd = await as(...STUDENT, UPSERT, [att, fx.mq1, 'B']);
        const ins2 = await as(...STUDENT, UPSERT, [att, fx.mq2, 'C']);
        chk('R-J answer (upsert INSERT) + autosave (upsert UPDATE) as the student', ins.code === null && ins.count === 1 && upd.code === null && upd.count === 1 && ins2.code === null,
          JSON.stringify({ insert: ins.code || ins.count, update: upd.code || upd.count, msg: (upd.msg || ins.msg).slice(0, 160) }));
        const back = await as(...STUDENT, `select mock_question_id::text m, selected_option_key k from public.attempt_answers where attempt_id = $1 order by 1`, [att]);
        const own = await as(...STUDENT, `select status from public.test_attempts where id = $1`, [att]);
        const keyOf = (m) => (back.rows.find((r) => r.m === m) || {}).k;
        chk('R-J resume: the student reads back the own answers (latest key) and the own attempt', back.code === null && back.rows.length === 2 && keyOf(fx.mq1) === 'B' && own.rows.length === 1, JSON.stringify({ code: back.code, n: back.rows.length }));
        const pos = await as(...STUDENT, `update public.test_attempts set last_question_order = 2, visited_orders = '{1,2}', last_activity_at = now() where id = $1 and status = 'in_progress'`, [att]);
        chk('R-J position save (test_attempts update, own in-progress attempt)', pos.code === null && pos.count === 1, pos.code || pos.count);
        // ---------- R-V negative control: 146 without the attempt_answers UPDATE rewrite → the autosave step fails
        await c.query('SAVEPOINT variant');
        await c.query(OLD_UPDATE_POLICY);
        const v = await as(...STUDENT, UPSERT, [att, fx.mq2, 'D']); // an autosave of an answered question = the UPDATE path
        await c.query('ROLLBACK TO SAVEPOINT variant');
        const vAfter = await as(...STUDENT, UPSERT, [att, fx.mq2, 'D']);
        chk('R-V negative control: the OLD attempt_answers UPDATE policy (a 146 that forgets that rewrite) → the autosave UPDATE fails on a revoked table; with 146 it works',
          v.code !== null && PRIV.test(v.msg) && vAfter.code === null && vAfter.count === 1, JSON.stringify({ variant: v.code, msg: v.msg.slice(0, 120), with146: vAfter.code || vAfter.count }));
        // guards
        const otherAtt = await attempt(other);
        const g1 = await as(...STUDENT, UPSERT, [otherAtt, fx.mq1, 'A']);
        const g2 = await as(...STUDENT, UPSERT, [att, fx.otherMq, 'A']);
        await q(`update public.test_attempts set started_at = now() - interval '2 days' where id = $1`, [att]);
        const g3 = await as(...STUDENT, UPSERT, [att, fx.mq1, 'D']);
        await q(`update public.test_attempts set started_at = now() - interval '1 minute', status = 'submitted' where id = $1`, [att]);
        const g4 = await as(...STUDENT, UPSERT, [att, fx.mq1, 'D']);
        const refused = (r) => r.code !== null && !PRIV.test(r.msg); // RLS / the sanitize trigger — never a privilege error
        chk('R-J guards: another user\'s attempt, a question of another mock, after the deadline, after submit → refused (by RLS / the trigger, not by a privilege error)',
          refused(g1) && refused(g2) && refused(g3) && refused(g4), JSON.stringify([g1, g2, g3, g4].map((r) => `${r.code}:${r.msg.slice(0, 60)}`)));
        // mock sections
        const secOf = async (who, m) => as(...who, `select count(*)::int n from public.mock_sections where mock_test_id = $1`, [m]);
        const svc = (await one(`select count(*)::int n from public.mock_sections where mock_test_id = $1`, [fx.mock])).n;
        const sA = await secOf(ANON, fx.mock); const sS = await secOf(STUDENT, fx.mock); const dA = await secOf(ANON, fx.draft); const dS = await secOf(STUDENT, fx.draft);
        chk('R-J mock sections: a published mock\'s sections readable by anon + student (all of them); a draft mock\'s not',
          sA.code === null && sS.code === null && sA.rows[0].n === svc && sS.rows[0].n === svc && svc > 0 && dA.rows[0]?.n === 0 && dS.rows[0]?.n === 0,
          JSON.stringify({ svc, anon: sA.code || sA.rows[0]?.n, student: sS.code || sS.rows[0]?.n, draftAnon: dA.code || dA.rows[0]?.n, draftStudent: dS.code || dS.rows[0]?.n }));

      }

      // ---------- R-S statement replay (every client-side statement of the journey + staff code), compared with the same
      // replay WITHOUT 146 (BASELINE, taken before the --pre apply / after the 146 rollback in a savepoint): a step that
      // works without 146 must still work with it; a step already failing without 146 is reported as pre-existing
      const statements = F.scan(ROOT).filter(F.clientSide);
      const results = new Map();
      const base = BASELINE;
      const WRITES = writeSteps(STUDENT, sid, !!fx);
      for (const s of statements) {
        const st = F.stepFor(s);
        if (!results.has(st)) {
          const r = await runStep(s, st, F.roleOf(s) === 'staff' ? STAFF : STUDENT, WRITES);
          const b = base.get(st);
          const good = (x) => (x.code === 'SKIP' ? !!LOCAL : s.op === 'select' && s.kind === 'from' ? x.code === null : x.code !== 'MISSING' && !PRIV.test(x.msg));
          const pre = !good(r) && b && !good(b) && b.code === r.code;
          results.set(st, { pass: good(r) || pre, info: (r.code === null ? 'ok' : `${r.code}${r.code === 'SKIP' || r.code === 'MISSING' ? ' ' + r.msg : ''}`) + (pre ? ' — pre-existing (same without 146)' : '') });
        }
        const res = results.get(st);
        if (!QUIET || !res.pass || /pre-existing/.test(res.info)) console.log(`  ${res.pass ? 'ok  ' : 'FAIL'} ${s.file}:${s.line}  ${s.kind}(${s.name}) ${s.op}  → ${st}  [${res.info}]`);
      }
      const failed = [...results].filter(([, r]) => !r.pass).map(([k, r]) => `${k}=${r.info}`);
      const preN = [...results].filter(([, r]) => /pre-existing/.test(r.info)).length;
      chk(`R-S statement replay: ${statements.length} client-side statements (${results.size} steps) of the journey + staff code run as the same role; none works without 146 and fails with it${preN ? ` (${preN} pre-existing, unchanged)` : ''}`, failed.length === 0, failed.join(', '));
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`PAY-1 revoke (146) live${LOCAL ? ' [LOCAL]' : ''}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exitCode = ok ? 0 : 1;

  // ---------- helpers of the replay (hoisted)
  function writeSteps(STUDENT, sid, haveFixture) {
    const Z = '00000000-0000-0000-0000-000000000000';
    const { exam, someQ } = CTX;
    const fixtureStep = (what) => async () => (haveFixture ? { code: null, msg: what } : { code: 'SKIP', msg: 'no fixture' });
    return {
      'student:attempt_answers:upsert': fixtureStep('R-J (answer / autosave)'),
      'student:test_attempts:update': fixtureStep('R-J (position save)'),
      'student:user_exam_goals:insert': async () => (exam ? as(...STUDENT, `insert into public.user_exam_goals (user_id, exam_id, exam_cycle_id, is_active, priority_rank) values ($1, $2, $3, true, 1)`, [sid, exam.exam, exam.cycle]) : { code: 'SKIP', msg: 'no exam cycle' }),
      'student:user_exam_goals:update': async () => as(...STUDENT, `update public.user_exam_goals set is_active = true, updated_at = now() where user_id = $1`, [sid]),
      'student:user_question_bookmarks:upsert': async () => (someQ ? as(...STUDENT, `insert into public.user_question_bookmarks (user_id, question_id, question_version_id) values ($1, $2, $3) on conflict do nothing`, [sid, someQ.qid, someQ.vid]) : { code: 'SKIP', msg: 'no question rows' }),
      'student:user_question_bookmarks:delete': async () => as(...STUDENT, `delete from public.user_question_bookmarks where user_id = $1 and question_id = $2`, [sid, someQ ? someQ.qid : Z]),
      'student:rpc:fn_report_question': async () => as(...STUDENT, `select public.fn_report_question(p_question_id => $1, p_question_version_id => $2, p_reason => 'OTHER', p_note => 'pay1 revoke gate')`, [someQ ? someQ.qid : Z, someQ ? someQ.vid : Z]),
      'student:rpc:fn_generate_mistake_drill': async () => as(...STUDENT, `select public.fn_generate_mistake_drill(p_vault_ids => '{}'::uuid[])`),
      'student:rpc:fn_submit_mistake_drill': async () => as(...STUDENT, `select public.fn_submit_mistake_drill(p_drill_id => $1, p_answers => '[]'::jsonb)`, [Z]),
    };
  }
  async function runStep(s, st, role, WRITES) {
    if (s.kind === 'from' && s.op === 'select') return as(...role, `select 1 from public.${s.name} limit 1`);
    if (WRITES[st]) return WRITES[st]();
    return { code: 'MISSING', msg: 'no replay implementation' };
  }
  /** every step once (the BASELINE run) */
  async function replayAll(STUDENT, STAFF, sid) {
    const out = new Map();
    const W = writeSteps(STUDENT, sid, false);
    for (const s of F.scan(ROOT).filter(F.clientSide)) {
      const st = F.stepFor(s);
      if (!out.has(st)) out.set(st, await runStep(s, st, F.roleOf(s) === 'staff' ? STAFF : STUDENT, W));
    }
    return out;
  }
})();
