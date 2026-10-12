/**
 * COURAGE LIBRARY — ADMIN QUESTION FACTORY SERVICE
 * Phase QF-1: Question Factory Core
 *
 * Server-side orchestration for the Question Factory admin studio:
 * generate prompt → import (dry-run / commit) → review queue → transitions → atomic publish.
 *
 * INVARIANTS:
 * - Every public method begins with AdminService.checkIsAdminOrStaff() (D11).
 * - The service-role client is created here, server-side only; never sent to the client.
 * - Lifecycle writes go exclusively through the QF SQL functions.
 * - Every mutation writes admin_audit_logs (actor_id, actor_email, action_type,
 *   target_entity, target_id, old_value, new_value, reason); insert failures are
 *   logged as a non-sensitive warning, never silently swallowed.
 */

import { AdminService } from '@/services/admin.service';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import {
  QuestionAuthoringItem,
  QuestionAuthoringTarget,
  QuestionContextRequest,
  QuestionCoverageRow,
  QuestionDifficulty,
  QuestionFactoryError,
  QuestionImportMode,
  QuestionImportResult,
  QuestionItemGateReport,
  QuestionLifecycleStatus,
  QuestionOrigin,
  QuestionReviewChecklist,
  QuestionReviewQueueFilters,
  QuestionReviewQueueItem,
  QuestionVersionDetail,
  QUESTION_CONTRACT_VERSION,
  QUESTION_SPEC_VERSION,
  QF_DIFFICULTIES,
  QF_LIFECYCLE_STATUSES,
  QF_REVIEW_CHECKLIST_ITEMS,
  QF_REVIEW_TRANSITIONS,
  QF_STEM_PREVIEW_CHARS,
} from '@/types/question-factory';
import { QuestionContextBuilder } from './question-context-builder.service';
import { QuestionPromptBuilder, QuestionPromptResult } from './question-prompt-builder.service';
import { QuestionTaxonomyResolver } from './question-taxonomy-resolver';
import { QuestionValidationService, QUESTION_GATE_IDS } from './question-validation.service';
import {
  QuestionFactoryImporterService,
  createDbGateLookups,
  fetchCognitiveTrapCodes,
} from './question-factory-importer.service';

type SupabaseLike = any;

interface AdminContext {
  userId: string;
  userEmail: string;
  supabase: SupabaseLike;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

function preview(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > QF_STEM_PREVIEW_CHARS ? `${t.slice(0, QF_STEM_PREVIEW_CHARS)}…` : t;
}

function fail<T>(errorCode: string, error: string): ServiceResult<T> {
  return { success: false, errorCode, error };
}

function extractQfCode(message: string | undefined): string {
  return QuestionFactoryImporterService.extractQfCode(message) || 'OPERATION_FAILED';
}

export class AdminQuestionFactoryService {
  // ---------------------------------------------------------------------------
  // Auth + audit
  // ---------------------------------------------------------------------------
  private static async requireAdmin(): Promise<AdminContext> {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin || !auth.userId) {
      throw new QuestionFactoryError('UNAUTHORIZED', 'Unauthorized: administrative staff privileges required.');
    }
    return { userId: auth.userId, userEmail: auth.userEmail || 'unknown', supabase: createAdminServerSupabaseClient() };
  }

  private static async audit(
    ctx: AdminContext,
    actionType: string,
    targetId: string | null,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
    reason: string | null = null
  ): Promise<void> {
    const { error } = await ctx.supabase.from('admin_audit_logs').insert({
      actor_id: ctx.userId,
      actor_email: ctx.userEmail,
      action_type: actionType,
      target_entity: 'question_version',
      target_id: targetId,
      old_value: oldValue,
      new_value: newValue,
      reason,
    });
    if (error) {
      console.warn(`[AdminQuestionFactoryService] audit log insert failed for action ${actionType}: ${error.code || 'unknown'}`);
    }
  }

