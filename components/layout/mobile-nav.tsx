"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/auth/actions";
import {
  Menu,
  X,
  ChevronDown,
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
  Shield,
  LayoutDashboard,
  LogOut,
  CreditCard,
} from "lucide-react";

interface MobileNavProps {
  user: {
    email?: string;
    fullName?: string;
    isAdmin?: boolean;
  } | null;
}

export function MobileNav({ user }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const pathname = usePathname();

  // Close menu and reset accordions on route change
  useEffect(() => {
    setIsOpen(false);
    setExpandedCategory(null);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open & handle Escape key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleCategory = (cat: string) => {
    setExpandedCategory(prev => (prev === cat ? null : cat));
  };

  return (
    <div className="lg:hidden flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close main navigation menu" : "Open main navigation menu"}
        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-between animate-in fade-in">
          <div className="bg-white p-5 space-y-4 max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl rounded-b-3xl">
            <div className="space-y-1">
              {/* EXAMS ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "exams"}
                  onClick={() => toggleCategory("exams")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Exams</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedCategory === "exams" ? "rotate-180 text-blue-600" : ""}`} />
                </button>
                {expandedCategory === "exams" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/exams" className="flex items-center gap-2 py-1.5 font-bold text-blue-600">
                      <Layers className="w-3.5 h-3.5" /> All Exam Categories
                    </Link>
                    <Link href="/exams?category=ssc" className="block py-1">SSC CGL & GD</Link>
                    <Link href="/exams?category=upsc" className="block py-1">UPSC Civil Services</Link>
                    <Link href="/exams?category=defence" className="block py-1">Defence & Agniveer</Link>
                    <Link href="/exams?category=railway" className="block py-1">Railway NTPC</Link>
                    <Link href="/exams?category=banking" className="block py-1">Banking PO & Clerk</Link>
                  </div>
                )}
              </div>

              {/* PRACTICE ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "practice"}
                  onClick={() => toggleCategory("practice")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Practice</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedCategory === "practice" ? "rotate-180 text-blue-600" : ""}`} />
                </button>
                {expandedCategory === "practice" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/practice" className="flex items-center gap-2 py-1">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500" /> Practice Questions
                    </Link>
                    <Link href="/mock-tests" className="flex items-center gap-2 py-1">
                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Mock Tests
                    </Link>
                    <Link href="/mistakes" className="flex items-center gap-2 py-1">
                      <Brain className="w-3.5 h-3.5 text-rose-500" /> Mistake Vault
                    </Link>
                    <Link href="/flashcards" className="flex items-center gap-2 py-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" /> Flashcards & SRS
                    </Link>
                    <Link href="/battles" className="flex items-center gap-2 py-1">
                      <Swords className="w-3.5 h-3.5 text-purple-500" /> 1v1 Quiz Battles
                    </Link>
                  </div>
                )}
              </div>

              {/* LEARN ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "learn"}
                  onClick={() => toggleCategory("learn")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Learn</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedCategory === "learn" ? "rotate-180 text-blue-600" : ""}`} />
                </button>
                {expandedCategory === "learn" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/articles" className="flex items-center gap-2 py-1">
                      <BookOpen className="w-3.5 h-3.5 text-teal-500" /> Knowledge Articles
                    </Link>
                    <Link href="/courses" className="flex items-center gap-2 py-1">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-500" /> Structured Courses
                    </Link>
                    <Link href="/descriptive" className="flex items-center gap-2 py-1">
                      <PenTool className="w-3.5 h-3.5 text-amber-500" /> Descriptive Mains Studio
                    </Link>
                  </div>
                )}
              </div>

              {/* COMMUNITY ACCORDION */}
              <div className="border-b border-slate-100 pb-2">
                <button
                  type="button"
                  aria-expanded={expandedCategory === "community"}
                  onClick={() => toggleCategory("community")}
                  className="flex items-center justify-between w-full py-2.5 text-sm font-bold text-slate-900"
                >
                  <span>Community</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedCategory === "community" ? "rotate-180 text-blue-600" : ""}`} />
                </button>
                {expandedCategory === "community" && (
                  <div className="pl-3 py-1 space-y-1.5 text-xs font-medium text-slate-600 animate-in fade-in">
                    <Link href="/community" className="flex items-center gap-2 py-1">
                      <Users className="w-3.5 h-3.5 text-blue-500" /> Discussion Forum
                    </Link>
                    <Link href="/community/new" className="flex items-center gap-2 py-1">
                      <MessageSquarePlus className="w-3.5 h-3.5 text-emerald-500" /> Ask a Doubt
                    </Link>
                    <Link href="/institutes" className="flex items-center gap-2 py-1">
                      <Building2 className="w-3.5 h-3.5 text-teal-500" /> Coaching Institutes
                    </Link>
                  </div>
                )}
              </div>

              <Link href="/pricing" className="flex items-center gap-2 py-2.5 text-sm font-bold text-amber-600">
                <Sparkles className="w-4 h-4 fill-amber-400 text-amber-500" /> PRO Pricing
              </Link>

              {user?.isAdmin && (
                <Link href="/admin" className="flex items-center gap-2 py-2.5 text-sm font-bold text-indigo-600 border-t border-slate-100 pt-3">
                  <Shield className="w-4 h-4 text-indigo-600" /> Admin Studio
                </Link>
              )}
            </div>

            {/* Bottom Auth Actions */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              {user ? (
                <>
                  <Link href="/dashboard" className="flex items-center gap-2 py-2 text-xs font-bold text-slate-800">
                    <LayoutDashboard className="w-4 h-4 text-blue-600" /> Student Dashboard
                  </Link>
                  <Link href="/billing" className="flex items-center gap-2 py-2 text-xs font-bold text-slate-800">
                    <CreditCard className="w-4 h-4 text-amber-500" /> Billing & Invoices
                  </Link>
                  <form action={logoutAction}>
                    <Button variant="outline" size="sm" className="w-full justify-center text-rose-600 border-rose-200 hover:bg-rose-50 font-bold">
                      <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </Button>
                  </form>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link href="/auth/login" className="w-full">
                    <Button variant="outline" size="sm" className="w-full font-bold">Sign In</Button>
                  </Link>
                  <Link href="/auth/signup" className="w-full">
                    <Button variant="default" size="sm" className="w-full font-bold">Get Started</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
