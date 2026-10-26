import "server-only";
import { cache } from "react";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { checkoutState } from "@/config/payments";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { createRazorpayApi } from "./razorpay-core";
import type { ProDeps, ProOrderRow } from "./pro-flows";
import type { ProAccountView, ProPlanView } from "./pro-types";

/**
 * F9-B server wiring (service role; never imported by client components). Secrets are read from server env here and
 * passed to the pure core; they are never logged or sent to the browser (only RAZORPAY_KEY_ID reaches checkout).
 * hasPro() is THE server-side Pro check (backed by fn_has_pro); no client value is trusted.
 */

const log: ProDeps["log"] = (e) => reportWriteFailure({ fn: `pro.${e.fn}`, table: "payment_orders", op: "rpc", code: e.code, ids: e.ids });

/** null when checkout is closed (flags off, keys missing, live key not approved, refund policy not published). */
export function getProDeps(): ProDeps | null {
  const state = checkoutState();
  if (!state.open) return null;
  const admin = createAdminServerSupabaseClient();
  return {
    rpc: async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args as never);
      return { data, error: error ? { code: error.code } : null };
    },
    getOrderByGatewayId: async (gatewayOrderId) => {
      const { data, error } = await admin
        .from("payment_orders")
        .select("id, user_id, gateway_order_id, amount_paise, currency, status")
        .eq("gateway_order_id", gatewayOrderId)
        .eq("order_type", "PRO_PLAN")
        .maybeSingle();
      if (error) log({ fn: "getOrderByGatewayId", op: "select", code: error.code, ids: { gateway_order_id: gatewayOrderId } });
      return data && data.gateway_order_id && data.amount_paise ? (data as ProOrderRow) : null;
    },
    claimWebhookEvent: async ({ eventId, type, payload }) => {
      const { error } = await admin
        .from("payment_webhook_events")
        .insert({ gateway: "RAZORPAY", gateway_event_id: eventId, event_type: type.slice(0, 60), raw_payload: payload as never, signature_verified: true, processing_status: "PENDING" });
      if (!error) return "NEW";
      if (error.code !== "23505") {
        log({ fn: "claimWebhookEvent", op: "insert", code: error.code, ids: { event_id: eventId } });
        return "RETRY";
      }
      const { data } = await admin.from("payment_webhook_events").select("processing_status").eq("gateway", "RAZORPAY").eq("gateway_event_id", eventId).maybeSingle();
      return data?.processing_status === "PROCESSED" || data?.processing_status === "IGNORED" ? "DONE" : "RETRY";
    },
    finishWebhookEvent: async (eventId, status, code) => {
      const { error } = await admin
        .from("payment_webhook_events")
        .update({ processing_status: status, processing_error: code ?? null, processed_at: new Date().toISOString() })
        .eq("gateway", "RAZORPAY")
        .eq("gateway_event_id", eventId);
      if (error) log({ fn: "finishWebhookEvent", op: "update", code: error.code, ids: { event_id: eventId } });
    },
    api: createRazorpayApi({ keyId: state.keyId, keySecret: process.env.RAZORPAY_KEY_SECRET ?? "", fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) }),
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    log,
    afterFulfil: async (r) => {
      await sendReceiptEmail(r.order_id ?? null);
    },
  };
}

/**
 * Receipt / reminder email. The app has no mail transport yet (owner to choose SMTP / provider) — until then nothing
 * is sent and nothing is marked sent; the receipt is always available in the app (Billing). One ids-only log line.
 */
export async function sendReceiptEmail(orderId: string | null): Promise<{ sent: false; reason: "EMAIL_NOT_CONFIGURED" }> {
  console.log(JSON.stringify({ tag: "ops.email_pending", kind: "pro_receipt", ids: { order_id: orderId } }));
  return { sent: false, reason: "EMAIL_NOT_CONFIGURED" };
}

/** THE server-side Pro check. Fails closed (false) on any error. */
export const hasPro = cache(async (userId: string | null | undefined): Promise<boolean> => {
  if (!userId) return false;
  const { data, error } = await createAdminServerSupabaseClient().rpc("fn_has_pro", { p_user_id: userId });
  if (error) {
    log({ fn: "hasPro", op: "fn_has_pro", code: error.code, ids: { user_id: userId } });
    return false;
  }
  return data === true;
});

