/**
 * COURAGE LIBRARY — EXAM COURSE SERVICE (CA-5 → COURSE-UX-1, server-only)
 *
 * An exam course is GENERATED, never copied (design E). COURSE-UX-1 shows the WHOLE published syllabus (partial
 * launch): every topic, open when it has a published lesson, "Coming soon" otherwise, Practice with the real count.
 *   - loadCourseData (cached, tag "learn" — every lesson publish revalidates it): PUBLISHED-ONLY public data — the
 *     outline (fn_exam_course_outline = published syllabus ∩ servable lessons), the syllabus read model, master paths,
 *     reading minutes per lesson (word count) and the servable practice count per master topic.
 *   - getCourse (per request): LIVE launch (else 404; staff / admin may PREVIEW an unlaunched course — noindex,
 *     labelled), access per lesson from its master-chapter position + settings (payments off → free), and the
 *     signed-in student's own progress (ONE record per lesson, any language — migration 135).
 * No user id is ever accepted from the caller; the session decides.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminServerSupabaseClient, createServerSupabaseClient, createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isLessonLocked, lessonAccessLevel } from "@/lib/learning/chapter-access";
import { getLessonAccessSettings } from "@/lib/learning/lesson-access-settings";
import { userContentLanguage } from "@/lib/exams/exam-page-server";
import { LearningResolverService } from "@/services/learning/learning-resolver.service";
import { courseFromOutline, type LessonStatus } from "@/lib/learning/course-view";
import { buildCourseStructure, continueLesson, readModelNodes, type CourseLesson, type CourseStructure, type ReadModelNodeLite } from "@/lib/learning/course-structure";
import { readingMinutes } from "@/lib/lessons/reading-time";
import { learnHref } from "@/lib/learn/paths";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { servableTopicCounts } from "@/lib/practice/server";
import { LEARN_CACHE_TAG } from "@/services/learning/master-lesson.service";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface CourseData {
  exam: { id: string; slug: string; title: string };
  state: "AVAILABLE" | "NO_SYLLABUS";
  lessons: CourseLesson[];
  nodes: ReadModelNodeLite[];
  paths: Record<string, string>;
  practice: [string, number][];
}

async function loadCourseDataUncached(examSlug: string): Promise<CourseData | null> {
  const admin = createAdminServerSupabaseClient();
  // the two public read RPCs run as anon (cookie-free): their EXECUTE is granted to the public roles, not service_role
  const pub = createPublicServerSupabaseClient();
  const { data: exam } = await admin.from("exams").select("id, slug, title").eq("slug", examSlug).eq("is_active", true).maybeSingle();
  if (!exam) return null;
  const [{ data: outline, error }, { data: rm, error: rmError }] = await Promise.all([
    pub.rpc("fn_exam_course_outline", { p_exam_id: exam.id, p_language: "en" }),
    pub.rpc("fn_exam_syllabus_read_model", { p_exam_id: exam.id }),
  ]);
  // a failed read is never cached as an empty course
  if (error || !outline || rmError) throw new Error("COURSE_DATA_UNAVAILABLE");
  const view = courseFromOutline(outline, { slug: exam.slug, title: exam.title }, "en");
  const nodes = readModelNodes(rm);
  const base = view.chapters.flatMap((c) => c.lessons);
  const nodeIds = [...new Set([...base.map((l) => l.nodeId), ...nodes.flatMap((n) => n.mapped.map((m) => m.nodeId)).filter((x): x is string => !!x)])];
  const topicIds = [...new Set(nodes.flatMap((n) => n.mapped.map((m) => m.topicId)).filter((x): x is string => !!x))];
  const docIds = base.map((l) => l.documentId);
  const [{ data: paths }, { data: versions }, practice] = await Promise.all([
    nodeIds.length ? admin.from("canonical_taxonomy_nodes").select("id, hierarchy_path").in("id", nodeIds) : Promise.resolve({ data: [] as { id: string; hierarchy_path: string }[] }),
    docIds.length
      ? admin.from("document_versions").select("document_id, blocks, lesson_meta").in("document_id", docIds).eq("language", "en").eq("is_current", true).eq("is_published", true).eq("review_status", "PUBLISHED").eq("content_format", "BLOCKS")
      : Promise.resolve({ data: [] as { document_id: string; blocks: unknown; lesson_meta: unknown }[] }),
    isPracticeEnabled() && topicIds.length ? servableTopicCounts(admin, topicIds).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
  ]);
  const pathOf = Object.fromEntries((paths || []).map((n) => [n.id, n.hierarchy_path]));
  const minutes = new Map((versions || []).map((v) => [v.document_id, Array.isArray(v.blocks) ? readingMinutes(v.blocks) : null]));
  // COURSE-POLISH-1: students see the lesson's published title, never the internal node label
  const titles = new Map(
    (versions || []).map((v) => {
      const t = v.lesson_meta && typeof v.lesson_meta === "object" ? (v.lesson_meta as { title?: unknown }).title : null;
      return [v.document_id, typeof t === "string" && t.trim() ? t.trim() : null] as const;
    }),
  );
  return {
    exam,
    state: view.state,
    lessons: base.map((l) => ({ ...l, name: titles.get(l.documentId) ?? l.name, href: pathOf[l.nodeId] ? learnHref(pathOf[l.nodeId]) : l.href, minutes: minutes.get(l.documentId) ?? null })),
    nodes,
    paths: pathOf,
    practice: [...practice.entries()],
  };
}

/** Cached per exam; every lesson publish revalidates the "learn" tag (app/admin/lessons/actions.ts). */
// a failed read REJECTS (never cached, never shown as "not found"): the page shows its error state ("Try again")
const loadCourseData = (examSlug: string): Promise<CourseData | null> =>
  unstable_cache(() => loadCourseDataUncached(examSlug), ["course-ux-1", "v3" /* COURSE-POLISH-1: lesson titles */, examSlug], { tags: [LEARN_CACHE_TAG], revalidate: 900 })();

