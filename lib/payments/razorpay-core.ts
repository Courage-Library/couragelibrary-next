/**
 * F9-B Razorpay core (pure: node:crypto + an injected fetch; no env, no clients, no "server-only" import so the offline
 * gate can load it). Secrets are passed in by the server wiring (lib/payments/pro-server.ts) and never logged.
 *   - checkout signature: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET), hex, constant-time compare
 *   - webhook signature:  HMAC-SHA256(raw body, WEBHOOK_SECRET), hex, constant-time compare (raw bytes, never re-serialised)
 *   - the payment fetched from the Razorpay API must match the order snapshot (order id, amount in paise, INR)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const HEX_SHA256 = /^[a-f0-9]{64}$/;
export const GATEWAY_ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
export const GATEWAY_PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
export const GATEWAY_REFUND_ID = /^rfnd_[A-Za-z0-9]{6,40}$/;
export const PRO_PLAN_CODES = ["PRO_3M", "PRO_6M", "PRO_12M", "PRO_12M_FOUNDING"] as const;
export type ProPlanCode = (typeof PRO_PLAN_CODES)[number];
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,80}$/;

export function isProPlanCode(v: unknown): v is ProPlanCode {
  return typeof v === "string" && (PRO_PLAN_CODES as readonly string[]).includes(v);
}

export function isIdempotencyKey(v: unknown): v is string {
  return typeof v === "string" && IDEMPOTENCY_KEY.test(v);
}

function hmacHex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time compare of two lowercase hex digests; anything malformed is a mismatch (never throws). */
function sameDigest(expected: string, received: unknown): boolean {
  if (typeof received !== "string" || !HEX_SHA256.test(received) || !HEX_SHA256.test(expected)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyCheckoutSignature(input: { orderId: unknown; paymentId: unknown; signature: unknown }, keySecret: string): boolean {
  if (!keySecret) return false;
  if (typeof input.orderId !== "string" || !GATEWAY_ORDER_ID.test(input.orderId)) return false;
  if (typeof input.paymentId !== "string" || !GATEWAY_PAYMENT_ID.test(input.paymentId)) return false;
  return sameDigest(hmacHex(keySecret, `${input.orderId}|${input.paymentId}`), input.signature);
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: unknown, webhookSecret: string): boolean {
  if (!webhookSecret || rawBody == null || rawBody.length === 0) return false;
  return sameDigest(hmacHex(webhookSecret, rawBody), signature);
}

/** The subset of a Razorpay payment entity we rely on. */
export interface GatewayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
}

export interface OrderSnapshot {
  gateway_order_id: string;
  amount_paise: number;
  currency: string;
}

export type PaymentCheck = { ok: true; needsCapture: boolean } | { ok: false; reason: "ORDER_MISMATCH" | "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH" | "NOT_PAID" };

/** The fetched payment must belong to this order and equal its snapshot. NULL / missing on either side = reject. */
export function checkPaymentAgainstOrder(payment: GatewayPayment | null, order: OrderSnapshot | null): PaymentCheck {
  if (!payment || !order) return { ok: false, reason: "ORDER_MISMATCH" };
  if (!payment.order_id || payment.order_id !== order.gateway_order_id) return { ok: false, reason: "ORDER_MISMATCH" };
  if (!Number.isInteger(payment.amount) || !Number.isInteger(order.amount_paise) || payment.amount !== order.amount_paise) return { ok: false, reason: "AMOUNT_MISMATCH" };
  if (payment.currency !== "INR" || order.currency !== "INR") return { ok: false, reason: "CURRENCY_MISMATCH" };
  if (payment.status === "captured") return { ok: true, needsCapture: false };
  if (payment.status === "authorized") return { ok: true, needsCapture: true };
  return { ok: false, reason: "NOT_PAID" };
}

export type WebhookKind = "PAID" | "FAILED" | "REFUND" | "IGNORED";
export interface ParsedWebhook {
  kind: WebhookKind;
  type: string;
  paymentId: string | null;
  orderId: string | null;
  refundId: string | null;
  refundAmountPaise: number | null;
}

/** Only ids / amounts are read from the (already signature-verified) body; the fulfil path re-fetches the payment. */
export function parseWebhook(body: unknown): ParsedWebhook | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: unknown; payload?: Record<string, { entity?: Record<string, unknown> }> };
  if (typeof b.event !== "string") return null;
  const pay = b.payload?.payment?.entity ?? null;
  const ref = b.payload?.refund?.entity ?? null;
  const str = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);
  const paymentId = str(pay?.id, GATEWAY_PAYMENT_ID) ?? str(ref?.payment_id, GATEWAY_PAYMENT_ID);
  const orderId = str(pay?.order_id, GATEWAY_ORDER_ID);
  const base = { type: b.event, paymentId, orderId, refundId: null, refundAmountPaise: null };
  if (b.event === "payment.captured" || b.event === "order.paid") return { ...base, kind: "PAID" };
  if (b.event === "payment.failed") return { ...base, kind: "FAILED" };
  if (b.event === "refund.processed") {
    const amt = ref?.amount;
    return { ...base, kind: "REFUND", refundId: str(ref?.id, GATEWAY_REFUND_ID), refundAmountPaise: Number.isInteger(amt) ? (amt as number) : null };
  }
  return { ...base, kind: "IGNORED" };
}

/** Minimal Razorpay REST client. Basic auth with the key id + secret; the secret never leaves the server. */
export interface RazorpayApi {
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string; amount: number; currency: string }>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  capturePayment(paymentId: string, amountPaise: number): Promise<GatewayPayment>;
}

export class RazorpayApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(`Razorpay API ${status} ${code}`);
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createRazorpayApi(cfg: { keyId: string; keySecret: string; fetch: FetchLike; baseUrl?: string }): RazorpayApi {
  const base = cfg.baseUrl ?? "https://api.razorpay.com/v1";
  const auth = "Basic " + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await cfg.fetch(`${base}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (!res.ok) throw new RazorpayApiError(res.status, String(json?.error?.code ?? "UNKNOWN"));
    return json as T;
  }
  const toPayment = (p: Record<string, unknown>): GatewayPayment => ({
    id: String(p.id ?? ""),
    order_id: typeof p.order_id === "string" ? p.order_id : null,
    amount: Number(p.amount),
    currency: String(p.currency ?? ""),
    status: String(p.status ?? ""),
  });
  return {
    async createOrder({ amountPaise, receipt, notes }) {
      const o = await call<{ id: string; amount: number; currency: string }>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes });
      if (!GATEWAY_ORDER_ID.test(o.id) || o.amount !== amountPaise || o.currency !== "INR") throw new RazorpayApiError(502, "ORDER_SHAPE");
      return o;
    },
    async fetchPayment(paymentId) {
      if (!GATEWAY_PAYMENT_ID.test(paymentId)) throw new RazorpayApiError(400, "BAD_PAYMENT_ID");
      return toPayment(await call<Record<string, unknown>>("GET", `/payments/${paymentId}`));
    },
    async capturePayment(paymentId, amountPaise) {
      if (!GATEWAY_PAYMENT_ID.test(paymentId)) throw new RazorpayApiError(400, "BAD_PAYMENT_ID");
      return toPayment(await call<Record<string, unknown>>("POST", `/payments/${paymentId}/capture`, { amount: amountPaise, currency: "INR" }));
    },
  };
}
