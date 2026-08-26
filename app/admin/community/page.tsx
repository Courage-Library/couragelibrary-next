import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminCommunityManager } from "@/components/admin/admin-community-manager";

export const revalidate = 0;

export default async function AdminCommunityPage() {
  const flags = await AdminService.getAdminCommunityFlags();

  return <AdminCommunityManager flags={flags} />;
}
