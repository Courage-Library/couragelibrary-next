import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/og-card";
import { LANDING_BRAND_LINE, LANDING_HERO } from "@/content/landing";
import { loadLiveCategoryNames } from "@/lib/exams/category-data";

/** HOME-1 expert UX pass: the branded share image for "/" (and the default for every page — config/site.ts ogImage). */
export const dynamic = "force-dynamic";
export const alt = "Courage Library: free preparation for government exams";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogCard({ eyebrow: LANDING_BRAND_LINE, title: LANDING_HERO.title(await loadLiveCategoryNames()), subtitle: LANDING_HERO.note });
}
