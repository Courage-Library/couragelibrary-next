import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { isSupportTicketsEnabled, TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/support/tickets";
import { SupportQueue } from "@/components/admin/support-queue";
import { Container } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

/** F11 (#79): staff support queue — newest first; status + reply only (the student's message is never edited). */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string }> }) {
  await requireAdminPage({ allowStaff: true, path: "/admin/support" });
  const sp = await searchParams;
  if (!isSupportTicketsEnabled()) {
    return (
      <Container className="py-8">
        <h1 className="text-h1 font-bold text-fg">Support tickets</h1>
        <p className="mt-2 text-body text-fg-secondary">Support tickets are switched off (SUPPORT_TICKETS_ENABLED). Students email us meanwhile.</p>
      </Container>
    );
  }
  // ADMIN-UX-1 phase B: Today deep links (?status=OPEN, ?category=GRIEVANCE) — the same columns, known values only
  const status = Object.keys(TICKET_STATUSES).includes(String(sp.status)) ? String(sp.status) : null;
  const category = TICKET_CATEGORIES.some((c) => c.value === sp.category) ? String(sp.category) : null;
  let query = createAdminServerSupabaseClient()
    .from("support_tickets")
    .select("id, ref, category, subject, message, status, staff_reply, created_at")
    .order("created_at", { ascending: status === "OPEN" })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  const { data } = await query;
  return <SupportQueue tickets={data ?? []} filter={status || category ? [status && TICKET_STATUSES[status as keyof typeof TICKET_STATUSES], category && TICKET_CATEGORIES.find((c) => c.value === category)?.label].filter(Boolean).join(" · ") : null} />;
}
