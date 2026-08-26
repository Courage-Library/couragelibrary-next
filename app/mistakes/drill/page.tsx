import React from "react";

import { MistakeService } from "@/services/mistake.service";
import { DrillPlayerClient } from "./drill-client";

export const revalidate = 0; // Dynamic server

export default async function MistakeDrillPage() {
  const drillPayload = await MistakeService.generateMistakeDrill();

  if (!drillPayload.success || !drillPayload.drill_id || !drillPayload.questions || drillPayload.questions.length === 0) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto px-4">
        <h2 className="text-xl font-bold text-slate-900">No Active Mistakes Available</h2>
        <p className="text-xs text-slate-500">
          You have 0 unmastered mistakes in your vault! Attempt new mock tests to log and practice errors.
        </p>
      </div>
    );
  }

  return (
    <DrillPlayerClient
      drillId={drillPayload.drill_id}
      questions={drillPayload.questions}
    />
  );
}