/**
 * COURAGE LIBRARY — QUESTION FACTORY IMPORTER
 * Phase QF-1: Question Factory Core
 *
 * Untrusted input (external-AI JSON or CSV rows) → 5 gates → DRAFT versions.
 *
 * MODES:
 * - dry-run: parses, runs all gates, returns the full report. ZERO writes.
 * - commit:  runs all gates again, then sends ONLY accepted items to
 *            fn_import_question_drafts (one atomic SQL call per batch).
 *            Rejected items are reported, never written. Nothing is ever published here.
 *
 * Server-only: must never be imported from a "use client" module.
 */

import {
  QuestionAuthoringItem,
  QuestionAuthoringSpec,
  QuestionBatchGateReport,
  QuestionFactoryError,
  QuestionImportMode,
  QuestionImportResult,
  QuestionOrigin,
  QF_MAX_PAYLOAD_BYTES,
} from '@/types/question-factory';
import { QuestionValidationService, QuestionGateLookups } from './question-validation.service';
import { QuestionTaxonomyResolver } from './question-taxonomy-resolver';
import { QuestionContextBuilder } from './question-context-builder.service';

type SupabaseLike = any;

const MAX_EXISTING_STEMS_FOR_NEAR_DUP = 5000;

export interface QuestionImportParams {
  mode: QuestionImportMode;
  origin: Extract<QuestionOrigin, 'AI_EXTERNAL' | 'CSV_IMPORT' | 'MANUAL'>;
  actorId: string;
  supabase: SupabaseLike;
  /** Raw pasted text (AI flow). Either rawInput or spec must be provided. */
  rawInput?: string;
  /** Pre-built spec (CSV / manual flows). */
  spec?: unknown;
  /** Test seam: override DB-backed lookups. */
  lookups?: QuestionGateLookups;
  currentYear?: number;
  /**
   * Server-side import provenance per item (keyed by clientRef), e.g. a bulk import's source reference and review flags.
   * Stored as authoring_metadata.importInfo; NOT part of the item contract, so it never bypasses or changes a gate.
   */
  itemMetadata?: Record<string, Record<string, unknown>>;
}

/** Extracts the JSON payload from a single ```json fenced block, or accepts bare JSON. */
export function extractJsonPayload(rawInput: string): string {
  const text = String(rawInput || '').trim();
  const fences = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/gi);
  if (fences && fences.length > 1) {
    throw new QuestionFactoryError('MULTIPLE_JSON_BLOCKS', 'Paste exactly one fenced JSON block.');
  }
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export function createDbGateLookups(
  supabase: SupabaseLike,
  options: { excludeQuestionId?: string | null } = {}
): QuestionGateLookups {
  const excludeQuestionId = options.excludeQuestionId ?? null;
  const resolver = new QuestionTaxonomyResolver(supabase);
  return {
    resolveTarget: (target) => resolver.resolveTarget(target),
    rebuildContextHash: (target) => QuestionContextBuilder.rebuildContextHash(supabase, target),
    resolveExamSlug: (slug) => resolver.resolveExamSlug(slug),
    async findExactDuplicates(topicId, stems) {
      const { data, error } = await supabase.rpc('fn_qf_find_exact_duplicates', {
        p_topic_id: topicId,
        p_stems: stems,
        p_exclude_question_id: excludeQuestionId,
      });
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error('unexpected checksum response');
      return data.map((r: { index: number; checksum: string; duplicate_version_id: string | null }) => ({
        index: r.index,
        checksum: r.checksum,
        duplicateVersionId: r.duplicate_version_id,
      }));
    },
    async listExistingStems(topicId) {
      const { data, error } = await supabase
        .from('question_versions')
        .select('id, question_id, question_text, questions!inner(canonical_topic_id)')
        .eq('questions.canonical_topic_id', topicId)
        .neq('lifecycle_status', 'REJECTED')
        .limit(MAX_EXISTING_STEMS_FOR_NEAR_DUP);
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error('unexpected stem response');
      return data
        .filter((r: { question_id?: string }) => !excludeQuestionId || r.question_id !== excludeQuestionId)
        .map((r: { id: string; question_text: string }) => ({ versionId: r.id, stem: r.question_text }));
    },
  };
}

