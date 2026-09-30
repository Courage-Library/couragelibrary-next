"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Layers,
  ShieldAlert,
  FolderTree,
  TrendingUp,
} from "lucide-react";
import type { SyllabusReadinessSummary } from "@/types/dynamic-syllabus-reconciliation";

interface ReadinessSummaryCardsProps {
  summary: SyllabusReadinessSummary | null;
  blockingCount: number;
}

export function ReadinessSummaryCards({
  summary,
  blockingCount,
}: ReadinessSummaryCardsProps) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <Card
            key={i}
            className="p-4 bg-slate-900/60 border-slate-800 animate-pulse h-24"
          >
            <div className="h-4 bg-slate-800 rounded-sm w-20 mb-2"></div>
            <div className="h-6 bg-slate-700 rounded-sm w-12"></div>
          </Card>
        ))}
      </div>
    );
  }

  const {
    totalSyllabusNodes,
    mappedNodes,
    excludedNodes,
    unresolvedNodes,
    taxonomyCoveragePercentage,
    excludedPercentage,
    unresolvedPercentage,
    totalRootSubjects,
  } = summary;

  return (
    <div className="space-y-4">
      {/* 6 Grid Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Total Nodes */}
        <Card className="p-4 bg-slate-900/80 border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider font-mono">
              Total Nodes
            </span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono">
              {totalSyllabusNodes}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Requirements in tree
            </p>
          </div>
        </Card>

        {/* 2. Mapped / Coverage */}
        <Card className="p-4 bg-emerald-950/20 border-emerald-800/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider font-mono">
              Academic Mapped
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-300 font-mono">
                {mappedNodes}
              </span>
              <span className="text-xs font-semibold text-emerald-400 font-mono">
                ({taxonomyCoveragePercentage.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[10px] text-emerald-400/80 mt-0.5">
              Canonical coverage
            </p>
          </div>
        </Card>

        {/* 3. Excluded */}
        <Card className="p-4 bg-slate-800/40 border-slate-700/60 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider font-mono">
              Excluded
            </span>
            <EyeOff className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-300 font-mono">
                {excludedNodes}
              </span>
              <span className="text-xs font-semibold text-slate-400 font-mono">
                ({excludedPercentage.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Intentionally ignored
            </p>
          </div>
        </Card>

        {/* 4. Unresolved / Action Required */}
        <Card className="p-4 bg-amber-950/20 border-amber-800/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider font-mono">
              Unresolved
            </span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-300 font-mono">
                {unresolvedNodes}
              </span>
              <span className="text-xs font-semibold text-amber-400 font-mono">
                ({unresolvedPercentage.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[10px] text-amber-400/80 mt-0.5">
              Action required
            </p>
          </div>
        </Card>

        {/* 5. Blocking Gaps */}
        <Card
          className={`p-4 flex flex-col justify-between ${
            blockingCount > 0
              ? "bg-rose-950/30 border-rose-800/50"
              : "bg-slate-900/80 border-slate-800/80"
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider font-mono">
              Blocking Gaps
            </span>
            <ShieldAlert
              className={`w-4 h-4 ${blockingCount > 0 ? "text-rose-400" : "text-slate-500"}`}
            />
          </div>
          <div>
            <div
              className={`text-2xl font-bold font-mono ${
                blockingCount > 0 ? "text-rose-300" : "text-slate-400"
              }`}
            >
              {blockingCount}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              High-priority items
            </p>
          </div>
        </Card>

        {/* 6. Root Subjects */}
        <Card className="p-4 bg-slate-900/80 border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider font-mono">
              Root Subjects
            </span>
            <FolderTree className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-200 font-mono">
              {totalRootSubjects}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Top-level domains
            </p>
          </div>
        </Card>
      </div>

      {/* Visual Proportional Progress Bar */}
      {totalSyllabusNodes > 0 && (
        <div className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              Syllabus Readiness Distribution
            </span>
            <span className="font-mono text-[11px]">
              {mappedNodes}/{totalSyllabusNodes} Mapped ({taxonomyCoveragePercentage.toFixed(1)}%)
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
            {/* Mapped segment */}
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${taxonomyCoveragePercentage}%` }}
              title={`Mapped: ${mappedNodes} (${taxonomyCoveragePercentage.toFixed(1)}%)`}
            />
            {/* Excluded segment */}
            <div
              className="bg-slate-500 h-full transition-all duration-300"
              style={{ width: `${excludedPercentage}%` }}
              title={`Excluded: ${excludedNodes} (${excludedPercentage.toFixed(1)}%)`}
            />
            {/* Unresolved segment */}
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${unresolvedPercentage}%` }}
              title={`Unresolved: ${unresolvedNodes} (${unresolvedPercentage.toFixed(1)}%)`}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>Mapped ({taxonomyCoveragePercentage.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                <span>Excluded ({excludedPercentage.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span>Unresolved ({unresolvedPercentage.toFixed(1)}%)</span>
              </div>
            </div>
            <div className="font-mono text-[10px] text-slate-500">
              Invariant: {mappedNodes} + {excludedNodes} + {unresolvedNodes} = {totalSyllabusNodes}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
