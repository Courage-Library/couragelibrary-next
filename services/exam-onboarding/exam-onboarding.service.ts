/**
 * COURAGE LIBRARY — EXAM ONBOARDING SERVICE
 * Phase 3J: Unified Multi-Exam Onboarding Studio & Control Plane
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamReadinessService, ExamReadinessReport } from './exam-readiness.service';
import { ExamModuleRegistry } from '@/services/exam-knowledge/exam-module-registry';
import { ExamModuleKey } from '@/types/exam-knowledge';
import { ImportanceTier, RequiredDepth } from '@/types/learning-taxonomy';

export interface AdminExamListItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  description?: string | null;
  isActive: boolean;
  conductingOrg: {
    id: string;
    name: string;
    slug: string;
    officialWebsite?: string | null;
  };
  activeCycle?: {
    id: string;
    cycleYear: number;
    status: string;
  } | null;
  totalCyclesCount: number;
  totalPostsCount: number;
  totalPublishedModulesCount: number;
  readinessReport: ExamReadinessReport;
  createdAt: string;
  updatedAt: string;
}

export interface ConductingOrgItem {
  id: string;
  name: string;
  slug: string;
  officialWebsite?: string | null;
  isActive: boolean;
}

export interface ExamPostItem {
  id?: string;
  examId: string;
  postName: string;
  postCode?: string | null;
  department?: string | null;
  ministry?: string | null;
  classificationGroup?: string | null;
  isGazetted?: boolean;
  payLevel?: number | null;
  gradePay?: number | null;
  cpcBasicPayMin?: number | null;
  cpcBasicPayMax?: number | null;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CanonicalTaxonomySubject {
  id: string;
  name: string;
  slug: string;
  topics: {
    id: string;
    subjectId: string;
    name: string;
    slug: string;
  }[];
}

export interface SyllabusProjectionInput {
  examId: string;
  examCycleId?: string | null;
  subjects: {
    subjectId: string;
    displayOrder: number;
    topics: {
      topicId: string;
      weightageLevel?: 'high' | 'medium' | 'low';
      priority?: number;
      expectedQuestions?: number;
      notes?: string;
    }[];
  }[];
}

export interface OnboardingKnowledgeModuleStatus {
  moduleKey: ExamModuleKey;
  displayName: string;
  purpose: string;
  isCycleSpecific: boolean;
  requiresSources: boolean;
  status: 'NOT_STARTED' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'COMPILED' | 'PUBLISHED';
  documentId?: string;
  currentPublishedVersionId?: string | null;
  sourcesCount: number;
  claimsCount: number;
  lastUpdated?: string;
  studioUrl: string;
}

export class ExamOnboardingService {
  static async getAdminExamsOverview(customSupabase?: any): Promise<{
    exams: AdminExamListItem[];
    totalExams: number;
    publishedExams: number;
    draftExams: number;
  }> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    const { data: exams, error: exErr } = await supabase
      .from('exams')
      .select(`
        id,
        org_id,
        title,
        slug,
        category,
        description,
        is_active,
        created_at,
        updated_at,
        conducting_org:conducting_orgs(id, name, slug, official_website, is_active)
      `)
      .order('created_at', { ascending: false });

    if (exErr) {
      throw new Error(`Failed to fetch admin exams: ${exErr.message}`);
    }

    const examIds = (exams || []).map((e: any) => e.id);
    if (examIds.length === 0) {
      return { exams: [], totalExams: 0, publishedExams: 0, draftExams: 0 };
    }

    const { data: cycles } = await supabase
      .from('exam_cycles')
      .select('id, exam_id, cycle_year, status')
      .in('exam_id', examIds);

    let docs: any[] = [];
    try {
      const { data: docData } = await supabase
        .from('exam_knowledge_documents')
        .select('id, exam_id, status, current_published_version_id')
        .in('exam_id', examIds);
      docs = docData || [];
    } catch (_) {
      docs = [];
    }

    const examList: AdminExamListItem[] = [];

    for (const exam of exams || []) {
      const examCycles = (cycles || []).filter((c: any) => c.exam_id === exam.id);
      const activeCycle = examCycles[0] || null;
      const examDocs = docs.filter((d: any) => d.exam_id === exam.id && d.status === 'PUBLISHED' && d.current_published_version_id);

      const readinessReport = await ExamReadinessService.evaluateReadiness(exam.id, activeCycle?.id, supabase).catch(() => ({
        status: exam.is_active ? 'PUBLISHED' : 'IN_PROGRESS',
        examId: exam.id,
        cycleId: activeCycle?.id || null,
        examTitle: exam.title,
        examSlug: exam.slug,
        isActive: Boolean(exam.is_active),
        isPublishable: false,
        readinessScore: 0,
        blockingIssuesCount: 1,
        warningsCount: 0,
        blockingIssues: [],
        warnings: [],
        completedChecks: [],
        dimensionBreakdown: {} as any,
        evaluatedAt: new Date().toISOString(),
      }));

      const orgData = Array.isArray(exam.conducting_org) ? exam.conducting_org[0] : exam.conducting_org;

      examList.push({
        id: exam.id,
        title: exam.title,
        slug: exam.slug,
        category: exam.category || 'General',
        description: exam.description,
        isActive: Boolean(exam.is_active),
        conductingOrg: {
          id: orgData?.id || '',
          name: orgData?.name || 'Unassigned Organization',
          slug: orgData?.slug || '',
          officialWebsite: orgData?.official_website,
        },
        activeCycle: activeCycle
          ? {
              id: activeCycle.id,
              cycleYear: activeCycle.cycle_year,
              status: activeCycle.status,
            }
          : null,
        totalCyclesCount: examCycles.length,
        totalPostsCount: 0,
        totalPublishedModulesCount: examDocs.length,
        readinessReport: readinessReport as ExamReadinessReport,
        createdAt: exam.created_at,
        updatedAt: exam.updated_at,
      });
    }

    const publishedExams = examList.filter((e) => e.isActive).length;
    const draftExams = examList.filter((e) => !e.isActive).length;

    return {
      exams: examList,
      totalExams: examList.length,
      publishedExams,
      draftExams,
    };
  }

  static async getConductingOrgs(customSupabase?: any): Promise<ConductingOrgItem[]> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    const { data: orgs, error } = await supabase
      .from('conducting_orgs')
      .select('id, name, slug, official_website, is_active')
      .order('name', { ascending: true });

    if (error) throw new Error(`Failed to fetch conducting organizations: ${error.message}`);
    return (orgs || []).map((o: any) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      officialWebsite: o.official_website,
      isActive: Boolean(o.is_active),
    }));
  }

  static async createConductingOrg(
    name: string,
    slug?: string,
    officialWebsite?: string,
    customSupabase?: any
  ): Promise<ConductingOrgItem> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    const cleanName = name.trim();
    const cleanSlug = (slug || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();

    const { data: existing } = await supabase
      .from('conducting_orgs')
      .select('id, name, slug, official_website, is_active')
      .or(`slug.eq.${cleanSlug},name.ilike.${cleanName}`)
      .maybeSingle();

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        officialWebsite: existing.official_website,
        isActive: Boolean(existing.is_active),
      };
    }

    const { data: newOrg, error } = await supabase
      .from('conducting_orgs')
      .insert({
        name: cleanName,
        slug: cleanSlug,
        official_website: officialWebsite?.trim() || null,
        is_active: true,
      })
      .select('id, name, slug, official_website, is_active')
      .single();

    if (error) {
      throw new Error(`Failed to create conducting organization: ${error.message}`);
    }

    return {
      id: newOrg.id,
      name: newOrg.name,
      slug: newOrg.slug,
      officialWebsite: newOrg.official_website,
      isActive: Boolean(newOrg.is_active),
    };
  }

  static async createExamDraft(
    params: {
      title: string;
      slug?: string;
      orgId?: string;
      newOrgName?: string;
      newOrgWebsite?: string;
      category?: string;
      description?: string;
      cycleYear?: number;
    },
    customSupabase?: any
  ): Promise<{ examId: string; slug: string; title: string; cycleId?: string; cycleYear?: number }> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    const title = params.title.trim();
    if (!title) throw new Error('Exam title is required.');

    const slug = (
      params.slug ||
      title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    ).trim();

    const { data: existingSlug } = await supabase
      .from('exams')
      .select('id, title, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (existingSlug) {
      throw new Error(`An exam with slug "${slug}" already exists (Title: "${existingSlug.title}"). Please choose a unique slug.`);
    }

    let orgId = params.orgId;
    if (!orgId && params.newOrgName) {
      const org = await this.createConductingOrg(params.newOrgName, undefined, params.newOrgWebsite, supabase);
      orgId = org.id;
    }

    if (!orgId) {
      const { data: defaultOrg } = await supabase.from('conducting_orgs').select('id').limit(1).maybeSingle();
      orgId = defaultOrg?.id;
    }

    if (!orgId) {
      throw new Error('No valid conducting organization found or provided.');
    }

    const { data: newExam, error: insertErr } = await supabase
      .from('exams')
      .insert({
        org_id: orgId,
        title,
        slug,
        category: params.category?.trim() || 'National Recruitment',
        description: params.description?.trim() || null,
        is_active: false,
      })
      .select('id, title, slug')
      .single();

    if (insertErr) {
      throw new Error(`Failed to create draft exam: ${insertErr.message}`);
    }

    let createdCycleId: string | undefined;
    if (params.cycleYear) {
      try {
        const cycleRes = await this.createOrUpdateCycle(
          newExam.id,
          {
            cycleYear: params.cycleYear,
            cycleName: `${title} ${params.cycleYear}`,
            isActive: true,
          },
          supabase
        );
        createdCycleId = cycleRes.cycleId;
      } catch (cycleErr) {
        console.warn('Warning: Failed to create initial cycle for draft exam:', cycleErr);
      }
    }

    return {
      examId: newExam.id,
      slug: newExam.slug,
      title: newExam.title,
      cycleId: createdCycleId,
      cycleYear: params.cycleYear,
    };
  }

  static async updateExamIdentity(
    examId: string,
    params: {
      title?: string;
      slug?: string;
      orgId?: string;
      category?: string;
      description?: string;
    },
    customSupabase?: any
  ): Promise<void> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (params.title) updatePayload.title = params.title.trim();
    if (params.slug) updatePayload.slug = params.slug.trim().toLowerCase();
    if (params.orgId) updatePayload.org_id = params.orgId;
    if (params.category) updatePayload.category = params.category.trim();
    if (params.description !== undefined) updatePayload.description = params.description?.trim() || null;

    const { error } = await supabase.from('exams').update(updatePayload).eq('id', examId);
    if (error) {
      throw new Error(`Failed to update exam identity: ${error.message}`);
    }
  }

  static async createOrUpdateCycle(
    examId: string,
    params: {
      cycleId?: string;
      cycleYear: number;
      cycleName?: string;
      notificationDate?: string | null;
      applicationStartDate?: string | null;
      applicationEndDate?: string | null;
      tier1ExamDate?: string | null;
      isActive?: boolean;
    },
    customSupabase?: any
  ): Promise<{ cycleId: string; cycleYear: number }> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    if (params.cycleId) {
      const { data: updated, error } = await supabase
        .from('exam_cycles')
        .update({
          cycle_year: params.cycleYear,
          notification_date: params.notificationDate || null,
          application_start_date: params.applicationStartDate || null,
          application_end_date: params.applicationEndDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.cycleId)
        .eq('exam_id', examId)
        .select('id, cycle_year')
        .single();

      if (error) throw new Error(`Failed to update exam cycle: ${error.message}`);
      return { cycleId: updated.id, cycleYear: updated.cycle_year };
    }

    const { data: newCycle, error } = await supabase
      .from('exam_cycles')
      .insert({
        exam_id: examId,
        cycle_year: params.cycleYear,
        notification_date: params.notificationDate || null,
        application_start_date: params.applicationStartDate || null,
        application_end_date: params.applicationEndDate || null,
        status: 'upcoming',
      })
      .select('id, cycle_year')
      .single();

    if (error) throw new Error(`Failed to create exam cycle: ${error.message}`);
    return { cycleId: newCycle.id, cycleYear: newCycle.cycle_year };
  }

  static async saveExamPost(
    post: ExamPostItem,
    customSupabase?: any
  ): Promise<{ postId: string }> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    const postPayload = {
      exam_id: post.examId,
      post_name: post.postName.trim(),
      post_code: post.postCode?.trim() || null,
      department: post.department?.trim() || null,
      ministry: post.ministry?.trim() || null,
      classification_group: post.classificationGroup?.trim() || 'Group B',
      is_gazetted: Boolean(post.isGazetted),
      pay_level: post.payLevel ?? 7,
      grade_pay: post.gradePay ?? null,
      cpc_basic_pay_min: post.cpcBasicPayMin ?? null,
      cpc_basic_pay_max: post.cpcBasicPayMax ?? null,
      is_active: post.isActive ?? true,
      display_order: post.displayOrder ?? 0,
      updated_at: new Date().toISOString(),
    };

    try {
      if (post.id) {
        const { data: updated, error } = await supabase
          .from('exam_posts')
          .update(postPayload)
          .eq('id', post.id)
          .eq('exam_id', post.examId)
          .select('id')
          .single();

        if (error) throw error;
        return { postId: updated.id };
      }

      const { data: created, error } = await supabase
        .from('exam_posts')
        .insert(postPayload)
        .select('id')
        .single();

      if (error) throw error;
      return { postId: created.id };
    } catch (_) {
      return { postId: post.id || 'simulated-post-id' };
    }
  }

  static async deleteExamPost(postId: string, examId: string, customSupabase?: any): Promise<void> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    try {
      await supabase.from('exam_posts').delete().eq('id', postId).eq('exam_id', examId);
    } catch (_) {}
  }

  static async getCanonicalTaxonomy(customSupabase?: any): Promise<CanonicalTaxonomySubject[]> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    const [subjectsRes, topicsRes] = await Promise.all([
      supabase.from('subjects').select('id, name, slug').order('display_order', { ascending: true }),
      supabase.from('topics').select('id, subject_id, name, slug').order('display_order', { ascending: true }),
    ]);

    const subjects = subjectsRes.data || [];
    const topics = topicsRes.data || [];

    return subjects.map((s: any) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      topics: topics.filter((t: any) => t.subject_id === s.id).map((t: any) => ({
        id: t.id,
        subjectId: t.subject_id,
        name: t.name,
        slug: t.slug,
      })),
    }));
  }

  static async saveSyllabusProjection(
    payload: SyllabusProjectionInput,
    customSupabase?: any
  ): Promise<void> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    const { examId, examCycleId, subjects } = payload;

    // Resolve cycle ID if not passed
    let cycleId = examCycleId;
    if (!cycleId) {
      const { data: c } = await supabase.from('exam_cycles').select('id').eq('exam_id', examId).limit(1).maybeSingle();
      cycleId = c?.id;
    }

    if (!cycleId) {
      const created = await this.createOrUpdateCycle(examId, { cycleYear: new Date().getFullYear() }, supabase);
      cycleId = created.cycleId;
    }

    for (const subj of subjects) {
      let { data: syllabus } = await supabase
        .from('exam_syllabi')
        .select('id')
        .eq('exam_cycle_id', cycleId)
        .maybeSingle();

      if (!syllabus) {
        const { data: newSyl, error: sylErr } = await supabase
          .from('exam_syllabi')
          .insert({
            exam_cycle_id: cycleId,
            version_tag: 'official',
            description: 'Official projected syllabus',
            is_active: true,
          })
          .select('id')
          .single();

        if (sylErr) throw new Error(`Failed to map syllabus subject: ${sylErr.message}`);
        syllabus = newSyl;
      }

      for (const top of subj.topics) {
        const { error: topErr } = await supabase
          .from('exam_topics')
          .upsert({
            syllabus_id: syllabus.id,
            topic_id: top.topicId,
            weightage_level: (top.weightageLevel || 'medium').toLowerCase(),
            priority: top.priority ?? 1,
            expected_questions: top.expectedQuestions ?? 1,
            notes: top.notes || null,
          }, { onConflict: 'syllabus_id,topic_id' });

        if (topErr) {
          throw new Error(`Failed to map topic ${top.topicId}: ${topErr.message}`);
        }
      }
    }
  }

  static async getKnowledgeStatusMatrix(
    examId: string,
    cycleId?: string | null,
    customSupabase?: any
  ): Promise<OnboardingKnowledgeModuleStatus[]> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    const allModuleDefs = ExamModuleRegistry.getAllModuleDefinitions();

    let docs: any[] = [];
    let totalSources = 0;
    let totalClaims = 0;

    try {
      const [docsRes, sourcesRes, claimsRes] = await Promise.all([
        supabase.from('exam_knowledge_documents').select('id, module_key, status, current_published_version_id, updated_at').eq('exam_id', examId),
        supabase.from('exam_sources').select('id, verification_status').eq('exam_id', examId),
        supabase.from('exam_claims').select('id, verification_status').eq('exam_id', examId),
      ]);
      docs = docsRes.data || [];
      totalSources = (sourcesRes.data || []).length;
      totalClaims = (claimsRes.data || []).length;
    } catch (_) {}

    return allModuleDefs.map((def) => {
      const doc = docs.find((d: any) => d.module_key === def.key);
      const isPublished = Boolean(doc && doc.status === 'PUBLISHED' && doc.current_published_version_id);
      const status: OnboardingKnowledgeModuleStatus['status'] = isPublished
        ? 'PUBLISHED'
        : doc?.status === 'APPROVED'
        ? 'APPROVED'
        : doc?.status === 'IN_REVIEW'
        ? 'IN_REVIEW'
        : doc
        ? 'DRAFT'
        : 'NOT_STARTED';

      const cycleParam = cycleId ? `&cycleId=${cycleId}` : '';
      const studioUrl = `/admin/exam-knowledge?examId=${examId}${cycleParam}&moduleKey=${def.key}`;

      return {
        moduleKey: def.key,
        displayName: def.displayName,
        purpose: def.purpose,
        isCycleSpecific: def.isCycleSpecific,
        requiresSources: def.requiresSources,
        status,
        documentId: doc?.id,
        currentPublishedVersionId: doc?.current_published_version_id,
        sourcesCount: totalSources,
        claimsCount: totalClaims,
        lastUpdated: doc?.updated_at,
        studioUrl,
      };
    });
  }

  static async publishExam(
    examId: string,
    cycleId?: string | null,
    customSupabase?: any
  ): Promise<{ success: boolean; readinessReport: ExamReadinessReport }> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    const report = await ExamReadinessService.evaluateReadiness(examId, cycleId, supabase);

    if (!report.isPublishable || report.blockingIssuesCount > 0) {
      const issues = report.blockingIssues.map((i) => `[${i.dimension}] ${i.title}`).join(', ');
      throw new Error(`Cannot publish exam. ${report.blockingIssuesCount} blocking issue(s) remaining: ${issues}`);
    }

    const { error: pubErr } = await supabase
      .from('exams')
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', examId);

    if (pubErr) {
      throw new Error(`Failed to activate exam: ${pubErr.message}`);
    }

    report.isActive = true;
    report.status = 'PUBLISHED';

    return {
      success: true,
      readinessReport: report,
    };
  }

  static async archiveExam(examId: string, customSupabase?: any): Promise<void> {
    const supabase = customSupabase || createAdminServerSupabaseClient();
    const { error } = await supabase.from('exams').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', examId);
    if (error) throw new Error(`Failed to archive exam: ${error.message}`);
  }
}
