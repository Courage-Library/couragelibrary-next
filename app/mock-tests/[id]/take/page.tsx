import React from "react";
import { redirect } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { MockTestPlayerClient } from "./player-client";

export const revalidate = 0;

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
      .select("id, started_at, status, submitted_at")
      .eq("mock_test_id", id)
      .eq("user_id", user.id)
      .in("status", ["submitted", "completed", "evaluated"])
      .order("started_at", { ascending: false });

    if (userAttempts && userAttempts.length > 0) {
      const now = new Date();
      const istDateString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const todayDateIST = new Date(istDateString).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      const todayAttempt = userAttempts.find((a) => {
        const attemptDateIST = new Date(a.started_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return attemptDateIST === todayDateIST;
      });

      const targetAttempt = todayAttempt || userAttempts[0];
      if (targetAttempt) {
        redirect(`/mock-tests/${targetAttempt.id}/result`);
      }
    }

    redirect("/mock-tests");
  }

  return <MockTestPlayerClient session={session} />;
}