export interface FreeLimits {
  freePracticeDaily: number;
  freeMemoryLockActive: number;
  freeDailyMock: number;
  gstRegistered: boolean;
  foundingLimit: number;
}

/** Documented defaults (migration 113), used only if the settings row cannot be read. */
export const FREE_LIMIT_DEFAULTS: FreeLimits = { freePracticeDaily: 30, freeMemoryLockActive: 50, freeDailyMock: 1, gstRegistered: false, foundingLimit: 1000 };

export const getAppSettings = cache(async (): Promise<FreeLimits> => {
  const { data, error } = await createAdminServerSupabaseClient()
    .from("app_settings")
    .select("free_practice_daily, free_memory_lock_active, free_daily_mock, gst_registered, founding_limit")
    .maybeSingle();
  if (error || !data) {
    if (error) log({ fn: "getAppSettings", op: "select", code: error.code, ids: {} });
    return FREE_LIMIT_DEFAULTS;
  }
  return {
    freePracticeDaily: data.free_practice_daily,
    freeMemoryLockActive: data.free_memory_lock_active,
    freeDailyMock: data.free_daily_mock,
    gstRegistered: data.gst_registered,
    foundingLimit: data.founding_limit,
  };
});

/** Active plans (server read). The founding plan is listed only while the offer is open or for a founding buyer. */
export async function getProPricing(userId: string | null): Promise<{ plans: ProPlanView[]; account: ProAccountView }> {
  const admin = createAdminServerSupabaseClient();
  const [plansRes, offerRes, settings] = await Promise.all([
    admin.from("pro_plan_versions").select("plan_code, label, badge, price_paise, duration_months, is_founding, display_order").eq("active", true).order("display_order"),
    admin.from("founding_offer").select("sold").maybeSingle(),
    getAppSettings(),
  ]);
  const account: ProAccountView = { signedIn: !!userId, adultConfirmed: false, currentEnd: null, unlimited: false, foundingBuyer: false };
  if (userId) {
    const [profileRes, entRes] = await Promise.all([
      admin.from("user_profiles").select("adult_confirmed_at").eq("id", userId).maybeSingle(),
      admin
        .from("user_entitlements")
        .select("expires_at, founding, starts_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .is("revoked_at", null)
        .in("entitlement_type", ["PRO_SUBSCRIPTION", "PROMOTIONAL_PASS"]),
    ]);
    account.adultConfirmed = !!profileRes.data?.adult_confirmed_at;
    const now = Date.now();
    for (const e of entRes.data ?? []) {
      if (e.founding) account.foundingBuyer = true;
      if (e.expires_at === null) account.unlimited = true;
      else if (new Date(e.expires_at).getTime() > now && (!account.currentEnd || e.expires_at > account.currentEnd)) account.currentEnd = e.expires_at;
    }
  }
  const foundingOpen = (offerRes.data?.sold ?? Number.MAX_SAFE_INTEGER) < settings.foundingLimit || account.foundingBuyer;
  const plans = (plansRes.data ?? [])
    .filter((p) => !p.is_founding || foundingOpen)
    .map((p) => ({ planCode: p.plan_code, label: p.label, badge: p.badge, pricePaise: p.price_paise, durationMonths: p.duration_months, isFounding: p.is_founding }));
  return { plans, account };
}

/** Pro ending within 7 days (dashboard banner, R11: plain facts, no urgency words). Paid / library only; never open-ended. */
export async function getProEndingSoon(userId: string | null): Promise<{ endsAt: string; daysLeft: number } | null> {
  if (!userId) return null;
  const { account } = await getProPricing(userId);
  if (account.unlimited || !account.currentEnd) return null;
  const daysLeft = Math.ceil((new Date(account.currentEnd).getTime() - Date.now()) / 86400e3);
  return daysLeft <= 7 && daysLeft >= 0 ? { endsAt: account.currentEnd, daysLeft } : null;
}