export async function fetchCognitiveTrapCodes(supabase: SupabaseLike): Promise<string[]> {
  const { data, error } = await supabase.from('mistake_cognitive_types').select('id').eq('is_active', true);
  if (error) throw new QuestionFactoryError('LOOKUP_FAILED', `Cognitive trap lookup failed: ${error.message}`);
  return (data || []).map((r: { id: string }) => r.id);
}

/** Maps a gate-approved item to the fn_import_question_drafts item shape. */
export function toImportRpcItem(item: QuestionAuthoringItem, pyqExamId: string | null, warnings: string[], importInfo: Record<string, unknown> | null = null): Record<string, unknown> {
  return {
    client_ref: item.clientRef,
    stem: item.stem,
    language: item.language,
    difficulty: item.difficulty,
    options: item.options.map((o) => ({ key: o.key, text: o.text })),
    correct_key: item.correctKey,
    explanation_md: item.explanationMd,
    source_type: item.sourceType,
    pyq: item.pyq
      ? {
          exam_id: pyqExamId,
          exam_slug: item.pyq.examSlug,
          year: item.pyq.year,
          tier: item.pyq.tier ?? null,
          shift: item.pyq.shift ?? null,
          reference: item.pyq.reference,
        }
      : null,
    authoring_metadata: {
      clientRef: item.clientRef,
      sourceType: item.sourceType,
      distractorRationale: item.distractorRationale ?? null,
      cognitiveTrap: item.cognitiveTrap ?? null,
      pyq: item.pyq ?? null,
      gateWarnings: warnings,
      ...(importInfo ? { importInfo } : {}),
    },
  };
}

export class QuestionFactoryImporterService {
  static async run(params: QuestionImportParams): Promise<QuestionImportResult> {
    const { mode, origin, actorId, supabase } = params;
    const requireContextHash = origin === 'AI_EXTERNAL';

    let spec: unknown = params.spec;
    let rawPayload: string | undefined;
    if (params.rawInput !== undefined) {
      if (Buffer.byteLength(params.rawInput, 'utf8') > QF_MAX_PAYLOAD_BYTES) {
        return this.rejectEnvelope(mode, origin, 'PAYLOAD_TOO_LARGE', `Payload exceeds ${QF_MAX_PAYLOAD_BYTES} bytes.`);
      }
      try {
        rawPayload = extractJsonPayload(params.rawInput);
        spec = JSON.parse(rawPayload);
      } catch (err) {
        const message = err instanceof QuestionFactoryError ? err.message : 'Input is not valid JSON.';
        return this.rejectEnvelope(mode, origin, 'INVALID_JSON', message);
      }
    }
    if (spec === undefined) {
      return this.rejectEnvelope(mode, origin, 'EMPTY_INPUT', 'No input provided.');
    }

    let cognitiveTrapCodes: string[];
    try {
      cognitiveTrapCodes = await fetchCognitiveTrapCodes(supabase);
    } catch (err) {
      return this.rejectEnvelope(mode, origin, 'LOOKUP_FAILED', err instanceof Error ? err.message : 'Lookup failed.');
    }

    const report = await QuestionValidationService.validateBatch(spec, params.lookups ?? createDbGateLookups(supabase), {
      origin,
      requireContextHash,
      cognitiveTrapCodes,
      rawPayload,
      currentYear: params.currentYear,
    });

    if (mode === 'dry-run') {
      return { mode, status: 'DRY_RUN', report };
    }

    const accepted = report.items.filter((i) => i.passed && i.normalizedItem);
    if (!report.passed || accepted.length === 0) {
      return {
        mode,
        status: 'REJECTED',
        report,
        errorCode: 'NO_ACCEPTED_ITEMS',
        errorMessage: 'No items passed all five gates; nothing was written.',
      };
    }

    const typedSpec = spec as QuestionAuthoringSpec;
    const batch = {
      origin,
      contract_version: typedSpec.contractVersion,
      context_hash: origin === 'AI_EXTERNAL' ? typedSpec.contextHash : typedSpec.contextHash || null,
      target_topic_id: typedSpec.target.topicId,
      target_subtopic_id: typedSpec.target.subtopicId ?? null,
      target_exam_id: typedSpec.target.examId ?? null,
      submitted_count: report.items.length,
      rejected_count: report.rejectedCount,
      gate_report: this.compactReport(report),
      items: accepted.map((ir) => {
        const pyqExamId = (ir.gates.GATE_4_PROVENANCE.details?.pyqExamId as string | undefined) ?? null;
        const item = ir.normalizedItem as QuestionAuthoringItem;
        return toImportRpcItem(item, pyqExamId, ir.warnings, params.itemMetadata?.[item.clientRef] ?? null);
      }),
    };

    const { data, error } = await supabase.rpc('fn_import_question_drafts', { p_batch: batch, p_actor: actorId });
    if (error || !data?.success) {
      return {
        mode,
        status: 'REJECTED',
        report,
        errorCode: this.extractQfCode(error?.message) || 'IMPORT_FAILED',
        errorMessage: error?.message || 'Import failed; the batch was rolled back.',
      };
    }

    return {
      mode,
      status: 'IMPORTED',
      report,
      batchId: data.batch_id,
      imported: (data.items || []).map((r: { client_ref: string; question_id: string; version_id: string }) => ({
        clientRef: r.client_ref,
        questionId: r.question_id,
        versionId: r.version_id,
      })),
    };
  }

