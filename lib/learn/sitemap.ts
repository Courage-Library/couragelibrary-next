/**
 * CA-6: sitemap entries for the lesson surfaces — pure (unit-tested by scripts/test_ca6_seo.cjs). The inputs come ONLY
 * from published reads (fn_servable_node_lessons = published node lessons; fn_exam_course_outline = published syllabi ∩
 * published lessons), so a draft can never be listed; the caller drops QA test content and INTERNAL nodes never reach
 * fn_servable_node_lessons (CA-7). Per lesson:
 *   /learn/<path>            (+ hreflang en / hi / x-default when a Hindi version is published)
 *   /hi/learn/<path>         only when the Hindi version is published (an unpublished Hindi page is noindex)
 *   /exams/<exam>/course     per exam whose course is LIVE (CA-7 launch) and has at least one lesson
 *   /exams/<exam>/<path>     per lesson node in that exam's course (the unique exam-topic page)
 */
import type { MetadataRoute } from "next";
import { examTopicHref, learnHref } from "@/lib/learn/paths";

export interface SitemapLesson {
  nodeId: string;
  hiCurrent: boolean;
  publishedAt: string | null;
}

export function learnSitemapEntries(base: string, lessons: SitemapLesson[], paths: Record<string, string>, examCourses: { slug: string; nodeIds: string[]; live: boolean }[]): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  const withPath = lessons.filter((l) => paths[l.nodeId]);
  for (const l of withPath) {
    const p = paths[l.nodeId];
    const en = `${base}${learnHref(p)}`;
    const hi = `${base}${learnHref(p, "hi")}`;
    const lastModified = l.publishedAt ? new Date(l.publishedAt) : new Date();
    const alternates = l.hiCurrent ? { languages: { en, hi, "x-default": en } } : undefined;
    out.push({ url: en, lastModified, changeFrequency: "weekly", priority: 0.8, ...(alternates ? { alternates } : {}) });
    if (l.hiCurrent) out.push({ url: hi, lastModified, changeFrequency: "weekly", priority: 0.7, alternates: { languages: { en, hi, "x-default": en } } });
  }
  const published = new Set(withPath.map((l) => l.nodeId));
  for (const e of examCourses) {
    const ids = e.nodeIds.filter((id) => published.has(id));
    if (!ids.length) continue;
    if (e.live) out.push({ url: `${base}/exams/${e.slug}/course`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 });
    for (const id of [...new Set(ids)]) out.push({ url: `${base}${examTopicHref(e.slug, paths[id])}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 });
  }
  return out;
}
