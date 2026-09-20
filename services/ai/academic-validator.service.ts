/**
 * COURAGE LIBRARY — ACADEMIC CONTENT VALIDATOR
 * Phase 3E.3: Production AI Content Generation & Human Review Pipeline
 * 
 * Performs deterministic academic and pedagogical validation beyond schema correctness.
 * Distinguishes PASS, WARNING, and BLOCK outcomes.
 * 
 * INVARIANTS:
 * 1. Schema valid != Academically valid.
 * 2. Document-type specific structural requirements are strictly enforced.
 * 3. Question Bank references must be canonical and non-fabricated.
 * 4. PYQ documents without authentic Question Bank references are BLOCKED.
 */

import { LessonDocumentSpec, DocumentType } from '@/types/learning-compiler';

export type AcademicValidationOutcome = 'PASS' | 'WARNING' | 'BLOCK';

export interface AcademicValidationIssue {
  severity: 'BLOCK' | 'WARNING';
  code: string;
  field: string;
  message: string;
}

export interface AcademicValidationResult {
  outcome: AcademicValidationOutcome;
  isValid: boolean;
  canProceedToReview: boolean;
  issues: AcademicValidationIssue[];
  summary: {
    blocks: number;
    warnings: number;
    sectionCount: number;
    formulaCount: number;
    workedExampleCount: number;
    trapCount: number;
    pyqReferenceCount: number;
    quickCheckCount: number;
  };
}

