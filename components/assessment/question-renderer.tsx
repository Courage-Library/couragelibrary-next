"use client";

import React, { useState } from "react";
import { ZoomIn, X } from "lucide-react";

interface QuestionRendererProps {
  questionNumber: number;
  questionText: string;
  questionImageUrl?: string | null;
  marks: number;
  negativeMark: number;
  sectionName?: string;
}

export function QuestionRenderer({
  questionNumber,
  questionText,
  questionImageUrl,
  marks,
  negativeMark,
  sectionName,
}: QuestionRendererProps) {
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header bar with Q number, section and mark indicators */}
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

      {/* Question Text */}
      <div className="text-base text-slate-900 leading-relaxed font-medium whitespace-pre-wrap py-1">
        {questionText}
      </div>

      {/* Question Figure / Diagram (if present) */}
      {questionImageUrl && (
        <div className="my-3 p-3 bg-slate-50/80 rounded-2xl border border-slate-200/90 flex flex-col items-center">
          <div
            onClick={() => setIsZoomOpen(true)}
            className="group relative inline-block cursor-zoom-in overflow-hidden rounded-xl bg-white border border-slate-200 shadow-xs"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={questionImageUrl}
              alt={`Figure for Question ${questionNumber}`}
              className="max-h-72 max-w-full object-contain rounded-xl transition group-hover:opacity-95"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="px-2.5 py-1 rounded-full bg-slate-900/75 text-white text-[11px] font-bold flex items-center gap-1 shadow-md">
                <ZoomIn className="w-3.5 h-3.5" /> Enlarge
              </span>
            </div>
          </div>
          <span className="text-[11px] text-slate-400 font-medium mt-1.5 flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> Click image to enlarge figure
          </span>
        </div>
      )}

      {/* Zoom / Lightbox Modal */}
      {isZoomOpen && questionImageUrl && (
        <div
          onClick={() => setIsZoomOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-white p-3 rounded-2xl shadow-2xl border border-slate-200 flex flex-col items-center"
          >
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-2">
              <span className="text-xs font-bold text-slate-700">
                Question {questionNumber} — Detailed Figure
              </span>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={questionImageUrl}
              alt={`Figure for Question ${questionNumber} enlarged`}
              className="max-h-[75vh] max-w-full object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}