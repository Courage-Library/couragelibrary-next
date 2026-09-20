"use client";

import React, { useState } from "react";
import { Copy, Check, Terminal, FileText, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PromptViewerPanelProps {
  promptText: string;
  contractVersion: string;
  contextHash: string;
  targetIdentity: {
    examName: string;
    cycleYear?: number | null;
    moduleKey: string;
    language: string;
  };
}

export function PromptViewerPanel({
  promptText,
  contractVersion,
  contextHash,
  targetIdentity,
}: PromptViewerPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Failed to copy prompt:", err);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-100 overflow-hidden shadow-lg">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-mono font-bold text-slate-200">
            Authoritative External AI Prompt
          </span>
          <Badge variant="indigo" className="text-[10px] font-mono px-2 py-0.5 bg-blue-950 text-blue-300 border-blue-800">
            {contractVersion}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">
            {promptText.length.toLocaleString()} chars
          </span>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
            aria-label="Copy prompt to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Prompt</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Target & Hash Meta Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-slate-300 truncate">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-400">Target:</span>
          <span className="font-semibold text-white truncate">
            {targetIdentity.examName} {targetIdentity.cycleYear ? `(${targetIdentity.cycleYear})` : ""} &bull; {targetIdentity.moduleKey}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          <Hash className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>Context Hash:</span>
          <span className="text-blue-300 truncate font-mono text-[10px]" title={contextHash}>
            {contextHash ? `${contextHash.substring(0, 16)}...${contextHash.substring(48)}` : "None"}
          </span>
        </div>
      </div>

      {/* Prompt Monospace Textarea Container */}
      <div className="p-4 bg-slate-950/60 max-h-[420px] overflow-y-auto">
        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed select-text font-normal">
          {promptText}
        </pre>
      </div>
    </div>
  );
}
