import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle, CircleDot, Lock } from "lucide-react";
import { Badge } from "../badge";
import { cn } from "../cn";
import { ProgressRing } from "../progress";

export type TopicStatus = "not_started" | "in_progress" | "mastered" | "locked";
export type WeightageTier = "high" | "medium" | "low";

const STATUS: Record<TopicStatus, { label: string; Icon: typeof Circle; icon: string }> = {
  not_started: { label: "Not started", Icon: Circle, icon: "text-fg-muted" },
  in_progress: { label: "In progress", Icon: CircleDot, icon: "text-primary-600" },
  mastered: { label: "Mastered", Icon: CheckCircle2, icon: "text-success-600" },
  locked: { label: "Included in Pro", Icon: Lock, icon: "text-fg-muted" },
};

const TIER: Record<WeightageTier, { label: string; tone: "primary" | "neutral" | "info" }> = {
  high: { label: "High weightage", tone: "primary" },
  medium: { label: "Medium weightage", tone: "info" },
  low: { label: "Low weightage", tone: "neutral" },
};

export function WeightageChip({ tier }: { tier: WeightageTier }) {
  return <Badge tone={TIER[tier].tone}>{TIER[tier].label}</Badge>;
}

export type TopicNodeProps = {
  name: string;
  href?: string;
  status: TopicStatus;
  weightageTier?: WeightageTier | null;
  /** The topic the student is on now. */
  current?: boolean;
};

/** One topic row. Status is icon + text (never colour alone). */
export function TopicNode({ name, href, status, weightageTier, current = false }: TopicNodeProps) {
  const s = STATUS[status];
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <s.Icon aria-hidden="true" className={cn("size-5 shrink-0", s.icon)} />
      <span className={cn("truncate", status === "locked" ? "text-fg-secondary" : "text-fg")}>{name}</span>
    </span>
  );
  return (
    <li
      className={cn(
        "flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control px-3 py-2",
        current && "bg-primary-50 ring-1 ring-primary-200",
      )}
      aria-current={current ? "step" : undefined}
    >
      {href && status !== "locked" ? (
        <Link href={href} className="focus-ring min-w-0 rounded-badge hover:underline">
          {label}
        </Link>
      ) : (
        label
      )}
      <span className="flex items-center gap-2 text-body-sm text-fg-secondary">
        {weightageTier && <WeightageChip tier={weightageTier} />}
        <span>{s.label}</span>
      </span>
    </li>
  );
}

export type SubjectNodeProps = {
  name: string;
  /** Topics mastered / total, for the ring. */
  mastered: number;
  total: number;
  defaultOpen?: boolean;
  headingLevel?: 2 | 3;
  children: React.ReactNode;
};

/**
 * Expandable subject with its topics. Native <details>/<summary> (keyboard and screen-reader support
 * without JavaScript); the topic list is a plain nested list, not an ARIA tree.
 */
export function SubjectNode({ name, mastered, total, defaultOpen = false, headingLevel = 3, children }: SubjectNodeProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <details open={defaultOpen} className="group rounded-card border border-line bg-surface">
      <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3 hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
        <ProgressRing label={`${name} progress`} value={mastered} max={Math.max(total, 1)} valueText={`${mastered} of ${total} topics mastered`} size={44} />
        <Heading className="flex-1 text-body-lg font-semibold text-fg">{name}</Heading>
        <span className="text-body-sm text-fg-secondary">
          {mastered}/{total}
          <span className="sr-only"> topics mastered</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-5 text-fg-secondary transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="flex flex-col gap-1 border-t border-line p-2">{children}</ul>
    </details>
  );
}
