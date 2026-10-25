import React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, HelpCircle, BookOpen, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerKeyUnavailableNotice } from "@/components/questions/answer-key-notice";
import { ReportQuestionButton } from "@/components/practice/report-question-button";
import { AddToMemoryLockButton } from "@/components/memory-lock/add-to-memory-lock-button";

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
  /** F4: marked for review in the player */
  isMarked?: boolean;
  marksAwarded: number;
  explanation: string | null;
  topicName: string | null;
  topicSlug: string | null;
  timeSpentSeconds?: number;
  learningSlug?: string | null;
  learningDocTitle?: string | null;
  hasPublishedLearning?: boolean;
  /** F2: "Report this question" (shown when the question is known) */
  questionId?: string | null;
  questionVersionId?: string | null;
  /** F5: quiet "Add to Memory Lock" (only when Memory Lock is on) */
  canAddToMemoryLock?: boolean;
}

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
  isMarked = false,
  marksAwarded,
  explanation,
  topicName,
  topicSlug,
  timeSpentSeconds,
  learningSlug,
  learningDocTitle,
  hasPublishedLearning,
  questionId,
  questionVersionId,
  canAddToMemoryLock = false,
}: QuestionReviewCardProps) {
  const isUnanswered = selectedOption === null;
  const keyUnavailable = correctOption === null;

  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
            Q{questionOrder}
          </span>
          <span className="text-fg-secondary font-medium">{sectionName}</span>
          {isMarked && <span className="rounded-badge border border-line px-2 py-0.5 text-caption font-medium text-fg">Marked for review</span>}
          {timeSpentSeconds !== undefined && timeSpentSeconds > 0 && (
            <span className="text-caption text-fg-secondary font-mono">
              &bull; {timeSpentSeconds >= 60 ? `${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s` : `${timeSpentSeconds}s`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 font-bold">
          {keyUnavailable ? (
            <span className="rounded-badge border border-warning-200 bg-warning-50 px-2 py-0.5 text-caption font-medium text-warning-800">Not scored</span>
          ) : isUnanswered ? (
            <span className="text-slate-500 flex items-center gap-1">
              <HelpCircle aria-hidden="true" className="w-3.5 h-3.5" /> Skipped (0)
            </span>
          ) : isCorrect ? (
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> <span className="sr-only">Correct:</span> +{marksAwarded.toFixed(1)}
            </span>
          ) : (
            <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/60 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> <span className="sr-only">Incorrect:</span> {marksAwarded.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
        {questionText}
      </div>

      {/* Question Figure (if present) */}
      {questionImageUrl && (
        <div className="my-2 p-2 bg-slate-50 rounded-xl border border-slate-200 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={questionImageUrl}
            alt={`Figure for Question ${questionOrder}`}
            className="max-h-64 max-w-full object-contain rounded-lg"
            loading="lazy"
          />
        </div>
      )}

      {/* Options */}
      <div className={cn("grid gap-2 pt-1", optionsType === "image" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {options.map((opt) => {
          const isUserChoice = selectedOption === opt.key;
          const isTargetCorrect = !keyUnavailable && correctOption === opt.key;
          // BRAND-1: right / wrong is never colour-only — an icon plus screen-reader text name the state
          const isWrongChoice = isUserChoice && !isCorrect && !keyUnavailable;

          return (
            <div
              key={opt.key}
              className={cn(
                "p-3 rounded-xl border text-xs flex items-start gap-3",
                isTargetCorrect
                  ? "bg-emerald-50/80 border-emerald-500 text-emerald-950 font-semibold"
                  : isUserChoice && !isCorrect && !keyUnavailable
                  ? "bg-red-50/80 border-red-400 text-red-950 font-semibold"
                  : "bg-slate-50/50 border-slate-200 text-slate-700"
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0",
                  isTargetCorrect
                    ? "bg-emerald-600 text-white"
                    : isUserChoice && !isCorrect && !keyUnavailable
                    ? "bg-red-600 text-white"
                    : "bg-slate-200 text-slate-600"
                )}
              >
                {opt.key}
              </div>
              <div className="flex-1 space-y-1.5">
                {opt.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={opt.imageUrl}
                    alt={`Option ${opt.key}`}
                    className="max-h-20 max-w-full object-contain rounded-md bg-white border border-slate-200 p-1"
                    loading="lazy"
                  />
                )}
                {opt.text && <div className="pt-0.5">{opt.text}</div>}
                {(isTargetCorrect || isUserChoice) && (
                  <span className="sr-only">
                    {isTargetCorrect && isUserChoice ? "Your answer, correct answer" : isTargetCorrect ? "Correct answer" : isWrongChoice ? "Your answer, incorrect" : "Your answer"}
                  </span>
                )}
              </div>
              {isTargetCorrect ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-success-700" aria-hidden="true" />
              ) : isWrongChoice ? (
                <XCircle className="w-4 h-4 shrink-0 text-danger-700" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>

      {keyUnavailable && <AnswerKeyUnavailableNotice />}

      {/* Explanation, Mistake Vault link & Canonical Learning Resolution */}
      <div className="pt-3 border-t border-slate-100 space-y-2.5">
        {explanation && (
          <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-slate-800 space-y-1">
            <span className="font-bold text-blue-900 block">Explanation & Solution:</span>
            <p className="leading-relaxed text-slate-700">{explanation}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {topicName ? (
            <span className="text-caption text-fg-secondary">
              Topic: <strong className="text-slate-700">{topicName}</strong>
            </span>
          ) : <div />}

          <div className="flex flex-wrap items-center gap-3">
            {questionId && <ReportQuestionButton questionId={questionId} questionVersionId={questionVersionId ?? null} />}
            {questionId && canAddToMemoryLock && <AddToMemoryLockButton questionId={questionId} />}
            {!isCorrect && !isUnanswered && (
              <Link
                href="/mistakes"
                className="focus-ring inline-flex min-h-12 items-center gap-1 text-body-sm font-semibold text-danger-700 hover:underline"
              >
                <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5" /> Review in Mistake Vault
              </Link>
            )}

            {learningSlug ? (
              <Link
                href={`/articles/${learningSlug}`}
                className="focus-ring inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-line px-3 text-body-sm font-semibold text-link hover:bg-ink-50"
              >
                <BookOpen aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Learn more{topicName ? `: ${topicName}` : ""}</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}