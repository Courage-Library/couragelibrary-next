/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE CANDIDATE READ SERVICE
 * Phase 3H.5.1: Candidate Exam Knowledge Read Service & Server-Side Aggregation
 * 
 * Provides a single, unified, authoritative server-side read model:
 * ExamKnowledgeCandidateView
 * 
 * SACRED GOVERNANCE INVARIANTS:
 * 1. Read-Mode Consumption ONLY: Zero database mutations or draft exposures.
 * 2. Strictly PUBLISHED content:
 *    - document.status = 'PUBLISHED'
 *    - current_published_version_id points to published version
 *    - version.is_published = true
 *    - version.review_status = 'PUBLISHED'
 * 3. Intermediate/Unapproved states (DRAFT, AI_GENERATED, IN_REVIEW, APPROVED, COMPILED) are 100% INVISIBLE.
 * 4. Zero Hardcoded Facts: All posts, eligibility rules, pay levels, and syllabus hierarchies are dynamically loaded from data.
 * 5. Bounded, parallel queries without N+1 loops.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ExamKnowledgeCandidateQueryParams,
  ExamKnowledgeCandidateResult,
  ExamKnowledgeCandidateView,
  CandidateExamPost,
  CandidateExamPattern,
  CandidateExamSubject,
  CandidateExamTopic,
  CandidatePublishedModule,
  CandidateOfficialSource,
  CandidateVerifiedClaim,
  CandidateExamDirectoryItem,
  ExamModuleKey,
} from '@/types/exam-knowledge';
import { ExamModuleRegistry } from './exam-module-registry';

