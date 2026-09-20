"use client";

import React, { useState } from "react";
import { QuickCheckProps } from "@/types/learning-compiler";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";

export const QuickCheck: React.FC<QuickCheckProps> = ({
  id,
  prompt,
  options = [],
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedOption = options.find((o) => o.id === selectedId);

  return (
    <div className="my-6 rounded-xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
        <HelpCircle className="h-5 w-5" />
        <h4 className="font-semibold text-base">Quick Concept Check</h4>
      </div>

      <p className="mt-3 font-medium text-gray-900 text-sm dark:text-gray-100">{prompt}</p>

      <div className="mt-3 space-y-2">
        {options.map((opt) => {
          const isSelected = opt.id === selectedId;
          const isAnswered = selectedId !== null;

          let btnStyle = "border-gray-200 bg-white hover:border-emerald-400 dark:border-gray-800 dark:bg-gray-900";
          if (isAnswered) {
            if (opt.isCorrect) {
              btnStyle = "border-emerald-500 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
            } else if (isSelected) {
              btnStyle = "border-rose-500 bg-rose-50 font-semibold text-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
            }
          }

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedId(opt.id)}
              disabled={isAnswered}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-xs transition ${btnStyle}`}
            >
              <span>{opt.text}</span>
              {isAnswered && opt.isCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {isAnswered && isSelected && !opt.isCorrect && <XCircle className="h-4 w-4 text-rose-600" />}
            </button>
          );
        })}
      </div>

      {selectedOption && (
        <div
          className={`mt-3 rounded-lg p-3 text-xs ${
            selectedOption.isCorrect
              ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-rose-100/70 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200"
          }`}
        >
          <span className="font-bold">{selectedOption.isCorrect ? "Correct! " : "Incorrect. "}</span>
          {selectedOption.feedbackExplanation}
        </div>
      )}
    </div>
  );
};
