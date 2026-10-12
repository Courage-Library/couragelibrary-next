/**
 * COURAGE LIBRARY — QUESTION FACTORY CSV IMPORTER
 * Phase QF-1: Question Factory Core (decision D8)
 *
 * Routes CSV / spreadsheet question rows through the SAME five gates as external-AI
 * input and lands accepted rows as DRAFT versions via fn_import_question_drafts.
 *
 * INVARIANTS:
 * - Never creates exams, cycles, patterns, subjects, topics or subtopics.
 *   An unresolved reference rejects the row with an explicit message.
 * - Never publishes: commit = DRAFT only; review + atomic publish happen in the factory.
 * - Images are not accepted in QF-1 (D9).
 * - Gate 3's context-hash check is not required for CSV (origin CSV_IMPORT).
 */

import {
  QuestionAuthoringItem,
  QuestionAuthoringTarget,
  QuestionImportMode,
  QUESTION_CONTRACT_VERSION,
  QUESTION_SPEC_VERSION,
  QF_MAX_ITEMS_PER_BATCH,
} from '@/types/question-factory';
import { QuestionTaxonomyResolver } from './question-taxonomy-resolver';
import { QuestionFactoryImporterService } from './question-factory-importer.service';
import type { QuestionGateLookups } from './question-validation.service';

type SupabaseLike = any;

export type CsvQuestionRow = Record<string, unknown>;

export interface CsvRowResult {
  row: number;
  status: 'ACCEPTED' | 'IMPORTED' | 'REJECTED';
  errors: string[];
  warnings: string[];
  versionId?: string;
  stemPreview: string;
}

export interface CsvImportSummary {
  mode: QuestionImportMode;
  totalRows: number;
  accepted: number;
  imported: number;
  rejected: number;
  batchIds: string[];
  rows: CsvRowResult[];
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

function firstOf(row: CsvQuestionRow, keys: string[]): string {
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v;
  }
  return '';
}

/** Maps a CSV row to a QuestionAuthoringItem. Image columns are passed through so Gate 1 rejects them. */
export function csvRowToItem(row: CsvQuestionRow, rowNumber: number): QuestionAuthoringItem {
  const rawOptions = row.options ?? row.question_options;
  let parsed: unknown = rawOptions;
  if (typeof rawOptions === 'string') {
    try {
      parsed = JSON.parse(rawOptions);
    } catch {
      parsed = null;
    }
  }

  let options: Array<Record<string, unknown>> = [];
  if (Array.isArray(parsed)) {
    options = parsed.map((opt, idx) => {
      if (opt && typeof opt === 'object') {
        const o = opt as Record<string, unknown>;
        const out: Record<string, unknown> = {
          key: str(o.key ?? o.option_key ?? String.fromCharCode(65 + idx)).toUpperCase(),
          text: str(o.text ?? o.option_text),
        };
        if (o.image || o.image_url || o.option_image_url) out.image = o.image ?? o.image_url ?? o.option_image_url;
        return out;
      }
      return { key: String.fromCharCode(65 + idx), text: str(opt) };
    });
  } else if (parsed && typeof parsed === 'object') {
    options = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const out: Record<string, unknown> = { key: k.toUpperCase(), text: str(o.text) };
        if (o.image) out.image = o.image;
        return out;
      }
      return { key: k.toUpperCase(), text: str(v) };
    });
  }

  const difficultyRaw = str(row.difficulty).toLowerCase();
  const languageRaw = str(row.language).toLowerCase();
  const pyqYear = str(row.pyq_year);
  const pyqSource = firstOf(row, ['pyq_exam', 'pyq_source']);

  const item: Record<string, unknown> = {
    clientRef: `row-${rowNumber}`,
    stem: firstOf(row, ['question_text', 'statement', 'question', 'text']),
    language: languageRaw === 'hi' || languageRaw === 'hindi' ? 'hi' : 'en',
    difficulty: difficultyRaw || 'medium',
    options,
    correctKey: firstOf(row, ['correct_answer', 'correctOption', 'answer']).toUpperCase(),
    explanationMd: firstOf(row, ['explanation', 'solution']),
    sourceType: pyqYear || pyqSource ? 'PYQ' : 'ORIGINAL',
  };
  if (pyqYear || pyqSource) {
    item.pyq = {
      examSlug: pyqSource,
      year: Number(pyqYear),
      reference: firstOf(row, ['pyq_reference']) || `${pyqSource} ${pyqYear}`.trim(),
    };
  }
  if (str(row.question_image) || str(row.question_image_url)) {
    item.question_image_url = str(row.question_image) || str(row.question_image_url);
  }
  if (str(row.options_type).toLowerCase() === 'image') item.imageOptions = true;
  return item as unknown as QuestionAuthoringItem;
}

