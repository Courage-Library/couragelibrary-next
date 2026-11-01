import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { sanitizeRedirectPath } from "@/lib/auth/safe-redirect";
import { isOnboardingEnabled } from "@/lib/onboarding/flag";
import { AGE_CONFIRM_PATH, isAgeGateEnabled, userNeedsAgeConfirmation } from "@/lib/auth/age-gate";
import { getOnboardingState, pickableExams } from "@/lib/onboarding/server";
import { firstSyllabusSection, shownGoals, todayInIndia, type PlanExam } from "@/lib/onboarding/schema";
import { ONBOARDING_COPY } from "@/content/onboarding";
import { OnboardingWizard } from "./onboarding-wizard";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { examSections } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: ONBOARDING_COPY.pageTitle, robots: { index: false, follow: false } };

/**
 * F0 onboarding (decision #76): ≤ 4 skippable steps → a deterministic plan. Behind ONBOARDING_ENABLED (default off →
 * 404). Signed-in users only. Answers are prefilled from the user's own saved state (editable later via the account
 * menu); `next` (where the user was going) is sanitized and honoured after skip / finish.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isOnboardingEnabled()) notFound();
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : "";
  const next = sanitizeRedirectPath(rawNext, "/dashboard");

  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state === "none") redirect(`/auth/login?next=${encodeURIComponent("/onboarding")}`);
  if (session.state === "error") redirect(`/auth/unavailable?next=${encodeURIComponent("/onboarding")}`);
  // AGE-18: the 18+ confirmation is step one and cannot be skipped (the middleware gates first; this is the backstop)
  if (isAgeGateEnabled() && userNeedsAgeConfirmation(session.user)) {
    redirect(`${AGE_CONFIRM_PATH}?next=${encodeURIComponent("/onboarding")}`);
  }

  const [state, exams] = await Promise.all([getOnboardingState(supabase), pickableExams(supabase)]);
  const sections = await Promise.all(
    exams.map((e) =>
      supabase
        .rpc("fn_exam_syllabus_read_model", { p_exam_id: e.id })
        .then(({ data, error }) => (error ? null : firstSyllabusSection(data)))
        .then(
          (s) => s,
          () => null,
        ),
    ),
  );
  // F2 (#79): topic practice + the 10-question diagnostic exist only with PRACTICE_ENABLED and only for an exam that
  // has at least one practice topic; otherwise both stay null and the plan points to the exam page (as in F0)
  const practiceReady = isPracticeEnabled()
    ? await Promise.all(exams.map((e) => examSections(supabase, e.id).then((s) => s.some((x) => x.topics.length > 0), () => false)))
    : exams.map(() => false);
  const planExams: PlanExam[] = exams.map((e, i) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    firstSection: sections[i],
    practiceHref: practiceReady[i] ? `/practice?exam=${encodeURIComponent(e.slug)}` : null,
    diagnosticHref: practiceReady[i] ? `/practice/session?exam=${encodeURIComponent(e.slug)}&mode=diagnostic` : null,
  }));

  // F0-a: existing active goals are shown pre-selected (pickable ones, max 3); the user decides what stays
  const initial = { ...state.answers, examIds: shownGoals(state.answers.examIds, exams.map((e) => e.id)) };
  return <OnboardingWizard exams={planExams} initial={initial} next={next} today={todayInIndia()} />;
}
