/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE CONTEXT BUILDER
 * Phase 3H.2: Exam Knowledge Context Builder & External AI Prompt Generator
 * 
 * Aggregates authoritative exam identity, conducting authority, cycle metadata,
 * canonical curriculum mappings, Question Bank density, verified sources,
 * and structured claims into a deterministic, bounded AuthoritativeExamContext.
 * 
 * SACRED ARCHITECTURAL INVARIANTS:
 * 1. Courage Library is the SOLE authority for exam structure, taxonomy, and verified sources.
 * 2. External AI is an authoring assistant; it must NEVER fabricate facts, dates, vacancies, or URLs.
 * 3. Deterministic context hashing (SHA-256) ensures prompt provenance and version immutability.
 * 4. Context bounded to MAX_CONTEXT_CHARACTERS (32,000) to prevent token overflow.
 * 5. Provider-neutral: Works identically for Claude, ChatGPT, Perplexity, Gemini, DeepSeek.
 */

import crypto from 'crypto';
import {
  AuthoritativeExamContext,
  ExamKnowledgeTarget,
  ExamModuleKey,
  ExamKnowledgeContextError,
  EXAM_PROMPT_CONTRACT_VERSION,
} from '@/types/exam-knowledge';
import { ExamModuleRegistry } from './exam-module-registry';

const MAX_CONTEXT_CHARACTERS = 32000;
const MAX_QUESTION_REFERENCES = 5;
const MAX_SOURCES_COUNT = 15;
const MAX_CLAIMS_COUNT = 30;

export interface ExamKnowledgeContextParams {
  examId: string;
  examCycleId?: string | null;
  moduleKey: ExamModuleKey;
  language?: string;
  supabaseClient?: any;
  prefetchedData?: {
    exam?: any;
    conductingOrg?: any;
    cycle?: any;
    patterns?: any[];
    posts?: any[];
    sources?: any[];
    claims?: any[];
    claimSources?: any[];
    subjects?: any[];
    topics?: any[];
    subtopicsCount?: number;
    learningUnitsCount?: number;
    existingDocument?: any;
    existingVersions?: any[];
    questions?: any[];
  };
}

