"use server";

/**
 * CA-5 lesson progress — a thin, validated wrapper over fn_lesson_progress_save (migration 120). The database takes the
 * user from auth.uid() (the student's own session client; no service role, no user id from the caller) and refuses a
 * lesson that is not published; COMPLETED never goes back to READING.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCK_RX = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type LessonProgressResult = { ok: true; status: "READING" | "COMPLETED" } | { ok: false; code: "NOT_SIGNED_IN" | "NOT_FOUND" | "FAILED" };

export async function saveLessonProgressAction(input: { documentId: string; language: string; status: string; lastBlockId?: string | null }): Promise<LessonProgressResult> {
  const status = input?.status === "COMPLETED" ? "COMPLETED" : input?.status === "READING" ? "READING" : null;
  const language = input?.language === "hi" ? "hi" : input?.language === "en" ? "en" : null;
  const block = input?.lastBlockId && BLOCK_RX.test(input.lastBlockId) ? input.lastBlockId : null;
  if (!ID_RX.test(String(input?.documentId)) || !status || !language) return { ok: false, code: "FAILED" };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { ok: false, code: session.state === "none" ? "NOT_SIGNED_IN" : "FAILED" };
  const { data, error } = await supabase.rpc("fn_lesson_progress_save", {
    p_document_id: input.documentId,
    p_language: language,
    p_status: status,
    p_last_block_id: block as string,
  });
  if (error) return { ok: false, code: error.code === "P0002" ? "NOT_FOUND" : "FAILED" };
  const r = data && typeof data === "object" && !Array.isArray(data) ? (data as { status?: unknown }) : {};
  return { ok: true, status: r.status === "COMPLETED" ? "COMPLETED" : "READING" };
}
