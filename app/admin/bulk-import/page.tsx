import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminBulkImportStudio } from "@/components/admin/admin-bulk-import-studio";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminBulkImportPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/bulk-import" });
  const [categories, sections] = await Promise.all([
    AdminService.getAdminCategories(),
    AdminService.getAdminSections(),
  ]);

  return (
    <AdminBulkImportStudio
      categories={categories}
      sections={sections}
    />
  );
}
