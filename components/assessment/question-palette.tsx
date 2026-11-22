"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  PALETTE_FILTERS,
  PALETTE_STATES as STATES,
  filterCounts,
  matchesFilter,
  paletteButtonLabel,
  stateCounts,
  type PaletteFilter,
  type QuestionStatus as Status,
} from "@/lib/assessment/palette";

export type QuestionStatus = Status;
export const PALETTE_STATES = STATES;

export interface QuestionPaletteItem {
  questionOrder: number;
  status: QuestionStatus;
}

interface QuestionPaletteProps {
  questions: QuestionPaletteItem[];
  currentOrder: number;
  sectionName?: string;
  globalTotal?: number;
  globalAnswered?: number;
  onSelectQuestion: (order: number) => void;
  className?: string;
}

/**
 * F3 (R6 / R10) + EXAM-UX-1 (owner spec 23 Nov 2026 §1.3 / §1.5 / §1 palette grid): the CBT question palette with the
 * real exam meanings — Answered (green), Not answered (red), Not visited (outline), Marked for review (violet circle),
 * Answered & marked for review (violet circle + green dot). Colour is never the only signal: each state also has its own
 * SHAPE (square / circle / outline) and mark (✓ / – / dot), mirrored in the ONE legend, which carries the counts for the
 * current section. Filters with counts (All · Not answered · Marked); no "Go to question no." (the grid covers it).
 * 5-column grid of 48 px buttons labelled "Question 7, not answered"; the current question has a 2 px cl-blue ring with
 * a white gap and aria-current. cl-* tokens only. Shared by the mock and live players.
 */
const CELL: Record<QuestionStatus, string> = {
  answered: "rounded-md bg-cl-state-answered text-cl-white",
  not_answered: "rounded-md bg-cl-state-not-answered text-cl-white",
  not_visited: "rounded-md border border-cl-mist bg-cl-white text-cl-charcoal",
  marked: "rounded-full bg-cl-state-marked text-cl-white",
  marked_answered: "rounded-full bg-cl-state-marked text-cl-white",
};

/** The state mark in the cell corner (shape + mark carry the state with the colour). */
function StateMark({ status, small = false }: { status: QuestionStatus; small?: boolean }) {
  const box = small ? "size-2.5" : "size-3.5";
  if (status === "answered" || status === "marked_answered") {
    return <span aria-hidden="true" className={cn("absolute -right-0.5 -top-0.5 rounded-full border-2 border-cl-white bg-cl-state-answered", box)} data-mark="answered" />;
  }
  if (status === "not_answered") {
    return (
      <span aria-hidden="true" className={cn("absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full border-2 border-cl-white bg-cl-state-not-answered", box)} data-mark="not-answered">
        <span className="h-0.5 w-1.5 rounded-full bg-cl-white" />
      </span>
    );
  }
  return null;
}

export function PaletteSwatch({ status }: { status: QuestionStatus }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-5 shrink-0 items-center justify-center", CELL[status])}>
      <StateMark status={status} small />
    </span>
  );
}

export function QuestionPalette({ questions, currentOrder, sectionName, globalTotal, globalAnswered, onSelectQuestion, className }: QuestionPaletteProps) {
  const [filter, setFilter] = useState<PaletteFilter>("all");
  const counts = stateCounts(questions);
  const fCounts = filterCounts(questions);
  const answered = counts.answered + counts.marked_answered;
  const shown = questions.filter((q) => matchesFilter(q.status, filter));

  return (
    <div className={cn("flex flex-col gap-3", className)} data-question-palette="">
      {sectionName && (
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="truncate text-body-sm font-bold text-cl-charcoal">{sectionName}</h4>
          <span className="shrink-0 text-caption font-semibold text-cl-slate tabular-nums">
            {answered}/{questions.length} answered
            {globalTotal ? ` · test ${globalAnswered ?? 0}/${globalTotal}` : ""}
          </span>
        </div>
      )}

      {/* ONE legend, with the counts for this section (replaces the old summary cards and the bottom legend) */}
      <ul aria-label="Legend" data-palette-legend="" className="grid grid-cols-1 gap-1 rounded-xl border border-cl-line bg-cl-white p-2.5 text-caption text-cl-charcoal">
        {PALETTE_STATES.map((s) => (
          <li key={s.status} className="flex items-center justify-between gap-2" data-legend-state={s.status}>
            <span className="flex items-center gap-2">
              <PaletteSwatch status={s.status} />
              {s.label}
            </span>
            <span className="font-bold tabular-nums" data-legend-count={s.status}>
              {counts[s.status]}
            </span>
          </li>
        ))}
      </ul>

      {/* Filters with counts (segmented) */}
      <div role="group" aria-label="Show questions" data-palette-filters="" className="grid grid-cols-3 gap-1 rounded-xl bg-cl-cloud p-1">
        {PALETTE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            data-filter={f.key}
            className={cn(
              "focus-ring min-h-11 rounded-lg px-1.5 text-center text-caption font-semibold leading-tight",
              filter === f.key ? "bg-cl-white text-cl-charcoal shadow-xs" : "text-cl-slate hover:text-cl-charcoal",
            )}
          >
            {f.label} <span className="tabular-nums" data-filter-count={f.key}>{fCounts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2 p-1" data-palette-grid="">
        {shown.map((q) => {
          const isCurrent = q.questionOrder === currentOrder;
          return (
            <button
              key={q.questionOrder}
              type="button"
              onClick={() => onSelectQuestion(q.questionOrder)}
              aria-label={paletteButtonLabel(q.questionOrder, q.status)}
              aria-current={isCurrent ? "true" : undefined}
              data-status={q.status}
              className={cn(
                "focus-ring relative flex size-12 items-center justify-center justify-self-center text-body-sm font-bold select-none",
                CELL[q.status],
                isCurrent && "ring-2 ring-cl-blue ring-offset-2 ring-offset-cl-white",
              )}
            >
              {q.questionOrder}
              <StateMark status={q.status} />
            </button>
          );
        })}
        {shown.length === 0 && <p className="col-span-5 py-2 text-center text-caption text-cl-slate">No questions here.</p>}
      </div>
    </div>
  );
}
