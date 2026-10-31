import React from "react";
import { Container } from "@/components/ui/layout";
import { NotAffiliatedLine } from "@/components/exams/exam-logo-badge";
import { getExamBranding } from "@/lib/logos/exam-branding";

/**
 * EXAM-LOGO-1: every page of an exam (hub, cycle, modules, course, exam-topic pages) ends with the one-line
 * not-affiliated notice. LOGO-PLACEMENT (owner 2026-10-31): the logo is no longer a separate strip here — each page
 * header shows it inline before the exam name (components/exams/exam-brand-logo.tsx). An unknown / inactive exam renders
 * only the page (its own 404 / coming-soon hub).
 */
export default async function ExamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getExamBranding(slug);
  if (!brand) return <>{children}</>;
  return (
    <>
      {children}
      <Container className="pb-8 pt-2">
        <NotAffiliatedLine body={brand.bodyName} />
      </Container>
    </>
  );
}
