import React from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestRunnerService } from "@/services/live-test-runner.service";
import { LiveTestPlayerClient } from "@/components/live-test/live-test-player-client";

export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LiveTestTakePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/live-tests/${slug}/take`);
  }

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

  return <LiveTestPlayerClient session={result.session} />;
}
