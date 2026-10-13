import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminCategoriesManager } from "@/components/admin/admin-categories-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminCategoriesPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/categories" });
  const categories = await AdminService.getAdminCategories();

  return <AdminCategoriesManager categories={categories} />;
}
