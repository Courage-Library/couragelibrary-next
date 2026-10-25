/**
 * AGE-18 (owner decision, legal, 2026-10-25): couragelibrary.in is 18+ only. Behind AGE_GATE_ENABLED (exactly "true";
 * default OFF). Turn it on only after migration 20261025000109_age_confirmation.sql is applied (fn_confirm_age).
 *
 * - Email sign-up: a required, not pre-ticked checkbox; the server rejects the sign-up without it and records the
 *   confirmation time in the sign-up metadata (no session exists until the email is confirmed).
 * - Every signed-in GET page request without a confirmation goes to /confirm-age first (Google sign-ins before
 *   onboarding, existing users on their next visit). Auth, API, the confirm page itself and the public legal / help
 *   pages are exempt, so nobody is locked out of reading the terms or signing out.
 * - The record of truth is user_profiles.age_confirmed_at, written only by fn_confirm_age(); user_metadata mirrors it so
 *   the middleware can decide without a database query. Self-declared: no date of birth is stored.
 * Pure helpers only (middleware-safe: no server-only imports).
 */

export const AGE_CONFIRM_PATH = "/confirm-age";
export const AGE_CHECKBOX_FIELD = "ageConfirmed";
export const AGE_CONFIRM_LABEL = "I confirm I am 18 or older";
/** user_metadata key mirroring user_profiles.age_confirmed_at */
export const AGE_METADATA_KEY = "age_confirmed_at";

export function isAgeGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AGE_GATE_ENABLED === "true";
}

/** The checkbox was ticked (a browser sends "on"; anything else — missing, empty, "false" — is NOT a confirmation). */
export function isAgeConfirmedInput(value: FormDataEntryValue | null | undefined): boolean {
  return value === "on" || value === "true";
}

/** The signed-in user already confirmed (an ISO time in user_metadata). */
export function hasAgeConfirmation(userMetadata: Record<string, unknown> | null | undefined): boolean {
  const v = userMetadata?.[AGE_METADATA_KEY];
  return typeof v === "string" && v.length > 0 && !Number.isNaN(Date.parse(v));
}

const EXEMPT_EXACT = new Set([AGE_CONFIRM_PATH, "/", "/privacy", "/terms", "/contact", "/grievance", "/help", "/about", "/pricing", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);
const EXEMPT_PREFIXES = ["/auth/", "/api/", "/_next/", "/images/", "/email/"];

/** The signed-in user (a Supabase auth user object) still has to confirm 18+ — the flag must be checked by the caller. */
export function userNeedsAgeConfirmation(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return !!user && !hasAgeConfirmation(user.user_metadata);
}

/** Paths a signed-in, unconfirmed user may still open (confirm page, auth incl. sign-out, APIs, public legal pages). */
export function isAgeGateExempt(pathname: string): boolean {
  if (EXEMPT_EXACT.has(pathname)) return true;
  return EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Middleware decision: true → redirect to /confirm-age?next=<path>. GET only (a server-action POST is never redirected
 * mid-flight); signed-in users only; never for exempt paths.
 */
export function needsAgeGate(input: { enabled: boolean; method: string; pathname: string; signedIn: boolean; userMetadata: Record<string, unknown> | null | undefined }): boolean {
  if (!input.enabled || !input.signedIn || input.method !== "GET") return false;
  if (isAgeGateExempt(input.pathname)) return false;
  return !hasAgeConfirmation(input.userMetadata);
}
