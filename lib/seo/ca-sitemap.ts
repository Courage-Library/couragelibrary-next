import type { MetadataRoute } from "next";

/**
 * SITEMAP-CA-1 (2026-11-22): the Current Affairs part of /sitemap.xml, as a pure function (gated by
 * scripts/test_sitemap_ca1.cjs).
 *
 * CA isolation rule: a URL is listed only for an article that is PUBLISHED, has a published-version pointer, and whose
 * pointed-to version is itself PUBLISHED (the same rows the public CA pages can render). DRAFT / IN_REVIEW / APPROVED /
 * ARCHIVED items, a PUBLISHED row without a pointer, or a pointer to a non-published version are never listed — even if
 * the read were ever widened. Date and month pages are listed only for days / months that hold such an article.
 * lastmod comes from the published version (then the article's published_at); never "now" for a CA URL.
 *
 * The read that feeds this is the public (anon) client with RLS — never a service-role read.
 */

export type CaSitemapRow = {
  slug: string | null;
  status: string | null;
  published_version_id: string | null;
  news_date: string | null;
  published_at: string | null;
  updated_at: string | null;
  published_version: { status: string | null; published_at: string | null } | null;
};

/** Sitemap files hold at most 50,000 URLs; the CA part is capped well below that (the rest of the site shares the file). */
export const CA_SITEMAP_MAX_ARTICLES = 40000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isListableCa(row: CaSitemapRow): boolean {
  return (
    row.status === "PUBLISHED" &&
    typeof row.published_version_id === "string" &&
    row.published_version_id.length > 0 &&
    typeof row.slug === "string" &&
    row.slug.trim().length > 0 &&
    row.published_version !== null &&
    typeof row.published_version === "object" &&
    row.published_version.status === "PUBLISHED"
  );
}

function lastModOf(row: CaSitemapRow): Date | undefined {
  const raw = row.published_version?.published_at ?? row.published_at ?? row.updated_at;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const later = (a: Date | undefined, b: Date | undefined) => (!a ? b : !b ? a : a > b ? a : b);

export type CaSitemapResult = { entries: MetadataRoute.Sitemap; counts: { articles: number; dates: number; months: number }; capped: boolean };

export function caSitemapEntries(baseUrl: string, rows: readonly CaSitemapRow[]): CaSitemapResult {
  const listable = rows.filter(isListableCa);
  // newest first, so a cap keeps the freshest articles
  listable.sort((a, b) => (lastModOf(b)?.getTime() ?? 0) - (lastModOf(a)?.getTime() ?? 0));
  const capped = listable.length > CA_SITEMAP_MAX_ARTICLES;
  const kept = capped ? listable.slice(0, CA_SITEMAP_MAX_ARTICLES) : listable;

  const entries: MetadataRoute.Sitemap = [];
  const dates = new Map<string, Date | undefined>();
  const months = new Map<string, Date | undefined>();
  const seen = new Set<string>();

  for (const row of kept) {
    const slug = (row.slug as string).trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    const lastModified = lastModOf(row);
    entries.push({ url: `${baseUrl}/current-affairs/${encodeURIComponent(slug)}`, ...(lastModified ? { lastModified } : {}), changeFrequency: "daily", priority: 0.85 });
    const day = typeof row.news_date === "string" ? row.news_date.slice(0, 10) : "";
    if (DAY.test(day)) {
      dates.set(day, later(dates.get(day), lastModified));
      const month = day.slice(0, 7);
      months.set(month, later(months.get(month), lastModified));
    }
  }

  for (const day of [...dates.keys()].sort().reverse()) {
    const lastModified = dates.get(day);
    entries.push({ url: `${baseUrl}/current-affairs/date/${day}`, ...(lastModified ? { lastModified } : {}), changeFrequency: "daily", priority: 0.75 });
  }
  for (const month of [...months.keys()].sort().reverse()) {
    const lastModified = months.get(month);
    entries.push({ url: `${baseUrl}/current-affairs/month/${month}`, ...(lastModified ? { lastModified } : {}), changeFrequency: "weekly", priority: 0.7 });
  }

  return { entries, counts: { articles: seen.size, dates: dates.size, months: months.size }, capped };
}

/**
 * SITEMAP-CA-1: no silent read failure. One structured warning per failed read: the source and the error code / name
 * only — never the message (a network error can carry a host), never a key or a row.
 */
export function logSitemapReadFailure(source: string, error: unknown): void {
  const e = (error ?? {}) as { code?: unknown; name?: unknown };
  const code = typeof e.code === "string" && e.code ? e.code : typeof e.name === "string" && e.name ? e.name : "UNKNOWN";
  console.warn(`[sitemap] ${JSON.stringify({ event: "SITEMAP_READ_FAILED", source, code })}`);
}
