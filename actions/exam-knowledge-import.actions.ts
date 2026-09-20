'use server';

/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE IMPORT SERVER ACTION
 * Phase 3H.3: Structured External AI Import & Five-Gate Validation Pipeline
 * 
 * Server-authoritative action to ingest, validate through 5 gates,
 * and persist an external-AI draft in the Exam Knowledge System.
 */

import { AdminService } from '@/services/admin.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ExamKnowledgeImporterService } from '@/services/exam-knowledge/exam-knowledge-importer.service';
import {
  ExamKnowledgeTarget,
  ExamKnowledgeImportResult,
  ExamKnowledgeContextError,
} from '@/types/exam-knowledge';

export interface ImportExamKnowledgeActionParams {
  rawInput: string;
  expectedTarget: ExamKnowledgeTarget;
  expectedContextHash: string;
  externalAiTool?: string;
}

export interface ImportExamKnowledgeActionResponse {
  success: boolean;
  data?: ExamKnowledgeImportResult;
  error?: string;
  errorCode?: string;
}

/**
 * Server action to import and validate external-AI Exam Knowledge content.
 */
export async function importExamKnowledgeAction(
  params: ImportExamKnowledgeActionParams
): Promise<ImportExamKnowledgeActionResponse> {
  try {
    // 1. RBAC Guard: Administrative staff privileges required
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin || !authCheck.userId) {
      return {
        success: false,
        error: 'Unauthorized: Administrative staff privileges required for content import.',
        errorCode: 'UNAUTHORIZED',
      };
    }

    // 2. Server Supabase Client
    const supabase = (await createServerSupabaseClient()) as any;

    // 3. Execute Controlled 5-Gate Import Pipeline
    const result = await ExamKnowledgeImporterService.importContent({
      rawInput: params.rawInput,
      expectedTarget: params.expectedTarget,
      expectedContextHash: params.expectedContextHash,
      externalAiTool: params.externalAiTool || 'UNKNOWN',
      adminUserId: authCheck.userId,
      supabaseClient: supabase,
    });

    return {
      success: result.status === 'IMPORTED' || result.status === 'DUPLICATE',
      data: result,
      error: result.status === 'REJECTED' ? result.errorMessage : undefined,
      errorCode: result.errorCode,
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
      error: err.message || 'An unexpected error occurred during import.',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}
