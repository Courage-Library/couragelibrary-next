"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PALETTE_STATES, PaletteSwatch } from "@/components/assessment/question-palette";

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const kbd = "inline-flex min-w-7 items-center justify-center rounded border border-line-control bg-surface px-1.5 py-0.5 font-mono text-caption font-bold text-fg";

/**
 * F3 (R6 / R10): instructions on the shared accessible Dialog. The palette legend reuses the palette's own swatches
 * (same shape + colour + icon), and the controls use the CBT names.
 */
export function InstructionsModal({ isOpen, onClose }: InstructionsModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Instructions"
      footer={
        <Button size="lg" className="min-h-12" onClick={onClose}>
          Return to test
        </Button>
      }
    >
      <div className="flex flex-col gap-5 text-body-sm text-fg-secondary">
        <section className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Question palette</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PALETTE_STATES.map((s) => (
              <li key={s.status} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2">
                <PaletteSwatch status={s.status} />
                <span className="font-medium text-fg">{s.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Buttons</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong className="text-fg">Save &amp; Next</strong> saves your answer and opens the next question.
            </li>
            <li>
              <strong className="text-fg">Mark for Review &amp; Next</strong> marks the question to look at again and opens the next one. A marked question with an answer is evaluated.
            </li>
            <li>
              <strong className="text-fg">Clear Response</strong> removes your answer to the current question.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Time and saving</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Every answer is saved as you choose it. The top bar shows &quot;Saved&quot; only after the server confirms.</li>
            <li>If an answer cannot be saved, it is kept on this device and sent again automatically.</li>
            <li>When the timer reaches 00:00, your test is submitted with the answers saved so far.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Keyboard (desktop)</h3>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <li>
              <kbd className={kbd}>1</kbd>–<kbd className={kbd}>4</kbd> or <kbd className={kbd}>A</kbd>–<kbd className={kbd}>D</kbd> choose an option
            </li>
            <li>
              <kbd className={kbd}>↑</kbd> <kbd className={kbd}>↓</kbd> move between options
            </li>
            <li>
              <kbd className={kbd}>→</kbd> or <kbd className={kbd}>N</kbd> Save &amp; Next
            </li>
            <li>
              <kbd className={kbd}>←</kbd> or <kbd className={kbd}>P</kbd> previous question
            </li>
            <li>
              <kbd className={kbd}>M</kbd> Mark for Review &amp; Next
            </li>
            <li>
              <kbd className={kbd}>?</kbd> these instructions
            </li>
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
