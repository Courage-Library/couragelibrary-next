import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { SeoMetadataProps } from "@/types/seo";

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
  const fullTitle = title
    ? `${title} | ${siteConfig.name}`
    : `${siteConfig.name} — ${siteConfig.tagline}`;

  const url = canonicalUrl ? `${siteConfig.url}${canonicalUrl}` : siteConfig.url;
  const fullOgImage = ogImage.startsWith("http") ? ogImage : `${siteConfig.url}${ogImage}`;

  return {
    title: fullTitle,
    description,
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
    // HOME-1 brand (131): stable icon URLs → the uploaded square mark, else the official logo (app/brand/icon/[size])
    icons: {
      icon: [
        { url: "/brand/icon/32", sizes: "32x32", type: "image/png" },
        { url: "/brand/icon/192", sizes: "192x192", type: "image/png" },
      ],
      shortcut: "/brand/icon/32",
      apple: { url: "/brand/icon/180", sizes: "180x180", type: "image/png" },
    },
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: siteConfig.name,
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
      description,
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
