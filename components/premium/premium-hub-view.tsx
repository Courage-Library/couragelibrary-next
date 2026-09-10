"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Zap,
  Target,
  Clock,
  BookOpen,
  Award,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Lock,
  CheckCircle2,
  TrendingUp,
  Brain,
  History,
  Layers,
  FileCheck2,
  Filter,
  Play,
  ArrowRight,
  X,
  Sliders,
  Flame,
  ShieldCheck,
  Check,
  AlertCircle,
  HelpCircle,
  BarChart3,
} from "lucide-react";
import {
  PremiumHubData,
  PremiumHubSubject,
  CuratedMockTestItem,
  RecentPremiumAttempt,
} from "@/services/premium-hub.service";
import {
  generateTopicTestAction,
  generateWeakAreaTestAction,
  generateMistakeRevisionTestAction,
  generatePersonalizedMockAction,
  generatePyqSimulationAction,
} from "@/app/premium/actions";

interface PremiumHubViewProps {
  initialData: PremiumHubData;
}

export function PremiumHubView({ initialData }: PremiumHubViewProps) {
  const router = useRouter();
  const [data, setData] = useState<PremiumHubData>(initialData);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    initialData.selectedExam?.id || initialData.availableExams[0]?.id || ""
  );

  // Active Modals state
  const [activeModal, setActiveModal] = useState<
    "topic" | "pyq" | "weak_area" | "mistake" | "personalized" | "upsell" | null
  >(null);

  // Filter tab for Curated Mocks
  const [curatedFilter, setCuratedFilter] = useState<string>("ALL");

  // Error & Status state
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Topic Test Modal Form State
  const [topicForm, setTopicForm] = useState<{
    subjectId: string;
    topicIds: string[];
    questionCount: number;
    difficulty: "easy" | "medium" | "hard" | "mixed";
    language: "en" | "hi";
  }>({
    subjectId: "",
    topicIds: [],
    questionCount: 20,
    difficulty: "mixed",
    language: "en",
  });

  // PYQ Modal Form State
  const [pyqForm, setPyqForm] = useState<{
    year: number;
    shift: string;
    language: "en" | "hi";
  }>({
    year: 2024,
    shift: "Morning Shift",
    language: "en",
  });

  // Weak Area Form State
  const [weakAreaForm, setWeakAreaForm] = useState<{
    questionCount: number;
    difficulty: "easy" | "medium" | "hard" | "mixed";
    language: "en" | "hi";
  }>({
    questionCount: 25,
    difficulty: "mixed",
    language: "en",
  });

  // Mistake Revision Form State
  const [mistakeForm, setMistakeForm] = useState<{
    questionCount: number;
    language: "en" | "hi";
  }>({
    questionCount: Math.min(25, Math.max(10, data.mistakeVaultCount || 10)),
    language: "en",
  });

  // Personalized Mock Form State
  const [personalizedForm, setPersonalizedForm] = useState<{
    questionCount: number;
    weakRatio: number;
    difficulty: "easy" | "medium" | "hard" | "mixed";
    language: "en" | "hi";
  }>({
    questionCount: 50,
    weakRatio: 0.5,
    difficulty: "mixed",
    language: "en",
  });

  const isEntitled = data.entitlement.hasAccess;

  const handleExamChange = (examId: string) => {
    setSelectedExamId(examId);
    startTransition(() => {
      router.push(`/premium?examId=${examId}`);
    });
  };

  // --------------------------------------------------------------------------
  // GENERATOR HANDLERS
  // --------------------------------------------------------------------------

  const handleGenerateTopicTest = async () => {
    if (!isEntitled) {
      setActiveModal("upsell");
      return;
    }
    if (topicForm.topicIds.length === 0) {
      setActionError("Please select at least one topic for your test.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await generateTopicTestAction({
        examId: selectedExamId,
        subjectId: topicForm.subjectId || undefined,
        topicIds: topicForm.topicIds,
        questionCount: topicForm.questionCount,
        difficulty: topicForm.difficulty,
        language: topicForm.language,
      });

      if (res.success && res.data?.redirectUrl) {
        setActiveModal(null);
        router.push(res.data.redirectUrl);
      } else {
        setActionError(res.error || "Failed to generate topic test.");
      }
    });
  };

  const handleGenerateWeakAreaTest = async () => {
    if (!isEntitled) {
      setActiveModal("upsell");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await generateWeakAreaTestAction({
        examId: selectedExamId,
        questionCount: weakAreaForm.questionCount,
        difficulty: weakAreaForm.difficulty,
        language: weakAreaForm.language,
      });

      if (res.success && res.data?.redirectUrl) {
        setActiveModal(null);
        router.push(res.data.redirectUrl);
      } else {
        setActionError(res.error || "Failed to generate weak area test.");
      }
    });
  };

  const handleGenerateMistakeRevisionTest = async () => {
    if (!isEntitled) {
      setActiveModal("upsell");
      return;
    }
    if (data.mistakeVaultCount === 0) {
      setActionError("You don't have any unreviewed mistakes in your Mistake Vault yet.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await generateMistakeRevisionTestAction({
        examId: selectedExamId,
        questionCount: mistakeForm.questionCount,
        language: mistakeForm.language,
      });

      if (res.success && res.data?.redirectUrl) {
        setActiveModal(null);
        router.push(res.data.redirectUrl);
      } else {
        setActionError(res.error || "Failed to generate mistake revision test.");
      }
    });
  };

  const handleGeneratePersonalizedMock = async () => {
    if (!isEntitled) {
      setActiveModal("upsell");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await generatePersonalizedMockAction({
        examId: selectedExamId,
        questionCount: personalizedForm.questionCount,
        blueprintConfig: {
          weakAreasRatio: personalizedForm.weakRatio,
        },
        difficulty: personalizedForm.difficulty,
        language: personalizedForm.language,
      });

      if (res.success && res.data?.redirectUrl) {
        setActiveModal(null);
        router.push(res.data.redirectUrl);
      } else {
        setActionError(res.error || "Failed to generate personalized mock.");
      }
    });
  };

  const handleGeneratePyqSimulation = async () => {
    if (!isEntitled) {
      setActiveModal("upsell");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const res = await generatePyqSimulationAction({
        examId: selectedExamId,
        year: pyqForm.year,
        shift: pyqForm.shift,
        language: pyqForm.language,
      });

      if (res.success && res.data?.redirectUrl) {
        setActiveModal(null);
        router.push(res.data.redirectUrl);
      } else {
        setActionError(res.error || "Failed to generate PYQ simulation.");
      }
    });
  };

  // Quota helper
  const getQuotaFor = (key: string) => {
    return data.quotas.find((q) => q.quotaKey === key);
  };

  const filteredCuratedMocks = data.curatedMocks.filter((m) => {
    if (curatedFilter === "ALL") return true;
    return m.testType === curatedFilter;
  });

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* -------------------------------------------------------------------- */}
      {/* 1. TOP HERO & CANDIDATE BANNER */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Top Bar: Title & Target Exam Switcher */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  <Sparkles className="w-3.5 h-3.5 fill-amber-300" />
                  COURAGE PREMIUM PRACTICE
                </span>
                {data.globalStatus.isMaintenanceMode && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/40">
                    <AlertTriangle className="w-3 h-3 text-amber-300" />
                    Maintenance Active
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Candidate Premium Hub
              </h1>
              <p className="text-sm text-indigo-200/80 mt-1">
                AI-balanced dynamic generators, full-length simulations, PYQ drills, and targeted error remediation.
              </p>
            </div>

            {/* Target Exam Dropdown Selector */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15">
              <Target className="w-4 h-4 text-indigo-300" />
              <div>
                <div className="text-[10px] uppercase font-bold text-indigo-200 tracking-wider">Target Exam</div>
                <select
                  value={selectedExamId}
                  onChange={(e) => handleExamChange(e.target.value)}
                  className="bg-transparent text-sm font-bold text-white border-none outline-none cursor-pointer focus:ring-0 pr-2"
                >
                  {data.availableExams.map((exam) => (
                    <option key={exam.id} value={exam.id} className="text-slate-900 font-medium">
                      {exam.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Entitlement & Stats Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {/* Status Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-indigo-200/70 font-medium">Membership Status</div>
                <div className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5">
                  {isEntitled ? (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>{data.entitlement.planName || "Premium Active"}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-300">Free Tier</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] text-indigo-300/80 mt-1">
                  {isEntitled && data.entitlement.daysRemaining !== null
                    ? `${data.entitlement.daysRemaining} days validity remaining`
                    : !isEntitled
                    ? "Upgrade to unlock all 8 modes"
                    : "Lifetime Access"}
                </div>
              </div>
              {!isEntitled && (
                <Link
                  href="/pricing"
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-bold text-xs shadow-md hover:brightness-105 transition-all"
                >
                  Upgrade
                </Link>
              )}
            </div>

            {/* Tests Taken */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-xs text-indigo-200/70 font-medium">Completed Tests</div>
              <div className="text-2xl font-black text-white mt-0.5">
                {data.stats.completedTests}
              </div>
              <div className="text-[11px] text-indigo-300/80 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Across all premium categories</span>
              </div>
            </div>

            {/* Average Accuracy */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-xs text-indigo-200/70 font-medium">Average Accuracy</div>
              <div className="text-2xl font-black text-white mt-0.5">
                {data.stats.averageAccuracy}%
              </div>
              <div className="text-[11px] text-indigo-300/80 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-indigo-400" />
                <span>Best score: {data.stats.bestScore} marks</span>
              </div>
            </div>

            {/* Mistake Vault Status */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-xs text-indigo-200/70 font-medium">Mistake Vault</div>
              <div className="text-2xl font-black text-rose-300 mt-0.5">
                {data.mistakeVaultCount}
              </div>
              <div className="text-[11px] text-indigo-300/80 mt-1 flex items-center gap-1">
                <Brain className="w-3 h-3 text-rose-400" />
                <span>Unmastered errors ready for revision</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-2 space-y-8">
        {/* -------------------------------------------------------------------- */}
        {/* 2. IN-PROGRESS ACTIVE TEST BANNER (RESUME) */}
        {/* -------------------------------------------------------------------- */}
        {data.activeAttempt && (
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-amber-500/20 border border-amber-400/40 animate-pulse-subtle">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                  <Play className="w-6 h-6 fill-white text-white translate-x-0.5" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-black/20 text-white uppercase tracking-wider mb-1">
                    <Flame className="w-3.5 h-3.5 fill-amber-200 text-amber-200" />
                    Active Attempt In-Progress
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white">
                    {data.activeAttempt.title}
                  </h3>
                  <p className="text-xs text-amber-100 mt-0.5">
                    Started at {new Date(data.activeAttempt.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • Duration: {data.activeAttempt.durationMinutes} mins
                  </p>
                </div>
              </div>

              <Link
                href={`/mock-tests/${data.activeAttempt.mockTestId}/take`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white text-slate-900 font-extrabold text-sm shadow-lg hover:bg-amber-50 hover:scale-105 active:scale-95 transition-all"
              >
                <span>Resume Test Now</span>
                <ChevronRight className="w-4 h-4 text-slate-900" />
              </Link>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------- */}
        {/* 3. ERROR BANNER */}
        {/* -------------------------------------------------------------------- */}
        {actionError && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-800 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-bold">Action Failed</div>
              <div className="text-xs mt-0.5">{actionError}</div>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-rose-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* -------------------------------------------------------------------- */}
        {/* 4. THE 8 PRACTICE MODES GRID */}
        {/* -------------------------------------------------------------------- */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Premium Practice Modes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Target your exact weak areas, simulate full exam shifts, or take precision topic drills.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. FULL-LENGTH MOCKS */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("FULL_LENGTH");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Full-Length Mocks
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Real exam interface, exact blueprint marks, negative marking, and all-India rank leaderboard.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    const firstMock = data.curatedMocks.find((m) => m.testType === "FULL_LENGTH");
                    if (firstMock) {
                      router.push(`/mock-tests/${firstMock.id}/take`);
                    } else {
                      setCuratedFilter("FULL_LENGTH");
                      const el = document.getElementById("curated-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs transition-colors"
                >
                  <span>Select Full Mock</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2. PYQ PAPERS & SHIFTS */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <History className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("PYQ");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  PYQ Exam Shifts
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Practice authentic past year official question papers year-wise and shift-wise with detailed solutions.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setActiveModal("pyq")}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs transition-colors"
                >
                  <span>Simulate PYQ Shift</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 3. TOPIC PRECISION DRILLS */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group border-l-4 border-l-emerald-500">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <Layers className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("TOPIC");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center gap-1.5">
                  <span>Custom Topic Tests</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                    AI
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Pick specific topics, question counts, and difficulty levels to generate a custom instant test.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setActiveModal("topic")}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Configure Topic Test</span>
                </button>
              </div>
            </div>

            {/* 4. WEAK AREA ACCELERATOR */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group border-l-4 border-l-amber-500">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <Target className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("WEAK_AREA");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-600 transition-colors flex items-center gap-1.5">
                  <span>Weak Area Drills</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800">
                    AUTO
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Automatically extracts questions from topics where your historical accuracy is below 60%.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setActiveModal("weak_area")}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition-colors"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Generate Weak Area Drill</span>
                </button>
              </div>
            </div>

            {/* 5. MISTAKE VAULT REVISION */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group border-l-4 border-l-rose-500">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                    <Brain className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("MISTAKE_REVISION");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-rose-600 transition-colors flex items-center gap-1.5">
                  <span>Mistake Revision Test</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800">
                    {data.mistakeVaultCount} Ready
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Turn past incorrect and unreviewed questions directly into a targeted re-test to solidify retention.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setActiveModal("mistake")}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-test Mistakes</span>
                </button>
              </div>
            </div>

            {/* 6. AI PERSONALIZED MOCK */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group border-l-4 border-l-purple-500">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    <Sliders className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("PERSONALIZED");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-600 transition-colors flex items-center gap-1.5">
                  <span>Personalized Mock</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-800">
                    SMART
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Combines full syllabus coverage with weighted emphasis on your identified cognitive error areas.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setActiveModal("personalized")}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure AI Mock</span>
                </button>
              </div>
            </div>

            {/* 7. SECTIONAL DRILLS */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                    <Zap className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("SECTIONAL");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-600 transition-colors">
                  Sectional Speed Drills
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  High-speed timed section tests (Quantitative, Reasoning, English, General Awareness) for timing mastery.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setCuratedFilter("SECTIONAL");
                    const el = document.getElementById("curated-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-teal-600 text-white font-bold text-xs transition-colors"
                >
                  <span>View Sectionals</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 8. CHALLENGE TESTS */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
                    <Flame className="w-5 h-5" />
                  </div>
                  {(() => {
                    const q = getQuotaFor("CHALLENGE");
                    return (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {q?.isUnlimited ? "Unlimited" : `${q?.quotaRemaining ?? 0} left`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-red-600 transition-colors">
                  Hard Challenge Tests
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Curated extreme difficulty tests designed to stretch your problem-solving limits for top rankers.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setCuratedFilter("CHALLENGE");
                    const el = document.getElementById("curated-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 hover:bg-red-600 text-white font-bold text-xs transition-colors"
                >
                  <span>Explore Challenges</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------------- */}
        {/* 5. CURATED TESTS GALLERY */}
        {/* -------------------------------------------------------------------- */}
        <div id="curated-section" className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Curated Tests & Official Papers
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Full-length mocks, previous year questions, and curated series for {data.selectedExam?.name || "your target exam"}.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "ALL", label: "All Tests" },
                { id: "FULL_LENGTH", label: "Full Length" },
                { id: "PYQ", label: "PYQ Papers" },
                { id: "SECTIONAL", label: "Sectionals" },
                { id: "CHALLENGE", label: "Challenge" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCuratedFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    curatedFilter === tab.id
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredCuratedMocks.length === 0 ? (
            <div className="text-center py-12 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">No curated tests found for this filter</div>
              <p className="text-xs text-slate-400 mt-1">
                Try generating a custom dynamic test above or switch categories.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCuratedMocks.map((mock) => (
                <div
                  key={mock.id}
                  className="bg-slate-50/50 hover:bg-white rounded-2xl p-4 border border-slate-200/80 hover:border-indigo-200 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {mock.testType.replace("_", " ")}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {mock.durationMinutes} mins
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 line-clamp-2">
                      {mock.title}
                    </h4>

                    {mock.seriesTitle && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Series: <span className="font-medium text-slate-700">{mock.seriesTitle}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200/60">
                      <span>{mock.totalQuestions} Questions</span>
                      <span>•</span>
                      <span>{mock.totalMarks} Marks</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-2">
                    {mock.userAttemptStatus === "in_progress" ? (
                      <Link
                        href={`/mock-tests/${mock.id}/take`}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-xs transition-colors"
                      >
                        <Play className="w-3 h-3 fill-slate-950" />
                        <span>Resume Test</span>
                      </Link>
                    ) : mock.userAttemptStatus === "completed" ? (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/mock-tests/${mock.latestAttemptId || mock.id}/result`}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs border border-emerald-200/70 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Score: {mock.latestScore ?? "Done"}</span>
                        </Link>
                        <Link
                          href={`/mock-tests/${mock.id}/take`}
                          className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                          title="Retake Test"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    ) : (
                      <Link
                        href={`/mock-tests/${mock.id}/take`}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-xs transition-colors"
                      >
                        <span>Start Test</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------------- */}
        {/* 6. CANDIDATE RECENT ATTEMPTS & PERFORMANCE */}
        {/* -------------------------------------------------------------------- */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Your Practice History
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Past evaluated attempts, accuracy records, and in-depth question-by-question analysis.
              </p>
            </div>
          </div>

          {data.recentAttempts.length === 0 ? (
            <div className="text-center py-10 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
              <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">No completed tests yet</div>
              <p className="text-xs text-slate-400 mt-1">
                Complete your first mock test or topic drill above to see your analytics scorecard.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase">
                    <th className="py-2.5 px-3">Test Title</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Score</th>
                    <th className="py-2.5 px-3">Accuracy</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentAttempts.map((att) => (
                    <tr key={att.attemptId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {att.title}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {att.testType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(att.submittedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {att.score != null ? `${att.score} / ${att.totalScore || 100}` : "—"}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {att.accuracyPercentage != null ? `${att.accuracyPercentage}%` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          href={`/mock-tests/${att.attemptId}/result`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors"
                        >
                          <span>Analysis</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 7. MODALS */}
      {/* -------------------------------------------------------------------- */}

      {/* 7.1 TOPIC TEST MODAL */}
      {activeModal === "topic" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Custom Topic Test</h3>
                  <p className="text-[11px] text-slate-500">Select topics to generate an instant drill</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Subject Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                <select
                  value={topicForm.subjectId}
                  onChange={(e) => {
                    setTopicForm({
                      ...topicForm,
                      subjectId: e.target.value,
                      topicIds: [],
                    });
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">All Subjects</option>
                  {data.subjectsWithTopics.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topics Multi-Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Topics ({topicForm.topicIds.length} selected)
                </label>
                <div className="max-h-44 overflow-y-auto p-2 rounded-xl border border-slate-200 space-y-1 bg-slate-50/50">
                  {data.subjectsWithTopics
                    .filter((s) => !topicForm.subjectId || s.id === topicForm.subjectId)
                    .flatMap((s) => s.topics)
                    .map((t) => {
                      const isChecked = topicForm.topicIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                            isChecked ? "bg-emerald-50 text-emerald-900 font-bold" : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTopicForm({
                                  ...topicForm,
                                  topicIds: [...topicForm.topicIds, t.id],
                                });
                              } else {
                                setTopicForm({
                                  ...topicForm,
                                  topicIds: topicForm.topicIds.filter((id) => id !== t.id),
                                });
                              }
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{t.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Question Count & Difficulty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Questions</label>
                  <select
                    value={topicForm.questionCount}
                    onChange={(e) => setTopicForm({ ...topicForm, questionCount: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value={10}>10 Questions</option>
                    <option value={20}>20 Questions</option>
                    <option value={30}>30 Questions</option>
                    <option value={50}>50 Questions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Difficulty</label>
                  <select
                    value={topicForm.difficulty}
                    onChange={(e) => setTopicForm({ ...topicForm, difficulty: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="mixed">Mixed (Standard)</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard (Advanced)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateTopicTest}
                disabled={isPending || topicForm.topicIds.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {isPending ? "Generating..." : "Generate Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7.2 PYQ MODAL */}
      {activeModal === "pyq" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">PYQ Simulation</h3>
                  <p className="text-[11px] text-slate-500">Pick year & shift to simulate official test</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Exam Year</label>
                <select
                  value={pyqForm.year}
                  onChange={(e) => setPyqForm({ ...pyqForm, year: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value={2025}>2025 Tier-1 Paper</option>
                  <option value={2024}>2024 Tier-1 Paper</option>
                  <option value={2023}>2023 Tier-1 Paper</option>
                  <option value={2022}>2022 Tier-1 Paper</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Shift / Slot</label>
                <select
                  value={pyqForm.shift}
                  onChange={(e) => setPyqForm({ ...pyqForm, shift: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Shift 1 (Morning)">Shift 1 (09:00 AM - 10:00 AM)</option>
                  <option value="Shift 2 (Afternoon)">Shift 2 (12:30 PM - 01:30 PM)</option>
                  <option value="Shift 3 (Evening)">Shift 3 (04:00 PM - 05:00 PM)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={handleGeneratePyqSimulation}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {isPending ? "Generating..." : "Start PYQ Shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7.3 WEAK AREA MODAL */}
      {activeModal === "weak_area" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Weak Area Drill</h3>
                  <p className="text-[11px] text-slate-500">Automated targeted practice from your low-accuracy topics</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/70">
                <div className="text-[11px] font-bold text-amber-900 mb-1">Identified Low-Accuracy Topics:</div>
                {data.weakTopics.length > 0 ? (
                  <div className="space-y-1">
                    {data.weakTopics.map((wt) => (
                      <div key={wt.topicId} className="flex items-center justify-between text-slate-700">
                        <span>{wt.topicName}</span>
                        <span className="font-bold text-rose-600">{wt.accuracyPercentage}% acc</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-600">
                    System will automatically sample from syllabus areas with least attempts.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Question Count</label>
                <select
                  value={weakAreaForm.questionCount}
                  onChange={(e) => setWeakAreaForm({ ...weakAreaForm, questionCount: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value={15}>15 Questions</option>
                  <option value={25}>25 Questions (Recommended)</option>
                  <option value={50}>50 Questions</option>
                </select>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={handleGenerateWeakAreaTest}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {isPending ? "Generating..." : "Generate Drill"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7.4 MISTAKE REVISION MODAL */}
      {activeModal === "mistake" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Mistake Vault Revision</h3>
                  <p className="text-[11px] text-slate-500">Re-test past incorrect questions directly</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-rose-900">Available In Vault</div>
                  <div className="text-xl font-black text-rose-700">{data.mistakeVaultCount} Questions</div>
                </div>
                <Brain className="w-8 h-8 text-rose-300" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Questions to Re-test</label>
                <select
                  value={mistakeForm.questionCount}
                  onChange={(e) => setMistakeForm({ ...mistakeForm, questionCount: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                >
                  <option value={10}>10 Questions</option>
                  <option value={20}>20 Questions</option>
                  <option value={30}>30 Questions</option>
                </select>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={handleGenerateMistakeRevisionTest}
                disabled={isPending || data.mistakeVaultCount === 0}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {isPending ? "Generating..." : "Start Revision Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7.5 PERSONALIZED MOCK MODAL */}
      {activeModal === "personalized" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">AI Personalized Mock</h3>
                  <p className="text-[11px] text-slate-500">Balance weak areas with full syllabus</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Weak Area Ratio ({Math.round(personalizedForm.weakRatio * 100)}% Weak / {100 - Math.round(personalizedForm.weakRatio * 100)}% Syllabus)
                </label>
                <input
                  type="range"
                  min={0.2}
                  max={0.8}
                  step={0.1}
                  value={personalizedForm.weakRatio}
                  onChange={(e) => setPersonalizedForm({ ...personalizedForm, weakRatio: Number(e.target.value) })}
                  className="w-full accent-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Mock Questions</label>
                <select
                  value={personalizedForm.questionCount}
                  onChange={(e) => setPersonalizedForm({ ...personalizedForm, questionCount: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value={30}>30 Questions</option>
                  <option value={50}>50 Questions</option>
                  <option value={100}>100 Questions (Full Mock)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={handleGeneratePersonalizedMock}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {isPending ? "Generating..." : "Generate AI Mock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7.6 UPSELL MODAL */}
      {activeModal === "upsell" && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 text-center">
            <div className="w-14 h-14 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Sparkles className="w-7 h-7 fill-amber-400" />
            </div>
            <h3 className="text-lg font-black text-slate-900">Unlock Premium Practice</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Get unlimited access to AI dynamic generators, weak area tests, PYQ simulations, and full-length exam series.
            </p>

            <div className="mt-6 space-y-2">
              <Link
                href="/pricing"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-sm shadow-md hover:brightness-105 transition-all"
              >
                <span>View Premium Plans</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-100"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
