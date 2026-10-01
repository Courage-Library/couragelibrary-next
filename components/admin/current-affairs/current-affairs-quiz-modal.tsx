'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  HelpCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { DailyQuizEligibilityReport } from '@/types/current-affairs';

interface CurrentAffairsQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CurrentAffairsQuizModal({ isOpen, onClose }: CurrentAffairsQuizModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [report, setReport] = useState<DailyQuizEligibilityReport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchEligibility = async (date: string) => {
    setLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/current-affairs/quiz/eligibility?date=${date}`);
      const json = await res.json();
      if (json.success && json.report) {
        setReport(json.report);
      } else {
        setActionError(json.error || 'Failed to calculate eligibility');
      }
    } catch (e: any) {
      setActionError(e?.message || 'Network error fetching eligibility');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEligibility(selectedDate);
    }
  }, [isOpen, selectedDate]);

  const handleGenerate = async () => {
    setGenerating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/admin/current-affairs/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const json = await res.json();
      if (json.success) {
        setActionSuccess('Canonical 10Q Daily Quiz generated successfully in DRAFT mode.');
        fetchEligibility(selectedDate);
      } else {
        setActionError(json.error || 'Failed to generate quiz');
      }
    } catch (e: any) {
      setActionError(e?.message || 'Error generating quiz');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/admin/current-affairs/quiz/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const json = await res.json();
      if (json.success) {
        setActionSuccess('Daily Quiz published successfully for candidate access.');
        fetchEligibility(selectedDate);
      } else {
        setActionError(json.error || 'Failed to publish quiz');
      }
    } catch (e: any) {
      setActionError(e?.message || 'Error publishing quiz');
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  const isShortage = report?.status === 'SHORTAGE_BLOCKED';
  const isPublished = report?.status === 'ALREADY_PUBLISHED';
  const isDraft = report?.status === 'DRAFT_EXISTS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Daily Current Affairs 10Q Quiz Studio</h2>
              <p className="text-xs text-slate-500">
                Authoritative 10-Question Daily Mock generation & publication engine (CA-4)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Date Selector & Refresh */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/60">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-500" />
              <label className="text-sm font-semibold text-slate-700">Quiz Target Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
              />
            </div>
            <button
              onClick={() => fetchEligibility(selectedDate)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Recalculate Eligibility
            </button>
          </div>

          {/* Feedback Banners */}
          {actionError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm text-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Operation Error</p>
                <p className="text-xs mt-0.5 text-rose-700">{actionError}</p>
              </div>
            </div>
          )}

          {actionSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-sm text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Success</p>
                <p className="text-xs mt-0.5 text-emerald-700">{actionSuccess}</p>
              </div>
            </div>
          )}

          {/* Eligibility Metrics Bar */}
          {report && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs text-slate-500 font-medium">Required Count</p>
                <p className="text-xl font-bold text-slate-900 mt-1">10 Questions</p>
                <span className="text-[10px] text-slate-400">Strict CA-4 Contract</span>
              </div>
              <div className="p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl">
                <p className="text-xs text-emerald-700 font-medium">Same-Day Available</p>
                <p className="text-xl font-bold text-emerald-900 mt-1">{report.sameDayCount}</p>
                <span className="text-[10px] text-emerald-600 font-medium">Priority Level 1</span>
              </div>
              <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-xl">
                <p className="text-xs text-blue-700 font-medium">Same-Week Backfill</p>
                <p className="text-xl font-bold text-blue-900 mt-1">{report.sameWeekCount}</p>
                <span className="text-[10px] text-blue-600 font-medium">
                  {report.weekStartDate} to {report.weekEndDate}
                </span>
              </div>
              <div className="p-3 bg-purple-50/60 border border-purple-200/60 rounded-xl">
                <p className="text-xs text-purple-700 font-medium">Total Eligible</p>
                <p className="text-xl font-bold text-purple-900 mt-1">{report.totalEligibleCount}</p>
                <span className="text-[10px] text-purple-600 font-medium">Unique Deduplicated</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs text-slate-500 font-medium">Quiz Status</p>
                <div className="mt-1">
                  {isPublished ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                      PUBLISHED
                    </span>
                  ) : isDraft ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                      DRAFT READY
                    </span>
                  ) : isShortage ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                      SHORTAGE BLOCKED
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      ELIGIBLE (10/10)
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">
                  {isShortage ? `Short by ${report.shortageCount}` : 'Contract Met'}
                </span>
              </div>
            </div>
          )}

          {/* Shortage Blocked Alert */}
          {isShortage && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Shortage Blocked — Incomplete Quizzes Prohibited</p>
                <p className="text-xs mt-1 text-amber-800 leading-relaxed">
                  The Daily Current Affairs Quiz strictly requires exactly 10 eligible questions. Only{' '}
                  <span className="font-bold">{report?.totalEligibleCount}</span> eligible questions were found for
                  the week of {report?.weekStartDate} to {report?.weekEndDate} (Shortage: {report?.shortageCount}).
                  Unrelated Question Bank questions are strictly blocked from backfilling. Please map and publish
                  more Current Affairs articles with questions to unlock quiz generation.
                </p>
              </div>
            </div>
          )}

          {/* Selected 10 Questions Preview */}
          {report && report.questions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Selected 10 Questions Blueprint ({report.questions.length} Questions)
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  Deterministic Priority Order
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm divide-y divide-slate-100">
                {report.questions.map((q, idx) => (
                  <div key={q.questionId} className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-start gap-3 text-xs">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {q.isSameDay ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            SAME-DAY ({q.newsDate})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                            SAME-WEEK ({q.newsDate})
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                          {q.category}
                        </span>
                        {q.topicName && (
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px]">
                            {q.topicName}
                          </span>
                        )}
                        <span className="text-slate-400 text-[10px] ml-auto font-mono">
                          ID: {q.questionId.slice(0, 8)}...
                        </span>
                      </div>
                      <p className="text-slate-800 font-medium leading-snug line-clamp-2">
                        {q.questionText}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        <span className="font-semibold text-slate-600">Source Article:</span> {q.articleHeadline}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-xs text-slate-500">
            {isPublished ? (
              <span className="text-blue-700 font-medium">✓ Live in Daily Mock Feed</span>
            ) : isDraft ? (
              <span className="text-purple-700 font-medium">Draft Generated — Awaiting Publication</span>
            ) : (
              <span>Ready for generation</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || isShortage || isPublished}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Generate 10Q Quiz
                </>
              )}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || isPublished || !isDraft}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {publishing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Publish Live Quiz
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
