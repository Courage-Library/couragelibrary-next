/**
 * COURAGE LIBRARY — ACADEMIC TAXONOMY SERVICE
 * Phase 3A: Academic Taxonomy & Exam Syllabus Foundation
 * 
 * Provides domain access to canonical subjects, topics, subtopics,
 * discrete learning unit identities, and canonical knowledge graph relationships.
 * 
 * Invariants:
 * - Pure structural and metadata retrieval.
 * - Zero content body rendering or storage.
 * - Cycle detection for prerequisite knowledge graph.
 */

import {
  CanonicalSubject,
  CanonicalTopic,
  CanonicalSubtopic,
  TopicRelationship,
  LearningUnit,
  LearningUnitType,
  RelationshipType,
  TopicHierarchy,
} from '@/types/learning-taxonomy';
import type { AppSupabaseClient } from '@/lib/supabase/types';

// The topics projection stores importance as importance_level; the domain type calls it default_importance.
type TopicRow = { importance_level: string | null; subject_id: string | null } & Omit<CanonicalTopic, 'default_importance' | 'subject' | 'subject_id'>;
const toTopic = <T extends TopicRow>(t: T): Omit<T, 'subject_id'> & CanonicalTopic => ({
  ...t,
  subject_id: t.subject_id ?? '',
  default_importance: t.importance_level ?? '',
});
const toUnit = <T extends { unit_type: string }>(u: T) => ({ ...u, unit_type: u.unit_type as LearningUnitType });
type RelationshipRow = { relationship_type: string; strength: string; from_topic?: TopicRow | null; to_topic?: TopicRow | null } & Omit<
  TopicRelationship,
  'relationship_type' | 'strength' | 'from_topic' | 'to_topic'
>;
const toRelationship = (r: RelationshipRow): TopicRelationship => ({
  ...r,
  relationship_type: r.relationship_type as RelationshipType,
  strength: r.strength as TopicRelationship['strength'],
  from_topic: r.from_topic ? toTopic(r.from_topic) : undefined,
  to_topic: r.to_topic ? toTopic(r.to_topic) : undefined,
});

