import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import type { AdminRole, NavFlags } from "./nav";

/**
 * ADMIN-UX-1 phase B — the Today dashboard read model (READ ONLY, service role, called only from /admin after
 * requireAdminPage). Role-aware: a card exists only when the role can open its target page (admin-only pages →
 * admin-only cards), so Today never shows a count the role could not see on the page itself. Count-only queries
 * (head: true) except the audit list, which returns action / entity / time only — never actor e-mails or values.
 * Q5: no write-failure / nightly cards (no source the app can read; backlog OPS-EVENTS-1). A failed read shows
 * "Not available" for that card, never an invented number (R12).
 */
export type TodayTone = "waiting" | "calm";
export interface TodayCard {
  id: string;
  label: string;
  /** null = the read failed (shown as "Not available") */
  count: number | null;
  detail?: string | null;
  href: string;
  linkLabel: string;
  tone: TodayTone;
}
export interface TodayRecent {
  action: string;
  entity: string;
  at: string;
}
export interface TodayData {
  cards: TodayCard[];
  recent: TodayRecent[] | null;
  glance: { label: string; value: number | null }[];
}

type Admin = ReturnType<typeof createAdminServerSupabaseClient>;
type CountQuery = PromiseLike<{ count: number | null; error: { code?: string } | null }>;

async function count(id: string, q: CountQuery): Promise<number | null> {
  const { count: n, error } = await q;
  if (error) {
    reportWriteFailure({ fn: "AdminToday", table: id, op: "select", code: error.code ?? null, ids: { card: id } });
    return null;
  }
  return n ?? 0;
}

const DAY = 86400e3;
function ageLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return days <= 0 ? "oldest from today" : `oldest ${days} day${days === 1 ? "" : "s"} old`;
}

export async function getTodayData(role: AdminRole, flags: NavFlags): Promise<TodayData> {
  const sb: Admin = createAdminServerSupabaseClient();
  const isAdmin = role === "admin";
  const nowIso = new Date().toISOString();
  const head = { count: "exact" as const, head: true };

  const [qInReview, qApproved, caInReview, flagsPending, publishedQ, mocks] = await Promise.all([
    count("question_versions", sb.from("question_versions").select("id", head).eq("lifecycle_status", "IN_REVIEW")),
    count("question_versions", sb.from("question_versions").select("id", head).eq("lifecycle_status", "APPROVED")),
    count("current_affairs_articles", sb.from("current_affairs_articles").select("id", head).eq("status", "IN_REVIEW")),
    count("discussion_moderation_flags", sb.from("discussion_moderation_flags").select("id", head).eq("status", "PENDING")),
    count("questions", sb.from("questions").select("id", head).eq("status", "published")),
    count("mock_tests", sb.from("mock_tests").select("id", head).eq("status", "published").eq("is_dynamic", false)),
  ]);

  const cards: TodayCard[] = [
    {
      id: "question-drafts", label: "Question drafts awaiting review", count: qInReview,
      detail: qApproved === null ? null : `${qApproved} approved, waiting to publish`,
      href: "/admin/questions/factory?tab=review&status=IN_REVIEW", linkLabel: "Open the review queue", tone: (qInReview ?? 0) > 0 ? "waiting" : "calm",
    },
    {
      id: "ca-review", label: "Current affairs drafts in review", count: caInReview,
      href: "/admin/current-affairs?status=IN_REVIEW", linkLabel: "Review current affairs", tone: (caInReview ?? 0) > 0 ? "waiting" : "calm",
    },
  ];

  if (isAdmin) {
    const [open, oldest] = await Promise.all([
      count("question_errata_reports", sb.from("question_errata_reports").select("id", head).in("status", ["OPEN", "UNDER_REVIEW"])),
      sb.from("question_errata_reports").select("created_at").in("status", ["OPEN", "UNDER_REVIEW"]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    cards.push({
      id: "question-reports", label: "Open question reports", count: open, detail: open ? ageLabel(oldest.data?.created_at) : null,
      href: "/admin/question-reports?status=OPEN", linkLabel: "Handle reports", tone: (open ?? 0) > 0 ? "waiting" : "calm",
    });
  }

  if (flags.SUPPORT) {
    const dayAgo = new Date(Date.now() - DAY).toISOString();
    const [openT, lateT, grievances] = await Promise.all([
      count("support_tickets", sb.from("support_tickets").select("id", head).in("status", ["OPEN", "IN_PROGRESS"])),
      count("support_tickets", sb.from("support_tickets").select("id", head).eq("status", "OPEN").lt("created_at", dayAgo)),
      count("support_tickets", sb.from("support_tickets").select("id", head).eq("category", "GRIEVANCE").in("status", ["OPEN", "IN_PROGRESS"])),
    ]);
    cards.push({
      id: "tickets", label: "Open tickets", count: openT,
      detail: lateT === null ? null : lateT > 0 ? `${lateT} waiting longer than 24 hours` : "none waiting longer than 24 hours",
      href: "/admin/support?status=OPEN", linkLabel: "Answer tickets", tone: (lateT ?? 0) > 0 || (openT ?? 0) > 0 ? "waiting" : "calm",
    });
    cards.push({
      id: "grievances", label: "Open grievances", count: grievances,
      href: "/admin/support?category=GRIEVANCE", linkLabel: "Open grievances", tone: (grievances ?? 0) > 0 ? "waiting" : "calm",
    });
  }

  cards.push({
    id: "community-flags", label: "Community flags waiting", count: flagsPending,
    href: "/admin/community", linkLabel: "Moderate", tone: (flagsPending ?? 0) > 0 ? "waiting" : "calm",
  });

  if (isAdmin) {
    const ending = await count(
      "user_entitlements",
      sb.from("user_entitlements").select("id", head).eq("source", "LIBRARY").eq("is_active", true).is("revoked_at", null)
        .gt("expires_at", nowIso).lte("expires_at", new Date(Date.now() + 7 * DAY).toISOString()),
    );
    cards.push({ id: "library-ending", label: "Library Pro ending within 7 days", count: ending, href: "/admin/pro-library", linkLabel: "Library Pro", tone: "calm" });
  }

  let recent: TodayRecent[] | null = null;
  if (isAdmin) {
    const { data, error } = await sb.from("admin_audit_logs").select("action_type, target_entity, created_at").order("created_at", { ascending: false }).limit(8);
    if (error) reportWriteFailure({ fn: "AdminToday", table: "admin_audit_logs", op: "select", code: error.code ?? null, ids: { card: "recent" } });
    recent = error ? null : (data ?? []).map((r) => ({ action: r.action_type, entity: r.target_entity, at: r.created_at }));
  }

  return {
    cards,
    recent,
    glance: [
      { label: "Published questions", value: publishedQ },
      { label: "Published mock tests", value: mocks },
    ],
  };
}

/** "QUESTION_PUBLISHED" → "Question published" (audit action codes are shown, never values / e-mails). */
export function humanAction(code: string): string {
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
