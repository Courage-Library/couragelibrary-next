import "server-only";

import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState, type SessionState } from "@/lib/auth/session-state";

/**
 * AUTH-1 Stage 2a: the server-side session read for pages, layouts and guards.
 *   user  → render for the user
 *   none  → redirect to loginRedirectPath(...) as before
 *   error → render <SessionUnavailable /> (components/auth/session-unavailable): no protected data, no login redirect
 * Admin guards treat "error" as a denial (fail closed).
 */
export async function getServerSession(): Promise<SessionState<User>> {
  try {
    const supabase = await createServerSupabaseClient();
    return await getSessionState<User>(supabase);
  } catch {
    return { state: "error" };
  }
}
