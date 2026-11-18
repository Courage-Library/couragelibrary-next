#!/usr/bin/env node
/**
 * PAY-1 B6 refunds — offline gate (no network, no DB; owner F1–F8, locked D4–D7, 2026-11-19).
 *   B6-01 migration 151: 150 preflight; test_attempts.access_tier + an INVOKER BEFORE INSERT OR UPDATE trigger that sets it
 *         from fn_access_tier on insert and never rewrites it; pro_refund_approvals (reason allow-list, one OPEN approval
 *         per payment, RLS on, no policy, service_role SELECT / INSERT / UPDATE); fn_pro_refund_eligibility (INVOKER,
 *         STABLE, service_role): first purchase (F1 a), 7 days from the payment, ≤ 1 submitted PRO mock (D5) with the
 *         recorded tier else the current one (TIER_AT_CHECK_TIME, F6 b), a completed POLICY_7_DAY refund (F2 a), the
 *         latest period (D7), already refunded; fn_pro_refund_approve (INVOKER, service_role): POLICY_7_DAY only when
 *         eligible, audit row; fn_refund_pro_payment v3 (DEFINER, service_role, + p_gateway_mode): MODE_MISMATCH before
 *         any write in both branches, the Pro lock, the later-period shift (full + partial), the approval link /
 *         UNRECORDED, 149 money rules kept, no founding change; no BEGIN / COMMIT; proof
 *   B6-02 rollback 151: chain line; refuses while approvals exist; restores the EXACT 149 refund body (3 arguments,
 *         DEFINER, service_role only); drops the rest
 *   B6-03 the app: both refund calls pass the key mode; the admin action is ADMIN-only first, checks the reason allow-list
 *         and the payment id, needs a note for GOODWILL, calls fn_pro_refund_approve; /admin/payments is admin-only and
 *         shows the refund check; the service reads no name / e-mail; /billing marks refunded receipts from the user's
 *         own rows; the SECDEF allow-list follows the new signature
 *   B6-04 lib/payments/refund-rules.ts: reasons = the SQL list; every SQL reason / note has a label; lookup parsing;
 *         parseEligibility fails closed
 *   B6-05 negative controls: each mutation is caught
 * Run: node scripts/test_pay1_b6.cjs
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

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
const transpile = (src, filename) => ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function loadTs(rel, src) {
  const filename = path.join(ROOT, rel);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(transpile(src ?? read(rel), filename), filename);
  return m.exports;
}

const MIG = read('supabase/migrations/20261119000151_pay1_b6_refunds.sql');
const M149 = read('supabase/migrations/20261118000149_pay1_b4_payment_robustness.sql');
const RB = read('docs/database/rollback/151_rollback.sql');
const FLOWS = read('lib/payments/pro-flows.ts');
const ACTION = read('app/(site)/admin/payments/actions.ts');
const PAGE = read('app/(site)/admin/payments/page.tsx');
const SVC = read('services/admin-refunds.service.ts');
const BILLING = read('app/(site)/billing/page.tsx');
const PANEL = read('components/admin/refund-check.tsx');
const RULES_SRC = read('lib/payments/refund-rules.ts');
const ALLOW = read('scripts/secdef/allowlist.json');
const REASONS = ['POLICY_7_DAY', 'DOUBLE_CHARGE', 'NOT_ACTIVATED', 'FAILED_DEBITED', 'FEATURE_REMOVED', 'GOODWILL'];

const strip = (s) => s.replace(/--[^\n]*/g, '');
const fnBlock = (sql, name) => {
  const i = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`));
  if (i < 0) return '';
  const j = sql.indexOf('\n$$;', i);
  return sql.slice(i, j + 4);
};

function checkMigration(sqlRaw) {
  const s = strip(sqlRaw);
  assert(/WHERE filename = '20261118000150_pay1_b5_email_events\.sql' AND status = 'APPLIED'/.test(s), '150 preflight');
  assert(!/^\s*(BEGIN|COMMIT)\s*;/im.test(s), 'BEGIN / COMMIT');
  // 1. the tier column + trigger
  assert(/ALTER TABLE public\.test_attempts ADD COLUMN access_tier text CHECK \(access_tier IS NULL OR access_tier IN \('FREE', 'PRO'\)\);/.test(s), 'access_tier column');
  const trg = fnBlock(s, 'fn_test_attempt_access_tier');
  assert(trg && !/SECURITY DEFINER/.test(trg) && /SET search_path = ''/.test(trg), 'trigger function must be INVOKER with search_path ""');
  assert(/IF TG_OP = 'INSERT' THEN\s+NEW\.access_tier := CASE WHEN NEW\.mock_test_id IS NULL THEN NULL ELSE public\.fn_access_tier\('MOCK_TEST', NEW\.mock_test_id::text\) END;\s+ELSE\s+NEW\.access_tier := OLD\.access_tier;/.test(trg), 'trigger: set on insert from fn_access_tier, keep on update');
  assert(/CREATE TRIGGER trg_test_attempts_access_tier\s+BEFORE INSERT OR UPDATE ON public\.test_attempts/.test(s), 'trigger on insert + update');
  // 2. approvals
  assert(new RegExp(`reason\\s+text NOT NULL CHECK \\(reason IN \\(${REASONS.map((r) => `'${r}'`).join(', ')}\\)\\)`).test(s), 'reason allow-list');
  assert(/CREATE UNIQUE INDEX uq_pro_refund_approvals_open ON public\.pro_refund_approvals \(payment_id\) WHERE refund_id IS NULL;/.test(s), 'one open approval per payment');
  assert(/ALTER TABLE public\.pro_refund_approvals ENABLE ROW LEVEL SECURITY;/.test(s) && /REVOKE ALL ON TABLE public\.pro_refund_approvals FROM PUBLIC, anon, authenticated;/.test(s), 'approvals RLS / revoke');
  assert(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.pro_refund_approvals TO service_role;/.test(s) && !/CREATE POLICY/i.test(s), 'approvals grants / no policy');
  // 3. eligibility
  const el = fnBlock(s, 'fn_pro_refund_eligibility');
  assert(el && /STABLE/.test(el) && !/SECURITY DEFINER/.test(el), 'eligibility INVOKER STABLE');
  assert(/o2\.gateway_mode = v_order\.gateway_mode AND t2\.captured_at IS NOT NULL AND t2\.captured_at < v_txn\.captured_at/.test(el), 'F1 a: first purchase = no earlier applied Pro payment');
  assert(/v_within := pg_catalog\.now\(\) < v_txn\.captured_at \+ interval '7 days';/.test(el), '7 days from the payment');
  assert(/COALESCE\(a\.access_tier, public\.fn_access_tier\('MOCK_TEST', a\.mock_test_id::text\)\)/.test(el) && /a\.submitted_at IS NOT NULL OR a\.status IN \('submitted', 'auto_submitted'\)/.test(el) && /COALESCE\(a\.submitted_at, a\.updated_at\) >= v_txn\.captured_at/.test(el), 'D5 / F6 b: submitted Pro mocks since the payment, recorded tier first');
  assert(/IF v_mocks > 1 THEN v_reasons := v_reasons \|\| 'MORE_THAN_1_PRO_MOCK'/.test(el), '≤ 1 Pro mock');
  assert(/r\.reason = 'POLICY_7_DAY' AND r\.refund_id IS NOT NULL AND r\.order_id <> v_order\.id/.test(el), 'F2 a: a COMPLETED policy refund elsewhere');
  assert(/e2\.starts_at >= v_ent\.expires_at - interval '1 second'/.test(el) && /'NOT_LATEST_PERIOD'/.test(el), 'D7 latest period');
  assert(/IF v_fallback > 0 THEN v_notes := v_notes \|\| 'TIER_AT_CHECK_TIME'/.test(el), 'TIER_AT_CHECK_TIME note');
  assert(/'eligible', pg_catalog\.cardinality\(v_reasons\) = 0/.test(el), 'eligible = no reasons');
  for (const r of ['NOT_PAID', 'ALREADY_REFUNDED', 'NOT_FIRST_PURCHASE', 'OUTSIDE_7_DAYS', 'POLICY_REFUND_ALREADY_USED']) assert(el.includes(`'${r}'`), `reason ${r}`);
  // 4. approve
  const ap = fnBlock(s, 'fn_pro_refund_approve');
  assert(ap && !/SECURITY DEFINER/.test(ap), 'approve INVOKER');
  assert(/IF p_reason = 'POLICY_7_DAY' AND COALESCE\(\(v_elig ->> 'eligible'\)::boolean, false\) IS NOT TRUE THEN\s+RETURN jsonb_build_object\('success', false, 'code', 'NOT_ELIGIBLE'/.test(ap), 'POLICY_7_DAY only when eligible');
  assert(/ON CONFLICT \(payment_id\) WHERE refund_id IS NULL DO NOTHING/.test(ap) && /'ALREADY_APPROVED'/.test(ap) && /'PRO_REFUND_APPROVED'/.test(ap), 'one open approval + audit row');
  // 5. refund v3
  const rf = fnBlock(s, 'fn_refund_pro_payment');
  assert(/DROP FUNCTION public\.fn_refund_pro_payment\(text, integer, text\);/.test(s), 'old signature dropped');
  assert(/fn_refund_pro_payment\(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text, p_gateway_mode text DEFAULT 'live'\)/.test(rf) && /SECURITY DEFINER/.test(rf) && /SET search_path = ''/.test(rf), 'refund v3 signature / DEFINER / search_path');
  const mm = [...rf.matchAll(/'MODE_MISMATCH'/g)].length;
  assert(mm === 2, `MODE_MISMATCH in both branches (${mm})`);
  assert(rf.indexOf("'MODE_MISMATCH'") < rf.indexOf('INSERT INTO public.admin_audit_logs'), 'unapplied branch: mode check before the write');
  const applied = rf.slice(rf.indexOf('IF COALESCE(v_txn.gateway_response_json'));
  assert(applied.indexOf("'MODE_MISMATCH'") < applied.indexOf('UPDATE public.user_entitlements'), 'applied branch: mode check before any write');
  assert(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('pro_entitlement:' \|\| v_order\.user_id::text, 0\)\)/.test(rf), 'the Pro lock');
  assert(/v_shift := v_old_end - GREATEST\(v_ent\.starts_at, pg_catalog\.now\(\)\);/.test(rf) && /v_shift := pg_catalog\.make_interval\(days => v_days\);/.test(rf), 'shift: full (remaining time) and partial (days)');
  assert(/SET starts_at = e\.starts_at - v_shift, expires_at = e\.expires_at - v_shift/.test(rf) && /e\.starts_at >= v_old_end - interval '1 second'/.test(rf) && /e\.user_id = v_order\.user_id AND e\.id <> v_ent\.id/.test(rf), 'later periods of THIS user moved by the shift');
  assert(/v_kind := COALESCE\(v_kind, 'UNRECORDED'\);/.test(rf) && /'refund_kind', v_kind, 'approval_id', v_appr_id/.test(rf), 'approval link / UNRECORDED');
  assert(/IF COALESCE\(v_txn\.gateway_response_json -> 'refund_ids', '\[\]'::jsonb\) \? p_gateway_refund_id THEN\s+RETURN jsonb_build_object\('success', true, 'already_processed', true\);/.test(rf), 'idempotent per refund id');
  assert(/IF v_total > v_paid THEN\s+RETURN jsonb_build_object\('success', false, 'code', 'REFUND_EXCEEDS_PAYMENT'\);/.test(rf), 'refund > paid refused');
  assert(/floor\(EXTRACT\(EPOCH FROM \(v_ent\.expires_at - v_ent\.starts_at\)\) \/ 86400\.0 \* p_refund_amount_paise \/ v_paid\)::integer/.test(rf), 'pro-rata days as 149');
  assert(!/founding_offer/.test(rf), 'D6: the refund must not touch the founding seat');
  assert(/REVOKE ALL ON FUNCTION public\.fn_refund_pro_payment\(text, integer, text, text\) FROM PUBLIC, anon, authenticated;\s+GRANT EXECUTE ON FUNCTION public\.fn_refund_pro_payment\(text, integer, text, text\) TO service_role;/.test(s), 'refund grants');
  for (const sig of ['fn_pro_refund_eligibility(uuid)', 'fn_pro_refund_approve(text, text, text, uuid, text)']) {
    assert(s.includes(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`) && s.includes(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`), `grants ${sig}`);
  }
  assert(/DO \$proof\$[\s\S]*PAY1_B6_PROOF/.test(s), 'proof');
  return 'trigger, approvals, eligibility, approve, refund v3';
}

function checkRollback(rb) {
  assert(/^-- ROLLBACK-CHAIN: run first: none$/m.test(rb), 'chain line');
  assert(/IF EXISTS \(SELECT 1 FROM public\.pro_refund_approvals\) THEN\s+RAISE EXCEPTION 'ROLLBACK_151/.test(rb), 'refuses while approvals exist');
  const body149 = fnBlock(M149, 'fn_refund_pro_payment').replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION');
  assert(body149 && rb.includes(body149), 'the exact 149 refund body is not restored');
  assert(/GRANT EXECUTE ON FUNCTION public\.fn_refund_pro_payment\(text, integer, text\) TO service_role;/.test(rb) && /REVOKE ALL ON FUNCTION public\.fn_refund_pro_payment\(text, integer, text\) FROM PUBLIC, anon, authenticated;/.test(rb), '149 grants');
  for (const d of ['DROP FUNCTION public.fn_refund_pro_payment(text, integer, text, text);', 'DROP FUNCTION public.fn_pro_refund_approve(', 'DROP FUNCTION public.fn_pro_refund_eligibility(uuid);', 'DROP TABLE public.pro_refund_approvals;', 'DROP TRIGGER trg_test_attempts_access_tier', 'ALTER TABLE public.test_attempts DROP COLUMN access_tier;']) assert(rb.includes(d), `rollback misses: ${d}`);
}

function checkApp(flows, action, page, svc, billing, allow) {
  assert((flows.match(/fn_refund_pro_payment", \{[^}]*p_gateway_mode: deps\.mode \?\? "live" \}/g) || []).length === 2, 'both refund calls must pass the key mode');
  const body = action.slice(action.indexOf('export async function recordRefundApprovalAction'));
  assert(body.indexOf('guardAdminAction()') > 0 && body.indexOf('guardAdminAction()') < body.indexOf('.rpc("fn_pro_refund_approve"'), 'admin check before the write');
  assert(/if \(!PAYMENT_ID_RX\.test\(paymentId\) \|\| !isRefundReason\(payload\.reason\)\) return/.test(body), 'payment id / reason validated');
  assert(/payload\.reason === "GOODWILL" && note\.length < 5/.test(body), 'GOODWILL needs a note');
  assert(/p_admin_id: auth\.userId/.test(body), 'the admin id comes from the session, not the client');
  assert(/await requireAdminPage\(\{ path: "\/admin\/payments" \}\);/.test(page) && /<RefundCheckPanel check=\{refundCheck\} \/>/.test(page), 'admin page + panel');
  assert(!/\b(email|full_name|display_name|phone)\b/.test(svc.replace(/\/\*[\s\S]*?\*\//g, '')), 'the refund service must not read names / e-mails');
  assert(/admin\.rpc\("fn_pro_refund_eligibility"/.test(svc), 'eligibility from the database function');
  assert(/createServerSupabaseClient\(\)\)\.from\("payment_transactions"\)\.select\("id, refund_amount, status"\)/.test(billing) && /data-receipt-refunded=""/.test(billing), '/billing: refunded receipts from the user\'s own rows');
  assert(allow.includes('"fn_refund_pro_payment(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text, p_gateway_mode text)"') && !allow.includes('"fn_refund_pro_payment(p_payment_id text, p_refund_amount_paise integer, p_gateway_refund_id text)"'), 'SECDEF allow-list follows the new signature');
}

function checkRules(R, sql) {
  assert(JSON.stringify([...R.REFUND_REASONS]) === JSON.stringify(REASONS), 'app reasons = SQL reasons');
  for (const r of REASONS) assert(R.REFUND_REASON_LABEL[r], `label for ${r}`);
  const sqlReasons = [...new Set([...strip(fnBlock(sql, 'fn_pro_refund_eligibility')).matchAll(/v_reasons \|\| '([A-Z_0-9]+)'/g)].map((m) => m[1]))];
  for (const r of [...sqlReasons, 'ORDER_NOT_FOUND', 'UNAPPLIED_PAYMENT']) assert(R.ELIGIBILITY_REASON_LABEL[r], `no label for ${r}`);
  for (const n of ['TIER_AT_CHECK_TIME', 'TEST_MODE', 'FOUNDING_SEAT_STAYS_USED']) assert(R.ELIGIBILITY_NOTE_LABEL[n], `no label for note ${n}`);
  assert(R.parseLookup(' pay_ABC123xyz ').kind === 'payment' && R.parseLookup('cl-r-261119-ab12cd').value === 'CL-R-261119-AB12CD' && R.parseLookup("pay_x'; drop") === null && R.parseLookup('') === null, 'lookup parsing');
  const bad = R.parseEligibility({ eligible: true, reasons: ['OUTSIDE_7_DAYS'] });
  const junk = R.parseEligibility(null);
  const good = R.parseEligibility({ found: true, eligible: true, reasons: [] });
  assert(bad.eligible === false && junk.eligible === false && junk.reasons.length > 0 && good.eligible === true, 'parseEligibility fails closed');
  return `${sqlReasons.length} SQL reasons labelled`;
}

(async () => {
  const R = loadTs('lib/payments/refund-rules.ts');
  await test('B6-01 migration 151 (tier trigger, approvals, eligibility, approve, refund v3)', () => checkMigration(MIG));
  await test('B6-02 rollback 151 (exact 149 refund back)', () => checkRollback(RB));
  await test('B6-03 the app (mode, admin action, admin page, no personal data, /billing, allow-list)', () => checkApp(FLOWS, ACTION, PAGE, SVC, BILLING, ALLOW));
  await test('B6-04 refund-rules.ts (reasons = SQL, labels, lookup, fail closed)', () => checkRules(R, MIG));
  await test('B6-05 negative controls: each mutation is caught', async () => {
    const mut = (src, a, b) => { assert(src.includes(a), `mutation anchor missing: ${a.slice(0, 60)}`); return src.replace(a, b); };
    const cases = [
      ['trigger rewrites on update', () => checkMigration(mut(MIG, 'NEW.access_tier := OLD.access_tier;', 'NEW.access_tier := public.fn_access_tier(\'MOCK_TEST\', NEW.mock_test_id::text);'))],
      ['trigger SECURITY DEFINER', () => checkMigration(mut(MIG, "RETURNS trigger\nLANGUAGE plpgsql\nSET search_path = ''", "RETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = ''"))],
      ['no open-approval uniqueness', () => checkMigration(mut(MIG, 'CREATE UNIQUE INDEX uq_pro_refund_approvals_open', 'CREATE INDEX uq_pro_refund_approvals_open'))],
      ['approvals readable by clients', () => checkMigration(mut(MIG, 'REVOKE ALL ON TABLE public.pro_refund_approvals FROM PUBLIC, anon, authenticated;', 'GRANT SELECT ON TABLE public.pro_refund_approvals TO authenticated;'))],
      ['14-day window', () => checkMigration(mut(MIG, "v_within := pg_catalog.now() < v_txn.captured_at + interval '7 days';", "v_within := pg_catalog.now() < v_txn.captured_at + interval '14 days';"))],
      ['≤ 2 Pro mocks', () => checkMigration(mut(MIG, "IF v_mocks > 1 THEN", "IF v_mocks > 2 THEN"))],
      ['current tier only', () => checkMigration(mut(MIG, "COALESCE(a.access_tier, public.fn_access_tier('MOCK_TEST', a.mock_test_id::text)) AS tier", "public.fn_access_tier('MOCK_TEST', a.mock_test_id::text) AS tier"))],
      ['any approval counts as used', () => checkMigration(mut(MIG, "r.reason = 'POLICY_7_DAY' AND r.refund_id IS NOT NULL AND r.order_id <> v_order.id", "r.refund_id IS NOT NULL AND r.order_id <> v_order.id"))],
      ['policy approval without eligibility', () => checkMigration(mut(MIG, "IF p_reason = 'POLICY_7_DAY' AND COALESCE((v_elig ->> 'eligible')::boolean, false) IS NOT TRUE THEN", "IF false THEN"))],
      ['no mode check (applied)', () => checkMigration(mut(MIG, "    IF v_order.gateway_mode IS DISTINCT FROM p_gateway_mode THEN\n        RETURN jsonb_build_object('success', false, 'code', 'MODE_MISMATCH');\n    END IF;\n", ''))],
      ['no later-period shift', () => checkMigration(mut(MIG, 'SET starts_at = e.starts_at - v_shift, expires_at = e.expires_at - v_shift', 'SET updated_at = pg_catalog.now()'))],
      ['shift other users', () => checkMigration(mut(MIG, 'WHERE e.user_id = v_order.user_id AND e.id <> v_ent.id AND e.is_active', 'WHERE e.id <> v_ent.id AND e.is_active'))],
      ['refund frees the founding seat', () => checkMigration(mut(MIG, "        UPDATE public.payment_orders o SET status = 'REFUNDED', updated_at = pg_catalog.now() WHERE o.id = v_order.id;\n    END IF;\n\n    -- link", "        UPDATE public.payment_orders o SET status = 'REFUNDED', updated_at = pg_catalog.now() WHERE o.id = v_order.id;\n        UPDATE public.founding_offer f SET sold = f.sold - 1 WHERE v_order.founding;\n    END IF;\n\n    -- link"))],
      ['not idempotent', () => checkMigration(mut(MIG, "RETURN jsonb_build_object('success', true, 'already_processed', true);\n    END IF;\n    SELECT * INTO v_order", "NULL;\n    END IF;\n    SELECT * INTO v_order"))],
      ['rollback: 149 body altered', () => checkRollback(mut(RB, "'REFUND_EXCEEDS_PAYMENT'", "'REFUND_TOO_BIG'"))],
      ['rollback: no refusal', () => checkRollback(mut(RB, "IF EXISTS (SELECT 1 FROM public.pro_refund_approvals) THEN", "IF false THEN"))],
      ['app: webhook refund without mode', () => checkApp(mut(FLOWS, 'p_gateway_refund_id: ev.refundId, p_gateway_mode: deps.mode ?? "live" }', 'p_gateway_refund_id: ev.refundId }'), ACTION, PAGE, SVC, BILLING, ALLOW)],
      ['app: action without admin check', () => checkApp(FLOWS, mut(ACTION, '  const auth = await guardAdminAction();\n  if (!auth.ok) return auth;\n', '  const auth = { ok: true, userId: payload.paymentId, userEmail: "" };\n'), PAGE, SVC, BILLING, ALLOW)],
      ['app: admin id from the client', () => checkApp(FLOWS, mut(ACTION, 'p_admin_id: auth.userId', 'p_admin_id: (payload as { adminId?: string }).adminId'), PAGE, SVC, BILLING, ALLOW)],
      ['app: service reads e-mails', () => checkApp(FLOWS, ACTION, PAGE, SVC.replace('.select("order_id, receipt_number")', '.select("order_id, receipt_number, email")'), BILLING, ALLOW)],
      ['rules: a reason missing', () => checkRules({ ...loadTs('lib/payments/refund-rules.ts'), REFUND_REASONS: REASONS.slice(1) }, MIG)],
      ['rules: parse trusts eligible', () => checkRules(loadTs('lib/payments/refund-rules.ts', mut(RULES_SRC, 'const eligible = o.eligible === true && reasons.length === 0;', 'const eligible = o.eligible === true;')), MIG)],
    ];
    const missed = [];
    for (const [name, fn] of cases) {
      try { await fn(); missed.push(name); } catch (e) { if (/mutation anchor missing/.test(String(e.message))) missed.push(`${name}: ${e.message}`); }
    }
    assert(missed.length === 0, `not caught: ${missed.join(' | ')}`);
    return `${cases.length} mutations caught`;
  });
  console.log(results.join('\n'));
  console.log(`\nPAY1-B6: ${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
})();
