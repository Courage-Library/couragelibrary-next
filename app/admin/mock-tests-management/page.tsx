import React from "react";
import Link from "next/link";
import { AdminService } from "@/services/admin.service";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Layers,
  GitBranch,
  FolderTree,
  HelpCircle,
  Calendar,
  FileCheck2,
  FileUp,
  ArrowRight,
  PlusCircle,
  Sparkles,
} from "lucide-react";

export const revalidate = 0;

export default async function AdminMockTestsManagementPage() {
  const [categories, patterns, sections, questionsCountRes, schedules, mockTests] =
    await Promise.all([
      AdminService.getAdminCategories(),
      AdminService.getAdminPatterns(),
      AdminService.getAdminSections(),
      AdminService.getQuestionsCount(),
      AdminService.getAdminSchedules(),
      AdminService.getAdminMockTests(),
    ]);

  const totalQuestions = questionsCountRes || 0;

  const modules = [
    {
      title: "Categories (Exams)",
      count: `${categories.length} Categories`,
      description: "Root examination categories & conducting boards (SSC, Police, Defence, Railway).",
      href: "/admin/categories",
      icon: Layers,
      color: "text-blue-600",
      bgColor: "bg-blue-50/60",
      borderColor: "border-blue-200",
      actionText: "Manage Categories",
    },
    {
      title: "Patterns (Blueprints)",
      count: `${patterns.length} Patterns`,
      description: "Exam specifications defining duration, total questions, marks, and negative marking.",
      href: "/admin/patterns",
      icon: GitBranch,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50/60",
      borderColor: "border-indigo-200",
      actionText: "Manage Patterns",
    },
    {
      title: "Sections (Subjects)",
      count: `${sections.length} Sections`,
      description: "Subject syllabus divisions, canonical topics, and sectional questions count.",
      href: "/admin/sections",
      icon: FolderTree,
      color: "text-teal-600",
      bgColor: "bg-teal-50/60",
      borderColor: "border-teal-200",
      actionText: "Manage Sections",
    },
    {
      title: "Question Bank",
      count: `${totalQuestions.toLocaleString()} Questions`,
      description: "Multi-lingual question items with isolated server answer keys and PYQ provenance.",
      href: "/admin/questions",
      icon: HelpCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50/60",
      borderColor: "border-emerald-200",
      actionText: "Manage Questions",
    },
    {
      title: "Exam Schedules",
      count: `${schedules.length} Cycles`,
      description: "Official notification release schedules, application windows, and exam dates.",
      href: "/admin/schedules",
      icon: Calendar,
      color: "text-purple-600",
      bgColor: "bg-purple-50/60",
      borderColor: "border-purple-200",
      actionText: "Manage Schedules",
    },
    {
      title: "Mock Test Papers",
      count: `${mockTests.length} Full Papers`,
      description: "Published test papers, sectional time allocations, and test simulator runtime.",
      href: "/admin/mock-tests",
      icon: FileCheck2,
      color: "text-amber-600",
      bgColor: "bg-amber-50/60",
      borderColor: "border-amber-200",
      actionText: "Manage Mock Tests",
    },
    {
      title: "Hierarchical Bulk Import",
      count: "Multi-Entity Studio",
      description: "Two-stage validated importer maintaining strict Category → Pattern → Section hierarchy.",
      href: "/admin/bulk-import",
      icon: FileUp,
      color: "text-rose-600",
      bgColor: "bg-rose-50/60",
      borderColor: "border-rose-200",
      actionText: "Open Import Studio",
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl pb-16">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={[{ label: "Mock Test Management", active: true }]} />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="text-[10px] font-mono uppercase">
              Unified Content CMS
            </Badge>
          </div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2 mt-1">
            <ClipboardList className="w-8 h-8 text-blue-600" /> Mock Test Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manage the complete Courage Library mock-test content architecture from one central control panel.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/categories">
            <Button variant="outline" size="sm" className="text-xs font-bold border-slate-300">
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Category
            </Button>
          </Link>
          <Link href="/admin/patterns">
            <Button variant="outline" size="sm" className="text-xs font-bold border-slate-300">
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Pattern
            </Button>
          </Link>
          <Link href="/admin/questions">
            <Button variant="outline" size="sm" className="text-xs font-bold border-slate-300">
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Question
            </Button>
          </Link>
          <Link href="/admin/mock-tests">
            <Button variant="outline" size="sm" className="text-xs font-bold border-slate-300">
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Mock Test
            </Button>
          </Link>
          <Link href="/admin/bulk-import">
            <Button variant="default" size="sm" className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
              <FileUp className="w-3.5 h-3.5 mr-1" /> Bulk Import
            </Button>
          </Link>
        </div>
      </div>

      {/* Visual Content Hierarchy Diagram */}
      <Card className="p-6 bg-slate-900 text-white border-slate-800 space-y-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-black uppercase font-mono tracking-wider text-slate-300">
              Authoritative Content Hierarchy Flow
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Strict Relational Integrity</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-1">
            <span className="text-[10px] font-mono text-blue-400 uppercase font-bold block">1. Root Category</span>
            <span className="text-xs font-black text-white block">Exams &amp; Boards</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-1">
            <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold block">2. Pattern</span>
            <span className="text-xs font-black text-white block">Exam Blueprints</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-1">
            <span className="text-[10px] font-mono text-teal-400 uppercase font-bold block">3. Section</span>
            <span className="text-xs font-black text-white block">Subject Divisions</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-1">
            <span className="text-[10px] font-mono text-amber-400 uppercase font-bold block">4. Topic</span>
            <span className="text-xs font-black text-white block">Canonical Topics</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-1">
            <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold block">5. Question</span>
            <span className="text-xs font-black text-white block">Versions &amp; Keys</span>
          </div>
        </div>
      </Card>

      {/* 7 MODULE CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Card
              key={mod.title}
              className={`p-5 bg-white border ${mod.borderColor} hover:shadow-md transition flex flex-col justify-between space-y-4`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl ${mod.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${mod.color}`} />
                  </div>
                  <Badge variant="outline" className="text-[11px] font-mono font-bold">
                    {mod.count}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <Link href={mod.href} className="w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center justify-between"
                  >
                    <span>{mod.actionText}</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
