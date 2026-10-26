"use server";

import { guardAdminAction, type ActionFailure } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { listDirectoryUsers } from "@/lib/admin/users-directory";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import {
  likePattern,
  normalizeQuery,
  PER_GROUP,
  searchableGroups,
  snippet,
  TICKET_REF,
  UUID,
  type AdminSearchResult,
} from "@/lib/admin/search-core";

/**
 * ADMIN-UX-1 phase B — global search (Ctrl/Cmd+K). Existing guard (admin + staff) first; each group then follows its
 * target page's guard (users: admin only). Read-only; returns ids + short labels only — no data a role cannot already
 * see on the target page. Questions: id or text; users: email or username; tickets: ref or id.
 */
export type AdminSearchResponse = { ok: true; results: AdminSearchResult[] } | ActionFailure;

const log = (group: string, code: string | undefined) =>
  reportWriteFailure({ fn: "adminSearchAction", table: group, op: "select", code: code ?? null, ids: { group } });

export async function adminSearchAction(raw: string): Promise<AdminSearchResponse> {
  const auth = await guardAdminAction({ allowStaff: true });
  if (!auth.ok) return auth;
  const q = normalizeQuery(raw);
  if (!q) return { ok: true, results: [] };

  const sb = createAdminServerSupabaseClient();
  const groups = searchableGroups(auth.role, isSupportTicketsEnabled());
  const results: AdminSearchResult[] = [];

  // Questions — by id, or by text in any version (deduplicated per question)
  if (groups.includes("Questions")) {
    const { data, error } = UUID.test(q)
      ? await sb.from("question_versions").select("question_id, question_text, lifecycle_status").eq("question_id", q).limit(1)
      : await sb.from("question_versions").select("question_id, question_text, lifecycle_status").ilike("question_text", likePattern(q)).order("created_at", { ascending: false }).limit(PER_GROUP * 3);
    if (error) log("question_versions", error.code);
    const seen = new Set<string>();
    for (const r of data ?? []) {
      if (seen.has(r.question_id) || seen.size >= PER_GROUP) continue;
      seen.add(r.question_id);
      results.push({ group: "Questions", id: r.question_id, label: snippet(r.question_text), detail: r.lifecycle_status, href: `/admin/questions?question=${r.question_id}` });
    }
  }

  // Users — admin only (the /admin/users page is admin only): email via the service-role directory, then username
  if (groups.includes("Users")) {
    const byEmail = q.includes("@") || q.length >= 3 ? await listDirectoryUsers({ page: 1, query: q.toLowerCase() }) : null;
    const emails = new Set<string>();
    for (const u of (byEmail?.users ?? []).slice(0, PER_GROUP)) {
      emails.add(u.id);
      results.push({ group: "Users", id: u.id, label: u.email, detail: u.role, href: `/admin/users?q=${encodeURIComponent(u.email)}` });
    }
    const { data, error } = await sb.from("user_profiles").select("id, username").ilike("username", likePattern(q.replace(/^@/, ""))).limit(PER_GROUP);
    if (error) log("user_profiles", error.code);
    for (const p of data ?? []) {
      if (emails.has(p.id) || results.filter((r) => r.group === "Users").length >= PER_GROUP) continue;
      const { data: u } = await sb.auth.admin.getUserById(p.id);
      const email = u?.user?.email;
      if (!email) continue;
      results.push({ group: "Users", id: p.id, label: email, detail: `@${p.username}`, href: `/admin/users?q=${encodeURIComponent(email)}` });
    }
  }

  // Tickets — by ref (CL-YYMMDD-XXXXXX) or id
  if (groups.includes("Tickets")) {
    const ref = q.toUpperCase();
    const col = TICKET_REF.test(ref) ? "ref" : UUID.test(q) ? "id" : null;
    if (col) {
      const { data, error } = await sb.from("support_tickets").select("id, ref, subject, status").eq(col, col === "ref" ? ref : q).limit(1);
      if (error) log("support_tickets", error.code);
      for (const t of data ?? []) results.push({ group: "Tickets", id: t.id, label: `${t.ref} · ${snippet(t.subject, 60)}`, detail: t.status, href: `/admin/support#ticket-${t.id}` });
    }
  }

  return { ok: true, results };
}
