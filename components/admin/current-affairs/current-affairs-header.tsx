'use client';

import React from 'react';
import { Newspaper, Plus, Sparkles, Wand2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  onOpenCreate: () => void;
  onOpenImport: () => void;
  onOpenPrompt: () => void;
  onOpenQuiz?: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function CurrentAffairsHeader({
  onOpenCreate,
  onOpenImport,
  onOpenPrompt,
  onOpenQuiz,
  onRefresh,
  isRefreshing,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Current Affairs Studio</h1>
              <Badge variant="indigo" className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 font-mono font-semibold">
                v1.1.0 CANONICAL
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Authoritative editorial workbench for daily news, taxonomy resolution, exam mappings &amp; publication
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          title="Refresh Studio Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        {onOpenQuiz && (
          <button
            onClick={onOpenQuiz}
            className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Daily 10Q Quiz</span>
          </button>
        )}

        <button
          onClick={onOpenPrompt}
          className="px-3 py-2 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Wand2 className="w-3.5 h-3.5 text-purple-600" />
          <span>Prompt Generator</span>
        </button>

        <button
          onClick={onOpenImport}
          className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Import from AI</span>
        </button>

        <button
          onClick={onOpenCreate}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>New Current Affair</span>
        </button>
      </div>
    </div>
  );
}
