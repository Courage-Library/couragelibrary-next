"use client";

import React, { useState, useTransition } from "react";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { ShieldCheck } from "lucide-react";
import { recordRefundApprovalAction } from "@/app/(site)/admin/payments/actions";
import { ELIGIBILITY_NOTE_LABEL, ELIGIBILITY_REASON_LABEL, REFUND_REASONS, REFUND_REASON_LABEL, type RefundReason } from "@/lib/payments/refund-rules";
import type { RefundCheck, RefundCheckRow } from "@/services/admin-refunds.service";

/**
 * PAY-1 B6 "Refund check" (owner F7 a, D4): eligibility for the 7-day refund (computed on the server by
 * fn_pro_refund_eligibility), a lookup by payment id / receipt number, and "Record refund reason" — the admin records
 * why BEFORE refunding in the Razorpay dashboard. Refunds that arrived with no recorded reason are listed for review.
 */

const rupees = (p?: number | null) => (typeof p === "number" ? `₹${(p / 100).toFixed(2)}` : "—");
const when = (s?: string) => (s ? new Date(s).toLocaleString() : "—");

function Row({ r }: { r: RefundCheckRow }) {
  return (
    <div className="p-3 rounded-lg border border-slate-100 text-xs space-y-1" data-refund-row="">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-bold text-slate-900 font-mono">{r.payment_id ?? "—"}</span>
          {r.receiptNumber && <span className="text-slate-600 font-mono ml-2">{r.receiptNumber}</span>}
          {r.mode === "test" && <Badge variant="warning" className="text-[10px] ml-2">TEST</Badge>}
          <p className="text-[10px] text-slate-600 font-mono">
            paid {when(r.paid_at)} · {rupees(r.amount_paise)} · Pro mocks submitted since: {r.pro_mocks_submitted ?? "—"}
            {r.refunded_paise ? ` · refunded ${rupees(r.refunded_paise)}` : ""}
          </p>
        </div>
        <Badge variant={r.eligible ? "success" : "warning"} className="text-[10px] shrink-0">
          {r.eligible ? "7-DAY REFUND: ELIGIBLE" : "7-DAY REFUND: NO"}
        </Badge>
      </div>
      {r.reasons.length > 0 && (
        <ul className="text-[11px] text-slate-700 list-disc pl-5">
          {r.reasons.map((x) => <li key={x}>{ELIGIBILITY_REASON_LABEL[x] ?? x}</li>)}
        </ul>
      )}
      {(r.notes ?? []).length > 0 && (
        <ul className="text-[11px] text-slate-600 list-disc pl-5">
          {(r.notes ?? []).map((x) => <li key={x}>{ELIGIBILITY_NOTE_LABEL[x] ?? x}</li>)}
        </ul>
      )}
      {r.open_approval && (
        <p className="text-[11px] text-slate-700">
          Recorded: {REFUND_REASON_LABEL[r.open_approval.reason as RefundReason] ?? r.open_approval.reason} — waiting for the dashboard refund.
        </p>
      )}
    </div>
  );
}

export function RefundCheckPanel({ check }: { check: RefundCheck }) {
  const [paymentId, setPaymentId] = useState(check.lookup?.row?.payment_id ?? "");
  const [reason, setReason] = useState<RefundReason>("POLICY_7_DAY");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      try {
        const r = await recordRefundApprovalAction({ paymentId, reason, note });
        setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: "error" in r ? r.error : "Not allowed." });
      } catch {
        setMsg({ ok: false, text: "The approval could not be saved. Please try again." });
      }
    });

  return (
    <Card className="p-6 border-slate-200 bg-white space-y-4" data-refund-check="">
      <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary-700" /> Refund check
      </h2>
      <p className="text-xs text-slate-600">
        Before refunding in the Razorpay dashboard: check the payment here, record the reason, then refund it in the
        dashboard. The 7-day refund needs the first Pro purchase, at most 7 days since the payment, at most 1 Pro mock
        submitted, the latest period, and the 7-day refund not used before.
      </p>

      <form method="get" className="flex flex-wrap gap-2 items-center">
        <label htmlFor="refund-lookup" className="text-xs font-bold text-slate-700">Payment id or receipt number</label>
        <input id="refund-lookup" name="lookup" defaultValue={check.lookup?.query ?? ""} placeholder="pay_… or CL-R-…" className="border border-slate-300 rounded-md px-2 py-1 text-xs font-mono min-w-[220px]" />
        <button type="submit" className="px-3 py-1 rounded-md bg-primary-700 text-white text-xs font-bold">Check</button>
      </form>
      {check.lookup && (check.lookup.row ? <Row r={check.lookup.row} /> : <p className="text-xs text-danger-800">{check.lookup.error}</p>)}

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <h3 className="text-xs font-extrabold text-slate-900">Record refund reason</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <input aria-label="Payment id" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="pay_…" className="border border-slate-300 rounded-md px-2 py-1 text-xs font-mono min-w-[200px]" />
          <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value as RefundReason)} className="border border-slate-300 rounded-md px-2 py-1 text-xs">
            {REFUND_REASONS.map((r) => <option key={r} value={r}>{REFUND_REASON_LABEL[r]}</option>)}
          </select>
          <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (ticket number, why)" className="border border-slate-300 rounded-md px-2 py-1 text-xs flex-1 min-w-[200px]" />
          <button type="button" disabled={pending} onClick={submit} className="px-3 py-1 rounded-md bg-primary-700 text-white text-xs font-bold disabled:opacity-50">
            {pending ? "Saving…" : "Record reason"}
          </button>
        </div>
        {msg && <p className={`text-xs ${msg.ok ? "text-success-800" : "text-danger-800"}`}>{msg.text}</p>}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <h3 className="text-xs font-extrabold text-slate-900">Paid in the last 7 days ({check.recent.length})</h3>
        {check.error ? (
          <p className="text-xs text-danger-800">This list could not be loaded. Reload the page.</p>
        ) : check.recent.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-2">No Pro payments in the last 7 days.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">{check.recent.map((r) => <Row key={r.order_id} r={r} />)}</div>
        )}
      </div>

      {check.unrecorded.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3" data-refunds-unrecorded="">
          <h3 className="text-xs font-extrabold text-slate-900">Refunds with no recorded reason ({check.unrecorded.length})</h3>
          <p className="text-[11px] text-slate-600">These were refunded in the dashboard without a reason recorded here first. They do not count as the 7-day refund.</p>
          {check.unrecorded.map((u) => (
            <p key={`${u.orderId}-${u.refundId}`} className="text-[10px] text-slate-700 font-mono">
              {when(u.createdAt)} · order {u.orderId} · {u.refundId ?? "—"} · {rupees(u.refundPaise)}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
