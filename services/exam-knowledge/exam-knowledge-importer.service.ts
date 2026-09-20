/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE STRUCTURED IMPORTER SERVICE
 * Phase 3H.3: Structured External AI Import & Five-Gate Validation Pipeline
 * 
 * Ingests external-AI JSON outputs (from ChatGPT, Claude, Perplexity, Gemini, DeepSeek),
 * enforces the 5 validation gates, prevents stale/mismatched target imports,
 * detects claim conflicts, and safely creates AI_GENERATED draft versions in the database.
 * 
 * SACRED ARCHITECTURAL INVARIANTS:
 * 1. AI is an authoring assistant, NOT an authority.
 * 2. External AI responses are UNTRUSTED INPUT until validated by all 5 gates.
 * 3. AI_GENERATED drafts are saved with is_published = false and are NEVER publicly readable.
 * 4. Published versions are permanently immutable.
 * 5. Imported sources are initialized strictly as UNVERIFIED.
 * 6. Conflict with verified claims flags CONFLICT_REQUIRES_REVIEW without silent overwrite.
 */

import crypto from 'crypto';
import {
  ExamKnowledgeDocumentSpec,
  ExamKnowledgeImportParams,
  ExamKnowledgeImportResult,
  ExamKnowledgeContextError,
} from '@/types/exam-knowledge';
import { ExamKnowledgeValidatorService, ValidationContextOptions } from './exam-knowledge-validator.service';
import { ExamKnowledgeContextBuilder } from './exam-knowledge-context-builder.service';

export class ExamKnowledgeImporterService {
  /**
   * Normalizes raw text input by trimming whitespace and extracting JSON from markdown code fences.
   */
  static extractJsonFromRaw(rawInput: string): string {
    if (!rawInput || typeof rawInput !== 'string') {
      return '';
    }

    let cleaned = rawInput.trim();

    // Strip UTF-8 BOM if present
    if (cleaned.charCodeAt(0) === 0xfeff) {
      cleaned = cleaned.slice(1).trim();
    }

    // Match standard markdown code block: ```json ... ``` or ``` ... ```
    const fenceRegex = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i;
    const match = cleaned.match(fenceRegex);
    if (match && match[1]) {
      cleaned = match[1].trim();
    } else {
      const startFence = cleaned.indexOf('```');
      if (startFence !== -1) {
        const afterStart = cleaned.slice(startFence + 3);
        const nextLine = afterStart.indexOf('\n');
        const jsonStart = nextLine !== -1 ? afterStart.slice(nextLine + 1) : afterStart;
        const endFence = jsonStart.lastIndexOf('```');
        if (endFence !== -1) {
          cleaned = jsonStart.slice(0, endFence).trim();
        }
      }
    }

    return cleaned;
  }

