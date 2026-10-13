'use server';


import { guardAdminAction, toActionFailure, sanitizeActionResult } from "@/lib/auth/require-admin";
/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE IMPORT SERVER ACTION
 * Phase 3H.3: Structured External AI Import & Five-Gate Validation Pipeline
 * 
 * Server-authoritative action to ingest, validate through 5 gates,
 * and persist an external-AI draft in the Exam Knowledge System.
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
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
    const authCheck = await guardAdminAction({ allowStaff: true });
    if (!authCheck.ok) return sanitizeActionResult("importExamKnowledgeAction", await (authCheck));

    // 2. Server Supabase Client
    const supabase = createAdminServerSupabaseClient() as any;

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
      return { ...toActionFailure("importExamKnowledgeAction", err), errorCode: err.code };
    }

    return { ...toActionFailure("importExamKnowledgeAction", err), errorCode: 'INTERNAL_ERROR' };
  }
}
