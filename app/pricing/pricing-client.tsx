"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionPlanItem, UserSubscriptionStatus } from "@/services/billing.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Zap, ShieldAlert, Tag } from "lucide-react";

interface PricingClientProps {
  plans: SubscriptionPlanItem[];
  subStatus: UserSubscriptionStatus;
}

export function PricingClient({ plans, subStatus }: PricingClientProps) {
  const router = useRouter();
  const [couponCode, setCouponCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCheckout = async (planId: string) => {
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/billing/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType: "SUBSCRIPTION_PURCHASE",
          planId,
          couponCode: couponCode.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success && data.order_id) {
        router.push(`/checkout/${data.order_id}`);
      } else {
        setErrorMsg(data.error || "Failed to initiate payment order.");
      }
    } catch {
      setErrorMsg("Network error initiating checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-12 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-10 max-w-5xl">
        {/* Header */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="indigo" className="bg-amber-100 text-amber-900 border-amber-200">
            Phase 3I Authoritative Monetization
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Unlock Full Courage Library PRO
          </h1>
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            Get unlimited access to full-length mock tests, smart mistake remediation drills, active recall flashcards, and faculty evaluation.
          </p>
        </div>

        {subStatus.isPro && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold text-center flex items-center justify-center gap-2">
            <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
            <span>You currently have an ACTIVE PRO Subscription (Valid until {new Date(subStatus.validUntil!).toLocaleDateString()})</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 max-w-xl mx-auto">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Promo Coupon Box */}
        <div className="max-w-md mx-auto p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-500" /> Have a Discount Coupon?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="e.g. EARLYBIRD20"
              className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono uppercase outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* FREE Tier Card */}
          <Card className="p-6 flex flex-col justify-between border-slate-200 bg-white space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <Badge variant="outline" className="text-[10px]">FREE TIER</Badge>
                <h3 className="text-xl font-black text-slate-900">Student Basic</h3>
                <p className="text-xs text-slate-500">Essential exam preparation tools</p>
              </div>

              <div className="font-black text-3xl text-slate-900 font-mono">
                ₹0 <span className="text-xs font-normal text-slate-400">/ forever</span>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Free Practice Questions
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Open Articles & Courses
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Community Doubt Forum
                </div>
              </div>
            </div>

            <Button variant="outline" disabled className="w-full text-xs font-bold">
              Current Base Access
            </Button>
          </Card>

          {/* PRO Plans from Database */}
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className="p-6 flex flex-col justify-between border-2 border-amber-400 bg-white shadow-md relative space-y-6"
            >
              <Badge variant="indigo" className="absolute -top-3 right-6 bg-amber-500 text-white font-bold text-[10px]">
                MOST POPULAR
              </Badge>

              <div className="space-y-4">
                <div className="space-y-1">
                  <Badge variant="indigo" className="text-[10px] bg-amber-100 text-amber-900">PRO PASS</Badge>
                  <h3 className="text-xl font-black text-slate-900">{plan.name}</h3>
                  <p className="text-xs text-slate-500">{plan.durationDays} Days Full Unrestricted Pass</p>
                </div>

                <div className="font-black text-3xl text-slate-900 font-mono">
                  ₹{plan.basePriceInr}{" "}
                  <span className="text-xs font-normal text-slate-400">+ 18% GST</span>
                </div>

                <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-700 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" /> Unlimited Full Mock Tests
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" /> Smart Mistake Vault Remediation
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" /> Active Recall Flashcards & SRS
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" /> 1v1 Quiz Battle Arena Access
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" /> Descriptive Mains Writing & Evaluation
                  </div>
                </div>
              </div>

              <Button
                variant="default"
                onClick={() => handleCheckout(plan.id)}
                isLoading={isSubmitting}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-sm"
              >
                Upgrade to PRO Now →
              </Button>
            </Card>
          ))}
        </div>
      </Container>
    </div>
  );
}
