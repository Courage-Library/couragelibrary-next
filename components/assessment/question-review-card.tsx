import React from "react";
import Link from "next/link";
import { Archive, BookOpen, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerKeyUnavailableNotice } from "@/components/questions/answer-key-notice";
import { ReportQuestionButton } from "@/components/practice/report-question-button";
import { AddToMemoryLockButton } from "@/components/memory-lock/add-to-memory-lock-button";
import { CorrectedVersion } from "@/components/questions/corrected-version";
import { Tooltip } from "@/components/ui/tooltip";
import type { VersionSnapshot } from "@/lib/questions/correction-core";
import { fmtShort, learnHref, questionState, statusChip } from "@/lib/assessment/result-ux";

/**
 * RESULT-UX-1 (owner spec §2.9–§2.11) — one reviewed question, the same block for wrong, skipped and correct:
 *   header: "Q 52 · Section · Topic", a status chip ("Wrong · −0.5" / "Correct · +2" / "Skipped · 0"), time spent if
 *   recorded; a skipped question says "Not answered" in the header
 *   options: text labels "✕ Your answer" (coral) and "✓ Correct answer" (green) — never colour only
 *   ONE "Explanation" label for every state
 *   actions: ONE primary "Learn: <topic>" (the existing Learn more target) + icon buttons Mistake Vault (wrong answers
 *   only: they are saved there on submit), Memory Lock, Report (aria-label + tooltip, 44 px); "Next wrong ›" on desktop
 * cl-* tokens only. Used only by the mock result page.
 */
interface QuestionReviewCardProps {
  questionOrder: number;
  sectionName: string;
  questionText: string;
  questionImageUrl?: string | null;
  optionsType?: string;
  options: Array<{ key: string; text: string; imageUrl?: string | null }>;
  selectedOption: string | null;
  /** null = no valid answer key (QB-KEY-1): no option is marked correct, the question is not scored */
  correctOption: string | null;
  isCorrect: boolean;
  marksAwarded: number;
  explanation: string | null;
  topicName: string | null;
  timeSpentSeconds?: number;
  learningSlug?: string | null;
  /** F2: "Report this question" (shown when the question is known) */
  questionId?: string | null;
  questionVersionId?: string | null;
  /** F5: "Add to Memory Lock" (only when Memory Lock is on) */
  canAddToMemoryLock?: boolean;
  /** MISTAKE-VERSION-1: the corrected (current) version when the answered one was superseded */
  correction?: VersionSnapshot | null;
  /** id of the card's heading (rows / review mode point at it) */
  headingId?: string;
  /** collapse control (desktop list) */
  onCollapse?: () => void;
  /** "Next wrong ›" (desktop list) */
  onNextWrong?: (() => void) | null;
}

const iconBtn =
  "focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-cl-line bg-cl-white text-cl-slate hover:bg-cl-cloud hover:text-cl-charcoal disabled:cursor-not-allowed disabled:opacity-60";

