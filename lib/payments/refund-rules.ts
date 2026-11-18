/**
 * PAY-1 B6 refunds (owner F1–F8, locked D4–D7, 2026-11-19): the labels for the eligibility answer of
 * fn_pro_refund_eligibility (migration 151) and the approval reasons. Pure — no imports; the offline gate loads it.
 * The RULES themselves live in the database function (one place); this file only names them for the admin page.
 */

export const REFUND_REASONS = ["POLICY_7_DAY", "DOUBLE_CHARGE", "NOT_ACTIVATED", "FAILED_DEBITED", "FEATURE_REMOVED", "GOODWILL"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
export const isRefundReason = (v: unknown): v is RefundReason => typeof v === "string" && (REFUND_REASONS as readonly string[]).includes(v);

/** What the admin picks before refunding in the Razorpay dashboard (Refund Policy 3.2 rows). */
export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  POLICY_7_DAY: "7-day refund (first purchase, once per user)",
  DOUBLE_CHARGE: "Charged twice — refund the extra payment",
  NOT_ACTIVATED: "Paid but Pro was not activated within 24 hours",
  FAILED_DEBITED: "Payment shows failed but money was taken",
  FEATURE_REMOVED: "A paid feature was removed — pro-rata refund",
  GOODWILL: "Goodwill (outside the policy — say why in the note)",
};

/** Why an order is NOT eligible for the 7-day refund (reasons[] of fn_pro_refund_eligibility). */
export const ELIGIBILITY_REASON_LABEL: Record<string, string> = {
  ORDER_NOT_FOUND: "Order not found",
  NOT_PAID: "Not paid",
  ALREADY_REFUNDED: "Already refunded",
  NOT_FIRST_PURCHASE: "Not the first Pro purchase",
  OUTSIDE_7_DAYS: "More than 7 days since the payment",
  MORE_THAN_1_PRO_MOCK: "More than 1 Pro mock submitted since the payment",
  POLICY_REFUND_ALREADY_USED: "The 7-day refund was already used",
  NOT_LATEST_PERIOD: "Not the latest period (a later plan is stacked after it)",
  UNAPPLIED_PAYMENT: "No Pro was granted for this payment (refund it as a double charge / not activated)",
};

/** Notes that do not block (notes[]). */
export const ELIGIBILITY_NOTE_LABEL: Record<string, string> = {
  TIER_AT_CHECK_TIME: "Some mocks were attempted before tiers were recorded: their CURRENT tier was used",
  TEST_MODE: "Test-mode (QA) order — refund it in the Razorpay TEST dashboard",
  FOUNDING_SEAT_STAYS_USED: "Founding plan — the founding seat stays used after a refund",
};

export interface RefundEligibility {
  found: boolean;
  order_id?: string;
  user_id?: string;
  payment_id?: string;
  amount_paise?: number;
  status?: string;
  mode?: "test" | "live";
  founding?: boolean;
  paid_at?: string;
  window_ends_at?: string;
  first_purchase?: boolean;
  within_7_days?: boolean;
  pro_mocks_submitted?: number;
  pro_mocks_tier_at_check_time?: number;
  policy_refund_used?: boolean;
  latest_period?: boolean;
  already_refunded?: boolean;
  refunded_paise?: number;
  eligible: boolean;
  reasons: string[];
  notes?: string[];
  open_approval?: { id: string; reason: string; created_at: string } | null;
}

/** Normalise the jsonb answer (anything unexpected → not eligible, with a reason). */
export function parseEligibility(v: unknown): RefundEligibility {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const reasons = Array.isArray(o.reasons) ? o.reasons.filter((r): r is string => typeof r === "string") : [];
  const notes = Array.isArray(o.notes) ? o.notes.filter((r): r is string => typeof r === "string") : [];
  const eligible = o.eligible === true && reasons.length === 0;
  return { ...(o as Partial<RefundEligibility>), found: o.found === true, eligible, reasons: eligible || reasons.length ? reasons : ["ORDER_NOT_FOUND"], notes };
}

/** A lookup the admin types: a Razorpay payment id or one of our receipt numbers. */
export const PAYMENT_ID_RX = /^pay_[A-Za-z0-9]{6,40}$/;
export const RECEIPT_RX = /^CL-R-\d{6}-[A-Z0-9]{4,12}$/;
export function parseLookup(raw: unknown): { kind: "payment" | "receipt"; value: string } | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (PAYMENT_ID_RX.test(v)) return { kind: "payment", value: v };
  if (RECEIPT_RX.test(v.toUpperCase())) return { kind: "receipt", value: v.toUpperCase() };
  return null;
}
