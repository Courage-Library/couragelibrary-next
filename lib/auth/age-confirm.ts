import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { AGE_APP_METADATA_FLAG, hasAgeConfirmation, hasSignupAgeStamp, isAgeGateEnabled } from "@/lib/auth/age-gate";

/**
 * AGE-18 — server side. fn_confirm_age() (migration 109) records the confirmation on the canonical column
 * user_profiles.adult_confirmed_at (set once, never cleared). Only AFTER it succeeds does the server mirror
 * app_metadata.adult_confirmed = true with the service role (the gate's flag; users cannot write app_metadata).
 */

/**
 * Service role, server only: sets app_metadata.adult_confirmed = true for this user. The existing app_metadata (role
 * etc.) is read first and merged, so nothing else changes. Returns false on any failure.
 */
async function mirrorAdultConfirmed(userId: string): Promise<boolean> {
  try {
    const admin = createAdminServerSupabaseClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    if (hasAgeConfirmation(data.user.app_metadata)) return true;
    const merged = { ...(data.user.app_metadata ?? {}), [AGE_APP_METADATA_FLAG]: true };
    const { error: updError } = await admin.auth.admin.updateUserById(userId, { app_metadata: merged });
    return !updError;
  } catch {
    return false;
  }
}

/**
 * The caller confirms 18+: fn_confirm_age() must succeed FIRST; only then is app_metadata mirrored. Returns true only if
 * both succeeded (callers fail CLOSED on false).
 */
export async function recordAgeConfirmation(supabase: AppSupabaseClient): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return false;
    const { data, error } = await supabase.rpc("fn_confirm_age");
    const res = data as { success?: boolean; adult_confirmed_at?: string } | null;
    if (error || !res?.success || typeof res.adult_confirmed_at !== "string") return false;
    return await mirrorAdultConfirmed(auth.user.id);
  } catch {
    return false;
  }
}

/**
 * At sign-in (best effort, never blocks): an email sign-up's checkbox stamp (user_metadata) is recorded with
 * fn_confirm_age and mirrored; a profile that already holds adult_confirmed_at (e.g. the F8 18+ confirmation) is
 * mirrored without asking again. Nothing here trusts user_metadata as a confirmation: it only triggers the RPC.
 */
export async function syncAgeConfirmationOnSignIn(supabase: AppSupabaseClient): Promise<void> {
  if (!isAgeGateEnabled()) return;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user || hasAgeConfirmation(user.app_metadata)) return;
    if (hasSignupAgeStamp(user.user_metadata)) {
      await recordAgeConfirmation(supabase);
      return;
    }
    const { data: prof } = await supabase.from("user_profiles").select("adult_confirmed_at").eq("id", user.id).maybeSingle();
    if (prof?.adult_confirmed_at) await mirrorAdultConfirmed(user.id);
  } catch {
    /* best effort: the user can still confirm on /confirm-age */
  }
}
