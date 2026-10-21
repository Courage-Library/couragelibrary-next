import type { Metadata } from "next";
import { LegalPage } from "@/components/public/public-page";
import { TERMS_PAGE } from "@/content/public-pages";
import { constructMetadata } from "@/lib/seo/metadata";

/**
 * UX-2b /terms: plain-English DRAFT terms for early access (content/public-pages.ts). Carries the visible
 * "Draft — under legal review" notice until approved. Public sign-up stays OFF until then.
 */
export const metadata: Metadata = constructMetadata({ title: TERMS_PAGE.meta.title, description: TERMS_PAGE.meta.description, canonicalUrl: "/terms" });

export default function TermsPage() {
  return <LegalPage title={TERMS_PAGE.title} sections={TERMS_PAGE.sections} crumb={{ label: "Terms" }} />;
}
