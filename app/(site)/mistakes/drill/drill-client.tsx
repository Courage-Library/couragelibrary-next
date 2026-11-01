"use client";

import React, { useState } from "react";
import { MistakeDrillCustomizer } from "@/components/mistakes/mistake-drill-customizer";
import { MistakeDrillRunner } from "@/components/mistakes/mistake-drill-runner";
import { DrillSessionPayload } from "@/services/mistake.service";

interface MistakeDrillPageClientProps {
  initialDrill?: DrillSessionPayload | null;
  initialSubjectId?: string;
  initialTopicId?: string;
  initialFocus?: "ALL" | "UNRESOLVED" | "REPEATED" | "BOOKMARKED";
  initialSingleVaultId?: string;
  subjects?: Array<{ id: string; name: string }>;
  cognitiveTypes?: Array<{ id: string; name: string }>;
}

export function MistakeDrillPageClient({
  initialDrill,
  initialSubjectId,
  initialTopicId,
  initialFocus,
  initialSingleVaultId,
  subjects = [],
  cognitiveTypes = [],
}: MistakeDrillPageClientProps) {
  const [activeDrill, setActiveDrill] = useState<DrillSessionPayload | null>(initialDrill || null);

  if (activeDrill?.success && activeDrill.drill_id && activeDrill.questions && activeDrill.questions.length > 0) {
    return (
      <MistakeDrillRunner
        drillId={activeDrill.drill_id}
        initialQuestions={activeDrill.questions}
        mode={activeDrill.mode || "PRACTICE"}
        onFinish={() => setActiveDrill(null)}
      />
    );
  }

  return (
    <MistakeDrillCustomizer
      initialSubjectId={initialSubjectId}
      initialTopicId={initialTopicId}
      initialFocus={initialFocus}
      initialSingleVaultId={initialSingleVaultId}
      subjects={subjects}
      cognitiveTypes={cognitiveTypes}
      onDrillGenerated={(payload) => setActiveDrill(payload)}
    />
  );
}
