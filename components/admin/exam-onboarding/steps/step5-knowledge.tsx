"use client";

import React from "react";
import Link from "next/link";
import { OnboardingKnowledgeModuleStatus } from "@/services/exam-onboarding/exam-onboarding.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, ExternalLink, ShieldCheck, CheckCircle2, Clock } from "lucide-react";

interface Props {
  examId: string;
  cycleId?: string | null;
  modules: OnboardingKnowledgeModuleStatus[];
  onContinue: () => void;
  onBack: () => void;
}

export function Step5Knowledge({ examId, cycleId, modules, onContinue, onBack }: Props) {
  const publishedCount = modules.filter((m) => m.status === "PUBLISHED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-600" /> Step 5: Verified Sources &amp; Knowledge Modules Matrix
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Live dynamic matrix of all {modules.length} canonical modules driven by ExamModuleRegistry. Authoring is performed via human academic review in Exam Knowledge Studio.
          </p>
        </div>
        <Link
          href={`/admin/exam-knowledge?examId=${examId}${cycleId ? `&cycleId=${cycleId}` : ''}`}
          target="_blank"
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open Exam Knowledge Studio
        </Link>
      </div>

      {/* Progress Pill Card */}
      <Card className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm font-mono">
            {publishedCount}/{modules.length}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">Knowledge Modules Coverage</p>
            <p className="text-[11px] text-slate-500">
              Core modules (Overview, Eligibility, Selection, Pattern) are required for publication gating.
            </p>
          </div>
        </div>
      </Card>

      {/* Modules Table */}
      <Card className="p-0 bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] font-mono">
              <tr>
                <th className="px-4 py-3">Module Key &amp; Name</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Studio Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modules.map((m) => (
                <tr key={m.moduleKey} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{m.displayName}</div>
                    <div className="font-mono text-[10px] text-slate-400">{m.moduleKey}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px]">
                      {m.isCycleSpecific ? "Cycle-Specific" : "Timeless"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {m.status === "PUBLISHED" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Clock className="w-3.5 h-3.5" /> {m.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={m.studioUrl}
                      target="_blank"
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                    >
                      Author in Studio <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="text-xs font-bold px-5 py-2.5 rounded-xl border-slate-200"
        >
          ← Back to Step 4
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-xs"
        >
          Continue to Step 6 (Readiness Gate) →
        </Button>
      </div>
    </div>
  );
}
