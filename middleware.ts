import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { GOOGLE_NONCE_COOKIE, nonceCookieOptions, nonceForLoginRequest } from "@/lib/auth/google-nonce-core";
import { categorySlugs, examSlugOf } from "@/lib/exams/category-slugs-edge";

export async function middleware(request: NextRequest) {
  // AUTH-1 2b-1 (decision #66): the single-use Google nonce for the sign-in page (Server Components cannot set cookies).
  // An existing valid nonce cookie is reused (prefetches / second tabs never replace it); otherwise a new raw nonce is
  // minted into the httpOnly cookie. Either way it is forwarded on this request so the page renders its SHA-256 hash;
  // only the hash reaches the browser. Flag off → nothing happens. GET only (2b-1a): a server-action POST to
  // /auth/login must never mint, so a stale retry fails fast at the action's "missing nonce" check, before Supabase.
  let minted: string | null = null;
  if (request.method === "GET" && request.nextUrl.pathname === "/auth/login" && isGoogleSignInEnabled()) {
    const nonce = nonceForLoginRequest(request.cookies.get(GOOGLE_NONCE_COOKIE)?.value);
    if (nonce.minted) {
      minted = nonce.raw;
      request.cookies.set(GOOGLE_NONCE_COOKIE, nonce.raw);
    }
  }
  // the session is refreshed for every request (cookies set on whatever response goes out)
  const response = await updateSession(request);
  if (minted) response.cookies.set(GOOGLE_NONCE_COOKIE, minted, nonceCookieOptions());
  // PERF-HOME-1: /exams/<category> is served by the cached category route (same URL for the visitor; the internal
  // /category/<slug> path carries the canonical /exams/<slug>); exam hubs and every other page stay as they are. A
  // redirect from the session step (age gate, admin) always wins. The slug list is never awaited.
  const slug = request.method === "GET" && response.status < 300 ? examSlugOf(request.nextUrl.pathname) : null;
  if (slug && categorySlugs().has(slug)) {
    const target = request.nextUrl.clone();
    target.pathname = `/category/${slug}`;
    const rewritten = NextResponse.rewrite(target);
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }
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
