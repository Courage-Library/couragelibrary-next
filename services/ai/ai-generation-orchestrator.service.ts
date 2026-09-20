/**
 * COURAGE LIBRARY — AI GENERATION ORCHESTRATOR
 * Phase 3E.3: Production AI Content Generation & Human Review Pipeline
 * 
 * Coordinates generation requests, curriculum context building, idempotency hashing,
 * concurrency locking, provider selection (Mock vs Gemini), structural schema validation,
 * AST security scanning, academic validation (PASS/WARNING/BLOCK), and candidate DRAFT preparation.
 * 
 * STRICT ARCHITECTURAL INVARIANT:
 * AI-generated content CANNOT publish directly.
 * It is ALWAYS saved as a candidate DRAFT (review_status = 'AI_GENERATED')
 * requiring explicit human admin review, compilation, and approval.
 */

import crypto from 'crypto';
import {
  AIGenerationRequest,
  AINormalizedResponse,
  AILessonGenerationResult,
  AIAuditLogEntry,
  AIErrorCode,
  AIProviderId,
} from '@/types/ai-provider';
import { AIProvider, AIEngineError } from './ai-provider.interface';
import { AIModelConfigRegistry } from './ai-model-registry';
import { MockAIProvider } from './mock-ai-provider.service';
import { GeminiAIProvider } from './gemini-provider.service';
import { CurriculumContextBuilder, ContextBuilderParams } from './curriculum-context-builder.service';
import { ContentSpecValidator } from '@/services/content-spec-validator';
import { MdxSecurityScanner } from '@/services/mdx-security-scanner';
import { AcademicValidator, AcademicValidationResult } from './academic-validator.service';
import { LessonDocumentSpec, DocumentType } from '@/types/learning-compiler';
import { AdminGenerationDirectives, CurriculumAIContext } from '@/types/ai-curriculum-context';

export interface GenerateFromCurriculumParams {
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
  directives?: AdminGenerationDirectives;
  adminUserId: string;
  adminEmail?: string;
  idempotencyKey?: string;
  providerId?: AIProviderId;
  targetModel?: string;
  supabaseClient?: any;
  prefetchedData?: ContextBuilderParams['prefetchedData'];
}

export interface RegenerateSectionParams {
  learningUnitId: string;
  documentType: DocumentType;
  currentSpec: LessonDocumentSpec;
  sectionId: string;
  directives?: AdminGenerationDirectives;
  adminUserId: string;
  adminEmail?: string;
  providerId?: AIProviderId;
  targetModel?: string;
  supabaseClient?: any;
  prefetchedData?: ContextBuilderParams['prefetchedData'];
}

export class AIGenerationOrchestrator {
  private static providerInstance: AIProvider = new MockAIProvider();
  private static geminiProviderInstance: GeminiAIProvider = new GeminiAIProvider();
  private static inFlightRequests: Set<string> = new Set();

  /**
   * Inject or configure the active default provider implementation
   */
  static setProvider(provider: AIProvider): void {
    this.providerInstance = provider;
  }

  static getProvider(providerId?: AIProviderId): AIProvider {
    if (providerId === 'GOOGLE_GEMINI') {
      return this.geminiProviderInstance;
    }
    return this.providerInstance;
  }

