/**
 * COURAGE LIBRARY — ADMIN EXAM KNOWLEDGE SERVICE
 * Phase 3H.4: Admin Exam Knowledge Studio & Lifecycle Control Plane
 * 
 * Authoritative orchestration service for:
 * 1. Live KPI aggregation (Zero hardcoded numbers)
 * 2. Exam and Cycle workspace resolution
 * 3. Dynamic Knowledge Module Matrix driven by ExamModuleRegistry
 * 4. Draft list and Document Detail inspection
 * 5. Human Academic Review state transitions (AI_GENERATED -> IN_REVIEW -> APPROVED -> COMPILED -> PUBLISHED)
 * 6. MDX Compilation with MdxSecurityScanner & cryptographic artifact hashing
 * 7. Server-authoritative publishing with published-pointer consistency & immutability locks
 * 8. Revision branching (v1 -> v2) protecting immutable published versions
 * 9. Source & Claim verification and conflict management
 */

import crypto from 'crypto';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamKnowledgeService } from '@/services/exam-knowledge.service';
import { ExamModuleRegistry } from './exam-module-registry';
import { MdxSecurityScanner } from '@/services/mdx-security-scanner';
import {
  ExamKnowledgeDocumentSpec,
  ExamModuleKey,
  ExamDocReviewStatus,
  ExamSourceVerificationStatus,
  ExamClaimVerificationStatus,
  ExamAuthorType,
  ExamModuleDefinition,
  ModuleApplicabilityStatus,
} from '@/types/exam-knowledge';

export interface AdminExamKnowledgeKPIs {
  totalExams: number;
  activeExams: number;
  activeCycles: number;
  totalDocuments: number;
  draftsAwaitingReview: number;
  publishedDocuments: number;
  unverifiedSources: number;
  claimsRequiringReview: number;
}

export interface ExamWorkspaceModuleStatus {
  moduleKey: ExamModuleKey;
  title: string;
  category: string;
  isCycleSpecific: boolean;
  requiresOfficialSources: boolean;
  applicability: ModuleApplicabilityStatus;
  status: 'NOT_STARTED' | 'PROMPT_READY' | 'AI_RESPONSE_PENDING' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'COMPILED' | 'PUBLISHED' | 'BLOCKED';
  documentId?: string;
  versionId?: string;
  versionNumber?: number;
  reviewStatus?: ExamDocReviewStatus;
  isPublished?: boolean;
  lastUpdated?: string;
}

export interface ExamWorkspaceData {
  exam: {
    id: string;
    name: string;
    slug: string;
    conductingOrgName: string;
    isActive: boolean;
    officialWebsiteUrl?: string | null;
  };
  cycle?: {
    id: string;
    year: number;
    notificationDate?: string | null;
    examStartDate?: string | null;
    isActive: boolean;
  } | null;
  modules: ExamWorkspaceModuleStatus[];
}

