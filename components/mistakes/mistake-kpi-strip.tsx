import React from "react";
import { StatTile } from "@/components/ui/stat-tile";

interface MistakeKpiStripProps {
  activeMistakesCount: number;
  unresolvedCount: number;
  repeatedCount: number;
  revisitingCount: number;
  masteredCount: number;
  /** Kept for API compatibility; filtering lives in the filter bar (real links). */
  currentStatus?: string;
  isRepeated?: boolean;
}

/** Counts of the student's own mistakes (plain counts, never ratios, so 0 is an honest value). */
export function MistakeKpiStrip({ activeMistakesCount, unresolvedCount, repeatedCount, revisitingCount, masteredCount }: MistakeKpiStripProps) {
  const tiles = [
    { label: "To revise", value: activeMistakesCount, hint: "Not mastered yet" },
    { label: "Needs revision", value: unresolvedCount, hint: "Not yet answered correctly" },
    { label: "Repeated", value: repeatedCount, hint: "Wrong 2 or more times" },
    { label: "In progress", value: revisitingCount, hint: "Correct once in a drill" },
    { label: "Mastered", value: masteredCount, hint: "Correct twice in a row" },
  ];
  return (
    <section aria-labelledby="mistake-counts-title">
      <h2 id="mistake-counts-title" className="sr-only">
        Your mistakes in numbers
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label}>
            <StatTile label={t.label} value={t.value} hint={t.hint} className="h-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
