import { requireFeatureOrNotFound } from "@/lib/features/gates";
import React from "react";
import { notFound, redirect } from "next/navigation";
import { loginRedirectPath } from "@/lib/auth/safe-redirect";
import { LiveTestResultService } from "@/services/live-test-result.service";
import { LiveTestResultClient } from "@/components/live-test/live-test-result-client";
import { getServerSession } from "@/lib/auth/session";
import { SessionUnavailable } from "@/components/auth/session-unavailable";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LiveTestResultPage({ params }: Props) {
  requireFeatureOrNotFound("LIVE_TESTS");
  const { slug } = await params;
  // AUTH-1 2a: tri-state session — a Supabase outage shows a retry state, never a login redirect or data
  const session = await getServerSession();
  if (session.state === "error") return <SessionUnavailable />;
  if (session.state === "none") redirect(loginRedirectPath(`/live-tests/${encodeURIComponent(slug)}/result`));
  const user = session.user;

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