  private static async guard<T>(fn: (ctx: AdminContext) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
    let ctx: AdminContext;
    try {
      ctx = await this.requireAdmin();
    } catch (err) {
      if (err instanceof QuestionFactoryError) return fail(err.code, err.message);
      return fail('UNAUTHORIZED', 'Unauthorized.');
    }
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof QuestionFactoryError) return fail(err.code, err.message);
      return fail('OPERATION_FAILED', err instanceof Error ? err.message : 'Operation failed.');
    }
  }

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------
  static async getTaxonomyTree() {
    return this.guard(async (ctx) => ({
      success: true,
      data: await new QuestionTaxonomyResolver(ctx.supabase).listTaxonomyTree(),
    }));
  }

  static async generatePrompt(request: QuestionContextRequest): Promise<ServiceResult<QuestionPromptResult & { contextCharacters: number }>> {
    return this.guard(async (ctx) => {
      const context = await QuestionContextBuilder.buildContext(ctx.supabase, request);
      const prompt = QuestionPromptBuilder.buildPrompt(context);
      return { success: true, data: { ...prompt, contextCharacters: context.contextCharacters } };
    });
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------
  static async importAiPayload(rawInput: string, mode: QuestionImportMode): Promise<ServiceResult<QuestionImportResult>> {
    return this.guard(async (ctx) => {
      const result = await QuestionFactoryImporterService.run({
        mode,
        origin: 'AI_EXTERNAL',
        actorId: ctx.userId,
        supabase: ctx.supabase,
        rawInput,
      });
      if (mode === 'commit' && result.status === 'IMPORTED') {
        await this.audit(ctx, 'QF_IMPORT_DRAFTS', result.batchId ?? null, null, {
          origin: 'AI_EXTERNAL',
          accepted: result.report.acceptedCount,
          rejected: result.report.rejectedCount,
        });
      }
      return { success: result.status !== 'REJECTED', data: result, error: result.errorMessage, errorCode: result.errorCode };
    });
  }

  /** Manual single-question creation (admin question manager) → DRAFT via the same gates. */
  static async createManualDraft(target: QuestionAuthoringTarget, item: QuestionAuthoringItem): Promise<ServiceResult<QuestionImportResult>> {
    return this.guard(async (ctx) => {
      const spec = {
        specVersion: QUESTION_SPEC_VERSION,
        contractVersion: QUESTION_CONTRACT_VERSION,
        contextHash: '',
        target,
        items: [item],
      };
      const result = await QuestionFactoryImporterService.run({
        mode: 'commit',
        origin: 'MANUAL',
        actorId: ctx.userId,
        supabase: ctx.supabase,
        spec,
      });
      if (result.status === 'IMPORTED') {
        await this.audit(ctx, 'QF_CREATE_MANUAL_DRAFT', result.imported?.[0]?.versionId ?? null, null, { origin: 'MANUAL' });
      }
      return { success: result.status === 'IMPORTED', data: result, error: result.errorMessage ?? result.report.items[0]?.errors.join(' '), errorCode: result.errorCode };
    });
  }

  // ---------------------------------------------------------------------------
  // Review queue
  // ---------------------------------------------------------------------------
  static async listReviewQueue(filters: QuestionReviewQueueFilters = {}): Promise<ServiceResult<QuestionReviewQueueItem[]>> {
    return this.guard(async (ctx) => {
      let query = ctx.supabase
        .from('question_versions')
        .select(
          'id, question_id, version_number, question_text, difficulty, language, lifecycle_status, created_at, questions!inner(canonical_topic_id, topics(name)), question_version_authoring!inner(origin, import_batch_id)'
        )
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));

      if (filters.lifecycleStatus) {
        if (!QF_LIFECYCLE_STATUSES.includes(filters.lifecycleStatus)) return fail('INVALID_FILTER', 'Unknown lifecycle status.');
        query = query.eq('lifecycle_status', filters.lifecycleStatus);
      } else {
        query = query.in('lifecycle_status', ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED']);
      }
      if (filters.origin) query = query.eq('question_version_authoring.origin', filters.origin);
      if (filters.topicId) query = query.eq('questions.canonical_topic_id', filters.topicId);
      if (filters.batchId) query = query.eq('question_version_authoring.import_batch_id', filters.batchId);

      if (filters.examId) {
        const { data: maps, error: mapErr } = await ctx.supabase
          .from('exam_question_mappings')
          .select('question_id')
          .eq('exam_id', filters.examId);
        if (mapErr) return fail('LOOKUP_FAILED', mapErr.message);
        const ids = (maps || []).map((m: { question_id: string }) => m.question_id);
        if (ids.length === 0) return { success: true, data: [] };
        query = query.in('question_id', ids);
      }

      const { data, error } = await query;
      if (error) return fail('LOOKUP_FAILED', error.message);
      return { success: true, data: (data || []).map((r: Record<string, unknown>) => this.toQueueItem(r)) };
    });
  }

  private static toQueueItem(r: Record<string, unknown>): QuestionReviewQueueItem {
    const q = (Array.isArray(r.questions) ? r.questions[0] : r.questions) as
      | { canonical_topic_id?: string; topics?: { name?: string } | Array<{ name?: string }> }
      | undefined;
    const topic = Array.isArray(q?.topics) ? q?.topics[0] : q?.topics;
    const authoring = this.authoringOf(r);
    return {
      versionId: r.id as string,
      questionId: r.question_id as string,
      versionNumber: r.version_number as number,
      stemPreview: preview(r.question_text as string),
      difficulty: r.difficulty as string,
      language: r.language as string,
      lifecycleStatus: r.lifecycle_status as QuestionLifecycleStatus,
      origin: (authoring.origin as QuestionOrigin) ?? 'LEGACY_UNKNOWN',
      topicId: q?.canonical_topic_id ?? null,
      topicName: topic?.name ?? null,
      importBatchId: (authoring.import_batch_id as string) ?? null,
      createdAt: r.created_at as string,
    };
  }

  /** Internal authoring/review record (question_version_authoring, service-role only). */
  private static authoringOf(r: Record<string, unknown>): Record<string, unknown> {
    const a = r.question_version_authoring;
    return ((Array.isArray(a) ? a[0] : a) || {}) as Record<string, unknown>;
  }

  static async getVersionDetail(versionId: string): Promise<ServiceResult<QuestionVersionDetail>> {
    return this.guard(async (ctx) => {
      const detail = await this.loadVersionDetail(ctx, versionId);
      return detail ? { success: true, data: detail } : fail('QF_VERSION_NOT_FOUND', 'Question version not found.');
    });
  }

  private static async loadVersionDetail(ctx: AdminContext, versionId: string): Promise<QuestionVersionDetail | null> {
    const { data, error } = await ctx.supabase
      .from('question_versions')
      .select(
        '*, questions!inner(canonical_topic_id, topics(name)), question_options(option_key, option_text, order_index), question_answers(correct_option_key, explanation_md), question_version_authoring(*)'
      )
      .eq('id', versionId)
      .maybeSingle();
    if (error) throw new QuestionFactoryError('LOOKUP_FAILED', error.message);
    if (!data) return null;

    const base = this.toQueueItem(data);
    const answer = Array.isArray(data.question_answers) ? data.question_answers[0] : data.question_answers;
    const options = [...(data.question_options || [])]
      .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
      .map((o: { option_key: string; option_text: string }) => ({ key: o.option_key, text: o.option_text }));

    const authoring = this.authoringOf(data);
    let gateReport: QuestionItemGateReport | null = null;
    if (authoring.import_batch_id) {
      const { data: batch, error: batchErr } = await ctx.supabase
        .from('question_import_batches')
        .select('gate_report')
        .eq('id', authoring.import_batch_id)
        .maybeSingle();
      if (batchErr) throw new QuestionFactoryError('LOOKUP_FAILED', batchErr.message);
      const meta = (authoring.authoring_metadata || {}) as Record<string, unknown>;
      const items = ((batch?.gate_report as { items?: QuestionItemGateReport[] } | null)?.items || []) as QuestionItemGateReport[];
      const clientRef = typeof meta.clientRef === 'string' ? meta.clientRef : null;
      gateReport = (clientRef && items.find((i) => i.clientRef === clientRef)) || null;
    }

    return {
      ...base,
      stem: data.question_text,
      options,
      correctKey: answer?.correct_option_key ?? null,
      explanationMd: answer?.explanation_md ?? null,
      authoringMetadata: (authoring.authoring_metadata as Record<string, unknown>) || {},
      contractVersion: (authoring.contract_version as string) ?? null,
      contextHash: (authoring.context_hash as string) ?? null,
      reviewedBy: (authoring.reviewed_by as string) ?? null,
      reviewedAt: (authoring.reviewed_at as string) ?? null,
      reviewNotes: (authoring.review_notes as string) ?? null,
      gateReport,
      publishedAt: data.published_at ?? null,
      isCurrent: Boolean(data.is_current),
    };
  }

  private static async getLifecycle(ctx: AdminContext, versionId: string): Promise<QuestionLifecycleStatus> {
    const { data, error } = await ctx.supabase
      .from('question_versions')
      .select('id, lifecycle_status')
      .eq('id', versionId)
      .maybeSingle();
    if (error) throw new QuestionFactoryError('LOOKUP_FAILED', error.message);
    if (!data) throw new QuestionFactoryError('QF_VERSION_NOT_FOUND', 'Question version not found.');
    return data.lifecycle_status as QuestionLifecycleStatus;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------
  private static async transition(
    to: QuestionLifecycleStatus,
    versionId: string,
    notes: string | null,
    checklist: QuestionReviewChecklist | null
  ): Promise<ServiceResult<{ versionId: string; from: QuestionLifecycleStatus; to: QuestionLifecycleStatus }>> {
    return this.guard(async (ctx) => {
      const from = await this.getLifecycle(ctx, versionId);
      if (!QF_REVIEW_TRANSITIONS[from]?.includes(to)) {
        return fail('QF_ILLEGAL_TRANSITION', `${from} → ${to} is not allowed.`);
      }
      if (to === 'APPROVED') {
        const missing = QF_REVIEW_CHECKLIST_ITEMS.filter((i) => checklist?.[i.id] !== true);
        if (!checklist || missing.length > 0) {
          return fail('QF_CHECKLIST_REQUIRED', `Reviewer checklist incomplete: ${missing.map((m) => m.label).join('; ')}.`);
        }
      }
      if ((to === 'CHANGES_REQUESTED' || to === 'REJECTED') && !String(notes || '').trim()) {
        return fail('QF_NOTES_REQUIRED', `${to} requires reviewer notes.`);
      }

      const { data, error } = await ctx.supabase.rpc('fn_transition_question_version', {
        p_version_id: versionId,
        p_to: to,
        p_actor: ctx.userId,
        p_notes: notes,
        p_checklist: checklist,
      });
      if (error || !data?.success) return fail(extractQfCode(error?.message), error?.message || 'Transition failed.');

      await this.audit(ctx, `QF_TRANSITION_${to}`, versionId, { lifecycle_status: from }, { lifecycle_status: to }, notes);
      return { success: true, data: { versionId, from, to } };
    });
  }

  static submitForReview(versionId: string, notes?: string) {
    return this.transition('IN_REVIEW', versionId, notes ?? null, null);
  }

  static requestChanges(versionId: string, notes: string) {
    return this.transition('CHANGES_REQUESTED', versionId, notes, null);
  }

  static approve(versionId: string, checklist: QuestionReviewChecklist, notes?: string) {
    return this.transition('APPROVED', versionId, notes ?? null, checklist);
  }

  static reject(versionId: string, notes: string) {
    return this.transition('REJECTED', versionId, notes, null);
  }

  // ---------------------------------------------------------------------------
  // Edit draft (re-runs G1, G2, G5) & revisions
  // ---------------------------------------------------------------------------
  private static async gateSingleItem(
    ctx: AdminContext,
    item: QuestionAuthoringItem,
    topicId: string,
    excludeQuestionId: string | null
  ): Promise<{ ok: boolean; errors: string[]; warnings: string[]; sanitized: QuestionAuthoringItem | null }> {
    const cognitiveTrapCodes = await fetchCognitiveTrapCodes(ctx.supabase);
    const report = await QuestionValidationService.validateBatch(
      {
        specVersion: QUESTION_SPEC_VERSION,
        contractVersion: QUESTION_CONTRACT_VERSION,
        contextHash: '',
        target: { topicId },
        items: [item],
      },
      createDbGateLookups(ctx.supabase, { excludeQuestionId }),
      { origin: 'MANUAL', requireContextHash: false, cognitiveTrapCodes }
    );
    const ir = report.items[0];
    // Edits re-run G1/G2/G5 (+ G4 provenance); G3 target is unchanged by an edit.
    const relevant = QUESTION_GATE_IDS.filter((g) => g !== 'GATE_3_TAXONOMY');
    const errors = [
      ...report.errors,
      ...(ir ? relevant.flatMap((g) => ir.gates[g].errors.map((e) => `[${g}] ${e}`)) : ['Item was not evaluated.']),
    ];
    return {
      ok: errors.length === 0,
      errors,
      warnings: ir?.warnings ?? [],
      sanitized: ir?.normalizedItem ?? null,
    };
  }

  private static async topicOfVersion(ctx: AdminContext, versionId: string): Promise<{ questionId: string; topicId: string; lifecycle: QuestionLifecycleStatus }> {
    const { data, error } = await ctx.supabase
      .from('question_versions')
      .select('id, question_id, lifecycle_status, questions!inner(canonical_topic_id)')
      .eq('id', versionId)
      .maybeSingle();
    if (error) throw new QuestionFactoryError('LOOKUP_FAILED', error.message);
    if (!data) throw new QuestionFactoryError('QF_VERSION_NOT_FOUND', 'Question version not found.');
    const q = Array.isArray(data.questions) ? data.questions[0] : data.questions;
    return { questionId: data.question_id, topicId: q.canonical_topic_id, lifecycle: data.lifecycle_status };
  }

  static async editDraft(versionId: string, item: QuestionAuthoringItem): Promise<ServiceResult<{ versionId: string; warnings: string[] }>> {
    return this.guard(async (ctx) => {
      const info = await this.topicOfVersion(ctx, versionId);
      if (info.lifecycle !== 'DRAFT' && info.lifecycle !== 'CHANGES_REQUESTED') {
        return fail('QF_ILLEGAL_TRANSITION', `Only DRAFT or CHANGES_REQUESTED versions can be edited (current: ${info.lifecycle}).`);
      }
      const gated = await this.gateSingleItem(ctx, item, info.topicId, info.questionId);
      if (!gated.ok || !gated.sanitized) return fail('GATES_FAILED', gated.errors.join(' '));

      const s = gated.sanitized;
      const { data, error } = await ctx.supabase.rpc('fn_update_question_draft', {
        p_version_id: versionId,
        p_actor: ctx.userId,
        p_payload: this.toPayload(s, gated.warnings),
      });
      if (error || !data?.success) return fail(extractQfCode(error?.message), error?.message || 'Edit failed.');
      await this.audit(ctx, 'QF_EDIT_DRAFT', versionId, { lifecycle_status: info.lifecycle }, { lifecycle_status: 'DRAFT' });
      return { success: true, data: { versionId, warnings: gated.warnings } };
    });
  }

  /** New DRAFT version of an existing (typically published) question — never edits in place. */
  static async createRevision(questionId: string, item: QuestionAuthoringItem): Promise<ServiceResult<{ versionId: string; warnings: string[] }>> {
    return this.guard(async (ctx) => {
      const { data: q, error: qErr } = await ctx.supabase
        .from('questions')
        .select('id, canonical_topic_id')
        .eq('id', questionId)
        .maybeSingle();
      if (qErr) return fail('LOOKUP_FAILED', qErr.message);
      if (!q) return fail('QF_QUESTION_NOT_FOUND', 'Question not found.');

      const gated = await this.gateSingleItem(ctx, item, q.canonical_topic_id, questionId);
      if (!gated.ok || !gated.sanitized) return fail('GATES_FAILED', gated.errors.join(' '));

      const { data, error } = await ctx.supabase.rpc('fn_create_question_revision', {
        p_question_id: questionId,
        p_actor: ctx.userId,
        p_payload: this.toPayload(gated.sanitized, gated.warnings),
      });
      if (error || !data?.success) return fail(extractQfCode(error?.message), error?.message || 'Revision failed.');
      await this.audit(ctx, 'QF_CREATE_REVISION', data.version_id, null, { question_id: questionId, version_number: data.version_number });
      return { success: true, data: { versionId: data.version_id, warnings: gated.warnings } };
    });
  }

  private static toPayload(s: QuestionAuthoringItem, warnings: string[]): Record<string, unknown> {
    return {
      stem: s.stem,
      difficulty: s.difficulty,
      language: s.language,
      options: s.options.map((o) => ({ key: o.key, text: o.text })),
      correct_key: s.correctKey,
      explanation_md: s.explanationMd,
      authoring_metadata: {
        sourceType: s.sourceType,
        distractorRationale: s.distractorRationale ?? null,
        cognitiveTrap: s.cognitiveTrap ?? null,
        pyq: s.pyq ?? null,
        gateWarnings: warnings,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Publish
  // ---------------------------------------------------------------------------
  static async publish(versionId: string): Promise<ServiceResult<{ versionId: string; supersededVersionId: string | null }>> {
    return this.guard(async (ctx) => {
      const from = await this.getLifecycle(ctx, versionId);
      if (from !== 'APPROVED') {
        return fail('QF_ILLEGAL_TRANSITION', `Only APPROVED versions can be published (current: ${from}).`);
      }
      const { data, error } = await ctx.supabase.rpc('fn_publish_question_version', {
        p_version_id: versionId,
        p_actor: ctx.userId,
      });
      if (error || !data?.success) return fail(extractQfCode(error?.message), error?.message || 'Publish failed.');
      await this.audit(ctx, 'QF_PUBLISH', versionId, { lifecycle_status: from }, {
        lifecycle_status: 'PUBLISHED',
        superseded_version_id: data.superseded_version_id ?? null,
      });
      return { success: true, data: { versionId, supersededVersionId: data.superseded_version_id ?? null } };
    });
  }

  // ---------------------------------------------------------------------------
  // Coverage (read-only)
  // ---------------------------------------------------------------------------
  static async getCoverage(subjectId?: string): Promise<ServiceResult<QuestionCoverageRow[]>> {
    return this.guard(async (ctx) => {
      let topicQuery = ctx.supabase.from('topics').select('id, name, subject_id').eq('is_active', true).order('name');
      if (subjectId) topicQuery = topicQuery.eq('subject_id', subjectId);
      const { data: topics, error: tErr } = await topicQuery;
      if (tErr) return fail('LOOKUP_FAILED', tErr.message);

      const rows = new Map<string, QuestionCoverageRow>();
      const emptyCounts = () =>
        Object.fromEntries(
          QF_LIFECYCLE_STATUSES.map((s) => [s, { easy: 0, medium: 0, hard: 0, other: 0 }])
        ) as QuestionCoverageRow['counts'];
      (topics || []).forEach((t: { id: string; name: string }) => {
        rows.set(t.id, { topicId: t.id, topicName: t.name, counts: emptyCounts(), total: 0 });
      });
      if (rows.size === 0) return { success: true, data: [] };

      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await ctx.supabase
          .from('question_versions')
          .select('lifecycle_status, difficulty, questions!inner(canonical_topic_id)')
          .in('questions.canonical_topic_id', Array.from(rows.keys()))
          .range(from, from + pageSize - 1);
        if (error) return fail('LOOKUP_FAILED', error.message);
        (data || []).forEach((r: { lifecycle_status: QuestionLifecycleStatus; difficulty: string; questions: unknown }) => {
          const q = (Array.isArray(r.questions) ? r.questions[0] : r.questions) as { canonical_topic_id: string };
          const row = rows.get(q?.canonical_topic_id);
          if (!row || !row.counts[r.lifecycle_status]) return;
          const diff = (QF_DIFFICULTIES as readonly string[]).includes(r.difficulty) ? (r.difficulty as QuestionDifficulty) : 'other';
          row.counts[r.lifecycle_status][diff]++;
          row.total++;
        });
        if (!data || data.length < pageSize) break;
      }
      return { success: true, data: Array.from(rows.values()) };
    });
  }
}
