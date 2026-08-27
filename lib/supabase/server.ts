import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAppEnv } from "@/config/env";
import type { Database } from "@/types/database";

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Creates a server-side Supabase client with cookie storage support.
 * Safe to use in Server Components, Server Actions, and Route Handlers.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getAppEnv();

  return createServerClient<Database>(
    supabaseUrl || "https://placeholder-url.supabase.co",
    supabaseAnonKey || "placeholder-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored if called from Server Component
          }
        },
      },
    }
  );
}

/**
 * Creates a server-only, privileged Supabase client with SERVICE_ROLE key.
 * Used exclusively for server actions guarded by AdminService.checkIsAdminOrStaff().
 * Never exposed to browser or client components.
 */
export function createAdminServerSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getAppEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

  return createClient<Database>(
    supabaseUrl || "https://placeholder-url.supabase.co",
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
