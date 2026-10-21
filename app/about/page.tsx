import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PublicPageHeader, PublicSection } from "@/components/public/public-page";
import { ABOUT_PAGE } from "@/content/public-pages";
import { constructMetadata } from "@/lib/seo/metadata";

/** UX-2b /about: the Courage Library story (documented facts only — content/public-pages.ts). Static. */
export const metadata: Metadata = constructMetadata({ title: ABOUT_PAGE.meta.title, description: ABOUT_PAGE.meta.description, canonicalUrl: "/about" });

export default function AboutPage() {
  return (
    <>
      <PublicPageHeader title={ABOUT_PAGE.title} lead={ABOUT_PAGE.lead} crumbs={[{ label: "About" }]} />
      <PublicSection id="started" title={ABOUT_PAGE.startedHeading}>
        <p className="max-w-prose text-body-lg text-fg-secondary">{ABOUT_PAGE.started}</p>
      </PublicSection>
      <PublicSection id="building" title={ABOUT_PAGE.buildingHeading}>
        <p className="max-w-prose text-body-lg text-fg-secondary">{ABOUT_PAGE.building}</p>
      </PublicSection>
      <PublicSection id="loop" title={ABOUT_PAGE.loopHeading} sunken>
        <p className="max-w-prose text-body-lg text-fg-secondary">{ABOUT_PAGE.loopLead}</p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ABOUT_PAGE.loopSteps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
              <h3 className="flex items-center gap-2 text-body-lg font-semibold text-fg">
                <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-body-sm font-semibold text-fg-inverse">
                  {i + 1}
                </span>
                <span className="sr-only">{`Step ${i + 1}: `}</span>
                {step.title}
              </h3>
              <p className="text-body-sm text-fg-secondary">{step.text}</p>
            </li>
          ))}
        </ol>
      </PublicSection>
      <PublicSection id="today" title={ABOUT_PAGE.todayHeading}>
        <p className="max-w-prose text-body-lg text-fg-secondary">{ABOUT_PAGE.today}</p>
        <div className="flex flex-wrap gap-3">
          {ABOUT_PAGE.ctas.map((c, i) => (
            <ButtonLink key={c.href} href={c.href} variant={i === 0 ? "primary" : "secondary"}>
              {c.label}
            </ButtonLink>
          ))}
        </div>
      </PublicSection>
    </>
  );
}
