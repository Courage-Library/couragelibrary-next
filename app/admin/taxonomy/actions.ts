"use server";


import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import {
  TaxonomyService,
  TaxonomyNodeType,
  TaxonomyResult,
  TaxonomyNode,
  TAXONOMY_NODE_TYPES,
} from "@/services/taxonomy/taxonomy.service";

/* GAP2-1b: every taxonomy mutation goes through TaxonomyService (admin check + audit). */

function done<T>(result: TaxonomyResult<T>): TaxonomyResult<T> {
  if (result.success) revalidatePath("/admin/taxonomy");
  return result;
}

export async function createTaxonomyNodeAction(input: {
  parentId: string | null;
  nodeType: string;
  name: string;
  slug?: string;
  description?: string;
}): Promise<TaxonomyResult<TaxonomyNode>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  if (!TAXONOMY_NODE_TYPES.includes(input.nodeType as TaxonomyNodeType)) {
    return { success: false, code: "VALIDATION", error: "Unknown node type." };
  }
  return sanitizeActionResult("createTaxonomyNodeAction", await (done(
    await TaxonomyService.createNode({
      parentId: input.parentId || null,
      nodeType: input.nodeType as TaxonomyNodeType,
      name: input.name,
      slug: input.slug,
      description: input.description,
    })
  )));
}

export async function renameTaxonomyNodeAction(id: string, name: string, slug?: string): Promise<TaxonomyResult<TaxonomyNode>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("renameTaxonomyNodeAction", await (done(await TaxonomyService.renameNode(id, name, slug))));
}

export async function setTaxonomyNodeActiveAction(id: string, isActive: boolean): Promise<TaxonomyResult<TaxonomyNode>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("setTaxonomyNodeActiveAction", await (done(await TaxonomyService.setActive(id, isActive))));
}

export async function reorderTaxonomyNodesAction(parentId: string | null, orderedIds: string[]): Promise<TaxonomyResult<{ updated: number }>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("reorderTaxonomyNodesAction", await (done(await TaxonomyService.reorder(parentId, orderedIds))));
}
