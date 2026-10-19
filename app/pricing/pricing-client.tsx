"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionPlanItem, UserSubscriptionStatus } from "@/services/billing.service";
import { Container } from "@/components/ui/legacy/container";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { Button } from "@/components/ui/legacy/button";
import { Check, Zap, ShieldAlert, Tag } from "lucide-react";
import { Container as DsContainer } from "@/components/ui/layout";
import { Badge as DsBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PricingCard, type PricingFeature } from "@/components/ui/domain/pricing-card";
import { formatDateShort } from "@/lib/format";

interface PricingClientProps {
  plans: SubscriptionPlanItem[];
  subStatus: UserSubscriptionStatus;
  paymentsEnabled: boolean;
}

const PAYMENTS_UNAVAILABLE_MESSAGE = "Payments are temporarily unavailable. Please check back later.";

export function PricingClient({ plans, subStatus, paymentsEnabled }: PricingClientProps) {
  const router = useRouter();
  const [couponCode, setCouponCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCheckout = async (planId: string) => {
    if (!paymentsEnabled) return;
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

  // UX-2b.H (H-7): while payments are off, nothing may look purchasable. The payments-ON markup below is unchanged.
  if (!paymentsEnabled) return <PaymentsOffView subStatus={subStatus} />;

  return (
    <div className="py-12 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-10 max-w-5xl">
        {/* Header */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="indigo" className="bg-amber-100 text-amber-900 border-amber-200">
            Plans and pricing
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

        {!paymentsEnabled && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2 max-w-xl mx-auto">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{PAYMENTS_UNAVAILABLE_MESSAGE}</span>
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
                    <Check className="w-4 h-4 text-amber-500 shrink-0" /> Flashcards with spaced revision
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
                disabled={!paymentsEnabled}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-sm"
              >
                {paymentsEnabled ? "Upgrade to PRO Now →" : "Payments Temporarily Unavailable"}
              </Button>
            </Card>
          ))}
        </div>
      </Container>
    </div>
  );
}

// Features a free account can use today. Each one is live and verified (UX-2b.H report §2); dormant features
// (courses, battles, live tests, descriptive evaluation) are not listed while their flags are off.
const FREE_FEATURES: PricingFeature[] = [
  { label: "Mock tests with full answer review", included: true },
  { label: "Mistake Vault: revise and drill every question you got wrong", included: true },
  { label: "Exam guides: pattern, syllabus and eligibility", included: true },
];

/** Payments off: DESIGN_SYSTEM Pricing card "Opening soon" variant; no price, no checkout, no coupon, no badge. */
function PaymentsOffView({ subStatus }: { subStatus: UserSubscriptionStatus }) {
  return (
    <DsContainer className="flex flex-col gap-8 py-8 lg:py-12">
      <header className="mx-auto flex max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-h1 font-bold text-fg">Plans and pricing</h1>
        <p className="text-body text-fg-secondary">
          Courage Library is free during early access. Pro is not open yet, and there is nothing to pay today.
        </p>
      </header>

      {subStatus.isPro && subStatus.validUntil && (
        <Alert tone="success" className="mx-auto w-full max-w-xl">
          You&apos;re on Pro until {formatDateShort(subStatus.validUntil)}.
        </Alert>
      )}

      <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <PricingCard
          name="Free"
          priceInr={0}
          period={null}
          features={FREE_FEATURES}
          ctaHref="/mock-tests"
          ctaLabel="Take a free mock test"
        />

        <section aria-labelledby="plan-pro" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="plan-pro" className="text-h3 font-semibold text-fg">
              Pro
            </h3>
            <DsBadge tone="neutral">Opening soon</DsBadge>
          </div>
          <p className="text-h3 font-semibold text-fg">Pricing announced soon</p>
          <p className="text-body-sm text-fg-secondary">
            Pro is not open yet. What it includes and what it costs will be announced here before it opens.
          </p>
          <span
            className="mt-auto inline-flex h-11 w-full items-center justify-center rounded-control border border-line-control bg-surface text-body font-medium text-fg-secondary"
            aria-disabled="true"
          >
            Opening soon
          </span>
        </section>
      </div>
    </DsContainer>
  );
}
