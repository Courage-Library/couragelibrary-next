/**
 * COURAGE LIBRARY — EXTERNAL AI AUTHORING & IMPORT CONTRACTS
 * Phase 3E.4: External AI Authoring & Structured Content Import System
 * 
 * Defines authoritative domain contracts for:
 * 1. External AI Tool classification (ChatGPT, Claude, Perplexity, Gemini, etc.)
 * 2. Authoring prompt contract specifications (CL-AUTHOR-v1.0)
 * 3. Categorized validation results (Structure, Security, Academic, References)
 * 4. External AI import parameters & persistence outcomes
 * 
 * SACRED ARCHITECTURAL INVARIANT:
 * External AI tools (ChatGPT, Claude, Perplexity, etc.) are unauthenticated,
 * interchangeable candidate content generators.
 * Courage Library is the SOLE authority for curriculum, validation, versioning, and publishing.
 */

import {
  LessonDocumentSpec,
  DocumentType,
  DocumentVersion,
  ContentLanguage,
  DifficultyTier,
} from './learning-compiler';
import { AcademicValidationResult } from '@/services/ai/academic-validator.service';
import { CurriculumAIContext } from './ai-curriculum-context';

export const PROMPT_CONTRACT_VERSION = 'CL-AUTHOR-v1.0';

export type ExternalAITool =
  | 'ChatGPT'
  | 'Claude'
  | 'Perplexity'
  | 'Gemini'
  | 'DeepSeek'
  | 'Other'
  | 'Unknown';

export interface ExternalAIPromptResult {
  promptText: string;
  promptContractVersion: string;
  contextHash: string;
  learningUnitId: string;
  documentType: DocumentType;
  generatedAt: string;
  characterCount: number;
}

export interface CategorizedValidationResult {
  overallOutcome: 'PASS' | 'WARNING' | 'BLOCK';
  canImportAsDraft: boolean;
  structure: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  security: {
    isSafe: boolean;
    errors: string[];
  };
  academic: AcademicValidationResult;
  questionReferences: {
    isValid: boolean;
    total: number;
    validCount: number;
    errors: string[];
    warnings: string[];
  };
  summary: {
    totalBlocks: number;
    totalWarnings: number;
  };
}

export interface ExternalAIImportParams {
  rawInput: string;
  learningUnitId: string;
  documentType: DocumentType;
  targetExamId?: string;
  aiToolUsed?: ExternalAITool | string;
  aiModelVersion?: string;
  promptContractVersion?: string;
  contextHash?: string;
  adminUserId: string;
  adminEmail?: string;
  supabaseClient?: any;
}

export interface ExternalAIImportResult {
  success: boolean;
  spec: LessonDocumentSpec;
  documentVersion?: DocumentVersion;
  documentId?: string;
  validation: CategorizedValidationResult;
  promptContractVersion?: string;
  contextHash?: string;
  aiToolUsed: ExternalAITool | string;
  error?: string;
}