export class QuestionCsvImporterService {
  static async run(params: {
    rows: CsvQuestionRow[];
    mode: QuestionImportMode;
    actorId: string;
    supabase: SupabaseLike;
    lookups?: QuestionGateLookups;
  }): Promise<CsvImportSummary> {
    const { rows, mode, actorId, supabase } = params;
    const resolver = new QuestionTaxonomyResolver(supabase);
    const results: CsvRowResult[] = rows.map((r, i) => ({
      row: i + 1,
      status: 'REJECTED',
      errors: [],
      warnings: [],
      stemPreview: firstOf(r, ['question_text', 'statement', 'question', 'text']).slice(0, 80),
    }));

    // 1. Resolve taxonomy per row (read-only; unresolved → rejected).
    const groups = new Map<string, { target: QuestionAuthoringTarget; indices: number[] }>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        let subject = firstOf(r, ['section_name', 'section', 'subject']);
        const patternSectionId = firstOf(r, ['pattern_section_id', 'patternSectionId']);
        if (patternSectionId) {
          const subjectId = await resolver.resolvePatternSectionSubject(patternSectionId);
          if (!subjectId) {
            results[i].errors.push(`pattern_section_id '${patternSectionId}' not found — create it via Exam Onboarding first.`);
            continue;
          }
          subject = subjectId;
        }
        const resolved = await resolver.resolveByReferences({
          subject,
          topic: firstOf(r, ['topic', 'topic_slug']),
          subtopic: firstOf(r, ['subtopic', 'subtopic_slug']),
          exam: firstOf(r, ['exam', 'category_id', 'category']),
        });
        if (!resolved.target) {
          results[i].errors.push(resolved.error || 'Taxonomy could not be resolved.');
          continue;
        }
        const t = resolved.target;
        const key = `${t.topicId}|${t.subtopicId || ''}|${t.examId || ''}`;
        const group = groups.get(key) || { target: t, indices: [] };
        group.indices.push(i);
        groups.set(key, group);
      } catch (err) {
        results[i].errors.push(`Taxonomy lookup failed (fail-closed): ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    // 2. Gate + import per target, in batches of ≤ 25.
    const batchIds: string[] = [];
    for (const group of Array.from(groups.values())) {
      for (let start = 0; start < group.indices.length; start += QF_MAX_ITEMS_PER_BATCH) {
        const chunk = group.indices.slice(start, start + QF_MAX_ITEMS_PER_BATCH);
        const spec = {
          specVersion: QUESTION_SPEC_VERSION,
          contractVersion: QUESTION_CONTRACT_VERSION,
          contextHash: '',
          target: group.target,
          items: chunk.map((idx) => csvRowToItem(rows[idx], idx + 1)),
        };
        const res = await QuestionFactoryImporterService.run({
          mode,
          origin: 'CSV_IMPORT',
          actorId,
          supabase,
          spec,
          lookups: params.lookups,
        });

        const importedByRef = new Map((res.imported || []).map((i) => [i.clientRef, i.versionId]));
        chunk.forEach((rowIdx, pos) => {
          const ir = res.report.items[pos];
          const out = results[rowIdx];
          out.errors.push(...(ir?.errors ?? res.report.errors));
          out.warnings.push(...(ir?.warnings ?? []));
          if (!ir?.passed) {
            out.status = 'REJECTED';
          } else if (mode === 'dry-run') {
            out.status = 'ACCEPTED';
          } else if (res.status === 'IMPORTED' && importedByRef.has(ir.clientRef)) {
            out.status = 'IMPORTED';
            out.versionId = importedByRef.get(ir.clientRef);
          } else {
            out.status = 'REJECTED';
            out.errors.push(res.errorMessage || 'Batch import failed; batch rolled back.');
          }
        });
        if (res.batchId) batchIds.push(res.batchId);
      }
    }

    return {
      mode,
      totalRows: rows.length,
      accepted: results.filter((r) => r.status === 'ACCEPTED' || r.status === 'IMPORTED').length,
      imported: results.filter((r) => r.status === 'IMPORTED').length,
      rejected: results.filter((r) => r.status === 'REJECTED').length,
      batchIds,
      rows: results,
    };
  }
}