  /**
   * Computes a deterministic SHA-256 hash representing the exact request parameters
   */
  static computeIdempotencyHash(request: AIGenerationRequest): string {
    const payload = JSON.stringify({
      learningUnitId: request.learningUnitId,
      documentType: request.documentType,
      academicContext: request.academicContext,
      generationDirectives: request.generationDirectives,
      targetModel: request.targetModel || 'default',
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Generates a curriculum-aware candidate LessonDocumentSpec draft from canonical taxonomy
   */
  static async generateFromCurriculum(
    params: GenerateFromCurriculumParams
  ): Promise<AILessonGenerationResult> {
    if (!params.adminUserId) {
      throw new AIEngineError('AUTHENTICATION_ERROR', 'adminUserId is required for AI generation.');
    }

    // 1. Build Authoritative Curriculum Context
    const curriculumContext: CurriculumAIContext = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      targetExamId: params.targetExamId,
      requestedLanguage: params.directives?.preferredLanguage || 'en',
      requestedDocumentType: params.documentType,
      directives: params.directives,
      supabaseClient: params.supabaseClient,
      prefetchedData: params.prefetchedData,
    });

    const requestId = `req-${crypto.randomUUID()}`;
    const idempotencyKey = params.idempotencyKey || `idem-${curriculumContext.contextHash.slice(0, 16)}`;

    // 2. Assemble Normalized AIGenerationRequest
    const generationRequest: AIGenerationRequest = {
      requestId,
      idempotencyKey,
      purpose: 'CONTENT_GENERATION',
      targetModel: params.targetModel,
      learningUnitId: curriculumContext.learningUnit.id,
      documentType: params.documentType,
      academicContext: {
        examIds: curriculumContext.examContext.map((e) => e.examId),
        subjectId: curriculumContext.taxonomy.subjectId,
        subjectName: curriculumContext.taxonomy.subjectName,
        topicId: curriculumContext.taxonomy.topicId,
        topicName: curriculumContext.taxonomy.topicName,
        subtopicId: curriculumContext.taxonomy.subtopicId || undefined,
        subtopicName: curriculumContext.taxonomy.subtopicName || undefined,
        unitTitle: curriculumContext.learningUnit.title,
        unitSlug: curriculumContext.learningUnit.slug,
        targetDifficulty: curriculumContext.generationDirectives.targetDifficultyTier || (curriculumContext.requiredDepth === 'ADVANCED_COMPETITIVE' ? 'ADVANCED' : 'INTERMEDIATE'),
        primaryLanguage: curriculumContext.language.requestedLanguage,
        prerequisiteTopics: curriculumContext.relationships.prerequisites.map((p) => p.topicName),
      },
      generationDirectives: {
        focusKeywords: curriculumContext.generationDirectives.focusKeywords || [],
        includeFormulas: curriculumContext.generationDirectives.includeFormulas ?? true,
        includeWorkedExamples: curriculumContext.generationDirectives.includeWorkedExamples ?? true,
        includeTraps: curriculumContext.generationDirectives.includeTraps ?? true,
        quickCheckCount: curriculumContext.generationDirectives.quickCheckCount ?? 2,
        customInstructions: curriculumContext.generationDirectives.customInstructions,
      },
      authoritativeReferences: {
        allowedQuestionIds: curriculumContext.questionReferences.map((q) => q.questionVersionId),
      },
      requester: {
        adminUserId: params.adminUserId,
        adminEmail: params.adminEmail,
      },
      timestamp: new Date().toISOString(),
    };

    // 3. Select Provider
    const provider = this.getProvider(params.providerId);

    // 4. Execute Generation & Validation
    return this.executeGenerationWithProvider(generationRequest, provider, curriculumContext.contextHash);
  }

  /**
   * Generates a candidate LessonDocumentSpec draft via a given provider instance
   */
  static async generateLessonDraft(
    request: AIGenerationRequest
  ): Promise<AILessonGenerationResult> {
    return this.executeGenerationWithProvider(request, this.providerInstance);
  }

  /**
   * Targeted section-level regeneration without altering untouched sections
   */
  static async regenerateSection(
    params: RegenerateSectionParams
  ): Promise<AILessonGenerationResult> {
    const { currentSpec, sectionId } = params;

    const targetSectionIndex = currentSpec.sections?.findIndex((s) => s.id === sectionId);
    if (targetSectionIndex === undefined || targetSectionIndex === -1) {
      throw new AIEngineError(
        'INVALID_REQUEST',
        `Section '${sectionId}' not found in document spec for regeneration.`
      );
    }

    // Build context
    const curriculumContext = await CurriculumContextBuilder.buildContext({
      learningUnitId: params.learningUnitId,
      requestedDocumentType: params.documentType,
      directives: params.directives,
      supabaseClient: params.supabaseClient,
      prefetchedData: params.prefetchedData,
    });

    const targetSection = currentSpec.sections[targetSectionIndex];
    const requestId = `req-sec-${crypto.randomUUID()}`;
    const idempotencyKey = `idem-sec-${sectionId}-${crypto.randomUUID().slice(0, 8)}`;

    const generationRequest: AIGenerationRequest = {
      requestId,
      idempotencyKey,
      purpose: 'CONTENT_REVISION',
      targetModel: params.targetModel,
      learningUnitId: params.learningUnitId,
      documentType: params.documentType,
      academicContext: {
        examIds: curriculumContext.examContext.map((e) => e.examId),
        subjectId: curriculumContext.taxonomy.subjectId,
        subjectName: curriculumContext.taxonomy.subjectName,
        topicId: curriculumContext.taxonomy.topicId,
        topicName: curriculumContext.taxonomy.topicName,
        unitTitle: curriculumContext.learningUnit.title,
        unitSlug: curriculumContext.learningUnit.slug,
        targetDifficulty: curriculumContext.generationDirectives.targetDifficultyTier || 'INTERMEDIATE',
        primaryLanguage: curriculumContext.language.requestedLanguage,
      },
      generationDirectives: {
        focusKeywords: curriculumContext.generationDirectives.focusKeywords || [],
        includeFormulas: curriculumContext.generationDirectives.includeFormulas ?? true,
        includeWorkedExamples: curriculumContext.generationDirectives.includeWorkedExamples ?? true,
        includeTraps: curriculumContext.generationDirectives.includeTraps ?? true,
        quickCheckCount: 0,
        customInstructions: `REGENERATE SPECIFIC SECTION: '${targetSection.title}'. ${params.directives?.customInstructions || ''}`.trim(),
      },
      requester: {
        adminUserId: params.adminUserId,
        adminEmail: params.adminEmail,
      },
      timestamp: new Date().toISOString(),
    };

    const provider = this.getProvider(params.providerId);
    const result = await this.executeGenerationWithProvider(generationRequest, provider);

    // Deep clone spec and replace target section only
    const updatedSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(currentSpec));
    const regeneratedSection = result.spec.sections?.[0] || {
      id: sectionId,
      title: targetSection.title,
      sectionType: targetSection.sectionType,
      contentMarkdown: targetSection.contentMarkdown,
      diagramAssetId: targetSection.diagramAssetId,
      calloutNotes: targetSection.calloutNotes,
    };

    updatedSpec.sections[targetSectionIndex] = {
      ...regeneratedSection,
      id: sectionId,
      title: targetSection.title,
      sectionType: targetSection.sectionType,
    };

    // Re-validate composite spec
    const specValidation = ContentSpecValidator.validate(updatedSpec);
    const academicValidation = AcademicValidator.validate(
      updatedSpec,
      params.documentType,
      generationRequest.authoritativeReferences?.allowedQuestionIds
    );

    return {
      spec: updatedSpec,
      validation: {
        isStructurallyValid: specValidation.isStructurallyValid,
        errors: specValidation.errors.map((e) => `[${e.code}] ${e.message}`),
        warnings: specValidation.warnings,
      },
      academicValidation,
      idempotencyHash: result.idempotencyHash,
      auditMetadata: {
        ...result.auditMetadata,
        purpose: 'CONTENT_REVISION',
      },
    };
  }

