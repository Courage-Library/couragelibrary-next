import React from "react";
import { notFound } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isLeaderboardOptedIn } from "@/lib/assessment/leaderboard";
import { LeaderboardViewClient } from "@/components/assessment/leaderboard-view-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestLeaderboardPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const leaderboardData = await AssessmentService.getTestLeaderboard(id, user?.id, user ? isLeaderboardOptedIn(user.user_metadata) : null);
  if (!leaderboardData) notFound();

  return <LeaderboardViewClient data={leaderboardData} />;
}