export class AcademicTaxonomyService {
  /**
   * Fetches all active canonical subjects ordered by display_order.
   */
  static async getCanonicalSubjects(supabaseClient: AppSupabaseClient): Promise<CanonicalSubject[]> {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch canonical subjects: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Fetches a single canonical subject by slug.
   */
  static async getCanonicalSubjectBySlug(
    slug: string,
    supabaseClient: AppSupabaseClient
  ): Promise<CanonicalSubject | null> {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch subject by slug ${slug}: ${error.message}`);
    }
    return data || null;
  }

  /**
   * Fetches all active topics under a subject ordered by display_order.
   */
  static async getSubjectTopics(
    subjectId: string,
    supabaseClient: AppSupabaseClient
  ): Promise<CanonicalTopic[]> {
    const { data, error } = await supabaseClient
      .from('topics')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch topics for subject ${subjectId}: ${error.message}`);
    }
    return (data || []).map(toTopic);
  }

  /**
   * Fetches subtopics for a topic ordered by display_order.
   */
  static async getTopicSubtopics(
    topicId: string,
    supabaseClient: AppSupabaseClient
  ): Promise<CanonicalSubtopic[]> {
    const { data, error } = await supabaseClient
      .from('subtopics')
      .select('*')
      .eq('topic_id', topicId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch subtopics for topic ${topicId}: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Fetches discrete learning units for a topic (metadata only, zero content bodies).
   */
  static async getLearningUnitsForTopic(
    topicId: string,
    subtopicId: string | undefined,
    supabaseClient: AppSupabaseClient
  ): Promise<LearningUnit[]> {
    let query = supabaseClient
      .from('learning_units')
      .select('*')
      .eq('topic_id', topicId)
      .eq('is_active', true);

    if (subtopicId) {
      query = query.eq('subtopic_id', subtopicId);
    }

    const { data, error } = await query.order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch learning units for topic ${topicId}: ${error.message}`);
    }
    return (data || []).map(toUnit);
  }

  /**
   * Fetches canonical relationships for a topic (prerequisites, related, advanced).
   */
  static async getTopicRelationships(
    topicId: string,
    supabaseClient: AppSupabaseClient
  ): Promise<{
    prerequisites: TopicRelationship[];
    related: TopicRelationship[];
    advanced: TopicRelationship[];
  }> {
    // Inbound: other topics that are prerequisites to this topic
    const { data: inRel, error: inErr } = await supabaseClient
      .from('topic_relationships')
      .select('*, from_topic:canonical_taxonomy_nodes!topic_relationships_from_topic_id_node_fkey(id, subject_id:root_subject_id, name, slug, description:metadata->>description, importance_level:metadata->>importance_level, display_order, is_active, created_at, updated_at)')
      .eq('to_topic_id', topicId)
      .eq('is_active', true);

    if (inErr) {
      throw new Error(`Failed to fetch topic inbound relationships: ${inErr.message}`);
    }

    // Outbound: other topics where this topic is a prerequisite / advanced / related
    const { data: outRel, error: outErr } = await supabaseClient
      .from('topic_relationships')
      .select('*, to_topic:canonical_taxonomy_nodes!topic_relationships_to_topic_id_node_fkey(id, subject_id:root_subject_id, name, slug, description:metadata->>description, importance_level:metadata->>importance_level, display_order, is_active, created_at, updated_at)')
      .eq('from_topic_id', topicId)
      .eq('is_active', true);

    if (outErr) {
      throw new Error(`Failed to fetch topic outbound relationships: ${outErr.message}`);
    }

    const allIn = (inRel || []).map(toRelationship);
    const allOut = (outRel || []).map(toRelationship);

    const prerequisites = allIn.filter((r: TopicRelationship) => r.relationship_type === 'PREREQUISITE');
    const related = [
      ...allIn.filter((r: TopicRelationship) => r.relationship_type === 'RELATED'),
      ...allOut.filter((r: TopicRelationship) => r.relationship_type === 'RELATED')
    ];
    const advanced = allOut.filter((r: TopicRelationship) => r.relationship_type === 'ADVANCED_APPLICATION');

    return {
      prerequisites,
      related,
      advanced,
    };
  }

  /**
   * Fetches complete academic hierarchy for a topic.
   */
  static async getTopicHierarchy(
    topicId: string,
    supabaseClient: AppSupabaseClient
  ): Promise<TopicHierarchy | null> {
    const { data: topic, error: topicErr } = await supabaseClient
      .from('topics')
      .select('*, subject:canonical_taxonomy_nodes!topics_subject_id_node_fkey(id, name, slug, icon:metadata->>icon, display_order, is_active, created_at, updated_at)')
      .eq('id', topicId)
      .eq('is_active', true)
      .maybeSingle();

    if (topicErr || !topic) {
      return null;
    }

    const [subtopics, learningUnits, relationships] = await Promise.all([
      this.getTopicSubtopics(topicId, supabaseClient),
      this.getLearningUnitsForTopic(topicId, undefined, supabaseClient),
      this.getTopicRelationships(topicId, supabaseClient),
    ]);

    const prerequisites = relationships.prerequisites.map((r: any) => r.from_topic).filter(Boolean);
    const related_topics = relationships.related.map((r: any) => r.to_topic || r.from_topic).filter(Boolean);
    const advanced_applications = relationships.advanced.map((r: any) => r.to_topic).filter(Boolean);

    return {
      topic: { ...toTopic(topic), subject: topic.subject ?? undefined },
      subtopics,
      learning_units: learningUnits,
      prerequisites,
      related_topics,
      advanced_applications,
    };
  }

  /**
   * Validates structural integrity of an academic node before insertion.
   */
  static validateAcademicHierarchy(
    subject?: Partial<CanonicalSubject>,
    topic?: Partial<CanonicalTopic>,
    unit?: Partial<LearningUnit>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (subject) {
      if (!subject.name || subject.name.trim().length === 0) {
        errors.push('Subject name is required.');
      }
      if (!subject.slug || !/^[a-z0-9-_]+$/.test(subject.slug)) {
        errors.push('Subject slug must be alphanumeric with hyphens/underscores.');
      }
    }

    if (topic) {
      if (!topic.name || topic.name.trim().length === 0) {
        errors.push('Topic name is required.');
      }
      if (!topic.slug || !/^[a-z0-9-_]+$/.test(topic.slug)) {
        errors.push('Topic slug must be alphanumeric with hyphens/underscores.');
      }
      if (!topic.subject_id) {
        errors.push('Topic must belong to a valid subject_id.');
      }
    }

    if (unit) {
      const validTypes: LearningUnitType[] = [
        'CONCEPT_LESSON',
        'WORKED_EXAMPLES',
        'FORMULA_SHORTCUT_SHEET',
        'COMMON_TRAPS_AND_MISTAKES',
        'PYQ_DEEP_DIVE',
        'TOPIC_SUMMARY_REVISION',
      ];
      if (!unit.title || unit.title.trim().length === 0) {
        errors.push('Learning Unit title is required.');
      }
      if (!unit.slug || !/^[a-z0-9-_]+$/.test(unit.slug)) {
        errors.push('Learning Unit slug must be alphanumeric with hyphens/underscores.');
      }
      if (!unit.unit_type || !validTypes.includes(unit.unit_type)) {
        errors.push(`Learning Unit unit_type must be one of: ${validTypes.join(', ')}`);
      }
      if (typeof unit.estimated_minutes === 'number' && unit.estimated_minutes <= 0) {
        errors.push('Learning Unit estimated_minutes must be positive integer (> 0).');
      }
      // Strict Invariant: Zero content bodies
      if ('content_body' in unit || 'markdown' in unit || 'mdx' in unit || 'html' in unit) {
        errors.push('FATAL: LearningUnit schema strictly forbids content body storage.');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Pure deterministic cycle detector for prerequisite graphs (DFS cycle detection).
   */
  static detectRelationshipCycles(
    relationships: { from_topic_id: string; to_topic_id: string; relationship_type: RelationshipType }[]
  ): { hasCycle: boolean; cyclePath?: string[] } {
    // Only check directed PREREQUISITE edges (from -> to means 'from' is prerequisite for 'to')
    const prereqs = relationships.filter((r) => r.relationship_type === 'PREREQUISITE');
    const adj = new Map<string, string[]>();

    for (const edge of prereqs) {
      if (!adj.has(edge.from_topic_id)) {
        adj.set(edge.from_topic_id, []);
      }
      adj.get(edge.from_topic_id)!.push(edge.to_topic_id);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const parentMap = new Map<string, string>();
    let cycleNode: string | null = null;

    function dfs(node: string): boolean {
      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          parentMap.set(neighbor, node);
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          cycleNode = neighbor;
          parentMap.set(neighbor, node);
          return true;
        }
      }

      recStack.delete(node);
      return false;
    }

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          const path: string[] = [cycleNode!];
          let curr = parentMap.get(cycleNode!);
          while (curr && curr !== cycleNode) {
            path.push(curr);
            curr = parentMap.get(curr);
          }
          path.push(cycleNode!);
          return { hasCycle: true, cyclePath: path.reverse() };
        }
      }
    }

    return { hasCycle: false };
  }
}
