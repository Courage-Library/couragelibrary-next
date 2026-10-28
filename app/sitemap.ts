import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { siteConfig } from "@/config/site";
import { getAppEnv } from "@/config/env";
import { isFeatureEnabled } from "@/config/features";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamModuleKey } from "@/types/exam-knowledge";
import { learnSitemapEntries } from "@/lib/learn/sitemap";

export const revalidate = 3600; // Revalidate sitemap hourly
const SITEMAP_FETCH_TIMEOUT_MS = 8000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  // 1. Static public routes that exist and render for anonymous visitors (decision #49, UX-2a.1).
  //    Private/admin routes are omitted; scripts/test_ux2a_landing.cjs checks every static URL answers 200.
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
      url: `${baseUrl}${siteConfig.routes.currentAffairs}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
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
    // UX-2b public pages (indexable). Coming-soon exam hubs are noindex and never listed (only active exams below).
    ...["/pricing", "/about", "/cnts", "/contact", "/help", "/grievance", "/privacy", "/terms"].map((p) => ({
      url: `${baseUrl}${p}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  try {
    const env = getAppEnv();
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      return staticEntries;
    }

    const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      // CI-FLAKE-1: this route is prerendered by `next build` (ISR) — a hung or dropped connection must never stall or
      // crash the build: every request is bounded, and any failure falls back to the static entries below
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS) }) },
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
        // GAP2-2a: learning documents (FREE + PRO) replace legacy articles.
        .from("learning_documents")
        .select("canonical_slug, updated_at")
        .eq("status", "PUBLISHED")
        // CA-6: a node lesson's URL is its /learn master page (listed below); /articles/<slug> only redirects
        .neq("document_type", "NODE_LESSON")
        .not("current_published_version_id", "is", null),
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

    // C. Published learning documents (/articles/[canonical_slug])
    if (articlesRes.data && Array.isArray(articlesRes.data)) {
      for (const doc of articlesRes.data) {
        if (!doc.canonical_slug) continue;
        dynamicEntries.push({
          url: `${baseUrl}/articles/${doc.canonical_slug}`,
          lastModified: doc.updated_at ? new Date(doc.updated_at) : new Date(),
          changeFrequency: "weekly",
          priority: 0.75,
        });
      }
    }

    // CA-6. Master lesson pages (+ hreflang), exam courses and exam-topic pages — from published reads only
    try {
      const { data: servable } = await supabase.rpc("fn_servable_node_lessons");
      const lessons = (Array.isArray(servable) ? servable : []).map((l) => ({ nodeId: l.node_id, hiCurrent: l.hi_current, publishedAt: l.published_at }));
      if (lessons.length) {
        const { data: nodes } = await supabase.from("canonical_taxonomy_nodes").select("id, hierarchy_path").eq("is_active", true).in("id", lessons.map((l) => l.nodeId));
        const paths = Object.fromEntries((nodes || []).map((n) => [n.id, n.hierarchy_path]));
        const examCourses: { slug: string; nodeIds: string[] }[] = [];
        for (const [examId, exam] of activeExamsMap) {
          const { data: outline } = await supabase.rpc("fn_exam_course_outline", { p_exam_id: examId });
          const chapters = outline && typeof outline === "object" && !Array.isArray(outline) && Array.isArray((outline as { chapters?: unknown }).chapters) ? ((outline as { chapters: Array<{ lessons?: Array<{ node_id?: string }> }> }).chapters) : [];
          examCourses.push({ slug: exam.slug, nodeIds: chapters.flatMap((c) => (c.lessons || []).map((l) => l.node_id).filter((x): x is string => typeof x === "string")) });
        }
        dynamicEntries.push(...learnSitemapEntries(baseUrl, lessons, paths, examCourses));
      }
    } catch {
      // the lesson entries are optional: the rest of the sitemap still renders
    }

    // D. Published Courses (/courses/[slug]) — only while FEATURE_COURSES is on (the pages 404 otherwise)
    if (isFeatureEnabled("COURSES") && coursesRes.data && Array.isArray(coursesRes.data)) {
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

