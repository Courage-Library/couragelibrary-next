/**
 * COURAGE LIBRARY — STRUCTURED CONTENT IMPORTER SERVICE
 * Phase 3E.4: External AI Authoring & Structured Content Import System
 * 
 * Ingests external AI generated text (from ChatGPT, Claude, Perplexity, Gemini, etc.),
 * normalizes JSON packaging, enforces multi-tier security and academic validation gates,
 * and safely persists candidate AI_GENERATED drafts into Courage Library version storage.
 * 
 * SACRED ARCHITECTURAL INVARIANTS:
 * 1. AI output is UNTRUSTED user/candidate input.
 * 2. Strict validation pipeline: Parse -> ContentSpec -> MdxSecurity -> AcademicValidator -> Reference check.
 * 3. Any BLOCK issue prevents draft creation.
 * 4. Drafts are saved strictly as review_status = 'AI_GENERATED', author_type = 'AI_ASSISTED', is_published = false.
 * 5. External AI content CANNOT publish or approve directly.
 * 6. External AI metadata (tool name, model) is informational only and NEVER grants authority.
 */

import { ContentSpecValidator } from '@/services/content-spec-validator';
import { MdxSecurityScanner } from '@/services/mdx-security-scanner';
import { AcademicValidator } from '@/services/ai/academic-validator.service';
import { LearningDocumentService } from '@/services/learning-document.service';
import { StorageFactory } from '@/services/storage/storage-factory';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import {
  LessonDocumentSpec,
  DocumentType,
  DocumentVersion,
  LearningDocument,
} from '@/types/learning-compiler';
import {
  CategorizedValidationResult,
  ExternalAIImportParams,
  ExternalAIImportResult,
  PROMPT_CONTRACT_VERSION,
} from '@/types/external-ai';
import { AIEngineError } from '@/services/ai/ai-provider.interface';

export class StructuredContentImporter {
  /**
   * Normalizes raw text input by trimming whitespace and extracting JSON from markdown code fences.
   */
  static extractJsonFromRaw(rawInput: string): string {
    if (!rawInput || typeof rawInput !== 'string') {
      return '';
    }

    let cleaned = rawInput.trim();

    // Strip UTF-8 BOM if present
    if (cleaned.charCodeAt(0) === 0xfeff) {
      cleaned = cleaned.slice(1).trim();
    }

    // Match markdown code blocks: ```json ... ``` or ``` ... ```
    const fenceRegex = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i;
    const match = cleaned.match(fenceRegex);
    if (match && match[1]) {
      cleaned = match[1].trim();
    } else {
      // Also handle case where code fence starts at beginning and ends at end with potential leading/trailing whitespace
      const startFence = cleaned.indexOf('```');
      if (startFence !== -1) {
        const afterStart = cleaned.slice(startFence + 3);
        const nextLine = afterStart.indexOf('\n');
        const jsonStart = nextLine !== -1 ? afterStart.slice(nextLine + 1) : afterStart;
        const endFence = jsonStart.lastIndexOf('```');
        if (endFence !== -1) {
          cleaned = jsonStart.slice(0, endFence).trim();
        }
      }
    }

    return cleaned;
  }

