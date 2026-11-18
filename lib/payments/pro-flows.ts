/**
 * F9-B Pro payment flows (pure orchestration; every side effect is an injected dependency so the offline gate can drive
 * them with mocks). The database functions (migration 114, service role only) own the money rules: snapshot price,
 * idempotency, the ONE fulfil path, stacking, founding counter, refunds. This layer adds the gateway checks in front:
 *   order   — fn_create_pro_order (server price) → Razorpay order for exactly that amount → fn_attach_gateway_order
 *   verify  — checkout HMAC (constant-time) → the caller's own order → payment fetched from Razorpay must match the
 *             snapshot (order id, paise, INR, captured / authorized→capture) → fn_fulfil_pro_order(CLIENT_VERIFY)
 *   webhook — raw-body HMAC → event id claimed once (a failed event may be retried) → paid: the same fetch + snapshot
 *             check → fn_fulfil_pro_order(WEBHOOK); failed → fn_mark_pro_order_failed; refund → fn_refund_pro_payment
 * Any mismatch → no fulfil, a 400 and an ids-only log line. Prices never come from the client.
 * PAY-1 B4 (owner decisions R1–R4, 2026-11-18):
 *   mode      — every order carries the key mode (test / live); fulfil refuses another mode's order; test-mode orders
 *               only for QA identities (here, before any gateway call, and again in SQL)
 *   reconcile — the job (POST /api/cron/reconcile) reads the order's payments from Razorpay: captured → fulfil
 *               (RECONCILE); authorized → capture after the SAME checks as verify, then fulfil (R2); nothing paid after
 *               2 h → FAILED (a late payment still fulfils); a second captured payment → the database records a double
 *               charge for a dashboard refund (R4). Pro is granted at most once (fn_fulfil_pro_order: row lock, one
 *               entitlement per order). Runs never overlap (a lease row); every step is idempotent anyway.
 */
import { isQaIdentity } from "../qa/fixtures";
import {
  checkPaymentAgainstOrder,
  classifyOrderPayments,
  GATEWAY_ORDER_ID,
  isIdempotencyKey,
  isProPlanCode,
  parseWebhook,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type GatewayPayment,
  type RazorpayApi,
} from "./razorpay-core";

export type ProRpcName = "fn_create_pro_order" | "fn_attach_gateway_order" | "fn_fulfil_pro_order" | "fn_mark_pro_order_failed" | "fn_refund_pro_payment";

export interface ProOrderRow {
  id: string;
  user_id: string;
  gateway_order_id: string;
  amount_paise: number;
  currency: string;
  status: string;
}

export interface ProFlowLog {
  fn: string;
  op: string;
  code: string;
  ids: Record<string, string | null | undefined>;
}

export interface ProDeps {
  rpc(fn: ProRpcName, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }>;
  /** PRO_PLAN orders only. */
  getOrderByGatewayId(gatewayOrderId: string): Promise<ProOrderRow | null>;
  /** Claims a webhook event id: NEW (first time), RETRY (seen, not processed yet / failed), DONE (processed / ignored). */
  claimWebhookEvent(e: { eventId: string; type: string; payload: unknown }): Promise<"NEW" | "RETRY" | "DONE">;
  finishWebhookEvent(eventId: string, status: "PROCESSED" | "FAILED" | "IGNORED", code?: string): Promise<void>;
  api: RazorpayApi;
  keySecret: string;
  webhookSecret: string;
  log(entry: ProFlowLog): void;
  /** Receipt email etc. — runs after the DB commit; a failure here never undoes a payment. */
  afterFulfil?(result: FulfilResult): Promise<void>;
  /** PAY-1 B5: the refund confirmation e-mail — runs after the refund is recorded; a failure never undoes it. */
  afterRefund?(refundId: string): Promise<void>;
  /** PAY-1 B4: the key mode of this server (rzp_test_ → test). Absent = live (the F9 behaviour). */
  mode?: GatewayMode;
}

export type GatewayMode = "test" | "live";
export type FulfilSource = "CLIENT_VERIFY" | "WEBHOOK" | "RECONCILE";

export interface FulfilResult {
  success: boolean;
  already_fulfilled?: boolean;
  code?: string;
  order_id?: string;
  user_id?: string;
  receipt_number?: string;
  starts_at?: string;
  expires_at?: string;
  founding?: boolean;
}

