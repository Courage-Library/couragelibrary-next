"use server";


import { guardAdminAction, toActionFailure, sanitizeActionResult } from "@/lib/auth/require-admin";
/**
 * COURAGE LIBRARY — ADMIN EXAM KNOWLEDGE SERVER ACTIONS
 * Phase 3H.4: Administrative Control Plane Actions
 * 
 * All actions are guarded by the canonical guard (guardAdminAction, lib/auth/require-admin).
 * Browser clients are never trusted for authorization, validation, or publication.
 */

import { revalidatePath } from 'next/cache';
import { AdminService } from '@/services/admin.service';
import { AdminExamKnowledgeService } from '@/services/exam-knowledge/admin-exam-knowledge.service';
import {
  ExamDocReviewStatus,
  ExamSourceVerificationStatus,
  ExamClaimVerificationStatus,
} from '@/types/exam-knowledge';

export async function getAdminExamKnowledgeDashboardAction() {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;

  try {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs();
    return { success: true, kpis };
  } catch (err: any) {
    return toActionFailure("getAdminExamKnowledgeDashboardAction", err);
  }
}

export async function getExamsAndCyclesAction() {
  const __auth1 = await guardAdminAction({ allowStaff: true });
  if (!__auth1.ok) return __auth1;

  try {
    const data = await AdminExamKnowledgeService.getExamsAndCycles();
    return { success: true, exams: data.exams };
  } catch (err: any) {
    return toActionFailure("getExamsAndCyclesAction", err);
  }
}

export async function getExamWorkspaceAction(examId: string, cycleId?: string | null) {
  const __auth2 = await guardAdminAction({ allowStaff: true });
  if (!__auth2.ok) return __auth2;

  if (!examId) {
    return { success: false, error: 'examId is required.' };
  }

  try {
    const workspace = await AdminExamKnowledgeService.getExamWorkspace(examId, cycleId);
    if (!workspace) {
      return { success: false, error: 'Exam not found.' };
    }
    return { success: true, workspace };
  } catch (err: any) {
    return toActionFailure("getExamWorkspaceAction", err);
  }
}

export async function getDraftsListAction(filters?: { examId?: string; reviewStatus?: ExamDocReviewStatus }) {
  const __auth3 = await guardAdminAction({ allowStaff: true });
  if (!__auth3.ok) return __auth3;

  try {
    const drafts = await AdminExamKnowledgeService.getDraftsList(filters);
    return { success: true, drafts };
  } catch (err: any) {
    return toActionFailure("getDraftsListAction", err);
  }
}

export async function getDocumentDetailAction(versionId: string) {
  const __auth4 = await guardAdminAction({ allowStaff: true });
  if (!__auth4.ok) return __auth4;

  if (!versionId) {
    return { success: false, error: 'versionId is required.' };
  }

  try {
    const detail = await AdminExamKnowledgeService.getDocumentDetail(versionId);
    if (!detail) {
      return { success: false, error: 'Document version not found.' };
    }
    return { success: true, detail };
  } catch (err: any) {
    return toActionFailure("getDocumentDetailAction", err);
  }
}

