import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { LandingPageV1 } from "@/components/landing-v1/landing-page";
import { LANDING_HI } from "@/content/landing-page/hi";
import { landingOrganizationJsonLd, landingWebSiteJsonLd } from "@/lib/landing/organization-jsonld";
import { landingFaqJsonLd, landingMetadata, loadLandingFacts } from "@/lib/landing/landing-page-data";
import { resolveLandingCopy } from "@/lib/landing/landing-copy";

/**
 * LANDING-1 — the Hindi landing page "/hi" (owner L1, 2026-11-21): the same page as "/" in Hindi, static and
 * server-rendered (no client text swap). PERF-HOME-1 applies here too: cached (ISR), no cookie, no request header.
 */
export const revalidate = 300;

export const metadata: Metadata = landingMetadata(LANDING_HI);

/**
 * LIVE-GREEN-1 3c (owner): the Hindi text — the H1 first — is set in var(--font-devanagari) (Noto Sans Devanagari,
 * display SWAP). On /hi the H1 first rendered in a system Devanagari font and lost one line when the face swapped in
 * (LANDING1-PAGES L-8: CLS 0.087 @ 390 / 0.066 @ 1280); a route preload helped on a fast link only. So THIS page maps
 * --font-devanagari to the root layout's optional twin of the same file (--font-devanagari-optional, font-display
 * OPTIONAL): used when ready at once (cached / fast), otherwise the page keeps the fallback and NEVER swaps — no shift.
 * Every other page keeps the swap face. Gates: LANDING-1 LD-11, DESIGN-RATCHET R-4, LANDING1-PAGES L-8 (live CLS).
 */
const HI_FONT: CSSProperties = { ["--font-devanagari" as string]: "var(--font-devanagari-optional)" };

export default async function HindiHomePage() {
  // owner round 3: the copy follows published data (live exams, published Hindi content, the sign-up setting)
  const { live, facts } = await loadLandingFacts();
  const { t, start } = resolveLandingCopy(LANDING_HI, facts);
  return (
    <div style={HI_FONT} data-hi-font="optional">
      <JsonLd data={landingOrganizationJsonLd()} />
      <JsonLd data={landingWebSiteJsonLd("hi")} />
      <JsonLd data={landingFaqJsonLd(t)} />
      <LandingPageV1 t={t} start={start} live={live.categories} detail={{ shortNames: live.liveShortNames, moreComing: live.moreComing }} liveExams={live.liveExamSlugs} />
    </div>
  );
}
