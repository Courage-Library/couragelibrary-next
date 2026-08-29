import React from "react";
import { redirect } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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

  const session = await AssessmentService.startOrResumeAttempt(id);

  if (!session) {
    // Attempt already submitted/completed — redirect to result page
    const { data: completedAttempt } = await supabase
      .from("test_attempts")
      .select("id")
      .eq("mock_test_id", id)
      .eq("user_id", user.id)
      .in("status", ["submitted", "completed", "evaluated"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const att = completedAttempt as { id: string } | null;
    if (att?.id) {
      redirect(`/mock-tests/${att.id}/result`);
    }

    redirect("/mock-tests");
  }

  return <MockTestPlayerClient session={session} />;
}