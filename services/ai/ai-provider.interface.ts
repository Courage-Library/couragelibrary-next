/**
 * COURAGE LIBRARY — AI PROVIDER INTERFACE & NORMALIZATION CONTRACT
 * Phase 3E.1: AI Architecture & Provider Abstraction Foundation
 * 
 * Defines the vendor-neutral AI Provider interface and error normalization logic.
 * Providers (Gemini, OpenAI, Anthropic, OpenRouter, Mock) must implement this interface.
 */

import {
  AIProviderId,
  AIErrorCode,
  AIGenerationRequest,
  AINormalizedResponse,
  DEFAULT_AI_RETRY_POLICY,
} from '@/types/ai-provider';

export class AIEngineError extends Error {
  readonly code: AIErrorCode;
  readonly isRetryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: AIErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AIEngineError';
    this.code = code;
    this.isRetryable = DEFAULT_AI_RETRY_POLICY.retryableErrorCodes.includes(code);
    this.details = details;
  }
}

export interface AIStructuredValidator<T> {
  (raw: unknown): {
    isValid: boolean;
    data?: T;
    errors: string[];
    warnings?: string[];
  };
}

export interface AIProvider {
  readonly providerId: AIProviderId;
  isConfigured(): boolean;
  generateStructured<T>(
    request: AIGenerationRequest,
    validator: AIStructuredValidator<T>
  ): Promise<AINormalizedResponse<T>>;
}

/**
 * Normalizes vendor-specific exceptions into standard AIErrorCode
 */
export function classifyAIError(err: unknown): {
  code: AIErrorCode;
  isRetryable: boolean;
  message: string;
} {
  if (err instanceof AIEngineError) {
    return {
      code: err.code,
      isRetryable: err.isRetryable,
      message: err.message,
    };
  }

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  let code: AIErrorCode = 'UNKNOWN_ERROR';

  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota exceeded') || msg.includes('resource exhausted')) {
    code = 'RATE_LIMITED';
  } else if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('deadline exceeded') || msg.includes('timed out')) {
    code = 'TIMEOUT';
  } else if (msg.includes('auth') || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('forbidden') || msg.includes('403')) {
    code = 'AUTHENTICATION_ERROR';
  } else if (msg.includes('unavailable') || msg.includes('503') || msg.includes('bad gateway') || msg.includes('502') || msg.includes('connection reset')) {
    code = 'PROVIDER_UNAVAILABLE';
  } else if (msg.includes('safety') || msg.includes('harmful') || msg.includes('policy') || msg.includes('content filter') || msg.includes('refusal')) {
    code = 'CONTENT_POLICY_REFUSAL';
  } else if (msg.includes('json') || msg.includes('malformed') || msg.includes('unexpected token') || msg.includes('parse error')) {
    code = 'MALFORMED_OUTPUT';
  } else if (msg.includes('schema') || msg.includes('invalid field') || msg.includes('missing property')) {
    code = 'SCHEMA_VALIDATION_FAILED';
  } else if (msg.includes('bad request') || msg.includes('400') || msg.includes('invalid argument')) {
    code = 'INVALID_REQUEST';
  }

  const isRetryable = DEFAULT_AI_RETRY_POLICY.retryableErrorCodes.includes(code);

  return {
    code,
    isRetryable,
    message: err instanceof Error ? err.message : String(err),
  };
}
