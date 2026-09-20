"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Calendar, BookOpen, Target, ExternalLink, ShieldCheck } from "lucide-react";
import { ExamKnowledgeCandidateView } from "@/types/exam-knowledge";

interface ExamHeroProps {
  data: ExamKnowledgeCandidateView;
}

export function ExamHero({ data }: ExamHeroProps) {
  const { exam, activeCycle, metadata } = data;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant="indigo" className="text-xs font-semibold px-3 py-1">
          {exam.category}
        </Badge>
        {exam.conductingOrg?.name && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span>{exam.conductingOrg.shortName || exam.conductingOrg.name}</span>
          </div>
        )}
        {activeCycle && (
          <Badge variant="success" className="text-xs font-bold px-3 py-1">
            {activeCycle.cycleLabel} ({activeCycle.status})
          </Badge>
        )}
        {metadata.overallFreshnessStatus === 'VERIFIED_CURRENT' && (
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Official Verified</span>
          </div>
        )}
      </div>

      <div className="space-y-3 max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
          {exam.title}
        </h1>
        {exam.description && (
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {exam.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <a href="#syllabus">
          <Button size="md" variant="default" className="font-bold shadow-xs">
            <BookOpen className="w-4 h-4 mr-1.5" /> Explore Syllabus
          </Button>
        </a>
        <Link href="/practice">
          <Button size="md" variant="outline" className="font-semibold">
            <Target className="w-4 h-4 mr-1.5 text-blue-600" /> Practice PYQs
          </Button>
        </Link>
        {exam.officialWebsite && (
          <a
            href={exam.officialWebsite}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors px-3 py-2"
          >
            <span>Commission Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
