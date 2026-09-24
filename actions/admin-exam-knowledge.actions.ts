"use server";

/**
 * COURAGE LIBRARY — ADMIN EXAM KNOWLEDGE SERVER ACTIONS
 * Phase 3H.4: Administrative Control Plane Actions
 * 
 * All actions are strictly guarded by AdminService.checkIsAdminOrStaff().
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
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const kpis = await AdminExamKnowledgeService.getDashboardKPIs();
    return { success: true, kpis };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch dashboard KPIs.' };
  }
}

export async function getExamsAndCyclesAction() {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const data = await AdminExamKnowledgeService.getExamsAndCycles();
    return { success: true, exams: data.exams };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch exams and cycles.' };
  }
}

export async function getExamWorkspaceAction(examId: string, cycleId?: string | null) {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

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
    return { success: false, error: err.message || 'Failed to fetch exam workspace.' };
  }
}

export async function getDraftsListAction(filters?: { examId?: string; reviewStatus?: ExamDocReviewStatus }) {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const drafts = await AdminExamKnowledgeService.getDraftsList(filters);
    return { success: true, drafts };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch drafts list.' };
  }
}

export async function getDocumentDetailAction(versionId: string) {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

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
    return { success: false, error: err.message || 'Failed to fetch document detail.' };
  }
}

export async function updateDocVersionReviewStatusAction(params: {
  versionId: string;
  newStatus: ExamDocReviewStatus;
  feedback?: string;
}) {
  const { isAdmin, userId } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.updateDocVersionReviewStatus({
      versionId: params.versionId,
      newStatus: params.newStatus,
      feedback: params.feedback,
      userId: userId || undefined,
    });
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update review status.' };
  }
}

export async function compileExamDocVersionAction(versionId: string) {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.compileExamDocVersion(versionId);
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to compile document version.' };
  }
}

export async function publishExamDocVersionAction(versionId: string) {
  const { isAdmin, userId } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

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

    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to publish document version.' };
  }
}

export async function createRevisionDraftAction(params: {
  documentId: string;
  baseVersionId: string;
}) {
  const { isAdmin, userId } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.createRevisionDraft({
      documentId: params.documentId,
      baseVersionId: params.baseVersionId,
      userId: userId || undefined,
    });
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create revision draft.' };
  }
}

export async function verifyExamSourceAction(params: {
  sourceId: string;
  status: ExamSourceVerificationStatus;
  notes?: string;
}) {
  const { isAdmin, userId } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.updateSourceVerification({
      sourceId: params.sourceId,
      status: params.status,
      notes: params.notes,
      userId: userId || undefined,
    });
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to verify source.' };
  }
}

export async function verifyExamClaimAction(params: {
  claimId: string;
  status: ExamClaimVerificationStatus;
}) {
  const { isAdmin, userId } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

  try {
    const res = await AdminExamKnowledgeService.updateClaimVerification({
      claimId: params.claimId,
      status: params.status,
      userId: userId || undefined,
    });
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to verify claim.' };
  }
}

export async function discardDraftVersionAction(versionId: string) {
  const { isAdmin } = await AdminService.checkIsAdminOrStaff();
  if (!isAdmin) {
    return { success: false, error: 'UNAUTHORIZED: Admin or staff privileges required.' };
  }

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
    return res;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to discard draft version.' };
  }
}
