import React from "react";
import Link from "next/link";
import { ContentService } from "@/services/content.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Layers, ArrowRight } from "lucide-react";

export const revalidate = 30;

export default async function CoursesCatalogPage() {
  const courses = await ContentService.getCourses();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-5xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-blue-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-3">
          <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
            Phase 3F Structured Course Platform
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-purple-400" />
            Structured Self-Paced Courses
          </h1>
          <p className="text-purple-100 text-sm max-w-2xl">
            Complete exam preparation courses divided into structured modules, interactive video/text lessons, and real-time completion tracking.
          </p>
        </div>

        {/* Courses Grid */}
        {courses.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <Layers className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Published Courses Available</h3>
            <p className="text-xs">Structured courses will be published here soon.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">
            {courses.map((course) => (
              <Card key={course.id} className="p-6 flex flex-col justify-between hover:border-purple-300 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant={course.accessTier === "FREE" ? "success" : "indigo"} className="text-[10px]">
                      {course.accessTier} ACCESS
                    </Badge>
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-100">
                      {course.totalLessonsCount} Lessons • {course.totalModulesCount} Modules
                    </span>
                  </div>

                  <h3 className="font-black text-slate-900 text-lg leading-snug">
                    {course.title}
                  </h3>

                  {course.description && (
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {course.description}
                    </p>
                  )}

                  {course.progressPct !== undefined && course.progressPct > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 font-mono text-xs">
                      <div className="flex justify-between text-slate-600 font-bold">
                        <span>Course Progress</span>
                        <span className="text-purple-700">{course.progressPct}% ({course.completedLessons}/{course.totalLessonsCount})</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${course.progressPct}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {course.priceInr > 0 ? `₹${course.priceInr}` : "FREE"}
                  </span>
                  <Link href={`/courses/${course.slug}`}>
                    <Button variant="default" size="sm" className="bg-purple-700 hover:bg-purple-800 font-bold text-xs">
                      View Syllabus & Learn <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
