/**
 * COURAGE LIBRARY — CANONICAL TAXONOMY PROJECTION SERVICE
 * Phase 3R.2: Legacy to Recursive Canonical Taxonomy Projection Foundation
 * 
 * Provides deterministic, idempotent projection of existing legacy taxonomy
 * (subjects -> topics -> subtopics) into the new recursive canonical taxonomy
 * (canonical_taxonomy_nodes).
 * 
 * INVARIANTS:
 * 1. PURELY ADDITIVE: Never mutates, deletes, or drops legacy rows or tables.
 * 2. 100% IDEMPOTENT: Re-running multiple times produces identical canonical nodes with zero duplicates.
 * 3. RELATIONAL INTEGRITY: Preserves legacy back-references (legacy_subject_id, legacy_topic_id, legacy_subtopic_id).
 * 4. DERIVED FIELD SYNCHRONIZATION: Relies on database triggers to ensure root_subject_id, node_depth, and hierarchy_path are perfectly maintained.
 */

import { createAdminServerSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { CanonicalTaxonomyNode } from '@/types/dynamic-syllabus-reconciliation';

export interface TaxonomyProjectionResult {
  projectedSubjects: number;
  projectedTopics: number;
  projectedSubtopics: number;
  totalCanonicalNodes: number;
  details: {
    subjects: Array<{ id: string; name: string; slug: string; canonicalId: string }>;
    topicsCountBySubject: Record<string, number>;
  };
}

export class CanonicalTaxonomyProjectionService {
  /**
   * Projects active legacy subjects, topics, and subtopics into canonical_taxonomy_nodes.
   * Fully idempotent via partial unique indexes on legacy back-references.
   */
  static async projectLegacyTaxonomy(supabaseClient?: any): Promise<TaxonomyProjectionResult> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    // 1. Fetch all active legacy subjects
    const { data: legacySubjects, error: subErr } = await supabase
      .from('subjects')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (subErr) {
      throw new Error(`Failed to fetch legacy subjects for projection: ${subErr.message}`);
    }

    // 2. Fetch all active legacy topics
    const { data: legacyTopics, error: topErr } = await supabase
      .from('topics')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (topErr) {
      throw new Error(`Failed to fetch legacy topics for projection: ${topErr.message}`);
    }

    // 3. Fetch all active legacy subtopics (if any exist)
    const { data: legacySubtopics, error: subtopErr } = await supabase
      .from('subtopics')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (subtopErr) {
      throw new Error(`Failed to fetch legacy subtopics for projection: ${subtopErr.message}`);
    }

    let projectedSubjectsCount = 0;
    let projectedTopicsCount = 0;
    let projectedSubtopicsCount = 0;
    const subjectMap = new Map<string, string>(); // legacy_subject_id -> canonical_node_id
    const topicMap = new Map<string, string>(); // legacy_topic_id -> canonical_node_id
    const subjectDetails: Array<{ id: string; name: string; slug: string; canonicalId: string }> = [];
    const topicsCountBySubject: Record<string, number> = {};

    // 4. Project Subjects (Depth 1, Root Nodes)
    for (const sub of legacySubjects || []) {
      // Check if already projected
      const { data: existingNode, error: checkErr } = await supabase
        .from('canonical_taxonomy_nodes')
        .select('id, name, slug')
        .eq('legacy_subject_id', sub.id)
        .maybeSingle();

      if (checkErr) {
        throw new Error(`Error checking existing canonical subject ${sub.id}: ${checkErr.message}`);
      }

      let canonicalId: string;

      if (existingNode) {
        canonicalId = existingNode.id;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('canonical_taxonomy_nodes')
          .insert({
            legacy_subject_id: sub.id,
            name: sub.name,
            slug: sub.slug,
            node_type: 'SUBJECT',
            display_order: sub.display_order,
            is_active: sub.is_active,
            metadata: {
              source: 'LEGACY_PROJECTION',
              icon: sub.icon || null,
            },
          })
          .select('id')
          .single();

        if (insertErr) {
          throw new Error(`Failed to project subject ${sub.name} (${sub.id}): ${insertErr.message}`);
        }
        canonicalId = inserted.id;
      }

      subjectMap.set(sub.id, canonicalId);
      subjectDetails.push({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        canonicalId,
      });
      topicsCountBySubject[sub.name] = 0;
      projectedSubjectsCount++;
    }

    // 5. Project Topics (Depth 2, Children of Projected Subjects)
    for (const top of legacyTopics || []) {
      const parentCanonicalId = subjectMap.get(top.subject_id);
      if (!parentCanonicalId) {
        console.warn(`[TaxonomyProjection] Topic ${top.name} references non-projected subject ${top.subject_id}. Skipping.`);
        continue;
      }

      const { data: existingNode, error: checkErr } = await supabase
        .from('canonical_taxonomy_nodes')
        .select('id, name, slug')
        .eq('legacy_topic_id', top.id)
        .maybeSingle();

      if (checkErr) {
        throw new Error(`Error checking existing canonical topic ${top.id}: ${checkErr.message}`);
      }

      let canonicalId: string;

      if (existingNode) {
        canonicalId = existingNode.id;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('canonical_taxonomy_nodes')
          .insert({
            parent_id: parentCanonicalId,
            legacy_topic_id: top.id,
            name: top.name,
            slug: top.slug,
            node_type: 'TOPIC',
            display_order: top.display_order,
            is_active: top.is_active,
            metadata: {
              source: 'LEGACY_PROJECTION',
              description: top.description || null,
              importance_level: top.importance_level || 'CORE',
            },
          })
          .select('id')
          .single();

        if (insertErr) {
          throw new Error(`Failed to project topic ${top.name} (${top.id}): ${insertErr.message}`);
        }
        canonicalId = inserted.id;
      }

      topicMap.set(top.id, canonicalId);
      const subObj = (legacySubjects || []).find((s: any) => s.id === top.subject_id);
      if (subObj && topicsCountBySubject[subObj.name] !== undefined) {
        topicsCountBySubject[subObj.name]++;
      }
      projectedTopicsCount++;
    }

    // 6. Project Subtopics (Depth 3, Children of Projected Topics)
    for (const subtop of legacySubtopics || []) {
      const parentCanonicalId = topicMap.get(subtop.topic_id);
      if (!parentCanonicalId) {
        console.warn(`[TaxonomyProjection] Subtopic ${subtop.name} references non-projected topic ${subtop.topic_id}. Skipping.`);
        continue;
      }

      const { data: existingNode, error: checkErr } = await supabase
        .from('canonical_taxonomy_nodes')
        .select('id')
        .eq('legacy_subtopic_id', subtop.id)
        .maybeSingle();

      if (checkErr) {
        throw new Error(`Error checking existing canonical subtopic ${subtop.id}: ${checkErr.message}`);
      }

      if (!existingNode) {
        const { error: insertErr } = await supabase
          .from('canonical_taxonomy_nodes')
          .insert({
            parent_id: parentCanonicalId,
            legacy_subtopic_id: subtop.id,
            name: subtop.name,
            slug: subtop.slug,
            node_type: 'SUBTOPIC',
            display_order: subtop.display_order,
            is_active: subtop.is_active,
            metadata: {
              source: 'LEGACY_PROJECTION',
              description: subtop.description || null,
            },
          });

        if (insertErr) {
          throw new Error(`Failed to project subtopic ${subtop.name} (${subtop.id}): ${insertErr.message}`);
        }
      }
      projectedSubtopicsCount++;
    }

    // 7. Total count in canonical_taxonomy_nodes
    const { count: totalCanonicalNodes, error: countErr } = await supabase
      .from('canonical_taxonomy_nodes')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      throw new Error(`Failed to count canonical taxonomy nodes: ${countErr.message}`);
    }

    return {
      projectedSubjects: projectedSubjectsCount,
      projectedTopics: projectedTopicsCount,
      projectedSubtopics: projectedSubtopicsCount,
      totalCanonicalNodes: totalCanonicalNodes || 0,
      details: {
        subjects: subjectDetails,
        topicsCountBySubject,
      },
    };
  }

  /**
   * Fetches the complete canonical taxonomy tree from canonical_taxonomy_nodes.
   */
  static async getCanonicalTaxonomyTree(supabaseClient?: any): Promise<CanonicalTaxonomyNode[]> {
    const supabase = supabaseClient || (await createServerSupabaseClient());

    const { data: nodes, error } = await supabase
      .from('canonical_taxonomy_nodes')
      .select('*')
      .eq('is_active', true)
      .order('node_depth', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch canonical taxonomy tree: ${error.message}`);
    }

    // Assemble nested tree
    const nodeMap = new Map<string, CanonicalTaxonomyNode>();
    const rootNodes: CanonicalTaxonomyNode[] = [];

    (nodes || []).forEach((n: CanonicalTaxonomyNode) => {
      nodeMap.set(n.id, { ...n, children: [] });
    });

    (nodes || []).forEach((n: CanonicalTaxonomyNode) => {
      const current = nodeMap.get(n.id)!;
      if (!n.parent_id) {
        rootNodes.push(current);
      } else {
        const parent = nodeMap.get(n.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(current);
        } else {
          // If parent is inactive or missing, treat as root for safety
          rootNodes.push(current);
        }
      }
    });

    return rootNodes;
  }
}
