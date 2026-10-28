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
  const [exams, cycles, sessions, template, tree] = await Promise.all([
    sb.from("exams").select("id, title, slug").order("title"),
    sb.from("exam_cycles").select("id, exam_id, cycle_year").order("cycle_year", { ascending: false }),
    SyllabusIntakeService.list(),
    PromptTemplateService.getActiveBody("SYLLABUS"), // CA-4: the ACTIVE SYLLABUS template (v1 = SYLLABUS-PROMPT-2)
    // SYLLABUS-CONTRACT-3.1: the current master names the prompt asks the AI to reuse (active, never internal)
    sb.from("canonical_taxonomy_nodes").select("id, parent_id, name, node_type, display_order").eq("is_active", true).eq("is_internal", false).in("node_type", ["SUBJECT", "TOPIC"]).order("display_order"),
  ]);
  const subjects = (tree.data || []).filter((n) => n.node_type === "SUBJECT");
  const preferredNames = subjects.map((s) => ({ subject: s.name, topics: (tree.data || []).filter((t) => t.node_type === "TOPIC" && t.parent_id === s.id).map((t) => t.name) }));
  return (
    <IntakeWizard
      exams={(exams.data || []).map((e) => ({ id: e.id, title: e.title, slug: e.slug }))}
      cycles={(cycles.data || []).map((c) => ({ id: c.id, examId: c.exam_id, year: c.cycle_year }))}
      sessions={sessions.success ? sessions.data : []}
      template={template ? { body: template.body, version: template.version } : null}
      preferredNames={tree.error ? [] : preferredNames}
      loadError={exams.error || cycles.error ? "Could not load the exams." : sessions.success ? null : sessions.error}
    />
  );
}
