import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { PromptTemplateService } from "@/services/prompts/prompt-template.service";
import { PromptTemplatesEditor } from "@/components/admin/prompts/prompt-templates-editor";

export const metadata: Metadata = { title: "Prompt templates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-4: the AI prompt templates (SYLLABUS, LESSON, QUESTION, TRANSLATE_HI), versioned; one active per type. */
export default async function PromptTemplatesPage() {
  await requireAdminPage({ path: "/admin/prompts" }); // admin only
  const r = await PromptTemplateService.list();
  return <PromptTemplatesEditor rows={r.success ? r.data : []} loadError={r.success ? null : r.error} />;
}
