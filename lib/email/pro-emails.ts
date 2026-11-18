/**
 * PAY-1 B5 — the send-once core for the transactional e-mails (owner D8 + E1–E7, 2026-11-18). Pure: every database /
 * network step is injected, so the offline gate drives this exact code with fakes.
 *
 * At most once per event (owner rule):
 *   1. resolve the recipient and render the message (a read failure records nothing → the job tries again later)
 *   2. CLAIM the event: insert email_events(event_key UNIQUE). A second attempt for the same event finds the row → stop.
 *   3. send through ZeptoMail, then record the outcome:
 *        SENT · FAILED (the API refused it → the job retries, at most 3 attempts in all) ·
 *        UNKNOWN (no clear answer → never retried, listed for the owner on /admin/payments; E3)
 *   A claim left CLAIMED by a crash (older than 10 min) becomes UNKNOWN — it may have been sent.
 * Recipients (E1): a QA account (reserved .test domain, cannot receive mail) → the QA inbox, the subject names the QA
 * account; a TEST-mode event for any other account → SUPPRESSED (never mailed); no address → SUPPRESSED.
 * Logs: ids and codes only — never an address, a name or a message.
 */
import { isQaIdentity } from "../qa/fixtures";
import type { EmailContext, ProEmailKind, RenderedEmail } from "./pro-templates";
import type { MailTransport } from "./zeptomail";

export type EmailMode = "test" | "live";

export interface EmailEvent {
  kind: ProEmailKind;
  /** receipt:<order id> · refund:<gateway refund id> · expiry:D7|D1:<user id>:<end, epoch seconds> */
  key: string;
  userId: string;
  mode: EmailMode;
}

export type EmailStatus = "SENT" | "FAILED" | "UNKNOWN" | "SUPPRESSED";

export interface EmailLog {
  fn: string;
  code: string;
  ids: Record<string, string | null | undefined>;
}

export interface EmailDeps {
  /** EMAIL_APP_ENABLED and a token: off → nothing is claimed or sent (the job catches up once it is on). */
  enabled: boolean;
  transport: MailTransport;
  ctx: Omit<EmailContext, "qaFor">;
  qaInbox: string;
  getUserEmail(userId: string): Promise<string | null>;
  /** Reads the facts for this event and renders it; null = the facts are not readable now; STALE = no longer due. */
  load(ev: EmailEvent, ctx: EmailContext): Promise<RenderedEmail | null | "STALE">;
  /** Insert the event row (status CLAIMED). null = it already exists (another run has it). */
  claim(ev: EmailEvent): Promise<{ id: string } | null>;
  /** FAILED → CLAIMED with attempts + 1, only while attempts < 3. false = someone else took it / no attempts left. */
  reclaim(id: string): Promise<boolean>;
  finish(id: string, status: EmailStatus, info: { ref?: string; code?: string }): Promise<void>;
  log(e: EmailLog): void;
}

export const EMAIL_JOB = { leaseSeconds: 120, maxSends: 25, lookBackDays: 7, retryAfterMinutes: 30, staleClaimMinutes: 10, maxAttempts: 3, reminderHourIst: 9 } as const;

export type SendResult = "OFF" | "NO_DATA" | "STALE" | "DUPLICATE" | "SUPPRESSED" | "SENT" | "FAILED" | "UNKNOWN" | "ERROR";

const keyId = (key: string) => key.slice(0, 80);

/** One event, at most once. `retryOf` = the id of a FAILED row being retried (reclaimed instead of inserted). */
export async function sendEvent(ev: EmailEvent, deps: EmailDeps, retryOf?: string): Promise<SendResult> {
  if (!deps.enabled) return "OFF";
  let address: string | null;
  try {
    address = await deps.getUserEmail(ev.userId);
  } catch {
    deps.log({ fn: "email.sendEvent", code: "USER_READ", ids: { user_id: ev.userId, key: keyId(ev.key) } });
    return "ERROR";
  }
  const qa = isQaIdentity(address);
  let suppress: string | null = null;
  if (!address) suppress = "NO_ADDRESS";
  else if (ev.mode === "test" && !qa) suppress = "TEST_NON_QA";
  const ctx: EmailContext = { ...deps.ctx, qaFor: qa ? address : null };

  let msg: RenderedEmail | null | "STALE" = null;
  if (!suppress) {
    try {
      msg = await deps.load(ev, ctx);
    } catch {
      msg = null;
    }
    if (msg === null) {
      deps.log({ fn: "email.sendEvent", code: "NO_DATA", ids: { user_id: ev.userId, key: keyId(ev.key) } });
      return "NO_DATA";
    }
  }

  // claim (or take back a FAILED row for a retry)
  let id: string;
  if (retryOf) {
    if (!(await deps.reclaim(retryOf))) return "DUPLICATE";
    id = retryOf;
  } else {
    const c = await deps.claim(ev);
    if (!c) return "DUPLICATE";
    id = c.id;
  }
  if (suppress) {
    await deps.finish(id, "SUPPRESSED", { code: suppress });
    return "SUPPRESSED";
  }
  if (msg === "STALE") {
    await deps.finish(id, "SUPPRESSED", { code: "STALE" });
    return "STALE";
  }
  const m = msg as RenderedEmail;
  const out = await deps.transport.send({ to: qa ? deps.qaInbox : (address as string), subject: m.subject, html: m.html, text: m.text });
  if (out.kind === "SENT") {
    await deps.finish(id, "SENT", { ref: out.ref });
    return "SENT";
  }
  await deps.finish(id, out.kind, { code: out.code });
  deps.log({ fn: "email.sendEvent", code: `${out.kind}:${out.code}`, ids: { user_id: ev.userId, key: keyId(ev.key) } });
  return out.kind;
}

