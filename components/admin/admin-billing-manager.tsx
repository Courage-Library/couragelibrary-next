"use client";

import React from "react";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { CreditCard, Receipt } from "lucide-react";

/**
 * PAY-1 B1 (PAY-LEGACY-RETIRE-1): read-only. The legacy "Create Plan Tier" form, its server action and the
 * subscription_plans bulk import are retired: Pro plans and prices live in pro_plan_versions (F9, migration 113) and are
 * not edited here. This page only lists payment orders.
 */

interface OrderItem {
  id: string;
  orderType: string;
  amount: number;
  gateway: string;
  status: string;
  createdAt: string;
}

interface Props {
  orders: OrderItem[];
}

export function AdminBillingManager({ orders }: Props) {
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
