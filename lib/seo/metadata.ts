import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { SITE_ICONS } from "@/lib/seo/brand-icons";
import type { SeoMetadataProps } from "@/types/seo";

/** SEO-1: a result title keeps the brand suffix only while the whole title fits (search results cut near 60). */
export const SEO_TITLE_MAX = 60;
/** SEO-1: search results cut descriptions near 155–160 characters; longer ones end mid-word. */
export const SEO_DESCRIPTION_MAX = 160;

export function seoTitle(title?: string): string {
  if (!title) return `${siteConfig.name} — ${siteConfig.tagline}`;
  const withBrand = `${title} | ${siteConfig.name}`;
  return withBrand.length <= SEO_TITLE_MAX ? withBrand : title;
}

/** Clamp to SEO_DESCRIPTION_MAX at a word boundary (an ellipsis marks the cut); short text is returned unchanged. */
export function seoDescription(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SEO_DESCRIPTION_MAX) return t;
  const cut = t.slice(0, SEO_DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

export function constructMetadata({
  title,
  description = siteConfig.description,
  keywords,
  canonicalUrl,
  ogImage = siteConfig.ogImage,
  ogType = "website",
  publishedTime,
  modifiedTime,
  noIndex = false,
}: SeoMetadataProps = {}): Metadata {
  const fullTitle = seoTitle(title);
  const desc = seoDescription(description);

  // SEO-1: a canonical (and og:url) only for a page that names its own URL. The root layout calls this without one;
  // before SEO-1 that default ("/") was inherited by every page that set none — sign-in, dashboard, test pages… all
  // claimed to be a copy of the home page.
  const url = canonicalUrl ? `${siteConfig.url}${canonicalUrl}` : null;
  const fullOgImage = ogImage.startsWith("http") ? ogImage : `${siteConfig.url}${ogImage}`;

  return {
    title: fullTitle,
    description: desc,
    keywords: keywords || [
      "Government Exam Preparation",
      "SSC CGL",
      "SSC GD",
      "UP Police Constable",
      "Army Agniveer GD",
      "Railway NTPC",
      "Mock Tests",
      "General Awareness",
      "Courage Library",
    ],
    authors: [{ name: "Courage Library Team", url: siteConfig.url }],
    creator: "Courage Library",
    metadataBase: new URL(siteConfig.url),
    // SEO-1: the final logo suite, static files (lib/seo/brand-icons.ts)
    icons: { icon: SITE_ICONS.icon.map((i) => ({ ...i })), shortcut: SITE_ICONS.shortcut, apple: { ...SITE_ICONS.apple } },
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title: fullTitle,
      description: desc,
      ...(url ? { url } : {}),
      siteName: siteConfig.name,
      locale: "en_IN",
      images: [
        {
          url: fullOgImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      type: ogType,
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: desc,
      images: [fullOgImage],
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}
