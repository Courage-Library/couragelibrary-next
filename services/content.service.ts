import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LearningResolverService } from "@/services/learning/learning-resolver.service";
import { FEATURE_DISABLED_CODE, isFeatureEnabled } from "@/config/features";

export interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  excerpt: string | null;
  readingTimeMinutes: number;
  accessLevel: string;
  /** GAP2-2a: true for PRO documents viewed without PRO. */
  isLocked?: boolean;
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
  topicSlug?: string | null;
  subjectName?: string | null;
  subjectId?: string | null;
  documentType?: string | null;
  isCanonical?: boolean;
}

export interface TopicLearningResolution {
  topicId: string;
  topicName?: string | null;
  topicSlug?: string | null;
  hasPublishedLearning: boolean;
  learningSlug?: string | null;
  learningTitle?: string | null;
  documentType?: string | null;
  isCanonical: boolean;
  readingTimeMinutes?: number;
  isLocked?: boolean;
  accessLevel?: string;
}

export interface RelatedLearningItem {
  topicId: string;
  topicName: string;
  topicSlug: string;
  relationshipType: "PREREQUISITE" | "RELATED" | "ADVANCED_APPLICATION" | "COREQUISITE";
  learningSlug: string | null;
  learningTitle: string | null;
  documentType: string | null;
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
  /** GAP2-2b: the lesson's learning document (learning_documents only). */
  learningDocumentId?: string | null;
  /** Resolved via LearningResolverService — servable documents only; no body (the /articles page loads it). */
  learningDocument?: { title: string; href: string; isLocked: boolean; accessLevel: string } | null;
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
   * GAP2-2a: published learning documents (learning_documents only — no legacy articles).
   */
  static async getArticles(filters?: { topicId?: string }): Promise<ArticleItem[]> {
    const docs = await LearningResolverService.listPublished({ topicId: filters?.topicId });
    return docs.map((d) => ({
      id: d.id,
      slug: d.canonical_slug,
      title: d.title,
      description: null,
      excerpt: d.topic_name ? `${d.document_type.toLowerCase().replace(/_/g, " ")} for ${d.topic_name}.` : null,
      readingTimeMinutes: d.estimated_minutes,
      accessLevel: d.access_level,
      isLocked: d.is_locked,
      publishedAt: null,
      topicName: d.topic_name,
      topicId: d.topic_id,
    }));
  }

  /**
   * GAP2-2a: one published learning document. PRO documents for non-PRO viewers come back with
   * isLocked = true and contentBody = null (the body is never loaded for them).
   */
  static async getArticleBySlug(slug: string): Promise<ArticleDetail | null> {
    const a = await LearningResolverService.getArticle(slug);
    if (!a) return null;
    return {
      id: a.id,
      slug: a.canonical_slug,
      title: a.title,
      description: null,
      excerpt: `${a.document_type.toLowerCase().replace(/_/g, " ")}${a.topic_name ? ` for ${a.topic_name}` : ""}.`,
      readingTimeMinutes: a.estimated_minutes,
      accessLevel: a.access_level,
      isLocked: a.is_locked,
      publishedAt: a.published_at,
      contentBody: a.is_locked ? null : a.body ?? "This lesson is being prepared. Please check back shortly.",
      metaTitle: `${a.title} | Courage Library`,
      metaDescription: `Study ${a.title}${a.topic_name ? ` (${a.topic_name})` : ""} on Courage Library.`,
      featuredImageUrl: null,
      topicName: a.topic_name,
      topicId: a.topic_id,
      relatedTopicId: a.topic_id,
      topicSlug: a.topic_slug,
      subjectName: a.subject_name,
      subjectId: a.subject_id,
      documentType: a.document_type,
      isCanonical: true,
    };
  }

