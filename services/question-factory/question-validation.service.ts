/**
 * COURAGE LIBRARY — QUESTION FACTORY FIVE-GATE VALIDATOR
 * Phase QF-1: Question Factory Core
 *
 * THE FIVE GATES (all must pass per item; batch envelope checks run first):
 * - GATE 1: Schema & Structure     (spec/contract version, fields, enums, lengths, 4 unique options, ≤ 25 items, no images)
 * - GATE 2: Sanitization & Security (citation artifacts, MDX security scan, raw HTML / script / dangerous URLs)
 * - GATE 3: Target Identity & Taxonomy (topic/subtopic/exam via the taxonomy resolver, stale context hash)
 * - GATE 4: Provenance              (ORIGINAL / PYQ / ADAPTED rules, PYQ exam resolution, plausible year)
 * - GATE 5: Anti-Duplicate          (DB checksum exact match vs bank + within batch; trigram Jaccard near-dup)
 *
 * SACRED INVARIANTS:
 * - External AI / CSV input is UNTRUSTED.
 * - FAIL CLOSED: any lookup error inside a gate is a gate failure — never "no rows → pass".
 * - The stem checksum is computed ONLY by the database (fn_question_stem_checksum); TS never re-implements it.
 * - Gates never create taxonomy.
 */

import { MdxSecurityScanner } from '@/services/mdx-security-scanner';
import { detectAiCitationArtifacts, sanitizeAiCitationArtifacts } from '@/services/ai/ai-citation-sanitizer';
import {
  NearDuplicateMatch,
  QuestionAuthoringItem,
  QuestionAuthoringTarget,
  QuestionBatchGateReport,
  QuestionGateId,
  QuestionGateReport,
  QuestionItemGateReport,
  QuestionOptionKey,
  QuestionOrigin,
  QUESTION_CONTRACT_VERSION,
  QUESTION_SPEC_VERSION,
  QF_DIFFICULTIES,
  QF_LANGUAGES,
  QF_MAX_CLIENT_REF_CHARS,
  QF_MAX_COGNITIVE_TRAP_CHARS,
  QF_MAX_EXPLANATION_CHARS,
  QF_MAX_ITEMS_PER_BATCH,
  QF_MAX_OPTION_CHARS,
  QF_MAX_PAYLOAD_BYTES,
  QF_MAX_PYQ_REFERENCE_CHARS,
  QF_MAX_RATIONALE_CHARS,
  QF_MAX_STEM_CHARS,
  QF_MIN_EXPLANATION_CHARS,
  QF_NEAR_DUP_REJECT_THRESHOLD,
  QF_NEAR_DUP_WARN_THRESHOLD,
  QF_OPTION_KEYS,
  QF_SOURCE_TYPES,
  QF_STEM_PREVIEW_CHARS,
} from '@/types/question-factory';
import type { TaxonomyResolution } from './question-taxonomy-resolver';

const GATE_NAMES: Record<QuestionGateId, string> = {
  GATE_1_SCHEMA: 'Schema & Structure',
  GATE_2_SECURITY: 'Sanitization & Security',
  GATE_3_TAXONOMY: 'Target Identity & Taxonomy',
  GATE_4_PROVENANCE: 'Provenance',
  GATE_5_ANTI_DUPLICATE: 'Anti-Duplicate',
};
const GATE_IDS = Object.keys(GATE_NAMES) as QuestionGateId[];

const ALLOWED_TOP_LEVEL_FIELDS = new Set(['specVersion', 'contractVersion', 'contextHash', 'target', 'items']);
const ALLOWED_TARGET_FIELDS = new Set(['topicId', 'subtopicId', 'examId']);
const ALLOWED_ITEM_FIELDS = new Set([
  'clientRef',
  'stem',
  'language',
  'difficulty',
  'options',
  'correctKey',
  'explanationMd',
  'distractorRationale',
  'cognitiveTrap',
  'sourceType',
  'pyq',
]);
const ALLOWED_OPTION_FIELDS = new Set(['key', 'text']);
const ALLOWED_PYQ_FIELDS = new Set(['examSlug', 'year', 'tier', 'shift', 'reference']);

