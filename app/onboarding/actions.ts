"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { getSessionState } from "@/lib/auth/session-state";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { validateAnswers } from "@/lib/onboarding/schema";
import { pickableExams } from "@/lib/onboarding/server";

/**
 * F0 onboarding (decision #76) server actions. The user is always the session user (auth.uid() inside the RPC —
 * never an argument); roles are never read or written (#60). Inputs are validated here AND again by
 * fn_save_onboarding. Only fixed codes go back to the client; database error text is never returned.
 */
export type OnboardingSaveResult = { ok: true } | { ok: false; code: "disabled" | "auth" | "invalid" | "failed"; field?: string };

export async function saveOnboardingAction(raw: unknown): Promise<OnboardingSaveResult> {
  if (!isOnboardingEnabled()) return { ok: false, code: "disabled" };
  const supabase = await createServerSupabaseClient();
  if ((await getSessionState(supabase)).state !== "user") return { ok: false, code: "auth" };

  const allowed = (await pickableExams(supabase)).map((e) => e.id);
  const v = validateAnswers(raw, { allowedExamIds: allowed });
  if (!v.ok) return { ok: false, code: "invalid", field: v.field };

  const a = v.value;
  const { data, error } = await supabase.rpc("fn_save_onboarding", {
    p_action: "complete",
    p_language: a.language ?? undefined,
    p_exam_ids: a.examIds.length ? a.examIds : undefined,
    p_exam_date: a.examDate ?? undefined,
    p_attempt: a.attempt ?? undefined,
    p_daily_minutes: a.dailyMinutes ?? undefined,
  });
  const res = (data ?? {}) as { success?: boolean; code?: string; field?: string };
  if (error || !res.success) {
    console.error("[onboarding] save failed", { code: res.code ?? error?.code ?? null });
    return res.code === "INVALID_INPUT" ? { ok: false, code: "invalid", field: res.field } : { ok: false, code: "failed" };
  }
  return { ok: true };
}

/** "Skip for now": records skipped_at (no nagging afterwards) and continues to the safe `next` (default /dashboard). */
export async function skipOnboardingAction(next: unknown): Promise<OnboardingSaveResult> {
  if (!isOnboardingEnabled()) return { ok: false, code: "disabled" };
  const supabase = await createServerSupabaseClient();
  if ((await getSessionState(supabase)).state !== "user") return { ok: false, code: "auth" };
  const { data, error } = await supabase.rpc("fn_save_onboarding", { p_action: "skip" });
  const res = (data ?? {}) as { success?: boolean; code?: string };
  if (error || !res.success) {
    console.error("[onboarding] skip failed", { code: res.code ?? error?.code ?? null });
    return { ok: false, code: "failed" };
  }
  redirect(sanitizeRedirectPath(typeof next === "string" ? next : "", "/dashboard"));
}
