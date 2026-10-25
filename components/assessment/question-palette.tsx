"use client";

import React, { useState } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuestionStatus = "not_visited" | "not_answered" | "answered" | "marked" | "marked_answered";

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
 * F3 (R6 / R10): the CBT question palette with the real exam meanings — Answered (green), Not answered (red),
 * Not visited (grey), Marked for review (purple circle), Answered & marked for review (purple circle + green tick).
 * Colour is never the only signal: each state also has its own SHAPE / ICON, mirrored in the legend. Cells and
 * controls are ≥ 48 px; the current question has a thick outline and aria-current. Shared by the mock and live players.
 */
export const PALETTE_STATES: Array<{ status: QuestionStatus; label: string }> = [
  { status: "answered", label: "Answered" },
  { status: "not_answered", label: "Not answered" },
  { status: "not_visited", label: "Not visited" },
  { status: "marked", label: "Marked for review" },
  { status: "marked_answered", label: "Answered & marked for review" },
];
const LABEL = Object.fromEntries(PALETTE_STATES.map((s) => [s.status, s.label])) as Record<QuestionStatus, string>;

const CELL: Record<QuestionStatus, string> = {
  answered: "rounded-md bg-success-700 text-fg-inverse",
  not_answered: "rounded-md bg-danger-700 text-fg-inverse",
  not_visited: "rounded-md border border-line-control bg-surface text-fg",
  marked: "rounded-full bg-cat-violet-700 text-fg-inverse",
  marked_answered: "rounded-full bg-cat-violet-700 text-fg-inverse",
};

/** The state glyph in the cell corner (shape + icon carry the state with the colour). */
function StateMark({ status, small = false }: { status: QuestionStatus; small?: boolean }) {
  const box = small ? "size-3.5" : "size-4";
  const icon = small ? "size-2.5" : "size-3";
  if (status === "answered" || status === "marked_answered") {
    return (
      <span aria-hidden="true" className={cn("absolute -right-1 -top-1 flex items-center justify-center rounded-full border-2 border-surface bg-success-700 text-fg-inverse", box)}>
        <Check className={icon} strokeWidth={3} />
      </span>
    );
  }
  if (status === "not_answered") {
    return (
      <span aria-hidden="true" className={cn("absolute -right-1 -top-1 flex items-center justify-center rounded-full border-2 border-surface bg-danger-700 text-fg-inverse", box)}>
        <Minus className={icon} strokeWidth={3} />
      </span>
    );
  }
  return null;
}

export function PaletteSwatch({ status }: { status: QuestionStatus }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-6 shrink-0 items-center justify-center", CELL[status])}>
      <StateMark status={status} small />
    </span>
  );
}

export function QuestionPalette({ questions, currentOrder, sectionName, globalTotal, globalAnswered, onSelectQuestion, className }: QuestionPaletteProps) {
  const [filter, setFilter] = useState<"all" | "answered" | "unanswered" | "marked">("all");
  const [jumpInput, setJumpInput] = useState<string>("");
  const [jumpError, setJumpError] = useState<string | null>(null);

  const count = (s: QuestionStatus) => questions.filter((q) => q.status === s).length;
  const answeredCount = count("answered") + count("marked_answered");

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
    if (isNaN(num) || !questions.some((q) => q.questionOrder === num)) {
      const min = questions.length > 0 ? questions[0].questionOrder : 1;
      const max = questions.length > 0 ? questions[questions.length - 1].questionOrder : 1;
      setJumpError(`Enter a number from ${min} to ${max}.`);
      return;
    }
    onSelectQuestion(num);
    setJumpInput("");
  };

  const pill = (key: typeof filter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      aria-pressed={filter === key}
      className={cn("focus-ring min-h-12 whitespace-nowrap rounded-lg px-3 text-body-sm font-semibold", filter === key ? "bg-surface text-fg shadow-xs" : "text-fg-secondary hover:text-fg")}
    >
      {label}
    </button>
  );

  return (
    <div className={cn("space-y-3.5", className)} data-question-palette="">
      {sectionName && (
        <div className="space-y-1 rounded-2xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-body-sm font-bold text-fg">{sectionName}</h4>
            <span className="shrink-0 text-body-sm font-semibold text-fg tabular-nums">
              {answeredCount} / {questions.length} answered
            </span>
          </div>
          {globalTotal ? (
            <p className="text-caption text-fg-secondary tabular-nums">
              Whole test: {globalAnswered} / {globalTotal} answered
            </p>
          ) : null}
        </div>
      )}

      {/* Counts per state (same shapes as the cells) */}
      <ul className="grid grid-cols-2 gap-2 text-caption font-medium text-fg">
        {PALETTE_STATES.map((s) => (
          <li key={s.status} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-2.5 py-2">
            <span className="flex items-center gap-2">
              <PaletteSwatch status={s.status} />
              {s.label}
            </span>
            <span className="font-bold tabular-nums">{count(s.status)}</span>
          </li>
        ))}
      </ul>

      <div role="group" aria-label="Show questions" className="flex items-center gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1">
        {pill("all", `All (${questions.length})`)}
        {pill("unanswered", "Not answered")}
        {pill("answered", "Answered")}
        {pill("marked", "Marked")}
      </div>

      <form onSubmit={handleJump} className="flex items-start gap-1.5">
        <div className="flex-1">
          <label htmlFor="palette-jump" className="sr-only">
            Go to question number
          </label>
          <input
            id="palette-jump"
            type="number"
            inputMode="numeric"
            value={jumpInput}
            onChange={(e) => {
              setJumpInput(e.target.value);
              setJumpError(null);
            }}
            placeholder="Go to question no."
            aria-invalid={jumpError ? true : undefined}
            aria-describedby={jumpError ? "palette-jump-error" : undefined}
            className={cn("focus-ring min-h-12 w-full rounded-lg border bg-surface px-3 text-body-sm text-fg", jumpError ? "border-danger-700" : "border-line-control")}
          />
          {jumpError && (
            <p id="palette-jump-error" className="pt-1 text-caption text-danger-700">
              {jumpError}
            </p>
          )}
        </div>
        <button type="submit" className="focus-ring min-h-12 shrink-0 rounded-lg border border-line-control bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-ink-50">
          Go
        </button>
      </form>

      <div className="grid max-h-[340px] grid-cols-5 gap-2 overflow-y-auto p-1.5">
        {filteredQuestions.map((q) => {
          const isCurrent = q.questionOrder === currentOrder;
          return (
            <button
              key={q.questionOrder}
              type="button"
              onClick={() => onSelectQuestion(q.questionOrder)}
              aria-label={`Question ${q.questionOrder}: ${LABEL[q.status]}`}
              aria-current={isCurrent ? "true" : undefined}
              data-status={q.status}
              className={cn(
                "focus-ring relative flex size-12 items-center justify-center text-body-sm font-bold select-none",
                CELL[q.status],
                isCurrent && "outline outline-[3px] outline-offset-2 outline-primary-700",
              )}
            >
              {q.questionOrder}
              <StateMark status={q.status} />
            </button>
          );
        })}
      </div>

      {/* Legend: the same shape + colour + icon as the cells */}
      <ul className="space-y-1.5 border-t border-line pt-3 text-caption text-fg-secondary" aria-label="Legend">
        {PALETTE_STATES.map((s) => (
          <li key={s.status} className="flex items-center gap-2.5">
            <PaletteSwatch status={s.status} />
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
