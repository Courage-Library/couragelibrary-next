import { requireFeatureOrNotFound } from "@/lib/features/gates";
import React from "react";
import { redirect } from "next/navigation";
import { LiveTestRunnerService } from "@/services/live-test-runner.service";
import { LiveTestPlayerClient } from "@/components/live-test/live-test-player-client";
import { getServerSession } from "@/lib/auth/session";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { loginRedirectPath } from "@/lib/auth/safe-redirect";
import { NoGlassZone } from "@/components/ui/no-glass-zone";

export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LiveTestTakePage({ params }: Props) {
  requireFeatureOrNotFound("LIVE_TESTS");
  const { slug } = await params;
  // AUTH-1 2a: tri-state session — a Supabase outage shows a retry state, never a login redirect or data
  const session = await getServerSession();
  if (session.state === "error") return <SessionUnavailable />;
  if (session.state === "none") redirect(loginRedirectPath(`/live-tests/${slug}/take`));
  const user = session.user;

  const result = await LiveTestRunnerService.startOrResumeLiveAttempt(slug, user.id);

  if (!result.success) {
    if (result.code === "ATTEMPT_ALREADY_SUBMITTED") {
      redirect(`/live-tests/${slug}/submitted`);
    }
    redirect(`/live-tests/${slug}?error=${encodeURIComponent(result.error || "Unable to start live test")}`);
  }

  if (!result.session) {
    redirect(`/live-tests/${slug}`);
  }

  return (
    <NoGlassZone>
      <LiveTestPlayerClient session={result.session} />
    </NoGlassZone>
  );
}
