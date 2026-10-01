/**
 * COURAGE LIBRARY — CURRENT AFFAIRS STRUCTURED IMPORT SERVICE
 * Phase CA-2: Domain Services, Validation Gates & Import Boundary
 * Architecture Contract: Frozen v1.1.0
 */

import {
  CurrentAffairsImportPayload,
  DraftCreationResult,
} from '@/types/current-affairs';
import {
  CurrentAffairsValidationService,
  DbQueryInterface,
} from '@/services/current-affairs-validation.service';

export class CurrentAffairsImportService {
  /**
   * Safely extracts and parses JSON payload from raw string or markdown-fenced text
   */
  static parseRawInput(rawText: string): { success: boolean; data?: CurrentAffairsImportPayload; error?: string } {
    if (!rawText || typeof rawText !== 'string') {
      return { success: false, error: 'INVALID_INPUT: Input text is empty or not a string.' };
    }

    let cleaned = rawText.trim();

    // Strip markdown code fences if wrapped in ```json ... ``` or ``` ... ```
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      const lastFence = cleaned.lastIndexOf('```');

      if (firstNewline !== -1 && lastFence > firstNewline) {
        cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
      }
    }

    try {
      const parsed = JSON.parse(cleaned) as CurrentAffairsImportPayload;
      return { success: true, data: parsed };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        error: `INVALID_JSON: Failed to parse JSON structure (${msg}). Ensure valid JSON formatting without trailing commas or unbalanced brackets.`,
      };
    }
  }

  /**
   * Imports external AI or staff payload through the 5-Gate validation pipeline
   * into a quarantined DRAFT state within an atomic transaction.
   */
  static async importDraft(
    rawInput: string | CurrentAffairsImportPayload,
    authorUserId?: string | null,
    db?: DbQueryInterface & {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    }
  ): Promise<DraftCreationResult> {
    // 1. Parse JSON if passed as string
    let payload: CurrentAffairsImportPayload;
    if (typeof rawInput === 'string') {
      const parseRes = this.parseRawInput(rawInput);
      if (!parseRes.success || !parseRes.data) {
        return {
          success: false,
          articleId: '',
          versionId: '',
          versionNumber: 0,
          slug: '',
          status: 'DRAFT',
          checksumSha256: '',
          gateReport: {
            passed: false,
            checksumSha256: '',
            normalizedPayload: {} as CurrentAffairsImportPayload,
            gates: {},
            errors: [parseRes.error || 'JSON parsing failed.'],
            warnings: [],
          },
          error: parseRes.error,
        };
      }
      payload = parseRes.data;
    } else {
      payload = rawInput;
    }

    // 2. Execute 5 Validation Gates
    const gateReport = await CurrentAffairsValidationService.runAllGates(payload, db);

    if (!gateReport.passed) {
      return {
        success: false,
        articleId: '',
        versionId: '',
        versionNumber: 0,
        slug: gateReport.normalizedPayload.slug || '',
        status: 'DRAFT',
        checksumSha256: gateReport.checksumSha256,
        gateReport,
        error: `GATE_VALIDATION_FAILED: ${gateReport.errors.join('; ')}`,
      };
    }

    const norm = gateReport.normalizedPayload;
    const checksum = gateReport.checksumSha256;

    // If db is not passed, use createAdminServerSupabaseClient fallback
    if (!db) {
      try {
        const { createAdminServerSupabaseClient } = require('@/lib/supabase/server');
        const supabase = createAdminServerSupabaseClient();

        let finalSlug = norm.slug || 'ca-article';
        const { data: existingSlug } = await supabase
          .from('current_affairs_articles')
          .select('id')
          .eq('slug', finalSlug);
        if (existingSlug && existingSlug.length > 0) {
          finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
        }

        const { data: artData, error: artErr } = await supabase
          .from('current_affairs_articles')
          .insert({
            slug: finalSlug,
            news_date: norm.newsDate,
            category: norm.category,
            importance_tier: norm.importanceTier || 'HIGH',
            status: 'DRAFT',
            created_by: authorUserId || null,
          })
          .select('id, slug, status')
          .single();

        if (artErr || !artData) {
          throw new Error(`Failed to create article: ${artErr?.message}`);
        }

        const articleId = artData.id;

        const validationFlags = {
          gate1Passed: true,
          gate2Passed: true,
          gate3Passed: true,
          gate4Passed: true,
          gate5Passed: true,
          checksumSha256: checksum,
          validatedAt: new Date().toISOString(),
        };

        const { data: verData, error: verErr } = await supabase
          .from('current_affairs_article_versions')
          .insert({
            article_id: articleId,
            version_number: 1,
            headline: norm.headline,
            summary_md: norm.summaryMd,
            key_takeaways: norm.keyTakeaways,
            important_facts: norm.importantFacts || [],
            exam_relevance_notes: norm.examRelevanceNotes || {},
            provenance_sources: norm.sources,
            validation_flags: validationFlags,
            checksum_sha256: checksum,
            status: 'DRAFT',
            created_by: authorUserId || null,
          })
          .select('id, version_number, status')
          .single();

        if (verErr || !verData) {
          await supabase.from('current_affairs_articles').delete().eq('id', articleId);
          throw new Error(`Failed to create version: ${verErr?.message}`);
        }

        const versionId = verData.id;

        if (norm.sources && norm.sources.length > 0) {
          const sInserts = norm.sources.map((s) => ({
            version_id: versionId,
            title: s.title,
            publisher: s.publisher,
            url: s.url,
            tier: s.tier,
            citation_context: s.citationContext || null,
          }));
          await supabase.from('current_affairs_sources').insert(sInserts);
        }

        if (norm.taxonomyMappings && norm.taxonomyMappings.length > 0) {
          const taxInserts = norm.taxonomyMappings.map((tm) => ({
            article_id: articleId,
            taxonomy_node_id: tm.taxonomyNodeId,
            is_primary: tm.isPrimary || false,
            relevance_score: tm.relevanceScore || 1.0,
          }));
          await supabase.from('current_affairs_taxonomy_mappings').insert(taxInserts);
        }

        if (norm.examMappings && norm.examMappings.length > 0) {
          const examInserts = norm.examMappings.map((em) => ({
            article_id: articleId,
            exam_id: em.examId,
            relevance_weight: em.relevanceWeight || 'HIGH',
            is_high_yield: em.isHighYield || false,
            display_priority: em.displayPriority || 0,
          }));
          await supabase.from('current_affairs_exam_mappings').insert(examInserts);
        }

        if (norm.questionMappings && norm.questionMappings.length > 0) {
          const qInserts = norm.questionMappings.map((qm) => ({
            article_id: articleId,
            question_id: qm.questionId,
            display_order: qm.displayOrder || 1,
          }));
          await supabase.from('current_affairs_question_mappings').insert(qInserts);
        }

        if (norm.learningMappings && norm.learningMappings.length > 0) {
          const learnInserts = norm.learningMappings.map((lm) => ({
            article_id: articleId,
            learning_resource_id: lm.learningResourceId,
            display_order: lm.displayOrder || 1,
          }));
          await supabase.from('current_affairs_learning_mappings').insert(learnInserts);
        }

        return {
          success: true,
          articleId,
          versionId,
          versionNumber: verData.version_number,
          slug: artData.slug,
          status: 'DRAFT',
          checksumSha256: checksum,
          gateReport,
        };
      } catch (err: any) {
        return {
          success: false,
          articleId: '',
          versionId: '',
          versionNumber: 0,
          slug: '',
          status: 'DRAFT',
          checksumSha256: '',
          gateReport,
          error: `PERSISTENCE_FAILED: ${err.message}`,
        };
      }
    }

    // 3. Persist Atomically in Transaction via db
    try {
      await db.query('BEGIN');

      // A. Generate unique slug if collision occurs
      let finalSlug = norm.slug || 'ca-article';
      const existingSlug = await db.query(
        'SELECT id FROM public.current_affairs_articles WHERE slug = $1',
        [finalSlug]
      );
      if (existingSlug.rows.length > 0) {
        finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
      }

      // B. Insert Master Item (Identity)
      const resArticle = await db.query(
        `INSERT INTO public.current_affairs_articles (
          slug, news_date, category, importance_tier, status, created_by
        ) VALUES ($1, $2, $3, $4, 'DRAFT', $5)
        RETURNING id, slug, status`,
        [finalSlug, norm.newsDate, norm.category, norm.importanceTier || 'HIGH', authorUserId]
      );
      const articleId = (resArticle.rows[0] as { id: string }).id;

      // C. Insert Version 1 (Immutable Draft Snapshot)
      const validationFlags = {
        gate1Passed: true,
        gate2Passed: true,
        gate3Passed: true,
        gate4Passed: true,
        gate5Passed: true,
        checksumSha256: checksum,
        validatedAt: new Date().toISOString(),
      };

      const resVersion = await db.query(
        `INSERT INTO public.current_affairs_article_versions (
          article_id, version_number, headline, summary_md, key_takeaways,
          important_facts, exam_relevance_notes, provenance_sources, validation_flags,
          checksum_sha256, status, created_by
        ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT', $10)
        RETURNING id, version_number, status`,
        [
          articleId,
          norm.headline,
          norm.summaryMd,
          JSON.stringify(norm.keyTakeaways),
          JSON.stringify(norm.importantFacts || []),
          JSON.stringify(norm.examRelevanceNotes || {}),
          JSON.stringify(norm.sources),
          JSON.stringify(validationFlags),
          checksum,
          authorUserId,
        ]
      );
      const versionId = (resVersion.rows[0] as { id: string }).id;

      // D. Insert Normalized Sources
      for (const s of norm.sources) {
        await db.query(
          `INSERT INTO public.current_affairs_sources (
            version_id, title, publisher, url, tier, citation_context
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [versionId, s.title, s.publisher, s.url, s.tier, s.citationContext || null]
        );
      }

      // E. Insert Taxonomy Mappings
      for (const tm of norm.taxonomyMappings) {
        await db.query(
          `INSERT INTO public.current_affairs_taxonomy_mappings (
            article_id, taxonomy_node_id, is_primary, relevance_score
          ) VALUES ($1, $2, $3, $4)`,
          [articleId, tm.taxonomyNodeId, tm.isPrimary || false, tm.relevanceScore || 1.0]
        );
      }

      // F. Insert Exam Mappings (if present)
      if (norm.examMappings && norm.examMappings.length > 0) {
        for (const em of norm.examMappings) {
          await db.query(
            `INSERT INTO public.current_affairs_exam_mappings (
              article_id, exam_id, relevance_weight, is_high_yield, display_priority
            ) VALUES ($1, $2, $3, $4, $5)`,
            [articleId, em.examId, em.relevanceWeight || 'HIGH', em.isHighYield || false, em.displayPriority || 0]
          );
        }
      }

      // G. Insert Question Mappings (if present)
      if (norm.questionMappings && norm.questionMappings.length > 0) {
        for (const qm of norm.questionMappings) {
          await db.query(
            `INSERT INTO public.current_affairs_question_mappings (
              article_id, question_id, display_order
            ) VALUES ($1, $2, $3)`,
            [articleId, qm.questionId, qm.displayOrder || 1]
          );
        }
      }

      // H. Insert Learning Mappings (if present)
      if (norm.learningMappings && norm.learningMappings.length > 0) {
        for (const lm of norm.learningMappings) {
          await db.query(
            `INSERT INTO public.current_affairs_learning_mappings (
              article_id, learning_resource_id, display_order
            ) VALUES ($1, $2, $3)`,
            [articleId, lm.learningResourceId, lm.displayOrder || 1]
          );
        }
      }

      await db.query('COMMIT');

      return {
        success: true,
        articleId,
        versionId,
        versionNumber: 1,
        slug: finalSlug,
        status: 'DRAFT',
        checksumSha256: checksum,
        gateReport,
      };
    } catch (e: unknown) {
      await db.query('ROLLBACK');
      const msg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        articleId: '',
        versionId: '',
        versionNumber: 0,
        slug: norm.slug || '',
        status: 'DRAFT',
        checksumSha256: checksum,
        gateReport,
        error: `PERSISTENCE_TRANSACTION_FAILED: ${msg}`,
      };
    }
  }
}
