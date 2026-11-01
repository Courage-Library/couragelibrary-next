import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Card, CardTitle } from "@/components/ui/card";
import { PublicPageHeader } from "@/components/public/public-page";
import { Container, Section } from "@/components/ui/layout";
import { GRIEVANCE_OFFICER, GRIEVANCE_PHONE_HREF, GRIEVANCE_TIMELINES, HELP_PAGE, SUPPORT_EMAIL } from "@/content/support";
import { constructMetadata } from "@/lib/seo/metadata";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";

/** F11 (#79) help centre: static answers about what the product does today (R12), plain English (R9). */
export const metadata: Metadata = constructMetadata({ title: HELP_PAGE.meta.title, description: HELP_PAGE.meta.description, canonicalUrl: "/help" });

export default function HelpPage() {
  return (
    <>
      <PublicPageHeader title={HELP_PAGE.title} lead={HELP_PAGE.lead} crumbs={[{ label: "Help" }]} />
      <Section spacing="compact">
        <Container className="flex max-w-3xl flex-col gap-8" data-help-centre="">
          {HELP_PAGE.topics.map((t) => (
            <section key={t.id} aria-labelledby={`help-${t.id}`} className="flex flex-col gap-3">
              <h2 id={`help-${t.id}`} className="text-h2 font-bold text-fg">
                {t.title}
              </h2>
              <Accordion
                type="multiple"
                items={t.items.map((it, i) => ({
                  id: `${t.id}-${i}`,
                  title: it.q,
                  content: (
                    <div className="flex flex-col gap-2">
                      <p className="text-body text-fg-secondary">{it.a}</p>
                      {it.link && (
                        <Link href={it.link.href} className="focus-ring inline-flex min-h-12 w-fit items-center text-body-sm font-medium text-link underline underline-offset-2">
                          {it.link.label}
                        </Link>
                      )}
                    </div>
                  ),
                }))}
              />
            </section>
          ))}
          <Card>
            <div className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-5 text-primary-600" />
              <CardTitle as="h2">{HELP_PAGE.contactTitle}</CardTitle>
            </div>
            <p className="text-body text-fg-secondary">{HELP_PAGE.contactLead}</p>
            {isSupportTicketsEnabled() && (
              <Link href="/help/tickets/new" className="focus-ring inline-flex min-h-12 w-fit items-center text-body font-semibold text-link underline underline-offset-2" data-help-ticket="">
                Send a support ticket
              </Link>
            )}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="focus-ring inline-flex min-h-12 w-fit items-center text-body-lg font-semibold text-link underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
            <Link href="/grievance" className="focus-ring inline-flex min-h-12 w-fit items-center text-body-sm font-medium text-link underline underline-offset-2">
              {HELP_PAGE.grievanceLink}
            </Link>
            <p className="text-body-sm text-fg-secondary" data-help-grievance-officer="">
              {GRIEVANCE_OFFICER.designation}: {GRIEVANCE_OFFICER.name} ·{" "}
              <a href={GRIEVANCE_PHONE_HREF} className="focus-ring inline-flex min-h-12 items-center text-link underline underline-offset-2">
                {GRIEVANCE_OFFICER.phone}
              </a>{" "}
              ({GRIEVANCE_OFFICER.phoneHours}) · {GRIEVANCE_TIMELINES.acknowledge} {GRIEVANCE_TIMELINES.resolve}
            </p>
          </Card>
        </Container>
      </Section>
    </>
  );
}
