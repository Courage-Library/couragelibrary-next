"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

interface ExamFaqAccordionProps {
  faqs: Array<{ question: string; answer: string }>;
}

export function ExamFaqAccordion({ faqs }: ExamFaqAccordionProps) {
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({ 0: true });

  const toggleIndex = (idx: number) => {
    setExpandedIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {faqs.map((faq, idx) => {
        const isExpanded = Boolean(expandedIndices[idx]);
        return (
          <Card key={idx} className="border-slate-200 overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => toggleIndex(idx)}
              className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <h5 className="text-xs sm:text-sm font-bold text-slate-900">{faq.question}</h5>
              </div>
              <div className="text-slate-400 shrink-0">
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            {isExpanded && (
              <CardContent className="p-4 pt-0 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/30">
                {faq.answer}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
