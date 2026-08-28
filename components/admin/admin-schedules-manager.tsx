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
  updateDailyMockProgramAction,
  deactivateDailyMockProgramAction,
  toggleDailyMockDayAction,
} from "@/app/admin/actions";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  Calendar,
  CalendarDays,
  PlusCircle,
  Layers,
  Edit2,
  Edit,
  Power,
  X,
  CalendarCheck,
  Rocket,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Eye,
  ArrowLeft,
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

  // Active top-level tab: "daily_mocks" or "exam_cycles"
  const [activeTab, setActiveTab] = useState<"daily_mocks" | "exam_cycles">("daily_mocks");

  // Selected Category
  const [selectedCategory, setSelectedCategory] = useState(
    currentCategory || (categories[0]?.slug || categories[0]?.id || "ALL")
  );

  // Daily Mock Program State from DB
  const initialProgram = dailyProgramData?.program;
  const availablePatterns = useMemo(
    () => dailyProgramData?.availablePatterns || [],
    [dailyProgramData]
  );

  const isProgramLaunchedInDb = Boolean(
    initialProgram?.isLaunched && initialProgram.status !== "NOT_LAUNCHED"
  );

  // View Mode: "live_dashboard" | "live_details" | "edit_schedule"
  const [viewMode, setViewMode] = useState<"live_dashboard" | "live_details" | "edit_schedule">(() =>
    isProgramLaunchedInDb ? "live_dashboard" : "edit_schedule"
  );

  const { istDateStr: currentIstDate } = useMemo(() => getIstCurrentDateTime(), []);

  const [launchDate, setLaunchDate] = useState(() => initialProgram?.launchDate || getIstTomorrowDateStr());
  const [launchTime, setLaunchTime] = useState(() => initialProgram?.launchTime || "09:00");
  const [defaultLanguage, setDefaultLanguage] = useState<"both" | "english" | "hindi">(
    initialProgram?.defaultLanguage || "both"
  );
  const [daysState, setDaysState] = useState<DailyMockDayConfig[]>(
    initialProgram?.days || []
  );

  // Transient Toast State (Auto-dismisses in 4.5s)
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    description: string;
    type: "success" | "error";
  } | null>(null);

  // Pre-Launch Confirmation Modal State
  const [showLaunchConfirmModal, setShowLaunchConfirmModal] = useState(false);

  // Destructive Program Deactivation Modal State
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateConfirmText, setDeactivateConfirmText] = useState("");

  // Validation for future launch datetime
  const launchValidation = useMemo(() => {
    return validateFutureLaunchDateTime(launchDate, launchTime);
  }, [launchDate, launchTime]);

  // Derived Program Lifecycle Status
  const programLifecycle = useMemo(() => {
    if (!initialProgram?.isLaunched || initialProgram.status === "NOT_LAUNCHED") {
      return {
        status: "NOT_LAUNCHED" as const,
        badgeLabel: "NOT LAUNCHED",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        dotClass: "bg-slate-400",
        icon: Clock,
        description: "Weekly program is in draft setup state. Configure and launch to go live.",
      };
    }

    if (initialProgram.status === "DEACTIVATED") {
      return {
        status: "DEACTIVATED" as const,
        badgeLabel: "DEACTIVATED",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        dotClass: "bg-rose-500",
        icon: Power,
        description: "Weekly daily mock tests are currently stopped. Reconfigure or update to reactivate.",
      };
    }

    const activeDays = daysState.filter((d) => d.isActive);
    if (activeDays.length < 7) {
      return {
        status: "PARTIALLY_ACTIVE" as const,
        badgeLabel: "PARTIALLY ACTIVE",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        dotClass: "bg-amber-500",
        icon: AlertTriangle,
        description: `${activeDays.length} of 7 days are active. Some days are individually paused.`,
      };
    }

    return {
      status: "LIVE_ACTIVE" as const,
      badgeLabel: "LIVE & ACTIVE",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dotClass: "bg-emerald-500 animate-pulse",
      icon: Activity,
      description: "Weekly daily mock tests are live and running automatically.",
    };
  }, [initialProgram, daysState]);

  // Derived Status for each individual day card
  const getDayStatus = (day: DailyMockDayConfig) => {
    const isWeekend = day.dayOfWeek === "saturday" || day.dayOfWeek === "sunday";
    if (!day.isActive) {
      return {
        label: "PAUSED",
        badgeClass: "bg-slate-100 text-slate-500 border-slate-200",
        dotClass: "bg-slate-400",
        isWeekend,
      };
    }
    if (programLifecycle.status === "DEACTIVATED") {
      return {
        label: "INACTIVE",
        badgeClass: "bg-rose-50 text-rose-600 border-rose-200",
        dotClass: "bg-rose-400",
        isWeekend,
      };
    }
    return {
      label: "LIVE",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold",
      dotClass: "bg-emerald-500 animate-pulse",
      isWeekend,
    };
  };

  // Edit Modal for single day & cycle
  const [editingDay, setEditingDay] = useState<DailyMockDayConfig | null>(null);
  const [editingCycle, setEditingCycle] = useState<AdminScheduleItem | null>(null);

  // Action States
  const [daySaveState, saveDayAction, isSavingDay] = useActionState(saveDailyMockDayAction, null);
  const [progSaveState, saveProgAction, isSavingProg] = useActionState(saveDailyMockProgramAction, null);
  const [updateProgState, updateProgAction, isUpdatingProg] = useActionState(updateDailyMockProgramAction, null);
  const [deactivateProgState, deactivateProgAction, isDeactivatingProg] = useActionState(deactivateDailyMockProgramAction, null);
  const [createCycleState, createCycleAction, isCreatingCycle] = useActionState(createScheduleAction, null);
  const [editCycleState, editCycleAction, isEditingCycle] = useActionState(updateScheduleAction, null);

  const [isToggling, startTransition] = useTransition();

  // Auto-dismiss transient toast after 4500ms
  React.useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const activeCategoryObj = useMemo(() => {
    if (!selectedCategory || selectedCategory === "ALL") return categories[0] || null;
    return categories.find(
      (c) => c.slug === selectedCategory || c.id === selectedCategory
    ) || categories[0] || null;
  }, [categories, selectedCategory]);

  const primaryPattern = useMemo(() => {
    return availablePatterns[0] || {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Standard Examination Pattern",
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 200,
      sections: [],
    };
  }, [availablePatterns]);

  // Handle Category Switching
  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    if (cat === "ALL") {
      router.push("/admin/schedules");
    } else {
      router.push(`/admin/schedules?category=${cat}`);
    }
  };

  // Sync state when initialProgram changes on category switch or server revalidation
  React.useEffect(() => {
    if (initialProgram) {
      setLaunchDate(initialProgram.launchDate || getIstTomorrowDateStr());
      setLaunchTime(initialProgram.launchTime || "09:00");
      setDefaultLanguage(initialProgram.defaultLanguage || "both");
      setDaysState(initialProgram.days || []);

      if (initialProgram.isLaunched && initialProgram.status !== "NOT_LAUNCHED") {
        setViewMode("live_dashboard");
      } else {
        setViewMode("edit_schedule");
      }
    }
  }, [initialProgram]);

  // Handle Program Launch State
  React.useEffect(() => {
    if (progSaveState?.success && progSaveState?.message) {
      const activeCount = daysState.filter((d) => d.isActive).length;
      setToastMessage({
        title: "Weekly Program Launched",
        description: `${activeCategoryObj?.title || "Exam"} · ${primaryPattern.name} · ${activeCount} days scheduled successfully.`,
        type: "success",
      });
      setViewMode("live_dashboard");
      router.refresh();
    } else if (progSaveState?.error) {
      setToastMessage({
        title: "Program Launch Failed",
        description: progSaveState.error,
        type: "error",
      });
    }
  }, [progSaveState, activeCategoryObj, primaryPattern, daysState, router]);

  // Handle Program Update State
  React.useEffect(() => {
    if (updateProgState?.success && updateProgState?.message) {
      setToastMessage({
        title: "Schedule Updated",
        description: updateProgState.message,
        type: "success",
      });
      setViewMode("live_dashboard");
      router.refresh();
    } else if (updateProgState?.error) {
      setToastMessage({
        title: "Update Failed",
        description: updateProgState.error,
        type: "error",
      });
    }
  }, [updateProgState, router]);

  // Handle Program Deactivation State
  React.useEffect(() => {
    if (deactivateProgState?.success && deactivateProgState?.message) {
      setToastMessage({
        title: "Weekly Program Deactivated",
        description: deactivateProgState.message,
        type: "success",
      });
      setShowDeactivateModal(false);
      setDeactivateConfirmText("");
      setViewMode("live_dashboard");
      router.refresh();
    } else if (deactivateProgState?.error) {
      setToastMessage({
        title: "Deactivation Failed",
        description: deactivateProgState.error,
        type: "error",
      });
    }
  }, [deactivateProgState, router]);

  // Handle Single Day Save State
  React.useEffect(() => {
    if (daySaveState?.success && daySaveState?.message) {
      setToastMessage({
        title: "Day Schedule Updated",
        description: daySaveState.message,
        type: "success",
      });
      setEditingDay(null);
      router.refresh();
    } else if (daySaveState?.error) {
      setToastMessage({
        title: "Update Failed",
        description: daySaveState.error,
        type: "error",
      });
    }
  }, [daySaveState, router]);

  // Handler for modifying day field locally in edit mode
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

  // Level 1: Toggle Individual Day Active/Inactive
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

  const StatusIcon = programLifecycle.icon;

  return (
    <div className="space-y-5 w-full pb-10 relative">
      {/* Transient Toast Notification (Auto-Dismisses in 4.5s) */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 max-w-md w-full animate-in slide-in-from-top-4 fade-in duration-300 shadow-2xl rounded-2xl border border-slate-200/80 bg-white p-4 flex items-start gap-3.5">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              toastMessage.type === "success"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-slate-900">{toastMessage.title}</h4>
            <p className="text-[11px] text-slate-600 font-medium mt-0.5 leading-snug">
              {toastMessage.description}
            </p>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* Global Exam Category Selector & Context Bar */}
      <Card className="p-4 sm:p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900">
                  {activeCategoryObj?.title || "Select Category"}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  {primaryPattern.name}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] rounded-full border ${programLifecycle.badgeClass}`}
                >
                  <StatusIcon className="w-3 h-3 shrink-0" />
                  {programLifecycle.badgeLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {programLifecycle.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
              Exam:
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs min-w-[210px]"
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

      {/* Critical Server Action Errors (if any) */}
      {daySaveState?.error && <Alert variant="error">{daySaveState.error}</Alert>}
      {progSaveState?.error && <Alert variant="error">{progSaveState.error}</Alert>}
      {updateProgState?.error && <Alert variant="error">{updateProgState.error}</Alert>}
      {deactivateProgState?.error && <Alert variant="error">{deactivateProgState.error}</Alert>}
      {createCycleState?.error && <Alert variant="error">{createCycleState.error}</Alert>}
      {createCycleState?.message && <Alert variant="success">{createCycleState.message}</Alert>}
      {editCycleState?.error && <Alert variant="error">{editCycleState.error}</Alert>}
      {editCycleState?.message && <Alert variant="success">{editCycleState.message}</Alert>}

      {/* ========================================================================= */}
      {/* TAB 1: 7-DAY DAILY MOCK PROGRAM STUDIO                                    */}
      {/* ========================================================================= */}
      {activeTab === "daily_mocks" && (
        <div className="space-y-5">
          {/* ===================================================================== */}
          {/* STATE B.1: LIVE PROGRAM DASHBOARD VIEW (AFTER LAUNCH)                 */}
          {/* ===================================================================== */}
          {viewMode === "live_dashboard" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Live Program Summary Card */}
              <Card className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        Weekly Daily Mock Program — Overview
                      </h2>
                      <p className="text-xs text-slate-500">
                        Live monitoring and management dashboard for {activeCategoryObj?.title}.
                      </p>
                    </div>
                  </div>

                  {/* Primary Live Program Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setViewMode("live_details")}
                      className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      View Details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setViewMode("edit_schedule")}
                      className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5 text-slate-600" />
                      Update Schedule
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setDeactivateConfirmText("");
                        setShowDeactivateModal(true);
                      }}
                      className="text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5"
                    >
                      <Power className="w-3.5 h-3.5 text-rose-600" />
                      Deactivate Program
                    </Button>
                  </div>
                </div>

                {/* Summary Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Launched
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 truncate">
                      {launchDate}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      {launchTime} IST
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Pattern
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 truncate">
                      {primaryPattern.name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      {primaryPattern.sections.length} Sections
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Active Days
                    </div>
                    <div className="text-base font-extrabold text-blue-700">
                      {daysState.filter((d) => d.isActive).length} / 7
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      Mon – Sun
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Weekly Questions
                    </div>
                    <div className="text-base font-extrabold text-emerald-700">
                      {daysState.filter((d) => d.isActive).reduce((acc, d) => acc + d.questionCount, 0)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      Total Questions
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Weekly Marks
                    </div>
                    <div className="text-base font-extrabold text-purple-700">
                      {daysState.filter((d) => d.isActive).reduce((acc, d) => acc + d.totalMarks, 0)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      Max Score
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Attempts
                    </div>
                    <div className="text-xs font-extrabold text-slate-900">
                      1 Attempt / Day
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      5:00 AM – 11:59 PM
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Medium
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 capitalize">
                      {defaultLanguage === "both" ? "Bilingual" : `${defaultLanguage} Medium`}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                      Switchable
                    </div>
                  </div>
                </div>
              </Card>

              {/* Compact Weekly Schedule Overview List */}
              <Card className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-600" /> Weekly Schedule Overview
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Individual day controls & test parameters
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {daysState.map((day) => {
                    const currentPattern = availablePatterns.find((p) => p.id === day.patternId);
                    const availableSections = currentPattern?.sections || [];
                    const dayStatus = getDayStatus(day);

                    return (
                      <div
                        key={day.dayOfWeek}
                        className={`py-3.5 px-3 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          day.isActive
                            ? dayStatus.isWeekend
                              ? "bg-amber-50/20 hover:bg-amber-50/40"
                              : "hover:bg-slate-50/60"
                            : "bg-slate-50/50 opacity-60"
                        }`}
                      >
                        {/* Day Identifier & Weekend Tag */}
                        <div className="flex items-center gap-3 min-w-[170px]">
                          <span
                            className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black text-xs shrink-0 ${
                              day.isActive
                                ? dayStatus.isWeekend
                                  ? "bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs"
                                  : "bg-blue-100 text-blue-900 border border-blue-200/80 shadow-2xs"
                                : "bg-slate-100 text-slate-400 border border-slate-200"
                            }`}
                          >
                            <span className="text-[10px] font-black">{day.dayLabel.slice(0, 3)}</span>
                            {dayStatus.isWeekend && (
                              <span className="text-[7px] font-black text-amber-700 tracking-tighter uppercase">W-END</span>
                            )}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              {day.dayLabel}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.2 text-[8px] rounded-full border ${dayStatus.badgeClass}`}>
                                <span className={`w-1 h-1 rounded-full ${dayStatus.dotClass}`} />
                                {dayStatus.label}
                              </span>
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500 capitalize mt-0.5">
                              {day.testType.replace("_", " ")}
                            </div>
                          </div>
                        </div>

                        {/* Middle: Target Section(s) & Specs Summary */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {day.testType === "daily_sectional"
                              ? day.activeSectionName || "Sectional Test"
                              : day.testType === "mixed"
                              ? `Mixed Subject (${day.activeSectionNames?.length || 2} Sections)`
                              : `Full-Length Mock (${availableSections.length || 4} Sections)`}
                          </div>
                          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{day.questionCount} Questions</span>
                            <span>·</span>
                            <span>{day.durationMinutes} Mins</span>
                            <span>·</span>
                            <span>{day.totalMarks} Marks</span>
                            <span>·</span>
                            <span>-{day.negativeMark} Neg</span>
                          </div>
                        </div>

                        {/* Right: Individual Day Controls (Level 1) */}
                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant={day.isActive ? "outline" : "default"}
                            disabled={isToggling}
                            onClick={() => handleToggleDay(day)}
                            className={`text-xs font-semibold h-8 ${
                              day.isActive
                                ? "border-slate-200 text-slate-600 hover:text-slate-900"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            <Power className="w-3 h-3 mr-1" />
                            {day.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingDay(day)}
                            className="text-xs font-semibold h-8 border-slate-200 text-slate-700 hover:bg-slate-100"
                          >
                            <Edit2 className="w-3 h-3 mr-1 text-slate-500" />
                            Configure
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STATE B.2: DETAILED LIVE INSPECTION VIEW                              */}
          {/* ===================================================================== */}
          {viewMode === "live_details" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode("live_dashboard")}
                  className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Live Overview
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setViewMode("edit_schedule")}
                    className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Update Schedule
                  </Button>
                </div>
              </div>

              {/* Detailed Day Cards */}
              <div className="space-y-3">
                {daysState.map((day) => {
                  const currentPattern = availablePatterns.find((p) => p.id === day.patternId);
                  const availableSections = currentPattern?.sections || [];
                  const dayStatus = getDayStatus(day);

                  return (
                    <Card
                      key={day.dayOfWeek}
                      className={`p-5 bg-white border rounded-2xl shadow-2xs transition-all ${
                        day.isActive
                          ? dayStatus.isWeekend
                            ? "border-amber-200/80 bg-gradient-to-r from-white to-amber-50/20"
                            : "border-slate-200/80"
                          : "border-slate-200/50 bg-slate-50/40 opacity-70"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-[200px]">
                          <span
                            className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black text-xs shrink-0 ${
                              day.isActive
                                ? dayStatus.isWeekend
                                  ? "bg-amber-100 text-amber-900 border border-amber-300/80"
                                  : "bg-blue-100 text-blue-900 border border-blue-200/80"
                                : "bg-slate-100 text-slate-400 border border-slate-200"
                            }`}
                          >
                            <span className="text-[11px] font-black">{day.dayLabel.slice(0, 3)}</span>
                            {dayStatus.isWeekend && (
                              <span className="text-[7px] font-black text-amber-700 tracking-tighter uppercase">W-END</span>
                            )}
                          </span>
                          <div>
                            <div className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                              {day.dayLabel}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full border ${dayStatus.badgeClass}`}>
                                <span className={`w-1 h-1 rounded-full ${dayStatus.dotClass}`} />
                                {dayStatus.label}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-500 capitalize flex items-center gap-1.5 mt-0.5">
                              <span className="font-bold text-slate-700">{day.testType.replace("_", " ")}</span>
                              <span>·</span>
                              <span>{day.patternName || primaryPattern.name}</span>
                            </div>
                          </div>
                        </div>

                        {/* Target Section Breakdown */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Target Subject / Sections
                          </div>
                          {day.testType === "daily_sectional" ? (
                            <div className="text-xs font-bold text-slate-800">
                              {day.activeSectionName || "Sectional Target"}
                            </div>
                          ) : day.testType === "mixed" ? (
                            <div className="flex flex-wrap gap-1.5">
                              {(day.activeSectionNames || []).map((name, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-slate-800">
                              All {availableSections.length} Blueprint Sections ({primaryPattern.name})
                            </div>
                          )}
                        </div>

                        {/* Specs Strip */}
                        <div className="flex items-center gap-3">
                          <div className="text-center px-3 py-1.5 bg-slate-50 border border-slate-200/70 rounded-xl min-w-[70px]">
                            <div className="text-xs font-extrabold text-slate-900">{day.questionCount}</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase">Questions</div>
                          </div>
                          <div className="text-center px-3 py-1.5 bg-slate-50 border border-slate-200/70 rounded-xl min-w-[70px]">
                            <div className="text-xs font-extrabold text-slate-900">{day.durationMinutes}m</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase">Duration</div>
                          </div>
                          <div className="text-center px-3 py-1.5 bg-slate-50 border border-slate-200/70 rounded-xl min-w-[70px]">
                            <div className="text-xs font-extrabold text-slate-900">{day.totalMarks}</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase">Marks</div>
                          </div>
                        </div>

                        {/* Level 1 Actions */}
                        <div className="flex items-center gap-2 shrink-0">
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
                            <Power className="w-3 h-3 mr-1" />
                            {day.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingDay(day)}
                            className="text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50"
                          >
                            <Edit2 className="w-3 h-3 mr-1 text-slate-500" />
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

          {/* ===================================================================== */}
          {/* STATE A & EDIT MODE: SETUP & CONFIGURATION STATE                      */}
          {/* ===================================================================== */}
          {viewMode === "edit_schedule" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Program Parameters Card */}
              <Card className="p-5 sm:p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        {isProgramLaunchedInDb
                          ? `Update Weekly Schedule — ${activeCategoryObj?.title}`
                          : `Weekly Schedule Matrix — ${activeCategoryObj?.title}`}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Daily mocks run automatically from 5:00 AM to 11:59 PM with 1 attempt per day.
                      </p>
                    </div>
                  </div>

                  {/* Actions depending on whether already launched */}
                  <div className="flex items-center gap-2">
                    {isProgramLaunchedInDb && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setViewMode("live_dashboard")}
                        className="text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </Button>
                    )}

                    {isProgramLaunchedInDb ? (
                      <form
                        action={async (formData) => {
                          await updateProgAction(formData);
                        }}
                      >
                        <input type="hidden" name="categoryId" value={activeCategoryObj?.id || ""} />
                        <input type="hidden" name="launchDate" value={launchDate} />
                        <input type="hidden" name="launchTime" value={launchTime} />
                        <input type="hidden" name="defaultLanguage" value={defaultLanguage} />
                        <input type="hidden" name="daysJson" value={JSON.stringify(daysState)} />

                        <Button
                          type="submit"
                          size="sm"
                          disabled={isUpdatingProg}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 px-4 py-2 rounded-xl transition"
                        >
                          <Edit className="w-4 h-4" />
                          {isUpdatingProg ? "Saving Changes..." : "Save Schedule Updates"}
                        </Button>
                      </form>
                    ) : (
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
                    )}
                  </div>
                </div>

                {/* Validation Feedback Warning */}
                {!isProgramLaunchedInDb && !launchValidation.isValid && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{launchValidation.error || "Launch date and time must be in the future (Asia/Kolkata / IST)."}</span>
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
                      <option value="both">Bilingual (Student Chooses)</option>
                      <option value="hindi">Hindi Medium</option>
                      <option value="english">English Medium</option>
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

              {/* 7-Day Configuration Cards */}
              <div className="space-y-3">
                {daysState.map((day) => {
                  const currentPattern = availablePatterns.find((p) => p.id === day.patternId);
                  const availableSections = currentPattern?.sections || [];
                  const dayStatus = getDayStatus(day);

                  return (
                    <Card
                      key={day.dayOfWeek}
                      className={`p-4 sm:p-5 bg-white border rounded-2xl transition-all shadow-2xs ${
                        day.isActive
                          ? dayStatus.isWeekend
                            ? "border-amber-200/80 bg-gradient-to-r from-white to-amber-50/20 hover:border-amber-300"
                            : "border-slate-200/80 hover:border-slate-300"
                          : "border-slate-200/50 bg-slate-50/40 opacity-70"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Day Header */}
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <span
                            className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black text-xs shrink-0 ${
                              day.isActive
                                ? dayStatus.isWeekend
                                  ? "bg-amber-100 text-amber-900 border border-amber-300/80 shadow-2xs"
                                  : "bg-blue-100 text-blue-900 border border-blue-200/80 shadow-2xs"
                                : "bg-slate-100 text-slate-400 border border-slate-200"
                            }`}
                          >
                            <span className="text-[11px] font-black">{day.dayLabel.slice(0, 3)}</span>
                            {dayStatus.isWeekend && (
                              <span className="text-[8px] font-extrabold text-amber-700 tracking-tighter uppercase">W-END</span>
                            )}
                          </span>
                          <div>
                            <div className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                              {day.dayLabel}
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full border ${dayStatus.badgeClass}`}
                              >
                                <span className={`w-1 h-1 rounded-full ${dayStatus.dotClass}`} />
                                {dayStatus.label}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-500 capitalize flex items-center gap-1.5 mt-0.5">
                              <span className="font-bold text-slate-700">{day.testType.replace("_", " ")}</span>
                              <span>·</span>
                              <span className="text-slate-500">{day.patternName || primaryPattern.name}</span>
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
                              Target Section(s)
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
                              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
                                {availableSections.map((s) => {
                                  const isChecked = (day.activeSectionIds || []).includes(s.id);
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => handleToggleMixedSection(day.dayOfWeek, s.id)}
                                      className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-all ${
                                        isChecked
                                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                      }`}
                                      title={`Toggle ${s.name}`}
                                    >
                                      {s.name.split(" ")[0]} ({s.questionCount}Q)
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

                          {/* Specs Summary / Inline Inputs */}
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

                        {/* Actions: Toggle Active & Configure */}
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
                      <option value="cancelled">Cancelled</option>
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
                      Apply Start Date
                    </label>
                    <input
                      name="applicationStartDate"
                      type="date"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Apply End Date
                    </label>
                    <input
                      name="applicationEndDate"
                      type="date"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Exam Window Start
                    </label>
                    <input
                      name="examWindowStart"
                      type="date"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Exam Window End
                    </label>
                    <input
                      name="examWindowEnd"
                      type="date"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isCreatingCycle}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  <PlusCircle className="w-4 h-4 mr-2" />
                  {isCreatingCycle ? "Publishing Schedule..." : "Publish Recruitment Schedule"}
                </Button>
              </form>
            </Card>
          </div>

          {/* Existing Cycles Table */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  Published Exam Cycles ({filteredCycles.length})
                </h3>
              </div>

              {filteredCycles.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-medium">
                  No recruitment cycles found for {activeCategoryObj?.title}.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredCycles.map((cycle) => (
                    <div
                      key={cycle.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {cycle.categoryName} ({cycle.cycleYear})
                          </span>
                          <Badge
                            className={`text-[10px] font-bold ${
                              cycle.status === "active"
                                ? "bg-emerald-100 text-emerald-800"
                                : cycle.status === "scheduled"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {cycle.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {cycle.notificationDate && (
                            <span>Notif: {new Date(cycle.notificationDate).toLocaleDateString()}</span>
                          )}
                          {cycle.applicationStartDate && (
                            <span>
                              Apply: {new Date(cycle.applicationStartDate).toLocaleDateString()} –{" "}
                              {cycle.applicationEndDate ? new Date(cycle.applicationEndDate).toLocaleDateString() : "TBD"}
                            </span>
                          )}
                          {cycle.examWindowStart && (
                            <span>
                              Exam: {new Date(cycle.examWindowStart).toLocaleDateString()} –{" "}
                              {cycle.examWindowEnd ? new Date(cycle.examWindowEnd).toLocaleDateString() : "TBD"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCycle(cycle)}
                          className="text-xs font-semibold"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1 text-slate-500" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SINGLE DAY CONFIGURATION EDIT MODAL                                       */}
      {/* ========================================================================= */}
      {editingDay && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> Configure {editingDay.dayLabel} Schedule
              </h3>
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
              }}
              className="space-y-4"
            >
              <input type="hidden" name="categoryId" value={activeCategoryObj?.id || ""} />
              <input type="hidden" name="dayOfWeek" value={editingDay.dayOfWeek} />
              <input type="hidden" name="dayLabel" value={editingDay.dayLabel} />
              <input type="hidden" name="patternId" value={editingDay.patternId} />
              <input type="hidden" name="launchDate" value={launchDate} />
              <input type="hidden" name="launchTime" value={launchTime} />
              <input type="hidden" name="defaultLanguage" value={defaultLanguage} />

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
                    Active Status
                  </label>
                  <select
                    name="isActive"
                    defaultValue={String(editingDay.isActive)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="true">Active (Scheduled)</option>
                    <option value="false">Inactive (Paused)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Section (for Sectional Mocks)
                </label>
                <select
                  name="activeSectionId"
                  defaultValue={editingDay.activeSectionId || ""}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                >
                  {availablePatterns.find((p) => p.id === editingDay.patternId)?.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.questionCount} Questions, {s.marksPerQuestion * s.questionCount} Marks)
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
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Duration (Min)
                  </label>
                  <input
                    name="durationMinutes"
                    type="number"
                    defaultValue={editingDay.durationMinutes}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                    required
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
                    required
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
                    required
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
                    <option value="both">Bilingual</option>
                    <option value="hindi">Hindi</option>
                    <option value="english">English</option>
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

      {/* ========================================================================= */}
      {/* LEVEL 2: DEACTIVATE ENTIRE PROGRAM CONFIRMATION MODAL (TYPED CONFIRMATION) */}
      {/* ========================================================================= */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-rose-200 rounded-3xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-rose-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Deactivate Weekly Program?</h3>
                  <p className="text-[11px] text-rose-600 font-semibold">{activeCategoryObj?.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDeactivateModal(false);
                  setDeactivateConfirmText("");
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-rose-50/70 border border-rose-200/80 rounded-2xl space-y-2 text-xs text-rose-900 leading-relaxed">
              <p className="font-bold">
                You are about to deactivate the entire:
              </p>
              <p className="font-extrabold text-rose-950">
                {activeCategoryObj?.title} · {primaryPattern.name} Weekly Daily Mock Program
              </p>
              <p className="text-[11px] text-rose-800 mt-2">
                This will stop all currently active scheduled daily mocks (Mon – Sun). Existing student attempts, answers, and results will <span className="font-black underline">NOT</span> be deleted.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                To confirm, type <span className="font-mono text-rose-700 font-black">DEACTIVATE</span> below:
              </label>
              <input
                type="text"
                value={deactivateConfirmText}
                onChange={(e) => setDeactivateConfirmText(e.target.value)}
                placeholder="Type DEACTIVATE"
                className="w-full px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <form
              action={async (formData) => {
                await deactivateProgAction(formData);
              }}
              className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100"
            >
              <input type="hidden" name="categoryId" value={activeCategoryObj?.id || ""} />
              <input type="hidden" name="confirmationText" value={deactivateConfirmText} />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDeactivateModal(false);
                  setDeactivateConfirmText("");
                }}
                className="text-xs font-semibold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isDeactivatingProg || deactivateConfirmText !== "DEACTIVATE"}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-xs rounded-xl flex items-center gap-1.5 px-4"
              >
                <Power className="w-4 h-4" />
                {isDeactivatingProg ? "Deactivating..." : "Deactivate Program"}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
