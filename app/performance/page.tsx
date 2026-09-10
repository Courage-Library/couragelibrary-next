import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CandidateIntelligenceService } from "@/services/candidate-intelligence.service";
import { CANDIDATE_INTELLIGENCE_POLICY_V1 } from "@/types/candidate-intelligence";
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  Activity,
  Award,
  Trophy,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Calendar,
  Layers,
  ArrowUpRight,
  Sparkles,
  Info,
  Clock,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Candidate Performance Intelligence | Courage Library",
  description:
    "Authoritative multi-dimensional historical performance trajectories, accuracy, consistency, strengths, and unified activity timeline.",
};

interface PerformancePageProps {
  searchParams: Promise<{
    exam?: string;
  }>;
}

export default async function CandidatePerformancePage({ searchParams }: PerformancePageProps) {
  const resolvedParams = await searchParams;
  const examFilter = resolvedParams.exam || undefined;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/performance${examFilter ? `?exam=${examFilter}` : ""}`);
  }

  // Authoritative server-side aggregations
  const overview = await CandidateIntelligenceService.getCandidatePerformanceOverview(
    user.id,
    examFilter,
    CANDIDATE_INTELLIGENCE_POLICY_V1
  );

  const scoreTrajectory = await CandidateIntelligenceService.getCandidateScoreTrajectory(
    user.id,
    examFilter,
    CANDIDATE_INTELLIGENCE_POLICY_V1
  );

  const rankTrajectory = await CandidateIntelligenceService.getCandidateRankPercentileTrajectory(
    user.id,
    examFilter,
    CANDIDATE_INTELLIGENCE_POLICY_V1
  );

  const subjectBreakdown = await CandidateIntelligenceService.getCandidateSubjectBreakdown(
    user.id,
    examFilter,
    CANDIDATE_INTELLIGENCE_POLICY_V1
  );

  const topicPerformance = await CandidateIntelligenceService.getCandidateTopicPerformance(
    user.id,
    examFilter,
    CANDIDATE_INTELLIGENCE_POLICY_V1
  );

  const strengthsWeaknesses = await CandidateIntelligenceService.getCandidateStrengthsAndWeaknesses(
    user.id,
    examFilter,
    CANDIDATE_INTELLIGENCE_POLICY_V1
  );

  const timeline = await CandidateIntelligenceService.getCandidateUnifiedTimeline(user.id, 25);

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case "IMPROVING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <TrendingUp className="w-3.5 h-3.5" /> IMPROVING
          </span>
        );
      case "DECLINING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <TrendingDown className="w-3.5 h-3.5" /> DECLINING
          </span>
        );
      case "STABLE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Activity className="w-3.5 h-3.5" /> STABLE
          </span>
        );
      case "VOLATILE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> VOLATILE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            <Info className="w-3.5 h-3.5" /> INSUFFICIENT DATA
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Candidate Historical Intelligence
              </span>
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-slate-700">
                Policy {overview.policyVersion}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Performance Intelligence Hub
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Server-verified historical trajectories, deterministic strengths, accuracy analytics, and credentials timeline.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/achievements">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-xs">
                <Trophy className="w-4 h-4 mr-1.5 text-amber-400" />
                Badges ({overview.achievementsSummary.totalBadgesEarned})
              </Button>
            </Link>
            <Link href="/certificates">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-xs">
                <ShieldCheck className="w-4 h-4 mr-1.5 text-indigo-400" />
                Certificates ({overview.certificatesCount})
              </Button>
            </Link>
          </div>
        </div>

        {/* Exam Family Filter Tabs */}
        {overview.examScopes.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/60">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
              Scope:
            </span>
            <Link href="/performance">
              <Button
                variant={!examFilter ? "default" : "outline"}
                size="sm"
                className={`text-xs ${
                  !examFilter
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800"
                }`}
              >
                All Exams ({overview.totalAttemptsCount})
              </Button>
            </Link>
            {overview.examScopes.map((scope) => (
              <Link key={scope.examId} href={`/performance?exam=${scope.examId}`}>
                <Button
                  variant={examFilter === scope.examId ? "default" : "outline"}
                  size="sm"
                  className={`text-xs ${
                    examFilter === scope.examId
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {scope.examTitle} ({scope.totalAttempts})
                </Button>
              </Link>
            ))}
          </div>
        )}

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400">Total Attempts</div>
            <div className="text-2xl font-black text-white mt-1">
              {overview.totalAttemptsCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex gap-2">
              <span>{overview.totalLiveTestsCount} Live</span>
              <span>•</span>
              <span>{overview.totalMocksCount} Mocks</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400">Overall Accuracy</div>
            <div className="text-2xl font-black text-white mt-1">
              {strengthsWeaknesses.overallAccuracy}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {strengthsWeaknesses.totalQuestionsEvaluated} questions tested
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400">Current Trend</div>
            <div className="mt-1.5">{getTrendBadge(overview.trend)}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              Recency: {overview.recencyWeightedPercentage}% avg
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-xs font-medium text-slate-400">Consistency Index</div>
            <div className="text-2xl font-black text-white mt-1">
              {overview.consistencyIndex !== null ? `${overview.consistencyIndex}/100` : "N/A"}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Rating: {overview.consistencyRating}
            </div>
          </div>
        </div>

        {/* Personal Bests Showcase */}
        {(overview.personalBests.bestScore ||
          overview.personalBests.bestRank ||
          overview.personalBests.bestPercentile) && (
          <div className="bg-gradient-to-r from-amber-500/10 via-slate-900/60 to-indigo-500/10 border border-amber-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 text-amber-400 mb-4">
              <Trophy className="w-5 h-5" />
              <h2 className="text-base font-bold text-white uppercase tracking-wider">
                Personal Best Milestones
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {overview.personalBests.bestScore && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 font-medium">Highest Score</div>
                  <div className="text-2xl font-black text-amber-400 mt-1">
                    {overview.personalBests.bestScore.value} / {overview.personalBests.bestScore.maxScore}
                  </div>
                  <div className="text-xs text-slate-300 font-semibold mt-0.5">
                    {overview.personalBests.bestScore.percentage}%
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-1">
                    {overview.personalBests.bestScore.testTitle}
                  </div>
                </div>
              )}

              {overview.personalBests.bestRank && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 font-medium">Best National Rank</div>
                  <div className="text-2xl font-black text-indigo-400 mt-1">
                    #{overview.personalBests.bestRank.value}
                  </div>
                  <div className="text-xs text-slate-300 font-semibold mt-0.5">
                    Cohort: {overview.personalBests.bestRank.totalParticipants} candidates
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-1">
                    {overview.personalBests.bestRank.testTitle}
                  </div>
                </div>
              )}

              {overview.personalBests.bestPercentile && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400 font-medium">Top Percentile</div>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {overview.personalBests.bestPercentile.value}%ile
                  </div>
                  <div className="text-xs text-slate-300 font-semibold mt-0.5">
                    National Standing
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-1">
                    {overview.personalBests.bestPercentile.testTitle}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score Trajectory Breakdown */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <LineChart className="w-5 h-5 text-indigo-400" />
                Score Trajectory & Volatility
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                3-Test Simple Moving Average ($SMA_3$) and historical score progression.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {scoreTrajectory.volatilityCV !== null && (
                <span className="text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
                  CV Volatility: <strong>{scoreTrajectory.volatilityCV}%</strong> ({scoreTrajectory.stabilityRating})
                </span>
              )}
              {getTrendBadge(scoreTrajectory.trend)}
            </div>
          </div>

          {scoreTrajectory.points.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No historical score records found. Complete tests to generate trajectory analytics.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-xs">
                <div>
                  <span className="text-slate-500">Latest Score:</span>{" "}
                  <strong className="text-white">{scoreTrajectory.latestScore}%</strong>
                </div>
                <div>
                  <span className="text-slate-500">Average Score:</span>{" "}
                  <strong className="text-white">{scoreTrajectory.averageScore}%</strong>
                </div>
                <div>
                  <span className="text-slate-500">Recent Average (3):</span>{" "}
                  <strong className="text-white">{scoreTrajectory.recentAverageScore}%</strong>
                </div>
                <div>
                  <span className="text-slate-500">Peak Score:</span>{" "}
                  <strong className="text-emerald-400">{scoreTrajectory.bestScore}%</strong>
                </div>
              </div>

              {/* Chronological Table View */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Test Title</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Score</th>
                      <th className="py-2.5 px-3 text-right">Accuracy</th>
                      <th className="py-2.5 px-3 text-right">SMA (3)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {scoreTrajectory.points.slice(-10).reverse().map((pt) => (
                      <tr key={pt.attemptId} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-white truncate max-w-xs">
                          {pt.testTitle}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-medium">
                            {pt.sourceType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(pt.submittedAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-white">
                          {pt.percentageScore}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {pt.accuracyPercentage}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-indigo-300">
                          {pt.movingAverageScore !== null ? `${pt.movingAverageScore}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Strengths & Weaknesses (Diagnostic Intelligence) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Strengths */}
          <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-3">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="text-base font-bold text-white uppercase tracking-wider">
                Demonstrated Strengths
              </h2>
            </div>
            {strengthsWeaknesses.strengths.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No verified strengths yet (Requires at least 15 questions and 82% accuracy with high data confidence).
              </div>
            ) : (
              <div className="space-y-3">
                {strengthsWeaknesses.strengths.map((str) => (
                  <div
                    key={str.key}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{str.title}</span>
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {str.cumulativeAccuracy}% Acc
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{str.evidence}</div>
                    <div className="text-[10px] text-slate-500 pt-1 flex items-center gap-2">
                      <span>Data Confidence: {(str.dataConfidence * 100).toFixed(0)}%</span>
                      <span>•</span>
                      <span>{str.totalQuestions} questions tested</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Focus Areas / Weaknesses */}
          <div className="bg-slate-900/60 border border-rose-500/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 border-b border-slate-800 pb-3">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-base font-bold text-white uppercase tracking-wider">
                Vulnerability Diagnostics
              </h2>
            </div>
            {strengthsWeaknesses.weaknesses.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No high-confidence weakness patterns detected (Below 55% accuracy across at least 15 questions).
              </div>
            ) : (
              <div className="space-y-3">
                {strengthsWeaknesses.weaknesses.map((wk) => (
                  <div
                    key={wk.key}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{wk.title}</span>
                      <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        {wk.cumulativeAccuracy}% Acc
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{wk.evidence}</div>
                    <div className="text-[10px] text-slate-500 pt-1 flex items-center gap-2">
                      <span>Root Cause: {wk.rootCause.replace(/_/g, " ")}</span>
                      <span>•</span>
                      <span>Negative Drag: {wk.negativeMarksIncurred} marks</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Subject & Section Breakdown */}
        {subjectBreakdown.subjects.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Subject & Section Breakdown
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sectional accuracy, negative marking drag, and deterministic mastery classification.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjectBreakdown.subjects.map((sub) => (
                <div
                  key={sub.sectionKey}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm truncate max-w-[180px]">
                      {sub.sectionTitle}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        sub.classification === "STRONG"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : sub.classification === "STABLE"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : sub.classification === "NEEDS_ATTENTION"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {sub.classification.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Accuracy:</span>
                      <strong className="text-white">{sub.accuracyPercentage}%</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Correct / Total:</span>
                      <span className="text-slate-300">
                        {sub.correctQuestions} / {sub.totalQuestions}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Negative Drag:</span>
                      <span className="text-rose-400">-{sub.negativeMarksIncurred} marks</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unified Chronological Activity Timeline */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Unified Activity & Credentials Timeline
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chronological log of verified test submissions, earned badges, issued certificates, and settled rewards.
            </p>
          </div>

          {timeline.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No historical events recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {timeline.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-start justify-between gap-3 bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 hover:border-slate-700 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 mt-0.5">
                      {evt.eventType === "LIVE_TEST_COMPLETED" && (
                        <Flame className="w-4 h-4 text-rose-400" />
                      )}
                      {evt.eventType === "MOCK_COMPLETED" && (
                        <Activity className="w-4 h-4 text-blue-400" />
                      )}
                      {evt.eventType === "ADAPTIVE_COMPLETED" && (
                        <Zap className="w-4 h-4 text-purple-400" />
                      )}
                      {evt.eventType === "BADGE_EARNED" && (
                        <Trophy className="w-4 h-4 text-amber-400" />
                      )}
                      {evt.eventType === "CERTIFICATE_ISSUED" && (
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      )}
                      {evt.eventType === "REWARD_SETTLED" && (
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        {evt.title}
                        {evt.statusBadge && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30">
                            {evt.statusBadge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{evt.subtitle}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {new Date(evt.occurredAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {evt.percentageScore !== undefined && evt.percentageScore !== null && (
                      <div className="text-sm font-black text-white">
                        {evt.percentageScore}%
                      </div>
                    )}
                    {evt.rank !== undefined && evt.rank !== null && evt.rank > 0 && (
                      <div className="text-xs font-semibold text-indigo-400">
                        Rank #{evt.rank}
                      </div>
                    )}
                    {evt.coinsEarned !== undefined && evt.coinsEarned !== null && (
                      <div className="text-xs font-bold text-amber-400">
                        +{evt.coinsEarned} CL
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
