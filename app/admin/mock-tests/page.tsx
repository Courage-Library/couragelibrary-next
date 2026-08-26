import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminMockTestsManager } from "@/components/admin/admin-mock-tests-manager";

export const revalidate = 0;

export default async function AdminMockTestsPage() {
  const tests = await AdminService.getAdminMockTests();

  return <AdminMockTestsManager tests={tests} />;
}
