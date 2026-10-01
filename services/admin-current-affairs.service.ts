/**
 * COURAGE LIBRARY — ADMIN CURRENT AFFAIRS SERVICE
 * Phase CA-3: Admin Current Affairs Studio
 * Architecture Contract: Frozen v1.1.0
 */

import { AdminService } from '@/services/admin.service';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { CurrentAffairsCompilerService } from '@/services/current-affairs-compiler.service';
import { CurrentAffairsValidationService } from '@/services/current-affairs-validation.service';
import { CurrentAffairsImportService } from '@/services/current-affairs-import.service';
import {
  CurrentAffairsCategory,
  CurrentAffairsImportPayload,
  CurrentAffairsImportanceTier,
  CurrentAffairsSourceTier,
  CurrentAffairsStatus,
  AdminCurrentAffairsDashboardStats,
  AdminCurrentAffairsListItem,
  AdminCurrentAffairsListResponse,
  AdminCurrentAffairsFullArticle,
  AdminCurrentAffairsVersionDetail,
  VersionDiffResult,
} from '@/types/current-affairs';
import { Json } from '@/types/database';

export class AdminCurrentAffairsService {
  /**
   * Helper to write audit logs if audit logging table is available
   */
  private static async recordAuditLog(
    actorId: string | null | undefined,
    action: string,
    articleId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const supabase = createAdminServerSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('admin_audit_logs').insert({
        actor_id: actorId || null,
        action,
        entity_type: 'CURRENT_AFFAIR',
        entity_id: articleId,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-blocking fallback for environments without admin_audit_logs table
    }
  }

  /**
   * Fetches high-level operational statistics for the Admin Dashboard
   */
  static async getDashboardStats(): Promise<AdminCurrentAffairsDashboardStats> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      throw new Error('UNAUTHORIZED: Admin or staff privileges required.');
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: articles, error } = await (supabase as any)
      .from('current_affairs_articles')
      .select('id, status');

    if (error || !articles) {
      return {
        total: 0,
        draft: 0,
        inReview: 0,
        approved: 0,
        compiled: 0,
        published: 0,
        archived: 0,
        needsChanges: 0,
      };
    }

    let draft = 0;
    let inReview = 0;
    let approved = 0;
    let compiled = 0;
    let published = 0;
    let archived = 0;
    let needsChanges = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    articles.forEach((a: any) => {
      if (a.status === 'DRAFT') draft++;
      else if (a.status === 'IN_REVIEW') inReview++;
      else if (a.status === 'APPROVED') approved++;
      else if (a.status === 'COMPILED') compiled++;
      else if (a.status === 'PUBLISHED') published++;
      else if (a.status === 'ARCHIVED') archived++;
    });

