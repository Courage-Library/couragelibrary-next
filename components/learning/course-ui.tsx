import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, Clock, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress";
import { WEIGHTAGE_LABEL, type LessonStatus } from "@/lib/learning/course-view";
import { completedText, CURRENT_AFFAIRS_HREF, plural, topicsReadyText, type CourseLesson, type CourseSubject, type CourseTopic } from "@/lib/learning/course-structure";

/**
 * COURSE-UX-1 course pieces (server components, no client code): honest states only — a topic without a lesson is
 * "Coming soon" TEXT (never a link), counts are what exists, Practice shows its real count. English UI (R9), 48 px
 * targets (R10), state = icon + words (never colour alone), one solid primary per screen (R4: the Continue action).
 */

const TIER_TONE: Record<string, "primary" | "info" | "neutral"> = { HIGH_YIELD: "primary", CORE: "info" };

export function WeightageBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return <Badge tone={TIER_TONE[tier] ?? "neutral"}>{WEIGHTAGE_LABEL[tier] ?? tier}</Badge>;
}

export const STATUS_TEXT: Record<LessonStatus, string> = { COMPLETED: "Done", READING: "In progress", NOT_STARTED: "New" };

export function LessonStatusIcon({ status, locked }: { status: LessonStatus; locked?: boolean }) {
  if (locked) return <Lock aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" />;
  const Icon = status === "COMPLETED" ? CheckCircle2 : status === "READING" ? CircleDot : Circle;
  return <Icon aria-hidden="true" className={`size-5 shrink-0 ${status === "COMPLETED" ? "text-success-700" : status === "READING" ? "text-primary-700" : "text-fg-secondary"}`} />;
}

export function SubjectCard({ subject, href }: { subject: CourseSubject; href: string }) {
  const t = subject.totals;
  const ready = t.readyTopics > 0;
  return (
    <li className="flex">
      <Link href={href} className="focus-ring flex min-h-12 w-full items-start gap-4 rounded-card border border-line bg-surface p-4 hover:border-primary-300 hover:bg-ink-50" data-testid="course-subject">
        <ProgressRing label={`${subject.title} progress`} value={t.completed} max={Math.max(1, t.lessons)} valueText={completedText(t.completed, t.lessons)} size={56} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body-lg font-semibold text-fg">{subject.title}</span>
          <span className="text-body-sm text-fg-secondary">{ready ? topicsReadyText(t.readyTopics, t.topics) : "Lessons coming soon"}</span>
          <span className="flex flex-wrap gap-2 text-body-sm text-fg-secondary">
            {t.lessons > 0 && <span>{completedText(t.completed, t.lessons)}</span>}
            {t.highYield > 0 && <Badge tone="primary">{plural(t.highYield, "high-yield topic")}</Badge>}
            {t.practiceTopics > 0 && <span>Practice on {plural(t.practiceTopics, "topic")}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function LessonRow({ lesson }: { lesson: CourseLesson }) {
  const state = lesson.locked ? "Pro lesson, locked" : STATUS_TEXT[lesson.status];
  return (
    <li>
      <Link href={lesson.href} className="focus-ring flex min-h-12 items-center gap-3 rounded-control px-3 py-2 hover:bg-ink-50" data-testid="course-lesson">
        <LessonStatusIcon status={lesson.status} locked={lesson.locked} />
        <span className="flex-1 text-body text-fg">{lesson.name}</span>
        {lesson.minutes !== null && (
          <span className="inline-flex items-center gap-1 text-body-sm text-fg-secondary">
            <Clock aria-hidden="true" className="size-4" />
            {lesson.minutes} min
          </span>
        )}
        <span className="w-24 text-right text-body-sm text-fg-secondary">{state}</span>
        {lesson.access === "PRO" ? <Badge tone="pro">Pro</Badge> : null}
      </Link>
    </li>
  );
}

export function TopicBlock({ topic, open }: { topic: CourseTopic; open?: boolean }) {
  const first = topic.lessons.find((l) => l.status !== "COMPLETED" && !l.locked) ?? topic.lessons.find((l) => !l.locked) ?? null;
  const header = (
    <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-body-lg font-semibold text-fg">{topic.title}</span>
      <WeightageBadge tier={topic.weightageTier} />
      {topic.state === "CURRENT_AFFAIRS" ? (
        <span className="text-body-sm font-medium text-fg-secondary" data-testid="current-affairs-topic">
          Updated daily in Current Affairs
        </span>
      ) : topic.state === "READY" ? (
        <span className="text-body-sm text-fg-secondary">
          {topic.completed} of {topic.lessons.length} done
        </span>
      ) : (
        <span className="text-body-sm font-medium text-fg-secondary" data-testid="coming-soon">
          Coming soon
        </span>
      )}
    </span>
  );
  const actions = (
    <div className="flex flex-wrap gap-2">
      {topic.state === "CURRENT_AFFAIRS" ? (
        <ButtonLink href={CURRENT_AFFAIRS_HREF} variant="secondary" size="lg" className="min-h-12" data-testid="go-current-affairs">
          Go to Current Affairs
        </ButtonLink>
      ) : first ? (
        <ButtonLink href={first.href} variant="secondary" size="lg" className="min-h-12">
          Learn
        </ButtonLink>
      ) : null}
      {topic.practice && (
        <ButtonLink href={topic.practice.href} variant="secondary" size="lg" className="min-h-12" data-testid="topic-practice">
          {topic.practice.label}
        </ButtonLink>
      )}
    </div>
  );
  if (topic.state !== "READY") {
    return (
      <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center" data-testid="course-topic" data-state={topic.state === "CURRENT_AFFAIRS" ? "current-affairs" : "coming-soon"}>
        {header}
        {actions}
      </li>
    );
  }
  return (
    <li className="rounded-card border border-line bg-surface" data-testid="course-topic" data-state="ready">
      <details open={open} className="group">
        <summary className="focus-ring flex min-h-12 cursor-pointer list-none flex-col gap-3 rounded-card p-4 hover:bg-ink-50 sm:flex-row sm:items-center [&::-webkit-details-marker]:hidden">
          {header}
          <span className="text-body-sm text-fg-secondary group-open:hidden">Show lessons</span>
          <span className="hidden text-body-sm text-fg-secondary group-open:inline">Hide lessons</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <ul className="flex flex-col" aria-label={`Lessons in ${topic.title}`}>
            {topic.lessons.map((l) => (
              <LessonRow key={l.documentId} lesson={l} />
            ))}
          </ul>
          {actions}
        </div>
      </details>
    </li>
  );
}
