/**
 * AUTH-1 2b-1 (decision #66): pure helpers for the Google ID-token sign-in (credential shape check, fixed error codes).
 * Google / Supabase error text is never shown: every failure maps to a fixed code from lib/auth/messages.ts.
 * Roles are never read here (decision #60: roles only from app_metadata, resolved by lib/auth/require-admin.ts).
 */
import type { AuthErrorCode } from "@/lib/auth/messages";
import { isTransientAuthError } from "@/lib/auth/session-state";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { isCaptchaError } from "@/lib/auth/captcha";

/**
 * 2b-1a: after a failed Google attempt the nonce is spent, so the button reloads the sign-in page in full (a fresh GET
 * mints / reuses a nonce and re-initialises Google Identity Services). The message survives through the ?m= allow-list;
 * `next` is kept only if lib/auth/safe-redirect accepts it (invalid → omitted). Pure; safe in the browser.
 */
export function googleRetryUrl(code: string, next: unknown): string {
  const params = new URLSearchParams({ m: code });
  const safeNext = sanitizeRedirectPath(next, "");
  if (safeNext) params.set("next", safeNext);
  return `/auth/login?${params.toString()}`;
}

/**
 * AUTH-HARDEN-1: a Google sign-in that CREATES an account follows the same rules as the email sign-up (server-side):
 *   registrations closed (AUTH_SIGNUP_ENABLED=false or Supabase "Allow new users to sign up" off) → "signup-closed"
 *   the 18+ gate on (AGE_GATE_ENABLED) and the 18+ box not ticked                                   → "age-required"
 * An EXISTING account is never asked (the caller only consults this for a new account). Pure.
 */
export function newGoogleAccountRefusal(input: { signup: "open" | "closed" | "unknown"; ageGate: boolean; ageConfirmed: boolean }): Extract<AuthErrorCode, "signup-closed" | "age-required"> | null {
  if (input.signup === "closed") return "signup-closed";
  if (input.ageGate && !input.ageConfirmed) return "age-required";
  return null;
}

/**
 * AUTH-HARDEN-1: may the account that Supabase just created for a REFUSED new Google sign-in be removed again (so no
 * personal data is kept for someone we turned away)? Only when ALL hold: every identity is Google (never an email /
 * password account linked by the same address), it was created within the last 2 minutes (by this very request), and
 * the caller has seen that it has no profile row. Anything else is left alone. Pure.
 */
export const REFUSED_ACCOUNT_MAX_AGE_MS = 2 * 60 * 1000;
export function isRemovableRefusedGoogleAccount(user: { created_at?: string | null; identities?: { provider?: string | null }[] | null } | null | undefined, hasProfile: boolean, now: number = Date.now()): boolean {
  if (!user || hasProfile) return false;
  const ids = Array.isArray(user.identities) ? user.identities : [];
  if (!ids.length || !ids.every((i) => i && i.provider === "google")) return false;
  const created = Date.parse(String(user.created_at ?? ""));
  return Number.isFinite(created) && created <= now + 5000 && now - created <= REFUSED_ACCOUNT_MAX_AGE_MS;
}

export const MAX_ID_TOKEN_LENGTH = 4096;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

/** A Google ID token is a JWT: exactly three non-empty base64url segments, ≤ 4096 characters. */
export function isWellFormedIdToken(credential: unknown): credential is string {
  if (typeof credential !== "string" || credential.length === 0 || credential.length > MAX_ID_TOKEN_LENGTH) return false;
  const parts = credential.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0 && SEGMENT.test(p));
}

type ErrLike = { message?: string; code?: string; status?: number; name?: string };

/**
 * signInWithIdToken error → fixed code:
 *   Supabase unreachable / timeout (decision #61)       → "generic" (the existing outage code)
 *   Turnstile token rejected by Supabase (2b-2)          → "captcha-failed"
 *   sign-ups disabled / user not found (new Google user) → "signup-closed" ("Registrations are not open yet.")
 *   nonce mismatch / missing                             → "google-nonce"
 *   anything else (bad token, provider off, audience…)   → "google-failed"
 */
export function mapGoogleError(err: unknown): AuthErrorCode {
  const e = (err || {}) as ErrLike;
  if (isTransientAuthError(err)) return "generic";
  if (isCaptchaError(err)) return "captcha-failed";
  const code = (e.code || "").toLowerCase();
  const msg = (e.message || "").toLowerCase();
  if (code === "signup_disabled" || code === "user_not_found" || msg.includes("signups not allowed") || msg.includes("signup is disabled") || msg.includes("user not found")) return "signup-closed";
  if (code.includes("nonce") || msg.includes("nonce")) return "google-nonce";
  return "google-failed";
}
