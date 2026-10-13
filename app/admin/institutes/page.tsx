import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminInstitutesManager } from "@/components/admin/admin-institutes-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminInstitutesPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/institutes" });
  const institutes = await AdminService.getAdminInstitutes();

  return <AdminInstitutesManager institutes={institutes} />;
}
