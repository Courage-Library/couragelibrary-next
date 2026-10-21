/**
 * UX-2b public pages: shared, server-only building blocks in the UX-2a look (decision #55): design-system components
 * and tokens only, 1200 px content width (Container) or 720 px reading width for long text, one h1 per page.
 * Copy comes from content/public-pages.ts.
 */
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container, Section } from "@/components/ui/layout";
import { siteConfig } from "@/config/site";
import { LEGAL_DRAFT_NOTICE, type LegalSection } from "@/content/public-pages";

export function PublicPageHeader({
  title,
  lead,
  badge,
  crumbs,
  width = "default",
}: {
  title: string;
  lead?: string;
  badge?: string;
  /** Breadcrumb after "Home"; the last item is this page. Emits BreadcrumbList JSON-LD on the site URL. */
  crumbs: BreadcrumbItem[];
  width?: "default" | "reading";
}) {
  return (
    <section aria-labelledby="page-title" className="border-b border-line bg-gradient-to-b from-primary-50 to-canvas">
      <Container size={width} className="flex flex-col items-start gap-4 py-10 lg:py-14">
        <Breadcrumb items={[{ label: "Home", href: "/" }, ...crumbs]} structuredDataBaseUrl={siteConfig.url} />
        {badge && <Badge tone="neutral">{badge}</Badge>}
        <h1 id="page-title" className="max-w-3xl text-h1 font-bold tracking-tight text-fg">
          {title}
        </h1>
        {lead && <p className="max-w-2xl text-body-lg text-fg-secondary">{lead}</p>}
      </Container>
    </section>
  );
}

export function PublicSection({ id, title, children, width = "default", sunken = false }: { id: string; title: string; children: ReactNode; width?: "default" | "reading"; sunken?: boolean }) {
  return (
    <Section aria-labelledby={id} spacing="compact" className={sunken ? "bg-surface-sunken" : undefined}>
      <Container size={width} className="flex flex-col gap-4">
        <h2 id={id} className="text-h2 font-bold tracking-tight text-fg">
          {title}
        </h2>
        {children}
      </Container>
    </Section>
  );
}

/** Privacy / terms: always carries the visible draft notice until the owner / a lawyer approves (UX-2b). */
export function LegalPage({ title, sections, crumb }: { title: string; sections: LegalSection[]; crumb: BreadcrumbItem }) {
  return (
    <>
      <PublicPageHeader title={title} crumbs={[crumb]} width="reading" />
      <Section spacing="compact">
        <Container size="reading" className="flex flex-col gap-8">
          <Alert tone="warning" title={LEGAL_DRAFT_NOTICE.title} data-legal-draft="">
            {LEGAL_DRAFT_NOTICE.text}
          </Alert>
          {sections.map((s, i) => (
            <section key={s.heading} aria-labelledby={`legal-${i}`} className="flex flex-col gap-3">
              <h2 id={`legal-${i}`} className="text-h3 font-semibold text-fg">
                {s.heading}
              </h2>
              {s.items && (
                <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg-secondary">
                  {s.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
              {s.paragraphs?.map((p) => (
                <p key={p} className="text-body text-fg-secondary">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </Container>
      </Section>
    </>
  );
}
