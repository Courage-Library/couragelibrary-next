import { siteConfig } from "@/config/site";
import type { BreadcrumbItem, JsonLdArticleProps, JsonLdFaqProps } from "@/types/seo";
import { ORGANIZATION_LOGO_PATH } from "@/lib/seo/brand-icons";

export function generateOrganizationSchema() {
  const sameAsLinks = Object.values(siteConfig.links).filter(
    (link): link is string => typeof link === "string" && link.trim().length > 0
  );

  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}${ORGANIZATION_LOGO_PATH}`, // SEO-1: the final logo suite
    description: siteConfig.description,
    ...(sameAsLinks.length > 0 && { sameAs: sameAsLinks }),
  };
}

/**
 * SEO-1: BreadcrumbList items. Google requires `item` (a URL) on every crumb but the last, so a middle crumb with no
 * page of its own (e.g. a subject without a hub) is left out of the structured data and the positions are renumbered.
 * The visible trail is unchanged. `href` is site-relative or absolute.
 */
export function breadcrumbListItems(items: readonly BreadcrumbItem[], base: string = siteConfig.url) {
  const kept = items.filter((item, index) => index === items.length - 1 || Boolean(item.href));
  return kept.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.label,
    ...(item.href && { item: new URL(item.href, base).toString() }),
  }));
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbListItems(items),
  };
}

export function generateArticleSchema({
  headline,
  description,
  url,
  image = siteConfig.ogImage,
  datePublished,
  dateModified,
  authorName = "Courage Library",
  articleType = "Article",
}: JsonLdArticleProps) {
  return {
    "@context": "https://schema.org",
    "@type": articleType,
    headline,
    description,
    image: image.startsWith("http") ? image : `${siteConfig.url}${image}`,
    url: `${siteConfig.url}${url}`,
    datePublished: datePublished || new Date().toISOString(),
    dateModified: dateModified || new Date().toISOString(),
    author: {
      "@type": "Organization",
      name: authorName,
      url: siteConfig.url,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      logo: {
        "@type": "ImageObject",
        url: `${siteConfig.url}${ORGANIZATION_LOGO_PATH}`, // SEO-1: the final logo suite
      },
    },
  };
}

export function generateFaqSchema({ questions }: JsonLdFaqProps) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };
}
