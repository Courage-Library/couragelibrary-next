import React from "react";
import Link from "next/link";
import { BillingService } from "@/services/billing.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, FileText, Zap, ArrowRight } from "lucide-react";

export const revalidate = 0;

export default async function BillingPage() {
  const [subStatus, invoices, orders] = await Promise.all([
    BillingService.getUserSubscriptionStatus(),
    BillingService.getUserInvoices(),
    BillingService.getUserPaymentOrders(),
  ]);

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-4xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-3">
          <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
            Phase 3I Billing Portal
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-indigo-400" />
            Subscriptions & Billing Management
          </h1>
          <p className="text-indigo-100 text-sm max-w-xl">
            View active subscription entitlements, legal GST tax invoices, and past payment order transactions.
          </p>
        </div>

        {/* Current Active Plan Card */}
        <Card className="p-6 space-y-4 border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 font-mono">CURRENT PLAN</span>
              <h2 className="text-xl font-black text-slate-900">
                {subStatus.isPro ? "Courage Library PRO Access Pass" : "Free Student Tier"}
              </h2>
            </div>

            <Badge variant={subStatus.isPro ? "success" : "outline"} className="text-xs font-bold">
              {subStatus.status}
            </Badge>
          </div>

          {subStatus.isPro ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                Active Subscription Valid Until: {new Date(subStatus.validUntil!).toLocaleDateString()}
              </span>
              <Link href="/pricing">
                <Button size="sm" variant="outline" className="text-xs font-bold border-emerald-300">
                  Renew / Extend
                </Button>
              </Link>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
              <span>Upgrade to PRO to unlock full mock tests, mistake remediation, and flashcards.</span>
              <Link href="/pricing">
                <Button size="sm" variant="default" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs">
                  Upgrade to PRO <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </Card>

        {/* Invoices List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> Tax Invoices ({invoices.length})
          </h2>

          {invoices.length === 0 ? (
            <Card className="p-8 text-center text-slate-400">
              <p className="text-xs">No tax invoices generated yet.</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {invoices.map((inv) => (
                <Card key={inv.id} className="p-4 flex items-center justify-between text-xs border-slate-200">
                  <div className="space-y-0.5">
                    <span className="font-mono font-bold text-slate-900">{inv.invoiceNumber}</span>
                    <span className="text-slate-400 block font-mono text-[11px]">
                      {new Date(inv.invoiceDate).toLocaleDateString()} • {inv.billingName}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-slate-900 text-sm">₹{inv.totalAmount}</span>
                    <Badge variant="success" className="text-[10px]">{inv.status}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Payment Orders History */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-slate-600" /> Payment Order History ({orders.length})
          </h2>

          {orders.length === 0 ? (
            <Card className="p-8 text-center text-slate-400">
              <p className="text-xs">No payment orders placed yet.</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {orders.map((ord) => (
                <Card key={ord.id} className="p-4 flex items-center justify-between text-xs border-slate-200">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900">{ord.planName || ord.orderType}</span>
                    <span className="text-slate-400 block font-mono text-[11px]">
                      {new Date(ord.createdAt).toLocaleDateString()} • Gateway: {ord.gateway}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-900">₹{ord.totalPayableAmount}</span>
                    <Badge variant={ord.status === "PAID" ? "success" : "warning"} className="text-[10px]">
                      {ord.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
