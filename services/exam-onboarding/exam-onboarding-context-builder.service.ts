/**
 * COURAGE LIBRARY — EXAM ONBOARDING CONTEXT BUILDER
 * Phase 3K: AI-Assisted Exam Onboarding Context Assembly Engine
 */

import crypto from 'crypto';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamOnboardingService } from './exam-onboarding.service';
import { ExamModuleRegistry } from '@/services/exam-knowledge/exam-module-registry';
import { OnboardingContextSnapshot } from '@/types/exam-onboarding';

export class ExamOnboardingContextBuilder {
  /**
   * Assembles a state-aware context snapshot for an exam onboarding flow.
   */
  static async buildContext(params: {
    examId?: string;
    examName?: string;
    cycleYear?: number;
    category?: string;
    conductingOrgName?: string;
    customSupabase?: any;
  }): Promise<OnboardingContextSnapshot> {
    const supabase = params.customSupabase || createAdminServerSupabaseClient();

    let examData: any = null;
    let activeCycle: any = null;
    let postsData: any[] = [];
    let syllabusData: any[] = [];

    const targetExamName = (params.examName || '').trim();

    if (params.examId) {
      const [examRes, cyclesRes, postsRes, syllabusRes] = await Promise.all([
        supabase
          .from('exams')
          .select('id, title, slug, category, description, org_id, conducting_org:conducting_orgs(id, name, slug, official_website)')
          .eq('id', params.examId)
          .maybeSingle(),
        supabase
          .from('exam_cycles')
          .select('id, cycle_year, cycle_name, notification_date, application_start_date, application_end_date, is_active')
          .eq('exam_id', params.examId)
          .order('cycle_year', { ascending: false }),
        supabase
          .from('exam_posts')
          .select('id, post_name, pay_level, classification_group')
          .eq('exam_id', params.examId)
          .eq('is_active', true),
        supabase
          .from('exam_topics')
          .select('topic_id')
          .eq('exam_id', params.examId)
          .eq('is_active', true),
      ]);

      examData = examRes.data;
      const cycles = cyclesRes.data || [];
      activeCycle = params.cycleYear
        ? cycles.find((c: any) => c.cycle_year === params.cycleYear) || cycles[0] || null
        : cycles.find((c: any) => c.is_active) || cycles[0] || null;
      postsData = postsRes.data || [];
      syllabusData = syllabusRes.data || [];
    }

    const canonicalTaxonomy = await ExamOnboardingService.getCanonicalTaxonomy(supabase);
    const registeredModules = ExamModuleRegistry.getAllModuleDefinitions();

    const orgInfo = examData?.conducting_org
      ? Array.isArray(examData.conducting_org) ? examData.conducting_org[0] : examData.conducting_org
      : null;

    const examTitle = (examData?.title || targetExamName).trim();
    if (!examTitle) {
      throw new Error("Target examination name is required to build onboarding context.");
    }
    const orgName = orgInfo?.name || params.conductingOrgName || undefined;
    const resolvedCycleYear = activeCycle?.cycle_year || params.cycleYear || undefined;

    // Build canonical facts payload for deterministic hashing
    const factsToHash = {
      examTitle: examTitle.toLowerCase().trim(),
      examSlug: examData?.slug || '',
      orgName: (orgName || '').toLowerCase().trim(),
      cycleYear: resolvedCycleYear || 0,
      existingPostsCount: postsData.length,
      canonicalSubjectsCount: canonicalTaxonomy.length,
      registeredModulesCount: registeredModules.length,
    };

    const contextHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(factsToHash))
      .digest('hex')
      .slice(0, 16);

    return {
      targetExamName: examTitle,
      examId: examData?.id || params.examId,
      examSlug: examData?.slug,
      category: examData?.category || params.category || 'National Recruitment',
      description: examData?.description,
      conductingOrgName: orgName,
      conductingOrgSlug: orgInfo?.slug,
      officialWebsite: orgInfo?.official_website,
      cycleYear: resolvedCycleYear,
      cycleName: activeCycle?.cycle_name,
      notificationDate: activeCycle?.notification_date,
      applicationStartDate: activeCycle?.application_start_date,
      applicationEndDate: activeCycle?.application_end_date,
      existingPostsCount: postsData.length,
      existingPosts: postsData.map((p: any) => ({
        postName: p.post_name,
        payLevel: p.pay_level,
        classificationGroup: p.classification_group,
      })),
      availableCanonicalSubjects: canonicalTaxonomy.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        topics: s.topics.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
      })),
      registeredKnowledgeModules: registeredModules.map((m) => ({
        key: m.key,
        displayName: m.displayName,
        purpose: m.purpose,
        isCycleSpecific: m.isCycleSpecific,
        requiresSources: m.requiresSources,
      })),
      contextHash,
      generatedAt: new Date().toISOString(),
    };
  }
}
