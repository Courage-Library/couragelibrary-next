"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  FileSpreadsheet,
  ChevronRight,
} from "lucide-react";
import type {
  SyllabusVersionListItem,
  SyllabusReadinessReport,
} from "@/types/dynamic-syllabus-reconciliation";

interface WorkbenchHeaderProps {
  versions: SyllabusVersionListItem[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
  selectedVersion: SyllabusVersionListItem | null;
  report: SyllabusReadinessReport | null;
}

export function WorkbenchHeader({
  versions,
  selectedVersionId,
  onSelectVersion,
  isLoading,
  onRefresh,
  selectedVersion,
  report,
}: WorkbenchHeaderProps) {
  const isStale = report?.health?.isStale;

  return (
    <div className="space-y-4 border-b border-slate-800 bg-slate-900/70 p-4 md:p-6 backdrop-blur-md rounded-xl">
      {/* Top Title & Version Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/10 border border-blue-500/30 rounded-lg text-blue-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Syllabus Reconciliation Workbench
              </h1>
              <p className="text-xs text-slate-400">
                Phase 3R — Academic Taxonomy &amp; Dynamic Syllabus Reconciliation Workspace
              </p>
            </div>
          </div>
        </div>

        {/* Version Selector & Refresh Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="version-select"
              className="text-xs font-mono uppercase text-slate-400 font-semibold"
            >
              Syllabus Version:
            </label>
            <select
              id="version-select"
              value={selectedVersionId || ""}
              onChange={(e) => onSelectVersion(e.target.value)}
              disabled={isLoading || versions.length === 0}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer disabled:opacity-50"
            >
              {versions.length === 0 ? (
                <option value="">No Syllabus Versions Available</option>
              ) : (
                versions.map((ver) => (
                  <option key={ver.id} value={ver.id}>
                    {ver.examName} — {ver.versionTag}{" "}
                    {ver.cycleYear ? `(${ver.cycleYear})` : ""}{" "}
                    [{ver.status}]
                  </option>
                ))
              )}
            </select>
          </div>

          <Button
            onClick={onRefresh}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin text-blue-400" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Selected Version Metadata Bar */}
      {selectedVersion && (
        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs border-t border-slate-800/60 text-slate-400">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
            <span>Exam: {selectedVersion.examName}</span>
          </div>

          <span className="text-slate-600">•</span>

          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Tag: <code className="text-indigo-300 font-mono">{selectedVersion.versionTag}</code></span>
          </div>

          <span className="text-slate-600">•</span>

          <div>
            Status:{" "}
            <Badge
              variant={
                selectedVersion.status === "PUBLISHED"
                  ? "success"
                  : selectedVersion.status === "RECONCILED"
                  ? "indigo"
                  : "warning"
              }
              className="text-[10px] ml-1 font-mono uppercase"
            >
              {selectedVersion.status}
            </Badge>
          </div>

          {selectedVersion.isActive && (
            <>
              <span className="text-slate-600">•</span>
              <Badge variant="success" className="text-[10px] bg-emerald-950/60 text-emerald-300 border-emerald-800">
                ACTIVE CYCLE
              </Badge>
            </>
          )}

          {report?.health?.lastReconciliationAt && (
            <>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>
                  Reconciled: {new Date(report.health.lastReconciliationAt).toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Staleness Warning Banner if applicable */}
      {isStale && (
        <div className="flex items-center gap-3 p-3 bg-amber-950/50 border border-amber-800/80 rounded-lg text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-amber-300">
              Taxonomy Reconciliation Stale:
            </span>{" "}
            {report?.health?.staleReason ||
              "Canonical taxonomy has received updates since the last automated reconciliation run. Some mappings may reference outdated taxonomy states."}
          </div>
        </div>
      )}
    </div>
  );
}
