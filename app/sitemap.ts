import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteConfig } from "@/config/site";
import { getAppEnv } from "@/config/env";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamModuleKey } from "@/types/exam-knowledge";

export const revalidate = 3600; // Revalidate sitemap hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  // 1. Static Canonical Public Roots (Private/Admin routes strictly omitted)
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}${siteConfig.routes.exams}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}${siteConfig.routes.learn}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}${siteConfig.routes.currentAffairs}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}${siteConfig.routes.blog}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/practice`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/mock-tests`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/flashcards`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  try {
    const env = getAppEnv();
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      return staticEntries;
    }

    const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // 2. Fetch Active Exams, Published Modules, Published Articles, Published Courses, Published Current Affairs in parallel
    const [examsRes, docsRes, articlesRes, coursesRes, caRes] = await Promise.all([
      supabase
        .from("exams")
        .select("id, slug, updated_at")
        .eq("is_active", true),
      supabase
        .from("exam_knowledge_documents")
        .select("exam_id, module_key, updated_at, status, current_published_version_id")
        .eq("status", "PUBLISHED")
        .not("current_published_version_id", "is", null),
      supabase
        .from("articles")
        .select("slug, updated_at, published_at")
        .eq("status", "PUBLISHED"),
      supabase
        .from("courses")
        .select("slug, updated_at")
        .eq("is_published", true),
      supabase
        .from("current_affairs_articles")
        .select("slug, updated_at, published_at, news_date")
        .eq("status", "PUBLISHED")
        .not("published_version_id", "is", null),
    ]);

    const dynamicEntries: MetadataRoute.Sitemap = [];
    const activeExamsMap = new Map<string, { slug: string; updated_at?: string }>();

    // A. Active Exam Hub URLs (/exams/[slug])
    if (examsRes.data && Array.isArray(examsRes.data)) {
      for (const exam of examsRes.data) {
        if (!exam.slug) continue;
        activeExamsMap.set(exam.id, { slug: exam.slug, updated_at: exam.updated_at });
        dynamicEntries.push({
          url: `${baseUrl}/exams/${exam.slug}`,
          lastModified: exam.updated_at ? new Date(exam.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.85,
        });
      }
    }

    // B. Published Exam Knowledge Module URLs (/exams/[slug]/[moduleSlug])
    if (docsRes.data && Array.isArray(docsRes.data)) {
      for (const doc of docsRes.data) {
        const exam = activeExamsMap.get(doc.exam_id);
        if (!exam || !doc.module_key) continue;

        const moduleSlug = ExamModuleRegistry.getModuleSlug(doc.module_key as ExamModuleKey);
        dynamicEntries.push({
          url: `${baseUrl}/exams/${exam.slug}/${moduleSlug}`,
          lastModified: doc.updated_at ? new Date(doc.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }

    // C. Published Articles (/articles/[slug])
    if (articlesRes.data && Array.isArray(articlesRes.data)) {
      for (const art of articlesRes.data) {
        if (!art.slug) continue;
        dynamicEntries.push({
          url: `${baseUrl}/articles/${art.slug}`,
          lastModified: art.updated_at
            ? new Date(art.updated_at)
            : art.published_at
            ? new Date(art.published_at)
            : new Date(),
          changeFrequency: "weekly",
          priority: 0.75,
        });
      }
    }

    // D. Published Courses (/courses/[slug])
    if (coursesRes.data && Array.isArray(coursesRes.data)) {
      for (const course of coursesRes.data) {
        if (!course.slug) continue;
        dynamicEntries.push({
          url: `${baseUrl}/courses/${course.slug}`,
          lastModified: course.updated_at ? new Date(course.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.75,
        });
      }
    }

    // E. Published Current Affairs Articles & Dates (/current-affairs/[slug], /date/[date], /month/[month])
    if (caRes.data && Array.isArray(caRes.data)) {
      const publishedDates = new Set<string>();
      const publishedMonths = new Set<string>();

      for (const art of caRes.data) {
        if (!art.slug) continue;
        const lastMod = art.published_at
          ? new Date(art.published_at)
          : art.updated_at
          ? new Date(art.updated_at)
          : new Date();

        dynamicEntries.push({
          url: `${baseUrl}/current-affairs/${art.slug}`,
          lastModified: lastMod,
          changeFrequency: "daily",
          priority: 0.85,
        });

        if (art.news_date) {
          const dateStr = typeof art.news_date === "string" ? art.news_date.split("T")[0] : "";
          if (dateStr) {
            publishedDates.add(dateStr);
            publishedMonths.add(dateStr.substring(0, 7));
          }
        }
      }

      // Add eligible Date pages
      for (const dateStr of Array.from(publishedDates).sort().reverse()) {
        dynamicEntries.push({
          url: `${baseUrl}/current-affairs/date/${dateStr}`,
          lastModified: new Date(),
          changeFrequency: "daily",
          priority: 0.75,
        });
      }

      // Add eligible Monthly Archive pages
      for (const monthStr of Array.from(publishedMonths).sort().reverse()) {
        dynamicEntries.push({
          url: `${baseUrl}/current-affairs/month/${monthStr}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }

    return [...staticEntries, ...dynamicEntries];
  } catch (error) {
    // Fail-safe: Always return static routes on database or network failure
    return staticEntries;
  }
}