export async function getDocumentVersionHistoryAction(documentId: string) {
  const __auth5 = await guardAdminAction({ allowStaff: true });
  if (!__auth5.ok) return __auth5;

  if (!documentId) {
    return { success: false, error: 'documentId is required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.getDocumentVersionHistory(documentId);
    return sanitizeActionResult("getDocumentVersionHistoryAction", await (res));
  } catch (err: any) {
    return toActionFailure("getDocumentVersionHistoryAction", err);
  }
}

export async function compareDocVersionsAction(params: {
  versionIdA: string;
  versionIdB: string;
}) {
  const __auth6 = await guardAdminAction({ allowStaff: true });
  if (!__auth6.ok) return __auth6;

  if (!params.versionIdA || !params.versionIdB) {
    return { success: false, error: 'Both versionIdA and versionIdB are required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.compareDocVersions(params);
    return sanitizeActionResult("compareDocVersionsAction", await (res));
  } catch (err: any) {
    return toActionFailure("compareDocVersionsAction", err);
  }
}

export async function updateDocVersionReviewStatusAction(params: {
  versionId: string;
  newStatus: ExamDocReviewStatus;
  feedback?: string;
}) {
  const __auth7 = await guardAdminAction({ allowStaff: true });
  if (!__auth7.ok) return __auth7;
  const { userId } = __auth7;

  try {
    const res = await AdminExamKnowledgeService.updateDocVersionReviewStatus({
      versionId: params.versionId,
      newStatus: params.newStatus,
      feedback: params.feedback,
      userId: userId || undefined,
    });
    return sanitizeActionResult("updateDocVersionReviewStatusAction", await (res));
  } catch (err: any) {
    return toActionFailure("updateDocVersionReviewStatusAction", err);
  }
}

export async function requestChangesExamDocVersionAction(params: {
  versionId: string;
  feedback: string;
}) {
  const __auth8 = await guardAdminAction({ allowStaff: true });
  if (!__auth8.ok) return __auth8;
  const { userId } = __auth8;

  if (!params.versionId) {
    return { success: false, error: 'versionId is required.' };
  }

  if (!params.feedback || !params.feedback.trim()) {
    return { success: false, error: 'Feedback is required when requesting changes.' };
  }

  try {
    const res = await AdminExamKnowledgeService.requestChangesExamDocVersion({
      versionId: params.versionId,
      feedback: params.feedback,
      userId: userId || undefined,
    });
    if (res.success) {
      try {
        revalidatePath('/admin/exam-knowledge');
      } catch {
        // Cache revalidation failure should not block response
      }
    }
    return sanitizeActionResult("requestChangesExamDocVersionAction", await (res));
  } catch (err: any) {
    return toActionFailure("requestChangesExamDocVersionAction", err);
  }
}

export async function compileExamDocVersionAction(versionId: string) {
  const __auth9 = await guardAdminAction({ allowStaff: true });
  if (!__auth9.ok) return __auth9;

  try {
    const res = await AdminExamKnowledgeService.compileExamDocVersion(versionId);
    return sanitizeActionResult("compileExamDocVersionAction", await (res));
  } catch (err: any) {
    return toActionFailure("compileExamDocVersionAction", err);
  }
}

export async function publishExamDocVersionAction(versionId: string) {
  const __auth10 = await guardAdminAction({ allowStaff: true });
  if (!__auth10.ok) return __auth10;
  const { userId } = __auth10;

  try {
    const res = await AdminExamKnowledgeService.publishExamDocVersion({
      versionId,
      userId: userId || undefined,
    });

    if (res.success) {
      try {
        revalidatePath('/exams');
        revalidatePath('/admin/exam-knowledge');
        if (res.examSlug) {
          revalidatePath(`/exams/${res.examSlug}`);
          if (res.moduleSlug) {
            revalidatePath(`/exams/${res.examSlug}/${res.moduleSlug}`);
          }
          if (res.cycleYear) {
            revalidatePath(`/exams/${res.examSlug}/cycle/${res.cycleYear}`);
            if (res.moduleSlug) {
              revalidatePath(`/exams/${res.examSlug}/cycle/${res.cycleYear}/${res.moduleSlug}`);
            }
          }
        }
      } catch {
        // Cache revalidation error should not block publishing response
      }
    }

    return sanitizeActionResult("publishExamDocVersionAction", await (res));
  } catch (err: any) {
    return toActionFailure("publishExamDocVersionAction", err);
  }
}

export async function createRevisionDraftAction(params: {
  documentId: string;
  baseVersionId: string;
}) {
  const __auth11 = await guardAdminAction({ allowStaff: true });
  if (!__auth11.ok) return __auth11;
  const { userId } = __auth11;

  try {
    const res = await AdminExamKnowledgeService.createRevisionDraft({
      documentId: params.documentId,
      baseVersionId: params.baseVersionId,
      userId: userId || undefined,
    });
    return sanitizeActionResult("createRevisionDraftAction", await (res));
  } catch (err: any) {
    return toActionFailure("createRevisionDraftAction", err);
  }
}

export async function verifyExamSourceAction(params: {
  sourceId: string;
  status: ExamSourceVerificationStatus;
  notes?: string;
}) {
  const __auth12 = await guardAdminAction({ allowStaff: true });
  if (!__auth12.ok) return __auth12;
  const { userId } = __auth12;

  try {
    const res = await AdminExamKnowledgeService.updateSourceVerification({
      sourceId: params.sourceId,
      status: params.status,
      notes: params.notes,
      userId: userId || undefined,
    });
    return sanitizeActionResult("verifyExamSourceAction", await (res));
  } catch (err: any) {
    return toActionFailure("verifyExamSourceAction", err);
  }
}

export async function verifyExamClaimAction(params: {
  claimId: string;
  status: ExamClaimVerificationStatus;
}) {
  const __auth13 = await guardAdminAction({ allowStaff: true });
  if (!__auth13.ok) return __auth13;
  const { userId } = __auth13;

  try {
    const res = await AdminExamKnowledgeService.updateClaimVerification({
      claimId: params.claimId,
      status: params.status,
      userId: userId || undefined,
    });
    return sanitizeActionResult("verifyExamClaimAction", await (res));
  } catch (err: any) {
    return toActionFailure("verifyExamClaimAction", err);
  }
}

export async function discardDraftVersionAction(versionId: string) {
  const __auth14 = await guardAdminAction({ allowStaff: true });
  if (!__auth14.ok) return __auth14;

  if (!versionId) {
    return { success: false, error: 'versionId is required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.discardDraftVersion(versionId);
    if (res.success) {
      try {
        revalidatePath('/admin/exam-knowledge');
      } catch {
        // Cache revalidation error should not block response
      }
    }
    return sanitizeActionResult("discardDraftVersionAction", await (res));
  } catch (err: any) {
    return toActionFailure("discardDraftVersionAction", err);
  }
}

export async function updateDraftPayloadAction(params: {
  versionId: string;
  structuredPayload: any;
}) {
  const __auth15 = await guardAdminAction({ allowStaff: true });
  if (!__auth15.ok) return __auth15;
  const { userId } = __auth15;

  if (!params.versionId) {
    return { success: false, error: 'versionId is required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.updateDraftPayload({
      versionId: params.versionId,
      structuredPayload: params.structuredPayload,
      userId: userId || undefined,
    });
    return sanitizeActionResult("updateDraftPayloadAction", await (res));
  } catch (err: any) {
    return toActionFailure("updateDraftPayloadAction", err);
  }
}

export async function submitDraftForReviewAction(params: {
  versionId: string;
  feedback?: string;
}) {
  const __auth16 = await guardAdminAction({ allowStaff: true });
  if (!__auth16.ok) return __auth16;
  const { userId } = __auth16;

  if (!params.versionId) {
    return { success: false, error: 'versionId is required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.submitDraftForReview({
      versionId: params.versionId,
      feedback: params.feedback,
      userId: userId || undefined,
    });
    return sanitizeActionResult("submitDraftForReviewAction", await (res));
  } catch (err: any) {
    return toActionFailure("submitDraftForReviewAction", err);
  }
}

