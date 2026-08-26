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
} from "lucide-react";

export const revalidate = 0;

export default async function AdminDashboardPage() {
  const stats = await AdminService.getAdminOverview();

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-2">
        <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
          Phase 4F.2 Admin Control Studio
        </Badge>
        <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
          <Layers className="w-8 h-8 text-indigo-400" />
          Platform Administration Dashboard
        </h1>
        <p className="text-indigo-100 text-xs sm:text-sm max-w-2xl">
          Centralized management for question bank, mock tests, structured courses, descriptive mains studio, institute verification, community moderation, and billing.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">QUESTION BANK</span>
            <HelpCircle className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{stats.totalQuestions}</div>
          <Link href="/admin/questions" className="text-[11px] font-bold text-blue-600 hover:underline block pt-1">
            Manage Questions →
          </Link>
        </Card>

        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">MOCK TESTS</span>
            <FileCheck2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{stats.totalMockTests}</div>
          <Link href="/admin/mock-tests" className="text-[11px] font-bold text-emerald-600 hover:underline block pt-1">
            Manage Mock Tests →
          </Link>
        </Card>

        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">ARTICLES & COURSES</span>
            <BookOpen className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">
            {stats.totalArticles + stats.totalCourses}
          </div>
          <Link href="/admin/content" className="text-[11px] font-bold text-purple-600 hover:underline block pt-1">
            Manage Content →
          </Link>
        </Card>

        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">DESCRIPTIVE MAINS</span>
            <PenTool className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{stats.totalDescriptive}</div>
          <Link href="/admin/descriptive" className="text-[11px] font-bold text-amber-600 hover:underline block pt-1">
            Manage Mains →
          </Link>
        </Card>

        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">INSTITUTES</span>
            <Building2 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{stats.totalInstitutes}</div>
          <Link href="/admin/institutes" className="text-[11px] font-bold text-teal-600 hover:underline block pt-1">
            Manage Institutes →
          </Link>
        </Card>

        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">PENDING MODERATION</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{stats.pendingFlagsCount}</div>
          <Link href="/admin/community" className="text-[11px] font-bold text-rose-600 hover:underline block pt-1">
            Review Flags →
          </Link>
        </Card>

        <Card className="p-5 space-y-2 border-slate-200 bg-white">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold font-mono">PAYMENT ORDERS</span>
            <CreditCard className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">{stats.totalOrdersCount}</div>
          <Link href="/admin/billing" className="text-[11px] font-bold text-yellow-600 hover:underline block pt-1">
            View Orders →
          </Link>
        </Card>
      </div>
    </div>
  );
}
