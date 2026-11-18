import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminBillingManager } from "@/components/admin/admin-billing-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getRefundCheck } from "@/services/admin-refunds.service";
import { RefundCheckPanel } from "@/components/admin/refund-check";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ lookup?: string | string[] }> }) {
  await requireAdminPage({ path: "/admin/payments" }); // SEC-1D: admin only
  const sp = await searchParams;
  const lookup = typeof sp.lookup === "string" ? sp.lookup.slice(0, 60) : null;
  // PAY-1 B6: the refund check (eligibility from fn_pro_refund_eligibility) above the existing lists
  const [billing, refundCheck] = await Promise.all([AdminService.getAdminBilling(), getRefundCheck(lookup)]);

  return (
    <div className="space-y-6 max-w-6xl">
      <RefundCheckPanel check={refundCheck} />
      <AdminBillingManager orders={billing.orders} toRefund={billing.toRefund} toRefundError={billing.toRefundError} emailIssues={billing.emailIssues} emailIssuesError={billing.emailIssuesError} />
    </div>
  );
}
