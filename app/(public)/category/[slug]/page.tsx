import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPage } from "@/components/exams/category-page";
import { loadPublicCategory } from "@/lib/exams/category-data";
import { constructMetadata } from "@/lib/seo/metadata";
import { categoryIntro } from "@/lib/exams/categories";

/**
 * PERF-HOME-1: the CACHED category page. Visitors never see this path: middleware.ts rewrites /exams/<category> here
 * (the canonical URL stays /exams/<category>: the page's canonical link points there). It reads no
 * cookie and no request header — public rows only (lib/exams/category-data.ts) — so it is rendered once and served from
 * the CDN, regenerated every 5 min and on demand when admins change categories / exams / logos
 * (lib/cache/revalidate-public.ts). Rendered on first request (no build-time network).
 */
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = await loadPublicCategory(slug);
  if (!cat) return constructMetadata({ title: "Exam Not Found", noIndex: true });
  return constructMetadata({
    title: `${cat.category.name} exams`,
    // UX-IMP-1: generated from the listed exams only (categoryIntro), never the admin free text
    description: (!cat.examsFailed && categoryIntro(cat.category.name, cat.exams)) || `${cat.category.name} exams on Courage Library: lessons, practice and mock tests.`,
    canonicalUrl: `/exams/${slug}`,
    ogImage: `/exams/${slug}/opengraph-image`,
    // noindex only when the read worked and the category really has no exam (an outage never de-indexes it)
    noIndex: !cat.examsFailed && cat.category.activeExams === 0,
  });
}

export default async function CachedCategoryPage({ params }: Props) {
  const { slug } = await params;
  const cat = await loadPublicCategory(slug);
  if (!cat) notFound();
  return <CategoryPage category={cat.category} exams={cat.exams} examsFailed={cat.examsFailed} />;
}
