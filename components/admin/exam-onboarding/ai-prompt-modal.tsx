"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Check, ShieldCheck, AlertCircle, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  stepName?: string;
  promptText: string;
  promptVersion: string;
  contextHash: string;
}

export function AiPromptModal({
  isOpen,
  onClose,
  title,
  stepName,
  promptText,
  promptVersion,
  contextHash,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {title}
                {stepName && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-700">
                    {stepName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Contract: {promptVersion} &bull; Context Hash: {contextHash}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="p-3.5 bg-blue-50/60 border border-blue-200/60 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Human-in-the-Loop Protocol:</span>
              <p className="text-blue-800 leading-relaxed">
                Copy this prompt and paste it into an external AI tool (ChatGPT, Claude, Gemini, Perplexity). The AI will research and return a structured JSON package that you can paste into the Courage Importer.
              </p>
            </div>
          </div>

          <div className="relative">
            <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl overflow-x-auto max-h-[360px] leading-relaxed whitespace-pre-wrap selection:bg-blue-500 selection:text-white">
              {promptText}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> External AI output remains untrusted until validated by Courage.
          </span>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs font-semibold rounded-xl">
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" /> Copied to Clipboard
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy Prompt for External AI
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
