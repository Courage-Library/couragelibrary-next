import { createBrowserClient } from "@supabase/ssr";
import { getAppEnv } from "@/config/env";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Creates or reuses a single browser-side Supabase client instance.
 * Safe to use in Client Components ("use client").
 */
export function createClient() {
  if (browserClient) return browserClient;

  const { supabaseUrl, supabaseAnonKey } = getAppEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[Supabase Client] Environment variables missing. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set."
    );
  }

  browserClient = createBrowserClient<Database>(
    supabaseUrl || "https://placeholder-url.supabase.co",
    supabaseAnonKey || "placeholder-key"
  );

  return browserClient;
}
