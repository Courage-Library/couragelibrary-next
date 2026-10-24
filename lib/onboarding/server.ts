import "server-only";

import { cookies } from "next/headers";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { onboardingRedirectDecision, type OnboardingAnswers, type OnboardingStatus, EMPTY_ANSWERS, LANGUAGES, ATTEMPTS, DAILY_MINUTES } from "@/lib/onboarding/schema";

/**
 * F0 onboarding (decision #76) — server side. Reads go through fn_get_my_onboarding (RLS: own rows only); until the
 * owner applies migration 091 that RPC does not exist, every read fails and the feature fails OPEN (no redirect, no
 * card). Roles are never read here (#60).
 */

/** Set once when we redirect a signed-in user to /onboarding, so it never happens again on this device. */
export const ONBOARDING_PROMPTED_COOKIE = "cl_onb_prompted";

export type OnboardingState = { status: OnboardingStatus; answers: OnboardingAnswers };

/** The caller's own onboarding state; any error (no session, RPC missing / failing) → status null. */
export async function getOnboardingState(supabase: AppSupabaseClient): Promise<OnboardingState> {
  try {
    const { data, error } = await supabase.rpc("fn_get_my_onboarding");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { status: null, answers: EMPTY_ANSWERS };
    const d = data as Record<string, unknown>;
    const pick = <T,>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null);
    return {
      status: { completed: Boolean(d.completed_at), skipped: Boolean(d.skipped_at) },
      answers: {
        language: pick(d.language, LANGUAGES),
        // ALL active goals in priority order (F0-a): callers derive what step 2 shows with shownGoals()
        examIds: Array.isArray(d.exam_ids) ? d.exam_ids.filter((x): x is string => typeof x === "string").slice(0, 50) : [],
        examDate: typeof d.exam_date === "string" ? d.exam_date : null,
        attempt: pick(d.attempt_band, ATTEMPTS),
        dailyMinutes: pick(d.daily_minutes, DAILY_MINUTES),
      },
    };
  } catch {
    return { status: null, answers: EMPTY_ANSWERS };
  }
}

/**
 * Post-login target (server actions / route handlers only: may set a cookie). `target` must already be sanitized
 * (lib/auth/safe-redirect). Redirects to /onboarding at most once per device, then the user is never nagged again.
 */
export async function postLoginTarget(supabase: AppSupabaseClient, target: string): Promise<string> {
  if (!isOnboardingEnabled()) return target;
  const jar = await cookies();
  if (jar.get(ONBOARDING_PROMPTED_COOKIE)?.value) return target;
  const { status } = await getOnboardingState(supabase);
  const next = onboardingRedirectDecision({ enabled: true, alreadyPrompted: false, status, target });
  if (next !== target) {
    jar.set(ONBOARDING_PROMPTED_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  }
  return next;
}

export type PickableExam = { id: string; title: string; slug: string };

/** Active exams that have at least one cycle (the RPC refuses exams without one; no cycle is ever created). */
export async function pickableExams(supabase: AppSupabaseClient): Promise<PickableExam[]> {
  try {
    const [examsRes, cyclesRes] = await Promise.all([
      supabase.from("exams").select("id, title, slug").eq("is_active", true).order("title", { ascending: true }),
      supabase.from("exam_cycles").select("exam_id"),
    ]);
    if (examsRes.error || cyclesRes.error) return [];
    const withCycle = new Set((cyclesRes.data ?? []).map((c) => c.exam_id));
    return (examsRes.data ?? []).filter((e) => withCycle.has(e.id) && e.slug).map((e) => ({ id: e.id, title: e.title, slug: e.slug }));
  } catch {
    return [];
  }
}
