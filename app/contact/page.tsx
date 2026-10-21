import type { Metadata } from "next";
import { Mail, MapPin } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PublicPageHeader } from "@/components/public/public-page";
import { Container, Section } from "@/components/ui/layout";
import { CONTACT_PAGE } from "@/content/public-pages";
import { constructMetadata } from "@/lib/seo/metadata";

/** UX-2b /contact: email + location only. No contact form (it would need storage and anti-spam; later). Static. */
export const metadata: Metadata = constructMetadata({ title: CONTACT_PAGE.meta.title, description: CONTACT_PAGE.meta.description, canonicalUrl: "/contact" });

export default function ContactPage() {
  return (
    <>
      <PublicPageHeader title={CONTACT_PAGE.title} lead={CONTACT_PAGE.lead} crumbs={[{ label: "Contact" }]} />
      <Section spacing="compact">
        <Container className="grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-5 text-primary-600" />
              <CardTitle as="h2">{CONTACT_PAGE.emailHeading}</CardTitle>
            </div>
            <a href={`mailto:${CONTACT_PAGE.email}`} className="focus-ring w-fit rounded-badge text-body-lg font-semibold text-link underline underline-offset-2">
              {CONTACT_PAGE.email}
            </a>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-secondary">
              {CONTACT_PAGE.emailUses.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-5 text-primary-600" />
              <CardTitle as="h2">{CONTACT_PAGE.locationHeading}</CardTitle>
            </div>
            <address className="text-body-lg not-italic text-fg">{CONTACT_PAGE.location}</address>
          </Card>
        </Container>
      </Section>
    </>
  );
}
