import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminSectionsManager } from "@/components/admin/admin-sections-manager";
import { TaxonomyService } from "@/services/taxonomy/taxonomy.service";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ pattern?: string; category?: string }>;
}

export default async function AdminSectionsPage({ searchParams }: Props) {
  await requireAdminPage({ allowStaff: true, path: "/admin/sections" });
  const params = await searchParams;
  const patternFilter = params.pattern;
  const categoryFilter = params.category;

  const [sections, patterns, categories, subjectNodes] = await Promise.all([
    AdminService.getAdminSections(patternFilter, categoryFilter),
    AdminService.getAdminPatterns(),
    AdminService.getAdminCategories(),
    TaxonomyService.listNodesByType("SUBJECT", { activeOnly: true }),
  ]);
  const subjects = subjectNodes.success ? subjectNodes.data.map((s) => ({ id: s.id, name: s.name })) : [];

  return (
    <AdminSectionsManager
      sections={sections}
      patterns={patterns}
      categories={categories}
      subjects={subjects}
      currentPattern={patternFilter}
      currentCategory={categoryFilter}
    />
  );
}
