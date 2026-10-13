import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminBillingManager } from "@/components/admin/admin-billing-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminBillingPage() {
  await requireAdminPage({ path: "/admin/billing" }); // SEC-1D: admin only
  const billing = await AdminService.getAdminBilling();

  return <AdminBillingManager orders={billing.orders} plans={billing.plans} />;
}
