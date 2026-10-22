/**
 * AUTH-1 Stage 2a: the ONLY texts the auth pages show. Supabase / provider error text is never rendered: every
 * failure maps to a fixed code here, and the login page renders `?m=CODE` only for codes in AUTH_NOTICES (anything
 * else is ignored). Pure: shared by server actions, route handlers, pages and offline tests.
 */

export type AuthNoticeTone = "success" | "info" | "error";

/** Messages a page may show from the URL (`?m=CODE`). */
export const AUTH_NOTICES = {
  "check-email": { tone: "info", text: "Check your email. If the address can be used, we've sent a link to continue. The link works on any device." },
  "email-confirmed": { tone: "success", text: "Your email is confirmed. You're signed in." },
  "password-updated": { tone: "success", text: "Your password has been updated. Please sign in with your new password." },
  "signed-out": { tone: "info", text: "You have been signed out." },
  "link-expired": { tone: "error", text: "That link is invalid or has expired. Please request a new one." },
  "oauth-failed": { tone: "error", text: "We couldn't complete that sign-in. Please try again." },
} as const satisfies Record<string, { tone: AuthNoticeTone; text: string }>;

export type AuthNoticeCode = keyof typeof AUTH_NOTICES;

/** Allow-list lookup for `?m=`: unknown or malformed codes return null (and are ignored). */
export function authNotice(code: unknown): { tone: AuthNoticeTone; text: string } | null {
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(AUTH_NOTICES, code)) return null;
  return AUTH_NOTICES[code as AuthNoticeCode];
}

/** Errors a form action may return. */
export const AUTH_ERRORS = {
  "missing-fields": "Please fill in all the fields.",
  "invalid-email": "Please enter a valid email address.",
  "invalid-credentials": "Email or password is incorrect.",
  "email-not-confirmed": "Please confirm your email first. Check your inbox for the link we sent.",
  "weak-password": "Use at least 8 characters, with both letters and numbers.",
  "password-mismatch": "The two passwords don't match.",
  "rate-limited": "Too many attempts. Please wait a few minutes and try again.",
  "signup-closed": "Registrations are not open yet.",
  "session-missing": "Your reset link has expired. Please request a new one.",
  // AUTH-1 2b-1 (decision #66): Sign in with Google. "signup-closed" above doubles as the registrations-closed code.
  "google-disabled": "Google sign-in is not available right now. Please sign in with your email and password.",
  "google-failed": "We couldn't sign you in with Google. Please try again, or use your email and password.",
  "google-nonce": "This sign-in page has expired. Please reload the page and try Google again.",
  generic: "Something went wrong on our side. Please try again in a few minutes.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

/** Password rule mirrored from the Supabase setting (decision #60.5): ≥ 8 characters with letters and digits. */
export const PASSWORD_MIN_LENGTH = 8;
export function isAcceptablePassword(pw: unknown): boolean {
  return typeof pw === "string" && pw.length >= PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

export function isPlausibleEmail(email: unknown): boolean {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type ErrLike = { message?: string; code?: string; status?: number; name?: string };

/**
 * Maps a Supabase auth error to a fixed code. Codes that would reveal whether an account exists are never produced:
 * callers treat "already registered" / "user not found" as success-shaped responses (see actions).
 */
export function mapAuthError(err: unknown): AuthErrorCode {
  const e = (err || {}) as ErrLike;
  const code = (e.code || "").toLowerCase();
  const msg = (e.message || "").toLowerCase();
  if (e.status === 429 || code.includes("rate_limit") || code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || msg.includes("rate limit") || msg.includes("too many")) return "rate-limited";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "invalid-credentials";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "email-not-confirmed";
  if (code === "weak_password" || msg.includes("password should") || msg.includes("weak password")) return "weak-password";
  if (code === "signup_disabled" || msg.includes("signups not allowed") || msg.includes("signup is disabled")) return "signup-closed";
  if (code === "session_not_found" || code === "session_expired" || msg.includes("auth session missing")) return "session-missing";
  if (code === "validation_failed" || code === "email_address_invalid" || msg.includes("invalid email") || msg.includes("unable to validate email")) return "invalid-email";
  return "generic";
}

/** True for errors that only say "this account exists / does not exist" (must be answered success-shaped). */
export function isAccountExistenceError(err: unknown): boolean {
  const e = (err || {}) as ErrLike;
  const code = (e.code || "").toLowerCase();
  const msg = (e.message || "").toLowerCase();
  return code === "user_already_exists" || code === "email_exists" || code === "user_not_found" || msg.includes("already registered") || msg.includes("user not found") || msg.includes("email not found");
}
