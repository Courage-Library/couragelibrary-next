#!/usr/bin/env node
/**
 * Q3 — live nightly coverage for the 094–097 features (CI live job only, #74; the QA identity only — no real-user row is
 * read). NON-WRITING by design (rule "new gate first run non-writing", 2026-10-20): every behaviour check runs as the
 * QA student's database role (role authenticated + its JWT sub) inside a transaction that is ROLLED BACK; the PostgREST
 * probes through the shared QA session are reads / denials only; page checks are GETs and SKIP when the CI server does
 * not have the flag on.
 *   FL-1 Memory Lock (095): add → due today → answered via fn_memory_lock_answer → review, due in 1 day
 *   FL-2 Profile (096): username set + read back; under-18 (no 18+ confirmation) cannot go public or opt in; is_active
 *        is not client-writable
 *   FL-3 Tickets (097): create → listed; the student's list holds only their own tickets
 *   FL-4 Proctor (094): an event on the student's in-progress attempt is recorded once (retry = DUPLICATE); the student
 *        cannot read the log
 *   FL-5 PostgREST with the QA session (read-only): own tickets list readable; proctor log + username blocklist denied
 *   FL-6 pages (flag-gated GETs): /memory-lock, /settings/profile, /help/tickets render for the QA student
 * Run: node scripts/live/test_flags_live.cjs [baseUrl]
 */
const { safeBegin } = require('../db/live-safety.cjs'); // LIVE-LOCK-SWEEP: the one safe BEGIN (timeouts + rollback on stop)
const crypto = require('crypto');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { Client } = require('pg');
const { dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { qaUserClient, qaCookies, assertQaEmail } = require('./qa-session.cjs');

const EMAIL = 'qa-student@courage-library.test';
const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || 'http://localhost:3100').replace(/\/$/, '');
let passed = 0;
let failed = 0;
let skipped = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    if (info === 'SKIP') {
      skipped++;
      console.log(`  SKIP  ${name}`);
      return;
    }
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && (e.code || e.message) ? e.code || e.message : e).slice(0, 300)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

