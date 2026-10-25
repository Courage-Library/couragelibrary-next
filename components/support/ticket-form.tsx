"use client";

/** F11 ticket form: one primary action, plain English, results announced; no passwords / card details asked for. */
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createTicketAction } from "@/app/help/tickets/actions";
import { MESSAGE_MAX, SUBJECT_MAX, TICKET_CATEGORIES, TICKET_COPY as C, validateTicket } from "@/lib/support/tickets";

const field = "focus-ring min-h-12 w-full rounded-control border border-line-control bg-surface px-3 text-body text-fg";

export function TicketForm() {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string>("");
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = validateTicket({ category, subject, message }).ok;

  if (sentRef) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6" data-ticket-sent="">
        <p className="text-body text-fg">{C.results.CREATED(sentRef)}</p>
        <Link href="/help/tickets" className="focus-ring inline-flex min-h-12 w-fit items-center text-body-sm font-medium text-link underline underline-offset-2">
          {C.listTitle}
        </Link>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createTicketAction({ category, subject, message }).catch(() => ({ code: "FAILED" as const }));
          if (r.code === "CREATED") setSentRef(r.ref);
          else setResult(C.results[r.code]);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="ticket-category" className="text-body-sm font-medium text-fg">
          {C.category}
        </label>
        <select id="ticket-category" className={field} value={category} onChange={(e) => setCategory(e.target.value)} required>
          <option value="">Choose a topic</option>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ticket-subject" className="text-body-sm font-medium text-fg">
          {C.subject}
        </label>
        <input id="ticket-subject" className={field} value={subject} maxLength={SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ticket-message" className="text-body-sm font-medium text-fg">
          {C.message}
        </label>
        <textarea id="ticket-message" className={`${field} py-2`} rows={6} value={message} maxLength={MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} required />
        <span className="text-body-sm text-fg-secondary">
          {message.length}/{MESSAGE_MAX}
        </span>
      </div>
      <div>
        <Button type="submit" size="lg" className="min-h-12" disabled={!valid || pending}>
          {pending ? C.sending : C.submit}
        </Button>
      </div>
      <p role="status" className="text-body-sm text-fg-secondary">
        {result}
      </p>
    </form>
  );
}
