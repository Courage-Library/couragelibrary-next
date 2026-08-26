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
    <div className="w-full border-b border-slate-200/80 bg-white px-4 sm:px-6 py-2 flex items-center justify-between shadow-2xs">
      {/* Left: Page Context */}
      <div className="flex items-center gap-2.5 min-w-0">
        <h2 className="text-xs md:text-sm font-black text-slate-800 truncate tracking-tight">
          {currentTitle}
        </h2>
        <Badge variant="success" className="hidden sm:inline-flex text-[9px] px-1.5 py-0 font-bold">
          <ShieldCheck className="w-2.5 h-2.5 mr-1" /> Live Sync
        </Badge>
      </div>

      {/* Right: Quick Links & Admin Identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold text-[11px] transition"
          title="Open Live Public Platform"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Live Site</span>
        </Link>

        <Link
          href="/dashboard"
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold text-[11px] transition"
        >
          <span>Student View</span>
        </Link>

        {/* Notifications Icon */}
        <div className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer transition">
          <Bell className="w-3.5 h-3.5" />
        </div>

        {/* Admin Profile Pill */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
            <User className="w-3 h-3" />
          </div>
          <span className="hidden md:inline-block text-[11px] font-bold text-slate-700 truncate max-w-[130px]">
            {userEmail ? userEmail.split("@")[0] : "Admin"}
          </span>
        </div>
      </div>
    </div>
  );
}
