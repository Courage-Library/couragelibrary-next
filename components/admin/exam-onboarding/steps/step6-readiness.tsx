"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ExamReadinessReport } from "@/services/exam-onboarding/exam-readiness.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertTriangle, CheckCircle2, Lock, Unlock, ExternalLink, Globe } from "lucide-react";

interface Props {
  report: ExamReadinessReport;
  onPublish: () => Promise<void>;
  onBack: () => void;
  isPublishing: boolean;
}

export function Step6Readiness({ report, onPublish, onBack, isPublishing }: Props) {
  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublish = async () => {
    setPublishError(null);
    try {
      await onPublish();
    } catch (err: any) {
      setPublishError(err.message || "Failed to publish exam.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" /> Step 6: Server-Authoritative Exam Readiness Gate
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Comprehensive 14-dimension readiness verification. Blocking issues prevent publication to candidate routes.
        </p>
      </div>

      {publishError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
          {publishError}
        </div>
      )}

      {/* Score Header Card */}
      <Card className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-900">{report.examTitle}</span>
              <Badge variant={report.isActive ? "success" : "neutral"} className="text-[10px]">
                {report.isActive ? "PUBLISHED / LIVE" : "PRIVATE DRAFT"}
              </Badge>
            </div>
            <p className="text-xs font-mono text-slate-400">
              Canonical URL: /exams/{report.examSlug}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900 font-mono">{report.readinessScore}%</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase font-mono">Readiness Score</div>
            </div>
          </div>
        </div>

        {/* Blocking Alert */}
        {!report.isPublishable ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-rose-700 text-xs font-bold">
              <Lock className="w-4 h-4" /> Publication Blocked — {report.blockingIssuesCount} Critical Issue(s)
            </div>
            <ul className="text-xs text-rose-600 space-y-1 pl-6 list-disc">
              {report.blockingIssues.map((issue) => (
                <li key={issue.id}>
                  <span className="font-bold">[{issue.dimension}]</span> {issue.title}: {issue.description}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold">
              <Unlock className="w-4 h-4" /> Ready for Candidate Publication (0 Blocking Issues)
            </div>
            {report.isActive && (
              <Link
                href={`/exams/${report.examSlug}`}
                target="_blank"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                View Live Hub <Globe className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}
      </Card>

      {/* 14-Dimension Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.values(report.dimensionBreakdown).map((dim) => (
          <Card key={dim.dimension} className="p-4 bg-white border border-slate-200/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">{dim.displayName}</span>
              {dim.isPassed ? (
                <span className="text-emerald-600 text-[11px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                </span>
              ) : dim.hasBlockingIssue ? (
                <span className="text-rose-600 text-[11px] font-bold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> BLOCKER
                </span>
              ) : (
                <span className="text-amber-600 text-[11px] font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> ADVISORY
                </span>
              )}
            </div>

            <div className="space-y-1">
              {dim.checks.map((chk) => (
                <div key={chk.id} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                  <span className={chk.isPassed ? "text-emerald-500" : chk.severity === "BLOCKING" ? "text-rose-500" : "text-amber-500"}>
                    •
                  </span>
                  <span>{chk.title}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="text-xs font-bold px-5 py-2.5 rounded-xl border-slate-200"
        >
          ← Back to Step 5
        </Button>

        <Button
          type="button"
          onClick={handlePublish}
          disabled={!report.isPublishable || isPublishing || report.isActive}
          className={`text-xs font-bold px-7 py-2.5 rounded-xl shadow-xs ${
            report.isActive
              ? "bg-emerald-600 text-white cursor-default"
              : report.isPublishable
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {report.isActive ? "✓ Already Published" : isPublishing ? "Publishing..." : "Publish Examination to Live Hub"}
        </Button>
      </div>
    </div>
  );
}