(async () => {
  assertQaEmail(EMAIL);
  const pg = new Client({ ...dbTarget().pg, port: 6543 });
  await pg.connect();
  const q = async (s, p) => (await pg.query(s, p)).rows;
  const [u] = await q(`select id from auth.users where email = $1`, [EMAIL]);
  assert(u, 'QA student missing');

  /** run fn as the QA student's role inside a transaction that is ALWAYS rolled back */
  const rolledBack = async (fn) => {
    await safeBegin(pg);
    try {
      const asStudent = async () => {
        await pg.query(`set local role authenticated`);
        await pg.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: u.id, role: 'authenticated' })]);
      };
      const asOwner = () => pg.query('reset role');
      return await fn({ asStudent, asOwner });
    } finally {
      await pg.query('ROLLBACK');
    }
  };
  const rpc = async (sql, params) => (await q(sql, params))[0].r;

  try {
    await test('FL-1 Memory Lock: add → due → answered via the RPC → rescheduled (rolled back)', () =>
      rolledBack(async ({ asStudent, asOwner }) => {
        const [v] = await q(
          `select v.id vid, v.question_id qid, a.correct_option_key k from question_versions v join questions qq on qq.id = v.question_id join question_answers a on a.question_version_id = v.id
            where qq.status = 'published' and v.is_current and v.lifecycle_status = 'PUBLISHED' and public.fn_qf_version_is_servable(v.id)
              and not exists (select 1 from user_mistake_vault m where m.user_id = $1 and m.question_id = v.question_id)
              -- GATE-SCOPE-SWEEP (2026-10-29): deterministic — the oldest servable version (the K-9-protected pre-087 set
              -- first), never "any row" (an owner question of another shape could be picked)
            order by v.created_at, v.id limit 1`,
          [u.id],
        );
        assert(v, 'no servable question outside the QA vault');
        await asStudent();
        assert((await rpc(`select public.fn_memory_lock_add($1) r`, [v.qid])).code === 'ADDED', 'add');
        const [due] = await q(`select ml_state, ml_due_at <= now() due from user_mistake_vault where user_id = $1 and question_id = $2`, [u.id, v.qid]);
        assert(due && due.ml_state === 'new' && due.due, 'manual item due today');
        const r = await rpc(`select public.fn_memory_lock_answer($1, $2, 1200, $3) r`, [v.vid, v.k, crypto.randomUUID()]);
        await asOwner();
        assert(r.code === 'CHECKED' && r.is_correct === true && r.interval_days === 1 && r.state === 'review', JSON.stringify(r).slice(0, 120));
        return 'new → review, 1 day';
      }));

    await test('FL-2 profile: username set / read; under-18 cannot go public or opt in; is_active not writable (rolled back)', () =>
      rolledBack(async ({ asStudent, asOwner }) => {
        await q(`update user_profiles set username = null, username_changed_at = null, profile_public = false, adult_confirmed_at = null, leaderboard_opt_in = false where id = $1`, [u.id]);
        const name = `qa_${crypto.randomBytes(3).toString('hex')}`;
        await asStudent();
        assert((await rpc(`select public.fn_set_username($1) r`, [name])).code === 'SET', 'set');
        const [me] = await q(`select username from user_profiles where id = $1`, [u.id]);
        assert(me && me.username === name, 'read back (own row through RLS)');
        assert((await rpc(`select public.fn_set_profile_visibility(true, false) r`)).code === 'NEED_ADULT_CONFIRMATION', 'public needs 18+');
        assert((await rpc(`select public.fn_set_leaderboard_opt_in(true) r`)).code === 'NEED_ADULT_CONFIRMATION', 'opt-in needs 18+');
        await pg.query('savepoint s');
        let denied = false;
        try {
          await q(`update user_profiles set is_active = true where id = $1`, [u.id]);
        } catch (e) {
          denied = e.code === '42501';
        }
        await pg.query('rollback to savepoint s');
        await asOwner();
        const [after] = await q(`select profile_public, leaderboard_opt_in from user_profiles where id = $1`, [u.id]);
        assert(after.profile_public === false && after.leaderboard_opt_in === false && denied, 'private, not opted in, is_active denied');
      }));

    await test('FL-3 tickets: create → listed; only the student\'s own tickets visible (rolled back)', () =>
      rolledBack(async ({ asStudent, asOwner }) => {
        await asStudent();
        const r = await rpc(`select public.fn_create_support_ticket('OTHER', 'Nightly check ticket', 'Created by the nightly live gate inside a rolled-back transaction.') r`);
        assert(r.code === 'CREATED' || r.code === 'RATE_LIMITED', r.code);
        const list = await q(`select ref, user_id from public.support_tickets`);
        await asOwner();
        assert(list.every((t) => t.user_id === u.id) && (r.code !== 'CREATED' || list.some((t) => t.ref === r.ref)), 'own tickets only');
        return r.code === 'CREATED' ? `ref ${r.ref}` : 'rate-limited (listing checked)';
      }));

    await test('FL-4 proctor: recorded once on the student\'s attempt; log not readable (rolled back)', () =>
      rolledBack(async ({ asStudent, asOwner }) => {
        const [m] = await q(`select id from mock_tests where status = 'published' and duration_minutes > 0 limit 1`);
        const [a] = await q(`insert into test_attempts (user_id, mock_test_id, status, started_at) values ($1, $2, 'in_progress', now()) returning id`, [u.id, m.id]);
        await asStudent();
        assert((await rpc(`select public.fn_record_proctor_event($1, 'tab_hidden', 1) r`, [a.id])).code === 'RECORDED', 'recorded');
        assert((await rpc(`select public.fn_record_proctor_event($1, 'tab_hidden', 1) r`, [a.id])).code === 'DUPLICATE', 'retry = duplicate');
        await pg.query('savepoint s');
        let denied = false;
        try {
          await q(`select count(*) from public.attempt_proctor_events`);
        } catch (e) {
          denied = e.code === '42501';
        }
        await pg.query('rollback to savepoint s');
        await asOwner();
        const [n] = await q(`select count(*)::int n from attempt_proctor_events where attempt_id = $1`, [a.id]);
        assert(n.n === 1 && denied, 'one row; not readable by the student');
      }));

    await test('FL-5 PostgREST with the QA session (read-only): own tickets readable; proctor log + blocklist denied', async () => {
      const sb = await qaUserClient(EMAIL);
      const t = await sb.from('support_tickets').select('ref, user_id').limit(20);
      assert(!t.error && (t.data || []).every((x) => x.user_id === u.id), `tickets read ${t.error && t.error.code}`);
      const p = await sb.from('attempt_proctor_events').select('id').limit(1);
      const b = await sb.from('username_blocklist').select('term').limit(1);
      assert(p.error && p.error.code === '42501' && b.error && b.error.code === '42501', `denials ${p.error && p.error.code}/${b.error && b.error.code}`);
    });

    for (const [flag, route, rx] of [
      ['MEMORY_LOCK_ENABLED', '/memory-lock', /data-memory-lock-page=""/],
      ['PROFILES_ENABLED', '/settings/profile', /id="username"/],
      ['SUPPORT_TICKETS_ENABLED', '/help/tickets', /data-my-tickets=""/],
    ]) {
      await test(`FL-6 page ${route} (${flag})`, async () => {
        if (process.env[flag] !== 'true') return 'SKIP';
        const cookies = await qaCookies(EMAIL, BASE);
        const res = await fetch(`${BASE}${route}`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') }, redirect: 'manual' });
        assert(res.status === 200 && rx.test(await res.text()), `status ${res.status}`);
      });
    }
  } finally {
    await pg.end();
  }
  console.log(`\nFLAGS-LIVE: ${passed}/${passed + failed} passed${skipped ? ` (${skipped} skipped: flag off on the CI server)` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(`FLAGS-LIVE SUITE ERROR ${String(e && (e.code || e.name)).slice(0, 60)}`);
  process.exit(1);
});
