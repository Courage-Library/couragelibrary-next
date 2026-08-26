import React from "react";
import Link from "next/link";
import { AdminService } from "@/services/admin.service";
import { Container } from "@/components/ui/container";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopHeader } from "@/components/admin/admin-top-header";
import { ShieldAlert, ArrowLeft } from "lucide-react";

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
    <div className="h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] flex flex-col md:flex-row overflow-hidden w-full relative">
      {/* Desktop Fixed Non-Scrolling Sidebar Below Global Header */}
      <AdminSidebar userEmail={userEmail || "admin@couragelibrary.com"} />

      {/* Main Admin Application Workspace */}
      <div className="flex-1 min-w-0 h-full max-h-full flex flex-col overflow-hidden bg-slate-100/60">
        {/* Stationary Context Header */}
        <AdminTopHeader userEmail={userEmail} />

        {/* The ONLY Vertically Scrollable Region */}
        <main className="flex-1 min-w-0 w-full overflow-y-auto p-4 sm:p-5 md:p-6">
          <div className="max-w-[1600px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
