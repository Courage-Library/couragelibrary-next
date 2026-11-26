/**
 * ADMIN-MFA-UX-1 — pure display helpers for /admin/mfa (no I/O, no secrets kept). The MFA logic itself (enrol,
 * challenge, verify, AAL2) is unchanged in components/admin/admin-mfa-panel.tsx.
 */

/** "jane@example.com" → "j•••@example.com" (first letter + domain). Anything unusual → "your account" (never the raw value). */
export function maskEmail(email: string | null | undefined): string {
  const v = (email ?? "").trim();
  const at = v.lastIndexOf("@");
  if (at < 1 || at === v.length - 1) return "your account";
  const domain = v.slice(at + 1);
  if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return "your account";
  return `${v[0]}•••@${domain}`;
}

/** a setup key shown in groups of 4 for reading / typing (the clipboard always gets the raw key) */
export function groupKey(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export const MFA_COPY = {
  wrongCode: "That code didn't work. Codes change every 30 seconds — try the newest one.",
  rateLimited: "Too many tries. Wait a minute, then enter the newest code.",
  expired: "This setup expired. Start again.",
  network: "We couldn't reach the server. Check your connection and try again.",
  startFailed: "We couldn't start the setup. Please try again.",
  statusFailed: "We couldn't check your authenticator. Reload the page.",
} as const;

export type MfaErrorKind = "wrong-code" | "rate-limited" | "expired" | "network";

/** Supabase AuthError (code / status / name) → one plain-words kind. Unknown → "wrong-code" (the safe, common case). */
export function mfaErrorKind(err: { code?: unknown; status?: unknown; name?: unknown } | null | undefined): MfaErrorKind {
  const code = typeof err?.code === "string" ? err.code : "";
  const name = typeof err?.name === "string" ? err.name : "";
  if (err?.status === 429 || /rate_limit/.test(code)) return "rate-limited";
  if (/mfa_factor_not_found|mfa_challenge_expired|mfa_factor_name_conflict/.test(code)) return "expired";
  if (/RetryableFetch|FetchError/.test(name) || err?.status === 0) return "network";
  return "wrong-code";
}

export function mfaErrorMessage(kind: MfaErrorKind): string {
  return kind === "rate-limited" ? MFA_COPY.rateLimited : kind === "expired" ? MFA_COPY.expired : kind === "network" ? MFA_COPY.network : MFA_COPY.wrongCode;
}
