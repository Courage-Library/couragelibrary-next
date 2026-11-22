#!/usr/bin/env node
/**
 * PAY-1 B4 payment robustness — offline gate (no network, no DB; owner decisions R1–R4, 2026-11-18).
 *   B4-01 migration 149: 148 preflight; gateway_mode (default live, CHECK) + the job index; fn_create_pro_order (mode,
 *         TEST_MODE_QA_ONLY before anything else, no idempotency reuse across modes); fn_fulfil_pro_order (RECONCILE,
 *         MODE_MISMATCH, double charge / unfulfillable payment recorded once per payment, receipt retried ≤ 5 with
 *         attempt 0 = the old number); fn_refund_pro_payment acknowledges the refund of such a payment once; the lease
 *         table + INVOKER lease function, service_role only; the 114 money rules unchanged; no BEGIN / COMMIT; proof
 *   B4-02 rollback 149: chain line; the exact 114 bodies of the three functions with their 114 signatures and grants;
 *         drops the lease function / table, the index and the column
 *   B4-03 the REAL createRazorpayApi with a fake fetch: listOrderPayments (GET /orders/{id}/payments, Basic auth, oldest
 *         first, refuses a bad id before any call, a missing items list or another order's payment) + every
 *         classifyOrderPayments branch
 *   B4-04 reconcileOrder against a fake database that behaves like 149's fulfil: captured → fulfil (RECONCILE, the key
 *         mode) without a capture; authorized → the same checks FIRST, then capture, then fulfil (R2); a mismatched
 *         authorized payment is never captured; nothing paid → wait < 2 h, FAILED ≥ 2 h (PENDING only); a second captured
 *         payment → a double charge, Pro granted ONCE; a gateway error writes nothing; a second run changes nothing
 *   B4-05 runReconciliation: a held lease → "busy" with no read; the lease is released even when a step throws; the
 *         candidate window is 15 min .. 7 days in the key mode; refund replays: success → PROCESSED, PAYMENT_NOT_FOUND
 *         → waiting
 *   B4-06 test mode (G7): a non-QA user is refused (403 TEST_MODE_QA_ONLY) before any database or gateway call; a QA
 *         identity orders with p_gateway_mode test; live mode passes live
 *   B4-07 the route and the trigger: POST only; the ONLY auth is the CRON_SECRET bearer, compared in constant time over
 *         SHA-256 digests, before any read; closed checkout → skipped; the GitHub workflow only POSTs (secrets
 *         CRON_SECRET + RECONCILE_URL, no Razorpay value), is gated by PAYMENTS_RECONCILE_ENABLED, has no permissions and
 *         never prints the host (curl -s)
 *   B4-08 wiring: the server deps carry the key mode; the order action passes the e-mail; admin counts live orders only
 *         and lists the payments to refund (double charge / unfulfillable, refunded state)
 *   B4-09 negative controls: each mutation is caught
 * Run: node scripts/test_pay1_b4.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    const info = await fn();
    passed++;
    results.push(`  PASS  ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).slice(0, 900)}`);
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
const CORE = require(path.join(ROOT, 'lib/payments/razorpay-core.ts'));
const FLOWS = require(path.join(ROOT, 'lib/payments/pro-flows.ts'));

const MIG = read('supabase/migrations/20261118000149_pay1_b4_payment_robustness.sql');
const RB = read('docs/database/rollback/149_rollback.sql');
const M114 = read('supabase/migrations/20261026000114_f9_pricing_functions.sql');
const fnBlock = (sql, name) => {
  const m = sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`));
  if (!m) return '';
  const start = sql.indexOf('AS $$', m.index);
  return start < 0 ? '' : sql.slice(m.index, sql.indexOf('$$;', start + 5) + 3);
};
const bodyOf = (sql, name) => {
  const b = fnBlock(sql, name);
  return b ? b.slice(b.indexOf('AS $$')) : '';
};

// ---------------------------------------------------------------- static checks (functions of the texts)
function migrationCheck(sql) {
  const why = [];
  const code = sql.replace(/^--.*$/gm, '');
  if (!/WHERE filename = '20261118000148_pay1_cleanup\.sql' AND status = 'APPLIED'/.test(sql)) why.push('no 148 preflight');
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m.test(sql)) why.push('transaction control');
  if (!/ALTER TABLE public\.payment_orders ADD COLUMN gateway_mode text NOT NULL DEFAULT 'live' CHECK \(gateway_mode IN \('test', 'live'\)\);/.test(sql)) why.push('gateway_mode column');
  if (!/CREATE INDEX idx_po_pro_open_created ON public\.payment_orders \(gateway_mode, created_at\) WHERE order_type = 'PRO_PLAN' AND status IN \('PENDING', 'FAILED'\);/.test(sql)) why.push('job index');
  const cr = fnBlock(sql, 'fn_create_pro_order');
  if (!/^DROP FUNCTION public\.fn_create_pro_order\(uuid, text, text\);$/m.test(sql) || !/fn_create_pro_order\(p_user_id uuid, p_plan_code text, p_idempotency_key text, p_gateway_mode text DEFAULT 'live'\)/.test(cr)) why.push('create: signature');
  const qa = cr.indexOf("'TEST_MODE_QA_ONLY'");
  if (qa < 0 || !/p_gateway_mode = 'test' AND NOT EXISTS \(SELECT 1 FROM auth\.users u WHERE u\.id = p_user_id AND pg_catalog\.lower\(u\.email\) LIKE '%@courage-library\.test'\)/.test(cr)) why.push('create: QA-only test mode');
  if (qa > -1 && (qa > cr.indexOf("'AGE_REQUIRED'") || qa > cr.indexOf('INSERT INTO public.payment_orders'))) why.push('create: the QA check is not first');
  if (!/v_existing\.gateway_mode = p_gateway_mode THEN/.test(cr) || !/expires_at, gateway_mode\)/.test(cr) || !/'CREATED', v_key, pg_catalog\.now\(\) \+ interval '30 minutes', p_gateway_mode\)/.test(cr)) why.push('create: mode stored / idempotency per mode');
  const fu = fnBlock(sql, 'fn_fulfil_pro_order');
  if (!/^DROP FUNCTION public\.fn_fulfil_pro_order\(text, text, integer, text, text\);$/m.test(sql) || !/p_source text, p_gateway_mode text DEFAULT 'live'\)/.test(fu)) why.push('fulfil: signature');
  if (!/p_source NOT IN \('CLIENT_VERIFY', 'WEBHOOK', 'RECONCILE'\)/.test(fu)) why.push('fulfil: RECONCILE source');
  const mm = fu.indexOf("'MODE_MISMATCH'");
  if (!/IF v_order\.gateway_mode IS DISTINCT FROM p_gateway_mode THEN/.test(fu) || mm < 0 || mm > fu.indexOf('INSERT INTO public.payment_transactions') || mm > fu.indexOf("'PRO_DOUBLE_CHARGE'")) why.push('fulfil: mode check first');
  const paid = fu.slice(fu.indexOf("IF v_order.status = 'PAID' THEN"), fu.indexOf("IF v_order.status NOT IN ('CREATED', 'PENDING', 'FAILED') THEN"));
  if (!/'PRO_DOUBLE_CHARGE'/.test(paid) || !/WHERE NOT EXISTS \(SELECT 1 FROM public\.admin_audit_logs a WHERE a\.action_type = 'PRO_DOUBLE_CHARGE' AND a\.target_id = v_order\.id::text\s+AND a\.new_value ->> 'payment_id' = p_payment_id\)/.test(paid) || !/RETURN jsonb_build_object\('success', false, 'code', 'ORDER_ALREADY_PAID'\);/.test(paid) || /INSERT INTO public\.user_entitlements/.test(paid)) why.push('fulfil: double charge recorded once, no second Pro');
  if (!/'PRO_PAYMENT_TO_REFUND'/.test(fu)) why.push('fulfil: unfulfillable payment recorded');
  if (!/FOR v_try IN 0\.\.4 LOOP/.test(fu) || !/CASE WHEN v_try = 0 THEN '' ELSE ':' \|\| v_try::text END/.test(fu) || !/ON CONFLICT \(receipt_number\) DO NOTHING;/.test(fu) || !/RAISE EXCEPTION 'PRO_RECEIPT_NUMBER_EXHAUSTED'/.test(fu)) why.push('fulfil: receipt retry');
  // the 114 money rules kept verbatim
  for (const line of [
    "IF EXISTS (SELECT 1 FROM public.payment_transactions t WHERE t.gateway_payment_id = p_payment_id AND t.order_id <> v_order.id) THEN",
    "IF p_amount_paise IS DISTINCT FROM v_order.amount_paise OR p_currency IS DISTINCT FROM v_order.currency THEN",
    "v_start := GREATEST(pg_catalog.now(), COALESCE(v_end, pg_catalog.now()));",
    "PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro_entitlement:' || v_order.user_id::text, 0));",
    "SELECT * INTO v_order FROM public.payment_orders o WHERE o.gateway_order_id = p_gateway_order_id FOR UPDATE;",
  ]) if (!fu.includes(line) || !fnBlock(M114, 'fn_fulfil_pro_order').includes(line)) why.push(`fulfil: 114 rule lost: ${line.slice(0, 50)}`);
  const rf = fnBlock(sql, 'fn_refund_pro_payment');
  if (!/fn_refund_pro_payment\(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text\)/.test(rf) || !/'PRO_UNAPPLIED_PAYMENT_REFUNDED'/.test(rf)
    || !/WHERE NOT EXISTS \(SELECT 1 FROM public\.admin_audit_logs a WHERE a\.action_type = 'PRO_UNAPPLIED_PAYMENT_REFUNDED'\s+AND a\.new_value ->> 'refund_id' = p_gateway_refund_id\)/.test(rf)
    || !/a\.action_type IN \('PRO_DOUBLE_CHARGE', 'PRO_PAYMENT_TO_REFUND'\) AND a\.new_value ->> 'payment_id' = p_payment_id/.test(rf)) why.push('refund: unapplied payment acknowledged once');
  // the rest of the 114 refund body unchanged (from the transaction lookup on)
  const tail = (b) => b.slice(b.indexOf("IF COALESCE(v_txn.gateway_response_json -> 'refund_ids'"));
  if (!rf || tail(rf) !== tail(fnBlock(M114, 'fn_refund_pro_payment'))) why.push('refund: the 114 body changed');
  for (const f of ['fn_create_pro_order', 'fn_fulfil_pro_order', 'fn_refund_pro_payment']) if (!/^LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = ''$/m.test(fnBlock(sql, f))) why.push(`${f}: not DEFINER with search_path ''`);
  for (const sig of ['fn_create_pro_order(uuid, text, text, text)', 'fn_fulfil_pro_order(text, text, integer, text, text, text)', 'fn_payment_job_lease(text, uuid, integer)']) {
    if (!sql.includes(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)) why.push(`${sig}: not service_role only`);
  }
  const lease = fnBlock(sql, 'fn_payment_job_lease');
  if (!lease || /SECURITY DEFINER/.test(lease) || !/SET search_path = ''/.test(lease) || !/WHERE l\.lease_until <= pg_catalog\.now\(\) OR l\.holder = EXCLUDED\.holder;/.test(lease) || !/l\.job = p_job AND l\.holder = p_holder/.test(lease)) why.push('lease: INVOKER, expiry / holder rule, release by the holder only');
  if (!/ALTER TABLE public\.payment_job_leases ENABLE ROW LEVEL SECURITY;/.test(sql) || !/REVOKE ALL ON TABLE public\.payment_job_leases FROM PUBLIC, anon, authenticated;/.test(sql)) why.push('lease table: RLS / no client');
  if (/GRANT [^;]* TO [^;]*(anon|authenticated)/.test(code)) why.push('a client grant');
  if ((code.match(/SECURITY DEFINER/g) || []).length !== 3) why.push('exactly the three replaced functions are SECURITY DEFINER');
  if (!/PAY1_B4_PROOF/.test(sql)) why.push('no proof block');
  return why;
}
function rollbackCheck(rb) {
  const why = [];
  if (!/^-- ROLLBACK-CHAIN: run first: none$/m.test(rb)) why.push('no chain line');
  if (/^\s*(BEGIN|COMMIT)\s*;/m.test(rb)) why.push('transaction control');
  for (const f of ['fn_create_pro_order', 'fn_fulfil_pro_order', 'fn_refund_pro_payment']) {
    if (!bodyOf(rb, f) || bodyOf(rb, f) !== bodyOf(M114, f)) why.push(`${f}: not the 114 body`);
  }
  for (const s of ['DROP FUNCTION public.fn_create_pro_order(uuid, text, text, text);', 'DROP FUNCTION public.fn_fulfil_pro_order(text, text, integer, text, text, text);',
    'DROP FUNCTION public.fn_payment_job_lease(text, uuid, integer);', 'DROP TABLE public.payment_job_leases;', 'DROP INDEX public.idx_po_pro_open_created;',
    'ALTER TABLE public.payment_orders DROP COLUMN gateway_mode;']) if (!rb.includes(s)) why.push(`missing: ${s}`);
  for (const sig of ['fn_create_pro_order(uuid, text, text)', 'fn_fulfil_pro_order(text, text, integer, text, text)']) {
    if (!rb.includes(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`)) why.push(`${sig}: grants`);
  }
  if (!/refuses while a test-mode order exists|gateway_mode <> 'live'/.test(rb)) why.push('no refusal while test-mode orders exist');
  return why;
}

// ---------------------------------------------------------------- a fake world (database like 149 + gateway)
const USER = '11111111-1111-4111-8111-111111111111';
function world(opts = {}) {
  const mode = opts.mode ?? 'live';
  const calls = { rpc: [], list: 0, capture: [], lease: [], finish: [], logs: [], candidates: [], replays: 0 };
  const orders = {
    order_B4TEST000001: { id: 'o-1', user_id: USER, gateway_order_id: 'order_B4TEST000001', amount_paise: 29900, currency: 'INR', status: opts.status ?? 'PENDING', created_at: opts.createdAt ?? '2026-11-18T09:00:00Z', mode: opts.orderMode ?? 'live', paidWith: null },
  };
  const payments = opts.payments ?? [];
  const audit = [];
  let leaseHolder = opts.leaseHeld ? 'someone-else' : null;
  const deps = {
    mode,
    rpc: async (fn, args) => {
      calls.rpc.push({ fn, args });
      if (fn === 'fn_fulfil_pro_order') {
        const o = orders[args.p_gateway_order_id];
        if (!o) return { data: { success: false, code: 'ORDER_NOT_FOUND' }, error: null };
        if (o.mode !== args.p_gateway_mode) return { data: { success: false, code: 'MODE_MISMATCH' }, error: null };
        if (o.status === 'PAID') {
          if (o.paidWith === args.p_payment_id) return { data: { success: true, already_fulfilled: true, order_id: o.id }, error: null };
          if (!audit.some((a) => a.kind === 'PRO_DOUBLE_CHARGE' && a.payment === args.p_payment_id)) audit.push({ kind: 'PRO_DOUBLE_CHARGE', payment: args.p_payment_id });
          return { data: { success: false, code: 'ORDER_ALREADY_PAID' }, error: null };
        }
        if (args.p_amount_paise !== o.amount_paise) return { data: { success: false, code: 'AMOUNT_MISMATCH' }, error: null };
        o.status = 'PAID';
        o.paidWith = args.p_payment_id;
        audit.push({ kind: 'PRO_ORDER_FULFILLED', payment: args.p_payment_id });
        return { data: { success: true, already_fulfilled: false, order_id: o.id, receipt_number: 'CL-R-261118-ABC123' }, error: null };
      }
      if (fn === 'fn_mark_pro_order_failed') {
        const o = orders[args.p_gateway_order_id];
        if (o && (o.status === 'PENDING' || o.status === 'CREATED')) o.status = 'FAILED';
        return { data: { success: true, updated: 1 }, error: null };
      }
      if (fn === 'fn_refund_pro_payment') return opts.refund ? opts.refund(args) : { data: { success: true }, error: null };
      if (fn === 'fn_create_pro_order') return { data: { success: true, existing: false, order_id: 'o-9', amount_paise: 29900, plan_code: args.p_plan_code }, error: null };
      if (fn === 'fn_attach_gateway_order') return { data: { success: true }, error: null };
      return { data: { success: true }, error: null };
    },
    getOrderByGatewayId: async (id) => orders[id] || null,
    claimWebhookEvent: async () => 'NEW',
    finishWebhookEvent: async (id, status, code) => calls.finish.push([id, status, code]),
    api: {
      createOrder: async ({ amountPaise }) => ({ id: 'order_B4NEW0000001', amount: amountPaise, currency: 'INR' }),
      fetchPayment: async (id) => ({ ...payments.find((p) => p.id === id) }),
      capturePayment: async (id, amount) => {
        calls.capture.push([id, amount]);
        const p = payments.find((x) => x.id === id);
        p.status = 'captured';
        return { ...p };
      },
      listOrderPayments: async () => {
        calls.list++;
        if (opts.gatewayDown) throw new Error('Razorpay API 503 SERVER_ERROR');
        return payments.map((p) => ({ ...p }));
      },
    },
    keySecret: 'unit_test_key_secret_not_real',
    webhookSecret: 'unit_test_webhook_secret_not_real',
    log: (e) => calls.logs.push(e),
    acquireLease: async (holder) => {
      calls.lease.push(['acquire', holder]);
      if (leaseHolder && leaseHolder !== holder) return false;
      leaseHolder = holder;
      return true;
    },
    releaseLease: async (holder) => {
      calls.lease.push(['release', holder]);
      if (leaseHolder === holder) leaseHolder = null;
    },
    listCandidates: async (input) => {
      calls.candidates.push(input);
      if (opts.candidatesThrow) throw new Error('boom');
      return Object.values(orders).filter((o) => (o.status === 'PENDING' || o.status === 'FAILED') && o.mode === input.mode);
    },
    listRefundReplays: async () => {
      calls.replays++;
      return opts.replays ?? [];
    },
    now: () => new Date(opts.now ?? '2026-11-18T09:30:00Z'),
    newHolder: () => 'run-1',
  };
  return { deps, calls, orders, audit, payments };
}
const P = (id, status, over = {}) => ({ id, order_id: 'order_B4TEST000001', amount: 29900, currency: 'INR', status, ...over });
const fulfils = (calls) => calls.rpc.filter((c) => c.fn === 'fn_fulfil_pro_order');

// ---------------------------------------------------------------- the route / workflow / wiring texts
const ROUTE = read('app/api/cron/reconcile/route.ts');
const WF = read('.github/workflows/payments-reconcile.yml');
const SERVER = read('lib/payments/pro-server.ts');
const ACTION = read('app/(site)/pricing/actions.ts');
const ADMIN = read('services/admin.service.ts');
const BILL = read('components/admin/admin-billing-manager.tsx');
function routeCheck(src) {
  const why = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
  if (!/export async function POST\(/.test(code) || /export (async )?function (GET|PUT|PATCH|DELETE)\b|export const (GET|PUT|PATCH|DELETE)\b/.test(code)) why.push('POST only');
  if (!/const digest = \(s: string\) => createHash\("sha256"\)\.update\(s\)\.digest\(\);/.test(code) || !/timingSafeEqual\(digest\(req\.headers\.get\("authorization"\) \?\? ""\), digest\(`Bearer \$\{secret\}`\)\)/.test(code) || !/if \(secret\.length < 16\) return false;/.test(code)) why.push('constant-time digest compare of the bearer, secret ≥ 16');
  const post = code.slice(code.indexOf('export async function POST('));
  if (post.indexOf('if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });') < 0 || post.indexOf('authorized(req)') > post.indexOf('getReconcileDeps()')) why.push('401 before anything else');
  if (/searchParams|cookies\(|getServerSession|x-vercel|headers\.get\("(?!authorization)/.test(code)) why.push('another auth path');
  if (!/if \(!deps\) return NextResponse\.json\(\{ ok: true, skipped: "CHECKOUT_CLOSED" \}\);/.test(code)) why.push('closed checkout → skipped');
  return why;
}
function workflowCheck(y) {
  const why = [];
  if (/RAZORPAY_[A-Z_]+|rzp_(test|live)_/i.test(y)) why.push('a Razorpay key / secret name or value in GitHub');
  // DOMAIN-CUTOVER-2: the schedule runs only with the switch on; a manual probe runs only while it is off
  if (!y.includes("    if: vars.PAYMENTS_RECONCILE_ENABLED == 'true' || (github.event_name == 'workflow_dispatch' && inputs.probe && vars.PAYMENTS_RECONCILE_ENABLED != 'true')\n")) why.push('not gated by PAYMENTS_RECONCILE_ENABLED (or the probe is not dispatch-only / switch-off-only)');
  if (!/^permissions: \{\}$/m.test(y)) why.push('permissions not empty');
  if (!/curl -s -o body\.json -w '%\{http_code\}' --max-time 90 -X POST -H "Authorization: Bearer \$\{CRON_SECRET\}" "\$\{RECONCILE_URL\}"/.test(y) || /curl -sS|curl [^\n]*-v\b|set -x/.test(y)) why.push('POST with the bearer, silent (no host in errors)');
  if (!/CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/.test(y)) why.push('secrets');
  // DOMAIN-CUTOVER-2: the URL is a repository variable, pinned to the apex before the bearer is sent; CRON_SECRET is the only secret
  if (!/RECONCILE_URL: \$\{\{ vars\.RECONCILE_URL \}\}/.test(y)) why.push('RECONCILE_URL not read from vars');
  const secretNames = [...y.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
  if (!secretNames.every((n) => n === 'CRON_SECRET')) why.push(`other secrets: ${secretNames.join(',')}`);
  const pin = y.indexOf('if [ "${RECONCILE_URL}" != "https://couragelibrary.in/api/cron/reconcile" ]; then echo "RECONCILE_URL must be https://couragelibrary.in/api/cron/reconcile"; exit 1; fi');
  if (pin < 0 || pin > y.indexOf('code=$(curl')) why.push('RECONCILE_URL not pinned to the apex before the POST');
  if (!y.includes("PROBE: ${{ vars.PAYMENTS_RECONCILE_ENABLED != 'true' }}") || !/if \[ "\$\{PROBE\}" = "true" \]; then node -e '[^\n]*if\(!\(typeof b\.skipped==="string"&&b\.skipped\)\)\{[^\n]*process\.exit\(1\)/.test(y)) why.push('the probe does not fail on an answer other than skipped');
  if (!/- cron: "\*\/15 \* \* \* \*"/.test(y)) why.push('every 15 min');
  if (/uses: /.test(y)) why.push('no third-party action needed');
  return why;
}
function wiringCheck(server, action, admin, bill) {
  const why = [];
  if (!/mode: state\.mode, \/\/ PAY-1 B4/.test(server)) why.push('server deps: mode');
  if (!/\.eq\("gateway_mode", mode\)/.test(server) || !/\.in\("status", \["PENDING", "FAILED"\]\)/.test(server)) why.push('candidates: mode + open statuses');
  if (!/admin\.rpc\("fn_payment_job_lease", \{ p_job: RECONCILE_JOB, p_holder: holder, p_seconds: seconds \}\)/.test(server) || !/p_seconds: 0 \}/.test(server)) why.push('lease wiring');
  if (!/createProOrder\(\{ userId: session\.user\.id, email: session\.user\.email \?\? null, planCode, idempotencyKey \}, deps\)/.test(action)) why.push('the order action passes the e-mail');
  if (!/sb\.from\("payment_orders"\)\.select\("\*", \{ count: "exact", head: true \}\)\.eq\("gateway_mode", "live"\)/.test(admin)) why.push('admin order count: live only');
  if (!/\.in\("action_type", \["PRO_DOUBLE_CHARGE", "PRO_PAYMENT_TO_REFUND", "PRO_UNAPPLIED_PAYMENT_REFUNDED"\]\)/.test(admin)) why.push('admin: payments-to-refund read');
  if (!/data-payments-to-refund=""/.test(bill) || !/\{r\.refunded \? "REFUNDED" : "TO REFUND"\}/.test(bill) || !/o\.mode === "test" &&/.test(bill)) why.push('admin page: refund list + TEST label');
  return why;
}

(async () => {
  await test('B4-01 migration 149: preflight; gateway_mode + index; create (QA-only test mode first, mode per idempotency key); fulfil (RECONCILE, MODE_MISMATCH first, double charge / unfulfillable recorded once, receipt retry); refund acknowledges an unapplied payment once; lease table + INVOKER function; service_role only; 114 rules kept; proof', () => {
    const why = migrationCheck(MIG);
    assert(why.length === 0, why.join('; '));
  });
  await test('B4-02 rollback 149: chain line; the exact 114 bodies, signatures and grants; drops the lease function / table, index and column; refuses while a test-mode order exists', () => {
    const why = rollbackCheck(RB);
    assert(why.length === 0, why.join('; '));
  });

  await test('B4-03 the real createRazorpayApi with a fake fetch: listOrderPayments + classifyOrderPayments', async () => {
    const seen = [];
    const fake = (answer, status = 200) => async (url, init) => {
      seen.push({ url, init });
      return { ok: status < 300, status, json: async () => answer };
    };
    const api = (f) => CORE.createRazorpayApi({ keyId: 'rzp_test_unitkey', keySecret: 'unit_secret', fetch: f, baseUrl: 'https://gateway.invalid/v1' });
    const items = [P('pay_B4LATER0001', 'captured', { created_at: 200 }), P('pay_B4FIRST0001', 'failed', { created_at: 100 })];
    const got = await api(fake({ entity: 'collection', count: 2, items })).listOrderPayments('order_B4TEST000001');
    assert(seen[0].url === 'https://gateway.invalid/v1/orders/order_B4TEST000001/payments' && seen[0].init.method === 'GET', 'GET /orders/{id}/payments');
    assert(seen[0].init.headers.Authorization === 'Basic ' + Buffer.from('rzp_test_unitkey:unit_secret').toString('base64'), 'Basic auth');
    assert(got.map((p) => p.id).join() === 'pay_B4FIRST0001,pay_B4LATER0001', 'oldest first');
    const n = seen.length;
    let e1 = null;
    try { await api(fake({ items })).listOrderPayments('order_x; drop'); } catch (e) { e1 = e; }
    assert(e1 && e1.code === 'BAD_ORDER_ID' && seen.length === n, 'a bad id is refused before any call');
    let e2 = null;
    try { await api(fake({ count: 0 })).listOrderPayments('order_B4TEST000001'); } catch (e) { e2 = e; }
    assert(e2 && e2.code === 'PAYMENTS_SHAPE', 'no items list → shape error');
    let e3 = null;
    try { await api(fake({ items: [P('pay_B4OTHER00001', 'captured', { order_id: 'order_B4OTHER00001' })] })).listOrderPayments('order_B4TEST000001'); } catch (e) { e3 = e; }
    assert(e3 && e3.code === 'PAYMENTS_SHAPE', "another order's payment → shape error");
    let e4 = null;
    try { await api(fake({ error: { code: 'BAD_REQUEST_ERROR' } }, 400)).listOrderPayments('order_B4TEST000001'); } catch (e) { e4 = e; }
    assert(e4 && e4.status === 400, 'gateway error status kept');
    const snap = { gateway_order_id: 'order_B4TEST000001', amount_paise: 29900, currency: 'INR' };
    const c1 = CORE.classifyOrderPayments([P('pay_B4A000000001', 'failed'), P('pay_B4B000000001', 'captured'), P('pay_B4C000000001', 'captured')], snap);
    const c2 = CORE.classifyOrderPayments([P('pay_B4A000000001', 'authorized'), P('pay_B4B000000001', 'authorized')], snap);
    const c3 = CORE.classifyOrderPayments([P('pay_B4A000000001', 'captured', { amount: 100 }), P('pay_B4B000000001', 'refunded')], snap);
    const c4 = CORE.classifyOrderPayments([P('pay_B4A000000001', 'captured', { currency: 'USD' }), P('bogus', 'captured')], snap);
    assert(c1.kind === 'captured' && c1.first.id === 'pay_B4B000000001' && c1.extra.length === 1, 'captured: first + extra');
    assert(c2.kind === 'authorized' && c2.first.id === 'pay_B4A000000001', 'authorized: the first');
    assert(c3.kind === 'none' && c3.refunded === true, 'a wrong amount never counts; refunded seen');
    assert(c4.kind === 'none' && c4.refunded === false, 'a wrong currency / a malformed id never counts');
    return '5 list cases, 4 classes';
  });

  await test('B4-04 reconcileOrder: captured → fulfil once; authorized → checks, capture, fulfil (R2); mismatch never captured; wait / FAILED at 2 h; double charge → Pro once; gateway error writes nothing; second run idempotent', async () => {
    // captured
    let w = world({ payments: [P('pay_B4CAP0000001', 'captured')] });
    let r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'fulfilled' && w.calls.capture.length === 0 && fulfils(w.calls).length === 1 && fulfils(w.calls)[0].args.p_source === 'RECONCILE' && fulfils(w.calls)[0].args.p_gateway_mode === 'live', `captured: ${JSON.stringify(r)}`);
    const again = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(again.outcome === 'already_paid' && w.audit.filter((a) => a.kind === 'PRO_ORDER_FULFILLED').length === 1, 'second run: already paid, Pro once');
    // authorized → capture after the checks
    w = world({ payments: [P('pay_B4AUTH000001', 'authorized')] });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'captured_fulfilled' && w.calls.capture.length === 1 && w.calls.capture[0][1] === 29900 && fulfils(w.calls).length === 1, `authorized: ${JSON.stringify(r)}`);
    // a mismatched authorized payment: never captured, never fulfilled
    w = world({ payments: [P('pay_B4AUTH000002', 'authorized', { amount: 100 })], createdAt: '2026-11-18T09:00:00Z' });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(w.calls.capture.length === 0 && fulfils(w.calls).length === 0 && r.outcome === 'waiting', `mismatch: ${JSON.stringify(r)}`);
    // nothing paid: young → wait; old PENDING → FAILED; old FAILED → wait (never re-marked)
    w = world({ payments: [P('pay_B4FAIL000001', 'failed')], createdAt: '2026-11-18T08:00:00Z', now: '2026-11-18T09:59:00Z' });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'waiting' && !w.calls.rpc.length, `1 h 59 min: ${JSON.stringify(r)}`);
    w = world({ payments: [P('pay_B4FAIL000001', 'failed')], createdAt: '2026-11-18T08:00:00Z', now: '2026-11-18T10:00:00Z' });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'marked_failed' && w.orders.order_B4TEST000001.status === 'FAILED', `2 h: ${JSON.stringify(r)}`);
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'waiting' && w.calls.rpc.length === 1, 'a FAILED order is not re-marked');
    // FAILED, then the late payment appears → fulfilled
    w.payments.push(P('pay_B4LATE000001', 'captured'));
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'fulfilled' && w.orders.order_B4TEST000001.status === 'PAID', 'a late payment still fulfils a FAILED order');
    // double charge
    w = world({ payments: [P('pay_B4DBL0000001', 'captured'), P('pay_B4DBL0000002', 'captured')] });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    const r2 = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'fulfilled' && r.doubleCharges === 1 && w.audit.filter((a) => a.kind === 'PRO_ORDER_FULFILLED').length === 1 && w.audit.filter((a) => a.kind === 'PRO_DOUBLE_CHARGE').length === 1 && r2.outcome === 'already_paid', `double: ${JSON.stringify({ r, r2, audit: w.audit })}`);
    // gateway down
    w = world({ gatewayDown: true, createdAt: '2026-11-17T00:00:00Z' });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'gateway_error' && w.calls.rpc.length === 0 && w.orders.order_B4TEST000001.status === 'PENDING', 'gateway error: nothing written');
    // mode mismatch (a test key never fulfils a live order)
    w = world({ mode: 'test', payments: [P('pay_B4MODE000001', 'captured')] });
    r = await FLOWS.reconcileOrder(w.orders.order_B4TEST000001, w.deps);
    assert(r.outcome === 'refused' && r.code === 'MODE_MISMATCH' && w.orders.order_B4TEST000001.status === 'PENDING', `mode: ${JSON.stringify(r)}`);
    return '10 cases';
  });

  await test('B4-05 runReconciliation: busy lease → no read; lease released on a throw; window 15 min .. 7 days in the key mode; refund replays', async () => {
    let w = world({ leaseHeld: true, payments: [P('pay_B4CAP0000001', 'captured')] });
    let s = await FLOWS.runReconciliation(w.deps);
    assert(s.outcome === 'busy' && w.calls.candidates.length === 0 && w.calls.list === 0 && w.calls.rpc.length === 0, 'busy: nothing read');
    w = world({ candidatesThrow: true });
    let threw = false;
    try { await FLOWS.runReconciliation(w.deps); } catch { threw = true; }
    assert(threw && w.calls.lease.at(-1)[0] === 'release', 'released in finally');
    w = world({ mode: 'test', orderMode: 'test', payments: [P('pay_B4CAP0000001', 'captured')], now: '2026-11-18T09:30:00Z' });
    s = await FLOWS.runReconciliation(w.deps);
    const c = w.calls.candidates[0];
    assert(c.mode === 'test' && c.olderThan.toISOString() === '2026-11-18T09:15:00.000Z' && c.since.toISOString() === '2026-11-11T09:30:00.000Z' && c.limit === FLOWS.RECONCILE.batch, `window: ${JSON.stringify(c)}`);
    assert(s.outcome === 'done' && s.checked === 1 && s.counts.fulfilled === 1 && w.calls.lease.map((x) => x[0]).join() === 'acquire,release', `summary: ${JSON.stringify(s)}`);
    const ev = (id, pay) => ({ eventId: id, payload: { event: 'refund.processed', payload: { refund: { entity: { id: `rfnd_${id}0000`, payment_id: pay, amount: 29900 } } } } });
    w = world({
      replays: [ev('EVTA01', 'pay_B4KNOWN00001'), ev('EVTB01', 'pay_B4UNKNOWN0001')],
      refund: (a) => (a.p_payment_id === 'pay_B4KNOWN00001' ? { data: { success: true }, error: null } : { data: { success: false, code: 'PAYMENT_NOT_FOUND' }, error: null }),
    });
    s = await FLOWS.runReconciliation(w.deps);
    assert(s.refundsReplayed === 1 && s.refundsWaiting === 1 && w.calls.finish.length === 1 && w.calls.finish[0][0] === 'EVTA01' && w.calls.finish[0][1] === 'PROCESSED', `replays: ${JSON.stringify({ s, f: w.calls.finish })}`);
    assert(FLOWS.RECONCILE.checkAfterMinutes === 15 && FLOWS.RECONCILE.giveUpAfterMinutes === 120 && FLOWS.RECONCILE.lookBackDays === 7, 'R3 timings');
    return 'lease, window, replays';
  });

  await test('B4-06 test mode (G7): non-QA refused before any call; QA → p_gateway_mode test; live passes live', async () => {
    let w = world({ mode: 'test' });
    let r = await FLOWS.createProOrder({ userId: USER, email: 'someone@example.com', planCode: 'PRO_3M', idempotencyKey: 'key-b4-000001' }, w.deps);
    assert(!r.ok && r.status === 403 && r.code === 'TEST_MODE_QA_ONLY' && w.calls.rpc.length === 0, 'non-QA refused first');
    r = await FLOWS.createProOrder({ userId: USER, email: null, planCode: 'PRO_3M', idempotencyKey: 'key-b4-000002' }, w.deps);
    assert(!r.ok && r.code === 'TEST_MODE_QA_ONLY' && w.calls.rpc.length === 0, 'no e-mail refused');
    r = await FLOWS.createProOrder({ userId: USER, email: 'qa-student@courage-library.test', planCode: 'PRO_3M', idempotencyKey: 'key-b4-000003' }, w.deps);
    assert(r.ok && w.calls.rpc[0].args.p_gateway_mode === 'test', 'QA: test mode');
    w = world({ mode: 'live' });
    r = await FLOWS.createProOrder({ userId: USER, email: 'someone@example.com', planCode: 'PRO_3M', idempotencyKey: 'key-b4-000004' }, w.deps);
    assert(r.ok && w.calls.rpc[0].args.p_gateway_mode === 'live', 'live: anyone, live mode');
    delete w.deps.mode;
    r = await FLOWS.createProOrder({ userId: USER, planCode: 'PRO_3M', idempotencyKey: 'key-b4-000005' }, w.deps);
    assert(r.ok && w.calls.rpc.at(-2).args.p_gateway_mode === 'live', 'no mode = live (F9 behaviour)');
  });

  await test('B4-07 the route (POST only, CRON_SECRET bearer in constant time over digests, 401 first, closed → skipped) and the trigger workflow (POST only, gated, no Razorpay value, no permissions, silent curl)', () => {
    const why = [...routeCheck(ROUTE), ...workflowCheck(WF)];
    assert(why.length === 0, why.join('; '));
  });
  await test('B4-08 wiring: key mode on the server deps; e-mail into the order; candidates by mode; lease; admin live-only count + payments-to-refund list', () => {
    const why = wiringCheck(SERVER, ACTION, ADMIN, BILL);
    assert(why.length === 0, why.join('; '));
  });

  await test('B4-09 negative controls: each mutation is caught', () => {
    const muts = [
      ['QA check after the age check', () => migrationCheck(MIG.replace(/(    -- PAY-1 B4 \(G7\)[^\n]*\n    IF p_gateway_mode = 'test'[^\n]*\n        RETURN[^\n]*\n    END IF;\n)([\s\S]*?AGE_REQUIRED'\);\n    END IF;\n)/, '$2$1'))],
      ['no QA check', () => migrationCheck(MIG.replace("LIKE '%@courage-library.test'", "LIKE '%'"))],
      ['no mode check', () => migrationCheck(MIG.replace('IF v_order.gateway_mode IS DISTINCT FROM p_gateway_mode THEN', 'IF false THEN'))],
      ['double charge grants Pro', () => migrationCheck(MIG.replace("RETURN jsonb_build_object('success', false, 'code', 'ORDER_ALREADY_PAID');", "INSERT INTO public.user_entitlements (user_id) VALUES (v_order.user_id); RETURN jsonb_build_object('success', false, 'code', 'ORDER_ALREADY_PAID');"))],
      ['double charge recorded every time', () => migrationCheck(MIG.replace("WHERE NOT EXISTS (SELECT 1 FROM public.admin_audit_logs a WHERE a.action_type = 'PRO_DOUBLE_CHARGE'", "WHERE true OR NOT EXISTS (SELECT 1 FROM public.admin_audit_logs a WHERE a.action_type = 'PRO_DOUBLE_CHARGE'"))],
      ['no receipt retry', () => migrationCheck(MIG.replace('FOR v_try IN 0..4 LOOP', 'FOR v_try IN 0..0 LOOP'))],
      ['114 rule lost', () => migrationCheck(MIG.replace('IF p_amount_paise IS DISTINCT FROM v_order.amount_paise OR p_currency IS DISTINCT FROM v_order.currency THEN', 'IF false THEN'))],
      ['refund body changed', () => migrationCheck(MIG.replace("UPDATE public.payment_orders o SET status = 'REFUNDED', updated_at = pg_catalog.now() WHERE o.id = v_order.id;", 'NULL;'))],
      ['lease DEFINER', () => migrationCheck(MIG.replace("CREATE FUNCTION public.fn_payment_job_lease(p_job text, p_holder uuid, p_seconds integer)\nRETURNS boolean\nLANGUAGE plpgsql\n", "CREATE FUNCTION public.fn_payment_job_lease(p_job text, p_holder uuid, p_seconds integer)\nRETURNS boolean\nLANGUAGE plpgsql\nSECURITY DEFINER\n"))],
      ['lease steals a live lease', () => migrationCheck(MIG.replace('WHERE l.lease_until <= pg_catalog.now() OR l.holder = EXCLUDED.holder;', 'WHERE true;'))],
      ['lease table to authenticated', () => migrationCheck(MIG + '\nGRANT SELECT ON TABLE public.payment_job_leases TO authenticated;\n')],
      ['rollback body drift', () => rollbackCheck(RB.replace("RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');", "RETURN jsonb_build_object('success', false, 'code', 'RATE');"))],
      ['rollback keeps the column', () => rollbackCheck(RB.replace('ALTER TABLE public.payment_orders DROP COLUMN gateway_mode;', ''))],
      ['route GET', () => routeCheck(ROUTE + '\nexport async function GET() { return null; }\n')],
      ['route plain compare', () => routeCheck(ROUTE.replace('return timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));', 'return req.headers.get("authorization") === `Bearer ${secret}`;'))],
      ['route query-string auth', () => routeCheck(ROUTE.replace('if (secret.length < 16) return false;', 'if (secret.length < 16) return false;\n  if (req.nextUrl.searchParams.get("key") === secret) return true;'))],
      ['route reads before auth', () => routeCheck(ROUTE.replace('  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });\n  const deps = getReconcileDeps();', '  const deps = getReconcileDeps();\n  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });'))],
      ['workflow holds a key', () => workflowCheck(WF + '\n          RAZORPAY_KEY_SECRET: ${{ secrets.RAZORPAY_KEY_SECRET }}\n')],
      ['workflow ungated', () => workflowCheck(WF.replace(/    if: vars\.PAYMENTS_RECONCILE_ENABLED[^\n]*\n/, ''))],
      ['DC2 probe also on the schedule', () => workflowCheck(WF.replace("(github.event_name == 'workflow_dispatch' && inputs.probe && ", '(inputs.probe || '))],
      ['DC2 probe with the switch on', () => workflowCheck(WF.replace(" && vars.PAYMENTS_RECONCILE_ENABLED != 'true')", ')'))],
      ['DC2 URL from a secret', () => workflowCheck(WF.replace('RECONCILE_URL: ${{ vars.RECONCILE_URL }}', 'RECONCILE_URL: ${{ secrets.RECONCILE_URL }}'))],
      ['DC2 URL not pinned', () => workflowCheck(WF.replace(/          if \[ "\$\{RECONCILE_URL\}" != [^\n]*\n/, ''))],
      ['DC2 probe does not assert skipped', () => workflowCheck(WF.replace('process.exit(1)}console.log("PROBE PASS', '}console.log("PROBE PASS'))],
      ['workflow verbose curl', () => workflowCheck(WF.replace('curl -s -o body.json', 'curl -sS -o body.json'))],
      ['action drops the e-mail', () => wiringCheck(SERVER, ACTION.replace('email: session.user.email ?? null, ', ''), ADMIN, BILL)],
      ['admin counts test orders', () => wiringCheck(SERVER, ACTION, ADMIN.replace('.eq("gateway_mode", "live"),', ','), BILL)],
    ];
    const missed = muts.filter(([, f]) => f().length === 0).map(([n]) => n);
    assert(missed.length === 0, `not caught: ${missed.join(', ')}`);
    return `${muts.length} mutations caught`;
  });

  for (const l of results) console.log(l);
  console.log(`\nPAY-1 B4: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