  /** Persisted per batch: per-item gate outcomes without the sanitized payload copies. */
  static compactReport(report: QuestionBatchGateReport): Record<string, unknown> {
    return {
      passed: report.passed,
      origin: report.origin,
      contextHash: report.contextHash,
      acceptedCount: report.acceptedCount,
      rejectedCount: report.rejectedCount,
      errors: report.errors,
      warnings: report.warnings,
      items: report.items.map((i) => ({
        index: i.index,
        clientRef: i.clientRef,
        passed: i.passed,
        errors: i.errors,
        warnings: i.warnings,
        nearDuplicates: i.nearDuplicates,
        gates: Object.fromEntries(
          Object.entries(i.gates).map(([k, g]) => [k, { passed: g.passed, errors: g.errors, warnings: g.warnings }])
        ),
      })),
    };
  }

  static extractQfCode(message: string | undefined): string | null {
    const m = String(message || '').match(/\b(QF_[A-Z_]+)\b/);
    return m ? m[1] : null;
  }

  private static rejectEnvelope(
    mode: QuestionImportMode,
    origin: QuestionOrigin,
    code: string,
    message: string
  ): QuestionImportResult {
    const empty = { passed: false, errors: [message], warnings: [] };
    const gate = (gateId: string, gateName: string) => ({ gateId, gateName, ...empty });
    return {
      mode,
      status: 'REJECTED',
      errorCode: code,
      errorMessage: message,
      report: {
        passed: false,
        batchGates: {
          GATE_1_SCHEMA: gate('GATE_1_SCHEMA', 'Schema & Structure'),
          GATE_2_SECURITY: { gateId: 'GATE_2_SECURITY', gateName: 'Sanitization & Security', passed: true, errors: [], warnings: [] },
          GATE_3_TAXONOMY: { gateId: 'GATE_3_TAXONOMY', gateName: 'Target Identity & Taxonomy', passed: true, errors: [], warnings: [] },
          GATE_4_PROVENANCE: { gateId: 'GATE_4_PROVENANCE', gateName: 'Provenance', passed: true, errors: [], warnings: [] },
          GATE_5_ANTI_DUPLICATE: { gateId: 'GATE_5_ANTI_DUPLICATE', gateName: 'Anti-Duplicate', passed: true, errors: [], warnings: [] },
        },
        items: [],
        acceptedCount: 0,
        rejectedCount: 0,
        errors: [`[BATCH GATE_1_SCHEMA] ${message}`],
        warnings: [],
        contextHash: null,
        origin,
      } as QuestionBatchGateReport,
    };
  }
}
