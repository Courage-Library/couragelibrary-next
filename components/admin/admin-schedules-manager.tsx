"use client";

import React, { useState, useMemo, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminScheduleItem,
  AdminCategoryItem,
  AdminCategoryDailyProgramData,
  DailyMockDayConfig,
} from "@/services/admin.service";
import {
  getIstCurrentDateTime,
  getIstTomorrowDateStr,
  validateFutureLaunchDateTime,
} from "@/lib/utils";
import {
  createScheduleAction,
  updateScheduleAction,
  saveDailyMockDayAction,
  saveDailyMockProgramAction,
  toggleDailyMockDayAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Calendar,
  CalendarDays,
  PlusCircle,
  Layers,
  Edit2,
  Power,
  X,
  CalendarCheck,
  Rocket,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface Props {
  schedules: AdminScheduleItem[];
  categories: AdminCategoryItem[];
  dailyProgramData?: AdminCategoryDailyProgramData;
  currentCategory?: string;
}

export function AdminSchedulesManager({
  schedules,
  categories,
  dailyProgramData,
  currentCategory,
}: Props) {
  const router = useRouter();

  // Active view tab: "daily_mocks" or "exam_cycles"
  const [activeTab, setActiveTab] = useState<"daily_mocks" | "exam_cycles">("daily_mocks");

  // Selected Category
  const [selectedCategory, setSelectedCategory] = useState(
    currentCategory || (categories[0]?.slug || categories[0]?.id || "ALL")
  );

  // Daily Mock Program State
  const initialProgram = dailyProgramData?.program;
  const availablePatterns = dailyProgramData?.availablePatterns || [];

  const { istDateStr: currentIstDate } = useMemo(() => getIstCurrentDateTime(), []);

  const [launchDate, setLaunchDate] = useState(() => initialProgram?.launchDate || getIstTomorrowDateStr());
  const [launchTime, setLaunchTime] = useState(() => initialProgram?.launchTime || "09:00");
  const [defaultLanguage, setDefaultLanguage] = useState<"both" | "english" | "hindi">(
    initialProgram?.defaultLanguage || "both"
  );
  const [daysState, setDaysState] = useState<DailyMockDayConfig[]>(
    initialProgram?.days || []
  );

  // Pre-Launch Confirmation Modal State
  const [showLaunchConfirmModal, setShowLaunchConfirmModal] = useState(false);

  // Validation
  const launchValidation = useMemo(() => {
    return validateFutureLaunchDateTime(launchDate, launchTime);
  }, [launchDate, launchTime]);

  // Edit Modal for single day & cycle
  const [editingDay, setEditingDay] = useState<DailyMockDayConfig | null>(null);
  const [editingCycle, setEditingCycle] = useState<AdminScheduleItem | null>(null);

  // Action States
  const [daySaveState, saveDayAction, isSavingDay] = useActionState(saveDailyMockDayAction, null);
  const [progSaveState, saveProgAction, isSavingProg] = useActionState(saveDailyMockProgramAction, null);
  const [createCycleState, createCycleAction, isCreatingCycle] = useActionState(createScheduleAction, null);
  const [editCycleState, editCycleAction, isEditingCycle] = useActionState(updateScheduleAction, null);

  const [isToggling, startTransition] = useTransition();

  const activeCategoryObj = useMemo(() => {
    if (!selectedCategory || selectedCategory === "ALL") return categories[0] || null;
    return categories.find(
      (c) => c.slug === selectedCategory || c.id === selectedCategory
    ) || categories[0] || null;
  }, [categories, selectedCategory]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    if (cat === "ALL") {
      router.push("/admin/schedules");
    } else {
      router.push(`/admin/schedules?category=${cat}`);
    }
  };

  // Sync state if initialProgram changes on category switch
  React.useEffect(() => {
    if (initialProgram) {
      setLaunchDate(initialProgram.launchDate || getIstTomorrowDateStr());
      setLaunchTime(initialProgram.launchTime || "09:00");
      setDefaultLanguage(initialProgram.defaultLanguage || "both");
      setDaysState(initialProgram.days || []);
    }
  }, [initialProgram]);

  // Handler for modifying day field locally
  const updateDayField = <K extends keyof DailyMockDayConfig>(
    dayOfWeek: DailyMockDayConfig["dayOfWeek"],
    field: K,
    value: DailyMockDayConfig[K]
  ) => {
    setDaysState((prev) =>
      prev.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const updated = { ...d, [field]: value };

        // When pattern changes, auto-adjust default sections and parameters
        if (field === "patternId") {
          const matchedPat = availablePatterns.find((p) => p.id === value);
          if (matchedPat) {
            updated.patternName = matchedPat.name;
            if (matchedPat.sections.length > 0) {
              updated.activeSectionId = matchedPat.sections[0].id;
              updated.activeSectionName = matchedPat.sections[0].name;
              updated.questionCount = matchedPat.sections[0].questionCount;
              updated.totalMarks = matchedPat.sections[0].questionCount * matchedPat.sections[0].marksPerQuestion;
              updated.negativeMark = matchedPat.sections[0].negativeMark;
            } else {
              updated.questionCount = matchedPat.totalQuestions;
              updated.durationMinutes = matchedPat.durationMinutes;
              updated.totalMarks = matchedPat.totalMarks;
              updated.negativeMark = matchedPat.negativeMarkValue;
            }
          }
        }

        // When section changes, auto-adjust question count and marks
        if (field === "activeSectionId") {
          const currentPat = availablePatterns.find((p) => p.id === updated.patternId);
          const matchedSec = currentPat?.sections.find((s) => s.id === value);
          if (matchedSec) {
            updated.activeSectionName = matchedSec.name;
            updated.activeSectionIds = [matchedSec.id];
            updated.activeSectionNames = [matchedSec.name];
            updated.questionCount = matchedSec.questionCount;
            updated.totalMarks = matchedSec.questionCount * matchedSec.marksPerQuestion;
            updated.negativeMark = matchedSec.negativeMark;
          }
        }

        return updated;
      })
    );
  };

  // Toggle Section for Mixed Mock Day
  const handleToggleMixedSection = (
    dayOfWeek: DailyMockDayConfig["dayOfWeek"],
    sectionId: string
  ) => {
    setDaysState((prev) =>
      prev.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const currentPat = availablePatterns.find((p) => p.id === d.patternId);
        const currentSecIds = d.activeSectionIds || (d.activeSectionId ? [d.activeSectionId] : []);
        const isSelected = currentSecIds.includes(sectionId);
        const newSecIds = isSelected
          ? currentSecIds.filter((id) => id !== sectionId)
          : [...currentSecIds, sectionId];

        const selectedSections = (currentPat?.sections || []).filter((s) =>
          newSecIds.includes(s.id)
        );
        const newSecNames = selectedSections.map((s) => s.name);
        const totalQ = selectedSections.reduce((acc, s) => acc + s.questionCount, 0);
        const totalM = selectedSections.reduce(
          (acc, s) => acc + s.questionCount * s.marksPerQuestion,
          0
        );

        return {
          ...d,
          activeSectionIds: newSecIds,
          activeSectionNames: newSecNames,
          activeSectionId: newSecIds[0] || null,
          activeSectionName: newSecNames.join(" + ") || "Mixed Subjects",
          questionCount: totalQ > 0 ? totalQ : d.questionCount,
          totalMarks: totalM > 0 ? totalM : d.totalMarks,
        };
      })
    );
  };

  // Toggle Day Active
  const handleToggleDay = (dayConfig: DailyMockDayConfig) => {
    const newActive = !dayConfig.isActive;
    updateDayField(dayConfig.dayOfWeek, "isActive", newActive);

    if (dayConfig.templateId) {
      startTransition(async () => {
        await toggleDailyMockDayAction(dayConfig.templateId!, dayConfig.isActive);
      });
    }
  };

  // Filtered Exam Cycles
  const filteredCycles = useMemo(() => {
    if (!selectedCategory || selectedCategory === "ALL") return schedules;
    return schedules.filter(
      (s) =>
        s.categoryId === activeCategoryObj?.id ||
        s.categorySlug.toLowerCase() === activeCategoryObj?.slug.toLowerCase()
    );
  }, [schedules, selectedCategory, activeCategoryObj]);

  const breadcrumbs = [
    { label: "Mock Test Management", href: "/admin/mock-tests-management" },
    { label: "Categories", href: "/admin/categories" },
    ...(activeCategoryObj
      ? [{ label: activeCategoryObj.title, href: `/admin/schedules?category=${activeCategoryObj.slug}` }]
      : []),
    { label: "Schedules & Daily Mocks", active: true },
  ];

  return (
    <div className="space-y-5 w-full pb-10">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-blue-600" /> Daily Mock Scheduling System
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            100% database-driven 7-day recurring mock programs, sectional testing schedules, and exam recruitment timelines.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200/80 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("daily_mocks")}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "daily_mocks"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            7-Day Daily Program
          </button>
          <button
            onClick={() => setActiveTab("exam_cycles")}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "exam_cycles"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Recruitment Cycles
          </button>
        </div>
      </div>

      {/* Global Category Selector Bar */}
      <Card className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Exam Category
              </div>
              <div className="text-sm font-bold text-slate-900">
                {activeCategoryObj?.title || "Select Category"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs min-w-[200px]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Feedback Alerts */}
      {daySaveState?.error && <Alert variant="error">{daySaveState.error}</Alert>}
      {daySaveState?.message && <Alert variant="success">{daySaveState.message}</Alert>}
      {progSaveState?.error && <Alert variant="error">{progSaveState.error}</Alert>}
      {progSaveState?.message && <Alert variant="success">{progSaveState.message}</Alert>}
      {createCycleState?.error && <Alert variant="error">{createCycleState.error}</Alert>}
      {createCycleState?.message && <Alert variant="success">{createCycleState.message}</Alert>}
      {editCycleState?.error && <Alert variant="error">{editCycleState.error}</Alert>}
      {editCycleState?.message && <Alert variant="success">{editCycleState.message}</Alert>}

      {/* ========================================================================= */}
      {/* TAB 1: 7-DAY DAILY MOCK PROGRAM STUDIO                                    */}
      {/* ========================================================================= */}
      {activeTab === "daily_mocks" && (
        <div className="space-y-5">
          {/* Program Overview & Parameters Card */}
          <Card className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Weekly Schedule Matrix — {activeCategoryObj?.title}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Daily mocks run automatically from 5:00 AM to 11:59 PM with 1 attempt per day.
                  </p>
                </div>
              </div>

              {/* Launch Weekly Program Action Button */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!launchValidation.isValid) {
                      alert(launchValidation.error || "Launch date and time must be in the future.");
                      return;
                    }
                    setShowLaunchConfirmModal(true);
                  }}
                  disabled={isSavingProg}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 px-4 py-2 rounded-xl transition"
                >
                  <Rocket className="w-4 h-4" />
                  {isSavingProg ? "Launching Program..." : "Launch Weekly Program"}
                </Button>
              </div>
            </div>

            {/* Validation or Error Feedback */}
            {(!launchValidation.isValid || progSaveState?.error) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{progSaveState?.error || launchValidation.error || "Launch date and time must be in the future (Asia/Kolkata / IST)."}</span>
              </div>
            )}

            {progSaveState?.message && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{progSaveState.message}</span>
              </div>
            )}

            {/* Launch Date, Time & Global Language Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Launch Date (IST) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  min={currentIstDate}
                  value={launchDate}
                  onChange={(e) => setLaunchDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Future date required (Asia/Kolkata).
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Launch Time (IST) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={launchTime}
                    onChange={(e) => setLaunchTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  e.g. 09:00 AM IST.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Default Medium
                </label>
                <select
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value as "both" | "english" | "hindi")}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="both">🌐 Bilingual (Student Chooses)</option>
                  <option value="hindi">🇮🇳 Hindi Medium</option>
                  <option value="english">🇬🇧 English Medium</option>
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Students can switch language.
                </span>
              </div>

              {/* Weekly Metrics Box */}
              <div className="flex items-center justify-around p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
                <div className="text-center">
                  <div className="text-base font-extrabold text-blue-700">
                    {daysState.filter((d) => d.isActive).length}/7
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Active Days</div>
                </div>
                <div className="h-7 w-px bg-slate-200" />
                <div className="text-center">
                  <div className="text-base font-extrabold text-emerald-700">
                    {daysState.filter((d) => d.isActive).reduce((acc, d) => acc + d.questionCount, 0)}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Weekly Qs</div>
                </div>
                <div className="h-7 w-px bg-slate-200" />
                <div className="text-center">
                  <div className="text-base font-extrabold text-purple-700">
                    {daysState.filter((d) => d.isActive).reduce((acc, d) => acc + d.totalMarks, 0)}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Total Marks</div>
                </div>
              </div>
            </div>
          </Card>

          {/* 7-Day Matrix Cards */}
          <div className="space-y-3">
            {daysState.map((day) => {
              const currentPattern = availablePatterns.find((p) => p.id === day.patternId);
              const availableSections = currentPattern?.sections || [];

              return (
                <Card
                  key={day.dayOfWeek}
                  className={`p-4 sm:p-5 bg-white border rounded-2xl transition-all shadow-2xs ${
                    day.isActive
                      ? "border-slate-200/80 hover:border-slate-300"
                      : "border-slate-200/50 bg-slate-50/40 opacity-75"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Day & Badge Header */}
                    <div className="flex items-center gap-3 min-w-[170px]">
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                          day.isActive
                            ? "bg-blue-100/70 text-blue-800 border border-blue-200/60"
                            : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}
                      >
                        {day.dayLabel.slice(0, 3)}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          {day.dayLabel}
                          {day.isActive ? (
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                          )}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500 capitalize">
                          {day.testType.replace("_", " ")}
                        </div>
                      </div>
                    </div>

                    {/* Cascading Controls Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                      {/* Test Type */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Test Format
                        </label>
                        <select
                          value={day.testType}
                          onChange={(e) =>
                            updateDayField(
                              day.dayOfWeek,
                              "testType",
                              e.target.value as "daily_sectional" | "mixed" | "full_mock"
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                        >
                          <option value="daily_sectional">Sectional Test</option>
                          <option value="mixed">Mixed Subject Test</option>
                          <option value="full_mock">Full-Length Mock</option>
                        </select>
                      </div>

                      {/* Pattern Selector (from DB) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Pattern Blueprint
                        </label>
                        <select
                          value={day.patternId}
                          onChange={(e) => updateDayField(day.dayOfWeek, "patternId", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                        >
                          {availablePatterns.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Section Selector (cascading from selected pattern) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Target Section
                        </label>
                        {day.testType === "daily_sectional" && availableSections.length > 0 ? (
                          <select
                            value={day.activeSectionId || availableSections[0]?.id}
                            onChange={(e) =>
                              updateDayField(day.dayOfWeek, "activeSectionId", e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                          >
                            {availableSections.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.questionCount}Q)
                              </option>
                            ))}
                          </select>
                        ) : day.testType === "mixed" && availableSections.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
                            {availableSections.map((s) => {
                              const isChecked = (day.activeSectionIds || []).includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => handleToggleMixedSection(day.dayOfWeek, s.id)}
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all ${
                                    isChecked
                                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                                  }`}
                                  title={`Toggle ${s.name}`}
                                >
                                  {s.name} ({s.questionCount}Q)
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100/70 border border-slate-200 rounded-lg">
                            Full Blueprint ({availableSections.length} Sections)
                          </div>
                        )}
                      </div>

                      {/* Questions / Duration / Marks */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Specs (Q / Min / Marks)
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={day.questionCount}
                            onChange={(e) =>
                              updateDayField(day.dayOfWeek, "questionCount", Number(e.target.value))
                            }
                            className="w-14 px-1.5 py-1.5 text-xs font-bold text-center rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                            title="Question Count"
                          />
                          <span className="text-slate-400 text-xs">/</span>
                          <input
                            type="number"
                            value={day.durationMinutes}
                            onChange={(e) =>
                              updateDayField(day.dayOfWeek, "durationMinutes", Number(e.target.value))
                            }
                            className="w-14 px-1.5 py-1.5 text-xs font-bold text-center rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                            title="Duration in minutes"
                          />
                          <span className="text-slate-400 text-xs">/</span>
                          <input
                            type="number"
                            value={day.totalMarks}
                            onChange={(e) =>
                              updateDayField(day.dayOfWeek, "totalMarks", Number(e.target.value))
                            }
                            className="w-14 px-1.5 py-1.5 text-xs font-bold text-center rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                            title="Total Marks"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions: Toggle Active & Save Day */}
                    <div className="flex items-center gap-2 self-end lg:self-center">
                      <Button
                        type="button"
                        size="sm"
                        variant={day.isActive ? "outline" : "default"}
                        disabled={isToggling}
                        onClick={() => handleToggleDay(day)}
                        className={`text-xs font-semibold ${
                          day.isActive
                            ? "border-slate-200 text-slate-600 hover:text-slate-900"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        }`}
                      >
                        <Power className="w-3.5 h-3.5 mr-1" />
                        {day.isActive ? "Deactivate" : "Activate"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingDay(day)}
                        className="text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        Configure
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RECRUITMENT NOTIFICATION CYCLES                                    */}
      {/* ========================================================================= */}
      {activeTab === "exam_cycles" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Add Cycle Form */}
          <div className="lg:col-span-5">
            <Card className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-4 sticky top-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <PlusCircle className="w-5 h-5 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Add Recruitment Notification</h2>
              </div>

              <form action={createCycleAction} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Exam Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="categoryId"
                    defaultValue={activeCategoryObj ? activeCategoryObj.id : categories[0]?.id || ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Recruitment Year
                    </label>
                    <input
                      name="cycleYear"
                      type="number"
                      defaultValue={2026}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue="active"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notification Release Date
                  </label>
                  <input
                    name="notificationDate"
                    type="date"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Application Start
                    </label>
                    <input
                      name="applicationStartDate"
                      type="date"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Application End
                    </label>
                    <input
                      name="applicationEndDate"
                      type="date"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isCreatingCycle}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  {isCreatingCycle ? "Publishing Schedule..." : "Save Notification Schedule"}
                </Button>
              </form>
            </Card>
          </div>

          {/* Cycles List */}
          <div className="lg:col-span-7 space-y-3">
            {filteredCycles.length === 0 ? (
              <Card className="p-8 text-center bg-white border border-slate-200/80 rounded-2xl">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-700">No recruitment cycles found</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Create notification releases for {activeCategoryObj?.title || "this category"} using the form.
                </p>
              </Card>
            ) : (
              filteredCycles.map((cycle) => (
                <Card
                  key={cycle.id}
                  className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">
                          {cycle.categoryName} — Cycle {cycle.cycleYear}
                        </h3>
                        <Badge
                          variant={cycle.status === "active" ? "default" : "outline"}
                          className="text-[10px] font-bold capitalize"
                        >
                          {cycle.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        {cycle.notificationDate && <div>Release: {cycle.notificationDate}</div>}
                        {cycle.applicationStartDate && (
                          <div>
                            App Window: {cycle.applicationStartDate} to {cycle.applicationEndDate || "—"}
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCycle(cycle)}
                      className="text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SINGLE DAY CONFIGURATION MODAL                                            */}
      {/* ========================================================================= */}
      {editingDay && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Configure {editingDay.dayLabel} — {activeCategoryObj?.title}
                </h3>
              </div>
              <button
                onClick={() => setEditingDay(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await saveDayAction(formData);
                setEditingDay(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="categoryId" value={activeCategoryObj?.id || ""} />
              <input type="hidden" name="dayOfWeek" value={editingDay.dayOfWeek} />
              <input type="hidden" name="dayLabel" value={editingDay.dayLabel} />
              <input type="hidden" name="launchDate" value={launchDate} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Test Format
                  </label>
                  <select
                    name="testType"
                    defaultValue={editingDay.testType}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="daily_sectional">Sectional Test</option>
                    <option value="mixed">Mixed Subject Test</option>
                    <option value="full_mock">Full-Length Mock</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pattern Blueprint
                  </label>
                  <select
                    name="patternId"
                    defaultValue={editingDay.patternId}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  >
                    {availablePatterns.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Section (If Sectional)
                </label>
                <select
                  name="activeSectionId"
                  defaultValue={editingDay.activeSectionId || ""}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">— All Sections / Full Blueprint —</option>
                  {availablePatterns
                    .flatMap((p) => p.sections)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Questions
                  </label>
                  <input
                    name="questionCount"
                    type="number"
                    defaultValue={editingDay.questionCount}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Duration (m)
                  </label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={editingDay.durationMinutes}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Marks
                  </label>
                  <input
                    name="totalMarks"
                    type="number"
                    defaultValue={editingDay.totalMarks}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Negative Mark
                  </label>
                  <input
                    name="negativeMark"
                    type="number"
                    step="0.25"
                    defaultValue={editingDay.negativeMark}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Medium
                  </label>
                  <select
                    name="language"
                    defaultValue={editingDay.language}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="both">🌐 Bilingual</option>
                    <option value="hindi">🇮🇳 Hindi</option>
                    <option value="english">🇬🇧 English</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingDay(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingDay}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {isSavingDay ? "Saving..." : `Save ${editingDay.dayLabel}`}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RECRUITMENT CYCLE EDIT MODAL                                              */}
      {/* ========================================================================= */}
      {editingCycle && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> Edit Schedule: {editingCycle.categoryName} ({editingCycle.cycleYear})
              </h3>
              <button
                onClick={() => setEditingCycle(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editCycleState?.error && <Alert variant="error">{editCycleState.error}</Alert>}
            {editCycleState?.message && <Alert variant="success">{editCycleState.message}</Alert>}

            <form
              action={async (formData) => {
                await editCycleAction(formData);
                setEditingCycle(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={editingCycle.id} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Recruitment Year</label>
                  <input
                    name="cycleYear"
                    type="number"
                    defaultValue={editingCycle.cycleYear}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingCycle.status}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notification Date</label>
                <input
                  name="notificationDate"
                  type="date"
                  defaultValue={editingCycle.notificationDate ? editingCycle.notificationDate.split("T")[0] : ""}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Apply Start Date</label>
                  <input
                    name="applicationStartDate"
                    type="date"
                    defaultValue={editingCycle.applicationStartDate ? editingCycle.applicationStartDate.split("T")[0] : ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Apply End Date</label>
                  <input
                    name="applicationEndDate"
                    type="date"
                    defaultValue={editingCycle.applicationEndDate ? editingCycle.applicationEndDate.split("T")[0] : ""}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingCycle(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={isEditingCycle} className="font-bold bg-blue-600 hover:bg-blue-700">
                  {isEditingCycle ? "Updating..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LAUNCH WEEKLY PROGRAM CONFIRMATION MODAL                                 */}
      {/* ========================================================================= */}
      {showLaunchConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Rocket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Launch Weekly Program?</h3>
                  <p className="text-[11px] text-slate-500 font-medium">{activeCategoryObj?.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowLaunchConfirmModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Launch Summary Matrix */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">Exam Category:</span>
                <span className="font-bold text-slate-900">{activeCategoryObj?.title}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">Launch Date & Time:</span>
                <span className="font-bold text-emerald-700">
                  {launchDate} at {launchTime} (IST)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">Active Schedule:</span>
                <span className="font-bold text-blue-700">
                  {daysState.filter((d) => d.isActive).length} / 7 Days Active
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">Weekly Questions:</span>
                <span className="font-bold text-purple-700">
                  {daysState.filter((d) => d.isActive).reduce((acc, d) => acc + d.questionCount, 0)} Qs
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">Total Weekly Marks:</span>
                <span className="font-bold text-amber-700">
                  {daysState.filter((d) => d.isActive).reduce((acc, d) => acc + d.totalMarks, 0)} Marks
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will activate the 7-day recurring daily mock series for students starting from the specified launch datetime.
            </p>

            <form
              action={async (formData) => {
                await saveProgAction(formData);
                setShowLaunchConfirmModal(false);
              }}
              className="flex items-center justify-end gap-2.5 pt-2"
            >
              <input type="hidden" name="categoryId" value={activeCategoryObj?.id || ""} />
              <input type="hidden" name="launchDate" value={launchDate} />
              <input type="hidden" name="launchTime" value={launchTime} />
              <input type="hidden" name="defaultLanguage" value={defaultLanguage} />
              <input type="hidden" name="daysJson" value={JSON.stringify(daysState)} />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLaunchConfirmModal(false)}
                className="text-xs font-semibold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingProg}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs rounded-xl flex items-center gap-1.5 px-4"
              >
                <Rocket className="w-4 h-4" />
                {isSavingProg ? "Launching..." : "Confirm & Launch Program"}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
