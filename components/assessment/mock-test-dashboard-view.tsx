"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MockTestDashboardData } from "@/services/assessment.service";
import {
  addUserExamGoalAction,
  removeUserExamGoalAction,
} from "@/app/mock-tests/actions";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Target,
  Clock,
  Award,
  HelpCircle,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  Flame,
  Play,
  RotateCcw,
  Plus,
  X,
  ChevronRight,
  Layers,
  BarChart3,
  Eye,
} from "lucide-react";

interface Props {
  data: MockTestDashboardData;
}

export function MockTestDashboardView({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State for "+ Add Exam" Modal
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [showAllTodayMocks, setShowAllTodayMocks] = useState(false);

  const {
    user,
    activeExamGoals,
    allExams,
    selectedExamSlug,
    nextMockAction,
    todayMocks,
    examPrepSummaries,
    weeklySchedule,
    fullMockTests,
    recentAttempts,
    performance,
    streak,
    rewards,
  } = data;

  const isAllExamsSelected = selectedExamSlug === "all";
  const displayedTodayMocks = showAllTodayMocks ? todayMocks : todayMocks.slice(0, 4);

  // Handle Exam Tab Click
  const handleSelectExam = (slug: string) => {
    if (slug === "all") {
      router.push("/mock-tests");
    } else {
      router.push(`/mock-tests?category=${slug}`);
    }
  };

  // Handle Add/Remove Exam Goal
  const handleToggleExamGoal = (examId: string, isCurrentlyActive: boolean) => {
    startTransition(async () => {
      if (isCurrentlyActive) {
        await removeUserExamGoalAction(examId);
      } else {
        await addUserExamGoalAction(examId);
      }
      router.refresh();
    });
  };

  return (
    <div className="py-6 sm:py-9 bg-slate-50/60 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-7 max-w-6xl">
        {/* ========================================================================= */}
        {/* 1. HEADER & VALUE PROPOSITION                                            */}
        {/* ========================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[11px] font-extrabold rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
                Mock Test Command Center
              </span>
              {streak.currentStreak > 0 && (
                <span className="px-2.5 py-0.5 text-[11px] font-extrabold rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-600" />
                  {streak.currentStreak} Day Streak
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Mock Tests
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl font-medium">
              Practice under real exam conditions. Track every attempt. Improve where it matters.
            </p>
          </div>

          {/* Quick Streak / Readiness Pill for logged in users */}
          {user && (
            <div className="flex items-center gap-3 p-2 bg-white border border-slate-200/80 rounded-2xl shadow-2xs self-start md:self-auto">
              <div className="px-3 py-1.5 bg-blue-50/60 rounded-xl text-left">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Accuracy</span>
                <span className="text-sm font-black text-blue-900">{performance.averageAccuracy}%</span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="px-3 py-1.5 bg-emerald-50/60 rounded-xl text-left">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Solved</span>
                <span className="text-sm font-black text-emerald-900">{performance.questionsSolved} Qs</span>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 2. MULTI-EXAM SELECTOR CONTEXT BAR                                       */}
        {/* ========================================================================= */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Your Exam Goals
            </span>
            <button
              type="button"
              onClick={() => setShowAddExamModal(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add / Manage Exams
            </button>
          </div>

          <div className="flex items-center gap-2 p-1.5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-x-auto">
            {/* "All Exams" Pill (only if student has multiple exams) */}
            {activeExamGoals.length > 1 && (
              <button
                type="button"
                onClick={() => handleSelectExam("all")}
                className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isAllExamsSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                All Exams ({activeExamGoals.length})
              </button>
            )}

            {/* Individual Active Exam Pills */}
            {activeExamGoals.map((exam) => {
              const isSelected = selectedExamSlug.toLowerCase() === exam.slug.toLowerCase();
              return (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => handleSelectExam(exam.slug)}
                  className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  {exam.title}
                </button>
              );
            })}

            {/* "+ Add Exam" Quick Trigger */}
            <button
              type="button"
              onClick={() => setShowAddExamModal(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-dashed border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition whitespace-nowrap flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Exam
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. YOUR NEXT MOCK — HERO ACTION SECTION                                   */}
        {/* ========================================================================= */}
        {nextMockAction.type === "resume" && nextMockAction.resumable && (
          <Card className="p-6 sm:p-7 bg-linear-to-r from-blue-900 via-indigo-900 to-slate-900 text-white border-none rounded-3xl shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 text-[10px] font-black tracking-wider uppercase rounded-full bg-amber-400 text-slate-950 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    Resume Unfinished Test
                  </span>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-white/20 text-white">
                    {nextMockAction.resumable.examTitle}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                    {nextMockAction.resumable.title}
                  </h2>
                  <p className="text-xs text-blue-100 font-medium mt-1">
                    You have an attempt in progress. Pick up right where you left off.
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 max-w-md pt-1">
                  <div className="flex justify-between text-xs text-blue-200 font-bold">
                    <span>{nextMockAction.resumable.answeredCount} of {nextMockAction.resumable.totalQuestions} Questions Completed</span>
                    <span>{nextMockAction.resumable.progressPercentage}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${nextMockAction.resumable.progressPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <Link href={`/mock-tests/${nextMockAction.resumable.testId}/take`}>
                  <Button
                    size="lg"
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm px-7 py-3 rounded-2xl shadow-lg transition-all flex items-center gap-2"
                  >
                    Resume Mock Now
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {nextMockAction.type === "start_today" && nextMockAction.todayMock && (
          <Card className="p-6 sm:p-7 bg-white border-2 border-blue-200/90 rounded-3xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-bl from-blue-100/50 via-indigo-50/20 to-transparent rounded-full pointer-events-none -mr-20 -mt-20" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 text-[10px] font-black tracking-wider uppercase rounded-full bg-blue-600 text-white">
                    YOUR NEXT MOCK &bull; {nextMockAction.todayMock.dayLabel.toUpperCase()}
                  </span>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700">
                    {nextMockAction.todayMock.examTitle} &bull; T#{nextMockAction.todayMock.testNumber}
                  </span>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Available until 11:59 PM IST
                  </span>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {nextMockAction.todayMock.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5">
                    Target: <span className="font-bold text-slate-800">{nextMockAction.todayMock.sectionName}</span>
                  </p>
                </div>

                {/* Specs Strip */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>{nextMockAction.todayMock.questionCount} Questions</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{nextMockAction.todayMock.durationMinutes} Minutes</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <Award className="w-3.5 h-3.5 text-purple-600" />
                    <span>{nextMockAction.todayMock.totalMarks} Marks</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <span className="text-rose-600 font-bold">-{nextMockAction.todayMock.negativeMark}</span>
                    <span>Negative</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                {nextMockAction.todayMock.testId ? (
                  <Link href={`/mock-tests/${nextMockAction.todayMock.testId}`}>
                    <Button
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-7 py-3 rounded-2xl shadow-md transition-all flex items-center gap-2"
                    >
                      Start Today&apos;s Mock
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button disabled size="lg" className="rounded-2xl">
                    Assembling Test...
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {nextMockAction.type === "view_result" && nextMockAction.todayMock && (
          <Card className="p-6 bg-emerald-50/70 border border-emerald-200 rounded-3xl shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                    Today&apos;s Daily Mock Completed
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900">
                  {nextMockAction.todayMock.title}
                </h3>
                <p className="text-xs text-slate-600">
                  Score: <span className="font-extrabold text-emerald-700">{nextMockAction.todayMock.completedScore ?? "—"}</span> / {nextMockAction.todayMock.totalMarks} marks
                  {nextMockAction.todayMock.completedAccuracy !== undefined && (
                    <span> &bull; Accuracy: <span className="font-extrabold text-blue-700">{nextMockAction.todayMock.completedAccuracy}%</span></span>
                  )}
                </p>
              </div>

              {nextMockAction.todayMock.attemptId && (
                <Link href={`/assessment/results/${nextMockAction.todayMock.attemptId}`}>
                  <Button variant="default" className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs">
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    View Detailed Analysis
                  </Button>
                </Link>
              )}
            </div>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* 4. TODAY'S MOCKS LIST (MULTI-EXAM AWARE)                                 */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              Today&apos;s Mocks {isAllExamsSelected ? "(Across Active Exams)" : `— ${todayMocks[0]?.examTitle || ""}`}
            </h2>
            {todayMocks.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllTodayMocks(!showAllTodayMocks)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                {showAllTodayMocks ? "Show Less" : `View All (${todayMocks.length}) →`}
              </button>
            )}
          </div>

          {todayMocks.length === 0 ? (
            <Card className="p-8 text-center bg-white border border-slate-200 rounded-2xl">
              <p className="text-xs text-slate-500 font-medium">
                No daily mocks scheduled today for this selection. Explore full-length simulations below.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {displayedTodayMocks.map((mock) => (
                <Card
                  key={mock.templateId}
                  className="p-4 sm:p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-blue-50 text-blue-700 border border-blue-200/70">
                        {mock.examTitle}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          mock.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : mock.status === "in_progress"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : mock.status === "available"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {mock.status === "completed"
                          ? "✓ Completed"
                          : mock.status === "in_progress"
                          ? "In Progress"
                          : mock.status === "available"
                          ? "● Available"
                          : "○ Upcoming (5 AM)"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
                        {mock.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {mock.sectionName} &bull; {mock.testType.replace("_", " ")}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-100">
                      <span>{mock.questionCount} Qs</span>
                      <span>&bull;</span>
                      <span>{mock.durationMinutes} Mins</span>
                      <span>&bull;</span>
                      <span>{mock.totalMarks} Marks</span>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                    {mock.status === "completed" && mock.attemptId ? (
                      <Link href={`/assessment/results/${mock.attemptId}`} className="w-full">
                        <Button size="sm" variant="outline" className="w-full text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                          <Eye className="w-3 h-3 mr-1" />
                          View Result ({mock.completedScore ?? "—"} / {mock.totalMarks})
                        </Button>
                      </Link>
                    ) : mock.status === "in_progress" ? (
                      <Link href={`/mock-tests/${mock.testId}/take`} className="w-full">
                        <Button size="sm" className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Resume Mock
                        </Button>
                      </Link>
                    ) : mock.isOpen && mock.testId ? (
                      <Link href={`/mock-tests/${mock.testId}`} className="w-full">
                        <Button size="sm" className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">
                          <Play className="w-3 h-3 mr-1" />
                          Start Mock
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">Available between 5:00 AM & 11:59 PM</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 5. YOUR PREPARATION BY EXAM (MULTI-EXAM PREPARATION CARDS)                */}
        {/* ========================================================================= */}
        {examPrepSummaries.length > 0 && (
          <div className="space-y-3 pt-2">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Your Preparation Summary
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {examPrepSummaries.map((summary) => (
                <Card
                  key={summary.examId}
                  className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900">
                        {summary.examTitle}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700">
                        {summary.totalMocksAttempted} Mocks
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Accuracy</span>
                        <span className="text-base font-extrabold text-blue-700">{summary.averageAccuracy}%</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Best Score</span>
                        <span className="text-base font-extrabold text-emerald-700">{summary.bestScore}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleSelectExam(summary.examSlug)}
                      className="w-full text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
                    >
                      Focus on {summary.examTitle} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. WEEKLY MOCK SCHEDULE ("THIS WEEK")                                     */}
        {/* ========================================================================= */}
        {weeklySchedule.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />
                This Week&apos;s Practice Schedule
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {weeklySchedule.map((day) => (
                <Card
                  key={day.dayOfWeek}
                  className={`p-3 rounded-2xl border transition-all ${
                    day.isToday
                      ? "border-blue-500 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/20"
                      : "border-slate-200/80 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className={`text-xs font-black ${day.isToday ? "text-blue-700" : "text-slate-800"}`}>
                      {day.dayLabel.slice(0, 3)}
                    </span>
                    {day.isToday && (
                      <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.2 rounded-md">
                        TODAY
                      </span>
                    )}
                  </div>
                  <div className="pt-1.5 space-y-1">
                    <div className="text-[11px] font-bold text-slate-900 line-clamp-1">
                      {day.sectionName || day.testType.replace("_", " ")}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold">
                      {day.questionCount} Qs &bull; {day.durationMinutes}m
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 7. FULL-LENGTH MOCK TESTS                                                 */}
        {/* ========================================================================= */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Full-Length Mock Tests
            </h2>
          </div>

          {fullMockTests.length === 0 ? (
            <Card className="border-slate-200/80 shadow-xs">
              <CardContent className="py-10 text-center space-y-2">
                <Target className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-xs font-bold text-slate-700">Full-Length Mocks Scheduled Soon</h3>
                <p className="text-[11px] text-slate-500">Practice with the active Daily Mocks above.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {fullMockTests.map((test) => (
                <Card
                  key={test.id}
                  className="p-5 hover:border-blue-300 transition-all flex flex-col justify-between bg-white rounded-2xl border border-slate-200/80 shadow-2xs"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-bold">
                        {test.examTitle}
                      </Badge>
                      {test.isFree && (
                        <span className="px-2 py-0.2 text-[9px] font-black rounded-md bg-emerald-100 text-emerald-800">
                          FREE
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">{test.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>{test.durationMinutes}m Duration</span>
                      <span>&bull;</span>
                      <span>{test.totalQuestions} Questions</span>
                      <span>&bull;</span>
                      <span>{test.totalMarks} Marks</span>
                    </div>

                    {test.bestScore !== undefined && (
                      <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 p-2 rounded-xl">
                        Best Score: {test.bestScore} / {test.totalMarks}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100">
                    <Link href={`/mock-tests/${test.id}`}>
                      <Button size="sm" variant="default" className="w-full font-bold text-xs bg-blue-600 hover:bg-blue-700">
                        {test.userAttemptStatus === "completed" ? "Retake Full Test" : "Take Full Test"}
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 8. RECENT ATTEMPTS                                                        */}
        {/* ========================================================================= */}
        {recentAttempts.length > 0 && (
          <div className="space-y-3 pt-2">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Recent Attempts
            </h2>

            <Card className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs divide-y divide-slate-100 overflow-hidden">
              {recentAttempts.map((att) => (
                <div key={att.attemptId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900">{att.title}</span>
                      <span className="px-2 py-0.2 text-[9px] font-bold rounded bg-slate-100 text-slate-600">
                        {att.examTitle}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium flex items-center gap-3">
                      <span>{att.relativeTime}</span>
                      <span>&bull;</span>
                      <span>Score: <strong className="text-slate-800">{att.score}</strong>/{att.maxScore}</span>
                      <span>&bull;</span>
                      <span>Accuracy: <strong className="text-blue-700">{att.accuracyPercentage}%</strong></span>
                    </div>
                  </div>

                  <Link href={`/assessment/results/${att.attemptId}`} className="shrink-0 self-start sm:self-auto">
                    <Button size="sm" variant="outline" className="text-xs font-bold border-slate-200 hover:bg-slate-50">
                      View Analysis
                    </Button>
                  </Link>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 9. STREAK & CONSISTENCY SECTION                                          */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2">
          <Card className="md:col-span-6 p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  {streak.currentStreak} Day Practice Streak
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                Best: {streak.longestStreak} Days
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center pt-1">
              {streak.milestones.map((m) => (
                <div
                  key={m.days}
                  className={`p-2.5 rounded-xl border text-center ${
                    m.achieved
                      ? "bg-amber-50 border-amber-200 text-amber-900 font-bold"
                      : "bg-slate-50 border-slate-200 text-slate-400 font-medium"
                  }`}
                >
                  <span className="text-xs block">{m.days} Days</span>
                  <span className="text-[10px] uppercase tracking-wider">{m.achieved ? "✓ Done" : "Target"}</span>
                </div>
              ))}
            </div>

            {!streak.isTodayAttempted && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-900">
                  Streak at risk &bull; Take today&apos;s daily mock to extend streak.
                </span>
              </div>
            )}
          </Card>

          {/* 10. PROGRESS & REWARDS SECTION */}
          <Card className="md:col-span-6 p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  {rewards.levelTitle}
                </h3>
              </div>
              <span className="text-xs font-bold text-purple-700">
                {rewards.currentCoins} Coins
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-semibold">
                <span>Level Progress</span>
                <span>{rewards.levelProgressPct}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 rounded-full transition-all"
                  style={{ width: `${rewards.levelProgressPct}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {rewards.badges.map((b) => (
                <span
                  key={b.id}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1 ${
                    b.unlocked
                      ? "bg-purple-50 text-purple-800 border-purple-200"
                      : "bg-slate-50 text-slate-400 border-slate-200 opacity-60"
                  }`}
                >
                  <Award className="w-3 h-3" />
                  {b.title}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </Container>

      {/* ========================================================================= */}
      {/* ADD / MANAGE EXAMS MODAL                                                  */}
      {/* ========================================================================= */}
      {showAddExamModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Manage Your Exam Goals
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Select all exams you are preparing for.
                </p>
              </div>
              <button
                onClick={() => setShowAddExamModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allExams.map((exam) => {
                const isCurrentlyActive = activeExamGoals.some(
                  (g) => g.examId === exam.id || g.slug === exam.slug
                );
                return (
                  <div
                    key={exam.id}
                    className="p-3 rounded-xl border border-slate-200/80 flex items-center justify-between hover:bg-slate-50 transition"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{exam.title}</span>
                      <span className="text-[10px] text-slate-500">{exam.category || "National Level"}</span>
                    </div>

                    <Button
                      size="sm"
                      variant={isCurrentlyActive ? "default" : "outline"}
                      disabled={isPending}
                      onClick={() => handleToggleExamGoal(exam.id, isCurrentlyActive)}
                      className={`text-xs font-bold h-8 ${
                        isCurrentlyActive
                          ? "bg-blue-600 text-white"
                          : "border-slate-200 text-slate-700"
                      }`}
                    >
                      {isCurrentlyActive ? "✓ Active" : "+ Add"}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddExamModal(false)}
                className="text-xs font-bold"
              >
                Done
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
