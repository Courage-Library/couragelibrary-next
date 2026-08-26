import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlayCircle, CheckCircle2, ArrowRight } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CourseOverviewPage({ params }: Props) {
  const { slug } = await params;
  const course = await ContentService.getCourseBySlug(slug);

  if (!course) {
    notFound();
  }

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-4xl">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Courses Catalog
        </Link>

        {/* Course Profile Card */}
        <Card className="p-6 sm:p-8 space-y-4 border-slate-200 shadow-sm bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="indigo" className="text-xs bg-purple-700 text-white">
                  {course.accessTier} COURSE
                </Badge>
                {course.userProgress?.isCompleted && (
                  <Badge variant="success" className="text-xs">COURSE COMPLETED</Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {course.title}
              </h1>
            </div>

            <Link href={`/courses/${course.slug}/learn`}>
              <Button size="lg" variant="default" className="bg-purple-700 hover:bg-purple-800 font-bold text-xs">
                <PlayCircle className="w-4 h-4 mr-2" />
                {course.userProgress ? "Continue Course" : "Start Learning Now"}
              </Button>
            </Link>
          </div>

          {course.description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {course.description}
            </p>
          )}

          {course.userProgress && (
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-2 font-mono text-xs">
              <div className="flex justify-between font-bold text-purple-900">
                <span>Completion Status</span>
                <span>{course.userProgress.progressPct}% ({course.userProgress.completedLessons} / {course.userProgress.totalLessons} Lessons)</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-purple-200 overflow-hidden">
                <div className="h-full bg-purple-700 rounded-full transition-all" style={{ width: `${course.userProgress.progressPct}%` }} />
              </div>
            </div>
          )}
        </Card>

        {/* Modules & Lessons Syllabus */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Course Modules & Syllabus</h2>

          {course.modules.length === 0 ? (
            <Card className="p-8 text-center text-slate-400">
              <p className="text-xs">No lessons added to this course syllabus yet.</p>
            </Card>
          ) : (
            course.modules.map((m, idx) => (
              <Card key={m.id} className="p-5 space-y-3 border-slate-200">
                <div className="flex items-center justify-between font-bold text-sm text-slate-900 pb-2 border-b border-slate-100">
                  <span>Module {idx + 1}: {m.title}</span>
                  <span className="font-mono text-xs text-slate-400 font-normal">{m.lessons.length} Units</span>
                </div>

                <div className="space-y-2">
                  {m.lessons.map((l) => (
                    <Link
                      key={l.id}
                      href={`/courses/${course.slug}/learn?lesson=${l.id}`}
                      className="p-3 rounded-xl bg-slate-50 hover:bg-purple-50/60 border border-slate-100 flex items-center justify-between text-xs transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        {l.isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <PlayCircle className="w-4 h-4 text-slate-400 group-hover:text-purple-600 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-800 group-hover:text-purple-900">
                          {l.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                        <span>{l.lessonType}</span>
                        {l.durationSeconds > 0 && (
                          <span>({Math.round(l.durationSeconds / 60)}m)</span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      </Container>
    </div>
  );
}
