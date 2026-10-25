import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { TicketForm } from "@/components/support/ticket-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isSupportTicketsEnabled, TICKET_COPY as C } from "@/lib/support/tickets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: C.formTitle, robots: { index: false, follow: false } };

/** F11 (#79): new support ticket. Signed-in only; flag off → 404. */
export default async function NewTicketPage() {
  if (!isSupportTicketsEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") redirect("/auth/login?next=%2Fhelp%2Ftickets%2Fnew");
  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-8 lg:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">{C.formTitle}</h1>
        <p className="text-body text-fg-secondary">{C.formLead}</p>
      </header>
      <TicketForm />
    </Container>
  );
}
