"use server";

/**
 * F11 (#79) — student ticket creation (fn_create_support_ticket: auth.uid(), validated, rate-capped) and the staff
 * status / reply update (admin / staff only, service role column grant: status / staff_reply / timestamps, audited).
 */
import { revalidatePath } from "next/cache";
import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { guardAdminAction } from "@/lib/auth/require-admin";
import { isSupportTicketsEnabled, validateTicket, type TicketStatus } from "@/lib/support/tickets";

export type CreateTicketResult = { code: "CREATED"; ref: string } | { code: "INVALID_INPUT" | "RATE_LIMITED" | "NOT_SIGNED_IN" | "FAILED" };

export async function createTicketAction(input: { category: string; subject: string; message: string }): Promise<CreateTicketResult> {
  if (!isSupportTicketsEnabled()) return { code: "FAILED" };
  const v = validateTicket(input ?? {});
  if (!v.ok) return { code: "INVALID_INPUT" };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { code: session.state === "none" ? "NOT_SIGNED_IN" : "FAILED" };
  const { data, error } = await supabase.rpc("fn_create_support_ticket", { p_category: v.category, p_subject: v.subject, p_message: v.message });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { code: "FAILED" };
  const r = data as Record<string, unknown>;
  if (r.code === "CREATED" && typeof r.ref === "string" && /^CL-\d{6}-[A-Z0-9]{6}$/.test(r.ref)) {
    revalidatePath("/help/tickets");
    return { code: "CREATED", ref: r.ref };
  }
  const code = (["INVALID_INPUT", "RATE_LIMITED", "NOT_SIGNED_IN"] as const).find((c) => c === r.code);
  return { code: code ?? "FAILED" };
}

const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export async function updateTicketAction(input: { id: string; status: string; reply: string }): Promise<{ ok: boolean }> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok || !isSupportTicketsEnabled()) return { ok: false };
  const status = STATUSES.find((s) => s === input?.status);
  const reply = String(input?.reply ?? "").trim();
  if (!status || !/^[0-9a-f-]{36}$/i.test(String(input?.id)) || reply.length > 3000) return { ok: false };
  const sb = createAdminServerSupabaseClient();
  const { data: before } = await sb.from("support_tickets").select("id, status, staff_reply").eq("id", input.id).maybeSingle();
  if (!before) return { ok: false };
  const now = new Date().toISOString();
  const { error } = await sb
    .from("support_tickets")
    .update({ status, staff_reply: reply || null, updated_at: now, resolved_at: status === "RESOLVED" || status === "CLOSED" ? now : null })
    .eq("id", input.id);
  if (error) return { ok: false };
  await sb.from("admin_audit_logs").insert({
    actor_id: auth.userId,
    actor_email: auth.userEmail,
    action_type: "SUPPORT_TICKET_UPDATE",
    target_entity: "support_ticket",
    target_id: input.id,
    old_value: { status: before.status, replied: Boolean(before.staff_reply) },
    new_value: { status, replied: Boolean(reply) },
    reason: null,
  });
  revalidatePath("/admin/support");
  return { ok: true };
}
