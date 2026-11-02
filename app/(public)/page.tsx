import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import {
  LandingCategories,
  LandingFaq,
  LandingFeatures,
  LandingFinalCta,
  LandingHero,
  LandingLoop,
  LandingPlans,
  LandingTrust,
  faqJsonLd,
} from "@/components/landing/landing-sections";
import { LANDING_META } from "@/content/landing";
import { loadPublicCategories } from "@/lib/exams/category-data";
import { loadHomeFacts } from "@/lib/landing/home-facts";
import { LandingEnhancements } from "@/components/landing/landing-enhancements";
import { loadLandingData } from "@/lib/landing/landing-data";
import { loadGallery } from "@/lib/media/site-media";
import { landingOrganizationJsonLd } from "@/lib/landing/organization-jsonld";
import { constructMetadata } from "@/lib/seo/metadata";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { getSignupAvailability } from "@/lib/auth/signup-availability";

/**
 * HOME-1 landing page: hero → category tiles → how it works → what you get → trust → free and Pro → FAQ → final CTA.
 * Public for everyone. Live, honest data only. Cached (ISR): all data is read before rendering (PERF-HOME-1b).
 * No exam-specific content on home (owner rule).
 */
// PERF-HOME-1: cached (ISR) — regenerated every 5 min and on demand when admins change what it shows
// (lib/cache/revalidate-public.ts). The page reads no cookie and no request header.
export const revalidate = 300;

const base = constructMetadata({ description: LANDING_META.description, canonicalUrl: "/" });
export const metadata: Metadata = {
  ...base,
  title: { absolute: LANDING_META.title },
  openGraph: { ...base.openGraph, title: LANDING_META.title, description: LANDING_META.description },
  twitter: { ...base.twitter, title: LANDING_META.title, description: LANDING_META.description },
};

export default async function HomePage() {
  // PERF-HOME-1b: the page is cached HTML, rendered in the background (ISR) — so it reads EVERYTHING before rendering
  // and the cached HTML is final: no streamed placeholder is swapped for a different-height section on a slow
  // connection (production CLS 0.13–0.38 on warm loads). Every read is bounded and never rejects (fallbacks: no
  // numbers, text-only trust, closed sign-up view). HOME-1: the hero names only categories with live exams; the Hindi
  // chip + FAQ answer follow the published Hindi content (lib/landing/home-facts.ts).
  const [{ liveCategories, hindi }, categories, data, photos, signup] = await Promise.all([
    loadHomeFacts(),
    loadPublicCategories(),
    loadLandingData(createPublicServerSupabaseClient()),
    loadGallery(),
    getSignupAvailability(),
  ]);
  const signupOpen = signup !== "closed";
  return (
    <>
      <JsonLd data={landingOrganizationJsonLd()} />
      <JsonLd data={faqJsonLd(hindi)} />
      <LandingHero liveCategories={liveCategories} hindi={hindi} signupOpen={signupOpen} />
      <LandingCategories categories={categories} />
      <LandingLoop />
      <LandingFeatures data={data} />
      <LandingTrust photos={photos} />
      <LandingPlans />
      <LandingFaq hindi={hindi} />
      <LandingFinalCta signupOpen={signupOpen} />
      <LandingEnhancements />
    </>
  );
}
