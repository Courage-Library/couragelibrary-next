import React from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { RevisionHealthSummary } from "@/services/mistake.service";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";

// Display-only plain-language names for the service's due states (services stay unchanged).
const DUE_LABELS: Record<string, string> = {
  "Due for Revision": "Due now",
  "Needs Attention": "New mistake",
  "Due for 2nd Verification": "One more correct answer to master",
  "Improving (Streak 1/2)": "Correct once",
  "Retention Refresher": "Refresh: mastered over 14 days ago",
  Mastered: "Mastered",
};
export const plainDueLabel = (label: string) => DUE_LABELS[label] ?? label;

interface MistakeRevisionHealthProps {
  intelligence: RevisionHealthSummary;
}

/**
 * "Revise today": the page's primary task and its one primary action (UX-2b.3, Operate mode).
 * Renders nothing when the student has no mistakes (the list shows the empty state instead).
 */
export function MistakeRevisionToday({ intelligence }: MistakeRevisionHealthProps) {
  const { totalMistakes, dueForRevisionCount, highPriorityCount, nextBestRevisions } = intelligence;
  if (totalMistakes === 0) return null;
  const top = (nextBestRevisions ?? []).slice(0, 3);

  return (
    <Card as="section" aria-labelledby="revise-today-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <CardHeader>
          <CardTitle as="h2" id="revise-today-title">
            Revise today
          </CardTitle>
          <CardDescription className="text-body">
            {dueForRevisionCount === 0
              ? "Nothing is due right now. A drill still helps you master what is left."
              : `${dueForRevisionCount} ${dueForRevisionCount === 1 ? "mistake is" : "mistakes are"} due for revision${
                  highPriorityCount > 0 ? `, ${highPriorityCount} of them high priority` : ""
                }.`}
          </CardDescription>
        </CardHeader>
        <ButtonLink href="/mistakes/drill" variant="primary" className="w-full sm:w-auto">
          Start a drill
        </ButtonLink>
      </div>

      {top.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-body font-semibold text-fg">Revise these first</h3>
          <ol className="flex flex-col divide-y divide-line rounded-card border border-line">
            {top.map((item, idx) => {
              const name = item.topicName || item.subjectName || `question ${idx + 1}`;
              return (
                <li key={item.vaultId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-semibold text-fg">{idx + 1}.</span>
                      <Badge tone="warning">{plainDueLabel(item.dueLabel)}</Badge>
                      {item.topicName && <span className="text-body-sm font-medium text-fg">{item.topicName}</span>}
                      {item.subjectName && <span className="text-body-sm text-fg-secondary">{item.subjectName}</span>}
                    </div>
                    <p className="line-clamp-2 text-body-sm text-fg-secondary">{item.questionText}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.hasLearningContent && item.learningResourceUrl && (
                      <ButtonLink href={item.learningResourceUrl} variant="ghost" leadingIcon={<BookOpen aria-hidden="true" className="size-4" />}>
                        Learn<span className="sr-only">: {name}</span>
                      </ButtonLink>
                    )}
                    <ButtonLink href={item.drillUrl} variant="secondary">
                      Drill<span className="sr-only"> this mistake: {name}</span>
                    </ButtonLink>
                    <ButtonLink
                      href={`/mistakes/${item.vaultId}`}
                      variant="ghost"
                      iconOnly
                      aria-label={`Open mistake: ${name}`}
                    >
                      <ArrowRight aria-hidden="true" className="size-5" />
                    </ButtonLink>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}

/** "Revision plan" details for the insights accordion (secondary analytics). */
export function MistakeRevisionPlan({ intelligence }: MistakeRevisionHealthProps) {
  const { totalMistakes, masteredCount, healthScorePct, improvingCount, patterns } = intelligence;
  if (totalMistakes === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <StatTile
          label="Mastered"
          value={`${masteredCount} of ${totalMistakes}`}
          hint="Answered correctly twice in a row in a drill"
        />
        <StatTile label="Correct once" value={improvingCount} hint="One more correct answer to master" />
        <StatTile
          label="Revision score"
          value={`${healthScorePct} / 100`}
          hint="Combines what you have mastered, your drill progress and how much is overdue"
        />
      </div>
      {(patterns.subjectConcentration || patterns.primaryCognitiveMode || patterns.weakestTopic) && (
        <ul className="flex flex-col gap-2 text-body-sm text-fg">
          {patterns.subjectConcentration && (
            <li>
              {patterns.subjectConcentration.sharePct}% of your mistakes are in{" "}
              <strong className="font-semibold">{patterns.subjectConcentration.name}</strong>.
            </li>
          )}
          {patterns.primaryCognitiveMode && (
            <li>
              Most common reason: <strong className="font-semibold">{patterns.primaryCognitiveMode.name}</strong>
              {patterns.primaryCognitiveMode.hasConfidence ? "." : " (early sign, based on few mistakes)."}
            </li>
          )}
          {patterns.weakestTopic && (
            <li>
              Weakest topic: <strong className="font-semibold">{patterns.weakestTopic.name}</strong>.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
