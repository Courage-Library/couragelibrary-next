/**
 * COURAGE LIBRARY — CONTROLLED CONTENT COMPILER
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * 
 * Transforms typed LessonDocumentSpec JSON into safe, deterministic, canonical MDX.
 * 
 * Pipeline:
 * 1. Schema Validation (ContentSpecValidator)
 * 2. Referential Integrity (Question Bank & Asset Catalog)
 * 3. Controlled MDX Generation (Deterministic Markdown + Allowlisted JSX)
 * 4. AST & Security Scanning (MdxSecurityScanner)
 * 5. Cryptographic Hashing (SHA-256)
 * 6. Manifest & Artifact Packaging
 */

import crypto from 'crypto';
import {
  LessonDocumentSpec,
  CompilationResult,
  CompiledContentArtifact,
  CompilationError,
} from '@/types/learning-compiler';
import { ContentSpecValidator } from './content-spec-validator';
import { MdxSecurityScanner } from './mdx-security-scanner';
import { QuestionReferenceService, QuestionBankClient } from './question-reference.service';
import { AssetReferenceService, AssetCatalogClient } from './asset-reference.service';

export const COMPILER_VERSION = '1.0.0';
export const SCHEMA_VERSION = '1.0.0';
export const COMPONENT_CONTRACT_VERSION = '1.0.0';

export class ControlledContentCompiler {
  /**
   * Compiles a LessonDocumentSpec into a validated, deterministic MDX artifact.
   */
  static async compile(
    spec: LessonDocumentSpec,
    options?: {
      questionBankClient?: QuestionBankClient;
      assetCatalogClient?: AssetCatalogClient;
    }
  ): Promise<CompilationResult> {
    const allErrors: CompilationError[] = [];
    const allWarnings: string[] = [];

    // Stage 1: Structural / Schema Validation
    const specResult = ContentSpecValidator.validate(spec);
    if (!specResult.isValid) {
      return {
        success: false,
        errors: specResult.errors,
        warnings: specResult.warnings,
        validationStage: 'SCHEMA',
      };
    }
    allWarnings.push(...specResult.warnings);

    // Stage 2: Referential Integrity (Questions & Assets)
    const questionVersionIds: string[] = [];
    if (spec.authenticPyqReferences && spec.authenticPyqReferences.length > 0) {
      for (const pyq of spec.authenticPyqReferences) {
        questionVersionIds.push(pyq.questionVersionId);
        const { error } = await QuestionReferenceService.resolve(
          pyq.questionVersionId,
          pyq.relevanceRationale,
          options?.questionBankClient
        );
        if (error) {
          allErrors.push(error);
        }
      }
    }

    const assetIds: string[] = [];
    for (const sec of spec.sections) {
      if (sec.diagramAssetId) {
        assetIds.push(sec.diagramAssetId);
        const { error } = await AssetReferenceService.resolve(
          sec.diagramAssetId,
          options?.assetCatalogClient
        );
        if (error) {
          allErrors.push(error);
        }
      }
    }

    if (allErrors.length > 0) {
      return {
        success: false,
        errors: allErrors,
        warnings: allWarnings,
        validationStage: 'REFERENTIAL',
      };
    }

    // Stage 3: Deterministic MDX Assembly
    const mdxOutput = this.assembleDeterministicMdx(spec);

    // Stage 4: AST & Security Scanning
    const securityResult = MdxSecurityScanner.scan(mdxOutput);
    if (!securityResult.isSafe) {
      return {
        success: false,
        errors: securityResult.errors,
        warnings: [...allWarnings, ...securityResult.warnings],
        validationStage: 'SECURITY',
      };
    }
    allWarnings.push(...securityResult.warnings);

    // Stage 5: Cryptographic Hashing
    const sourceSpecJson = JSON.stringify(spec);
    const sourceSpecHash = crypto.createHash('sha256').update(Buffer.from(sourceSpecJson, 'utf8')).digest('hex');
    const compiledArtifactHash = crypto.createHash('sha256').update(Buffer.from(mdxOutput, 'utf8')).digest('hex');

    // Stage 6: Statistics
    const wordCount = mdxOutput.split(/\s+/).filter(Boolean).length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    const artifact: CompiledContentArtifact = {
      compiledMdx: mdxOutput,
      sourceSpecHash,
      compiledArtifactHash,
      compilerVersion: COMPILER_VERSION,
      schemaVersion: SCHEMA_VERSION,
      componentContractVersion: COMPONENT_CONTRACT_VERSION,
      componentsUsed: securityResult.componentsFound,
      questionVersionIds,
      assetIds,
      stats: {
        wordCount,
        readingTimeMinutes,
        formulaCount: spec.formulaBlocks?.length || 0,
        exampleCount: spec.workedExamples?.length || 0,
        trapCount: spec.cognitiveTraps?.length || 0,
        questionRefCount: questionVersionIds.length,
        assetCount: assetIds.length,
        quickCheckCount: spec.quickChecks?.length || 0,
      },
    };

    return {
      success: true,
      artifact,
      errors: [],
      warnings: allWarnings,
      validationStage: 'COMPILATION',
    };
  }

