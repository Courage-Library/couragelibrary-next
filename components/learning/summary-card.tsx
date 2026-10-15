"use client";

import React from "react";
import { SummaryCardProps } from "@/types/learning-compiler";
import { CheckCircle2, BookmarkCheck } from "lucide-react";

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title = "Key Revision Takeaways",
  keyTakeaways = [],
  coreFormulas = [],
  speedRules = [],
}) => {
  return (
    <div className="my-6 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 p-5 shadow-xs">
      <div className="flex items-center gap-2 text-indigo-800">
        <BookmarkCheck className="h-5 w-5" />
        <h4 className="font-semibold text-base">{title}</h4>
      </div>

      {keyTakeaways.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          {keyTakeaways.map((takeaway, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <span>{takeaway}</span>
            </li>
          ))}
        </ul>
      )}

      {coreFormulas.length > 0 && (
        <div className="mt-4 pt-3 border-t border-indigo-100">
          <p className="font-semibold text-xs text-indigo-900 uppercase tracking-wider">
            Core Formulas:
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {coreFormulas.map((f, idx) => (
              <span key={idx} className="rounded bg-white px-2 py-1 font-mono text-xs shadow-2xs">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {speedRules.length > 0 && (
        <div className="mt-3 pt-2">
          <p className="font-semibold text-xs text-purple-900 uppercase tracking-wider">
            Speed Rules:
          </p>
          <ul className="mt-1 list-disc list-inside text-xs text-gray-700">
            {speedRules.map((r, idx) => (
              <li key={idx}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
