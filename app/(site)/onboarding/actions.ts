"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { getSessionState } from "@/lib/auth/session-state";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { goalChanges, shownGoals, validateAnswers } from "@/lib/onboarding/schema";
import { getOnboardingState, pickableExams } from "@/lib/onboarding/server";

/**
 * F0 onboarding (decision #76) server actions. The user is always the session user (auth.uid() inside the RPC —
 * never an argument); roles are never read or written (#60). Inputs are validated here AND again by
 * fn_save_onboarding. Only fixed codes go back to the client; database error text is never returned.
 */
export type OnboardingSaveResult = { ok: true; removed?: string[] } | { ok: false; code: "disabled" | "auth" | "invalid" | "failed"; field?: string };

export async function saveOnboardingAction(raw: unknown): Promise<OnboardingSaveResult> {
  if (!isOnboardingEnabled()) return { ok: false, code: "disabled" };
  const supabase = await createServerSupabaseClient();
  if ((await getSessionState(supabase)).state !== "user") return { ok: false, code: "auth" };

  const [allowed, state] = await Promise.all([pickableExams(supabase).then((l) => l.map((e) => e.id)), getOnboardingState(supabase)]);
  const v = validateAnswers(raw, { allowedExamIds: allowed });
  if (!v.ok) return { ok: false, code: "invalid", field: v.field };

  const a = v.value;
  // F0-a: computed on the server from the user's own goals — only exams step 2 showed pre-selected and the user
  // unticked are removed (never trusted from the client); every other goal is left exactly as it is
  const { remove } = goalChanges(shownGoals(state.answers.examIds, allowed), a.examIds);
  const { data, error } = await supabase.rpc("fn_save_onboarding", {
    p_action: "complete",
    p_language: a.language ?? undefined,
    p_exam_ids: a.examIds.length ? a.examIds : undefined,
    p_exam_date: a.examDate ?? undefined,
    p_attempt: a.attempt ?? undefined,
    p_daily_minutes: a.dailyMinutes ?? undefined,
    p_remove_exam_ids: remove.length ? remove : undefined,
  });
  const res = (data ?? {}) as { success?: boolean; code?: string; field?: string; removed?: unknown };
  if (error || !res.success) {
    console.error("[onboarding] save failed", { code: res.code ?? error?.code ?? null });
    return res.code === "INVALID_INPUT" ? { ok: false, code: "invalid", field: res.field } : { ok: false, code: "failed" };
  }
  const removed = Array.isArray(res.removed) ? res.removed.filter((x): x is string => typeof x === "string") : [];
  return { ok: true, removed };
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
