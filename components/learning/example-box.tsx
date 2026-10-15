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
      ? "bg-emerald-100 text-emerald-800"
      : difficulty === "HARD"
      ? "bg-rose-100 text-rose-800"
      : "bg-indigo-100 text-indigo-800";

  return (
    <div className="my-6 rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-indigo-600" />
          <h4 className="font-semibold text-gray-900 text-base">Worked Example</h4>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 font-medium text-xs ${badgeColor}`}>
          {difficulty}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-gray-50 p-3 font-medium text-gray-800 text-sm">
        {problemText}
      </div>

      {stepByStepSolution.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="font-medium text-xs text-gray-500 uppercase tracking-wider">
            Step-by-Step Solution:
          </p>
          <div className="space-y-2">
            {stepByStepSolution.map((step) => (
              <div key={step.stepNumber} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 text-xs">
                  {step.stepNumber}
                </span>
                <div className="flex-1">
                  <span>{step.explanation}</span>
                  {step.mathSnippet && (
                    <div className="mt-1 font-mono text-xs text-indigo-900">
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
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-emerald-800 text-xs">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <span className="font-semibold">Alternative Shortcut Method: </span>
            {shortcutMethod}
          </div>
        </div>
      )}

      {commonMistakeToAvoid && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-rose-800 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <span className="font-semibold">Mistake to Avoid: </span>
            {commonMistakeToAvoid}
          </div>
        </div>
      )}
    </div>
  );
};
