import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { SupportQueue } from "@/components/admin/support-queue";
import { Container } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

/** F11 (#79): staff support queue — newest first; status + reply only (the student's message is never edited). */
export default async function AdminSupportPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/support" });
  if (!isSupportTicketsEnabled()) {
    return (
      <Container className="py-8">
        <h1 className="text-h1 font-bold text-fg">Support tickets</h1>
        <p className="mt-2 text-body text-fg-secondary">Support tickets are switched off (SUPPORT_TICKETS_ENABLED). Students email us meanwhile.</p>
      </Container>
    );
  }
  const { data } = await createAdminServerSupabaseClient()
    .from("support_tickets")
    .select("id, ref, category, subject, message, status, staff_reply, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return <SupportQueue tickets={data ?? []} />;
}
