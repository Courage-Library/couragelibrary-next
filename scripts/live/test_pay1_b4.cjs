#!/usr/bin/env node
/**
 * PAY-1 B4 (migration 149; owner decisions R1–R4, 2026-11-18) — AS THE REAL ROLES, every write inside a rolled-back
 * transaction (withLiveTransaction → safeBegin: LIVE-LOCK-SAFETY). Synthetic gateway ids (order_B4…, pay_B4…); no
 * network, no Razorpay.
 *   --pre   149 is NOT applied: each chunk first runs the migration inside its own transaction (then rolls back)
 *   (none)  after apply: refuses unless 149 is APPLIED
 * Chunks:
 *   A shape: gateway_mode (default live) + the job index; the lease table (RLS on); the old signatures gone; DEFINER /
 *     INVOKER as designed; anon and the QA student cannot read the lease table or run any of the four functions (42501)
 *   B order: test mode refused for a non-QA user (before the age check); a QA identity's test order is stored as test;
 *     the same idempotency key in the other mode is refused; a live order is stored as live
 *   C fulfil: another mode → MODE_MISMATCH; RECONCILE fulfils once (replay = already_fulfilled); a second captured
 *     payment → ORDER_ALREADY_PAID + exactly ONE PRO_DOUBLE_CHARGE row, still one entitlement; its refund → acknowledged
 *     once (PRO_UNAPPLIED_PAYMENT_REFUNDED), Pro untouched; an unknown payment's refund → PAYMENT_NOT_FOUND; FAILED →
 *     a late payment still fulfils
 *   D receipt: a collision on attempt 0 → the fulfil succeeds with the attempt-1 number
 *   E lease: one holder at a time; renew by the holder; release by the holder only; then another holder gets it
 *   Z nothing persisted
 * Run: node scripts/live/test_pay1_b4.cjs [--pre]
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const PRE = process.argv.includes('--pre');
const FILE = '20261118000149_pay1_b4_payment_robustness.sql';
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations', FILE), 'utf8');
const QA_EMAILS = ['qa-admin@courage-library.test', 'qa-staff@courage-library.test', 'qa-student@courage-library.test'];

let ok = true;
let pending = [];
const chk = (n, cond, info) => { pending.push({ cond, line: `${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + String(info ?? '').slice(0, 600)}` }); };
const flush = () => { for (const r of pending) { if (!r.cond) ok = false; console.log(r.line); } pending = []; };
const isConnectionError = (e) => !!e && (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(e.code) || /Connection terminated|connection error|not queryable/i.test(String(e.message)));

(async () => {
  const target = dbTarget();
  const red = redactor(target);
  let c = new Client(target.pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  try {
    const [led] = await q(`select count(*)::int n from public.schema_migration_ledger where filename = $1 and status = 'APPLIED'`, [FILE]);
    if (PRE && led.n > 0) throw new Error(`--pre refused: ${FILE} is already APPLIED`);
    if (!PRE && led.n === 0) throw new Error(`${FILE} is not applied (use --pre for the pre-apply smoke)`);
    const [stu] = await q(`select id from auth.users where email = 'qa-student@courage-library.test'`);
    if (!stu) throw new Error('the QA student is missing');
    // a real NON-QA account if one exists (only its id is read), else a random id (no account = not QA either)
    const [nonQa] = await q(`select id from auth.users where lower(email) not like '%@courage-library.test' limit 1`);
    const NONQA = nonQa ? nonQa.id : '00000000-0000-4000-8000-0000000000b4';
    const [{ t: startedAt }] = await q(`select now() t`);
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: String(e.message).slice(0, 160) }; }
    };
    const ANON = { role: 'anon' };
    const STU = { sub: stu.id, role: 'authenticated', aal: 'aal1', app_metadata: {} };
    const svc = async (call, args = []) => { const r = await as('service_role', { role: 'service_role' }, `select public.${call} r`, args); return r.ok ? r.rows[0].r : { error: r.code, msg: r.msg }; };
    const chunk = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        pending = [];
        try {
          await c.end().catch(() => {});
          c = new Client(target.pg); c.on('error', () => {}); await c.connect();
          await withLiveTransaction(c, async () => { if (PRE) await c.query(MIGRATION_SQL); await q(`update public.user_profiles set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = $1`, [stu.id]); await fn(); });
          flush();
          return;
        } catch (e) {
          if (attempt === 1 && isConnectionError(e)) { console.log(`RETRY chunk after a dropped connection (${e.code || 'terminated'})`); continue; }
          throw e;
        }
      }
    };
    // a live order for the QA student with a synthetic gateway order id, ready to fulfil
    const liveOrder = async (key, gw) => {
      const o = await svc(`fn_create_pro_order($1, 'PRO_3M', $2, 'live')`, [stu.id, key]);
      const a = o.success ? await svc(`fn_attach_gateway_order($1, $2, $3)`, [o.order_id, stu.id, gw]) : null;
      return { o, a };
    };

    // ---------------- A: shape + grants
    await chunk(async () => {
      const [s] = await q(`select
          (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'payment_orders' and column_name = 'gateway_mode') def,
          to_regclass('public.idx_po_pro_open_created') is not null idx,
          (select relrowsecurity from pg_class where oid = 'public.payment_job_leases'::regclass) rls,
          to_regprocedure('public.fn_create_pro_order(uuid, text, text)') is null and to_regprocedure('public.fn_fulfil_pro_order(text, text, integer, text, text)') is null old_gone,
          (select prosecdef from pg_proc where oid = 'public.fn_create_pro_order(uuid, text, text, text)'::regprocedure) c_def,
          (select prosecdef from pg_proc where oid = 'public.fn_fulfil_pro_order(text, text, integer, text, text, text)'::regprocedure) f_def,
          (select prosecdef from pg_proc where oid = 'public.fn_refund_pro_payment(text, integer, text)'::regprocedure) r_def,
          (select prosecdef from pg_proc where oid = 'public.fn_payment_job_lease(text, uuid, integer)'::regprocedure) l_def`);
      const denied = [];
      for (const [role, cl] of [['anon', ANON], ['authenticated', STU]]) {
        for (const sql of [`select * from public.payment_job_leases`, `select public.fn_payment_job_lease('b4_gate_probe', gen_random_uuid(), 30)`,
          `select public.fn_create_pro_order('${stu.id}', 'PRO_3M', 'k-b4-probe-001', 'test')`, `select public.fn_fulfil_pro_order('order_B4PROBE00001', 'pay_B4PROBE0001', 29900, 'INR', 'RECONCILE', 'live')`]) {
          const r = await as(role, cl, sql);
          if (r.ok || r.code !== '42501') denied.push(`${role}: ${sql.slice(0, 48)} → ${r.ok ? 'ALLOWED' : r.code}`);
        }
      }
      chk("A-1 gateway_mode default 'live' + the job index; lease table RLS on; old signatures gone; create / fulfil / refund DEFINER, lease INVOKER; anon + student: 42501 on the lease table and all four functions",
        /'live'/.test(String(s.def)) && s.idx && s.rls && s.old_gone && s.c_def && s.f_def && s.r_def && s.l_def === false && denied.length === 0, JSON.stringify({ s, denied }));
    });

    // ---------------- B: orders and modes
    await chunk(async () => {
      const nonQaTest = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-b4-nonqa-0001', 'test')`, [NONQA]);
      const qaTest = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-b4-qatest-001', 'test')`, [stu.id]);
      const [row] = qaTest.success ? await q(`select gateway_mode m from public.payment_orders where id = $1`, [qaTest.order_id]) : [{}];
      const crossMode = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-b4-qatest-001', 'live')`, [stu.id]);
      const live = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-b4-live-00001')`, [stu.id]); // the 3-argument call (the app on main) = live
      const [row2] = live.success ? await q(`select gateway_mode m from public.payment_orders where id = $1`, [live.order_id]) : [{}];
      const badMode = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-b4-bad-000001', 'prod')`, [stu.id]);
      chk(`B-1 test mode: a non-QA ${nonQa ? 'account' : 'id'} → TEST_MODE_QA_ONLY; the QA student's test order is stored as test; the same key in live → IDEMPOTENCY_KEY_USED; the 3-argument call stores live; an unknown mode → INVALID_INPUT`,
        nonQaTest.code === 'TEST_MODE_QA_ONLY' && qaTest.success === true && row.m === 'test' && crossMode.code === 'IDEMPOTENCY_KEY_USED' && live.success === true && row2.m === 'live' && badMode.code === 'INVALID_INPUT',
        JSON.stringify({ nonQaTest, qaTest: qaTest.success ?? qaTest, row, crossMode, live: live.success ?? live, row2, badMode }));
    });

    // ---------------- C: fulfil, double charge, unapplied refund, late fulfil
    await chunk(async () => {
      const A = await liveOrder('k-b4-fulfil-0001', 'order_B4LIVEA00001');
      const mism = await svc(`fn_fulfil_pro_order('order_B4LIVEA00001', 'pay_B4LIVEA0001', 29900, 'INR', 'RECONCILE', 'test')`);
      const f1 = await svc(`fn_fulfil_pro_order('order_B4LIVEA00001', 'pay_B4LIVEA0001', 29900, 'INR', 'RECONCILE', 'live')`);
      const f1b = await svc(`fn_fulfil_pro_order('order_B4LIVEA00001', 'pay_B4LIVEA0001', 29900, 'INR', 'WEBHOOK', 'live')`);
      const d1 = await svc(`fn_fulfil_pro_order('order_B4LIVEA00001', 'pay_B4LIVEA0002', 29900, 'INR', 'RECONCILE', 'live')`);
      const d2 = await svc(`fn_fulfil_pro_order('order_B4LIVEA00001', 'pay_B4LIVEA0002', 29900, 'INR', 'WEBHOOK', 'live')`);
      const [cnt] = await q(`select (select count(*)::int from public.admin_audit_logs where action_type = 'PRO_DOUBLE_CHARGE' and target_id = $1 and new_value ->> 'payment_id' = 'pay_B4LIVEA0002') dbl,
          (select count(*)::int from public.user_entitlements where order_id = $1::uuid) ents`, [A.o.order_id]);
      chk('C-1 another mode → MODE_MISMATCH; RECONCILE fulfils once (a replay = already_fulfilled); a second captured payment → ORDER_ALREADY_PAID twice, exactly ONE PRO_DOUBLE_CHARGE row and still ONE entitlement',
        A.a && A.a.success === true && mism.code === 'MODE_MISMATCH' && f1.success === true && /^CL-R-\d{6}-[A-Z0-9]{6}$/.test(f1.receipt_number) && f1b.already_fulfilled === true
        && d1.code === 'ORDER_ALREADY_PAID' && d2.code === 'ORDER_ALREADY_PAID' && cnt.dbl === 1 && cnt.ents === 1, JSON.stringify({ A, mism, f1, f1b, d1, d2, cnt }));
      const r1 = await svc(`fn_refund_pro_payment('pay_B4LIVEA0002', 29900, 'rfnd_B4LIVEA00001')`);
      const r2 = await svc(`fn_refund_pro_payment('pay_B4LIVEA0002', 29900, 'rfnd_B4LIVEA00001')`);
      const r3 = await svc(`fn_refund_pro_payment('pay_B4NOWHERE0001', 29900, 'rfnd_B4NOWHERE001')`);
      const [cnt2] = await q(`select (select count(*)::int from public.admin_audit_logs where action_type = 'PRO_UNAPPLIED_PAYMENT_REFUNDED' and new_value ->> 'refund_id' = 'rfnd_B4LIVEA00001') ack,
          (select count(*)::int from public.user_entitlements where order_id = $1::uuid and is_active and revoked_at is null) active,
          (select status from public.payment_orders where id = $1::uuid) st`, [A.o.order_id]);
      chk('C-2 the double charge refunded in the dashboard → acknowledged (unapplied) once, twice-safe; Pro and the order untouched; an unknown payment → PAYMENT_NOT_FOUND',
        r1.success === true && r1.unapplied === true && r2.success === true && cnt2.ack === 1 && cnt2.active === 1 && cnt2.st === 'PAID' && r3.code === 'PAYMENT_NOT_FOUND', JSON.stringify({ r1, r2, r3, cnt2 }));
      const B = await liveOrder('k-b4-late-00001', 'order_B4LIVEB00001');
      const mk = await svc(`fn_mark_pro_order_failed('order_B4LIVEB00001')`);
      const [st] = await q(`select status from public.payment_orders where id = $1`, [B.o.order_id]);
      const late = await svc(`fn_fulfil_pro_order('order_B4LIVEB00001', 'pay_B4LIVEB0001', 29900, 'INR', 'RECONCILE', 'live')`);
      chk('C-3 FAILED (the job gives up after 2 h) → a late payment still fulfils', mk.updated === 1 && st.status === 'FAILED' && late.success === true && late.already_fulfilled === false, JSON.stringify({ mk, st, late }));
    });

    // ---------------- D: receipt-number collision
    await chunk(async () => {
      const X = await liveOrder('k-b4-rcpt-x0001', 'order_B4RCPTX00001');
      const fx = await svc(`fn_fulfil_pro_order('order_B4RCPTX00001', 'pay_B4RCPTX0001', 29900, 'INR', 'RECONCILE', 'live')`);
      const Y = await liveOrder('k-b4-rcpt-y0001', 'order_B4RCPTY00001');
      const num = (n) => q(`select 'CL-R-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || upper(substr(md5($1::text || 'pay_B4RCPTY0001' || $2), 1, 6)) r`, [Y.o.order_id, n]).then((r) => r[0].r);
      const n0 = await num('');
      const n1 = await num(':1');
      await q(`update public.payment_receipts set receipt_number = $1 where order_id = $2`, [n0, X.o.order_id]);
      const fy = await svc(`fn_fulfil_pro_order('order_B4RCPTY00001', 'pay_B4RCPTY0001', 29900, 'INR', 'RECONCILE', 'live')`);
      chk('D-1 the attempt-0 receipt number is taken → the fulfil still succeeds with the attempt-1 number',
        fx.success === true && fy.success === true && fy.receipt_number === n1 && n1 !== n0, JSON.stringify({ fx: fx.success ?? fx, fy, same: n0 === n1 }));
    });

    // ---------------- E: the lease
    await chunk(async () => {
      const h1 = '00000000-0000-4000-8000-0000000000e1';
      const h2 = '00000000-0000-4000-8000-0000000000e2';
      const L = (h, s) => svc(`fn_payment_job_lease('b4_gate_lease', $1::uuid, $2)`, [h, s]);
      const a1 = await L(h1, 60);
      const a2 = await L(h2, 60);
      const renew = await L(h1, 60);
      const foreignRelease = await L(h2, 0);
      const a2b = await L(h2, 60);
      const rel = await L(h1, 0);
      // the lease "now" is the transaction start; a release sets lease_until = that instant, so the next holder gets it
      const a2c = await L(h2, 60);
      const bad = await L(h1, 5000);
      chk('E-1 one holder at a time (a second holder → false); the holder renews; a release by another holder changes nothing; after the holder releases, another holder gets it; an out-of-range lease → false',
        a1 === true && a2 === false && renew === true && foreignRelease === true && a2b === false && rel === true && a2c === true && bad === false, JSON.stringify({ a1, a2, renew, foreignRelease, a2b, rel, a2c, bad }));
    });

    const [z] = await q(`select (select count(*)::int from public.payment_orders where created_at >= $1 and user_id in (select id from auth.users where email = any($2))) orders,
        (select count(*)::int from public.admin_audit_logs where created_at >= $1 and action_type in ('PRO_DOUBLE_CHARGE', 'PRO_PAYMENT_TO_REFUND', 'PRO_UNAPPLIED_PAYMENT_REFUNDED') and new_value ->> 'payment_id' like 'pay_B4%') audit
        ${PRE ? '' : `, (select count(*)::int from public.payment_job_leases where job = 'b4_gate_lease') leases`}`, [startedAt, QA_EMAILS]);
    chk('Z-1 nothing persisted (QA orders, B4 audit rows, the gate lease)', z.orders === 0 && z.audit === 0 && !z.leases, JSON.stringify(z));
    flush();
  } catch (e) {
    ok = false;
    flush();
    console.log(`FAIL PAY1-B4 live aborted — ${red(String(e.message)).slice(0, 300)}`);
  } finally {
    await c.end().catch(() => {});
  }
  console.log(ok ? 'PAY-1 B4 live: ALL PASS' : 'PAY-1 B4 live: FAILURES');
  process.exit(ok ? 0 : 1);
})();
