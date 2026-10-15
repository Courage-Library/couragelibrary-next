import { CalendarClock, Clock, FileQuestion } from "lucide-react";
import { Badge } from "../badge";
import { ButtonLink } from "../button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../card";
import { formatDateShort, formatScore } from "@/lib/format";

export type TestCardState =
  | { kind: "available"; startHref: string }
  | { kind: "locked"; upgradeHref: string }
  | { kind: "in_progress"; resumeHref: string }
  | { kind: "attempted"; score: number; maxScore: number; resultHref: string }
  | { kind: "scheduled"; opensAt: string }
  | { kind: "expired" };

export type TestCardProps = {
  title: string;
  testType: "sectional" | "full_length" | "daily";
  /** e.g. "Mock 4" in a series. */
  seriesLabel?: string;
  questions: number;
  durationMinutes: number;
  totalMarks?: number;
  access: "free" | "pro";
  state: TestCardState;
  className?: string;
};

const TYPE_LABEL = { sectional: "Sectional", full_length: "Full-length", daily: "Daily" };

/** Mock / series item. The CTA label always states the action. */
export function TestCard({ title, testType, seriesLabel, questions, durationMinutes, totalMarks, access, state, className }: TestCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{TYPE_LABEL[testType]}</Badge>
          <Badge tone={access} />
          {state.kind === "in_progress" && <Badge tone="warning">In progress</Badge>}
          {state.kind === "attempted" && <Badge tone="success">Attempted</Badge>}
          {state.kind === "expired" && <Badge tone="neutral">Closed</Badge>}
        </div>
        <CardTitle>
          {seriesLabel && <span className="text-fg-secondary">{seriesLabel} · </span>}
          {title}
        </CardTitle>
        <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <FileQuestion aria-hidden="true" className="size-4" />
            {questions} questions
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="size-4" />
            {durationMinutes} min
          </span>
          {totalMarks != null && <span>{totalMarks} marks</span>}
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-between">
        {state.kind === "attempted" && (
          <span className="text-body-sm text-fg-secondary">
            Score <span className="font-semibold tabular-nums text-fg">{formatScore(state.score, state.maxScore)}</span>
          </span>
        )}
        {state.kind === "scheduled" && (
          <span className="inline-flex items-center gap-1 text-body-sm text-fg-secondary">
            <CalendarClock aria-hidden="true" className="size-4" />
            Opens {formatDateShort(state.opensAt)}
          </span>
        )}
        {state.kind === "available" && (
          <ButtonLink href={state.startHref} className="ml-auto" aria-label={`Start ${title}`}>
            Start
          </ButtonLink>
        )}
        {state.kind === "in_progress" && (
          <ButtonLink href={state.resumeHref} className="ml-auto" aria-label={`Resume ${title}`}>
            Resume
          </ButtonLink>
        )}
        {state.kind === "attempted" && (
          <ButtonLink href={state.resultHref} variant="secondary" aria-label={`View result of ${title}`}>
            View result
          </ButtonLink>
        )}
        {state.kind === "locked" && (
          <ButtonLink href={state.upgradeHref} variant="secondary" className="ml-auto" aria-label={`Unlock ${title} with Pro`}>
            Unlock with Pro
          </ButtonLink>
        )}
        {state.kind === "expired" && <span className="text-body-sm text-fg-secondary">This test is closed.</span>}
      </CardFooter>
    </Card>
  );
}
