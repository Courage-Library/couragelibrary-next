import React from "react";
import Link from "next/link";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle,
  FileCheck2,
  BookOpen,
  PenTool,
  Building2,
  ShieldAlert,
  CreditCard,
  Layers,
  LayoutDashboard,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const revalidate = 0;

export default async function AdminDashboardPage() {
  const stats = await AdminService.getAdminOverview();

  const kpis = [
    {
      title: "QUESTION BANK",
      count: stats.totalQuestions,
      desc: "Multi-format questions with PYQ tagging",
      href: "/admin/questions",
      icon: HelpCircle,
      linkText: "Manage Questions",
    },
    {
      title: "MOCK TEST PAPERS",
      count: stats.totalMockTests,
      desc: "Full-length mocks, pilot tests & blueprints",
      href: "/admin/mock-tests",
      icon: FileCheck2,
      linkText: "Manage Mock Tests",
    },
    {
      title: "EXAM PATTERNS",
      count: stats.totalPatterns,
      desc: "Tier schemes, section marks & timing",
      href: "/admin/patterns",
      icon: Layers,
      linkText: "Manage Patterns",
    },
    {
      title: "ARTICLES & COURSES",
      count: stats.totalArticles + stats.totalCourses,
      desc: "Editorial articles and structured video courses",
      href: "/admin/content",
      icon: BookOpen,
      linkText: "Manage Content",
    },
    {
      title: "DESCRIPTIVE MAINS",
      count: stats.totalDescriptive,
      desc: "Mains essay, precis, and letter questions",
      href: "/admin/descriptive",
      icon: PenTool,
      linkText: "Manage Mains",
    },
    {
      title: "INSTITUTES & BATCHES",
      count: stats.totalInstitutes,
      desc: "Partner coaching institutes and batch enrollments",
      href: "/admin/institutes",
      icon: Building2,
      linkText: "Manage Institutes",
    },
    {
      title: "PENDING MODERATION",
      count: stats.pendingFlagsCount,
      desc: "Flagged community discussions and replies",
      href: "/admin/community",
      icon: ShieldAlert,
      linkText: "Review Flags",
    },
    {
      title: "PAYMENT ORDERS",
      count: stats.totalOrdersCount,
      desc: "PRO subscription checkouts and invoices",
      href: "/admin/billing",
      icon: CreditCard,
      linkText: "View Orders",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Light Summary Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            Admin Studio Overview
          </h1>
          <Badge variant="success" className="w-fit text-xs px-2.5 py-0.5 font-bold">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Live Operations
          </Badge>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-3xl">
          Content &amp; Operations Control Center &mdash; manage questions, test patterns, mock papers, learning courses, institute batches, community moderation, and billing.
        </p>
      </div>

      {/* KPI Cards Grid — 4 Columns on Desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.title}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-bold tracking-wider font-mono text-slate-500">
                    {kpi.title}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
                    <Icon className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono">
                  {kpi.count}
                </div>
                <p className="text-xs text-slate-500 font-medium line-clamp-1">
                  {kpi.desc}
                </p>
              </div>

              <Link
                href={kpi.href}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 pt-2 border-t border-slate-100 transition-colors"
              >
                <span>{kpi.linkText}</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
