/**
 * COURAGE LIBRARY — CURRENT AFFAIRS 5-GATE VALIDATION ENGINE
 * Phase CA-2: Domain Services, Validation Gates & Import Boundary
 * Architecture Contract: Frozen v1.1.0
 */

import crypto from 'crypto';
import {
  CurrentAffairsImportPayload,
  GateValidationReport,
  ComprehensiveGateReport,
  ALL_CURRENT_AFFAIRS_CATEGORIES,
  CurrentAffairsCategory,
  CurrentAffairsImportanceTier,
  CurrentAffairsSourceTier,
} from '@/types/current-affairs';
import {
  detectAiCitationArtifacts,
  sanitizeAiCitationArtifacts,
} from '@/services/ai/ai-citation-sanitizer';
import { MdxSecurityScanner } from '@/services/mdx-security-scanner';

export interface DbQueryInterface {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export class CurrentAffairsValidationService {
  /**
   * Deterministically normalizes input text and payloads before validation
   */
  static normalizePayload(input: CurrentAffairsImportPayload): CurrentAffairsImportPayload {
    const normalizedHeadline = (input.headline || '').trim();
    const sanitizedSummary = sanitizeAiCitationArtifacts((input.summaryMd || '').trim());
    const sanitizedTakeaways = (input.keyTakeaways || []).map((t) =>
      sanitizeAiCitationArtifacts(t.trim())
    ).filter(Boolean);
    const sanitizedFacts = (input.importantFacts || []).map((f) =>
      sanitizeAiCitationArtifacts(f.trim())
    ).filter(Boolean);

    const generatedSlug = (input.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 150) || normalizedHeadline.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 150);

    return {
      ...input,
      headline: normalizedHeadline,
      slug: generatedSlug,
      summaryMd: sanitizedSummary,
      keyTakeaways: sanitizedTakeaways,
      importantFacts: sanitizedFacts,
      importanceTier: input.importanceTier || 'HIGH',
      sources: (input.sources || []).map((s) => ({
        ...s,
        title: (s.title || '').trim(),
        publisher: (s.publisher || '').trim(),
        url: (s.url || '').trim(),
      })),
      taxonomyMappings: input.taxonomyMappings || [],
      examMappings: input.examMappings || [],
      questionMappings: input.questionMappings || [],
      learningMappings: input.learningMappings || [],
    };
  }

  /**
   * Computes the deterministic SHA-256 content checksum
   */
  static computeContentChecksum(payload: CurrentAffairsImportPayload): string {
    const canonicalString = [
      payload.newsDate,
      payload.category,
      payload.headline.trim().toLowerCase(),
      payload.summaryMd.trim(),
      (payload.keyTakeaways || []).join('|'),
    ].join('::');

    return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
  }

