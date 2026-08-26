import React from "react";
import { cn } from "@/lib/utils";

export type QuestionStatus = "current" | "answered" | "marked" | "marked_answered" | "unanswered";

interface QuestionPaletteItem {
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
  const getStatusColor = (status: QuestionStatus, isCurrent: boolean) => {
    if (isCurrent) return "ring-2 ring-blue-600 ring-offset-2 bg-blue-600 text-white font-black";
    switch (status) {
      case "answered":
        return "bg-emerald-600 text-white font-bold";
      case "marked":
        return "bg-purple-600 text-white font-bold";
      case "marked_answered":
        return "bg-purple-600 text-white font-bold ring-2 ring-emerald-500";
      default:
        return "bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold";
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((q) => {
          const isCurrent = q.questionOrder === currentOrder;
          return (
            <button
              key={q.questionOrder}
              type="button"
              onClick={() => onSelectQuestion(q.questionOrder)}
              className={cn(
                "h-9 rounded-lg text-xs flex items-center justify-center transition-all cursor-pointer",
                getStatusColor(q.status, isCurrent)
              )}
            >
              {q.questionOrder}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="pt-4 border-t border-slate-100 space-y-2 text-[11px] text-slate-600 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-sm bg-emerald-600" />
          <span>Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-sm bg-slate-100 border border-slate-300" />
          <span>Unanswered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-sm bg-purple-600" />
          <span>Marked for Review</span>
        </div>
      </div>
    </div>
  );
}