export type FlowResult<T> = ({ ok: true } & T) | { ok: false; status: number; code: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// ------------------------------------------------------------------ order
export async function createProOrder(
  input: { userId: string | null; email?: string | null; planCode: unknown; idempotencyKey: unknown },
  deps: ProDeps,
): Promise<FlowResult<{ gatewayOrderId: string; amountPaise: number; currency: string; planCode: string }>> {
  if (!input.userId) return { ok: false, status: 401, code: "UNAUTHENTICATED" };
  if (!isProPlanCode(input.planCode) || !isIdempotencyKey(input.idempotencyKey)) return { ok: false, status: 400, code: "INVALID_INPUT" };
  const mode: GatewayMode = deps.mode ?? "live";
  // PAY-1 B4 (G7): test-mode checkout writes into the shared database — QA identities only (SQL checks it again)
  if (mode === "test" && !isQaIdentity(input.email)) return { ok: false, status: 403, code: "TEST_MODE_QA_ONLY" };

  const created = await deps.rpc("fn_create_pro_order", { p_user_id: input.userId, p_plan_code: input.planCode, p_idempotency_key: input.idempotencyKey, p_gateway_mode: mode });
  const r = obj(created.data);
  if (created.error || r.success !== true) {
    const code = created.error ? "DB_ERROR" : String(r.code ?? "ORDER_REFUSED");
    if (created.error) deps.log({ fn: "createProOrder", op: "fn_create_pro_order", code: created.error.code ?? "UNKNOWN", ids: { user_id: input.userId } });
    return { ok: false, status: code === "DB_ERROR" ? 500 : 409, code };
  }
  const orderId = String(r.order_id);
  const amountPaise = Number(r.amount_paise);
  const planCode = String(r.plan_code);
  // double-click: the same open order; reuse its gateway order when it already has one
  if (typeof r.gateway_order_id === "string" && GATEWAY_ORDER_ID.test(r.gateway_order_id)) {
    return { ok: true, gatewayOrderId: r.gateway_order_id, amountPaise, currency: "INR", planCode };
  }
  if (r.existing === true) return { ok: false, status: 409, code: "ORDER_IN_PROGRESS" };

  let gatewayOrderId: string;
  try {
    const g = await deps.api.createOrder({ amountPaise, receipt: orderId, notes: { order_id: orderId, plan_code: planCode } });
    gatewayOrderId = g.id;
  } catch (e) {
    deps.log({ fn: "createProOrder", op: "razorpay.createOrder", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { order_id: orderId } });
    return { ok: false, status: 502, code: "GATEWAY_UNAVAILABLE" };
  }
  const attached = await deps.rpc("fn_attach_gateway_order", { p_order_id: orderId, p_user_id: input.userId, p_gateway_order_id: gatewayOrderId });
  if (attached.error || obj(attached.data).success !== true) {
    deps.log({ fn: "createProOrder", op: "fn_attach_gateway_order", code: attached.error?.code ?? String(obj(attached.data).code ?? "NOT_ATTACHABLE"), ids: { order_id: orderId, gateway_order_id: gatewayOrderId } });
    return { ok: false, status: 409, code: "ORDER_IN_PROGRESS" };
  }
  return { ok: true, gatewayOrderId, amountPaise, currency: "INR", planCode };
}

// ------------------------------------------------------------------ fulfil (shared by verify + webhook)
async function fulfilChecked(order: ProOrderRow, payment: GatewayPayment, source: FulfilSource, deps: ProDeps, allowCapture: boolean): Promise<FlowResult<{ result: FulfilResult }>> {
  const check = checkPaymentAgainstOrder(payment, order);
  if (!check.ok) {
    deps.log({ fn: "fulfil", op: source, code: check.reason, ids: { order_id: order.id, gateway_order_id: order.gateway_order_id, payment_id: payment.id } });
    return { ok: false, status: 400, code: check.reason };
  }
  let paid = payment;
  if (check.needsCapture) {
    if (!allowCapture) return { ok: false, status: 202, code: "NOT_CAPTURED_YET" };
    try {
      paid = await deps.api.capturePayment(payment.id, order.amount_paise);
    } catch (e) {
      deps.log({ fn: "fulfil", op: "razorpay.capture", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { order_id: order.id, payment_id: payment.id } });
      return { ok: false, status: 502, code: "GATEWAY_UNAVAILABLE" };
    }
    const again = checkPaymentAgainstOrder(paid, order);
    if (!again.ok || again.needsCapture) return { ok: false, status: 400, code: again.ok ? "NOT_PAID" : again.reason };
  }
  const f = await deps.rpc("fn_fulfil_pro_order", {
    p_gateway_order_id: order.gateway_order_id,
    p_payment_id: paid.id,
    p_amount_paise: paid.amount,
    p_currency: paid.currency,
    p_source: source,
    p_gateway_mode: deps.mode ?? "live",
  });
  const r: FulfilResult = { success: false, ...obj(f.data) };
  if (f.error || r.success !== true) {
    const code = f.error ? "DB_ERROR" : String(r.code ?? "FULFIL_REFUSED");
    deps.log({ fn: "fulfil", op: "fn_fulfil_pro_order", code: f.error?.code ?? code, ids: { order_id: order.id, payment_id: paid.id } });
    return { ok: false, status: f.error ? 500 : 409, code };
  }
  if (!r.already_fulfilled && deps.afterFulfil) {
    try {
      await deps.afterFulfil(r);
    } catch (e) {
      deps.log({ fn: "fulfil", op: "afterFulfil", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { order_id: order.id } });
    }
  }
  return { ok: true, result: r };
}

async function runAfterRefund(deps: ProDeps, refundId: string): Promise<void> {
  if (!deps.afterRefund) return;
  try {
    await deps.afterRefund(refundId);
  } catch (e) {
    deps.log({ fn: "refund", op: "afterRefund", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { refund_id: refundId } });
  }
}

// ------------------------------------------------------------------ client verify
export async function verifyClientPayment(
  input: { userId: string | null; orderId: unknown; paymentId: unknown; signature: unknown },
  deps: ProDeps,
): Promise<FlowResult<{ result: FulfilResult }>> {
  if (!input.userId) return { ok: false, status: 401, code: "UNAUTHENTICATED" };
  if (!verifyCheckoutSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature }, deps.keySecret)) {
    deps.log({ fn: "verifyClientPayment", op: "signature", code: "SIGNATURE_INVALID", ids: { user_id: input.userId } });
    return { ok: false, status: 400, code: "SIGNATURE_INVALID" };
  }
  const order = await deps.getOrderByGatewayId(input.orderId as string);
  if (!order || order.user_id !== input.userId) return { ok: false, status: 404, code: "ORDER_NOT_FOUND" };
  let payment: GatewayPayment;
  try {
    payment = await deps.api.fetchPayment(input.paymentId as string);
  } catch (e) {
    deps.log({ fn: "verifyClientPayment", op: "razorpay.fetchPayment", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { order_id: order.id } });
    return { ok: false, status: 502, code: "GATEWAY_UNAVAILABLE" };
  }
  return fulfilChecked(order, payment, "CLIENT_VERIFY", deps, true);
}

