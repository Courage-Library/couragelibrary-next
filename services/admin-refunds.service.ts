import "server-only";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { parseEligibility, parseLookup, type RefundEligibility } from "@/lib/payments/refund-rules";

/**
 * PAY-1 B6 "Refund check" on /admin/payments (owner F7 a). Admin only (the page calls requireAdminPage first). Reads with
 * the service role: the eligibility comes from fn_pro_refund_eligibility (migration 151) — the rules live there.
 *   - recent: live PRO orders paid in the last 7 days, each with its eligibility
 *   - lookup: one order by Razorpay payment id or receipt number
 *   - unrecorded: refunds that arrived without an approval (refund_kind UNRECORDED, last 30 days)
 * No names or e-mail addresses are read; the admin sees ids, amounts, dates and the reasons.
 */

export interface RefundCheckRow extends RefundEligibility {
  receiptNumber: string | null;
}

export interface RefundCheck {
  recent: RefundCheckRow[];
  lookup: { query: string; row: RefundCheckRow | null; error: string | null } | null;
  unrecorded: Array<{ orderId: string; refundId: string | null; refundPaise: number | null; createdAt: string }>;
  error: boolean;
}

async function eligibilityOf(orderIds: string[]): Promise<RefundCheckRow[]> {
  const admin = createAdminServerSupabaseClient();
  const rows = await Promise.all(
    orderIds.map(async (id) => {
      const { data, error } = await admin.rpc("fn_pro_refund_eligibility", { p_order_id: id });
      if (error) {
        reportWriteFailure({ fn: "AdminRefunds.eligibility", table: "payment_orders", op: "rpc", code: error.code, ids: { order_id: id } });
        return null;
      }
      return parseEligibility(data);
    }),
  );
  const ok = rows.filter((r): r is RefundEligibility => !!r && r.found);
  const { data: receipts } = ok.length
    ? await admin.from("payment_receipts").select("order_id, receipt_number").in("order_id", ok.map((r) => r.order_id as string))
    : { data: [] as Array<{ order_id: string; receipt_number: string }> };
  const byOrder = new Map((receipts ?? []).map((r) => [r.order_id, r.receipt_number]));
  return ok.map((r) => ({ ...r, receiptNumber: byOrder.get(r.order_id as string) ?? null }));
}

export async function getRefundCheck(rawLookup?: string | null): Promise<RefundCheck> {
  const admin = createAdminServerSupabaseClient();
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const out: RefundCheck = { recent: [], lookup: null, unrecorded: [], error: false };

  const { data: txns, error } = await admin
    .from("payment_transactions")
    .select("order_id, captured_at, payment_orders!inner(order_type, gateway_mode)")
    .gte("captured_at", since)
    .eq("payment_orders.order_type", "PRO_PLAN")
    .eq("payment_orders.gateway_mode", "live")
    .order("captured_at", { ascending: false })
    .limit(50);
  if (error) {
    reportWriteFailure({ fn: "AdminRefunds.recent", table: "payment_transactions", op: "select", code: error.code, ids: {} });
    out.error = true;
  } else {
    out.recent = await eligibilityOf([...new Set((txns ?? []).map((t) => t.order_id))]);
  }

  if (rawLookup && rawLookup.trim()) {
    const q = parseLookup(rawLookup);
    if (!q) out.lookup = { query: rawLookup.trim().slice(0, 60), row: null, error: "Enter a Razorpay payment id (pay_…) or a receipt number (CL-R-…)." };
    else {
      let orderId: string | null = null;
      if (q.kind === "payment") {
        const { data } = await admin.from("payment_transactions").select("order_id").eq("gateway_payment_id", q.value).maybeSingle();
        orderId = data?.order_id ?? null;
        if (!orderId) {
          const { data: flag } = await admin
            .from("admin_audit_logs")
            .select("target_id")
            .in("action_type", ["PRO_DOUBLE_CHARGE", "PRO_PAYMENT_TO_REFUND"])
            .eq("new_value->>payment_id", q.value)
            .limit(1);
          if (flag?.[0]?.target_id) {
            out.lookup = { query: q.value, row: null, error: "No Pro was granted for this payment (a double charge / an order that cannot be fulfilled). Record it as DOUBLE_CHARGE or NOT_ACTIVATED below, then refund it in the dashboard." };
          }
        }
      } else {
        const { data } = await admin.from("payment_receipts").select("order_id").eq("receipt_number", q.value).maybeSingle();
        orderId = data?.order_id ?? null;
      }
      if (!out.lookup) {
        const [row] = orderId ? await eligibilityOf([orderId]) : [];
        out.lookup = { query: q.value, row: row ?? null, error: row ? null : "No Pro payment found for that id." };
      }
    }
  }

  const { data: logs } = await admin
    .from("admin_audit_logs")
    .select("target_id, new_value, created_at")
    .in("action_type", ["PRO_ORDER_REFUNDED", "PRO_ORDER_PARTIALLY_REFUNDED"])
    .eq("new_value->>refund_kind", "UNRECORDED")
    .gte("created_at", new Date(Date.now() - 30 * 86400e3).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  out.unrecorded = (logs ?? []).map((l) => {
    const v = (l.new_value ?? {}) as Record<string, unknown>;
    return { orderId: l.target_id ?? "", refundId: typeof v.refund_id === "string" ? v.refund_id : null, refundPaise: typeof v.refund_paise === "number" ? v.refund_paise : null, createdAt: l.created_at };
  });
  return out;
}
