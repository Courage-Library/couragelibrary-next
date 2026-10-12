import React from "react";
import { TaxonomyService } from "@/services/taxonomy/taxonomy.service";
import { TaxonomyManager } from "./taxonomy-manager";

export const revalidate = 0;

export default async function AdminTaxonomyPage() {
  const tree = await TaxonomyService.listTree();

  return (
    <TaxonomyManager
      tree={tree.success ? tree.data : []}
      loadError={tree.success ? null : tree.error}
    />
  );
}
