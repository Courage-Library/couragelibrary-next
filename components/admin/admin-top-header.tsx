"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ExternalLink,
  User,
  LayoutDashboard,
  Bell,
} from "lucide-react";

interface Props {
  userEmail?: string;
  onOpenMobileNav?: () => void;
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

export function AdminTopHeader({ userEmail, onOpenMobileNav }: Props) {
  const pathname = usePathname();
  const currentTitle = ROUTE_LABELS[pathname] || "Admin Studio";

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 md:px-8 py-3 flex items-center justify-between shadow-2xs">
      {/* Left: Page Title & Context */}
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
            aria-label="Open Navigation"
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm md:text-base font-black text-slate-900 truncate tracking-tight">
              {currentTitle}
            </h1>
            <Badge variant="success" className="hidden sm:inline-flex text-[10px] px-2 py-0.5 font-bold">
              <ShieldCheck className="w-3 h-3 mr-1" /> Live Sync
            </Badge>
          </div>
          <p className="hidden md:block text-[11px] text-slate-400 font-medium truncate">
            Courage Library Content &amp; Operations Studio
          </p>
        </div>
      </div>

      {/* Right: Quick Links, Notification & Admin Identity */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <Link
          href="/"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold text-xs transition"
          title="Open Live Public Platform"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Live Site</span>
        </Link>

        <Link
          href="/dashboard"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold text-xs transition"
        >
          <span>Student View</span>
        </Link>

        {/* Notifications Icon (Subtle) */}
        <div className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition">
          <Bell className="w-4 h-4" />
        </div>

        {/* Admin Profile Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-2xs">
            <User className="w-3.5 h-3.5" />
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-none truncate max-w-[140px]">
              {userEmail ? userEmail.split("@")[0] : "Admin"}
            </p>
            <p className="text-[10px] font-semibold text-emerald-600 leading-tight">Super Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
