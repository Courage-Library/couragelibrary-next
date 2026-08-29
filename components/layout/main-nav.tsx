"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  BookOpen,
  GraduationCap,
  PenTool,
  HelpCircle,
  FileCheck2,
  Brain,
  Zap,
  Swords,
  Users,
  MessageSquarePlus,
  Building2,
  Layers,
  Sparkles,
  ShoppingBag,
} from "lucide-react";

interface MainNavProps {
  isAuthenticated?: boolean;
}

export function MainNav({}: MainNavProps = {}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close dropdown on route change
  useEffect(() => {
    setOpenCategory(null);
  }, [pathname]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenCategory(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenCategory(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const toggleDropdown = (category: string) => {
    setOpenCategory(prev => (prev === category ? null : category));
  };

  // Active section detectors
  const isExamsActive = pathname.startsWith("/exams");
  const isPracticeActive =
    pathname.startsWith("/practice") ||
    pathname.startsWith("/mock-tests") ||
    pathname.startsWith("/flashcards") ||
    pathname.startsWith("/mistakes") ||
    pathname.startsWith("/battles");
  const isLearnActive =
    pathname.startsWith("/articles") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/descriptive");
  const isStoreActive = pathname.startsWith("/store");
  const isCommunityActive =
    pathname.startsWith("/community") || pathname.startsWith("/institutes");

  return (
    <nav
      ref={navRef}
      aria-label="Main Navigation"
      className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-slate-700"
    >
      {/* 1. EXAMS DROPDOWN */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={openCategory === "exams"}
          aria-haspopup="true"
          onClick={() => toggleDropdown("exams")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            isExamsActive
              ? "bg-blue-50 text-blue-700 border border-blue-200/70 shadow-xs"
              : openCategory === "exams"
              ? "bg-slate-100 text-slate-900"
              : "hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>Exams</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              openCategory === "exams" ? "rotate-180 text-blue-600" : "text-slate-400"
            }`}
          />
        </button>

        {openCategory === "exams" && (
          <div className="absolute top-full left-0 mt-1.5 w-64 rounded-2xl bg-white p-2 shadow-xl border border-slate-200/80 z-50 animate-in fade-in slide-in-from-top-1">
            <Link
              href="/exams"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-slate-800 hover:text-blue-700 font-semibold transition-colors"
            >
              <Layers className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <div className="text-xs font-bold">All Exam Categories</div>
                <div className="text-[10px] text-slate-500 font-normal">Browse 50+ government exams</div>
              </div>
            </Link>
            <div className="my-1 border-t border-slate-100" />
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 font-mono tracking-wider">POPULAR EXAMS</div>
            <Link href="/exams?category=ssc" className="block px-3 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-700 font-medium">
              SSC CGL & GD Exams
            </Link>
            <Link href="/exams?category=upsc" className="block px-3 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-700 font-medium">
              UPSC Civil Services & Mains
            </Link>
            <Link href="/exams?category=defence" className="block px-3 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-700 font-medium">
              Defence & Army Agniveer
            </Link>
            <Link href="/exams?category=railway" className="block px-3 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-700 font-medium">
              Railway NTPC & Group D
            </Link>
            <Link href="/exams?category=banking" className="block px-3 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-700 font-medium">
              Banking PO & Clerk
            </Link>
          </div>
        )}
      </div>

      {/* 2. PRACTICE DROPDOWN */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={openCategory === "practice"}
          aria-haspopup="true"
          onClick={() => toggleDropdown("practice")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            isPracticeActive
              ? "bg-blue-50 text-blue-700 border border-blue-200/70 shadow-xs"
              : openCategory === "practice"
              ? "bg-slate-100 text-slate-900"
              : "hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>Practice</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              openCategory === "practice" ? "rotate-180 text-blue-600" : "text-slate-400"
            }`}
          />
        </button>

        {openCategory === "practice" && (
          <div className="absolute top-full left-0 mt-1.5 w-64 rounded-2xl bg-white p-2 shadow-xl border border-slate-200/80 z-50 animate-in fade-in slide-in-from-top-1">
            <Link href="/practice" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Practice Questions</div>
                <div className="text-[10px] text-slate-500 font-normal">Topic-wise practice questions</div>
              </div>
            </Link>
            <Link href="/mock-tests" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <FileCheck2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Mock Tests</div>
                <div className="text-[10px] text-slate-500 font-normal">Full sectional exam tests</div>
              </div>
            </Link>
            <Link href="/mistakes" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <Brain className="w-4 h-4 text-rose-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Mistake Vault</div>
                <div className="text-[10px] text-slate-500 font-normal">Cognitive error remediation</div>
              </div>
            </Link>
            <Link href="/flashcards" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Flashcards & SRS</div>
                <div className="text-[10px] text-slate-500 font-normal">Active recall deck review</div>
              </div>
            </Link>
            <Link href="/battles" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <Swords className="w-4 h-4 text-purple-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">1v1 Quiz Battles</div>
                <div className="text-[10px] text-slate-500 font-normal">Live competitive arena</div>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* 3. LEARN DROPDOWN */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={openCategory === "learn"}
          aria-haspopup="true"
          onClick={() => toggleDropdown("learn")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            isLearnActive
              ? "bg-blue-50 text-blue-700 border border-blue-200/70 shadow-xs"
              : openCategory === "learn"
              ? "bg-slate-100 text-slate-900"
              : "hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>Learn</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              openCategory === "learn" ? "rotate-180 text-blue-600" : "text-slate-400"
            }`}
          />
        </button>

        {openCategory === "learn" && (
          <div className="absolute top-full left-0 mt-1.5 w-64 rounded-2xl bg-white p-2 shadow-xl border border-slate-200/80 z-50 animate-in fade-in slide-in-from-top-1">
            <Link href="/articles" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <BookOpen className="w-4 h-4 text-teal-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Knowledge Articles</div>
                <div className="text-[10px] text-slate-500 font-normal">Editorial study notes</div>
              </div>
            </Link>
            <Link href="/courses" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <GraduationCap className="w-4 h-4 text-indigo-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Structured Courses</div>
                <div className="text-[10px] text-slate-500 font-normal">Self-paced video modules</div>
              </div>
            </Link>
            <Link href="/descriptive" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <PenTool className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Descriptive Mains</div>
                <div className="text-[10px] text-slate-500 font-normal">Answer writing studio</div>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* 4. STORE TOP-LEVEL LINK */}
      <Link
        href="/store"
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
          isStoreActive
            ? "bg-blue-50 text-blue-700 border border-blue-200/70 shadow-xs"
            : "hover:bg-slate-100 hover:text-slate-900 text-slate-700"
        }`}
      >
        <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
        <span>Store</span>
      </Link>

      {/* 5. COMMUNITY DROPDOWN */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={openCategory === "community"}
          aria-haspopup="true"
          onClick={() => toggleDropdown("community")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            isCommunityActive
              ? "bg-blue-50 text-blue-700 border border-blue-200/70 shadow-xs"
              : openCategory === "community"
              ? "bg-slate-100 text-slate-900"
              : "hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>Community</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              openCategory === "community" ? "rotate-180 text-blue-600" : "text-slate-400"
            }`}
          />
        </button>

        {openCategory === "community" && (
          <div className="absolute top-full left-0 mt-1.5 w-64 rounded-2xl bg-white p-2 shadow-xl border border-slate-200/80 z-50 animate-in fade-in slide-in-from-top-1">
            <Link href="/community" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <Users className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Discussion Forum</div>
                <div className="text-[10px] text-slate-500 font-normal">Peer doubt resolution</div>
              </div>
            </Link>
            <Link href="/community/new" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <MessageSquarePlus className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Ask a Doubt</div>
                <div className="text-[10px] text-slate-500 font-normal">Post a new thread</div>
              </div>
            </Link>
            <Link href="/institutes" className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-800 transition-colors">
              <Building2 className="w-4 h-4 text-teal-500 shrink-0" />
              <div>
                <div className="text-xs font-bold">Coaching Institutes</div>
                <div className="text-[10px] text-slate-500 font-normal">Batches & partner portal</div>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* 6. PREMIUM LINK */}
      <Link
        href="/pricing"
        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ml-1.5 ${
          pathname === "/pricing"
            ? "bg-amber-100 text-amber-900 border border-amber-300/80"
            : "hover:bg-amber-50 text-amber-700"
        }`}
      >
        <Sparkles className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
        <span>Premium</span>
      </Link>
    </nav>
  );
}
