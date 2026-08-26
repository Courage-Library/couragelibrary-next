"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ExternalLink,
  User,
  Bell,
  Eye,
} from "lucide-react";

interface Props {
  userEmail?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "/admin": "Admin Overview",
  "/admin/categories": "Category Management",
  "/admin/patterns": "Pattern Management",
  "/admin/sections": "Section Management",
  "/admin/questions": "Question Bank Studio",
  "/admin/schedules": "Schedule Management",
  "/admin/mock-tests": "Mock Test Papers",
  "/admin/mock-tests-management": "Mock Test System",
  "/admin/bulk-import": "Bulk Question Importer",
  "/admin/content": "Articles & Courses",
  "/admin/descriptive": "Descriptive Mains",
  "/admin/institutes": "Institute Batches",
  "/admin/users": "User Profiles & Sync",
  "/admin/community": "Moderation Queue",
  "/admin/billing": "Billing & Plans",
};

export function AdminTopHeader({ userEmail }: Props) {
  const pathname = usePathname();
  const currentTitle = ROUTE_LABELS[pathname] || "Admin Studio";

  return (
    <header className="h-14 w-full border-b border-slate-200/80 bg-white px-4 sm:px-6 flex items-center justify-between shadow-2xs shrink-0 z-10">
      {/* Left: Page Context */}
      <div className="flex items-center gap-3 min-w-0">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate tracking-tight">
          {currentTitle}
        </h2>
        <Badge variant="success" className="hidden sm:inline-flex text-[10px] px-2 py-0.5 font-bold">
          <ShieldCheck className="w-3 h-3 mr-1" /> Live Sync
        </Badge>
      </div>

      {/* Right: Quick Links & Admin Identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs transition shadow-2xs"
          title="Open Live Public Platform"
        >
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          <span>Live Site</span>
        </Link>

        <Link
          href="/dashboard"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs transition shadow-2xs"
        >
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span>Student View</span>
        </Link>

        {/* Notifications Icon */}
        <div className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer transition">
          <Bell className="w-4 h-4" />
        </div>

        {/* Admin Profile Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
            <User className="w-3.5 h-3.5" />
          </div>
          <div className="hidden lg:block text-left">
            <span className="block text-xs font-bold text-slate-800 leading-none truncate max-w-[130px]">
              {userEmail ? userEmail.split("@")[0] : "Admin"}
            </span>
            <span className="text-[10px] font-semibold text-emerald-600 leading-tight">Super Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