export interface CourseView extends CourseStructure {
  exam: { slug: string; title: string };
  state: "AVAILABLE" | "NO_SYLLABUS";
  language: "en" | "hi";
  /** staff / admin looking at a course that is not launched (noindex, labelled) */
  preview: boolean;
  signedIn: boolean;
  continueLesson: { href: string; name: string; started: boolean; subject: string | null; topic: string | null } | null;
}

/** The reader's link into a course lesson: the master page (EN or HI when published) with the course context. */
export function courseLessonHref(l: { href: string; hiAvailable: boolean }, examSlug: string, language: "en" | "hi"): string {
  const href = language === "hi" && l.hiAvailable && l.href.startsWith("/learn/") ? `/hi${l.href}` : l.href;
  return `${href}?${new URLSearchParams({ course: examSlug })}`;
}

// one read per request for the page and its metadata (and the reader's outline)
const getCourseCached = cache(async (examSlug: string): Promise<CourseView | null> => {
    if (!SLUG_RE.test(examSlug || "")) return null;
    const supabase = await createServerSupabaseClient();
    const [data, session] = await Promise.all([loadCourseData(examSlug), getSessionState(supabase)]);
    if (!data) return null;
    const isLive = await isCourseLive(data.exam.id);
    const role = session.state === "user" ? (session.user.app_metadata as { role?: string } | undefined)?.role : undefined;
    const preview = !isLive && (role === "admin" || role === "staff");
    if (!isLive && !preview) return null;

    const [language, access, settings] = await Promise.all([userContentLanguage(), LearningResolverService.getViewerAccess(), getLessonAccessSettings()]);
    const ids = data.lessons.map((l) => l.documentId);
    let progress: Array<{ document_id: string; status: string; updated_at: string }> = [];
    if (session.state === "user" && ids.length) {
      // COURSE-UX-1 (135): one record per lesson, any language (before 135 a lesson may have two rows: COMPLETED wins)
      const { data: rows } = await supabase.from("user_lesson_progress").select("document_id, status, updated_at").in("document_id", ids);
      progress = rows || [];
    }
    const status = new Map<string, LessonStatus>();
    for (const p of progress) {
      const s: LessonStatus = p.status === "COMPLETED" ? "COMPLETED" : p.status === "READING" ? "READING" : "NOT_STARTED";
      if (status.get(p.document_id) !== "COMPLETED") status.set(p.document_id, s);
    }
    const lessons: CourseLesson[] = data.lessons.map((l) => ({
      ...l,
      href: courseLessonHref(l, data.exam.slug, language),
      access: lessonAccessLevel(l.position, settings, l.documentId),
      locked: isLessonLocked(l.position, settings, l.documentId, access.hasPro),
    }));
    const structure = buildCourseStructure({ nodes: data.nodes, lessons, paths: data.paths, practice: new Map(data.practice), status });
    const next = session.state === "user" ? continueLesson(structure.order, progress.filter((p) => p.status === "READING").map((p) => ({ documentId: p.document_id, updatedAt: p.updated_at }))) : null;
    const where = next ? structure.subjects.flatMap((s) => s.topics.map((t) => ({ s, t }))).find(({ t }) => t.lessons.some((l) => l.documentId === next.documentId)) : null;
    return {
      ...structure,
      exam: { slug: data.exam.slug, title: data.exam.title },
      state: data.state,
      language,
      preview,
      signedIn: session.state === "user",
      continueLesson: next ? { href: next.href, name: next.name, started: next.status === "READING", subject: where?.s.title ?? null, topic: where?.t.title ?? null } : null,
    };
});

export class ExamCourseService {
  static async getCourse(examSlug: string): Promise<CourseView | null> {
    return getCourseCached(examSlug);
  }

  /** The course context of the reader (?course=<exam>): order, outline and neighbours — null when not LIVE / previewable. */
  static async getCourseForReader(examSlug: string | null | undefined): Promise<CourseView | null> {
    if (!examSlug || !SLUG_RE.test(examSlug)) return null;
    // the lesson always renders: without its course data it simply shows no course outline
    return ExamCourseService.getCourse(examSlug).catch(() => null);
  }
}

/** CA-7: true when the exam's course is LIVE (launched) — the public read (anon RLS sees LIVE launch rows only). */
export async function isCourseLive(examId: string): Promise<boolean> {
  const { data, error } = await createPublicServerSupabaseClient().from("exam_course_launches").select("status").eq("exam_id", examId).eq("status", "LIVE").limit(1);
  return !error && Boolean(data?.length);
}