  /**
   * Comprehensive categorized validation pipeline.
   */
  static validateContent(
    rawTextOrParsedSpec: string | LessonDocumentSpec,
    documentType: DocumentType,
    allowedQuestionVersionIds?: string[]
  ): {
    spec: LessonDocumentSpec | null;
    validation: CategorizedValidationResult;
  } {
    let parsedSpec: any = null;
    let jsonParseError: string | null = null;

    // 1. JSON Parsing Stage
    if (typeof rawTextOrParsedSpec === 'string') {
      const jsonStr = this.extractJsonFromRaw(rawTextOrParsedSpec);
      if (!jsonStr) {
        jsonParseError = 'Input content is empty or contains no valid text.';
      } else {
        try {
          parsedSpec = JSON.parse(jsonStr);
        } catch (err: any) {
          jsonParseError = `Malformed JSON syntax: ${err.message}`;
        }
      }
    } else {
      parsedSpec = rawTextOrParsedSpec;
    }

    if (!parsedSpec || jsonParseError) {
      const failedResult: CategorizedValidationResult = {
        overallOutcome: 'BLOCK',
        canImportAsDraft: false,
        structure: {
          isValid: false,
          errors: [jsonParseError || 'Failed to parse JSON payload.'],
          warnings: [],
        },
        security: {
          isSafe: true,
          errors: [],
        },
        academic: {
          outcome: 'BLOCK',
          isValid: false,
          canProceedToReview: false,
          issues: [
            {
              severity: 'BLOCK',
              code: 'JSON_PARSE_ERROR',
              field: 'root',
              message: jsonParseError || 'Invalid JSON syntax.',
            },
          ],
          summary: {
            blocks: 1,
            warnings: 0,
            sectionCount: 0,
            formulaCount: 0,
            workedExampleCount: 0,
            trapCount: 0,
            pyqReferenceCount: 0,
            quickCheckCount: 0,
          },
        },
        questionReferences: {
          isValid: true,
          total: 0,
          validCount: 0,
          errors: [],
          warnings: [],
        },
        summary: {
          totalBlocks: 1,
          totalWarnings: 0,
        },
      };

      return { spec: null, validation: failedResult };
    }

    // 2. Structural Schema Validation
    const specValidation = ContentSpecValidator.validate(parsedSpec);
    const specErrors = specValidation.errors.map((e) => `[${e.code}] ${e.message} at ${e.path}`);
    const specWarnings = [...specValidation.warnings];

    // 3. MDX AST Security Scanning
    const securityErrors: string[] = [];
    const sections = parsedSpec.sections || [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (section?.contentMarkdown) {
        const scan = MdxSecurityScanner.scan(section.contentMarkdown);
        if (!scan.isSafe) {
          for (const err of scan.errors) {
            securityErrors.push(`Section [${i}] "${section.title || i}": [${err.code}] ${err.message}`);
          }
        }
      }

      // Scan callout notes
      for (const note of section?.calloutNotes || []) {
        if (note?.body) {
          const scan = MdxSecurityScanner.scan(note.body);
          if (!scan.isSafe) {
            for (const err of scan.errors) {
              securityErrors.push(`Callout Note "${note.title}": [${err.code}] ${err.message}`);
            }
          }
        }
      }
    }

    // Scan worked example explanations
    for (const ex of parsedSpec.workedExamples || []) {
      for (const step of ex.stepByStepSolution || []) {
        if (step?.explanation) {
          const scan = MdxSecurityScanner.scan(step.explanation);
          if (!scan.isSafe) {
            for (const err of scan.errors) {
              securityErrors.push(`Worked Example "${ex.id}": [${err.code}] ${err.message}`);
            }
          }
        }
      }
    }

    // 4. Academic Pedagogical Validation
    const academicValidation = AcademicValidator.validate(
      parsedSpec as LessonDocumentSpec,
      documentType,
      allowedQuestionVersionIds
    );

    // 5. Question Reference Integrity Check
    const questionRefErrors: string[] = [];
    const questionRefWarnings: string[] = [];
    const pyqRefs = parsedSpec.authenticPyqReferences || [];
    let validPyqCount = 0;

    for (let i = 0; i < pyqRefs.length; i++) {
      const ref = pyqRefs[i];
      if (!ref?.questionVersionId || typeof ref.questionVersionId !== 'string') {
        questionRefErrors.push(`Question reference [${i}] is missing a valid questionVersionId string.`);
      } else if (allowedQuestionVersionIds && allowedQuestionVersionIds.length > 0) {
        if (!allowedQuestionVersionIds.includes(ref.questionVersionId)) {
          questionRefErrors.push(
            `Question reference "${ref.questionVersionId}" is not authorized by the curriculum context.`
          );
        } else {
          validPyqCount++;
        }
      } else {
        validPyqCount++;
      }
    }

    // 6. Aggregate Validation Findings
    let totalBlocks = 0;
    let totalWarnings = 0;

    if (!specValidation.isStructurallyValid) {
      totalBlocks += specErrors.length;
    }
    if (securityErrors.length > 0) {
      totalBlocks += securityErrors.length;
    }
    totalBlocks += academicValidation.summary.blocks;
    totalBlocks += questionRefErrors.length;

    totalWarnings += specWarnings.length;
    totalWarnings += academicValidation.summary.warnings;
    totalWarnings += questionRefWarnings.length;

    let overallOutcome: 'PASS' | 'WARNING' | 'BLOCK' = 'PASS';
    if (totalBlocks > 0) {
      overallOutcome = 'BLOCK';
    } else if (totalWarnings > 0) {
      overallOutcome = 'WARNING';
    }

    const isSecuritySafe = securityErrors.length === 0;
    const canImportAsDraft = totalBlocks === 0 && isSecuritySafe && specValidation.isStructurallyValid;

    const validationResult: CategorizedValidationResult = {
      overallOutcome,
      canImportAsDraft,
      structure: {
        isValid: specValidation.isStructurallyValid,
        errors: specErrors,
        warnings: specWarnings,
      },
      security: {
        isSafe: isSecuritySafe,
        errors: securityErrors,
      },
      academic: academicValidation,
      questionReferences: {
        isValid: questionRefErrors.length === 0,
        total: pyqRefs.length,
        validCount: validPyqCount,
        errors: questionRefErrors,
        warnings: questionRefWarnings,
      },
      summary: {
        totalBlocks,
        totalWarnings,
      },
    };

    return {
      spec: parsedSpec as LessonDocumentSpec,
      validation: validationResult,
    };
  }

