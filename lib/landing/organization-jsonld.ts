import { siteConfig } from "@/config/site";
import { SHELL_COPY } from "@/content/landing";

/** UX-2a Organization JSON-LD for "/": documented facts only (no social profiles, ratings or counts). */
export function landingOrganizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: siteConfig.name,
    url: siteConfig.url,
    email: SHELL_COPY.supportEmail,
    logo: `${siteConfig.url}/images/logo.png`,
    address: { "@type": "PostalAddress", addressLocality: "Kanpur", addressRegion: "Uttar Pradesh", addressCountry: "IN" },
  };
}
