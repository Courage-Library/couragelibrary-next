/**
 * UX-2b: honest hub for an exam that is listed as coming soon (content/public-pages COMING_SOON_EXAMS) while it is not
 * active (decision #32). No content, no numbers, no dates; noindex is set by the page metadata.
 * F1 (#75): the same skeleton as the exam home page — header, at a glance (all "Not published yet"), then mock tests,
 * syllabus and guides as honest "coming soon" states. No start action and no "Notify me" (no waitlist exists yet).
 * EXAM-LOGO-1: ends with the not-affiliated line, like every exam page.
 */
import { CircleDashed, ClipboardList, FileText, BookOpen } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container } from "@/components/ui/layout";
import { PublicSection } from "@/components/public/public-page";
import { ExamGlance, ExamHomeHeader } from "@/components/exams/exam-home";
import { ExamLogoBadge, NotAffiliatedLine } from "@/components/exams/exam-logo-badge";
import { EXAM_PAGE } from "@/content/exam-page";
import { COMING_SOON_HUB } from "@/content/public-pages";
import { glanceRows } from "@/lib/exams/exam-page";

export function ComingSoonHub({ title, body }: { title: string; body: string }) {
  const S = EXAM_PAGE.comingSoon;
  return (
    <div data-coming-soon-hub="">
      <ExamHomeHeader title={title} body={null} badge={COMING_SOON_HUB.badge} logo={<ExamLogoBadge logo={null} name={body} size="md" priority />}>
        <p className="max-w-2xl text-body-lg text-fg-secondary">{COMING_SOON_HUB.lead(title)}</p>
      </ExamHomeHeader>
      <ExamGlance examTitle={title} table={glanceRows([])} />
      <PublicSection id="coming-soon-content" title={EXAM_PAGE.mocks.title}>
        <EmptyState icon={<ClipboardList />} title={S.mocks} />
      </PublicSection>
      <PublicSection id="coming-soon-syllabus" title={EXAM_PAGE.syllabus.title}>
        <EmptyState icon={<BookOpen />} title={S.syllabus} />
      </PublicSection>
      <PublicSection id="coming-soon-guides" title={EXAM_PAGE.guides.title}>
        <EmptyState icon={<FileText />} title={S.guides} />
      </PublicSection>
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
      {/* EXAM-LOGO-1: an inactive exam has no logo strip (exam layout), but its page still names the body */}
      <Container className="pb-8 pt-2">
        <NotAffiliatedLine body={body} />
      </Container>
    </div>
  );
}
