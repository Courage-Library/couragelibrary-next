"use client";

import React from "react";
import { ExamTipProps } from "@/types/learning-compiler";
import { Award, Zap, Brain, Target } from "lucide-react";

export const ExamTip: React.FC<ExamTipProps> = ({
  variant = "SPEED",
  title,
  content,
}) => {
  const icon =
    variant === "SPEED" ? (
      <Zap className="h-5 w-5 text-amber-500" />
    ) : variant === "MEMORY" ? (
      <Brain className="h-5 w-5 text-purple-500" />
    ) : variant === "HIGH_YIELD" ? (
      <Award className="h-5 w-5 text-emerald-500" />
    ) : (
      <Target className="h-5 w-5 text-indigo-500" />
    );

  return (
    <div className="my-5 rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="font-semibold text-amber-900 text-sm uppercase tracking-wide dark:text-amber-300">
          Exam Tip: {title}
        </h4>
      </div>
      <p className="mt-2 text-gray-800 text-sm leading-relaxed dark:text-gray-200">{content}</p>
    </div>
  );
};
