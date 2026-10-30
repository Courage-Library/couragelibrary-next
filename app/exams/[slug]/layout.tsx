import React from "react";
import { Container } from "@/components/ui/layout";
import { ExamLogoBadge, NotAffiliatedLine } from "@/components/exams/exam-logo-badge";
import { getExamBranding } from "@/lib/logos/exam-branding";

/**
 * EXAM-LOGO-1: every page of an exam (hub, cycle, modules, course, exam-topic pages) shows the exam's logo — its
 * conducting body's, or the exam's own — in a fixed box (no layout shift), and ends with the one-line not-affiliated
 * notice. An unknown / inactive exam renders only the page (its own 404).
 */
export default async function ExamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getExamBranding(slug);
  if (!brand) return <>{children}</>;
  return (
    <>
      {/* the logo only: its alt text (or the fallback tile's label) names the body; the hub hero already says
          "Conducted by …", and every exam page names the body in the not-affiliated line */}
      <Container className="flex items-center pt-4" data-exam-brand="">
        <ExamLogoBadge logo={brand.logo} name={brand.bodyName} size="md" priority />
      </Container>
      {children}
      <Container className="pb-8 pt-2">
        <NotAffiliatedLine body={brand.bodyName} />
      </Container>
    </>
  );
}
