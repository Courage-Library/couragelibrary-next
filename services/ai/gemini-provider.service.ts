/**
 * COURAGE LIBRARY — GOOGLE GEMINI PRODUCTION AI PROVIDER
 * Phase 3E.2: Curriculum Context Builder & First Production Provider
 * 
 * Server-only implementation of AIProvider for Google Gemini models (e.g. gemini-1.5-pro).
 * Operates strictly server-side using GEMINI_API_KEY.
 * 
 * INVARIANTS:
 * - API Key is NEVER exposed to the client or browser bundle.
 * - Missing GEMINI_API_KEY causes isConfigured() to return false safely without crashing startup.
 * - Output is strictly parsed as JSON and verified through the caller's structural schema validator.
 */

import {
  AIProviderId,
  AIErrorCode,
  AIGenerationRequest,
  AINormalizedResponse,
} from '@/types/ai-provider';
import { AIProvider, AIStructuredValidator, AIEngineError, classifyAIError } from './ai-provider.interface';
import { AIModelConfigRegistry } from './ai-model-registry';
import { AIPromptBuilder } from './ai-prompt-builder';
import { CurriculumAIContext } from '@/types/ai-curriculum-context';

export class GeminiAIProvider implements AIProvider {
  readonly providerId: AIProviderId = 'GOOGLE_GEMINI';

  /**
   * Checks whether the Gemini API key is configured in server environment variables.
   */
  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }

  /**
   * Executes structured generation via Google Gemini REST API.
   */
  async generateStructured<T>(
    request: AIGenerationRequest,
    validator: AIStructuredValidator<T>
  ): Promise<AINormalizedResponse<T>> {
    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new AIEngineError(
        'AUTHENTICATION_ERROR',
        'Google Gemini provider is not configured. GEMINI_API_KEY is missing on the server.'
      );
    }

    const modelId = request.targetModel || process.env.GEMINI_MODEL_ID || 'gemini-1.5-pro';
    const modelConfig = AIModelConfigRegistry.getModelConfig(modelId);

    // Build prompt from academic context
    const mockContext: CurriculumAIContext = {
      learningUnit: {
        id: request.learningUnitId,
        title: request.academicContext.unitTitle,
        slug: request.academicContext.unitSlug,
        unitType: request.documentType,
        estimatedMinutes: 8,
      },
      taxonomy: {
        subjectId: request.academicContext.subjectId,
        subjectName: request.academicContext.subjectName,
        subjectSlug: request.academicContext.subjectId,
        topicId: request.academicContext.topicId,
        topicName: request.academicContext.topicName,
        topicSlug: request.academicContext.topicId,
        subtopicId: request.academicContext.subtopicId || null,
        subtopicName: request.academicContext.subtopicName || null,
        canonicalPath: `${request.academicContext.subjectName} > ${request.academicContext.topicName}`,
      },
      examContext: (request.academicContext.examIds || []).map((id) => ({
        examId: id,
        examName: id,
        requiredDepth: request.academicContext.targetDifficulty === 'ADVANCED' ? 'ADVANCED_COMPETITIVE' : 'INTERMEDIATE_APPLICATION',
        importanceTier: 'HIGH',
        isMandatory: true,
      })),
      requiredDepth: request.academicContext.targetDifficulty === 'ADVANCED' ? 'ADVANCED_COMPETITIVE' : 'INTERMEDIATE_APPLICATION',
      relationships: {
        prerequisites: [],
        relatedTopics: [],
        advancedApplications: [],
        corequisites: [],
      },
      questionReferences: (request.authoritativeReferences?.allowedQuestionIds || []).map((qid) => ({
        questionVersionId: qid,
        questionId: qid,
        questionTextSnippet: 'Canonical practice problem',
        difficultyTier: request.academicContext.targetDifficulty || 'INTERMEDIATE',
      })),
      existingLearningReferences: [],
      language: {
        canonicalLanguage: 'en',
        requestedLanguage: request.academicContext.primaryLanguage || 'en',
      },
      generationDirectives: {
        focusKeywords: request.generationDirectives.focusKeywords,
        includeFormulas: request.generationDirectives.includeFormulas,
        includeWorkedExamples: request.generationDirectives.includeWorkedExamples,
        includeTraps: request.generationDirectives.includeTraps,
        quickCheckCount: request.generationDirectives.quickCheckCount,
        customInstructions: request.generationDirectives.customInstructions,
      },
      contextHash: request.idempotencyKey,
      totalCharacterCount: 1000,
    };

    const prompt = AIPromptBuilder.buildPrompt(mockContext, request.documentType);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.modelId}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt.userPrompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: prompt.systemInstruction }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: modelConfig.defaultTemperature,
        maxOutputTokens: modelConfig.maxOutputTokens,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), modelConfig.timeoutMs || 45000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        let errCode: AIErrorCode = 'UNKNOWN_ERROR';
        if (res.status === 400) errCode = 'INVALID_REQUEST';
        else if (res.status === 401 || res.status === 403) errCode = 'AUTHENTICATION_ERROR';
        else if (res.status === 429) errCode = 'RATE_LIMITED';
        else if (res.status >= 500) errCode = 'PROVIDER_UNAVAILABLE';

        const rawErrText = await res.text().catch(() => '');
        throw new AIEngineError(
          errCode,
          `Gemini API returned HTTP ${res.status}: ${res.statusText}`,
          { rawStatus: res.status, rawResponse: rawErrText.slice(0, 300) }
        );
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new AIEngineError('MALFORMED_OUTPUT', 'Gemini response did not contain any candidates.');
      }

      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST') {
        throw new AIEngineError('CONTENT_POLICY_REFUSAL', 'Gemini content policy blocked output generation.');
      }

      const rawText = candidate.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new AIEngineError('MALFORMED_OUTPUT', 'Gemini response candidate text is empty.');
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (parseErr: any) {
        throw new AIEngineError(
          'MALFORMED_OUTPUT',
          `Failed to parse Gemini output as JSON: ${parseErr.message}`,
          { rawSnippet: rawText.slice(0, 200) }
        );
      }

      const validation = validator(parsedJson);
      if (!validation.isValid || !validation.data) {
        throw new AIEngineError(
          'SCHEMA_VALIDATION_FAILED',
          `Gemini output failed LessonDocumentSpec schema validation: ${validation.errors.join('; ')}`,
          { errors: validation.errors }
        );
      }

      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      const estimatedCostUsd = AIModelConfigRegistry.estimateCostUsd(modelId, promptTokens, completionTokens);

      return {
        success: true,
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        providerId: this.providerId,
        modelId: modelConfig.modelId,
        data: validation.data,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCostUsd,
        },
        latencyMs,
        finishReason: 'stop',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const classified = classifyAIError(err);

      return {
        success: false,
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        providerId: this.providerId,
        modelId: modelConfig.modelId,
        error: {
          code: classified.code,
          message: classified.message,
          isRetryable: classified.isRetryable,
        },
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        },
        latencyMs,
        finishReason: 'error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
