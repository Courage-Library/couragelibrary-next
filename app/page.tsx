import { Suspense } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import {
  LandingDataSkeleton,
  LandingExams,
  LandingFeatures,
  LandingFinalCta,
  LandingHero,
  LandingLoop,
  LandingPlans,
  LandingTrust,
} from "@/components/landing/landing-sections";
import { LANDING_META } from "@/content/landing";
import { loadLandingData } from "@/lib/landing/landing-data";
import { landingOrganizationJsonLd } from "@/lib/landing/organization-jsonld";
import { constructMetadata } from "@/lib/seo/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * UX-2a landing page. Public for everyone (signed-in visitors are not redirected). Live, honest data only
 * (lib/landing/landing-data: published rows through the visitor's own RLS; failure → no-number fallback).
 * The page itself is synchronous, so the hero and static sections are part of the first HTML flush (not a
 * streamed segment behind app/loading.tsx). The two data sections and the two session-dependent CTAs
 * (components/landing/landing-cta: display only) stream in through their own Suspense boundaries.
 */
export const dynamic = "force-dynamic";

const base = constructMetadata({ description: LANDING_META.description, canonicalUrl: "/" });
export const metadata: Metadata = {
  ...base,
  title: { absolute: LANDING_META.title },
  openGraph: { ...base.openGraph, title: LANDING_META.title, description: LANDING_META.description },
  twitter: { ...base.twitter, title: LANDING_META.title, description: LANDING_META.description },
};

async function LandingDataSections() {
  const data = await loadLandingData(await createServerSupabaseClient());
  return (
    <>
      <LandingExams data={data} />
      <LandingFeatures data={data} />
    </>
  );
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={landingOrganizationJsonLd()} />
      <LandingHero />
      <LandingLoop />
      <Suspense fallback={<LandingDataSkeleton />}>
        <LandingDataSections />
      </Suspense>
      <LandingPlans />
      <LandingTrust />
      <LandingFinalCta />
    </>
  );
}
