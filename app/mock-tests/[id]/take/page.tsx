import React from "react";
import { redirect } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { AdaptiveSessionService } from "@/services/adaptive/adaptive-session.service";
import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { MockTestPlayerClient } from "./player-client";

export const revalidate = 0;

interface AttemptRow {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  test_results?: Array<{ id?: string; total_score?: number | null; score?: number | null }> | { id?: string; total_score?: number | null; score?: number | null } | null;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestTakePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/mock-tests/${id}/take`);
  }

  // 1. Server-Authoritative Adaptive Detection
  const adaptiveDetection = await AdaptiveSessionService.detectAdaptiveTest(id, user.id, supabase);

  if (adaptiveDetection.isAdaptive) {
    const adaptiveSession = await AdaptiveSessionService.startOrResumeAdaptiveAttempt(
      {
        userId: user.id,
        identifier: id,
        overrideConfigId: adaptiveDetection.configId,
      },
      supabase
    );

    if (!adaptiveSession) {
      if (adaptiveDetection.attemptId) {
        redirect(`/mock-tests/${adaptiveDetection.attemptId}/result`);
      }
      redirect("/mock-tests");
    }

    return <MockTestPlayerClient session={adaptiveSession} />;
  }

  // 2. Fixed Mock Engine flow (100% untouched)
  const session = await AssessmentService.startOrResumeAttempt(id, user.id);

  if (!session) {
    const adminSb = createAdminServerSupabaseClient();

    // 1. If id is directly a completed attempt
    const { data: directAttempt } = await adminSb
      .from("test_attempts")
      .select("id, user_id, status, submitted_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (directAttempt) {
      redirect(`/mock-tests/${directAttempt.id}/result`);
    }

    // 2. If id is a mock_test_id, resolve today's completed attempt (for daily) or latest completed attempt
    const { data: userAttempts } = await adminSb
      .from("test_attempts")
      .select("id, started_at, status, submitted_at, test_results(id, total_score, score)")
      .eq("mock_test_id", id)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });

    const rawAttempts = (userAttempts as unknown as AttemptRow[]) || [];
    const attemptsList = rawAttempts.filter((a) =>
      a.submitted_at !== null || ["submitted", "completed", "evaluated"].includes(a.status)
    );

    if (attemptsList.length > 0) {
      const now = new Date();
      const istDateString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const todayDateIST = new Date(istDateString).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      const todayAttempts = attemptsList.filter((a) => {
        const attemptDateIST = new Date(a.started_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return attemptDateIST === todayDateIST;
      });

      const pool = todayAttempts.length > 0 ? todayAttempts : attemptsList;

      pool.sort((a, b) => {
        const trA = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
        const trB = Array.isArray(b.test_results) ? b.test_results[0] : b.test_results;
        const hasValidA = trA && ((trA.total_score !== undefined && trA.total_score !== null) || (trA.score !== undefined && trA.score !== null)) ? 1 : 0;
        const hasValidB = trB && ((trB.total_score !== undefined && trB.total_score !== null) || (trB.score !== undefined && trB.score !== null)) ? 1 : 0;
        if (hasValidA !== hasValidB) return hasValidB - hasValidA;
        const timeA = new Date(a.submitted_at || a.started_at).getTime();
        const timeB = new Date(b.submitted_at || b.started_at).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return String(b.id).localeCompare(String(a.id));
      });

      const targetAttempt = pool[0];
      if (targetAttempt) {
        redirect(`/mock-tests/${targetAttempt.id}/result`);
      }
    }

    redirect("/mock-tests");
  }

  return <MockTestPlayerClient session={session} />;
}