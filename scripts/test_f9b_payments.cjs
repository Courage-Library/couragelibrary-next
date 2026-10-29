#!/usr/bin/env node
/**
 * F9-B (architect GO, Razorpay TEST MODE ONLY) — offline gate. No network, no database: the gateway and the database
 * functions are mocked; the money rules inside the database (migration 114) are proven by the live smoke
 * scripts/live/test_f9_pricing.cjs (real roles, rolled back).
 *   PB-01 checkout opens only with PAYMENTS_ENABLED + PRO_ENABLED + 3 keys + a TEST key + the refund policy published
 *   PB-02 checkout signature: valid HMAC passes; tampered signature / swapped ids / wrong secret / malformed → rejected
 *   PB-03 webhook signature over the RAW body: one changed byte or a re-serialised body → rejected
 *   PB-04 client verify: tampered signature, another user's order, tampered amount / currency / order → NO fulfil;
 *         valid → fn_fulfil_pro_order once with the gateway's own values; authorized → captured first
 *   PB-05 webhook: bad signature / no event id → 400; a replayed event id → no second processing; a failed event is
 *         retried; amount mismatch → no fulfil; refund → fn_refund_pro_payment; failed → order FAILED only
 *   PB-06 race: client verify + webhook at once → ONE fulfilment, ONE receipt email
 *   PB-07 order: unauthenticated → nothing; double-click (same key) → ONE gateway order; price only from the server
 *   PB-08 routes: webhook reads the raw body and no session; verify needs a session; the legacy create-order endpoint
 *         is 410 and nothing calls fn_create_payment_order; secrets server-only (no NEXT_PUBLIC_RAZORPAY)
 *   PB-09 pricing (R4 / R11 / R12): payments-OFF view first; Pro view only with both flags; total, dates, "No
 *         auto-renew", Terms / Refund / Privacy links BEFORE paying; no countdown / strike-through / pre-tick / urgency
 *   PB-10 migrations: 113 revokes fn_create_payment_order from clients; every 114 function SECDEF, search_path '',
 *         REVOKE ALL FROM PUBLIC, anon, authenticated + service_role only; no BEGIN / COMMIT
 *   PB-11 hasPro: server-only, fails closed, the one fn_has_pro caller; library grants admin-only with an end date
 * Run: node scripts/test_f9b_payments.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    console.log(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || 'assertion failed');
};

const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(out.outputText, filename);
};
const CFG = require(path.join(ROOT, 'config/payments.ts'));
const CORE = require(path.join(ROOT, 'lib/payments/razorpay-core.ts'));
const FLOWS = require(path.join(ROOT, 'lib/payments/pro-flows.ts'));

// synthetic test-only values (never real keys)
const KEY_SECRET = 'unit_test_key_secret_not_real';
const WH_SECRET = 'unit_test_webhook_secret_not_real';
const sign = (o, p, secret = KEY_SECRET) => crypto.createHmac('sha256', secret).update(`${o}|${p}`).digest('hex');
const signBody = (raw, secret = WH_SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('hex');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** A mock world: one PRO order, a gateway, and a database whose fulfil is idempotent like fn_fulfil_pro_order. */
function world(over = {}) {
  const calls = { rpc: [], fetch: 0, capture: 0, createOrder: 0, claim: [], finish: [], logs: [], emails: 0 };
  const orders = { order_TESTA0000001: { id: 'o-1', user_id: USER, gateway_order_id: 'order_TESTA0000001', amount_paise: 29900, currency: 'INR', status: 'PENDING' } };
  const payments = { pay_TESTA1: { id: 'pay_TESTA1', order_id: 'order_TESTA0000001', amount: 29900, currency: 'INR', status: 'captured' }, ...(over.payments || {}) };
  const events = {};
  let fulfilled = null;
  const deps = {
    rpc: async (fn, args) => {
      calls.rpc.push({ fn, args });
      if (fn === 'fn_fulfil_pro_order') {
        await new Promise((r) => setTimeout(r, 5));
        if (fulfilled === args.p_payment_id) return { data: { success: true, already_fulfilled: true, order_id: 'o-1' }, error: null };
        fulfilled = args.p_payment_id;
        return { data: { success: true, already_fulfilled: false, order_id: 'o-1', receipt_number: 'CL-R-261026-ABC123', starts_at: 'x', expires_at: 'y' }, error: null };
      }
      if (fn === 'fn_create_pro_order') return over.createOrder ? over.createOrder(args) : { data: { success: true, existing: false, order_id: 'o-1', amount_paise: 29900, plan_code: args.p_plan_code }, error: null };
      if (fn === 'fn_attach_gateway_order') return { data: { success: true }, error: null };
      return { data: { success: true, updated: 1 }, error: null };
    },
    getOrderByGatewayId: async (id) => orders[id] || null,
    claimWebhookEvent: async ({ eventId }) => {
      calls.claim.push(eventId);
      const s = events[eventId];
      if (!s) {
        events[eventId] = 'PENDING';
        return 'NEW';
      }
      return s === 'PROCESSED' || s === 'IGNORED' ? 'DONE' : 'RETRY';
    },
    finishWebhookEvent: async (eventId, status, c) => {
      events[eventId] = status;
      calls.finish.push([eventId, status, c]);
    },
    api: {
      createOrder: async ({ amountPaise }) => {
        calls.createOrder++;
        return { id: 'order_TESTN000000' + calls.createOrder, amount: amountPaise, currency: 'INR' };
      },
      fetchPayment: async (id) => {
        calls.fetch++;
        if (!payments[id]) throw new Error('Razorpay API 404 BAD_REQUEST_ERROR');
        return { ...payments[id] };
      },
      capturePayment: async (id) => {
        calls.capture++;
        payments[id].status = 'captured';
        return { ...payments[id] };
      },
    },
    keySecret: KEY_SECRET,
    webhookSecret: WH_SECRET,
    log: (e) => calls.logs.push(e),
    afterFulfil: async () => {
      calls.emails++;
    },
  };
  return { deps, calls, events };
}
const fulfils = (calls) => calls.rpc.filter((c) => c.fn === 'fn_fulfil_pro_order');
const paidEvent = (paymentId = 'pay_TESTA1', event = 'payment.captured') =>
  JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: 'order_TESTA0000001', amount: 1, currency: 'INR' } } } });