  /**
   * Primary import execution pipeline.
   */
  static async importContent(params: ExamKnowledgeImportParams): Promise<ExamKnowledgeImportResult> {
    const {
      rawInput,
      expectedTarget,
      expectedContextHash,
      adminUserId,
      supabaseClient,
      prefetchedData,
    } = params;

    // 1. JSON Extraction & Syntax Check
    const cleanedJson = this.extractJsonFromRaw(rawInput);
    if (!cleanedJson) {
      throw new ExamKnowledgeContextError('INVALID_JSON', 'Provided payload is empty or not a valid JSON string.');
    }

    let parsedSpec: ExamKnowledgeDocumentSpec;
    try {
      parsedSpec = JSON.parse(cleanedJson);
    } catch (parseErr: any) {
      throw new ExamKnowledgeContextError('INVALID_JSON', `Failed to parse JSON: ${parseErr.message}`);
    }

    // 2. Deterministic Payload Hash for Idempotency
    const payloadHash = crypto.createHash('sha256').update(cleanedJson).digest('hex');

    // 3. Assemble Validation Context
    let serverCalculatedContextHash = expectedContextHash;
    let verifiedClaims: any[] = [];
    let verifiedSources: any[] = [];
    let questionsAllowlist: string[] = [];
    let canonicalSubjects: any[] = [];
    let canonicalTopics: any[] = [];
    let canonicalPosts: any[] = [];
    let existingDoc: any = null;
    let existingVersions: any[] = [];

    if (prefetchedData) {
      if (prefetchedData.exam) {
        const currentContext = await ExamKnowledgeContextBuilder.buildContext({
          examId: expectedTarget.examId,
          examCycleId: expectedTarget.examCycleId,
          moduleKey: expectedTarget.moduleKey,
          language: expectedTarget.language,
          prefetchedData,
        });
        serverCalculatedContextHash = currentContext.contextHash;
      } else if (prefetchedData.serverCalculatedContextHash) {
        serverCalculatedContextHash = prefetchedData.serverCalculatedContextHash;
      }
      verifiedClaims = prefetchedData.verifiedClaims || [];
      verifiedSources = prefetchedData.verifiedSources || [];
      questionsAllowlist = prefetchedData.questionsAllowlist || [];
      canonicalSubjects = prefetchedData.canonicalSubjects || [];
      canonicalTopics = prefetchedData.canonicalTopics || [];
      canonicalPosts = prefetchedData.canonicalPosts || [];
      existingDoc = prefetchedData.existingDocument;
      existingVersions = prefetchedData.existingVersions || [];
    } else if (supabaseClient) {
      // Build current server-side context to verify freshness
      const currentContext = await ExamKnowledgeContextBuilder.buildContext({
        examId: expectedTarget.examId,
        examCycleId: expectedTarget.examCycleId,
        moduleKey: expectedTarget.moduleKey,
        language: expectedTarget.language,
        supabaseClient,
      });
      serverCalculatedContextHash = currentContext.contextHash;

      // Fetch verified claims, sources, and questions
      const [clsRes, srcRes, qsRes, subjsRes, topsRes, postsRes] = await Promise.all([
        supabaseClient.from('exam_claims').select('*').eq('exam_id', expectedTarget.examId).eq('module_key', expectedTarget.moduleKey),
        supabaseClient.from('exam_sources').select('*').eq('exam_id', expectedTarget.examId),
        supabaseClient.from('questions').select('id'),
        supabaseClient.from('subjects').select('id, name, slug'),
        supabaseClient.from('topics').select('id, name'),
        supabaseClient.from('exam_posts').select('id, post_name').eq('exam_id', expectedTarget.examId),
      ]);

      verifiedClaims = clsRes.data || [];
      verifiedSources = srcRes.data || [];
      questionsAllowlist = (qsRes.data || []).map((q: any) => `question-${q.id}`);
      canonicalSubjects = subjsRes.data || [];
      canonicalTopics = topsRes.data || [];
      canonicalPosts = postsRes.data || [];

      // Fetch existing document & versions
      let docQuery = supabaseClient
        .from('exam_knowledge_documents')
        .select('*')
        .eq('exam_id', expectedTarget.examId)
        .eq('module_key', expectedTarget.moduleKey)
        .eq('language', expectedTarget.language);
      if (expectedTarget.examCycleId) {
        docQuery = docQuery.eq('exam_cycle_id', expectedTarget.examCycleId);
      } else {
        docQuery = docQuery.is('exam_cycle_id', null);
      }
      const { data: d } = await docQuery.maybeSingle();
      existingDoc = d;

      if (existingDoc) {
        const { data: vers } = await supabaseClient
          .from('exam_doc_versions')
          .select('*')
          .eq('document_id', existingDoc.id)
          .order('version_number', { ascending: false });
        existingVersions = vers || [];
      }
    }

    // Check Idempotency: Duplicate import detection
    if (existingVersions.length > 0) {
      const duplicate = existingVersions.find((v) => v.source_spec_hash === payloadHash);
      if (duplicate) {
        const validation = ExamKnowledgeValidatorService.validate(
          parsedSpec,
          {
            expectedTarget,
            expectedContextHash,
            serverCalculatedContextHash,
            verifiedClaims,
            verifiedSources,
            questionsAllowlist,
            canonicalSubjects,
            canonicalTopics,
            canonicalPosts,
          },
          cleanedJson
        );
        return {
          status: 'DUPLICATE',
          documentId: existingDoc?.id,
          versionId: duplicate.id,
          versionNumber: duplicate.version_number,
          reviewStatus: duplicate.review_status,
          isPublished: duplicate.is_published,
          validation,
          sourceSpecHash: payloadHash,
          errorMessage: `Identical payload already exists as version ${duplicate.version_number}.`,
        };
      }
    }

    // 4. Run Five-Gate Validation
    const validationOptions: ValidationContextOptions = {
      expectedTarget,
      expectedContextHash,
      serverCalculatedContextHash,
      verifiedClaims,
      verifiedSources,
      questionsAllowlist,
      canonicalSubjects,
      canonicalTopics,
      canonicalPosts,
    };

    const validationResult = ExamKnowledgeValidatorService.validate(parsedSpec, validationOptions, cleanedJson);

    // If any gate blocked, reject immediately without database mutation
    if (validationResult.overallOutcome === 'BLOCK') {
      const firstError = validationResult.errors[0] || 'Five-gate validation failed.';
      const errorCode = firstError.includes('TARGET_MISMATCH')
        ? 'TARGET_MISMATCH'
        : firstError.includes('STALE_CONTEXT')
        ? 'STALE_CONTEXT'
        : firstError.includes('Security violation')
        ? 'SECURITY_VIOLATION'
        : firstError.includes('INVALID_QUESTION_REFERENCE')
        ? 'INVALID_QUESTION_REFERENCE'
        : 'INVALID_SCHEMA';

      return {
        status: 'REJECTED',
        isPublished: false,
        validation: validationResult,
        errorCode,
        errorMessage: firstError,
      };
    }

    let documentId = existingDoc?.id || `doc-${expectedTarget.examSlug}-${expectedTarget.moduleKey.toLowerCase()}`;
    let versionNumber = existingVersions.length > 0 ? (existingVersions[0]?.version_number || 0) + 1 : 1;
    let versionId = `ver-${documentId}-${versionNumber}`;

    if (supabaseClient) {
      // A. Create or resolve parent document
      if (!existingDoc) {
        const { data: newDoc, error: docErr } = await supabaseClient
          .from('exam_knowledge_documents')
          .insert({
            exam_id: expectedTarget.examId,
            exam_cycle_id: expectedTarget.examCycleId || null,
            module_key: expectedTarget.moduleKey,
            slug: `${expectedTarget.examSlug}-${expectedTarget.moduleKey.toLowerCase().replace(/_/g, '-')}${expectedTarget.cycleYear ? `-${expectedTarget.cycleYear}` : ''}`,
            title: parsedSpec.metadata?.title || `${expectedTarget.moduleKey} - ${expectedTarget.examName}`,
            status: 'DRAFT',
            language: expectedTarget.language,
          })
          .select('id')
          .single();

        if (docErr || !newDoc) {
          throw new ExamKnowledgeContextError('INTERNAL_ERROR', `Failed to create exam knowledge document: ${docErr?.message}`);
        }
        documentId = newDoc.id;
      } else {
        documentId = existingDoc.id;
        versionNumber = (existingVersions[0]?.version_number || 0) + 1;
      }

      // B. Insert new AI_GENERATED draft version
      const { data: newVer, error: verErr } = await supabaseClient
        .from('exam_doc_versions')
        .insert({
          document_id: documentId,
          version_number: versionNumber,
          schema_version: '1.0.0',
          author_type: 'EXTERNAL_IMPORT',
          review_status: 'AI_GENERATED',
          is_published: false,
          source_spec_hash: payloadHash,
          source_context_hash: expectedContextHash,
          structured_payload: parsedSpec,
          created_by: adminUserId || null,
        })
        .select('id, version_number, review_status, is_published')
        .single();

      if (verErr || !newVer) {
        throw new ExamKnowledgeContextError('INTERNAL_ERROR', `Failed to create draft version: ${verErr?.message}`);
      }
      versionId = newVer.id;
      versionNumber = newVer.version_number;

      // C. Ingest Unverified Sources
      if (Array.isArray(parsedSpec.officialSources) && parsedSpec.officialSources.length > 0) {
        for (const src of parsedSpec.officialSources) {
          const { data: existingSrc } = await supabaseClient
            .from('exam_sources')
            .select('id')
            .eq('exam_id', expectedTarget.examId)
            .eq('source_url', src.url)
            .maybeSingle();

          if (!existingSrc) {
            await supabaseClient.from('exam_sources').insert({
              exam_id: expectedTarget.examId,
              exam_cycle_id: expectedTarget.examCycleId || null,
              source_type: src.sourceType || 'OTHER_OFFICIAL',
              title: src.title,
              source_url: src.url,
              issuing_authority: src.issuingAuthority,
              published_date: src.publishedDate || null,
              verification_status: 'UNVERIFIED',
              notes: 'Imported via External AI Authoring Pipeline. Pending academic review.',
            });
          }
        }
      }
    }

    return {
      status: 'IMPORTED',
      documentId,
      versionId,
      versionNumber,
      reviewStatus: 'AI_GENERATED',
      isPublished: false,
      validation: validationResult,
      sourceSpecHash: payloadHash,
      importAuditId: `audit-import-${payloadHash.slice(0, 12)}`,
    };
  }
}
