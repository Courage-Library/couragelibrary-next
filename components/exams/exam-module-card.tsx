"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
import { CandidatePublishedModule, ExamModuleKey } from "@/types/exam-knowledge";

interface ExamModuleCardProps {
  moduleKey: ExamModuleKey;
  displayName: string;
  moduleData: CandidatePublishedModule | null | undefined;
  examSlug: string;
}

export function ExamModuleCard({
  moduleKey,
  displayName,
  moduleData,
  examSlug,
}: ExamModuleCardProps) {
  const moduleSlug = moduleKey.toLowerCase().replace(/_/g, "-");
  const isAvailable = Boolean(moduleData && moduleData.compiledMdx);

  return (
    <Card className={`h-full flex flex-col justify-between transition-all ${isAvailable ? "hover:border-blue-300 hover:shadow-md bg-white" : "border-slate-200/60 bg-slate-50/60 opacity-80"}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isAvailable ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-500"}`}>
              <BookOpen className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 tracking-tight">{displayName}</h4>
          </div>
          <Badge variant={isAvailable ? "success" : "outline"} className="text-[10px]">
            {isAvailable ? "Available" : "Pending"}
          </Badge>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
          {moduleData?.description || `Comprehensive guidance and verified parameters for ${displayName}.`}
        </p>

        {isAvailable && moduleData?.lastVerifiedDate && (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Verified: {moduleData.lastVerifiedDate}</span>
          </div>
        )}
      </CardContent>

      <div className="p-5 pt-0">
        {isAvailable ? (
          <Link href={`/exams/${examSlug}/${moduleSlug}`}>
            <button className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 hover:bg-blue-50 text-xs font-bold text-slate-700 hover:text-blue-700 transition-colors">
              <span>Read Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        ) : (
          <div className="py-2 text-center text-[11px] font-semibold text-slate-400">
            Guide under academic verification
          </div>
        )}
      </div>
    </Card>
  );
}