(async () => {
  await test('PB-01 checkout opens only with both flags, 3 keys, a TEST key and the refund policy published', () => {
    const ok = { PAYMENTS_ENABLED: 'true', PRO_ENABLED: 'true', RAZORPAY_KEY_ID: 'rzp_test_AbCdEf123456', RAZORPAY_KEY_SECRET: 'x', RAZORPAY_WEBHOOK_SECRET: 'y' };
    const st = (env, pub = true) => CFG.checkoutState(env, pub);
    assert(st({ ...ok, PAYMENTS_ENABLED: 'TRUE' }).reason === 'PAYMENTS_OFF' && st({ ...ok, PRO_ENABLED: '1' }).reason === 'PRO_OFF', 'flags exact "true"');
    assert(st({ ...ok, RAZORPAY_WEBHOOK_SECRET: '' }).reason === 'KEYS_MISSING' && st({ ...ok, RAZORPAY_KEY_ID: 'abc' }).reason === 'KEYS_MISSING', 'keys');
    assert(st({ ...ok, RAZORPAY_KEY_ID: 'rzp_live_AbCdEf123456' }).reason === 'LIVE_KEY_NOT_APPROVED', 'a LIVE key is refused until F9-C');
    assert(st(ok, false).reason === 'REFUND_POLICY_MISSING' && st(ok).open === true && st(ok).mode === 'test', 'refund policy');
    assert(CFG.checkoutState(ok).open === CFG.REFUND_POLICY_PUBLISHED, 'default = the published constant');
    if (CFG.REFUND_POLICY_PUBLISHED) assert(fs.existsSync(path.join(ROOT, 'app/refund-policy/page.tsx')), 'REFUND_POLICY_PUBLISHED needs the page');
    assert(Object.values(CFG.CHECKOUT_CLOSED_MESSAGE).every((m) => /nothing to pay today/.test(m)), 'honest closed messages');
    return `refund policy published: ${CFG.REFUND_POLICY_PUBLISHED}`;
  });

  await test('PB-02 checkout HMAC: valid passes; tampered / swapped / wrong secret / malformed rejected', () => {
    const o = 'order_TESTA0000001';
    const p = 'pay_TESTA1';
    const good = sign(o, p);
    const v = (x) => CORE.verifyCheckoutSignature({ orderId: o, paymentId: p, signature: good, ...x }, KEY_SECRET);
    assert(v({}) === true, 'valid');
    const flipped = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
    assert(!v({ signature: flipped }) && !v({ signature: good.toUpperCase() }) && !v({ signature: good.slice(0, 63) }) && !v({ signature: null }) && !v({ signature: 'z'.repeat(64) }), 'tampered / malformed');
    assert(!v({ orderId: 'order_TESTB0000001' }) && !v({ paymentId: 'pay_TESTB1' }), 'swapped ids');
    assert(!CORE.verifyCheckoutSignature({ orderId: o, paymentId: p, signature: sign(o, p, 'other') }, KEY_SECRET) && !CORE.verifyCheckoutSignature({ orderId: o, paymentId: p, signature: good }, ''), 'wrong / empty secret');
    assert(/timingSafeEqual\(a, b\)/.test(read('lib/payments/razorpay-core.ts')), 'constant-time compare');
  });

  await test('PB-03 webhook HMAC over the RAW body', () => {
    const raw = paidEvent();
    assert(CORE.verifyWebhookSignature(raw, signBody(raw), WH_SECRET), 'valid');
    assert(!CORE.verifyWebhookSignature(raw.replace('29900', '29901').replace('"amount":1', '"amount":2'), signBody(raw), WH_SECRET), 'one changed byte');
    assert(!CORE.verifyWebhookSignature(JSON.stringify(JSON.parse(raw), null, 1), signBody(raw), WH_SECRET), 're-serialised body');
    assert(!CORE.verifyWebhookSignature(raw, undefined, WH_SECRET) && !CORE.verifyWebhookSignature('', signBody(''), WH_SECRET), 'missing signature / empty body');
  });

  await test('PB-04 client verify: no fulfil on any tamper; valid → ONE fulfil with the gateway values', async () => {
    const o = 'order_TESTA0000001';
    const run = async (input, w = world()) => ({ r: await FLOWS.verifyClientPayment({ userId: USER, orderId: o, paymentId: 'pay_TESTA1', signature: sign(o, 'pay_TESTA1'), ...input }, w.deps), w });
    let x = await run({ signature: sign(o, 'pay_TESTA1', 'attacker') });
    assert(!x.r.ok && x.r.code === 'SIGNATURE_INVALID' && x.w.calls.fetch === 0 && fulfils(x.w.calls).length === 0, 'tampered signature');
    x = await run({ userId: OTHER });
    assert(!x.r.ok && x.r.code === 'ORDER_NOT_FOUND' && fulfils(x.w.calls).length === 0, "another user's order");
    x = await run({ userId: null });
    assert(!x.r.ok && x.r.status === 401, 'unauthenticated');
    for (const [k, v, want] of [['amount', 100, 'AMOUNT_MISMATCH'], ['currency', 'USD', 'CURRENCY_MISMATCH'], ['order_id', 'order_TESTZ0000001', 'ORDER_MISMATCH'], ['status', 'failed', 'NOT_PAID']]) {
      const w = world({ payments: { pay_TESTA1: { id: 'pay_TESTA1', order_id: 'order_TESTA0000001', amount: 29900, currency: 'INR', status: 'captured', [k]: v } } });
      x = await run({}, w);
      assert(!x.r.ok && x.r.code === want && fulfils(w.calls).length === 0, `${k} tampered → ${x.r.code}`);
    }
    x = await run({});
    const f = fulfils(x.w.calls);
    assert(x.r.ok && f.length === 1 && f[0].args.p_amount_paise === 29900 && f[0].args.p_currency === 'INR' && f[0].args.p_source === 'CLIENT_VERIFY' && x.w.calls.emails === 1, 'valid');
    const w = world({ payments: { pay_TESTA1: { id: 'pay_TESTA1', order_id: 'order_TESTA0000001', amount: 29900, currency: 'INR', status: 'authorized' } } });
    x = await run({}, w);
    assert(x.r.ok && w.calls.capture === 1 && fulfils(w.calls).length === 1, 'authorized → captured, then fulfilled');
  });

  await test('PB-05 webhook: signature, event id, replay, retry, mismatch, refund, failed', async () => {
    const w = world();
    const raw = paidEvent();
    const hook = (input) => FLOWS.handleWebhook({ rawBody: raw, signature: signBody(raw), eventId: 'evt_TEST000001', ...input }, w.deps);
    let r = await hook({ signature: signBody(raw, 'attacker') });
    assert(!r.ok && r.status === 400 && w.calls.claim.length === 0, 'bad signature: nothing claimed');
    r = await hook({ eventId: null });
    assert(!r.ok && r.code === 'EVENT_ID_MISSING', 'event id required');
    r = await hook({});
    assert(r.ok && r.outcome === 'fulfilled' && fulfils(w.calls).length === 1 && fulfils(w.calls)[0].args.p_source === 'WEBHOOK', 'paid → fulfilled');
    r = await hook({});
    assert(r.ok && r.outcome === 'duplicate' && fulfils(w.calls).length === 1, 'replayed event id → not processed again');
    // a failed event is retried (Razorpay redelivers non-2xx)
    const w2 = world();
    w2.events.evt_TEST000002 = 'FAILED';
    r = await FLOWS.handleWebhook({ rawBody: raw, signature: signBody(raw), eventId: 'evt_TEST000002' }, w2.deps);
    assert(r.ok && r.outcome === 'fulfilled', 'FAILED event retried');
    // amount mismatch: the body is never trusted — the fetched payment differs from the snapshot
    const w3 = world({ payments: { pay_TESTA1: { id: 'pay_TESTA1', order_id: 'order_TESTA0000001', amount: 100, currency: 'INR', status: 'captured' } } });
    r = await FLOWS.handleWebhook({ rawBody: raw, signature: signBody(raw), eventId: 'evt_TEST000003' }, w3.deps);
    assert(!r.ok && r.code === 'AMOUNT_MISMATCH' && fulfils(w3.calls).length === 0 && w3.calls.finish.at(-1)[1] === 'FAILED', 'amount mismatch → no fulfil');
    const refund = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_TEST00001', payment_id: 'pay_TESTA1', amount: 14950 } } } });
    const w4 = world();
    r = await FLOWS.handleWebhook({ rawBody: refund, signature: signBody(refund), eventId: 'evt_TEST000004' }, w4.deps);
    const rc = w4.calls.rpc.find((c) => c.fn === 'fn_refund_pro_payment');
    assert(r.ok && rc && rc.args.p_payment_id === 'pay_TESTA1' && rc.args.p_refund_amount_paise === 14950 && rc.args.p_gateway_refund_id === 'rfnd_TEST00001', 'refund');
    const failedEv = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_TESTF1', order_id: 'order_TESTA0000001' } } } });
    r = await FLOWS.handleWebhook({ rawBody: failedEv, signature: signBody(failedEv), eventId: 'evt_TEST000005' }, w4.deps);
    assert(r.ok && w4.calls.rpc.some((c) => c.fn === 'fn_mark_pro_order_failed') && fulfils(w4.calls).length === 0, 'failed → order FAILED, no entitlement');
    const other = JSON.stringify({ event: 'subscription.charged', payload: {} });
    r = await FLOWS.handleWebhook({ rawBody: other, signature: signBody(other), eventId: 'evt_TEST000006' }, w4.deps);
    assert(r.ok && r.outcome === 'ignored', 'unknown events ignored');
  });

  await test('PB-06 race: client verify + webhook concurrently → ONE fulfilment, ONE receipt email', async () => {
    const w = world();
    const o = 'order_TESTA0000001';
    const raw = paidEvent();
    const [a, b] = await Promise.all([
      FLOWS.verifyClientPayment({ userId: USER, orderId: o, paymentId: 'pay_TESTA1', signature: sign(o, 'pay_TESTA1') }, w.deps),
      FLOWS.handleWebhook({ rawBody: raw, signature: signBody(raw), eventId: 'evt_TEST000010' }, w.deps),
    ]);
    const outcomes = [a.ok && !a.result.already_fulfilled ? 'fulfilled' : 'already', b.ok ? b.outcome : 'err'];
    assert(a.ok && b.ok && outcomes.filter((x) => x === 'fulfilled').length === 1 && w.calls.emails === 1, JSON.stringify(outcomes));
    // the double-click on Pay after success: the same payment again → already_fulfilled, no second email
    const again = await FLOWS.verifyClientPayment({ userId: USER, orderId: o, paymentId: 'pay_TESTA1', signature: sign(o, 'pay_TESTA1') }, w.deps);
    assert(again.ok && again.result.already_fulfilled === true && w.calls.emails === 1, 'replay');
  });

  await test('PB-07 order: auth, valid input, ONE gateway order per key, server price only', async () => {
    let w = world();
    let r = await FLOWS.createProOrder({ userId: null, planCode: 'PRO_3M', idempotencyKey: 'k12345678' }, w.deps);
    assert(!r.ok && r.status === 401 && w.calls.rpc.length === 0, 'unauthenticated → nothing');
    r = await FLOWS.createProOrder({ userId: USER, planCode: 'PRO_99M', idempotencyKey: 'k12345678' }, w.deps);
    assert(!r.ok && r.code === 'INVALID_INPUT' && w.calls.rpc.length === 0, 'unknown plan');
    let attached = null;
    w = world({
      createOrder: (args) =>
        attached
          ? { data: { success: true, existing: true, order_id: 'o-1', amount_paise: 29900, plan_code: args.p_plan_code, gateway_order_id: attached }, error: null }
          : { data: { success: true, existing: false, order_id: 'o-1', amount_paise: 29900, plan_code: args.p_plan_code }, error: null },
    });
    const first = await FLOWS.createProOrder({ userId: USER, planCode: 'PRO_3M', idempotencyKey: 'k12345678' }, w.deps);
    attached = first.gatewayOrderId;
    const second = await FLOWS.createProOrder({ userId: USER, planCode: 'PRO_3M', idempotencyKey: 'k12345678' }, w.deps);
    assert(first.ok && second.ok && second.gatewayOrderId === first.gatewayOrderId && w.calls.createOrder === 1 && first.amountPaise === 29900, 'double-click → one gateway order');
    w = world({ createOrder: () => ({ data: { success: false, code: 'AGE_REQUIRED' }, error: null }) });
    r = await FLOWS.createProOrder({ userId: USER, planCode: 'PRO_3M', idempotencyKey: 'k12345678' }, w.deps);
    assert(!r.ok && r.code === 'AGE_REQUIRED' && w.calls.createOrder === 0, 'under-18 (server) → no gateway order');
    const action = code(read('app/pricing/actions.ts'));
    assert(/export async function createProOrderAction\(planCode: string, idempotencyKey: string\)/.test(action) && !/amount/i.test(action.split('createProOrder({')[1].split('}')[0]), 'the client sends only plan code + key');
  });

  await test('PB-08 routes + secrets', () => {
    const wh = code(read('app/api/webhooks/razorpay/route.ts'));
    assert(/const rawBody = await request\.text\(\);/.test(wh) && !/request\.json\(\)|getServerSession|cookies\(/.test(wh), 'webhook: raw body, no session');
    const vr = code(read('app/api/payments/verify/route.ts'));
    assert(/getServerSession\(\)/.test(vr) && /session\.state !== "user"/.test(vr), 'verify needs a session');
    const legacy = code(read('app/api/billing/create-order/route.ts'));
    assert(/status: 410/.test(legacy) && !/BillingService|rpc/.test(legacy), 'legacy endpoint retired');
    const offenders = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${f.name}`;
        if (f.isDirectory()) { if (!/node_modules|\.next/.test(rel)) walk(rel); continue; }
        if (!/\.(ts|tsx)$/.test(f.name)) continue;
        const s = code(read(rel));
        if (/NEXT_PUBLIC_RAZORPAY/.test(s)) offenders.push(`${rel}: NEXT_PUBLIC_RAZORPAY`);
        if (/RAZORPAY_(KEY_SECRET|WEBHOOK_SECRET)/.test(s) && !['config/payments.ts', 'lib/payments/pro-server.ts'].includes(rel)) offenders.push(`${rel}: reads a Razorpay secret`);
        if (/createPaymentOrder\(|"fn_create_payment_order"/.test(s) && rel !== 'services/billing.service.ts') offenders.push(`${rel}: legacy order RPC`);
        if (/"use client"/.test(s) && /pro-server|process\.env/.test(s)) offenders.push(`${rel}: client reads server env / pro-server`);
      }
    };
    ['app', 'lib', 'services', 'components', 'config'].forEach(walk);
    assert(offenders.length === 0, offenders.join('; '));
  });

  await test('PB-09 pricing honesty (R4 / R11 / R12)', () => {
    const pc = read('app/pricing/pricing-client.tsx');
    const offIdx = pc.indexOf('if (!paymentsEnabled) return <PaymentsOffView');
    const proIdx = pc.indexOf('return <ProPricingView');
    assert(offIdx > 0 && proIdx > offIdx, 'OFF view returns first');
    const view = code(pc.slice(pc.indexOf('function ProPricingView('), pc.indexOf('// Features a free account can use today.')));
    for (const must of ['One-time payment. No auto-renew.', 'href={legal.terms}', 'href={legal.refund}', 'href={legal.privacy}', 'data-pro-summary', 'until {formatDateShort(end)}']) assert(view.includes(must), `missing: ${must}`);
    const ret = view.slice(view.lastIndexOf('  return ('));
    assert(ret.indexOf('data-pro-summary') > 0 && ret.indexOf('data-pro-summary') < ret.indexOf('{action}'), 'total + dates rendered before the Pay action');
    const banned = [/line-through/, /\bline-through\b|<s>|<del>/, /defaultChecked/, /countdown|setInterval/i, /hurry|limited time|only \d+ left|left at this price|most popular|ends soon|last chance/i, /\+\s*18%\s*GST/];
    const hits = banned.filter((rx) => rx.test(view)).map((rx) => rx.source);
    assert(hits.length === 0, hits.join(', '));
    assert((view.match(/<Button\b/g) || []).length === 2 && (view.match(/variant="secondary"|variant="ghost"/g) || []).length === 0, 'one Pay button (the disabled twin shows only when checkout is closed)');
    assert(!/size="md"|size="sm"/.test(view) && (view.match(/size="lg"/g) || []).length >= 4, 'R10: 48 px+ targets');
    const page = code(read('app/pricing/page.tsx'));
    assert(/if \(paymentsEnabled && isProEnabled\(\)\)/.test(page) && /isPaymentsEnabled\(\)/.test(page), 'Pro view only with both server flags');
    const banner = code(read('components/payments/pro-ending-banner.tsx'));
    assert(/does not renew automatically/.test(banner) && !/hurry|last chance|expires soon|!/.test(banner), 'expiry banner: plain facts');
  });

  await test('PB-10 migrations 113 / 114: grants, SECDEF, no transaction control', () => {
    const m113 = read('supabase/migrations/20261026000113_f9_pricing_schema.sql');
    const m114 = read('supabase/migrations/20261026000114_f9_pricing_functions.sql');
    assert(/REVOKE EXECUTE ON FUNCTION public\.fn_create_payment_order\(text, uuid, uuid, text, text, text\) FROM PUBLIC, anon, authenticated;/.test(m113), '113 revoke');
    assert(/REVOKE ALL ON public\.app_settings FROM PUBLIC, anon, authenticated;/.test(m113) && !/GRANT [A-Z, ]+ ON public\.app_settings TO (anon|authenticated)/.test(m113), 'settings server-only');
    const fns = [...m114.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    assert(fns.length === 8, `${fns.length} functions`);
    for (const f of fns) {
      const body = m114.slice(m114.indexOf(`FUNCTION public.${f}(`));
      assert(/SECURITY DEFINER\s*\nSET search_path = ''/.test(body.slice(0, 400)), `${f}: SECDEF + search_path ''`);
      assert(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(m114) && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role;`).test(m114), `${f}: service_role only`);
    }
    assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m113 + m114), 'no BEGIN / COMMIT');
    assert(/'PAYMENT_ID_REUSED'/.test(m114) && /'already_fulfilled', true/.test(m114) && /'AMOUNT_MISMATCH'/.test(m114) && /FOR UPDATE/.test(m114), 'the 106 rules in the one fulfil path');
    assert(fs.existsSync(path.join(ROOT, 'docs/database/rollback/113_rollback.sql')) && fs.existsSync(path.join(ROOT, 'docs/database/rollback/114_rollback.sql')), 'rollbacks');
  });

  await test('PB-11 hasPro server-only, fails closed; library grants admin-only with an end date', () => {
    const ps = read('lib/payments/pro-server.ts');
    assert(/^import "server-only";/.test(ps) && /if \(error\) \{\s*log\(\{ fn: "hasPro"[\s\S]*?return false;/.test(ps), 'server-only, fails closed');
    const callers = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${f.name}`;
        if (f.isDirectory()) { walk(rel); continue; }
        if (/\.(ts|tsx)$/.test(f.name) && /"fn_has_pro"/.test(read(rel))) callers.push(rel);
      }
    };
    ['app', 'lib', 'services', 'components'].forEach(walk);
    assert(callers.length === 1 && callers[0] === 'lib/payments/pro-server.ts', callers.join(', '));
    const la = code(read('app/admin/pro-library/actions.ts'));
    assert((la.match(/const auth = await guardAdminAction\(\);/g) || []).length === 2 && !/allowStaff/.test(la), 'admin only (not staff)');
    assert(/days <= 0 \|\| days > MAX_DAYS/.test(la), 'a grant always has a future end date');
    assert(/await requireAdminPage\(\{ path: "\/admin\/students\/library-pro" \}\);/.test(read('app/admin/students/library-pro/page.tsx')), 'page guard');
    assert(/source: "PROMO"/.test(read('services/admin-premium.service.ts')), 'admin promo passes are labelled PROMO, not PAYMENT');
  });

  console.log(`\nF9-B payments: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
