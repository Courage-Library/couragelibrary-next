/**
 * COURAGE LIBRARY — DETERMINISTIC MOCK AI PROVIDER
 * Phase 3E.1: AI Architecture & Provider Abstraction Foundation
 * 
 * Provides deterministic, offline-capable generation for automated test suites,
 * architectural contracts, and CI environments without network calls or paid API keys.
 */

import {
  AIProviderId,
  AIGenerationRequest,
  AINormalizedResponse,
} from '@/types/ai-provider';
import { AIProvider, AIStructuredValidator, classifyAIError } from './ai-provider.interface';
import { LessonDocumentSpec } from '@/types/learning-compiler';

export interface MockSimulationOptions {
  forceErrorCode?: 'RATE_LIMITED' | 'TIMEOUT' | 'AUTHENTICATION_ERROR' | 'MALFORMED_OUTPUT' | 'SCHEMA_VALIDATION_FAILED' | 'CONTENT_POLICY_REFUSAL';
  customDelayMs?: number;
}

export class MockAIProvider implements AIProvider {
  readonly providerId: AIProviderId = 'MOCK';
  private simulationOptions: MockSimulationOptions = {};

  setSimulationOptions(options: MockSimulationOptions): void {
    this.simulationOptions = options;
  }

  resetSimulationOptions(): void {
    this.simulationOptions = {};
  }

  isConfigured(): boolean {
    return true;
  }