export class AcademicValidator {
  /**
   * Validates a LessonDocumentSpec against academic and document-type rules.
   */
  static validate(
    spec: LessonDocumentSpec,
    documentType: DocumentType,
    allowedQuestionVersionIds?: string[]
  ): AcademicValidationResult {
    const issues: AcademicValidationIssue[] = [];

    // 1. Non-Empty & Depth Checks
    if (!spec.metadata?.title || spec.metadata.title.trim().length < 5) {
      issues.push({
        severity: 'BLOCK',
        code: 'ACADEMIC_TITLE_TOO_SHORT',
        field: 'metadata.title',
        message: 'Lesson title is too short or missing academic clarity.',
      });
    }

    if (!spec.learningObjectives || spec.learningObjectives.length === 0) {
      issues.push({
        severity: 'BLOCK',
        code: 'MISSING_LEARNING_OBJECTIVES',
        field: 'learningObjectives',
        message: 'Document must contain at least one explicit learning objective.',
      });
    }

    if (!spec.sections || spec.sections.length === 0) {
      issues.push({
        severity: 'BLOCK',
        code: 'MISSING_THEORY_SECTIONS',
        field: 'sections',
        message: 'Document must contain at least one content section.',
      });
    } else {
      for (let i = 0; i < spec.sections.length; i++) {
        const sec = spec.sections[i];
        if (!sec.contentMarkdown || sec.contentMarkdown.trim().length < 30) {
          issues.push({
            severity: 'BLOCK',
            code: 'SECTION_CONTENT_TOO_THIN',
            field: `sections[${i}].contentMarkdown`,
            message: `Section "${sec.title || i}" content is too short (< 30 characters) for competitive study.`,
          });
        }
      }
    }

    // 2. Document-Type Specific Constraints
    const formulaCount = spec.formulaBlocks?.length || 0;
    const exampleCount = spec.workedExamples?.length || 0;
    const trapCount = spec.cognitiveTraps?.length || 0;
    const pyqCount = spec.authenticPyqReferences?.length || 0;
    const quickCheckCount = spec.quickChecks?.length || 0;

    switch (documentType) {
      case 'FORMULA_SHORTCUT_SHEET':
        if (formulaCount === 0) {
          issues.push({
            severity: 'BLOCK',
            code: 'FORMULA_SHEET_NO_FORMULAS',
            field: 'formulaBlocks',
            message: 'FORMULA_SHORTCUT_SHEET must contain at least one formula block.',
          });
        }
        break;

      case 'COMMON_TRAPS_AND_MISTAKES':
        if (trapCount === 0) {
          issues.push({
            severity: 'BLOCK',
            code: 'TRAPS_DOCUMENT_NO_TRAPS',
            field: 'cognitiveTraps',
            message: 'COMMON_TRAPS_AND_MISTAKES document must contain at least one cognitive trap analysis.',
          });
        }
        break;

      case 'WORKED_EXAMPLES':
        if (exampleCount === 0) {
          issues.push({
            severity: 'BLOCK',
            code: 'WORKED_EXAMPLES_NO_EXAMPLES',
            field: 'workedExamples',
            message: 'WORKED_EXAMPLES document must contain at least one worked example.',
          });
        }
        break;

      case 'PYQ_DEEP_DIVE':
        if (pyqCount === 0) {
          issues.push({
            severity: 'BLOCK',
            code: 'PYQ_DEEP_DIVE_NO_REFERENCES',
            field: 'authenticPyqReferences',
            message: 'PYQ_DEEP_DIVE document requires authentic Question Bank references.',
          });
        }
        break;

      case 'CONCEPT_LESSON':
      case 'TOPIC_SUMMARY_REVISION':
      default:
        if (formulaCount === 0 && exampleCount === 0) {
          issues.push({
            severity: 'WARNING',
            code: 'CONCEPT_LESSON_LOW_APPLICATION',
            field: 'workedExamples',
            message: 'Lesson contains neither formulas nor worked examples. Consider adding application examples.',
          });
        }
        break;
    }

    // 3. Question Bank Reference Validation
    if (spec.authenticPyqReferences && spec.authenticPyqReferences.length > 0) {
      const seenQIds = new Set<string>();
      for (let i = 0; i < spec.authenticPyqReferences.length; i++) {
        const ref = spec.authenticPyqReferences[i];
        if (!ref.questionVersionId || ref.questionVersionId.trim() === '') {
          issues.push({
            severity: 'BLOCK',
            code: 'EMPTY_QUESTION_VERSION_ID',
            field: `authenticPyqReferences[${i}].questionVersionId`,
            message: 'Question reference contains an empty questionVersionId.',
          });
          continue;
        }

        if (seenQIds.has(ref.questionVersionId)) {
          issues.push({
            severity: 'WARNING',
            code: 'DUPLICATE_QUESTION_REFERENCE',
            field: `authenticPyqReferences[${i}].questionVersionId`,
            message: `Duplicate reference to question version "${ref.questionVersionId}".`,
          });
        }
        seenQIds.add(ref.questionVersionId);

        // If allowlist is provided, verify against allowed question version IDs
        if (allowedQuestionVersionIds && allowedQuestionVersionIds.length > 0) {
          if (!allowedQuestionVersionIds.includes(ref.questionVersionId)) {
            issues.push({
              severity: 'BLOCK',
              code: 'FABRICATED_QUESTION_VERSION_ID',
              field: `authenticPyqReferences[${i}].questionVersionId`,
              message: `Referenced questionVersionId "${ref.questionVersionId}" is not in the authoritative curriculum context.`,
            });
          }
        }
      }
    }

    // 4. Quick Check Verification
    if (spec.quickChecks && spec.quickChecks.length > 0) {
      for (let i = 0; i < spec.quickChecks.length; i++) {
        const qc = spec.quickChecks[i];
        if (!qc.options || qc.options.length < 2) {
          issues.push({
            severity: 'BLOCK',
            code: 'QUICK_CHECK_INSUFFICIENT_OPTIONS',
            field: `quickChecks[${i}].options`,
            message: `QuickCheck "${qc.prompt?.slice(0, 30)}" must have at least 2 options.`,
          });
        } else {
          const correctCount = qc.options.filter((o) => o.isCorrect).length;
          if (correctCount !== 1) {
            issues.push({
              severity: 'BLOCK',
              code: 'QUICK_CHECK_INVALID_CORRECT_COUNT',
              field: `quickChecks[${i}].options`,
              message: `QuickCheck must have exactly 1 correct option, found ${correctCount}.`,
            });
          }
        }
      }
    }

    // 5. Aggregate Results
    const blocks = issues.filter((i) => i.severity === 'BLOCK').length;
    const warnings = issues.filter((i) => i.severity === 'WARNING').length;

    let outcome: AcademicValidationOutcome = 'PASS';
    if (blocks > 0) {
      outcome = 'BLOCK';
    } else if (warnings > 0) {
      outcome = 'WARNING';
    }

    return {
      outcome,
      isValid: blocks === 0,
      canProceedToReview: blocks === 0,
      issues,
      summary: {
        blocks,
        warnings,
        sectionCount: spec.sections?.length || 0,
        formulaCount,
        workedExampleCount: exampleCount,
        trapCount,
        pyqReferenceCount: pyqCount,
        quickCheckCount,
      },
    };
  }
}
