/**
 * COURAGE LIBRARY — TAXONOMY RULES (shared, dependency-free)
 * Phase GAP2-1b; CA-1 master tree (migration 115). Safe to import from client components; contains no data access.
 * Mirrors the database rules in fn_enforce_canonical_taxonomy_rules (070) + fn_guard_master_tree (115).
 */

export const TAXONOMY_NODE_TYPES = ['SUBJECT', 'DOMAIN', 'TOPIC', 'SUBTOPIC', 'CONCEPT', 'METHOD'] as const;
export type TaxonomyNodeType = (typeof TAXONOMY_NODE_TYPES)[number];

/** CA-1: the four master levels (L1–L4). DOMAIN / METHOD stay valid types for legacy rows but are never created. */
export const MASTER_LEVELS = ['SUBJECT', 'TOPIC', 'SUBTOPIC', 'CONCEPT'] as const satisfies readonly TaxonomyNodeType[];
export const MAX_MASTER_DEPTH = 4;

/** Allowed parent types per node type ('ROOT' = no parent) for a NEW or MOVED node (CA-1: one chain, 4 levels). */
export const TAXONOMY_PARENT_RULES: Record<TaxonomyNodeType, readonly (TaxonomyNodeType | 'ROOT')[]> = {
  SUBJECT: ['ROOT'],
  DOMAIN: [],
  TOPIC: ['SUBJECT'],
  SUBTOPIC: ['TOPIC'],
  CONCEPT: ['SUBTOPIC'],
  METHOD: [],
};

/** Subject types (SUBJECT nodes only). */
export const SUBJECT_TYPES = ['APTITUDE', 'LANGUAGE', 'GK_GA', 'TECHNICAL', 'PEDAGOGY', 'STATE_SPECIFIC'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];
export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  APTITUDE: 'Aptitude',
  LANGUAGE: 'Language',
  GK_GA: 'GK / GA',
  TECHNICAL: 'Technical',
  PEDAGOGY: 'Pedagogy',
  STATE_SPECIFIC: 'State specific',
};

/** Minimum length of the owner's reason for a merge (mirrors fn_taxonomy_merge_nodes). */
export const MERGE_REASON_MIN = 5;
/** The word the owner types to confirm a merge. */
export const MERGE_CONFIRM_WORD = 'MERGE';

export const ALIAS_LANGUAGES = ['en', 'hi'] as const;
export type AliasLanguage = (typeof ALIAS_LANGUAGES)[number];

export interface TaxonomyAlias {
  id: string;
  nodeId: string;
  alias: string;
  normalized: string;
  language: AliasLanguage;
  source: 'OWNER' | 'INTAKE' | 'IMPORT';
}

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
  nameHi: string | null;
  subjectType: SubjectType | null;
  stateCode: string | null;
  /** set when the node was merged into another (metadata.merged_into) */
  mergedInto: string | null;
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

export function validateNameHi(nameHi: unknown): string | null {
  if (nameHi === null || nameHi === undefined || nameHi === '') return null;
  if (typeof nameHi !== 'string' || !nameHi.trim()) return 'The Hindi name cannot be blank.';
  if (nameHi.trim().length > 160) return 'The Hindi name must be at most 160 characters.';
  return null;
}

export function validateAlias(alias: unknown): string | null {
  if (typeof alias !== 'string' || !alias.trim()) return 'Alias is required.';
  if (alias.trim().length > 160) return 'An alias must be at most 160 characters.';
  return null;
}

/** Two-letter state code (e.g. UP, MH); empty = none. */
export function validateStateCode(code: unknown): string | null {
  if (code === null || code === undefined || code === '') return null;
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return 'State code must be two capital letters (e.g. UP).';
  return null;
}

/** Same-level move: the new parent has the type of the current parent. */
export function isSameLevelMove(currentParentType: TaxonomyNodeType | null, newParentType: TaxonomyNodeType | null): boolean {
  return currentParentType !== null && currentParentType === newParentType;
}

export function isAllowedParent(nodeType: TaxonomyNodeType, parentType: TaxonomyNodeType | null): boolean {
  return TAXONOMY_PARENT_RULES[nodeType].includes(parentType ?? 'ROOT');
}

/** Child types an admin may create under a node of the given type (null = root). */
export function allowedChildTypes(parentType: TaxonomyNodeType | null): TaxonomyNodeType[] {
  return TAXONOMY_NODE_TYPES.filter((t) => isAllowedParent(t, parentType));
}
