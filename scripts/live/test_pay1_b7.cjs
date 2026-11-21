#!/usr/bin/env node
/**
 * PAY-1 B7 run sheet checker (owner H1–H7 + conditions, 2026-11-19): end-to-end with Razorpay TEST keys on the Vercel
 * Preview of the branch pay-b7-e2e, QA accounts only. The OWNER does every checkout / dashboard step; this script only
 * CHECKS, one step at a time:
 *   preflight  Preview reachable through the protection bypass; checkout open there with a TEST key only; the Preview
 *              webhook is configured (answers 400/401, not 503); S2 (rolled back): a test-mode order for a non-QA
 *              account → TEST_MODE_QA_ONLY; a snapshot of the QA accounts' test-mode state (ids / counts / dates only)
 *   s1         production, anonymous: /pricing shows no checkout and loads no Razorpay script; the production webhook
 *              answers 503 PAYMENTS_UNAVAILABLE (checkout closed)
 *   s3 s7 s4 s5 s6 s8 s9   the database state after each owner step (see the run sheet in PAY_1_DESIGN.md §15)
 *   status     the QA student's test-mode orders since the snapshot (order status, payment id, period) — what to refund
 *   reconcile  POST the Preview's reconcile route (CRON_SECRET of the Preview + the bypass header) — S6
 *   cleanup    after scripts/db/b7-cleanup.cjs: no test-mode Pro left active for any QA account
 * Reads only, except preflight's rolled-back S2 call. Writes nothing to the repo; the snapshot goes to the OS temp
 * folder. Never prints a secret, a host or an e-mail address (SAFE-NET). Production is only read anonymously.
 * .env.local (owner): B7_PREVIEW_URL (the branch alias), VERCEL_AUTOMATION_BYPASS_SECRET, B7_CRON_SECRET.
 * Usage: node scripts/live/test_pay1_b7.cjs <step>
 */
require('../db/safe-net.cjs'); // SAFE-NET
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');
const ROOT = path.resolve(__dirname, '..', '..');
const { dbTarget, redactor } = require(path.join(ROOT, 'scripts/db/_db-env.cjs'));
const { safeBegin, withLiveTransaction } = require(path.join(ROOT, 'scripts/db/live-safety.cjs'));

const STEP = process.argv[2] || '';
const STEPS = ['preflight', 's1', 's3', 's7', 's4', 's5', 's6', 's8', 's9', 'status', 'reconcile', 'cleanup'];
if (!STEPS.includes(STEP)) {
  console.log(`usage: node scripts/live/test_pay1_b7.cjs <${STEPS.join(' | ')}>`);
  process.exit(2);
}
const SNAP = path.join(os.tmpdir(), 'cl-b7-snapshot.json');
// DOMAIN-CUTOVER-1: production = B7_PROD_URL (https://couragelibrary.in after the cutover), else the vercel.app alias
const PROD = (process.env.B7_PROD_URL || 'https://couragelibrary-next.vercel.app').replace(/\/$/, '');
if (!/^https:\/\/(couragelibrary\.in|couragelibrary-next\.vercel\.app)$/.test(PROD)) throw new Error('B7_PROD_URL must be the production domain or the vercel.app alias');
const QA_STUDENT = 'qa-student@courage-library.test';
const DAY = 86400e3;

function envLocal(name) {
  if (process.env[name]) return process.env[name];
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return '';
  const m = fs.readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : '';
}
function previewBase() {
  const u = envLocal('B7_PREVIEW_URL').replace(/\/$/, '');
  let h;
  try { h = new URL(u); } catch { throw new Error('B7_PREVIEW_URL is not set in .env.local'); }
  if (h.protocol !== 'https:' || !/-git-pay-b7-e2e-[a-z0-9-]+\.vercel\.app$/.test(h.hostname)) throw new Error('B7_PREVIEW_URL must be the pay-b7-e2e branch alias on vercel.app');
  if (u.startsWith(PROD)) throw new Error('B7_PREVIEW_URL must not be production');
  return u;
}
const bypassHeaders = () => {
  const s = envLocal('VERCEL_AUTOMATION_BYPASS_SECRET');
  if (!s) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is not set in .env.local');
  return { 'x-vercel-protection-bypass': s };
};

