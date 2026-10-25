import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { PublicPageHeader } from "@/components/public/public-page";
import { Container, Section } from "@/components/ui/layout";
import { GRIEVANCE_OFFICER as O, GRIEVANCE_PAGE, GRIEVANCE_PHONE_HREF, GRIEVANCE_TIMELINES } from "@/content/support";
import { constructMetadata } from "@/lib/seo/metadata";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";

/**
 * F11 (#79) grievance redressal — the appointed Grievance Officer and response times, from content/support.ts (the
 * single source). The online ticket is offered only while the ticket form is on (never a link to a 404).
 */
export const metadata: Metadata = constructMetadata({ title: GRIEVANCE_PAGE.meta.title, description: GRIEVANCE_PAGE.meta.description, canonicalUrl: "/grievance" });

const link = "focus-ring font-medium text-link underline underline-offset-2";

export default function GrievancePage() {
  const tickets = isSupportTicketsEnabled();
  return (
    <>
      <PublicPageHeader title={GRIEVANCE_PAGE.title} lead={GRIEVANCE_PAGE.lead} crumbs={[{ label: GRIEVANCE_PAGE.title }]} />
      <Section spacing="compact">
        <Container className="flex max-w-3xl flex-col gap-6" data-grievance-page="">
          <Card>
            <CardTitle as="h2">{GRIEVANCE_PAGE.officerTitle}</CardTitle>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-body sm:grid-cols-[10rem_1fr]" data-grievance-officer="">
              <dt className="font-medium text-fg-secondary">Name</dt>
              <dd className="text-fg">{O.name}</dd>
              <dt className="font-medium text-fg-secondary">Designation</dt>
              <dd className="text-fg">{O.designation}</dd>
              <dt className="font-medium text-fg-secondary">Email</dt>
              <dd>
                <a href={`mailto:${O.email}?subject=Grievance`} className={`${link} inline-flex min-h-12 items-center`}>
                  {O.email}
                </a>
              </dd>
              <dt className="font-medium text-fg-secondary">Phone</dt>
              <dd className="flex flex-col">
                <a href={GRIEVANCE_PHONE_HREF} className={`${link} inline-flex min-h-12 items-center`}>
                  {O.phone}
                </a>
                <span className="text-body-sm text-fg-secondary">{O.phoneHours}</span>
              </dd>
              <dt className="font-medium text-fg-secondary">Address</dt>
              <dd className="text-fg">{O.postalAddress}</dd>
            </dl>
          </Card>
          <Card data-grievance-timelines="">
            <CardTitle as="h2">{GRIEVANCE_PAGE.timelinesTitle}</CardTitle>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg">
              <li>{GRIEVANCE_TIMELINES.acknowledge}</li>
              <li>{GRIEVANCE_TIMELINES.resolve}</li>
            </ul>
          </Card>
          <Card>
            <CardTitle as="h2">{GRIEVANCE_PAGE.howTitle}</CardTitle>
            <p className="text-body text-fg" data-grievance-channels="">
              {tickets ? GRIEVANCE_PAGE.channels : GRIEVANCE_PAGE.channelsNoTickets}
            </p>
            {tickets && (
              <Link href="/help/tickets/new" className={`${link} inline-flex min-h-12 w-fit items-center`}>
                {GRIEVANCE_PAGE.ticketLink}
              </Link>
            )}
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-secondary">
              {GRIEVANCE_PAGE.how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Card>
        </Container>
      </Section>
    </>
  );
}
