"use server";

/**
 * CA-3 lesson blocks — server actions. ADMIN ONLY. Every action: guardAdminAction first, then LessonAdminService
 * (service role after its own guard; the database validates the blocks again, hashes and audits).
 */
import { revalidatePath } from "next/cache";
import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { LessonAdminService, type LessonResult } from "@/services/lessons/lesson-admin.service";

function done<T>(r: LessonResult<T>, documentId?: string): LessonResult<T> {
  if (r.success) {
    revalidatePath("/admin/lessons");
    if (documentId) revalidatePath(`/admin/lessons/${documentId}`);
  }
  return r;
}

export async function saveLessonDraftAction(documentId: string, language: string, json: string): Promise<LessonResult<{ versionId: string; versionNumber: number }>> {
  const __auth = await guardAdminAction() /* CA-3: admin only */;
  if (!__auth.ok) return __auth;
  if (language !== "en" && language !== "hi") return { success: false, code: "VALIDATION", error: "Language must be en or hi." };
  return sanitizeActionResult("saveLessonDraftAction", done(await LessonAdminService.saveDraft(documentId, language, json), documentId));
}

export async function publishLessonAction(documentId: string, versionId: string): Promise<LessonResult<{ versionId: string }>> {
  const __auth = await guardAdminAction() /* CA-3: admin only */;
  if (!__auth.ok) return __auth;
  const r = done(await LessonAdminService.publish(versionId), documentId);
  if (r.success) revalidatePath("/articles", "layout");
  return sanitizeActionResult("publishLessonAction", r);
}
