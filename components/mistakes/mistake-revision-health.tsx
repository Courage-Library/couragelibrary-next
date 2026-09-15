"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevisionHealthSummary } from "@/services/mistake.service";
import {
  Activity,
  Zap,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface MistakeRevisionHealthProps {
  intelligence: RevisionHealthSummary;
}

export function MistakeRevisionHealth({ intelligence }: MistakeRevisionHealthProps) {
  const {
    totalMistakes,
    highPriorityCount,
    dueForRevisionCount,
    improvingCount,
    masteredCount,
    healthScorePct,
    retentionRatePct,
    nextBestRevisions,
    patterns,
  } = intelligence;

  if (totalMistakes === 0) {
    return null;
  }

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score >= 60) return "text-blue-700 bg-blue-50 border-blue-200";
    if (score >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-rose-700 bg-rose-50 border-rose-200";
  };

  return (
    <div className="space-y-4">
      {/* Revision Health Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Activity className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Revision Health & Intelligence
              </h2>
              <Badge variant="indigo" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-2 py-0.5">
                Deterministic Engine
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Personalized spaced recovery and priority recommendations based on your test mistakes.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className={`px-3.5 py-2 rounded-xl border flex items-center gap-2.5 ${getHealthScoreColor(healthScorePct)}`}>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-75">Health Score</div>
                <div className="text-lg font-black leading-none">{healthScorePct}%</div>
              </div>
              <ShieldCheck className="w-5 h-5 opacity-80" />
            </div>

            <Link href="/mistakes/drill">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs">
                <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" /> Start Smart Drill
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Metric Mini-Blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500" /> Due for Revision
            </div>
            <div className="text-xl font-black text-slate-800 mt-1">{dueForRevisionCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Urgent slip reviews</div>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-500" /> High Priority
            </div>
            <div className="text-xl font-black text-rose-700 mt-1">{highPriorityCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">MPI &gt; 0.65 or repeat</div>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-blue-500" /> Improving
            </div>
            <div className="text-xl font-black text-blue-700 mt-1">{improvingCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">1/2 streak in progress</div>
          </div>

          <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Retention Rate
            </div>
            <div className="text-xl font-black text-emerald-700 mt-1">{retentionRatePct}%</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{masteredCount} of {totalMistakes} mastered</div>
          </div>
        </div>

        {/* Pattern Insights Strip */}
        {(patterns.subjectConcentration || patterns.primaryCognitiveMode || patterns.weakestTopic) && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Patterns:
            </span>

            {patterns.subjectConcentration && (
              <Badge variant="indigo" className="bg-slate-100 text-slate-700 border-slate-200 text-xs py-1 px-2.5 font-medium">
                {patterns.subjectConcentration.sharePct}% errors in <strong className="ml-1 text-slate-900">{patterns.subjectConcentration.name}</strong>
              </Badge>
            )}

            {patterns.primaryCognitiveMode && (
              <Badge variant="indigo" className={`text-xs py-1 px-2.5 font-medium ${patterns.primaryCognitiveMode.hasConfidence ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                Top mode: <strong className="mx-1">{patterns.primaryCognitiveMode.name}</strong>
                {patterns.primaryCognitiveMode.hasConfidence ? "(High confidence)" : "(Emerging)"}
              </Badge>
            )}

            {patterns.weakestTopic && (
              <Badge variant="indigo" className="bg-rose-50 text-rose-900 border-rose-200 text-xs py-1 px-2.5 font-medium">
                Weakest topic: <strong className="ml-1">{patterns.weakestTopic.name}</strong>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Next Best Revision Items (Top 3 Actionable Recommendations) */}
      {nextBestRevisions && nextBestRevisions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-amber-50 text-amber-600">
                <Sparkles className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                Next Best Revisions
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Ranked by Urgency & Recovery Impact
            </span>
          </div>

          <div className="space-y-2.5">
            {nextBestRevisions.slice(0, 3).map((item, idx) => (
              <div
                key={item.vaultId}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      #{idx + 1} Priority
                    </span>
                    <Badge variant="indigo" className="text-[10px] py-0.5 px-2 bg-amber-50 text-amber-800 border-amber-200">
                      {item.dueLabel}
                    </Badge>
                    {item.topicName && (
                      <span className="text-xs font-semibold text-slate-700 truncate">
                        {item.topicName}
                      </span>
                    )}
                    {item.subjectName && (
                      <span className="text-xs text-slate-500">
                        • {item.subjectName}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-800 line-clamp-1 font-medium">
                    {item.questionText}
                  </p>

                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>{item.reason}</span>
                    <span>•</span>
                    <span>MPI: <strong className="text-slate-700">{item.mpi.toFixed(2)}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {item.hasLearningContent && item.learningResourceUrl && (
                    <Link href={item.learningResourceUrl}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 px-3 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 gap-1"
                      >
                        <BookOpen className="w-3.5 h-3.5" /> Concept
                      </Button>
                    </Link>
                  )}

                  <Link href={item.drillUrl}>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-3 rounded-lg gap-1 shadow-xs"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" /> Drill
                    </Button>
                  </Link>

                  <Link href={`/mistakes/${item.vaultId}`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8 px-2 text-slate-500 hover:text-slate-800"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
