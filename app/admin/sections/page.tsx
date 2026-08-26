import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminSectionsManager } from "@/components/admin/admin-sections-manager";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ pattern?: string; category?: string }>;
}

export default async function AdminSectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const patternFilter = params.pattern;
  const categoryFilter = params.category;

  const [sections, patterns, categories] = await Promise.all([
    AdminService.getAdminSections(patternFilter, categoryFilter),
    AdminService.getAdminPatterns(),
    AdminService.getAdminCategories(),
  ]);

  return (
    <AdminSectionsManager
      sections={sections}
      patterns={patterns}
      categories={categories}
      currentPattern={patternFilter}
      currentCategory={categoryFilter}
    />
  );
}