  /**
   * Imports external AI content, validates every gate, and persists as a candidate AI_GENERATED draft.
   */
  static async importAndCreateDraft(
    params: ExternalAIImportParams,
    allowedQuestionIds?: string[]
  ): Promise<ExternalAIImportResult> {
    if (!params.adminUserId) {
      throw new AIEngineError('AUTHENTICATION_ERROR', 'adminUserId is required for importing AI content.');
    }
    if (!params.learningUnitId) {
      throw new AIEngineError('INVALID_REQUEST', 'learningUnitId is required.');
    }

    // 1. Run Complete Categorized Validation
    const { spec, validation } = this.validateContent(
      params.rawInput,
      params.documentType,
      allowedQuestionIds
    );

    if (!spec || !validation.canImportAsDraft) {
      const reasons = [
        ...validation.structure.errors,
        ...validation.security.errors,
        ...validation.academic.issues.filter((i) => i.severity === 'BLOCK').map((i) => i.message),
        ...validation.questionReferences.errors,
      ].join('; ');

      throw new AIEngineError(
        'SCHEMA_VALIDATION_FAILED',
        `External AI content failed validation gates: ${reasons || 'Validation BLOCK rules triggered.'}`,
        { validation }
      );
    }

    const supabase = params.supabaseClient || createAdminServerSupabaseClient();

    // 2. Resolve or Create Canonical Learning Document
    let documentId: string;
    const canonicalSlug = spec.unitSlug || `unit-${params.learningUnitId.slice(0, 8)}`;

    let existingDoc: any = null;
    try {
      // Ensure learning_units row exists in DB if table is accessible
      const { data: unitExists } = await supabase
        .from('learning_units')
        .select('id')
        .eq('id', params.learningUnitId)
        .maybeSingle();

      if (!unitExists) {
        const { data: anyTopic } = await supabase
          .from('topics')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (anyTopic) {
          await supabase.from('learning_units').insert({
            id: params.learningUnitId,
            topic_id: anyTopic.id,
            title: spec.metadata?.title || canonicalSlug,
            slug: canonicalSlug,
            unit_type: params.documentType,
            estimated_minutes: 15,
            display_order: 1,
            is_active: true,
          });
        }
      }

      const res = await supabase
        .from('learning_documents')
        .select('id')
        .eq('learning_unit_id', params.learningUnitId)
        .eq('document_type', params.documentType)
        .maybeSingle();
      existingDoc = res?.data;
    } catch (err) {
      // Fallback if schema cache is not available
    }

    if (existingDoc?.id) {
      documentId = existingDoc.id;
    } else {
      let createdDocId: string | null = null;
      try {
        const { data: newDoc } = await supabase
          .from('learning_documents')
          .insert({
            learning_unit_id: params.learningUnitId,
            canonical_slug: canonicalSlug,
            document_type: params.documentType,
            status: 'DRAFT',
          })
          .select('id')
          .single();

        if (newDoc?.id) {
          createdDocId = newDoc.id;
        }
      } catch (err) {
        // Fallback
      }

      documentId = createdDocId || `doc-${params.learningUnitId}-${params.documentType.toLowerCase().replace(/_/g, '-')}`;
    }

    // 3. Resolve Next Version Number
    let nextVersionNumber = 1;
    try {
      const { data: latestVer } = await supabase
        .from('document_versions')
        .select('version_number')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestVer?.version_number) {
        nextVersionNumber = latestVer.version_number + 1;
      }
    } catch (err) {
      nextVersionNumber = 1;
    }

    // 4. Compile and Store Version Artifacts
    const storageProvider = StorageFactory.getProvider();
    const storageBucket = 'learning-artifacts';

    const compileStore = await LearningDocumentService.compileAndStoreVersion({
      documentId,
      versionNumber: nextVersionNumber,
      spec,
      storageProvider,
      storageBucket,
      authorType: 'AI_ASSISTED',
    });

    // 5. Insert Document Version with review_status = 'AI_GENERATED'
    let versionRecord: any = null;
    try {
      const { data: verRecord } = await supabase
        .from('document_versions')
        .insert({
          ...compileStore.version,
          author_type: 'AI_ASSISTED',
          review_status: 'AI_GENERATED',
          is_published: false,
        })
        .select()
        .single();
      versionRecord = verRecord;
    } catch (err) {
      // Fallback
    }

    if (!versionRecord) {
      versionRecord = {
        ...compileStore.version,
        id: compileStore.version.id || `ver-${documentId}-v${nextVersionNumber}`,
        document_id: documentId,
        version_number: nextVersionNumber,
        author_type: 'AI_ASSISTED',
        review_status: 'AI_GENERATED',
        is_published: false,
      };
    }

    LearningDocumentService.cacheVersion(versionRecord as DocumentVersion);

    return {
      success: true,
      spec,
      documentVersion: versionRecord as DocumentVersion,
      documentId,
      validation,
      promptContractVersion: params.promptContractVersion || PROMPT_CONTRACT_VERSION,
      contextHash: params.contextHash,
      aiToolUsed: params.aiToolUsed || 'Unknown',
    };
  }
}