// ------------------------------------------------------------------ webhook
export async function handleWebhook(
  input: { rawBody: string; signature: unknown; eventId: unknown },
  deps: ProDeps,
): Promise<FlowResult<{ outcome: string }>> {
  if (!verifyWebhookSignature(input.rawBody, input.signature, deps.webhookSecret)) {
    deps.log({ fn: "handleWebhook", op: "signature", code: "SIGNATURE_INVALID", ids: {} });
    return { ok: false, status: 400, code: "SIGNATURE_INVALID" };
  }
  if (typeof input.eventId !== "string" || !/^[A-Za-z0-9_-]{6,80}$/.test(input.eventId)) return { ok: false, status: 400, code: "EVENT_ID_MISSING" };
  let body: unknown;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 400, code: "BAD_JSON" };
  }
  const ev = parseWebhook(body);
  if (!ev) return { ok: false, status: 400, code: "BAD_EVENT" };

  const claim = await deps.claimWebhookEvent({ eventId: input.eventId, type: ev.type, payload: body });
  if (claim === "DONE") return { ok: true, outcome: "duplicate" };
  const finish = async (status: "PROCESSED" | "FAILED" | "IGNORED", code?: string) => deps.finishWebhookEvent(input.eventId as string, status, code);

  if (ev.kind === "IGNORED") {
    await finish("IGNORED");
    return { ok: true, outcome: "ignored" };
  }
  if (ev.kind === "FAILED") {
    if (!ev.orderId) {
      await finish("IGNORED", "NO_ORDER");
      return { ok: true, outcome: "ignored" };
    }
    const m = await deps.rpc("fn_mark_pro_order_failed", { p_gateway_order_id: ev.orderId });
    if (m.error) {
      await finish("FAILED", m.error.code ?? "DB_ERROR");
      return { ok: false, status: 500, code: "DB_ERROR" };
    }
    await finish("PROCESSED");
    return { ok: true, outcome: "failed_marked" };
  }
  if (ev.kind === "REFUND") {
    if (!ev.paymentId || !ev.refundId || !ev.refundAmountPaise) {
      await finish("FAILED", "BAD_REFUND");
      return { ok: false, status: 400, code: "BAD_REFUND" };
    }
    const rf = await deps.rpc("fn_refund_pro_payment", { p_payment_id: ev.paymentId, p_refund_amount_paise: ev.refundAmountPaise, p_gateway_refund_id: ev.refundId, p_gateway_mode: deps.mode ?? "live" });
    const rr = obj(rf.data);
    if (rf.error || rr.success !== true) {
      const code = rf.error ? "DB_ERROR" : String(rr.code ?? "REFUND_REFUSED");
      deps.log({ fn: "handleWebhook", op: "fn_refund_pro_payment", code: rf.error?.code ?? code, ids: { payment_id: ev.paymentId, refund_id: ev.refundId } });
      await finish("FAILED", code);
      return { ok: false, status: rf.error ? 500 : 409, code };
    }
    await finish("PROCESSED");
    if (rr.already_processed !== true) await runAfterRefund(deps, ev.refundId);
    return { ok: true, outcome: "refunded" };
  }

  // PAID: never trust the body for amounts — fetch the payment and check it against the order snapshot
  if (!ev.paymentId) {
    await finish("FAILED", "NO_PAYMENT");
    return { ok: false, status: 400, code: "NO_PAYMENT" };
  }
  let payment: GatewayPayment;
  try {
    payment = await deps.api.fetchPayment(ev.paymentId);
  } catch (e) {
    await finish("FAILED", "GATEWAY_UNAVAILABLE");
    deps.log({ fn: "handleWebhook", op: "razorpay.fetchPayment", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { payment_id: ev.paymentId } });
    return { ok: false, status: 502, code: "GATEWAY_UNAVAILABLE" };
  }
  const order = payment.order_id ? await deps.getOrderByGatewayId(payment.order_id) : null;
  if (!order) {
    await finish("IGNORED", "NOT_A_PRO_ORDER");
    return { ok: true, outcome: "ignored" };
  }
  const done = await fulfilChecked(order, payment, "WEBHOOK", deps, false);
  if (!done.ok) {
    await finish(done.status === 202 ? "IGNORED" : "FAILED", done.code);
    return done.status === 202 ? { ok: true, outcome: "not_captured_yet" } : done;
  }
  await finish("PROCESSED");
  return { ok: true, outcome: done.result.already_fulfilled ? "already_fulfilled" : "fulfilled" };
}

