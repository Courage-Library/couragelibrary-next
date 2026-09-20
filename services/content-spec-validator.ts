/**
 * COURAGE LIBRARY — CONTENT SPECIFICATION VALIDATOR
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * 
 * Performs ultra-strict runtime schema & structural validation for LessonDocumentSpec.
 * 
 * IMPORTANT ARCHITECTURAL DISTINCTION:
 * Passing this validation proves STRUCTURAL & SCHEMA VALIDITY ONLY.
 * It does NOT prove academic correctness, mathematical truth, or pedagogical quality.
 */

import {
  LessonDocumentSpec,
  CompilationError,
  DifficultyTier,
  SectionType,
  CalloutVariant,
  TrapType,
  ContentLanguage,
} from '@/types/learning-compiler';

const ALLOWED_LANGUAGES: ContentLanguage[] = ['en', 'hi', 'bn', 'te', 'ta'];
const ALLOWED_DIFFICULTIES: DifficultyTier[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const ALLOWED_SECTION_TYPES: SectionType[] = ['THEORY', 'VISUAL_EXPLANATION', 'DERIVATION', 'APPLICATION'];
const ALLOWED_CALLOUT_VARIANTS: CalloutVariant[] = ['TIP', 'WARNING', 'INFO', 'MEMORY_HOOK'];
const ALLOWED_TRAP_TYPES: TrapType[] = [
  'CALCULATION_SLIP',
  'MISREAD_KEYWORD',
  'FORMULA_CONFUSION',
  'DISTRACTOR_TRAP',
];

export interface SpecValidationResult {
  isValid: boolean;
  isStructurallyValid: boolean;
  errors: CompilationError[];
  warnings: string[];
}

export class ContentSpecValidator {
  /**
   * Validates a candidate LessonDocumentSpec object against the structural contract.
   */
  static validate(spec: unknown): SpecValidationResult {
    const errors: CompilationError[] = [];
    const warnings: string[] = [];

    if (!spec || typeof spec !== 'object') {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'FATAL',
        path: '$',
        message: 'LessonDocumentSpec payload must be a non-null JSON object.',
      });
      return { isValid: false, isStructurallyValid: false, errors, warnings };
    }

    const doc = spec as Record<string, any>;

    // 1. Schema Version
    if (doc.schemaVersion !== '1.0.0') {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.schemaVersion',
        message: `Unsupported schemaVersion "${doc.schemaVersion}". Expected "1.0.0".`,
      });
    }

    // 2. Document Identity & Slug
    if (!doc.documentId || typeof doc.documentId !== 'string' || doc.documentId.trim() === '') {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.documentId',
        message: 'documentId is required and must be a non-empty string.',
      });
    }

    if (!doc.unitSlug || typeof doc.unitSlug !== 'string' || !/^[a-z0-9_-]+$/.test(doc.unitSlug)) {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.unitSlug',
        message: 'unitSlug is required and must be lowercase alphanumeric with hyphens/underscores.',
      });
    }

    // 3. Language
    if (!ALLOWED_LANGUAGES.includes(doc.language)) {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.language',
        message: `Invalid language "${doc.language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}.`,
      });
    }

    // 4. Metadata
    if (!doc.metadata || typeof doc.metadata !== 'object') {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.metadata',
        message: 'metadata object is required.',
      });
    } else {
      const meta = doc.metadata;
      if (!meta.title || typeof meta.title !== 'string' || meta.title.trim() === '') {
        errors.push({
          code: 'SCHEMA_INVALID',
          severity: 'ERROR',
          path: '$.metadata.title',
          message: 'metadata.title is required.',
        });
      }
      if (!meta.topicId || typeof meta.topicId !== 'string') {
        errors.push({
          code: 'SCHEMA_INVALID',
          severity: 'ERROR',
          path: '$.metadata.topicId',
          message: 'metadata.topicId is required.',
        });
      }
      if (!meta.subjectId || typeof meta.subjectId !== 'string') {
        errors.push({
          code: 'SCHEMA_INVALID',
          severity: 'ERROR',
          path: '$.metadata.subjectId',
          message: 'metadata.subjectId is required.',
        });
      }
      if (!ALLOWED_DIFFICULTIES.includes(meta.difficultyTier)) {
        errors.push({
          code: 'SCHEMA_INVALID',
          severity: 'ERROR',
          path: '$.metadata.difficultyTier',
          message: `Invalid difficultyTier "${meta.difficultyTier}". Allowed: ${ALLOWED_DIFFICULTIES.join(', ')}.`,
        });
      }
      if (typeof meta.estimatedReadingMinutes !== 'number' || meta.estimatedReadingMinutes <= 0) {
        errors.push({
          code: 'SCHEMA_INVALID',
          severity: 'ERROR',
          path: '$.metadata.estimatedReadingMinutes',
          message: 'metadata.estimatedReadingMinutes must be a positive number.',
        });
      }
      if (!Array.isArray(meta.targetExamCategories) || meta.targetExamCategories.length === 0) {
        warnings.push('metadata.targetExamCategories is empty; recommended for exam targeting.');
      }
    }

    // 5. Learning Objectives
    if (!Array.isArray(doc.learningObjectives) || doc.learningObjectives.length === 0) {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.learningObjectives',
        message: 'learningObjectives must be a non-empty array of strings.',
      });
    }

    // 6. Sections
    if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.sections',
        message: 'sections must be a non-empty array of structured section objects.',
      });
    } else {
      doc.sections.forEach((sec: any, idx: number) => {
        const secPath = `$.sections[${idx}]`;
        if (!sec.id || typeof sec.id !== 'string') {
          errors.push({ code: 'SCHEMA_INVALID', severity: 'ERROR', path: `${secPath}.id`, message: 'Section id is required.' });
        }
        if (!sec.title || typeof sec.title !== 'string') {
          errors.push({ code: 'SCHEMA_INVALID', severity: 'ERROR', path: `${secPath}.title`, message: 'Section title is required.' });
        }
        if (!ALLOWED_SECTION_TYPES.includes(sec.sectionType)) {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: `${secPath}.sectionType`,
            message: `Invalid sectionType "${sec.sectionType}". Allowed: ${ALLOWED_SECTION_TYPES.join(', ')}.`,
          });
        }
        if (typeof sec.contentMarkdown !== 'string' || sec.contentMarkdown.trim() === '') {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: `${secPath}.contentMarkdown`,
            message: 'Section contentMarkdown is required and cannot be empty.',
          });
        }

        // Callout notes inside section
        if (sec.calloutNotes && Array.isArray(sec.calloutNotes)) {
          sec.calloutNotes.forEach((c: any, cIdx: number) => {
            const calloutPath = `${secPath}.calloutNotes[${cIdx}]`;
            if (!ALLOWED_CALLOUT_VARIANTS.includes(c.variant)) {
              errors.push({
                code: 'SCHEMA_INVALID',
                severity: 'ERROR',
                path: `${calloutPath}.variant`,
                message: `Invalid callout variant "${c.variant}".`,
              });
            }
            if (!c.title || !c.body) {
              errors.push({
                code: 'SCHEMA_INVALID',
                severity: 'ERROR',
                path: calloutPath,
                message: 'Callout requires both title and body.',
              });
            }
          });
        }
      });
    }

    // 7. Formula Blocks (optional array)
    if (doc.formulaBlocks && Array.isArray(doc.formulaBlocks)) {
      doc.formulaBlocks.forEach((fb: any, idx: number) => {
        const fbPath = `$.formulaBlocks[${idx}]`;
        if (!fb.name || !fb.latexFormula) {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: fbPath,
            message: 'Formula block requires name and latexFormula.',
          });
        }
      });
    }

    // 8. Worked Examples (optional array)
    if (doc.workedExamples && Array.isArray(doc.workedExamples)) {
      doc.workedExamples.forEach((we: any, idx: number) => {
        const wePath = `$.workedExamples[${idx}]`;
        if (!we.problemText || !Array.isArray(we.stepByStepSolution) || we.stepByStepSolution.length === 0) {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: wePath,
            message: 'Worked example requires problemText and non-empty stepByStepSolution.',
          });
        }
      });
    }

    // 9. Cognitive Traps (optional array)
    if (doc.cognitiveTraps && Array.isArray(doc.cognitiveTraps)) {
      doc.cognitiveTraps.forEach((trap: any, idx: number) => {
        const trapPath = `$.cognitiveTraps[${idx}]`;
        if (!ALLOWED_TRAP_TYPES.includes(trap.trapType)) {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: `${trapPath}.trapType`,
            message: `Invalid trapType "${trap.trapType}". Allowed: ${ALLOWED_TRAP_TYPES.join(', ')}.`,
          });
        }
        if (!trap.misconception || !trap.correctApproach) {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: trapPath,
            message: 'Cognitive trap requires misconception and correctApproach.',
          });
        }
      });
    }

    // 10. Authentic PYQ References (optional array)
    if (doc.authenticPyqReferences && Array.isArray(doc.authenticPyqReferences)) {
      doc.authenticPyqReferences.forEach((pyq: any, idx: number) => {
        const pyqPath = `$.authenticPyqReferences[${idx}]`;
        if (!pyq.questionVersionId || typeof pyq.questionVersionId !== 'string') {
          errors.push({
            code: 'INVALID_QUESTION_REFERENCE',
            severity: 'ERROR',
            path: `${pyqPath}.questionVersionId`,
            message: 'questionVersionId is required for authentic PYQ references.',
          });
        }
      });
    }

    // 11. Quick Checks (optional array)
    if (doc.quickChecks && Array.isArray(doc.quickChecks)) {
      doc.quickChecks.forEach((qc: any, idx: number) => {
        const qcPath = `$.quickChecks[${idx}]`;
        if (!qc.prompt || !Array.isArray(qc.options) || qc.options.length < 2) {
          errors.push({
            code: 'SCHEMA_INVALID',
            severity: 'ERROR',
            path: qcPath,
            message: 'QuickCheck requires prompt and at least 2 options.',
          });
        } else {
          const hasCorrect = qc.options.some((o: any) => o.isCorrect === true);
          if (!hasCorrect) {
            errors.push({
              code: 'SCHEMA_INVALID',
              severity: 'ERROR',
              path: `${qcPath}.options`,
              message: 'QuickCheck options must have at least one correct answer (isCorrect: true).',
            });
          }
        }
      });
    }

    // 12. Revision Summary
    if (!doc.revisionSummary || typeof doc.revisionSummary !== 'object') {
      errors.push({
        code: 'SCHEMA_INVALID',
        severity: 'ERROR',
        path: '$.revisionSummary',
        message: 'revisionSummary object is required.',
      });
    } else {
      if (!Array.isArray(doc.revisionSummary.keyTakeaways) || doc.revisionSummary.keyTakeaways.length === 0) {
        errors.push({
          code: 'SCHEMA_INVALID',
          severity: 'ERROR',
          path: '$.revisionSummary.keyTakeaways',
          message: 'revisionSummary.keyTakeaways must be a non-empty array of strings.',
        });
      }
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      isStructurallyValid: isValid,
      errors,
      warnings,
    };
  }
}
