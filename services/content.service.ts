import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  excerpt: string | null;
  readingTimeMinutes: number;
  accessLevel: string;
  publishedAt: string | null;
  topicName?: string | null;
  topicId?: string | null;
}

export interface ArticleDetail extends ArticleItem {
  contentBody: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  featuredImageUrl: string | null;
  relatedTopicId?: string | null;
}

export interface CourseItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  accessTier: string;
  priceInr: number;
  totalModulesCount?: number;
  totalLessonsCount?: number;
  progressPct?: number;
  completedLessons?: number;
  isCompleted?: boolean;
}

export interface CourseLessonItem {
  id: string;
  moduleId: string;
  title: string;
  slug: string;
  lessonType: "VIDEO" | "TEXT" | "QUIZ";
  videoUrl: string | null;
  durationSeconds: number;
  isFreePreview: boolean;
  displayOrder: number;
  isCompleted?: boolean;
  learningResourceId?: string | null;
}

export interface CourseModuleItem {
  id: string;
  title: string;
  displayOrder: number;
  lessons: CourseLessonItem[];
}

export interface CourseDetail extends CourseItem {
  modules: CourseModuleItem[];
  userProgress?: {
    totalLessons: number;
    completedLessons: number;
    progressPct: number;
    lastLessonId: string | null;
    isCompleted: boolean;
  } | null;
}