// ------------------------------------------------------------------ reconciliation (PAY-1 B4)
/** Owner R3: check orders older than 15 min, FAILED after 2 h with nothing paid, look back 7 days. */
export const RECONCILE = { checkAfterMinutes: 15, giveUpAfterMinutes: 120, lookBackDays: 7, batch: 20, leaseSeconds: 240 } as const; // batch 20: fits the 60 s function limit

export interface ReconcileOrderRow extends ProOrderRow {
  created_at: string;
}

export interface ReconcileDeps extends ProDeps {
  /** One run at a time: a lease row (job, holder, until). false = another run holds it. */
  acquireLease(holder: string, seconds: number): Promise<boolean>;
  releaseLease(holder: string): Promise<void>;
  /** PENDING / FAILED PRO orders of this mode with a gateway order, created in [since, olderThan), oldest first. */
  listCandidates(input: { mode: GatewayMode; olderThan: Date; since: Date; limit: number }): Promise<ReconcileOrderRow[]>;
  /** refund.processed events left FAILED with PAYMENT_NOT_FOUND (a refund that came before the fulfil). */
  listRefundReplays(input: { since: Date; limit: number }): Promise<Array<{ eventId: string; payload: unknown }>>;
  now(): Date;
  newHolder(): string;
}

export type ReconcileOutcome =
  | "fulfilled"
  | "already_paid"
  | "captured_fulfilled"
  | "marked_failed"
  | "waiting"
  | "gateway_error"
  | "refused";

