"use client";

import React from "react";
import { FormulaCardProps } from "@/types/learning-compiler";
import { Sigma, Sparkles, CheckCircle2 } from "lucide-react";

export const FormulaCard: React.FC<FormulaCardProps> = ({
  name,
  latexFormula,
  variableDefinitions = [],
  applicableConditions = [],
  speedShortcutTrick,
}) => {
  return (
    <div className="my-6 rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-xs dark:border-blue-900/60 dark:bg-blue-950/20">
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
        <Sigma className="h-5 w-5" />
        <h4 className="font-semibold text-base">{name}</h4>
      </div>

      <div className="my-3 overflow-x-auto rounded-lg bg-white p-4 text-center font-mono text-lg font-bold text-gray-900 shadow-inner dark:bg-gray-900 dark:text-gray-100">
        {latexFormula}
      </div>

      {variableDefinitions.length > 0 && (
        <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          <p className="font-medium text-xs text-gray-500 uppercase tracking-wider dark:text-gray-400">
            Variables:
          </p>
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {variableDefinitions.map((v, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                  {v.symbol}
                </span>
                <span>= {v.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {applicableConditions.length > 0 && (
        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Conditions: </span>
          {applicableConditions.join(", ")}
        </div>
      )}

      {speedShortcutTrick && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-amber-800 text-xs dark:bg-amber-950/40 dark:text-amber-300">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-semibold">Speed Shortcut / Trick: </span>
            {speedShortcutTrick}
          </div>
        </div>
      )}
    </div>
  );
};
