import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StorageFactory } from "@/services/storage/storage-factory";

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
   * Fetches published articles list with canonical Learning Content precedence.
   */
  static async getArticles(filters?: { topicId?: string }): Promise<ArticleItem[]> {
    const supabase = await createServerSupabaseClient();
    const articlesMap = new Map<string, ArticleItem>();

    // 1. Resolve published canonical Learning Documents
    try {
      const { data: docList } = await supabase
        .from("learning_documents")
        .select("id, canonical_slug, status, updated_at, learning_units(id, title, estimated_minutes, topic_id, topics(name))")
        .eq("status", "PUBLISHED")
        .order("updated_at", { ascending: false });

      if (docList && Array.isArray(docList)) {
        docList.forEach((d: any) => {
          const u = d.learning_units;
          const t = u?.topics;
          if (filters?.topicId && u?.topic_id !== filters.topicId) {
            return;
          }
          articlesMap.set(d.canonical_slug, {
            id: d.id,
            slug: d.canonical_slug,
            title: u?.title || d.canonical_slug,
            description: null,
            excerpt: `Conceptual study unit for ${t?.name || "competitive exams"}.`,
            readingTimeMinutes: u?.estimated_minutes || 10,
            accessLevel: "FREE",
            publishedAt: d.updated_at,
            topicName: t?.name || null,
            topicId: u?.topic_id || null,
          });
        });
      }
    } catch {
      // Graceful fallback if learning_documents table is absent in remote DB
    }

    // 2. Resolve legacy articles and merge
    try {
      let query = supabase
        .from("articles")
        .select("id, slug, excerpt, reading_time_minutes, published_at, learning_resources!inner(id, title, description, access_level, status, learning_resource_topics(topic_id, topics(name)))")
        .eq("status", "PUBLISHED")
        .order("published_at", { ascending: false });

      const { data: legacyData } = await query;
      if (legacyData && Array.isArray(legacyData)) {
        legacyData.forEach((a: any) => {
          const lr = a.learning_resources;
          const t = lr?.learning_resource_topics?.[0]?.topics;
          const topicId = lr?.learning_resource_topics?.[0]?.topic_id || null;

          if (filters?.topicId && topicId !== filters.topicId) {
            return;
          }

          if (!articlesMap.has(a.slug)) {
            articlesMap.set(a.slug, {
              id: a.id,
              slug: a.slug,
              title: lr?.title || "Article",
              description: lr?.description || null,
              excerpt: a.excerpt || lr?.description || null,
              readingTimeMinutes: a.reading_time_minutes || 5,
              accessLevel: lr?.access_level || "FREE",
              publishedAt: a.published_at,
              topicName: t?.name || null,
              topicId,
            });
          }
        });
      }
    } catch {
      // Graceful handling
    }

    return Array.from(articlesMap.values());
  }

  /**
   * Fetches article detail and current Markdown/MDX version.
   * Priority: Published Canonical Learning Document -> Legacy Published Article.
   */
  static async getArticleBySlug(slug: string): Promise<ArticleDetail | null> {
    const supabase = await createServerSupabaseClient();

    // 1. Try to resolve published canonical Learning Document
    try {
      const { data: docData } = await supabase
        .from("learning_documents")
        .select("id, canonical_slug, document_type, status, current_published_version_id, learning_units(id, title, estimated_minutes, topic_id, topics(name, subject_id, subjects(name))), document_versions(*)")
        .eq("canonical_slug", slug)
        .eq("status", "PUBLISHED")
        .maybeSingle();

      if (docData) {
        const doc = docData as any;
        const unit = doc.learning_units;
        const topic = unit?.topics;
        const versions = doc.document_versions || [];
        const publishedVersion =
          versions.find((v: any) => v.id === doc.current_published_version_id) ||
          versions.find((v: any) => v.is_published && v.review_status === "PUBLISHED");

        if (publishedVersion) {
          let contentBody = "";
          try {
            const storageProvider = StorageFactory.getProvider();
            const storageRes = await storageProvider.get(
              "learning-artifacts",
              publishedVersion.compiled_artifact_storage_key
            );
            if (storageRes?.data) {
              contentBody = storageRes.data.toString("utf8");
            } else {
              contentBody = "Canonical learning content is currently being compiled.";
            }
          } catch {
            contentBody = "Canonical learning content is currently being compiled.";
          }

          const subject = topic?.subjects;
          return {
            id: doc.id,
            slug: doc.canonical_slug,
            title: unit?.title || doc.canonical_slug,
            description: null,
            excerpt: `Comprehensive ${doc.document_type?.toLowerCase().replace(/_/g, " ")} for ${topic?.name || "competitive exams"}.`,
            readingTimeMinutes: unit?.estimated_minutes || 10,
            accessLevel: "FREE",
            publishedAt: publishedVersion.published_at || publishedVersion.created_at,
            contentBody,
            metaTitle: `${unit?.title || "Learning Guide"} | Courage Library`,
            metaDescription: `Read complete study brief on ${unit?.title || doc.canonical_slug} with formulas, examples, and PYQs.`,
            featuredImageUrl: null,
            topicName: topic?.name || null,
            topicId: unit?.topic_id || null,
            relatedTopicId: unit?.topic_id || null,
            topicSlug: topic?.slug || null,
            subjectName: subject?.name || null,
            subjectId: topic?.subject_id || null,
            documentType: doc.document_type || "CONCEPT_LESSON",
            isCanonical: true,
          };
        }
      }
    } catch {
      // Seamless fallback to legacy articles if table is absent
    }

    // 2. Fallback to resolve legacy published article
    try {
      const { data: artData } = await supabase
        .from("articles")
        .select("*, learning_resources(*, learning_resource_topics(topic_id, topics(name, slug, subject_id, subjects(name)))), article_versions(*)")
        .eq("slug", slug)
        .eq("status", "PUBLISHED")
        .maybeSingle();

      if (!artData) return null;
      const a = artData as any;
      const lr = a.learning_resources;
      const currentVersion = (a.article_versions || []).find((v: any) => v.is_current) || a.article_versions?.[0];
      const top = lr?.learning_resource_topics?.[0];
      const topic = top?.topics;
      const subject = topic?.subjects;

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
        topicName: topic?.name || null,
        topicId: top?.topic_id || null,
        relatedTopicId: top?.topic_id || null,
        topicSlug: topic?.slug || null,
        subjectName: subject?.name || null,
        subjectId: topic?.subject_id || null,
        documentType: "CONCEPT_LESSON",
        isCanonical: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Deterministically resolves published canonical Learning Content for a batch of topics.
   * Priority policy: CONCEPT_LESSON -> WORKED_EXAMPLES -> FORMULA_SHORTCUT_SHEET -> COMMON_TRAPS_AND_MISTAKES -> PYQ_DEEP_DIVE -> TOPIC_SUMMARY_REVISION -> Legacy Article.
   */
  static async resolveLearningResourcesForTopics(
    topicIdsOrSlugs: string[]
  ): Promise<Map<string, TopicLearningResolution>> {
    const resultMap = new Map<string, TopicLearningResolution>();
    if (!topicIdsOrSlugs || topicIdsOrSlugs.length === 0) {
      return resultMap;
    }

    const uniqueKeys = Array.from(new Set(topicIdsOrSlugs.filter(Boolean)));
    const supabase = await createServerSupabaseClient();

    // Deterministic ranking policy for document types
    const docTypeRank: Record<string, number> = {
      CONCEPT_LESSON: 1,
      WORKED_EXAMPLES: 2,
      FORMULA_SHORTCUT_SHEET: 3,
      COMMON_TRAPS_AND_MISTAKES: 4,
      PYQ_DEEP_DIVE: 5,
      TOPIC_SUMMARY_REVISION: 6,
    };

    // 1. Query canonical published Learning Documents
    try {
      const { data: docList } = await supabase
        .from("learning_documents")
        .select("id, canonical_slug, document_type, status, current_published_version_id, updated_at, learning_units!inner(id, topic_id, title, estimated_minutes, topics!inner(id, name, slug))")
        .eq("status", "PUBLISHED")
        .not("current_published_version_id", "is", null);

      const rawDocs = ((docList as unknown) as any[]) || [];
      if (rawDocs.length > 0) {
        // Group by topic_id and pick top-ranked document
        const topicDocs = new Map<string, any[]>();
        rawDocs.forEach((d: any) => {
          const tId = d.learning_units?.topic_id;
          const tSlug = d.learning_units?.topics?.slug;
          if (uniqueKeys.includes(tId) || (tSlug && uniqueKeys.includes(tSlug))) {
            if (!topicDocs.has(tId)) topicDocs.set(tId, []);
            topicDocs.get(tId)!.push(d);
          }
        });

        topicDocs.forEach((docs, tId) => {
          docs.sort((a, b) => {
            const rankA = docTypeRank[a.document_type] || 99;
            const rankB = docTypeRank[b.document_type] || 99;
            return rankA - rankB;
          });

          const topDoc = docs[0];
          const unit = topDoc.learning_units;
          const topic = unit?.topics;

          const res: TopicLearningResolution = {
            topicId: tId,
            topicName: topic?.name || null,
            topicSlug: topic?.slug || null,
            hasPublishedLearning: true,
            learningSlug: topDoc.canonical_slug,
            learningTitle: unit?.title || topDoc.canonical_slug,
            documentType: topDoc.document_type,
            isCanonical: true,
            readingTimeMinutes: unit?.estimated_minutes || 10,
          };

          resultMap.set(tId, res);
          if (topic?.slug) {
            resultMap.set(topic.slug, res);
          }
        });
      }
    } catch {
      // Graceful fallback
    }

    // 2. For topics without canonical learning documents, query legacy published articles
    const unresolvedKeys = uniqueKeys.filter((k) => !resultMap.has(k));
    if (unresolvedKeys.length > 0) {
      try {
        const { data: legacyData } = await supabase
          .from("articles")
          .select("id, slug, published_at, learning_resources!inner(title, status, learning_resource_topics!inner(topic_id, topics!inner(id, name, slug)))")
          .eq("status", "PUBLISHED");

        if (legacyData && Array.isArray(legacyData)) {
          legacyData.forEach((a: any) => {
            const lr = a.learning_resources;
            const lrt = lr?.learning_resource_topics?.[0];
            const tId = lrt?.topic_id;
            const topic = lrt?.topics;
            const tSlug = topic?.slug;

            if (tId && (unresolvedKeys.includes(tId) || (tSlug && unresolvedKeys.includes(tSlug)))) {
              if (!resultMap.has(tId)) {
                const res: TopicLearningResolution = {
                  topicId: tId,
                  topicName: topic?.name || null,
                  topicSlug: tSlug || null,
                  hasPublishedLearning: true,
                  learningSlug: a.slug,
                  learningTitle: lr?.title || a.slug,
                  documentType: "CONCEPT_LESSON",
                  isCanonical: false,
                  readingTimeMinutes: 5,
                };
                resultMap.set(tId, res);
                if (tSlug) {
                  resultMap.set(tSlug, res);
                }
              }
            }
          });
        }
      } catch {
        // Graceful handling
      }
    }

    return resultMap;
  }

  /**
   * Resolves a single topic's primary published Learning Resource.
   */
  static async resolveLearningResourceForTopic(
    topicIdOrSlug: string,
    preferredDocType?: string
  ): Promise<TopicLearningResolution | null> {
    const map = await this.resolveLearningResourcesForTopics([topicIdOrSlug]);
    return map.get(topicIdOrSlug) || null;
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
