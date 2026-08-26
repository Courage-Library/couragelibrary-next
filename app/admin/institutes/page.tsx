import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminInstitutesManager } from "@/components/admin/admin-institutes-manager";

export const revalidate = 0;

export default async function AdminInstitutesPage() {
  const institutes = await AdminService.getAdminInstitutes();

  return <AdminInstitutesManager institutes={institutes} />;
}
