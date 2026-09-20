"use client";

import React, { useState } from "react";
import { QuestionReferenceProps } from "@/types/learning-compiler";
import { HelpCircle, ChevronDown, ChevronUp, CheckCircle, ShieldCheck } from "lucide-react";

export const QuestionReference: React.FC<QuestionReferenceProps> = ({
  questionVersionId,
  relevanceRationale,
  resolvedQuestion,
}) => {
  const [showAnswer, setShowAnswer] = useState(false);

  const q = resolvedQuestion || {
    questionText: "Canonical Question Text (Question Bank Reference)",
    questionType: "SINGLE_CHOICE",
    options: [
      { id: "opt-1", optionIndex: 0, optionText: "Option A" },
      { id: "opt-2", optionIndex: 1, optionText: "Option B" },
    ],
    correctOptionId: "opt-1",
    explanation: "Refer to official syllabus question bank entry.",
    examMetadata: {
      examTitle: "SSC CGL Exam Reference",
      year: 2024,
      shift: "Shift 1",
      tier: "Tier 1",
    },
  };

  return (
    <div className="my-6 rounded-xl border border-indigo-200 bg-indigo-50/30 p-5 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
          <HelpCircle className="h-5 w-5" />
          <h4 className="font-semibold text-base">Authentic PYQ Application</h4>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-indigo-800 text-xs font-medium dark:bg-indigo-900/50 dark:text-indigo-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{q.examMetadata?.examTitle || "Canonical PYQ"}</span>
          {q.examMetadata?.year && <span>({q.examMetadata.year})</span>}
        </div>
      </div>

      <p className="mt-3 font-medium text-gray-900 text-sm dark:text-gray-100">{q.questionText}</p>

      {q.options && q.options.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {q.options.map((opt) => (
            <div
              key={opt.id}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
                showAnswer && opt.id === q.correctOptionId
                  ? "border-emerald-300 bg-emerald-50 font-bold text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
              }`}
            >
              <span className="font-bold">{String.fromCharCode(65 + opt.optionIndex)}.</span>
              <span>{opt.optionText}</span>
              {showAnswer && opt.id === q.correctOptionId && (
                <CheckCircle className="ml-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
          ))}
        </div>
      )}

      {relevanceRationale && (
        <p className="mt-3 text-gray-600 text-xs italic dark:text-gray-400">
          <strong>Why this question: </strong> {relevanceRationale}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-indigo-100 dark:border-indigo-900/40">
        <button
          type="button"
          onClick={() => setShowAnswer(!showAnswer)}
          className="flex items-center gap-1.5 font-semibold text-indigo-600 text-xs hover:underline dark:text-indigo-400"
        >
          <span>{showAnswer ? "Hide Explanation & Answer" : "Reveal Answer & Step-by-Step Breakdown"}</span>
          {showAnswer ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showAnswer && q.explanation && (
          <div className="mt-2 rounded-lg bg-white p-3 text-gray-800 text-xs leading-relaxed dark:bg-gray-900 dark:text-gray-200">
            <span className="font-bold text-indigo-700 dark:text-indigo-400">Explanation: </span>
            {q.explanation}
          </div>
        )}
      </div>
    </div>
  );
};
