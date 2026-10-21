import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PublicPageHeader, PublicSection } from "@/components/public/public-page";
import { CNTS_PAGE } from "@/content/public-pages";
import { SHELL_COPY } from "@/content/landing";
import { constructMetadata } from "@/lib/seo/metadata";

/**
 * UX-2b /cnts: information page for the Courage National Talent Search. Registration is NOT open: no form, no
 * prices, no dates (none are documented). Static.
 */
export const metadata: Metadata = constructMetadata({ title: CNTS_PAGE.meta.title, description: CNTS_PAGE.meta.description, canonicalUrl: "/cnts" });

export default function CntsPage() {
  return (
    <>
      <PublicPageHeader title={CNTS_PAGE.title} lead={CNTS_PAGE.lead} crumbs={[{ label: "CNTS" }]} />
      <PublicSection id="registration" title={CNTS_PAGE.registrationTitle}>
        {/* the section heading already says "Registrations open soon"; no duplicate title on the notice */}
        <Alert tone="info" data-cnts-registration-closed="" className="max-w-prose">
          {CNTS_PAGE.registrationText}
        </Alert>
      </PublicSection>
      <PublicSection id="groups" title={CNTS_PAGE.groupsHeading} sunken>
        <ul className="grid gap-4 sm:grid-cols-2">
          {CNTS_PAGE.groups.map((g) => (
            <li key={g.name} className="flex">
              <Card className="w-full">
                <CardTitle as="h3">{g.name}</CardTitle>
                <CardDescription>{g.classes}</CardDescription>
              </Card>
            </li>
          ))}
        </ul>
      </PublicSection>
      <PublicSection id="parents" title={CNTS_PAGE.parentHeading}>
        <p className="max-w-prose text-body-lg text-fg-secondary">{CNTS_PAGE.parentText}</p>
      </PublicSection>
      <PublicSection id="details" title={CNTS_PAGE.detailsHeading}>
        <p className="max-w-prose text-body-lg text-fg-secondary">{CNTS_PAGE.detailsText}</p>
      </PublicSection>
      <PublicSection id="questions" title={CNTS_PAGE.questionsHeading}>
        <p className="max-w-prose text-body-lg text-fg-secondary">
          {CNTS_PAGE.questionsText}{" "}
          <a href={`mailto:${SHELL_COPY.supportEmail}`} className="focus-ring rounded-badge font-medium text-link underline underline-offset-2">
            {SHELL_COPY.supportEmail}
          </a>
        </p>
      </PublicSection>
    </>
  );
}
