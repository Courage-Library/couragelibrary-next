/**
 * AGE-18 (owner decision, legal, 2026-10-25): couragelibrary.in is 18+ only. Behind AGE_GATE_ENABLED (exactly "true";
 * default OFF). Turn it on only after migration 20261025000109_age_confirmation.sql is applied (fn_confirm_age).
 *
 * - The record of truth is user_profiles.adult_confirmed_at (the 096 column), written only by fn_confirm_age() — set
 *   once, never cleared. The leaderboard / public-profile 18+ checks read the same column.
 * - The gate's fast flag is auth app_metadata.adult_confirmed === true, written ONLY by the server (service role) after
 *   fn_confirm_age succeeds. user_metadata is NEVER trusted (#60: a user can write it).
 * - Email sign-up: a required, not pre-ticked checkbox; the server rejects the sign-up without it and stamps the time in
 *   the sign-up metadata. That stamp is only an INPUT: the first sign-in records it with fn_confirm_age and then mirrors
 *   it into app_metadata the same way.
 * - Every signed-in GET page request without app_metadata.adult_confirmed goes to /confirm-age first (Google sign-ins
 *   before onboarding, existing users on their next visit). Auth, API, the confirm page and the public legal / help pages
 *   are exempt, so nobody is locked out of reading the terms or signing out.
 * Pure helpers only (middleware-safe: no server-only imports).
 */

export const AGE_CONFIRM_PATH = "/confirm-age";
export const AGE_CHECKBOX_FIELD = "ageConfirmed";
export const AGE_CONFIRM_LABEL = "I confirm I am 18 or older";
/** app_metadata flag (server-written, service role only) — the ONLY thing the gate trusts */
export const AGE_APP_METADATA_FLAG = "adult_confirmed";
/** user_metadata key of the sign-up checkbox stamp — an input for the first sign-in, never a confirmation by itself */
export const AGE_SIGNUP_STAMP_KEY = "age_confirmed_at";

export function isAgeGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AGE_GATE_ENABLED === "true";
}

/** The checkbox was ticked (a browser sends "on"; anything else — missing, empty, "false" — is NOT a confirmation). */
export function isAgeConfirmedInput(value: FormDataEntryValue | null | undefined): boolean {
  return value === "on" || value === "true";
}

/** Confirmed for the gate: ONLY the server-written app_metadata flag counts (exactly boolean true). */
export function hasAgeConfirmation(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.[AGE_APP_METADATA_FLAG] === true;
}

/** The sign-up checkbox stamp (user_metadata) — a time string; only used to trigger fn_confirm_age at first sign-in. */
export function hasSignupAgeStamp(userMetadata: Record<string, unknown> | null | undefined): boolean {
  const v = userMetadata?.[AGE_SIGNUP_STAMP_KEY];
  return typeof v === "string" && v.length > 0 && !Number.isNaN(Date.parse(v));
}

/** The signed-in user (a Supabase auth user object) still has to confirm 18+ — the flag must be checked by the caller. */
export function userNeedsAgeConfirmation(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return !!user && !hasAgeConfirmation(user.app_metadata);
}

const EXEMPT_EXACT = new Set([AGE_CONFIRM_PATH, "/", "/privacy", "/terms", "/contact", "/grievance", "/help", "/about", "/pricing", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);
const EXEMPT_PREFIXES = ["/auth/", "/api/", "/_next/", "/images/", "/email/"];

/** Paths a signed-in, unconfirmed user may still open (confirm page, auth incl. sign-out, APIs, public legal pages). */
export function isAgeGateExempt(pathname: string): boolean {
  if (EXEMPT_EXACT.has(pathname)) return true;
  return EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Middleware decision: true → redirect to /confirm-age?next=<path>. GET only (a server-action POST is never redirected
 * mid-flight); signed-in users only; never for exempt paths. Reads ONLY the app_metadata.adult_confirmed flag of the
 * session user (never the role — SEC-1C S-06 — and never user_metadata).
 */
export function needsAgeGate(input: { enabled: boolean; method: string; pathname: string; user: { app_metadata?: Record<string, unknown> | null } | null | undefined }): boolean {
  if (!input.enabled || !input.user || input.method !== "GET") return false;
  if (isAgeGateExempt(input.pathname)) return false;
  return userNeedsAgeConfirmation(input.user);
}
