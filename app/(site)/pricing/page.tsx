import React from "react";
import { BillingService } from "@/services/billing.service";
import { PricingClient, type ProPricingProps } from "./pricing-client";
import { CHECKOUT_CLOSED_MESSAGE, checkoutState, isPaymentsEnabled, isProEnabled, REFUND_POLICY_PATH } from "@/config/payments";
import { getServerSession } from "@/lib/auth/session";
import { getProPricing } from "@/lib/payments/pro-server";
import type { Metadata } from "next";
import { PRICING_META } from "@/content/public-pages";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 0;

// UX-2b: own metadata + canonical (it had none and fell back to the site default)
export const metadata: Metadata = constructMetadata({ title: PRICING_META.title, description: PRICING_META.description, canonicalUrl: "/pricing" });

export default async function PricingPage() {
  const paymentsEnabled = isPaymentsEnabled();
  const subStatus = await BillingService.getUserSubscriptionStatus();

  // F9-B: the Pro plans view exists only with BOTH server flags on; prices come from pro_plan_versions (server read)
  let pro: ProPricingProps | null = null;
  if (paymentsEnabled && isProEnabled()) {
    const session = await getServerSession();
    const userId = session.state === "user" ? session.user.id : null;
    const { plans, account } = await getProPricing(userId);
    const state = checkoutState();
    pro = {
      plans,
      account,
      checkout: state.open ? { open: true, keyId: state.keyId } : { open: false, message: CHECKOUT_CLOSED_MESSAGE[state.reason] },
      legal: { terms: "/terms", refund: REFUND_POLICY_PATH, privacy: "/privacy" },
    };
  }

  return <PricingClient subStatus={subStatus} paymentsEnabled={paymentsEnabled} pro={pro} />;
}
