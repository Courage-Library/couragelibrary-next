import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminMockTestsManager, MockTestItem } from "@/components/admin/admin-mock-tests-manager";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    category?: string;
    pattern?: string;
  }>;
}

export default async function AdminMockTestsPage({ searchParams }: Props) {
  const params = await searchParams;
  const categoryFilter = params.category;
  const patternFilter = params.pattern;

  const [tests, categories, patterns] = await Promise.all([
    AdminService.getAdminMockTests(patternFilter, categoryFilter),
    AdminService.getAdminCategories(),
    AdminService.getAdminPatterns(categoryFilter),
  ]);

  return (
    <AdminMockTestsManager
      tests={tests as unknown as MockTestItem[]}
      categories={categories}
      patterns={patterns}
      currentCategory={categoryFilter}
      currentPattern={patternFilter}
    />
  );
}
