import React from "react";
import Link from "next/link";
import { AssessmentService } from "@/services/assessment.service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
} from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 0;

export const metadata = constructMetadata({
  title: "Mock Test Hub & Daily Practice Mocks",
  description:
    "Daily sectional tests, weekly mixed drills, and national-level full mock tests with live percentiles and question rotation.",
});

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function MockTestsDirectoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const categorySlug = params.category;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const hubData = await AssessmentService.getDailyMockHubData(categorySlug, user?.id);
  const { todayMock, weeklySchedule, categories, selectedCategorySlug, fullMockTests } = hubData;

  const selectedCategory = categories.find((c) => c.slug === selectedCategorySlug) || categories[0];

  return (
    <div className="py-8 sm:py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        {/* Hub Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="indigo" className="text-xs">
                Assessment Studio
              </Badge>
              <Badge variant="outline" className="text-xs bg-white text-emerald-700 border-emerald-200 flex items-center gap-1 font-bold">
                <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
                Live Daily Mocks Active
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Mock Tests & Daily Practice Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
              Daily sectional speed drills, weekend full-length tests, and real exam simulations with server-calculated percentiles.
            </p>
          </div>

          {/* Category Switcher Tabs */}
          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-200/80 rounded-2xl shadow-2xs self-start md:self-auto overflow-x-auto max-w-full">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/mock-tests?category=${c.slug}`}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                    c.slug === selectedCategorySlug
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {c.title}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* TODAY'S DAILY MOCK HERO CARD                                             */}
        {/* ========================================================================= */}
        {todayMock && (
          <Card className="p-6 sm:p-7 bg-white border-2 border-blue-200/90 rounded-3xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-bl from-blue-100/50 via-indigo-50/20 to-transparent rounded-full pointer-events-none -mr-20 -mt-20" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-blue-600 text-white font-black text-xs px-2.5 py-0.5">
                    {todayMock.dayLabel.toUpperCase()} DAILY MOCK
                  </Badge>
                  <Badge variant="outline" className="text-xs font-bold text-slate-700 bg-slate-50">
                    {todayMock.categoryTitle} &bull; T#{todayMock.testNumber}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs font-bold capitalize ${
                      todayMock.isOpen
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-amber-700 bg-amber-50 border-amber-200"
                    }`}
                  >
                    {todayMock.isOpen ? "● Available (5:00 AM — 11:59 PM)" : "○ Available 5:00 AM — 11:59 PM"}
                  </Badge>
                </div>

                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {todayMock.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
                    Format: <span className="font-bold text-slate-800 capitalize">{todayMock.testType.replace("_", " ")}</span>
                    {todayMock.sectionName ? ` — Section: ${todayMock.sectionName}` : ""}
                  </p>
                </div>

                {/* Specs Badges Row */}
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>{todayMock.questionCount} Questions</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{todayMock.durationMinutes} Minutes</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <Award className="w-3.5 h-3.5 text-purple-600" />
                    <span>{todayMock.totalMarks} Marks</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                    <span className="text-rose-600 font-bold">-{todayMock.negativeMark}</span>
                    <span>Negative</span>
                  </div>
                </div>
              </div>

              {/* Action Button & Status Box */}
              <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-center gap-3 shrink-0">
                {todayMock.userAttemptStatus === "completed" ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-left lg:text-right space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Attempt Completed Today</span>
                    </div>
                    <div className="text-lg font-black text-emerald-900">
                      Score: {todayMock.completedScore ?? "—"} / {todayMock.totalMarks}
                    </div>
                    {todayMock.attemptId && (
                      <Link href={`/assessment/results/${todayMock.attemptId}`}>
                        <Button size="sm" variant="outline" className="text-xs font-bold mt-1 bg-white">
                          View Detailed Analysis
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : !todayMock.isOpen ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-semibold">
                    <Clock className="w-4 h-4 text-amber-600" />
                    Daily mock available daily between 5:00 AM & 11:59 PM.
                  </div>
                ) : todayMock.testId ? (
                  <Link href={`/mock-tests/${todayMock.testId}`}>
                    <Button
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm px-6 py-3 rounded-2xl shadow-md transition-all flex items-center gap-2"
                    >
                      {todayMock.userAttemptStatus === "in_progress" ? "Resume Daily Mock" : "Start Today's Daily Mock"}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : (
                  <div className="text-xs text-slate-400 font-medium">Daily test is being assembled.</div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* 7-DAY WEEKLY SCHEDULE MATRIX                                             */}
        {/* ========================================================================= */}
        {weeklySchedule.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">
                Weekly Mock Schedule — {selectedCategory.title}
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {weeklySchedule.map((day) => {
                const isCurrentDay = todayMock?.dayOfWeek === day.dayOfWeek;
                return (
                  <Card
                    key={day.dayOfWeek}
                    className={`p-3 rounded-2xl border transition-all ${
                      isCurrentDay
                        ? "border-blue-500 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/20"
                        : "border-slate-200/80 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className={`text-xs font-black ${isCurrentDay ? "text-blue-700" : "text-slate-800"}`}>
                        {day.dayLabel.slice(0, 3)}
                      </span>
                      {isCurrentDay && (
                        <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.2 rounded-md">
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
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FULL-LENGTH MOCK TESTS SECTION                                            */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Full-Length Mock Tests — {selectedCategory.title}
            </h2>
          </div>

          {fullMockTests.length === 0 ? (
            <Card className="border-slate-200/80 shadow-xs">
              <CardContent className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                  <Target className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Full-Length Mocks for {selectedCategory.title} Scheduled Soon
                  </h3>
                  <p className="text-xs text-slate-500">
                    Practice with the active Daily Mocks above or drill specific topics in the practice bank.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Link href="/practice">
                    <Button variant="default" size="sm" className="font-semibold shadow-xs text-xs">
                      <HelpCircle className="w-3.5 h-3.5 mr-1" /> Practice Question Bank
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fullMockTests.map((test) => (
                <Card
                  key={test.id}
                  className="p-5 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between h-full bg-white rounded-2xl border border-slate-200/80 shadow-2xs"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-bold">
                        {test.category}
                      </Badge>
                      {test.isFree && (
                        <Badge variant="success" className="text-[10px] font-bold">
                          FREE
                        </Badge>
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-semibold">{test.examTitle}</span>
                      <h3 className="font-bold text-base text-slate-900 mt-0.5">{test.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{test.durationMinutes}m</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-slate-400" />
                        <span>{test.totalMarks} Marks</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>{test.totalQuestions} Qs</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100">
                    <Link href={`/mock-tests/${test.id}`}>
                      <Button size="md" variant="default" className="w-full font-semibold shadow-xs">
                        Take Full Test
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}