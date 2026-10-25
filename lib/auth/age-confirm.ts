import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { AGE_METADATA_KEY, hasAgeConfirmation, isAgeGateEnabled } from "@/lib/auth/age-gate";

/**
 * AGE-18 — server side. fn_confirm_age() (migration 109) is the only writer of user_profiles.age_confirmed_at: it uses
 * auth.uid(), sets the time once and never clears it. The returned time is mirrored into user_metadata so the middleware
 * can gate without a database query.
 */

/** Records the caller's confirmation; returns the stored time (ISO) or null on any failure (callers fail CLOSED). */
export async function recordAgeConfirmation(supabase: AppSupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("fn_confirm_age");
    const res = data as { success?: boolean; age_confirmed_at?: string } | null;
    if (error || !res?.success || typeof res.age_confirmed_at !== "string") return null;
    const { error: metaError } = await supabase.auth.updateUser({ data: { [AGE_METADATA_KEY]: res.age_confirmed_at } });
    return metaError ? null : res.age_confirmed_at;
  } catch {
    return null;
  }
}

/**
 * First sign-in after an email sign-up: the checkbox time is in user_metadata (there was no session at sign-up); copy it
 * to the profile once. Best effort and idempotent (the RPC keeps the first time); never blocks the sign-in.
 */
export async function syncAgeConfirmationOnSignIn(supabase: AppSupabaseClient): Promise<void> {
  if (!isAgeGateEnabled()) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user && hasAgeConfirmation(data.user.user_metadata)) await supabase.rpc("fn_confirm_age");
  } catch {
    /* best effort: the middleware still sees the metadata; the next sign-in retries */
  }
}
