'use server';


import { guardAdminAction, sanitizeActionResult } from "@/lib/auth/require-admin";
/**
 * COURAGE LIBRARY — QUESTION FACTORY SERVER ACTIONS
 * Phase QF-1: Question Factory Core
 *
 * Thin server-action boundary for the admin Question Factory studio.
 * Authorization (AdminService.checkIsAdminOrStaff) is enforced inside every
 * AdminQuestionFactoryService method; the service-role client never leaves the server.
 */

import { revalidatePath } from 'next/cache';
import { AdminQuestionFactoryService } from '@/services/question-factory/admin-question-factory.service';
import type {
  QuestionAuthoringItem,
  QuestionContextRequest,
  QuestionImportMode,
  QuestionReviewChecklist,
  QuestionReviewQueueFilters,
} from '@/types/question-factory';

const FACTORY_PATH = '/admin/questions/drafts';

function refresh() {
  revalidatePath(FACTORY_PATH);
}

export async function qfGetTaxonomyTreeAction() {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("qfGetTaxonomyTreeAction", await (AdminQuestionFactoryService.getTaxonomyTree()));
}

export async function qfGeneratePromptAction(request: QuestionContextRequest) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("qfGeneratePromptAction", await (AdminQuestionFactoryService.generatePrompt(request)));
}

export async function qfImportAction(rawInput: string, mode: QuestionImportMode) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.importAiPayload(rawInput, mode === 'commit' ? 'commit' : 'dry-run');
  if (mode === 'commit') refresh();
  return sanitizeActionResult("qfImportAction", await (res));
}

export async function qfListReviewQueueAction(filters: QuestionReviewQueueFilters) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("qfListReviewQueueAction", await (AdminQuestionFactoryService.listReviewQueue(filters)));
}

export async function qfGetVersionDetailAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("qfGetVersionDetailAction", await (AdminQuestionFactoryService.getVersionDetail(versionId)));
}

export async function qfSubmitForReviewAction(versionId: string, notes?: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.submitForReview(versionId, notes);
  refresh();
  return sanitizeActionResult("qfSubmitForReviewAction", await (res));
}

export async function qfRequestChangesAction(versionId: string, notes: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.requestChanges(versionId, notes);
  refresh();
  return sanitizeActionResult("qfRequestChangesAction", await (res));
}

export async function qfApproveAction(versionId: string, checklist: QuestionReviewChecklist, notes?: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.approve(versionId, checklist, notes);
  refresh();
  return sanitizeActionResult("qfApproveAction", await (res));
}

export async function qfRejectAction(versionId: string, notes: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.reject(versionId, notes);
  refresh();
  return sanitizeActionResult("qfRejectAction", await (res));
}

export async function qfEditDraftAction(versionId: string, item: QuestionAuthoringItem) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.editDraft(versionId, item);
  refresh();
  return sanitizeActionResult("qfEditDraftAction", await (res));
}

export async function qfPublishAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  const res = await AdminQuestionFactoryService.publish(versionId);
  refresh();
  revalidatePath('/admin/questions');
  return sanitizeActionResult("qfPublishAction", await (res));
}

export async function qfGetCoverageAction(subjectId?: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("qfGetCoverageAction", await (AdminQuestionFactoryService.getCoverage(subjectId)));
}

/** Courage Studio focus review: one version with its server-side auto checks (same guard as every QF action). */
export async function qfGetFocusItemAction(versionId: string) {
  const __auth = await guardAdminAction({ allowStaff: true });
  if (!__auth.ok) return __auth;
  return sanitizeActionResult("qfGetFocusItemAction", await (AdminQuestionFactoryService.getFocusItem(versionId)));
}
