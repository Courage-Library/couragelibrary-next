import React from "react";
import { TaxonomyService } from "@/services/taxonomy/taxonomy.service";
import { TaxonomyManager } from "./taxonomy-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminTaxonomyPage() {
  await requireAdminPage({ path: "/admin/taxonomy" }); // SEC-1C: admin only
  const tree = await TaxonomyService.listTree();

  return (
    <TaxonomyManager
      tree={tree.success ? tree.data : []}
      loadError={tree.success ? null : tree.error}
    />
  );
}
