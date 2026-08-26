import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminContentManager } from "@/components/admin/admin-content-manager";

export const revalidate = 0;

export default async function AdminContentPage() {
  const content = await AdminService.getAdminContent();

  return <AdminContentManager articles={content.articles} courses={content.courses} />;
}
