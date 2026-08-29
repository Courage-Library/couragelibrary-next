"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
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
  Shield,
  Coins,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Menu,
  X,
} from "lucide-react";

interface Props {
  userEmail: string;
}

const MOCK_TEST_ROUTES = [
  "/admin/mock-tests-management",
  "/admin/categories",
  "/admin/patterns",
  "/admin/sections",
  "/admin/questions",
  "/admin/schedules",
  "/admin/mock-tests",
  "/admin/bulk-import",
];

export function AdminSidebar({ userEmail }: Props) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Check if current route is part of Mock Test Management
  const isMockRouteActive = MOCK_TEST_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Group collapsible state - defaults open when navigating mock routes
  const [isMockGroupOpen, setIsMockGroupOpen] = useState(true);

  useEffect(() => {
    if (isMockRouteActive) {
      setIsMockGroupOpen(true);
    }
  }, [pathname, isMockRouteActive]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const mockChildren = [
    {
      label: "Categories",
      href: "/admin/categories",
      icon: Layers,
    },
    {
      label: "Patterns",
      href: "/admin/patterns",
      icon: GitBranch,
    },
    {
      label: "Sections",
      href: "/admin/sections",
      icon: FolderTree,
    },
    {
      label: "Questions",
      href: "/admin/questions",
      icon: HelpCircle,
    },
    {
      label: "Schedules",
      href: "/admin/schedules",
      icon: Calendar,
    },
    {
      label: "Mock Tests",
      href: "/admin/mock-tests",
      icon: FileCheck2,
    },
    {
      label: "Bulk Import",
      href: "/admin/bulk-import",
      icon: FileUp,
    },
  ];

  return (
    <>
      {/* Mobile Top Bar — Appears ONLY on Mobile */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 text-white border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <BrandLogo size="sm" showText={false} />
          <span className="font-bold text-xs tracking-tight">Admin Studio</span>
          <Badge variant="indigo" className="text-[9px] px-1.5 py-0 bg-indigo-950 text-indigo-300 border-indigo-800 font-mono">
            PROD
          </Badge>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:text-white text-xs font-bold border border-slate-700"
          aria-label="Toggle Admin Navigation"
        >
          {isMobileOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
          <span>{isMobileOpen ? "Close" : "Menu"}</span>
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Panel — STRICTLY FIXED AT VIEWPORT TOP & NON-SCROLLING ON DESKTOP */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 md:z-20 w-[270px] h-[100dvh] max-h-[100dvh] bg-[#0F172A] text-slate-300 p-3.5 shrink-0 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 overflow-y-auto md:overflow-hidden ${
          isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {/* Studio Brand Header */}
          <div className="space-y-1 pb-2.5 border-b border-slate-800/80 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrandLogo size="sm" showText={false} />
                <span className="font-bold text-white text-sm tracking-tight">Admin Studio</span>
              </div>
              <Badge variant="indigo" className="text-[9px] px-1.5 py-0 bg-blue-950/80 text-blue-300 border-blue-800 font-mono font-bold">
                PROD
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-slate-400 truncate">
              {userEmail}
            </p>
          </div>

          {/* Navigation Groups */}
          <nav className="space-y-2 text-xs font-medium flex-1">
            {/* Dashboard Overview */}
            <div>
              <Link
                href="/admin"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname === "/admin"
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <LayoutDashboard className={`w-3.5 h-3.5 shrink-0 ${pathname === "/admin" ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Dashboard Overview</span>
              </Link>
            </div>

            {/* PARENT GROUP: MOCK TEST SYSTEM */}
            <div className="space-y-0.5">
              <div
                onClick={() => setIsMockGroupOpen(!isMockGroupOpen)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${
                  isMockRouteActive
                    ? "bg-slate-800/90 text-white font-semibold border border-slate-700/60"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className={`w-3.5 h-3.5 shrink-0 ${isMockRouteActive ? "text-blue-400" : "text-slate-400"}`} />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-blue-300 font-mono">
                    Mock Test System
                  </span>
                </div>
                {isMockGroupOpen ? (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                )}
              </div>

              {/* NESTED CHILDREN */}
              {isMockGroupOpen && (
                <div className="pl-2 pr-0.5 py-0.5 space-y-0.5 border-l border-slate-800 ml-2.5">
                  {mockChildren.map((child) => {
                    const isActive = pathname.startsWith(child.href);
                    const Icon = child.icon;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-colors ${
                          isActive
                            ? "bg-blue-600 text-white font-semibold shadow-xs"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <Icon className={`w-3 h-3 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* LEARNING CONTENT */}
            <div className="space-y-0.5">
              <span className="px-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Learning Content
              </span>
              <Link
                href="/admin/content"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/content")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <BookOpen className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/content") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Articles &amp; Courses</span>
              </Link>
              <Link
                href="/admin/descriptive"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/descriptive")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <PenTool className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/descriptive") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Descriptive Mains</span>
              </Link>
            </div>

            {/* OPERATIONS & USERS */}
            <div className="space-y-0.5">
              <span className="px-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Operations &amp; Users
              </span>
              <Link
                href="/admin/institutes"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/institutes")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Building2 className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/institutes") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Institutes</span>
              </Link>
              <Link
                href="/admin/users"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/users")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Users className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/users") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Users &amp; Sync</span>
              </Link>
              <Link
                href="/admin/rewards"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/rewards") || pathname.startsWith("/admin/gamification")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Coins className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/rewards") || pathname.startsWith("/admin/gamification") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Reward &amp; Store Management</span>
              </Link>
              <Link
                href="/admin/community"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/community")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/community") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Moderation</span>
              </Link>
              <Link
                href="/admin/billing"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/billing")
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <CreditCard className={`w-3.5 h-3.5 shrink-0 ${pathname.startsWith("/admin/billing") ? "text-white" : "text-slate-400"}`} />
                <span className="text-[11px]">Billing &amp; Plans</span>
              </Link>
            </div>
          </nav>
        </div>

        {/* Footer Session Badge — Pinned at Bottom */}
        <div className="pt-2 border-t border-slate-800/80 shrink-0">
          <Badge variant="indigo" className="w-full justify-center text-[9px] py-0.5 bg-slate-800 text-slate-300 border-slate-700 font-mono font-bold">
            <Shield className="w-2.5 h-2.5 mr-1 text-blue-400" /> Session Protected
          </Badge>
        </div>
      </aside>
    </>
  );
}
