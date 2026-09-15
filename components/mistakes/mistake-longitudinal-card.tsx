"use client";

import React, { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
  LongitudinalWindowType,
  MistakeLongitudinalOverview,
  TrajectoryState,
  CrossExamPattern,
} from "@/types/mistake-longitudinal-intelligence";
import { fetchLongitudinalOverviewAction } from "@/app/mistakes/actions";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Compass,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Award,
  AlertCircle,
} from "lucide-react";

interface MistakeLongitudinalCardProps {
  initialData: MistakeLongitudinalOverview | null;
}

const WINDOW_LABELS: Record<LongitudinalWindowType, string> = {
  "7D": "7 Days",
  "30D": "30 Days",
  "90D": "90 Days",
  ALL_TIME: "All Time",
};

export function MistakeLongitudinalCard({ initialData }: MistakeLongitudinalCardProps) {
  const [data, setData] = useState<MistakeLongitudinalOverview | null>(initialData);
  const [activeWindow, setActiveWindow] = useState<LongitudinalWindowType>(
    initialData?.window?.windowType || "30D"
  );
  const [isPending, startTransition] = useTransition();

  const handleWindowChange = (windowType: LongitudinalWindowType) => {
    if (windowType === activeWindow && data) return;
    setActiveWindow(windowType);

    startTransition(async () => {
      const result = await fetchLongitudinalOverviewAction(windowType);
      if (result.success && result.data) {
        setData(result.data);
      }
    });
  };

  if (!data || (data.totalActiveMistakes === 0 && (data.relapseRecovery?.totalMasteredCount ?? 0) === 0)) {
    return null; // Keep zero-clutter if user has no mistake history
  }

  const overall = data.overallNormalizedMetric;
  const topTrajectory: TrajectoryState =
    data.topWeaknesses?.[0]?.trajectory ||
    data.topicTrajectories?.[0]?.trajectory ||
    (overall?.isSufficient ? "STABLE" : "INSUFFICIENT_DATA");

  const crossExam = data.crossExamIntelligence;
  const relapse = data.relapseRecovery || data.recoverySummary;
  const topTopics = data.topicTrajectories?.slice(0, 3) || [];
  const cognitiveBreakdown = data.cognitiveDistribution?.filter((c) => c.activeMistakeCount > 0) || [];

  const getTrajectoryBadge = (state: TrajectoryState) => {
    switch (state) {
      case "IMPROVING":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <TrendingDown className="w-3 h-3 text-emerald-600" /> Improving
          </span>
        );
      case "DECLINING":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
            <TrendingUp className="w-3 h-3 text-amber-600" /> Needs Attention
          </span>
        );
      case "RECOVERING":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-3 h-3 text-indigo-600" /> Recovering
          </span>
        );
      case "RELAPSING":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" /> Relapse Detected
          </span>
        );
      case "STABLE":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            <Minus className="w-3 h-3 text-blue-600" /> Stable
          </span>
        );
      case "INSUFFICIENT_DATA":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
            <Activity className="w-3 h-3 text-slate-400" /> Gathering History
          </span>
        );
    }
  };

  const getCrossExamBadge = (pattern: CrossExamPattern) => {
    switch (pattern) {
      case "CONSISTENTLY_STRONG":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Multi-Exam Resilient
          </span>
        );
      case "CONTEXT_SPECIFIC":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
            <Layers className="w-3 h-3 text-amber-600" /> Context Dependent
          </span>
        );
      case "CONSISTENTLY_WEAK":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3 text-rose-600" /> Cross-Exam Weakness
          </span>
        );
      case "INSUFFICIENT_DATA":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
            Single Context
          </span>
        );
    }
  };

  const masteredCount = data.recoverySummary?.totalMasteredCount ?? data.relapseRecovery?.totalMasteredCount ?? 0;
  const relapseCount = data.recoverySummary?.totalRelapsedCount ?? data.relapseRecovery?.totalRelapseCount ?? 0;
  const relapseRate = data.relapseRecovery?.relapseRate ?? (masteredCount > 0 ? relapseCount / masteredCount : 0);
  const retentionPct = Math.max(0, Math.min(100, Math.round((1 - relapseRate) * 100)));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5 transition-opacity duration-200">
      {/* Header & Window Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Compass className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Longitudinal Journey & Cross-Exam Intelligence
            </h2>
            <Badge variant="indigo" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] px-2 py-0.5">
              Multi-Exam Analytics
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Tracking error rate trajectory, cross-assessment consistency, and post-mastery resilience.
          </p>
        </div>

        {/* Analytical Window Switcher */}
        <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/70 self-start sm:self-auto">
          {(["7D", "30D", "90D", "ALL_TIME"] as LongitudinalWindowType[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => handleWindowChange(w)}
              disabled={isPending}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeWindow === w
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
              } ${isPending ? "opacity-60 cursor-wait" : ""}`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Trio Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* 1. Overall Trajectory */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Error Trajectory
            </span>
            {getTrajectoryBadge(topTrajectory)}
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {overall?.rate !== null && overall?.rate !== undefined ? `${(overall.rate * 100).toFixed(1)}%` : "—"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {overall?.isSufficient
                ? `${overall.numerator} active slips across ${overall.denominator} questions`
                : "Building statistical sample baseline"}
            </div>
          </div>
        </div>

        {/* 2. Cross-Exam Consistency */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Cross-Exam Scope
            </span>
            {getCrossExamBadge(crossExam?.crossExamPattern || "INSUFFICIENT_DATA")}
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {crossExam && crossExam.contextsAttempted > 0
                ? `${crossExam.contextsWithErrors}/${crossExam.contextsAttempted}`
                : "0"}
              <span className="text-xs font-semibold text-slate-500 ml-1.5 font-normal">Contexts with Slips</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {crossExam?.patternDescription || "Evaluated across Mocks, Practice & Drills"}
            </div>
          </div>
        </div>

        {/* 3. Mastery Resilience */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Mastery Resilience
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Award className="w-3 h-3 text-indigo-600" /> {masteredCount} Mastered
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {masteredCount > 0 ? `${retentionPct}%` : "100%"}
              <span className="text-xs font-semibold text-slate-500 ml-1.5 font-normal">Retention Rate</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {relapseCount === 0
                ? "Zero post-mastery relapses detected"
                : `${relapseCount} post-mastery slip(s) flagged`}
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Deep Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Left: Top Topic Trajectories */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" /> Priority Topic Trajectories
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">Recent vs Prior Window</span>
          </div>

          {topTopics.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No topic trajectory anomalies in this observation window.
            </div>
          ) : (
            <div className="space-y-2.5">
              {topTopics.map((t) => (
                <div
                  key={t.topicId}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 border border-slate-200/60 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-800 truncate">{t.topicName}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                      <span>{t.subjectName}</span>
                      <span>•</span>
                      <span>{t.activeMistakeCount} active slip(s)</span>
                      {t.hasActiveRelapse && (
                        <>
                          <span>•</span>
                          <span className="text-rose-600 font-semibold">Post-mastery slip</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-800">
                        {t.recentMetric.rate !== null ? `${(t.recentMetric.rate * 100).toFixed(0)}%` : "—"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {t.deltaErrorRate !== null ? (
                          t.deltaErrorRate < 0 ? (
                            <span className="text-emerald-600 font-bold">
                              ↓ {Math.abs(t.deltaErrorRate * 100).toFixed(0)}%
                            </span>
                          ) : t.deltaErrorRate > 0 ? (
                            <span className="text-amber-600 font-bold">
                              ↑ {(t.deltaErrorRate * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span>0%</span>
                          )
                        ) : (
                          "baseline"
                        )}
                      </div>
                    </div>
                    {getTrajectoryBadge(t.trajectory)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Cognitive Distribution Breakdown */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-600" /> Cognitive Failure Breakdown
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">7 Canonical Modes</span>
          </div>

          {cognitiveBreakdown.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No cognitive failures categorized in this window.
            </div>
          ) : (
            <div className="space-y-2">
              {cognitiveBreakdown.slice(0, 4).map((c) => (
                <div key={c.cognitiveTypeId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 truncate pr-2">
                      {c.cognitiveTypeName}
                    </span>
                    <span className="text-slate-500 font-mono text-[11px] flex-shrink-0">
                      {c.activeMistakeCount} ({(c.proportionOfActiveMistakes * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, c.proportionOfActiveMistakes * 100)}%` }}
                    />
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
