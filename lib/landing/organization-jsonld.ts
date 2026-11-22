import { siteConfig } from "@/config/site";
import { SHELL_COPY } from "@/content/landing";
import { ORGANIZATION_LOGO_PATH } from "@/lib/seo/brand-icons";

/** UX-2a Organization JSON-LD for "/": documented facts only (no social profiles, ratings or counts). */
export function landingOrganizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: siteConfig.name,
    url: siteConfig.url,
    email: SHELL_COPY.supportEmail,
    logo: `${siteConfig.url}${ORGANIZATION_LOGO_PATH}`, // SEO-1: the final logo suite (square mark, 512 px)
    address: { "@type": "PostalAddress", addressLocality: "Kanpur", addressRegion: "Uttar Pradesh", addressCountry: "IN" },
  };
}

/**
 * SEO-1: WebSite JSON-LD for "/" and "/hi" (the site name Google shows). No SearchAction: the site has no public search
 * results URL to point at, and a SearchAction to a page that does not exist is misleading markup.
 */
export function landingWebSiteJsonLd(lang: "en" | "hi"): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: `${siteConfig.url}/`,
    inLanguage: lang,
    publisher: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
  };
}
