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
