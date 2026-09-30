/**
 * COURAGE LIBRARY — EXAM SYLLABUS RECONCILIATION SERVICE
 * Phase 3R.3: Context-Aware Reconciliation Engine & Gap Manifest
 * 
 * Provides deterministic, context-aware comparison between imported exam
 * syllabus requirement trees (the "Order") and canonical academic taxonomy
 * (the "Inventory").
 * 
 * SACRED ARCHITECTURAL INVARIANTS:
 * 1. READ / ANALYZE / PROPOSE ONLY: Never inserts, updates, or deletes canonical taxonomy nodes.
 * 2. CONTEXT-AWARE MATCHING: Never merges nodes globally by name alone without parent context.
 * 3. NO EXTERNAL AI CALLS: Operates purely via local deterministic rules, aliases, and string metrics.
 * 4. PROPOSED MATCHES REQUIRE REVIEW: Semantic candidates remain PROPOSED_MATCH (never auto-approved).
 * 5. SAFE NEW-SUBJECT GAPS: Unmatched syllabus roots are classified as NEW_SUBJECT_GAP without canonical side-effects.
 * 6. IDEMPOTENT PERSISTENCE: Re-running reconciliation produces deterministic results with zero duplicates.
 * 7. HUMAN REVIEW PRESERVATION: Preserves MANUALLY_MAPPED and reviewed mapping states.
 */

import { createAdminServerSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { ReconciliationNormalizer } from '@/services/reconciliation-normalizer';
import {
  CanonicalTaxonomyNode,
  TaxonomyAlias,
  ExamSyllabusNode,
  ExamSyllabusCanonicalMapping,
  SyllabusMatchStatus,
  MatchMethod,
  CanonicalCandidateMatch,
  SyllabusReconciliationItem,
  SyllabusGapItem,
  SyllabusDeltaItem,
  SyllabusReconciliationManifest,
} from '@/types/dynamic-syllabus-reconciliation';

export interface ReconcileSyllabusParams {
  syllabusVersionId: string;
  examId: string;
  persistMappings?: boolean;
  compareWithPreviousVersionId?: string;
  adminUserId?: string;
  supabaseClient?: any;
}

export class ExamSyllabusReconciliationService {
  /**
   * Reconciles a syllabus version against canonical academic taxonomy.
   */
  static async reconcileSyllabusVersion(
    params: ReconcileSyllabusParams
  ): Promise<SyllabusReconciliationManifest> {
    const {
      syllabusVersionId,
      examId,
      persistMappings = false,
      compareWithPreviousVersionId,
      supabaseClient,
    } = params;

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    // Fetch all required data concurrently
    const [
      examRes,
      versionRes,
      rawSyllabusNodesRes,
      rawCanonicalNodesRes,
      rawAliasesRes,
    ] = await Promise.all([
      supabase.from('exams').select('id, title, slug').eq('id', examId).single(),
      supabase.from('exam_syllabus_versions').select('id, version_tag, raw_payload_hash, status').eq('id', syllabusVersionId).single(),
      supabase.from('exam_syllabus_nodes').select('*').eq('syllabus_version_id', syllabusVersionId).order('node_depth', { ascending: true }).order('display_order', { ascending: true }),
      supabase.from('canonical_taxonomy_nodes').select('*').eq('is_active', true).order('node_depth', { ascending: true }).order('display_order', { ascending: true }),
      supabase.from('taxonomy_aliases').select('*'),
    ]);

    if (examRes.error || !examRes.data) {
      throw new Error(`Failed to fetch exam ${examId}: ${examRes.error?.message || 'Not found'}`);
    }
    const examData = examRes.data;

    if (versionRes.error || !versionRes.data) {
      throw new Error(`Failed to fetch syllabus version ${syllabusVersionId}: ${versionRes.error?.message || 'Not found'}`);
    }
    const versionData = versionRes.data;

    if (rawSyllabusNodesRes.error) {
      throw new Error(`Failed to fetch syllabus nodes: ${rawSyllabusNodesRes.error.message}`);
    }
    const syllabusNodes: ExamSyllabusNode[] = rawSyllabusNodesRes.data || [];

    if (rawCanonicalNodesRes.error) {
      throw new Error(`Failed to fetch canonical taxonomy nodes: ${rawCanonicalNodesRes.error.message}`);
    }
    const canonicalNodes: CanonicalTaxonomyNode[] = rawCanonicalNodesRes.data || [];

    const aliases: TaxonomyAlias[] = rawAliasesRes.data || [];

    // Fetch existing mappings to preserve manual/reviewed overrides
    const { data: existingMappings, error: mErr } = await supabase
      .from('exam_syllabus_canonical_mappings')
      .select('*')
      .in('syllabus_node_id', syllabusNodes.map((n) => n.id));

    if (mErr) {
      console.warn(`[Reconciliation] Warning fetching existing mappings: ${mErr.message}`);
    }
    const mappingMap = new Map<string, ExamSyllabusCanonicalMapping>();
    (existingMappings || []).forEach((m: ExamSyllabusCanonicalMapping) => {
      mappingMap.set(m.syllabus_node_id, m);
    });

    // -------------------------------------------------------------------------
    // Build Canonical Lookup Indices for Fast Contextual Resolution
    // -------------------------------------------------------------------------
    const canonicalById = new Map<string, CanonicalTaxonomyNode>();
    const canonicalRootsBySlug = new Map<string, CanonicalTaxonomyNode>();
    const canonicalRootsByNorm = new Map<string, CanonicalTaxonomyNode>();
    const canonicalByParentAndSlug = new Map<string, CanonicalTaxonomyNode>(); // "parentId:slug"
    const canonicalByParentAndNorm = new Map<string, CanonicalTaxonomyNode>(); // "parentId:norm"
    const canonicalChildrenByParentId = new Map<string, CanonicalTaxonomyNode[]>();
    const canonicalSubtreeByAncestorId = new Map<string, CanonicalTaxonomyNode[]>();
    const aliasesByCanonicalId = new Map<string, TaxonomyAlias[]>();
    const aliasesByNorm = new Map<string, TaxonomyAlias[]>();

    canonicalNodes.forEach((node) => {
      canonicalById.set(node.id, node);
      const normName = ReconciliationNormalizer.normalize(node.name);

      if (!node.parent_id) {
        // Root Subject Node
        canonicalRootsBySlug.set(node.slug, node);
        canonicalRootsByNorm.set(normName, node);
      } else {
        // Child Node
        const slugKey = `${node.parent_id}:${node.slug}`;
        const normKey = `${node.parent_id}:${normName}`;
        canonicalByParentAndSlug.set(slugKey, node);
        canonicalByParentAndNorm.set(normKey, node);

        const siblings = canonicalChildrenByParentId.get(node.parent_id) || [];
        siblings.push(node);
        canonicalChildrenByParentId.set(node.parent_id, siblings);
      }
    });

    // Build Subtree lookup for each canonical node (all descendants)
    canonicalNodes.forEach((ancestor) => {
      const descendants: CanonicalTaxonomyNode[] = [];
      const prefix = `${ancestor.hierarchy_path}.`;
      canonicalNodes.forEach((candidate) => {
        if (candidate.id !== ancestor.id) {
          if (candidate.hierarchy_path.startsWith(prefix) || candidate.root_subject_id === ancestor.id) {
            descendants.push(candidate);
          }
        }
      });
      canonicalSubtreeByAncestorId.set(ancestor.id, descendants);
    });

    aliases.forEach((alias) => {
      const nodeAliases = aliasesByCanonicalId.get(alias.canonical_node_id) || [];
      nodeAliases.push(alias);
      aliasesByCanonicalId.set(alias.canonical_node_id, nodeAliases);

      const normKey = alias.normalized_alias;
      const list = aliasesByNorm.get(normKey) || [];
      list.push(alias);
      aliasesByNorm.set(normKey, list);
    });

    // -------------------------------------------------------------------------
    // Execution Pass: Context-Aware Matching Pipeline
    // -------------------------------------------------------------------------
    const matchedCanonicalBySyllabusId = new Map<string, string | null>(); // syllabusId -> canonicalId
    const itemMap = new Map<string, SyllabusReconciliationItem>();
    const rootItems: SyllabusReconciliationItem[] = [];
    const gapsList: SyllabusGapItem[] = [];

    const summary = {
      totalNodes: syllabusNodes.length,
      exactMatches: 0,
      aliasMatches: 0,
      proposedMatches: 0,
      manuallyMapped: 0,
      newSubjects: 0,
      newNodes: 0,
      ambiguous: 0,
      ignored: 0,
      taxonomyCoveragePercentage: 0,
    };

    // Breadcrumb tracker for syllabus path
    const syllabusPathMap = new Map<string, string>();

    for (const sylNode of syllabusNodes) {
      const normTitle = ReconciliationNormalizer.normalize(sylNode.raw_title);
      const rawSlug = sylNode.raw_slug || ReconciliationNormalizer.slugify(sylNode.raw_title);

      // Build syllabus breadcrumb path
      let syllabusPath = rawSlug;
      if (sylNode.parent_node_id && syllabusPathMap.has(sylNode.parent_node_id)) {
        syllabusPath = `${syllabusPathMap.get(sylNode.parent_node_id)}.${rawSlug}`;
      }
      syllabusPathMap.set(sylNode.id, syllabusPath);

      // Check if this node has an existing manual/reviewed override
      const existing = mappingMap.get(sylNode.id);
      if (existing && (existing.match_status === 'MANUALLY_MAPPED' || existing.reviewed_by)) {
        matchedCanonicalBySyllabusId.set(sylNode.id, existing.canonical_node_id);
        const canonNode = existing.canonical_node_id ? canonicalById.get(existing.canonical_node_id) : null;
        
        const item: SyllabusReconciliationItem = {
          syllabusNodeId: sylNode.id,
          rawTitle: sylNode.raw_title,
          rawSlug: sylNode.raw_slug,
          nodeDepth: sylNode.node_depth,
          displayOrder: sylNode.display_order,
          weightageTier: sylNode.weightage_tier,
          isMandatory: sylNode.is_mandatory,
          matchStatus: existing.match_status,
          matchConfidence: Number(existing.match_confidence),
          matchMethod: existing.match_method || 'MANUAL',
          matchReason: existing.match_notes || 'Preserved human-reviewed mapping',
          matchedCanonicalNodeId: existing.canonical_node_id,
          matchedCanonicalPath: canonNode?.hierarchy_path || null,
          candidateMatches: existing.candidate_matches || [],
          children: [],
        };
        itemMap.set(sylNode.id, item);
        summary.manuallyMapped++;
        continue;
      }

      let matchStatus: SyllabusMatchStatus = 'NEW_NODE_GAP';
      let matchConfidence = 0.00;
      let matchMethod: MatchMethod = 'UNMATCHED_GAP';
      let matchReason = 'No matching canonical node found.';
      let matchedCanonicalId: string | null = null;
      let matchedCanonicalPath: string | null = null;
      let candidates: CanonicalCandidateMatch[] = [];

      // -----------------------------------------------------------------------
      // ROOT SUBJECT MATCHING (Depth 1)
      // -----------------------------------------------------------------------
      if (!sylNode.parent_node_id || sylNode.node_depth === 1) {
        // Step 1.1: Exact Slug / Exact Normalized Name among Root Subjects
        const exactRoot = canonicalRootsBySlug.get(rawSlug) || canonicalRootsByNorm.get(normTitle);
        if (exactRoot) {
          matchStatus = 'EXACT_MATCH';
          matchConfidence = 1.00;
          matchMethod = 'EXACT_CONTEXTUAL';
          matchReason = `Exact subject match on canonical root "${exactRoot.name}"`;
          matchedCanonicalId = exactRoot.id;
          matchedCanonicalPath = exactRoot.hierarchy_path;
        } else {
          // Step 1.2: Alias matching on Root Subjects
          const matchedAliases = aliasesByNorm.get(normTitle) || [];
          const rootAlias = matchedAliases.find((a) => {
            const node = canonicalById.get(a.canonical_node_id);
            return node && node.node_depth === 1;
          });

          if (rootAlias) {
            const aliasNode = canonicalById.get(rootAlias.canonical_node_id)!;
            matchStatus = 'ALIAS_MATCH';
            matchConfidence = 0.95;
            matchMethod = 'ALIAS_REGISTRY';
            matchReason = `Matched canonical root subject "${aliasNode.name}" via registered alias "${rootAlias.alias_name}"`;
            matchedCanonicalId = aliasNode.id;
            matchedCanonicalPath = aliasNode.hierarchy_path;
          } else {
            // Step 1.3: Unmatched Root -> NEW_SUBJECT_GAP
            matchStatus = 'NEW_SUBJECT_GAP';
            matchConfidence = 0.00;
            matchMethod = 'UNMATCHED_GAP';
            matchReason = `Imported root subject "${sylNode.raw_title}" has no canonical equivalent in platform inventory.`;
            gapsList.push({
              gapType: 'NEW_SUBJECT_GAP',
              syllabusNodeId: sylNode.id,
              rawTitle: sylNode.raw_title,
              syllabusPath,
              nodeDepth: sylNode.node_depth,
              parentSyllabusNodeId: null,
              parentCanonicalNodeId: null,
              requiredAction: `Review and approve creation of canonical subject "${sylNode.raw_title}"`,
            });
            summary.newSubjects++;
          }
        }
      } else {
        // ---------------------------------------------------------------------
        // CHILD NODE MATCHING (Depth >= 2, Context-Aware)
        // ---------------------------------------------------------------------
        const parentSyllabusId = sylNode.parent_node_id;
        const parentCanonicalId = parentSyllabusId ? matchedCanonicalBySyllabusId.get(parentSyllabusId) : null;

        if (parentCanonicalId) {
          // Parent is mapped to a canonical node: Search within that parent's canonical children
          const parentSlugKey = `${parentCanonicalId}:${rawSlug}`;
          const parentNormKey = `${parentCanonicalId}:${normTitle}`;

          const canonicalChildren = canonicalChildrenByParentId.get(parentCanonicalId) || [];
          const canonicalSubtree = canonicalSubtreeByAncestorId.get(parentCanonicalId) || [];
          const allParentContextNodes = [
            ...canonicalChildren,
            ...canonicalSubtree.filter((st) => !canonicalChildren.some((c) => c.id === st.id)),
          ];

          // Step 2.1: Exact Contextual Match (Direct child or deep descendant in subtree)
          const exactChild = canonicalByParentAndSlug.get(parentSlugKey) || canonicalByParentAndNorm.get(parentNormKey);
          const deepExact = !exactChild
            ? allParentContextNodes.find(
                (c) => c.slug === rawSlug || ReconciliationNormalizer.normalize(c.name) === normTitle
              )
            : null;
          const matchedExactNode = exactChild || deepExact;

          if (matchedExactNode) {
            matchStatus = 'EXACT_MATCH';
            matchConfidence = 1.00;
            matchMethod = 'EXACT_CONTEXTUAL';
            matchReason = `Exact match on canonical node "${matchedExactNode.name}" under parent "${canonicalById.get(parentCanonicalId)?.name}"`;
            matchedCanonicalId = matchedExactNode.id;
            matchedCanonicalPath = matchedExactNode.hierarchy_path;
          } else {
            // Step 2.2: Alias Match under Parent Context (Direct or Subtree)
            let aliasChild: CanonicalTaxonomyNode | null = null;
            let matchedAliasObj: TaxonomyAlias | null = null;

            for (const node of allParentContextNodes) {
              const nodeAliases = aliasesByCanonicalId.get(node.id) || [];
              const found = nodeAliases.find((a) => a.normalized_alias === normTitle);
              if (found) {
                aliasChild = node;
                matchedAliasObj = found;
                break;
              }
            }

            if (aliasChild && matchedAliasObj) {
              matchStatus = 'ALIAS_MATCH';
              matchConfidence = 0.95;
              matchMethod = 'ALIAS_REGISTRY';
              matchReason = `Matched canonical topic "${aliasChild.name}" under parent via alias "${matchedAliasObj.alias_name}"`;
              matchedCanonicalId = aliasChild.id;
              matchedCanonicalPath = aliasChild.hierarchy_path;
            } else {
              // Step 2.3: Contextual Trigram Similarity among Parent's Subtree Nodes
              const scoredCandidates: CanonicalCandidateMatch[] = [];
              for (const node of allParentContextNodes) {
                const sim = ReconciliationNormalizer.computeSimilarity(sylNode.raw_title, node.name);
                if (sim >= 0.70) {
                  scoredCandidates.push({
                    canonicalNodeId: node.id,
                    name: node.name,
                    slug: node.slug,
                    hierarchyPath: node.hierarchy_path,
                    nodeDepth: node.node_depth,
                    similarity: sim,
                    matchMethod: 'TRIGRAM_SIMILARITY',
                    reason: `String similarity ${sim.toFixed(2)} under parent context`,
                  });
                }
              }

              scoredCandidates.sort((a, b) => b.similarity - a.similarity);

              if (scoredCandidates.length === 1) {
                // Exactly 1 high-confidence candidate under parent
                const top = scoredCandidates[0];
                matchStatus = 'PROPOSED_MATCH';
                matchConfidence = top.similarity;
                matchMethod = 'TRIGRAM_SIMILARITY';
                matchReason = `High-similarity candidate "${top.name}" (${top.similarity.toFixed(2)}) under parent. Requires human review.`;
                matchedCanonicalId = top.canonicalNodeId;
                matchedCanonicalPath = top.hierarchyPath;
                candidates = scoredCandidates;
                summary.proposedMatches++;
              } else if (scoredCandidates.length > 1) {
                // Multiple candidates -> AMBIGUOUS
                matchStatus = 'AMBIGUOUS';
                matchConfidence = 0.50;
                matchMethod = 'CONTEXTUAL_CANDIDATE';
                matchReason = `Ambiguous: Multiple candidates (${scoredCandidates.map((c) => c.name).join(', ')}) under parent context.`;
                candidates = scoredCandidates;
                gapsList.push({
                  gapType: 'AMBIGUOUS_MAPPING_GAP',
                  syllabusNodeId: sylNode.id,
                  rawTitle: sylNode.raw_title,
                  syllabusPath,
                  nodeDepth: sylNode.node_depth,
                  parentSyllabusNodeId: sylNode.parent_node_id,
                  parentCanonicalNodeId: parentCanonicalId,
                  requiredAction: `Review ambiguous candidates and select canonical target for "${sylNode.raw_title}"`,
                  candidates: scoredCandidates,
                });
                summary.ambiguous++;
              } else {
                // Step 2.4: No safe candidate under parent -> NEW_NODE_GAP
                matchStatus = 'NEW_NODE_GAP';
                matchConfidence = 0.00;
                matchMethod = 'UNMATCHED_GAP';
                matchReason = `No canonical node matching "${sylNode.raw_title}" exists under parent "${canonicalById.get(parentCanonicalId)?.name}"`;
                gapsList.push({
                  gapType: 'NEW_NODE_GAP',
                  syllabusNodeId: sylNode.id,
                  rawTitle: sylNode.raw_title,
                  syllabusPath,
                  nodeDepth: sylNode.node_depth,
                  parentSyllabusNodeId: sylNode.parent_node_id,
                  parentCanonicalNodeId: parentCanonicalId,
                  requiredAction: `Author new canonical node "${sylNode.raw_title}" under "${canonicalById.get(parentCanonicalId)?.name}"`,
                });
                summary.newNodes++;
              }
            }
          }
        } else {
          // Parent was NOT matched (Parent is a GAP or AMBIGUOUS)
          // Look for cross-branch matches but flag as PROPOSED_MATCH / AMBIGUOUS
          const globalCandidates: CanonicalCandidateMatch[] = [];
          for (const node of canonicalNodes) {
            const sim = ReconciliationNormalizer.computeSimilarity(sylNode.raw_title, node.name);
            if (sim >= 0.85) {
              globalCandidates.push({
                canonicalNodeId: node.id,
                name: node.name,
                slug: node.slug,
                hierarchyPath: node.hierarchy_path,
                nodeDepth: node.node_depth,
                similarity: sim,
                matchMethod: 'TRIGRAM_SIMILARITY',
                reason: `Cross-branch candidate (${sim.toFixed(2)}) without verified parent context`,
              });
            }
          }

          if (globalCandidates.length === 1) {
            matchStatus = 'PROPOSED_MATCH';
            matchConfidence = 0.70;
            matchMethod = 'TRIGRAM_SIMILARITY';
            matchReason = `Candidate "${globalCandidates[0].name}" found cross-branch. Requires parent context review.`;
            matchedCanonicalId = globalCandidates[0].canonicalNodeId;
            matchedCanonicalPath = globalCandidates[0].hierarchyPath;
            candidates = globalCandidates;
            summary.proposedMatches++;
          } else if (globalCandidates.length > 1) {
            matchStatus = 'AMBIGUOUS';
            matchConfidence = 0.40;
            matchMethod = 'CONTEXTUAL_CANDIDATE';
            matchReason = `Multiple cross-branch candidates found without parent context.`;
            candidates = globalCandidates;
            summary.ambiguous++;
          } else {
            matchStatus = 'NEW_NODE_GAP';
            matchConfidence = 0.00;
            matchMethod = 'UNMATCHED_GAP';
            matchReason = `Descendant of unmatched parent has no canonical target.`;
            gapsList.push({
              gapType: 'NEW_NODE_GAP',
              syllabusNodeId: sylNode.id,
              rawTitle: sylNode.raw_title,
              syllabusPath,
              nodeDepth: sylNode.node_depth,
              parentSyllabusNodeId: sylNode.parent_node_id,
              parentCanonicalNodeId: null,
              requiredAction: `Author canonical node "${sylNode.raw_title}" after parent resolution`,
            });
            summary.newNodes++;
          }
        }
      }

      // Update counters for matches
      if (matchStatus === 'EXACT_MATCH') summary.exactMatches++;
      if (matchStatus === 'ALIAS_MATCH') summary.aliasMatches++;

      matchedCanonicalBySyllabusId.set(sylNode.id, matchedCanonicalId);

      const item: SyllabusReconciliationItem = {
        syllabusNodeId: sylNode.id,
        rawTitle: sylNode.raw_title,
        rawSlug: sylNode.raw_slug,
        nodeDepth: sylNode.node_depth,
        displayOrder: sylNode.display_order,
        weightageTier: sylNode.weightage_tier,
        isMandatory: sylNode.is_mandatory,
        matchStatus,
        matchConfidence,
        matchMethod,
        matchReason,
        matchedCanonicalNodeId: matchedCanonicalId,
        matchedCanonicalPath,
        candidateMatches: candidates,
        children: [],
      };
      itemMap.set(sylNode.id, item);
    }

    // Assemble Hierarchical Reconciliation Tree
    syllabusNodes.forEach((sylNode) => {
      const current = itemMap.get(sylNode.id)!;
      if (!sylNode.parent_node_id) {
        rootItems.push(current);
      } else {
        const parent = itemMap.get(sylNode.parent_node_id);
        if (parent) {
          parent.children.push(current);
        } else {
          rootItems.push(current);
        }
      }
    });

    // Compute Taxonomy Coverage Percentage
    const coveredCount = summary.exactMatches + summary.aliasMatches + summary.manuallyMapped;
    summary.taxonomyCoveragePercentage = summary.totalNodes > 0
      ? Math.round((coveredCount / summary.totalNodes) * 1000) / 10
      : 0;

    // -------------------------------------------------------------------------
    // Historical Delta Analysis (if compareWithPreviousVersionId provided)
    // -------------------------------------------------------------------------
    let deltas: SyllabusDeltaItem[] | undefined;
    if (compareWithPreviousVersionId) {
      deltas = await this.computeVersionDeltas(supabase, syllabusVersionId, compareWithPreviousVersionId);
    }

    // -------------------------------------------------------------------------
    // Persist Mappings into exam_syllabus_canonical_mappings
    // -------------------------------------------------------------------------
    if (persistMappings) {
      await this.persistReconciliationMappings(supabase, syllabusNodes, itemMap);
    }

    return {
      examId: examData.id,
      examName: examData.title,
      syllabusVersionId: versionData.id,
      versionTag: versionData.version_tag,
      generatedAt: new Date().toISOString(),
      summary,
      subjects: rootItems,
      gaps: gapsList,
      deltas,
    };
  }

  /**
   * Persists reconciliation mapping evidence into exam_syllabus_canonical_mappings.
   * Preserves any existing MANUALLY_MAPPED or reviewed rows.
   */
  private static async persistReconciliationMappings(
    supabase: any,
    syllabusNodes: ExamSyllabusNode[],
    itemMap: Map<string, SyllabusReconciliationItem>
  ): Promise<void> {
    const rowsToUpsert = [];
    for (const node of syllabusNodes) {
      const item = itemMap.get(node.id);
      if (!item) continue;

      // Skip mutating human-reviewed / manual mappings
      if (item.matchStatus === 'MANUALLY_MAPPED') continue;

      rowsToUpsert.push({
        syllabus_node_id: item.syllabusNodeId,
        canonical_node_id: item.matchedCanonicalNodeId,
        match_status: item.matchStatus,
        match_confidence: item.matchConfidence,
        match_method: item.matchMethod,
        match_notes: item.matchReason,
        candidate_matches: item.candidateMatches || [],
        reconciliation_metadata: {
          reconciled_at: new Date().toISOString(),
          node_depth: item.nodeDepth,
          matched_path: item.matchedCanonicalPath,
        },
        updated_at: new Date().toISOString(),
      });
    }

    if (rowsToUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('exam_syllabus_canonical_mappings')
        .upsert(rowsToUpsert, { onConflict: 'syllabus_node_id' });

      if (upsertErr) {
        console.error(`[ReconciliationPersistence] Failed batch upsert mappings: ${upsertErr.message}`);
      }
    }
  }

  /**
   * Computes structural deltas between two syllabus versions for the same exam.
   */
  private static async computeVersionDeltas(
    supabase: any,
    currentVersionId: string,
    previousVersionId: string
  ): Promise<SyllabusDeltaItem[]> {
    const { data: currNodes } = await supabase
      .from('exam_syllabus_nodes')
      .select('*')
      .eq('syllabus_version_id', currentVersionId);

    const { data: prevNodes } = await supabase
      .from('exam_syllabus_nodes')
      .select('*')
      .eq('syllabus_version_id', previousVersionId);

    const prevMap = new Map<string, ExamSyllabusNode>();
    (prevNodes || []).forEach((n: ExamSyllabusNode) => {
      prevMap.set(n.raw_slug, n);
    });

    const currMap = new Map<string, ExamSyllabusNode>();
    (currNodes || []).forEach((n: ExamSyllabusNode) => {
      currMap.set(n.raw_slug, n);
    });

    const deltas: SyllabusDeltaItem[] = [];

    // 1. Check current nodes against previous
    for (const curr of currNodes || []) {
      const prev = prevMap.get(curr.raw_slug);
      if (!prev) {
        // Potential ADDED or POSSIBLE_RENAMED
        let possibleRename: ExamSyllabusNode | null = null;
        for (const p of prevNodes || []) {
          if (ReconciliationNormalizer.computeSimilarity(curr.raw_title, p.raw_title) >= 0.85) {
            possibleRename = p;
            break;
          }
        }

        if (possibleRename) {
          deltas.push({
            deltaType: 'POSSIBLE_RENAMED',
            syllabusNodeId: curr.id,
            rawTitle: curr.raw_title,
            previousVersionNodeId: possibleRename.id,
            details: `Likely renamed from "${possibleRename.raw_title}" (prior slug: ${possibleRename.raw_slug})`,
          });
        } else {
          deltas.push({
            deltaType: 'ADDED',
            syllabusNodeId: curr.id,
            rawTitle: curr.raw_title,
            details: `New requirement added in current syllabus version`,
          });
        }
      } else {
        if (curr.node_depth > prev.node_depth) {
          deltas.push({
            deltaType: 'DEPTH_EXPANDED',
            syllabusNodeId: curr.id,
            rawTitle: curr.raw_title,
            previousVersionNodeId: prev.id,
            details: `Depth increased from ${prev.node_depth} to ${curr.node_depth}`,
          });
        } else if (curr.node_depth < prev.node_depth) {
          deltas.push({
            deltaType: 'DEPTH_REDUCED',
            syllabusNodeId: curr.id,
            rawTitle: curr.raw_title,
            previousVersionNodeId: prev.id,
            details: `Depth decreased from ${prev.node_depth} to ${curr.node_depth}`,
          });
        } else {
          deltas.push({
            deltaType: 'UNCHANGED',
            syllabusNodeId: curr.id,
            rawTitle: curr.raw_title,
            previousVersionNodeId: prev.id,
            details: `Identical requirement in both versions`,
          });
        }
      }
    }

    // 2. Check for removed nodes from previous version
    for (const prev of prevNodes || []) {
      if (!currMap.has(prev.raw_slug)) {
        deltas.push({
          deltaType: 'REMOVED',
          syllabusNodeId: prev.id,
          rawTitle: prev.raw_title,
          previousVersionNodeId: prev.id,
          details: `Requirement "${prev.raw_title}" was removed from the new syllabus version`,
        });
      }
    }

    return deltas;
  }
}
