import React from "react";
import { TaxonomyService } from "@/services/taxonomy/taxonomy.service";
import { TaxonomyManager } from "./taxonomy-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminTaxonomyPage() {
  await requireAdminPage({ path: "/admin/master-tree" }); // SEC-1C: admin only
  const [tree, aliases, lessons] = await Promise.all([TaxonomyService.listTree(), TaxonomyService.listAliases(), TaxonomyService.listNodeLessonStatus()]);

  return (
    <TaxonomyManager
      tree={tree.success ? tree.data : []}
      aliases={aliases.success ? aliases.data : []}
      lessonStatus={lessons.success ? lessons.data : {}}
      loadError={!tree.success ? tree.error : !aliases.success ? aliases.error : null}
    />
  );
}
