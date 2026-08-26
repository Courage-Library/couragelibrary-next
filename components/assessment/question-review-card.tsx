import React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, HelpCircle, BookOpen, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionReviewCardProps {
  questionOrder: number;
  sectionName: string;
  questionText: string;
  options: Array<{ key: string; text: string }>;
  selectedOption: string | null;
  correctOption: string;
  isCorrect: boolean;
  marksAwarded: number;
  explanation: string | null;
  topicName: string | null;
  topicSlug: string | null;
}

export function QuestionReviewCard({
  questionOrder,
  sectionName,
  questionText,
  options,
  selectedOption,
  correctOption,
  isCorrect,
  marksAwarded,
  explanation,
  topicName,
  topicSlug,
}: QuestionReviewCardProps) {
  const isUnanswered = selectedOption === null;

  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
            Q{questionOrder}
          </span>
          <span className="text-slate-500 font-medium">{sectionName}</span>
        </div>
        <div className="flex items-center gap-2 font-bold">
          {isUnanswered ? (
            <span className="text-slate-500 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" /> Unattempted (0.00)
            </span>
          ) : isCorrect ? (
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> +{marksAwarded.toFixed(1)}
            </span>
          ) : (
            <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/60 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> {marksAwarded.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
        {questionText}
      </div>

      {/* Options */}
      <div className="space-y-2 pt-1">
        {options.map((opt) => {
          const isUserChoice = selectedOption === opt.key;
          const isTargetCorrect = correctOption === opt.key;

          return (
            <div
              key={opt.key}
              className={cn(
                "p-3 rounded-xl border text-xs flex items-start gap-3",
                isTargetCorrect
                  ? "bg-emerald-50/80 border-emerald-500 text-emerald-950 font-semibold"
                  : isUserChoice && !isCorrect
                  ? "bg-red-50/80 border-red-400 text-red-950 font-semibold"
                  : "bg-slate-50/50 border-slate-200 text-slate-700"
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0",
                  isTargetCorrect
                    ? "bg-emerald-600 text-white"
                    : isUserChoice && !isCorrect
                    ? "bg-red-600 text-white"
                    : "bg-slate-200 text-slate-600"
                )}
              >
                {opt.key}
              </div>
              <span className="pt-0.5">{opt.text}</span>
            </div>
          );
        })}
      </div>

      {/* Explanation, Mistake Vault link & Learn More */}
      <div className="pt-3 border-t border-slate-100 space-y-2.5">
        {explanation && (
          <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-slate-800 space-y-1">
            <span className="font-bold text-blue-900 block">Explanation & Solution:</span>
            <p className="leading-relaxed text-slate-700">{explanation}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {topicName ? (
            <span className="text-[11px] text-slate-500">
              Topic: <strong className="text-slate-700">{topicName}</strong>
            </span>
          ) : <div />}

          <div className="flex items-center gap-4">
            {!isCorrect && !isUnanswered && (
              <Link
                href="/mistakes"
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Review in Mistake Vault
              </Link>
            )}
            <Link
              href={topicSlug ? `/practice?topic=${topicSlug}` : "/practice"}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
            >
              <BookOpen className="w-3.5 h-3.5" /> Learn More & Practice
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}