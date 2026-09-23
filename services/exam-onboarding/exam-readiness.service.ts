/**
 * COURAGE LIBRARY — EXAM READINESS SERVICE
 * Phase 3J: Unified Multi-Exam Onboarding Studio & Control Plane
 * 
 * Server-authoritative evaluator implementing an extensible 14-dimension readiness model.
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamModuleRegistry } from '@/services/exam-knowledge/exam-module-registry';
import { ExamModuleKey } from '@/types/exam-knowledge';

export type ReadinessDimension =
  | 'IDENTITY'
  | 'ORGANIZATION'
  | 'CYCLE'
  | 'DATES'
  | 'POSTS'
  | 'ELIGIBILITY'
  | 'SYLLABUS'
  | 'SOURCES'
  | 'KNOWLEDGE'
  | 'LEARNING'
  | 'QUESTION_BANK'
  | 'MOCKS'
  | 'SEO'
  | 'CANDIDATE_DELIVERY';

export type ReadinessSeverity = 'BLOCKING' | 'RECOMMENDED';

export interface ReadinessCheckItem {
  id: string;
  dimension: ReadinessDimension;
  severity: ReadinessSeverity;
  title: string;
  description: string;
  isPassed: boolean;
  actionUrl?: string;
  remediationHint?: string;
}

export interface DimensionSummary {
  dimension: ReadinessDimension;
  displayName: string;
  isPassed: boolean;
  hasBlockingIssue: boolean;
  totalChecks: number;
  passedChecks: number;
  checks: ReadinessCheckItem[];
}

export type OnboardingReadinessStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHED'
  | 'BLOCKED';

export interface ExamReadinessReport {
  status: OnboardingReadinessStatus;
  examId: string;
  cycleId?: string | null;
  examTitle: string;
  examSlug: string;
  isActive: boolean;
  isPublishable: boolean;
  readinessScore: number;
  blockingIssuesCount: number;
  warningsCount: number;
  blockingIssues: ReadinessCheckItem[];
  warnings: ReadinessCheckItem[];
  completedChecks: ReadinessCheckItem[];
  dimensionBreakdown: Record<ReadinessDimension, DimensionSummary>;
  evaluatedAt: string;
}

export class ExamReadinessService {
  private static readonly DIMENSION_METADATA: Record<ReadinessDimension, { displayName: string; defaultSeverity: ReadinessSeverity }> = {
    IDENTITY: { displayName: 'Exam Identity & Slug', defaultSeverity: 'BLOCKING' },
    ORGANIZATION: { displayName: 'Conducting Authority', defaultSeverity: 'BLOCKING' },
    CYCLE: { displayName: 'Recruitment Cycle', defaultSeverity: 'BLOCKING' },
    DATES: { displayName: 'Cycle Milestones & Dates', defaultSeverity: 'RECOMMENDED' },
    POSTS: { displayName: 'Recruitment Posts & Cadres', defaultSeverity: 'RECOMMENDED' },
    ELIGIBILITY: { displayName: 'Eligibility & Qualifications', defaultSeverity: 'RECOMMENDED' },
    SYLLABUS: { displayName: 'Canonical Syllabus Projection', defaultSeverity: 'BLOCKING' },
    SOURCES: { displayName: 'Verified Official Sources', defaultSeverity: 'BLOCKING' },
    KNOWLEDGE: { displayName: 'Core Knowledge Modules', defaultSeverity: 'BLOCKING' },
    LEARNING: { displayName: 'Curriculum & Learning Units', defaultSeverity: 'RECOMMENDED' },
    QUESTION_BANK: { displayName: 'Question Bank Practice Coverage', defaultSeverity: 'RECOMMENDED' },
    MOCKS: { displayName: 'Mock Test Blueprints', defaultSeverity: 'RECOMMENDED' },
    SEO: { displayName: 'Candidate SEO & Route Metadata', defaultSeverity: 'BLOCKING' },
    CANDIDATE_DELIVERY: { displayName: 'Candidate Read Model Delivery', defaultSeverity: 'BLOCKING' },
  };

  private static readonly CORE_BLOCKING_MODULES: ExamModuleKey[] = [
    'EXAM_OVERVIEW',
    'ELIGIBILITY',
    'SELECTION_PROCESS',
    'EXAM_PATTERN',
  ];

  static async evaluateReadiness(
    examId: string,
    cycleId?: string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customSupabase?: any
  ): Promise<ExamReadinessReport> {
    const supabase = customSupabase || createAdminServerSupabaseClient();

    // 1. Fetch Exam record
    const { data: exam, error: examErr } = await supabase
      .from('exams')
      .select('id, org_id, title, slug, category, description, is_active, created_at, updated_at')
      .eq('id', examId)
      .maybeSingle();

    if (examErr || !exam) {
      throw new Error(`Exam with ID "${examId}" not found or database query failed: ${examErr?.message || 'Not found'}`);
    }

    // 2. Fetch Conducting Org
    const { data: org } = await supabase
      .from('conducting_orgs')
      .select('id, name, slug, official_website, is_active')
      .eq('id', exam.org_id)
      .maybeSingle();

    // 3. Fetch Exam Cycles
    const { data: cycles } = await supabase
      .from('exam_cycles')
      .select('id, exam_id, cycle_year, status, notification_date, application_start_date, application_end_date')
      .eq('exam_id', examId)
      .order('cycle_year', { ascending: false });

    const activeCycle = cycleId
      ? cycles?.find((c: any) => c.id === cycleId) || cycles?.[0]
      : cycles?.[0] || null;

    const resolvedCycleId = activeCycle?.id || null;

    // 4. Fetch Posts (gracefully handle if schema cache not present)
    let posts: any[] = [];
    try {
      const { data: postData } = await supabase
        .from('exam_posts')
        .select('*')
        .eq('exam_id', examId);
      posts = postData || [];
    } catch (_) {
      posts = [];
    }

    // 5. Fetch Syllabus and Topics
    let syllabi: any[] = [];
    let examTopics: any[] = [];
    if (resolvedCycleId) {
      const { data: sylData } = await supabase
        .from('exam_syllabi')
        .select('id, exam_cycle_id, is_active')
        .eq('exam_cycle_id', resolvedCycleId);
      syllabi = sylData || [];

      const sylIds = syllabi.map((s: any) => s.id);
      if (sylIds.length > 0) {
        const { data: topData } = await supabase
          .from('exam_topics')
          .select('id, syllabus_id, topic_id, weightage_level')
          .in('syllabus_id', sylIds);
        examTopics = topData || [];
      }
    }

    // 6. Fetch Sources
    let sources: any[] = [];
    try {
      const { data: srcData } = await supabase
        .from('exam_sources')
        .select('id, source_type, title, verification_status')
        .eq('exam_id', examId);
      sources = srcData || [];
    } catch (_) {
      sources = [];
    }

    // 7. Fetch Knowledge Documents
    let docs: any[] = [];
    try {
      const { data: docData } = await supabase
        .from('exam_knowledge_documents')
        .select('id, module_key, status, current_published_version_id')
        .eq('exam_id', examId);
      docs = docData || [];
    } catch (_) {
      docs = [];
    }

    // 8. Fetch Learning Unit Mappings
    let unitMappingsCount = 0;
    try {
      const { count } = await supabase
        .from('learning_units')
        .select('*', { count: 'exact', head: true });
      unitMappingsCount = count || 0;
    } catch (_) {
      unitMappingsCount = 0;
    }

    // 9. Fetch Question Mappings
    let questionMappingsCount = 0;
    try {
      const { count } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });
      questionMappingsCount = count || 0;
    } catch (_) {
      questionMappingsCount = 0;
    }

    // 10. Fetch Mock Templates
    let mockTemplates: any[] = [];
    try {
      const { data: mtData } = await supabase
        .from('mock_templates')
        .select('id, is_active')
        .eq('exam_id', examId);
      mockTemplates = mtData || [];
    } catch (_) {
      mockTemplates = [];
    }

    // =========================================================================
    // EXECUTE 14 READINESS CHECKS
    // =========================================================================
    const checks: ReadinessCheckItem[] = [];

    // 1. IDENTITY
    const isSlugValid = typeof exam.slug === 'string' && /^[a-z0-9-]+$/.test(exam.slug) && exam.slug.length >= 2;
    checks.push({
      id: 'CHK_ID_EXAM_EXISTS',
      dimension: 'IDENTITY',
      severity: 'BLOCKING',
      title: 'Exam Record Identity',
      description: 'Exam must possess an authoritative non-empty title and valid ID.',
      isPassed: Boolean(exam.title && exam.title.trim().length > 0),
      remediationHint: 'Provide a valid exam title in Step 1 (Exam Identity).',
    });
    checks.push({
      id: 'CHK_ID_SLUG_VALID',
      dimension: 'IDENTITY',
      severity: 'BLOCKING',
      title: 'Canonical URL Slug',
      description: 'Exam slug must be clean, lowercase, alphanumeric, and URL-safe.',
      isPassed: isSlugValid,
      remediationHint: 'Normalize slug using lowercase letters, numbers, and hyphens.',
    });
    checks.push({
      id: 'CHK_ID_DESC_EXISTS',
      dimension: 'IDENTITY',
      severity: 'RECOMMENDED',
      title: 'Exam Description',
      description: 'A comprehensive summary description helps candidates understand the exam profile.',
      isPassed: Boolean(exam.description && exam.description.trim().length >= 10),
      remediationHint: 'Add a 1-2 sentence overview description in Step 1.',
    });

    // 2. ORGANIZATION
    checks.push({
      id: 'CHK_ORG_BOUND',
      dimension: 'ORGANIZATION',
      severity: 'BLOCKING',
      title: 'Conducting Authority Linked',
      description: 'Exam must be associated with a valid conducting organization.',
      isPassed: Boolean(org && org.id && org.name),
      remediationHint: 'Select or create a conducting organization in Step 1.',
    });
    checks.push({
      id: 'CHK_ORG_ACTIVE',
      dimension: 'ORGANIZATION',
      severity: 'BLOCKING',
      title: 'Conducting Authority Active',
      description: 'Conducting organization must be in active status.',
      isPassed: Boolean(org && org.is_active),
      remediationHint: 'Activate the conducting authority in the Organization Registry.',
    });

    // 3. CYCLE
    checks.push({
      id: 'CHK_CYC_EXISTS',
      dimension: 'CYCLE',
      severity: 'BLOCKING',
      title: 'Active Recruitment Cycle',
      description: 'At least one recruitment cycle (e.g. 2026 or 2026-27) must be registered.',
      isPassed: Boolean(cycles && cycles.length > 0),
      remediationHint: 'Define an active recruitment cycle in Step 2 (Recruitment Cycles).',
    });

    // 4. DATES
    const hasNotificationDate = Boolean(activeCycle && activeCycle.notification_date);
    const hasApplicationWindow = Boolean(activeCycle && activeCycle.application_start_date && activeCycle.application_end_date);
    checks.push({
      id: 'CHK_DATES_NOTIF',
      dimension: 'DATES',
      severity: 'RECOMMENDED',
      title: 'Notification Release Date',
      description: 'Official notification release date assists candidate countdown and timeline.',
      isPassed: hasNotificationDate,
      remediationHint: 'Configure notification date in Step 2.',
    });
    checks.push({
      id: 'CHK_DATES_APP_WINDOW',
      dimension: 'DATES',
      severity: 'RECOMMENDED',
      title: 'Application Window Timeline',
      description: 'Application start and closing dates inform candidates of registration deadlines.',
      isPassed: hasApplicationWindow,
      remediationHint: 'Configure application start and end dates in Step 2.',
    });

    // 5. POSTS
    const postsCount = (posts || []).length;
    checks.push({
      id: 'CHK_POSTS_CONFIGURED',
      dimension: 'POSTS',
      severity: 'RECOMMENDED',
      title: 'Recruitment Post Profiles',
      description: 'At least one designated post cadre or job profile configured for the exam.',
      isPassed: postsCount > 0,
      remediationHint: 'Add at least 1 recruitment post profile in Step 3.',
    });

    // 6. ELIGIBILITY
    const hasDocEligibility = docs?.some((d: any) => d.module_key === 'ELIGIBILITY' && d.current_published_version_id);
    checks.push({
      id: 'CHK_ELIGIBILITY_DEFINED',
      dimension: 'ELIGIBILITY',
      severity: 'RECOMMENDED',
      title: 'Eligibility Requirements',
      description: 'Candidate age criteria, relaxations, and educational qualifications configured.',
      isPassed: Boolean(hasDocEligibility || postsCount > 0),
      remediationHint: 'Publish the Eligibility Knowledge Module or configure post-wise age criteria.',
    });

    // 7. SYLLABUS
    const syllabusCount = (syllabi || []).length;
    const syllabusTopicsCount = (examTopics || []).length;
    checks.push({
      id: 'CHK_SYL_SUBJECTS_PROJECTED',
      dimension: 'SYLLABUS',
      severity: 'BLOCKING',
      title: 'Canonical Subject Mapping',
      description: 'At least one canonical academic subject mapped to the exam syllabus projection.',
      isPassed: syllabusCount > 0,
      remediationHint: 'Map relevant canonical subjects in Step 4 (Syllabus Projection).',
    });
    checks.push({
      id: 'CHK_SYL_TOPICS_PROJECTED',
      dimension: 'SYLLABUS',
      severity: 'BLOCKING',
      title: 'Canonical Topic Projections & Weightages',
      description: 'At least one canonical topic projected with an explicit weightage tier.',
      isPassed: syllabusTopicsCount > 0,
      remediationHint: 'Select canonical topics and assign weightage tiers in Step 4.',
    });

    // 8. SOURCES
    const verifiedSourcesCount = (sources || []).filter((s: any) => s.verification_status === 'SOURCE_VERIFIED').length;
    const totalSourcesCount = (sources || []).length;
    checks.push({
      id: 'CHK_SRC_REGISTERED',
      dimension: 'SOURCES',
      severity: 'BLOCKING',
      title: 'Official Source Citations',
      description: 'At least one official authority notification or gazette circular citation registered.',
      isPassed: totalSourcesCount > 0,
      remediationHint: 'Register official notification URL in Step 5 (Verified Sources & Knowledge).',
    });
    checks.push({
      id: 'CHK_SRC_VERIFIED',
      dimension: 'SOURCES',
      severity: 'RECOMMENDED',
      title: 'Source Verification Status',
      description: 'Academic sources verified by a human academic reviewer.',
      isPassed: verifiedSourcesCount > 0,
      remediationHint: 'Verify official sources in Exam Knowledge Studio.',
    });

    // 9. KNOWLEDGE
    const publishedDocKeys = new Set(
      (docs || [])
        .filter((d: any) => d.current_published_version_id !== null && d.status === 'PUBLISHED')
        .map((d: any) => d.module_key)
    );

    const missingCoreModules = this.CORE_BLOCKING_MODULES.filter((key) => !publishedDocKeys.has(key));
    checks.push({
      id: 'CHK_KNOW_CORE_PUBLISHED',
      dimension: 'KNOWLEDGE',
      severity: 'BLOCKING',
      title: 'Core Foundational Knowledge Modules',
      description: `Core modules published: ${this.CORE_BLOCKING_MODULES.join(', ')}.`,
      isPassed: missingCoreModules.length === 0,
      remediationHint: missingCoreModules.length > 0
        ? `Publish missing core module(s): ${missingCoreModules.join(', ')} in Exam Knowledge Studio.`
        : undefined,
    });

    const totalRegistryCount = ExamModuleRegistry.getAllModuleDefinitions().length;
    checks.push({
      id: 'CHK_KNOW_COMPREHENSIVE_COVERAGE',
      dimension: 'KNOWLEDGE',
      severity: 'RECOMMENDED',
      title: 'Comprehensive 24-Module Coverage',
      description: `${publishedDocKeys.size} of ${totalRegistryCount} modules compiled and published.`,
      isPassed: publishedDocKeys.size >= 4,
      remediationHint: 'Progressively author and publish remaining modules via Exam Knowledge Studio.',
    });

    // 10. LEARNING
    checks.push({
      id: 'CHK_LRN_UNITS_MAPPED',
      dimension: 'LEARNING',
      severity: 'RECOMMENDED',
      title: 'Canonical Learning Units Mapped',
      description: 'Learning modules and lesson units available in system.',
      isPassed: unitMappingsCount > 0,
      remediationHint: 'Bind learning units to exam topics via Curriculum Coverage view.',
    });

    // 11. QUESTION_BANK
    checks.push({
      id: 'CHK_QB_MAPPINGS_EXIST',
      dimension: 'QUESTION_BANK',
      severity: 'RECOMMENDED',
      title: 'Question Bank Practice Items',
      description: 'Questions and PYQs linked to the exam for candidate practice.',
      isPassed: (questionMappingsCount || 0) > 0,
      remediationHint: 'Map practice questions to this exam in Question Bank.',
    });

    // 12. MOCKS
    checks.push({
      id: 'CHK_MCK_TEMPLATES_CONFIGURED',
      dimension: 'MOCKS',
      severity: 'RECOMMENDED',
      title: 'Mock Test Blueprints',
      description: 'Pattern templates and test generation blueprints configured.',
      isPassed: (mockTemplates || []).length > 0,
      remediationHint: 'Configure mock test patterns in Mock Tests Management.',
    });

    // 13. SEO
    checks.push({
      id: 'CHK_SEO_ROUTES_RESOLVABLE',
      dimension: 'SEO',
      severity: 'BLOCKING',
      title: 'Canonical SEO Route Resolvability',
      description: 'Deterministic URLs /exams/[slug] and /exams/[slug]/[moduleSlug] resolve cleanly.',
      isPassed: Boolean(isSlugValid && exam.title),
      remediationHint: 'Ensure exam title and slug are properly configured.',
    });

    // 14. CANDIDATE_DELIVERY
    checks.push({
      id: 'CHK_CD_DATA_DELIVERY_SAFE',
      dimension: 'CANDIDATE_DELIVERY',
      severity: 'BLOCKING',
      title: 'Candidate Read Model Delivery',
      description: 'Candidate Read Service can safely construct candidate view without null pointer exceptions.',
      isPassed: Boolean(isSlugValid && org && (cycles || []).length > 0),
      remediationHint: 'Ensure identity, conducting organization, and at least 1 cycle are configured.',
    });

    // =========================================================================
    // AGGREGATE RESULTS & COMPUTE SCORE
    // =========================================================================
    const blockingIssues = checks.filter((c) => !c.isPassed && c.severity === 'BLOCKING');
    const warnings = checks.filter((c) => !c.isPassed && c.severity === 'RECOMMENDED');
    const completedChecks = checks.filter((c) => c.isPassed);

    const totalWeight = checks.reduce((acc, c) => acc + (c.severity === 'BLOCKING' ? 2 : 1), 0);
    const passedWeight = completedChecks.reduce((acc, c) => acc + (c.severity === 'BLOCKING' ? 2 : 1), 0);
    const readinessScore = Math.round((passedWeight / totalWeight) * 100);

    const isPublishable = blockingIssues.length === 0;

    let status: OnboardingReadinessStatus = 'IN_PROGRESS';
    if (exam.is_active) {
      status = 'PUBLISHED';
    } else if (blockingIssues.length === 0 && warnings.length === 0) {
      status = 'READY_TO_PUBLISH';
    } else if (blockingIssues.length === 0) {
      status = 'READY_FOR_REVIEW';
    } else if (completedChecks.length <= 2) {
      status = 'NOT_STARTED';
    } else {
      status = 'IN_PROGRESS';
    }

    const dimensionBreakdown: Record<ReadinessDimension, DimensionSummary> = {} as any;
    (Object.keys(this.DIMENSION_METADATA) as ReadinessDimension[]).forEach((dim) => {
      const dimChecks = checks.filter((c) => c.dimension === dim);
      const passed = dimChecks.filter((c) => c.isPassed).length;
      const hasBlocker = dimChecks.some((c) => !c.isPassed && c.severity === 'BLOCKING');
      dimensionBreakdown[dim] = {
        dimension: dim,
        displayName: this.DIMENSION_METADATA[dim].displayName,
        isPassed: dimChecks.length > 0 && passed === dimChecks.length,
        hasBlockingIssue: hasBlocker,
        totalChecks: dimChecks.length,
        passedChecks: passed,
        checks: dimChecks,
      };
    });

    return {
      status,
      examId,
      cycleId: resolvedCycleId,
      examTitle: exam.title,
      examSlug: exam.slug,
      isActive: Boolean(exam.is_active),
      isPublishable,
      readinessScore,
      blockingIssuesCount: blockingIssues.length,
      warningsCount: warnings.length,
      blockingIssues,
      warnings,
      completedChecks,
      dimensionBreakdown,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
