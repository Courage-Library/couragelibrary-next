"use client";

import React from "react";
import { ExamModuleKey } from "@/types/exam-knowledge";

interface ExamQuickNavProps {
  availableModuleKeys: ExamModuleKey[];
  hasPosts: boolean;
  hasCurriculum: boolean;
  hasSources: boolean;
  hasFaqs: boolean;
}

export function ExamQuickNav({
  hasPosts,
  hasCurriculum,
  hasSources,
  hasFaqs,
}: ExamQuickNavProps) {
  const sections = [
    { id: "overview", label: "Overview" },
    { id: "modules", label: "Exam Guides" },
    ...(hasCurriculum ? [{ id: "syllabus", label: "Syllabus & Topics" }] : []),
    ...(hasPosts ? [{ id: "posts", label: "Posts & Salary" }] : []),
    ...(hasSources ? [{ id: "sources", label: "Official Sources" }] : []),
    ...(hasFaqs ? [{ id: "faqs", label: "FAQs" }] : []),
  ];

  return (
    <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md border-y border-slate-200/80 py-2.5 px-4 sm:px-6 shadow-2xs">
      <nav aria-label="Exam Section Navigation" className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {sections.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 transition-colors"
          >
            {sec.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
