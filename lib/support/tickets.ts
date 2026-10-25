/**
 * F11 (#79) support tickets — shared rules and copy (pure). The database is authoritative (migration 097:
 * fn_create_support_ticket validates the same limits); this keeps the form honest and instant.
 * Flag: SUPPORT_TICKETS_ENABLED (server env, off until 097 is applied).
 */
export const TICKET_CATEGORIES = [
  { value: "ACCOUNT", label: "My account or signing in" },
  { value: "TEST", label: "A mock test" },
  { value: "QUESTION", label: "A question or its answer" },
  { value: "PAYMENT", label: "Payments or plans" },
  { value: "DATA_PRIVACY", label: "My data or privacy" },
  { value: "GRIEVANCE", label: "A complaint (grievance)" },
  { value: "OTHER", label: "Something else" },
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]["value"];

export const TICKET_STATUSES = { OPEN: "Received", IN_PROGRESS: "Being looked at", RESOLVED: "Answered", CLOSED: "Closed" } as const;
export type TicketStatus = keyof typeof TICKET_STATUSES;

export const SUBJECT_MIN = 5;
export const SUBJECT_MAX = 120;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 3000;

export function isSupportTicketsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SUPPORT_TICKETS_ENABLED === "true";
}

export function validateTicket(input: { category: unknown; subject: unknown; message: unknown }): { ok: true; category: TicketCategory; subject: string; message: string } | { ok: false } {
  const category = TICKET_CATEGORIES.find((c) => c.value === input.category)?.value;
  const subject = String(input.subject ?? "").trim();
  const message = String(input.message ?? "").trim();
  if (!category || subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX || message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) return { ok: false };
  return { ok: true, category, subject, message };
}

export const TICKET_COPY = {
  listTitle: "My support tickets",
  listLead: "Tickets you sent us and their status. We reply here and by email.",
  newTicket: "New ticket",
  none: "You have not sent a ticket yet.",
  formTitle: "Send a support ticket",
  formLead: "Tell us what happened. Please do not include passwords or card details.",
  category: "What is it about?",
  subject: "Subject",
  message: "Message",
  submit: "Send ticket",
  sending: "Sending…",
  results: {
    CREATED: (ref: string) => `Ticket ${ref} sent. You can follow it under My support tickets.`,
    INVALID_INPUT: `Please choose a topic, write a subject (${SUBJECT_MIN}–${SUBJECT_MAX} characters) and a message (${MESSAGE_MIN}–${MESSAGE_MAX} characters).`,
    RATE_LIMITED: "You have sent several tickets in a short time. Please wait a little, or email us.",
    NOT_SIGNED_IN: "Sign in to send a ticket.",
    FAILED: "Could not send your ticket. Please try again, or email us.",
  },
} as const;
