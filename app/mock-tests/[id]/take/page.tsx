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
    // Attempt either already completed or expired and submitted
    redirect("/mock-tests");
  }

  return <MockTestPlayerClient session={session} />;
}