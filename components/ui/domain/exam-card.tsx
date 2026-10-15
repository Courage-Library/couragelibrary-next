import { CalendarDays } from "lucide-react";
import { Badge } from "../badge";
import { Card, CardLink } from "../card";
import { cn } from "../cn";
import { formatDateShort, formatNumber } from "@/lib/format";

export type ExamCardProps = {
  href: string;
  name: string;
  conductingBody?: string | null;
  /** Up to 4 letters shown when there is no logo, e.g. "CGL". */
  initials: string;
  /** ISO date of the next exam event; omitted when unknown (never guessed). */
  nextDate?: string | null;
  nextDateLabel?: string;
  counts?: { mocks?: number | null; topics?: number | null };
  /** Shown as a badge, e.g. "2026 cycle". */
  activeCycleLabel?: string | null;
  isYourExam?: boolean;
  variant?: "directory" | "compact";
  className?: string;
};

/** Exam directory card; the whole card is one link (the exam name). */
export function ExamCard({
  href,
  name,
  conductingBody,
  initials,
  nextDate,
  nextDateLabel = "Next exam",
  counts,
  activeCycleLabel,
  isYourExam = false,
  variant = "directory",
  className,
}: ExamCardProps) {
  const compact = variant === "compact";
  return (
    <Card variant="interactive" padding={compact ? "sm" : "md"} className={cn(compact ? "flex-row items-center" : "", className)}>
      <div className={cn("flex items-start gap-3", compact && "items-center")}>
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-control bg-primary-50 font-semibold text-primary-800",
            compact ? "size-10 text-caption" : "size-12 text-body-sm",
          )}
        >
          {initials.slice(0, 4)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className={cn("font-semibold text-fg", compact ? "text-body" : "text-h3")}>
            <CardLink href={href}>{name}</CardLink>
          </h3>
          {conductingBody && <p className="text-body-sm text-fg-secondary">{conductingBody}</p>}
          {(isYourExam || activeCycleLabel) && (
            <div className="flex flex-wrap gap-1.5">
              {isYourExam && <Badge tone="primary">Your exam</Badge>}
              {activeCycleLabel && <Badge tone="neutral">{activeCycleLabel}</Badge>}
            </div>
          )}
        </div>
      </div>
      {!compact && (nextDate || counts) && (
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-body-sm">
          {nextDate && (
            <div className="flex items-center gap-1.5">
              <CalendarDays aria-hidden="true" className="size-4 text-fg-muted" />
              <dt className="text-fg-secondary">{nextDateLabel}:</dt>
              <dd className="font-medium text-fg">{formatDateShort(nextDate)}</dd>
            </div>
          )}
          {counts?.mocks != null && (
            <div className="flex gap-1.5">
              <dt className="text-fg-secondary">Mocks</dt>
              <dd className="font-medium tabular-nums text-fg">{formatNumber(counts.mocks)}</dd>
            </div>
          )}
          {counts?.topics != null && (
            <div className="flex gap-1.5">
              <dt className="text-fg-secondary">Topics</dt>
              <dd className="font-medium tabular-nums text-fg">{formatNumber(counts.topics)}</dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}
