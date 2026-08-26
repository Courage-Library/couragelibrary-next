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
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Menu,
  X,
} from "lucide-react";

interface Props {
  userEmail: string;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
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

export function AdminSidebar({ userEmail, isMobileOpen: controlledMobileOpen, setIsMobileOpen: setControlledMobileOpen }: Props) {
  const pathname = usePathname();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const isMobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  const setIsMobileOpen = setControlledMobileOpen !== undefined ? setControlledMobileOpen : setInternalMobileOpen;

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
  }, [pathname, setIsMobileOpen]);

  const mockChildren = [
    {
      label: "Categories (Exams)",
      href: "/admin/categories",
      icon: Layers,
      color: "text-blue-400",
    },
    {
      label: "Patterns (Blueprints)",
      href: "/admin/patterns",
      icon: GitBranch,
      color: "text-indigo-400",
    },
    {
      label: "Sections (Subjects)",
      href: "/admin/sections",
      icon: FolderTree,
      color: "text-teal-400",
    },
    {
      label: "Question Bank",
      href: "/admin/questions",
      icon: HelpCircle,
      color: "text-emerald-400",
    },
    {
      label: "Exam Schedules",
      href: "/admin/schedules",
      icon: Calendar,
      color: "text-purple-400",
    },
    {
      label: "Mock Test Papers",
      href: "/admin/mock-tests",
      icon: FileCheck2,
      color: "text-amber-400",
    },
    {
      label: "Bulk Question Import",
      href: "/admin/bulk-import",
      icon: FileUp,
      color: "text-rose-400",
    },
  ];

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-3.5 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BrandLogo size="sm" showText={false} />
          <span className="font-black text-xs tracking-tight">Admin Studio</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
          aria-label="Toggle Navigation Menu"
        >
          {isMobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Panel — STRICTLY FIXED & NON-SCROLLING ON DESKTOP */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 md:sticky md:top-0 w-64 h-[100dvh] max-h-[100dvh] bg-slate-900 text-slate-300 p-4 shrink-0 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 overflow-y-auto md:overflow-hidden ${
          isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="space-y-3.5 flex-1 min-h-0 flex flex-col">
          {/* Brand Header */}
          <div className="space-y-0.5 pb-2 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrandLogo size="sm" showText={false} />
                <span className="font-black text-white text-sm tracking-tight">Admin Studio</span>
              </div>
              <Badge variant="indigo" className="text-[9px] px-1.5 py-0 bg-indigo-950 text-indigo-300 border-indigo-800">
                PROD
              </Badge>
            </div>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {userEmail}
            </p>
          </div>

          {/* Navigation Items — Compact, Densely Grouped, Fits 100dvh Perfectly */}
          <nav className="space-y-2.5 text-xs font-semibold flex-1">
            {/* Dashboard Overview */}
            <div>
              <Link
                href="/admin"
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  pathname === "/admin"
                    ? "bg-indigo-600 text-white font-bold shadow-xs"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-[11px]">Dashboard Overview</span>
              </Link>
            </div>

            {/* PARENT GROUP: MOCK TEST MANAGEMENT */}
            <div className="space-y-0.5">
              <div
                onClick={() => setIsMockGroupOpen(!isMockGroupOpen)}
                className={`flex items-center justify-between px-2.5 py-1 rounded-lg cursor-pointer transition select-none ${
                  isMockRouteActive
                    ? "bg-slate-800/90 text-white font-bold border border-slate-700"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider font-black text-blue-300 font-mono">
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
                            ? "bg-indigo-600 text-white font-bold shadow-xs"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <Icon className={`w-3 h-3 shrink-0 ${isActive ? "text-white" : child.color}`} />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* COURSES & LEARNING */}
            <div className="space-y-0.5">
              <span className="px-2.5 text-[9px] font-black uppercase tracking-wider text-slate-500 font-mono block">
                Learning Content
              </span>
              <Link
                href="/admin/content"
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/content")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <BookOpen className="w-3 h-3 text-pink-400 shrink-0" />
                <span className="text-[11px]">Articles &amp; Courses</span>
              </Link>
              <Link
                href="/admin/descriptive"
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/descriptive")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <PenTool className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="text-[11px]">Descriptive Mains</span>
              </Link>
            </div>

            {/* USERS & MONETIZATION */}
            <div className="space-y-0.5">
              <span className="px-2.5 text-[9px] font-black uppercase tracking-wider text-slate-500 font-mono block">
                Operations &amp; Users
              </span>
              <Link
                href="/admin/institutes"
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/institutes")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Building2 className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="text-[11px]">Institutes</span>
              </Link>
              <Link
                href="/admin/users"
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/users")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Users className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="text-[11px]">Users &amp; Sync</span>
              </Link>
              <Link
                href="/admin/community"
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/community")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="text-[11px]">Moderation</span>
              </Link>
              <Link
                href="/admin/billing"
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                  pathname.startsWith("/admin/billing")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <CreditCard className="w-3 h-3 text-yellow-400 shrink-0" />
                <span className="text-[11px]">Billing &amp; Plans</span>
              </Link>
            </div>
          </nav>
        </div>

        {/* Footer Security Badge */}
        <div className="pt-2 border-t border-slate-800 shrink-0">
          <Badge variant="indigo" className="w-full justify-center text-[9px] py-0.5 bg-slate-800 text-slate-300 border-slate-700 font-mono">
            <Shield className="w-2.5 h-2.5 mr-1 text-indigo-400" /> Session Protected
          </Badge>
        </div>
      </aside>
    </>
  );
}
