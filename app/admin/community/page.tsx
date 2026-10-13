import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminCommunityManager } from "@/components/admin/admin-community-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminCommunityPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/community" });
  const flags = await AdminService.getAdminCommunityFlags();

  return <AdminCommunityManager flags={flags} />;
}
