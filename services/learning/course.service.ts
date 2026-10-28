/**
 * COURAGE LIBRARY — EXAM COURSE SERVICE (CA-5, server-only)
 *
 * An exam course is GENERATED, never copied (design E): fn_exam_course_outline = the exam's published syllabi ∩ the
 * servable node lessons, chapters = master topics in master order. This service adds, for the current viewer only:
 *   - access: each lesson's level from its MASTER-chapter position + the settings (lib/learning/chapter-access.ts);
 *     a locked lesson links to its teaser (the reader never loads a locked body);
 *   - progress: the signed-in student's own rows (user_lesson_progress, RLS own rows) → per-lesson status, counts and
 *     "Continue where you left off" (the newest READING lesson of this course, else the first not completed).
 * No user id is ever accepted from the caller; the session decides.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isLessonLocked, lessonAccessLevel } from "@/lib/learning/chapter-access";
import { getLessonAccessSettings } from "@/lib/learning/lesson-access-settings";
import { userContentLanguage } from "@/lib/exams/exam-page-server";
import { LearningResolverService } from "@/services/learning/learning-resolver.service";
import { courseFromOutline, type CourseView, type LessonStatus } from "@/lib/learning/course-view";

export type { CourseView };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ExamCourseService {
  static async getCourse(examSlug: string): Promise<CourseView | null> {
    if (!SLUG_RE.test(examSlug || "")) return null;
    const supabase = await createServerSupabaseClient();
    const { data: exam } = await supabase.from("exams").select("id, slug, title").eq("slug", examSlug).eq("is_active", true).maybeSingle();
    if (!exam) return null;
    const language = await userContentLanguage();
    const [{ data: outline, error }, access, settings, session] = await Promise.all([
      supabase.rpc("fn_exam_course_outline", { p_exam_id: exam.id, p_language: language }),
      LearningResolverService.getViewerAccess(),
      getLessonAccessSettings(),
      getSessionState(supabase),
    ]);
    if (error || !outline) return null;

    const view = courseFromOutline(outline, { slug: exam.slug, title: exam.title }, language);
    const ids = view.chapters.flatMap((c) => c.lessons.map((l) => l.documentId));
    let progress: Array<{ document_id: string; status: string; updated_at: string }> = [];
    if (session.state === "user" && ids.length) {
      const { data } = await supabase.from("user_lesson_progress").select("document_id, status, updated_at").in("document_id", ids).eq("language", language);
      progress = data || [];
    }
    return withViewer(view, { hasPro: access.hasPro, signedIn: session.state === "user", settings, progress });
  }
}

const toStatus = (s: string | undefined): LessonStatus => (s === "READING" || s === "COMPLETED" ? s : "NOT_STARTED");

function withViewer(
  view: CourseView,
  v: { hasPro: boolean; signedIn: boolean; settings: Awaited<ReturnType<typeof getLessonAccessSettings>>; progress: Array<{ document_id: string; status: string; updated_at: string }> }
): CourseView {
  const status = new Map(v.progress.map((p) => [p.document_id, p.status]));
  const chapters = view.chapters.map((c) => ({
    ...c,
    lessons: c.lessons.map((l) => ({
      ...l,
      access: lessonAccessLevel(l.position, v.settings),
      locked: isLessonLocked(l.position, v.settings, v.hasPro),
      status: toStatus(status.get(l.documentId)),
    })),
  }));
  const all = chapters.flatMap((c) => c.lessons);
  const reading = [...v.progress].filter((p) => p.status === "READING").sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const next = (reading && all.find((l) => l.documentId === reading.document_id)) || all.find((l) => l.status !== "COMPLETED" && !l.locked) || null;
  return {
    ...view,
    chapters,
    signedIn: v.signedIn,
    completed: all.filter((l) => l.status === "COMPLETED").length,
    continueLesson: v.signedIn && next ? { href: next.href, name: next.name, started: next.status === "READING" } : null,
  };
}