export class ContentService {
  /**
   * Fetches published articles list.
   */
  static async getArticles(filters?: { topicId?: string }): Promise<ArticleItem[]> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from("articles")
      .select("id, slug, excerpt, reading_time_minutes, published_at, learning_resources!inner(id, title, description, access_level, status, learning_resource_topics(topic_id, topics(name)))")
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false });

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as any[]).map((a) => {
      const lr = a.learning_resources;
      const t = lr?.learning_resource_topics?.[0]?.topics;

      return {
        id: a.id,
        slug: a.slug,
        title: lr?.title || "Article",
        description: lr?.description || null,
        excerpt: a.excerpt || lr?.description || null,
        readingTimeMinutes: a.reading_time_minutes || 5,
        accessLevel: lr?.access_level || "FREE",
        publishedAt: a.published_at,
        topicName: t?.name || null,
        topicId: lr?.learning_resource_topics?.[0]?.topic_id || null,
      };
    });
  }

  /**
   * Fetches article detail and current Markdown version.
   */
  static async getArticleBySlug(slug: string): Promise<ArticleDetail | null> {
    const supabase = await createServerSupabaseClient();

    const { data: artData } = await supabase
      .from("articles")
      .select("*, learning_resources(*, learning_resource_topics(topic_id, topics(name))), article_versions(*)")
      .eq("slug", slug)
      .eq("status", "PUBLISHED")
      .maybeSingle();

    if (!artData) return null;
    const a = artData as any;
    const lr = a.learning_resources;
    const currentVersion = (a.article_versions || []).find((v: any) => v.is_current) || a.article_versions?.[0];
    const top = lr?.learning_resource_topics?.[0];

    return {
      id: a.id,
      slug: a.slug,
      title: lr?.title || "Article",
      description: lr?.description || null,
      excerpt: a.excerpt || lr?.description || null,
      readingTimeMinutes: a.reading_time_minutes || 5,
      accessLevel: lr?.access_level || "FREE",
      publishedAt: a.published_at,
      contentBody: currentVersion?.content_body || a.excerpt || "No content published.",
      metaTitle: a.meta_title,
      metaDescription: a.meta_description,
      featuredImageUrl: a.featured_image_url,
      topicName: top?.topics?.name || null,
      topicId: top?.topic_id || null,
      relatedTopicId: top?.topic_id || null,
    };
  }

  /**
   * Fetches published courses catalog.
   */
  static async getCourses(): Promise<CourseItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("courses")
      .select("*, course_modules(id, course_lessons(id))")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    let progressMap: Record<string, any> = {};
    if (user) {
      const { data: ucp } = await supabase
        .from("user_course_progress")
        .select("course_id, total_lessons, completed_lessons, progress_pct, is_completed")
        .eq("user_id", user.id);

      if (ucp) {
        ucp.forEach((p: any) => {
          progressMap[p.course_id] = p;
        });
      }
    }

    return (data as any[]).map((c) => {
      const modules = c.course_modules || [];
      const totalLessons = modules.reduce((acc: number, m: any) => acc + (m.course_lessons?.length || 0), 0);
      const prog = progressMap[c.id];

      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        thumbnailUrl: c.thumbnail_url,
        accessTier: c.access_tier,
        priceInr: Number(c.price_inr || 0),
        totalModulesCount: modules.length,
        totalLessonsCount: totalLessons,
        progressPct: prog ? Number(prog.progress_pct) : 0,
        completedLessons: prog ? prog.completed_lessons : 0,
        isCompleted: prog ? prog.is_completed : false,
      };
    });
  }

  /**
   * Fetches detailed course syllabus and progress.
   */
  static async getCourseBySlug(slug: string): Promise<CourseDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: cData } = await supabase
      .from("courses")
      .select("*, course_modules(*, course_lessons(*))")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (!cData) return null;
    const c = cData as any;

    let userProgress: any = null;
    let completedLessonIds = new Set<string>();

    if (user) {
      const [progRes, compRes] = await Promise.all([
        supabase.from("user_course_progress").select("*").eq("course_id", c.id).eq("user_id", user.id).maybeSingle(),
        supabase.from("user_lesson_completions").select("lesson_id").eq("course_id", c.id).eq("user_id", user.id).eq("is_completed", true),
      ]);

      if (progRes.data) {
        const p = progRes.data as any;
        userProgress = {
          totalLessons: p.total_lessons,
          completedLessons: p.completed_lessons,
          progressPct: Number(p.progress_pct),
          lastLessonId: p.last_lesson_id,
          isCompleted: p.is_completed,
        };
      }

      if (compRes.data) {
        (compRes.data as any[]).forEach((l) => completedLessonIds.add(l.lesson_id));
      }
    }

    const modules: CourseModuleItem[] = (c.course_modules || [])
      .sort((m1: any, m2: any) => m1.display_order - m2.display_order)
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        displayOrder: m.display_order,
        lessons: (m.course_lessons || [])
          .sort((l1: any, l2: any) => l1.display_order - l2.display_order)
          .map((l: any) => ({
            id: l.id,
            moduleId: l.module_id,
            title: l.title,
            slug: l.slug,
            lessonType: l.lesson_type,
            videoUrl: l.video_url,
            durationSeconds: l.duration_seconds,
            isFreePreview: l.is_free_preview,
            displayOrder: l.display_order,
            isCompleted: completedLessonIds.has(l.id),
            learningResourceId: l.learning_resource_id,
          })),
      }));

    const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);

    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      thumbnailUrl: c.thumbnail_url,
      accessTier: c.access_tier,
      priceInr: Number(c.price_inr || 0),
      totalModulesCount: modules.length,
      totalLessonsCount: totalLessons,
      modules,
      userProgress,
    };
  }

  /**
   * Updates lesson playback position via fn_update_lesson_playback_position.
   */
  static async updateLessonPlayback(
    lessonId: string,
    positionSeconds: number,
    elapsedRealSeconds = 10
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_update_lesson_playback_position", {
      p_lesson_id: lessonId,
      p_position_seconds: Math.round(positionSeconds),
      p_elapsed_real_seconds: elapsedRealSeconds,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Playback update failed" };
    }

    return data;
  }

  /**
   * Server-authoritative lesson completion via fn_complete_course_lesson.
   */
  static async completeLesson(lessonId: string): Promise<{
    success: boolean;
    is_completed?: boolean;
    completed_lessons?: number;
    total_lessons?: number;
    progress_pct?: number;
    is_course_completed?: boolean;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_complete_course_lesson", {
      p_lesson_id: lessonId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Lesson completion failed" };
    }

    return data;
  }
}
