"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Coins,
  Bell,
  Flame,
  User,
  LogOut,
  LayoutDashboard,
  Shield,
  CreditCard,
  ChevronDown,
  Menu,
  X,
  Layers,
  HelpCircle,
  FileCheck2,
  Brain,
  Zap,
  Swords,
  BookOpen,
  GraduationCap,
  PenTool,
  Users,
  MessageSquarePlus,
  Building2,
  Sparkles,
  ShoppingBag,
} from "lucide-react";

export interface HeaderUser {
  email?: string;
  fullName?: string;
  isAdmin?: boolean;
}

interface HeaderControlsProps {
  user: HeaderUser | null;
  coins?: number;
  streak?: number;
}

export function HeaderControls({ user, coins = 0, streak = 0 }: HeaderControlsProps) {
  // Single source of truth for active menu overlay: null | "mobile" | "profile"
  const [openOverlay, setOpenOverlay] = useState<null | "mobile" | "profile">(null);
  const [mounted, setMounted] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const pathname = usePathname();
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close overlays on route change
  useEffect(() => {
    setOpenOverlay(null);
    setExpandedCategory(null);
  }, [pathname]);

  // Handle body scroll locking when mobile menu is open & Escape key to dismiss
  useEffect(() => {
    if (openOverlay === "mobile") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenOverlay(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openOverlay]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // If clicking inside profile dropdown or mobile hamburger button, let their onClick handlers manage state
      if (
        (profileDropdownRef.current && profileDropdownRef.current.contains(target)) ||
        (mobileButtonRef.current && mobileButtonRef.current.contains(target))
      ) {
        return;
      }
      setOpenOverlay(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleMobileNav = () => {
    setOpenOverlay((prev) => (prev === "mobile" ? null : "mobile"));
  };

  const toggleProfileDropdown = () => {
    setOpenOverlay((prev) => (prev === "profile" ? null : "profile"));
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  };

  const isMobileOpen = openOverlay === "mobile";
  const isProfileOpen = openOverlay === "profile";

  return (
    <div className="flex items-center gap-3">
      {/* Right User Utilities */}
      {user ? (
        <div className="flex items-center gap-3">
          {/* Streak Badge */}
          <div
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs"
            title="Daily Practice Streak"
          >
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>{streak}</span>
          </div>

          {/* Coin Balance Badge */}
          <Link
            href="/wallet"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs hover:bg-blue-100/80 transition-colors cursor-pointer"
            title="View CL Wallet & Rewards"
          >
            <Coins className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
            <span>{coins} CL</span>
          </Link>

          {/* Notifications Link */}
          <Link
            href="/notifications"
            aria-label="View notifications"
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Notifications"
          >
            <Bell className="w-4.5 h-4.5" />
          </Link>

          {/* User Profile Dropdown */}
          <div ref={profileDropdownRef} className="relative pl-2 border-l border-slate-200">
            <button
              type="button"
              aria-expanded={isProfileOpen}
              aria-haspopup="true"
              aria-label="User Profile Menu"
              onClick={toggleProfileDropdown}
              className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {user.fullName?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  isProfileOpen ? "rotate-180 text-blue-600" : ""
                }`}
              />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200/80 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-xs font-extrabold text-slate-900 truncate">
                    {user.fullName || "Student User"}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{user.email}</div>
                </div>

                <div className="py-1">
                  <Link
                    href="/dashboard"
                    onClick={() => setOpenOverlay(null)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4 text-blue-600 shrink-0" /> Student Dashboard
                  </Link>
                  <Link
                    href="/wallet"
                    onClick={() => setOpenOverlay(null)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <Coins className="w-4 h-4 text-amber-500 shrink-0" /> CL Wallet ({coins} CL)
                  </Link>
                  <Link
                    href="/billing"
                    onClick={() => setOpenOverlay(null)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-amber-500 shrink-0" /> Billing & Invoices
                  </Link>

                  {user.isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setOpenOverlay(null)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-indigo-600 shrink-0" /> Admin Studio
                    </Link>
                  )}
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" /> Sign Out
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm" className="font-semibold text-slate-700">
              Sign In
            </Button>
          </Link>
          <Link href="/auth/signup">
            <Button variant="default" size="sm" className="font-bold shadow-xs">
              Get Started
            </Button>
          </Link>
        </div>
      )}

      {/* Mobile Hamburger Trigger */}
      <div className="lg:hidden flex items-center">
        <button
          ref={mobileButtonRef}
          type="button"
          onClick={toggleMobileNav}
          aria-expanded={isMobileOpen}
          aria-label={isMobileOpen ? "Close main navigation menu" : "Open main navigation menu"}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Navigation Modal Panel (Portaled to document.body to avoid backdrop-filter trapping) */}
      {isMobileOpen && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 top-16 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-start animate-in fade-in">
          {/* Backdrop dismiss touch target */}
          <div
            className="fixed inset-0 top-16 -z-10"
            onClick={() => setOpenOverlay(null)}
            aria-hidden="true"
          />

          <div className="bg-white p-5 space-y-4 max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl rounded-b-3xl border-b border-slate-200/80">
            <div className="space-y-1">
              {/* 1. EXAMS ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "exams"}
                  onClick={() => toggleCategory("exams")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Exams</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      expandedCategory === "exams" ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {expandedCategory === "exams" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link
                      href="/exams"
                      onClick={() => setOpenOverlay(null)}
                      className="flex items-center gap-2 py-1.5 font-bold text-blue-600"
                    >
                      <Layers className="w-3.5 h-3.5" /> All Exam Categories
                    </Link>
                    <Link href="/exams?category=ssc" onClick={() => setOpenOverlay(null)} className="block py-1">
                      SSC CGL & GD
                    </Link>
                    <Link href="/exams?category=upsc" onClick={() => setOpenOverlay(null)} className="block py-1">
                      UPSC Civil Services
                    </Link>
                    <Link href="/exams?category=defence" onClick={() => setOpenOverlay(null)} className="block py-1">
                      Defence & Agniveer
                    </Link>
                    <Link href="/exams?category=railway" onClick={() => setOpenOverlay(null)} className="block py-1">
                      Railway NTPC
                    </Link>
                    <Link href="/exams?category=banking" onClick={() => setOpenOverlay(null)} className="block py-1">
                      Banking PO & Clerk
                    </Link>
                  </div>
                )}
              </div>

              {/* 2. PRACTICE ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "practice"}
                  onClick={() => toggleCategory("practice")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Practice</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      expandedCategory === "practice" ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {expandedCategory === "practice" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/practice" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500" /> Practice Questions
                    </Link>
                    <Link href="/mock-tests" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Mock Tests
                    </Link>
                    <Link href="/mistakes" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <Brain className="w-3.5 h-3.5 text-rose-500" /> Mistake Vault
                    </Link>
                    <Link href="/flashcards" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" /> Flashcards & SRS
                    </Link>
                    <Link href="/battles" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <Swords className="w-3.5 h-3.5 text-purple-500" /> 1v1 Quiz Battles
                    </Link>
                  </div>
                )}
              </div>

              {/* 3. LEARN ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "learn"}
                  onClick={() => toggleCategory("learn")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Learn</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      expandedCategory === "learn" ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {expandedCategory === "learn" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/articles" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <BookOpen className="w-3.5 h-3.5 text-teal-500" /> Knowledge Articles
                    </Link>
                    <Link href="/courses" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-500" /> Structured Courses
                    </Link>
                    <Link href="/descriptive" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <PenTool className="w-3.5 h-3.5 text-amber-500" /> Descriptive Mains Studio
                    </Link>
                  </div>
                )}
              </div>

              {/* 4. COMMUNITY ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "community"}
                  onClick={() => toggleCategory("community")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Community</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      expandedCategory === "community" ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {expandedCategory === "community" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/community" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <Users className="w-3.5 h-3.5 text-blue-500" /> Discussion Forum
                    </Link>
                    <Link href="/community/new" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <MessageSquarePlus className="w-3.5 h-3.5 text-emerald-500" /> Ask a Doubt
                    </Link>
                    <Link href="/institutes" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <Building2 className="w-3.5 h-3.5 text-teal-500" /> Coaching Institutes
                    </Link>
                  </div>
                )}
              </div>

              {/* 5. STORE ACCORDION (Rewards + Premium) */}
              <div className="pb-1">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "store"}
                  onClick={() => toggleCategory("store")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-600" /> Store
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      expandedCategory === "store" ? "rotate-180 text-blue-600" : ""
                    }`}
                  />
                </button>
                {expandedCategory === "store" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/store" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-600" /> Rewards
                    </Link>
                    <Link href="/pricing" onClick={() => setOpenOverlay(null)} className="flex items-center gap-2 py-1">
                      <Sparkles className="w-3.5 h-3.5 fill-amber-400 text-amber-500" /> Premium
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}