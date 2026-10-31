import "server-only";
import { ExamLogoBadge } from "@/components/exams/exam-logo-badge";
import { getExamBranding } from "@/lib/logos/exam-branding";
import type { LOGO_DISPLAY_SIZES } from "@/lib/logos/exam-logo";

/**
 * LOGO-PLACEMENT (owner 2026-10-31): the exam's logo inline, immediately before the exam name on the same line
 * ("[logo] SSC CGL") in page headers (hub, course, exam-topic). Its own logo / its body's, else the initials tile in the
 * same fixed box. Not an active exam → nothing (the page shows its own 404 / coming-soon state).
 */
export async function ExamBrandLogo({ slug, size = "md", priority = true }: { slug: string; size?: keyof typeof LOGO_DISPLAY_SIZES; priority?: boolean }) {
  const brand = await getExamBranding(slug);
  if (!brand) return null;
  return <ExamLogoBadge logo={brand.logo} name={brand.bodyName} size={size} priority={priority} />;
}
