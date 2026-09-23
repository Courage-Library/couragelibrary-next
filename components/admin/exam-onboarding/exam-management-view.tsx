"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { AdminExamListItem } from "@/services/exam-onboarding/exam-onboarding.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  PlusCircle,
  Search,
  Building2,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Globe,
} from "lucide-react";

interface Props {
  initialExams: AdminExamListItem[];
  totalExams: number;
  publishedExams: number;
  draftExams: number;
}

export function ExamManagementView({ initialExams, totalExams, publishedExams, draftExams }: Props) {
  const [exams] = useState<AdminExamListItem[]>(initialExams);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      const matchSearch =
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.conductingOrg.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCategory = filterCategory === "ALL" || e.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [exams, searchQuery, filterCategory]);

  const categories = useMemo(() => {
    const set = new Set(exams.map((e) => e.category));
    return ["ALL", ...Array.from(set)];
  }, [exams]);

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Examinations & Onboarding", active: true },
        ]}
      />

      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <GraduationCap className="w-6 h-6 text-blue-600" /> Examination Management Hub
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Manage root examination authorities, recruitment cycles, post cadres, and launch new examinations.
          </p>
        </div>

        <Link href="/admin/exams/onboarding">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs">
            <PlusCircle className="w-4 h-4" /> Start New Exam Onboarding
          </Button>
        </Link>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Total Examinations
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono">{totalExams}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 font-mono">
            Live Published Hubs
          </span>
          <div className="text-2xl font-bold text-emerald-600 font-mono">{publishedExams}</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 font-mono">
            Onboarding Drafts
          </span>
          <div className="text-2xl font-bold text-amber-600 font-mono">{draftExams}</div>
        </Card>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by examination title, slug, or conducting organization..."
            className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                filterCategory === cat
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Exams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredExams.map((exam) => (
          <Card
            key={exam.id}
            className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Badge
                  variant={exam.isActive ? "success" : "neutral"}
                  className="text-[10px] uppercase font-mono font-bold"
                >
                  {exam.isActive ? "PUBLISHED" : "DRAFT"}
                </Badge>
                <span className="text-[11px] font-mono text-slate-400">
                  {exam.readinessReport.readinessScore}% Ready
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{exam.title}</h3>
                <p className="text-[11px] font-mono text-slate-400">/exams/{exam.slug}</p>
              </div>

              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">{exam.conductingOrg.name}</span>
                </div>
                {exam.activeCycle && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Cycle: {exam.activeCycle.cycleYear}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{exam.totalPublishedModulesCount} Published Modules</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <Link
                href={`/admin/exams/onboarding?examId=${exam.id}`}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Onboarding Studio <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              {exam.isActive && (
                <Link
                  href={`/exams/${exam.slug}`}
                  target="_blank"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"
                >
                  Hub <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
