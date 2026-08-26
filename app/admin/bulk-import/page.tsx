import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminBulkImportStudio } from "@/components/admin/admin-bulk-import-studio";

export const revalidate = 0;

export default async function AdminBulkImportPage() {
  const [categories, patterns, data] = await Promise.all([
    AdminService.getAdminCategories(),
    AdminService.getAdminPatterns(),
    AdminService.getAdminQuestionsWithHierarchy(),
  ]);

  return (
    <AdminBulkImportStudio
      categories={categories.map((c) => ({ id: c.id, title: c.title, slug: c.slug }))}
      patterns={patterns.map((p) => ({ id: p.id, name: p.name }))}
      subjects={data.taxonomy.subjects}
    />
  );
}
