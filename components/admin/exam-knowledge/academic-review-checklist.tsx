"use client";

import React, { useState } from "react";
import { CheckSquare, Square, ShieldCheck, AlertCircle } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  category: "IDENTITY" | "FACTS" | "OFFICIAL" | "SECURITY";
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "c1", label: "Exam identity and conducting organization are 100% accurate", category: "IDENTITY" },
  { id: "c2", label: "Target cycle (if applicable) matches the official notification year", category: "IDENTITY" },
  { id: "c3", label: "All official dates (notification, registration, exam dates) verified", category: "OFFICIAL" },
  { id: "c4", label: "Eligibility parameters (age bounds, educational qualifications, relaxations) verified", category: "FACTS" },
  { id: "c5", label: "Application fee and category fee exemptions verified against official notice", category: "OFFICIAL" },
  { id: "c6", label: "Vacancies, post classifications, and 7th CPC Pay Levels verified", category: "FACTS" },
  { id: "c7", label: "Exam pattern (tiers, durations, marks, negative marking rules) verified", category: "FACTS" },
  { id: "c8", label: "Zero hallucinations: No fake URLs, dates, or non-existent posts", category: "SECURITY" },
  { id: "c9", label: "Language is clear, professional, and accessible to candidates", category: "SECURITY" },
  { id: "c10", label: "Official sources and citations have been checked for authenticity", category: "OFFICIAL" },
];

interface AcademicReviewChecklistProps {
  onChecklistComplete: (isAllChecked: boolean) => void;
}

export function AcademicReviewChecklist({ onChecklistComplete }: AcademicReviewChecklistProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    const next = new Set(checkedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCheckedIds(next);
    onChecklistComplete(next.size === CHECKLIST_ITEMS.length);
  };

  const isAllChecked = checkedIds.size === CHECKLIST_ITEMS.length;

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-900">
            Mandatory Academic Review Verification
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-slate-600">
          {checkedIds.size} / {CHECKLIST_ITEMS.length} Verified
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {CHECKLIST_ITEMS.map((item) => {
          const isChecked = checkedIds.has(item.id);
          return (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer select-none transition ${
                isChecked
                  ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 font-medium"
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              {isChecked ? (
                <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-snug">{item.label}</span>
            </div>
          );
        })}
      </div>

      {!isAllChecked && (
        <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>All 10 verification criteria must be human-verified before final academic approval.</span>
        </div>
      )}
    </div>
  );
}
