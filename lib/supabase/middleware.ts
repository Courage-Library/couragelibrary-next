import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppEnv } from "@/config/env";
import type { Database } from "@/types/database";
import { fromSsrClient } from "@/lib/supabase/types";
import { sanitizeAdminPath } from "@/lib/auth/safe-redirect";
import { getSessionState } from "@/lib/auth/session-state";
import { authTimeoutFetch } from "@/lib/supabase/auth-fetch";
import { AGE_CONFIRM_PATH, isAgeGateEnabled, needsAgeGate } from "@/lib/auth/age-gate";

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Helper to update and refresh user auth tokens inside Next.js Middleware.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const { supabaseUrl, supabaseAnonKey } = getAppEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  // TYPES-1 B6: typed as SupabaseClient<Database> via fromSsrClient (@supabase/ssr 0.5.2 generic-order mismatch).
  const supabase = fromSsrClient(createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      // AUTH-1 2a: auth requests are time-limited (a hanging Auth endpoint must not hang every request)
      global: { fetch: authTimeoutFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  ));

  // Refresh auth token. AUTH-1 2a: tri-state — a transient Supabase failure ("error") is not "signed out".
  const session = await getSessionState(supabase);

  // SEC-1C defence in depth: anonymous requests for admin PAGES go to login. Role decisions stay in
  // the canonical page guard (requireAdminPage); /api/admin routes keep their own 401 JSON.
  // On "error" nothing is redirected here: requireAdminPage denies and shows the retry page (fail closed).
  const { pathname } = request.nextUrl;
  if (session.state === "none" && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", sanitizeAdminPath(pathname));
    const redirectResponse = NextResponse.redirect(loginUrl);
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  // AGE-18 (owner decision; flag AGE_GATE_ENABLED, default off): a signed-in user who has not confirmed 18+ opens
  // /confirm-age first (GET page requests only; auth, API and public legal pages are exempt). Decided from the session's
  // server-written 18+ flag (lib/auth/age-gate reads it; no role decision here; user-editable metadata is never trusted)
  // — no database query here; the record of truth is user_profiles.adult_confirmed_at.
  if (
    session.state === "user" &&
    needsAgeGate({ enabled: isAgeGateEnabled(), method: request.method, pathname, user: session.user })
  ) {
    const ageUrl = request.nextUrl.clone();
    ageUrl.pathname = AGE_CONFIRM_PATH;
    ageUrl.search = "";
    ageUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`.slice(0, 512));
    const redirectResponse = NextResponse.redirect(ageUrl);
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  return supabaseResponse;
}
