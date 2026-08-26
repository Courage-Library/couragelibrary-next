import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminBillingManager } from "@/components/admin/admin-billing-manager";

export const revalidate = 0;

export default async function AdminBillingPage() {
  const billing = await AdminService.getAdminBilling();

  return <AdminBillingManager orders={billing.orders} plans={billing.plans} />;
}
