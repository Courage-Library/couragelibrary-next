import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminCategoriesManager } from "@/components/admin/admin-categories-manager";

export const revalidate = 0;

export default async function AdminCategoriesPage() {
  const categories = await AdminService.getAdminCategories();

  return <AdminCategoriesManager categories={categories} />;
}
