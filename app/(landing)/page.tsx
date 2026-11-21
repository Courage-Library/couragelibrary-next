import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { LandingPageV1 } from "@/components/landing-v1/landing-page";
import { LANDING_EN } from "@/content/landing-page/en";
import { landingOrganizationJsonLd } from "@/lib/landing/organization-jsonld";
import { landingFaqJsonLd, landingMetadata, loadLandingFacts } from "@/lib/landing/landing-page-data";
import { resolveLandingCopy } from "@/lib/landing/landing-copy";

/**
 * LANDING-1 — the English landing page "/" (docs/design/LANDING_V1_SPEC.md; owner decisions L1–L5, 2026-11-21).
 * PERF-HOME-1: cached (ISR) — regenerated every 5 min and on demand when admins change the categories
 * (lib/cache/revalidate-public.ts). The page reads no cookie and no request header.
 */
export const revalidate = 300;

export const metadata: Metadata = landingMetadata(LANDING_EN);

export default async function HomePage() {
  // owner round 3: the copy follows published data (live exams, published Hindi content, the sign-up setting)
  const { live, facts } = await loadLandingFacts();
  const { t, start } = resolveLandingCopy(LANDING_EN, facts);
  return (
    <>
      <JsonLd data={landingOrganizationJsonLd()} />
      <JsonLd data={landingFaqJsonLd(t)} />
      <LandingPageV1 t={t} start={start} live={live.categories} detail={{ shortNames: live.liveShortNames, moreComing: live.moreComing }} liveExams={live.liveExamSlugs} />
    </>
  );
}