let ok = true;
const chk = (n, cond, info) => {
  if (!cond) ok = false;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${n}${!cond && info ? ' — ' + String(info).slice(0, 600) : ''}`);
};
const loadSnap = () => (fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : null);
const saveSnap = (s) => fs.writeFileSync(SNAP, JSON.stringify(s, null, 2));

async function withDb(fn, { write = false } = {}) {
  const c = new Client(dbTarget().pg);
  c.on('error', () => {});
  await c.connect();
  try {
    if (write) return await withLiveTransaction(c, () => fn(c));
    await safeBegin(c, { readOnly: true });
    try { return await fn(c); } finally { await c.query('ROLLBACK').catch(() => {}); }
  } finally {
    await c.end().catch(() => {});
  }
}

// the QA student's test-mode orders since the snapshot, oldest first, with payment / period / refunds
async function orders(c, since) {
  return (await c.query(`
    select o.id, o.status, o.created_at, t.gateway_payment_id pay, t.captured_at, t.refund_amount, t.status tstatus,
           e.starts_at s, e.expires_at e, e.is_active a, e.revoked_at r, rc.receipt_number,
           (select a.new_value ->> 'source' from public.admin_audit_logs a where a.action_type = 'PRO_ORDER_FULFILLED' and a.target_id = o.id::text limit 1) source
      from public.payment_orders o
      join auth.users u on u.id = o.user_id and u.email = $1
      left join public.payment_transactions t on t.order_id = o.id
      left join public.user_entitlements e on e.order_id = o.id
      left join public.payment_receipts rc on rc.order_id = o.id
     where o.order_type = 'PRO_PLAN' and o.gateway_mode = 'test' and o.created_at > $2
     order by o.created_at`, [QA_STUDENT, since])).rows;
}
const paidOrders = (rows) => rows.filter((r) => r.captured_at);
const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—');

(async () => {
  const red = redactor(dbTarget());
  try {
    if (STEP === 's1') {
      const page = await fetch(`${PROD}/pricing`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
      const html = await page.text();
      chk('S1-1 production /pricing → 200, no Razorpay checkout script, no key id', page.status === 200 && !/checkout\.razorpay\.com/.test(html) && !/rzp_(test|live)_/.test(html), String(page.status));
      const wh = await fetch(`${PROD}/api/webhooks/razorpay`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000) });
      const j = await wh.json().catch(() => ({}));
      chk('S1-2 production webhook → 503 PAYMENTS_UNAVAILABLE (checkout closed on production)', wh.status === 503 && j.code === 'PAYMENTS_UNAVAILABLE', `${wh.status} ${j.code}`);
    } else if (STEP === 'preflight') {
      const base = previewBase();
      const page = await fetch(`${base}/pricing`, { headers: bypassHeaders(), signal: AbortSignal.timeout(60000) });
      const html = await page.text();
      chk('P-1 the Preview answers through the protection bypass (/pricing 200)', page.status === 200, String(page.status));
      chk('P-2 the Preview checkout is open with a TEST key only (rzp_test_ present, no rzp_live_)', /rzp_test_[A-Za-z0-9]{6,}/.test(html) && !/rzp_live_/.test(html));
      const wh = await fetch(`${base}/api/webhooks/razorpay`, { method: 'POST', body: '{}', headers: { ...bypassHeaders(), 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000) });
      chk('P-3 the Preview webhook is configured (an unsigned call → 400 / 401, not 503)', [400, 401].includes(wh.status), String(wh.status));
      await withDb(async (c) => {
        const [nonQa] = (await c.query(`select id from auth.users where lower(email) not like '%@courage-library.test' limit 1`)).rows;
        const r = (await c.query(`select public.fn_create_pro_order($1, 'PRO_3M', 'k-b7-s2-nonqa-01', 'test') r`, [nonQa ? nonQa.id : '00000000-0000-4000-8000-0000000000b7'])).rows[0].r;
        chk('S2 a test-mode order for a non-QA account → TEST_MODE_QA_ONLY (rolled back)', r.code === 'TEST_MODE_QA_ONLY', JSON.stringify(r));
      }, { write: true });
      await withDb(async (c) => {
        const [{ t }] = (await c.query('select now() t')).rows;
        const [{ n }] = (await c.query(`select count(*)::int n from public.user_entitlements e join public.payment_orders o on o.id = e.order_id
            where o.gateway_mode = 'test' and e.is_active and e.revoked_at is null`)).rows;
        saveSnap({ at: t, activeTestPro: n });
        chk(`P-4 snapshot taken (${fmt(t)}); active test-mode Pro before the run: ${n}`, true);
      });
    } else if (STEP === 'reconcile') {
      const base = previewBase();
      const secret = envLocal('B7_CRON_SECRET');
      if (!secret) throw new Error('B7_CRON_SECRET is not set in .env.local');
      const r = await fetch(`${base}/api/cron/reconcile`, { method: 'POST', headers: { ...bypassHeaders(), authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90000) });
      const j = await r.json().catch(() => ({}));
      chk('R the Preview reconcile route → 200 with counts', r.status === 200 && j.ok === true, `${r.status}`);
      console.log(`    counts only: ${JSON.stringify({ outcome: j.outcome, checked: j.checked, counts: j.counts })}`);
    } else {
      const snap = loadSnap();
      if (!snap) throw new Error('run "preflight" first (no snapshot)');
      await withDb(async (c) => {
        const rows = await orders(c, snap.at);
        const paid = paidOrders(rows);
        const [P1, P2, P3, P4] = paid;
        if (STEP === 'status') {
          for (const r of rows) console.log(`    ${fmt(r.created_at)} ${r.status.padEnd(8)} ${r.pay ?? '—'} ${r.receipt_number ?? ''} Pro ${fmt(r.s)} → ${fmt(r.e)}${r.r ? ' (revoked)' : ''}${Number(r.refund_amount) > 0 ? ` refunded ₹${r.refund_amount}` : ''}`);
          if (!rows.length) console.log('    no test-mode order since the snapshot');
          return;
        }
        if (STEP === 's3') {
          const ev = P1 ? (await c.query(`select processing_status s from public.payment_webhook_events where event_type in ('payment.captured', 'order.paid') and raw_payload::text like $1`, [`%${P1.pay}%`])).rows : [];
          chk('S3 the first test purchase: order PAID, one payment, Pro for 3 months, receipt CL-R-…, the paid webhook PROCESSED',
            paid.length === 1 && P1.status === 'PAID' && P1.a === true && Math.round((new Date(P1.e) - new Date(P1.s)) / DAY) >= 89 && Math.round((new Date(P1.e) - new Date(P1.s)) / DAY) <= 92
            && /^CL-R-/.test(P1.receipt_number || '') && ev.length >= 1 && ev.every((x) => x.s === 'PROCESSED'), JSON.stringify({ paid: paid.length, P1, ev }));
        }
        if (STEP === 's7') {
          const [ap] = P1 ? (await c.query(`select reason, refund_id from public.pro_refund_approvals where payment_id = $1`, [P1.pay])).rows : [];
          chk('S7 the 7-day refund: approval POLICY_7_DAY linked to the refund; order REFUNDED; Pro from it revoked',
            P1 && ap && ap.reason === 'POLICY_7_DAY' && ap.refund_id && P1.status === 'REFUNDED' && P1.a === false, JSON.stringify({ P1, ap }));
        }
        if (STEP === 's4') {
          chk('S4 two more purchases: both PAID; the second starts where the first ends (stacked)',
            paid.length === 3 && P2.status === 'PAID' && P3.status === 'PAID' && Math.abs(new Date(P3.s) - new Date(P2.e)) < 5000, JSON.stringify({ P2, P3 }));
        }
        if (STEP === 's5') {
          const failed = rows.filter((r) => r.status === 'FAILED');
          chk('S5 the failed payment: one order FAILED, no Pro from it', failed.length >= 1 && failed.every((r) => !r.s), JSON.stringify(failed));
        }
        if (STEP === 's6') {
          chk('S6 the closed tab: the purchase is PAID once (by the webhook or the reconcile job), stacked after the previous one',
            paid.length === 4 && P4.status === 'PAID' && ['WEBHOOK', 'RECONCILE'].includes(P4.source) && Math.abs(new Date(P4.s) - new Date(P3.e)) < 5000, JSON.stringify({ P4 }));
          saveSnap({ ...snap, beforeS8: paid.map((r) => ({ pay: r.pay, s: r.s, e: r.e })) });
        }
        if (STEP === 's8') {
          const before = snap.beforeS8;
          if (!before) throw new Error('run "s6" first');
          const b2 = before.find((x) => x.pay === P2.pay);
          const b3 = before.find((x) => x.pay === P3.pay);
          const b4 = before.find((x) => x.pay === P4.pay);
          const cut = new Date(b2.e) - new Date(P2.e);
          const [ap] = (await c.query(`select reason, refund_id from public.pro_refund_approvals where payment_id = $1`, [P2.pay])).rows;
          chk('S8 the partial GOODWILL refund of the 2nd purchase: whole days off its end; the 3rd and 4th move earlier by the same time; the approval is linked',
            ap && ap.reason === 'GOODWILL' && ap.refund_id && Number(P2.refund_amount) > 0 && P2.a === true && cut > 0 && cut % DAY === 0
            && new Date(b3.s) - new Date(P3.s) === cut && new Date(b4.e) - new Date(P4.e) === cut, JSON.stringify({ cut, ap, P2, P3, P4 }));
          saveSnap({ ...snap, afterS8: JSON.stringify(rows) });
        }
        if (STEP === 's9') {
          chk('S9 the webhook resend changed nothing (orders, payments, periods, refunds identical to after S8)', snap.afterS8 && snap.afterS8 === JSON.stringify(rows), 'state differs from after S8');
        }
        if (STEP === 'cleanup') {
          const [{ n }] = (await c.query(`select count(*)::int n from public.user_entitlements e join public.payment_orders o on o.id = e.order_id
              join auth.users u on u.id = e.user_id where o.gateway_mode = 'test' and e.is_active and e.revoked_at is null`)).rows;
          chk('C no test-mode Pro is left active for any account', n === 0, `${n} active`);
        }
      });
    }
  } catch (e) {
    chk(`${STEP} ran to the end`, false, red(String(e && e.message ? e.message : e)));
  }
  console.log(`PAY-1 B7 ${STEP}: ${ok ? 'ALL PASS' : 'FAILURES'}`);
  process.exit(ok ? 0 : 1);
})();
