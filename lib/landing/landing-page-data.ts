import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { loadHindiAvailability } from "@/lib/landing/hindi-content";
import { getSignupAvailability } from "@/lib/auth/signup-availability";
import type { LandingFacts } from "@/lib/landing/landing-copy";
import { constructMetadata } from "@/lib/seo/metadata";
import { siteConfig } from "@/config/site";
import type { LandingCopy } from "@/content/landing-page/types";
import type { CategoryState } from "@/components/landing-v1/landing-page";

/**
 * LANDING-1 data + metadata for "/" and "/hi". PERF-HOME-1: both pages are ISR (cached HTML, the same for every
 * visitor) — this reads NO cookie and NO request header: only public rows through the cookie-free PUBLIC client
 * (RLS: active, non-internal categories; active exams), cached 5 min under the tag "categories" (dropped at once by
 * lib/cache/revalidate-public.ts on every admin write to categories / exams).
 * Owner L3: a category card is a link only while the category has ≥ 1 live exam; a chip shows only for an exam that
 * is live. A failed read is retried once; if it still fails → every card "Coming soon" and no chip (never an invented
 * link), and nothing is cached by unstable_cache (the next request tries again).
 * Owner round 3: FAQ 1 names the live exams (their titles); the Hindi lines follow the PUBLISHED Hindi content
 * (lib/landing/hindi-content.ts: the public client + the public read function fn_public_hindi_question_count, migration
 * 145); the start action follows the cached sign-up setting (lib/auth/signup-availability.ts: the public auth settings
 * endpoint with the anon key, cached 60 s). Never the service role; no cookie, no header.
 */
export interface LandingLiveData {
  categories: CategoryState;
  liveExamSlugs: string[];
  liveExamNames: string[];
}

async function readOnce(): Promise<LandingLiveData | null> {
  const sb = createPublicServerSupabaseClient();
  const timed = <T>(p: PromiseLike<T>): Promise<T | null> =>
    Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), 8000))]).catch(() => null);
  const [cats, exams] = await Promise.all([
    timed(sb.from("exam_categories").select("id, slug, is_active, is_internal")),
    timed(sb.from("exams").select("slug, title, category_id").eq("is_active", true).order("title")),
  ]);
  if (!cats || cats.error || !cats.data || !exams || exams.error || !exams.data) return null;
  const count = new Map<string, number>();
  for (const e of exams.data) if (e.category_id) count.set(e.category_id, (count.get(e.category_id) ?? 0) + 1);
  const categories: CategoryState = {};
  for (const c of cats.data) if (c.is_active && !c.is_internal) categories[c.slug] = (count.get(c.id) ?? 0) > 0;
  return {
    categories,
    liveExamSlugs: exams.data.map((e) => e.slug).filter((x): x is string => typeof x === "string"),
    liveExamNames: exams.data.map((e) => e.title).filter((x): x is string => typeof x === "string" && x.trim().length > 0),
  };
}

const readLandingLiveCached = unstable_cache(
  async (): Promise<LandingLiveData> => {
    const r = (await readOnce()) ?? (await readOnce());
    if (!r) throw new Error("landing read failed"); // not cached
    return r;
  },
  ["landing-v1-live", "v1"],
  { tags: ["categories"], revalidate: 300 },
);

export function loadLandingLiveData(): Promise<LandingLiveData> {
  return readLandingLiveCached().catch(() => ({ categories: {}, liveExamSlugs: [], liveExamNames: [] }));
}

/** Everything the landing page shows that depends on data: categories, chips, live exam names, Hindi, sign-up. */
export async function loadLandingFacts(): Promise<{ live: LandingLiveData; facts: LandingFacts }> {
  const [live, hindi, signup] = await Promise.all([
    loadLandingLiveData(),
    loadHindiAvailability(),
    getSignupAvailability().catch(() => "unknown" as const),
  ]);
  const hindiLive = !!hindi && hindi.questions + hindi.lessons + hindi.currentAffairs > 0;
  return { live, facts: { liveExamNames: live.liveExamNames, hindiLive, signupOpen: signup !== "closed" } };
}

/** Canonical + hreflang (owner L1): en → "/", hi → "/hi", x-default → "/". */
export function landingMetadata(t: LandingCopy): Metadata {
  const path = t.lang === "hi" ? "/hi" : "/";
  const base = constructMetadata({ description: t.meta.description, canonicalUrl: t.lang === "hi" ? "/hi" : "" });
  const abs = (p: string) => `${siteConfig.url}${p === "/" ? "" : p}`;
  return {
    ...base,
    title: { absolute: t.meta.title },
    alternates: {
      canonical: abs(path),
      languages: { en: abs("/"), hi: abs("/hi"), "x-default": abs("/") },
    },
    openGraph: { ...base.openGraph, title: t.meta.title, description: t.meta.description, url: abs(path), locale: t.lang === "hi" ? "hi_IN" : "en_IN" },
    twitter: { ...base.twitter, title: t.meta.title, description: t.meta.description },
  };
}

/** The FAQ JSON-LD = exactly the visible FAQ of that language. */
export function landingFaqJsonLd(t: LandingCopy): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: t.lang,
    mainEntity: t.faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
