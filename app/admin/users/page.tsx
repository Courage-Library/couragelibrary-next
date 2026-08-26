import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminUsersManager } from "@/components/admin/admin-users-manager";

export const revalidate = 0;

export default async function AdminUsersPage() {
  const data = await AdminService.getAdminUsers();

  return (
    <AdminUsersManager
      users={data.users}
      totalAuthUsers={data.totalAuthUsers}
      totalProfiles={data.totalProfiles}
      missingProfilesCount={data.missingProfilesCount}
    />
  );
}
