"use client";

/** F11 admin: support queue — set status and reply (audited server action); the student's text is read-only. */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { updateTicketAction } from "@/app/help/tickets/actions";
import { TICKET_CATEGORIES, TICKET_STATUSES, type TicketStatus } from "@/lib/support/tickets";

type Ticket = { id: string; ref: string; category: string; subject: string; message: string; status: string; staff_reply: string | null; created_at: string };

export function SupportQueue({ tickets }: { tickets: Ticket[] }) {
  return (
    <Container className="flex max-w-5xl flex-col gap-6 py-8">
      <h1 className="text-h1 font-bold text-fg">Support tickets</h1>
      {tickets.length === 0 ? <p className="text-body text-fg-secondary">No tickets.</p> : <ul className="flex flex-col gap-4">{tickets.map((t) => <Row key={t.id} t={t} />)}</ul>}
    </Container>
  );
}

function Row({ t }: { t: Ticket }) {
  const [status, setStatus] = useState(t.status);
  const [reply, setReply] = useState(t.staff_reply ?? "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-body-lg font-semibold text-fg">{t.subject}</h2>
        <span className="text-body-sm text-fg-secondary">
          {t.ref} · {TICKET_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category} · {new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </span>
      </div>
      <p className="whitespace-pre-line rounded-control bg-surface-sunken p-3 text-body text-fg">{t.message}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={`st-${t.id}`} className="text-body-sm font-medium text-fg">
            Status
          </label>
          <select id={`st-${t.id}`} className="focus-ring min-h-12 rounded-control border border-line-control bg-surface px-3 text-body text-fg" value={status} onChange={(e) => setStatus(e.target.value)}>
            {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUSES[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`re-${t.id}`} className="text-body-sm font-medium text-fg">
            Reply to the student
          </label>
          <textarea id={`re-${t.id}`} rows={3} maxLength={3000} className="focus-ring min-h-12 rounded-control border border-line-control bg-surface px-3 py-2 text-body text-fg" value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <Button variant="secondary" className="min-h-12" disabled={pending} onClick={() => start(async () => setNote((await updateTicketAction({ id: t.id, status, reply }).catch(() => ({ ok: false }))).ok ? "Saved." : "Could not save."))}>
          Save
        </Button>
      </div>
      <p role="status" className="text-body-sm text-fg-secondary">
        {note}
      </p>
    </li>
  );
}
