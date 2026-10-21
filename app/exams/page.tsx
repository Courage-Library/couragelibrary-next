import type { Metadata } from "next";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardLink, CardTitle } from "@/components/ui/card";
import { PublicPageHeader, PublicSection } from "@/components/public/public-page";
import { LANDING_EXAMS } from "@/content/landing";
import { COMING_SOON_EXAMS, EXAMS_PAGE } from "@/content/public-pages";
import { loadLandingData } from "@/lib/landing/landing-data";
import { constructMetadata } from "@/lib/seo/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * UX-2b /exams: directory of exams from the database (decision #32). ACTIVE exams are full cards with live counts
 * (lib/landing/landing-data: published rows through the visitor's own RLS, bounded by a timeout); a failed read shows
 * the no-number fallback. SSC CHSL / SSC MTS are honest "coming soon" cards linking to their noindex hubs, shown only
 * while they are not active.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = constructMetadata({ title: EXAMS_PAGE.meta.title, description: EXAMS_PAGE.meta.description, canonicalUrl: "/exams" });

export default async function ExamsDirectoryPage() {
  const data = await loadLandingData(await createServerSupabaseClient());
  const activeSlugs = new Set(data.ok ? data.exams.map((e) => e.slug) : []);
  const comingSoon = COMING_SOON_EXAMS.filter((c) => !activeSlugs.has(c.slug));

  return (
    <>
      <PublicPageHeader title={EXAMS_PAGE.title} lead={EXAMS_PAGE.lead} crumbs={[{ label: "Exams" }]} />
      <PublicSection id="available" title={EXAMS_PAGE.availableHeading}>
        {!data.ok ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6" data-exams-fallback="">
            <p className="text-body text-fg-secondary">{EXAMS_PAGE.fallback}</p>
            <ButtonLink href={EXAMS_PAGE.fallbackCta.href} variant="secondary">
              {EXAMS_PAGE.fallbackCta.label}
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.exams.map((exam) => (
              <li key={exam.slug} className="flex">
                <Card variant="interactive" className="w-full">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle as="h3">
                      <CardLink href={`/exams/${exam.slug}`}>{exam.title}</CardLink>
                    </CardTitle>
                    <GraduationCap aria-hidden="true" className="size-6 shrink-0 text-primary-600" />
                  </div>
                  {exam.category && <CardDescription>{exam.category}</CardDescription>}
                  <ul className="flex flex-wrap gap-2" aria-label={LANDING_EXAMS.glanceLabel(exam.title)}>
                    <li>
                      <Badge tone={exam.publishedMocks > 0 ? "free" : "neutral"}>
                        {exam.publishedMocks > 0 ? LANDING_EXAMS.mocks(exam.publishedMocks) : LANDING_EXAMS.noMocks}
                      </Badge>
                    </li>
                    {exam.publishedGuides > 0 && (
                      <li>
                        <Badge tone="info">{LANDING_EXAMS.guides(exam.publishedGuides)}</Badge>
                      </li>
                    )}
                    <li>
                      <Badge tone={exam.syllabusAvailable ? "success" : "neutral"}>
                        {exam.syllabusAvailable ? LANDING_EXAMS.syllabusAvailable : LANDING_EXAMS.syllabusSoon}
                      </Badge>
                    </li>
                  </ul>
                  <p className="mt-auto inline-flex items-center gap-1 pt-1 text-body-sm font-medium text-primary-700" aria-hidden="true">
                    {LANDING_EXAMS.cardCta}
                    <ArrowRight className="size-4" />
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </PublicSection>
      {comingSoon.length > 0 && (
        <PublicSection id="coming-soon" title={EXAMS_PAGE.comingSoonHeading} sunken>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((exam) => (
              <li key={exam.slug} className="flex">
                <Card variant="interactive" className="w-full border-dashed">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle as="h3">
                      <CardLink href={`/exams/${exam.slug}`}>{exam.title}</CardLink>
                    </CardTitle>
                    <Badge tone="neutral">{LANDING_EXAMS.comingSoonLabel}</Badge>
                  </div>
                  <CardDescription>{EXAMS_PAGE.comingSoonText}</CardDescription>
                  <p className="mt-auto inline-flex items-center gap-1 pt-1 text-body-sm font-medium text-primary-700" aria-hidden="true">
                    {EXAMS_PAGE.comingSoonCta}
                    <ArrowRight className="size-4" />
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </PublicSection>
      )}
    </>
  );
}
