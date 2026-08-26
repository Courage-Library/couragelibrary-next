"use client";

import React, { useState, useActionState } from "react";
import { createSubscriptionPlanAction } from "@/app/admin/actions";
import { BulkImportModal } from "@/components/admin/bulk-import-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CreditCard, Plus, FileUp, Sparkles, Receipt } from "lucide-react";

interface OrderItem {
  id: string;
  orderType: string;
  amount: number;
  gateway: string;
  status: string;
  createdAt: string;
}

interface SubscriptionPlanItem {
  id: string;
  name: string;
  durationDays: number;
  priceInr: number;
  isActive: boolean;
}

interface Props {
  orders: OrderItem[];
  plans: SubscriptionPlanItem[];
}

export function AdminBillingManager({ orders, plans }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [state, formAction, isPending] = useActionState(createSubscriptionPlanAction, null);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-indigo-600" /> Subscription Plans & Payment Orders CMS
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage PRO membership plans, pricing tiers, billing periods, and audit platform orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="indigo" className="text-xs">
            {plans.length} Active Plans
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(true)}
            className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <FileUp className="w-4 h-4 mr-1.5" /> Bulk Import JSON
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-xs text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Create Plan Tier
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-5 border-indigo-200 bg-indigo-50/30 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" /> Create Subscription Plan Tier
          </h3>
          {state?.error && <Alert variant="error">{state.error}</Alert>}
          {state?.message && <Alert variant="success">{state.message}</Alert>}

          <form action={formAction} className="space-y-3">
            <Input label="Plan Name" name="name" placeholder="e.g. Courage PRO Monthly Pass" required />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Days)</label>
                <input
                  type="number"
                  name="durationDays"
                  defaultValue={30}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Base Price (INR)</label>
                <input
                  type="number"
                  name="basePriceInr"
                  defaultValue={499}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm" isLoading={isPending} className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
                Save & Activate Plan
              </Button>
            </div>
          </form>
        </Card>
      )}

      {showBulkImport && (
        <BulkImportModal defaultEntity="subscription_plans" onClose={() => setShowBulkImport(false)} />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-200 bg-white space-y-4">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" /> Subscription Plans Directory
          </h2>
          {plans.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No subscription plans found.</p>
          ) : (
            <div className="space-y-3">
              {plans.map((p) => (
                <div key={p.id} className="p-4 rounded-xl border border-slate-200 flex items-center justify-between bg-slate-50">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{p.name}</h3>
                    <span className="text-xs text-slate-500 font-mono">{p.durationDays} Days Duration</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-indigo-600">₹{p.priceInr}</span>
                    <div>
                      <Badge variant={p.isActive ? "success" : "warning"} className="text-[10px]">
                        {p.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 border-slate-200 bg-white space-y-4">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" /> Payment Orders History ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No payment orders recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {orders.map((o) => (
                <div key={o.id} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{o.orderType}</span>
                    <p className="text-[10px] text-slate-400 font-mono">{new Date(o.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-slate-900">₹{o.amount}</span>
                    <Badge variant={o.status === "COMPLETED" ? "success" : "warning"} className="text-[10px] ml-2">
                      {o.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
