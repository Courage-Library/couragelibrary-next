import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { PublicPageHeader } from "@/components/public/public-page";
import { Container, Section } from "@/components/ui/layout";
import { GRIEVANCE_OFFICER, GRIEVANCE_PAGE, GRIEVANCE_TIMELINES, SUPPORT_EMAIL, grievanceOfficerReady } from "@/content/support";
import { constructMetadata } from "@/lib/seo/metadata";

/**
 * F11 (#79) grievance redressal. The officer block shows ONLY the owner-approved details (content/support.ts); until all
 * are filled it says they will be published and gives the real support email as the interim channel — never an invented
 * person. Response times appear only after the owner confirms them (R12).
 */
export const metadata: Metadata = constructMetadata({ title: GRIEVANCE_PAGE.meta.title, description: GRIEVANCE_PAGE.meta.description, canonicalUrl: "/grievance" });

export default function GrievancePage() {
  const ready = grievanceOfficerReady();
  return (
    <>
      <PublicPageHeader title={GRIEVANCE_PAGE.title} lead={GRIEVANCE_PAGE.lead} crumbs={[{ label: GRIEVANCE_PAGE.title }]} />
      <Section spacing="compact">
        <Container className="flex max-w-3xl flex-col gap-6" data-grievance-page="">
          <Card>
            <CardTitle as="h2">{GRIEVANCE_PAGE.officerTitle}</CardTitle>
            {ready ? (
              <dl className="grid grid-cols-1 gap-2 text-body sm:grid-cols-[10rem_1fr]" data-grievance-officer="">
                <dt className="font-medium text-fg-secondary">Name</dt>
                <dd className="text-fg">{GRIEVANCE_OFFICER.name}</dd>
                <dt className="font-medium text-fg-secondary">Designation</dt>
                <dd className="text-fg">{GRIEVANCE_OFFICER.designation}</dd>
                <dt className="font-medium text-fg-secondary">Email</dt>
                <dd>
                  <a href={`mailto:${GRIEVANCE_OFFICER.email}`} className="focus-ring text-link underline underline-offset-2">
                    {GRIEVANCE_OFFICER.email}
                  </a>
                </dd>
                <dt className="font-medium text-fg-secondary">Address</dt>
                <dd className="whitespace-pre-line text-fg">{GRIEVANCE_OFFICER.postalAddress}</dd>
              </dl>
            ) : (
              <div className="flex flex-col gap-2" data-grievance-pending="">
                <p className="text-body text-fg">{GRIEVANCE_PAGE.officerPending}</p>
                <p className="text-body text-fg-secondary">
                  {GRIEVANCE_PAGE.interim(SUPPORT_EMAIL)}{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=Grievance`} className="focus-ring font-medium text-link underline underline-offset-2">
                    Email us
                  </a>
                </p>
              </div>
            )}
          </Card>
          <Card>
            <CardTitle as="h2">{GRIEVANCE_PAGE.howTitle}</CardTitle>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-secondary">
              {GRIEVANCE_PAGE.how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Card>
          {GRIEVANCE_TIMELINES.confirmed && (
            <Card data-grievance-timelines="">
              <CardTitle as="h2">{GRIEVANCE_PAGE.timelinesTitle}</CardTitle>
              <p className="text-body text-fg-secondary">
                {GRIEVANCE_TIMELINES.acknowledge} {GRIEVANCE_TIMELINES.resolve}
              </p>
            </Card>
          )}
        </Container>
      </Section>
    </>
  );
}
