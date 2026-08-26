import React from "react";
import { cn } from "@/lib/utils";

export type QuestionStatus =
  | "not_visited"
  | "not_answered"
  | "answered"
  | "marked"
  | "marked_answered";

export interface QuestionPaletteItem {
  questionOrder: number;
  status: QuestionStatus;
}

interface QuestionPaletteProps {
  questions: QuestionPaletteItem[];
  currentOrder: number;
  onSelectQuestion: (order: number) => void;
  className?: string;
}

export function QuestionPalette({
  questions,
  currentOrder,
  onSelectQuestion,
  className,
}: QuestionPaletteProps) {
  const getStatusClasses = (status: QuestionStatus, isCurrent: boolean) => {
    const base = "h-9 w-full rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer relative select-none";
    const currentRing = isCurrent ? "ring-2 ring-blue-600 ring-offset-2 scale-105 z-10" : "hover:scale-102";

    switch (status) {
      case "answered":
        return cn(base, currentRing, "bg-emerald-600 text-white shadow-xs");
      case "marked":
        return cn(base, currentRing, "bg-purple-600 text-white shadow-xs");
      case "marked_answered":
        return cn(base, currentRing, "bg-purple-600 text-white ring-2 ring-emerald-400 shadow-xs");
      case "not_answered":
        return cn(base, currentRing, "bg-amber-50 text-amber-900 border border-amber-300");
      case "not_visited":
      default:
        return cn(base, currentRing, "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200");
    }
  };

  const answeredCount = questions.filter((q) => q.status === "answered" || q.status === "marked_answered").length;
  const markedCount = questions.filter((q) => q.status === "marked" || q.status === "marked_answered").length;
  const notAnsweredCount = questions.filter((q) => q.status === "not_answered").length;
  const notVisitedCount = questions.filter((q) => q.status === "not_visited").length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Quick Summary Grid */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <span>Answered</span>
          <span className="font-black text-xs">{answeredCount}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 flex items-center justify-between">
          <span>Marked</span>
          <span className="font-black text-xs">{markedCount}</span>
        </div>
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between">
          <span>Unanswered</span>
          <span className="font-black text-xs">{notAnsweredCount}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-between">
          <span>Not Visited</span>
          <span className="font-black text-xs">{notVisitedCount}</span>
        </div>
      </div>

      {/* Palette Numbers Grid */}
      <div className="grid grid-cols-5 gap-2 max-h-[320px] overflow-y-auto p-1 pr-1.5 scrollbar-thin">
        {questions.map((q) => {
          const isCurrent = q.questionOrder === currentOrder;
          return (
            <button
              key={q.questionOrder}
              type="button"
              onClick={() => onSelectQuestion(q.questionOrder)}
              aria-label={`Question ${q.questionOrder} (${q.status.replace("_", " ")})`}
              aria-current={isCurrent ? "true" : undefined}
              className={getStatusClasses(q.status, isCurrent)}
            >
              {q.questionOrder}
              {q.status === "marked_answered" && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white" />
              )}
            </button>
          );
        })}
      </div>

      {/* Official Exam-Style Legend */}
      <div className="pt-3 border-t border-slate-200 space-y-1.5 text-[11px] text-slate-600 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-600 shrink-0" />
          <span>Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-600 shrink-0" />
          <span>Marked for Review</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-600 ring-2 ring-emerald-400 shrink-0" />
          <span>Answered &amp; Marked for Review</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-50 border border-amber-300 shrink-0" />
          <span>Visited but Not Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-slate-100 border border-slate-300 shrink-0" />
          <span>Not Visited</span>
        </div>
      </div>
    </div>
  );
}