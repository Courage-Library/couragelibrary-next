"use client";

import React from "react";
import { WarningBoxProps } from "@/types/learning-compiler";
import { AlertOctagon, CheckCircle2 } from "lucide-react";

export const WarningBox: React.FC<WarningBoxProps> = ({
  trapType,
  misconception,
  correctApproach,
}) => {
  return (
    <div className="my-6 rounded-xl border border-rose-200 bg-rose-50/60 p-5 shadow-xs dark:border-rose-900/60 dark:bg-rose-950/20">
      <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
        <AlertOctagon className="h-5 w-5" />
        <h4 className="font-semibold text-base">
          Cognitive Trap: <span className="font-mono text-sm">{trapType}</span>
        </h4>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <div className="rounded-lg bg-white/80 p-3 text-rose-900 dark:bg-gray-900/80 dark:text-rose-200">
          <span className="font-bold text-rose-700 dark:text-rose-400">Common Misconception / Trap: </span>
          {misconception}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-emerald-50/80 p-3 text-emerald-900 dark:bg-gray-900/80 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">Correct Approach: </span>
            {correctApproach}
          </div>
        </div>
      </div>
    </div>
  );
};