const RAW_HTML_TAG_REGEX = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i;
const DANGEROUS_SCHEME_REGEX = /\b(javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z0-9.+-]+|\bfile:\/\/|\bblob:/i;
const IFRAME_OR_SCRIPT_REGEX = /<\s*\/?\s*(script|iframe|object|embed|svg|math|style)\b/i;
const EVENT_HANDLER_REGEX = /\bon[a-z]{3,15}\s*=/i;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\([^)]*\)/;
const IMAGE_FIELD_REGEX = /image|img|picture|figure/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Injected lookups (server: Supabase admin client; tests: mocks)
// ---------------------------------------------------------------------------

export interface ExactDuplicateLookupRow {
  index: number;
  checksum: string;
  duplicateVersionId: string | null;
}

export interface ExistingStemRow {
  versionId: string;
  stem: string;
}

export interface QuestionGateLookups {
  /** Resolves target via question-taxonomy-resolver (read-only). Throws on lookup failure. */
  resolveTarget(target: QuestionAuthoringTarget): Promise<TaxonomyResolution>;
  /** Rebuilds the context hash for the target from current DB state. Throws on failure. */
  rebuildContextHash?(target: QuestionAuthoringTarget): Promise<string>;
  /** Resolves an exam slug to an existing exam id (or null). Throws on lookup failure. */
  resolveExamSlug(slug: string): Promise<string | null>;
  /** DB checksums of stems + matching non-REJECTED version on topic. Throws on failure. */
  findExactDuplicates(topicId: string, stems: string[]): Promise<ExactDuplicateLookupRow[]>;
  /** Existing non-REJECTED stems on the topic for near-duplicate comparison. Throws on failure. */
  listExistingStems(topicId: string): Promise<ExistingStemRow[]>;
}

