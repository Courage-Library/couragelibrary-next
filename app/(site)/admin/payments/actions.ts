"use server";

import { revalidatePath } from "next/cache";
import { guardAdminAction } from "@/lib/auth/require-admin";
import type { ActionFailure } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { reportWriteFailure } from "@/lib/ops/write-failure";
import { PAYMENT_ID_RX, isRefundReason, REFUND_REASON_LABEL } from "@/lib/payments/refund-rules";

/**
 * PAY-1 B6 (owner D4 + F2 a): the admin records WHY a payment is refunded, BEFORE refunding it in the Razorpay dashboard.
 * ADMIN only. fn_pro_refund_approve (migration 151, service role) checks the input, refuses the 7-day reason unless the
 * order is eligible, keeps one open approval per payment and writes the audit row (actor, payment, reason).
 * The refund itself is made in the dashboard; its webhook links to this approval.
 */
export type RefundApprovalResult = { ok: true; message: string } | { ok: false; error: string } | ActionFailure;

const CODES: Record<string, string> = {
  INVALID_INPUT: "Enter a Razorpay payment id (pay_…), pick a reason and keep the note under 500 characters.",
  PAYMENT_NOT_FOUND: "No payment with that id was recorded.",
  ORDER_NOT_FOUND: "That payment does not belong to a Pro order.",
  NOT_ELIGIBLE: "This payment is not eligible for the 7-day refund. Pick another reason if a refund is still right.",
  ALREADY_APPROVED: "A refund is already recorded for this payment and is waiting for the dashboard refund.",
};

export async function recordRefundApprovalAction(payload: { paymentId: string; reason: string; note?: string }): Promise<RefundApprovalResult> {
  const auth = await guardAdminAction();
  if (!auth.ok) return auth;
  const paymentId = String(payload.paymentId ?? "").trim();
  const note = String(payload.note ?? "").trim().slice(0, 500);
  if (!PAYMENT_ID_RX.test(paymentId) || !isRefundReason(payload.reason)) return { ok: false, error: CODES.INVALID_INPUT };
  if (payload.reason === "GOODWILL" && note.length < 5) return { ok: false, error: "Say why in the note (a goodwill refund is outside the policy)." };
  const { data, error } = await createAdminServerSupabaseClient().rpc("fn_pro_refund_approve", {
    p_payment_id: paymentId,
    p_reason: payload.reason,
    p_note: note, // "" → NULL in the function (NULLIF(btrim(…), ''))
    p_admin_id: auth.userId,
    p_admin_email: auth.userEmail || "unknown",
  });
  if (error) {
    reportWriteFailure({ fn: "recordRefundApprovalAction", table: "pro_refund_approvals", op: "rpc", code: error.code, ids: { payment_id: paymentId } });
    return { ok: false, error: "The approval could not be saved. Please try again." };
  }
  const r = (data ?? {}) as { success?: boolean; code?: string };
  if (r.success !== true) return { ok: false, error: CODES[String(r.code)] ?? "The approval could not be saved." };
  revalidatePath("/admin/payments");
  return { ok: true, message: `Recorded: ${REFUND_REASON_LABEL[payload.reason]}. Now refund ${paymentId} in the Razorpay dashboard; this page shows it as refunded once the webhook arrives.` };
}
