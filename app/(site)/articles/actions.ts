"use server";

/**
 * CA-5 lesson progress — thin, validated wrappers over fn_lesson_progress_save (migration 120). The database takes the
 * user from auth.uid() (the student's own session client; no service role, no user id from the caller) and refuses a
 * lesson that is not published; COMPLETED never goes back to READING.
 * PERF-LESSON-1: "Mark as complete" is a plain <form action> (works without JavaScript; no client code on the lesson page).
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// the lesson page to refresh: an /articles reader or a /learn master page (CA-6), English or Hindi
const PAGE_RX = /^(?:\/hi)?\/(?:articles\/[a-z0-9]+(?:-[a-z0-9]+)*|learn(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){2,4})$/;

export type LessonProgressResult = { ok: true; status: "READING" | "COMPLETED" } | { ok: false; code: "NOT_SIGNED_IN" | "NOT_FOUND" | "FAILED" };

/** Shared by the form action and the page's READING record (server only). */
export async function saveLessonProgressAction(input: { documentId: string; language: string; status: string }): Promise<LessonProgressResult> {
  const status = input?.status === "COMPLETED" ? "COMPLETED" : input?.status === "READING" ? "READING" : null;
  const language = input?.language === "hi" ? "hi" : input?.language === "en" ? "en" : null;
  if (!ID_RX.test(String(input?.documentId)) || !status || !language) return { ok: false, code: "FAILED" };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { ok: false, code: session.state === "none" ? "NOT_SIGNED_IN" : "FAILED" };
  const { data, error } = await supabase.rpc("fn_lesson_progress_save", { p_document_id: input.documentId, p_language: language, p_status: status });
  if (error) return { ok: false, code: error.code === "P0002" ? "NOT_FOUND" : "FAILED" };
  const r = data && typeof data === "object" && !Array.isArray(data) ? (data as { status?: unknown }) : {};
  return { ok: true, status: r.status === "COMPLETED" ? "COMPLETED" : "READING" };
}

/** The "Mark as complete" form (progressive enhancement); the article page re-renders with the new state. */
export async function completeLessonFormAction(formData: FormData): Promise<void> {
  const pagePath = String(formData.get("pagePath") || "");
  await saveLessonProgressAction({ documentId: String(formData.get("documentId") || ""), language: String(formData.get("language") || ""), status: "COMPLETED" });
  if (PAGE_RX.test(pagePath)) revalidatePath(pagePath);
}
