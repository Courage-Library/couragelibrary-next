/**
 * COURAGE LIBRARY — AI MODEL CONFIGURATION REGISTRY
 * Phase 3E.1: AI Architecture & Provider Abstraction Foundation
 * 
 * Centralized, authoritative catalog of approved AI models, purpose mappings,
 * token parameters, cost metadata, and retry policies.
 * 
 * Prevents scattered model string constants across the codebase.
 */

import { AIModelConfig, AIPurpose, DEFAULT_AI_RETRY_POLICY } from '@/types/ai-provider';

export const APPROVED_AI_MODELS: Record<string, AIModelConfig> = {
  'mock-deterministic-v1': {
    providerId: 'MOCK',
    modelId: 'mock-deterministic-v1',
    displayName: 'Mock Deterministic Generator (Test/Fixture)',
    purpose: 'CONTENT_GENERATION',
    isEnabled: true,
    maxInputTokens: 8192,
    maxOutputTokens: 8192,
    defaultTemperature: 0.0,
    timeoutMs: 5000,
    costPer1kInputTokensUsd: 0.0,
    costPer1kOutputTokensUsd: 0.0,
    retryPolicy: DEFAULT_AI_RETRY_POLICY,
  },
  'gemini-1.5-pro': {
    providerId: 'GOOGLE_GEMINI',
    modelId: 'gemini-1.5-pro',
    displayName: 'Google Gemini 1.5 Pro',
    purpose: 'CONTENT_GENERATION',
    isEnabled: true,
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    defaultTemperature: 0.2,
    timeoutMs: 45000,
    costPer1kInputTokensUsd: 0.00125,
    costPer1kOutputTokensUsd: 0.005,
    retryPolicy: DEFAULT_AI_RETRY_POLICY,
  },
  'gemini-2.0-flash': {
    providerId: 'GOOGLE_GEMINI',
    modelId: 'gemini-2.0-flash',
    displayName: 'Google Gemini 2.0 Flash',
    purpose: 'CONTENT_GENERATION',
    isEnabled: true,
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    defaultTemperature: 0.2,
    timeoutMs: 30000,
    costPer1kInputTokensUsd: 0.0001,
    costPer1kOutputTokensUsd: 0.0004,
    retryPolicy: DEFAULT_AI_RETRY_POLICY,
  },
  'gemini-1.5-flash': {
    providerId: 'GOOGLE_GEMINI',
    modelId: 'gemini-1.5-flash',
    displayName: 'Google Gemini 1.5 Flash',
    purpose: 'SUMMARIZATION',
    isEnabled: true,
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    defaultTemperature: 0.1,
    timeoutMs: 25000,
    costPer1kInputTokensUsd: 0.000075,
    costPer1kOutputTokensUsd: 0.0003,
    retryPolicy: DEFAULT_AI_RETRY_POLICY,
  },
  'gpt-4o': {
    providerId: 'OPENAI',
    modelId: 'gpt-4o',
    displayName: 'OpenAI GPT-4o',
    purpose: 'CONTENT_GENERATION',
    isEnabled: true,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    defaultTemperature: 0.2,
    timeoutMs: 45000,
    costPer1kInputTokensUsd: 0.005,
    costPer1kOutputTokensUsd: 0.015,
    retryPolicy: DEFAULT_AI_RETRY_POLICY,
  },
  'claude-3-5-sonnet': {
    providerId: 'ANTHROPIC',
    modelId: 'claude-3-5-sonnet',
    displayName: 'Anthropic Claude 3.5 Sonnet',
    purpose: 'CONTENT_GENERATION',
    isEnabled: true,
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.2,
    timeoutMs: 45000,
    costPer1kInputTokensUsd: 0.003,
    costPer1kOutputTokensUsd: 0.015,
    retryPolicy: DEFAULT_AI_RETRY_POLICY,
  },
};

export class AIModelConfigRegistry {
  static getModelConfig(modelId: string): AIModelConfig {
    const config = APPROVED_AI_MODELS[modelId];
    if (!config) {
      throw new Error(`Unrecognized or unapproved AI model ID: "${modelId}".`);
    }
    return config;
  }

  static getDefaultModelForPurpose(purpose: AIPurpose): AIModelConfig {
    const matching = Object.values(APPROVED_AI_MODELS).filter(
      (m) => m.purpose === purpose && m.isEnabled
    );
    if (matching.length === 0) {
      return APPROVED_AI_MODELS['mock-deterministic-v1'];
    }
    return matching[0];
  }

  static listAvailableModels(): AIModelConfig[] {
    return Object.values(APPROVED_AI_MODELS).filter((m) => m.isEnabled);
  }

  static estimateCostUsd(modelId: string, promptTokens: number, completionTokens: number): number {
    const config = this.getModelConfig(modelId);
    const inputCost = (promptTokens / 1000) * (config.costPer1kInputTokensUsd || 0);
    const outputCost = (completionTokens / 1000) * (config.costPer1kOutputTokensUsd || 0);
    return Math.round((inputCost + outputCost) * 100000) / 100000;
  }
}
