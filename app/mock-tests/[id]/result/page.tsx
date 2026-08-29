import React from "react";
import { notFound } from "next/navigation";
import { AssessmentService } from "@/services/assessment.service";
import { ResultViewClient } from "@/components/assessment/result-view-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MockTestResultPage({ params }: Props) {
  const { id } = await params;
  const data = await AssessmentService.getTestResult(id);

  if (!data) {
    notFound();
  }

  return <ResultViewClient data={data} />;
}