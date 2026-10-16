/**
 * COURAGE LIBRARY — EXAM SYLLABUS TREE IMPORTER SERVICE
 * Phase 3R.2: Structured Exam Syllabus Normalization & Tree Import Foundation
 * 
 * Ingests structured hierarchical syllabus trees, enforces version idempotency,
 * preserves raw examination terminology and sequence, and provisions recursive
 * exam_syllabus_nodes across arbitrary tree depth.
 * 
 * INVARIANTS:
 * 1. UNTRUSTED PROVENANCE: Imported syllabus is evidence of an exam order, NOT canonical authority.
 * 2. NOMENCLATURE FIDELITY: Never replaces raw imported wording with canonical names.
 * 3. VERSION IDEMPOTENCY: Deterministic SHA-256 payload hashing prevents redundant node provisioning.
 * 4. PUBLISHED IMMUTABILITY: Published versions cannot be overwritten in place.
 * 5. UNBOUNDED DEPTH: Naturally supports arbitrary hierarchy depth ($N \ge 1$).
 * 6. NO CANONICAL MUTATION: New subjects are imported as valid syllabus roots without creating canonical nodes.
 */

import crypto from 'crypto';
import { createAdminServerSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ExamSyllabusVersion,
  ExamSyllabusNode,
  SyllabusVersionStatus,
  SyllabusWeightageTier,
  CognitiveDepth,
} from '@/types/dynamic-syllabus-reconciliation';
import type { AppSupabaseClient } from '@/lib/supabase/types';
import { toSyllabusNode } from '@/lib/syllabus/reconciliation-rows';

export interface RawSyllabusNodeInput {
  title: string;
  slug?: string;
  weightageTier?: SyllabusWeightageTier;
  expectedQuestionsMin?: number;
  expectedQuestionsMax?: number;
  requiredCognitiveDepth?: CognitiveDepth;
  isMandatory?: boolean;
  children?: RawSyllabusNodeInput[];
}

export interface SyllabusTreeImportParams {
  examId: string;
  examCycleId?: string | null;
  versionTag: string;
  sourceDocumentId?: string | null;
  rawTree: RawSyllabusNodeInput[];
  status?: SyllabusVersionStatus;
  metadata?: Record<string, any>;
  adminUserId?: string;
  supabaseClient?: AppSupabaseClient;
}

export interface SyllabusTreeImportResult {
  versionId: string;
  versionTag: string;
  rawPayloadHash: string;
  totalImportedNodes: number;
  rootNodesCount: number;
  maxTreeDepth: number;
  isDuplicatePayload: boolean;
  status: SyllabusVersionStatus;
}

export class ExamSyllabusTreeImporterService {
  /**
   * Generates a deterministic URL/database-safe slug from raw text.
   */
  static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'node';
  }

  /**
   * Generates a canonical SHA-256 hash of the normalized syllabus tree.
   */
  static generatePayloadHash(rawTree: RawSyllabusNodeInput[]): string {
    const normalizeNode = (node: RawSyllabusNodeInput): any => ({
      title: node.title.trim(),
      slug: (node.slug || this.slugify(node.title)).trim(),
      weightageTier: node.weightageTier || null,
      expectedQuestionsMin: node.expectedQuestionsMin ?? 0,
      expectedQuestionsMax: node.expectedQuestionsMax ?? 0,
      requiredCognitiveDepth: node.requiredCognitiveDepth || null,
      isMandatory: node.isMandatory !== false,
      children: (node.children || []).map(normalizeNode),
    });

    const normalizedTree = rawTree.map(normalizeNode);
    const serialized = JSON.stringify(normalizedTree);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Imports a complete structured syllabus tree for an exam.
   *
   * GAP2-4b: RETIRED (fail-closed). It wrote exam_syllabus_versions / nodes directly — around the role-checked,
   * audited fn_syllabus_* RPCs — and its inserts no longer match the canonical schema (version_number, node_depth,
   * node_kind). Syllabi are authored in /admin/syllabus. The whole service is removed with the workbench in GAP2-4c.
   */
  static async importSyllabusTree(_params: SyllabusTreeImportParams): Promise<SyllabusTreeImportResult> {
    throw new Error('Syllabus tree import is retired. Author the syllabus in /admin/syllabus (GAP2-4b).');
  }

  /**
   * Retrieves full syllabus tree for an exam syllabus version.
   */
  static async getSyllabusTree(versionId: string, supabaseClient?: AppSupabaseClient): Promise<ExamSyllabusNode[]> {
    const supabase = supabaseClient || (await createServerSupabaseClient());

    const { data: nodes, error } = await supabase
      .from('exam_syllabus_nodes')
      .select('*')
      .eq('syllabus_version_id', versionId)
      .order('node_depth', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch syllabus tree for version ${versionId}: ${error.message}`);
    }

    // Assemble nested tree
    const nodeMap = new Map<string, ExamSyllabusNode>();
    const rootNodes: ExamSyllabusNode[] = [];

    const typed = (nodes || []).map(toSyllabusNode);
    typed.forEach((n: ExamSyllabusNode) => {
      nodeMap.set(n.id, { ...n, children: [] });
    });

    typed.forEach((n: ExamSyllabusNode) => {
      const current = nodeMap.get(n.id)!;
      if (!n.parent_node_id) {
        rootNodes.push(current);
      } else {
        const parent = nodeMap.get(n.parent_node_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(current);
        } else {
          rootNodes.push(current);
        }
      }
    });

    return rootNodes;
  }
}