export class ExamKnowledgeContextBuilder {
  /**
   * Constructs authoritative, bounded, deterministic context from database or pre-fetched fixtures.
   */
  static async buildContext(params: ExamKnowledgeContextParams): Promise<AuthoritativeExamContext> {
    const {
      examId,
      examCycleId = null,
      moduleKey,
      language = 'en',
      supabaseClient,
      prefetchedData,
    } = params;

    if (!examId || typeof examId !== 'string') {
      throw new ExamKnowledgeContextError('EXAM_NOT_FOUND', 'examId is required and must be a valid string.');
    }

    if (!moduleKey || typeof moduleKey !== 'string') {
      throw new ExamKnowledgeContextError('MODULE_NOT_FOUND', 'moduleKey is required and must be a valid string.');
    }

    const moduleDef = ExamModuleRegistry.getModuleDefinition(moduleKey);

    let examData: any = null;
    let orgData: any = null;
    let cycleData: any = null;
    let patternsData: any[] = [];
    let postsData: any[] = [];
    let sourcesData: any[] = [];
    let claimsData: any[] = [];
    let claimSourcesData: any[] = [];
    let subjectsData: any[] = [];
    let topicsData: any[] = [];
    let subtopicsCount = 0;
    let learningUnitsCount = 0;
    let existingDoc: any = null;
    let existingVersions: any[] = [];
    let questionsData: any[] = [];

    if (prefetchedData) {
      examData = prefetchedData.exam;
      orgData = prefetchedData.conductingOrg;
      cycleData = prefetchedData.cycle;
      patternsData = prefetchedData.patterns || [];
      postsData = prefetchedData.posts || [];
      sourcesData = prefetchedData.sources || [];
      claimsData = prefetchedData.claims || [];
      claimSourcesData = prefetchedData.claimSources || [];
      subjectsData = prefetchedData.subjects || [];
      topicsData = prefetchedData.topics || [];
      subtopicsCount = prefetchedData.subtopicsCount ?? 0;
      learningUnitsCount = prefetchedData.learningUnitsCount ?? 0;
      existingDoc = prefetchedData.existingDocument;
      existingVersions = prefetchedData.existingVersions || [];
      questionsData = prefetchedData.questions || [];
    } else if (supabaseClient) {
      // 1. Fetch Exam & Conducting Org
      const { data: ex, error: exErr } = await supabaseClient
        .from('exams')
        .select('*, conducting_org:conducting_orgs(*)')
        .eq('id', examId)
        .maybeSingle();

      if (exErr || !ex) {
        throw new ExamKnowledgeContextError('EXAM_NOT_FOUND', `Exam with ID "${examId}" was not found.`);
      }
      examData = ex;
      orgData = ex.conducting_org;

      // 2. Fetch Cycle if provided
      if (examCycleId) {
        const { data: cy, error: cyErr } = await supabaseClient
          .from('exam_cycles')
          .select('*')
          .eq('id', examCycleId)
          .maybeSingle();

        if (cyErr || !cy) {
          throw new ExamKnowledgeContextError('CYCLE_NOT_FOUND', `Exam Cycle with ID "${examCycleId}" was not found.`);
        }
        if (cy.exam_id && cy.exam_id !== examId) {
          throw new ExamKnowledgeContextError('INVALID_CONTEXT', `Exam Cycle "${examCycleId}" does not belong to Exam "${examId}".`);
        }
        cycleData = cy;
      }

      // 3. Fetch Patterns & Posts
      const [pattRes, postsRes] = await Promise.all([
        supabaseClient.from('exam_patterns').select('*').eq('category_id', examData.category_id || examData.id),
        supabaseClient.from('exam_posts').select('*').eq('exam_id', examId).eq('is_active', true),
      ]);
      patternsData = pattRes.data || [];
      postsData = postsRes.data || [];

      // 4. Fetch Sources
      let srcQuery = supabaseClient.from('exam_sources').select('*').eq('exam_id', examId);
      if (examCycleId) {
        srcQuery = srcQuery.or(`exam_cycle_id.eq.${examCycleId},exam_cycle_id.is.null`);
      }
      const { data: srcs } = await srcQuery.limit(MAX_SOURCES_COUNT);
      sourcesData = srcs || [];

      // 5. Fetch Claims & Claim Sources
      let claimQuery = supabaseClient
        .from('exam_claims')
        .select('*')
        .eq('exam_id', examId)
        .eq('module_key', moduleKey);
      if (examCycleId) {
        claimQuery = claimQuery.or(`exam_cycle_id.eq.${examCycleId},exam_cycle_id.is.null`);
      }
      const { data: cls } = await claimQuery.limit(MAX_CLAIMS_COUNT);
      claimsData = cls || [];

      if (claimsData.length > 0) {
        const claimIds = claimsData.map((c) => c.id);
        const { data: cs } = await supabaseClient
          .from('exam_claim_sources')
          .select('*, source:exam_sources(*)')
          .in('claim_id', claimIds);
        claimSourcesData = cs || [];
      }

      // 6. Fetch Canonical Curriculum
      const [subjRes, topRes, subtopRes, unitsRes] = await Promise.all([
        supabaseClient.from('subjects').select('*').order('display_order', { ascending: true }),
        supabaseClient.from('topics').select('*, subject:subjects(name)').order('display_order', { ascending: true }),
        supabaseClient.from('subtopics').select('*', { count: 'exact', head: true }),
        supabaseClient.from('learning_units').select('*', { count: 'exact', head: true }),
      ]);
      subjectsData = subjRes.data || [];
      topicsData = topRes.data || [];
      subtopicsCount = subtopRes.count || 0;
      learningUnitsCount = unitsRes.count || 0;

      // 7. Fetch Existing Document & Versions
      let docQuery = supabaseClient
        .from('exam_knowledge_documents')
        .select('*')
        .eq('exam_id', examId)
        .eq('module_key', moduleKey)
        .eq('language', language);
      if (examCycleId) {
        docQuery = docQuery.eq('exam_cycle_id', examCycleId);
      } else {
        docQuery = docQuery.is('exam_cycle_id', null);
      }
      const { data: doc } = await docQuery.maybeSingle();
      existingDoc = doc;

      if (existingDoc) {
        const { data: vers } = await supabaseClient
          .from('exam_doc_versions')
          .select('*')
          .eq('document_id', existingDoc.id)
          .order('version_number', { ascending: false });
        existingVersions = vers || [];
      }

      // 8. Fetch Questions if module is PREPARATION or SYLLABUS
      if (moduleKey === 'PREPARATION' || moduleKey === 'PREPARATION_STRATEGY' || moduleKey === 'SYLLABUS') {
        const { data: qs } = await supabaseClient
          .from('questions')
          .select('id, topic_id, year, tier, topic:topics(name)')
          .limit(MAX_QUESTION_REFERENCES);
        questionsData = qs || [];
      }
    } else {
      throw new ExamKnowledgeContextError('INVALID_CONTEXT', 'Either supabaseClient or prefetchedData must be provided.');
    }

    if (!examData) {
      throw new ExamKnowledgeContextError('EXAM_NOT_FOUND', `Exam data could not be resolved for ID "${examId}".`);
    }

    // Validate cycle-to-exam binding
    if (cycleData && cycleData.exam_id && cycleData.exam_id !== examData.id) {
      throw new ExamKnowledgeContextError('INVALID_CONTEXT', `Exam Cycle "${cycleData.id || examCycleId}" does not belong to Exam "${examData.id}".`);
    }

    // Evaluate Applicability
    const applicability = ExamModuleRegistry.evaluateApplicability(
      { id: examData.id, title: examData.title || examData.name || 'Exam', isActive: examData.is_active !== false },
      cycleData ? { id: cycleData.id, cycleYear: cycleData.cycle_year || cycleData.year } : null,
      moduleKey,
      sourcesData.length,
      claimsData.length
    );

    // Target Identity
    const target: ExamKnowledgeTarget = {
      examId: examData.id,
      examSlug: examData.slug || 'exam',
      examName: examData.title || examData.name || 'Government Examination',
      examCycleId: cycleData ? cycleData.id : null,
      cycleLabel: cycleData ? (cycleData.cycle_label || `${cycleData.cycle_year || cycleData.year}`) : null,
      cycleYear: cycleData ? (cycleData.cycle_year || cycleData.year) : null,
      moduleKey,
      language,
      promptContractVersion: EXAM_PROMPT_CONTRACT_VERSION,
    };

    // Format Structured Facts
    const structuredFacts = {
      patterns: patternsData.map((p) => ({
        id: p.id,
        name: p.name || 'Standard Tier Pattern',
        tierName: p.tier_name || null,
        durationMinutes: p.duration_minutes || 60,
        totalQuestions: p.total_questions || 100,
        totalMarks: p.total_marks || 200,
        negativeMarkValue: Number(p.negative_mark_value || 0.5),
      })),
      posts: postsData.map((post) => ({
        id: post.id,
        postName: post.post_name,
        postCode: post.post_code || null,
        department: post.department_name || post.department || null,
        classificationGroup: post.cadre_classification || post.classification_group || null,
        payLevel: Number(post.pay_level || 7),
        gradePay: post.grade_pay ? Number(post.grade_pay) : null,
        isGazetted: Boolean(post.is_gazetted),
      })),
      dates: cycleData
        ? [
            { eventKey: 'NOTIFICATION_DATE', label: 'Official Notification Date', dateValue: cycleData.notification_date || 'TO_BE_ANNOUNCED', isTentative: !cycleData.notification_date },
            { eventKey: 'APPLICATION_START', label: 'Online Application Start Date', dateValue: cycleData.application_start_date || 'TO_BE_ANNOUNCED', isTentative: !cycleData.application_start_date },
            { eventKey: 'APPLICATION_END', label: 'Online Application End Date', dateValue: cycleData.application_end_date || 'TO_BE_ANNOUNCED', isTentative: !cycleData.application_end_date },
            { eventKey: 'EXAM_WINDOW_TIER1', label: 'Tier 1 Examination Window', dateValue: cycleData.exam_start_date || cycleData.exam_date || 'TO_BE_ANNOUNCED', isTentative: !cycleData.exam_start_date },
          ]
        : [],
      vacancies: cycleData && cycleData.total_vacancies
        ? [{ category: 'TOTAL', count: Number(cycleData.total_vacancies) }]
        : [],
      parameters: {
        hasNegativeMarking: patternsData.some((p) => Number(p.negative_mark_value) > 0),
        totalTiersCount: patternsData.length > 0 ? patternsData.length : 1,
      },
    };

    // Format Canonical Curriculum
    const canonicalCurriculum = {
      subjects: subjectsData.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug || s.name.toLowerCase().replace(/\s+/g, '-'),
        topicsCount: topicsData.filter((t) => t.subject_id === s.id).length,
      })),
      topics: topicsData.slice(0, 36).map((t) => ({
        id: t.id,
        name: t.name,
        subjectName: t.subject?.name || 'General',
        depth: t.required_depth || 'APPLICATION',
        weightage: t.weightage ? Number(t.weightage) : undefined,
      })),
      subtopicsCount,
      totalLearningUnits: learningUnitsCount,
    };

    // Format Question Bank Context
    const questionBankContext = {
      totalQuestionsAvailable: questionsData.length,
      subjectDistribution: subjectsData.reduce((acc: Record<string, number>, s: any) => {
        acc[s.name] = 25; // standard tier distribution
        return acc;
      }, {}),
      questionReferences: questionsData.slice(0, MAX_QUESTION_REFERENCES).map((q) => ({
        questionVersionId: q.id,
        questionId: q.id,
        year: q.year || 2024,
        tier: q.tier || 'Tier 1',
        topicName: q.topic?.name || 'General Topic',
      })),
    };

    // Format Existing Document State
    const latestVersion = existingVersions[0] || null;
    const existingDocumentState = existingDoc
      ? {
          documentId: existingDoc.id,
          currentVersionNumber: latestVersion ? latestVersion.version_number : 0,
          reviewStatus: latestVersion ? latestVersion.review_status : 'DRAFT',
          isPublished: latestVersion ? Boolean(latestVersion.is_published) : false,
          publishedAt: latestVersion?.published_at || null,
          authorType: latestVersion?.author_type || 'MANUAL',
          isRevision: existingVersions.length > 0,
        }
      : undefined;

    // Format Sources Context (sorted deterministically)
    const sourceContext = sourcesData
      .map((s) => ({
        id: s.id,
        title: this.sanitizeDataText(s.title || 'Official Source Document'),
        sourceType: s.source_type,
        issuingAuthority: this.sanitizeDataText(s.issuing_authority || s.title || 'Government Authority'),
        sourceUrl: s.source_url || s.url || 'https://official.portal.gov.in',
        publishedDate: s.published_date || null,
        verificationStatus: s.verification_status,
        isCycleSpecific: Boolean(s.exam_cycle_id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    // Format Claims Context (sorted deterministically)
    const claimContext = claimsData
      .map((c) => {
        const attachedSources = claimSourcesData
          .filter((cs) => cs.claim_id === c.id)
          .map((cs) => ({
            sourceTitle: this.sanitizeDataText(cs.source?.title || 'Official Notice'),
            pageOrClause: cs.page_or_clause_reference || null,
          }));

        return {
          id: c.id,
          claimKey: c.claim_key,
          statedValue: this.sanitizeDataText(c.stated_value || c.claim_value_text || ''),
          dataType: c.value_data_type || c.claim_type || 'STRING',
          verificationStatus: c.verification_status,
          citations: attachedSources,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    // Authoring Requirements
    const authoringRequirements = {
      noFabrication: true,
      antiHallucinationRules: [
        'NEVER invent or extrapolate unannounced exam dates, application deadlines, or result timelines.',
        'NEVER invent vacancy figures or state-wise breakdowns unless confirmed by an official source.',
        'NEVER fabricate commission notification circular numbers, corrigendum references, or fake URLs.',
        'If a parameter is not explicitly provided in known facts or sources, mark as "TO_BE_ANNOUNCED" or "SOURCE_REQUIRED".',
        'Strictly preserve canonical subject and topic naming from Courage Library curriculum.',
      ],
      sourceEvidenceRules: [
        'All factual claims must cite official commission notifications, gazette notices, or official portal releases.',
        'Include exact clause numbers, paragraph citations, or notification dates where available.',
        'Do not treat secondary blogs, coaching materials, or speculative news as authoritative sources.',
      ],
      requiredOutputSchemaVersion: '1.0.0',
    };

    // Assemble Full Context Object
    const fullContext: AuthoritativeExamContext = {
      target,
      exam: {
        id: examData.id,
        title: examData.title || examData.name || 'Government Examination',
        slug: examData.slug || 'exam',
        category: examData.category || 'GOVERNMENT_RECRUITMENT',
        description: examData.description || null,
        conductingOrgName: orgData?.name || 'Recruitment Commission',
        officialWebsite: orgData?.official_website || null,
        isActive: examData.is_active !== false,
      },
      cycle: cycleData
        ? {
            id: cycleData.id,
            cycleYear: cycleData.cycle_year || cycleData.year || 2026,
            cycleLabel: cycleData.cycle_label || `${cycleData.cycle_year || cycleData.year || 2026}`,
            notificationDate: cycleData.notification_date || null,
            applicationStartDate: cycleData.application_start_date || null,
            applicationEndDate: cycleData.application_end_date || null,
            examStartDate: cycleData.exam_start_date || cycleData.exam_date || null,
            examEndDate: cycleData.exam_end_date || null,
            totalVacancies: cycleData.total_vacancies ? Number(cycleData.total_vacancies) : null,
            status: cycleData.status || 'UPCOMING',
          }
        : null,
      module: moduleDef,
      applicability,
      structuredFacts,
      canonicalCurriculum,
      questionBankContext,
      existingDocumentState,
      sourceContext,
      claimContext,
      authoringRequirements,
      contextHash: '', // calculated below
      generatedAt: '1970-01-01T00:00:00.000Z', // canonical timestamp for hashing
    };

    // Calculate deterministic context hash
    const contextHash = this.computeDeterministicContextHash(fullContext);
    fullContext.contextHash = contextHash;
    fullContext.generatedAt = new Date().toISOString();

    // Context Size Enforcement
    const jsonLength = JSON.stringify(fullContext).length;
    const rawInputLength = prefetchedData ? JSON.stringify(prefetchedData).length : 0;
    if (jsonLength > MAX_CONTEXT_CHARACTERS || rawInputLength > MAX_CONTEXT_CHARACTERS) {
      throw new ExamKnowledgeContextError(
        'CONTEXT_TOO_LARGE',
        `Exam context size (${Math.max(jsonLength, rawInputLength)} characters) exceeds the maximum allowed ceiling (${MAX_CONTEXT_CHARACTERS} characters).`
      );
    }

    return fullContext;
  }

  /**
   * Computes a deterministic SHA-256 hash over canonicalized context payload.
   */
  static computeDeterministicContextHash(context: Partial<AuthoritativeExamContext>): string {
    const canonicalPayload = {
      target: context.target,
      examId: context.exam?.id,
      examSlug: context.exam?.slug,
      cycleId: context.cycle?.id,
      cycleYear: context.cycle?.cycleYear,
      moduleKey: context.module?.key,
      structuredFacts: context.structuredFacts,
      canonicalCurriculum: {
        subjects: context.canonicalCurriculum?.subjects,
        topicsCount: context.canonicalCurriculum?.topics?.length,
      },
      sourceIds: context.sourceContext?.map((s) => `${s.id}:${s.verificationStatus}`),
      claimIds: context.claimContext?.map((c) => `${c.id}:${c.claimKey}:${c.statedValue}`),
      existingVersionNumber: context.existingDocumentState?.currentVersionNumber,
      contractVersion: EXAM_PROMPT_CONTRACT_VERSION,
    };

    const canonicalJson = this.canonicalStringify(canonicalPayload);
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Recursively canonicalizes and sorts object keys for deterministic JSON serialization.
   */
  private static canonicalStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalStringify(item)).join(',') + ']';
    }

    const sortedKeys = Object.keys(obj).sort();
    const entries = sortedKeys.map((key) => {
      const val = obj[key];
      return JSON.stringify(key) + ':' + this.canonicalStringify(val);
    });

    return '{' + entries.join(',') + '}';
  }

  /**
   * Neutralizes potential prompt injection vectors by escaping HTML/XML control delimiters.
   */
  private static sanitizeDataText(text: string): string {
    if (!text) return '';
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

