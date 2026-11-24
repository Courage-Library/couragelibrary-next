import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isGoogleSignInEnabled } from "@/lib/auth/google-flag";
import { GOOGLE_NONCE_COOKIE, nonceCookieOptions, nonceForLoginRequest } from "@/lib/auth/google-nonce-core";
import { categorySlugs, examSlugOf } from "@/lib/exams/category-slugs-edge";
import { CATEGORY_REWRITE_MARKER, categoryCachePath, categoryCacheSlugOf } from "@/lib/exams/category-cache-route";

/**
 * LIVE-GREEN-1 3a hardening (owner): only the middleware's OWN rewrite can produce a valid marker. The value is a random
 * token made once per middleware instance — never a constant a visitor could send. An incoming request whose marker is
 * anything else is treated as a direct visitor (noindex). Not stripped by name at the start: under `next start` the
 * second routing pass IS a new middleware call carrying the rewrite's marker, so a strip would noindex /exams/<slug>.
 */
const REWRITE_TOKEN = crypto.randomUUID();

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // AUTH-1 2b-1 (decision #66): the single-use Google nonce for the sign-in page (Server Components cannot set cookies).
  // An existing valid nonce cookie is reused (prefetches / second tabs never replace it); otherwise a new raw nonce is
  // minted into the httpOnly cookie. Either way it is forwarded on this request so the page renders its SHA-256 hash;
  // only the hash reaches the browser. Flag off → nothing happens. GET only (2b-1a): a server-action POST to
  // /auth/login must never mint, so a stale retry fails fast at the action's "missing nonce" check, before Supabase.
  let minted: string | null = null;
  // AUTH-UX-1 (owner decision 1): Create account has "Sign up with Google" (the same button + action) → the same nonce
  if (request.method === "GET" && (request.nextUrl.pathname === "/auth/login" || request.nextUrl.pathname === "/auth/signup") && isGoogleSignInEnabled()) {
    const nonce = nonceForLoginRequest(request.cookies.get(GOOGLE_NONCE_COOKIE)?.value);
    if (nonce.minted) {
      minted = nonce.raw;
      request.cookies.set(GOOGLE_NONCE_COOKIE, nonce.raw);
    }
  }
  // the session is refreshed for every request (cookies set on whatever response goes out)
  const response = await updateSession(request);
  if (minted) response.cookies.set(GOOGLE_NONCE_COOKIE, minted, nonceCookieOptions());
  // LIVE-GREEN-1 3a (owner): a DIRECT request for the internal cached category route (no rewrite marker) is never
  // indexed — X-Robots-Tag noindex (its canonical already points to /exams/<slug>; robots.txt does not block it, so
  // crawlers see this). The rewritten request of `next start`'s second routing pass carries the marker and gets nothing,
  // so /exams/<category> is never noindexed. Not a next.config header rule: that would leak onto /exams/<category>.
  if (categoryCacheSlugOf(request.nextUrl.pathname) && request.headers.get(CATEGORY_REWRITE_MARKER) !== REWRITE_TOKEN) {
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  }
  // PERF-HOME-1: /exams/<category> is served by the cached category route (same URL for the visitor; the internal
  // /category-cache/<slug> path carries the canonical /exams/<slug>); exam hubs and every other page stay as they are. A
  // redirect from the session step (age gate, admin) always wins. The slug list is never awaited; its background refresh
  // is kept alive with waitUntil (PERF-HOME-1b: the edge runtime drops un-awaited work after the response).
  // LIVE-GREEN-1 3a: the target is /category-cache/<slug> (lib/exams/category-cache-route.ts), which no redirect matches
  // (SEO-1's public /category/<slug> 308 hit the old internal path under `next start` → /exams/<category> looped).
  const slug = request.method === "GET" && response.status < 300 ? examSlugOf(request.nextUrl.pathname) : null;
  if (slug && categorySlugs((work) => event.waitUntil(work)).has(slug)) {
    const target = request.nextUrl.clone();
    target.pathname = categoryCachePath(slug);
    const forwarded = new Headers(request.headers);
    forwarded.set(CATEGORY_REWRITE_MARKER, REWRITE_TOKEN);
    const rewritten = NextResponse.rewrite(target, { request: { headers: forwarded } });
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
