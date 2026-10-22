import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { GOOGLE_NONCE_COOKIE, nonceCookieOptions, nonceForLoginRequest } from "@/lib/auth/google-nonce-core";

export async function middleware(request: NextRequest) {
  // AUTH-1 2b-1 (decision #66): the single-use Google nonce for the sign-in page (Server Components cannot set cookies).
  // An existing valid nonce cookie is reused (prefetches / second tabs never replace it); otherwise a new raw nonce is
  // minted into the httpOnly cookie. Either way it is forwarded on this request so the page renders its SHA-256 hash;
  // only the hash reaches the browser. Flag off → nothing happens.
  let minted: string | null = null;
  if (request.nextUrl.pathname === "/auth/login" && isGoogleSignInEnabled()) {
    const nonce = nonceForLoginRequest(request.cookies.get(GOOGLE_NONCE_COOKIE)?.value);
    if (nonce.minted) {
      minted = nonce.raw;
      request.cookies.set(GOOGLE_NONCE_COOKIE, nonce.raw);
    }
  }
  const response = await updateSession(request);
  if (minted) response.cookies.set(GOOGLE_NONCE_COOKIE, minted, nonceCookieOptions());
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/ (public image files)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
