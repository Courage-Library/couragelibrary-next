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
