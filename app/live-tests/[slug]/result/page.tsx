import React from "react";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestResultService } from "@/services/live-test-result.service";
import { LiveTestResultClient } from "@/components/live-test/live-test-result-client";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LiveTestResultPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/live-tests/${slug}/result`);
  }

  const resultData = await LiveTestResultService.getCandidateScorecard(slug, user.id);
  if (!resultData) {
    notFound();
  }

  const leaderboardData = resultData.isPublished
    ? await LiveTestResultService.getLiveTestLeaderboard(slug, 1, 50, user.id)
    : { entries: [], total: 0, snapshot: null, currentUserEntry: null };

  return (
    <LiveTestResultClient
      data={resultData}
      leaderboard={leaderboardData}
      currentUserId={user.id}
    />
  );
}