  async generateStructured<T>(
    request: AIGenerationRequest,
    validator: AIStructuredValidator<T>
  ): Promise<AINormalizedResponse<T>> {
    const startTime = Date.now();

    if (this.simulationOptions.customDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.simulationOptions.customDelayMs));
    }

    // Check simulated failure modes
    if (this.simulationOptions.forceErrorCode) {
      const errInfo = classifyAIError(new Error(`Simulated mock error: ${this.simulationOptions.forceErrorCode}`));
      return {
        success: false,
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        providerId: this.providerId,
        modelId: request.targetModel || 'mock-deterministic-v1',
        error: {
          code: this.simulationOptions.forceErrorCode,
          message: `Simulated mock failure: ${this.simulationOptions.forceErrorCode}`,
          isRetryable: errInfo.isRetryable,
        },
        usage: {
          promptTokens: 120,
          completionTokens: 0,
          totalTokens: 120,
          estimatedCostUsd: 0,
        },
        latencyMs: Date.now() - startTime,
        finishReason: 'error',
        timestamp: new Date().toISOString(),
      };
    }

    // Build deterministic LessonDocumentSpec conformant payload
    const mockSpec: LessonDocumentSpec = {
      schemaVersion: '1.0.0',
      documentId: request.learningUnitId || 'mock-doc-001',
      unitSlug: request.academicContext.unitSlug || 'algebraic-identities',
      language: request.academicContext.primaryLanguage || 'en',
      metadata: {
        title: `${request.academicContext.unitTitle} — Comprehensive Lesson`,
        topicId: request.academicContext.topicId || 'topic-math-01',
        subjectId: request.academicContext.subjectId || 'subj-math',
        targetExamCategories: request.academicContext.examIds.length > 0 ? request.academicContext.examIds : ['SSC_CGL'],
        estimatedReadingMinutes: 8,
        difficultyTier: request.academicContext.targetDifficulty || 'INTERMEDIATE',
        authoritativeKeywords: request.generationDirectives.focusKeywords.length > 0
          ? request.generationDirectives.focusKeywords
          : ['Algebra', 'Identities', 'Quadratic Equations'],
      },
      learningObjectives: [
        'Understand standard algebraic identities and expansions',
        'Apply shortcut factorization methods for competitive exam speed',
        'Recognize common signs and calculation traps in competitive questions',
      ],
      prerequisites: [
        {
          topicId: 'topic-arithmetic-basics',
          conceptSummary: 'Basic polynomial addition, subtraction, and multiplication laws.',
        },
      ],
      sections: [
        {
          id: 'sec-01',
          title: 'Foundational Algebraic Expansion Laws',
          sectionType: 'THEORY',
          contentMarkdown: 'Algebraic identities are equality relations that hold true for all numerical values substituted for the variables.',
          calloutNotes: [
            {
              variant: 'TIP',
              title: 'Master Expansion Note',
              body: 'Always check the signs of cross terms before executing complete expansions.',
            },
          ],
        },
      ],
      formulaBlocks: [
        {
          id: 'formula-01',
          name: 'Standard Square Identity',
          latexFormula: '(a + b)^2 = a^2 + 2ab + b^2',
          variableDefinitions: [
            { symbol: 'a', meaning: 'First algebraic term' },
            { symbol: 'b', meaning: 'Second algebraic term' },
          ],
          applicableConditions: ['Valid for all real numbers a and b.'],
          speedShortcutTrick: 'Add 2ab directly when calculating squares of two-digit sum numbers.',
        },
      ],
      workedExamples: [
        {
          id: 'ex-01',
          difficulty: 'MEDIUM',
          problemText: 'If x + (1/x) = 5, find the numerical value of x^2 + (1/x^2).',
          stepByStepSolution: [
            {
              stepNumber: 1,
              explanation: 'Square both sides of the given algebraic equation: (x + 1/x)^2 = 5^2.',
              mathSnippet: 'x^2 + 2(x)(1/x) + 1/x^2 = 25',
            },
            {
              stepNumber: 2,
              explanation: 'Simplify the cross term: x^2 + 2 + 1/x^2 = 25, hence x^2 + 1/x^2 = 23.',
              mathSnippet: 'x^2 + 1/x^2 = 25 - 2 = 23',
            },
          ],
          shortcutMethod: 'Use standard rule: If x + 1/x = k, then x^2 + 1/x^2 = k^2 - 2. Here, 5^2 - 2 = 23.',
          commonMistakeToAvoid: 'Do not forget to subtract 2 from k^2.',
        },
      ],
      cognitiveTraps: [
        {
          trapType: 'CALCULATION_SLIP',
          misconception: 'Assuming (a + b)^2 equals a^2 + b^2 without the cross term 2ab.',
          correctApproach: 'Always include the +2ab term in the expansion.',
        },
      ],
      authenticPyqReferences: [
        {
          questionVersionId: request.authoritativeReferences?.allowedQuestionIds?.[0] || 'qv-math-001',
          relevanceRationale: 'Directly tests application of quadratic expansion in SSC CGL Tier 1.',
        },
      ],
      quickChecks: [
        {
          id: 'qc-01',
          prompt: 'What is the expansion of (a - b)^2?',
          options: [
            {
              id: 'opt-1',
              text: 'a^2 - 2ab + b^2',
              isCorrect: true,
              feedbackExplanation: 'Correct! The middle term is negative -2ab while b^2 remains positive.',
            },
            {
              id: 'opt-2',
              text: 'a^2 + 2ab - b^2',
              isCorrect: false,
              feedbackExplanation: 'Incorrect. The last term is always positive (+b^2) when squared.',
            },
          ],
        },
      ],
      revisionSummary: {
        keyTakeaways: [
          '(a + b)^2 = a^2 + 2ab + b^2',
          '(a - b)^2 = a^2 - 2ab + b^2',
          'a^2 - b^2 = (a + b)(a - b)',
        ],
        coreFormulas: [
          '(a + b)^2 = a^2 + 2ab + b^2',
        ],
        speedRules: [
          'If x + 1/x = k, then x^2 + 1/x^2 = k^2 - 2',
        ],
      },
      seo: {
        metaTitle: 'Algebraic Identities for Competitive Exams | Complete Guide',
        metaDescription: 'Master foundational algebraic identities, formulas, speed shortcuts and worked examples for SSC CGL and UPSC.',
        focusKeywords: ['algebra', 'identities', 'ssc cgl math'],
      },
    };

    // Run structural validator
    const validationResult = validator(mockSpec);

    if (!validationResult.isValid) {
      return {
        success: false,
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        providerId: this.providerId,
        modelId: request.targetModel || 'mock-deterministic-v1',
        error: {
          code: 'SCHEMA_VALIDATION_FAILED',
          message: `Schema validation failed: ${validationResult.errors.join('; ')}`,
          isRetryable: false,
          details: { errors: validationResult.errors },
        },
        usage: {
          promptTokens: 450,
          completionTokens: 850,
          totalTokens: 1300,
          estimatedCostUsd: 0,
        },
        latencyMs: Date.now() - startTime,
        finishReason: 'stop',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      providerId: this.providerId,
      modelId: request.targetModel || 'mock-deterministic-v1',
      data: validationResult.data,
      usage: {
        promptTokens: 450,
        completionTokens: 850,
        totalTokens: 1300,
        estimatedCostUsd: 0,
      },
      latencyMs: Date.now() - startTime,
      finishReason: 'stop',
      timestamp: new Date().toISOString(),
    };
  }
}
