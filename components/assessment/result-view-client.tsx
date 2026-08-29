"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { TestResultSummary } from "@/services/assessment.service";
import { QuestionReviewCard } from "@/components/assessment/question-review-card";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Trophy,
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Flame,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface ResultViewClientProps {
  data: TestResultSummary;
}

type QuestionFilter = "all" | "incorrect" | "correct" | "unattempted";

export function ResultViewClient({ data }: ResultViewClientProps) {
  const { result, test, standing, security, insights, sections, reviewQuestions } = data;

  const [activeFilter, setActiveFilter] = useState<QuestionFilter>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return reviewQuestions.filter((q) => {
      // Section filter
      if (selectedSection !== "all" && q.sectionName !== selectedSection) {
        return false;
      }

      // Status filter
      if (activeFilter === "incorrect") {
        return q.selectedOption !== null && !q.isCorrect;
      }
      if (activeFilter === "correct") {
        return q.isCorrect;
      }
      if (activeFilter === "unattempted") {
        return q.selectedOption === null;
      }
      return true;
    });
  }, [reviewQuestions, activeFilter, selectedSection]);

  // Reset expansion when filter or section changes
  const handleFilterChange = (filter: QuestionFilter) => {
    setActiveFilter(filter);
    setIsExpanded(false);
  };

  const handleSectionChange = (section: string) => {
    setSelectedSection(section);
    setIsExpanded(false);
  };

  const incorrectCount = result.incorrectCount;
  const correctCount = result.correctCount;
  const unattemptedCount = result.unansweredCount;

  // Visible questions: 5 by default, or all if expanded / count <= 5
  const visibleQuestions = useMemo(() => {
    if (isExpanded || filteredQuestions.length <= 5) {
      return filteredQuestions;
    }
    return filteredQuestions.slice(0, 5);
  }, [filteredQuestions, isExpanded]);

  // Format Time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const percentageScore = result.maxScore > 0
    ? Math.round((result.totalScore / result.maxScore) * 1000) / 10
    : 0;

  return (
    <div className="py-8 sm:py-12 bg-slate-50/70 min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/mock-tests"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Mock Tests
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 font-bold">
              {security.maskedId} &bull; {security.attemptIdShort}
            </span>
            <Badge variant="indigo" className="text-[11px] font-extrabold uppercase tracking-wide">
              Official Assessment
            </Badge>
          </div>
        </div>

        {/* Test Summary Context Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 font-mono">
              Test Completed &bull; {security.timestamp}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {test.title}
            </h1>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-500 font-semibold">
            <span>{test.totalQuestions} Questions</span> &bull; <span>{test.totalMarks} Marks</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 1. SCORECARD HERO BANNER                                                  */}
        {/* ========================================================================= */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-6 sm:p-8 shadow-xl border border-slate-700/50">
          <CandidateSecurityWatermark
            examTitle={test.title}
            maskedCandidateId={security.maskedId}
            attemptIdShort={security.attemptIdShort}
            timestamp={security.timestamp}
            isLighter={true}
          />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-300 font-mono">
                Your Score
              </span>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                  {result.totalScore.toFixed(2)}
                </span>
                <span className="text-lg sm:text-xl font-bold text-slate-400">
                  / {result.maxScore}
                </span>
                <span className="ml-2 px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 text-sm font-extrabold border border-indigo-400/30">
                  {percentageScore.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {insights.accuracyLevel} with {result.accuracyPercentage.toFixed(1)}% overall accuracy.
              </p>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-900">
              <div className="p-3 rounded-2xl bg-white/95 backdrop-blur-xs text-center">
                <span className="text-xl font-black text-emerald-600 block">{correctCount}</span>
                <span className="text-[11px] font-bold text-slate-500">Correct</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/95 backdrop-blur-xs text-center">
                <span className="text-xl font-black text-red-600 block">{incorrectCount}</span>
                <span className="text-[11px] font-bold text-slate-500">Wrong</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/95 backdrop-blur-xs text-center">
                <span className="text-xl font-black text-amber-600 block">{unattemptedCount}</span>
                <span className="text-[11px] font-bold text-slate-500">Unattempted</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/95 backdrop-blur-xs text-center">
                <span className="text-xl font-black text-slate-800 block">
                  {formatTime(result.timeSpentSeconds)}
                </span>
                <span className="text-[11px] font-bold text-slate-500">Time Taken</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. YOUR STANDING (ABOVE THE FOLD)                                         */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Your Standing</h2>
            </div>
            <Link href={`/mock-tests/${test.id}/leaderboard`}>
              <Button variant="ghost" size="sm" className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 cursor-pointer">
                View Full Leaderboard <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Rank Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/80 to-amber-100/50 border border-amber-200/80">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block font-mono">
                Current Rank
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-black text-amber-950">#{standing.rank}</span>
                <span className="text-xs font-bold text-amber-700">/ {standing.totalParticipants}</span>
              </div>
              <span className="text-[11px] text-amber-800 font-medium block mt-1">
                Across all verified candidate submissions
              </span>
            </div>

            {/* Percentile Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/80 to-blue-100/50 border border-blue-200/80">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block font-mono">
                Percentile Score
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-blue-950">{standing.percentile.toFixed(1)}</span>
                <span className="text-xs font-bold text-blue-700">%ile</span>
              </div>
              <span className="text-[11px] text-blue-800 font-medium block mt-1">
                Better than {standing.percentile.toFixed(0)}% of candidates
              </span>
            </div>

            {/* Total Participants Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block font-mono">
                Participants
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black text-slate-900">{standing.totalParticipants}</span>
                <span className="text-xs font-bold text-slate-500">candidates</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium block mt-1">
                Completed this official test
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. CL COINS GAMIFICATION REWARD CARD                                     */}
        {/* ========================================================================= */}
        {data.rewards && (
          data.rewards.isRetake ? (
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">CL Coins: 0 CL</h2>
                    <p className="text-[11px] text-slate-500 font-medium">Single attempt already evaluated</p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-mono font-bold border border-slate-200">
                  0 CL
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium pt-1">
                This scheduled mock test has already been completed. Exactly one attempt is permitted per student for this examination program.
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-3xl bg-white border border-amber-200/90 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">CL Coins Earned</h2>
                    <p className="text-[11px] text-slate-500 font-medium">Server-authoritative assessment rewards</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black border border-amber-300 font-mono">
                  +{data.rewards.totalCoinsEarned} CL Coins
                </span>
              </div>

              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50 overflow-hidden">
                {/* Row 1: Test Completion (if earned) */}
                {data.rewards.completionCoins > 0 && (
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{data.rewards.completionReason}</span>
                        <span className="text-[11px] text-slate-500 font-medium">First completed submission verified</span>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-emerald-700 font-mono">+{data.rewards.completionCoins} CL</span>
                  </div>
                )}

                {/* Row 2: Accuracy Bonus (if earned) */}
                {data.rewards.accuracyBonusCoins > 0 && (
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Target className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{data.rewards.accuracyReason}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700 font-mono">
                            {data.rewards.accuracyPercentage}% Acc
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                          Satisfied attempt threshold ({result.attemptedCount}/{result.totalQuestions} Qs attempted)
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-blue-700 font-mono">
                      +{data.rewards.accuracyBonusCoins} CL
                    </span>
                  </div>
                )}

                {/* Row 3: Streak Consistency (if earned) */}
                {data.rewards.streakCoins > 0 && (
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{data.rewards.streakReason}</span>
                        <span className="text-[11px] text-slate-500 font-medium">Daily study streak maintained</span>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-orange-600 font-mono">
                      +{data.rewards.streakCoins} CL
                    </span>
                  </div>
                )}

                {/* Row 4: Badge Unlocked (if any) */}
                {data.rewards.badgeUnlocked && (
                  <div className="p-3.5 flex items-center justify-between bg-amber-50/60">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-amber-950 block">
                          Achievement Unlocked: {data.rewards.badgeUnlocked.title}
                        </span>
                        <span className="text-[11px] text-amber-800 font-medium">Milestone badge unlocked</span>
                      </div>
                    </div>
                    {data.rewards.badgeUnlocked.coins > 0 && (
                      <span className="text-xs font-extrabold text-amber-800 font-mono">
                        +{data.rewards.badgeUnlocked.coins} CL
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Informational Note for Accuracy Requirement when accuracy bonus wasn't earned */}
              {data.rewards.accuracyBonusCoins === 0 && (
                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-[11px] text-blue-900 font-medium flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    {!data.rewards.isAccuracyEligible
                      ? `Accuracy bonus requires at least 50% of questions (≥${data.rewards.minAttemptRequired} of ${result.totalQuestions} Qs) to be attempted.`
                      : `Accuracy bonus starts at 50% accuracy (your accuracy was ${data.rewards.accuracyPercentage}%).`}
                  </span>
                </div>
              )}

              <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-100 flex items-center justify-between text-[11px] text-amber-900 font-medium">
                <span>Progress towards store rewards (Courage Bottle, Diary &amp; T-Shirt)</span>
                <Link href="/wallet" className="font-bold text-amber-950 hover:underline">
                  View CL Wallet &rarr;
                </Link>
              </div>
            </div>
          )
        )}

        {/* ========================================================================= */}
        {/* 4. PERFORMANCE BENCHMARK (Candidate vs Average vs Topper)                */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Performance Benchmark</h3>
            <span className="text-xs text-slate-500 font-semibold">Max: {test.totalMarks} Marks</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80">
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider font-mono block">Your Score</span>
              <span className="text-2xl font-black text-blue-950 block mt-1">{result.totalScore.toFixed(1)}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono block">Average Score</span>
              <span className="text-2xl font-black text-slate-800 block mt-1">{standing.averageScore.toFixed(1)}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider font-mono block">Topper Score</span>
              <span className="text-2xl font-black text-emerald-950 block mt-1">{standing.topScore.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. SECTION-WISE PERFORMANCE                                               */}
        {/* ========================================================================= */}
        {sections.length > 0 && (
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Section-Wise Performance</h3>
              <p className="text-xs text-slate-500">Detailed accuracy and score breakdown by section</p>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden text-xs">
              {sections.map((sec) => {
                const accPct = Math.min(100, Math.max(0, sec.accuracyPercentage));
                return (
                  <div key={sec.sectionName} className="p-4 bg-white hover:bg-slate-50/50 transition space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900">{sec.sectionName}</h4>
                        <span className="text-[11px] text-slate-500 font-semibold">
                          {sec.attemptedCount} of {sec.totalQuestions} questions attempted &bull; {sec.correctCount} correct &bull; {sec.incorrectCount} incorrect
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <span className="font-black text-sm text-blue-700">
                          {sec.sectionScore.toFixed(1)} <span className="text-slate-400 font-semibold text-xs">/ {sec.maxScore}</span>
                        </span>
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                          {sec.accuracyPercentage.toFixed(0)}% Accuracy
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${accPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. PERFORMANCE INSIGHTS                                                   */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Performance Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {insights.strongestSection && (
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/70 flex items-start gap-3">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-emerald-900 block">Strongest Section: {insights.strongestSection}</span>
                  <span className="text-emerald-800/90 text-[11px]">Highest accuracy maintained in this section.</span>
                </div>
              </div>
            )}

            {insights.weakestSection && (
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70 flex items-start gap-3">
                <Target className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-900 block">Needs Attention: {insights.weakestSection}</span>
                  <span className="text-amber-800/90 text-[11px]">Focus revision and targeted practice here.</span>
                </div>
              </div>
            )}

            {incorrectCount > 0 && (
              <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/70 flex items-start justify-between gap-3 sm:col-span-2">
                <div className="flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-900 block">
                      {incorrectCount} Incorrect Answer{incorrectCount > 1 ? "s" : ""} Recorded
                    </span>
                    <span className="text-rose-800/90 text-[11px]">
                      Mistakes are logged in your Mistake Vault for active spaced-repetition drills.
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveFilter("incorrect")}
                  className="bg-white hover:bg-rose-50 text-rose-700 border-rose-300 font-bold text-xs shrink-0 cursor-pointer"
                >
                  Review Mistakes
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. QUESTION REVIEW & DETAILED SOLUTIONS (FILTERABLE)                      */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                Question Review &amp; Detailed Solutions
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Verified answer keys and full conceptual explanations
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleFilterChange("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                All ({reviewQuestions.length})
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange("incorrect")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === "incorrect"
                    ? "bg-red-600 text-white"
                    : "bg-white border border-slate-200 text-red-600 hover:bg-red-50"
                }`}
              >
                <XCircle className="w-3.5 h-3.5" /> Incorrect ({incorrectCount})
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange("correct")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === "correct"
                    ? "bg-emerald-600 text-white"
                    : "bg-white border border-slate-200 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Correct ({correctCount})
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange("unattempted")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === "unattempted"
                    ? "bg-amber-600 text-white"
                    : "bg-white border border-slate-200 text-amber-700 hover:bg-amber-50"
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" /> Unattempted ({unattemptedCount})
              </button>
            </div>
          </div>

          {/* Section Filter (if multi-section) */}
          {sections.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => handleSectionChange("all")}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  selectedSection === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Sections
              </button>
              {sections.map((s) => (
                <button
                  key={s.sectionName}
                  type="button"
                  onClick={() => handleSectionChange(s.sectionName)}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                    selectedSection === s.sectionName
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.sectionName}
                </button>
              ))}
            </div>
          )}

          {/* Question Count Status Indicator */}
          {filteredQuestions.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
              <span>
                Showing {visibleQuestions.length} of {filteredQuestions.length}{" "}
                {activeFilter !== "all" ? `${activeFilter} ` : ""}questions
              </span>
              {filteredQuestions.length > 5 && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  {isExpanded ? (
                    <>
                      Show Less <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      View All {filteredQuestions.length} Questions <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-4">
            {filteredQuestions.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 space-y-1">
                <span className="font-bold text-sm text-slate-800 block">No questions found in this filter</span>
                <span className="text-xs">Select another status or view all questions.</span>
              </div>
            ) : (
              visibleQuestions.map((q) => (
                <QuestionReviewCard
                  key={q.questionOrder}
                  questionOrder={q.questionOrder}
                  sectionName={q.sectionName}
                  questionText={q.questionText}
                  questionImageUrl={q.questionImageUrl}
                  optionsType={q.optionsType}
                  options={q.options}
                  selectedOption={q.selectedOption}
                  correctOption={q.correctOption}
                  isCorrect={q.isCorrect}
                  marksAwarded={q.marksAwarded}
                  explanation={q.explanation}
                  topicName={q.topicName}
                  topicSlug={q.topicSlug}
                />
              ))
            )}
          </div>

          {/* Bottom Expansion CTA */}
          {filteredQuestions.length > 5 && (
            <div className="pt-2 text-center">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-white hover:bg-slate-50 text-slate-800 border-slate-300 font-bold text-xs rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2"
              >
                {isExpanded ? (
                  <>
                    Show Less Questions <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    View All {filteredQuestions.length} {activeFilter !== "all" ? `${activeFilter} ` : ""}Questions{" "}
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 7. LEADERBOARD CTA BANNER                                                 */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-blue-200 text-xs font-bold uppercase tracking-wider font-mono">
              Live Competition Leaderboard
            </span>
            <h3 className="text-lg sm:text-xl font-black">See the Full Rankings &amp; Top 3 Podium</h3>
            <p className="text-xs text-blue-100/90 font-medium">
              Compare your score, speed, and accuracy with all {standing.totalParticipants} participating candidates.
            </p>
          </div>
          <Link href={`/mock-tests/${test.id}/leaderboard`} className="shrink-0">
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs rounded-xl shadow-md cursor-pointer"
            >
              View Full Leaderboard <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
