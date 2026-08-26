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

  // Collapsible group state - automatically expanded if on a mock test route
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
      label: "Overview & Control",
      href: "/admin/mock-tests-management",
      icon: ClipboardList,
      color: "text-slate-400",
    },
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
      label: "Hierarchical Bulk Import",
      href: "/admin/bulk-import",
      icon: FileUp,
      color: "text-rose-400",
    },
  ];

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BrandLogo size="sm" showText={false} />
          <span className="font-black text-sm tracking-tight">Admin Studio</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
          aria-label="Toggle Navigation Menu"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 md:static w-64 bg-slate-900 text-slate-300 p-5 space-y-6 shrink-0 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="space-y-6 overflow-y-auto pr-1">
          {/* Brand Header */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BrandLogo size="sm" showText={false} />
              <span className="font-extrabold text-white text-base tracking-tight">Admin Studio</span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 truncate">Staff: {userEmail}</p>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-4 text-xs font-semibold">
            {/* Dashboard Overview */}
            <div>
              <Link
                href="/admin"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors ${
                  pathname === "/admin"
                    ? "bg-indigo-600 text-white font-bold shadow-xs"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-indigo-400" /> Dashboard Overview
              </Link>
            </div>

            {/* PARENT GROUP: MOCK TEST MANAGEMENT */}
            <div className="space-y-1 pt-1">
              <div
                onClick={() => setIsMockGroupOpen(!isMockGroupOpen)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition select-none ${
                  isMockRouteActive
                    ? "bg-slate-800/80 text-white font-bold border border-slate-700"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardList className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-xs uppercase tracking-wider font-extrabold text-blue-300 font-mono">
                    Mock Test System
                  </span>
                </div>
                {isMockGroupOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>

              {/* NESTED CHILDREN */}
              {isMockGroupOpen && (
                <div className="pl-3 pr-1 py-1.5 space-y-0.5 border-l-2 border-slate-800 ml-3 mt-1">
                  {mockChildren.map((child) => {
                    const isActive = pathname === child.href;
                    const Icon = child.icon;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-colors ${
                          isActive
                            ? "bg-indigo-600 text-white font-bold shadow-xs"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-white" : child.color}`} />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* COURSES & LEARNING */}
            <div className="space-y-1 pt-2">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block mb-1">
                Courses &amp; Learning
              </span>
              <Link
                href="/admin/content"
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/content")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-pink-400" /> Articles &amp; Courses
              </Link>
              <Link
                href="/admin/descriptive"
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/descriptive")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <PenTool className="w-3.5 h-3.5 text-orange-400" /> Descriptive Mains
              </Link>
              <Link
                href="/admin/institutes"
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/institutes")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-cyan-400" /> Institutes
              </Link>
            </div>

            {/* USERS & MANAGEMENT */}
            <div className="space-y-1 pt-2">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block mb-1">
                Management
              </span>
              <Link
                href="/admin/users"
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/users")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Users className="w-3.5 h-3.5 text-sky-400" /> Users &amp; Profiles
              </Link>
              <Link
                href="/admin/community"
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/community")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Moderation Queue
              </Link>
              <Link
                href="/admin/billing"
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                  pathname.startsWith("/admin/billing")
                    ? "bg-indigo-600 text-white font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-yellow-400" /> Billing &amp; Plans
              </Link>
            </div>
          </nav>
        </div>

        {/* Footer Security Badge */}
        <div className="pt-4 border-t border-slate-800">
          <Badge variant="indigo" className="w-full justify-center text-[10px] bg-slate-800 text-slate-300 border-slate-700">
            <Shield className="w-3 h-3 mr-1 text-indigo-400" /> Protected Admin Session
          </Badge>
        </div>
      </aside>
    </>
  );
}
