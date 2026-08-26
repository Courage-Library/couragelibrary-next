import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface SubmitDialogProps {
  isOpen: boolean;
  answeredCount: number;
  unansweredCount: number;
  markedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function SubmitDialog({
  isOpen,
  answeredCount,
  unansweredCount,
  markedCount,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: SubmitDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2 border border-amber-200/60">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Submit Test Attempt?</h3>
          <p className="text-xs text-slate-500">
            Are you sure you want to finish and submit your answers for evaluation?
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/60">
            <span className="font-bold text-emerald-800 text-lg block">{answeredCount}</span>
            <span className="text-emerald-600 text-[11px] font-medium">Answered</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-800 text-lg block">{unansweredCount}</span>
            <span className="text-slate-500 text-[11px] font-medium">Unanswered</span>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200/60">
            <span className="font-bold text-purple-800 text-lg block">{markedCount}</span>
            <span className="text-purple-600 text-[11px] font-medium">Marked</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="md"
            className="w-1/2"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Resume Test
          </Button>
          <Button
            type="button"
            variant="default"
            size="md"
            className="w-1/2 bg-blue-600 hover:bg-blue-700"
            onClick={onConfirm}
            isLoading={isSubmitting}
          >
            Yes, Submit
          </Button>
        </div>
      </div>
    </div>
  );
}