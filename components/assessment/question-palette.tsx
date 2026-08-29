"use client";

import React, { useState } from "react";
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
  const [filter, setFilter] = useState<"all" | "answered" | "unanswered" | "marked">("all");
  const [jumpInput, setJumpInput] = useState<string>("");
  const [jumpError, setJumpError] = useState<string | null>(null);

  const getStatusClasses = (status: QuestionStatus, isCurrent: boolean) => {
    const base = "h-9 w-full rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer relative select-none";
    const currentRing = isCurrent ? "ring-2 ring-blue-600 ring-offset-2 scale-105 z-10 font-black shadow-sm" : "hover:scale-102";

    switch (status) {
      case "answered":
        return cn(base, currentRing, "bg-emerald-600 text-white shadow-2xs");
      case "marked":
        return cn(base, currentRing, "bg-purple-600 text-white shadow-2xs");
      case "marked_answered":
        return cn(base, currentRing, "bg-purple-600 text-white ring-2 ring-emerald-400 shadow-2xs");
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

  // Filter questions for display
  const filteredQuestions = questions.filter((q) => {
    if (filter === "answered") return q.status === "answered" || q.status === "marked_answered";
    if (filter === "unanswered") return q.status === "not_answered" || q.status === "not_visited";
    if (filter === "marked") return q.status === "marked" || q.status === "marked_answered";
    return true;
  });

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    setJumpError(null);
    const num = parseInt(jumpInput.trim(), 10);
    if (isNaN(num) || num < 1 || num > questions.length) {
      setJumpError(`1-${questions.length}`);
      return;
    }
    onSelectQuestion(num);
    setJumpInput("");
  };

  return (
    <div className={cn("space-y-3.5", className)}>
      {/* Quick Summary Grid */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
          <span>Answered</span>
          <span className="font-black text-xs text-emerald-700">{answeredCount}</span>
        </div>
        <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-between">
          <span>Marked</span>
          <span className="font-black text-xs text-purple-700">{markedCount}</span>
        </div>
        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between">
          <span>Unanswered</span>
          <span className="font-black text-xs text-amber-700">{notAnsweredCount}</span>
        </div>
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-between">
          <span>Not Visited</span>
          <span className="font-black text-xs text-slate-800">{notVisitedCount}</span>
        </div>
      </div>

      {/* Palette Filter Pills */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl overflow-x-auto text-[11px] font-bold">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer",
            filter === "all" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          )}
        >
          All ({questions.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unanswered")}
          className={cn(
            "px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer",
            filter === "unanswered" ? "bg-white text-amber-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          )}
        >
          Unanswered
        </button>
        <button
          type="button"
          onClick={() => setFilter("answered")}
          className={cn(
            "px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer",
            filter === "answered" ? "bg-white text-emerald-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          )}
        >
          Answered
        </button>
        <button
          type="button"
          onClick={() => setFilter("marked")}
          className={cn(
            "px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer",
            filter === "marked" ? "bg-white text-purple-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          )}
        >
          Marked
        </button>
      </div>

      {/* Jump To Question Bar (Useful for 25 to 200+ question exams) */}
      <form onSubmit={handleJump} className="flex items-center gap-1.5 pt-0.5">
        <div className="relative flex-1">
          <input
            type="number"
            min={1}
            max={questions.length}
            value={jumpInput}
            onChange={(e) => {
              setJumpInput(e.target.value);
              setJumpError(null);
            }}
            placeholder={`Jump to Q# (1-${questions.length})`}
            className={cn(
              "w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border bg-white text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500",
              jumpError ? "border-red-400 ring-1 ring-red-400" : "border-slate-200"
            )}
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shrink-0 cursor-pointer"
        >
          Go
        </button>
      </form>

      {/* Palette Numbers Grid */}
      <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-y-auto p-1 pr-1.5 scrollbar-thin">
        {filteredQuestions.map((q) => {
          const isCurrent = q.questionOrder === currentOrder;
          return (
            <button
              key={q.questionOrder}
              type="button"
              onClick={() => onSelectQuestion(q.questionOrder)}
              aria-label={`Question ${q.questionOrder} — ${q.status.replace("_", " ")}`}
              aria-current={isCurrent ? "true" : undefined}
              className={getStatusClasses(q.status, isCurrent)}
            >
              {q.questionOrder}
              {q.status === "marked_answered" && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white shadow-xs" />
              )}
            </button>
          );
        })}
      </div>

      {/* Official Exam Legend */}
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