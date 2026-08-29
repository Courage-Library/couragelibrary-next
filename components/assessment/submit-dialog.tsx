"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, ShieldCheck } from "lucide-react";

export interface SectionSubmitSummary {
  id: string;
  name: string;
  totalQuestions: number;
  answeredCount: number;
}

interface SubmitDialogProps {
  isOpen: boolean;
  answeredCount: number;
  unansweredCount: number;
  markedCount: number;
  sectionsSummary?: SectionSubmitSummary[];
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submissionError?: string | null;
}

export function SubmitDialog({
  isOpen,
  answeredCount,
  unansweredCount,
  markedCount,
  sectionsSummary = [],
  onConfirm,
  onCancel,
  isSubmitting = false,
  submissionError = null,
}: SubmitDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1 border border-blue-200/60">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Review &amp; Final Submission</h3>
          <p className="text-xs text-slate-500 font-medium">
            Please verify your attempt summary before completing the examination.
          </p>
        </div>

        {/* Global Metric Cards */}
        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/60">
            <span className="font-black text-emerald-900 text-xl block">{answeredCount}</span>
            <span className="text-emerald-700 text-[11px] font-bold">Answered</span>
          </div>
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/60">
            <span className="font-black text-amber-900 text-xl block">{unansweredCount}</span>
            <span className="text-amber-700 text-[11px] font-bold">Unanswered</span>
          </div>
          <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200/60">
            <span className="font-black text-purple-900 text-xl block">{markedCount}</span>
            <span className="text-purple-700 text-[11px] font-bold">Marked</span>
          </div>
        </div>

        {/* Section-Wise Breakdown (if multiple sections exist) */}
        {sectionsSummary.length > 1 && (
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono block">
              Section Breakdown
            </span>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
              {sectionsSummary.map((sec) => (
                <div key={sec.id} className="p-2.5 bg-slate-50/50 flex items-center justify-between">
                  <span className="font-bold text-slate-800">{sec.name}</span>
                  <span className="font-semibold text-slate-600">
                    <strong className="text-blue-700">{sec.answeredCount}</strong> / {sec.totalQuestions} answered
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unanswered Questions Warning Banner */}
        {unansweredCount > 0 && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">
                {unansweredCount} question{unansweredCount > 1 ? "s" : ""} remaining unattempted
              </span>
              <span className="text-amber-800/90 text-[11px] leading-relaxed block">
                Unanswered questions will receive zero marks. Once submitted, answers cannot be edited.
              </span>
            </div>
          </div>
        )}

        {/* Submission Failure Recovery Banner */}
        {submissionError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">Submission Failed</span>
              <span className="text-rose-800 text-[11px] block">
                {submissionError}. Your answers are preserved locally. Check your internet connection and try again.
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            className="w-1/2 rounded-xl text-xs font-bold"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Return to Test
          </Button>
          <Button
            type="button"
            variant="default"
            size="md"
            className="w-1/2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold shadow-xs"
            onClick={onConfirm}
            isLoading={isSubmitting}
          >
            {isSubmitting ? "Finalizing..." : "Confirm & Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}