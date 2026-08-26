import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminDescriptiveManager } from "@/components/admin/admin-descriptive-manager";

export const revalidate = 0;

export default async function AdminDescriptivePage() {
  const items = await AdminService.getAdminDescriptive();

  return <AdminDescriptiveManager items={items} />;
}