  /**
   * Deterministically transforms a LessonDocumentSpec into canonical MDX string.
   */
  private static assembleDeterministicMdx(spec: LessonDocumentSpec): string {
    const parts: string[] = [];

    // Title
    parts.push(`# ${spec.metadata.title}\n`);

    // Learning Objectives
    parts.push('## Learning Objectives\n');
    spec.learningObjectives.forEach((obj) => {
      parts.push(`- ${obj}`);
    });
    parts.push('');

    // Prerequisites (if any)
    if (spec.prerequisites && spec.prerequisites.length > 0) {
      parts.push('## Prerequisites\n');
      spec.prerequisites.forEach((p) => {
        parts.push(`- ${p.conceptSummary}`);
      });
      parts.push('');
    }

    // Sections
    spec.sections.forEach((sec) => {
      parts.push(`## ${sec.title}\n`);
      parts.push(`${sec.contentMarkdown.trim()}\n`);

      if (sec.diagramAssetId) {
        parts.push(`<DiagramBlock assetId="${sec.diagramAssetId}" />\n`);
      }

      if (sec.calloutNotes && sec.calloutNotes.length > 0) {
        sec.calloutNotes.forEach((callout) => {
          parts.push(
            `<Callout variant="${callout.variant}" title="${this.escapeAttr(callout.title)}" body="${this.escapeAttr(callout.body)}" />\n`
          );
        });
      }
    });

    // Formula Blocks
    if (spec.formulaBlocks && spec.formulaBlocks.length > 0) {
      parts.push('## Core Formulas & Mathematical Relations\n');
      spec.formulaBlocks.forEach((fb) => {
        const shortcutsAttr = fb.speedShortcutTrick ? ` speedShortcutTrick="${this.escapeAttr(fb.speedShortcutTrick)}"` : '';
        parts.push(
          `<FormulaCard name="${this.escapeAttr(fb.name)}" latexFormula="${this.escapeAttr(fb.latexFormula)}"${shortcutsAttr} />\n`
        );
      });
    }

    // Worked Examples
    if (spec.workedExamples && spec.workedExamples.length > 0) {
      parts.push('## Step-by-Step Worked Examples\n');
      spec.workedExamples.forEach((we) => {
        const difficultyAttr = ` difficulty="${we.difficulty}"`;
        const problemAttr = ` problemText="${this.escapeAttr(we.problemText)}"`;
        const shortcutAttr = we.shortcutMethod ? ` shortcutMethod="${this.escapeAttr(we.shortcutMethod)}"` : '';
        const mistakeAttr = we.commonMistakeToAvoid ? ` commonMistakeToAvoid="${this.escapeAttr(we.commonMistakeToAvoid)}"` : '';
        
        parts.push(
          `<ExampleBox${difficultyAttr}${problemAttr}${shortcutAttr}${mistakeAttr} />\n`
        );
      });
    }

    // Cognitive Traps
    if (spec.cognitiveTraps && spec.cognitiveTraps.length > 0) {
      parts.push('## Common Traps & Misconceptions\n');
      spec.cognitiveTraps.forEach((trap) => {
        parts.push(
          `<WarningBox trapType="${trap.trapType}" misconception="${this.escapeAttr(trap.misconception)}" correctApproach="${this.escapeAttr(trap.correctApproach)}" />\n`
        );
      });
    }

    // Authentic PYQ References
    if (spec.authenticPyqReferences && spec.authenticPyqReferences.length > 0) {
      parts.push('## Authentic Exam Question Practice\n');
      spec.authenticPyqReferences.forEach((pyq) => {
        parts.push(
          `<QuestionReference questionVersionId="${pyq.questionVersionId}" relevanceRationale="${this.escapeAttr(pyq.relevanceRationale)}" />\n`
        );
      });
    }

    // Quick Checks
    if (spec.quickChecks && spec.quickChecks.length > 0) {
      parts.push('## Quick Concept Checks\n');
      spec.quickChecks.forEach((qc) => {
        parts.push(
          `<QuickCheck id="${qc.id}" prompt="${this.escapeAttr(qc.prompt)}" />\n`
        );
      });
    }

    // Revision Summary
    parts.push('## Revision Summary\n');
    parts.push(
      `<SummaryCard title="Key Takeaways" keyTakeaways={[${spec.revisionSummary.keyTakeaways.map(t => JSON.stringify(t)).join(', ')}]} />\n`
    );

    return parts.join('\n').trim();
  }

  private static escapeAttr(val: string): string {
    return val.replace(/"/g, '&quot;');
  }
}
