"use server";

/**
 * CA-4 prompt templates — server actions. ADMIN ONLY. Every action: guardAdminAction first, then PromptTemplateService
 * (service role after its own guard; the database checks the body and audits).
 */
import { revalidatePath } from "next/cache";
import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { PromptTemplateService, type PromptResult } from "@/services/prompts/prompt-template.service";

export async function savePromptDraftAction(type: string, body: string, notes: string | null): Promise<PromptResult<{ id: string; version: number }>> {
  const __auth = await guardAdminAction() /* CA-4: admin only */;
  if (!__auth.ok) return __auth;
  const r = await PromptTemplateService.saveDraft(type, body, notes);
  if (r.success) revalidatePath("/admin/prompts");
  return sanitizeActionResult("savePromptDraftAction", r);
}

export async function activatePromptAction(id: string): Promise<PromptResult<{ id: string }>> {
  const __auth = await guardAdminAction() /* CA-4: admin only */;
  if (!__auth.ok) return __auth;
  const r = await PromptTemplateService.activate(id);
  if (r.success) {
    revalidatePath("/admin/prompts");
    revalidatePath("/admin/syllabus/intake");
    revalidatePath("/admin/lessons/generate");
  }
  return sanitizeActionResult("activatePromptAction", r);
}
