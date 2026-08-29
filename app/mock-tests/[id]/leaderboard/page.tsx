import React from "react";
import { notFound } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeaderboardViewClient } from "@/components/assessment/leaderboard-view-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestLeaderboardPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const leaderboardData = await AssessmentService.getTestLeaderboard(id, user?.id);

  if (!leaderboardData) {
    notFound();
  }

  return <LeaderboardViewClient data={leaderboardData} />;
}
