"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PALETTE_STATES, PaletteSwatch } from "@/components/assessment/question-palette";
import type { QuestionStatus } from "@/components/assessment/question-palette";

export interface SectionSubmitSummary {
  id: string;
  name: string;
  totalQuestions: number;
  answeredCount: number;
}

interface SubmitDialogProps {
  isOpen: boolean;
  answeredCount: number;
  unansweredCount: number;
  markedCount: number;
  sectionsSummary?: SectionSubmitSummary[];
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submissionError?: string | null;
  /** F3-polish: per-state counts — shown with the palette's exact terms (Answered … Answered & marked for review) */
  stateCounts?: Record<QuestionStatus, number>;
}

/**
 * F3 (R4 / R7 / R10): the final-submit confirmation on the shared accessible Dialog (native <dialog>: focus trapped,
 * Esc / "Return to test" close it, focus returns to the opener). ONE primary action ("Submit test"); counts are shown
 * neutrally (no alarm colour); a failed submission is shown here (the player reopens this dialog) with the answers kept.
 * Shared by the mock player and the live-test player (same props).
 */
export function SubmitDialog({
  isOpen,
  answeredCount,
  unansweredCount,
  markedCount,
  sectionsSummary = [],
  onConfirm,
  onCancel,
  isSubmitting = false,
  submissionError = null,
  stateCounts,
}: SubmitDialogProps) {
  const counts: Array<{ key: string; label: string; n: number; status?: QuestionStatus }> = stateCounts
    ? PALETTE_STATES.map((s) => ({ key: s.status, label: s.label, n: stateCounts[s.status] ?? 0, status: s.status }))
    : [
        { key: "answered", label: "Answered", n: answeredCount },
        { key: "not_answered", label: "Not answered", n: unansweredCount },
        { key: "marked", label: "Marked for review", n: markedCount },
      ];
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onCancel();
      }}
      dismissible={!isSubmitting}
      title="Submit your test?"
      description="Check your summary. After you submit, answers cannot be changed."
      footer={
        <>
          <Button variant="secondary" size="lg" className="min-h-12" onClick={onCancel} disabled={isSubmitting}>
            Return to test
          </Button>
          <Button size="lg" className="min-h-12" onClick={onConfirm} loading={isSubmitting} data-submit-confirm="">
            {isSubmitting ? "Submitting…" : submissionError ? "Try submitting again" : "Submit test"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-submit-dialog="">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-submit-counts="">
          {counts.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken px-3 py-2">
              <dt className="flex items-center gap-2 text-body-sm font-medium text-fg">
                {c.status && <PaletteSwatch status={c.status} />}
                {c.label}
              </dt>
              <dd className="text-h3 font-bold text-fg tabular-nums">{c.n}</dd>
            </div>
          ))}
        </dl>

        {sectionsSummary.length > 1 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-body-sm font-semibold text-fg">By section</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line text-body-sm">
              {sectionsSummary.map((sec) => (
                <li key={sec.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="font-medium text-fg">{sec.name}</span>
                  <span className="text-fg-secondary tabular-nums">
                    {sec.answeredCount} / {sec.totalQuestions} answered
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unansweredCount > 0 && (
          <p className="text-body-sm text-fg-secondary">
            {unansweredCount} question{unansweredCount > 1 ? "s are" : " is"} not answered. Unanswered questions get no marks.
          </p>
        )}

        {submissionError && (
          <Alert tone="danger" live title="Your test was not submitted">
            <span className="flex items-start gap-2">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {submissionError}
            </span>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
