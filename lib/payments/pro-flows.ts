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
 */
import {
  checkPaymentAgainstOrder,
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
}

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
  input: { userId: string | null; planCode: unknown; idempotencyKey: unknown },
  deps: ProDeps,
): Promise<FlowResult<{ gatewayOrderId: string; amountPaise: number; currency: string; planCode: string }>> {
  if (!input.userId) return { ok: false, status: 401, code: "UNAUTHENTICATED" };
  if (!isProPlanCode(input.planCode) || !isIdempotencyKey(input.idempotencyKey)) return { ok: false, status: 400, code: "INVALID_INPUT" };

  const created = await deps.rpc("fn_create_pro_order", { p_user_id: input.userId, p_plan_code: input.planCode, p_idempotency_key: input.idempotencyKey });
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
async function fulfilChecked(order: ProOrderRow, payment: GatewayPayment, source: "CLIENT_VERIFY" | "WEBHOOK", deps: ProDeps, allowCapture: boolean): Promise<FlowResult<{ result: FulfilResult }>> {
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
    const rf = await deps.rpc("fn_refund_pro_payment", { p_payment_id: ev.paymentId, p_refund_amount_paise: ev.refundAmountPaise, p_gateway_refund_id: ev.refundId });
    const rr = obj(rf.data);
    if (rf.error || rr.success !== true) {
      const code = rf.error ? "DB_ERROR" : String(rr.code ?? "REFUND_REFUSED");
      deps.log({ fn: "handleWebhook", op: "fn_refund_pro_payment", code: rf.error?.code ?? code, ids: { payment_id: ev.paymentId, refund_id: ev.refundId } });
      await finish("FAILED", code);
      return { ok: false, status: rf.error ? 500 : 409, code };
    }
    await finish("PROCESSED");
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
