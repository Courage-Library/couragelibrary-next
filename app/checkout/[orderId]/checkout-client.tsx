"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, CheckCircle2, CreditCard, ShieldAlert } from "lucide-react";

interface CheckoutClientProps {
  order: {
    id: string;
    orderType: string;
    baseAmount: number;
    discountAmount: number;
    taxableAmount: number;
    taxAmount: number;
    totalPayableAmount: number;
    currency: string;
    gateway: string;
    status: string;
    planName: string;
    durationDays: number;
  };
}

export function CheckoutClient({ order }: CheckoutClientProps) {
  const router = useRouter();
  const [billingName, setBillingName] = useState("Student");
  const [billingState, setBillingState] = useState("DELHI");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePayNow = async () => {
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mockSignature = `sig_${Date.now()}`;

      const res = await fetch("/api/billing/fulfill-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          gatewayPaymentId: mockPaymentId,
          gatewaySignature: mockSignature,
          paymentMethod: "UPI",
          amount: order.totalPayableAmount,
          billingName,
          billingState,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/checkout/success?invoiceId=${data.invoice_id || ""}`);
      } else {
        setErrorMsg(data.error || "Payment verification failed.");
      }
    } catch {
      setErrorMsg("Network error verifying payment.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Pricing Plans
        </Link>

        <Card className="p-6 sm:p-8 space-y-6 border-slate-200 shadow-sm bg-white">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="space-y-1">
              <Badge variant="indigo" className="text-[10px]">
                SECURE CHECKOUT
              </Badge>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-amber-500" /> Order Checkout & Billing
              </h1>
            </div>

            <Badge variant={order.status === "PAID" ? "success" : "warning"} className="text-xs">
              {order.status}
            </Badge>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Item Summary */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex justify-between font-bold text-sm text-slate-900">
              <span>{order.planName}</span>
              <span className="font-mono">₹{order.baseAmount}</span>
            </div>
            <p className="text-xs text-slate-500">Duration: {order.durationDays} Days Unlimited Access</p>
          </div>

          {/* Financial Breakdown Table */}
          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs font-mono">
            <div className="flex justify-between text-slate-600">
              <span>Base Price</span>
              <span>₹{order.baseAmount.toFixed(2)}</span>
            </div>

            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Coupon Discount</span>
                <span>- ₹{order.discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Taxable Amount</span>
              <span>₹{order.taxableAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>GST Tax (18%)</span>
              <span>₹{order.taxAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>Total Payable Amount</span>
              <span className="text-amber-600">₹{order.totalPayableAmount.toFixed(2)} {order.currency}</span>
            </div>
          </div>

          {/* Billing Info Form */}
          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-xs text-slate-700">Billing Information (GST Invoice)</h3>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Billing Name</label>
                <input
                  type="text"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-medium outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">State / Place of Supply</label>
                <input
                  type="text"
                  value={billingState}
                  onChange={(e) => setBillingState(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-medium outline-none"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              128-Bit Encryption • Razorpay Secure Gateway
            </div>

            <Button
              variant="default"
              size="lg"
              onClick={handlePayNow}
              isLoading={isProcessing}
              disabled={order.status === "PAID"}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs px-8 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Pay ₹{order.totalPayableAmount.toFixed(2)} & Activate PRO
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
