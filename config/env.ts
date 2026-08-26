/**
 * Safe, type-checked environment variable access.
 * Does not throw immediately to permit build-time static page compilation,
 * but provides explicit validity checks for runtime callers.
 */

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

export function getAppEnv(): AppEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    supabaseUrl,
    supabaseAnonKey,
    siteUrl,
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment: process.env.NODE_ENV === "development",
  };
}

export function validateSupabaseEnv(): { valid: boolean; error?: string } {
  const env = getAppEnv();

  if (!env.supabaseUrl) {
    return {
      valid: false,
      error:
        "Missing NEXT_PUBLIC_SUPABASE_URL. Please set it in .env.local pointing to couragelibrary-next.",
    };
  }

  if (!env.supabaseAnonKey) {
    return {
      valid: false,
      error:
        "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY). Please set it in .env.local.",
    };
  }

  return { valid: true };
}
