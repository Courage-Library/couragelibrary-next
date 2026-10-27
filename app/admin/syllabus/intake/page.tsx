import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { SyllabusIntakeService } from "@/services/syllabus/intake.service";
import { PromptTemplateService } from "@/services/prompts/prompt-template.service";
import { IntakeWizard } from "@/components/admin/syllabus/intake-wizard";

export const metadata: Metadata = { title: "Syllabus intake", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-2 / SYLLABUS-PROMPT-2: exam + cycle + tier → the prompt → paste the AI syllabus, match it to the master tree,
 * decide every item, then create a DRAFT. */
export default async function SyllabusIntakePage() {
  await requireAdminPage({ path: "/admin/syllabus/intake" }); // admin only: decisions write the master tree
  const sb = createAdminServerSupabaseClient();
  const [exams, cycles, sessions, template] = await Promise.all([
    sb.from("exams").select("id, title, slug").order("title"),
    sb.from("exam_cycles").select("id, exam_id, cycle_year").order("cycle_year", { ascending: false }),
    SyllabusIntakeService.list(),
    PromptTemplateService.getActiveBody("SYLLABUS"), // CA-4: the ACTIVE SYLLABUS template (v1 = SYLLABUS-PROMPT-2)
  ]);
  return (
    <IntakeWizard
      exams={(exams.data || []).map((e) => ({ id: e.id, title: e.title, slug: e.slug }))}
      cycles={(cycles.data || []).map((c) => ({ id: c.id, examId: c.exam_id, year: c.cycle_year }))}
      sessions={sessions.success ? sessions.data : []}
      template={template ? { body: template.body, version: template.version } : null}
      loadError={exams.error || cycles.error ? "Could not load the exams." : sessions.success ? null : sessions.error}
    />
  );
}
