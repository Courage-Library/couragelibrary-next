"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  LiveTestCandidateScorecard,
  LiveTestLeaderboardEntry,
  LiveTestRankingSnapshot,
} from "@/types/live-test";
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
  Clock,
  Award,
  Medal,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Radio,
  BookOpen,
  Sparkles,
  Coins,
  FileCheck,
} from "lucide-react";
import { CertificateModal } from "@/components/live-test/certificate-modal";

interface LiveTestResultClientProps {
  data: LiveTestCandidateScorecard;
  leaderboard: {
    entries: LiveTestLeaderboardEntry[];
    total: number;
    snapshot: LiveTestRankingSnapshot | null;
    currentUserEntry?: LiveTestLeaderboardEntry | null;
  };
  currentUserId: string;
}

type QuestionFilter = "all" | "incorrect" | "correct" | "unattempted";

export function LiveTestResultClient({
  data,
  leaderboard,
  currentUserId,
}: LiveTestResultClientProps) {
  const { isPublished, event, scorecard, reviewQuestions, securityWatermark } = data;

  const [activeTab, setActiveTab] = useState<"scorecard" | "leaderboard" | "solutions">("scorecard");
  const [activeFilter, setActiveFilter] = useState<QuestionFilter>("all");
  const [expandedSolutions, setExpandedSolutions] = useState(false);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);

  // Format Time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    if (!reviewQuestions) return [];
    return reviewQuestions.filter((q) => {
      if (activeFilter === "incorrect") return q.selectedOption !== null && !q.isCorrect;
      if (activeFilter === "correct") return q.isCorrect;
      if (activeFilter === "unattempted") return q.selectedOption === null;
      return true;
    });
  }, [reviewQuestions, activeFilter]);

  const visibleQuestions = useMemo(() => {
    if (expandedSolutions || filteredQuestions.length <= 10) {
      return filteredQuestions;
    }
    return filteredQuestions.slice(0, 10);
  }, [filteredQuestions, expandedSolutions]);

  // Top 3 Podium Candidates
  const podium = useMemo(() => {
    return leaderboard.entries.slice(0, 3);
  }, [leaderboard.entries]);

  // =========================================================================
  // PRE-PUBLICATION SCREEN (Clean, authoritative security guard)
  // =========================================================================
  if (!isPublished) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-6">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              Evaluation Staging
            </div>

            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <ShieldCheck className="w-8 h-8 text-indigo-400" />
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">
              Submission Recorded & Verified
            </h1>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Your responses have been securely verified. The official All-India Leaderboard and detailed scorecard will be published once the evaluation process is finalized.
            </p>

            <div className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 mb-6 space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">Live Mock Test</span>
                <span className="font-semibold text-slate-200 truncate max-w-[200px]">{event.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scheduled Publication</span>
                <span className="text-amber-400 font-mono font-medium">
                  {data.resultPublishAt ? new Date(data.resultPublishAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Shortly"}
                </span>
              </div>
            </div>

            <Link href="/live-tests" className="w-full">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl">
                Back to Live Mock Tests
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // POST-PUBLICATION SCREEN (Full Interactive All-India Result Experience)
  // =========================================================================
  return (
    <div className="py-8 sm:py-12 bg-slate-950 min-h-screen text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Navigation & Official Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/live-tests"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Live Tests
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500 font-bold">
              {securityWatermark?.maskedId} &bull; {securityWatermark?.attemptIdShort}
            </span>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px] font-extrabold uppercase">
              Official All-India Scorecard
            </Badge>
          </div>
        </div>

        {/* Hero Banner with Watermark */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-900 p-6 sm:p-8 shadow-2xl border border-slate-800">
          {securityWatermark && (
            <CandidateSecurityWatermark
              examTitle={event.title}
              maskedCandidateId={securityWatermark.maskedId}
              attemptIdShort={securityWatermark.attemptIdShort}
              timestamp={securityWatermark.timestamp}
              isLighter={true}
            />
          )}

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Sparkles className="w-3 h-3" /> All-India Result
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {event.title}
              </h1>
              <p className="text-xs text-slate-400">
                Total Questions: {event.totalQuestions} &bull; Total Marks: {event.totalMarks} &bull; Time: {event.durationMinutes}m
              </p>
            </div>

            {scorecard && (
              <div className="flex flex-wrap items-center gap-3">
                {/* Score Cardlet */}
                <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 min-w-[120px] text-center shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Score</span>
                  <div className="text-2xl font-black text-white mt-0.5">
                    {scorecard.totalScore}
                    <span className="text-xs font-normal text-slate-400"> / {scorecard.maxScore}</span>
                  </div>
                </div>

                {/* Rank Cardlet */}
                <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 min-w-[120px] text-center shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">National Rank</span>
                  <div className="text-2xl font-black text-amber-300 mt-0.5">
                    #{scorecard.rank}
                    <span className="text-xs font-normal text-slate-400"> / {scorecard.rankedCandidates}</span>
                  </div>
                </div>

                {/* Percentile Cardlet */}
                <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 min-w-[120px] text-center shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Percentile</span>
                  <div className="text-2xl font-black text-emerald-300 mt-0.5">
                    {scorecard.percentile}%
                  </div>
                </div>

                {/* Reward Cardlet */}
                {data.reward && data.reward.totalCoins > 0 && (
                  <div className="bg-slate-900/90 border border-yellow-500/30 rounded-2xl p-4 min-w-[120px] text-center shadow-lg">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">CL Coins</span>
                    <div className="text-2xl font-black text-yellow-300 mt-0.5 flex items-center justify-center gap-1">
                      <Coins className="w-5 h-5 text-yellow-400" />
                      +{data.reward.totalCoins}
                    </div>
                  </div>
                )}

                {/* Certificate Cardlet */}
                {data.certificate && (
                  <button
                    onClick={() => setIsCertModalOpen(true)}
                    className="bg-slate-900/90 border border-amber-500/40 hover:border-amber-400 hover:bg-slate-900 rounded-2xl p-4 min-w-[130px] text-center shadow-lg transition group cursor-pointer"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-center gap-1">
                      <Award className="w-3.5 h-3.5" /> Certificate
                    </span>
                    <div className="text-xs font-bold text-amber-300 mt-1 flex items-center justify-center gap-1 group-hover:underline">
                      <FileCheck className="w-4 h-4 text-amber-400" />
                      View & Print
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab("scorecard")}
            className={`pb-3 text-sm font-bold flex items-center gap-2 transition-colors border-b-2 ${
              activeTab === "scorecard"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Trophy className="w-4 h-4" /> Performance Breakdown
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`pb-3 text-sm font-bold flex items-center gap-2 transition-colors border-b-2 ${
              activeTab === "leaderboard"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Medal className="w-4 h-4" /> All-India Leaderboard ({leaderboard.total})
          </button>
          <button
            onClick={() => setActiveTab("solutions")}
            className={`pb-3 text-sm font-bold flex items-center gap-2 transition-colors border-b-2 ${
              activeTab === "solutions"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-4 h-4" /> Solutions & Analysis ({reviewQuestions?.length || 0})
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PERFORMANCE BREAKDOWN                                              */}
        {/* ========================================================================= */}
        {activeTab === "scorecard" && scorecard && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold">Accuracy</span>
                  <Target className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-slate-100">{scorecard.accuracyPercentage}%</div>
                <div className="text-[11px] text-slate-500 mt-1">Based on attempted questions</div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold">Time Taken</span>
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-black text-slate-100">{formatTime(scorecard.timeSpentSeconds)}</div>
                <div className="text-[11px] text-slate-500 mt-1">Authoritative duration</div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold">Correct Answers</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-emerald-400">{scorecard.correctCount}</div>
                <div className="text-[11px] text-slate-500 mt-1">+{scorecard.correctCount * 2} marks gained</div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold">Incorrect / Skipped</span>
                  <XCircle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-black text-rose-400">
                  {scorecard.incorrectCount} <span className="text-xs font-normal text-slate-400">/ {scorecard.unansweredCount}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Recorded in Mistake Vault</div>
              </div>
            </div>

            {/* Quick Next Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={() => setActiveTab("solutions")}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl gap-2 text-xs font-bold"
              >
                <BookOpen className="w-3.5 h-3.5" /> View Solutions & Explanations
              </Button>
              <Button
                onClick={() => setActiveTab("leaderboard")}
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 rounded-xl gap-2 text-xs font-bold"
              >
                <Medal className="w-3.5 h-3.5" /> Check All-India Leaderboard
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ALL-INDIA LEADERBOARD & PODIUM                                     */}
        {/* ========================================================================= */}
        {activeTab === "leaderboard" && (
          <div className="space-y-6">
            {/* Podium (Top 3) */}
            {podium.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {podium.map((p, idx) => {
                  const colors = [
                    "from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-300",
                    "from-slate-400/20 to-slate-500/10 border-slate-400/40 text-slate-200",
                    "from-amber-700/20 to-amber-800/10 border-amber-700/40 text-amber-400",
                  ];
                  const medals = ["🥇 Rank 1", "🥈 Rank 2", "🥉 Rank 3"];

                  return (
                    <div
                      key={p.id}
                      className={`bg-gradient-to-b ${colors[idx]} border rounded-2xl p-5 text-center shadow-lg relative overflow-hidden`}
                    >
                      <div className="text-xs font-black uppercase tracking-wider mb-2">
                        {medals[idx]}
                      </div>
                      <div className="text-base font-bold text-white truncate">{p.maskedName}</div>
                      <div className="text-2xl font-black text-white mt-1">
                        {p.total_score} <span className="text-xs font-normal text-slate-400">pts</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Acc: {p.accuracy_percentage}% &bull; Time: {formatTime(p.time_spent_seconds)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pinned Current User Entry (if exists) */}
            {leaderboard.currentUserEntry && (
              <div className="bg-indigo-950/60 border-2 border-indigo-500/50 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className="bg-indigo-600 text-white font-black text-xs px-2.5 py-0.5">
                    #{leaderboard.currentUserEntry.rank}
                  </Badge>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      Your All-India Standing
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">You</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Percentile: {leaderboard.currentUserEntry.percentile}% &bull; Acc: {leaderboard.currentUserEntry.accuracy_percentage}%
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-white">{leaderboard.currentUserEntry.total_score} pts</div>
                  <div className="text-xs text-slate-400">{formatTime(leaderboard.currentUserEntry.time_spent_seconds)}</div>
                </div>
              </div>
            )}

            {/* Leaderboard Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200">Rankings & National Merit List</h3>
                <span className="text-xs text-slate-500 font-mono">Total Ranked: {leaderboard.total}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Candidate</th>
                      <th className="px-4 py-3 text-right">Score</th>
                      <th className="px-4 py-3 text-right">Accuracy</th>
                      <th className="px-4 py-3 text-right">Percentile</th>
                      <th className="px-4 py-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {leaderboard.entries.map((entry) => {
                      const isMe = entry.user_id === currentUserId;
                      return (
                        <tr
                          key={entry.id}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isMe ? "bg-indigo-950/30 text-indigo-200 font-bold" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-mono font-bold">
                            {entry.rank <= 3 ? (
                              <span className="text-amber-400 font-black">#{entry.rank}</span>
                            ) : (
                              `#${entry.rank}`
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span>{entry.maskedName}</span>
                              {isMe && (
                                <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold">YOU</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-100">{entry.total_score}</td>
                          <td className="px-4 py-3 text-right">{entry.accuracy_percentage}%</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-mono">{entry.percentile}%</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-400">{formatTime(entry.time_spent_seconds)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SOLUTIONS & ANALYSIS                                               */}
        {/* ========================================================================= */}
        {activeTab === "solutions" && (
          <div className="space-y-6">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {(["all", "incorrect", "correct", "unattempted"] as QuestionFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                      activeFilter === f
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">
                Showing {visibleQuestions.length} of {filteredQuestions.length} questions
              </span>
            </div>

            {/* Question Solution Cards */}
            <div className="space-y-4">
              {visibleQuestions.map((q, idx) => (
                <div
                  key={q.mockQuestionId}
                  className={`bg-slate-900 border rounded-2xl p-5 space-y-4 shadow-lg ${
                    q.selectedOption === null
                      ? "border-slate-800"
                      : q.isCorrect
                      ? "border-emerald-500/30"
                      : "border-rose-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">Q{q.questionOrder}</span>
                      <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
                        {q.sectionName}
                      </Badge>
                      {q.topicName && (
                        <span className="text-[10px] text-slate-500">&bull; {q.topicName}</span>
                      )}
                    </div>
                    <div>
                      {q.selectedOption === null ? (
                        <Badge variant="neutral" className="text-[10px]">Unattempted</Badge>
                      ) : q.isCorrect ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                          Correct (+{q.marksAwarded})
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px]">
                          Incorrect ({q.marksAwarded})
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-sm font-medium text-slate-100 leading-relaxed">
                    {q.questionText}
                  </div>

                  {/* Options */}
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isCorrectOpt = opt.key === q.correctOption;
                      const isUserSelected = opt.key === q.selectedOption;

                      let optStyle = "bg-slate-950/60 border-slate-800 text-slate-300";
                      if (isCorrectOpt) {
                        optStyle = "bg-emerald-950/40 border-emerald-500/50 text-emerald-200 font-bold";
                      } else if (isUserSelected && !q.isCorrect) {
                        optStyle = "bg-rose-950/40 border-rose-500/50 text-rose-200 font-bold";
                      }

                      return (
                        <div
                          key={opt.key}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs ${optStyle}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold">{opt.key}.</span>
                            <span>{opt.text}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[10px]">
                            {isCorrectOpt && <span className="text-emerald-400">Correct Key</span>}
                            {isUserSelected && (
                              <span className={q.isCorrect ? "text-emerald-400" : "text-rose-400"}>
                                Your Selection
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-300 space-y-1">
                      <div className="font-bold text-indigo-400 text-[11px] uppercase tracking-wider">Solution Explanation</div>
                      <p className="leading-relaxed text-slate-400">{q.explanation}</p>
                    </div>
                  )}
                </div>
              ))}

              {filteredQuestions.length > 10 && !expandedSolutions && (
                <Button
                  onClick={() => setExpandedSolutions(true)}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 text-xs font-bold py-3 rounded-xl gap-2"
                >
                  <ChevronDown className="w-4 h-4" /> View Remaining {filteredQuestions.length - 10} Solutions
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Certificate Modal */}
      {data.certificate && (
        <CertificateModal
          isOpen={isCertModalOpen}
          onClose={() => setIsCertModalOpen(false)}
          certificate={data.certificate}
          candidateName={leaderboard.currentUserEntry?.user_id ? "Rahul Sharma" : "Candidate"}
          eventTitle={event.title}
          rank={scorecard?.rank}
          percentile={scorecard?.percentile}
          totalParticipants={scorecard?.rankedCandidates}
        />
      )}
    </div>
  );
}
