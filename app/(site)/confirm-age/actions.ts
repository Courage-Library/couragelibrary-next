"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { AGE_CHECKBOX_FIELD, AGE_CONFIRM_PATH, isAgeConfirmedInput, isAgeGateEnabled } from "@/lib/auth/age-gate";
import { recordAgeConfirmation } from "@/lib/auth/age-confirm";

/** Where to go after confirming: sanitized, and never back to the confirm page itself. */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = sanitizeRedirectPath(typeof raw === "string" ? raw : "", "/dashboard");
  return next.startsWith(AGE_CONFIRM_PATH) ? "/dashboard" : next;
}

/**
 * AGE-18: the signed-in user confirms 18+ once. The checkbox is required (server-side); fn_confirm_age() records it on
 * user_profiles.adult_confirmed_at (set once), then the server sets app_metadata.adult_confirmed (service role) for the
 * middleware. Any failure keeps the user on this page (fail CLOSED) with a fixed message code.
 */
export async function confirmAgeAction(formData: FormData) {
  const next = safeNext(formData.get("next"));
  if (!isAgeGateEnabled()) redirect(next);
  const back = (e: string) => `${AGE_CONFIRM_PATH}?e=${e}&next=${encodeURIComponent(next)}`;
  if (!isAgeConfirmedInput(formData.get(AGE_CHECKBOX_FIELD))) redirect(back("required"));

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect(`/auth/login?next=${encodeURIComponent(AGE_CONFIRM_PATH)}`);

  // fn_confirm_age first; app_metadata is mirrored (service role) only after it succeeded — any failure stays here
  const ok = await recordAgeConfirmation(supabase);
  if (!ok) redirect(back("failed"));
  redirect(next);
}