    // Check versions in DRAFT that have feedback notes / changes requested
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: draftVersions } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('validation_flags')
      .eq('status', 'DRAFT');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    needsChanges = (draftVersions || []).filter((v: any) => v.validation_flags?.change_summary).length;

    return {
      total: articles.length,
      draft,
      inReview,
      approved,
      compiled,
      published,
      archived,
      needsChanges,
    };
  }

  /**
   * Fetches paginated & filtered list of Current Affairs articles for Admin List Table
   */
  static async getArticlesList(params: {
    page?: number;
    limit?: number;
    status?: string;
    category?: string;
    importanceTier?: string;
    examId?: string;
    search?: string;
    date?: string;
  } = {}): Promise<AdminCurrentAffairsListResponse> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      throw new Error('UNAUTHORIZED: Admin or staff privileges required.');
    }

    const supabase = createAdminServerSupabaseClient();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('current_affairs_articles')
      .select(
        `
        id,
        slug,
        news_date,
        category,
        importance_tier,
        status,
        published_at,
        created_at,
        updated_at,
        current_affairs_article_versions (
          id,
          version_number,
          status,
          headline,
          summary_md,
          validation_flags,
          updated_at
        ),
        current_affairs_sources:current_affairs_sources(count),
        current_affairs_exam_mappings:current_affairs_exam_mappings(exam_id)
      `,
        { count: 'exact' }
      );

    if (params.status && params.status !== 'ALL') {
      query = query.eq('status', params.status);
    }
    if (params.category && params.category !== 'ALL') {
      query = query.eq('category', params.category);
    }
    if (params.importanceTier && params.importanceTier !== 'ALL') {
      query = query.eq('importance_tier', params.importanceTier);
    }
    if (params.date) {
      query = query.eq('news_date', params.date);
    }
    if (params.search && params.search.trim()) {
      const term = params.search.trim();
      query = query.or(`slug.ilike.%${term}%`);
    }

    query = query.order('news_date', { ascending: false }).order('created_at', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error || !data) {
      return {
        items: [],
        totalCount: 0,
        page,
        limit,
        totalPages: 1,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: AdminCurrentAffairsListItem[] = data.map((row: any) => {
      const versions = (row.current_affairs_article_versions || []).sort(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any, b: any) => b.version_number - a.version_number
      );
      const latest = versions[0] || {};
      const summaryMd = latest.summary_md || '';
      const summaryPreview = summaryMd.slice(0, 140) + (summaryMd.length > 140 ? '...' : '');

      return {
        id: row.id,
        slug: row.slug,
        newsDate: row.news_date,
        category: row.category as CurrentAffairsCategory,
        importanceTier: row.importance_tier as CurrentAffairsImportanceTier,
        status: row.status as CurrentAffairsStatus,
        publishedAt: row.published_at,
        latestVersionNumber: latest.version_number || 1,
        latestVersionId: latest.id || '',
        latestVersionStatus: (latest.status || row.status) as CurrentAffairsStatus,
        headline: latest.headline || row.slug,
        summaryPreview,
        updatedAt: latest.updated_at || row.updated_at || row.created_at,
        examCount: row.current_affairs_exam_mappings?.length || 0,
        sourceCount: row.current_affairs_sources?.[0]?.count || 0,
        reviewFeedback: latest.validation_flags?.change_summary || null,
      };
    });

    return {
      items,
      totalCount: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit) || 1,
    };
  }

  /**
   * Fetches full article with active version, version history, and all relational mappings
   */
  static async getArticleDetail(
    articleId: string,
    versionId?: string
  ): Promise<AdminCurrentAffairsFullArticle | null> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      throw new Error('UNAUTHORIZED: Admin or staff privileges required.');
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: article, error } = await (supabase as any)
      .from('current_affairs_articles')
      .select('*')
      .eq('id', articleId)
      .maybeSingle();

    if (error || !article) {
      return null;
    }

    // Parallel fetch versions and mappings
    const [versionsRes, taxRes, examRes, learnRes, qRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('current_affairs_article_versions')
        .select('*')
        .eq('article_id', articleId)
        .order('version_number', { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('current_affairs_taxonomy_mappings')
        .select(`
          taxonomy_node_id,
          is_primary,
          relevance_score,
          canonical_taxonomy_nodes (name, slug)
        `)
        .eq('article_id', articleId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('current_affairs_exam_mappings')
        .select(`
          exam_id,
          relevance_weight,
          is_high_yield,
          exams (title, slug)
        `)
        .eq('article_id', articleId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('current_affairs_learning_mappings')
        .select(`
          learning_resource_id,
          learning_resources (title, slug)
        `)
        .eq('article_id', articleId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('current_affairs_question_mappings')
        .select(`
          question_id,
          display_order,
          questions (
            id,
            question_versions (
              content_body
            )
          )
        `)
        .eq('article_id', articleId)
        .order('display_order', { ascending: true }),
    ]);

    const versionsList = versionsRes.data || [];
    if (versionsList.length === 0) return null;

    // Fetch sources for all versions
    const versionIds = versionsList.map((v: { id: string }) => v.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sourcesData } = await (supabase as any)
      .from('current_affairs_sources')
      .select('*')
      .in('version_id', versionIds);

    const sourcesByVersion: Record<string, AdminCurrentAffairsVersionDetail['sources']> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sourcesData || []).forEach((s: any) => {
      if (!sourcesByVersion[s.version_id]) sourcesByVersion[s.version_id] = [];
      sourcesByVersion[s.version_id].push({
        id: s.id,
        title: s.title,
        publisher: s.publisher,
        url: s.url,
        tier: s.tier as CurrentAffairsSourceTier,
        citationContext: s.citation_context,
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedVersions: AdminCurrentAffairsVersionDetail[] = versionsList.map((v: any) => ({
      id: v.id,
      versionNumber: v.version_number,
      status: v.status as CurrentAffairsStatus,
      headline: v.headline,
      summaryMd: v.summary_md,
      keyTakeaways: Array.isArray(v.key_takeaways) ? v.key_takeaways : [],
      importantFacts: Array.isArray(v.important_facts) ? v.important_facts : [],
      examRelevanceNotes: (v.exam_relevance_notes as Record<string, { focus?: string; weight?: string }>) || {},
      compiledAstJson: (v.compiled_ast_json as Record<string, unknown>) || null,
      checksumSha256: v.checksum_sha256,
      createdBy: v.created_by,
      reviewedBy: v.reviewed_by,
      reviewedAt: v.reviewed_at,
      publishedAt: v.published_at,
      createdAt: v.created_at,
      sources: sourcesByVersion[v.id] || [],
    }));

    const activeVersion =
      (versionId ? mappedVersions.find((v) => v.id === versionId) : null) || mappedVersions[0];

    return {
      id: article.id,
      slug: article.slug,
      newsDate: article.news_date,
      category: article.category as CurrentAffairsCategory,
      importanceTier: article.importance_tier as CurrentAffairsImportanceTier,
      status: article.status as CurrentAffairsStatus,
      publishedVersionId: article.published_version_id,
      publishedAt: article.published_at,
      createdAt: article.created_at,
      updatedAt: article.updated_at,
      versions: mappedVersions,
      activeVersion,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      taxonomyMappings: (taxRes.data || []).map((tm: any) => ({
        taxonomyNodeId: tm.taxonomy_node_id,
        nodeName: tm.canonical_taxonomy_nodes?.name || '',
        nodeSlug: tm.canonical_taxonomy_nodes?.slug || '',
        isPrimary: tm.is_primary,
        relevanceScore: tm.relevance_score,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      examMappings: (examRes.data || []).map((em: any) => ({
        examId: em.exam_id,
        examTitle: em.exams?.title || '',
        examSlug: em.exams?.slug || '',
        relevanceWeight: em.relevance_weight,
        isHighYield: em.is_high_yield,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      learningMappings: (learnRes.data || []).map((lm: any) => ({
        learningResourceId: lm.learning_resource_id,
        title: lm.learning_resources?.title || '',
        slug: lm.learning_resources?.slug || '',
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questionMappings: (qRes.data || []).map((qm: any) => ({
        questionId: qm.question_id,
        questionText: qm.questions?.question_versions?.[0]?.content_body || '',
        displayOrder: qm.display_order,
      })),
    };
  }

  /**
   * Creates a new manual Current Affair draft with full 5-gate validation and DRAFT persistence
   */
  static async createManualDraft(payload: CurrentAffairsImportPayload) {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return {
        success: false,
        error: 'UNAUTHORIZED: Admin or staff privileges required.',
      };
    }

    const result = await CurrentAffairsImportService.importDraft(payload, auth.userId || undefined);
    if (result.success && result.articleId) {
      await this.recordAuditLog(auth.userId, 'CREATE_DRAFT', result.articleId, {
        versionNumber: result.versionNumber,
        category: payload.category,
      });
    }
    return result;
  }

  /**
   * Updates an existing DRAFT version with manual edits and runs full validation
   */
  static async saveDraft(
    articleId: string,
    versionId: string,
    payload: CurrentAffairsImportPayload
  ): Promise<{ success: boolean; error?: string; errors?: string[] }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // 1. Verify target version is editable (DRAFT or IN_REVIEW)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: version, error: vErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('status, version_number')
      .eq('id', versionId)
      .eq('article_id', articleId)
      .single();

    if (vErr || !version) {
      return { success: false, error: 'VERSION_NOT_FOUND: Target version does not exist.' };
    }

    if (version.status === 'PUBLISHED') {
      return {
        success: false,
        error: 'IMMUTABLE_VERSION: Published versions cannot be modified directly. Create a revision first.',
      };
    }

    // 2. Validate payload across all 5 gates
    const gateReport = await CurrentAffairsValidationService.runAllGates(payload);
    if (!gateReport.passed) {
      return {
        success: false,
        error: 'VALIDATION_FAILED: Draft edits failed one or more validation gates.',
        errors: gateReport.errors,
      };
    }

    // 3. Update master article fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: aErr } = await (supabase as any)
      .from('current_affairs_articles')
      .update({
        category: payload.category,
        importance_tier: payload.importanceTier || 'MEDIUM',
        news_date: payload.newsDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', articleId);

    if (aErr) {
      return { success: false, error: `ARTICLE_UPDATE_FAILED: ${aErr.message}` };
    }

    // 4. Update version content & checksum
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: vUpdateErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .update({
        headline: payload.headline,
        summary_md: payload.summaryMd,
        key_takeaways: payload.keyTakeaways as unknown as Json,
        important_facts: (payload.importantFacts || []) as unknown as Json,
        exam_relevance_notes: (payload.examRelevanceNotes || {}) as unknown as Json,
        provenance_sources: payload.sources as unknown as Json,
        checksum_sha256: gateReport.checksumSha256,
        validation_flags: {
          gateReport: gateReport.gates,
        } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', versionId);

    if (vUpdateErr) {
      return { success: false, error: `VERSION_UPDATE_FAILED: ${vUpdateErr.message}` };
    }

    // 5. Replace sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('current_affairs_sources').delete().eq('version_id', versionId);
    if (payload.sources && payload.sources.length > 0) {
      const sourcesToInsert = payload.sources.map((s) => ({
        version_id: versionId,
        title: s.title,
        publisher: s.publisher,
        url: s.url,
        tier: s.tier,
        citation_context: s.citationContext || null,
        retrieved_at: s.retrievedAt || new Date().toISOString(),
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('current_affairs_sources').insert(sourcesToInsert);
    }

    // 6. Replace relational mappings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('current_affairs_taxonomy_mappings').delete().eq('article_id', articleId);
    if (payload.taxonomyMappings && payload.taxonomyMappings.length > 0) {
      const taxToInsert = payload.taxonomyMappings.map((tm) => ({
        article_id: articleId,
        taxonomy_node_id: tm.taxonomyNodeId,
        is_primary: Boolean(tm.isPrimary),
        relevance_score: tm.relevanceScore || 1.0,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('current_affairs_taxonomy_mappings').insert(taxToInsert);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('current_affairs_exam_mappings').delete().eq('article_id', articleId);
    if (payload.examMappings && payload.examMappings.length > 0) {
      const examToInsert = payload.examMappings.map((em) => ({
        article_id: articleId,
        exam_id: em.examId,
        relevance_weight: em.relevanceWeight || 'MEDIUM',
        is_high_yield: Boolean(em.isHighYield),
        display_priority: em.displayPriority || 100,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('current_affairs_exam_mappings').insert(examToInsert);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('current_affairs_learning_mappings').delete().eq('article_id', articleId);
    if (payload.learningMappings && payload.learningMappings.length > 0) {
      const learnToInsert = payload.learningMappings.map((lm) => ({
        article_id: articleId,
        learning_resource_id: lm.learningResourceId,
        display_order: lm.displayOrder || 1,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('current_affairs_learning_mappings').insert(learnToInsert);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('current_affairs_question_mappings').delete().eq('article_id', articleId);
    if (payload.questionMappings && payload.questionMappings.length > 0) {
      const qToInsert = payload.questionMappings.map((qm) => ({
        article_id: articleId,
        question_id: qm.questionId,
        display_order: qm.displayOrder || 1,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('current_affairs_question_mappings').insert(qToInsert);
    }

    await this.recordAuditLog(auth.userId, 'SAVE_DRAFT', articleId, {
      versionId,
      versionNumber: version.version_number,
    });

    return { success: true };
  }

  /**
   * Submits a DRAFT version for review
   */
  static async submitForReview(articleId: string, versionId: string): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('current_affairs_article_versions')
      .update({ status: 'IN_REVIEW' })
      .eq('id', versionId)
      .eq('article_id', articleId)
      .eq('status', 'DRAFT');

    if (error) {
      return { success: false, error: `TRANSITION_FAILED: ${error.message}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('current_affairs_articles')
      .update({ status: 'IN_REVIEW' })
      .eq('id', articleId);

    await this.recordAuditLog(auth.userId, 'SUBMIT_FOR_REVIEW', articleId, { versionId });

    return { success: true };
  }

  /**
   * Requests changes on an IN_REVIEW version, moving it back to DRAFT without incrementing revision number
   */
  static async requestChanges(
    articleId: string,
    versionId: string,
    feedback: string
  ): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('current_affairs_article_versions')
      .update({
        status: 'DRAFT',
        validation_flags: { change_summary: feedback || 'Changes requested during editorial review.' },
      })
      .eq('id', versionId)
      .eq('article_id', articleId)
      .eq('status', 'IN_REVIEW');

    if (error) {
      return { success: false, error: `REQUEST_CHANGES_FAILED: ${error.message}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('current_affairs_articles')
      .update({ status: 'DRAFT' })
      .eq('id', articleId);

    await this.recordAuditLog(auth.userId, 'REQUEST_CHANGES', articleId, { versionId, feedback });

    return { success: true };
  }

  /**
   * Approves an IN_REVIEW version after human checklist completion
   */
  static async approveDraft(articleId: string, versionId: string): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('current_affairs_article_versions')
      .update({
        status: 'APPROVED',
        reviewed_by: auth.userId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', versionId)
      .eq('article_id', articleId)
      .eq('status', 'IN_REVIEW');

    if (error) {
      return { success: false, error: `APPROVAL_FAILED: ${error.message}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('current_affairs_articles')
      .update({ status: 'APPROVED' })
      .eq('id', articleId);

    await this.recordAuditLog(auth.userId, 'APPROVE_DRAFT', articleId, { versionId });

    return { success: true };
  }

  /**
   * Compiles AST for an APPROVED version
   */
  static async compileVersion(
    articleId: string,
    versionId: string
  ): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: version, error: fetchErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('*')
      .eq('id', versionId)
      .eq('article_id', articleId)
      .single();

    if (fetchErr || !version) {
      return { success: false, error: 'VERSION_NOT_FOUND: Target version does not exist.' };
    }

    if (version.status !== 'APPROVED' && version.status !== 'COMPILED') {
      return {
        success: false,
        error: `INVALID_STATE: Only APPROVED or COMPILED versions can be compiled (current: ${version.status}).`,
      };
    }

    const compileRes = CurrentAffairsCompilerService.compileToAst(
      version.headline,
      version.summary_md,
      Array.isArray(version.key_takeaways) ? (version.key_takeaways as string[]) : [],
      Array.isArray(version.important_facts) ? (version.important_facts as string[]) : []
    );

    if (!compileRes.isCompiled || !compileRes.compiledAstJson) {
      return { success: false, error: compileRes.error || 'AST compilation failed.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: vUpdateErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .update({
        status: 'COMPILED',
        compiled_ast_json: compileRes.compiledAstJson as unknown as Json,
      })
      .eq('id', versionId);

    if (vUpdateErr) {
      return { success: false, error: `VERSION_COMPILE_FAILED: ${vUpdateErr.message}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('current_affairs_articles')
      .update({ status: 'COMPILED' })
      .eq('id', articleId);

    await this.recordAuditLog(auth.userId, 'COMPILE_VERSION', articleId, { versionId });

    return { success: true };
  }

  /**
   * Compiles AST and publishes version atomically to production
   */
  static async compileAndPublish(
    articleId: string,
    versionId: string
  ): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // 1. Fetch version details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: version, error: fetchErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('*')
      .eq('id', versionId)
      .eq('article_id', articleId)
      .single();

    if (fetchErr || !version) {
      return { success: false, error: 'VERSION_NOT_FOUND: Target version does not exist.' };
    }

    if (version.status !== 'APPROVED' && version.status !== 'COMPILED') {
      return {
        success: false,
        error: `INVALID_STATE: Only APPROVED or COMPILED versions can be published (current: ${version.status}).`,
      };
    }

    // 2. Compile AST
    const compileRes = CurrentAffairsCompilerService.compileToAst(
      version.headline,
      version.summary_md,
      Array.isArray(version.key_takeaways) ? (version.key_takeaways as string[]) : [],
      Array.isArray(version.important_facts) ? (version.important_facts as string[]) : []
    );

    if (!compileRes.isCompiled || !compileRes.compiledAstJson) {
      return { success: false, error: compileRes.error || 'AST compilation failed.' };
    }

    const publishedAt = new Date().toISOString();

    // 3. Atomically update version to PUBLISHED
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: vUpdateErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .update({
        status: 'PUBLISHED',
        compiled_ast_json: compileRes.compiledAstJson as unknown as Json,
        published_at: publishedAt,
      })
      .eq('id', versionId);

    if (vUpdateErr) {
      return { success: false, error: `VERSION_PUBLISH_FAILED: ${vUpdateErr.message}` };
    }

    // 4. Update master item publication pointer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: aUpdateErr } = await (supabase as any)
      .from('current_affairs_articles')
      .update({
        status: 'PUBLISHED',
        published_version_id: versionId,
        published_at: publishedAt,
      })
      .eq('id', articleId);

    if (aUpdateErr) {
      return { success: false, error: `POINTER_UPDATE_FAILED: ${aUpdateErr.message}` };
    }

    await this.recordAuditLog(auth.userId, 'PUBLISH_ARTICLE', articleId, {
      versionId,
      versionNumber: version.version_number,
    });

    // Freshness & ISR Cache Invalidation
    try {
      revalidatePath('/current-affairs');
      revalidatePath('/sitemap.xml');
      const { data: artRecord } = await (supabase as any)
        .from('current_affairs_articles')
        .select('slug, news_date')
        .eq('id', articleId)
        .maybeSingle();

      if (artRecord?.slug) {
        revalidatePath(`/current-affairs/${artRecord.slug}`);
      }
      if (artRecord?.news_date) {
        const dateStr = String(artRecord.news_date).split('T')[0];
        revalidatePath(`/current-affairs/date/${dateStr}`);
        revalidatePath(`/current-affairs/month/${dateStr.substring(0, 7)}`);
      }
    } catch {
      // Ignore in non-request background contexts
    }

    return { success: true };
  }

  /**
   * Clones a published article into v(N+1) in DRAFT state
   */
  static async createRevision(
    articleId: string
  ): Promise<{ success: boolean; nextVersionId?: string; versionNumber?: number; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // 1. Fetch latest version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latestVersion, error: fetchErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('*')
      .eq('article_id', articleId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !latestVersion) {
      return { success: false, error: 'ARTICLE_NOT_FOUND: No versions exist for this article.' };
    }

    const nextVersionNumber = latestVersion.version_number + 1;

    // 2. Insert new draft version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newVersion, error: insertErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .insert({
        article_id: articleId,
        version_number: nextVersionNumber,
        headline: latestVersion.headline,
        summary_md: latestVersion.summary_md,
        key_takeaways: latestVersion.key_takeaways,
        important_facts: latestVersion.important_facts,
        exam_relevance_notes: latestVersion.exam_relevance_notes,
        provenance_sources: latestVersion.provenance_sources,
        validation_flags: latestVersion.validation_flags,
        checksum_sha256: latestVersion.checksum_sha256,
        status: 'DRAFT',
        created_by: auth.userId || null,
      })
      .select('id, version_number')
      .single();

    if (insertErr || !newVersion) {
      return { success: false, error: `REVISION_CREATION_FAILED: ${insertErr?.message}` };
    }

    // 3. Clone sources to new version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prevSources } = await (supabase as any)
      .from('current_affairs_sources')
      .select('*')
      .eq('version_id', latestVersion.id);

    if (prevSources && prevSources.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clonedSources = prevSources.map((s: any) => ({
        version_id: newVersion.id,
        title: s.title,
        publisher: s.publisher,
        url: s.url,
        tier: s.tier,
        citation_context: s.citation_context,
        retrieved_at: s.retrieved_at,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('current_affairs_sources').insert(clonedSources);
    }

    await this.recordAuditLog(auth.userId, 'CREATE_REVISION', articleId, {
      newVersionId: newVersion.id,
      versionNumber: newVersion.version_number,
    });

    return {
      success: true,
      nextVersionId: newVersion.id,
      versionNumber: newVersion.version_number,
    };
  }

  /**
   * Soft-archives a published article (retains historical attempts and AST)
   */
  static async archiveItem(articleId: string): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('current_affairs_articles')
      .update({ status: 'ARCHIVED' })
      .eq('id', articleId);

    if (error) {
      return { success: false, error: `ARCHIVE_FAILED: ${error.message}` };
    }

    await this.recordAuditLog(auth.userId, 'ARCHIVE_ARTICLE', articleId);

    // Freshness & ISR Cache Invalidation
    try {
      revalidatePath('/current-affairs');
      revalidatePath('/sitemap.xml');
      const { data: artRecord } = await (supabase as any)
        .from('current_affairs_articles')
        .select('slug, news_date')
        .eq('id', articleId)
        .maybeSingle();

      if (artRecord?.slug) {
        revalidatePath(`/current-affairs/${artRecord.slug}`);
      }
      if (artRecord?.news_date) {
        const dateStr = String(artRecord.news_date).split('T')[0];
        revalidatePath(`/current-affairs/date/${dateStr}`);
        revalidatePath(`/current-affairs/month/${dateStr.substring(0, 7)}`);
      }
    } catch {
      // Ignore in non-request background contexts
    }

    return { success: true };
  }

  /**
   * Discards an unapproved DRAFT or IN_REVIEW version
   */
  static async discardDraft(articleId: string, versionId: string): Promise<{ success: boolean; error?: string }> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
    }

    const supabase = createAdminServerSupabaseClient();

    // Check version status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: version } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('status, version_number')
      .eq('id', versionId)
      .single();

    if (!version || version.status === 'PUBLISHED') {
      return {
        success: false,
        error: 'DISCARD_FORBIDDEN: Published versions cannot be deleted.',
      };
    }

    // Delete version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: delErr } = await (supabase as any)
      .from('current_affairs_article_versions')
      .delete()
      .eq('id', versionId);

    if (delErr) {
      return { success: false, error: delErr.message };
    }

    // If v1 was deleted and no other versions exist, delete master item
    if (version.version_number === 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from('current_affairs_article_versions')
        .select('*', { count: 'exact', head: true })
        .eq('article_id', articleId);

      if (count === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('current_affairs_articles').delete().eq('id', articleId);
      }
    }

    await this.recordAuditLog(auth.userId, 'DISCARD_DRAFT', articleId, { versionId });

    return { success: true };
  }

  /**
   * Compares two versions of the same article and produces a diff
   */
  static async compareVersions(
    articleId: string,
    v1Number: number,
    v2Number: number
  ): Promise<VersionDiffResult | null> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      throw new Error('UNAUTHORIZED: Admin or staff privileges required.');
    }

    const supabase = createAdminServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: versions, error } = await (supabase as any)
      .from('current_affairs_article_versions')
      .select('*')
      .eq('article_id', articleId)
      .in('version_number', [v1Number, v2Number]);

    if (error || !versions || versions.length < 2) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v1 = versions.find((v: any) => v.version_number === v1Number);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v2 = versions.find((v: any) => v.version_number === v2Number);
    if (!v1 || !v2) return null;

    const v1Takeaways: string[] = Array.isArray(v1.key_takeaways) ? v1.key_takeaways : [];
    const v2Takeaways: string[] = Array.isArray(v2.key_takeaways) ? v2.key_takeaways : [];

    const v1Facts: string[] = Array.isArray(v1.important_facts) ? v1.important_facts : [];
    const v2Facts: string[] = Array.isArray(v2.important_facts) ? v2.important_facts : [];

    // Diff takeaways
    const addedTakeaways = v2Takeaways.filter((t) => !v1Takeaways.includes(t));
    const removedTakeaways = v1Takeaways.filter((t) => !v2Takeaways.includes(t));
    const unchangedTakeaways = v2Takeaways.filter((t) => v1Takeaways.includes(t));

    // Diff facts
    const addedFacts = v2Facts.filter((f) => !v1Facts.includes(f));
    const removedFacts = v1Facts.filter((f) => !v2Facts.includes(f));
    const unchangedFacts = v2Facts.filter((f) => v1Facts.includes(f));

    // Diff sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: v1Sources } = await (supabase as any)
      .from('current_affairs_sources')
      .select('title, url')
      .eq('version_id', v1.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: v2Sources } = await (supabase as any)
      .from('current_affairs_sources')
      .select('title, url')
      .eq('version_id', v2.id);

    const s1List = v1Sources || [];
    const s2List = v2Sources || [];

    const s1Urls = new Set(s1List.map((s: { url: string }) => s.url));
    const s2Urls = new Set(s2List.map((s: { url: string }) => s.url));

    const addedSources = s2List.filter((s: { url: string }) => !s1Urls.has(s.url));
    const removedSources = s1List.filter((s: { url: string }) => !s2Urls.has(s.url));

    return {
      v1Number,
      v2Number,
      headlineChanged: v1.headline !== v2.headline,
      headline: { from: v1.headline, to: v2.headline },
      summaryChanged: v1.summary_md !== v2.summary_md,
      summary: { from: v1.summary_md, to: v2.summary_md },
      keyTakeawaysDiff: {
        added: addedTakeaways,
        removed: removedTakeaways,
        unchanged: unchangedTakeaways,
      },
      importantFactsDiff: {
        added: addedFacts,
        removed: removedFacts,
        unchanged: unchangedFacts,
      },
      sourcesDiff: {
        added: addedSources,
        removed: removedSources,
      },
    };
  }
}
