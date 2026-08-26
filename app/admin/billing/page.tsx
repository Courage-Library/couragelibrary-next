import React from "react";
import { AdminService } from "@/services/admin.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Zap } from "lucide-react";

export const revalidate = 0;

export default async function AdminBillingPage() {
  const { orders, plans } = await AdminService.getAdminBilling();

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-yellow-600" /> Billing & Payment Orders Overview
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          Administrative visibility into Phase 3I subscription plans, orders, and payment transactions.
        </p>
      </div>

      {/* Subscription Plans Catalog */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" /> Active Subscription Plans ({plans.length})
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className="p-4 space-y-2 border-slate-200 bg-white">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                <Badge variant={p.isActive ? "success" : "outline"} className="text-[10px]">
                  {p.isActive ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </div>
              <div className="font-mono text-xl font-black text-slate-900">
                ₹{p.priceInr} <span className="text-xs font-normal text-slate-400">({p.durationDays} Days)</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-600" /> Recent Payment Orders ({orders.length})
        </h2>
        <Card className="p-6 border-slate-200 bg-white">
          {orders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No payment orders found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-mono">
                    <th className="pb-3">ORDER ID</th>
                    <th className="pb-3">TYPE</th>
                    <th className="pb-3">AMOUNT</th>
                    <th className="pb-3">GATEWAY</th>
                    <th className="pb-3">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="py-3 font-mono font-semibold text-slate-900">{o.id.slice(0, 8)}...</td>
                      <td className="py-3 font-mono text-slate-600">{o.orderType}</td>
                      <td className="py-3 font-mono font-bold text-slate-900">₹{o.amount}</td>
                      <td className="py-3 font-mono text-slate-500">{o.gateway}</td>
                      <td className="py-3">
                        <Badge variant={o.status === "PAID" ? "success" : "warning"} className="text-[10px]">
                          {o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
