import type { Metadata } from "next";
import { LegalPage } from "@/components/public/public-page";
import { PRIVACY_PAGE } from "@/content/public-pages";
import { constructMetadata } from "@/lib/seo/metadata";

/**
 * UX-2b /privacy: plain-English DRAFT describing what the platform actually does today (content/public-pages.ts).
 * Carries the visible "Draft — under legal review" notice until approved. Public sign-up stays OFF until then.
 */
export const metadata: Metadata = constructMetadata({ title: PRIVACY_PAGE.meta.title, description: PRIVACY_PAGE.meta.description, canonicalUrl: "/privacy" });

export default function PrivacyPage() {
  return <LegalPage title={PRIVACY_PAGE.title} sections={PRIVACY_PAGE.sections} crumb={{ label: "Privacy" }} />;
}