export function QuestionReviewCard({
  questionOrder,
  sectionName,
  questionText,
  questionImageUrl,
  optionsType,
  options,
  selectedOption,
  correctOption,
  isCorrect,
  marksAwarded,
  explanation,
  topicName,
  timeSpentSeconds,
  learningSlug,
  questionId,
  questionVersionId,
  canAddToMemoryLock = false,
  correction = null,
  headingId,
  onCollapse,
  onNextWrong = null,
}: QuestionReviewCardProps) {
  const state = questionState({ selectedOption, correctOption, isCorrect });
  const keyUnavailable = correctOption === null;
  const chip = statusChip({ mockQuestionId: "", questionOrder, sectionName, topicId: null, topicName, selectedOption, correctOption, isCorrect, marksAwarded });

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-cl-line bg-cl-white p-4 sm:p-5" data-review-card={state} aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-cl-slate">
        <h3 id={headingId} className="font-semibold text-cl-charcoal">
          Q {questionOrder}
          <span className="font-normal text-cl-slate">
            {" "}
            · {sectionName}
            {topicName ? ` · ${topicName}` : ""}
          </span>
        </h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums",
            state === "wrong" ? "bg-cl-coral-tint text-cl-coral-text" : state === "correct" ? "bg-cl-state-answered-tint text-cl-result-green-text" : "bg-cl-cloud text-cl-slate",
          )}
          data-status-chip={state}
        >
          {chip}
        </span>
        {state === "skipped" && (
          <span className="text-caption font-semibold text-cl-charcoal" data-not-answered="">
            Not answered
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {timeSpentSeconds !== undefined && timeSpentSeconds > 0 && (
            <span className="text-caption tabular-nums" data-time-spent="">
              You: {fmtShort(timeSpentSeconds)}
            </span>
          )}
          {onCollapse && (
            <button type="button" onClick={onCollapse} aria-expanded="true" aria-label={`Collapse question ${questionOrder}`} className="focus-ring inline-flex size-11 items-center justify-center rounded-xl text-cl-slate hover:bg-cl-cloud">
              <ChevronUp aria-hidden="true" className="size-5" />
            </button>
          )}
        </span>
      </header>

      <div className="whitespace-pre-wrap text-body text-cl-charcoal">{questionText}</div>

      {questionImageUrl && (
        <div className="flex justify-center rounded-xl border border-cl-line bg-cl-cloud p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={questionImageUrl} alt={`Figure for question ${questionOrder}`} className="max-h-64 max-w-full rounded-lg object-contain" loading="lazy" />
        </div>
      )}

      <ul className={cn("grid gap-2", optionsType === "image" ? "sm:grid-cols-2" : "lg:grid-cols-2")} aria-label="Options">
        {options.map((opt) => {
          const mine = selectedOption === opt.key;
          const right = !keyUnavailable && correctOption === opt.key;
          const wrongMine = mine && !keyUnavailable && !right;
          return (
            <li
              key={opt.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-body-sm",
                right ? "border-cl-result-green bg-cl-result-green-surface text-cl-charcoal" : wrongMine ? "border-cl-coral bg-cl-result-coral-surface text-cl-charcoal" : "border-cl-line bg-cl-white text-cl-charcoal",
              )}
              data-option={right ? "correct" : wrongMine ? "your-wrong" : mine ? "yours" : "other"}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-caption font-semibold",
                  right ? "border-cl-result-green text-cl-result-green-text" : wrongMine ? "border-cl-coral text-cl-coral-text" : "border-cl-mist text-cl-slate",
                )}
              >
                {opt.key}
              </span>
              <span className="sr-only">Option {opt.key}: </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                {opt.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={opt.imageUrl} alt={`Option ${opt.key}`} className="max-h-20 max-w-full rounded-md border border-cl-line bg-cl-white object-contain p-1" loading="lazy" />
                )}
                {opt.text && <span className="block">{opt.text}</span>}
              </span>
              {(right || mine) && (
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {mine && (
                    <span className={cn("rounded-full px-2 py-0.5 text-caption font-bold whitespace-nowrap", wrongMine ? "bg-cl-coral-tint text-cl-coral-text" : right ? "bg-cl-state-answered-tint text-cl-result-green-text" : "bg-cl-cloud text-cl-slate")} data-label="your-answer">
                      {wrongMine ? "✕ " : right ? "✓ " : ""}Your answer
                    </span>
                  )}
                  {right && (
                    <span className="rounded-full bg-cl-state-answered-tint px-2 py-0.5 text-caption font-bold whitespace-nowrap text-cl-result-green-text" data-label="correct-answer">
                      ✓ Correct answer
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {keyUnavailable && <AnswerKeyUnavailableNotice />}

      {explanation && (
        <section className="rounded-xl bg-cl-cloud px-4 py-3" data-explanation="">
          <h4 className="mb-1 text-caption font-semibold tracking-wide text-cl-slate uppercase">Explanation</h4>
          <p className="text-body leading-[1.6] text-cl-charcoal">{explanation}</p>
        </section>
      )}

      {correction && <CorrectedVersion correction={correction} />}

      <div className="flex flex-wrap items-center gap-2 pt-1" data-review-actions="">
        {learningSlug && (
          <Link href={learnHref(learningSlug)} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full bg-cl-blue px-4 text-body-sm font-semibold text-cl-white hover:bg-cl-blue-hover" data-learn-button="">
            <BookOpen aria-hidden="true" className="size-4" /> Learn: {topicName || "this topic"}
          </Link>
        )}
        {state === "wrong" && (
          <Tooltip content="Saved in Mistake Vault" side="top">
            <Link href="/mistakes" aria-label="Saved in Mistake Vault" className={iconBtn} data-mistake-vault="">
              <Archive aria-hidden="true" className="size-[18px]" />
            </Link>
          </Tooltip>
        )}
        {questionId && canAddToMemoryLock && <AddToMemoryLockButton questionId={questionId} iconOnly className={iconBtn} />}
        {questionId && <ReportQuestionButton questionId={questionId} questionVersionId={questionVersionId ?? null} iconOnly className={iconBtn} />}
        {onNextWrong && (
          <button type="button" onClick={onNextWrong} className="focus-ring ml-auto hidden min-h-11 items-center gap-1 rounded-full px-3 text-body-sm font-semibold text-cl-blue-text hover:bg-cl-blue-tint lg:inline-flex" data-next-wrong="">
            Next wrong <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </article>
  );
}
