import React from "react";
import { BillingService } from "@/services/billing.service";
import { PricingClient } from "./pricing-client";
import { isPaymentsEnabled } from "@/config/payments";

export const revalidate = 0;

export default async function PricingPage() {
  const [plans, subStatus] = await Promise.all([
    BillingService.getSubscriptionPlans(),
    BillingService.getUserSubscriptionStatus(),
  ]);

  return <PricingClient plans={plans} subStatus={subStatus} paymentsEnabled={isPaymentsEnabled()} />;
}