  /**
   * GATE 1 — Schema & Structure Validation
   */
  static validateGate1_Schema(payload: unknown): GateValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!payload || typeof payload !== 'object') {
      return {
        gateId: 'GATE_1_SCHEMA',
        gateName: 'Schema & Structure',
        passed: false,
        errors: ['Payload is null, undefined, or not a JSON object.'],
        warnings: [],
      };
    }

    const p = payload as Partial<CurrentAffairsImportPayload>;

    // 1. Headline
    if (!p.headline || typeof p.headline !== 'string') {
      errors.push('Missing required field: headline (must be non-empty string).');
    } else if (p.headline.trim().length < 10) {
      errors.push('Headline is too short (minimum 10 characters required).');
    } else if (p.headline.trim().length > 300) {
      errors.push('Headline is too long (maximum 300 characters allowed).');
    }

    // 2. News Date
    if (!p.newsDate || typeof p.newsDate !== 'string') {
      errors.push('Missing required field: newsDate (YYYY-MM-DD format required).');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(p.newsDate)) {
      errors.push('Invalid newsDate format: must strictly match YYYY-MM-DD.');
    } else {
      const dateObj = new Date(p.newsDate);
      if (isNaN(dateObj.getTime())) {
        errors.push('Invalid newsDate: date does not exist on calendar.');
      }
    }

    // 3. Category
    if (!p.category || typeof p.category !== 'string') {
      errors.push('Missing required field: category.');
    } else if (!ALL_CURRENT_AFFAIRS_CATEGORIES.includes(p.category as CurrentAffairsCategory)) {
      errors.push(
        `Invalid category: "${p.category}". Must be one of: ${ALL_CURRENT_AFFAIRS_CATEGORIES.join(', ')}`
      );
    }

    // 4. Importance Tier
    const validTiers: CurrentAffairsImportanceTier[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (p.importanceTier && !validTiers.includes(p.importanceTier)) {
      errors.push(`Invalid importanceTier: "${p.importanceTier}". Must be one of: ${validTiers.join(', ')}`);
    }

    // 5. Summary Markdown
    if (!p.summaryMd || typeof p.summaryMd !== 'string') {
      errors.push('Missing required field: summaryMd (must be non-empty Markdown string).');
    } else if (p.summaryMd.trim().length < 50) {
      errors.push('Summary is too brief (minimum 50 characters required for exam depth).');
    }

    // 6. Key Takeaways
    if (!Array.isArray(p.keyTakeaways) || p.keyTakeaways.length === 0) {
      errors.push('Missing required field: keyTakeaways (must be non-empty array with at least 1 takeaway).');
    } else {
      p.keyTakeaways.forEach((t, idx) => {
        if (typeof t !== 'string' || t.trim().length < 5) {
          errors.push(`Key takeaway at index ${idx} is empty or too short (min 5 characters).`);
        }
      });
    }

    // 7. Sources Array Presence
    if (!Array.isArray(p.sources) || p.sources.length === 0) {
      errors.push('Missing required field: sources (must have at least 1 valid provenance source).');
    }

    // 8. Taxonomy Mappings Presence
    if (!Array.isArray(p.taxonomyMappings) || p.taxonomyMappings.length === 0) {
      errors.push('Missing required field: taxonomyMappings (must map to at least 1 canonical taxonomy node).');
    }

    return {
      gateId: 'GATE_1_SCHEMA',
      gateName: 'Schema & Structure',
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * GATE 2 — Citation Sanitization & AST Security
   */
  static validateGate2_SecurityAndCitations(payload: CurrentAffairsImportPayload): GateValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Scan summaryMd with MdxSecurityScanner
    const mdxScan = MdxSecurityScanner.scan(payload.summaryMd || '');
    if (!mdxScan.isSafe) {
      mdxScan.errors.forEach((err) => {
        errors.push(`MDX Security Violation: [${err.code}] ${err.message} at ${err.path}`);
      });
    }

    // 2. Scan for residual external AI citation artifacts in summary
    const detectedInSummary = detectAiCitationArtifacts(payload.summaryMd || '');
    if (detectedInSummary.length > 0) {
      warnings.push(
        `Detected ${detectedInSummary.length} external AI citation artifacts in summary (will be sanitized during import).`
      );
    }

    // 3. Scan takeaways & facts
    (payload.keyTakeaways || []).forEach((t, idx) => {
      const scan = MdxSecurityScanner.scan(t);
      if (!scan.isSafe) {
        scan.errors.forEach((err) => {
          errors.push(`Security violation in key takeaway #${idx + 1}: ${err.message}`);
        });
      }
    });

    return {
      gateId: 'GATE_2_SECURITY',
      gateName: 'Citation Sanitization & AST Security',
      passed: errors.length === 0,
      errors,
      warnings,
      details: {
        detectedArtifactsCount: detectedInSummary.length,
      },
    };
  }

  /**
   * GATE 3 — Provenance & URL Integrity
   */
  static validateGate3_ProvenanceAndUrls(payload: CurrentAffairsImportPayload): GateValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];

    const validTiers: CurrentAffairsSourceTier[] = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4'];

    if (!payload.sources || !Array.isArray(payload.sources) || payload.sources.length === 0) {
      return {
        gateId: 'GATE_3_PROVENANCE',
        gateName: 'Provenance & URL Integrity',
        passed: false,
        errors: ['No provenance sources provided.'],
        warnings: [],
      };
    }

    let hasAuthoritativeTier = false;

    payload.sources.forEach((s, idx) => {
      const prefix = `Source #${idx + 1}`;

      if (!s.title || s.title.trim().length === 0) {
        errors.push(`${prefix}: title is required.`);
      }
      if (!s.publisher || s.publisher.trim().length === 0) {
        errors.push(`${prefix}: publisher is required.`);
      }

      // Tier check
      if (!s.tier || !validTiers.includes(s.tier)) {
        errors.push(`${prefix}: invalid tier "${s.tier}". Must be TIER_1, TIER_2, TIER_3, or TIER_4.`);
      } else if (s.tier === 'TIER_4') {
        warnings.push(`${prefix}: Tier 4 (blog/coaching) cannot serve as sole authoritative verification.`);
      } else {
        hasAuthoritativeTier = true;
      }

      // URL check
      if (!s.url || typeof s.url !== 'string') {
        errors.push(`${prefix}: URL is required.`);
      } else {
        const trimmedUrl = s.url.trim().toLowerCase();

        // Scheme validation
        if (!trimmedUrl.startsWith('https://')) {
          errors.push(`${prefix}: URL must use secure HTTPS protocol (received: "${s.url}").`);
        }

        // Placeholder / localhost detection
        const forbiddenHosts = [
          'example.com',
          'localhost',
          '127.0.0.1',
          'test.com',
          'placeholder.com',
          'sample.gov',
          'fake.in',
        ];

        try {
          const parsed = new URL(s.url.trim());
          if (forbiddenHosts.some((h) => parsed.hostname.includes(h))) {
            errors.push(`${prefix}: Contains disallowed placeholder/localhost domain ("${parsed.hostname}").`);
          }
        } catch {
          errors.push(`${prefix}: Invalid URL syntax ("${s.url}").`);
        }
      }
    });

    if (!hasAuthoritativeTier) {
      errors.push('At least one Tier 1, Tier 2, or Tier 3 authoritative source is required.');
    }

    return {
      gateId: 'GATE_3_PROVENANCE',
      gateName: 'Provenance & URL Integrity',
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * GATE 4 — Canonical Taxonomy & Relational Mappings Validation
   */
  static async validateGate4_TaxonomyAndMappings(
    payload: CurrentAffairsImportPayload,
    db: DbQueryInterface
  ): Promise<GateValidationReport> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate Taxonomy Nodes
    if (!payload.taxonomyMappings || payload.taxonomyMappings.length === 0) {
      errors.push('At least one canonical taxonomy node mapping is required.');
    } else {
      const seenNodes = new Set<string>();
      for (const tm of payload.taxonomyMappings) {
        if (!tm.taxonomyNodeId) {
          errors.push('Taxonomy mapping is missing taxonomyNodeId.');
          continue;
        }

        if (seenNodes.has(tm.taxonomyNodeId)) {
          errors.push(`Duplicate taxonomy mapping detected for node ID: "${tm.taxonomyNodeId}".`);
        }
        seenNodes.add(tm.taxonomyNodeId);

        // Check node exists in canonical_taxonomy_nodes
        try {
          const res = await db.query(
            'SELECT id, name, slug FROM public.canonical_taxonomy_nodes WHERE id = $1',
            [tm.taxonomyNodeId]
          );
          if (res.rows.length === 0) {
            errors.push(`Taxonomy node ID "${tm.taxonomyNodeId}" does not exist in canonical_taxonomy_nodes.`);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Error verifying taxonomy node "${tm.taxonomyNodeId}": ${msg}`);
        }
      }
    }

    // 2. Validate Exam Mappings (if present)
    if (payload.examMappings && payload.examMappings.length > 0) {
      const seenExams = new Set<string>();
      for (const em of payload.examMappings) {
        if (!em.examId) {
          errors.push('Exam mapping is missing examId.');
          continue;
        }

        if (seenExams.has(em.examId)) {
          errors.push(`Duplicate exam mapping detected for exam ID: "${em.examId}".`);
        }
        seenExams.add(em.examId);

        try {
          const res = await db.query('SELECT id, slug, title FROM public.exams WHERE id = $1', [em.examId]);
          if (res.rows.length === 0) {
            errors.push(`Exam ID "${em.examId}" does not exist in canonical exams registry.`);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Error verifying exam "${em.examId}": ${msg}`);
        }
      }
    }

    // 3. Validate Question Mappings (if present)
    if (payload.questionMappings && payload.questionMappings.length > 0) {
      const seenQuestions = new Set<string>();
      for (const qm of payload.questionMappings) {
        if (!qm.questionId) {
          errors.push('Question mapping is missing questionId.');
          continue;
        }

        if (seenQuestions.has(qm.questionId)) {
          errors.push(`Duplicate question mapping detected for question ID: "${qm.questionId}".`);
        }
        seenQuestions.add(qm.questionId);

        try {
          const res = await db.query('SELECT id FROM public.questions WHERE id = $1', [qm.questionId]);
          if (res.rows.length === 0) {
            errors.push(`Question ID "${qm.questionId}" does not exist in canonical Question Bank.`);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Error verifying question "${qm.questionId}": ${msg}`);
        }
      }
    }

    // 4. Validate Learning Mappings (if present)
    if (payload.learningMappings && payload.learningMappings.length > 0) {
      const seenLearning = new Set<string>();
      for (const lm of payload.learningMappings) {
        if (!lm.learningResourceId) {
          errors.push('Learning mapping is missing learningResourceId.');
          continue;
        }

        if (seenLearning.has(lm.learningResourceId)) {
          errors.push(`Duplicate learning mapping detected for learning resource ID: "${lm.learningResourceId}".`);
        }
        seenLearning.add(lm.learningResourceId);

        try {
          const res = await db.query('SELECT id FROM public.learning_resources WHERE id = $1', [lm.learningResourceId]);
          if (res.rows.length === 0) {
            errors.push(`Learning Resource ID "${lm.learningResourceId}" does not exist in learning_resources.`);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Error verifying learning resource "${lm.learningResourceId}": ${msg}`);
        }
      }
    }

    return {
      gateId: 'GATE_4_TAXONOMY',
      gateName: 'Canonical Taxonomy & Relational Mappings',
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * GATE 5 — Anti-Duplicate Content Hash Validation
   */
  static async validateGate5_AntiDuplicateHash(
    checksum: string,
    newsDate: string,
    category: string,
    headline: string,
    db: DbQueryInterface,
    excludeArticleId?: string
  ): Promise<GateValidationReport> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Check exact checksum match in versions
      let sql1 = 'SELECT id, article_id, version_number, status FROM public.current_affairs_article_versions WHERE checksum_sha256 = $1';
      const params1: unknown[] = [checksum];
      if (excludeArticleId) {
        sql1 += ' AND article_id != $2';
        params1.push(excludeArticleId);
      }
      sql1 += ' LIMIT 1';

      const res = await db.query(sql1, params1);

      if (res.rows.length > 0) {
        const match = res.rows[0] as { id: string; article_id: string; version_number: number; status: string };
        errors.push(
          `DUPLICATE_CURRENT_AFFAIR: Exact identical content payload already exists in article "${match.article_id}" (v${match.version_number}, status: ${match.status}).`
        );
      }

      // 2. Check for same date + exact headline match in same category
      let sql2 = `SELECT a.id, a.slug, v.headline 
         FROM public.current_affairs_articles a
         JOIN public.current_affairs_article_versions v ON v.article_id = a.id
         WHERE a.news_date = $1 AND a.category = $2 AND LOWER(v.headline) = LOWER($3)`;
      const params2: unknown[] = [newsDate, category, headline.trim()];
      if (excludeArticleId) {
        sql2 += ' AND a.id != $4';
        params2.push(excludeArticleId);
      }
      sql2 += ' LIMIT 1';

      const resHeadline = await db.query(sql2, params2);

      if (resHeadline.rows.length > 0) {
        const match = resHeadline.rows[0] as { id: string; slug: string };
        errors.push(
          `DUPLICATE_HEADLINE: An article with identical headline already exists for date ${newsDate} under ${category} (Article ID: "${match.id}").`
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Error checking duplicate hashes: ${msg}`);
    }

    return {
      gateId: 'GATE_5_ANTI_DUPLICATE',
      gateName: 'Anti-Duplicate Content Hash',
      passed: errors.length === 0,
      errors,
      warnings,
      details: { checksumSha256: checksum },
    };
  }

  /**
   * Orchestrates execution of all 5 Validation Gates
   */
  static async runAllGates(
    rawPayload: unknown,
    db?: DbQueryInterface,
    excludeArticleId?: string
  ): Promise<ComprehensiveGateReport> {
    const activeDb = db || createDefaultDbAdapter();
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const gates: Record<string, GateValidationReport> = {};

    // Gate 1: Schema
    const g1 = this.validateGate1_Schema(rawPayload);
    gates['GATE_1_SCHEMA'] = g1;
    allErrors.push(...g1.errors);
    allWarnings.push(...g1.warnings);

    if (!g1.passed) {
      return {
        passed: false,
        checksumSha256: '',
        normalizedPayload: rawPayload as CurrentAffairsImportPayload,
        gates,
        errors: allErrors,
        warnings: allWarnings,
      };
    }

    const normalized = this.normalizePayload(rawPayload as CurrentAffairsImportPayload);
    const checksum = this.computeContentChecksum(normalized);

    // Gate 2: Security & Sanitization
    const g2 = this.validateGate2_SecurityAndCitations(normalized);
    gates['GATE_2_SECURITY'] = g2;
    allErrors.push(...g2.errors);
    allWarnings.push(...g2.warnings);

    // Gate 3: Provenance
    const g3 = this.validateGate3_ProvenanceAndUrls(normalized);
    gates['GATE_3_PROVENANCE'] = g3;
    allErrors.push(...g3.errors);
    allWarnings.push(...g3.warnings);

    // Gate 4: Taxonomy & Mappings
    const g4 = await this.validateGate4_TaxonomyAndMappings(normalized, activeDb);
    gates['GATE_4_TAXONOMY'] = g4;
    allErrors.push(...g4.errors);
    allWarnings.push(...g4.warnings);

    // Gate 5: Anti-Duplicate
    const g5 = await this.validateGate5_AntiDuplicateHash(
      checksum,
      normalized.newsDate,
      normalized.category,
      normalized.headline,
      activeDb,
      excludeArticleId
    );
    gates['GATE_5_ANTI_DUPLICATE'] = g5;
    allErrors.push(...g5.errors);
    allWarnings.push(...g5.warnings);

    const allPassed = Object.values(gates).every((g) => g.passed);

    return {
      passed: allPassed,
      checksumSha256: checksum,
      normalizedPayload: normalized,
      gates,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Alias for runAllGates
   */
  static async validateAllGates(
    rawPayload: unknown,
    excludeArticleId?: string,
    db?: DbQueryInterface
  ): Promise<ComprehensiveGateReport> {
    return this.runAllGates(rawPayload, db, excludeArticleId);
  }
}

/**
 * Creates default Supabase query adapter when direct pg client is not provided
 */
export function createDefaultDbAdapter(): DbQueryInterface {
  return {
    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
      try {
        const { createAdminServerSupabaseClient } = require('@/lib/supabase/server');
        const supabase = createAdminServerSupabaseClient();

        if (sql.includes('canonical_taxonomy_nodes WHERE id = $1')) {
          const { data } = await supabase.from('canonical_taxonomy_nodes').select('id, slug, name').eq('id', params?.[0]);
          return { rows: data || [] };
        }
        if (sql.includes('exams WHERE id = $1')) {
          const { data } = await supabase.from('exams').select('id, slug, title').eq('id', params?.[0]);
          return { rows: data || [] };
        }
        if (sql.includes('questions WHERE id = $1')) {
          const { data } = await supabase.from('questions').select('id').eq('id', params?.[0]);
          return { rows: data || [] };
        }
        if (sql.includes('learning_resources WHERE id = $1')) {
          const { data } = await supabase.from('learning_resources').select('id').eq('id', params?.[0]);
          return { rows: data || [] };
        }
        if (sql.includes('current_affairs_article_versions WHERE checksum_sha256 = $1')) {
          const { data } = await supabase.from('current_affairs_article_versions').select('id, article_id, version_number, status').eq('checksum_sha256', params?.[0]).limit(1);
          return { rows: data || [] };
        }
        if (sql.includes('current_affairs_articles a') && sql.includes('news_date = $1')) {
          const { data } = await supabase
            .from('current_affairs_articles')
            .select('id, slug, current_affairs_article_versions(headline)')
            .eq('news_date', params?.[0])
            .eq('category', params?.[1]);
          const matched = (data || []).filter((r: any) => {
            const v = r.current_affairs_article_versions?.[0];
            return v && v.headline?.toLowerCase() === (params?.[2] as string)?.toLowerCase();
          });
          return { rows: matched };
        }
        return { rows: [] };
      } catch {
        return { rows: [] };
      }
    },
  };
}
