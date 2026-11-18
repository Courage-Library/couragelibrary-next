import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { getAppEnv } from "@/config/env";
import { SUPPORT_EMAIL } from "@/content/support";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { getAppSettings, getProEnd, listProEnds } from "@/lib/payments/pro-server";
import { createZeptoMail } from "./zeptomail";
import { renderExpiry, renderReceipt, renderRefund, type RenderedEmail } from "./pro-templates";
import { sendEvent, type EmailDeps, type EmailEvent, type EmailJobDeps, type EmailMode, type SendResult } from "./pro-emails";

/**
 * PAY-1 B5 server wiring (service role; never imported by client components). Owner D8: ZeptoMail API, sender
 * no-reply@couragelibrary.in, replies to support. The token is read from the Vercel env (ZEPTOMAIL_TOKEN) and never
 * logged. Nothing is sent unless EMAIL_APP_ENABLED is "true" (DEPLOY-BEFORE-ACTIVATE). Logs: ids and codes only.
 */

export const EMAIL_FROM = "no-reply@couragelibrary.in";
export const EMAIL_FROM_NAME = "Courage Library";
/** E1 (owner, 2026-11-18): QA accounts (reserved .test domain) cannot receive mail — their e-mails go here. */
export const QA_INBOX = "qa@couragelibrary.in";
const EMAIL_JOB_NAME = "pro_emails";

const log: EmailDeps["log"] = (e) => reportWriteFailure({ fn: e.fn, table: "email_events", op: "update", code: e.code.slice(0, 40), ids: e.ids });

export function emailEnabled(): boolean {
  return process.env.EMAIL_APP_ENABLED === "true" && (process.env.ZEPTOMAIL_TOKEN ?? "").trim().length >= 20;
}

