/**
 * UX-2b: honest hub for an exam that is listed as coming soon (content/public-pages COMING_SOON_EXAMS) while it is not
 * active (decision #32). No content, no numbers, no dates; noindex is set by the page metadata.
 */
import { CircleDashed } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicPageHeader, PublicSection } from "@/components/public/public-page";
import { COMING_SOON_HUB } from "@/content/public-pages";

export function ComingSoonHub({ title }: { title: string }) {
  return (
    <div data-coming-soon-hub="">
      <PublicPageHeader
        title={title}
        badge={COMING_SOON_HUB.badge}
        lead={COMING_SOON_HUB.lead(title)}
        crumbs={[{ label: "Exams", href: "/exams" }, { label: title }]}
      />
      <PublicSection id="planned" title={COMING_SOON_HUB.plannedHeading}>
        <ul className="flex max-w-prose flex-col gap-2">
          {COMING_SOON_HUB.planned.map((p) => (
            <li key={p} className="flex items-start gap-2 text-body text-fg-secondary">
              <CircleDashed aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-muted" />
              {p}
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-fg-secondary">{COMING_SOON_HUB.plannedNote}</p>
      </PublicSection>
      <PublicSection id="available-now" title={COMING_SOON_HUB.availableNow} sunken>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={COMING_SOON_HUB.availableCta.href}>{COMING_SOON_HUB.availableCta.label}</ButtonLink>
          <ButtonLink href={COMING_SOON_HUB.allExamsCta.href} variant="secondary">
            {COMING_SOON_HUB.allExamsCta.label}
          </ButtonLink>
        </div>
      </PublicSection>
    </div>
  );
}