  private static async executeGenerationWithProvider(
    request: AIGenerationRequest,
    provider: AIProvider,
    precomputedContextHash?: string
  ): Promise<AILessonGenerationResult> {
    if (!request.requestId || !request.learningUnitId) {
      throw new AIEngineError('INVALID_REQUEST', 'Missing required requestId or learningUnitId in generation request.');
    }

    const requestHash = precomputedContextHash || this.computeIdempotencyHash(request);

    // Concurrency Deduplication Lock
    if (this.inFlightRequests.has(requestHash)) {
      throw new AIEngineError(
        'RATE_LIMITED',
        'A generation request for this exact curriculum context is currently in-flight. Please wait for completion.',
        { isRetryable: false }
      );
    }

    this.inFlightRequests.add(requestHash);

    try {
      // 1. Invoke provider with strict LessonDocumentSpec structural validator
      const response: AINormalizedResponse<LessonDocumentSpec> = await provider.generateStructured(
        request,
        (raw: unknown) => {
          const validation = ContentSpecValidator.validate(raw);
          return {
            isValid: validation.isValid,
            data: raw as LessonDocumentSpec,
            errors: validation.errors.map((e) => `[${e.code}] ${e.message} at ${e.path}`),
            warnings: validation.warnings,
          };
        }
      );

      if (!response.success || !response.data) {
        const audit: AIAuditLogEntry = {
          generationRequestId: request.requestId,
          requesterAdminId: request.requester.adminUserId,
          timestamp: new Date().toISOString(),
          providerId: response.providerId,
          modelId: response.modelId,
          purpose: request.purpose,
          learningUnitId: request.learningUnitId,
          requestHash,
          responseStatus: response.error?.code === 'SCHEMA_VALIDATION_FAILED' ? 'VALIDATION_FAILED' : 'PROVIDER_ERROR',
          errorCode: response.error?.code || 'UNKNOWN_ERROR',
          tokenUsage: response.usage,
          latencyMs: response.latencyMs,
          retryCount: 0,
          disposition: 'FAILED',
        };

        throw new AIEngineError(
          response.error?.code || 'UNKNOWN_ERROR',
          response.error?.message || 'AI Generation failed.',
          { audit, details: response.error?.details }
        );
      }

      const spec = response.data;

      // 2. AST Security Scan on all Markdown sections
      const secErrors: string[] = [];
      for (const section of spec.sections || []) {
        const scanResult = MdxSecurityScanner.scan(section.contentMarkdown || '');
        if (!scanResult.isSafe) {
          for (const err of scanResult.errors) {
            secErrors.push(`Security violation in section "${section.title}": [${err.code}] ${err.message}`);
          }
        }
      }

      if (secErrors.length > 0) {
        const audit: AIAuditLogEntry = {
          generationRequestId: request.requestId,
          requesterAdminId: request.requester.adminUserId,
          timestamp: new Date().toISOString(),
          providerId: response.providerId,
          modelId: response.modelId,
          purpose: request.purpose,
          learningUnitId: request.learningUnitId,
          requestHash,
          responseStatus: 'VALIDATION_FAILED',
          errorCode: 'CONTENT_POLICY_REFUSAL',
          tokenUsage: response.usage,
          latencyMs: response.latencyMs,
          retryCount: 0,
          disposition: 'DISCARDED_INVALID',
        };

        throw new AIEngineError('CONTENT_POLICY_REFUSAL', `AI generated content violated security policy: ${secErrors.join('; ')}`, { audit });
      }

      // 3. Strict Structural Re-Validation
      const specValidation = ContentSpecValidator.validate(spec);

      // 4. Deterministic Academic Validation
      const academicValidation = AcademicValidator.validate(
        spec,
        request.documentType,
        request.authoritativeReferences?.allowedQuestionIds
      );

      if (academicValidation.outcome === 'BLOCK') {
        const blockReasons = academicValidation.issues
          .filter((i) => i.severity === 'BLOCK')
          .map((i) => `[${i.code}] ${i.message}`)
          .join('; ');

        const audit: AIAuditLogEntry = {
          generationRequestId: request.requestId,
          requesterAdminId: request.requester.adminUserId,
          timestamp: new Date().toISOString(),
          providerId: response.providerId,
          modelId: response.modelId,
          purpose: request.purpose,
          learningUnitId: request.learningUnitId,
          requestHash,
          responseStatus: 'VALIDATION_FAILED',
          errorCode: 'SCHEMA_VALIDATION_FAILED',
          tokenUsage: response.usage,
          latencyMs: response.latencyMs,
          retryCount: 0,
          disposition: 'DISCARDED_INVALID',
        };

        throw new AIEngineError(
          'SCHEMA_VALIDATION_FAILED',
          `AI generated content failed academic validation BLOCK rules: ${blockReasons}`,
          { audit, academicValidation }
        );
      }

      const auditMetadata: AIAuditLogEntry = {
        generationRequestId: request.requestId,
        requesterAdminId: request.requester.adminUserId,
        timestamp: new Date().toISOString(),
        providerId: response.providerId,
        modelId: response.modelId,
        purpose: request.purpose,
        learningUnitId: request.learningUnitId,
        requestHash,
        responseStatus: 'SUCCESS',
        tokenUsage: response.usage,
        latencyMs: response.latencyMs,
        retryCount: 0,
        disposition: 'SAVED_AS_DRAFT',
      };

      return {
        spec,
        validation: {
          isStructurallyValid: specValidation.isStructurallyValid,
          errors: specValidation.errors.map((e) => `[${e.code}] ${e.message}`),
          warnings: specValidation.warnings,
        },
        academicValidation,
        idempotencyHash: requestHash,
        auditMetadata,
      };
    } finally {
      this.inFlightRequests.delete(requestHash);
    }
  }
}
