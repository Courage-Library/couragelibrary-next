"use client";

import React from "react";
import { Sparkles, Layers, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdaptiveProgressBadgeProps {
  currentStep: number;
  minQuestions: number;
  maxQuestions: number;
  difficultyTier?: "easy" | "medium" | "hard";
  isStoppingRuleMet?: boolean;
  className?: string;
}

export function AdaptiveProgressBadge({
  currentStep,
  minQuestions,
  maxQuestions,
  difficultyTier = "medium",
  isStoppingRuleMet = false,
  className,
}: AdaptiveProgressBadgeProps) {
  const tierColors = {
    easy: "bg-emerald-50 text-emerald-800 border-emerald-200",
    medium: "bg-blue-50 text-blue-800 border-blue-200",
    hard: "bg-purple-50 text-purple-800 border-purple-200",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-xl text-xs font-bold border select-none transition-all",
        tierColors[difficultyTier],
        className
      )}
    >
      <div className="flex items-center gap-1">
        <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
        <span className="font-extrabold font-mono uppercase tracking-wider text-[11px]">
          Adaptive Step {currentStep}
        </span>
      </div>

      <div className="h-3.5 w-px bg-slate-300/80" />

      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
        <Layers className="w-3 h-3" />
        <span>
          {currentStep < minQuestions
            ? `Min ${minQuestions} Qs`
            : `${currentStep}/${maxQuestions} Qs`}
        </span>
      </div>

      {isStoppingRuleMet && (
        <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
          <CheckCircle className="w-3 h-3" /> Target Precision Reached
        </span>
      )}
    </div>
  );
}
