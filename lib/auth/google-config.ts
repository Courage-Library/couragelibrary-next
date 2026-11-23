import "server-only";

import { googleClientId, isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { nonceHashForRender } from "@/lib/auth/google-nonce";

/** AUTH-1 2b-1: Google config for an auth page — null when the flag is off (then nothing Google is rendered). */
export type AuthGoogleConfig = { clientId: string; nonceHash: string } | null;

/**
 * AUTH-1 2b-1 (decision #66) — moved from the sign-in page unchanged (AUTH-UX-1: Create account uses it too). The
 * middleware has minted the single-use nonce for this GET (/auth/login and /auth/signup); this passes ONLY its SHA-256
 * hash and the public client id to the client. Flag off → null: no script, no button, no Google request.
 */
export async function googleConfig(): Promise<AuthGoogleConfig> {
  if (!isGoogleSignInEnabled()) return null;
  const clientId = googleClientId();
  const nonceHash = await nonceHashForRender();
  return clientId && nonceHash ? { clientId, nonceHash } : null;
}
