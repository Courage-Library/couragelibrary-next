/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE SERVICE
 * Phase 3H.1: Core Data Model & Schema Foundation
 * 
 * Manages exam knowledge documents, cycle boundaries, immutability assertions,
 * and canonical route slug generation.
 */

import {
  ExamKnowledgeDocument,
  ExamDocVersion,
  ExamModuleKey,
} from '@/types/exam-knowledge';

export class ExamKnowledgeService {
  /**
   * Evaluates if a given version is immutable.
   */
  static isImmutable(version: Partial<ExamDocVersion>): boolean {
    return version.is_published === true || version.review_status === 'PUBLISHED';
  }

  /**
   * Enforces immutability guard before any update or delete.
   */
  static assertMutable(version: Partial<ExamDocVersion>): void {
    if (this.isImmutable(version)) {
      throw new Error(
        `ExamDocVersion ${version.id || 'unidentified'} (v${version.version_number}) is PUBLISHED and permanently immutable. Create a new version to apply changes.`
      );
    }
  }

  /**
   * Generates a canonical slug for an exam module.
   * Format:
   * - Timeless: `exams/{examSlug}/{moduleKeyKebab}`
   * - Cycle-specific: `exams/{examSlug}/{cycleYear}/{moduleKeyKebab}`
   */
  static getCanonicalSlug(
    examSlug: string,
    moduleKey: ExamModuleKey,
    cycleYear?: number | null
  ): string {
    const moduleSlug = moduleKey.toLowerCase().replace(/_/g, '-');
    const cleanExam = examSlug.toLowerCase().trim();
    if (cycleYear) {
      return `exams/${cleanExam}/${cycleYear}/${moduleSlug}`;
    }
    return `exams/${cleanExam}/${moduleSlug}`;
  }

  /**
   * Validates published pointer consistency between a document and version.
   */
  static validatePublishedPointer(
    document: Partial<ExamKnowledgeDocument>,
    version: Partial<ExamDocVersion>
  ): { isValid: boolean; error?: string } {
    if (!version.id) {
      return { isValid: false, error: 'Version ID is missing' };
    }
    if (version.document_id && document.id && version.document_id !== document.id) {
      return {
        isValid: false,
        error: `Cross-document pointer mismatch: version belongs to document ${version.document_id}, not ${document.id}`,
      };
    }
    if (!version.is_published && version.review_status !== 'PUBLISHED') {
      return {
        isValid: false,
        error: `Cannot point to an unpublished version (is_published = false, review_status = ${version.review_status})`,
      };
    }
    return { isValid: true };
  }
}
