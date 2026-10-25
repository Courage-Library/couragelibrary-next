/**
 * F1 (#75): the exam home page views (/exams/[slug]). Pure: plain props in, markup out (rendered offline by
 * scripts/test_f1_exam_page.cjs). Rules: one amber primary per page (the header action), whole cards are single links
 * (CardLink, ≥ 48 px), no glass in content, English UI (#82), every number from the database, honest empty states.
 */
import type { ReactNode } from "react";
import { ArrowRight, BookOpen, CalendarDays, ClipboardList, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardLink, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PillLink } from "@/components/ui/pill-button";
import { siteConfig } from "@/config/site";
import { EXAM_PAGE, NOT_PUBLISHED } from "@/content/exam-page";
import { formatNumber } from "@/lib/format";
import { PATTERN_ANCHOR, type CycleInfo, type ExamCta, type GlanceTable, type GuideGroup, type MockListItem, type MockStatus } from "@/lib/exams/exam-page";
import { AddExamButton } from "./add-exam-button";

const C = EXAM_PAGE;

export function ExamHomeHeader({ title, body, badge, children }: { title: string; body: string | null; badge?: string; children?: ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="border-b border-line bg-gradient-to-b from-primary-50 to-canvas">
      <Container className="flex flex-col items-start gap-4 py-8 lg:py-12">
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: C.crumbs.exams, href: "/exams" }, { label: title }]} structuredDataBaseUrl={siteConfig.url} />
        {badge && <Badge tone="neutral">{badge}</Badge>}
        <div className="flex flex-col gap-1">
          <h1 id="page-title" className="text-h1 font-bold tracking-tight text-fg">
            {title}
          </h1>
          {body && <p className="text-body-lg text-fg-secondary">{C.conductedBy(body)}</p>}
        </div>
        {children}
      </Container>
    </section>
  );
}

/** The ONE primary action (amber) + an optional secondary link. */
export function ExamCtaView({ cta, examId }: { cta: ExamCta; examId: string }) {
  return (
    <div className="flex flex-col items-start gap-2" data-exam-cta={cta.kind}>
      <div className="flex flex-wrap items-center gap-3">
        {cta.kind === "add" ? (
          <AddExamButton examId={examId} label={cta.label} />
        ) : (
          <PillLink href={cta.href} variant="accent-on-light" trailingIcon={<ArrowRight aria-hidden="true" className="size-5" />}>
            {cta.label}
          </PillLink>
        )}
        {cta.secondary && (
          <ButtonLink href={cta.secondary.href} variant="ghost" size="md" className="min-h-12">
            {cta.secondary.label}
          </ButtonLink>
        )}
      </div>
      {cta.kind === "continue" && <p className="text-body-sm text-fg-secondary">{C.cta.following}</p>}
    </div>
  );
}

function HomeSection({ id, title, children, sunken = false }: { id: string; title: string; children: ReactNode; sunken?: boolean }) {
  return (
    <Section aria-labelledby={`${id}-title`} spacing="compact" className={sunken ? "bg-surface-sunken" : undefined} id={id}>
      <Container className="flex flex-col gap-4">
        <h2 id={`${id}-title`} className="text-h2 font-bold tracking-tight text-fg">
          {title}
        </h2>
        {children}
      </Container>
    </Section>
  );
}

