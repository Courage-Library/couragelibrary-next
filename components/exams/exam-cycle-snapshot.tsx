"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { ExamKnowledgeCandidateView } from "@/types/exam-knowledge";

interface ExamCycleSnapshotProps {
  activeCycle: ExamKnowledgeCandidateView["activeCycle"];
  availableCycles: ExamKnowledgeCandidateView["availableCycles"];
  examSlug: string;
}

export function ExamCycleSnapshot({ activeCycle, availableCycles, examSlug }: ExamCycleSnapshotProps) {
  if (!activeCycle) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50">
        <CardContent className="p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-200/80 text-slate-500 flex items-center justify-center mx-auto">
            <Calendar className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Recruitment Cycle Pending Announcement</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The official commission notification for the upcoming examination cycle has not yet been released. Historical syllabus and timeless exam parameters are available below.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (d: string | null) => {
    if (!d) return "To Be Announced";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Card className="border-blue-200/70 bg-gradient-to-br from-white to-blue-50/30 shadow-xs">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
              {activeCycle.cycleLabel} Notification & Key Dates
            </h3>
          </div>
          <Badge variant="outline" className="text-[11px] font-mono">
            {activeCycle.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
              Notification Date
            </span>
            <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              {activeCycle.notificationDate ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span>{formatDate(activeCycle.notificationDate)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
              Application Window
            </span>
            <span className="text-sm font-bold text-slate-900 block">
              {activeCycle.applicationStartDate
                ? `${formatDate(activeCycle.applicationStartDate)} – ${formatDate(activeCycle.applicationEndDate)}`
                : "To Be Announced"}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
              Exam Schedule
            </span>
            <span className="text-sm font-bold text-slate-900 block">
              {activeCycle.examStartDate
                ? `${formatDate(activeCycle.examStartDate)} – ${formatDate(activeCycle.examEndDate)}`
                : "To Be Announced"}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
              Total Vacancies
            </span>
            <div className="text-sm font-black text-blue-700 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>
                {activeCycle.totalVacancies
                  ? activeCycle.totalVacancies.toLocaleString()
                  : "To Be Announced"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
