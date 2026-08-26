import React from "react";
import Link from "next/link";
import { AdminService } from "@/services/admin.service";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/brand/logo";
import {
  LayoutDashboard,
  HelpCircle,
  FileCheck2,
  BookOpen,
  PenTool,
  Building2,
  ShieldAlert,
  CreditCard,
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

        <nav className="space-y-1 text-xs font-semibold">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LayoutDashboard className="w-4 h-4 text-indigo-400" /> Dashboard Overview
          </Link>
          <Link
            href="/admin/questions"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-blue-400" /> Question Bank
          </Link>
          <Link
            href="/admin/mock-tests"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <FileCheck2 className="w-4 h-4 text-emerald-400" /> Mock Tests
          </Link>
          <Link
            href="/admin/content"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <BookOpen className="w-4 h-4 text-purple-400" /> Articles & Courses
          </Link>
          <Link
            href="/admin/descriptive"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <PenTool className="w-4 h-4 text-amber-400" /> Descriptive Mains
          </Link>
          <Link
            href="/admin/institutes"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Building2 className="w-4 h-4 text-teal-400" /> Institutes & Batches
          </Link>
          <Link
            href="/admin/community"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" /> Moderation Queue
          </Link>
          <Link
            href="/admin/billing"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <CreditCard className="w-4 h-4 text-yellow-400" /> Billing & Orders
          </Link>
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
