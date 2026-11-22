import type { MetadataRoute } from "next";

/**
 * SEO-1 (2026-11-22): the category hubs (/exams/<category>) in the sitemap. The same rule as the hub page's own
 * robots (app/(site)/exams/[slug]/page.tsx): a public category (active, not internal) with at least one active exam is
 * indexable; one with no active exam is noindex ("coming soon") and is never listed. Pure; gated by
 * scripts/test_seo1.cjs.
 */
export type CategorySitemapRow = { slug: string | null; is_active: boolean | null; is_internal: boolean | null; updated_at: string | null; id: string };
export type ActiveExamRow = { category_id: string | null; updated_at: string | null };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function categoryHubEntries(baseUrl: string, categories: readonly CategorySitemapRow[], activeExams: readonly ActiveExamRow[]): MetadataRoute.Sitemap {
  const newest = new Map<string, string | null>();
  for (const e of activeExams) {
    if (!e.category_id) continue;
    const prev = newest.get(e.category_id);
    newest.set(e.category_id, !prev || (e.updated_at && e.updated_at > prev) ? e.updated_at ?? prev ?? null : prev);
  }
  const out: MetadataRoute.Sitemap = [];
  for (const c of categories) {
    if (c.is_active !== true || c.is_internal !== false || !c.slug || !SLUG.test(c.slug) || !newest.has(c.id)) continue;
    const stamps = [c.updated_at, newest.get(c.id)].filter((x): x is string => Boolean(x)).sort();
    const last = stamps.length ? new Date(stamps[stamps.length - 1]) : undefined;
    out.push({ url: `${baseUrl}/exams/${c.slug}`, ...(last && !Number.isNaN(last.getTime()) ? { lastModified: last } : {}), changeFrequency: "weekly", priority: 0.85 });
  }
  return out;
}
