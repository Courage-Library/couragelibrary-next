import { createBrowserClient } from "@supabase/ssr";
import { getAppEnv } from "@/config/env";
import type { Database } from "@/types/database";
import { fromSsrClient, type AppSupabaseClient } from "@/lib/supabase/types";

let browserClient: AppSupabaseClient | null = null;

/**
 * Creates or reuses a single browser-side Supabase client instance.
 * Safe to use in Client Components ("use client").
 * TYPES-1 B6: typed as SupabaseClient<Database> via fromSsrClient (@supabase/ssr 0.5.2 generic-order mismatch).
 */
export function createClient(): AppSupabaseClient {
  if (browserClient) return browserClient;

  const { supabaseUrl, supabaseAnonKey } = getAppEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[Supabase Client] Environment variables missing. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set."
    );
  }

  browserClient = fromSsrClient(
    createBrowserClient<Database>(
      supabaseUrl || "https://placeholder-url.supabase.co",
      supabaseAnonKey || "placeholder-key"
    )
  );

  return browserClient;
}
