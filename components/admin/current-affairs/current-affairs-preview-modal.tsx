'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Layers,
  GraduationCap,
  BookOpen,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { AdminCurrentAffairsFullArticle } from '@/types/current-affairs';
import { Badge } from '@/components/ui/badge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  articleId: string | null;
  versionId?: string | null;
}

export function CurrentAffairsPreviewModal({
  isOpen,
  onClose,
  articleId,
  versionId,
}: Props) {
  const [article, setArticle] = useState<AdminCurrentAffairsFullArticle | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !articleId) return;

    setIsLoading(true);
    const url = versionId
      ? `/api/admin/current-affairs/articles/${articleId}?versionId=${versionId}`
      : `/api/admin/current-affairs/articles/${articleId}`;

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setArticle(json.data);
        }
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, articleId, versionId]);

  if (!isOpen) return null;

  const version = article?.activeVersion;
  const isPublished = article?.status === 'PUBLISHED' && version?.status === 'PUBLISHED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">Article Preview</span>
            {version && (
              <Badge variant="indigo" className="font-mono text-[10px] px-1.5 py-0 bg-blue-100 text-blue-800 border-blue-200">
                v{version.versionNumber} ({version.status})
              </Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Watermark Banner for Drafts */}
        {!isPublished && (
          <div className="bg-amber-500 text-white font-bold text-center py-1.5 text-[11px] tracking-wider uppercase font-mono shadow-inner flex items-center justify-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>DRAFT PREVIEW — NOT PUBLIC</span>
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-xs">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500">Loading article preview...</div>
          ) : !article || !version ? (
            <div className="p-12 text-center text-slate-500">Failed to load article details.</div>
          ) : (
            <>
              {/* Meta pills */}
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-mono font-medium">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {article.newsDate}
                </span>
                <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold border border-blue-200">
                  {article.category.replace(/_/g, ' ')}
                </span>
                <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-bold border border-purple-200">
                  {article.importanceTier} IMPORTANCE
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                {version.headline}
              </h1>

              {/* Summary Body */}
              <div className="prose prose-slate max-w-none text-slate-700 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {version.summaryMd}
              </div>

              {/* Key Takeaways */}
              {version.keyTakeaways && version.keyTakeaways.length > 0 && (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-2">
                  <h3 className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" /> Key Takeaways
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-blue-950 text-xs">
                    {version.keyTakeaways.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Important Facts */}
              {version.importantFacts && version.importantFacts.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200 space-y-2">
                  <h3 className="font-bold text-amber-900 text-xs">Essential Facts &amp; Data</h3>
                  <ul className="list-disc pl-5 space-y-1 text-amber-950 text-xs">
                    {version.importantFacts.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Provenance Sources */}
              {version.sources && version.sources.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-mono">
                    Verification &amp; Provenance Sources
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {version.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all flex items-start justify-between gap-2 group"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-bold text-slate-800 truncate group-hover:text-blue-600">
                            {s.title}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {s.publisher} • <span className="font-mono text-blue-600">{s.tier}</span>
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
