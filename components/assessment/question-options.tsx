import React from "react";
import { cn } from "@/lib/utils";

interface OptionItem {
  key: string;
  text: string;
}

interface QuestionOptionsProps {
  options: OptionItem[];
  selectedOption: string | null;
  onSelectOption: (optionKey: string) => void;
  disabled?: boolean;
}

export function QuestionOptions({
  options,
  selectedOption,
  onSelectOption,
  disabled = false,
}: QuestionOptionsProps) {
  return (
    <div className="space-y-2.5 pt-2">
      {options.map((option) => {
        const isSelected = selectedOption === option.key;

        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onSelectOption(option.key)}
            className={cn(
              "w-full text-left p-3.5 sm:p-4 rounded-xl border transition-all flex items-start gap-3.5 group cursor-pointer select-none",
              isSelected
                ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 text-slate-900 shadow-xs"
                : "bg-white border-slate-200/90 text-slate-800 hover:border-slate-300 hover:bg-slate-50/60"
            )}
          >
            <div
              className={cn(
                "w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 transition-colors mt-0.5",
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
              )}
            >
              {option.key}
            </div>
            <div className="text-sm font-medium leading-relaxed pt-0.5">
              {option.text}
            </div>
          </button>
        );
      })}
    </div>
  );
}