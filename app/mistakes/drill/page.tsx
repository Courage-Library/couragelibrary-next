import React from "react";
import { MistakeService, DrillSessionPayload } from "@/services/mistake.service";
import { MistakeDrillPageClient } from "./drill-client";

export const revalidate = 0; // Dynamic server

interface DrillPageProps {
  searchParams: Promise<{
    drillId?: string;
    subjectId?: string;
    topicId?: string;
    focus?: "ALL" | "UNRESOLVED" | "REPEATED" | "BOOKMARKED";
    vaultId?: string;
  }>;
}

export default async function MistakeDrillPage({ searchParams }: DrillPageProps) {
  const params = await searchParams;
  let initialDrill: DrillSessionPayload | null = null;

  if (params.drillId) {
    initialDrill = await MistakeService.getMistakeDrill(params.drillId);
  }

  const { subjects, cognitiveTypes } = await MistakeService.getAvailableFilterOptions();

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto min-h-[calc(100vh-4rem)]">
      <MistakeDrillPageClient
        initialDrill={initialDrill}
        initialSubjectId={params.subjectId}
        initialTopicId={params.topicId}
        initialFocus={params.focus}
        initialSingleVaultId={params.vaultId}
        subjects={subjects}
        cognitiveTypes={cognitiveTypes}
      />
    </div>
  );
}
