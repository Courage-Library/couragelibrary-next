"use client";

import React, { useState } from "react";
import { ZoomIn, X, Sparkles } from "lucide-react";

interface QuestionRendererProps {
  questionNumber: number;
  totalQuestions?: number;
  questionText: string;
  questionImageUrl?: string | null;
  marks: number;
  negativeMark: number;
  sectionName?: string;
  pyqInfo?: string | null;
}

export function QuestionRenderer({
  questionNumber,
  totalQuestions,
  questionText,
  questionImageUrl,
  marks,
  negativeMark,
  sectionName,
  pyqInfo,
}: QuestionRendererProps) {
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header bar with Q number, section, PYQ and mark indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
            Q{questionNumber}
          </span>
          {totalQuestions && (
            <span className="text-xs font-semibold text-slate-400">
              of {totalQuestions}
            </span>
          )}
          {sectionName && (
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
              {sectionName}
            </span>
          )}
          {pyqInfo && (
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-600" />
              {pyqInfo}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80">
            +{marks.toFixed(1)}
          </span>
          <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200/80">
            -{negativeMark.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Question Text */}
      <div className="text-sm sm:text-base text-slate-900 leading-relaxed font-semibold whitespace-pre-wrap py-1">
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
              <span className="px-2.5 py-1 rounded-full bg-slate-900/80 text-white text-[11px] font-bold flex items-center gap-1 shadow-md">
                <ZoomIn className="w-3.5 h-3.5" /> Enlarge
              </span>
            </div>
          </div>
          {/* Caption Strictly Below Image */}
          <span className="text-[11px] text-slate-500 font-medium mt-2 flex items-center gap-1">
            <ZoomIn className="w-3 h-3 text-slate-400" /> Click figure to enlarge
          </span>
        </div>
      )}

      {/* Zoom / Lightbox Modal */}
      {isZoomOpen && questionImageUrl && (
        <div
          onClick={() => setIsZoomOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-white p-3.5 rounded-3xl shadow-2xl border border-slate-200 flex flex-col items-center animate-in zoom-in-95"
          >
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-2">
              <span className="text-xs font-bold text-slate-800">
                Question {questionNumber} — Figure Diagram
              </span>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={questionImageUrl}
              alt={`Figure for Question ${questionNumber} enlarged`}
              className="max-h-[75vh] max-w-full object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}