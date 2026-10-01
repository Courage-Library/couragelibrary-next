'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  CheckSquare,
  Square,
  ShieldCheck,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { AdminCurrentAffairsFullArticle } from '@/types/current-affairs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  articleId: string | null;
  onActionComplete: () => void;
}

const REVIEW_CHECKLIST_ITEMS = [
  'Headline accurately represents event',
  'Event date verified against official notice',
  'Summary is factually supported',
  'Important facts and figures verified',
  'Primary source checked where available (PIB/Gazette/Ministry)',
  'Secondary sources appropriate and reputable',
  'All source URLs are secure HTTPS and legitimate',
  'Taxonomy mapping is appropriate for curriculum',
  'Exam relevance notes are accurate for prelims/mains',
  'Learning references are relevant and non-duplicate',
  'Question references are aligned with topic',
  'No AI citation artifacts (e.g. [1], [cite_ref]) present',
  'No unsupported claims or hallucinations',
  'No duplicate event already published in database',
  'Content is high-yield and useful for civil services exam preparation',
];

export function CurrentAffairsReviewWorkbench({
  isOpen,
  onClose,
  articleId,
  onActionComplete,
}: Props) {
  const [article, setArticle] = useState<AdminCurrentAffairsFullArticle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRequestChangesForm, setShowRequestChangesForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !articleId) return;

    setIsLoading(true);
    setCheckedItems({});
    setFeedback('');
    setShowRequestChangesForm(false);
    setErrorMessage(null);

    fetch(`/api/admin/current-affairs/articles/${articleId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setArticle(json.data);
        }
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, articleId]);

  if (!isOpen) return null;

  const version = article?.activeVersion;
  const allChecked =
    REVIEW_CHECKLIST_ITEMS.length > 0 &&
    REVIEW_CHECKLIST_ITEMS.every((_, idx) => Boolean(checkedItems[idx]));

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleSelectAll = () => {
    const all: Record<number, boolean> = {};
    REVIEW_CHECKLIST_ITEMS.forEach((_, i) => {
      all[i] = true;
    });
    setCheckedItems(all);
  };

  const handleApprove = async () => {
    if (!articleId || !version) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/current-affairs/articles/${articleId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: version.id }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error?.message || 'Failed to approve draft');
        return;
      }

      onActionComplete();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while approving draft');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!articleId || !version || !feedback.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/admin/current-affairs/articles/${articleId}/request-changes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            versionId: version.id,
            feedback: feedback.trim(),
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error?.message || 'Failed to request changes');
        return;
      }

      onActionComplete();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while requesting changes');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Editorial Review Workbench
              </h2>
              <p className="text-[11px] text-slate-500">
                Human verification checklist &amp; approval boundary (Server-Authoritative)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Split View */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 text-xs">
          {/* Left Panel: Content & Provenance (7 cols) */}
          <div className="lg:col-span-7 p-6 overflow-y-auto space-y-5">
            {isLoading ? (
              <div className="p-12 text-center text-slate-500">Loading draft details...</div>
            ) : !article || !version ? (
              <div className="p-12 text-center text-slate-500">Article not found.</div>
            ) : (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded uppercase">
                    {article.category} • v{version.versionNumber}
                  </span>
                  <h1 className="text-lg font-bold text-slate-900 leading-snug">
                    {version.headline}
                  </h1>
                </div>

                <div className="prose prose-slate max-w-none text-slate-700 text-xs leading-relaxed whitespace-pre-wrap p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  {version.summaryMd}
                </div>

                {/* Takeaways & Facts */}
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-blue-50/40 border border-blue-200 space-y-1">
                    <span className="font-bold text-blue-900 text-[11px] block">
                      Key Takeaways ({version.keyTakeaways.length})
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-blue-950 text-[11px]">
                      {version.keyTakeaways.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/40 border border-amber-200 space-y-1">
                    <span className="font-bold text-amber-900 text-[11px] block">
                      Essential Facts ({version.importantFacts.length})
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-amber-950 text-[11px]">
                      {version.importantFacts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Sources */}
                <div className="space-y-2">
                  <span className="font-bold text-slate-800 text-[11px] block uppercase tracking-wider font-mono">
                    Provenance Sources ({version.sources.length})
                  </span>
                  <div className="space-y-1.5">
                    {version.sources.map((s, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">{s.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {s.publisher} • {s.tier}
                          </div>
                        </div>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 p-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Panel: Human Review Checklist (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-slate-50/60 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-xs">Review Checklist</h3>
              </div>
              <button
                onClick={handleSelectAll}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
              >
                Select All
              </button>
            </div>

            <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
              {REVIEW_CHECKLIST_ITEMS.map((item, idx) => {
                const isChecked = Boolean(checkedItems[idx]);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleCheck(idx)}
                    className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer select-none"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`text-[11px] leading-tight ${
                        isChecked ? 'text-slate-800 font-medium' : 'text-slate-500'
                      }`}
                    >
                      {item}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Request Changes Form */}
            {showRequestChangesForm && (
              <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                <label className="block text-[11px] font-bold text-rose-900">
                  Editorial Feedback / Changes Needed:
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain required corrections, missing sources, or factual fixes..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 bg-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowRequestChangesForm(false)}
                    className="px-3 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestChanges}
                    disabled={isSubmitting || !feedback.trim()}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"
                  >
                    <Send className="w-3 h-3" /> Send Feedback
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {!showRequestChangesForm && (
              <button
                onClick={() => setShowRequestChangesForm(true)}
                className="px-3.5 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Request Changes</span>
              </button>
            )}

            <button
              onClick={handleApprove}
              disabled={isSubmitting || !allChecked}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Approving...' : 'Approve Draft (All Checks Passed)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
