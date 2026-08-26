import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminPatternsManager } from "@/components/admin/admin-patterns-manager";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function AdminPatternsPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryFilter = params.category;

  const [patterns, categories] = await Promise.all([
    AdminService.getAdminPatterns(categoryFilter),
    AdminService.getAdminCategories(),
  ]);

  return (
    <AdminPatternsManager
      patterns={patterns}
      categories={categories}
      currentCategory={categoryFilter}
    />
  );
}