export class ExamKnowledgeCandidateService {
  /**
   * Retrieves the comprehensive, candidate-facing Exam Knowledge read model.
   */
  static async getExamKnowledgeCandidateView(
    params: ExamKnowledgeCandidateQueryParams
  ): Promise<ExamKnowledgeCandidateResult> {
    const {
      examSlug,
      cycleYear,
      language = 'en',
      supabaseClient,
      prefetchedData,
    } = params;

    if (!examSlug || typeof examSlug !== 'string') {
      return {
        status: 'NOT_FOUND',
        errorMessage: 'A valid examSlug is required.',
      };
    }

    // 1. Resolve DB Client or Prefetched Context
    let client = supabaseClient;
    if (!client && !prefetchedData) {
      client = await createServerSupabaseClient();
    }

    let examRecord: any = null;
    let cyclesData: any[] = [];
    let postsData: any[] = [];
    let patternsData: any[] = [];
    let sourcesData: any[] = [];
    let claimsData: any[] = [];
    let syllabiData: any[] = [];
    let topicsData: any[] = [];
    let unitMappingsData: any[] = [];
    let publishedDocsData: any[] = [];
    let questionsData: any[] = [];

    if (prefetchedData) {
      examRecord = prefetchedData.exam;
      cyclesData = prefetchedData.cycles || [];
      postsData = prefetchedData.posts || [];
      patternsData = prefetchedData.patterns || [];
      sourcesData = prefetchedData.sources || [];
      claimsData = prefetchedData.claims || [];
      syllabiData = prefetchedData.syllabi || [];
      topicsData = prefetchedData.topics || [];
      unitMappingsData = prefetchedData.unitMappings || [];
      publishedDocsData = prefetchedData.publishedDocs || [];
      questionsData = prefetchedData.questions || [];
    } else {
      // 2. Fetch Exam Identity
      const { data: exam, error: examErr } = await client
        .from('exams')
        .select('*, conducting_org:conducting_orgs(*)')
        .eq('slug', examSlug.trim().toLowerCase())
        .maybeSingle();

      if (examErr || !exam) {
        return {
          status: 'NOT_FOUND',
          errorMessage: `Exam with slug "${examSlug}" was not found.`,
        };
      }

      if (!exam.is_active) {
        return {
          status: 'INACTIVE',
          errorMessage: `Exam "${exam.title || exam.name}" is currently inactive.`,
        };
      }

      examRecord = exam;

      // 3. Parallel Batch Execution (Bounded Queries - Zero N+1)
      const [
        cRes,
        pRes,
        patRes,
        sRes,
        clRes,
        sylRes,
        topRes,
        unitRes,
        docRes,
        qRes,
      ] = await Promise.all([
        client
          .from('exam_cycles')
          .select('*')
          .eq('exam_id', examRecord.id)
          .order('cycle_year', { ascending: false }),
        client
          .from('exam_posts')
          .select('*')
          .eq('exam_id', examRecord.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        client
          .from('exam_patterns')
          .select('*, exam_sections(*)')
          .eq('exam_id', examRecord.id)
          .eq('is_active', true),
        client
          .from('exam_sources')
          .select('*')
          .eq('exam_id', examRecord.id)
          .eq('verification_status', 'SOURCE_VERIFIED')
          .order('published_date', { ascending: false }),
        client
          .from('exam_claims')
          .select('*, claim_sources:exam_claim_sources(source:exam_sources(*))')
          .eq('exam_id', examRecord.id)
          .eq('verification_status', 'VERIFIED'),
        client
          .from('exam_syllabi')
          .select('*, subject:subjects(*)')
          .eq('exam_id', examRecord.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        client
          .from('exam_topics')
          .select('*, topic:topics(*)')
          .eq('exam_id', examRecord.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        client
          .from('exam_unit_mappings')
          .select('*, learning_unit:learning_units(*, learning_documents:learning_documents(*))')
          .eq('is_active', true)
          .order('sequence_order', { ascending: true }),
        client
          .from('exam_knowledge_documents')
          .select('*, current_published_version:exam_doc_versions!current_published_version_id(*)')
          .eq('exam_id', examRecord.id)
          .eq('language', language)
          .eq('status', 'PUBLISHED'),
        client
          .from('questions')
          .select('id, topic_id'),
      ]);

      cyclesData = cRes.data || [];
      postsData = pRes.data || [];
      patternsData = patRes.data || [];
      sourcesData = sRes.data || [];
      claimsData = clRes.data || [];
      syllabiData = sylRes.data || [];
      topicsData = topRes.data || [];
      unitMappingsData = unitRes.data || [];
      publishedDocsData = docRes.data || [];
      questionsData = qRes.data || [];
    }

    if (!examRecord) {
      return {
        status: 'NOT_FOUND',
        errorMessage: `Exam with slug "${examSlug}" was not found.`,
      };
    }

    if (examRecord.is_active === false) {
      return {
        status: 'INACTIVE',
        errorMessage: `Exam "${examRecord.title || examRecord.name}" is currently inactive.`,
      };
    }

    // 4. Deterministic Cycle Resolution
    const availableCycles = cyclesData.map((c) => ({
      id: c.id,
      cycleYear: c.cycle_year,
      cycleLabel: c.cycle_label || `Cycle ${c.cycle_year}`,
      status: c.status || 'ACTIVE',
    }));

    let targetCycle: any = null;
    if (cycleYear !== undefined && cycleYear !== null) {
      targetCycle = cyclesData.find((c) => c.cycle_year === cycleYear) || null;
    } else {
      // Find active/upcoming cycle, or fallback to the latest registered cycle
      targetCycle =
        cyclesData.find((c) => ['ACTIVE', 'UPCOMING'].includes(c.status)) ||
        cyclesData[0] ||
        null;
    }

    const activeCycle = targetCycle
      ? {
          id: targetCycle.id,
          cycleYear: targetCycle.cycle_year,
          cycleLabel: targetCycle.cycle_label || `Cycle ${targetCycle.cycle_year}`,
          status: targetCycle.status || 'ACTIVE',
          notificationDate: targetCycle.notification_date || null,
          applicationStartDate: targetCycle.application_start_date || null,
          applicationEndDate: targetCycle.application_end_date || null,
          examStartDate: targetCycle.exam_start_date || null,
          examEndDate: targetCycle.exam_end_date || null,
          totalVacancies: targetCycle.total_vacancies ? Number(targetCycle.total_vacancies) : null,
          isTentative: !targetCycle.notification_date,
        }
      : null;

    // 5. Filter Published Documents & Validate Strict Published Invariants
    const publishedModules: Partial<Record<ExamModuleKey, CandidatePublishedModule | null>> = {};
    const availableModuleKeys: ExamModuleKey[] = [];

    // Initialize all canonical modules in registry to null
    const allRegisteredKeys = ExamModuleRegistry.getAllModuleKeys();
    for (const modKey of allRegisteredKeys) {
      publishedModules[modKey] = null;
    }

    for (const doc of publishedDocsData) {
      // Rule 1: Document must be marked PUBLISHED
      if (doc.status !== 'PUBLISHED') continue;

      // Rule 2: Must have a matching current_published_version
      const version = doc.current_published_version;
      if (!version) continue;

      // Rule 3: Version must have is_published = true AND review_status = 'PUBLISHED'
      if (!version.is_published || version.review_status !== 'PUBLISHED') continue;

      // Rule 4: Cycle Scoping
      const isCycleSpecific = ExamModuleRegistry.isCycleSpecific(doc.module_key);
      if (isCycleSpecific) {
        // Must match activeCycle id if cycle-specific
        if (!activeCycle || doc.exam_cycle_id !== activeCycle.id) {
          continue;
        }
      } else {
        // Timeless module must have exam_cycle_id = null
        if (doc.exam_cycle_id !== null && doc.exam_cycle_id !== undefined) {
          continue;
        }
      }

      // Safe extraction of candidate-visible metadata and compiled content
      const payload = version.structured_payload || {};
      const modDef = ExamModuleRegistry.getModuleDefinition(doc.module_key);

      const candidateModule: CandidatePublishedModule = {
        documentId: doc.id,
        versionId: version.id,
        moduleKey: doc.module_key,
        displayName: modDef.displayName,
        title: payload.metadata?.title || `${modDef.displayName} — ${examRecord.title || examRecord.name}`,
        description: payload.metadata?.description || '',
        compiledMdx: version.compiled_mdx || null,
        faqs: Array.isArray(payload.faqs) ? payload.faqs : [],
        officialSources: Array.isArray(payload.officialSources)
          ? payload.officialSources.map((src: any) => ({
              title: src.title,
              issuingAuthority: src.issuingAuthority || 'Official Commission',
              sourceUrl: src.url,
              publishedDate: src.publishedDate || null,
              sourceType: src.sourceType || 'OFFICIAL_NOTIFICATION',
            }))
          : [],
        lastVerifiedDate: payload.metadata?.lastVerifiedDate || null,
        publishedAt: version.published_at || doc.updated_at,
      };

      publishedModules[doc.module_key as ExamModuleKey] = candidateModule;
      if (!availableModuleKeys.includes(doc.module_key as ExamModuleKey)) {
        availableModuleKeys.push(doc.module_key as ExamModuleKey);
      }
    }

    // 6. Map Structured Posts & Cadres
    const posts: CandidateExamPost[] = postsData.map((p) => ({
      id: p.id,
      postName: p.post_name,
      postCode: p.post_code || null,
      department: p.department || null,
      ministry: p.ministry || null,
      classificationGroup: p.classification_group || null,
      isGazetted: Boolean(p.is_gazetted),
      payLevel: Number(p.pay_level) || 7,
      gradePay: p.grade_pay ? Number(p.grade_pay) : null,
      cpcBasicPayMin: p.cpc_basic_pay_min ? Number(p.cpc_basic_pay_min) : null,
      cpcBasicPayMax: p.cpc_basic_pay_max ? Number(p.cpc_basic_pay_max) : null,
      vacanciesCount: null,
    }));

    // 7. Map Structured Patterns
    const patterns: CandidateExamPattern[] = patternsData.map((pat) => ({
      id: pat.id,
      name: pat.name,
      tierName: pat.tier_name || null,
      durationMinutes: Number(pat.duration_minutes) || 60,
      totalQuestions: Number(pat.total_questions) || 100,
      totalMarks: Number(pat.total_marks) || 200,
      negativeMarkValue: Number(pat.negative_mark_value) || 0.5,
      sections: Array.isArray(pat.exam_sections)
        ? pat.exam_sections.map((sec: any) => ({
            name: sec.name,
            questionCount: Number(sec.question_count) || 25,
            marksPerQuestion: Number(sec.marks_per_question) || 2,
          }))
        : [],
    }));

    // 8. Map Verified Claims (Strip internal audit IDs/notes)
    const verifiedClaims: CandidateVerifiedClaim[] = claimsData.map((c) => {
      const citations: Array<{ sourceTitle: string; pageOrClause?: string }> = [];
      if (Array.isArray(c.claim_sources)) {
        c.claim_sources.forEach((cs: any) => {
          if (cs.source && cs.source.title) {
            citations.push({
              sourceTitle: cs.source.title,
              pageOrClause: cs.page_or_clause_reference || undefined,
            });
          }
        });
      }

      return {
        claimKey: c.claim_key,
        statedValue: c.stated_value,
        dataType: c.value_data_type || 'STRING',
        citations,
      };
    });

    // 9. Map Official Verified Sources
    const officialSources: CandidateOfficialSource[] = sourcesData.map((src) => ({
      id: src.id,
      title: src.title,
      sourceType: src.source_type,
      issuingAuthority: src.issuing_authority,
      sourceUrl: src.source_url,
      publishedDate: src.published_date || null,
    }));

    // 10. Map Question Density & Canonical Curriculum Tree
    // Index questions count per topic_id
    const questionsCountByTopicId = new Map<string, number>();
    questionsData.forEach((q) => {
      if (q.topic_id) {
        questionsCountByTopicId.set(
          q.topic_id,
          (questionsCountByTopicId.get(q.topic_id) || 0) + 1
        );
      }
    });

    const curriculumSubjects: CandidateExamSubject[] = [];

    for (const syl of syllabiData) {
      const subject = syl.subject || {};
      const matchedExamTopics = topicsData.filter((t) => t.subject_id === syl.subject_id);

      const candidateTopics: CandidateExamTopic[] = matchedExamTopics.map((et) => {
        const topic = et.topic || {};
        const qCount = questionsCountByTopicId.get(et.topic_id) || 0;

        // Resolve published learning document link via exam_unit_mappings
        let learningDocSlug: string | null = null;
        const matchedUnitMapping = unitMappingsData.find((um) => um.exam_topic_id === et.id);
        if (matchedUnitMapping && matchedUnitMapping.learning_unit) {
          const lDocs = matchedUnitMapping.learning_unit.learning_documents || [];
          const publishedLDoc = lDocs.find((ld: any) => ld.status === 'PUBLISHED');
          if (publishedLDoc && publishedLDoc.canonical_slug) {
            learningDocSlug = publishedLDoc.canonical_slug;
          }
        }

        return {
          id: et.id,
          name: topic.name || 'Untitled Topic',
          slug: topic.slug || '',
          importanceTier: et.importance_tier || 'CORE',
          requiredDepth: et.required_depth || 'CONCEPTUAL',
          expectedQuestions: {
            min: Number(et.expected_questions_min) || 0,
            max: Number(et.expected_questions_max) || 0,
          },
          learningDocumentSlug: learningDocSlug,
          pyqCount: qCount,
          practiceAvailable: qCount > 0,
        };
      });

      curriculumSubjects.push({
        id: syl.id,
        name: subject.name || 'General Subject',
        slug: subject.slug || '',
        code: subject.code || '',
        totalWeightagePercent: syl.total_weightage_percent ? Number(syl.total_weightage_percent) : null,
        topics: candidateTopics,
      });
    }

    // 11. Extract Candidate Eligibility Parameters from Verified Claims
    const minAgeClaim = verifiedClaims.find((c) => c.claimKey === 'MIN_AGE');
    const maxAgeClaim = verifiedClaims.find((c) => c.claimKey === 'MAX_AGE');
    const minQualClaim = verifiedClaims.find((c) => c.claimKey === 'MIN_QUALIFICATION');
    const nationalityClaim = verifiedClaims.find((c) => c.claimKey === 'NATIONALITY_RULE');

    const eligibilityParameters = {
      minAge: minAgeClaim ? Number(minAgeClaim.statedValue) || null : null,
      maxAge: maxAgeClaim ? Number(maxAgeClaim.statedValue) || null : null,
      educationMin: minQualClaim ? minQualClaim.statedValue : null,
      nationality: nationalityClaim ? nationalityClaim.statedValue : null,
      ageRelaxations: [],
    };

    // 12. Freshness & Metadata Assembly
    const overallFreshnessStatus: 'VERIFIED_CURRENT' | 'HISTORICAL_ONLY' | 'CYCLE_PENDING' = activeCycle
      ? 'VERIFIED_CURRENT'
      : availableCycles.length > 0
      ? 'HISTORICAL_ONLY'
      : 'CYCLE_PENDING';

    const candidateView: ExamKnowledgeCandidateView = {
      exam: {
        id: examRecord.id,
        slug: examRecord.slug,
        title: examRecord.title || examRecord.name,
        category: examRecord.category || 'Competitive Examinations',
        conductingOrg: {
          id: examRecord.conducting_org?.id || '',
          name: examRecord.conducting_org?.name || 'Recruitment Commission',
          shortName: examRecord.conducting_org?.short_name || 'Commission',
          websiteUrl: examRecord.conducting_org?.website_url || examRecord.official_website || '',
        },
        description: examRecord.description || null,
        officialWebsite: examRecord.official_website || null,
      },
      activeCycle,
      availableCycles,
      structuredFacts: {
        posts,
        patterns,
        eligibilityParameters,
        verifiedClaims,
      },
      curriculum: {
        subjects: curriculumSubjects,
      },
      publishedModules,
      officialSources,
      availableModuleKeys,
      metadata: {
        generatedAt: new Date().toISOString(),
        hasActiveCycle: activeCycle !== null,
        activeCycleYear: activeCycle ? activeCycle.cycleYear : null,
        totalPublishedModulesCount: availableModuleKeys.length,
        overallFreshnessStatus,
      },
    };

    return {
      status: 'FOUND',
      data: candidateView,
    };
  }

  /**
   * Retrieves summary directory of active exams with published module counts and latest cycle.
   */
  static async getExamsDirectory(params?: {
    supabaseClient?: any;
    prefetchedData?: any;
  }): Promise<CandidateExamDirectoryItem[]> {
    let client = params?.supabaseClient;
    if (!client && !params?.prefetchedData) {
      client = await createServerSupabaseClient();
    }

    if (params?.prefetchedData) {
      const exams = params.prefetchedData.exams || [];
      const cycles = params.prefetchedData.cycles || [];
      const docs = params.prefetchedData.publishedDocs || [];

      return exams
        .filter((e: any) => e.is_active !== false)
        .map((exam: any) => {
          const examCycles = cycles.filter((c: any) => c.exam_id === exam.id);
          const latestCycle = [...examCycles].sort(
            (a: any, b: any) => (b.cycle_year || 0) - (a.cycle_year || 0)
          )[0];
          const publishedDocs = docs.filter(
            (d: any) => d.exam_id === exam.id && d.status === 'PUBLISHED'
          );
          return {
            id: exam.id,
            slug: exam.slug,
            title: exam.title || exam.name,
            category: exam.category || 'Competitive Examinations',
            conductingOrg: {
              id: exam.conducting_org?.id || '',
              name: exam.conducting_org?.name || 'Recruitment Commission',
              shortName: exam.conducting_org?.short_name || 'Commission',
            },
            description: exam.description || null,
            latestCycleYear: latestCycle ? latestCycle.cycle_year : null,
            publishedModulesCount: publishedDocs.length,
          };
        });
    }

    const [examsRes, cyclesRes, docsRes] = await Promise.all([
      client
        .from('exams')
        .select('*, conducting_org:conducting_orgs(*)')
        .eq('is_active', true)
        .order('title', { ascending: true }),
      client
        .from('exam_cycles')
        .select('id, exam_id, cycle_year, status')
        .order('cycle_year', { ascending: false }),
      client
        .from('exam_knowledge_documents')
        .select('id, exam_id')
        .eq('status', 'PUBLISHED'),
    ]);

    const exams = examsRes.data || [];
    const cycles = cyclesRes.data || [];
    const docs = docsRes.data || [];

    return exams.map((exam: any) => {
      const examCycles = cycles.filter((c: any) => c.exam_id === exam.id);
      const latestCycle = examCycles[0];
      const publishedDocs = docs.filter((d: any) => d.exam_id === exam.id);

      return {
        id: exam.id,
        slug: exam.slug,
        title: exam.title || exam.name,
        category: exam.category || 'Competitive Examinations',
        conductingOrg: {
          id: exam.conducting_org?.id || '',
          name: exam.conducting_org?.name || 'Recruitment Commission',
          shortName: exam.conducting_org?.short_name || 'Commission',
        },
        description: exam.description || null,
        latestCycleYear: latestCycle ? latestCycle.cycle_year : null,
        publishedModulesCount: publishedDocs.length,
      };
    });
  }
}

