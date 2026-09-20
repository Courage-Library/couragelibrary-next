/**
 * COURAGE LIBRARY — AI PROVIDER CONTRACTS & ARCHITECTURAL TYPES
 * Phase 3E.1: AI Architecture & Provider Abstraction Foundation
 * 
 * Defines authoritative domain contracts for:
 * 1. AI Provider abstraction & configuration
 * 2. Generation request & response contracts
 * 3. Model registry & purpose taxonomy
 * 4. Normalized error taxonomy & retry classification
 * 5. Idempotency & audit metadata
 * 6. Cost & usage tracking structures
 * 
 * SACRED INVARIANT:
 * AI is strictly an authoring assistant generating candidate structured drafts.
 * AI is NEVER the curriculum, Question Bank, asset, approval, or publication authority.
 */

import { LessonDocumentSpec, ContentLanguage, DifficultyTier, DocumentType } from './learning-compiler';

export type AIProviderId =
  | 'MOCK'
  | 'GOOGLE_GEMINI'
  | 'OPENAI'
  | 'ANTHROPIC'
  | 'OPENROUTER';

export type AIPurpose =
  | 'CONTENT_GENERATION'
  | 'CONTENT_REVISION'
  | 'CONTENT_VALIDATION'
  | 'TRANSLATION'
  | 'SUMMARIZATION';

/**
 * Normalized Error Taxonomy for AI Engine Operations
 */
export type AIErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'MALFORMED_OUTPUT'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'CONTENT_POLICY_REFUSAL'
  | 'PERMANENT_PROVIDER_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Retryability Classification
 */
export interface AIRetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrorCodes: AIErrorCode[];
}

export const DEFAULT_AI_RETRY_POLICY: AIRetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 8000,
  retryableErrorCodes: [
    'TIMEOUT',
    'RATE_LIMITED',
    'PROVIDER_UNAVAILABLE',
  ],
};

/**
 * Centralized Model Specification
 */
export interface AIModelConfig {
  providerId: AIProviderId;
  modelId: string;
  displayName: string;
  purpose: AIPurpose;
  isEnabled: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  timeoutMs: number;
  costPer1kInputTokensUsd?: number;
  costPer1kOutputTokensUsd?: number;
  retryPolicy: AIRetryPolicy;
}

/**
 * Token Usage & Latency Metadata
 */
export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

/**
 * Normalized AI Generation Request
 */
export interface AIGenerationRequest {
  requestId: string;
  idempotencyKey: string;
  purpose: AIPurpose;
  targetModel?: string;
  learningUnitId: string;
  documentType: DocumentType;
  academicContext: {
    examIds: string[];
    subjectId: string;
    subjectName: string;
    topicId: string;
    topicName: string;
    subtopicId?: string;
    subtopicName?: string;
    unitTitle: string;
    unitSlug: string;
    targetDifficulty: DifficultyTier;
    primaryLanguage: ContentLanguage;
    prerequisiteTopics?: string[];
  };
  generationDirectives: {
    focusKeywords: string[];
    includeFormulas: boolean;
    includeWorkedExamples: boolean;
    includeTraps: boolean;
    quickCheckCount: number;
    customInstructions?: string;
  };
  authoritativeReferences?: {
    allowedQuestionIds?: string[];
    allowedAssetIds?: string[];
  };
  requester: {
    adminUserId: string;
    adminEmail?: string;
    ipAddress?: string;
  };
  timestamp: string;
}

/**
 * Normalized AI Generation Response
 */
export interface AINormalizedResponse<T = unknown> {
  success: boolean;
  requestId: string;
  idempotencyKey: string;
  providerId: AIProviderId;
  modelId: string;
  data?: T;
  error?: {
    code: AIErrorCode;
    message: string;
    isRetryable: boolean;
    details?: Record<string, unknown>;
  };
  usage: AITokenUsage;
  latencyMs: number;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error' | 'unknown';
  timestamp: string;
}

/**
 * Structured Generation Result targeting LessonDocumentSpec
 */
export interface AILessonGenerationResult {
  spec: LessonDocumentSpec;
  validation: {
    isStructurallyValid: boolean;
    errors: string[];
    warnings: string[];
  };
  academicValidation?: {
    outcome: 'PASS' | 'WARNING' | 'BLOCK';
    isValid: boolean;
    canProceedToReview: boolean;
    issues: Array<{
      severity: 'BLOCK' | 'WARNING';
      code: string;
      field: string;
      message: string;
    }>;
    summary: {
      blocks: number;
      warnings: number;
      sectionCount: number;
      formulaCount: number;
      workedExampleCount: number;
      trapCount: number;
      pyqReferenceCount: number;
      quickCheckCount: number;
    };
  };
  idempotencyHash: string;
  auditMetadata: AIAuditLogEntry;
}

/**
 * Audit Log Record for AI Operations
 */
export interface AIAuditLogEntry {
  generationRequestId: string;
  requesterAdminId: string;
  timestamp: string;
  providerId: AIProviderId;
  modelId: string;
  purpose: AIPurpose;
  learningUnitId: string;
  documentId?: string;
  createdDocumentVersionId?: string;
  requestHash: string;
  responseStatus: 'SUCCESS' | 'VALIDATION_FAILED' | 'PROVIDER_ERROR';
  errorCode?: AIErrorCode;
  tokenUsage: AITokenUsage;
  latencyMs: number;
  retryCount: number;
  disposition: 'SAVED_AS_DRAFT' | 'DISCARDED_INVALID' | 'FAILED';
}
