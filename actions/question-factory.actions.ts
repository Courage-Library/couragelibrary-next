'use server';

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

const FACTORY_PATH = '/admin/questions/factory';

function refresh() {
  revalidatePath(FACTORY_PATH);
}

export async function qfGetTaxonomyTreeAction() {
  return AdminQuestionFactoryService.getTaxonomyTree();
}

export async function qfGeneratePromptAction(request: QuestionContextRequest) {
  return AdminQuestionFactoryService.generatePrompt(request);
}

export async function qfImportAction(rawInput: string, mode: QuestionImportMode) {
  const res = await AdminQuestionFactoryService.importAiPayload(rawInput, mode === 'commit' ? 'commit' : 'dry-run');
  if (mode === 'commit') refresh();
  return res;
}

export async function qfListReviewQueueAction(filters: QuestionReviewQueueFilters) {
  return AdminQuestionFactoryService.listReviewQueue(filters);
}

export async function qfGetVersionDetailAction(versionId: string) {
  return AdminQuestionFactoryService.getVersionDetail(versionId);
}

export async function qfSubmitForReviewAction(versionId: string, notes?: string) {
  const res = await AdminQuestionFactoryService.submitForReview(versionId, notes);
  refresh();
  return res;
}

export async function qfRequestChangesAction(versionId: string, notes: string) {
  const res = await AdminQuestionFactoryService.requestChanges(versionId, notes);
  refresh();
  return res;
}

export async function qfApproveAction(versionId: string, checklist: QuestionReviewChecklist, notes?: string) {
  const res = await AdminQuestionFactoryService.approve(versionId, checklist, notes);
  refresh();
  return res;
}

export async function qfRejectAction(versionId: string, notes: string) {
  const res = await AdminQuestionFactoryService.reject(versionId, notes);
  refresh();
  return res;
}

export async function qfEditDraftAction(versionId: string, item: QuestionAuthoringItem) {
  const res = await AdminQuestionFactoryService.editDraft(versionId, item);
  refresh();
  return res;
}

export async function qfPublishAction(versionId: string) {
  const res = await AdminQuestionFactoryService.publish(versionId);
  refresh();
  revalidatePath('/admin/questions');
  return res;
}

export async function qfGetCoverageAction(subjectId?: string) {
  return AdminQuestionFactoryService.getCoverage(subjectId);
}
