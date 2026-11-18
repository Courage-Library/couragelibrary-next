#!/usr/bin/env node
/**
 * PAY-1 B6 refunds (migration 151; owner F1–F8, locked D4–D7, 2026-11-19) — AS THE REAL ROLES, every write inside a
 * rolled-back transaction (withLiveTransaction → safeBegin: LIVE-LOCK-SAFETY). Synthetic gateway ids (order_B6…, pay_B6…,
 * rfnd_B6…); no network, no Razorpay, no e-mail.
 *   --pre           151 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)          after apply: refuses unless 151 is APPLIED
 *   --local=<port>  a throwaway LOCAL PostgreSQL: the shape / grants / trigger chunks only (the local copy holds no plans,
 *                   profiles or mocks, so the money chunks are reported as SKIP there and run on the project database)
 * Chunks:
 *   A shape: the attempt tier column + trigger; approvals table RLS on / no policy; refund DEFINER, the helpers INVOKER;
 *     anon and the QA student: 42501 on the three functions and the table
 *   B eligibility: a first live purchase → eligible; > 7 days → OUTSIDE_7_DAYS; a second purchase → NOT_FIRST_PURCHASE and
 *     the first one → NOT_LATEST_PERIOD (D7); 2 submitted PRO mocks → MORE_THAN_1_PRO_MOCK (tier recorded at start; a
 *     later tier change does not rewrite it; a NULL tier → TIER_AT_CHECK_TIME)
 *   C approvals + once per user: POLICY_7_DAY only when eligible (NOT_ELIGIBLE otherwise); one open approval per payment;
 *     the refund links it (refund_kind POLICY_7_DAY); then the policy refund counts as used; a refund with no approval
 *     → UNRECORDED; a test-mode refund of a live order → MODE_MISMATCH and nothing changes; a replay changes nothing
 *   D stacked periods: full refund of the LATEST period → it is revoked, the earlier one untouched; full refund of the
 *     EARLIER (current) period → the later one moves earlier by exactly the time removed and keeps its length; a partial
 *     refund → pro-rata days off that period and the later one moved by the same days; founding `sold` unchanged
 *   E refund after the period ended → recorded, nothing moved; a double charge refunded → unapplied, linked to its
 *     DOUBLE_CHARGE approval, Pro untouched
 *   Z nothing persisted
 * Run: node scripts/live/test_pay1_b6.cjs [--pre] [--local=<port>]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const LOCAL = (process.argv.find((a) => a.startsWith('--local=')) || '').slice('--local='.length);
if (LOCAL && !/^\d{4,5}$/.test(LOCAL)) throw new Error('--local=<port>');
const PG = () => (LOCAL ? { host: '127.0.0.1', port: Number(LOCAL), user: 'postgres', database: 'postgres' } : dbTarget().pg);
const FILE = '20261119000151_pay1_b6_refunds.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 700)}` }); };
const skip = (n, why) => { pending.push({ cond: true, line: `SKIP ${n} — ${why}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));
const DAY = 86400e3;

(async () => {
  const red = LOCAL ? (s) => s : redactor(dbTarget());
  let c = new Client(PG()); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    if (LOCAL) await q(`insert into auth.users (id, email) select '00000000-0000-4000-8000-0000000005b5', 'qa-student@courage-library.test'
                        where not exists (select 1 from auth.users where email = 'qa-student@courage-library.test')`);
    const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
    if (!stu) throw new Error('the QA student is missing');
    // the approving admin = the QA admin (admin_audit_logs.actor_id references a real account)
    const [adm] = await q(`select id from auth.users where email = 'qa-admin@courage-library.test'`);
    const ADMIN_ID = adm ? adm.id : stu.id;
    const [plans] = await q(`select count(*)::int n from public.pro_plan_versions where plan_code = 'PRO_3M' and active`);
    const MONEY = plans.n > 0; // the local copy has no plans
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 200) }; }
    };
    const ANON = { role: 'anon' };
    const STU = { sub: stu.id, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const svc = async (call, args = []) => { const r = await as('service_role', { role: 'service_role' }, `select public.${call} r`, args); return r.ok ? r.rows[0].r : { error: r.code, msg: r.msg }; };
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(PG()); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => {
            if (PRE) await c.query(MIGRATION_SQL);
            if (MONEY) await q(`update public.user_profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = $1`, [stu.id]);
            await fn();
          });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    // a paid live PRO_3M order for the QA student (synthetic ids); capturedHoursAgo moves its payment time back
    const paid = async (tag, capturedHoursAgo = 0) => {
      const gw = `order_B6${tag.padEnd(12, '0')}`.slice(0, 20);
      const pay = `pay_B6${tag.padEnd(10, '0')}`.slice(0, 16);
      const o = await svc(`fn_create_pro_order($1, 'PRO_3M', $2, 'live')`, [stu.id, `k-b6-${tag}`.padEnd(16, '0')]);
      if (!o.success) throw new Error(`order ${tag}: ${JSON.stringify(o)}`);
      await svc(`fn_attach_gateway_order($1, $2, $3)`, [o.order_id, stu.id, gw]);
      const f = await svc(`fn_fulfil_pro_order($1, $2, 29900, 'INR', 'RECONCILE', 'live')`, [gw, pay]);
      if (!f.success) throw new Error(`fulfil ${tag}: ${JSON.stringify(f)}`);
      if (capturedHoursAgo) await q(`update public.payment_transactions set captured_at = captured_at - make_interval(hours => $2) where gateway_payment_id = $1`, [pay, capturedHoursAgo]);
      return { orderId: o.order_id, pay, gw };
    };
    const ent = async (orderId) => (await q(`select starts_at s, expires_at e, is_active a, revoked_at r from public.user_entitlements where order_id = $1`, [orderId]))[0];
    const elig = (orderId) => svc(`fn_pro_refund_eligibility($1)`, [orderId]);
    // the QA student's own earlier paid Pro (on the project database) decides what "first purchase" must say
    const [prior] = await q(`select count(*)::int n from public.payment_transactions t join public.payment_orders o on o.id = t.order_id
                              where o.user_id = $1 and o.order_type = 'PRO_PLAN' and o.gateway_mode = 'live' and t.captured_at is not null`, [stu.id]);
    const FIRST = prior.n === 0;

    // ---------------- A: shape + grants + the tier trigger
    await chunk(async () => {
      const [s] = await q(`select
          (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'test_attempts' and column_name = 'access_tier') col,
          exists (select 1 from pg_trigger where tgname = 'trg_test_attempts_access_tier' and tgrelid = 'public.test_attempts'::regclass) trg,
          (select relrowsecurity from pg_class where oid = 'public.pro_refund_approvals'::regclass) rls,
          (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'pro_refund_approvals') pol,
          to_regprocedure('public.fn_refund_pro_payment(text, integer, text)') is null old_gone,
          (select prosecdef from pg_proc where oid = 'public.fn_refund_pro_payment(text, integer, text, text)'::regprocedure) r_def,
          (select prosecdef from pg_proc where oid = 'public.fn_pro_refund_eligibility(uuid)'::regprocedure) e_def,
          (select prosecdef from pg_proc where oid = 'public.fn_pro_refund_approve(text, text, text, uuid, text)'::regprocedure) a_def,
          (select prosecdef from pg_proc where oid = 'public.fn_test_attempt_access_tier()'::regprocedure) t_def`);
      const denied = [];
      for (const [role, cl] of [['anon', ANON], ['authenticated', STU]]) {
        for (const sql of ['select * from public.pro_refund_approvals limit 1', `select public.fn_pro_refund_eligibility(gen_random_uuid())`,
          `select public.fn_pro_refund_approve('pay_B6PROBE0001', 'GOODWILL', 'x', gen_random_uuid(), 'x')`, `select public.fn_refund_pro_payment('pay_B6PROBE0001', 100, 'rfnd_B6PROBE001', 'live')`]) {
          const r = await as(role, cl, sql);
          if (r.ok || r.code !== '42501') denied.push(`${role}: ${sql.slice(0, 50)} → ${r.ok ? 'ALLOWED' : r.code}`);
        }
      }
      chk('A-1 test_attempts.access_tier + its trigger; approvals: RLS on, no policy; old refund signature gone; refund DEFINER, eligibility / approve / trigger INVOKER; anon + student: 42501 on all four',
        s.col === 'text' && s.trg && s.rls && s.pol === 0 && s.old_gone && s.r_def === true && s.e_def === false && s.a_def === false && s.t_def === false && denied.length === 0, JSON.stringify({ s, denied }));
      const [m] = await q(`select m.id from public.mock_tests m where not exists (select 1 from public.test_attempts a where a.user_id = $1 and a.mock_test_id = m.id) limit 1`, [stu.id]);
      if (!m) { skip('A-2 the attempt tier trigger', 'no mock tests in this database'); return; }
      await q(`insert into public.access_policies (item_kind, item_key, tier) values ('MOCK_TEST', $1, 'PRO') on conflict (item_kind, item_key) do update set tier = 'PRO'`, [m.id]);
      const [a] = await q(`insert into public.test_attempts (user_id, mock_test_id, status) values ($1, $2, 'in_progress') returning id, access_tier`, [stu.id, m.id]);
      await q(`update public.access_policies set tier = 'FREE' where item_kind = 'MOCK_TEST' and item_key = $1`, [m.id]);
      await q(`update public.test_attempts set access_tier = 'FREE' where id = $1`, [a.id]);
      const [after] = await q(`select access_tier from public.test_attempts where id = $1`, [a.id]);
      chk('A-2 a new attempt records its mock\'s tier at start (PRO); a later tier change or a direct update does not rewrite it', a.access_tier === 'PRO' && after.access_tier === 'PRO', JSON.stringify({ a, after }));
    });

    if (!MONEY) {
      skip('B..E money chunks', 'no Pro plans in this database (a local copy) — they run on the project database (--pre / after apply)');
      flush();
    } else {
      // ---------------- B: eligibility
      await chunk(async () => {
        const A = await paid('ELIGA', 1);
        const e1 = await elig(A.orderId);
        chk(`B-1 a first live purchase (paid 1 h ago, no Pro mock) → ${FIRST ? 'eligible' : 'NOT_FIRST_PURCHASE (the QA student has an earlier paid Pro here)'}; window = payment + 7 days`,
          e1.found === true && (FIRST ? e1.eligible === true && e1.reasons.length === 0 : e1.reasons.includes('NOT_FIRST_PURCHASE'))
          && e1.within_7_days === true && e1.latest_period === true && e1.pro_mocks_submitted === 0 && new Date(e1.window_ends_at) - new Date(e1.paid_at) === 7 * DAY, JSON.stringify(e1));
        await q(`update public.payment_transactions set captured_at = now() - interval '8 days' where gateway_payment_id = $1`, [A.pay]);
        const e2 = await elig(A.orderId);
        chk('B-2 8 days after the payment → OUTSIDE_7_DAYS', e2.eligible === false && e2.reasons.includes('OUTSIDE_7_DAYS'), JSON.stringify(e2));
        await q(`update public.payment_transactions set captured_at = now() - interval '2 hours' where gateway_payment_id = $1`, [A.pay]);
        const B = await paid('ELIGB', 0);
        const eA = await elig(A.orderId);
        const eB = await elig(B.orderId);
        chk('B-3 a second (stacked) purchase → it is NOT_FIRST_PURCHASE (F1 a); the first one is now NOT_LATEST_PERIOD (D7)',
          eB.reasons.includes('NOT_FIRST_PURCHASE') && eB.latest_period === true && eA.reasons.includes('NOT_LATEST_PERIOD') && eA.latest_period === false, JSON.stringify({ eA, eB }));
      });
      await chunk(async () => {
        const A = await paid('MOCKA', 1);
        const ms = await q(`select m.id from public.mock_tests m where not exists (select 1 from public.test_attempts a where a.user_id = $1 and a.mock_test_id = m.id) limit 3`, [stu.id]);
        if (ms.length < 3) { skip('B-4 Pro mocks', 'fewer than 3 mock tests without a QA-student attempt'); return; }
        for (const m of ms) await q(`insert into public.access_policies (item_kind, item_key, tier) values ('MOCK_TEST', $1, 'PRO') on conflict (item_kind, item_key) do update set tier = 'PRO'`, [m.id]);
        const sub = async (id) => q(`insert into public.test_attempts (user_id, mock_test_id, status, submitted_at) values ($1, $2, 'submitted', now()) returning id`, [stu.id, id]);
        await sub(ms[0].id);
        const e1 = await elig(A.orderId);
        await sub(ms[1].id);
        const e2 = await elig(A.orderId);
        // an attempt from before 151 (no recorded tier) → the current tier is used, and the answer says so
        const [old] = await sub(ms[2].id);
        await q(`alter table public.test_attempts disable trigger trg_test_attempts_access_tier`);
        await q(`update public.test_attempts set access_tier = null where id = $1`, [old.id]);
        await q(`alter table public.test_attempts enable trigger trg_test_attempts_access_tier`);
        const e3 = await elig(A.orderId);
        chk('B-4 D5: 1 submitted PRO mock since the payment → still allowed; 2 → MORE_THAN_1_PRO_MOCK; an attempt with no recorded tier counts by the current tier and adds TIER_AT_CHECK_TIME',
          e1.pro_mocks_submitted === 1 && !e1.reasons.includes('MORE_THAN_1_PRO_MOCK') && e2.pro_mocks_submitted === 2 && e2.reasons.includes('MORE_THAN_1_PRO_MOCK')
          && e3.pro_mocks_submitted === 3 && e3.pro_mocks_tier_at_check_time === 1 && e3.notes.includes('TIER_AT_CHECK_TIME'), JSON.stringify({ e1, e2, e3 }));
      });

      // ---------------- C: approvals, once per user, modes, replays
      await chunk(async () => {
        const A = await paid('APPRA', 1);
        const ap = (pay, reason, note = 'gate') => svc(`fn_pro_refund_approve($1, $2, $3, $4, 'gate')`, [pay, reason, note, ADMIN_ID]);
        const bad = await ap(A.pay, 'CASHBACK');
        if (FIRST) {
          const a1 = await ap(A.pay, 'POLICY_7_DAY');
          const a2 = await ap(A.pay, 'POLICY_7_DAY');
          const [audit] = await q(`select count(*)::int n from public.admin_audit_logs where action_type = 'PRO_REFUND_APPROVED' and new_value ->> 'payment_id' = $1`, [A.pay]);
          chk('C-1 an unknown reason → INVALID_INPUT; POLICY_7_DAY on an eligible order → recorded with the eligibility snapshot + one audit row; a second approval → ALREADY_APPROVED',
            bad.code === 'INVALID_INPUT' && a1.success === true && a1.eligibility.eligible === true && a2.code === 'ALREADY_APPROVED' && audit.n === 1, JSON.stringify({ bad, a1, a2, audit }));
          const mm = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6APPRA001', 'test')`, [A.pay]);
          const e0 = await ent(A.orderId);
          const r1 = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6APPRA001', 'live')`, [A.pay]);
          const r2 = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6APPRA001', 'live')`, [A.pay]);
          const [ar] = await q(`select refund_id, refunded_at is not null done from public.pro_refund_approvals where payment_id = $1`, [A.pay]);
          const [lg] = await q(`select new_value v from public.admin_audit_logs where action_type = 'PRO_ORDER_REFUNDED' and target_id = $1`, [A.orderId]);
          const e1 = await ent(A.orderId);
          chk('C-2 a test-mode refund of a live order → MODE_MISMATCH (Pro untouched); the live refund → full, linked to the approval (refund_kind POLICY_7_DAY), Pro revoked; a replay → already_processed',
            mm.code === 'MODE_MISMATCH' && e0.a === true && r1.success === true && r1.full === true && r1.refund_kind === 'POLICY_7_DAY' && r2.already_processed === true
            && ar.refund_id === 'rfnd_B6APPRA001' && ar.done && lg && lg.v.refund_kind === 'POLICY_7_DAY' && lg.v.approval_id && e1.a === false && e1.r, JSON.stringify({ mm, r1, r2, ar, lg, e1 }));
          const B = await paid('APPRB', 0);
          const eB = await elig(B.orderId);
          const nb = await ap(B.pay, 'POLICY_7_DAY');
          chk('C-3 once per user (F2 a): after a completed 7-day refund, a later order → POLICY_REFUND_ALREADY_USED, and POLICY_7_DAY → NOT_ELIGIBLE',
            eB.reasons.includes('POLICY_REFUND_ALREADY_USED') && nb.code === 'NOT_ELIGIBLE', JSON.stringify({ eB, nb }));
        } else {
          const a1 = await ap(A.pay, 'POLICY_7_DAY');
          chk('C-1 (the QA student has an earlier paid Pro here) POLICY_7_DAY → NOT_ELIGIBLE; an unknown reason → INVALID_INPUT', a1.code === 'NOT_ELIGIBLE' && bad.code === 'INVALID_INPUT', JSON.stringify({ a1, bad }));
        }
        const U = await paid('UNREC', 0);
        const ru = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6UNREC001', 'live')`, [U.pay]);
        chk('C-4 a refund with no recorded reason → applied (the money already left) and marked UNRECORDED', ru.success === true && ru.refund_kind === 'UNRECORDED', JSON.stringify(ru));
      });

      // ---------------- D: stacked periods
      await chunk(async () => {
        const [fo0] = await q(`select sold from public.founding_offer`);
        const A = await paid('STKA1', 0);
        const B = await paid('STKB1', 0);
        const a0 = await ent(A.orderId);
        const b0 = await ent(B.orderId);
        const r = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6STKB1001', 'live')`, [B.pay]);
        const a1 = await ent(A.orderId);
        const b1 = await ent(B.orderId);
        const [fo1] = await q(`select sold from public.founding_offer`);
        chk('D-1 full refund of the LATEST period → it is revoked, nothing moves, the earlier period is untouched; founding sold unchanged (D6)',
          Math.abs(new Date(b0.s) - new Date(a0.e)) < 2000 && r.success === true && r.moved_periods === 0 && b1.a === false
          && +new Date(a1.s) === +new Date(a0.s) && +new Date(a1.e) === +new Date(a0.e) && a1.a === true && (fo0 ? fo1.sold === fo0.sold : true), JSON.stringify({ a0, b0, r, a1, b1, fo0, fo1 }));
      });
      await chunk(async () => {
        const A = await paid('STKA2', 0);
        const B = await paid('STKB2', 0);
        const a0 = await ent(A.orderId);
        const b0 = await ent(B.orderId);
        const [{ t: now }] = await q(`select now() t`);
        const r = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6STKA2001', 'live')`, [A.pay]);
        const a1 = await ent(A.orderId);
        const b1 = await ent(B.orderId);
        const removed = new Date(a0.e) - Math.max(+new Date(a0.s), +new Date(now));
        chk('D-2 full refund of the EARLIER (current) period (F3 a) → it is revoked; the later period moves earlier by exactly the time removed and keeps its length',
          r.success === true && r.moved_periods === 1 && a1.a === false && +new Date(b1.s) === +new Date(b0.s) - removed && +new Date(b1.e) === +new Date(b0.e) - removed
          && new Date(b1.e) - new Date(b1.s) === new Date(b0.e) - new Date(b0.s), JSON.stringify({ a0, b0, a1, b1, r, removed }));
      });
      await chunk(async () => {
        const A = await paid('STKA3', 0);
        const B = await paid('STKB3', 0);
        const a0 = await ent(A.orderId);
        const b0 = await ent(B.orderId);
        const r = await svc(`fn_refund_pro_payment($1, 14950, 'rfnd_B6STKA3001', 'live')`, [A.pay]);
        const a1 = await ent(A.orderId);
        const b1 = await ent(B.orderId);
        const days = Math.floor(((new Date(a0.e) - new Date(a0.s)) / DAY) * 14950 / 29900);
        chk(`D-3 a partial refund (half) of the earlier period (F4 a) → ${days} days off its end; the later period moves earlier by the same days; both still active`,
          r.success === true && r.full === false && r.moved_periods === 1 && a1.a === true && b1.a === true
          && +new Date(a1.e) === +new Date(a0.e) - days * DAY && +new Date(b1.s) === +new Date(b0.s) - days * DAY && +new Date(b1.e) === +new Date(b0.e) - days * DAY,
          JSON.stringify({ a0, a1, b0, b1, r, days }));
      });

      // ---------------- E: after the end; double charge with its approval
      await chunk(async () => {
        const A = await paid('ENDED', 0);
        await q(`update public.user_entitlements set starts_at = now() - interval '100 days', expires_at = now() - interval '5 days' where order_id = $1`, [A.orderId]);
        const r = await svc(`fn_refund_pro_payment($1, 29900, 'rfnd_B6ENDED001', 'live')`, [A.pay]);
        const e = await ent(A.orderId);
        chk('E-1 a refund after the period ended → recorded (full), nothing moved, the period marked revoked', r.success === true && r.full === true && r.moved_periods === 0 && e.a === false, JSON.stringify({ r, e }));
        const D = await paid('DBLCH', 0);
        const d = await svc(`fn_fulfil_pro_order($1, 'pay_B6DBLCH0002', 29900, 'INR', 'WEBHOOK', 'live')`, [D.gw]);
        const ap = await svc(`fn_pro_refund_approve('pay_B6DBLCH0002', 'DOUBLE_CHARGE', 'gate', $1, 'gate')`, [ADMIN_ID]);
        const rd = await svc(`fn_refund_pro_payment('pay_B6DBLCH0002', 29900, 'rfnd_B6DBLCH001', 'live')`);
        const rd2 = await svc(`fn_refund_pro_payment('pay_B6DBLCH0002', 29900, 'rfnd_B6DBLCH001', 'live')`);
        const [ar] = await q(`select refund_id from public.pro_refund_approvals where payment_id = 'pay_B6DBLCH0002'`);
        const de = await ent(D.orderId);
        chk('E-2 a double charge: approval DOUBLE_CHARGE (no Pro was granted for it) → its refund is unapplied, linked (refund_kind DOUBLE_CHARGE), Pro untouched; a replay → already_processed',
          d.code === 'ORDER_ALREADY_PAID' && ap.success === true && rd.success === true && rd.unapplied === true && rd.refund_kind === 'DOUBLE_CHARGE'
          && rd2.already_processed === true && ar.refund_id === 'rfnd_B6DBLCH001' && de.a === true, JSON.stringify({ d, ap, rd, rd2, ar, de }));
      });
    }

    if (PRE) {
      const [z] = await q(`select to_regclass('public.pro_refund_approvals') is null gone,
          (select count(*)::int from public.payment_orders where gateway_order_id like 'order_B6%') orders`);
      chk('Z-1 nothing persisted (--pre: no approvals table, no B6 orders)', z.gone === true && z.orders === 0, JSON.stringify(z));
    } else {
      const [z] = await q(`select (select count(*)::int from public.pro_refund_approvals where payment_id like 'pay_B6%') appr,
          (select count(*)::int from public.payment_orders where gateway_order_id like 'order_B6%') orders,
          (select count(*)::int from public.admin_audit_logs where new_value ->> 'payment_id' like 'pay_B6%' or new_value ->> 'refund_id' like 'rfnd_B6%') audit`);
      chk('Z-1 nothing persisted (approvals, orders, audit rows)', z.appr === 0 && z.orders === 0 && z.audit === 0, JSON.stringify(z));
    }
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL PAY1-B6 live aborted — ${red(String(e.message)).slice(0, 400)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'PAY-1 B6 live: ALL PASS' : 'PAY-1 B6 live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
