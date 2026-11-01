import { Suspense } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import {
  LandingCategories,
  LandingCategoriesSkeleton,
  LandingFaq,
  LandingFeatures,
  LandingFeaturesSkeleton,
  LandingFinalCta,
  LandingHero,
  LandingLoop,
  LandingPlans,
  LandingTrust,
  faqJsonLd,
} from "@/components/landing/landing-sections";
import { LANDING_META } from "@/content/landing";
import { loadPublicCategories } from "@/lib/exams/category-data";
import { loadLandingData } from "@/lib/landing/landing-data";
import { landingOrganizationJsonLd } from "@/lib/landing/organization-jsonld";
import { constructMetadata } from "@/lib/seo/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * HOME-1 landing page: hero → category tiles → how it works → what you get → trust → free and Pro → FAQ → final CTA.
 * Public for everyone. Live, honest data only. The page itself is synchronous (the hero + static sections are in the
 * first HTML flush); the two data sections and the session-dependent CTAs stream through their own Suspense boundaries.
 * No exam-specific content on home (owner rule).
 */
export const dynamic = "force-dynamic";

const base = constructMetadata({ description: LANDING_META.description, canonicalUrl: "/" });
export const metadata: Metadata = {
  ...base,
  title: { absolute: LANDING_META.title },
  openGraph: { ...base.openGraph, title: LANDING_META.title, description: LANDING_META.description },
  twitter: { ...base.twitter, title: LANDING_META.title, description: LANDING_META.description },
};

async function CategoriesSection() {
  return <LandingCategories categories={await loadPublicCategories()} />;
}

async function FeaturesSection() {
  return <LandingFeatures data={await loadLandingData(await createServerSupabaseClient())} />;
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={landingOrganizationJsonLd()} />
      <JsonLd data={faqJsonLd()} />
      <LandingHero />
      <Suspense fallback={<LandingCategoriesSkeleton />}>
        <CategoriesSection />
      </Suspense>
      <LandingLoop />
      <Suspense fallback={<LandingFeaturesSkeleton />}>
        <FeaturesSection />
      </Suspense>
      <LandingTrust />
      <LandingPlans />
      <LandingFaq />
      <LandingFinalCta />
    </>
  );
}
