import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminBulkImportStudio } from "@/components/admin/admin-bulk-import-studio";

export const revalidate = 0;

export default async function AdminBulkImportPage() {
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
