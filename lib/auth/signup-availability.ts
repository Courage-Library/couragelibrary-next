import "server-only";

import { getAppEnv } from "@/config/env";

export type SignupAvailability = "open" | "closed" | "unknown";

/**
 * AUTH-1 Stage 2a (decision #60.2): whether public registration is open, from the Supabase project's own setting
 * ("Allow new users to sign up" → public `disable_signup`), cached for 60 s. `AUTH_SIGNUP_ENABLED=false` (server env)
 * forces "closed". When the setting cannot be read the page shows the form; a closed project still refuses the
 * sign-up and the action answers with the honest "Registrations are not open yet." code.
 */
export async function getSignupAvailability(): Promise<SignupAvailability> {
  if (process.env.AUTH_SIGNUP_ENABLED === "false") return "closed";
  const { supabaseUrl, supabaseAnonKey } = getAppEnv();
  if (!supabaseUrl || !supabaseAnonKey) return "unknown";
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unknown";
    const settings = (await res.json()) as { disable_signup?: boolean };
    return settings.disable_signup === true ? "closed" : "open";
  } catch {
    return "unknown";
  }
}
