import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { LandingPageV1 } from "@/components/landing-v1/landing-page";
import { LANDING_HI } from "@/content/landing-page/hi";
import { landingOrganizationJsonLd } from "@/lib/landing/organization-jsonld";
import { landingFaqJsonLd, landingMetadata, loadLandingFacts } from "@/lib/landing/landing-page-data";
import { resolveLandingCopy } from "@/lib/landing/landing-copy";

/**
 * LANDING-1 — the Hindi landing page "/hi" (owner L1, 2026-11-21): the same page as "/" in Hindi, static and
 * server-rendered (no client text swap). PERF-HOME-1 applies here too: cached (ISR), no cookie, no request header.
 */
export const revalidate = 300;

export const metadata: Metadata = landingMetadata(LANDING_HI);

export default async function HindiHomePage() {
  // owner round 3: the copy follows published data (live exams, published Hindi content, the sign-up setting)
  const { live, facts } = await loadLandingFacts();
  const { t, start } = resolveLandingCopy(LANDING_HI, facts);
  return (
    <>
      <JsonLd data={landingOrganizationJsonLd()} />
      <JsonLd data={landingFaqJsonLd(t)} />
      <LandingPageV1 t={t} start={start} live={live.categories} liveExams={live.liveExamSlugs} />
    </>
  );
}
