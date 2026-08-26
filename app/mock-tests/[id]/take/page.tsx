import React from "react";
import { redirect } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { MockTestPlayerClient } from "./player-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestTakePage({ params }: Props) {
  const { id } = await params;
  const session = await AssessmentService.startOrResumeAttempt(id);

  if (!session) {
    redirect("/auth/login");
  }

  return <MockTestPlayerClient session={session} />;
}