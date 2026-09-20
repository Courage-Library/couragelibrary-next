/**
 * COURAGE LIBRARY — EXAM SYLLABUS SERVICE
 * Phase 3A: Academic Taxonomy & Exam Syllabus Foundation
 * 
 * Resolves exam-specific syllabus projections from canonical academic taxonomy.
 * 
 * Invariants:
 * - Canonical subjects/topics are reused across multiple exams.
 * - Exam syllabus captures exam-specific weightage, depth, importance, and sequence.
 * - Multi-exam syllabus comparisons without duplicating core learning units.
 */

import {
  ExamSyllabusSubject,
  ExamTopicMapping,
  ExamUnitMapping,
  ExamSyllabusOverview,
  ImportanceTier,
  RequiredDepth,
} from '@/types/learning-taxonomy';

export class ExamSyllabusService {
  /**
   * Fetches full syllabus hierarchy for a given exam.
   */
  static async getExamSyllabus(
    examId: string,
    supabaseClient: any
  ): Promise<ExamSyllabusOverview> {
    // 1. Fetch exam subjects
    const { data: syllabi, error: sylErr } = await supabaseClient
      .from('exam_syllabi')
      .select('*, subject:subjects(*)')
      .eq('exam_id', examId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (sylErr) {
      throw new Error(`Failed to fetch exam syllabus subjects: ${sylErr.message}`);
    }

    // 2. Fetch exam topics
    const { data: examTopics, error: topicErr } = await supabaseClient
      .from('exam_topics')
      .select('*, topic:topics(*)')
      .eq('exam_id', examId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (topicErr) {
      throw new Error(`Failed to fetch exam topics: ${topicErr.message}`);
    }

    // 3. Fetch exam unit mappings
    const examTopicIds = (examTopics || []).map((t: ExamTopicMapping) => t.id);
    let unitMappings: ExamUnitMapping[] = [];
    if (examTopicIds.length > 0) {
      const { data: units, error: unitErr } = await supabaseClient
        .from('exam_unit_mappings')
        .select('*, learning_unit:learning_units(*)')
        .in('exam_topic_id', examTopicIds)
        .eq('is_active', true)
        .order('sequence_order', { ascending: true });

      if (unitErr) {
        throw new Error(`Failed to fetch exam unit mappings: ${unitErr.message}`);
      }
      unitMappings = units || [];
    }

    // 4. Assemble hierarchy
    const subjectList: ExamSyllabusOverview['subjects'] = [];
    let totalLearningUnits = 0;
    let estimatedTotalMinutes = 0;

    for (const syllabus of syllabi || []) {
      const matchedTopics = (examTopics || []).filter(
        (t: ExamTopicMapping) => t.subject_id === syllabus.subject_id
      );

      const topicTrees = matchedTopics.map((topicMapping: ExamTopicMapping) => {
        const units = unitMappings.filter(
          (u: ExamUnitMapping) => u.exam_topic_id === topicMapping.id
        );
        totalLearningUnits += units.length;
        units.forEach((u) => {
          if (u.learning_unit?.estimated_minutes) {
            estimatedTotalMinutes += u.learning_unit.estimated_minutes;
          }
        });

        return {
          mapping: topicMapping,
          units,
        };
      });

      subjectList.push({
        syllabus,
        topics: topicTrees,
      });
    }

    return {
      exam_id: examId,
      total_subjects: (syllabi || []).length,
      total_topics: (examTopics || []).length,
      total_learning_units: totalLearningUnits,
      estimated_total_minutes: estimatedTotalMinutes,
      subjects: subjectList,
    };
  }

  /**
   * Fetches mapped topics for an exam, optionally filtered by subject.
   */
  static async getExamTopics(
    examId: string,
    subjectId?: string,
    supabaseClient?: any
  ): Promise<ExamTopicMapping[]> {
    let query = supabaseClient
      .from('exam_topics')
      .select('*, topic:topics(*)')
      .eq('exam_id', examId)
      .eq('is_active', true);

    if (subjectId) {
      query = query.eq('subject_id', subjectId);
    }

    const { data, error } = await query.order('display_order', { ascending: true });
    if (error) {
      throw new Error(`Failed to fetch exam topics: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Fetches exam-specific sequence of learning units for an exam topic.
   */
  static async getExamTopicLearningUnits(
    examTopicId: string,
    supabaseClient: any
  ): Promise<ExamUnitMapping[]> {
    const { data, error } = await supabaseClient
      .from('exam_unit_mappings')
      .select('*, learning_unit:learning_units(*)')
      .eq('exam_topic_id', examTopicId)
      .eq('is_active', true)
      .order('sequence_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch exam topic learning units: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Calculates overall syllabus coverage and estimated preparation workload.
   */
  static calculateSyllabusCoverage(
    overview: ExamSyllabusOverview
  ): {
    totalSubjects: number;
    totalTopics: number;
    totalUnits: number;
    coreUnitsCount: number;
    optionalUnitsCount: number;
    estimatedMinutes: number;
    estimatedHours: number;
  } {
    let coreUnitsCount = 0;
    let optionalUnitsCount = 0;
    let totalMinutes = 0;

    for (const sub of overview.subjects) {
      for (const top of sub.topics) {
        for (const u of top.units) {
          if (u.is_exam_core) {
            coreUnitsCount++;
          } else {
            optionalUnitsCount++;
          }
          if (u.learning_unit?.estimated_minutes) {
            totalMinutes += u.learning_unit.estimated_minutes;
          }
        }
      }
    }

    return {
      totalSubjects: overview.total_subjects,
      totalTopics: overview.total_topics,
      totalUnits: overview.total_learning_units,
      coreUnitsCount,
      optionalUnitsCount,
      estimatedMinutes: totalMinutes,
      estimatedHours: Math.round((totalMinutes / 60) * 10) / 10,
    };
  }

  /**
   * Compares syllabus requirements across two different exams for shared canonical topics.
   */
  static compareExamSyllabi(
    syllabusA: ExamTopicMapping[],
    syllabusB: ExamTopicMapping[]
  ): {
    sharedTopicsCount: number;
    uniqueToACount: number;
    uniqueToBCount: number;
    comparisons: {
      topicId: string;
      topicName: string;
      examA: { importance: ImportanceTier | string; depth: RequiredDepth; isMandatory: boolean } | null;
      examB: { importance: ImportanceTier | string; depth: RequiredDepth; isMandatory: boolean } | null;
      depthDiffers: boolean;
      importanceDiffers: boolean;
    }[];
  } {
    const mapA = new Map<string, ExamTopicMapping>();
    syllabusA.forEach((t) => mapA.set(t.topic_id, t));

    const mapB = new Map<string, ExamTopicMapping>();
    syllabusB.forEach((t) => mapB.set(t.topic_id, t));

    const allTopicIds = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));
    const comparisons = [];
    let sharedCount = 0;
    let uniqueACount = 0;
    let uniqueBCount = 0;

    for (const topicId of allTopicIds) {
      const itemA = mapA.get(topicId) || null;
      const itemB = mapB.get(topicId) || null;

      if (itemA && itemB) {
        sharedCount++;
      } else if (itemA) {
        uniqueACount++;
      } else if (itemB) {
        uniqueBCount++;
      }

      const topicName = itemA?.topic?.name || itemB?.topic?.name || topicId;

      comparisons.push({
        topicId,
        topicName,
        examA: itemA
          ? {
              importance: itemA.importance_tier,
              depth: itemA.required_depth,
              isMandatory: itemA.is_mandatory,
            }
          : null,
        examB: itemB
          ? {
              importance: itemB.importance_tier,
              depth: itemB.required_depth,
              isMandatory: itemB.is_mandatory,
            }
          : null,
        depthDiffers: itemA && itemB ? itemA.required_depth !== itemB.required_depth : false,
        importanceDiffers: itemA && itemB ? itemA.importance_tier !== itemB.importance_tier : false,
      });
    }

    return {
      sharedTopicsCount: sharedCount,
      uniqueToACount: uniqueACount,
      uniqueToBCount: uniqueBCount,
      comparisons,
    };
  }
}
