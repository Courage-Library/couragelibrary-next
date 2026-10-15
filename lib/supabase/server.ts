import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
 *
 * TYPES-1 (Class A, typing only): @supabase/ssr 0.5.2 declares its result as the pre-2.5x generic order
 * SupabaseClient<Database, SchemaName, Schema>, which supabase-js 2.109 reads as <Database, SchemaNameOrOptions,
 * SchemaName> — every table then resolves to never. The runtime object IS a supabase-js SupabaseClient, so the
 * factory states its real type. Remove this when @supabase/ssr is upgraded.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getAppEnv();

  const ssrClient = createServerClient<Database>(
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
  return ssrClient as unknown as SupabaseClient<Database>;
}

/**
 * Creates a public server-side Supabase client for static / ISR / public candidate data reads.
 * Cookie-free, low-privilege (ANON/publishable key only), safe for static generation (SSG) and ISR.
 * Structurally prohibited from accessing service-role credentials.
 */
export function createPublicServerSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getAppEnv();

  return createClient<Database>(
    supabaseUrl || "https://placeholder-url.supabase.co",
    supabaseAnonKey || "placeholder-key",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
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
