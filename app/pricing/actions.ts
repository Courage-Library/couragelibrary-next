"use server";

import { getServerSession } from "@/lib/auth/session";
import { getProDeps } from "@/lib/payments/pro-server";
import { createProOrder } from "@/lib/payments/pro-flows";
import { checkoutState } from "@/config/payments";

export type CreateProOrderResult =
  | { ok: true; keyId: string; gatewayOrderId: string; amountPaise: number; currency: string; planCode: string }
  | { ok: false; code: string };

/**
 * F9-B: create a Pro order. Auth required; 18+, the price, the founding limit, the rate limit and double-click
 * idempotency are enforced by fn_create_pro_order (service role) — the client sends only the plan code and its key.
 */
export async function createProOrderAction(planCode: string, idempotencyKey: string): Promise<CreateProOrderResult> {
  const state = checkoutState();
  const deps = getProDeps();
  if (!state.open || !deps) return { ok: false, code: state.open ? "PAYMENTS_UNAVAILABLE" : state.reason };
  const session = await getServerSession();
  if (session.state !== "user") return { ok: false, code: session.state === "error" ? "SESSION_UNAVAILABLE" : "UNAUTHENTICATED" };
  const r = await createProOrder({ userId: session.user.id, planCode, idempotencyKey }, deps);
  if (!r.ok) return { ok: false, code: r.code };
  return { ok: true, keyId: state.keyId, gatewayOrderId: r.gatewayOrderId, amountPaise: r.amountPaise, currency: r.currency, planCode: r.planCode };
}
