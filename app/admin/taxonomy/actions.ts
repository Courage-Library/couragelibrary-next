"use server";


import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import {
  TaxonomyService,
  TaxonomyNodeType,
  TaxonomyResult,
  TaxonomyNode,
  TAXONOMY_NODE_TYPES,
  SUBJECT_TYPES,
  SubjectType,
  ALIAS_LANGUAGES,
  AliasLanguage,
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
  nameHi?: string | null;
  subjectType?: string | null;
}): Promise<TaxonomyResult<TaxonomyNode>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  if (!TAXONOMY_NODE_TYPES.includes(input.nodeType as TaxonomyNodeType)) {
    return { success: false, code: "VALIDATION", error: "Unknown node type." };
  }
  if (input.subjectType && !SUBJECT_TYPES.includes(input.subjectType as SubjectType)) {
    return { success: false, code: "VALIDATION", error: "Unknown subject type." };
  }
  return sanitizeActionResult("createTaxonomyNodeAction", await (done(
    await TaxonomyService.createNode({
      parentId: input.parentId || null,
      nodeType: input.nodeType as TaxonomyNodeType,
      name: input.name,
      slug: input.slug,
      description: input.description,
      nameHi: input.nameHi ?? null,
      subjectType: (input.subjectType as SubjectType) || null,
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

/* CA-1: master tree — Hindi name / subject type / state code, aliases, same-level move, owner merge. */

export async function updateTaxonomyDetailsAction(id: string, details: { nameHi: string | null; subjectType: string | null; stateCode: string | null }): Promise<TaxonomyResult<TaxonomyNode>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  if (details.subjectType !== null && !SUBJECT_TYPES.includes(details.subjectType as SubjectType)) {
    return { success: false, code: "VALIDATION", error: "Unknown subject type." };
  }
  return sanitizeActionResult(
    "updateTaxonomyDetailsAction",
    done(await TaxonomyService.updateDetails(id, { nameHi: details.nameHi, subjectType: (details.subjectType as SubjectType) || null, stateCode: details.stateCode }))
  );
}

export async function addTaxonomyAliasAction(nodeId: string, alias: string, language: string): Promise<TaxonomyResult<{ id: string }>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  if (!ALIAS_LANGUAGES.includes(language as AliasLanguage)) return { success: false, code: "VALIDATION", error: "Alias language must be English or Hindi." };
  return sanitizeActionResult("addTaxonomyAliasAction", done(await TaxonomyService.addAlias(nodeId, alias, language as AliasLanguage)));
}

export async function removeTaxonomyAliasAction(aliasId: string): Promise<TaxonomyResult<{ id: string }>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("removeTaxonomyAliasAction", done(await TaxonomyService.removeAlias(aliasId)));
}

export async function moveTaxonomyNodeAction(nodeId: string, newParentId: string, reason?: string): Promise<TaxonomyResult<{ path: string }>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("moveTaxonomyNodeAction", done(await TaxonomyService.moveNode(nodeId, newParentId, reason)));
}

export async function mergeTaxonomyNodesAction(
  sourceId: string,
  targetId: string,
  reason: string,
  confirmation: string
): Promise<TaxonomyResult<{ repointed: Record<string, number>; childrenMoved: number }>> {
  const __auth = await guardAdminAction() /* SEC-1B Q1: admin only (owner) */;
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("mergeTaxonomyNodesAction", done(await TaxonomyService.mergeNodes(sourceId, targetId, reason, confirmation)));
}
