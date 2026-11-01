import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { formatDateShort } from "@/lib/format";
import { TICKET_CATEGORIES, TICKET_COPY as C, TICKET_STATUSES, isSupportTicketsEnabled, type TicketStatus } from "@/lib/support/tickets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: C.listTitle, robots: { index: false, follow: false } };

/** F11 (#79): the student's own tickets (RLS: own rows only) with status and our reply; ONE primary "New ticket". */
export default async function MyTicketsPage() {
  if (!isSupportTicketsEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") redirect("/auth/login?next=%2Fhelp%2Ftickets");
  const { data } = await supabase.from("support_tickets").select("id, ref, category, subject, status, staff_reply, created_at, updated_at").order("created_at", { ascending: false }).limit(50);
  const tickets = data ?? [];
  const label = (c: string) => TICKET_CATEGORIES.find((x) => x.value === c)?.label ?? c;

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-8 lg:py-10" data-my-tickets="">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold text-fg">{C.listTitle}</h1>
          <p className="text-body text-fg-secondary">{C.listLead}</p>
        </div>
        <ButtonLink href="/help/tickets/new" size="lg" className="min-h-12">
          {C.newTicket}
        </ButtonLink>
      </header>
      {tickets.length === 0 ? (
        <EmptyState icon={<LifeBuoy />} title={C.none} headingLevel={2} />
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-body-lg font-semibold text-fg">{t.subject}</h2>
                <span className="text-body-sm font-semibold text-fg">{TICKET_STATUSES[t.status as TicketStatus] ?? t.status}</span>
              </div>
              <p className="text-body-sm text-fg-secondary">
                {t.ref} · {label(t.category)} · sent {formatDateShort(t.created_at)}
              </p>
              {t.staff_reply && (
                <div className="rounded-control border border-line bg-surface-sunken p-3">
                  <p className="text-body-sm font-semibold text-fg">Our reply</p>
                  <p className="whitespace-pre-line text-body text-fg">{t.staff_reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
