import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppEnv } from "@/config/env";
import type { Database } from "@/types/database";

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

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
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
  );

  // Refresh auth token
  let hasUser = false;
  try {
    const { data } = await supabase.auth.getUser();
    hasUser = Boolean(data?.user);
  } catch {
    hasUser = false;
  }

  // SEC-1C defence in depth: anonymous requests for admin PAGES go to login. Role decisions stay in
  // the canonical page guard (requireAdminPage); /api/admin routes keep their own 401 JSON.
  const { pathname } = request.nextUrl;
  if (!hasUser && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", sanitizeAdminNext(pathname));
    const redirectResponse = NextResponse.redirect(loginUrl);
    supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  return supabaseResponse;
}

/** Relative /admin path only (mirror of lib/auth/require-admin sanitizeAdminNext; middleware cannot import server-only). */
function sanitizeAdminNext(path: string): string {
  if (!/^\/admin(\/[A-Za-z0-9_\-[\]/]*)?$/.test(path) || path.includes("//") || path.includes("\\")) return "/admin";
  return path;
}
