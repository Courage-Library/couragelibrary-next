"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  HelpCircle,
  X,
  CheckCircle2,
  Clock,
  Keyboard,
  ShieldAlert,
} from "lucide-react";

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstructionsModal({ isOpen, onClose }: InstructionsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <span>Official Examination Instructions</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          {/* Section 1: Question Palette States */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] font-mono">
              1. Question Palette Symbols
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="w-4 h-4 rounded bg-emerald-600 shrink-0" />
                <span className="font-semibold text-emerald-900">Answered</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50 border border-purple-200">
                <span className="w-4 h-4 rounded bg-purple-600 shrink-0" />
                <span className="font-semibold text-purple-900">Marked for Review</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50 border border-purple-200">
                <span className="w-4 h-4 rounded bg-purple-600 ring-2 ring-emerald-400 shrink-0" />
                <span className="font-semibold text-purple-900">Answered &amp; Marked</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                <span className="w-4 h-4 rounded bg-amber-50 border border-amber-300 shrink-0" />
                <span className="font-semibold text-amber-900">Visited / Not Answered</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                <span className="w-4 h-4 rounded bg-slate-100 border border-slate-300 shrink-0" />
                <span className="font-semibold text-slate-700">Not Visited Yet</span>
              </div>
            </div>
          </div>

          {/* Section 2: Timer & Autosave */}
          <div className="space-y-1.5 pt-1">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              2. Timer &amp; Autosave Protection
            </h4>
            <ul className="space-y-1.5 pl-1">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Every answer choice is automatically saved locally and synchronized with the server in real-time.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>When the countdown timer reaches 00:00, the exam will automatically auto-submit your answers.</span>
              </li>
            </ul>
          </div>

          {/* Section 3: Keyboard Shortcuts */}
          <div className="space-y-1.5 pt-1">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] font-mono flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-purple-600" />
              3. Keyboard Shortcuts (Desktop)
            </h4>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div><kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">1–4</kbd> or <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">A–D</kbd>: Select Option</div>
              <div><kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">→</kbd> or <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">N</kbd>: Next Question</div>
              <div><kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">←</kbd> or <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">P</kbd>: Previous Question</div>
              <div><kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">M</kbd>: Mark for Review</div>
              <div><kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">C</kbd>: Clear Response</div>
              <div><kbd className="px-1.5 py-0.5 bg-white border rounded shadow-2xs font-bold">?</kbd>: View Instructions</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClose}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 px-5"
          >
            Got It, Return to Test
          </Button>
        </div>
      </div>
    </div>
  );
}