  /**
   * GAP2-2a: topic → primary published learning document, via LearningResolverService
   * (single batch query; order CONCEPT_LESSON, TOPIC_SUMMARY_REVISION, COMMON_TRAPS_AND_MISTAKES,
   * WORKED_EXAMPLES, FORMULA_SHORTCUT_SHEET, PYQ_DEEP_DIVE). Keys are topic ids.
   */
  static async resolveLearningResourcesForTopics(topicIds: string[]): Promise<Map<string, TopicLearningResolution>> {
    const resultMap = new Map<string, TopicLearningResolution>();
    const byTopic = await LearningResolverService.resolveForTopics(topicIds || []);
    byTopic.forEach((docs, topicId) => {
      const top = docs[0];
      if (!top) return;
      resultMap.set(topicId, {
        topicId,
        topicName: top.topic_name,
        topicSlug: null,
        hasPublishedLearning: true,
        learningSlug: top.canonical_slug,
        learningTitle: top.title,
        documentType: top.document_type,
        isCanonical: true,
        readingTimeMinutes: top.estimated_minutes,
        isLocked: top.is_locked,
        accessLevel: top.access_level,
      });
    });
    return resultMap;
  }

  /**
   * Resolves a single topic's primary published learning document.
   */
  static async resolveLearningResourceForTopic(topicId: string): Promise<TopicLearningResolution | null> {
    const map = await this.resolveLearningResourcesForTopics([topicId]);
    return map.get(topicId) || null;
  }

  /**
   * Fetches prerequisite and related topic learning resources from the canonical taxonomy.
   */
  static async getRelatedLearningResources(topicId: string): Promise<RelatedLearningItem[]> {
    if (!topicId) return [];
    const supabase = await createServerSupabaseClient();

    try {
      const { data: rels } = await supabase
        .from("topic_relationships")
        .select("relationship_type, strength, to_topic_id, from_topic_id, topics!topic_relationships_to_topic_id_fkey(id, name, slug)")
        .or(`from_topic_id.eq.${topicId},to_topic_id.eq.${topicId}`)
        .eq("is_active", true);

      if (!rels || !Array.isArray(rels)) return [];

      const relatedTopicIds = new Set<string>();
      const relItems: Array<{ topicId: string; relationshipType: any }> = [];

      rels.forEach((r: any) => {
        const targetId = r.from_topic_id === topicId ? r.to_topic_id : r.from_topic_id;
        if (targetId && targetId !== topicId) {
          relatedTopicIds.add(targetId);
          relItems.push({
            topicId: targetId,
            relationshipType: r.relationship_type,
          });
        }
      });

      if (relatedTopicIds.size === 0) return [];

      const learningMap = await this.resolveLearningResourcesForTopics(Array.from(relatedTopicIds));

      return relItems.map((item) => {
        const lRes = learningMap.get(item.topicId);
        return {
          topicId: item.topicId,
          topicName: lRes?.topicName || "Related Topic",
          topicSlug: lRes?.topicSlug || "",
          relationshipType: item.relationshipType,
          learningSlug: lRes?.learningSlug || null,
          learningTitle: lRes?.learningTitle || null,
          documentType: lRes?.documentType || null,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetches published courses catalog.
   */
  static async getCourses(): Promise<CourseItem[]> {
    if (!isFeatureEnabled("COURSES")) return []; // GAP2-2b: dormant (zero DB calls)
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
    if (!isFeatureEnabled("COURSES")) return null; // GAP2-2b: dormant (zero DB calls)
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
            learningDocumentId: l.learning_document_id ?? null,
            learningDocument: null as CourseLessonItem["learningDocument"],
          })),
      }));

    // GAP2-2b: lesson content comes ONLY from LearningResolverService (one batch query).
    const docIds = modules.flatMap((m) => m.lessons.map((l) => l.learningDocumentId)).filter((id): id is string => Boolean(id));
    if (docIds.length > 0) {
      const docs = await LearningResolverService.resolveDocuments(docIds);
      modules.forEach((m) =>
        m.lessons.forEach((l) => {
          const d = l.learningDocumentId ? docs.get(l.learningDocumentId) : undefined;
          l.learningDocument = d ? { title: d.title, href: d.href, isLocked: d.is_locked, accessLevel: d.access_level } : null;
        })
      );
    }

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
  ): Promise<{ success: boolean; error?: string; code?: string }> {
    if (!isFeatureEnabled("COURSES")) return { success: false, error: "Courses is not enabled.", code: FEATURE_DISABLED_CODE };
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
    code?: string;
  }> {
    if (!isFeatureEnabled("COURSES")) return { success: false, error: "Courses is not enabled.", code: FEATURE_DISABLED_CODE };
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
