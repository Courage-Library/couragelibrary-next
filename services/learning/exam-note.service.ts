import "server-only";

import { guardAdminAction } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient, createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { parseExamNotePaste } from "@/lib/lessons/exam-note";
import { validateLesson, type LessonBlock, type LessonMeta } from "@/lib/lessons/blocks";

/**
 * CA-7 exam notes (design E): admin authoring through fn_exam_note_save_draft / fn_exam_note_publish (service role after
 * the admin guard; the database validates the blocks again and audits EXAM_NOTE_*); public reads see PUBLISHED only.
 */
export interface ExamNoteRow {
  id: string;
  nodeId: string;
  language: "en" | "hi";
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  title: string;
  publishedAt: string | null;
  updatedAt: string;
}

type Result<T> = { success: true; data: T } | { success: false; code: string; error: string; errors?: { path: string; code: string; message: string }[] };
const fail = <T>(code: string, error: string, errors?: { path: string; code: string; message: string }[]): Result<T> => ({ success: false, code, error, ...(errors ? { errors } : {}) });

async function adminCtx() {
  const auth = await guardAdminAction();
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || "unknown", db: createAdminServerSupabaseClient() };
}

function mapNoteError(message: string): string {
  return message.includes("EXAM_NOTE:") ? message.slice(message.indexOf("EXAM_NOTE:") + 10).trim() : "The note could not be saved.";
}

export class ExamNoteService {
  /** Every non-retired note of an exam (admin). */
  static async listForExam(examId: string): Promise<Result<ExamNoteRow[]>> {
    const c = await adminCtx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const { data, error } = await c.db
      .from("exam_node_notes")
      .select("id, node_id, language, version, status, meta, published_at, updated_at")
      .eq("exam_id", examId)
      .neq("status", "RETIRED")
      .order("updated_at", { ascending: false });
    if (error) return fail("DB_ERROR", "Could not load the notes.");
    return {
      success: true,
      data: (data || []).map((r) => ({
        id: r.id,
        nodeId: r.node_id,
        language: r.language as "en" | "hi",
        version: r.version,
        status: r.status as ExamNoteRow["status"],
        title: (r.meta as { title?: string } | null)?.title ?? "",
        publishedAt: r.published_at,
        updatedAt: r.updated_at,
      })),
    };
  }

  static async saveDraft(examId: string, nodeId: string, language: "en" | "hi", json: string): Promise<Result<{ id: string; version: number }>> {
    const c = await adminCtx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const p = parseExamNotePaste(json);
    if (!p.ok) return fail("VALIDATION", "The pasted note has problems.", p.errors);
    const { data, error } = await c.db.rpc("fn_exam_note_save_draft", {
      p_exam_id: examId,
      p_node_id: nodeId,
      p_language: language,
      p_meta: p.meta as never,
      p_blocks: p.blocks as never,
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error) return fail("NOTE_RULE", mapNoteError(String(error.message || "")));
    const r = data as { id: string; version: number };
    return { success: true, data: { id: r.id, version: r.version } };
  }

  static async publish(id: string): Promise<Result<{ id: string }>> {
    const c = await adminCtx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const { error } = await c.db.rpc("fn_exam_note_publish", { p_id: id, p_actor_id: c.userId as string, p_actor_email: c.userEmail });
    if (error) return fail("NOTE_RULE", mapNoteError(String(error.message || "")));
    return { success: true, data: { id } };
  }
}

/**
 * The PUBLISHED note of an exam × node in a language (public read; anon RLS sees PUBLISHED only), re-validated before
 * rendering — anything malformed renders nothing. Hindi falls back to English (labelled by the caller).
 */
export async function getPublishedExamNote(examId: string, nodeId: string, language: "en" | "hi"): Promise<{ meta: LessonMeta; blocks: LessonBlock[]; language: "en" | "hi" } | null> {
  const db = createPublicServerSupabaseClient();
  const { data, error } = await db
    .from("exam_node_notes")
    .select("language, meta, blocks")
    .eq("exam_id", examId)
    .eq("node_id", nodeId)
    .eq("status", "PUBLISHED")
    .in("language", language === "hi" ? ["hi", "en"] : ["en"]);
  if (error || !data?.length) return null;
  const row = data.find((r) => r.language === language) ?? data.find((r) => r.language === "en");
  if (!row) return null;
  const v = validateLesson(row.meta, row.blocks);
  return v.ok ? { meta: v.meta, blocks: v.blocks, language: row.language as "en" | "hi" } : null;
}
