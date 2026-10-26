/**
 * Server-side payments kill switch (SEC-1A emergency containment).
 * Payments are disabled unless PAYMENTS_ENABLED is explicitly "true".
 * Not a NEXT_PUBLIC_ variable: there is no client-side override.
 */

export const PAYMENTS_DISABLED_ERROR = {
  code: "PAYMENTS_TEMPORARILY_DISABLED",
  message: "Online payments are temporarily unavailable.",
} as const;

export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

/**
 * F9-B Pro plans (architect GO, Razorpay TEST MODE ONLY). Checkout opens only when ALL hold: PAYMENTS_ENABLED and
 * PRO_ENABLED are exactly "true", the three Razorpay values are present (server env only; never NEXT_PUBLIC_), and the
 * key id is a TEST key — a live key is refused until F9-C (architect go + RAZORPAY_LIVE_APPROVED exactly "true").
 * The refund policy page must be published before anyone can pay (honest reason shown otherwise).
 */
export function isProEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PRO_ENABLED === "true";
}

export type RazorpayKeyMode = "test" | "live" | null;

export function razorpayKeyMode(keyId: string | undefined | null): RazorpayKeyMode {
  if (!keyId) return null;
  if (/^rzp_test_[A-Za-z0-9]{6,40}$/.test(keyId)) return "test";
  if (/^rzp_live_[A-Za-z0-9]{6,40}$/.test(keyId)) return "live";
  return null;
}

export type CheckoutClosedReason = "PAYMENTS_OFF" | "PRO_OFF" | "KEYS_MISSING" | "LIVE_KEY_NOT_APPROVED" | "REFUND_POLICY_MISSING";
export type CheckoutState = { open: true; keyId: string; mode: "test" | "live" } | { open: false; reason: CheckoutClosedReason };

/**
 * The refund policy page (LEGAL-AUDIT-1 gap). Flip to true only in the change that adds app/refund-policy/page.tsx with
 * owner-approved text (the F9-B gate checks the page exists when this is true); checkout stays closed until then.
 */
export const REFUND_POLICY_PATH = "/refund-policy";
export const REFUND_POLICY_PUBLISHED = false;

export function checkoutState(env: NodeJS.ProcessEnv = process.env, refundPolicyPublished = REFUND_POLICY_PUBLISHED): CheckoutState {
  if (env.PAYMENTS_ENABLED !== "true") return { open: false, reason: "PAYMENTS_OFF" };
  if (!isProEnabled(env)) return { open: false, reason: "PRO_OFF" };
  const keyId = env.RAZORPAY_KEY_ID ?? "";
  const mode = razorpayKeyMode(keyId);
  if (!mode || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) return { open: false, reason: "KEYS_MISSING" };
  if (mode === "live" && env.RAZORPAY_LIVE_APPROVED !== "true") return { open: false, reason: "LIVE_KEY_NOT_APPROVED" };
  if (!refundPolicyPublished) return { open: false, reason: "REFUND_POLICY_MISSING" };
  return { open: true, keyId, mode };
}

/** Honest, plain reasons shown on the pricing page (R11 / R12: no urgency, no blame). */
export const CHECKOUT_CLOSED_MESSAGE: Record<CheckoutClosedReason, string> = {
  PAYMENTS_OFF: "Payments are not open yet. There is nothing to pay today.",
  PRO_OFF: "Pro is not open yet. There is nothing to pay today.",
  KEYS_MISSING: "Payments are not set up yet. There is nothing to pay today.",
  LIVE_KEY_NOT_APPROVED: "Payments are not open yet. There is nothing to pay today.",
  REFUND_POLICY_MISSING: "Payments open once our refund policy is published. There is nothing to pay today.",
};
