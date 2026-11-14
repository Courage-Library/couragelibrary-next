import "server-only";

import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { isRemovableRefusedGoogleAccount } from "@/lib/auth/google-signin";

/**
 * AUTH-HARDEN-1 — server side of the Google new-account rules (service role, server only).
 * "New" = the signed-in user has no user_profiles row yet: every account gets one on its first completed sign-in
 * (UserProfileService.ensureProfile on every sign-in path), so an account without one has never been let in.
 * Never reads or writes roles; never logs ids or e-mails.
 */

/** true = no profile row (a new account). Throws on a lookup error (the caller fails closed). */
export async function isNewAccount(userId: string): Promise<boolean> {
  const admin = createAdminServerSupabaseClient();
  const { data, error } = await admin.from("user_profiles").select("id").eq("id", userId).maybeSingle();
  if (error) throw new Error("profile lookup failed");
  return !data;
}

type RefusedUser = { id: string; created_at?: string | null; identities?: { provider?: string | null }[] | null };

/**
 * Removes the account Supabase created for a REFUSED new Google sign-in — only behind isRemovableRefusedGoogleAccount
 * (Google-only identities, created < 2 min ago, no profile; re-checked here). Returns what happened; never throws.
 */
export async function removeRefusedGoogleAccount(user: RefusedUser): Promise<"removed" | "kept" | "failed"> {
  try {
    const stillNew = await isNewAccount(user.id);
    if (!isRemovableRefusedGoogleAccount(user, !stillNew)) return "kept";
    const admin = createAdminServerSupabaseClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    return error ? "failed" : "removed";
  } catch {
    return "failed";
  }
}
