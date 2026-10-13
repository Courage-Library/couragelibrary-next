import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminUsersManager } from "@/components/admin/admin-users-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminUsersPage() {
  await requireAdminPage({ path: "/admin/users" }); // SEC-1C: admin only
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
