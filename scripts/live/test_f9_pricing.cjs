#!/usr/bin/env node
/**
 * F9-PRICING (F9-B, architect GO; migrations 113 + 114) — live money-rule check AS THE REAL ROLES, every write inside a
 * rolled-back transaction (LIVE-LOCK-SAFETY: lock / statement / idle timeouts; synthetic order ids order_TEST…, no
 * network, no Razorpay). service_role for every payment function; the authenticated QA student and anon for client
 * reads and denials. Includes the two 106 checks that were skipped until the fulfil path existed:
 *   F-2 valid → PAID once; the replay → already_fulfilled     F-3 the same payment id on another order → rejected
 * plus: grants / RLS, under-18 + unauthenticated blocked, double-click, amount / currency tamper, stacking, price
 * versions, partial / full refund, founding limit, library grants, open-ended grants, rate limit, receipts own-read,
 * the client-verify + webhook race (one fulfilment) and Z-1 (nothing left behind).
 * Run: node scripts/live/test_f9_pricing.cjs
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require('pg');
const { dbTarget } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { withLiveTransaction, LIVE_SAFETY_SQL } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));
const POST = true;
let ok = true; const chk = (n, cond, info) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${cond ? '' : ' — ' + (info ?? '')}`); };
(async () => {
  const c = new Client(dbTarget().pg); c.on('error', () => {}); await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const ids = {};
  const [base] = (await c.query(`select (select count(*)::int from payment_orders) o, (select count(*)::int from user_entitlements) e`)).rows;
  try {
    for (const [k, e] of [['admin', 'qa-admin@courage-library.test'], ['staff', 'qa-staff@courage-library.test'], ['student', 'qa-student@courage-library.test']]) ids[k] = (await q(`select id from auth.users where email=$1`, [e]))[0].id;
    const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
    const as = async (role, cl, sql, p) => {
      await c.query('savepoint s'); await c.query(`set local role ${role}`); await c.query(`select set_config('request.jwt.claims', ${lit(cl)}, true)`);
      try { const r = (await c.query(sql, p)).rows; await c.query('reset role'); await c.query('release savepoint s'); return { ok: true, rows: r }; }
      catch (e) { await c.query('rollback to savepoint s'); return { ok: false, code: e.code, msg: e.message.slice(0, 120) }; }
    };
    const SVC = { role: 'service_role' };
    const STU = { sub: ids.student, role: 'authenticated', aal: 'aal1' };
    const svc = async (fn, args) => { const r = await as('service_role', SVC, `select public.${fn} r`, args); return r.ok ? r.rows[0].r : { error: r.code, msg: r.msg }; };

    // ---------------- chunk 1: grants / RLS / client denials
    await withLiveTransaction(c, async () => {
      const anonPlans = await as('anon', { role: 'anon' }, `select plan_code, price_paise from public.pro_plan_versions order by display_order`);
      chk('G-1 anon reads the 4 ACTIVE v1 plans (prices in paise: 29900 / 49900 / 79900 / 59900)', anonPlans.ok && anonPlans.rows.map((r) => r.plan_code + ':' + r.price_paise).join(',') === 'PRO_3M:29900,PRO_6M:49900,PRO_12M:79900,PRO_12M_FOUNDING:59900', JSON.stringify(anonPlans));
      const denials = [];
      for (const [role, cl] of [['anon', { role: 'anon' }], ['authenticated', STU]]) {
        for (const sql of [`select * from public.app_settings`, `select * from public.founding_offer`, `select * from public.pro_reminders_sent`,
                           `select public.fn_has_pro('${ids.student}')`, `select public.fn_create_pro_order('${ids.student}', 'PRO_3M', 'key-123456')`,
                           `select public.fn_fulfil_pro_order('order_x1234567', 'pay_x', 29900, 'INR', 'WEBHOOK')`, `select public.fn_create_payment_order('SUBSCRIPTION_PURCHASE', null, null, null, null, null)`]) {
          const r = await as(role, cl, sql); if (r.ok || r.code !== '42501') denials.push(`${role}: ${sql.slice(0, 50)} → ${r.ok ? 'ALLOWED' : r.code}`);
        }
      }
      chk('G-2 anon / authenticated: no read of settings / counter / reminders; no EXECUTE on any payment function (incl. the legacy fn_create_payment_order)', denials.length === 0, denials.join(' | '));
      const [g] = await q(`select has_function_privilege('service_role','public.fn_fulfil_pro_order(text,text,integer,text,text)','EXECUTE') f, has_table_privilege('service_role','public.payment_receipts','INSERT') r,
        (select count(*)::int from pg_proc where proname in ('fn_has_pro','fn_create_pro_order','fn_attach_gateway_order','fn_fulfil_pro_order','fn_mark_pro_order_failed','fn_refund_pro_payment','fn_grant_library_pro','fn_revoke_library_pro') and prosecdef and proconfig::text like '%search_path=%' ) n`);
      chk('G-3 service_role can run the 8 functions (SECURITY DEFINER, search_path pinned) and write receipts', g.f && g.r && g.n === 8, JSON.stringify(g));
    });

    // ---------------- chunk 2: order → fulfil → replay / reuse / mismatch / stacking / versions / refund
    await withLiveTransaction(c, async () => {
      await q(`update public.user_profiles set adult_confirmed_at = null where id = $1`, [ids.student]);
      const u18 = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-under18-0001')`, [ids.student]);
      const unauth = await svc(`fn_create_pro_order(null, 'PRO_3M', 'k-unauth-0001')`, []);
      chk('O-1 unauthenticated (no user) and under-18 (no confirmation) are BLOCKED', unauth.code === 'INVALID_INPUT' && u18.code === 'AGE_REQUIRED', JSON.stringify({ unauth, u18 }));
      await q(`update public.user_profiles set adult_confirmed_at = now() where id = $1`, [ids.student]);
      const o1 = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-double-click-01')`, [ids.student]);
      const o1b = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-double-click-01')`, [ids.student]);
      chk('O-2 order snapshot from the server plan (29900 INR); double-click (same key) → the SAME open order', o1.success && o1.amount_paise === 29900 && o1b.existing === true && o1b.order_id === o1.order_id, JSON.stringify({ o1, o1b }));
      const at = await svc(`fn_attach_gateway_order($1, $2, 'order_TESTA0000001')`, [o1.order_id, ids.student]);
      const atOther = await svc(`fn_attach_gateway_order($1, $2, 'order_TESTX0000001')`, [o1.order_id, ids.staff]);
      chk('O-3 gateway order attaches to the OWN order only', at.success === true && atOther.success === false, JSON.stringify({ at, atOther }));
      const bad1 = await svc(`fn_fulfil_pro_order('order_TESTA0000001', 'pay_TESTA1', 29800, 'INR', 'CLIENT_VERIFY')`, []);
      const bad2 = await svc(`fn_fulfil_pro_order('order_TESTA0000001', 'pay_TESTA1', 29900, 'USD', 'CLIENT_VERIFY')`, []);
      const bad3 = await svc(`fn_fulfil_pro_order('order_TESTA0000001', null, 29900, 'INR', 'CLIENT_VERIFY')`, []);
      const bad4 = await svc(`fn_fulfil_pro_order('order_TESTA0000001', 'pay_TESTA1', null, 'INR', 'WEBHOOK')`, []);
      chk('F-0 tampered amount / currency → AMOUNT_MISMATCH; NULL payment id / amount → rejected (fail closed); nothing fulfilled', bad1.code === 'AMOUNT_MISMATCH' && bad2.code === 'AMOUNT_MISMATCH' && bad3.code === 'INVALID_INPUT' && bad4.code === 'INVALID_INPUT', JSON.stringify({ bad1, bad2, bad3, bad4 }));
      const f1 = await svc(`fn_fulfil_pro_order('order_TESTA0000001', 'pay_TESTA1', 29900, 'INR', 'CLIENT_VERIFY')`, []);
      const f1r = await svc(`fn_fulfil_pro_order('order_TESTA0000001', 'pay_TESTA1', 29900, 'INR', 'WEBHOOK')`, []);
      const [cnt1] = await q(`select (select count(*)::int from payment_transactions t join payment_orders o on o.id = t.order_id where o.id = $1) tx, (select count(*)::int from user_entitlements where order_id = $1) ent,
        (select count(*)::int from payment_receipts where order_id = $1) rc, (select status from payment_orders where id = $1) st, (select count(*)::int from admin_audit_logs where target_id = $1::text and action_type = 'PRO_ORDER_FULFILLED') au`, [o1.order_id]);
      chk('F-2 (106 skipped check) valid → PAID ONCE; the webhook replay of the same payment → already_fulfilled, nothing doubled (1 txn / 1 entitlement / 1 receipt / 1 audit row)',
        f1.success && f1.already_fulfilled === false && f1r.already_fulfilled === true && cnt1.tx === 1 && cnt1.ent === 1 && cnt1.rc === 1 && cnt1.st === 'PAID' && cnt1.au === 1, JSON.stringify({ f1, f1r, cnt1 }));
      const months = (a, b) => Math.round((new Date(b) - new Date(a)) / (30.44 * 86400e3));
      chk('E-1 entitlement: 3 months from now; receipt number CL-R-YYMMDD-XXXXXX', months(f1.starts_at, f1.expires_at) === 3 && /^CL-R-\d{6}-[A-Z0-9]{6}$/.test(f1.receipt_number), JSON.stringify(f1));
      const hp = await svc(`fn_has_pro($1)`, [ids.student]);
      chk('H-1 hasPro ON after payment', hp === true, hp);
      // reuse + stacking
      const o2 = await svc(`fn_create_pro_order($1, 'PRO_6M', 'k-second-order-1')`, [ids.student]);
      await svc(`fn_attach_gateway_order($1, $2, 'order_TESTB0000001')`, [o2.order_id, ids.student]);
      const reuse = await svc(`fn_fulfil_pro_order('order_TESTB0000001', 'pay_TESTA1', 49900, 'INR', 'WEBHOOK')`, []);
      chk('F-3 (106 skipped check) the same payment id on ANOTHER order → REJECTED', reuse.code === 'PAYMENT_ID_REUSED', JSON.stringify(reuse));
      const f2 = await svc(`fn_fulfil_pro_order('order_TESTB0000001', 'pay_TESTB1', 49900, 'INR', 'WEBHOOK')`, []);
      chk('S-1 stacking renewal: the 6-month period starts at the current end (not today) and adds 6 months', f2.success && new Date(f2.starts_at).getTime() === new Date(f1.expires_at).getTime() && months(f2.starts_at, f2.expires_at) === 6, JSON.stringify({ f1end: f1.expires_at, f2 }));
      // price version change
      await q(`update public.pro_plan_versions set active = false where plan_code = 'PRO_3M' and version = 1`);
      await q(`insert into public.pro_plan_versions (plan_code, version, duration_months, price_paise, label, display_order) values ('PRO_3M', 2, 3, 34900, 'Pro · 3 months', 1)`);
      const o3 = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-after-price-change')`, [ids.student]);
      const [snap] = await q(`select amount_paise, plan_version from payment_orders where id = $1`, [o1.order_id]);
      chk('V-1 a price change (new version) does not touch old orders; new orders use the new version', o3.amount_paise === 34900 && o3.plan_version === 2 && snap.amount_paise === 29900 && snap.plan_version === 1, JSON.stringify({ o3, snap }));
      const dup = await as('service_role', SVC, `insert into public.pro_plan_versions (plan_code, version, duration_months, price_paise, label) values ('PRO_3M', 3, 3, 1, 'x')`);
      chk('V-2 at most one ACTIVE version per plan code', !dup.ok && dup.code === '23505', JSON.stringify(dup));
      // refunds
      const rp = await svc(`fn_refund_pro_payment('pay_TESTB1', 24950, 'rfnd_TEST1')`, []);
      const rpr = await svc(`fn_refund_pro_payment('pay_TESTB1', 24950, 'rfnd_TEST1')`, []);
      const [e2] = await q(`select expires_at, is_active from user_entitlements where order_id = $1`, [o2.order_id]);
      chk('R-1 partial refund (half) → period shortened pro rata, Pro stays; the same refund id again → already_processed', rp.success && rp.full === false && e2.is_active && new Date(e2.expires_at) < new Date(f2.expires_at) && rpr.already_processed === true, JSON.stringify({ rp, rpr, e2 }));
      const rf = await svc(`fn_refund_pro_payment('pay_TESTA1', 29900, 'rfnd_TEST2')`, []);
      const [e1] = await q(`select is_active, revoked_at is not null r from user_entitlements where order_id = $1`, [o1.order_id]);
      const [st1] = await q(`select status from payment_orders where id = $1`, [o1.order_id]);
      const [au] = await q(`select count(*)::int n from admin_audit_logs where target_id = $1::text and action_type = 'PRO_ORDER_REFUNDED'`, [o1.order_id]);
      chk('R-2 full refund → that entitlement ends (inactive, revoked_at), order REFUNDED, audit row; nothing deleted', rf.success && rf.full === true && !e1.is_active && e1.r && st1.status === 'REFUNDED' && au.n === 1, JSON.stringify({ rf, e1, st1, au }));
      const over = await svc(`fn_refund_pro_payment('pay_TESTB1', 30000, 'rfnd_TEST3')`, []);
      chk('R-3 a refund beyond the paid amount is refused', over.code === 'REFUND_EXCEEDS_PAYMENT', JSON.stringify(over));
      // hasPro off when expired
      await q(`update user_entitlements set starts_at = now() - interval '2 days', expires_at = now() - interval '1 day' where user_id = $1 and order_id = $2`, [ids.student, o2.order_id]);
      const hp2 = await svc(`fn_has_pro($1)`, [ids.student]);
      chk('H-2 hasPro OFF once expired (data kept)', hp2 === false, hp2);
      const fl = await svc(`fn_mark_pro_order_failed('order_TESTB0000001')`, []);
      chk('X-1 payment.failed never downgrades a PAID order', fl.updated === 0, JSON.stringify(fl));
    });

    // ---------------- chunk 3: founding offer + library grants + unlimited
    await withLiveTransaction(c, async () => {
      await q(`update public.user_profiles set adult_confirmed_at = now() where id = any($1::uuid[])`, [[ids.student, ids.staff]]);
      await q(`update public.app_settings set founding_limit = 1`);
      const a = await svc(`fn_create_pro_order($1, 'PRO_12M_FOUNDING', 'k-founding-a-001')`, [ids.student]);
      await svc(`fn_attach_gateway_order($1, $2, 'order_TESTF0000001')`, [a.order_id, ids.student]);
      const fa = await svc(`fn_fulfil_pro_order('order_TESTF0000001', 'pay_TESTF1', 59900, 'INR', 'WEBHOOK')`, []);
      const [sold] = await q(`select sold from public.founding_offer`);
      const b = await svc(`fn_create_pro_order($1, 'PRO_12M_FOUNDING', 'k-founding-b-001')`, [ids.staff]);
      const renew = await svc(`fn_create_pro_order($1, 'PRO_12M_FOUNDING', 'k-founding-renew1')`, [ids.student]);
      chk('FO-1 founding: counted atomically at fulfil; at the limit a new buyer is REFUSED; a founding buyer can renew at ₹599', fa.success && fa.founding === true && sold.sold === 1 && b.code === 'FOUNDING_CLOSED' && renew.success && renew.amount_paise === 59900, JSON.stringify({ fa, sold, b, renew }));
      const g = await svc(`fn_grant_library_pro($1, now() + interval '30 days', $2)`, [ids.staff, ids.admin]);
      const h1 = await svc(`fn_has_pro($1)`, [ids.staff]);
      const rv = await svc(`fn_revoke_library_pro($1, $2)`, [g.entitlement_id, ids.admin]);
      const h2 = await svc(`fn_has_pro($1)`, [ids.staff]);
      const [kept] = await q(`select count(*)::int n from user_entitlements where id = $1`, [g.entitlement_id]);
      chk('L-1 library grant → hasPro ON; revoke → OFF (row kept, audited)', g.success && h1 === true && rv.success && h2 === false && kept.n === 1, JSON.stringify({ g, h1, rv, h2 }));
      await q(`insert into user_entitlements (user_id, entitlement_type, starts_at, expires_at, is_active, source) values ($1, 'PROMOTIONAL_PASS', now(), null, true, 'PROMO')`, [ids.staff]);
      const un = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-unlimited-0001')`, [ids.staff]);
      chk('U-1 an open-ended (unlimited) grant cannot buy', un.code === 'ALREADY_UNLIMITED', JSON.stringify(un));
      let rl = null; for (let i = 0; i < 6; i++) rl = await svc(`fn_create_pro_order($1, 'PRO_3M', $2)`, [ids.student, 'k-rate-limit-' + i]);
      chk('RL-1 more than 5 orders in 10 minutes → RATE_LIMITED', rl.code === 'RATE_LIMITED', JSON.stringify(rl));
      const rcpt = await as('authenticated', STU, `select count(*)::int n from public.payment_receipts`);
      const rcptOther = await as('authenticated', { sub: ids.staff, role: 'authenticated' }, `select count(*)::int n from public.payment_receipts where user_id = '${ids.student}'`);
      chk('RC-1 receipts: a student reads only their own', rcpt.ok && rcpt.rows[0].n === 1 && rcptOther.ok && rcptOther.rows[0].n === 0, JSON.stringify({ rcpt, rcptOther }));
    });

    // ---------------- chunk 4: concurrent client-verify + webhook → ONE fulfilment (per-user lock held by session A)
    await withLiveTransaction(c, async () => {
      await q(`update public.user_profiles set adult_confirmed_at = now() where id = $1`, [ids.student]);
      const o = await svc(`fn_create_pro_order($1, 'PRO_3M', 'k-race-order-0001')`, [ids.student]);
      await svc(`fn_attach_gateway_order($1, $2, 'order_TESTR0000001')`, [o.order_id, ids.student]);
      const fA = await svc(`fn_fulfil_pro_order('order_TESTR0000001', 'pay_TESTR1', 29900, 'INR', 'CLIENT_VERIFY')`, []);
      // session B (a second connection = the webhook arriving at the same moment) must NOT get the same user's fulfil lock
      const b = new Client(dbTarget().pg); b.on('error', () => {}); await b.connect();
      let got;
      try {
        await b.query(`BEGIN; ${LIVE_SAFETY_SQL}`);
        got = (await b.query(`select pg_try_advisory_xact_lock(hashtextextended('pro_entitlement:' || $1::text, 0)) g`, [ids.student])).rows[0].g;
      } finally { await b.query('ROLLBACK').catch(() => {}); await b.end().catch(() => {}); }
      const fB = await svc(`fn_fulfil_pro_order('order_TESTR0000001', 'pay_TESTR1', 29900, 'INR', 'WEBHOOK')`, []);
      const [n] = await q(`select count(*)::int e from user_entitlements where order_id = $1`, [o.order_id]);
      chk('RACE-1 while the client verify holds the fulfilment, a concurrent webhook cannot take the lock (waits); then it gets already_fulfilled → exactly ONE fulfilment',
        fA.success && got === false && fB.already_fulfilled === true && n.e === 1, JSON.stringify({ got, fB, n }));
      const uq = await as('service_role', SVC, `insert into public.user_entitlements (user_id, entitlement_type, order_id) values ($1, 'PRO_SUBSCRIPTION', $2)`, [ids.student, o.order_id]);
      chk('RACE-2 the database itself refuses a second entitlement for the same order (unique)', !uq.ok && uq.code === '23505', JSON.stringify(uq));
    });
  } catch (e) { ok = false; console.log('ERROR', e.code || '', String(e.message).slice(0, 300)); }
  finally {
    const [x] = await q(`select to_regclass('public.pro_plan_versions') is not null t, (select count(*)::int from payment_orders) o, (select count(*)::int from user_entitlements) e`).catch(() => [{}]);
    chk('Z-1 113 / 114 applied; every synthetic row rolled back (payment orders / entitlements unchanged)', x.t === true && x.o === base.o && x.e === base.e, JSON.stringify({ ...x, base }));
    await c.end().catch(() => {});
  }
  console.log(ok ? 'F9-PRICING: ALL PASS (rolled back)' : 'F9-PRICING: FAIL'); process.exit(ok ? 0 : 1);
})();
