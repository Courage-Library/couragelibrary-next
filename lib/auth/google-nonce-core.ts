/**
 * AUTH-1 2b-1 (decision #66): Google ID-token nonce — the runtime-agnostic part (Web Crypto only), shared by the
 * middleware (edge) and lib/auth/google-nonce.ts (server-only). Never imported by client components.
 *
 * Flow: the middleware mints a random RAW nonce for /auth/login and stores it in an httpOnly cookie; the login page
 * (server) passes only SHA-256(raw) as hex to Google Identity Services; Google puts that hash into the ID token; the
 * server action reads the RAW nonce back from the cookie (single use) and hands it to signInWithIdToken, which checks
 * sha256(raw) against the token. The raw value never reaches client JavaScript.
 */

export const GOOGLE_NONCE_COOKIE = "cl_g_nonce";
export const GOOGLE_NONCE_MAX_AGE_S = 600;
const RAW_PATTERN = /^[0-9a-f]{64}$/;

/** 32 random bytes as 64 lowercase hex characters. */
export function randomRawNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isRawNonce(value: unknown): value is string {
  return typeof value === "string" && RAW_PATTERN.test(value);
}

/** { raw, hashedHex }: raw goes into the httpOnly cookie, only hashedHex may reach the browser. */
export async function createNonce(): Promise<{ raw: string; hashedHex: string }> {
  const raw = randomRawNonce();
  return { raw, hashedHex: await sha256Hex(raw) };
}

/** httpOnly, SameSite=Lax, Path=/, Max-Age=600; Secure in production. */
export function nonceCookieOptions(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return { httpOnly: true, secure: nodeEnv === "production", sameSite: "lax" as const, path: "/", maxAge: GOOGLE_NONCE_MAX_AGE_S };
}

/**
 * The raw nonce to use for this /auth/login request: an existing valid (unexpired, well-formed) cookie is REUSED, so a
 * router prefetch or a second tab never replaces the nonce whose hash an already-rendered page holds. (Next.js strips its
 * router headers, RSC / Next-Router-Prefetch / _rsc, before middleware runs, so prefetches cannot be detected there.)
 * Single use still holds: the server action consumes and deletes the cookie, and the next render mints a fresh one; the
 * cookie's Max-Age is fixed at mint time. Returns { raw, minted }: minted → the caller sets the cookie.
 */
export function nonceForLoginRequest(existing: string | undefined): { raw: string; minted: boolean } {
  return isRawNonce(existing) ? { raw: existing, minted: false } : { raw: randomRawNonce(), minted: true };
}
