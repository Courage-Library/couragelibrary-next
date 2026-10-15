/**
 * COURAGE LIBRARY — SAFE REDIRECT TARGETS (SEC-1D)
 *
 * The single sanitizer for user-supplied redirect targets (`next`, `redirectTo`, …). Pure and
 * runtime-agnostic: safe for server components, route handlers, server actions, middleware (edge)
 * and client code. No `server-only`.
 *
 * Accepted: a same-origin relative path that starts with exactly one "/", ASCII printable only,
 * ≤ 512 chars, with no "//", "\", "@", ":", control characters or ".." segments — checked on the
 * raw value AND on its percent-decoded forms (so "%2F%2Fevil", "%5C", "%2e%2e" are rejected). A query
 * string is allowed; a fragment is stripped. Anything else returns the fallback ("/").
 */

export const SAFE_REDIRECT_FALLBACK = "/";
export const SAFE_REDIRECT_MAX_LENGTH = 512;

// Base used only to normalise and to prove the result stays on the same origin.
const PROBE_ORIGIN = "https://same-origin.invalid";

function violates(value: string): boolean {
  if (!value.startsWith("/")) return true;
  if (value.startsWith("//")) return true;
  // ASCII printable only (rejects control chars, whitespace incl. tab/CR/LF, unicode lookalikes).
  if (!/^[\x21-\x7E]*$/.test(value)) return true;
  if (/[\\@:]/.test(value)) return true;
  if (value.includes("//")) return true;
  if (/(^|\/)\.\.?(\/|$|\?)/.test(value.split("?")[0])) return true;
  return false;
}

/**
 * Returns a safe same-origin relative path (pathname + optional query) or the fallback.
 */
export function sanitizeRedirectPath(input: unknown, fallback: string = SAFE_REDIRECT_FALLBACK): string {
  if (typeof input !== "string") return fallback;
  if (input.length === 0 || input.length > SAFE_REDIRECT_MAX_LENGTH) return fallback;

  const withoutFragment = input.split("#")[0];
  if (violates(withoutFragment)) return fallback;

  // Re-check every percent-decoded form (handles double encoding); undecodable → reject.
  let decoded = withoutFragment;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    if (violates(next.split("#")[0]) || next.includes("#")) return fallback;
    decoded = next;
  }

  let url: URL;
  try {
    url = new URL(withoutFragment, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const out = url.pathname + url.search;
  return violates(out) ? fallback : out;
}

/**
 * Admin login `next`: the shared sanitizer plus the /admin constraint (no query string).
 * Used by requireAdminPage (via lib/auth/require-admin) and by middleware.
 */
export function sanitizeAdminPath(input: unknown): string {
  const safe = sanitizeRedirectPath(input, "");
  if (!safe) return "/admin";
  const path = safe.split("?")[0];
  if (!/^\/admin(\/[A-Za-z0-9_\-[\]/]*)?$/.test(path)) return "/admin";
  return path;
}

/**
 * Absolute redirect URL for a route handler: resolves a sanitized path against `origin` with the URL
 * parser (never string concatenation) and asserts it stays on that origin.
 */
export function safeRedirectUrl(input: unknown, origin: string, fallback: string = SAFE_REDIRECT_FALLBACK): URL {
  const base = new URL(origin);
  const target = new URL(sanitizeRedirectPath(input, fallback), base);
  return target.origin === base.origin ? target : new URL(fallback.startsWith("/") ? fallback : "/", base);
}

/**
 * HOTFIX-1: the canonical login redirect target — "/auth/login?next=<sanitized path>". Every page that sends an
 * anonymous visitor to sign in uses this; there is no bare top-level login route.
 */
export function loginRedirectPath(next: unknown): string {
  return `/auth/login?next=${encodeURIComponent(sanitizeRedirectPath(next))}`;
}
