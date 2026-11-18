"use client";

import React from "react";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { CreditCard, MailWarning, Receipt, Undo2 } from "lucide-react";

/**
 * PAY-1 B1 (PAY-LEGACY-RETIRE-1): read-only. The legacy "Create Plan Tier" form, its server action and the
 * subscription_plans bulk import are retired: Pro plans and prices live in pro_plan_versions (F9, migration 113) and are
 * not edited here. This page only lists payment orders.
 * PAY-1 B4 (owner R4): "Payments to refund" lists captured payments Pro was NOT granted for (a second payment on a paid
 * order, or a payment on an order that can no longer be fulfilled). Refunds are made in the Razorpay dashboard (D4); the
 * refund webhook then updates the records. Test-mode (QA) orders carry a TEST label and never count as revenue.
 * PAY-1 B5 (owner E3): "E-mails to check" lists receipt / reminder / refund e-mails whose outcome is unclear (UNKNOWN —
 * never re-sent automatically, so a customer is never mailed twice) or that failed 3 times. ids and codes only.
 */

interface OrderItem {
  id: string;
  orderType: string;
  amount: number;
  gateway: string;
  status: string;
  createdAt: string;
  mode: "test" | "live";
}

interface RefundItem {
  id: string;
  kind: "DOUBLE_CHARGE" | "NOT_FULFILLABLE";
  orderId: string | null;
  paymentId: string | null;
  amountPaise: number | null;
  mode: "test" | "live";
  refunded: boolean;
  createdAt: string;
}

interface EmailIssue {
  id: string;
  kind: string;
  key: string;
  status: string;
  attempts: number;
  errorCode: string | null;
  mode: "test" | "live";
  createdAt: string;
}

interface Props {
  orders: OrderItem[];
  toRefund: RefundItem[];
  toRefundError: boolean;
  emailIssues?: EmailIssue[];
  emailIssuesError?: boolean;
}

const EMAIL_LABEL: Record<string, string> = {
  PRO_RECEIPT: "Receipt",
  PRO_EXPIRY_D7: "Reminder: Pro ends in 7 days",
  PRO_EXPIRY_D1: "Reminder: Pro ends tomorrow",
  PRO_REFUND: "Refund confirmation",
};

const KIND_LABEL: Record<RefundItem["kind"], string> = {
  DOUBLE_CHARGE: "Second payment on a paid order",
  NOT_FULFILLABLE: "Payment on an order that cannot be fulfilled",
};

export function AdminBillingManager({ orders, toRefund, toRefundError, emailIssues = [], emailIssuesError = false }: Props) {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-indigo-600" /> Payment orders
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          Pro plans and prices come from the Pro plan table (one-time 3, 6 and 12 month plans); they are not edited on this
          page.
        </p>
      </div>

      <Card className="p-6 border-slate-200 bg-white space-y-4" data-payments-to-refund="">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Undo2 className="w-5 h-5 text-warning-800" /> Payments to refund ({toRefund.filter((r) => !r.refunded).length} open)
        </h2>
        <p className="text-xs text-slate-600">
          Money was taken but Pro was not granted for it. Refund each payment in the Razorpay dashboard; once the refund
          webhook arrives, the payment is marked refunded here.
        </p>
        {toRefundError ? (
          <p className="text-xs text-danger-800">This list could not be loaded. Reload the page.</p>
        ) : toRefund.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4">Nothing to refund.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {toRefund.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{KIND_LABEL[r.kind]}</span>
                  {r.mode === "test" && <Badge variant="warning" className="text-[10px] ml-2">TEST</Badge>}
                  <p className="text-[10px] text-slate-600 font-mono">
                    {new Date(r.createdAt).toLocaleString()} · payment {r.paymentId ?? "—"} · order {r.orderId ?? "—"}
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold text-slate-900">{r.amountPaise === null ? "—" : `₹${(r.amountPaise / 100).toFixed(2)}`}</span>
                  <Badge variant={r.refunded ? "success" : "warning"} className="text-[10px] ml-2">
                    {r.refunded ? "REFUNDED" : "TO REFUND"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 border-slate-200 bg-white space-y-4" data-email-issues="">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <MailWarning className="w-5 h-5 text-warning-800" /> E-mails to check ({emailIssues.length})
        </h2>
        <p className="text-xs text-slate-600">
          UNKNOWN: the mail service did not answer, so the e-mail may or may not have arrived. It is never sent again
          automatically (no one gets it twice); ask the student or resend by hand. FAILED: refused 3 times.
        </p>
        {emailIssuesError ? (
          <p className="text-xs text-danger-800">This list could not be loaded. Reload the page.</p>
        ) : emailIssues.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4">Nothing to check.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {emailIssues.map((e) => (
              <div key={e.id} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{EMAIL_LABEL[e.kind] ?? e.kind}</span>
                  {e.mode === "test" && <Badge variant="warning" className="text-[10px] ml-2">TEST</Badge>}
                  <p className="text-[10px] text-slate-600 font-mono">
                    {new Date(e.createdAt).toLocaleString()} · {e.key} · {e.errorCode ?? "—"} · attempts {e.attempts}
                  </p>
                </div>
                <Badge variant="warning" className="text-[10px]">{e.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 border-slate-200 bg-white space-y-4">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-700" /> Payment orders ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-6">No payment orders recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {orders.map((o) => (
              <div key={o.id} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{o.orderType}</span>
                  {o.mode === "test" && <Badge variant="warning" className="text-[10px] ml-2">TEST</Badge>}
                  <p className="text-[10px] text-slate-600 font-mono">{new Date(o.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold text-slate-900">₹{o.amount}</span>
                  <Badge variant={o.status === "PAID" || o.status === "COMPLETED" ? "success" : "warning"} className="text-[10px] ml-2">
                    {o.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
