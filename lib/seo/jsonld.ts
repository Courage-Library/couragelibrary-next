import { siteConfig } from "@/config/site";
import type { BreadcrumbItem, JsonLdArticleProps, JsonLdFaqProps } from "@/types/seo";

export function generateOrganizationSchema() {
  const sameAsLinks = Object.values(siteConfig.links).filter(
    (link): link is string => typeof link === "string" && link.trim().length > 0
  );

  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/images/logo.png`,
    description: siteConfig.description,
    ...(sameAsLinks.length > 0 && { sameAs: sameAsLinks }),
  };
}

export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href && { item: `${siteConfig.url}${item.href}` }),
    })),
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
}: JsonLdArticleProps) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
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
        url: `${siteConfig.url}/images/logo.png`,
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
