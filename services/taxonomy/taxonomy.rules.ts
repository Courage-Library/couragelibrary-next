/**
 * COURAGE LIBRARY — TAXONOMY RULES (shared, dependency-free)
 * Phase GAP2-1b. Safe to import from client components; contains no data access.
 * Mirrors the database rules in fn_enforce_canonical_taxonomy_rules (migration 070).
 */

export const TAXONOMY_NODE_TYPES = ['SUBJECT', 'DOMAIN', 'TOPIC', 'SUBTOPIC', 'CONCEPT', 'METHOD'] as const;
export type TaxonomyNodeType = (typeof TAXONOMY_NODE_TYPES)[number];

/** Allowed parent types per node type ('ROOT' = no parent). */
export const TAXONOMY_PARENT_RULES: Record<TaxonomyNodeType, readonly (TaxonomyNodeType | 'ROOT')[]> = {
  SUBJECT: ['ROOT'],
  DOMAIN: ['SUBJECT'],
  TOPIC: ['SUBJECT', 'DOMAIN'],
  SUBTOPIC: ['TOPIC'],
  CONCEPT: ['SUBJECT', 'DOMAIN', 'TOPIC', 'SUBTOPIC', 'CONCEPT', 'METHOD'],
  METHOD: ['SUBJECT', 'DOMAIN', 'TOPIC', 'SUBTOPIC', 'CONCEPT', 'METHOD'],
};

/** Node types that carry a subjects/topics/subtopics projection row with the same id. */
export const PROJECTED_NODE_TYPES: readonly TaxonomyNodeType[] = ['SUBJECT', 'TOPIC', 'SUBTOPIC'];

export interface TaxonomyNode {
  id: string;
  parentId: string | null;
  rootSubjectId: string | null;
  name: string;
  slug: string;
  nodeType: TaxonomyNodeType;
  depth: number;
  path: string;
  displayOrder: number;
  isActive: boolean;
}

export interface TaxonomyTreeNode extends TaxonomyNode {
  children: TaxonomyTreeNode[];
}

export type TaxonomyResult<T> = { success: true; data: T } | { success: false; code: string; error: string };

const MAX_NAME = 120;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyTaxonomyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function validateNodeName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'Name is required.';
  if (name.trim().length > MAX_NAME) return `Name must be at most ${MAX_NAME} characters.`;
  return null;
}

export function validateNodeSlug(slug: unknown): string | null {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return 'Slug must be lowercase letters, digits and single hyphens.';
  return null;
}

export function isAllowedParent(nodeType: TaxonomyNodeType, parentType: TaxonomyNodeType | null): boolean {
  return TAXONOMY_PARENT_RULES[nodeType].includes(parentType ?? 'ROOT');
}

/** Child types an admin may create under a node of the given type (null = root). */
export function allowedChildTypes(parentType: TaxonomyNodeType | null): TaxonomyNodeType[] {
  return TAXONOMY_NODE_TYPES.filter((t) => isAllowedParent(t, parentType));
}
