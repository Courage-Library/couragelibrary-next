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
    // SYLLABUS-UI-1: a fixed height (h-13) under the site header; the cycle page sets --sticky-offset to header + this bar,
    // so the syllabus bar sticks below it instead of under it
    <div className="sticky top-(--site-header-h) z-20 flex h-13 items-center bg-white/95 backdrop-blur-md border-y border-slate-200/80 px-4 sm:px-6 shadow-2xs">
      <nav aria-label="Exam Section Navigation" className="flex w-full items-center gap-2 overflow-x-auto no-scrollbar">
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
