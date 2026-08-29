"use client";

import React from "react";
import Link from "next/link";
import { TestLeaderboardData } from "@/services/assessment.service";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Trophy,
  ShieldCheck,
  User,
} from "lucide-react";

interface LeaderboardViewClientProps {
  data: TestLeaderboardData;
}

export function LeaderboardViewClient({ data }: LeaderboardViewClientProps) {
  const { test, userStanding, topScore, averageScore, totalParticipants, podium, leaderboard } = data;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const firstPlace = podium.find((p) => p.rank === 1);
  const secondPlace = podium.find((p) => p.rank === 2);
  const thirdPlace = podium.find((p) => p.rank === 3);

  return (
    <div className="py-8 sm:py-12 bg-slate-50/70 min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Navigation & Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/mock-tests"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Mock Tests
          </Link>
          <Badge variant="indigo" className="text-xs font-extrabold uppercase tracking-wide">
            Official Ranked Leaderboard
          </Badge>
        </div>

        {/* Header Title */}
        <div className="space-y-1 border-b border-slate-200/80 pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700 font-mono">
            Candidate Leaderboard &bull; {totalParticipants} Participants
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {test.title}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Ranked by Score &bull; Accuracy &bull; Time Taken (Best attempt per verified candidate)
          </p>
        </div>

        {/* Global Overview Benchmark Stats */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
              Total Candidates
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 block mt-1">
              {totalParticipants}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
              Average Score
            </span>
            <span className="text-2xl sm:text-3xl font-black text-blue-700 block mt-1">
              {averageScore.toFixed(1)}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
              Top Score
            </span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 block mt-1">
              {topScore.toFixed(1)}
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TOP 3 PODIUM DISPLAY                                                      */}
        {/* ========================================================================= */}
        {podium.length > 0 && (
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-indigo-950 text-white shadow-xl border border-slate-800 space-y-6">
            <div className="text-center space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-300 font-mono">
                Top Performers
              </span>
              <h2 className="text-xl font-black tracking-tight">Examination Podium</h2>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 max-w-lg mx-auto">
              {/* 2nd Place (Silver) */}
              <div className="text-center space-y-2">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-200 text-slate-800 font-black text-lg flex items-center justify-center mx-auto border-2 border-slate-400 shadow-lg">
                  2
                </div>
                <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/10 space-y-0.5">
                  <span className="font-extrabold text-xs sm:text-sm text-white truncate block">
                    {secondPlace ? secondPlace.displayName : "—"}
                  </span>
                  <span className="text-xs font-black text-slate-300 block">
                    {secondPlace ? `${secondPlace.score.toFixed(1)} pts` : "—"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    {secondPlace ? `${secondPlace.accuracyPercentage.toFixed(0)}% acc` : ""}
                  </span>
                </div>
              </div>

              {/* 1st Place (Gold) - Elevated */}
              <div className="text-center space-y-2 -translate-y-2">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400 text-amber-950 font-black text-xl flex items-center justify-center mx-auto border-2 border-amber-200 shadow-xl ring-4 ring-amber-400/30">
                  <Trophy className="w-7 h-7 text-amber-950" />
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-400/20 backdrop-blur-xs border border-amber-400/40 space-y-0.5 shadow-md">
                  <span className="font-black text-xs sm:text-sm text-amber-200 truncate block">
                    {firstPlace ? firstPlace.displayName : "—"}
                  </span>
                  <span className="text-sm sm:text-base font-black text-amber-400 block">
                    {firstPlace ? `${firstPlace.score.toFixed(1)} pts` : "—"}
                  </span>
                  <span className="text-[10px] text-amber-200/90 font-bold block">
                    {firstPlace ? `${firstPlace.accuracyPercentage.toFixed(0)}% acc \u2022 ${formatTime(firstPlace.timeSpentSeconds)}` : ""}
                  </span>
                </div>
              </div>

              {/* 3rd Place (Bronze) */}
              <div className="text-center space-y-2">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-700/80 text-amber-100 font-black text-lg flex items-center justify-center mx-auto border-2 border-amber-600 shadow-lg">
                  3
                </div>
                <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/10 space-y-0.5">
                  <span className="font-extrabold text-xs sm:text-sm text-white truncate block">
                    {thirdPlace ? thirdPlace.displayName : "—"}
                  </span>
                  <span className="text-xs font-black text-slate-300 block">
                    {thirdPlace ? `${thirdPlace.score.toFixed(1)} pts` : "—"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    {thirdPlace ? `${thirdPlace.accuracyPercentage.toFixed(0)}% acc` : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* YOUR STANDING CARD (HIGHLIGHTED)                                         */}
        {/* ========================================================================= */}
        {userStanding && (
          <div className="p-5 sm:p-6 rounded-3xl bg-blue-50/90 border-2 border-blue-300 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-700" />
                <h3 className="font-black text-sm text-blue-950">Your Verified Position</h3>
              </div>
              <Badge variant="indigo" className="text-xs font-extrabold">
                Rank #{userStanding.rank} of {totalParticipants}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-white border border-blue-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Your Score</span>
                <span className="text-lg font-black text-blue-700 block mt-0.5">
                  {userStanding.score.toFixed(1)} <span className="text-xs text-slate-400 font-medium">/ {userStanding.maxScore}</span>
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-blue-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Accuracy</span>
                <span className="text-lg font-black text-emerald-600 block mt-0.5">
                  {userStanding.accuracyPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-blue-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Time Taken</span>
                <span className="text-lg font-black text-slate-800 block mt-0.5">
                  {formatTime(userStanding.timeSpentSeconds)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-blue-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Rank Standing</span>
                <span className="text-lg font-black text-amber-700 block mt-0.5">
                  #{userStanding.rank} <span className="text-xs text-slate-400 font-medium">/ {totalParticipants}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FULL LEADERBOARD TABLE                                                    */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">Full Leaderboard Rankings</h3>
            <span className="text-xs text-slate-500 font-semibold">{leaderboard.length} candidates</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px] font-mono">
                  <th className="py-3 px-3">Rank</th>
                  <th className="py-3 px-3">Candidate</th>
                  <th className="py-3 px-3 text-right">Score</th>
                  <th className="py-3 px-3 text-right">Accuracy</th>
                  <th className="py-3 px-3 text-right">Time Taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {leaderboard.map((entry) => {
                  return (
                    <tr
                      key={entry.userId}
                      className={`transition ${
                        entry.isCurrentUser
                          ? "bg-blue-50/80 font-bold text-blue-950"
                          : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          {entry.rank === 1 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center text-xs">
                              1
                            </span>
                          ) : entry.rank === 2 ? (
                            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-black flex items-center justify-center text-xs">
                              2
                            </span>
                          ) : entry.rank === 3 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-800/20 text-amber-900 font-black flex items-center justify-center text-xs">
                              3
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono pl-1">#{entry.rank}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] text-slate-600 font-bold">
                            <User className="w-3 h-3" />
                          </div>
                          <span className={entry.isCurrentUser ? "font-black text-blue-900" : "font-semibold"}>
                            {entry.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {entry.score.toFixed(1)} <span className="text-slate-400 text-[10px]">/ {entry.maxScore}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            entry.accuracyPercentage >= 80
                              ? "bg-emerald-50 text-emerald-800"
                              : entry.accuracyPercentage >= 60
                              ? "bg-blue-50 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {entry.accuracyPercentage.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 text-[11px]">
                        {formatTime(entry.timeSpentSeconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
