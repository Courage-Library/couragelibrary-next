'use server';

/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE PROMPT GENERATION SERVER ACTION
 * Phase 3H.2: Exam Knowledge Context Builder & External AI Prompt Generator
 * 
 * Server-authoritative action to build context and generate
 * a copyable prompt for external LLM authoring.
 */

import { AdminService } from '@/services/admin.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ExamKnowledgeContextBuilder } from '@/services/exam-knowledge/exam-knowledge-context-builder.service';
import { ExamKnowledgePromptBuilder } from '@/services/exam-knowledge/exam-knowledge-prompt-builder.service';
import {
  ExamModuleKey,
  ExamPromptResult,
  ExamKnowledgeContextError,
} from '@/types/exam-knowledge';

export interface GenerateExamKnowledgePromptParams {
  examId: string;
  examCycleId?: string | null;
  moduleKey: ExamModuleKey;
  language?: string;
}

export interface GenerateExamKnowledgePromptResponse {
  success: boolean;
  data?: ExamPromptResult;
  error?: string;
  errorCode?: string;
}

/**
 * Server action to generate authoritative Exam Knowledge external AI authoring prompt.
 */
export async function generateExamKnowledgePromptAction(
  params: GenerateExamKnowledgePromptParams
): Promise<GenerateExamKnowledgePromptResponse> {
  try {
    // 1. RBAC Guard: Administrative staff privileges required
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin || !authCheck.userId) {
      return {
        success: false,
        error: 'Unauthorized: Administrative staff privileges required for prompt generation.',
        errorCode: 'UNAUTHORIZED',
      };
    }

    // 2. Obtain Server Supabase Client
    const supabase = (await createServerSupabaseClient()) as any;

    // 3. Build Authoritative Context
    const context = await ExamKnowledgeContextBuilder.buildContext({
      examId: params.examId,
      examCycleId: params.examCycleId,
      moduleKey: params.moduleKey,
      language: params.language || 'en',
      supabaseClient: supabase,
    });

    // 4. Generate Deterministic Prompt
    const result = ExamKnowledgePromptBuilder.buildPrompt(context);

    return {
      success: true,
      data: result,
    };
  } catch (err: any) {
    if (err instanceof ExamKnowledgeContextError) {
      return {
        success: false,
        error: err.message,
        errorCode: err.code,
      };
    }

    return {
      success: false,
      error: err.message || 'An unexpected error occurred during prompt generation.',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}
