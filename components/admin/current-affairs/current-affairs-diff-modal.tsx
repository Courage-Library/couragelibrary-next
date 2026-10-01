'use client';

import React, { useEffect, useState } from 'react';
import { X, GitCompare, Plus, Minus, ArrowRight } from 'lucide-react';
import { VersionDiffResult } from '@/types/current-affairs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  articleId: string | null;
  v1Number: number;
  v2Number: number;
}

export function CurrentAffairsDiffModal({
  isOpen,
  onClose,
  articleId,
  v1Number,
  v2Number,
}: Props) {
  const [diff, setDiff] = useState<VersionDiffResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !articleId) return;

    setIsLoading(true);
    fetch(`/api/admin/current-affairs/articles/${articleId}/diff?v1=${v1Number}&v2=${v2Number}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setDiff(json.data);
        }
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, articleId, v1Number, v2Number]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Version Comparison: v{v1Number} <ArrowRight className="w-3 h-3 inline mx-1" /> v{v2Number}
              </h2>
              <p className="text-[11px] text-slate-500">
                Visual diff of editorial changes between versions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diff Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">Computing version diff...</div>
          ) : !diff ? (
            <div className="p-12 text-center text-slate-500">Could not load version diff.</div>
          ) : (
            <>
              {/* Headline Diff */}
              <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-700 text-[11px] block uppercase tracking-wider font-mono">
                  Headline
                </span>
                {diff.headlineChanged ? (
                  <div className="space-y-1">
                    <div className="p-2 rounded bg-rose-50 text-rose-800 line-through text-xs">
                      {diff.headline.from}
                    </div>
                    <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">
                      {diff.headline.to}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 rounded bg-white text-slate-800 text-xs border border-slate-200">
                    {diff.headline.to} (Unchanged)
                  </div>
                )}
              </div>

              {/* Summary Diff */}
              <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-700 text-[11px] block uppercase tracking-wider font-mono">
                  Summary Body
                </span>
                {diff.summaryChanged ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-200 text-rose-950 space-y-1">
                      <span className="text-[10px] font-bold text-rose-700 uppercase">v{v1Number} (Original)</span>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">{diff.summary.from}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-950 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">v{v2Number} (Updated)</span>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">{diff.summary.to}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded bg-white text-slate-700 text-xs border border-slate-200 whitespace-pre-wrap">
                    {diff.summary.to}
                  </div>
                )}
              </div>

              {/* Key Takeaways Diff */}
              <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-700 text-[11px] block uppercase tracking-wider font-mono">
                  Key Takeaways Diff
                </span>
                <div className="space-y-1">
                  {diff.keyTakeawaysDiff.added.map((t, i) => (
                    <div key={i} className="p-1.5 rounded bg-emerald-50 text-emerald-800 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{t}</span>
                    </div>
                  ))}
                  {diff.keyTakeawaysDiff.removed.map((t, i) => (
                    <div key={i} className="p-1.5 rounded bg-rose-50 text-rose-800 line-through flex items-center gap-1.5">
                      <Minus className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{t}</span>
                    </div>
                  ))}
                  {diff.keyTakeawaysDiff.unchanged.map((t, i) => (
                    <div key={i} className="p-1.5 rounded bg-white text-slate-700 border border-slate-200">
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              {/* Important Facts Diff */}
              <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-700 text-[11px] block uppercase tracking-wider font-mono">
                  Important Facts Diff
                </span>
                <div className="space-y-1">
                  {diff.importantFactsDiff.added.map((f, i) => (
                    <div key={i} className="p-1.5 rounded bg-emerald-50 text-emerald-800 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                  {diff.importantFactsDiff.removed.map((f, i) => (
                    <div key={i} className="p-1.5 rounded bg-rose-50 text-rose-800 line-through flex items-center gap-1.5">
                      <Minus className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                  {diff.importantFactsDiff.unchanged.map((f, i) => (
                    <div key={i} className="p-1.5 rounded bg-white text-slate-700 border border-slate-200">
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            Close Diff
          </button>
        </div>
      </div>
    </div>
  );
}
