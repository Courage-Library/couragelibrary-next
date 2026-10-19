import React from "react";
import { AlertTriangle, BookOpen, CheckCircle2, RotateCcw, Sparkles, StickyNote } from "lucide-react";
import { MistakeListItem } from "@/services/mistake.service";
import { MistakeBookmarkButton } from "@/components/mistakes/mistake-bookmark-button";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format";

interface MistakeCardProps {
  mistake: MistakeListItem;
  isBookmarked?: boolean;
  learningContent?: {
    hasContent: boolean;
    title?: string;
    canonicalUrl?: string;
    isLocked?: boolean;
  } | null;
}

const STATUS: Record<string, { tone: BadgeTone; label: string; Icon: typeof CheckCircle2 }> = {
  MASTERED: { tone: "success", label: "Mastered", Icon: CheckCircle2 },
  REVISITING: { tone: "info", label: "Correct once", Icon: Sparkles },
};
const NEEDS_REVISION = { tone: "danger" as BadgeTone, label: "Needs revision", Icon: AlertTriangle };

export function MistakeCard({ mistake, isBookmarked = false, learningContent }: MistakeCardProps) {
  const status = STATUS[mistake.lifecycleStatus] ?? NEEDS_REVISION;
  const timesWrong = mistake.totalMistakesCount;
  const lastWrong = mistake.lastMistakeAt ? formatDateShort(mistake.lastMistakeAt) : null;
  // context for repeated link names ("Review solution: Percentage")
  const name = mistake.topicName || mistake.subjectName || mistake.questionText.slice(0, 60);

  return (
    <Card as="article" padding="sm" aria-label={`Mistake: ${name}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} icon={<status.Icon aria-hidden="true" className="size-3.5" />}>
            {status.label}
          </Badge>
          {timesWrong >= 2 && (
            <Badge tone="warning" icon={<RotateCcw aria-hidden="true" className="size-3.5" />}>
              Wrong {timesWrong} times
            </Badge>
          )}
          {mistake.hasRepeatedForgetting && <Badge tone="danger">Wrong again after revising</Badge>}
          {mistake.decayState === "REFRESH_DUE" && <Badge tone="info">Refresh due</Badge>}
          {mistake.primaryCognitiveName && <Badge tone="neutral">{mistake.primaryCognitiveName}</Badge>}
          {mistake.hasNote && (
            <Badge tone="neutral" icon={<StickyNote aria-hidden="true" className="size-3.5" />}>
              Note
            </Badge>
          )}
        </div>
        <MistakeBookmarkButton questionId={mistake.questionId} initialBookmarked={isBookmarked} variant="icon" />
      </div>

      <p className="line-clamp-2 text-body text-fg">{mistake.questionText}</p>

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-body-sm text-fg-secondary">
        {(mistake.subjectName || mistake.topicName) && (
          <span>{[mistake.subjectName, mistake.topicName].filter(Boolean).join(" › ")}</span>
        )}
        <span>Drill streak {mistake.consecutiveCorrect} of 2</span>
        {lastWrong && <span>Last wrong {lastWrong}</span>}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <ButtonLink href={`/mistakes/${mistake.vaultId}`} variant="secondary">
          Review solution<span className="sr-only">: {name}</span>
        </ButtonLink>
        <ButtonLink href={`/mistakes/drill?vaultId=${mistake.vaultId}`} variant="ghost">
          Drill<span className="sr-only"> this mistake: {name}</span>
        </ButtonLink>
        {learningContent?.hasContent && learningContent.canonicalUrl && (
          <ButtonLink
            href={learningContent.canonicalUrl}
            variant="ghost"
            leadingIcon={<BookOpen aria-hidden="true" className="size-4" />}
          >
            Study topic<span className="sr-only">: {name}</span>
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}
