import React from "react";
import { TaxonomyService } from "@/services/taxonomy/taxonomy.service";
import { TaxonomyManager } from "./taxonomy-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminTaxonomyPage() {
  await requireAdminPage({ path: "/admin/taxonomy" }); // SEC-1C: admin only
  const [tree, aliases] = await Promise.all([TaxonomyService.listTree(), TaxonomyService.listAliases()]);

  return (
    <TaxonomyManager
      tree={tree.success ? tree.data : []}
      aliases={aliases.success ? aliases.data : []}
      loadError={!tree.success ? tree.error : !aliases.success ? aliases.error : null}
    />
  );
}
