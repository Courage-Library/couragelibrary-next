#!/usr/bin/env node
/**
 * PAY-1 B2b part 1 — EXECUTED proof (owner requirement) for migration 143, as the FREE QA student. ONE transaction,
 * always rolled back (withLiveTransaction). Counts / codes only; no content, ids or e-mails printed.
 *   B-A path A  a lesson set PRO + paywall ON → fn_lesson_quick_check_answer refused (42501); paywall OFF → answered
 *   B-B path B  the same lesson: fn_lesson_progress_save + fn_lesson_complete refused (42501)
 *   B-D path D  a question assigned to a PRO mock → fn_check_practice_answer and fn_memory_lock_add answer
 *               RESERVED_FOR_MOCK — with the paywall OFF (D2 applies whatever the switch) and ON
 *   B-F path F  a question in the student's own OPEN attempt (a FREE mock) → fn_check_practice_answer and
 *               fn_memory_lock_answer answer IN_OPEN_ATTEMPT
 *   B-E path E  control: document_versions.blocks still refused (42501)
 *   B-N negative control: the same question with its mock FREE and no open attempt → the practice answer is NOT blocked
 *               (the guard is not blanket); anon cannot call the answer functions
 *   B-T trigger: a NEW mock with is_free = true gets an explicit FREE access_policies row
 *   B-R (144, part 2 step 1) the server's reserved list (fn_reserved_question_ids) holds a question while its mock is PRO
 *               and drops it once FREE; anon and the free student cannot call it (42501). The public pages (practice,
 *               mocks, current affairs) are checked anonymously by scripts/smoke/anonymous-smoke.cjs (PAY-1 block).
 * Run: node scripts/live/test_pay1_b2b.cjs [--pre]               (project DB; --pre applies 143 inside the transaction)
 *      node scripts/live/test_pay1_b2b.cjs --local=54329 --pre   (local; checks needing content rows SKIP there)
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
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261116000143_pay1_b2b_answer_and_lesson_guards.sql'), 'utf8');
const ACTOR = 'pay1-b2b@courage-library.test';

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}`);
};
const skip = (n, why) => console.log(`SKIP ${n} — ${why}`);
function client() {
  if (!LOCAL) return pgClient();
  if (!/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
  const c = new Client({ host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' });
  c.on('error', () => {});
  return c;
}

(async () => {
  const c = client();
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const errCode = async (s, p) => {
    await c.query('SAVEPOINT t');
    try {
      const r = await c.query(s, p);
      await c.query('RELEASE SAVEPOINT t');
      return { code: null, rows: r.rows };
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT t');
      return { code: e.code || 'ERR', rows: [] };
    }
  };
  const as = async (role, sub, fn) => {
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    try {
      return await fn();
    } finally {
      await c.query('RESET ROLE');
      await c.query(`select set_config('request.jwt.claims', '', true)`);
    }
  };
  const switchTo = (on) => q(`select public.fn_paywall_set($1, null, $2)`, [on, ACTOR]);
  const setTier = (kind, key, tier) => q(`select public.fn_access_policy_set($1, $2, $3, null, $4)`, [kind, key, tier, ACTOR]);
  const practiceCode = async (sub, versionId) => {
    const r = await as('authenticated', sub, () => errCode(`select public.fn_check_practice_answer($1, 'A', 1000, gen_random_uuid(), 'TOPIC') r`, [versionId]));
    return r.code || (r.rows[0] && r.rows[0].r && r.rows[0].r.code) || (r.rows[0] && r.rows[0].r && r.rows[0].r.success === true ? 'ANSWERED' : 'NO_CODE');
  };
  try {
    await withLiveTransaction(c, async () => {
      if (PRE) await c.query(SQL);
      let student = await one(`select id from auth.users where email = 'qa-student@courage-library.test'`);
      if (!student && LOCAL) student = await one(`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'qa-student@courage-library.test', 'authenticated', 'authenticated') returning id`);
      if (!student) throw new Error('qa-student missing');
      const sid = student.id;

      // ---------- lessons (A / B)
      const lesson = await one(`select d.id::text id, dv.language lang, (select b ->> 'id' from jsonb_array_elements(dv.blocks) b where b ->> 'type' = 'quick_check' limit 1) block,
              (select o ->> 'id' from jsonb_array_elements(dv.blocks) b, jsonb_array_elements(b -> 'options') o where b ->> 'type' = 'quick_check' limit 1) opt
            from public.learning_documents d join public.document_versions dv on dv.document_id = d.id
           where d.status = 'PUBLISHED' and dv.is_current and dv.is_published and dv.review_status = 'PUBLISHED' and dv.content_format = 'BLOCKS'
             and exists (select 1 from jsonb_array_elements(dv.blocks) b where b ->> 'type' = 'quick_check') limit 1`);
      if (!lesson) {
        (LOCAL ? skip : (n, w) => chk(n, false, w))('B-A / B-B lesson paths', 'no published lesson with a quick check in this database');
      } else {
        await setTier('LESSON', lesson.id, 'PRO');
        await switchTo(false);
        const offA = await as('authenticated', sid, () => errCode(`select public.fn_lesson_quick_check_answer($1, $2, $3, $4)`, [lesson.id, lesson.lang, lesson.block, lesson.opt]));
        await switchTo(true);
        const onA = await as('authenticated', sid, () => errCode(`select public.fn_lesson_quick_check_answer($1, $2, $3, $4)`, [lesson.id, lesson.lang, lesson.block, lesson.opt]));
        chk('B-A path A: Pro lesson + paywall ON → no answer key (42501); paywall OFF → answered', onA.code === '42501' && offA.code === null, JSON.stringify({ on: onA.code, off: offA.code }));
        const prog = await as('authenticated', sid, () => errCode(`select public.fn_lesson_progress_save($1, $2, 'READING', null)`, [lesson.id, lesson.lang]));
        const comp = await as('authenticated', sid, () => errCode(`select public.fn_lesson_complete($1, $2)`, [lesson.id, lesson.lang]));
        chk('B-B path B: Pro lesson + paywall ON → progress and completion refused (42501)', prog.code === '42501' && comp.code === '42501', JSON.stringify({ prog: prog.code, comp: comp.code }));
        await switchTo(false);
      }

      // ---------- questions (D / F / N)
      const mq = await one(`select mq.mock_test_id::text mock, qv.id::text vid, qv.question_id::text qid
            from public.mock_questions mq join public.question_versions qv on qv.id = mq.question_version_id
            join public.questions qn on qn.id = qv.question_id
           where qv.is_current and qv.lifecycle_status = 'PUBLISHED' and qn.status = 'published' and public.fn_qf_version_is_servable(qv.id) limit 1`);
      if (!mq) {
        (LOCAL ? skip : (n, w) => chk(n, false, w))('B-D / B-F / B-N question paths', 'no servable question assigned to a mock in this database');
      } else {
        // N first: the mock FREE, no open attempt → not blocked (the guard is not blanket)
        await setTier('MOCK_TEST', mq.mock, 'FREE');
        await q(`update public.test_attempts set status = 'abandoned' where user_id = $1 and status = 'in_progress'`, [sid]);
        const freeCode = await practiceCode(sid, mq.vid);
        chk('B-N negative control: mock FREE, no open attempt → the practice answer is NOT blocked', freeCode !== 'RESERVED_FOR_MOCK' && freeCode !== 'IN_OPEN_ATTEMPT', freeCode);
        // D: the mock PRO, paywall OFF and ON
        await setTier('MOCK_TEST', mq.mock, 'PRO');
        const dOff = await practiceCode(sid, mq.vid);
        const mlOff = await as('authenticated', sid, () => errCode(`select public.fn_memory_lock_add($1) r`, [mq.qid]));
        await switchTo(true);
        const dOn = await practiceCode(sid, mq.vid);
        await switchTo(false);
        chk('B-D path D: question in a PRO mock → practice + Memory Lock add answer RESERVED_FOR_MOCK (paywall OFF and ON)',
          dOff === 'RESERVED_FOR_MOCK' && dOn === 'RESERVED_FOR_MOCK' && mlOff.rows[0] && mlOff.rows[0].r && mlOff.rows[0].r.code === 'RESERVED_FOR_MOCK', JSON.stringify({ dOff, dOn, ml: mlOff.code || mlOff.rows[0]?.r?.code }));
        // R (144, E1 = b): the server's reserved list holds the question while its mock is PRO, drops it when FREE; no
        // client (anon / the free student) may call it — public pages read through the server and leave these out
        const hasR = await one(`select to_regprocedure('public.fn_reserved_question_ids()') is not null ok`);
        if (!hasR.ok) (LOCAL ? skip : (n, w) => chk(n, false, w))('B-R reserved list', 'fn_reserved_question_ids (144) missing');
        else {
          const inPro = await one(`select exists (select 1 from public.fn_reserved_question_ids() r where r = $1::uuid) ok`, [mq.qid]);
          await setTier('MOCK_TEST', mq.mock, 'FREE');
          const inFree = await one(`select exists (select 1 from public.fn_reserved_question_ids() r where r = $1::uuid) ok`, [mq.qid]);
          const others = await one(`select count(*)::int n from public.mock_questions mq2 join public.question_versions qv2 on qv2.id = mq2.question_version_id
                where qv2.question_id = $1::uuid and mq2.mock_test_id <> $2::uuid and public.fn_access_tier('MOCK_TEST', mq2.mock_test_id::text) = 'PRO'`, [mq.qid, mq.mock]);
          await setTier('MOCK_TEST', mq.mock, 'PRO');
          chk('B-R reserved list: the question is listed while its mock is PRO, not once FREE (unless another PRO mock holds it)',
            inPro.ok === true && inFree.ok === (others.n > 0), JSON.stringify({ pro: inPro.ok, free: inFree.ok, otherPro: others.n }));
          const rAnon = await as('anon', null, () => errCode(`select public.fn_reserved_question_ids()`));
          const rStu = await as('authenticated', sid, () => errCode(`select public.fn_reserved_question_ids()`));
          chk('B-R anon and the free student cannot list the reserved questions (42501)', rAnon.code === '42501' && rStu.code === '42501', JSON.stringify({ anon: rAnon.code, student: rStu.code }));
        }
        // F: the mock FREE again, an OPEN attempt of the student on it
        await setTier('MOCK_TEST', mq.mock, 'FREE');
        const ins = await errCode(`insert into public.test_attempts (user_id, mock_test_id, status, started_at) values ($1, $2, 'in_progress', now())`, [sid, mq.mock]);
        if (ins.code) chk('B-F path F setup', false, `attempt insert failed (${ins.code})`);
        else {
          const fP = await practiceCode(sid, mq.vid);
          const fM = await as('authenticated', sid, () => errCode(`select public.fn_memory_lock_answer($1, 'A', 1000, gen_random_uuid()) r`, [mq.vid]));
          chk('B-F path F: question in the student\'s own OPEN attempt → practice + Memory Lock answer IN_OPEN_ATTEMPT',
            fP === 'IN_OPEN_ATTEMPT' && fM.rows[0] && fM.rows[0].r && fM.rows[0].r.code === 'IN_OPEN_ATTEMPT', JSON.stringify({ practice: fP, memoryLock: fM.code || fM.rows[0]?.r?.code }));
        }
        const anon = await as('anon', null, () => errCode(`select public.fn_check_practice_answer($1, 'A', 1000, gen_random_uuid(), 'TOPIC')`, [mq.vid]));
        chk('B-N anon cannot call the practice answer function (42501)', anon.code === '42501', anon.code);
      }

      // ---------- E (control)
      const e = await as('authenticated', sid, () => errCode(`select blocks from public.document_versions limit 1`));
      chk('B-E path E control: lesson bodies (document_versions.blocks) refused for the student (42501)', e.code === '42501', e.code);

      // ---------- trigger
      const copy = await errCode(`insert into public.mock_tests
          select (jsonb_populate_record(null::public.mock_tests, to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'slug', m.slug || '-b2b-gate', 'is_free', true))).*
            from public.mock_tests m order by m.created_at limit 1 returning id::text id`);
      if (copy.code || !copy.rows[0]) (LOCAL ? skip : (n, w) => chk(n, false, w))('B-T trigger', copy.code ? `copy insert failed (${copy.code})` : 'no mock to copy');
      else {
        const row = await one(`select tier from public.access_policies where item_kind = 'MOCK_TEST' and item_key = $1`, [copy.rows[0].id]);
        chk('B-T a new free mock gets an explicit FREE policy row (trigger)', row && row.tier === 'FREE', JSON.stringify(row));
      }
    });
  } catch (e) {
    ok = false;
    console.log(`FAIL — ${String(e && e.message ? e.message : e).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(`PAY-1 B2b live${LOCAL ? ' [LOCAL]' : ''}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exitCode = ok ? 0 : 1;
})();
