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
  supabaseClient?: any;
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
   */
  static async importSyllabusTree(params: SyllabusTreeImportParams): Promise<SyllabusTreeImportResult> {
    const {
      examId,
      examCycleId = null,
      versionTag,
      sourceDocumentId = null,
      rawTree,
      status = 'DRAFT',
      metadata = {},
      supabaseClient,
    } = params;

    if (!examId) {
      throw new Error('Exam ID is required for syllabus tree import.');
    }
    if (!versionTag) {
      throw new Error('Version tag is required for syllabus tree import.');
    }
    if (!rawTree || !Array.isArray(rawTree) || rawTree.length === 0) {
      throw new Error('Syllabus raw tree must be a non-empty array of node inputs.');
    }

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());
    const payloadHash = this.generatePayloadHash(rawTree);

    // 1. Check for existing syllabus version
    const { data: existingVersion, error: vErr } = await supabase
      .from('exam_syllabus_versions')
      .select('*')
      .eq('exam_id', examId)
      .eq('version_tag', versionTag)
      .maybeSingle();

    if (vErr) {
      throw new Error(`Error checking existing syllabus version: ${vErr.message}`);
    }

    // 2. Idempotency Check
    if (existingVersion) {
      if (existingVersion.raw_payload_hash === payloadHash) {
        // Identical payload hash: return existing version without re-provisioning
        const { count: nodeCount } = await supabase
          .from('exam_syllabus_nodes')
          .select('*', { count: 'exact', head: true })
          .eq('syllabus_version_id', existingVersion.id);

        return {
          versionId: existingVersion.id,
          versionTag: existingVersion.version_tag,
          rawPayloadHash: existingVersion.raw_payload_hash,
          totalImportedNodes: nodeCount || 0,
          rootNodesCount: rawTree.length,
          maxTreeDepth: 1,
          isDuplicatePayload: true,
          status: existingVersion.status,
        };
      }

      // If existing version is published, prevent destructive overwrite
      if (existingVersion.status === 'PUBLISHED') {
        throw new Error(
          `Cannot overwrite published syllabus version "${versionTag}" for exam ${examId}. Published versions are immutable.`
        );
      }

      // If draft version with modified payload: clean existing draft nodes and re-provision
      await supabase
        .from('exam_syllabus_nodes')
        .delete()
        .eq('syllabus_version_id', existingVersion.id);

      await supabase
        .from('exam_syllabus_versions')
        .update({
          raw_payload_hash: payloadHash,
          exam_cycle_id: examCycleId,
          source_document_id: sourceDocumentId,
          metadata: { ...existingVersion.metadata, ...metadata, updated_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingVersion.id);

      const importStats = await this.provisionSyllabusTreeNodes(supabase, existingVersion.id, rawTree);

      return {
        versionId: existingVersion.id,
        versionTag: existingVersion.version_tag,
        rawPayloadHash: payloadHash,
        totalImportedNodes: importStats.totalNodes,
        rootNodesCount: rawTree.length,
        maxTreeDepth: importStats.maxDepth,
        isDuplicatePayload: false,
        status: existingVersion.status,
      };
    }

    // 3. Create new syllabus version
    const { data: newVersion, error: createErr } = await supabase
      .from('exam_syllabus_versions')
      .insert({
        exam_id: examId,
        exam_cycle_id: examCycleId,
        version_tag: versionTag,
        source_document_id: sourceDocumentId,
        raw_payload_hash: payloadHash,
        status,
        is_active: true,
        metadata: {
          ...metadata,
          imported_at: new Date().toISOString(),
        },
      })
      .select('*')
      .single();

    if (createErr) {
      throw new Error(`Failed to create exam syllabus version: ${createErr.message}`);
    }

    // 4. Recursively provision syllabus nodes
    const importStats = await this.provisionSyllabusTreeNodes(supabase, newVersion.id, rawTree);

    return {
      versionId: newVersion.id,
      versionTag: newVersion.version_tag,
      rawPayloadHash: payloadHash,
      totalImportedNodes: importStats.totalNodes,
      rootNodesCount: rawTree.length,
      maxTreeDepth: importStats.maxDepth,
      isDuplicatePayload: false,
      status: newVersion.status,
    };
  }

  /**
   * Recursively provisions syllabus tree nodes for a given syllabus version.
   */
  private static async provisionSyllabusTreeNodes(
    supabase: any,
    versionId: string,
    nodes: RawSyllabusNodeInput[],
    parentNodeId: string | null = null,
    currentDepth: number = 1
  ): Promise<{ totalNodes: number; maxDepth: number }> {
    let totalNodes = 0;
    let maxDepth = currentDepth;
    const siblingSlugs = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const nodeInput = nodes[i];
      const rawTitle = nodeInput.title.trim();
      let rawSlug = (nodeInput.slug || this.slugify(rawTitle)).trim();

      // Ensure sibling slug uniqueness
      if (siblingSlugs.has(rawSlug)) {
        rawSlug = `${rawSlug}-${i + 1}`;
      }
      siblingSlugs.add(rawSlug);

      const { data: insertedNode, error: nodeErr } = await supabase
        .from('exam_syllabus_nodes')
        .insert({
          syllabus_version_id: versionId,
          parent_node_id: parentNodeId,
          raw_title: rawTitle,
          raw_slug: rawSlug,
          display_order: i + 1,
          weightage_tier: nodeInput.weightageTier || null,
          expected_questions_min: nodeInput.expectedQuestionsMin ?? 0,
          expected_questions_max: nodeInput.expectedQuestionsMax ?? 0,
          required_cognitive_depth: nodeInput.requiredCognitiveDepth || null,
          is_mandatory: nodeInput.isMandatory !== false,
        })
        .select('id, node_depth')
        .single();

      if (nodeErr) {
        throw new Error(`Failed to insert syllabus node "${rawTitle}": ${nodeErr.message}`);
      }

      totalNodes++;
      if (insertedNode.node_depth > maxDepth) {
        maxDepth = insertedNode.node_depth;
      }

      // Recursively provision children
      if (nodeInput.children && Array.isArray(nodeInput.children) && nodeInput.children.length > 0) {
        const childStats = await this.provisionSyllabusTreeNodes(
          supabase,
          versionId,
          nodeInput.children,
          insertedNode.id,
          currentDepth + 1
        );
        totalNodes += childStats.totalNodes;
        if (childStats.maxDepth > maxDepth) {
          maxDepth = childStats.maxDepth;
        }
      }
    }

    return { totalNodes, maxDepth };
  }

  /**
   * Retrieves full syllabus tree for an exam syllabus version.
   */
  static async getSyllabusTree(versionId: string, supabaseClient?: any): Promise<ExamSyllabusNode[]> {
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

    (nodes || []).forEach((n: ExamSyllabusNode) => {
      nodeMap.set(n.id, { ...n, children: [] });
    });

    (nodes || []).forEach((n: ExamSyllabusNode) => {
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
