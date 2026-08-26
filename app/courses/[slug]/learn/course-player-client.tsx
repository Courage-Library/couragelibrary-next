"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CourseDetail, CourseLessonItem } from "@/services/content.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  PlayCircle,
  ChevronRight,
  ChevronLeft,
  Video,
  PenTool,
} from "lucide-react";

interface CoursePlayerClientProps {
  courseDetail: CourseDetail;
  initialLessonId?: string;
}

export function CoursePlayerClient({ courseDetail, initialLessonId }: CoursePlayerClientProps) {
  const router = useRouter();

  // Flatten all lessons across modules
  const allLessons = useMemo(() => {
    const list: CourseLessonItem[] = [];
    courseDetail.modules.forEach((m) => {
      m.lessons.forEach((l) => list.push(l));
    });
    return list;
  }, [courseDetail]);

  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    if (initialLessonId && allLessons.some((l) => l.id === initialLessonId)) {
      return initialLessonId;
    }
    if (courseDetail.userProgress?.lastLessonId) {
      return courseDetail.userProgress.lastLessonId;
    }
    return allLessons[0]?.id || "";
  });

  const activeLesson = useMemo(() => {
    return allLessons.find((l) => l.id === activeLessonId) || allLessons[0];
  }, [allLessons, activeLessonId]);

  const activeLessonIndex = useMemo(() => {
    return allLessons.findIndex((l) => l.id === activeLessonId);
  }, [allLessons, activeLessonId]);

  const prevLesson = activeLessonIndex > 0 ? allLessons[activeLessonIndex - 1] : null;
  const nextLesson = activeLessonIndex < allLessons.length - 1 ? allLessons[activeLessonIndex + 1] : null;

  const [isCompleting, setIsCompleting] = useState(false);
  const [completeMsg, setCompleteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [studentNote, setStudentNote] = useState("");

  // Simulated position tracking and heartbeat interval
  useEffect(() => {
    if (!activeLesson) return;

    // Send initial playback position heartbeat
    const sendHeartbeat = async () => {
      try {
        await fetch("/api/courses/playback-heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId: activeLesson.id,
            positionSeconds: 15,
            elapsedRealSeconds: 10,
          }),
        });
      } catch {
        // Silent background update
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [activeLesson]);

  const handleMarkComplete = async () => {
    if (!activeLesson) return;
    setCompleteMsg(null);
    setIsCompleting(true);

    try {
      const res = await fetch("/api/courses/complete-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: activeLesson.id }),
      });

      const data = await res.json();
      if (data.success) {
        setCompleteMsg({ type: "success", text: "Lesson marked complete!" });
        router.refresh();
      } else {
        setCompleteMsg({ type: "error", text: data.error || "Failed to mark complete." });
      }
    } catch {
      setCompleteMsg({ type: "error", text: "Network error completing lesson." });
    } finally {
      setIsCompleting(false);
    }
  };

  if (!activeLesson) {
    return (
      <div className="py-12 text-center text-slate-500">
        <p className="text-sm font-bold">No active lesson found in this course.</p>
      </div>
    );
  }

  return (
    <div className="py-6 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <Link
            href={`/courses/${courseDetail.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Syllabus Overview
          </Link>

          <span className="text-xs font-bold text-slate-800">
            {courseDetail.title}
          </span>
        </div>

        {/* 2-Column Player Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left / Main Workspace (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Lesson Display Area */}
            <Card className="p-6 space-y-4 border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Badge variant="indigo" className="text-[10px]">
                    {activeLesson.lessonType}
                  </Badge>
                  {activeLesson.isCompleted && (
                    <Badge variant="success" className="text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> COMPLETED
                    </Badge>
                  )}
                </div>

                <span className="font-mono text-xs text-slate-400">
                  Lesson {activeLessonIndex + 1} of {allLessons.length}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                {activeLesson.title}
              </h1>

              {/* Video Player placeholder or Text Lesson Body */}
              {activeLesson.lessonType === "VIDEO" ? (
                <div className="w-full aspect-video rounded-2xl bg-slate-900 flex flex-col items-center justify-center text-white space-y-3 p-6 shadow-inner">
                  <Video className="w-12 h-12 text-purple-400 opacity-80" />
                  <p className="text-xs font-mono text-slate-300">
                    Video Stream: {activeLesson.videoUrl || "https://couragelibrary.com/stream/lesson.mp4"}
                  </p>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 text-sm text-slate-800 leading-relaxed font-serif whitespace-pre-wrap">
                  {activeLesson.title} — Conceptual lesson text body content...
                </div>
              )}

              {completeMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    completeMsg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {completeMsg.text}
                </div>
              )}

              {/* Lesson Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!prevLesson}
                  onClick={() => prevLesson && setActiveLessonId(prevLesson.id)}
                  className="text-xs font-semibold"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous Lesson
                </Button>

                <Button
                  size="sm"
                  variant="default"
                  onClick={handleMarkComplete}
                  isLoading={isCompleting}
                  className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark Lesson Complete
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={!nextLesson}
                  onClick={() => nextLesson && setActiveLessonId(nextLesson.id)}
                  className="text-xs font-semibold"
                >
                  Next Lesson <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </Card>

            {/* Personal Notes Box */}
            <Card className="p-5 space-y-3 border-slate-200">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <PenTool className="w-4 h-4 text-purple-600" /> Personal Lesson Notes
              </span>
              <textarea
                rows={3}
                value={studentNote}
                onChange={(e) => setStudentNote(e.target.value)}
                placeholder="Write personal key takeaways or key formulas for this lesson..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-serif outline-none focus:border-purple-600"
              />
            </Card>
          </div>

          {/* Right Column: Course Curriculum Navigation Sidebar */}
          <div className="space-y-4">
            <Card className="p-5 space-y-4 border-slate-200 bg-white">
              <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                Course Curriculum Navigation
              </h3>

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {courseDetail.modules.map((mod, mIdx) => (
                  <div key={mod.id} className="space-y-1.5">
                    <span className="text-[11px] uppercase font-bold text-slate-400 font-mono block">
                      Module {mIdx + 1}: {mod.title}
                    </span>

                    <div className="space-y-1">
                      {mod.lessons.map((les) => (
                        <button
                          key={les.id}
                          type="button"
                          onClick={() => setActiveLessonId(les.id)}
                          className={`w-full p-2.5 rounded-xl text-left text-xs transition-all flex items-center justify-between ${
                            les.id === activeLessonId
                              ? "bg-purple-700 text-white font-bold shadow-xs"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {les.isCompleted ? (
                              <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${les.id === activeLessonId ? "text-emerald-300" : "text-emerald-600"}`} />
                            ) : (
                              <PlayCircle className="w-3.5 h-3.5 shrink-0 opacity-60" />
                            )}
                            <span className="truncate">{les.title}</span>
                          </div>

                          <span className="font-mono text-[10px] opacity-70 shrink-0 ml-1">
                            {les.lessonType}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