export function ExamGlance({ examTitle, table }: { examTitle: string; table: GlanceTable }) {
  return (
    <HomeSection id={PATTERN_ANCHOR.slice(1)} title={C.glance.title}>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[18rem] border-collapse text-left text-body-sm">
          <caption className="sr-only">{C.glance.caption(examTitle)}</caption>
          <thead className="bg-surface-sunken">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold text-fg">
                {C.glance.stage}
              </th>
              {table.stages.map((s, i) => (
                <th key={`${s}-${i}`} scope="col" className={table.published ? "px-4 py-3 font-semibold text-fg" : "px-4 py-3 font-normal text-fg-secondary"}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.fact} className="border-t border-line">
                <th scope="row" className="px-4 py-3 font-medium text-fg">
                  {r.fact}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className={v === NOT_PUBLISHED ? "px-4 py-3 text-fg-secondary" : "px-4 py-3 text-fg"}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.published && <p className="text-body-sm text-fg-secondary">{C.glance.onlyPublished}</p>}
    </HomeSection>
  );
}

/** Only when a cycle exists; the date line only when a future date is recorded. */
export function ExamCycle({ info }: { info: CycleInfo | null }) {
  if (!info) return null;
  return (
    <HomeSection id="cycle" title={C.cycle.title}>
      <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
        <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-600" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold text-fg">{info.status}</p>
          <p className="text-body-sm text-fg-secondary">{info.next ?? C.cycle.noDates}</p>
        </div>
      </div>
    </HomeSection>
  );
}

function StatusBadge({ s }: { s: MockStatus }) {
  if (s.state === "in-progress") return <Badge tone="warning">{C.mocks.inProgress}</Badge>;
  if (s.state === "done") {
    return (
      <Badge tone="success">
        {C.mocks.done}
        {s.score !== null && s.maxScore !== null ? ` · ${C.mocks.score(formatNumber(s.score), formatNumber(s.maxScore))}` : ""}
      </Badge>
    );
  }
  return <Badge tone="neutral">{C.mocks.notStarted}</Badge>;
}

/** statuses null = signed out (no per-user status is claimed). */
export function ExamMocks({ mocks, statuses }: { mocks: MockListItem[]; statuses: Map<string, MockStatus> | null }) {
  return (
    <HomeSection id="mocks" title={C.mocks.title} sunken>
      {mocks.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={C.mocks.empty} />
      ) : (
        <>
          {statuses === null && <p className="text-body-sm text-fg-secondary">{C.mocks.signInForStatus}</p>}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mocks.map((m) => {
              const s = statuses?.get(m.id) ?? null;
              const shape = m.questions !== null && m.minutes !== null ? C.mocks.shape(formatNumber(m.questions), formatNumber(m.minutes)) : null;
              return (
                <li key={m.id} className="flex">
                  <Card variant="interactive" className="min-h-12 w-full" data-mock-card="">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={m.isFree ? "free" : "pro"}>{m.isFree ? C.mocks.free : C.mocks.pro}</Badge>
                      {m.testType === "full_length" && <Badge tone="neutral">{C.mocks.fullLength}</Badge>}
                      {m.testType === "sectional" && <Badge tone="neutral">{C.mocks.sectional}</Badge>}
                    </div>
                    <CardTitle as="h3">
                      <CardLink href={s?.href ?? `/mock-tests/${m.id}`}>{m.title}</CardLink>
                    </CardTitle>
                    {shape && <CardDescription>{shape}</CardDescription>}
                    {s && (
                      <div className="mt-auto">
                        <StatusBadge s={s} />
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </HomeSection>
  );
}

/** Totals from the published syllabus read model; the full syllabus (the existing section) in a disclosure. */
export function ExamSyllabusHome({ id, totals, children }: { id: string; totals: { topics: number; published_questions: number } | null; children: ReactNode }) {
  return (
    <HomeSection id={id} title={C.syllabus.title}>
      {totals && (
        <p className="flex items-center gap-2 text-body text-fg">
          <BookOpen aria-hidden="true" className="size-5 text-primary-600" />
          {C.syllabus.summary(formatNumber(totals.topics), formatNumber(totals.published_questions))}
        </p>
      )}
      <details className="group rounded-card border border-line bg-surface" open={!totals}>
        <summary className="focus-ring flex min-h-12 cursor-pointer items-center px-4 text-body font-semibold text-primary-700">{C.syllabus.show}</summary>
        <div className="border-t border-line p-4">{children}</div>
      </details>
    </HomeSection>
  );
}

export type SourceLink = { id: string; title: string; issuingAuthority: string | null; sourceUrl: string };

export function ExamGuides({ groups, sources }: { groups: GuideGroup[]; sources: SourceLink[] }) {
  return (
    <HomeSection id="guides" title={C.guides.title} sunken>
      {groups.length === 0 ? (
        <EmptyState icon={<FileText />} title={C.guides.empty} />
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-3">
            <h3 className="text-h3 font-semibold text-fg">{g.title}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.guides.map((guide) => (
                <li key={guide.key} className="flex">
                  <Card variant="interactive" padding="sm" className="min-h-12 w-full" data-guide-card="">
                    <CardTitle as="h4" className="text-body font-semibold">
                      <CardLink href={guide.href}>{guide.title}</CardLink>
                    </CardTitle>
                    {guide.asOf && <CardDescription>{guide.asOf}</CardDescription>}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {sources.length > 0 && (
        <section aria-label={C.guides.sources} className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold text-fg">{C.guides.sources}</h3>
          <ul className="flex flex-col gap-1">
            {sources.map((s) => (
              <li key={s.id}>
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex min-h-12 items-center gap-2 text-body text-primary-700 underline-offset-4 hover:underline">
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                  <span>
                    {s.title}
                    {s.issuingAuthority ? <span className="text-fg-secondary"> — {s.issuingAuthority}</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </HomeSection>
  );
}
