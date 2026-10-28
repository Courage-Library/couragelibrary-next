/**
 * CA-6: SEO helpers for lesson pages — pure (unit-tested by scripts/test_ca6_seo.cjs).
 *   learningResourceSchema   schema.org LearningResource; a Pro lesson carries Google's paywalled-content markup
 *                            (isAccessibleForFree false + hasPart → the gated section) — the title, intro and outline
 *                            stay visible; the gated body is never in the HTML for a viewer without access
 *   courseSchema             schema.org Course for an exam course page
 *   lessonAlternates         canonical + hreflang: EN is canonical; a published Hindi version gets its own URL with
 *                            en / hi / x-default (= en); without a Hindi version the /hi URL is noindex + canonical EN
 */
import { siteConfig } from "@/config/site";

export const PAYWALL_SELECTOR = ".lesson-gated-body";

const abs = (p: string) => `${siteConfig.url}${p}`;

export function learningResourceSchema(i: {
  name: string;
  description: string | null;
  path: string;
  language: "en" | "hi";
  isFree: boolean;
  datePublished: string | null;
  about: string[];
  educationalLevel?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: i.name,
    ...(i.description ? { description: i.description } : {}),
    url: abs(i.path),
    inLanguage: i.language,
    learningResourceType: "Lesson",
    ...(i.educationalLevel ? { educationalLevel: i.educationalLevel } : {}),
    ...(i.datePublished ? { datePublished: i.datePublished } : {}),
    about: i.about.map((name) => ({ "@type": "Thing", name })),
    provider: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    isAccessibleForFree: i.isFree,
    ...(i.isFree ? {} : { hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: PAYWALL_SELECTOR } }),
  };
}

export function courseSchema(i: { name: string; description: string; path: string; lessons: { name: string; path: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: i.name,
    description: i.description,
    url: abs(i.path),
    provider: { "@type": "Organization", name: siteConfig.name, sameAs: siteConfig.url },
    hasPart: i.lessons.slice(0, 100).map((l) => ({ "@type": "LearningResource", name: l.name, url: abs(l.path) })),
  };
}

export interface LessonAlternates {
  canonical: string;
  languages: Record<string, string> | null;
  noIndex: boolean;
}

/** enPath / hiPath = site paths; hiPublished = a current published Hindi version exists. */
export function lessonAlternates(i: { enPath: string; hiPath: string; language: "en" | "hi"; hiPublished: boolean; hasLesson: boolean }): LessonAlternates {
  const languages = i.hiPublished ? { en: abs(i.enPath), hi: abs(i.hiPath), "x-default": abs(i.enPath) } : null;
  if (i.language === "hi" && !i.hiPublished) return { canonical: i.enPath, languages: null, noIndex: true };
  return { canonical: i.language === "hi" ? i.hiPath : i.enPath, languages, noIndex: !i.hasLesson };
}

/** A JSON-LD script body: JSON with "<" escaped so lesson text can never close the script element. */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
