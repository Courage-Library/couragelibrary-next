import React from "react";
import { notFound } from "next/navigation";
import { DescriptiveService } from "@/services/descriptive.service";
import { FacultyEvalConsoleClient } from "./eval-console-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FacultyEvalConsolePage({ params }: Props) {
  const { id } = await params;
  const detail = await DescriptiveService.getSubmissionDetail(id);

  if (!detail || !detail.canEvaluate) {
    notFound();
  }

  return <FacultyEvalConsoleClient detail={detail} />;
}