async function receiptOf(orderId: string) {
  const admin = createAdminServerSupabaseClient();
  const { data, error } = await admin
    .from("payment_receipts")
    .select("receipt_number, plan_code, amount_paise, period_end, created_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`RECEIPT_READ ${error.code ?? ""}`);
  return data;
}

/** The facts behind a refund id: an applied refund (payment_transactions.refund_ids) or an unapplied one (audit row). */
async function refundFacts(refundId: string): Promise<{ orderId: string; userId: string; mode: EmailMode; refundedTotalPaise: number; full: boolean; unapplied: boolean } | null> {
  const admin = createAdminServerSupabaseClient();
  const { data: txns, error } = await admin
    .from("payment_transactions")
    .select("order_id, refund_amount, status")
    .contains("gateway_response_json", { refund_ids: [refundId] })
    .limit(1);
  if (error) throw new Error(`REFUND_READ ${error.code ?? ""}`);
  let orderId: string | null = null;
  let refundedTotalPaise = 0;
  let full = false;
  let unapplied = false;
  if (txns && txns[0]?.order_id) {
    orderId = txns[0].order_id;
    refundedTotalPaise = Math.round(Number(txns[0].refund_amount ?? 0) * 100);
    full = txns[0].status === "REFUNDED";
  } else {
    const { data: flags, error: e2 } = await admin
      .from("admin_audit_logs")
      .select("target_id, new_value")
      .eq("action_type", "PRO_UNAPPLIED_PAYMENT_REFUNDED")
      .eq("new_value->>refund_id", refundId)
      .limit(1);
    if (e2) throw new Error(`REFUND_READ ${e2.code ?? ""}`);
    const f = flags?.[0];
    if (!f?.target_id) return null;
    orderId = f.target_id;
    refundedTotalPaise = Number((f.new_value as Record<string, unknown> | null)?.refund_paise ?? 0);
    unapplied = true;
  }
  const { data: order, error: e3 } = await admin.from("payment_orders").select("user_id, gateway_mode").eq("id", orderId).maybeSingle();
  if (e3) throw new Error(`ORDER_READ ${e3.code ?? ""}`);
  if (!order?.user_id) return null;
  return { orderId: orderId as string, userId: order.user_id, mode: order.gateway_mode === "test" ? "test" : "live", refundedTotalPaise, full, unapplied };
}

async function load(ev: EmailEvent, ctx: Parameters<EmailDeps["load"]>[1]): Promise<RenderedEmail | null | "STALE"> {
  if (ev.kind === "PRO_RECEIPT") {
    const r = await receiptOf(ev.key.slice("receipt:".length));
    if (!r) return null;
    const [end, settings] = await Promise.all([getProEnd(ev.userId), getAppSettings()]);
    const proUntil = end.endsAt && new Date(end.endsAt) > new Date(r.period_end) ? end.endsAt : r.period_end;
    return renderReceipt(
      { receiptNumber: r.receipt_number, planCode: r.plan_code, amountPaise: r.amount_paise, paidAt: r.created_at, proUntil, gstRegistered: settings.gstRegistered },
      ctx,
    );
  }
  if (ev.kind === "PRO_EXPIRY_D7" || ev.kind === "PRO_EXPIRY_D1") {
    const sec = Number(ev.key.split(":").pop());
    const end = await getProEnd(ev.userId);
    // renewed, refunded or made open-ended since: the reminder is no longer true
    if (end.unlimited || !end.endsAt || Math.abs(new Date(end.endsAt).getTime() / 1000 - sec) > 60) return "STALE";
    return renderExpiry(ev.kind, { endsAt: end.endsAt }, ctx);
  }
  const f = await refundFacts(ev.key.slice("refund:".length));
  if (!f) return null;
  const [r, end] = await Promise.all([receiptOf(f.orderId), getProEnd(ev.userId)]);
  return renderRefund({ receiptNumber: r?.receipt_number ?? null, refundedTotalPaise: f.refundedTotalPaise, full: f.full, unapplied: f.unapplied, proUntil: end.unlimited ? null : end.endsAt }, ctx);
}

function emailDeps(): EmailDeps {
  const admin = createAdminServerSupabaseClient();
  return {
    enabled: emailEnabled(),
    transport: createZeptoMail({
      token: process.env.ZEPTOMAIL_TOKEN ?? "",
      identity: { from: EMAIL_FROM, fromName: EMAIL_FROM_NAME, replyTo: SUPPORT_EMAIL },
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    }),
    ctx: { siteUrl: getAppEnv().siteUrl, supportEmail: SUPPORT_EMAIL },
    qaInbox: QA_INBOX,
    getUserEmail: async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw new Error("USER_READ");
      return data.user?.email ?? null;
    },
    load,
    claim: async (ev) => {
      const { data, error } = await admin
        .from("email_events")
        .insert({ kind: ev.kind, event_key: ev.key, user_id: ev.userId, gateway_mode: ev.mode, status: "CLAIMED" })
        .select("id")
        .single();
      if (error) {
        if (error.code !== "23505") log({ fn: "email.claim", code: error.code ?? "UNKNOWN", ids: { user_id: ev.userId } });
        return null;
      }
      return { id: data.id };
    },
    reclaim: async (id) => {
      const { data: row } = await admin.from("email_events").select("attempts, status").eq("id", id).maybeSingle();
      if (!row || row.status !== "FAILED" || row.attempts >= 3) return false;
      const { data, error } = await admin
        .from("email_events")
        .update({ status: "CLAIMED", attempts: row.attempts + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "FAILED")
        .eq("attempts", row.attempts)
        .select("id");
      return !error && (data ?? []).length === 1;
    },
    finish: async (id, status, info) => {
      const now = new Date().toISOString();
      const { error } = await admin
        .from("email_events")
        .update({ status, provider_ref: info.ref ?? null, error_code: info.code ?? null, updated_at: now, ...(status === "SENT" ? { sent_at: now } : {}) })
        .eq("id", id)
        .eq("status", "CLAIMED");
      if (error) log({ fn: "email.finish", code: error.code ?? "UNKNOWN", ids: { email_event_id: id } });
    },
    log,
  };
}

/** The immediate send right after an activation (receipt). Never throws; the job catches up a miss. */
export async function sendProEmailNow(ev: EmailEvent): Promise<SendResult> {
  try {
    return await sendEvent(ev, emailDeps());
  } catch {
    log({ fn: "email.sendNow", code: "THROWN", ids: { user_id: ev.userId } });
    return "ERROR";
  }
}

/** The immediate refund confirmation after a refund is recorded. Never throws. */
export async function sendRefundEmailNow(refundId: string): Promise<SendResult> {
  try {
    if (!emailEnabled()) return "OFF";
    const f = await refundFacts(refundId);
    if (!f) return "NO_DATA";
    return await sendEvent({ kind: "PRO_REFUND", key: `refund:${refundId}`, userId: f.userId, mode: f.mode }, emailDeps());
  } catch {
    log({ fn: "email.refundNow", code: "THROWN", ids: { refund_id: refundId } });
    return "ERROR";
  }
}

/** The e-mail job's wiring (POST /api/cron/emails). */
export function getEmailJobDeps(): EmailJobDeps {
  const admin = createAdminServerSupabaseClient();
  const base = emailDeps();
  const modesOf = async (orderIds: string[]) => {
    const m = new Map<string, { userId: string; mode: EmailMode }>();
    if (!orderIds.length) return m;
    const { data, error } = await admin.from("payment_orders").select("id, user_id, gateway_mode").in("id", orderIds);
    if (error) throw new Error(`ORDER_READ ${error.code ?? ""}`);
    for (const o of data ?? []) m.set(o.id, { userId: o.user_id, mode: o.gateway_mode === "test" ? "test" : "live" });
    return m;
  };
  return {
    ...base,
    acquireLease: async (holder, seconds) => {
      const { data, error } = await admin.rpc("fn_payment_job_lease", { p_job: EMAIL_JOB_NAME, p_holder: holder, p_seconds: seconds });
      if (error) log({ fn: "email.lease", code: error.code ?? "UNKNOWN", ids: {} });
      return !error && data === true;
    },
    releaseLease: async (holder) => {
      await admin.rpc("fn_payment_job_lease", { p_job: EMAIL_JOB_NAME, p_holder: holder, p_seconds: 0 });
    },
    newHolder: () => randomUUID(),
    now: () => new Date(),
    expireClaims: async (olderThan) => {
      const { data, error } = await admin
        .from("email_events")
        .update({ status: "UNKNOWN", error_code: "STALE_CLAIM", updated_at: new Date().toISOString() })
        .eq("status", "CLAIMED")
        .lt("updated_at", olderThan.toISOString())
        .select("id");
      if (error) throw new Error(`EMAIL_EXPIRE ${error.code ?? ""}`);
      return (data ?? []).length;
    },
    listReceipts: async (since, limit) => {
      const { data, error } = await admin
        .from("payment_receipts")
        .select("order_id")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`RECEIPTS_READ ${error.code ?? ""}`);
      const ids = (data ?? []).map((r) => r.order_id).filter((x): x is string => !!x);
      const m = await modesOf(ids);
      return ids.flatMap((id) => (m.has(id) ? [{ kind: "PRO_RECEIPT" as const, key: `receipt:${id}`, userId: m.get(id)!.userId, mode: m.get(id)!.mode }] : []));
    },
    listRefunds: async (since, limit) => {
      const [txns, flags] = await Promise.all([
        admin.from("payment_transactions").select("order_id, gateway_response_json").gt("refund_amount", 0).gte("updated_at", since.toISOString()).limit(limit),
        admin.from("admin_audit_logs").select("target_id, new_value").eq("action_type", "PRO_UNAPPLIED_PAYMENT_REFUNDED").gte("created_at", since.toISOString()).limit(limit),
      ]);
      if (txns.error || flags.error) throw new Error(`REFUNDS_READ ${(txns.error ?? flags.error)?.code ?? ""}`);
      const pairs: Array<{ orderId: string; refundId: string }> = [];
      for (const t of txns.data ?? []) {
        const ids = (t.gateway_response_json as { refund_ids?: unknown } | null)?.refund_ids;
        if (t.order_id && Array.isArray(ids)) for (const r of ids) if (typeof r === "string") pairs.push({ orderId: t.order_id, refundId: r });
      }
      for (const f of flags.data ?? []) {
        const r = (f.new_value as Record<string, unknown> | null)?.refund_id;
        if (f.target_id && typeof r === "string") pairs.push({ orderId: f.target_id, refundId: r });
      }
      const m = await modesOf([...new Set(pairs.map((p) => p.orderId))]);
      return pairs.flatMap((p) => (m.has(p.orderId) ? [{ kind: "PRO_REFUND" as const, key: `refund:${p.refundId}`, userId: m.get(p.orderId)!.userId, mode: m.get(p.orderId)!.mode }] : []));
    },
    listProEnds,
    listRetries: async (olderThan, limit) => {
      const { data, error } = await admin
        .from("email_events")
        .select("id, kind, event_key, user_id, gateway_mode")
        .eq("status", "FAILED")
        .lt("attempts", 3)
        .lt("updated_at", olderThan.toISOString())
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`RETRIES_READ ${error.code ?? ""}`);
      return (data ?? []).map((r) => ({ id: r.id, kind: r.kind as EmailEvent["kind"], key: r.event_key, userId: r.user_id, mode: r.gateway_mode === "test" ? "test" : "live" }));
    },
    existingKeys: async (keys) => {
      const out = new Set<string>();
      for (let i = 0; i < keys.length; i += 100) {
        const { data, error } = await admin.from("email_events").select("event_key").in("event_key", keys.slice(i, i + 100));
        if (error) throw new Error(`EMAIL_KEYS_READ ${error.code ?? ""}`);
        for (const r of data ?? []) out.add(r.event_key);
      }
      return out;
    },
  };
}
