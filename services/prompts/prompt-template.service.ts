/**
 * COURAGE LIBRARY — PROMPT TEMPLATES SERVICE (CA-4)
 *
 * The AI prompt templates in the DB (prompt_templates, migration 119): SYLLABUS / LESSON / QUESTION / TRANSLATE_HI,
 * versioned, one ACTIVE per type. The intake wizard, the lesson generator and the translation screen render the ACTIVE
 * body (lib/prompts/template.ts); /admin/prompts edits them (a new DRAFT version → activate). ADMIN ONLY.
 *
 * INVARIANTS:
 * - Server-only; the service-role client after the canonical admin guard. Writes only through the audited RPCs
 *   (fn_prompt_template_save_draft / _activate); the database checks every body (fn_prompt_template_problems).
 * - getActiveBody falls back to the code v1 constant ONLY when no ACTIVE row can be read (a fresh database before 119):
 *   the result says which source was used.
 */
import { guardAdminAction } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { TEMPLATE_TYPES, templateProblems, type TemplateType } from "@/lib/prompts/template";
import type { PromptTemplateRow } from "@/lib/prompts/admin-types";
import { SYLLABUS_TEMPLATE_V1 } from "@/lib/syllabus/intake-prompt";
import { LESSON_TEMPLATE_V1 } from "@/lib/prompts/lesson-prompt";
import { TRANSLATE_HI_TEMPLATE_V1 } from "@/lib/prompts/translate-prompt";

export type { PromptTemplateRow };
export type PromptResult<T> = { success: true; data: T } | { success: false; code: string; error: string; problems?: string[] };

const CODE_V1: Partial<Record<TemplateType, string>> = { SYLLABUS: SYLLABUS_TEMPLATE_V1, LESSON: LESSON_TEMPLATE_V1, TRANSLATE_HI: TRANSLATE_HI_TEMPLATE_V1 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = <T>(code: string, error: string, problems?: string[]): PromptResult<T> => ({ success: false, code, error, ...(problems ? { problems } : {}) });

export function mapPromptDbError(error: { message?: string } | null | undefined): { code: string; error: string } {
  const msg = error?.message || "";
  if (msg.includes("PROMPT_TEMPLATE:")) return { code: "TEMPLATE_RULE", error: msg.slice(msg.indexOf("PROMPT_TEMPLATE:") + 16).trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "…") };
  return { code: "DB_ERROR", error: "The template change could not be saved." };
}

async function ctx() {
  const auth = await guardAdminAction();
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || "unknown", supabase: createAdminServerSupabaseClient() };
}

export class PromptTemplateService {
  /** The ACTIVE body of a type (server-side callers that already passed the admin page guard). */
  static async getActiveBody(type: TemplateType): Promise<{ body: string; version: number | null; source: "db" | "code" } | null> {
    const c = await ctx();
    if (!c) return null;
    const { data } = await c.supabase.from("prompt_templates").select("body, version").eq("template_type", type).eq("status", "ACTIVE").maybeSingle();
    if (data?.body) return { body: data.body, version: data.version, source: "db" };
    const fallback = CODE_V1[type];
    return fallback ? { body: fallback, version: null, source: "code" } : null;
  }

  static async list(): Promise<PromptResult<PromptTemplateRow[]>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const { data, error } = await c.supabase
      .from("prompt_templates")
      .select("id, template_type, version, body, body_sha256, status, notes, created_by_email, created_at, updated_at, activated_at")
      .order("template_type")
      .order("version", { ascending: false });
    if (error) return fail("DB_ERROR", "Could not load the templates.");
    return {
      success: true,
      data: (data || []).map((r) => ({
        id: r.id,
        type: r.template_type as TemplateType,
        version: r.version,
        body: r.body,
        bodySha256: r.body_sha256 ?? "",
        status: r.status as PromptTemplateRow["status"],
        notes: r.notes,
        createdBy: r.created_by_email,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        activatedAt: r.activated_at,
      })),
    };
  }

  static async saveDraft(type: string, body: string, notes: string | null): Promise<PromptResult<{ id: string; version: number }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!(TEMPLATE_TYPES as readonly string[]).includes(type)) return fail("VALIDATION", "Unknown template type.");
    const problems = templateProblems(type as TemplateType, body);
    if (problems.length) return fail("VALIDATION", "The template has problems.", problems);
    if (notes && notes.length > 500) return fail("VALIDATION", "Notes: at most 500 characters.");
    const { data, error } = await c.supabase.rpc("fn_prompt_template_save_draft", {
      p_type: type,
      p_body: body,
      p_notes: (notes || null) as string,
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error || !data) {
      const m = mapPromptDbError(error);
      return fail(m.code, m.error);
    }
    const r = data as { id?: string; version?: number };
    return { success: true, data: { id: String(r.id), version: Number(r.version) } };
  }

  static async activate(id: string): Promise<PromptResult<{ id: string }>> {
    const c = await ctx();
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    if (!UUID_RE.test(id)) return fail("VALIDATION", "Invalid template.");
    const { error } = await c.supabase.rpc("fn_prompt_template_activate", { p_id: id, p_actor_id: c.userId as string, p_actor_email: c.userEmail });
    if (error) {
      const m = mapPromptDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { id } };
  }
}
