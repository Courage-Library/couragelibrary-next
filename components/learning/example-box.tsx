"use client";

import React from "react";
import { ExampleBoxProps } from "@/types/learning-compiler";
import { Lightbulb, Zap, AlertTriangle } from "lucide-react";

export const ExampleBox: React.FC<ExampleBoxProps> = ({
  difficulty = "MEDIUM",
  problemText,
  stepByStepSolution = [],
  shortcutMethod,
  commonMistakeToAvoid,
}) => {
  const badgeColor =
    difficulty === "EASY"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : difficulty === "HARD"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300";

  return (
    <div className="my-6 rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h4 className="font-semibold text-gray-900 text-base dark:text-gray-100">Worked Example</h4>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 font-medium text-xs ${badgeColor}`}>
          {difficulty}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-gray-50 p-3 font-medium text-gray-800 text-sm dark:bg-gray-800/60 dark:text-gray-200">
        {problemText}
      </div>

      {stepByStepSolution.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="font-medium text-xs text-gray-500 uppercase tracking-wider dark:text-gray-400">
            Step-by-Step Solution:
          </p>
          <div className="space-y-2">
            {stepByStepSolution.map((step) => (
              <div key={step.stepNumber} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 text-xs dark:bg-indigo-900/60 dark:text-indigo-300">
                  {step.stepNumber}
                </span>
                <div className="flex-1">
                  <span>{step.explanation}</span>
                  {step.mathSnippet && (
                    <div className="mt-1 font-mono text-xs text-indigo-900 dark:text-indigo-200">
                      {step.mathSnippet}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shortcutMethod && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-emerald-800 text-xs dark:bg-emerald-950/40 dark:text-emerald-300">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="font-semibold">Alternative Shortcut Method: </span>
            {shortcutMethod}
          </div>
        </div>
      )}

      {commonMistakeToAvoid && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-rose-800 text-xs dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <span className="font-semibold">Mistake to Avoid: </span>
            {commonMistakeToAvoid}
          </div>
        </div>
      )}
    </div>
  );
};
