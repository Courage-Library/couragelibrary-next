"use server";

/**
 * CA-3 / CA-4 lesson blocks — server actions. ADMIN ONLY. Every action: guardAdminAction first, then LessonAdminService
 * (service role after its own guard; the database validates the blocks again, hashes and audits).
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { LessonAdminService, type LessonResult } from "@/services/lessons/lesson-admin.service";
import { LessonAuthoringService, checklistPasses, type AuthoringResult } from "@/services/lessons/lesson-authoring.service";
import type { ChecklistItem } from "@/lib/lessons/completeness";
import { LEARN_CACHE_TAG } from "@/services/learning/master-lesson.service";
import { CoverageService } from "@/services/learning/coverage.service";
import { ExamNoteService } from "@/services/learning/exam-note.service";

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
  // CA-4: an English node lesson publishes only when its completeness checklist passes
  const checklist = await LessonAuthoringService.publishChecklist(versionId);
  if (checklist && !checklistPasses(checklist)) {
    const missing = checklist.filter((i) => !i.ok && i.severity === "error").map((i) => i.label);
    return sanitizeActionResult("publishLessonAction", { success: false, code: "CHECKLIST", error: `The lesson is not complete yet: ${missing.join("; ")}.` });
  }
  const r = done(await LessonAdminService.publish(versionId), documentId);
  if (r.success) {
    revalidatePath("/articles", "layout");
    // CA-6: the cached master / exam-topic lesson data, the lesson pages and the sitemap follow every publish
    revalidateTag(LEARN_CACHE_TAG);
    revalidatePath("/learn", "layout");
    revalidatePath("/hi/learn", "layout");
    revalidatePath("/sitemap.xml");
  }
  return sanitizeActionResult("publishLessonAction", r);
}

/** CA-4 / LESSON-PROMPT-2: the pasted part(s) → the node's lesson document (created on first use) → its English DRAFT. */
export async function saveGeneratedLessonAction(nodeId: string, parts: string[], factsChecked: boolean): Promise<
  AuthoringResult<{ documentId: string; versionId: string; checklist: ChecklistItem[] }>
> {
  const __auth = await guardAdminAction() /* CA-4: admin only */;
  if (!__auth.ok) return __auth;
  const r = await LessonAuthoringService.saveGeneratedDraft(nodeId, Array.isArray(parts) ? parts : [], factsChecked === true);
  if (r.success) {
    revalidatePath("/admin/lessons");
    revalidatePath("/admin/lessons/generate");
  }
  return sanitizeActionResult("saveGeneratedLessonAction", r);
}

/** CA-4: paste the translation → parity against the current English → the translation DRAFT. */
export async function saveTranslationDraftAction(documentId: string, paste: string): Promise<AuthoringResult<{ versionId: string }>> {
  const __auth = await guardAdminAction() /* CA-4: admin only */;
  if (!__auth.ok) return __auth;
  const r = await LessonAuthoringService.saveTranslationDraft(documentId, paste);
  if (r.success) {
    revalidatePath("/admin/lessons");
    revalidatePath(`/admin/lessons/${documentId}/translate`);
  }
  return sanitizeActionResult("saveTranslationDraftAction", r);
}

/** CA-7: launch (LIVE) or pause an exam course — admin only, audited in the database (EXAM_COURSE_LAUNCH / _PAUSE). */
export async function setCourseLaunchAction(examId: string, status: "LIVE" | "PAUSED"): Promise<{ success: true; data: { status: string } } | { success: false; code: string; error: string }> {
  const __auth = await guardAdminAction() /* CA-7: admin only */;
  if (!__auth.ok) return __auth;
  if (status !== "LIVE" && status !== "PAUSED") return { success: false, code: "VALIDATION", error: "Status must be LIVE or PAUSED." };
  const r = await CoverageService.setLaunch(examId, status);
  if (r.success) {
    revalidatePath("/admin/lessons/coverage");
    revalidateTag(LEARN_CACHE_TAG);
    revalidatePath("/exams", "layout");
    revalidatePath("/sitemap.xml");
  }
  return sanitizeActionResult("setCourseLaunchAction", r);
}

/** CA-7: save the draft of an exam note (exam × node × language) — admin only; the database validates and audits. */
export async function saveExamNoteDraftAction(examId: string, nodeId: string, language: string, json: string) {
  const __auth = await guardAdminAction() /* CA-7: admin only */;
  if (!__auth.ok) return __auth;
  if (language !== "en" && language !== "hi") return { success: false as const, code: "VALIDATION", error: "Language must be en or hi." };
  const r = await ExamNoteService.saveDraft(examId, nodeId, language, json);
  if (r.success) revalidatePath("/admin/lessons/notes");
  return sanitizeActionResult("saveExamNoteDraftAction", r);
}

/** CA-7: publish an exam note draft — admin only; the previous published version is retired (audited). */
export async function publishExamNoteAction(id: string) {
  const __auth = await guardAdminAction() /* CA-7: admin only */;
  if (!__auth.ok) return __auth;
  const r = await ExamNoteService.publish(id);
  if (r.success) {
    revalidatePath("/admin/lessons/notes");
    revalidateTag(LEARN_CACHE_TAG);
    revalidatePath("/exams", "layout");
  }
  return sanitizeActionResult("publishExamNoteAction", r);
}
