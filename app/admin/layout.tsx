import React from "react";
import Link from "next/link";
import { AdminService } from "@/services/admin.service";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/brand/logo";
import {
  LayoutDashboard,
  Layers,
  GitBranch,
  FolderTree,
  HelpCircle,
  Calendar,
  FileCheck2,
  BookOpen,
  PenTool,
  Building2,
  FileUp,
  ShieldAlert,
  CreditCard,
  Users,
  ArrowLeft,
  Shield,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const { isAdmin, userEmail } = await AdminService.checkIsAdminOrStaff();

  if (!isAdmin) {
    return (
      <div className="py-20 bg-slate-50 min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Container className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Access Restricted</h1>
          <p className="text-xs text-slate-600">
            You do not have staff or administrator privileges to access the Courage Library Admin Studio.
          </p>
          <Link href="/dashboard">
            <button className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Return to Dashboard
            </button>
          </Link>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-100/60 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 p-5 space-y-6 shrink-0 border-r border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BrandLogo size="sm" showText={false} />
            <span className="font-extrabold text-white text-base tracking-tight">Admin Studio</span>
          </div>
          <p className="text-[11px] font-mono text-slate-400 truncate">Staff: {userEmail}</p>
        </div>

        <nav className="space-y-4 text-xs font-semibold">
          <div>
            <Link
              href="/admin"
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-400" /> Dashboard Overview
            </Link>
          </div>

          {/* CONTENT HIERARCHY */}
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block mb-1">
              Content Hierarchy
            </span>
            <Link
              href="/admin/categories"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" /> Categories (Exams)
            </Link>
            <Link
              href="/admin/patterns"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5 text-indigo-400" /> Patterns
            </Link>
            <Link
              href="/admin/sections"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <FolderTree className="w-3.5 h-3.5 text-teal-400" /> Sections
            </Link>
            <Link
              href="/admin/questions"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-400" /> Question Bank
            </Link>
            <Link
              href="/admin/schedules"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-purple-400" /> Schedules
            </Link>
            <Link
              href="/admin/mock-tests"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-amber-400" /> Mock Tests
            </Link>
            <Link
              href="/admin/content"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-pink-400" /> Articles &amp; Courses
            </Link>
            <Link
              href="/admin/descriptive"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <PenTool className="w-3.5 h-3.5 text-orange-400" /> Descriptive Mains
            </Link>
            <Link
              href="/admin/institutes"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-400" /> Institutes
            </Link>
          </div>

          {/* TOOLS & OPERATIONS */}
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block mb-1">
              Tools &amp; Management
            </span>
            <Link
              href="/admin/bulk-import"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <FileUp className="w-3.5 h-3.5 text-indigo-400" /> Hierarchical Import
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-sky-400" /> Users &amp; Profiles
            </Link>
            <Link
              href="/admin/community"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Moderation Queue
            </Link>
            <Link
              href="/admin/billing"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5 text-yellow-400" /> Billing &amp; Plans
            </Link>
          </div>
        </nav>

        <div className="pt-4 border-t border-slate-800">
          <Badge variant="indigo" className="w-full justify-center text-[10px] bg-slate-800 text-slate-300 border-slate-700">
            <Shield className="w-3 h-3 mr-1 text-indigo-400" /> Protected Admin Session
          </Badge>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