export async function reconcileOrder(order: ReconcileOrderRow, deps: ReconcileDeps): Promise<{ outcome: ReconcileOutcome; doubleCharges: number; code?: string }> {
  let payments: GatewayPayment[];
  try {
    payments = await deps.api.listOrderPayments(order.gateway_order_id);
  } catch (e) {
    deps.log({ fn: "reconcileOrder", op: "razorpay.listOrderPayments", code: e instanceof Error ? e.message.slice(0, 60) : "UNKNOWN", ids: { order_id: order.id } });
    return { outcome: "gateway_error", doubleCharges: 0 };
  }
  const c = classifyOrderPayments(payments, order);
  if (c.kind === "captured") {
    const r = await fulfilChecked(order, c.first, "RECONCILE", deps, false);
    let doubleCharges = 0;
    // every further captured payment on this order: fn_fulfil_pro_order refuses it (ORDER_ALREADY_PAID) and records
    // PRO_DOUBLE_CHARGE once per payment for a dashboard refund (R4) — Pro is never granted twice
    for (const extra of c.extra) {
      const x = await fulfilChecked(order, extra, "RECONCILE", deps, false);
      if (!x.ok && x.code === "ORDER_ALREADY_PAID") doubleCharges++;
    }
    if (!r.ok) return { outcome: r.status === 502 ? "gateway_error" : "refused", doubleCharges, code: r.code };
    return { outcome: r.result.already_fulfilled ? "already_paid" : "fulfilled", doubleCharges };
  }
  if (c.kind === "authorized") {
    // R2: capture only after the SAME order / amount / currency checks as the verify step (fulfilChecked), then fulfil
    const r = await fulfilChecked(order, c.first, "RECONCILE", deps, true);
    if (!r.ok) return { outcome: r.status === 502 ? "gateway_error" : "refused", doubleCharges: 0, code: r.code };
    return { outcome: r.result.already_fulfilled ? "already_paid" : "captured_fulfilled", doubleCharges: 0 };
  }
  const ageMin = (deps.now().getTime() - new Date(order.created_at).getTime()) / 60000;
  if (order.status === "PENDING" && ageMin >= RECONCILE.giveUpAfterMinutes) {
    const m = await deps.rpc("fn_mark_pro_order_failed", { p_gateway_order_id: order.gateway_order_id });
    if (m.error) {
      deps.log({ fn: "reconcileOrder", op: "fn_mark_pro_order_failed", code: m.error.code ?? "DB_ERROR", ids: { order_id: order.id } });
      return { outcome: "refused", doubleCharges: 0, code: "DB_ERROR" };
    }
    return { outcome: "marked_failed", doubleCharges: 0 };
  }
  return { outcome: "waiting", doubleCharges: 0 };
}

export interface ReconcileSummary {
  outcome: "done" | "busy";
  checked: number;
  counts: Partial<Record<ReconcileOutcome, number>>;
  doubleCharges: number;
  refundsReplayed: number;
  refundsWaiting: number;
}

export async function runReconciliation(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const empty: ReconcileSummary = { outcome: "busy", checked: 0, counts: {}, doubleCharges: 0, refundsReplayed: 0, refundsWaiting: 0 };
  const holder = deps.newHolder();
  if (!(await deps.acquireLease(holder, RECONCILE.leaseSeconds))) return empty;
  const sum: ReconcileSummary = { ...empty, outcome: "done", counts: {} };
  try {
    const now = deps.now().getTime();
    const since = new Date(now - RECONCILE.lookBackDays * 86400e3);
    const orders = await deps.listCandidates({ mode: deps.mode ?? "live", olderThan: new Date(now - RECONCILE.checkAfterMinutes * 60e3), since, limit: RECONCILE.batch });
    for (const o of orders) {
      const r = await reconcileOrder(o, deps);
      sum.checked++;
      sum.counts[r.outcome] = (sum.counts[r.outcome] ?? 0) + 1;
      sum.doubleCharges += r.doubleCharges;
    }
    // a refund that arrived before the fulfil: replay it once its payment is recorded
    for (const ev of await deps.listRefundReplays({ since, limit: RECONCILE.batch })) {
      const p = parseWebhook(ev.payload);
      if (!p || p.kind !== "REFUND" || !p.paymentId || !p.refundId || !p.refundAmountPaise) continue;
      // fn_refund_pro_payment is idempotent per refund id; PAYMENT_NOT_FOUND = its payment is still not recorded → wait
      const rf = await deps.rpc("fn_refund_pro_payment", { p_payment_id: p.paymentId, p_refund_amount_paise: p.refundAmountPaise, p_gateway_refund_id: p.refundId, p_gateway_mode: deps.mode ?? "live" });
      if (!rf.error && obj(rf.data).success === true) {
        await deps.finishWebhookEvent(ev.eventId, "PROCESSED");
        sum.refundsReplayed++;
        if (obj(rf.data).already_processed !== true) await runAfterRefund(deps, p.refundId);
      } else if (!rf.error && obj(rf.data).code === "PAYMENT_NOT_FOUND") {
        sum.refundsWaiting++;
      } else {
        deps.log({ fn: "runReconciliation", op: "fn_refund_pro_payment", code: rf.error?.code ?? String(obj(rf.data).code ?? "REFUND_REFUSED"), ids: { payment_id: p.paymentId, refund_id: p.refundId } });
      }
    }
  } finally {
    await deps.releaseLease(holder);
  }
  return sum;
}