// ------------------------------------------------------------------ the job (reminders + catch-up + retries)
export interface ProEnd {
  userId: string;
  /** The user's overall Pro end (renewals stack: the latest end of every active paid / granted Pro). */
  endsAt: string;
  mode: EmailMode;
}

export interface EmailJobDeps extends EmailDeps {
  acquireLease(holder: string, seconds: number): Promise<boolean>;
  releaseLease(holder: string): Promise<void>;
  newHolder(): string;
  now(): Date;
  /** CLAIMED rows older than the cut-off → UNKNOWN (a crash after the claim: it may have been sent). Returns how many. */
  expireClaims(olderThan: Date): Promise<number>;
  /** Receipts created since `since` (key receipt:<order id>). */
  listReceipts(since: Date, limit: number): Promise<EmailEvent[]>;
  /** Refunds recorded since `since` (key refund:<gateway refund id>). */
  listRefunds(since: Date, limit: number): Promise<EmailEvent[]>;
  /** Users whose overall Pro end is in (from, to]; open-ended Pro is never listed. */
  listProEnds(from: Date, to: Date, limit: number): Promise<ProEnd[]>;
  /** FAILED rows with attempts left, last touched before `olderThan`. */
  listRetries(olderThan: Date, limit: number): Promise<Array<EmailEvent & { id: string }>>;
  /** Which of these keys already have a row. */
  existingKeys(keys: string[]): Promise<Set<string>>;
}

export interface EmailJobSummary {
  outcome: "done" | "busy" | "off";
  expiredClaims: number;
  reminders: boolean;
  counts: Partial<Record<SendResult, number>>;
}

/** D7 / D1 for a Pro end: ≤ 1 day left → D1 (a missed D7 is not sent late); ≤ 7 days → D7; else nothing. */
export function reminderFor(end: ProEnd, now: Date): EmailEvent | null {
  const ms = new Date(end.endsAt).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const days = ms / 86400e3;
  const kind = days <= 1 ? "PRO_EXPIRY_D1" : days <= 7 ? "PRO_EXPIRY_D7" : null;
  if (!kind) return null;
  const sec = Math.floor(new Date(end.endsAt).getTime() / 1000);
  return { kind, key: `expiry:${kind === "PRO_EXPIRY_D1" ? "D1" : "D7"}:${end.userId}:${sec}`, userId: end.userId, mode: end.mode };
}

/** E5: reminders go out from 09:00 India time (a run before that leaves them for the next run of the day). */
export const reminderHourReached = (now: Date) => new Date(now.getTime() + 5.5 * 3600e3).getUTCHours() >= EMAIL_JOB.reminderHourIst;

export async function runEmailJob(deps: EmailJobDeps): Promise<EmailJobSummary> {
  const sum: EmailJobSummary = { outcome: "off", expiredClaims: 0, reminders: false, counts: {} };
  if (!deps.enabled) return sum;
  const holder = deps.newHolder();
  if (!(await deps.acquireLease(holder, EMAIL_JOB.leaseSeconds))) return { ...sum, outcome: "busy" };
  sum.outcome = "done";
  let budget: number = EMAIL_JOB.maxSends;
  const tally = (r: SendResult) => {
    sum.counts[r] = (sum.counts[r] ?? 0) + 1;
    if (r !== "DUPLICATE" && r !== "OFF") budget--;
  };
  try {
    const now = deps.now();
    sum.expiredClaims = await deps.expireClaims(new Date(now.getTime() - EMAIL_JOB.staleClaimMinutes * 60e3));
    const since = new Date(now.getTime() - EMAIL_JOB.lookBackDays * 86400e3);

    // catch-up: receipts and refund confirmations the immediate send missed (a crash, the switch was off, …)
    const fresh: EmailEvent[] = [...(await deps.listReceipts(since, EMAIL_JOB.maxSends)), ...(await deps.listRefunds(since, EMAIL_JOB.maxSends))];
    sum.reminders = reminderHourReached(now);
    if (sum.reminders) {
      for (const e of await deps.listProEnds(now, new Date(now.getTime() + 7 * 86400e3), EMAIL_JOB.maxSends * 4)) {
        const r = reminderFor(e, now);
        if (r) fresh.push(r);
      }
    }
    const have = fresh.length ? await deps.existingKeys(fresh.map((e) => e.key)) : new Set<string>();
    for (const ev of fresh) {
      if (budget <= 0) break;
      if (have.has(ev.key)) continue;
      tally(await sendEvent(ev, deps));
    }
    // retries of FAILED sends (the API answered, nothing was sent)
    for (const r of await deps.listRetries(new Date(now.getTime() - EMAIL_JOB.retryAfterMinutes * 60e3), EMAIL_JOB.maxSends)) {
      if (budget <= 0) break;
      tally(await sendEvent(r, deps, r.id));
    }
  } finally {
    await deps.releaseLease(holder);
  }
  return sum;
}
