import "server-only";

import { cookies } from "next/headers";
import { GOOGLE_NONCE_COOKIE, createNonce, isRawNonce, sha256Hex } from "@/lib/auth/google-nonce-core";

/**
 * AUTH-1 2b-1 (decision #66): server-only nonce operations for the login page and the Google server action.
 * Minting happens in the middleware (Server Components cannot set cookies): it stores the raw nonce in the httpOnly
 * cookie and forwards it on the request, so the page renders the matching hash. See lib/auth/google-nonce-core.ts.
 */
export { createNonce };

/** The login page: SHA-256 hex of the nonce minted for this render, or null (no cookie → no Google button). */
export async function nonceHashForRender(): Promise<string | null> {
  const raw = (await cookies()).get(GOOGLE_NONCE_COOKIE)?.value;
  return isRawNonce(raw) ? sha256Hex(raw) : null;
}

/** The server action: read the raw nonce AND delete the cookie in the same request (single use). Missing / expired /
 *  malformed → null. */
export async function consumeNonce(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(GOOGLE_NONCE_COOKIE)?.value;
  store.delete({ name: GOOGLE_NONCE_COOKIE, path: "/" });
  return isRawNonce(raw) ? raw : null;
}