export class AdminExamKnowledgeService {
  /**
   * 1. Get Live Dashboard KPIs
   * Queries real database counts without hardcoded defaults.
   */
  static async getDashboardKPIs(supabaseClient?: any): Promise<AdminExamKnowledgeKPIs> {
    const supabase = supabaseClient || createAdminServerSupabaseClient();

    const [
      examsRes,
      activeExamsRes,
      activeCyclesRes,
      docsRes,
      draftsRes,
      publishedRes,
      unverifiedSrcsRes,
      claimsRes,
    ] = await Promise.all([
      supabase.from('exams').select('id', { count: 'exact', head: true }),
      supabase.from('exams').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('exam_cycles').select('id', { count: 'exact', head: true }),
      supabase.from('exam_knowledge_documents').select('id', { count: 'exact', head: true }),
      supabase.from('exam_doc_versions').select('id', { count: 'exact', head: true }).eq('is_published', false),
      supabase.from('exam_doc_versions').select('id', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('exam_sources').select('id', { count: 'exact', head: true }).eq('verification_status', 'PENDING_VERIFICATION'),
      supabase.from('exam_claims').select('id', { count: 'exact', head: true }).in('verification_status', ['UNVERIFIED', 'DISPUTED']),
    ]);

    return {
      totalExams: examsRes.count || 0,
      activeExams: activeExamsRes.count || 0,
      activeCycles: activeCyclesRes.count || 0,
      totalDocuments: docsRes.count || 0,
      draftsAwaitingReview: draftsRes.count || 0,
      publishedDocuments: publishedRes.count || 0,
      unverifiedSources: unverifiedSrcsRes.count || 0,
      claimsRequiringReview: claimsRes.count || 0,
    };
  }

  /**
   * 2. Get Exams and Cycles for selection
   */
  static async getExamsAndCycles(supabaseClient?: any): Promise<{
    exams: Array<{
      id: string;
      name: string;
      slug: string;
      is_active: boolean;
      conducting_org?: { name: string; code: string; official_portal_url?: string };
      cycles: Array<{ id: string; year: number; is_active: boolean; notification_date?: string }>;
    }>;
  }> {
    const supabase = supabaseClient || createAdminServerSupabaseClient();

    const { data: exams, error } = await supabase
      .from('exams')
      .select('*, conducting_org:conducting_orgs(*), exam_cycles(*)')
      .order('created_at', { ascending: true });

    if (error || !exams) {
      return { exams: [] };
    }

    const formatted = exams.map((e: any) => {
      const org = e.conducting_org;
      const cycles = e.exam_cycles || [];
      return {
        id: e.id,
        name: e.title || e.name || 'Exam',
        slug: e.slug,
        is_active: Boolean(e.is_active),
        conducting_org: org
          ? {
              name: org.name || org.title || 'Government Body',
              code: org.code || '',
              official_portal_url: org.official_portal_url || org.official_website || undefined,
            }
          : undefined,
        cycles: cycles
          .map((c: any) => ({
            id: c.id,
            year: c.cycle_year || c.year,
            is_active: true,
            notification_date: c.notification_date,
          }))
          .sort((a: any, b: any) => b.year - a.year),
      };
    });

    formatted.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return { exams: formatted };
  }

  /**
   * 3. Get Exam Workspace data dynamically driven by ExamModuleRegistry
   */
  static async getExamWorkspace(
    examId: string,
    cycleId?: string | null,
    supabaseClient?: any
  ): Promise<ExamWorkspaceData | null> {
    const supabase = supabaseClient || createAdminServerSupabaseClient();

    const { data: exam, error: examErr } = await supabase
      .from('exams')
      .select('*, conducting_org:conducting_orgs(*)')
      .eq('id', examId)
      .maybeSingle();

    if (!exam) return null;

    let cycleData: any = null;
    if (cycleId) {
      const { data: cycle } = await supabase
        .from('exam_cycles')
        .select('*')
        .eq('id', cycleId)
        .eq('exam_id', examId)
        .maybeSingle();
      if (cycle) {
        cycleData = {
          ...cycle,
          year: cycle.cycle_year || cycle.year,
          isActive: true,
        };
      }
    }

    const org = exam.conducting_org;
    const orgName = org?.name || org?.title || exam.conducting_body || 'Government Body';
    const orgWebsiteUrl = org?.official_portal_url || org?.official_website || null;

    // Fetch verified sources count
    const { count: verifiedSourcesCount } = await supabase
      .from('exam_sources')
      .select('id', { count: 'exact', head: true })
      .eq('exam_id', examId)
      .eq('verification_status', 'SOURCE_VERIFIED');

    // Fetch existing documents for this exam
    let docQuery = supabase
      .from('exam_knowledge_documents')
      .select(`
        id,
        module_key,
        exam_cycle_id,
        status,
        updated_at,
        current_published_version_id,
        exam_doc_versions (
          id,
          version_number,
          review_status,
          is_published,
          updated_at
        )
      `)
      .eq('exam_id', examId);

    const { data: existingDocs } = await docQuery;

    const allModules = ExamModuleRegistry.getAllModuleDefinitions();

    const modules: ExamWorkspaceModuleStatus[] = allModules.map((m: ExamModuleDefinition) => {
      const applicabilityReport = ExamModuleRegistry.evaluateApplicability(
        { id: exam.id, title: exam.title || exam.name || 'Exam', isActive: exam.is_active },
        cycleData ? { id: cycleData.id, cycleYear: cycleData.year } : null,
        m.key,
        verifiedSourcesCount || 0,
        0
      );
      const applicability = applicabilityReport.status;

      // Find matching document
      const doc = (existingDocs || []).find((d: any) => {
        if (d.module_key !== m.key) return false;
        if (m.isCycleSpecific) {
          return d.exam_cycle_id === (cycleId || null);
        }
        return true;
      });

      let status: ExamWorkspaceModuleStatus['status'] = 'NOT_STARTED';
      let docId: string | undefined;
      let verId: string | undefined;
      let verNum: number | undefined;
      let reviewStatus: ExamDocReviewStatus | undefined;
      let isPublished = false;
      let lastUpdated: string | undefined;

      if (applicability === 'NOT_APPLICABLE' || applicability === 'REQUIRES_CYCLE') {
        status = 'BLOCKED';
      } else if (doc) {
        docId = doc.id;
        lastUpdated = doc.updated_at;
        const versions = (doc.exam_doc_versions || []).sort(
          (a: any, b: any) => b.version_number - a.version_number
        );
        const latestVer = versions[0];
        if (latestVer) {
          verId = latestVer.id;
          verNum = latestVer.version_number;
          reviewStatus = latestVer.review_status;
          isPublished = latestVer.is_published;
          lastUpdated = latestVer.updated_at;

          if (latestVer.is_published) {
            status = 'PUBLISHED';
          } else if (latestVer.review_status === 'APPROVED' && latestVer.compiled_mdx) {
            status = 'COMPILED';
          } else if (latestVer.review_status === 'APPROVED') {
            status = 'APPROVED';
          } else if (latestVer.review_status === 'IN_REVIEW') {
            status = 'IN_REVIEW';
          } else if (latestVer.review_status === 'AI_GENERATED') {
            status = 'AI_RESPONSE_PENDING';
          } else {
            status = 'DRAFT';
          }
        } else {
          status = 'DRAFT';
        }
      } else {
        status = applicability === 'APPLICABLE' ? 'PROMPT_READY' : 'NOT_STARTED';
      }

      return {
        moduleKey: m.key,
        title: m.displayName,
        category: m.isCycleSpecific ? 'CYCLE_SPECIFIC' : 'CORE_OVERVIEW',
        isCycleSpecific: m.isCycleSpecific,
        requiresOfficialSources: m.requiresSources,
        applicability,
        status,
        documentId: docId,
        versionId: verId,
        versionNumber: verNum,
        reviewStatus,
        isPublished,
        lastUpdated,
      };
    });

    return {
      exam: {
        id: exam.id,
        name: exam.name,
        slug: exam.slug,
        conductingOrgName: orgName || 'Government Body',
        isActive: Boolean(exam.is_active),
        officialWebsiteUrl: orgWebsiteUrl,
      },
      cycle: cycleData
        ? {
            id: cycleData.id,
            year: cycleData.year,
            notificationDate: cycleData.notification_date,
            examStartDate: cycleData.exam_start_date,
            isActive: cycleData.is_active,
          }
        : null,
      modules,
    };
  }

  /**
   * 4. Get Drafts List
   */
  static async getDraftsList(
    filters?: { examId?: string; reviewStatus?: ExamDocReviewStatus },
    supabaseClient?: any
  ): Promise<any[]> {
    const supabase = supabaseClient || createAdminServerSupabaseClient();

    let query = supabase
      .from('exam_doc_versions')
      .select(`
        id,
        document_id,
        version_number,
        schema_version,
        author_type,
        review_status,
        is_published,
        source_spec_hash,
        structured_payload,
        created_at,
        updated_at,
        reviewed_at,
        review_feedback,
        exam_knowledge_documents:exam_knowledge_documents!document_id (
          id,
          module_key,
          canonical_slug,
          exam_id,
          exam_cycle_id,
          exams (
            id,
            title,
            slug
          ),
          exam_cycles (
            id,
            cycle_year
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (filters?.reviewStatus) {
      query = query.eq('review_status', filters.reviewStatus);
    }

    const { data: versions, error } = await query;
    if (error || !versions) return [];

    let result = versions;
    if (filters?.examId) {
      result = result.filter(
        (v: any) => v.exam_knowledge_documents?.exam_id === filters.examId
      );
    }

    return result.map((v: any) => ({
      id: v.id,
      documentId: v.document_id,
      versionNumber: v.version_number,
      schemaVersion: v.schema_version,
      authorType: v.author_type,
      reviewStatus: v.review_status,
      isPublished: v.is_published,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      reviewedAt: v.reviewed_at,
      reviewFeedback: v.review_feedback,
      contextHash: v.structured_payload?.contextHash || '',
      specHash: v.source_spec_hash,
      document: {
        id: v.exam_knowledge_documents?.id,
        moduleKey: v.exam_knowledge_documents?.module_key,
        title: v.structured_payload?.metadata?.title || `${v.exam_knowledge_documents?.module_key} - ${v.exam_knowledge_documents?.exams?.title || ''}`,
        slug: v.exam_knowledge_documents?.canonical_slug,
        canonicalSlug: v.exam_knowledge_documents?.canonical_slug,
        examName: v.exam_knowledge_documents?.exams?.title || 'Unknown Exam',
        examSlug: v.exam_knowledge_documents?.exams?.slug || '',
        cycleYear: v.exam_knowledge_documents?.exam_cycles?.cycle_year,
      },
    }));
  }

  /**
   * 5. Get Document Version Detail
   */
  static async getDocumentDetail(
    versionId: string,
    supabaseClient?: any
  ): Promise<any | null> {
    const supabase = supabaseClient || createAdminServerSupabaseClient();

    const { data: version, error } = await supabase
      .from('exam_doc_versions')
      .select(`
        *,
        exam_knowledge_documents:exam_knowledge_documents!document_id (
          id,
          module_key,
          canonical_slug,
          exam_id,
          exam_cycle_id,
          current_published_version_id,
          status,
          language,
          exams (
            id,
            title,
            slug,
            conducting_orgs (name, slug)
          ),
          exam_cycles (
            id,
            cycle_year
          )
        )
      `)
      .eq('id', versionId)
      .single();

    if (error || !version) return null;

    const examId = version.exam_knowledge_documents?.exam_id;

    // Fetch related sources and claims
    const [sourcesRes, claimsRes] = await Promise.all([
      supabase.from('exam_sources').select('*').eq('exam_id', examId),
      supabase
        .from('exam_claims')
        .select('*')
        .eq('exam_id', examId)
        .eq('module_key', version.exam_knowledge_documents?.module_key),
    ]);

    return {
      version,
      document: version.exam_knowledge_documents,
      sources: sourcesRes.data || [],
      claims: claimsRes.data || [],
    };
  }

  /**
   * 6. Update Version Review Status (AI_GENERATED -> IN_REVIEW -> APPROVED / REJECTED)
   */
  static async updateDocVersionReviewStatus(
    params: {
      versionId: string;
      newStatus: ExamDocReviewStatus;
      feedback?: string;
      userId?: string;
    },
    supabaseClient?: any
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { data: ver, error: fetchErr } = await supabase
      .from('exam_doc_versions')
      .select('id, version_number, review_status, is_published')
      .eq('id', params.versionId)
      .single();

    if (fetchErr || !ver) {
      return { success: false, error: 'Version not found.' };
    }

    try {
      ExamKnowledgeService.assertMutable(ver);
    } catch (e: any) {
      return { success: false, error: e.message };
    }

    const updates: any = {
      review_status: params.newStatus,
      review_feedback: params.feedback || null,
      reviewed_at: new Date().toISOString(),
      approved_by_user_id: params.newStatus === 'APPROVED' ? params.userId || null : null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('exam_doc_versions')
      .update(updates)
      .eq('id', params.versionId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  }

  /**
   * 7. Compile Exam Knowledge Document Version into MDX
   */
  static async compileExamDocVersion(
    versionId: string,
    supabaseClient?: any
  ): Promise<{ success: boolean; compiledMdx?: string; artifactHash?: string; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { data: ver, error: fetchErr } = await supabase
      .from('exam_doc_versions')
      .select('*, exam_knowledge_documents:exam_knowledge_documents!document_id(*)')
      .eq('id', versionId)
      .single();

    if (fetchErr || !ver) {
      return { success: false, error: 'Version not found.' };
    }

    try {
      ExamKnowledgeService.assertMutable(ver);
    } catch (e: any) {
      return { success: false, error: e.message };
    }

    const payload: ExamKnowledgeDocumentSpec = ver.structured_payload;
    if (!payload || !payload.contentSections) {
      return { success: false, error: 'Version has invalid or missing structured payload.' };
    }

    // Assemble MDX
    const mdxParts: string[] = [];
    mdxParts.push(`# ${payload.metadata?.title || 'Exam Knowledge Guide'}\n`);
    if (payload.metadata?.description) {
      mdxParts.push(`> ${payload.metadata.description}\n`);
    }

    for (const sec of payload.contentSections || []) {
      mdxParts.push(`\n## ${sec.heading}\n`);
      if (sec.bodyMarkdown) {
        mdxParts.push(`${sec.bodyMarkdown}\n`);
      }
      if (sec.calloutNotes && sec.calloutNotes.length > 0) {
        for (const note of sec.calloutNotes) {
          mdxParts.push(`\n> **${note.variant}: ${note.title}**\n> ${note.body}\n`);
        }
        mdxParts.push('');
      }
    }

    if (Array.isArray(payload.faqs) && payload.faqs.length > 0) {
      mdxParts.push('\n## Frequently Asked Questions\n');
      for (const faq of payload.faqs) {
        mdxParts.push(`### ${faq.question}\n${faq.answer}\n`);
      }
    }

    if (Array.isArray(payload.officialSources) && payload.officialSources.length > 0) {
      mdxParts.push('\n## Official Sources & Evidence\n');
      for (const src of payload.officialSources) {
        mdxParts.push(`- [${src.title}](${src.url}) (${src.issuingAuthority})`);
      }
      mdxParts.push('');
    }

    const compiledMdx = mdxParts.join('\n');

    // Run security scan
    const securityCheck = MdxSecurityScanner.scan(compiledMdx);
    if (!securityCheck.isSafe) {
      return {
        success: false,
        error: `Security scan failed on compiled MDX: ${securityCheck.errors.map((v: any) => v.message).join(', ')}`,
      };
    }

    // Compute cryptographic hash
    const artifactHash = crypto.createHash('sha256').update(compiledMdx).digest('hex');

    // Update version record
    const { error: updateErr } = await supabase
      .from('exam_doc_versions')
      .update({
        compiled_mdx: compiledMdx,
        compiled_artifact_hash: artifactHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', versionId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, compiledMdx, artifactHash };
  }

  /**
   * 8. Publish Exam Knowledge Document Version
   * Server-authoritative: validates compilation and sets immutability lock.
   */
  static async publishExamDocVersion(
    params: { versionId: string; userId?: string },
    supabaseClient?: any
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { data: ver, error: fetchErr } = await supabase
      .from('exam_doc_versions')
      .select('*, exam_knowledge_documents:exam_knowledge_documents!document_id(*)')
      .eq('id', params.versionId)
      .single();

    if (fetchErr || !ver) {
      return { success: false, error: 'Version not found.' };
    }

    if (ver.review_status !== 'APPROVED' && ver.review_status !== 'PUBLISHED') {
      return {
        success: false,
        error: `Cannot publish document in '${ver.review_status}' status. Document must be APPROVED.`,
      };
    }

    if (!ver.compiled_mdx) {
      return {
        success: false,
        error: 'Cannot publish uncompiled document. Run compilation first.',
      };
    }

    const documentId = ver.document_id;
    const nowIso = new Date().toISOString();

    // 1. Lock Version as PUBLISHED
    const { error: verErr } = await supabase
      .from('exam_doc_versions')
      .update({
        is_published: true,
        review_status: 'PUBLISHED',
        published_at: nowIso,
        approved_by_user_id: params.userId || ver.approved_by_user_id,
        updated_at: nowIso,
      })
      .eq('id', params.versionId);

    if (verErr) {
      return { success: false, error: verErr.message };
    }

    // 2. Update Parent Document pointer
    const { error: docErr } = await supabase
      .from('exam_knowledge_documents')
      .update({
        status: 'PUBLISHED',
        current_published_version_id: params.versionId,
        updated_at: nowIso,
      })
      .eq('id', documentId);

    if (docErr) {
      return { success: false, error: docErr.message };
    }

    return { success: true };
  }

  /**
   * 9. Create Revision Draft (v1 -> v2)
   * Clones base version's payload without altering published v1.
   */
  static async createRevisionDraft(
    params: { documentId: string; baseVersionId: string; userId?: string },
    supabaseClient?: any
  ): Promise<{ success: boolean; newVersionId?: string; versionNumber?: number; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { data: baseVer, error: baseErr } = await supabase
      .from('exam_doc_versions')
      .select('*')
      .eq('id', params.baseVersionId)
      .eq('document_id', params.documentId)
      .single();

    if (baseErr || !baseVer) {
      return { success: false, error: 'Base version not found.' };
    }

    // Fetch highest version number
    const { data: existingVersions } = await supabase
      .from('exam_doc_versions')
      .select('version_number')
      .eq('document_id', params.documentId)
      .order('version_number', { ascending: false });

    const maxVer = existingVersions?.[0]?.version_number || baseVer.version_number || 1;
    const newVerNum = maxVer + 1;

    const { data: newVer, error: insertErr } = await supabase
      .from('exam_doc_versions')
      .insert({
        document_id: params.documentId,
        version_number: newVerNum,
        schema_version: '1.0.0',
        author_type: 'HUMAN' as ExamAuthorType,
        review_status: 'DRAFT' as ExamDocReviewStatus,
        is_published: false,
        source_spec_hash: baseVer.source_spec_hash,
        structured_payload: baseVer.structured_payload,
      })
      .select('id, version_number')
      .single();

    if (insertErr || !newVer) {
      return { success: false, error: insertErr?.message || 'Failed to create revision draft.' };
    }

    return {
      success: true,
      newVersionId: newVer.id,
      versionNumber: newVer.version_number,
    };
  }

  /**
   * 10. Verify or Reject Source
   */
  static async updateSourceVerification(
    params: {
      sourceId: string;
      status: ExamSourceVerificationStatus;
      notes?: string;
      userId?: string;
    },
    supabaseClient?: any
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { error } = await supabase
      .from('exam_sources')
      .update({
        verification_status: params.status,
        verified_by_user_id: params.userId || null,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.sourceId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * 11. Verify or Dispute Claim
   * Factual claim values are protected: cannot silently overwrite without audit trail.
   */
  static async updateClaimVerification(
    params: {
      claimId: string;
      status: ExamClaimVerificationStatus;
      userId?: string;
    },
    supabaseClient?: any
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { error } = await supabase
      .from('exam_claims')
      .update({
        verification_status: params.status,
        verified_by_user_id: params.userId || null,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.claimId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * 12. Discard Unpublished Draft Version
   * Safely removes an unpublished draft version and its isolated draft data.
   * Never permits deletion of published versions, published history, or documents with active publications.
   */
  static async discardDraftVersion(
    versionId: string,
    supabaseClient?: any
  ): Promise<{ success: boolean; deletedVersionId?: string; deletedDocumentId?: string; error?: string }> {
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const { data: ver, error: fetchErr } = await supabase
      .from('exam_doc_versions')
      .select('id, document_id, version_number, review_status, is_published, exam_knowledge_documents:exam_knowledge_documents!document_id(id, status, current_published_version_id)')
      .eq('id', versionId)
      .single();

    if (fetchErr || !ver) {
      return { success: false, error: 'Draft version not found.' };
    }

    if (ver.is_published || ver.review_status === 'PUBLISHED') {
      return { success: false, error: 'Cannot discard published version. Published versions are immutable.' };
    }

    const doc = ver.exam_knowledge_documents as any;
    if (doc?.current_published_version_id === ver.id) {
      return { success: false, error: 'Cannot discard version that is marked as currently published.' };
    }

    // Count how many versions exist for this document
    const { count: versionCount, error: countErr } = await supabase
      .from('exam_doc_versions')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', ver.document_id);

    if (countErr) {
      return { success: false, error: 'Failed to evaluate document version history.' };
    }

    // If this is the only version and the document is not published, remove parent document (cascades cleanly)
    if (versionCount === 1 && doc?.status !== 'PUBLISHED' && !doc?.current_published_version_id) {
      const { error: docDelErr } = await supabase
        .from('exam_knowledge_documents')
        .delete()
        .eq('id', ver.document_id);

      if (docDelErr) {
        return { success: false, error: docDelErr.message };
      }

      return { success: true, deletedVersionId: versionId, deletedDocumentId: ver.document_id };
    }

    // Otherwise, delete only this specific draft version (cascades to claims referencing this version)
    const { error: verDelErr } = await supabase
      .from('exam_doc_versions')
      .delete()
      .eq('id', versionId);

    if (verDelErr) {
      return { success: false, error: verDelErr.message };
    }

    return { success: true, deletedVersionId: versionId };
  }
}
