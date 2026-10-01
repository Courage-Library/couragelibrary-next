'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Award,
  AlertCircle,
  ArrowRight,
  Target,
  BrainCircuit,
} from 'lucide-react';
import { DailyQuizEligibilityStatus } from '@/types/current-affairs';
import { formatEventDate } from './current-affairs-card';

interface CurrentAffairsDailyQuizCardProps {
  dateStr: string;
  dailyQuiz: {
    status: DailyQuizEligibilityStatus;
    totalEligibleCount: number;
    requiredCount: number;
    shortageCount: number;
    mockTestSlug: string;
    mockTestId?: string | null;
  };
}

export const CurrentAffairsDailyQuizCard: React.FC<CurrentAffairsDailyQuizCardProps> = ({
  dateStr,
  dailyQuiz,
}) => {
  const isAvailable =
    dailyQuiz.status === 'READY' ||
    dailyQuiz.status === 'ALREADY_PUBLISHED' ||
    Boolean(dailyQuiz.mockTestId);

  const formattedDate = formatEventDate(dateStr);
  const quizTargetHref = `/mock-tests/${dailyQuiz.mockTestId || dailyQuiz.mockTestSlug}`;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-blue-700/40">
      {/* Subtle background glow effect */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/30 text-blue-200 border border-blue-400/40 backdrop-blur-sm">
              <BrainCircuit className="w-3.5 h-3.5 text-blue-300" />
              DAILY 10Q EVALUATION
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-slate-200">
              {formattedDate}
            </span>
          </div>

          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-white">
            Daily Current Affairs Quiz
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed">
            10 exam-standard multiple-choice questions mapped directly to today&apos;s verified events.
            Wrong answers are automatically synced to your <strong className="text-amber-300">Mistake Vault</strong> for spaced revision.
          </p>

          {/* Quiz Metadata Pills */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>10 Questions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>10 Minutes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>20 Marks (+2 / -0.5)</span>
            </div>
          </div>
        </div>

        {/* CTA Actions */}
        <div className="flex flex-col items-start md:items-end justify-center shrink-0">
          {isAvailable ? (
            <div className="space-y-2 w-full md:w-auto">
              <Link
                href={quizTargetHref}
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Start Daily Quiz</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[11px] text-slate-400 text-center md:text-right">
                Free • Instant Result & Solution Key
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-left md:text-right max-w-xs">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Quiz Curation In Progress</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-normal">
                Today&apos;s 10-question evaluation is being curated by editorial staff. Check back shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
