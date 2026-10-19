import React from "react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

interface CognitiveItem {
  id: string;
  name: string;
  count: number;
  description: string;
}

interface WeakTopic {
  topicId: string;
  topicName: string;
  mistakeCount: number;
}

const plural = (n: number) => `${n} ${n === 1 ? "mistake" : "mistakes"}`;

/**
 * "Why you got it wrong": one filter link per mistake type. The hrefs keep the existing /mistakes query contract
 * (?cognitive=<id>[&status=<status>]); selecting the active type again clears it.
 */
export function MistakeReasons({
  cognitiveBreakdown,
  currentCognitive,
  currentStatus,
}: {
  cognitiveBreakdown: CognitiveItem[];
  currentCognitive?: string;
  currentStatus?: string;
}) {
  const statusQs = currentStatus && currentStatus !== "ALL" ? `status=${currentStatus}` : "";
  const withMistakes = cognitiveBreakdown.filter((c) => c.count > 0);
  if (withMistakes.length === 0) {
    return <p className="text-body-sm text-fg-secondary">No reasons recorded yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {withMistakes.map((cog) => {
        const isSelected = currentCognitive === cog.id;
        const href = isSelected
          ? `/mistakes${statusQs ? `?${statusQs}` : ""}`
          : `/mistakes?cognitive=${cog.id}${statusQs ? `&${statusQs}` : ""}`;
        return (
          <li key={cog.id}>
            <Link
              href={href}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "focus-ring flex min-h-11 items-center justify-between gap-3 rounded-control border px-3 py-2 transition-colors duration-120 ease-standard",
                isSelected ? "border-primary-600 bg-primary-50 text-fg" : "border-line bg-surface text-fg hover:bg-ink-50",
              )}
            >
              {/* name only: the stored descriptions use system wording ("telemetry", "deterministically"), which
                  UX-1b keeps out of student UI; the description is data, so it is not shown rather than edited */}
              <span className="min-w-0 text-body-sm font-semibold">{cog.name}</span>
              <span className="shrink-0 text-body-sm font-semibold tabular-nums text-fg">
                {cog.count}
                <span className="sr-only"> {cog.count === 1 ? "mistake" : "mistakes"}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "Topics to focus on": the student's topics with the most mistakes. */
export function MistakeFocusTopics({ weakTopics }: { weakTopics: WeakTopic[] }) {
  if (weakTopics.length === 0) {
    return <p className="text-body-sm text-fg-secondary">No topic stands out yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {weakTopics.map((wt) => (
        <li key={wt.topicId} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0 truncate text-body-sm font-medium text-fg">{wt.topicName}</span>
          <span className="shrink-0 text-body-sm text-fg-secondary">{plural(wt.mistakeCount)}</span>
        </li>
      ))}
    </ul>
  );
}
