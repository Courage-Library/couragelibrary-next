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
 * 6. GAP2-4b: the syllabus comes ONLY from the canonical read model (fn_exam_syllabus_read_model: PUBLISHED versions,
 *    explicit NO_SYLLABUS / AVAILABLE / UNAVAILABLE states). Exam patterns are read through exam_cycles with their real
 *    pattern_sections; numbers are never defaulted. No legacy exam_syllabi / exam_topics / exam_unit_mappings reads.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ExamKnowledgeCandidateQueryParams,
  ExamKnowledgeCandidateResult,
  ExamKnowledgeCandidateView,
  CandidateExamPost,
  CandidateExamPattern,
  CandidatePublishedModule,
  CandidateOfficialSource,
  CandidateVerifiedClaim,
  CandidateExamDirectoryItem,
  ExamModuleKey,
} from '@/types/exam-knowledge';
import { ExamModuleRegistry } from './exam-module-registry';
import { rpcJsonObject } from '@/lib/supabase/rpc';
import type { SyllabusReadModel } from '@/types/syllabus';
import type { AppSupabaseClient } from '@/lib/supabase/types';

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

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
    let publishedDocsData: any[] = [];
    let prefetchedSyllabus: SyllabusReadModel | null = null;

    if (prefetchedData) {
      examRecord = prefetchedData.exam;
      cyclesData = prefetchedData.cycles || [];
      postsData = prefetchedData.posts || [];
      patternsData = prefetchedData.patterns || [];
      sourcesData = prefetchedData.sources || [];
      claimsData = prefetchedData.claims || [];
      publishedDocsData = prefetchedData.publishedDocs || [];
      prefetchedSyllabus = prefetchedData.syllabus || null;
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
        docRes,
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
        // patterns belong to cycles (exam_patterns has no exam_id); sections are pattern_sections
        client
          .from('exam_patterns')
          .select('id, name, tier_name, duration_minutes, total_questions, total_marks, negative_mark_value, exam_cycle_id, pattern_sections(section_name, section_order, num_questions, marks_per_question, negative_mark), exam_cycles!inner(exam_id)')
          .eq('exam_cycles.exam_id', examRecord.id)
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
          .from('exam_knowledge_documents')
          .select('*, current_published_version:exam_doc_versions!current_published_version_id(*)')
          .eq('exam_id', examRecord.id)
          .eq('language', language)
          .eq('status', 'PUBLISHED'),
      ]);

      cyclesData = cRes.data || [];
      postsData = pRes.data || [];
      patternsData = patRes.data || [];
      sourcesData = sRes.data || [];
      claimsData = clRes.data || [];
      publishedDocsData = docRes.data || [];
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
          // F1: the columns are exam_window_start / exam_window_end (the old *_date names never existed → always null)
          examStartDate: targetCycle.exam_window_start || targetCycle.exam_start_date || null,
          examEndDate: targetCycle.exam_window_end || targetCycle.exam_end_date || null,
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
        // Timeless module matches if exam_cycle_id is null OR matches the active cycle
        if (doc.exam_cycle_id !== null && doc.exam_cycle_id !== undefined && (!activeCycle || doc.exam_cycle_id !== activeCycle.id)) {
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

    // 7. Map Structured Patterns (real values only; null when not recorded). Patterns of the active cycle first.
    const patterns: CandidateExamPattern[] = [...patternsData]
      .filter((pat) => !activeCycle || !pat.exam_cycle_id || pat.exam_cycle_id === activeCycle.id)
      .map((pat) => ({
        id: pat.id,
        name: pat.name,
        tierName: pat.tier_name || null,
        durationMinutes: num(pat.duration_minutes),
        totalQuestions: num(pat.total_questions),
        totalMarks: num(pat.total_marks),
        negativeMarkValue: num(pat.negative_mark_value),
        sections: (Array.isArray(pat.pattern_sections) ? [...pat.pattern_sections] : [])
          .sort((x: any, y: any) => (x.section_order ?? 0) - (y.section_order ?? 0))
          .map((sec: any) => ({
            name: sec.section_name,
            order: sec.section_order ?? 0,
            questionCount: num(sec.num_questions),
            marksPerQuestion: num(sec.marks_per_question),
            negativeMark: num(sec.negative_mark),
          })),
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

    // 10. Canonical syllabus (published only) for the exam and its active cycle — one RPC, derived live counts.
    // Prefetched (offline) mode never touches the network: a caller that supplies no syllabus gets UNAVAILABLE.
    let syllabus: SyllabusReadModel;
    if (prefetchedData) {
      syllabus = prefetchedSyllabus ?? { state: 'UNAVAILABLE', exam_id: examRecord.id, version: null, nodes: [], totals: null };
    } else {
      const { data: rm, error: rmErr } = await client.rpc('fn_exam_syllabus_read_model', {
        p_exam_id: examRecord.id,
        p_exam_cycle_id: activeCycle?.id ?? undefined,
      });
      const parsed = rmErr ? null : rpcJsonObject<SyllabusReadModel>(rm);
      syllabus =
        parsed && (parsed.state === 'AVAILABLE' || parsed.state === 'NO_SYLLABUS')
          ? parsed
          : { state: 'UNAVAILABLE', exam_id: examRecord.id, version: null, nodes: [], totals: null };
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
      syllabus,
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
    supabaseClient?: AppSupabaseClient;
    prefetchedData?: any;
  }): Promise<CandidateExamDirectoryItem[]> {
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

    const client = params?.supabaseClient ?? (await createServerSupabaseClient());
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

