import React from "react";

interface QuestionRendererProps {
  questionNumber: number;
  questionText: string;
  marks: number;
  negativeMark: number;
  sectionName?: string;
}

export function QuestionRenderer({
  questionNumber,
  questionText,
  marks,
  negativeMark,
  sectionName,
}: QuestionRendererProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center border border-blue-200/60">
            Q{questionNumber}
          </span>
          {sectionName && (
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              {sectionName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
            +{marks.toFixed(1)}
          </span>
          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/60">
            -{negativeMark.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="text-base text-slate-900 leading-relaxed font-medium whitespace-pre-wrap py-2">
        {questionText}
      </div>
    </div>
  );
}