export interface QuestionValidationOptions {
  origin: QuestionOrigin;
  /** Required for AI_EXTERNAL; CSV imports skip the stale-context check (D8). */
  requireContextHash: boolean;
  /** Allowed cognitive trap codes; empty array = free text ≤ 64 chars. */
  cognitiveTrapCodes: string[];
  /** Raw payload (for size limit); optional when spec is built server-side (CSV). */
  rawPayload?: string;
  currentYear?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function newGate(gateId: QuestionGateId): QuestionGateReport {
  return { gateId, gateName: GATE_NAMES[gateId], passed: true, errors: [], warnings: [] };
}

function finalizeGate(gate: QuestionGateReport): QuestionGateReport {
  gate.passed = gate.errors.length === 0;
  return gate;
}

function newGateSet(): Record<QuestionGateId, QuestionGateReport> {
  return GATE_IDS.reduce((acc, id) => {
    acc[id] = newGate(id);
    return acc;
  }, {} as Record<QuestionGateId, QuestionGateReport>);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Normalization used ONLY for option-text uniqueness and near-duplicate shingling (not the checksum). */
export function normalizeForComparison(text: string): string {
  let t = String(text || '');
  try {
    t = t.normalize('NFKC');
  } catch {
    /* keep as-is */
  }
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+\-*/=<>^%\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word-trigram shingles (falls back to unigrams for stems shorter than 3 tokens). */
export function tokenTrigrams(text: string): Set<string> {
  const tokens = normalizeForComparison(text).split(' ').filter(Boolean);
  const shingles = new Set<string>();
  if (tokens.length < 3) {
    tokens.forEach((t) => shingles.add(t));
    return shingles;
  }
  for (let i = 0; i <= tokens.length - 3; i++) {
    shingles.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return shingles;
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenTrigrams(a);
  const sb = tokenTrigrams(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((s) => {
    if (sb.has(s)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function preview(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > QF_STEM_PREVIEW_CHARS ? `${t.slice(0, QF_STEM_PREVIEW_CHARS)}…` : t;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export class QuestionValidationService {
  /**
   * Runs batch envelope checks then all five gates per item.
   * Never throws for invalid input — returns a report. Lookup failures fail the affected gate.
   */
  static async validateBatch(
    spec: unknown,
    lookups: QuestionGateLookups,
    options: QuestionValidationOptions
  ): Promise<QuestionBatchGateReport> {
    const batchGates = newGateSet();
    const report: QuestionBatchGateReport = {
      passed: false,
      batchGates,
      items: [],
      acceptedCount: 0,
      rejectedCount: 0,
      errors: [],
      warnings: [],
      contextHash: null,
      origin: options.origin,
    };

    // ---- Batch G1: envelope ----
    const g1 = batchGates.GATE_1_SCHEMA;
    if (options.rawPayload !== undefined && Buffer.byteLength(options.rawPayload, 'utf8') > QF_MAX_PAYLOAD_BYTES) {
      g1.errors.push(`Payload exceeds ${QF_MAX_PAYLOAD_BYTES} bytes.`);
    }
    if (!isPlainObject(spec)) {
      g1.errors.push('Payload is not a JSON object.');
      return this.finishBatch(report, []);
    }
    const unknownTop = Object.keys(spec).filter((k) => !ALLOWED_TOP_LEVEL_FIELDS.has(k));
    if (unknownTop.length > 0) g1.errors.push(`Unknown top-level field(s): ${unknownTop.join(', ')}.`);
    if (spec.specVersion !== QUESTION_SPEC_VERSION) g1.errors.push(`specVersion must be "${QUESTION_SPEC_VERSION}".`);
    if (spec.contractVersion !== QUESTION_CONTRACT_VERSION) g1.errors.push(`contractVersion must be "${QUESTION_CONTRACT_VERSION}".`);
    if (options.requireContextHash && (typeof spec.contextHash !== 'string' || !/^[0-9a-f]{64}$/.test(spec.contextHash))) {
      g1.errors.push('contextHash must be a 64-character lowercase SHA-256 hex string.');
    }
    report.contextHash = typeof spec.contextHash === 'string' ? spec.contextHash : null;

    const target = spec.target;
    if (!isPlainObject(target)) {
      g1.errors.push('target must be an object.');
    } else {
      const unknownTarget = Object.keys(target).filter((k) => !ALLOWED_TARGET_FIELDS.has(k));
      if (unknownTarget.length > 0) g1.errors.push(`Unknown target field(s): ${unknownTarget.join(', ')}.`);
      if (typeof target.topicId !== 'string' || !UUID_REGEX.test(target.topicId)) g1.errors.push('target.topicId must be a UUID.');
      if (target.subtopicId != null && (typeof target.subtopicId !== 'string' || !UUID_REGEX.test(target.subtopicId))) {
        g1.errors.push('target.subtopicId must be a UUID when provided.');
      }
      if (target.examId != null && (typeof target.examId !== 'string' || !UUID_REGEX.test(target.examId))) {
        g1.errors.push('target.examId must be a UUID when provided.');
      }
    }

    const items = spec.items;
    if (!Array.isArray(items) || items.length === 0) {
      g1.errors.push('items must be a non-empty array.');
    } else if (items.length > QF_MAX_ITEMS_PER_BATCH) {
      g1.errors.push(`items has ${items.length} entries; maximum per batch is ${QF_MAX_ITEMS_PER_BATCH}.`);
    }
    finalizeGate(g1);
    if (!g1.passed) return this.finishBatch(report, Array.isArray(items) ? items : []);

    const typedTarget = target as unknown as QuestionAuthoringTarget;
    const rawItems = items as unknown[];

    // ---- Batch G3: target identity & stale context ----
    const g3 = batchGates.GATE_3_TAXONOMY;
    try {
      const resolution = await lookups.resolveTarget(typedTarget);
      if (!resolution.ok) g3.errors.push(...resolution.errors);
    } catch (err) {
      g3.errors.push(`Taxonomy lookup failed (fail-closed): ${errMessage(err)}`);
    }
    if (options.requireContextHash && g3.errors.length === 0) {
      if (!lookups.rebuildContextHash) {
        g3.errors.push('STALE_CONTEXT: context hash cannot be verified (no rebuild available).');
      } else {
        try {
          const fresh = await lookups.rebuildContextHash(typedTarget);
          if (fresh !== spec.contextHash) {
            g3.errors.push('STALE_CONTEXT: contextHash does not match the current context. Regenerate the prompt.');
          }
        } catch (err) {
          g3.errors.push(`STALE_CONTEXT: context rebuild failed (fail-closed): ${errMessage(err)}`);
        }
      }
    }
    finalizeGate(g3);
    if (!g3.passed) return this.finishBatch(report, rawItems);

    // ---- Per-item gates 1, 2, 4 ----
    const itemReports: QuestionItemGateReport[] = [];
    const sanitizedItems: Array<QuestionAuthoringItem | null> = [];
    const seenClientRefs = new Set<string>();

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      const gates = newGateSet();
      gates.GATE_3_TAXONOMY.details = { inheritedFromBatch: true };
      const clientRef = isPlainObject(raw) && typeof raw.clientRef === 'string' ? raw.clientRef : `#${i + 1}`;

      this.gate1Item(raw, gates.GATE_1_SCHEMA, options);
      if (seenClientRefs.has(clientRef)) gates.GATE_1_SCHEMA.errors.push(`Duplicate clientRef "${clientRef}" in batch.`);
      seenClientRefs.add(clientRef);
      finalizeGate(gates.GATE_1_SCHEMA);

      let sanitized: QuestionAuthoringItem | null = null;
      if (gates.GATE_1_SCHEMA.passed) {
        sanitized = this.gate2Item(raw as unknown as QuestionAuthoringItem, gates.GATE_2_SECURITY);
      } else {
        gates.GATE_2_SECURITY.errors.push('Skipped: Gate 1 failed.');
      }
      finalizeGate(gates.GATE_2_SECURITY);

      if (sanitized) {
        await this.gate4Item(sanitized, gates.GATE_4_PROVENANCE, lookups, options);
      } else {
        gates.GATE_4_PROVENANCE.errors.push('Skipped: earlier gate failed.');
      }
      finalizeGate(gates.GATE_4_PROVENANCE);

      itemReports.push({
        index: i,
        clientRef,
        passed: false,
        gates,
        errors: [],
        warnings: [],
        nearDuplicates: [],
      });
      sanitizedItems.push(sanitized && gates.GATE_2_SECURITY.passed ? sanitized : null);
    }

    // ---- Gate 5: anti-duplicate (batch-wide lookups, fail closed) ----
    await this.gate5Batch(typedTarget.topicId, itemReports, sanitizedItems, lookups);

    // ---- Finalize items ----
    itemReports.forEach((ir, i) => {
      finalizeGate(ir.gates.GATE_5_ANTI_DUPLICATE);
      ir.errors = GATE_IDS.flatMap((g) => ir.gates[g].errors.map((e) => `[${g}] ${e}`));
      ir.warnings = GATE_IDS.flatMap((g) => ir.gates[g].warnings.map((w) => `[${g}] ${w}`));
      ir.passed = GATE_IDS.every((g) => ir.gates[g].passed);
      if (ir.passed && sanitizedItems[i]) ir.normalizedItem = sanitizedItems[i] as QuestionAuthoringItem;
    });

    report.items = itemReports;
    return this.finishBatch(report, rawItems);
  }

  private static finishBatch(report: QuestionBatchGateReport, rawItems: unknown[]): QuestionBatchGateReport {
    GATE_IDS.forEach((g) => finalizeGate(report.batchGates[g]));
    const batchOk = GATE_IDS.every((g) => report.batchGates[g].passed);
    if (!batchOk && report.items.length === 0) {
      // Envelope failure: every item is rejected without being evaluated.
      report.items = rawItems.map((raw, i) => {
        const gates = newGateSet();
        const reason = 'Batch envelope rejected; item not evaluated.';
        GATE_IDS.forEach((g) => {
          gates[g].errors.push(reason);
          gates[g].passed = false;
        });
        return {
          index: i,
          clientRef: isPlainObject(raw) && typeof raw.clientRef === 'string' ? raw.clientRef : `#${i + 1}`,
          passed: false,
          gates,
          errors: [reason],
          warnings: [],
          nearDuplicates: [],
        };
      });
    }
    report.errors = [
      ...GATE_IDS.flatMap((g) => report.batchGates[g].errors.map((e) => `[BATCH ${g}] ${e}`)),
    ];
    report.warnings = GATE_IDS.flatMap((g) => report.batchGates[g].warnings.map((w) => `[BATCH ${g}] ${w}`));
    report.acceptedCount = report.items.filter((i) => i.passed).length;
    report.rejectedCount = report.items.length - report.acceptedCount;
    report.passed = batchOk && report.acceptedCount > 0;
    return report;
  }

  // ---------------------------------------------------------------------------
  // GATE 1 — Schema & Structure (per item)
  // ---------------------------------------------------------------------------
  static gate1Item(raw: unknown, gate: QuestionGateReport, options: QuestionValidationOptions): void {
    const e = gate.errors;
    if (!isPlainObject(raw)) {
      e.push('Item is not an object.');
      return;
    }

    const imageKeys = this.findImageKeys(raw);
    if (imageKeys.length > 0) e.push(`Image fields are not accepted in QF-1: ${imageKeys.join(', ')}.`);

    const unknown = Object.keys(raw).filter((k) => !ALLOWED_ITEM_FIELDS.has(k) && !IMAGE_FIELD_REGEX.test(k));
    if (unknown.length > 0) e.push(`Unknown item field(s): ${unknown.join(', ')}.`);

    if (typeof raw.clientRef !== 'string' || !raw.clientRef.trim() || raw.clientRef.length > QF_MAX_CLIENT_REF_CHARS) {
      e.push(`clientRef must be a non-empty string ≤ ${QF_MAX_CLIENT_REF_CHARS} chars.`);
    }
    if (typeof raw.stem !== 'string' || !raw.stem.trim()) e.push('stem is required.');
    else if (raw.stem.length > QF_MAX_STEM_CHARS) e.push(`stem exceeds ${QF_MAX_STEM_CHARS} characters.`);

    if (!QF_LANGUAGES.includes(raw.language as never)) e.push(`language must be one of ${QF_LANGUAGES.join(', ')}.`);
    if (!QF_DIFFICULTIES.includes(raw.difficulty as never)) e.push(`difficulty must be one of ${QF_DIFFICULTIES.join(', ')}.`);
    if (!QF_SOURCE_TYPES.includes(raw.sourceType as never)) e.push(`sourceType must be one of ${QF_SOURCE_TYPES.join(', ')}.`);

    // Options: exactly 4, keys A–D unique, non-empty unique texts.
    if (!Array.isArray(raw.options)) {
      e.push('options must be an array.');
    } else {
      if (raw.options.length !== 4) e.push(`Exactly 4 options are required (got ${raw.options.length}).`);
      const keys = new Set<string>();
      const texts = new Set<string>();
      raw.options.forEach((opt: unknown, idx: number) => {
        if (!isPlainObject(opt)) {
          e.push(`Option ${idx + 1} is not an object.`);
          return;
        }
        const unknownOpt = Object.keys(opt).filter((k) => !ALLOWED_OPTION_FIELDS.has(k) && !IMAGE_FIELD_REGEX.test(k));
        if (unknownOpt.length > 0) e.push(`Option ${idx + 1} has unknown field(s): ${unknownOpt.join(', ')}.`);
        if (!QF_OPTION_KEYS.includes(opt.key as never)) e.push(`Option ${idx + 1} key must be one of A, B, C, D.`);
        else if (keys.has(opt.key as string)) e.push(`Duplicate option key "${opt.key}".`);
        else keys.add(opt.key as string);

        if (typeof opt.text !== 'string' || !opt.text.trim()) e.push(`Option ${idx + 1} text is empty.`);
        else if (opt.text.length > QF_MAX_OPTION_CHARS) e.push(`Option ${idx + 1} text exceeds ${QF_MAX_OPTION_CHARS} characters.`);
        else {
          const norm = normalizeForComparison(opt.text);
          if (texts.has(norm)) e.push(`Duplicate option text in option ${idx + 1}.`);
          texts.add(norm);
        }
      });
      if (!QF_OPTION_KEYS.includes(raw.correctKey as never)) e.push('correctKey must be one of A, B, C, D.');
      else if (!keys.has(raw.correctKey as string)) e.push(`correctKey "${raw.correctKey}" is not among the option keys.`);
    }

    if (typeof raw.explanationMd !== 'string' || raw.explanationMd.trim().length < QF_MIN_EXPLANATION_CHARS) {
      e.push(`explanationMd must be at least ${QF_MIN_EXPLANATION_CHARS} characters.`);
    } else if (raw.explanationMd.length > QF_MAX_EXPLANATION_CHARS) {
      e.push(`explanationMd exceeds ${QF_MAX_EXPLANATION_CHARS} characters.`);
    }

    if (raw.distractorRationale !== undefined) {
      if (!isPlainObject(raw.distractorRationale)) e.push('distractorRationale must be an object keyed by A–D.');
      else {
        Object.entries(raw.distractorRationale).forEach(([k, v]) => {
          if (!QF_OPTION_KEYS.includes(k as never)) e.push(`distractorRationale key "${k}" is not A–D.`);
          if (typeof v !== 'string' || v.length > QF_MAX_RATIONALE_CHARS) {
            e.push(`distractorRationale.${k} must be a string ≤ ${QF_MAX_RATIONALE_CHARS} chars.`);
          }
        });
      }
    }

    if (raw.cognitiveTrap !== undefined) {
      if (typeof raw.cognitiveTrap !== 'string' || !raw.cognitiveTrap.trim()) e.push('cognitiveTrap must be a non-empty string.');
      else if (options.cognitiveTrapCodes.length > 0) {
        if (!options.cognitiveTrapCodes.includes(raw.cognitiveTrap)) {
          e.push(`cognitiveTrap "${raw.cognitiveTrap}" is not a registered cognitive mistake code.`);
        }
      } else if (raw.cognitiveTrap.length > QF_MAX_COGNITIVE_TRAP_CHARS) {
        e.push(`cognitiveTrap exceeds ${QF_MAX_COGNITIVE_TRAP_CHARS} characters.`);
      }
    }

    if (raw.pyq !== undefined) {
      if (!isPlainObject(raw.pyq)) e.push('pyq must be an object.');
      else {
        const unknownPyq = Object.keys(raw.pyq).filter((k) => !ALLOWED_PYQ_FIELDS.has(k));
        if (unknownPyq.length > 0) e.push(`pyq has unknown field(s): ${unknownPyq.join(', ')}.`);
      }
    }
  }

  private static findImageKeys(obj: Record<string, unknown>): string[] {
    const found: string[] = [];
    Object.keys(obj).forEach((k) => {
      if (IMAGE_FIELD_REGEX.test(k)) found.push(k);
    });
    if (Array.isArray(obj.options)) {
      obj.options.forEach((opt: unknown, idx: number) => {
        if (isPlainObject(opt)) {
          Object.keys(opt).forEach((k) => {
            if (IMAGE_FIELD_REGEX.test(k)) found.push(`options[${idx}].${k}`);
          });
        }
      });
    }
    return found;
  }

  // ---------------------------------------------------------------------------
  // GATE 2 — Sanitization & Security (per item). Returns the sanitized item.
  // ---------------------------------------------------------------------------
  static gate2Item(item: QuestionAuthoringItem, gate: QuestionGateReport): QuestionAuthoringItem {
    let strippedCount = 0;
    const clean = (value: string, path: string, scanMdx: boolean): string => {
      const before = detectAiCitationArtifacts(value).length;
      const sanitized = sanitizeAiCitationArtifacts(value);
      strippedCount += before;
      const residual = detectAiCitationArtifacts(sanitized);
      if (residual.length > 0) gate.errors.push(`${path}: residual citation artifacts after sanitization.`);
      this.securityChecks(sanitized, path, gate, scanMdx);
      return sanitized;
    };

    const sanitized: QuestionAuthoringItem = {
      ...item,
      stem: clean(item.stem, 'stem', true),
      options: item.options.map((o, idx) => ({ key: o.key, text: clean(o.text, `options[${idx}].text`, false) })),
      explanationMd: clean(item.explanationMd, 'explanationMd', true),
    };
    if (item.distractorRationale) {
      const rationale: Partial<Record<QuestionOptionKey, string>> = {};
      (Object.entries(item.distractorRationale) as Array<[QuestionOptionKey, string]>).forEach(([k, v]) => {
        rationale[k] = clean(v, `distractorRationale.${k}`, false);
      });
      sanitized.distractorRationale = rationale;
    }
    if (item.cognitiveTrap) sanitized.cognitiveTrap = clean(item.cognitiveTrap, 'cognitiveTrap', false);
    if (item.pyq) {
      sanitized.pyq = { ...item.pyq, reference: clean(String(item.pyq.reference ?? ''), 'pyq.reference', false) };
    }

    // Post-sanitize emptiness: sanitizer must not leave required text empty.
    if (!sanitized.stem.trim()) gate.errors.push('stem is empty after sanitization.');
    sanitized.options.forEach((o, idx) => {
      if (!o.text.trim()) gate.errors.push(`options[${idx}].text is empty after sanitization.`);
    });
    if (sanitized.explanationMd.trim().length < QF_MIN_EXPLANATION_CHARS) {
      gate.errors.push(`explanationMd is shorter than ${QF_MIN_EXPLANATION_CHARS} characters after sanitization.`);
    }
    if (strippedCount > 0) gate.warnings.push(`${strippedCount} external-AI citation artifact(s) stripped.`);
    gate.details = { artifactsStripped: strippedCount };
    return sanitized;
  }

  private static securityChecks(value: string, path: string, gate: QuestionGateReport, scanMdx: boolean): void {
    if (IFRAME_OR_SCRIPT_REGEX.test(value)) gate.errors.push(`${path}: script/iframe/embedded markup is forbidden.`);
    if (RAW_HTML_TAG_REGEX.test(value)) gate.errors.push(`${path}: raw HTML is not allowed.`);
    if (EVENT_HANDLER_REGEX.test(value)) gate.errors.push(`${path}: inline event handlers are forbidden.`);
    if (DANGEROUS_SCHEME_REGEX.test(value)) gate.errors.push(`${path}: dangerous URL scheme (javascript:/data:/file:/blob:) detected.`);
    if (MARKDOWN_IMAGE_REGEX.test(value)) gate.errors.push(`${path}: images are not accepted in QF-1.`);
    if (scanMdx) {
      const scan = MdxSecurityScanner.scan(value);
      if (!scan.isSafe) {
        scan.errors.forEach((er) => gate.errors.push(`${path}: ${er.code} — ${er.message}`));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GATE 4 — Provenance (per item)
  // ---------------------------------------------------------------------------
  static async gate4Item(
    item: QuestionAuthoringItem,
    gate: QuestionGateReport,
    lookups: QuestionGateLookups,
    options: QuestionValidationOptions
  ): Promise<void> {
    const currentYear = options.currentYear ?? new Date().getUTCFullYear();
    if (item.sourceType === 'ORIGINAL') {
      if (item.pyq !== undefined) gate.errors.push('ORIGINAL items must not carry a pyq block.');
      return;
    }
    if (!item.pyq) {
      if (item.sourceType === 'PYQ') gate.errors.push('PYQ items require a pyq block (examSlug, year, reference).');
      else gate.warnings.push('ADAPTED item has no pyq block describing the inspiring exam/year.');
      return;
    }
    const { examSlug, year, reference } = item.pyq;
    if (typeof examSlug !== 'string' || !examSlug.trim()) gate.errors.push('pyq.examSlug is required.');
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 1950 || year > currentYear) {
      gate.errors.push(`pyq.year must be a 4-digit year between 1950 and ${currentYear}.`);
    }
    if (typeof reference !== 'string' || !reference.trim()) gate.errors.push('pyq.reference is required.');
    else if (reference.length > QF_MAX_PYQ_REFERENCE_CHARS) gate.errors.push(`pyq.reference exceeds ${QF_MAX_PYQ_REFERENCE_CHARS} characters.`);
    if (item.pyq.tier != null && typeof item.pyq.tier !== 'string') gate.errors.push('pyq.tier must be a string.');
    if (item.pyq.shift != null && typeof item.pyq.shift !== 'string') gate.errors.push('pyq.shift must be a string.');

    if (typeof examSlug === 'string' && examSlug.trim()) {
      try {
        const examId = await lookups.resolveExamSlug(examSlug.trim());
        if (!examId) gate.errors.push(`pyq.examSlug "${examSlug}" does not match an existing exam.`);
        else gate.details = { pyqExamId: examId };
      } catch (err) {
        gate.errors.push(`PYQ exam lookup failed (fail-closed): ${errMessage(err)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GATE 5 — Anti-Duplicate (batch-wide)
  // ---------------------------------------------------------------------------
  static async gate5Batch(
    topicId: string,
    itemReports: QuestionItemGateReport[],
    items: Array<QuestionAuthoringItem | null>,
    lookups: QuestionGateLookups
  ): Promise<void> {
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter((c): c is { item: QuestionAuthoringItem; index: number } => c.item !== null);

    itemReports.forEach((ir, i) => {
      if (!items[i]) ir.gates.GATE_5_ANTI_DUPLICATE.errors.push('Skipped: earlier gate failed.');
    });
    if (candidates.length === 0) return;

    // Exact (DB checksum) — existing bank + within batch.
    let exactRows: ExactDuplicateLookupRow[] | null = null;
    try {
      exactRows = await lookups.findExactDuplicates(
        topicId,
        candidates.map((c) => c.item.stem)
      );
      if (!Array.isArray(exactRows) || exactRows.length !== candidates.length) {
        throw new Error('checksum lookup returned an unexpected row count');
      }
    } catch (err) {
      const msg = `Exact-duplicate lookup failed (fail-closed): ${errMessage(err)}`;
      candidates.forEach((c) => itemReports[c.index].gates.GATE_5_ANTI_DUPLICATE.errors.push(msg));
      return;
    }

    let existing: ExistingStemRow[] | null = null;
    try {
      existing = await lookups.listExistingStems(topicId);
      if (!Array.isArray(existing)) throw new Error('existing stem lookup returned no array');
    } catch (err) {
      const msg = `Near-duplicate lookup failed (fail-closed): ${errMessage(err)}`;
      candidates.forEach((c) => itemReports[c.index].gates.GATE_5_ANTI_DUPLICATE.errors.push(msg));
      return;
    }

    const checksumOwner = new Map<string, number>();
    candidates.forEach((c, ci) => {
      const gate = itemReports[c.index].gates.GATE_5_ANTI_DUPLICATE;
      const row = exactRows![ci];
      gate.details = { contentChecksum: row.checksum };
      if (!row.checksum) gate.errors.push('Checksum missing from database response (fail-closed).');
      if (row.duplicateVersionId) {
        gate.errors.push(`Exact duplicate of existing question version ${row.duplicateVersionId.slice(0, 8)} on this topic.`);
      }
      if (row.checksum) {
        const owner = checksumOwner.get(row.checksum);
        if (owner !== undefined) {
          gate.errors.push(`Exact duplicate of batch item "${itemReports[owner].clientRef}".`);
        } else {
          checksumOwner.set(row.checksum, c.index);
        }
      }
    });

    // Near-duplicates: vs existing bank, then within batch.
    candidates.forEach((c, ci) => {
      const ir = itemReports[c.index];
      const gate = ir.gates.GATE_5_ANTI_DUPLICATE;
      const consider = (match: NearDuplicateMatch, label: string) => {
        if (match.similarity >= QF_NEAR_DUP_REJECT_THRESHOLD) {
          gate.errors.push(`Near-duplicate (${match.similarity.toFixed(2)}) of ${label}.`);
          ir.nearDuplicates.push(match);
        } else if (match.similarity >= QF_NEAR_DUP_WARN_THRESHOLD) {
          gate.warnings.push(`Possible near-duplicate (${match.similarity.toFixed(2)}) of ${label} — reviewer must check.`);
          ir.nearDuplicates.push(match);
        }
      };

      existing!.forEach((row) => {
        if (exactRows![ci].duplicateVersionId === row.versionId) return; // already reported as exact
        const sim = jaccardSimilarity(c.item.stem, row.stem);
        consider(
          { scope: 'EXISTING', similarity: sim, versionId: row.versionId, stemPreview: preview(row.stem) },
          `existing version ${row.versionId.slice(0, 8)}`
        );
      });

      for (let cj = 0; cj < ci; cj++) {
        const other = candidates[cj];
        if (exactRows![cj].checksum && exactRows![cj].checksum === exactRows![ci].checksum) continue;
        const sim = jaccardSimilarity(c.item.stem, other.item.stem);
        consider(
          {
            scope: 'BATCH',
            similarity: sim,
            clientRef: itemReports[other.index].clientRef,
            stemPreview: preview(other.item.stem),
          },
          `batch item "${itemReports[other.index].clientRef}"`
        );
      }
    });
  }
}

export { GATE_IDS as QUESTION_GATE_IDS };
